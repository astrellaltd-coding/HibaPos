import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPin, verifyPinDetail, createSession } from "@/lib/auth";
import { isScryptBusyError } from "@/lib/pin-hash-queue";
import { scryptBusyResponse, secretMisconfiguredResponse } from "@/lib/api-handler";
import { isSecretMisconfigured } from "@/lib/services/secret-store";
import { loginSchema } from "@/lib/validation";
import { audit } from "@/lib/services/audit";
import { clientIp } from "@/lib/http-rate-limit";
import { rateLimit } from "@/lib/rate-limit";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// Per-IP+username throttle: 10 attempts/min.
const RL_MAX = 10;
const RL_WINDOW_MS = 60_000;

/**
 * L-30 (Batch 7.4b) — a SECOND budget, for unknown usernames only.
 *
 * THE FINDING. The throttle above is keyed `login:<ip>:<username>`, and since
 * Batch 4.1 correctly stopped believing proxy headers, `<ip>` is the constant
 * `"local"`. So each distinct username is its own bucket and **nothing caps
 * how many buckets a caller can mint**. Every unknown username burns one
 * `hashPin` by design, and those derivations pass through the bounded queue
 * (2 concurrent + 32 queued). Measured on a scratch copy: **60 simultaneous
 * logins with 60 unknown usernames → 34 served, 26 refused 503** — 34 being
 * exactly the queue's depth — and a legitimate login arriving in that window
 * would have been among the refused.
 *
 * WHAT THIS FIX MUST NOT DO, and the row says so: **it must not remove the
 * burn.** Batch 4.2 put that derivation inside the bound deliberately, and the
 * burn itself flattens the timing signal that would otherwise enumerate
 * accounts. Removing it "fixes" a DoS by restoring an enumeration oracle.
 *
 * WHAT IT DOES INSTEAD. One extra budget on the unknown-user path, keyed
 * WITHOUT the username, so it cannot be multiplied by inventing names. Past
 * it, the response is byte-for-byte the one an unknown username already gets
 * — same status, same message — and only the scrypt burn is skipped. The
 * enumeration oracle therefore reopens only for a caller who has ALREADY made
 * `UNKNOWN_MAX` unknown-username attempts in the window, which is not a signal
 * worth protecting: they have demonstrated they are enumerating.
 *
 * **This costs an honest operator nothing**, and that is a property of this
 * product rather than an assumption: the login screen is a PROFILE PICKER
 * (`GET /api/auth/profiles`), so a real sign-in never sends a username that
 * does not exist. Two accounts exist in total.
 */
const UNKNOWN_MAX = 5;
const UNKNOWN_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  // C-09, Batch 4.2: every PIN derivation on this route is bounded. When the
  // queue is full the caller is answered 503 rather than being allowed to
  // queue another 128 MiB scrypt — this route burns one for an unknown user
  // by design, so it is the DoS surface the bound exists for.
  try {
    return await login(req);
  } catch (e) {
    if (isScryptBusyError(e)) return scryptBusyResponse();
    // L-116 (R9.4) — a malformed SESSION_SECRET answered 500 with the body
    // « Internal Server Error » while `/` and `/api/auth/profiles` both served
    // 200: a till that looks fine and cannot take a login. This route is NOT
    // behind `withAuth` — it is the one an unauthenticated operator reaches —
    // so it has to answer for itself.
    if (isSecretMisconfigured(e)) return secretMisconfiguredResponse(e.message);
    throw e;
  }
}

