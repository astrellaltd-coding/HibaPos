// HTTP-friendly rate-limit wrapper for Next.js route handlers.
// After L-07/L-29 removed `limitOr429`, this module holds ONE function:
// `clientIp`. `NextResponse` and `rateLimit` went with the helper — each
// route builds its own 429 from `rateLimit` directly, which is what made
// the helper dead in the first place.
import { type NextRequest } from "next/server";

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

// L-07 and L-29 (Batch 7.2) — the same finding, recorded twice.
//
// `limitOr429` stood here: a helper meant to standardise the 429 response,
// called from NOWHERE. Every route reaches for `clientIp` + `rateLimit`
// directly and builds its own refusal.
//
// It is DELETED rather than adopted, and L-29 named the reason: it embedded
// the key shape `<ip>:<parts>`, whose IP component was the C-08 bypass. It
// inherited Batch 4.1's fix because it called `clientIp`, so there was no live
// risk — the hazard was a future route adopting it and quietly reintroducing
// an IP-keyed limit. Adopting it everywhere was the other option in the row;
// that is a change to 20-odd routes' refusal behaviour, which is not a
// dead-code batch's business.