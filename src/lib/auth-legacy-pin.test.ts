import { describe, it, expect } from "vitest";
import { randomBytes, scryptSync } from "crypto";
import { hashPin, verifyPin, verifyPinDetail } from "@/lib/auth";

// T-04 — the legacy-PIN fallback.
//
// `verifyPinDetail` tries the current strong scrypt parameters (N=2^17) and,
// on a miss, retries with the parameters in force before the Phase 2A
// hardening (N=2^14 — Node's `scryptSync(pin, salt, 64)` defaults). That
// fallback is the only reason a user created before the hardening can still
// log in: their stored hash can never match the new parameters. Removing it
// silently locks every such account out of the till, and until this file
// nothing tested it — the existing `auth.test.ts` only ever fed `verifyPin`
// a hash it had just generated with the strong parameters.
//
// The audit records it as T-04 and the plan makes it a PREREQUISITE for
// Batch 4.2, which rewrote both derivations. These tests are the guard that
// rewrite had to pass.
//
// Fixtures are generated with the exact call the pre-hardening code made —
// `scryptSync(pin, salt, 64)` with no options object — so they are the bytes
// really sitting in `User.pinHash` for those accounts, not a re-statement of
// whatever `auth.ts` currently believes the legacy parameters to be.

/** A stored hash exactly as the pre-Phase-2A code wrote it. */
function legacyStoredHash(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

describe("T-04 — legacy N=2^14 PIN hashes still verify", () => {
  it("verifies a pre-hardening hash and flags it as legacy", async () => {
    const stored = legacyStoredHash("123456");
    const result = await verifyPinDetail("123456", stored);
    expect(result.valid).toBe(true);
    expect(result.legacy).toBe(true);
  });

  it("rejects a wrong PIN against a legacy hash", async () => {
    const stored = legacyStoredHash("123456");
    const result = await verifyPinDetail("654321", stored);
    expect(result.valid).toBe(false);
    expect(result.legacy).toBe(false);
  });

  it("verifies a strong hash without reporting legacy", async () => {
    const stored = await hashPin("123456");
    const result = await verifyPinDetail("123456", stored);
    expect(result.valid).toBe(true);
    expect(result.legacy).toBe(false);
  });

  it("upgrades: re-hashing a legacy PIN yields a hash that verifies as strong", async () => {
    // This is the transparent upgrade the login and unlock routes perform on
    // a successful legacy match: `legacy: true` on the way in, a fresh strong
    // hash written back, and `legacy: false` from then on.
    const legacy = legacyStoredHash("123456");
    const first = await verifyPinDetail("123456", legacy);
    expect(first).toEqual({ valid: true, legacy: true });

    const upgraded = await hashPin("123456");
    expect(upgraded).not.toBe(legacy);
    const second = await verifyPinDetail("123456", upgraded);
    expect(second).toEqual({ valid: true, legacy: false });
    // And the upgraded hash still refuses the wrong PIN.
    expect(await verifyPin("654321", upgraded)).toBe(false);
  });

  it("rejects a stored value with no salt separator, under either parameter set", async () => {
    expect(await verifyPinDetail("123456", "no-separator")).toEqual({
      valid: false,
      legacy: false,
    });
  });

  it("rejects a stored hash of the wrong length before deriving anything", async () => {
    // Guards the length check that protects `timingSafeEqual` from throwing
    // on mismatched buffers — a throw here would 500 the login route.
    const salt = randomBytes(16).toString("hex");
    const short = scryptSync("123456", salt, 32).toString("hex");
    expect(await verifyPinDetail("123456", `${salt}:${short}`)).toEqual({
      valid: false,
      legacy: false,
    });
  });
});
