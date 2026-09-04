// Brute-force lockout for manager approvals — C-08, Batch 4.1.
//
// `POST /api/auth/approve` tests a submitted PIN against every active
// MANAGER/SUPER_ADMIN. Before this module the only wall was an in-memory
// rate limit keyed on a client IP taken from `X-Real-IP`/`X-Forwarded-For`
// — headers the caller supplies — so rotating a header per request minted a
// fresh bucket and the 10^6 PIN space could be ground down with no lockout.
//
// Why the lock is NOT `User.failedAttempts` / `User.lockedUntil`, which is
// what login, unlock and switch-user use:
//
//   1. Those routes lock the account whose PIN was wrong. Approve fails
//      against ALL managers at once, so there is no such account, and
//      locking every manager would let any cashier take manager approval
//      off the till in 25 keystrokes.
//   2. `getSession()` (auth.ts) treats a live `lockedUntil` as immediate
//      session revocation. Setting it on the CALLER would throw the cashier
//      out of the app mid-service, with their caisse open, whenever a
//      manager fumbled a PIN five times.
//
// So the lock is on the approval CAPABILITY of the calling account: the
// cashier keeps selling, and only the operations that need a manager are
// refused until the window clears. The plan's validation criterion allows
// exactly this ("lock the calling account (or the approval capability)").
//
// The counter is the audit log itself. `MANAGER_APPROVAL_FAILED` rows are
// already written on every failure, carry `userId = caller.id` (an indexed
// column), and survive a process restart — which the in-memory limiter does
// not. `AUDIT_LOG_RETENTION_DAYS` prunes in whole days at best
// (log-retention.ts floors the value), so pruning can never reach inside a
// fifteen-minute window.

import { db } from "@/lib/db";
import { audit } from "@/lib/services/audit";

/** Same escalation as login: five wrong PINs, fifteen minutes. */
export const APPROVAL_MAX_FAILED = 5;
export const APPROVAL_LOCKOUT_MINUTES = 15;

export const APPROVAL_FAILED_ACTION = "MANAGER_APPROVAL_FAILED";
export const APPROVAL_LOCKED_ACTION = "MANAGER_APPROVAL_LOCKED";

/**
 * Rate-limit key for the approve route.
 *
 * Keyed on the CALLER alone. No IP component: the IP was attacker-supplied
 * (see `clientIp` in http-rate-limit.ts), and leaving it in the key would
 * re-open the bypass the moment a deployment ever set TRUST_PROXY_HEADERS.
 */
export function approvalRateLimitKey(callerId: string): string {
  return `approve:${callerId}`;
}

export type ApprovalLockState = {
  locked: boolean;
  /** Failures counted inside the window, capped at APPROVAL_MAX_FAILED. */
  failures: number;
  /** Seconds until the oldest counted failure ages out. 0 when unlocked. */
  retryAfterSec: number;
};

/**
 * Is this caller's approval capability locked right now?
 *
 * Sliding window: the lock lifts as the oldest counted failure ages out of
 * the window, rather than at a fixed instant stamped on the account. A
 * refusal does NOT record a failure, so a locked caller cannot push their
 * own lock further out by hammering it.
 */
export async function approvalLockState(
  callerId: string,
  now: Date = new Date(),
): Promise<ApprovalLockState> {
  const windowMs = APPROVAL_LOCKOUT_MINUTES * 60_000;
  const windowStart = new Date(now.getTime() - windowMs);

  const rows = await db.auditLog.findMany({
    where: {
      userId: callerId,
      action: APPROVAL_FAILED_ACTION,
      createdAt: { gte: windowStart },
    },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
    take: APPROVAL_MAX_FAILED,
  });

  if (rows.length < APPROVAL_MAX_FAILED) {
    return { locked: false, failures: rows.length, retryAfterSec: 0 };
  }

  const freeAt = rows[0].createdAt.getTime() + windowMs;
  return {
    locked: true,
    failures: rows.length,
    retryAfterSec: Math.max(1, Math.ceil((freeAt - now.getTime()) / 1000)),
  };
}

/**
 * Record one failed approval attempt and return the resulting lock state.
 *
 * The `MANAGER_APPROVAL_FAILED` row is written with the same action, entity,
 * entityId, details and userId the route wrote before this batch — nothing
 * that reads the audit log sees a new shape. When the failure is the one
 * that trips the lock, a distinct `MANAGER_APPROVAL_LOCKED` row is written
 * so an operator can see in the audit view why approvals stopped working.
 * That row uses its own action, so it never inflates the failure count.
 *
 * If the audit write fails, `audit()` swallows it and the count does not
 * advance — the in-memory rate limit on the route is the backstop.
 */
export async function recordApprovalFailure(
  callerId: string,
  details: Record<string, unknown>,
  now: Date = new Date(),
): Promise<ApprovalLockState> {
  await audit(APPROVAL_FAILED_ACTION, "User", callerId, details, callerId);

  const state = await approvalLockState(callerId, now);
  if (state.locked) {
    await audit(
      APPROVAL_LOCKED_ACTION,
      "User",
      callerId,
      {
        reason: "Trop de PIN manager invalides",
        failures: state.failures,
        lockoutMinutes: APPROVAL_LOCKOUT_MINUTES,
      },
      callerId,
    );
  }
  return state;
}

/** French 423 body shared by the pre-check and the trip-the-lock path. */
export function approvalLockedMessage(retryAfterSec: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Approbations bloquées après ${APPROVAL_MAX_FAILED} PIN manager invalides. Réessayez dans ${minutes} min.`;
}
