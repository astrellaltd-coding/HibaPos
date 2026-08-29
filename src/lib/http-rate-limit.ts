// HTTP-friendly rate-limit wrapper for Next.js route handlers.
import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

/** Extract a best-effort client IP for rate-limit keying. */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
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