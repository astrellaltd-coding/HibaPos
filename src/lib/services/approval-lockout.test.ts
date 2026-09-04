import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import {
  APPROVAL_FAILED_ACTION,
  APPROVAL_LOCKED_ACTION,
  APPROVAL_LOCKOUT_MINUTES,
  APPROVAL_MAX_FAILED,
  approvalLockState,
  approvalRateLimitKey,
  recordApprovalFailure,
} from "@/lib/services/approval-lockout";

// Batch 4.1 — C-08 (manager-approval PIN can be brute-forced).
//
// Before this batch `POST /api/auth/approve` wrote an audit row on a wrong
// PIN and returned 403, and that was all: no counter, no lockout. The only
// wall was an in-memory rate limit whose key carried a client IP taken from
// `X-Real-IP` / `X-Forwarded-For` — headers the caller supplies — so an
// authenticated cashier could rotate a header per request, get a fresh
// bucket every time, and grind the 10^6 PIN space unimpeded.
//
// These tests assert the two properties that close it: the lock counts
// failures per CALLER and engages at five, and it is derived from rows in
// the database rather than from process memory, so a restart does not clear
// it. Note what is deliberately NOT locked — see the module header: the
// caller's User row is untouched, because `getSession()` treats a live
// `lockedUntil` as session revocation and would eject a cashier from the
// till mid-service with their caisse open.

const MS_PER_MIN = 60_000;

// Every test gets its own caller, so each starts with no failure rows by
// construction — the lock is counted per userId. Nothing global is wiped:
// this file shares one test database with the rest of the suite, and other
// files leave orders, shifts and payments pointing at their own users.
const createdUserIds: string[] = [];

