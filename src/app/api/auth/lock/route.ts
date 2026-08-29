import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { destroySession } from "@/lib/auth";
import { audit } from "@/lib/services/audit";

/**
 * POST /api/auth/lock
 * Server-side session destruction: stolen cookies can no longer be
 * replayed after a terminal idle-lock. The next request will hit /api/auth
 * guardrails and force re-authentication via /api/auth/unlock (which calls
 * createSession fresh).
 */
export const POST = withAuth(async (_req, { user }) => {
  await destroySession();
  await audit("SESSION_LOCKED", "User", user.id, null, user.id);
  return NextResponse.json({ ok: true });
});
