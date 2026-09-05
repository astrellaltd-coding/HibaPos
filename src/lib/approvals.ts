// Signed single-use approval tokens.
// Used to bind a manager's PIN approval to a concrete (action, amount) pair,
// preventing cashiers from forging arbitrary approvals by knowing a manager id.

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const SECRET = process.env.SESSION_SECRET;
if (!SECRET || SECRET.length < 32) {
  throw new Error("SESSION_SECRET missing or too short for approvals module.");
}

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
  amount: number | null; // euros
  exp: number; // ms epoch
  nonce: string;
};

// Single-use enforcement. NOTE: the `consumed` map is in-memory, so a
// process restart loses the consumed-state — a token can be replayed
// once within its 60s TTL after a restart. This is an accepted
// trade-off for the intended single-tenant local-POS deployment
// (restarts are rare and operator-initiated). If this app is ever
// multi-instance / resold, persist `consumed` to a DB table.
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
  return createHmac("sha256", SECRET!).update(data).digest("hex");
}

/**
 * Issue a signed approval token bound to (approverId, action, amount?).
 * Default TTL 60s. Single-use enforced by verifyApprovalToken.
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
    // amount-optional bypass where /api/auth/approve was called with
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