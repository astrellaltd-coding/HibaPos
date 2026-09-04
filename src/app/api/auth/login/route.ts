import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPin, verifyPinDetail, createSession } from "@/lib/auth";
import { isScryptBusyError } from "@/lib/pin-hash-queue";
import { scryptBusyResponse } from "@/lib/api-handler";
import { loginSchema } from "@/lib/validation";
import { audit } from "@/lib/services/audit";
import { clientIp } from "@/lib/http-rate-limit";
import { rateLimit } from "@/lib/rate-limit";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// Per-IP+username throttle: 10 attempts/min.
const RL_MAX = 10;
const RL_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  // C-09, Batch 4.2: every PIN derivation on this route is bounded. When the
  // queue is full the caller is answered 503 rather than being allowed to
  // queue another 128 MiB scrypt — this route burns one for an unknown user
  // by design, so it is the DoS surface the bound exists for.
  try {
    return await login(req);
  } catch (e) {
    if (isScryptBusyError(e)) return scryptBusyResponse();
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
    await hashPin("dummy"); // burn similar time
    return NextResponse.json(
      { error: "Utilisateur introuvable ou inactif" },
      { status: 401 }
    );
  }

  // Check if account is locked
  if (user.lockedUntil && user.lockedUntil > new Date()) {
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
    const lockedUntil = newFailed >= MAX_FAILED_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
      : user.lockedUntil;

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
