import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/http-rate-limit";
import { rateLimit } from "@/lib/rate-limit";

export type LoginProfile = {
  id: string;
  username: string;
  name: string;
  role: "SUPER_ADMIN" | "MANAGER";
};

/**
 * GET /api/auth/profiles
 * Public: returns active users for the login profile picker.
 * Only exposes non-sensitive fields — the PIN remains the secret.
 * Rate-limited per IP to slow username enumeration.
 */
export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  const rlKey = `profiles:${ip}`;
  const rl = rateLimit(rlKey, 30, 60_000); // 30/min
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez plus tard." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, rl.retryAfterSec)) },
      },
    );
  }
  const users = await db.user.findMany({
    where: { active: true },
    orderBy: [{ name: "asc" }],
    select: { id: true, username: true, name: true, role: true },
  });
  return NextResponse.json(users);
}