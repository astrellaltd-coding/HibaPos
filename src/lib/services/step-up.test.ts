import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import {
  consumeStepUpToken,
  grantStepUp,
  STEP_UP_GRANTED_ACTION,
  STEP_UP_REQUIRED_MESSAGE,
  STEP_UP_WRONG_USER_MESSAGE,
} from "@/lib/services/step-up";
import {
  APPROVAL_FAILED_ACTION,
  APPROVAL_LOCKED_ACTION,
  APPROVAL_MAX_FAILED,
  APPROVAL_LOCKOUT_MINUTES,
  approvalLockState,
} from "@/lib/services/approval-lockout";
import {
  PIN_HASH_MAX_CONCURRENT,
  PIN_HASH_MAX_QUEUED,
  ScryptBusyError,
  runPinDerivation,
} from "@/lib/pin-hash-queue";

// DD-19, Batch 4.4c — step-up PIN for large discounts and every refund.
//
// WHAT WAS TRUE BEFORE. `orders/route.ts` set `discountApproverId = user.id`
// above the threshold with no prompt and no keystroke, and `refund/route.ts`
// did the same for a refund of any amount. Nothing had to be known to apply a
// 100 % discount or refund the till: a session was enough, and the session is
// whatever is left signed in at an unattended counter.
//
// WHAT THESE TESTS PIN. That the operation is refused without a confirmation
// bound to (this caller, this action, this exact cent amount); that a wrong
// PIN feeds Batch 4.1's existing counter rather than a second one; that a
// locked caller is refused before any key derivation runs; and that every
// derivation passes through Batch 4.2's bounded queue.
//
// COST NOTE. scrypt at N=2^17 costs ~1.5 s per derivation on the developer's
// machine (L-24), and a WRONG pin costs two — strong params then the legacy
// fallback. Every test below is written to spend as few as it can: one hash
// is shared by all the fixtures, one granted token carries five assertions,
// and the lockout is pre-loaded with audit rows the way
// `approval-lockout.test.ts` does rather than by guessing five real PINs.

const PIN = "135790";
const WRONG_PIN = "024680";
const MS_PER_MIN = 60_000;

let sharedPinHash: string;
const createdUserIds: string[] = [];

async function makeUser(label: string, opts: { active?: boolean; withPin?: boolean } = {}) {
  const user = await db.user.create({
    data: {
      username: `dd19-${label}-${Date.now()}-${Math.random()}`,
      name: label,
      role: "MANAGER",
      active: opts.active ?? true,
      // `User.pinHash` is NOT NULL in the schema, so the "no usable PIN" case
      // is an EMPTY hash, not a missing one — which is exactly the string
      // `grantStepUp` guards against before handing anything to scrypt.
      pinHash: (opts.withPin ?? true) ? sharedPinHash : "",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

/** A failure row as it stood `minutesAgo` minutes ago — same shape the
 *  lockout writes, so `approvalLockState` counts it. */
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

/** Occupy every derivation slot AND every waiting place, so the next caller
 *  into `runPinDerivation` is refused rather than queued. Gates are made up
 *  front, not from inside the tasks: only the two RUNNING tasks execute their
 *  body, so collecting finishers from inside would leave the other 32
 *  unresolvable and the drain would hang. */
function fillDerivationQueue() {
  const gates = Array.from(
    { length: PIN_HASH_MAX_CONCURRENT + PIN_HASH_MAX_QUEUED },
    () => {
      let finish!: () => void;
      const gate = new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { gate, finish };
    },
  );
  const occupied = gates.map((g) => runPinDerivation(() => g.gate));
  return {
    /** Let the running tasks take their slots before the queue is probed. */
    settled: new Promise((r) => setTimeout(r, 0)),
    async drain() {
      for (const g of gates) g.finish();
      await Promise.all(occupied);
    },
  };
}

beforeAll(async () => {
  // One real derivation for the whole file; every fixture user shares the
  // hash, because a hash is just a string and scrypt is the expensive part.
  sharedPinHash = await hashPin(PIN);
});

afterAll(async () => {
  // Audit rows first: their FK is onDelete SetNull, so dropping the users
  // first would orphan the rows rather than remove them.
  await db.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
  await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("a discount above the threshold", () => {
  it("is refused when no confirmation is presented", async () => {
    const caller = await makeUser("no-token");
    const result = await consumeStepUpToken({
      token: undefined,
      callerId: caller.id,
      action: "DISCOUNT",
      amount: 1500,
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      message: STEP_UP_REQUIRED_MESSAGE,
    });
  });

  it("proceeds with the caller's own PIN, and records the authorisation", async () => {
    const caller = await makeUser("granted");
    const grant = await grantStepUp({
      callerId: caller.id,
      pin: PIN,
      action: "DISCOUNT",
      amount: 1500,
    });
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;

    const used = await consumeStepUpToken({
      token: grant.token,
      callerId: caller.id,
      action: "DISCOUNT",
      amount: 1500,
    });
    // The approver the checkout writes into `Order.discountApprovedById` and
    // into the VENTE journal payload is the caller — now because they typed
    // their PIN, not because the route defaulted to them.
    expect(used).toEqual({ ok: true, approverId: caller.id });

    const rows = await db.auditLog.findMany({
      where: { userId: caller.id, action: STEP_UP_GRANTED_ACTION },
    });
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].details ?? "{}")).toEqual({
      action: "DISCOUNT",
      amount: 1500,
    });
    // A successful step-up is NOT a failure, so it never touches the counter.
    expect((await approvalLockState(caller.id)).failures).toBe(0);
  });

  it("is refused with the wrong PIN, and records a countable failure", async () => {
    const caller = await makeUser("wrong-pin");
    const grant = await grantStepUp({
      callerId: caller.id,
      pin: WRONG_PIN,
      action: "DISCOUNT",
      amount: 1500,
    });
    expect(grant).toMatchObject({ ok: false, status: 403 });

    // The failure lands in Batch 4.1's counter — the SAME counter the manager
    // approval uses, so five attempts are five in total and not five per
    // surface. The detail carries `stepUp` so the journal can still tell the
    // two surfaces apart.
    const rows = await db.auditLog.findMany({
      where: { userId: caller.id, action: APPROVAL_FAILED_ACTION },
    });
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].details ?? "{}")).toMatchObject({
      reason: "PIN invalide",
      action: "DISCOUNT",
      stepUp: true,
    });
    expect((await approvalLockState(caller.id)).failures).toBe(1);
  });
});

