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
    // L-103 (R9.5): the delay goes in the BODY as well as the header. The
    // header is correct and unreachable — `ApiError` carries `status` and
    // `body`, not headers — so the login screen could not schedule a retry
    // against it, and the screen this route feeds is the only way into the
    // till. Same shape `scryptBusyResponse` uses for `busy: true`.
    const retryAfterSec = Math.max(1, rl.retryAfterSec);
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez plus tard.", retryAfterSec },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
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