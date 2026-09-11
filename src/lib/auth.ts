// Auth utilities: PIN hashing (scrypt) and signed session cookies.
// Server-only module.

import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "crypto";
import { createHmac } from "crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { runPinDerivation } from "@/lib/pin-hash-queue";

const SESSION_COOKIE = "hibapos_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

// SESSION_SECRET — the environment first, then the install's own store.
//
// CHANGED 2026-09-11. This was `process.env.SESSION_SECRET` with a
// module-level throw and the comment « No fallback — the app refuses to start
// without it ». That was right for a hand-deployed install, where a missing
// secret meant somebody had skipped a step. The app now ships as an installer,
// and there a missing secret means nobody has run yet: refusing to start is
// refusing to be installed.
//
// **The environment still wins**, so the existing install — which holds this
// in `.env` — reaches exactly the same value by exactly the same path, and
// `scripts/rotate-secrets.ts` remains how it is rotated. Only an install with
// no value at all now makes one, into `<dataDir>/db/secrets.json`.
//
// Resolved HERE rather than in `instrumentation.ts`'s `register()`: that hook
// is async and this is a module-level constant, so a route module imported
// during startup could reach this line first. The file's own zod-locale
// comment records that ordering problem.
//
// BOTH GUARDS SURVIVE: the app still cannot run without a usable secret, and
// still refuses one under 32 characters. `resolveSecret` raises the second,
// naming the variable and never the value.
import { resolveSecret } from "@/lib/services/secret-store";

const SESSION_SECRET = resolveSecret("SESSION_SECRET").value;
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET could not be resolved or generated.");
}
if (SESSION_SECRET.length < 32) {
  throw new Error(
    "SESSION_SECRET must be at least 32 characters long. Generate with: openssl rand -hex 32",
  );
}

// Scrypt parameters — OWASP 2024 recommended (N=2^17, r=8, p=1). The default
// (N=2^14) is too weak for a 6-digit PIN keyspace (10^6); with N=2^17 an
// offline brute-force of the full PIN space from a stolen DB takes hours
// instead of seconds. maxmem must be raised to accommodate the larger N.
const SCRYPT_OPTS = { N: 1 << 17, r: 8, p: 1, maxmem: 1 << 30 } as const;

// The pre-Phase-2A parameters, written out rather than left to Node's
// defaults. `scryptSync(pin, salt, 64)` used N=16384, r=8, p=1 — these exact
// numbers — and hashes created that way are still in the database. Spelling
// them out means a future change to the library defaults cannot quietly lock
// those users out; `auth-legacy-pin.test.ts` (T-04) generates its fixtures
// with the old default-argument form and asserts they still verify here.
const LEGACY_SCRYPT_OPTS = { N: 1 << 14, r: 8, p: 1 } as const;

// ---------------------------------------------------------------------------
// PIN hashing
// ---------------------------------------------------------------------------

/** One scrypt derivation, off the event loop and inside the concurrency bound.
 *
 *  C-09, Batch 4.2: these calls were `scryptSync`, which froze the single
 *  Node process serving the till for ~390 ms each — twice per wrong PIN
 *  (strong params, then the legacy fallback) and once per manager on
 *  `/api/auth/approve` (DELETED in Batch 7.2 — see `api/auth/step-up/route.ts`). The work is identical; only the thread changed.
 *  `runPinDerivation` throws `ScryptBusyError` when too many are already
 *  queued, which the auth routes answer with 503 rather than piling on. */
function derive(
  pin: string,
  salt: string,
  opts: typeof SCRYPT_OPTS | typeof LEGACY_SCRYPT_OPTS,
): Promise<Buffer> {
  return runPinDerivation(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        scrypt(pin, salt, 64, opts, (err, key) =>
          err ? reject(err) : resolve(key),
        );
      }),
  );
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await derive(pin, salt, SCRYPT_OPTS)).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * The PINs this repository publishes about itself — C-17, Batch 4.5.
 *
 * They are `prisma/seed.ts`'s fallbacks, they were `scripts/seed-users.ts`'s
 * hardcoded values until this batch, and they appear in commit `5ef7dc4`'s
 * message and in the remediation record. Anyone holding a copy of this
 * repository knows both numbers, so neither may ever be installed as a live
 * credential.
 *
 * WHY THIS IS A CHECK IN CODE AND NOT A LINE IN A README. When the operator
 * changed both live PINs on 2026-09-04, the first attempt set the
 * super-administrator to one of these two values. It was caught by reading
 * the repository, not by the application. A replacement PIN has to be checked
 * against what the repository publishes, and the only reliable place to do
 * that is where the PIN is set.
 *
 * It lives here rather than in `scripts/` for two reasons: `bun test src`
 * cannot reach `scripts/`, and Batch 4.5's own validation asks that neither
 * value appear anywhere under `scripts/` — a denylist sitting there would
 * satisfy the intent and fail the check.
 */
