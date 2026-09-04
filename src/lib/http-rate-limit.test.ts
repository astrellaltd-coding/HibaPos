import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { clientIp } from "@/lib/http-rate-limit";
import { rateLimit, rateLimitReset } from "@/lib/rate-limit";

// Batch 4.1 — the second half of C-08.
//
// `clientIp` fed every auth rate-limit key: login, unlock, switch-user,
// profiles and approve. It read `X-Real-IP`, falling back to the first
// `X-Forwarded-For` hop, on the strength of a comment describing a Caddy
// reverse proxy that was deleted in commit `0aeea30`. With no proxy, both
// headers are whatever the caller typed, so a caller could hand themselves a
// fresh bucket on every request and no rate limit bound them at all.
//
// The fix is to disbelieve both headers unless TRUST_PROXY_HEADERS says a
// proxy is really there. Note that this costs nothing in the real
// deployment: a browser sends neither header, so every legitimate request
// already collapsed onto one key.

/** `clientIp` only ever touches `req.headers`. */
function reqWith(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

describe("clientIp — proxy headers are not believed by default", () => {
  const saved = process.env.TRUST_PROXY_HEADERS;

  beforeEach(() => {
    delete process.env.TRUST_PROXY_HEADERS;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.TRUST_PROXY_HEADERS;
    else process.env.TRUST_PROXY_HEADERS = saved;
  });

  it("ignores X-Real-IP", () => {
    expect(clientIp(reqWith({ "x-real-ip": "203.0.113.7" }))).toBe("local");
  });

  it("ignores X-Forwarded-For", () => {
    expect(
      clientIp(reqWith({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })),
    ).toBe("local");
  });

  it("returns the same value for a request with no headers at all", () => {
    expect(clientIp(reqWith({}))).toBe("local");
  });

  it("rotating either header no longer resets a rate limit", () => {
    const key = (req: NextRequest) => `login:${clientIp(req)}:caissier`;
    const first = key(reqWith({ "x-real-ip": "198.51.100.1" }));
    rateLimitReset(first);

    const max = 3;
    for (let i = 0; i < max; i++) {
      // A different forged IP every time — the pre-fix bypass.
      const req = reqWith({
        "x-real-ip": `198.51.100.${i + 1}`,
        "x-forwarded-for": `192.0.2.${i + 1}`,
      });
      expect(rateLimit(key(req), max, 10_000).ok).toBe(true);
    }

    const nextReq = reqWith({ "x-real-ip": "198.51.100.99" });
    const blocked = rateLimit(key(nextReq), max, 10_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);

    rateLimitReset(first);
  });

  it("honours the headers again when a trusted proxy is declared", () => {
    process.env.TRUST_PROXY_HEADERS = "1";
    expect(clientIp(reqWith({ "x-real-ip": "203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
    // X-Real-IP wins over XFF, and XFF falls back to its first hop.
    expect(
      clientIp(
        reqWith({
          "x-real-ip": "203.0.113.7",
          "x-forwarded-for": "198.51.100.4",
        }),
      ),
    ).toBe("203.0.113.7");
    expect(
      clientIp(reqWith({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" })),
    ).toBe("198.51.100.4");
    expect(clientIp(reqWith({}))).toBe("unknown");
  });

  it("treats anything but an explicit opt-in as off", () => {
    for (const raw of ["0", "false", "no", "", "  ", "maybe"]) {
      process.env.TRUST_PROXY_HEADERS = raw;
      expect(clientIp(reqWith({ "x-real-ip": "203.0.113.7" }))).toBe("local");
    }
  });
});
