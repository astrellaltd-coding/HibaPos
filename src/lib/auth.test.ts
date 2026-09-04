import { describe, it, expect } from "vitest";
import { hashPin, verifyPin } from "@/lib/auth";

// `hashPin` / `verifyPin` became async in Batch 4.2 (C-09) — the derivation
// moved off the event loop. The assertions are unchanged.
describe("auth", () => {
  it("hashes and verifies PIN", async () => {
    const hash = await hashPin("123456");
    expect(await verifyPin("123456", hash)).toBe(true);
    expect(await verifyPin("000000", hash)).toBe(false);
  });

  it("produces different hashes for same PIN (salted)", async () => {
    const h1 = await hashPin("123456");
    const h2 = await hashPin("123456");
    expect(h1).not.toBe(h2);
  });

  it("rejects malformed stored hash", async () => {
    expect(await verifyPin("123456", "bad-hash")).toBe(false);
  });
});
