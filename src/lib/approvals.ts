// Signed single-use approval tokens.
// Used to bind a manager's PIN approval to a concrete (action, amount) pair,
// preventing cashiers from forging arbitrary approvals by knowing a manager id.

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const SECRET = process.env.SESSION_SECRET;
if (!SECRET || SECRET.length < 32) {
  throw new Error("SESSION_SECRET missing or too short for approvals module.");
}

export type ApprovalAction = "DISCOUNT" | "REFUND";

export type ApprovalPayload = {
  approverId: string;
  action: ApprovalAction;
  amount: number | null; // euros
  exp: number; // ms epoch
  nonce: string;
};

const consumed = new Set<string>();

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
  consumed.add(token);
  return { approverId: payload.approverId };
}