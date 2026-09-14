import { describe, it, expect } from "vitest";
import { randomBytes, scryptSync } from "crypto";
import { hashPin, verifyPin, verifyPinDetail, isStampedPinHash } from "@/lib/auth";

// L-174 — a stored PIN hash records the parameters it was made with.
//
// THE FINDING: a stored hash was `salt:hash` and nothing else, so **nothing
// could tell a legacy `N=2^14` hash from a strong `N=2^17` one.** Three
// consequences, all permanent:
//
//   1. the legacy fallback could never be retired — nothing could establish
//      that no legacy hash remained;
//   2. a legacy hash is upgraded only on a SUCCESSFUL login, so an account
//      nobody uses keeps its weak hash for ever;
//   3. **every failed PIN cost two derivations** on the single process serving
//      the till, because a miss under the strong parameters is indistinguishable
//      from « this is a legacy hash » and has to be retried.
//
// **THE THIRD IS TRUE AND THE AUDIT'S FIGURE FOR IT IS NOT.** L-174 says
// « ~780 ms », which assumes both derivations run at N=2^17. The second is the
// LEGACY one at N=2^14, eight times cheaper — measured here, 252 ms and 30 ms,
// so a failed PIN cost ≈ 282 ms and now costs ≈ 252 ms. An 11 % saving, not a
// halving. The two consequences that actually justify this work are the first
// two, and the correction is recorded in `docs/audit/FINDINGS.md` rather than
// left to be re-derived.
//
// The live hashes are almost certainly strong — both PINs were reset
// 2026-09-04, after the hardening. The finding was that the system **could not
// demonstrate it**. `isStampedPinHash` is how it demonstrates it now, and this
// file is what keeps that answer honest.
//
// ── WHAT IS NOT BEING CLAIMED ───────────────────────────────────────────────
// Nothing here is a statement about cryptographic strength, and nothing rewrote
// the database. This is a migration WINDOW: an unstamped hash verifies exactly
// as it did, and is re-stamped by the transparent upgrade the login and unlock
// routes already perform. The window closes when every row is stamped — a thing
// that can now be checked, and could not be before.

/** A stored hash exactly as the PRE-HARDENING code wrote it (N=2^14). */
function legacyStoredHash(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/** A stored hash as the code wrote it BETWEEN the hardening and L-174: strong
 *  parameters, no stamp. The case that made the fallback un-retirable. */
function unstampedStrongHash(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 64, { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 })
    .toString("hex");
  return `${salt}:${hash}`;
}

describe("L-174 — the stamp", () => {
  it("writes the parameters into the stored hash", async () => {
    const stored = await hashPin("123456");
    expect(stored).toMatch(/^scrypt:131072:8:1:[0-9a-f]{32}:[0-9a-f]{128}$/);
    // 131072 is 2^17 — the OWASP 2024 recommendation this project uses, and
    // the number the hash now carries rather than leaves to be inferred.
    expect(stored.split(":")[1]).toBe(String(1 << 17));
  });

  it("recognises what is stamped and what is not", async () => {
    expect(isStampedPinHash(await hashPin("123456"))).toBe(true);
    expect(isStampedPinHash(legacyStoredHash("123456"))).toBe(false);
    expect(isStampedPinHash(unstampedStrongHash("123456"))).toBe(false);
    // The question the finding is about: while any row answers false, the
    // fallback has to stay.
    expect(isStampedPinHash("nonsense")).toBe(false);
  });

  it("verifies a stamped hash and does not ask for a re-hash", async () => {
    const stored = await hashPin("123456");
    expect(await verifyPinDetail("123456", stored)).toEqual({ valid: true, legacy: false });
    expect(await verifyPin("654321", stored)).toBe(false);
  });
});

describe("L-174 — the migration window", () => {
  it("still verifies a pre-hardening hash, and asks for the upgrade", async () => {
    // T-04's property, unchanged. Removing the fallback locks out every
    // account created before the hardening.
    const stored = legacyStoredHash("123456");
    expect(await verifyPinDetail("123456", stored)).toEqual({ valid: true, legacy: true });
  });

  it("asks for a re-hash of a STRONG hash that has no stamp", async () => {
    // The case that keeps the window open, and the one the old code got
    // wrong-by-omission: it returned `legacy: false` here, so a
    // strong-but-unstamped hash was never replaced and the fallback could never
    // be retired. A successful login is the one moment the software holds the
    // plaintext PIN and can restamp it.
    const stored = unstampedStrongHash("123456");
    const result = await verifyPinDetail("123456", stored);
    expect(result.valid, "a strong unstamped hash stopped verifying").toBe(true);
    expect(result.legacy, "a strong unstamped hash is not being restamped").toBe(true);
  });

  it("closes the window: the upgrade produces a stamped hash", async () => {
    // What the login and unlock routes do with `legacy: true`.
    for (const before of [legacyStoredHash("123456"), unstampedStrongHash("123456")]) {
      expect(isStampedPinHash(before)).toBe(false);
      const upgraded = await hashPin("123456");
      expect(isStampedPinHash(upgraded)).toBe(true);
      expect(await verifyPinDetail("123456", upgraded)).toEqual({ valid: true, legacy: false });
    }
  });

  it("is wired into both routes that hold a plaintext PIN", async () => {
    // `legacy` is only useful if something acts on it. Two routes do, and they
    // are the only two that ever see the PIN in the clear.
    const { readFileSync } = await import("fs");
    const path = (await import("path")).default;
    for (const rel of ["src/app/api/auth/login/route.ts", "src/app/api/auth/unlock/route.ts"]) {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src, `${rel} stopped upgrading the hash`).toContain("pinResult.legacy");
      expect(src, `${rel} no longer re-hashes`).toContain("hashPin(pin)");
    }
  });
});

