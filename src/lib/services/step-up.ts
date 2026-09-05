// Step-up PIN for large discounts and every refund — DD-19, Batch 4.4c.
//
// WHAT THIS REPLACES. Before this batch a discount above the configured
// threshold set `discountApproverId = user.id` with no prompt and no
// keystroke (`orders/route.ts`), and a refund of any amount did the same
// (`refund/route.ts`). The record therefore named the manager as their own
// approver while nothing about the act was deliberate. Batch 4.4b left that
// gap standing on purpose and named it this batch's subject.
//
// WHAT IT IS NOT. This is re-authentication, not second-person approval.
// DD-07 left the product with one operational role, so there is no second
// person to ask, and `/api/auth/approve` (DELETED in Batch 7.2 — see `api/auth/step-up/route.ts`) forbids self-approval by design —
// it can never succeed here. The control being bought is the UNATTENDED
// TILL: today a passer-by can apply a 100 % discount or refund any amount
// with no challenge at all.
//
// WHAT IT REUSES, RATHER THAN REBUILDS.
//   * `approvals.ts` — the same signed, single-use, amount-bound HMAC token
//     the manager approval used. The only difference is who it names: the
//     caller themselves, which `consumeStepUpToken` insists on.
//   * `approval-lockout.ts` (Batch 4.1) — the SAME counter, not a second
//     one. A step-up failure writes `MANAGER_APPROVAL_FAILED` and is counted
//     with the rest, so a guesser gets five attempts in total rather than
//     five per surface (operator decision, 2026-09-04). The lock is checked
//     BEFORE the derivation, which is Batch 4.1's property.
//   * `verifyPin` (Batch 4.2) — so every derivation passes through
//     `pin-hash-queue.ts` and cannot block the event loop or exhaust memory.
//
// AMOUNTS ARE CENTS. `ApprovalPayload.amount` is commented "euros" in
// `approvals.ts`; that comment has been wrong since the routes were written
// — `refund/route.ts` binds `parsed.data.amount` and `orders-view.tsx` binds
// `amountCents`, both cents. Recorded as L-36 rather than edited here: this
// batch does not own that file. Everything below binds and compares cents.

import { db } from "@/lib/db";
import { verifyPin } from "@/lib/auth";
import { audit } from "@/lib/services/audit";
import {
  ApprovalError,
  issueApprovalToken,
  verifyApprovalToken,
  type ApprovalAction,
} from "@/lib/approvals";
import {
  approvalLockState,
  approvalLockedMessage,
  recordApprovalFailure,
} from "@/lib/services/approval-lockout";

/** Written on a successful step-up. Its own action name, so it never lands
 *  in the failure count `approvalLockState` reads. */
export const STEP_UP_GRANTED_ACTION = "STEP_UP_PIN_GRANTED";

/** Token lifetime. Longer than the manager approval's 60 s because the same
 *  person has to finish the encaissement they just confirmed, and well under
 *  the 300 s ceiling `approveSchema` already treats as the maximum. */
export const STEP_UP_TTL_SEC = 120;

/** Shown when the operation arrives with no token at all. */
export const STEP_UP_REQUIRED_MESSAGE = "Confirmation par code PIN requise.";

/** Shown when a token is valid but was issued to somebody else. */
export const STEP_UP_WRONG_USER_MESSAGE =
  "Cette confirmation PIN n'a pas été délivrée à l'utilisateur connecté.";

/** Shown for a wrong PIN, and for an inactive or PIN-less caller — the same
 *  words on purpose, so the refusal does not report which case it was. */
export const STEP_UP_INVALID_PIN_MESSAGE = "Code PIN invalide.";

export type StepUpRefusal = {
  ok: false;
  status: number;
  message: string;
  /** Present only on a 423, for the `Retry-After` header. */
  retryAfterSec?: number;
};

export type StepUpGrant = { ok: true; token: string; expSec: number };