export const PUBLISHED_DEFAULT_PINS: readonly string[] = ["123456", "111111"];

/** True when `pin` is one of the values this repository publishes. */
export function isPublishedDefaultPin(pin: string): boolean {
  return PUBLISHED_DEFAULT_PINS.includes(pin);
}

export type PinVerifyResult = {
  valid: boolean;
  /** true = matched under the LEGACY params (pre-Phase-2A N=2^14) — the
   *  stored hash should be transparently re-hashed with the strong params
   *  on next successful login (callers with DB access should upgrade). */
  legacy: boolean;
};

/** Verify a PIN against a stored hash.
 *  Tries the current strong scrypt params (N=2^17) first, then falls back
 *  to the legacy params (N=2^14 default — hashes created before the
 *  Phase 2A hardening). Returns boolean for simple call sites. */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  return (await verifyPinDetail(pin, stored)).valid;
}

/** Detailed verify — returns whether the match came from legacy params so
 *  login/unlock/switch-user routes can trigger a transparent re-hash. */
export async function verifyPinDetail(
  pin: string,
  stored: string,
): Promise<PinVerifyResult> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return { valid: false, legacy: false };
  const hashBuf = Buffer.from(hash, "hex");
  if (hashBuf.length !== 64) return { valid: false, legacy: false };

  // Current strong params (N=2^17, r=8, p=1).
  const strongTest = await derive(pin, salt, SCRYPT_OPTS);
  if (timingSafeEqual(hashBuf, strongTest)) {
    return { valid: true, legacy: false };
  }

  // Legacy fallback (N=2^14 — pre-Phase-2A hashes).
  // Without this, every user created before the scrypt hardening is
  // permanently locked out (their stored hash can never match the new params).
  const legacyTest = await derive(pin, salt, LEGACY_SCRYPT_OPTS);
  if (hashBuf.length === legacyTest.length && timingSafeEqual(hashBuf, legacyTest)) {
    return { valid: true, legacy: true };
  }

  return { valid: false, legacy: false };
}

// ---------------------------------------------------------------------------
// Signed session cookie + server-side session rows (revocation)
// ---------------------------------------------------------------------------

export type SessionPayload = {
  sessionId: string; // links to the Session table row (per-session revocation)
  userId: string;
  username: string;
  role: string;
  exp: number;
};

/** The user snapshot fetched fresh in getSession (NOT stored in the cookie —
 *  attached to the in-memory return only so withAuth/withAuthParams skip
 *  the second db.user.findUnique they previously did per request). */
export type AuthUser = {
  id: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
};

export type SessionWithUser = SessionPayload & { user: AuthUser };

function sign(data: string): string {
  return createHmac("sha256", SESSION_SECRET!).update(data).digest("hex");
}

function encodeSession(payload: SessionPayload): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = sign(b64);
  return `${b64}.${sig}`;
}

