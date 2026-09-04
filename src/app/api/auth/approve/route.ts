import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { verifyPin } from "@/lib/auth";
import { z } from "zod";
import { audit } from "@/lib/services/audit";
import { issueApprovalToken, type ApprovalAction } from "@/lib/approvals";
import { rateLimit } from "@/lib/rate-limit";
import {
  approvalLockState,
  approvalLockedMessage,
  approvalRateLimitKey,
  recordApprovalFailure,
} from "@/lib/services/approval-lockout";

const approveSchema = z.object({
  pin: z.string().min(6).max(10),
  action: z.enum(["DISCOUNT", "REFUND"]).default("DISCOUNT"),
  amount: z.number().min(0).optional(),
  ttlSec: z.number().int().min(5).max(300).optional(),
});

const RL_PER_CALLER_MAX = 5;
const RL_PER_CALLER_WINDOW = 60_000; // 5 attempts/min
const RL_PER_CALLER_LONG_MAX = 15;
const RL_PER_CALLER_LONG_WINDOW = 15 * 60_000; // 15 per 15 min

/**
 * POST /api/auth/approve
 * Validates a manager/super-admin PIN for a sensitive operation.
 * Requires the caller to be authenticated. Issues a signed, single-use
 * approval token bound to (action, amount?) — rendered invalid after use
 * or after ttlSec (default 60s).
 *
 * Two walls stand against online PIN brute-forcing (C-08, Batch 4.1): an
 * in-memory rate limit keyed on the caller, and a persistent lockout of the
 * caller's approval capability after five wrong PINs. The rate-limit key no
 * longer carries a client IP — it came from `X-Real-IP`/`X-Forwarded-For`,
 * which the caller supplies, so rotating a header per request minted a fresh
 * bucket and defeated the wall entirely.
 */
export const POST = withAuth(async (req: NextRequest, { user: caller }) => {
  const body = await parseJson(req);
  const parsed = approveSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "PIN requis (6–10 caractères)." },
      { status: 400 },
    );
  }
  const { pin, action, amount, ttlSec } = parsed.data as {
    pin: string;
    action: ApprovalAction;
    amount?: number;
    ttlSec?: number;
  };

  // Wall 1 — per-caller rate limit, in memory. Free, so it runs first.
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

  // Wall 2 — persistent lockout, checked BEFORE the scrypt loop so a locked
  // caller cannot make the server hash their guess against every manager.
  // Unlike wall 1 this survives a process restart.
  const lock = await approvalLockState(caller.id);
  if (lock.locked) {
    return NextResponse.json(
      {
        error: approvalLockedMessage(lock.retryAfterSec),
        retryAfterSec: lock.retryAfterSec,
      },
      {
        status: 423,
        headers: { "Retry-After": String(lock.retryAfterSec) },
      },
    );
  }

  // Find any active manager/super-admin with this PIN.
  // Query one at a time (constant-time PIN verify per hash);
  // managers list is bounded (≤ dozen).
  const managers = await db.user.findMany({
    where: {
      active: true,
      role: { in: ["MANAGER", "SUPER_ADMIN"] },
    },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      pinHash: true,
      failedAttempts: true,
      lockedUntil: true,
    },
  });

  let approver: (typeof managers)[number] | null = null;
  for (const u of managers) {
    if (!u.pinHash) continue;
    if (u.lockedUntil && u.lockedUntil > new Date()) continue;
    if (verifyPin(pin, u.pinHash)) {
      approver = u;
      break;
    }
  }

  if (!approver) {
    // Records the MANAGER_APPROVAL_FAILED audit row this route always wrote,
    // and reports whether that failure was the one that tripped the lock.
    const state = await recordApprovalFailure(
      caller.id,
      { reason: "PIN invalide", action },
    );
    if (state.locked) {
      return NextResponse.json(
        {
          error: approvalLockedMessage(state.retryAfterSec),
          retryAfterSec: state.retryAfterSec,
        },
        {
          status: 423,
          headers: { "Retry-After": String(state.retryAfterSec) },
        },
      );
    }
    return NextResponse.json(
      { error: "PIN manager invalide." },
      { status: 403 },
    );
  }

  // Prevent self-approval.
  if (approver.id === caller.id) {
    return NextResponse.json(
      { error: "Auto-approbation interdite." },
      { status: 403 },
    );
  }

  const approvalToken = issueApprovalToken({
    approverId: approver.id,
    action,
    amount,
    ttlSec,
  });

  await audit(
    "MANAGER_APPROVAL_GRANTED",
    "User",
    approver.id,
    { requesterId: caller.id, requesterName: caller.name, action, amount },
    approver.id,
  );

  return NextResponse.json({
    id: approver.id,
    name: approver.name,
    role: approver.role,
    approvalToken,
    action,
    amount: amount ?? null,
    expSec: (ttlSec ?? 60),
  });
});