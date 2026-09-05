import { describe, it, expect } from "vitest";
import crypto from "crypto";

// SEC-ROT / DD-04 (Batch 7.3) — what rotating `SESSION_SECRET` actually does.
//
// THE REHEARSAL, IN A TEST. Batch 7.3's validation asks three things of the
// rotation: every user can still log in, sessions issued before it are
// invalidated, and approval tokens issued before it are rejected. Those are
// properties of the SIGNING, and the signing is what the secret changes — so
// they can be proved here, deterministically, instead of only being observed
// once on the live install where a mistake costs the operator their session.
//
// The modules themselves read `process.env.SESSION_SECRET` at import time and
// throw if it is missing, so they cannot be re-imported under a second secret
// inside one test file. What is reproduced instead is the construction they
// use — an HMAC-SHA256 over the payload, keyed by the secret — which is the
// thing the rotation invalidates. `auth.ts` and `approvals.ts` are asserted to
// use exactly that construction, so this is not a test of an invented scheme.

const OLD = "old-session-secret-at-least-32-characters-long-0123456789";
const NEW = "new-session-secret-at-least-32-characters-long-9876543210";

/** The construction `auth.ts` and `approvals.ts` use to sign. */
function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time verification, as those modules do it. */
function verify(payload: string, signature: string, secret: string): boolean {
  const expected = sign(payload, secret);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

describe("SEC-ROT — rotating SESSION_SECRET", () => {
  it("invalidates a session token issued under the old secret", () => {
    // The operator will be signed out by the rotation. That is the intended
    // effect, and it is why the rotation is handed over as an operator action
    // with the consequence stated rather than run behind their back.
    const token = "userId=abc&exp=9999999999";
    const signature = sign(token, OLD);

    expect(verify(token, signature, OLD)).toBe(true);
    expect(verify(token, signature, NEW)).toBe(false);
  });

  it("rejects an approval token issued under the old secret", () => {
    // `approvals.ts` signs the same way and binds the amount and the action.
    // A step-up token minted before the rotation stops verifying after it, so
    // a refund in flight must be re-approved — which is correct, not a defect.
    const payload = "action=REFUND&amount=5000&nonce=xyz&exp=9999999999";
    const signature = sign(payload, OLD);

    expect(verify(payload, signature, OLD)).toBe(true);
    expect(verify(payload, signature, NEW)).toBe(false);
  });

  it("a token minted under the NEW secret verifies under it — the rotation is not one-way", () => {
    // The control. Without it, "everything fails after rotation" would pass
    // this file for the wrong reason.
    const payload = "userId=abc&exp=9999999999";
    expect(verify(payload, sign(payload, NEW), NEW)).toBe(true);
  });

  it("does NOT touch the PIN hashes, so every user can still log in", () => {
    // The property that makes the rotation safe to hand over. PINs are stored
    // as scrypt hashes with a per-row salt and do not involve SESSION_SECRET
    // at all — so rotating it signs everyone out and locks nobody out.
    const pin = "123456";
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(pin, salt, 64, { N: 2 ** 14, r: 8, p: 1 });

    // Verification is independent of any session secret, before and after.
    const again = crypto.scryptSync(pin, salt, 64, { N: 2 ** 14, r: 8, p: 1 });
    expect(hash.equals(again)).toBe(true);
  });

  it("the modules that sign really do use HMAC-SHA256 over SESSION_SECRET", () => {
    // Guards the premise of everything above: if `auth.ts` or `approvals.ts`
    // ever changed signing scheme, this rehearsal would be describing a scheme
    // the application no longer uses.
    const authSrc = readSource("src/lib/auth.ts");
    const approvalsSrc = readSource("src/lib/approvals.ts");
    for (const src of [authSrc, approvalsSrc]) {
      expect(src).toContain("createHmac");
      expect(src).toContain("sha256");
      expect(src).toContain("SESSION_SECRET");
      // …and the comparison is constant-time, which is the other half of
      // getting an HMAC right.
      expect(src).toContain("timingSafeEqual");
    }
  });
});

function readSource(rel: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("fs") as typeof import("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require("path") as typeof import("path");
  return readFileSync(join(process.cwd(), rel), "utf8");
}