describe("a refund", () => {
  it("is refused with no confirmation at the smallest possible amount", async () => {
    const caller = await makeUser("refund-1c");
    // One cent. DD-19 sets no threshold for refunds, so there is no amount
    // small enough to skip the PIN.
    const result = await consumeStepUpToken({
      token: undefined,
      callerId: caller.id,
      action: "REFUND",
      amount: 1,
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      message: STEP_UP_REQUIRED_MESSAGE,
    });
  });

  it("proceeds at one cent with the caller's own PIN", async () => {
    const caller = await makeUser("refund-ok");
    const grant = await grantStepUp({
      callerId: caller.id,
      pin: PIN,
      action: "REFUND",
      amount: 1,
    });
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;

    expect(
      await consumeStepUpToken({
        token: grant.token,
        callerId: caller.id,
        action: "REFUND",
        amount: 1,
      }),
    ).toEqual({ ok: true, approverId: caller.id });
  });
});

describe("what a confirmation is bound to", () => {
  it("refuses another amount, another action, and a replay", async () => {
    // One derivation, four assertions. `verifyApprovalToken` rejects a
    // mismatched amount or action BEFORE it marks the token consumed, so the
    // token survives those two refusals and is still good for the real use.
    const caller = await makeUser("bound");
    const grant = await grantStepUp({
      callerId: caller.id,
      pin: PIN,
      action: "DISCOUNT",
      amount: 500,
    });
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;
    const token = grant.token;

    // Wrong amount — one cent under what the operator confirmed.
    expect(
      await consumeStepUpToken({ token, callerId: caller.id, action: "DISCOUNT", amount: 499 }),
    ).toMatchObject({ ok: false, status: 403 });

    // Wrong action — a discount confirmation cannot authorise a refund.
    expect(
      await consumeStepUpToken({ token, callerId: caller.id, action: "REFUND", amount: 500 }),
    ).toMatchObject({ ok: false, status: 403 });

    // The genuine use still works…
    expect(
      await consumeStepUpToken({ token, callerId: caller.id, action: "DISCOUNT", amount: 500 }),
    ).toEqual({ ok: true, approverId: caller.id });

    // …exactly once.
    expect(
      await consumeStepUpToken({ token, callerId: caller.id, action: "DISCOUNT", amount: 500 }),
    ).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses a token issued to somebody else, and burns it doing so", async () => {
    // This is the check that makes it a step-up rather than an approval: a
    // token is only ever good for the person who confirmed it. It needs its
    // own grant because, unlike the amount and action checks above, it runs
    // AFTER `verifyApprovalToken` has already marked the token consumed —
    // deliberately, since a token presented by the wrong account should not
    // remain usable. The rightful owner then gets 409, and re-confirms.
    const caller = await makeUser("bound-owner");
    const other = await makeUser("bound-other");
    const grant = await grantStepUp({
      callerId: caller.id,
      pin: PIN,
      action: "DISCOUNT",
      amount: 500,
    });
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;
    const token = grant.token;

    expect(
      await consumeStepUpToken({ token, callerId: other.id, action: "DISCOUNT", amount: 500 }),
    ).toEqual({ ok: false, status: 403, message: STEP_UP_WRONG_USER_MESSAGE });

    expect(
      await consumeStepUpToken({ token, callerId: caller.id, action: "DISCOUNT", amount: 500 }),
    ).toMatchObject({ ok: false, status: 409 });
  });
});

