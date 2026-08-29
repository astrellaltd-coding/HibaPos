import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPin, createSession, destroySession } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { withAuth, parseJson } from "@/lib/api-handler";
import { audit } from "@/lib/services/audit";
import { clientIp } from "@/lib/http-rate-limit";
import { rateLimit } from "@/lib/rate-limit";

const RL_MAX = 10;
const RL_WINDOW_MS = 60_000;
const FAILED_ATTEMPTS_LIMIT = 5;
const LOCKOUT_MINUTES = 15;

export const POST = withAuth(async (req, { user: caller }) => {
  const body = await parseJson(req);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides" },
      { status: 400 }
    );
  }
  const { username, pin } = parsed.data;

  // Per-IP+caller+target rate-limit.
  const ip = clientIp(req as unknown as NextRequest);
  const rlKey = `switch:${ip}:${caller.id}:${username.toLowerCase()}`;
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
  if (!user || !user.active) {
    return NextResponse.json(
      { error: "Utilisateur introuvable ou inactif" },
      { status: 401 }
    );
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return NextResponse.json(
      { error: "Compte verrouillé. Réessayez plus tard." },
      { status: 423 }
    );
  }

  // Privilege escalation guard: a CASHIER may only switch to another CASHIER.
  // MANAGER+/SUPER_ADMIN callers are trusted to switch to any role.
  if (
    caller.role === "CASHIER" &&
    (user.role === "MANAGER" || user.role === "SUPER_ADMIN")
  ) {
    await audit(
      "USER_SWITCH_BLOCKED",
      "User",
      user.id,
      { fromUserId: caller.id, fromRole: caller.role, toRole: user.role },
      caller.id,
    );
    return NextResponse.json(
      { error: "Vous ne pouvez pas basculer vers un compte hiérarchiquement supérieur." },
      { status: 403 }
    );
  }

  if (!verifyPin(pin, user.pinHash)) {
    // Increment failed attempts (same lockout logic as login).
    const newFailed = user.failedAttempts + 1;
    const lockedUntil =
      newFailed >= FAILED_ATTEMPTS_LIMIT
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
        : user.lockedUntil;
    await db.user.update({
      where: { id: user.id },
      data: { failedAttempts: newFailed, lockedUntil },
    });
    await audit(
      "USER_SWITCH_FAILED",
      "User",
      user.id,
      { username, attempts: newFailed, fromUserId: caller.id },
      caller.id,
    );
    if (newFailed >= FAILED_ATTEMPTS_LIMIT) {
      return NextResponse.json(
        { error: "Compte verrouillé. Réessayez plus tard." },
        { status: 423 },
      );
    }
    return NextResponse.json(
      { error: "Code PIN incorrect" },
      { status: 401 }
    );
  }

  // Reset failed attempts on success
  if (user.failedAttempts > 0) {
    await db.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }

  // Destroy old session and create new one
  await destroySession();
  await createSession({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  await audit("USER_SWITCHED", "User", user.id, { previousUserId: caller.id }, user.id);

  return NextResponse.json({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
  });
});