describe("L-174 — a wrong PIN against a stamped hash costs ONE derivation", () => {
  it("skips the second derivation, and the saving is one LEGACY derivation", async () => {
    // ── THE AUDIT OVERSTATED THIS, AND THE MEASUREMENT IS WHY ────────────────
    // L-174 says « every failed PIN costs two derivations (~780 ms) ». Two
    // derivations, yes. **~780 ms, no** — that assumes both run at N=2^17. The
    // second is the LEGACY one at N=2^14, which is eight times cheaper.
    // Measured on this machine: **N=2^17 ≈ 252 ms, N=2^14 ≈ 30 ms**, so a
    // failed PIN against an unstamped hash costs ≈ 282 ms and against a stamped
    // one ≈ 252 ms. The saving is real and it is about 11 %, not a halving.
    //
    // Recorded rather than quietly fixed: a finding whose cost is overstated
    // gets prioritised wrongly, and the other two consequences — a fallback
    // that can never be retired, and an unused account keeping a weak hash for
    // ever — are the ones that actually justify the work.
    //
    // So the bound is derived from a legacy derivation MEASURED IN THIS RUN,
    // not from a ratio. A fixed multiple would be a flaky assertion on whatever
    // machine the suite runs on.
    const reference = (() => {
      const salt = randomBytes(16).toString("hex");
      scryptSync("warm", salt, 64, { N: 1 << 14, r: 8, p: 1 });
      const t = performance.now();
      scryptSync("123456", salt, 64, { N: 1 << 14, r: 8, p: 1 });
      return performance.now() - t;
    })();

    const stamped = await hashPin("123456");
    const unstamped = unstampedStrongHash("123456");
    await verifyPin("000000", stamped);
    await verifyPin("000000", unstamped);

    // Best of three each way: one strong derivation dominates both numbers, so
    // a single sample is mostly noise about the machine.
    const best = async (h: string) => {
      let ms = Infinity;
      for (let i = 0; i < 3; i++) {
        const t = performance.now();
        await verifyPin("654321", h);
        ms = Math.min(ms, performance.now() - t);
      }
      return ms;
    };
    const stampedMs = await best(stamped);
    const unstampedMs = await best(unstamped);

    expect(
      unstampedMs - stampedMs,
      `a wrong PIN cost ${unstampedMs.toFixed(0)} ms unstamped and ` +
        `${stampedMs.toFixed(0)} ms stamped; one legacy derivation measured ` +
        `${reference.toFixed(0)} ms here. The extra derivation looks to be gone from the ` +
        `UNSTAMPED path — which would mean the fallback was dropped and every ` +
        `pre-hardening account is locked out.`,
    ).toBeGreaterThan(reference * 0.4);
  });
});

describe("L-174 — parameters read back out of a database are bounded", () => {
  // A stored hash is a value in a database, and this code is what stands
  // between a tampered row and the till. `N` sizes an allocation of
  // `128 · N · r · p` bytes, so a row saying `N = 2^40` is a way to ask this
  // process for a terabyte. Refusing fails CLOSED — a login that does not
  // succeed, never a login that succeeds wrongly.
  const salt = randomBytes(16).toString("hex");
  const hash = "a".repeat(128);

  it("refuses an N beyond the ceiling rather than allocating it", async () => {
    const absurd = `scrypt:${2 ** 30}:8:1:${salt}:${hash}`;
    expect(await verifyPinDetail("123456", absurd)).toEqual({ valid: false, legacy: false });
  });

  it("refuses an N that is not a power of two", async () => {
    // scrypt requires it, and the failure mode otherwise is a throw from the
    // library inside a login route — a 500 where a refusal belongs.
    expect(await verifyPinDetail("123456", `scrypt:100000:8:1:${salt}:${hash}`)).toEqual({
      valid: false,
      legacy: false,
    });
  });

  it("refuses nonsense, negative and empty parameters", async () => {
    for (const bad of [
      `scrypt:abc:8:1:${salt}:${hash}`,
      `scrypt:-131072:8:1:${salt}:${hash}`,
      `scrypt:131072:0:1:${salt}:${hash}`,
      `scrypt:131072:8:0:${salt}:${hash}`,
      `scrypt:131072:8:1::${hash}`,
      `scrypt:131072:8:1:${salt}:`,
    ]) {
      expect(await verifyPinDetail("123456", bad), bad.slice(0, 30)).toEqual({
        valid: false,
        legacy: false,
      });
    }
  });

  it("refuses a stamp it does not recognise, and anything of the wrong shape", async () => {
    for (const bad of [
      `argon2:131072:8:1:${salt}:${hash}`,
      `scrypt:131072:8:${salt}:${hash}`, // five fields
      `scrypt:131072:8:1:1:${salt}:${hash}`, // seven
      "no-separator",
      "",
    ]) {
      expect(await verifyPinDetail("123456", bad), JSON.stringify(bad.slice(0, 30))).toEqual({
        valid: false,
        legacy: false,
      });
    }
  });

  it("still refuses a stored hash of the wrong length, stamped or not", async () => {
    // Guards the check that protects `timingSafeEqual` from throwing on
    // mismatched buffers — a throw there is a 500 on the login route.
    const s = randomBytes(16).toString("hex");
    const short = scryptSync("123456", s, 32).toString("hex");
    expect(await verifyPinDetail("123456", `${s}:${short}`)).toEqual({
      valid: false,
      legacy: false,
    });
    expect(await verifyPinDetail("123456", `scrypt:131072:8:1:${s}:${short}`)).toEqual({
      valid: false,
      legacy: false,
    });
  });
});
