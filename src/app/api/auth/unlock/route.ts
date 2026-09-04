import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPinDetail, createSession, hashPin } from "@/lib/auth";
import { isScryptBusyError } from "@/lib/pin-hash-queue";
import { scryptBusyResponse } from "@/lib/api-handler";
import { loginSchema } from "@/lib/validation";
import { audit } from "@/lib/services/audit";
import { clientIp } from "@/lib/http-rate-limit";
import { rateLimit } from "@/lib/rate-limit";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const RL_MAX = 10;
const RL_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  // C-09, Batch 4.2 — see the note on the login route.
  try {
    return await unlock(req);
  } catch (e) {
    if (isScryptBusyError(e)) return scryptBusyResponse();
    throw e;
  }
}

async function unlock(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides" },
      { status: 400 }
    );
  }
  const { username, pin } = parsed.data;

  // Per-IP+username throttle before any DB lookup.
  const ip = clientIp(req);
  const rlKey = `unlock:${ip}:${username.toLowerCase()}`;
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

  const user = await db.user.findUnique({ where: { username: username.toLowerCase() } });

  if (!user) {
    return NextResponse.json(
      { error: "Utilisateur introuvable ou inactif" },
      { status: 401 }
    );
  }

  if (!user.active) {
    return NextResponse.json(
      { error: "Compte désactivé" },
      { status: 403 }
    );
  }

  // If lockedUntil has expired, reset it before checking PIN
  if (user.lockedUntil && user.lockedUntil <= new Date()) {
    await db.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }

  // Re-check lock after potential reset
  const freshUser = await db.user.findUnique({ where: { id: user.id } });
  if (freshUser?.lockedUntil && freshUser.lockedUntil > new Date()) {
    return NextResponse.json(
      { error: "Compte verrouillé. Réessayez plus tard." },
      { status: 423 }
    );
  }

  const pinResult = await verifyPinDetail(pin, user.pinHash);
  if (!pinResult.valid) {
    const newFailed = (freshUser?.failedAttempts ?? 0) + 1;
    const lockedUntil = newFailed >= MAX_FAILED_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
      : null;

    await db.user.update({
      where: { id: user.id },
      data: { failedAttempts: newFailed, lockedUntil },
    });

    await audit("SESSION_UNLOCK_FAILED", "User", user.id, { username, attempts: newFailed }, null);

    if (newFailed >= MAX_FAILED_ATTEMPTS) {
      return NextResponse.json(
        { error: "Compte verrouillé. Réessayez plus tard." },
        { status: 423 }
      );
    }

    return NextResponse.json(
      { error: "Code PIN incorrect" },
      { status: 401 }
    );
  }

  // Success — transparent hash upgrade if the PIN matched under legacy params.
  // Awaited before the update: `hashPin` is async since Batch 4.2.
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

  await audit("SESSION_UNLOCKED", "User", user.id, null, user.id);

  return NextResponse.json({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
  });
}
