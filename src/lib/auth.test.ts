import { describe, it, expect } from "vitest";
import { hashPin, verifyPin } from "@/lib/auth";

describe("auth", () => {
  it("hashes and verifies PIN", () => {
    const hash = hashPin("123456");
    expect(verifyPin("123456", hash)).toBe(true);
    expect(verifyPin("000000", hash)).toBe(false);
  });

  it("produces different hashes for same PIN (salted)", () => {
    const h1 = hashPin("123456");
    const h2 = hashPin("123456");
    expect(h1).not.toBe(h2);
  });

  it("rejects malformed stored hash", () => {
    expect(verifyPin("123456", "bad-hash")).toBe(false);
  });
});