describe("the brute-force wall it inherits from Batch 4.1", () => {
  it("locks on the Nth wrong PIN, counting failures from either surface", async () => {
    const caller = await makeUser("lock");
    // Four failures already on the record — written directly, as
    // `approval-lockout.test.ts` does, because five real wrong PINs would
    // cost ten scrypt derivations to prove something that file already
    // proves. What is under test here is that the step-up feeds the SAME
    // counter, so its own failure must be the one that trips the lock.
    for (let i = 0; i < APPROVAL_MAX_FAILED - 1; i++) {
      await failureAt(caller.id, 1);
    }
    expect((await approvalLockState(caller.id)).locked).toBe(false);

    const grant = await grantStepUp({
      callerId: caller.id,
      pin: WRONG_PIN,
      action: "REFUND",
      amount: 250,
    });
    expect(grant).toMatchObject({ ok: false, status: 423 });
    if (grant.ok) return;
    expect(grant.retryAfterSec).toBeGreaterThan(0);
    expect(grant.retryAfterSec).toBeLessThanOrEqual(APPROVAL_LOCKOUT_MINUTES * 60);
    expect((await approvalLockState(caller.id)).locked).toBe(true);

    // And the lock is visible to an operator in the audit view.
    expect(
      await db.auditLog.count({ where: { userId: caller.id, action: APPROVAL_LOCKED_ACTION } }),
    ).toBe(1);
  });

  it("refuses a locked caller before any derivation, and does not extend the lock", async () => {
    const caller = await makeUser("locked");
    for (let i = 0; i < APPROVAL_MAX_FAILED; i++) {
      await failureAt(caller.id, 1);
    }
    const before = await approvalLockState(caller.id);
    expect(before.locked).toBe(true);

    // The CORRECT PIN, and still refused. Proving the ORDER needs more than
    // the refusal, though: a lock checked *after* the derivation refuses the
    // same call with the same 423. So the derivation queue is used as the
    // probe — fill it completely, and a step-up that reaches scrypt can only
    // throw `ScryptBusyError`. Returning 423 instead is proof that the lock
    // was read first and no derivation was ever attempted (Batch 4.1's
    // ordering property: a locked caller must not be able to make the server
    // spend scrypt on them).
    const gates = fillDerivationQueue();
    let grant;
    try {
      grant = await grantStepUp({
        callerId: caller.id,
        pin: PIN,
        action: "DISCOUNT",
        amount: 900,
      });
    } finally {
      await gates.drain();
    }
    expect(grant).toMatchObject({ ok: false, status: 423 });

    // A refusal records nothing, so hammering the lock cannot push it out.
    const after = await approvalLockState(caller.id);
    expect(after.retryAfterSec).toBeLessThanOrEqual(before.retryAfterSec);
    expect(
      await db.auditLog.count({ where: { userId: caller.id, action: APPROVAL_FAILED_ACTION } }),
    ).toBe(APPROVAL_MAX_FAILED);
    expect(
      await db.auditLog.count({ where: { userId: caller.id, action: STEP_UP_GRANTED_ACTION } }),
    ).toBe(0);
  });

  it("does not tell an inactive or hash-less account apart from a wrong PIN", async () => {
    const inactive = await makeUser("inactive", { active: false });
    expect(
      await grantStepUp({ callerId: inactive.id, pin: PIN, action: "REFUND", amount: 100 }),
    ).toMatchObject({ ok: false, status: 403 });
    const hashless = await makeUser("hashless", { withPin: false });
    expect(
      await grantStepUp({ callerId: hashless.id, pin: PIN, action: "REFUND", amount: 100 }),
    ).toMatchObject({ ok: false, status: 403 });
  });
});

describe("the bounded queue it inherits from Batch 4.2", () => {
  it("refuses rather than queues when the derivation queue is full", async () => {
    // If the step-up derived its key outside `runPinDerivation` it would sail
    // past a saturated pool and burn 128 MiB anyway; because it goes through
    // `verifyPin`, `acquire()` refuses it before it starts. `withAuth` turns
    // that into the 503 the till already understands.
    const caller = await makeUser("busy");
    const gates = fillDerivationQueue();
    await gates.settled;
    try {
      await expect(
        grantStepUp({ callerId: caller.id, pin: PIN, action: "DISCOUNT", amount: 1200 }),
      ).rejects.toBeInstanceOf(ScryptBusyError);
    } finally {
      // Drain, or every later test in the run inherits a full queue.
      await gates.drain();
    }
  });
});