function decodeSession(token: string): SessionPayload | null {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const expected = sign(b64);
  if (sig.length !== expected.length) return null;
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (!timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const json = Buffer.from(b64, "base64url").toString("utf8");
    const payload = JSON.parse(json) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(payload: Omit<SessionPayload, "exp" | "sessionId">): Promise<void> {
  const sessionId = randomUUID();
  const exp = Date.now() + SESSION_TTL_MS;
  const token = encodeSession({ ...payload, sessionId, exp });
  const store = await cookies();
  // M-28 (Batch 4.3): this read `store.get("user-agent")` — the COOKIE jar,
  // which has no such cookie — so `Session.device` was null on every row ever
  // written and the column told an operator nothing about where a session came
  // from. The user agent is a request HEADER. Best-effort: outside a request
  // scope `headers()` throws, and a missing device hint must never stop a
  // login.
  let deviceHint: string | null = null;
  try {
    const requestHeaders = await headers();
    deviceHint = requestHeaders.get("user-agent")?.slice(0, 120) ?? null;
  } catch {
    deviceHint = null;
  }
  // Cookie `secure` flag: default SECURE (safe for production HTTPS). Only
  // when APP_URL explicitly declares plain http:// (Tauri webview, Caddy :81
  // without TLS, dev localhost) do we drop the flag — otherwise the cookie
  // would be silently rejected and login would appear broken. An unset
  // APP_URL keeps secure=true (fail-safe for prod).
  const appUrl = process.env.APP_URL ?? "";
  const isPlainHttp = appUrl.startsWith("http://");
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: !isPlainHttp,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  // Persist the server-side session row so it can be revoked individually
  // (logout, admin force-logout, PIN change). The signed cookie alone was
  // valid for its full 12h TTL with no per-session revocation before this.
  await db.session.create({
    data: {
      id: sessionId,
      userId: payload.userId,
      expiresAt: new Date(exp),
      device: deviceHint,
    },
  });
}

/**
 * How stale `Session.lastActivityAt` must be before the tracker writes again
 * (L-86 / R4.6). One minute: fine enough to answer « when was this till last
 * used » to the minute, coarse enough that a busy service does one write a
 * minute instead of one per request.
 */
export const ACTIVITY_TOUCH_INTERVAL_MS = 60_000;

export async function getSession(): Promise<SessionWithUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = decodeSession(token);
  if (!payload) return null;
  // Check the server-side session row exists and is not expired — this is
  // the revocation point: deleting the row (logout / revokeAllUserSessions)
  // invalidates the cookie even before its 12h expiry.
  const sessionRow = await db.session.findUnique({
    where: { id: payload.sessionId },
    // L-86 (R4.6): `lastActivityAt` rides along in a query that already runs,
    // so knowing whether the tracker needs to write costs nothing.
    select: { expiresAt: true, lastActivityAt: true },
  });
  if (!sessionRow) return null; // revoked
  if (sessionRow.expiresAt < new Date()) return null; // expired
  // Fetch the user ONCE here so withAuth/withAuthParams don't re-query on
  // every authed request (was a double DB lookup — ~2x user queries per request).
  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, username: true, name: true, role: true, active: true, lockedUntil: true },
  });
  if (!user || !user.active) return null;
  if (user.lockedUntil && user.lockedUntil > new Date()) return null;
  // Attach the user snapshot to the return so callers can use it directly
  // (NOT stored in the cookie — the signed payload stays minimal).
  const sessionWithUser: SessionWithUser = {
    ...payload,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      active: user.active,
    },
  };
  // Touch lastActivityAt (sliding activity tracker). Best-effort, non-blocking.
  //
  // L-86 (R4.6) — it now writes AT MOST ONCE PER MINUTE per session, instead of
  // once per authenticated request.
  //
  // The write had no reader — `expiresAt` governs expiry, and nothing anywhere
  // consults `lastActivityAt` — so the honest options were to delete it or to
  // make it cheap. Deleting it would throw away the only record of when a till
  // was last used, which is the thing an idle-timeout policy would need if one
  // is ever wanted. Making it cheap costs nothing: the row is ALREADY fetched
  // four lines above, so the staleness check is free.
  //
  // Why it mattered. SQLite takes a single write lock for the whole database.
  // A fire-and-forget UPDATE on every authenticated request contends with the
  // request's own real work, and that contention is what produced the « Socket
  // timeout » blocks — 7 to 8 in a clean test run, all from this one line, and
  // varying run to run precisely because they depend on contention. On the till
  // it is a write per request for a value nobody reads.
  //
  // `updateMany` rather than `update` is L-71's fix and stays: `update` throws
  // when no row matches and Prisma logs that from its engine before the
  // `.catch()` can swallow it. The row can genuinely be gone — `log-retention
  // .ts` deletes expired sessions, so a request in flight when that runs, or
  // one racing a logout, arrives here with a valid token and no row.
  const sinceLastTouch = Date.now() - sessionRow.lastActivityAt.getTime();
  if (sinceLastTouch >= ACTIVITY_TOUCH_INTERVAL_MS) {
    db.session
      .updateMany({ where: { id: payload.sessionId }, data: { lastActivityAt: new Date() } })
      .catch(() => {});
  }
  return sessionWithUser;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const payload = decodeSession(token);
    if (payload) {
      await db.session.deleteMany({ where: { id: payload.sessionId } }).catch(() => {});
    }
  }
  store.delete(SESSION_COOKIE);
}

/** Revoke every active session for a user (used on deactivation / PIN reset). */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId, expiresAt: { gt: new Date() } } }).catch(() => {});
}

export { SESSION_COOKIE };