async function login(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides" },
      { status: 400 },
    );
  }
  const { username, pin } = parsed.data;

  // Per-IP+username rate-limit before any DB lookup.
  const ip = clientIp(req);
  const rlKey = `login:${ip}:${username.toLowerCase()}`;
  const rl = rateLimit(rlKey, RL_MAX, RL_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez plus tard." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, rl.retryAfterSec)) },
      },
    );
  }

  // Opportunistic cleanup of expired sessions
  try {
    await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch {
    // ignore cleanup failure
  }

  const user = await db.user.findUnique({ where: { username: username.toLowerCase() } });

  // Constant-time comparison for unknown users (mitigate timing enumeration)
  if (!user) {
    // L-30 (Batch 7.4b). The burn stays; what is bounded is how many of them
    // one caller can demand. `login-unknown:<ip>` carries no username, so
    // inventing more names does not buy more budget.
    const unknown = rateLimit(`login-unknown:${ip}`, UNKNOWN_MAX, UNKNOWN_WINDOW_MS);
    if (unknown.ok) {
      await hashPin("dummy"); // burn similar time
    }
    // Identical response either way — status, body and shape. Only the time
    // differs, and only after this caller has spent the budget.
    return NextResponse.json(
      { error: "Utilisateur introuvable ou inactif" },
      { status: 401 }
    );
  }

  // L-102 (R9.5) — AN EXPIRED LOCK IS CLEARED HERE, AS IT IS ON `unlock`.
  //
  // THE FINDING: two unauthenticated login paths with different lockout
  // arithmetic. `auth/unlock` resets `failedAttempts: 0, lockedUntil: null`
  // once the lock has expired; this route never did. So after five failures
  // `newFailed` went 6, 7, 8… and **every subsequent wrong PIN re-locked for a
  // further 15 minutes, indefinitely.** An operator who fat-fingered five times
  // could not recover through the login screen AT ALL, while the lock screen
  // would have cleared it — and there are two accounts and a restaurant in
  // service.
  //
  // The counter is what makes it permanent, not the timestamp: it is never
  // reset on this path, so the `>= MAX_FAILED_ATTEMPTS` test is true for ever
  // after. Clearing both is what `unlock` does and what makes the two paths
  // one rule.
  const now = new Date();
  if (user.lockedUntil && user.lockedUntil <= now && user.failedAttempts > 0) {
    await db.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
    user.failedAttempts = 0;
    user.lockedUntil = null;
  }

  // Check if account is locked
  if (user.lockedUntil && user.lockedUntil > now) {
    return NextResponse.json(
      { error: "Compte verrouillé. Réessayez plus tard.", lockedUntil: user.lockedUntil.toISOString() },
      { status: 423 }
    );
  }

  if (!user.active) {
    return NextResponse.json(
      { error: "Utilisateur introuvable ou inactif" },
      { status: 401 }
    );
  }

  const pinResult = await verifyPinDetail(pin, user.pinHash);
  if (!pinResult.valid) {
    const newFailed = user.failedAttempts + 1;
    // L-102: `: null`, not `: user.lockedUntil`. Carrying the old timestamp
    // forward is the other half of the permanent re-lock — an expired lock that
    // is copied onto every subsequent failure never goes away on its own. The
    // reset above means `user.lockedUntil` is null here in the recoverable
    // case, so this is belt and braces rather than a change of rule; `unlock`
    // has always written `null`.
    const lockedUntil = newFailed >= MAX_FAILED_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
      : null;

    await db.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: newFailed,
        lockedUntil,
      },
    });

    await audit("LOGIN_FAILED", "User", user.id, { username, attempts: newFailed }, null);

    if (newFailed >= MAX_FAILED_ATTEMPTS) {
      return NextResponse.json(
        { error: "Compte verrouillé. Réessayez plus tard.", lockedUntil: lockedUntil instanceof Date ? lockedUntil.toISOString() : new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString() },
        { status: 423 }
      );
    }

    return NextResponse.json(
      { error: "Code PIN incorrect" },
      { status: 401 }
    );
  }

  // Success: reset failed attempts, update lastLoginAt.
  // Transparent hash upgrade: if the PIN matched under the legacy scrypt
  // params (pre-Phase-2A N=2^14), re-hash with the strong params so the
  // next login verifies under the current parameters. Awaited before the
  // update — `hashPin` returns a promise since Batch 4.2, and spreading one
  // into Prisma's `data` would write "[object Promise]" as the PIN hash.
  const upgradedHash = pinResult.legacy ? await hashPin(pin) : null;
  await db.user.update({
    where: { id: user.id },
    data: {
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      ...(upgradedHash ? { pinHash: upgradedHash } : {}),
    },
  });

  await createSession({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  await audit("LOGIN_SUCCESS", "User", user.id, null, user.id);

  return NextResponse.json({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
  });
}