async function makeUser(label: string, role: "CASHIER" | "MANAGER" = "CASHIER") {
  const user = await db.user.create({
    data: {
      username: `c08-${label}-${Date.now()}-${Math.random()}`,
      name: label,
      role,
      pinHash: "salt:hash",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

afterAll(async () => {
  // Audit rows first: their FK is onDelete SetNull, so dropping the users
  // first would leave orphaned rows behind rather than removing them.
  await db.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
  await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

/** Write a failure row as it stood `minutesAgo` minutes in the past. */
async function failureAt(userId: string, minutesAgo: number) {
  await db.auditLog.create({
    data: {
      userId,
      action: APPROVAL_FAILED_ACTION,
      entity: "User",
      entityId: userId,
      details: JSON.stringify({ reason: "PIN invalide", action: "DISCOUNT" }),
      createdAt: new Date(Date.now() - minutesAgo * MS_PER_MIN),
    },
  });
}

describe("approval lockout — C-08 brute-force wall", () => {
  it("does not lock below the threshold", async () => {
    const caller = await makeUser("under");
    for (let i = 0; i < APPROVAL_MAX_FAILED - 1; i++) {
      const state = await recordApprovalFailure(caller.id, {
        reason: "PIN invalide",
        action: "DISCOUNT",
      });
      expect(state.locked).toBe(false);
    }
    const state = await approvalLockState(caller.id);
    expect(state.locked).toBe(false);
    expect(state.failures).toBe(APPROVAL_MAX_FAILED - 1);
  });

  it("locks on the Nth consecutive wrong PIN and reports a retry delay", async () => {
    const caller = await makeUser("trip");
    let state = await approvalLockState(caller.id);
    for (let i = 0; i < APPROVAL_MAX_FAILED; i++) {
      state = await recordApprovalFailure(caller.id, {
        reason: "PIN invalide",
        action: "DISCOUNT",
      });
    }
    expect(state.locked).toBe(true);
    expect(state.retryAfterSec).toBeGreaterThan(0);
    expect(state.retryAfterSec).toBeLessThanOrEqual(
      APPROVAL_LOCKOUT_MINUTES * 60,
    );

    // And the lock is readable from a fresh call — it lives in the database,
    // not in the value that reported it.
    expect((await approvalLockState(caller.id)).locked).toBe(true);
  });

  it("locks the CALLING account only — another caller is unaffected", async () => {
    const attacker = await makeUser("attacker");
    const colleague = await makeUser("colleague");
    for (let i = 0; i < APPROVAL_MAX_FAILED; i++) {
      await recordApprovalFailure(attacker.id, { reason: "PIN invalide" });
    }
    expect((await approvalLockState(attacker.id)).locked).toBe(true);
    expect((await approvalLockState(colleague.id)).locked).toBe(false);
  });

  it("leaves the caller's User row untouched, so the session survives", async () => {
    const caller = await makeUser("session");
    for (let i = 0; i < APPROVAL_MAX_FAILED; i++) {
      await recordApprovalFailure(caller.id, { reason: "PIN invalide" });
    }
    const after = await db.user.findUniqueOrThrow({ where: { id: caller.id } });
    expect(after.failedAttempts).toBe(0);
    expect(after.lockedUntil).toBeNull();
    expect(after.active).toBe(true);
  });

  it("counts only failures inside the window", async () => {
    const caller = await makeUser("window");
    // Five failures, but all older than the window.
    for (let i = 0; i < APPROVAL_MAX_FAILED; i++) {
      await failureAt(caller.id, APPROVAL_LOCKOUT_MINUTES + 5 + i);
    }
    expect((await approvalLockState(caller.id)).locked).toBe(false);
  });

  it("lifts the lock as the oldest counted failure ages out", async () => {
    const caller = await makeUser("slide");
    // Four inside the window, one just outside it.
    await failureAt(caller.id, APPROVAL_LOCKOUT_MINUTES + 1);
    for (let i = 0; i < APPROVAL_MAX_FAILED - 1; i++) {
      await failureAt(caller.id, 1);
    }
    expect((await approvalLockState(caller.id)).locked).toBe(false);

    // One more inside the window and the threshold is met again.
    await failureAt(caller.id, 1);
    expect((await approvalLockState(caller.id)).locked).toBe(true);
  });

  it("counts only MANAGER_APPROVAL_FAILED rows", async () => {
    const caller = await makeUser("noise");
    for (let i = 0; i < APPROVAL_MAX_FAILED + 3; i++) {
      await db.auditLog.create({
        data: {
          userId: caller.id,
          action: "LOGIN_FAILED",
          entity: "User",
          entityId: caller.id,
        },
      });
    }
    expect((await approvalLockState(caller.id)).locked).toBe(false);
  });

  it("journals the failure rows and one lock row when the lock engages", async () => {
    const caller = await makeUser("journal");
    for (let i = 0; i < APPROVAL_MAX_FAILED; i++) {
      await recordApprovalFailure(caller.id, {
        reason: "PIN invalide",
        action: "REFUND",
      });
    }
    const failures = await db.auditLog.findMany({
      where: { userId: caller.id, action: APPROVAL_FAILED_ACTION },
    });
    expect(failures).toHaveLength(APPROVAL_MAX_FAILED);
    // The row shape the route wrote before this batch is unchanged.
    expect(failures[0].entity).toBe("User");
    expect(failures[0].entityId).toBe(caller.id);
    expect(JSON.parse(failures[0].details ?? "{}")).toMatchObject({
      reason: "PIN invalide",
      action: "REFUND",
    });

    const locks = await db.auditLog.findMany({
      where: { userId: caller.id, action: APPROVAL_LOCKED_ACTION },
    });
    expect(locks).toHaveLength(1);
    expect(JSON.parse(locks[0].details ?? "{}")).toMatchObject({
      lockoutMinutes: APPROVAL_LOCKOUT_MINUTES,
    });
  });

  it("refusing a locked caller does not extend their own lock", async () => {
    const caller = await makeUser("nopush");
    for (let i = 0; i < APPROVAL_MAX_FAILED; i++) {
      await recordApprovalFailure(caller.id, { reason: "PIN invalide" });
    }
    const first = await approvalLockState(caller.id);
    // The route returns 423 without recording anything, so repeated reads
    // see the same window — the delay only ever counts down.
    const second = await approvalLockState(caller.id);
    expect(second.retryAfterSec).toBeLessThanOrEqual(first.retryAfterSec);
    const rows = await db.auditLog.count({
      where: { userId: caller.id, action: APPROVAL_FAILED_ACTION },
    });
    expect(rows).toBe(APPROVAL_MAX_FAILED);
  });

  it("keys the rate limit on the caller alone — no IP component", () => {
    expect(approvalRateLimitKey("user-abc")).toBe("approve:user-abc");
  });
});
