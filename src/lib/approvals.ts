// Signed single-use approval tokens.
// Used to bind a manager's PIN approval to a concrete (action, amount) pair,
// preventing cashiers from forging arbitrary approvals by knowing a manager id.

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// L-117 (R9.4) — THE LAST READER ON THE OLD CONTRACT.
//
// This was `process.env.SESSION_SECRET`, read at module load, throwing at
// IMPORT if it was absent. PREP-3 moved secret resolution onto the secret store
// and converted **only `auth.ts`** — and `resolveSecret()` does not write
// `process.env`; only `bootstrapSecrets()` does, from the async `register()`
// hook that `auth.ts`'s own comment says a route module can beat.
//
// So on an install with no `.env`, `auth.ts` resolves happily from
// `secrets.json` while THIS FILE throws in the same process. Measured by the
// audit: `resolveSecret` → `generated`, `process.env` still absent,
// `import('@/lib/approvals')` → THREW.
//
// **The blast radius is the checkout.** `orders/route.ts` → `services/step-up.ts`
// → here, so `POST /api/orders`, `/orders/[id]/refund`, `/auth/step-up` and
// `/cash-movements` are all in that module graph — a till that cannot ring a
// sale on a fresh install, which is exactly what PREP-3 exists to make possible.
//
// Mirrors `auth.ts` line for line, including both guards: the app still cannot
// run without a usable secret and still refuses one under 32 characters. **The
// environment still wins**, so the existing install reaches the same value by
// the same path.
//
// L-116 (R9.4): and the refusal is deferred to first use, for the same reason
// it is in `auth.ts` — throwing at import is what turned a configuration
// mistake into an unexplained 500.
import { lazySecret } from "@/lib/services/secret-store";

const secret = lazySecret("SESSION_SECRET");

/** What a step-up PIN is being asked for.
 *
 *  `CASH_OUT` joined in Batch 5.5 (M-05 / DD-12): a cash movement that takes
 *  money OUT of the drawer needs the operator's own PIN, exactly as a refund
 *  has since 4.4c. Movements that only add cash do not, so there is no
 *  `CASH_IN` — the absence is the rule, not an omission. */
export type ApprovalAction = "DISCOUNT" | "REFUND" | "CASH_OUT";

export type ApprovalPayload = {
  approverId: string;
  action: ApprovalAction;
  // L-36 / DOC-13 (Batch 7.5) — **CENTS**, and this comment said `euros` from
  // Batch 1.1 until 2026-09-07. Nothing was ever mis-computed: every caller has
  // always bound cents — `step-up/route.ts` declares `z.number().int()`,
  // `refund/route.ts` passes `parsed.data.amount` (cents per `refundSchema`),
  // and `orders-view.tsx` passes `amountCents` by that name. So the HMAC has
  // always bound a cent figure while the type said otherwise.
  //
  // The row's instruction was **fix the comment, not the code**, and that is
  // what this is. It matters because Batch 4.4c's step-up binds amounts through
  // this same field, and the next person to add a caller reads this line.
  //
  // Filed TWICE — DOC-13 against Batch 1.1 and L-36 against 4.4c — which is why
  // it outlived Batch 7.1: each row looked like the other one's problem.
  amount: number | null; // integer CENTS, never euros
  exp: number; // ms epoch
  nonce: string;
};

