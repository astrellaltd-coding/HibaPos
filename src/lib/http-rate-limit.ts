// HTTP-friendly rate-limit wrapper for Next.js route handlers.
import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

/** Whether the proxy headers may be believed.
 *
 * `X-Real-IP` and `X-Forwarded-For` are set by the *client* unless a reverse
 * proxy in front of the app overwrites them on every request. The Caddy
 * deployment this module was written for was deleted in commit `0aeea30`
 * and no proxy exists, so believing them handed any authenticated caller a
 * fresh rate-limit bucket per request — the brute-force bypass in C-08.
 *
 * Default OFF. Set `TRUST_PROXY_HEADERS=1` only when a proxy is actually
 * deployed AND it overwrites both headers. Read per call, not at import, so
 * the setting is testable and a restart is the only thing needed to change
 * it.
 */
function trustProxyHeaders(): boolean {
  const raw = process.env.TRUST_PROXY_HEADERS?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Extract a client IP for rate-limit keying.
 *
 * With no trusted proxy every request keys as `"local"`: a single shared
 * bucket per key suffix, which nobody can escape by rotating a header. That
 * is not a loss of precision in the real deployment — a browser sends
 * neither header, so every legitimate request already keyed as `"unknown"`
 * before this change. Only a caller who forged the header got its own
 * bucket, which is precisely what had to stop (C-08, Batch 4.1).
 */
export function clientIp(req: NextRequest): string {
  if (!trustProxyHeaders()) return "local";
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