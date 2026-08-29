import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPin, verifyPin, createSession } from "@/lib/auth";
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

  if (!verifyPin(pin, user.pinHash)) {
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

  // Success: reset failed attempts, update lastLoginAt
  await db.user.update({
    where: { id: user.id },
    data: {
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
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
