import { describe, it, expect } from "vitest";
// Env vars are set by vitest.setup.ts (runs before any test file loads)
// — setting them here would be too late because ESM imports are hoisted
// above this assignment and the approvals module throws at import time on
// missing/too-short SESSION_SECRET.

import {
  issueApprovalToken,
  verifyApprovalToken,
  ApprovalError,
} from "@/lib/approvals";

describe("approvals — signed single-use tokens", () => {
  it("issues + verifies a valid token", () => {
    const token = issueApprovalToken({
      approverId: "mgr-1",
      action: "DISCOUNT",
      amount: 5.0,
      ttlSec: 60,
    });
    const result = verifyApprovalToken(token, {
      action: "DISCOUNT",
      amount: 5.0,
    });
    expect(result.approverId).toBe("mgr-1");
  });

  it("rejects replay (single-use consumed)", () => {
    const token = issueApprovalToken({
      approverId: "mgr-2",
      action: "REFUND",
      amount: 10,
      ttlSec: 60,
    });
    verifyApprovalToken(token, { action: "REFUND", amount: 10 }); // first use OK
    expect(() =>
      verifyApprovalToken(token, { action: "REFUND", amount: 10 }),
    ).toThrow(ApprovalError);
  });

  it("rejects wrong action", () => {
    const token = issueApprovalToken({
      approverId: "mgr-3",
      action: "DISCOUNT",
    });
    expect(() =>
      verifyApprovalToken(token, { action: "REFUND" }),
    ).toThrowError(/action/);
  });

  it("rejects amount mismatch outside tolerance", () => {
    const token = issueApprovalToken({
      approverId: "mgr-4",
      action: "DISCOUNT",
      amount: 10,
    });
    expect(() =>
      verifyApprovalToken(token, { action: "DISCOUNT", amount: 100 }),
    ).toThrowError(/Montant/);
  });

  it("rejects expired token", () => {
    const token = issueApprovalToken({
      approverId: "mgr-5",
      action: "DISCOUNT",
      ttlSec: 1, // 1-second expiry
    });
    // Sleep 1.1s with vitest fake timers would be cleaner, but real-time wait
    // is simpler here.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(() =>
          verifyApprovalToken(token, { action: "DISCOUNT" }),
        ).toThrowError(/expir/);
        resolve();
      }, 1100);
    });
  });

  it("rejects tampered signature", () => {
    const token = issueApprovalToken({
      approverId: "mgr-6",
      action: "DISCOUNT",
    });
    const [body, sig] = token.split(".");
    const tampered = `${body}.deadbeef${sig.slice(8)}`;
    expect(() =>
      verifyApprovalToken(tampered, { action: "DISCOUNT" }),
    ).toThrowError(/Signature/);
  });

  it("rejects malformed token structure", () => {
    expect(() => verifyApprovalToken("not-a-token", { action: "DISCOUNT" })).toThrow(
      ApprovalError,
    );
  });
});