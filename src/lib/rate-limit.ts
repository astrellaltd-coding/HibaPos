// Simple in-memory token-bucket rate limiter.
// Sufficient for single-process Node (POS deployment). For multi-instance,
// swap with Redis. Keys are arbitrary strings.
//
// Memory bound: entries are evicted lazily — once the map grows past
// MAX_TRACKED_KEYS, expired buckets are swept on the next rateLimit call.
// This prevents unbounded growth from one-off attacker-minted keys (e.g.
// spoofed X-Forwarded-For values) while keeping the hot path O(1) normally.

const buckets = new Map<string, { count: number; resetAt: number }>();

// Upper bound before a sweep is triggered. Generous enough that legitimate
// traffic (a few dozen users × a handful of endpoints) never sweeps.
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/** Drop buckets whose window has fully elapsed. */
function sweepExpired(now: number): void {
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

/** Consume one unit from `key` if possible. Window is `windowMs`. */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    if (buckets.size > MAX_TRACKED_KEYS) sweepExpired(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1, retryAfterSec: 0 };
  }
  if (b.count >= max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
    };
  }
  b.count += 1;
  return { ok: true, remaining: max - b.count, retryAfterSec: 0 };
}

/** Reset a key (e.g. on successful authentication). */
export function rateLimitReset(key: string): void {
  buckets.delete(key);
}