import { describe, it, expect } from "vitest";
import {
  ApprovalError,
  consumedTokenCount,
  issueApprovalToken,
  verifyApprovalToken,
} from "@/lib/approvals";

// M-27, Batch 4.3 — the consumed-token set grew without bound.
//
// `verifyApprovalToken` remembers every token it accepts so the same one
// cannot be replayed. It remembered them in a `Set<string>` that nothing ever
// removed from, so a till granting discounts and refunds all day accumulated
// one full base64url token per approval for the life of the process. The
// single-use guarantee needs that memory only while the token could still be
// presented: past its own `exp` the expiry check rejects it first, so the
// entry is dead weight.
//
// The replay-after-restart window described in the module header is
// deliberate and accepted; these tests are about the map staying bounded, and
// about the pruning not weakening single-use while it is doing so.

describe("M-27 — consumed approval tokens are pruned", () => {
  it("still refuses a replay inside the token's lifetime", () => {
    // The property the pruning must not break.
    const token = issueApprovalToken({
      approverId: "u1",
      action: "DISCOUNT",
      amount: 12.5,
      ttlSec: 60,
    });
    expect(verifyApprovalToken(token, { action: "DISCOUNT", amount: 12.5 })).toEqual({
      approverId: "u1",
    });
    try {
      verifyApprovalToken(token, { action: "DISCOUNT", amount: 12.5 });
      throw new Error("replay was accepted");
    } catch (e) {
      expect(e).toBeInstanceOf(ApprovalError);
      expect((e as ApprovalError).status).toBe(409);
      expect((e as ApprovalError).message).toBe("Token déjà utilisé");
    }
  });

  it("holds a live token and drops it once it has expired", async () => {
    const start = consumedTokenCount();

    // Five short-lived tokens, all consumed while still valid.
    const shortLived = Array.from({ length: 5 }, (_, i) =>
      issueApprovalToken({ approverId: `u${i}`, action: "REFUND", ttlSec: 1 }),
    );
    for (const t of shortLived) verifyApprovalToken(t, { action: "REFUND" });
    expect(consumedTokenCount()).toBe(start + 5);

    // Let them all expire, then consume one more token. The sweep runs on
    // insert, so that single insert is what collects the five dead entries.
    await new Promise((r) => setTimeout(r, 1100));
    const fresh = issueApprovalToken({
      approverId: "u-fresh",
      action: "REFUND",
      ttlSec: 60,
    });
    verifyApprovalToken(fresh, { action: "REFUND" });

    // Only the live one is left of this test's six. Anything the rest of the
    // suite consumed with a long TTL is still legitimately held, so compare
    // against the count taken at the start rather than against zero.
    expect(consumedTokenCount()).toBe(start + 1);
  });

  it("never grows past the tokens still inside their TTL", async () => {
    // The bound, stated directly: consume many short-lived tokens in
    // succession and the map does not accumulate them.
    const start = consumedTokenCount();
    for (let i = 0; i < 20; i++) {
      const t = issueApprovalToken({
        approverId: `burst-${i}`,
        action: "DISCOUNT",
        ttlSec: 1,
      });
      verifyApprovalToken(t, { action: "DISCOUNT" });
      if (i === 9) await new Promise((r) => setTimeout(r, 1100)); // let the first ten die
    }
    // The first ten expired before the second ten were inserted, so at most
    // the second ten can still be held. Without the sweep this would be
    // start + 20.
    expect(consumedTokenCount()).toBeLessThanOrEqual(start + 10);
    expect(consumedTokenCount()).toBeGreaterThan(start); // the live ones ARE held
  });

  it("an expired token is refused before the replay check is reached", () => {
    // Why forgetting an expired entry costs nothing.
    const token = issueApprovalToken({
      approverId: "u2",
      action: "DISCOUNT",
      ttlSec: -1, // already expired
    });
    try {
      verifyApprovalToken(token, { action: "DISCOUNT" });
      throw new Error("expired token was accepted");
    } catch (e) {
      expect(e).toBeInstanceOf(ApprovalError);
      expect((e as ApprovalError).status).toBe(401);
      expect((e as ApprovalError).message).toBe("Token expiré");
    }
  });
});
