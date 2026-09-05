import { NextResponse, type NextRequest } from "next/server";
import { withAuth, parseJson } from "@/lib/api-handler";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { approvalRateLimitKey } from "@/lib/services/approval-lockout";
import { grantStepUp, STEP_UP_TTL_SEC } from "@/lib/services/step-up";
import type { ApprovalAction } from "@/lib/approvals";

const stepUpSchema = z.object({
  pin: z.string().min(6).max(10),
  // CASH_OUT joined in Batch 5.5 — a cash movement that empties the drawer.
  action: z.enum(["DISCOUNT", "REFUND", "CASH_OUT"]),
  /** Cents. Bound into the token; the operation re-checks it exactly. */
  amount: z.number().int().min(0).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// `/api/auth/approve` NO LONGER EXISTS. Deleted in Batch 7.2, along with
// `manager-approval-dialog.tsx`. THIS route is what replaced it.
//
// Thirteen files still describe a design decision by contrast with it, because
// the reasoning is what makes them make sense: it tested a submitted PIN
// against every active manager and then forbade self-approval, so with one
// operational role (DD-07) it could admit nobody. It had had no runtime caller
// since Batch 4.4c made the caller's own PIN mandatory for every refund.
//
// It was deleted rather than left dormant for a specific reason: it was
// `withAuth` with no role restriction, so any signed-in user could POST a PIN
// to it, and it deliberately SHARED the five-attempt lockout counter with this
// route — so exhausting a route that could never succeed locked out the one
// that gates every refund and every large discount.
// ─────────────────────────────────────────────────────────────────────────────
// Same numbers as `/api/auth/approve` (DELETED in Batch 7.2 — see `api/auth/step-up/route.ts`), and — deliberately — the same KEY, so
// the two surfaces share one in-memory bucket. A guesser who exhausts the
// approve route does not get a fresh five here (operator decision,
// 2026-09-04: one shared counter, five attempts in total).
const RL_PER_CALLER_MAX = 5;
const RL_PER_CALLER_WINDOW = 60_000; // 5 attempts/min
const RL_PER_CALLER_LONG_MAX = 15;
const RL_PER_CALLER_LONG_WINDOW = 15 * 60_000; // 15 per 15 min

/**
 * POST /api/auth/step-up
 *
 * DD-19, Batch 4.4c. The signed-in user re-enters THEIR OWN PIN to confirm a
 * discount above the configured threshold, or a refund of any amount. On
 * success it returns a signed, single-use token bound to (this user, action,
 * amount) which `/api/orders` and `/api/orders/[id]/refund` consume.
 *
 * Why not `/api/auth/approve`: that route tests the PIN against every active
 * manager and then forbids self-approval. It was built for a cashier asking a
 * manager; with one operational role (DD-07) it can never succeed. A distinct
 * path is required, and this is it.
 *
 * Open to any authenticated role on purpose. The rule is the same for
 * SUPER_ADMIN as for MANAGER — identical argument, one code path.
 *
 * The walls are the existing ones, not new ones: this handler holds the
 * in-memory rate limit, `grantStepUp` holds Batch 4.1's persistent lockout
 * (checked before any derivation) and Batch 4.2's bounded scrypt queue.
 */
export const POST = withAuth(async (req: NextRequest, { user: caller }) => {
  const body = await parseJson(req);
  const parsed = stepUpSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "PIN requis (6–10 caractères)." },
      { status: 400 },
    );
  }
  const { pin, action, amount } = parsed.data as {
    pin: string;
    action: ApprovalAction;
    amount?: number;
  };

  const keyShort = approvalRateLimitKey(caller.id);
  const keyLong = `${keyShort}:long`;

  const rlShort = rateLimit(keyShort, RL_PER_CALLER_MAX, RL_PER_CALLER_WINDOW);
  if (!rlShort.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez plus tard." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, rlShort.retryAfterSec)) },
      },
    );
  }
  const rlLong = rateLimit(
    keyLong,
    RL_PER_CALLER_LONG_MAX,
    RL_PER_CALLER_LONG_WINDOW,
  );
  if (!rlLong.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez plus tard." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, rlLong.retryAfterSec)) },
      },
    );
  }

  const result = await grantStepUp({
    callerId: caller.id,
    pin,
    action,
    amount,
    ttlSec: STEP_UP_TTL_SEC,
  });

  if (!result.ok) {
    return NextResponse.json(
      result.retryAfterSec != null
        ? { error: result.message, retryAfterSec: result.retryAfterSec }
        : { error: result.message },
      {
        status: result.status,
        ...(result.retryAfterSec != null
          ? { headers: { "Retry-After": String(result.retryAfterSec) } }
          : {}),
      },
    );
  }

  return NextResponse.json({
    stepUpToken: result.token,
    action,
    amount: amount ?? null,
    expSec: result.expSec,
  });
});