// Single-use enforcement. NOTE: the `consumed` map is in-memory, so a
// process restart loses the consumed-state — a token can be replayed
// once within its remaining TTL after a restart. This is an accepted
// trade-off for the intended single-tenant local-POS deployment
// (restarts are rare and operator-initiated). If this app is ever
// multi-instance / resold, persist `consumed` to a DB table.
//
// L-152 (R9.4): this said « 60s TTL », which is **half the real window**. The
// 60 belongs to `issueApprovalToken`'s own default and is still correct there —
// but no production caller uses it. The only one is `step-up.ts`, which passes
// `STEP_UP_TTL_SEC = 120`. So the sentence is now written in terms of the TTL
// rather than a number, because the number is the CALLER's and copying it here
// is what made it wrong.
//
// M-27 (Batch 4.3): it was a `Set<string>` of whole tokens that nothing ever
// removed from, so every approval a till granted stayed in memory for the
// life of the process. The replay window above is documented and accepted;
// the unbounded growth was not. Each entry now carries the token's own
// expiry, and expired entries are swept on every insert — a consumed token
// that has expired is refused by the `exp` check before the replay check is
// ever reached, so remembering it past that point buys nothing.
//
// Sweeping on every insert, rather than past a size threshold the way
// `rate-limit.ts` does, because the two are not the same shape: a rate-limit
// key is minted by anyone who sends a request, while an entry here costs a
// manager's correct PIN. The map therefore holds only tokens issued inside
// the maximum 300 s TTL — tens of entries at a busy till — so the sweep is
// walking a handful of keys, and the bound holds with no tuning constant to
// get wrong.
const consumed = new Map<string, number>();

function sweepConsumed(now: number): void {
  for (const [token, exp] of consumed) {
    if (exp <= now) consumed.delete(token);
  }
}

/** Live entry count. Exported for tests and diagnostics. */
export function consumedTokenCount(): number {
  return consumed.size;
}

export class ApprovalError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApprovalError";
    this.status = status;
  }
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("hex");
}

/**
 * Issue a signed approval token bound to (approverId, action, amount?).
 *
 * Default TTL 60 s — and **that default is not what production uses.** The only
 * caller is `step-up.ts`, which passes `STEP_UP_TTL_SEC = 120`; the 60 applies
 * to a caller that omits `ttlSec`, which today means the tests. Spelled out
 * because copying « 60 s » into the replay note above is precisely how L-152
 * happened.
 *
 * Single-use enforced by verifyApprovalToken.
 */
export function issueApprovalToken(input: {
  approverId: string;
  action: ApprovalAction;
  amount?: number;
  ttlSec?: number;
}): string {
  const nonce = randomBytes(16).toString("hex");
  const exp = Date.now() + (input.ttlSec ?? 60) * 1000;
  const payload: ApprovalPayload = {
    approverId: input.approverId,
    action: input.action,
    amount: input.amount ?? null,
    exp,
    nonce,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = sign(body);
  return `${body}.${sig}`;
}

/**
 * Verify + consume a signed approval token.
 * Throws ApprovalError on any failure (expired, replayed, wrong action/amount).
 */
export function verifyApprovalToken(
  token: string,
  expected: { action: ApprovalAction; amount?: number; tolerance?: number },
): { approverId: string } {
  const [body, sig] = token.split(".");
  if (!body || !sig) {
    throw new ApprovalError("Token invalide", 400);
  }
  const expectedSig = sign(body);
  if (
    sig.length !== expectedSig.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
  ) {
    throw new ApprovalError("Signature de token invalide", 401);
  }
  let payload: ApprovalPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new ApprovalError("Token corrompu", 400);
  }
  if (payload.exp < Date.now()) {
    throw new ApprovalError("Token expiré", 401);
  }
  if (payload.action !== expected.action) {
    throw new ApprovalError(
      `Token non autorisé pour cette action (attendu: ${expected.action})`,
      403,
    );
  }
  const tolerance = expected.tolerance ?? 0.001;
  if (expected.amount != null) {
    // Amount-bound verification: the token MUST carry the amount it was
    // issued for. A token issued WITHOUT an amount is a blank check —
    // reject it when the caller expects a specific amount (closes the
    // amount-optional bypass where /api/auth/approve (DELETED in Batch 7.2 — see `api/auth/step-up/route.ts`) was called with
    // {pin, action} only).
    if (payload.amount == null) {
      throw new ApprovalError(
        "Token non lié à un montant — approbation refusée",
        403,
      );
    }
    if (Math.abs(payload.amount - expected.amount) > tolerance) {
      throw new ApprovalError("Montant de token invalide", 403);
    }
  }
  if (consumed.has(token)) {
    throw new ApprovalError("Token déjà utilisé", 409);
  }
  const now = Date.now();
  sweepConsumed(now);
  consumed.set(token, payload.exp);
  return { approverId: payload.approverId };
}