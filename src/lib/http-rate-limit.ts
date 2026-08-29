// HTTP-friendly rate-limit wrapper for Next.js route handlers.
import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

/** Extract a best-effort client IP for rate-limit keying.
 *
 *  Prefer `X-Real-IP` (set by the Caddy reverse proxy in the approved
 * serving model: `bun run start` on localhost:3000 behind Caddy, which
 * overwrites XFF with the real client IP). Fall back to the first
 * `X-Forwarded-For` hop only when X-Real-IP is absent (e.g. direct
 * exposure without a proxy — not the intended deployment but kept as a
 * best-effort fallback). Blindly trusting the first XFF value would let
 * an attacker rotate IPs to bypass rate limits if the app were ever
 * exposed without Caddy.
 */
export function clientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/**
 * Apply a per-IP rate limit. Returns a 429 NextResponse if throttled,
 * otherwise `null` — caller proceeds.
 */
export function limitOr429(
  req: NextRequest,
  keyParts: string[],
  max: number,
  windowMs: number,
): null | NextResponse {
  const ip = clientIp(req);
  const key = `${ip}:${keyParts.join(":")}`;
  const res = rateLimit(key, max, windowMs);
  if (!res.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez plus tard." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, res.retryAfterSec)) },
      },
    );
  }
  return null;
}