// The trigger itself — `discountNeedsStepUp` — lives in `lib/discount-policy.ts`
// rather than here, because `payment-dialog.tsx` needs the identical rule and a
// "use client" component cannot import this module: it pulls in Prisma and the
// auth stack. One rule, two callers, no bundle.

/**
 * Verify the caller's own PIN and issue a token bound to (caller, action,
 * amount).
 *
 * Order of the walls matters and mirrors `/api/auth/approve`: the lockout is
 * read BEFORE any key derivation, so a locked caller cannot make the server
 * spend a full scrypt on their guess. A refusal for lockout records nothing,
 * so hammering it cannot push the window further out.
 *
 * A successful step-up deliberately does NOT reset the failure count — the
 * same choice Batch 4.1 made for manager approval, and for the same reason:
 * the count is a window over recent failures, not a streak.
 */
export async function grantStepUp(input: {
  callerId: string;
  pin: string;
  action: ApprovalAction;
  /** Cents. Bound into the token and re-checked when it is consumed. */
  amount?: number;
  ttlSec?: number;
}): Promise<StepUpGrant | StepUpRefusal> {
  const lock = await approvalLockState(input.callerId);
  if (lock.locked) {
    return {
      ok: false,
      status: 423,
      message: approvalLockedMessage(lock.retryAfterSec),
      retryAfterSec: lock.retryAfterSec,
    };
  }

  const caller = await db.user.findUnique({
    where: { id: input.callerId },
    select: { id: true, active: true, pinHash: true },
  });
  if (!caller || !caller.active || !caller.pinHash) {
    return { ok: false, status: 403, message: STEP_UP_INVALID_PIN_MESSAGE };
  }

  if (!(await verifyPin(input.pin, caller.pinHash))) {
    const state = await recordApprovalFailure(input.callerId, {
      reason: "PIN invalide",
      action: input.action,
      stepUp: true,
    });
    if (state.locked) {
      return {
        ok: false,
        status: 423,
        message: approvalLockedMessage(state.retryAfterSec),
        retryAfterSec: state.retryAfterSec,
      };
    }
    return { ok: false, status: 403, message: STEP_UP_INVALID_PIN_MESSAGE };
  }

  const ttlSec = input.ttlSec ?? STEP_UP_TTL_SEC;
  const token = issueApprovalToken({
    approverId: input.callerId,
    action: input.action,
    amount: input.amount,
    ttlSec,
  });

  await audit(
    STEP_UP_GRANTED_ACTION,
    "User",
    input.callerId,
    { action: input.action, amount: input.amount ?? null },
    input.callerId,
  );

  return { ok: true, token, expSec: ttlSec };
}

/**
 * Consume a step-up token on the operation it was issued for.
 *
 * `verifyApprovalToken` already checks the signature, the expiry, the action,
 * the exact amount and single use. This adds the one thing that makes it a
 * step-up rather than an approval: the token must name the caller. A token
 * issued to somebody else is refused — and burned, because verification
 * consumes it before this check, which is the safe order.
 */
export async function consumeStepUpToken(input: {
  token?: string | null;
  callerId: string;
  action: ApprovalAction;
  /** Cents. Must equal the amount the token was issued for. */
  amount: number;
}): Promise<{ ok: true; approverId: string } | StepUpRefusal> {
  if (!input.token) {
    return { ok: false, status: 403, message: STEP_UP_REQUIRED_MESSAGE };
  }
  let approverId: string;
  try {
    approverId = verifyApprovalToken(input.token, {
      action: input.action,
      amount: input.amount,
    }).approverId;
  } catch (e) {
    if (e instanceof ApprovalError) {
      return { ok: false, status: e.status, message: e.message };
    }
    throw e;
  }
  if (approverId !== input.callerId) {
    return { ok: false, status: 403, message: STEP_UP_WRONG_USER_MESSAGE };
  }
  return { ok: true, approverId };
}
