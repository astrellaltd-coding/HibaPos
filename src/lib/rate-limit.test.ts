import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, rateLimitReset } from "@/lib/rate-limit";

describe("rate-limit — token bucket", () => {
  beforeEach(() => {
    rateLimitReset("test-key-1");
    rateLimitReset("test-key-2");
  });

  it("allows up to max within window", () => {
    const r1 = rateLimit("test-key-1", 3, 10_000);
    expect(r1.ok).toBe(true);
    expect(r1.remaining).toBe(2);
    const r2 = rateLimit("test-key-1", 3, 10_000);
    expect(r2.ok).toBe(true);
    expect(r2.remaining).toBe(1);
    const r3 = rateLimit("test-key-1", 3, 10_000);
    expect(r3.ok).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks the (max+1)th call within the window", () => {
    rateLimit("test-key-2", 2, 10_000);
    rateLimit("test-key-2", 2, 10_000);
    const r = rateLimit("test-key-2", 2, 10_000);
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("isolates keys (one key getting blocked doesn't affect another)", () => {
    rateLimit("test-key-isolated", 1, 10_000);
    const blocked = rateLimit("test-key-isolated", 1, 10_000);
    expect(blocked.ok).toBe(false);

    // Different key still works.
    const fresh = rateLimit("test-key-other", 1, 10_000);
    expect(fresh.ok).toBe(true);
  });

  it("rateLimitReset clears a key's bucket", () => {
    rateLimit("test-key-1", 1, 10_000);
    rateLimit("test-key-1", 1, 10_000); // blocked
    rateLimitReset("test-key-1");
    const fresh = rateLimit("test-key-1", 1, 10_000);
    expect(fresh.ok).toBe(true);
  });
});