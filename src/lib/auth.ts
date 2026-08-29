// Auth utilities: PIN hashing (scrypt) and signed session cookies.
// Server-only module.

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { createHmac } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const SESSION_COOKIE = "hibapos_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

// SESSION_SECRET must be provided via environment variable.
// No fallback — the app refuses to start without it.
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required.");
}
if (SESSION_SECRET.length < 32) {
  throw new Error(
    "SESSION_SECRET must be at least 32 characters long. Generate with: openssl rand -hex 32",
  );
}

// ---------------------------------------------------------------------------
// PIN hashing
// ---------------------------------------------------------------------------

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, "hex");
  const testBuf = scryptSync(pin, salt, 64);
  if (hashBuf.length !== testBuf.length) return false;
  return timingSafeEqual(hashBuf, testBuf);
}

// ---------------------------------------------------------------------------
// Signed session cookie
// ---------------------------------------------------------------------------

export type SessionPayload = {
  userId: string;
  username: string;
  role: string;
  exp: number;
};

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

export async function createSession(payload: Omit<SessionPayload, "exp">): Promise<void> {
  const token = encodeSession({ ...payload, exp: Date.now() + SESSION_TTL_MS });
  const store = await cookies();
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
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = decodeSession(token);
  if (!payload) return null;
  // Verify the user is still active (cookie may outlive deactivation)
  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: { active: true, lockedUntil: true },
  });
  if (!user || !user.active) return null;
  if (user.lockedUntil && user.lockedUntil > new Date()) return null;
  return payload;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export { SESSION_COOKIE };
