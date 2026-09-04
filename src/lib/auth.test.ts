import { describe, it, expect } from "vitest";
import {
  hashPin,
  verifyPin,
  isPublishedDefaultPin,
  PUBLISHED_DEFAULT_PINS,
} from "@/lib/auth";

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

// C-17, Batch 4.5 — the PINs this repository publishes about itself must
// never be installable as a live credential. `scripts/seed-users.ts` is the
// caller; the denylist lives here because `bun test src` cannot reach
// `scripts/`, and because that batch's validation requires neither value to
// appear anywhere under `scripts/`.
describe("published default PINs", () => {
  it("names both values the repository publishes", () => {
    // prisma/seed.ts's SEED_ADMIN_PIN / SEED_MANAGER_PIN fallbacks, and the
    // two PINs scripts/seed-users.ts used to hardcode and print.
    expect(PUBLISHED_DEFAULT_PINS).toEqual(["123456", "111111"]);
  });

  it("refuses each of them", () => {
    for (const pin of PUBLISHED_DEFAULT_PINS) {
      expect(isPublishedDefaultPin(pin)).toBe(true);
    }
  });

  it("admits a PIN that is not published", () => {
    expect(isPublishedDefaultPin("481902")).toBe(false);
    // Near-misses must pass: the rule is an exact denylist, not a
    // weak-PIN policy, and inventing one here would be a different decision.
    expect(isPublishedDefaultPin("123457")).toBe(false);
    expect(isPublishedDefaultPin("11111")).toBe(false);
  });
});
