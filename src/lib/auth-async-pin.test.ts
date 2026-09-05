import { describe, it, expect } from "vitest";
import { hashPin, verifyPinDetail } from "@/lib/auth";

// C-09, Batch 4.2 — scrypt must not run on the request thread.
//
// `hashPin` and `verifyPinDetail` derive at N=2^17, r=8, p=1: correct
// parameters for a 6-digit PIN, and expensive on purpose. Run synchronously
// they froze the single process serving the till for the whole derivation —
// twice for a wrong PIN (strong params, then the legacy fallback) and once
// per manager on `/api/auth/approve` (DELETED in Batch 7.2 — see `api/auth/step-up/route.ts`), so five managers and one fumbled PIN
// stopped the POS for about two seconds. Orders, printing and every other
// request waited.
//
// The assertion is behavioural, not structural: run a timer alongside a real
// derivation and count how often it fires. A blocked loop cannot deliver
// them. Both bounds are stated relative to the measured derivation time so
// the test does not encode this machine's speed.

/** Count timer ticks and the longest gap between them while `work` runs. */
async function probeEventLoop<T>(work: () => Promise<T>) {
  let last = performance.now();
  let ticks = 0;
  let maxGapMs = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    ticks += 1;
    maxGapMs = Math.max(maxGapMs, now - last);
    last = now;
  }, 5);
  const startedAt = performance.now();
  try {
    const value = await work();
    return { value, elapsedMs: performance.now() - startedAt, ticks, maxGapMs };
  } finally {
    clearInterval(timer);
  }
}

describe("C-09 — PIN derivation does not block the event loop", () => {
  it("keeps timers running through a failed verify (two derivations)", async () => {
    const stored = await hashPin("123456"); // also warms the allocator
    const probe = await probeEventLoop(() => verifyPinDetail("654321", stored));

    expect(probe.value).toEqual({ valid: false, legacy: false });
    // Sanity: the derivation really did take measurable time, so the
    // assertions below are about a blocked loop and not about a no-op.
    expect(probe.elapsedMs).toBeGreaterThan(30);
    // A 5 ms timer should fire ~elapsed/5 times. Demand a fifth of that —
    // still an order of magnitude more than the one or two ticks a blocked
    // loop delivers after it unfreezes.
    expect(probe.ticks).toBeGreaterThan(probe.elapsedMs / 25);
    // And no single freeze covering the derivation.
    expect(probe.maxGapMs).toBeLessThan(probe.elapsedMs * 0.6);
  });

  it("keeps timers running through hashPin", async () => {
    await hashPin("000000"); // warm-up
    const probe = await probeEventLoop(() => hashPin("123456"));

    expect(probe.value).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(probe.elapsedMs).toBeGreaterThan(30);
    expect(probe.ticks).toBeGreaterThan(probe.elapsedMs / 25);
    expect(probe.maxGapMs).toBeLessThan(probe.elapsedMs * 0.6);
  });
});
