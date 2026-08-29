// Helpers for building authenticated API route handlers.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";
import type { Role } from "@/types/api";

export type RequestContext = { params: Promise<Record<string, string | string[]>> };

export type AuthContext = {
  session: SessionPayload;
  user: { id: string; username: string; name: string; role: Role; active: boolean };
};

type Handler<T> = (req: NextRequest, ctx: AuthContext) => Promise<T>;

/** Wrap a handler so it requires a valid session. Returns 401 if not authed. */
export function withAuth<T>(
  handler: Handler<T>,
  options?: { roles?: Role[] },
) {
  return async (req: NextRequest) => {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, username: true, name: true, role: true, active: true, lockedUntil: true },
    });
    if (!user || !user.active) {
      return NextResponse.json({ error: "Utilisateur inactif" }, { status: 401 });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return NextResponse.json({ error: "Compte verrouillé. Réessayez plus tard." }, { status: 423 });
    }
    if (options?.roles && !options.roles.includes(user.role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return handler(req, { session, user });
  };
}

/** Wrap a handler that also takes dynamic params. */
export function withAuthParams<T>(
  handler: (req: NextRequest, ctx: AuthContext & { params: Record<string, string> }) => Promise<T>,
  options?: { roles?: Role[] },
) {
  return async (req: NextRequest, reqCtx: RequestContext) => {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, username: true, name: true, role: true, active: true, lockedUntil: true },
    });
    if (!user || !user.active) {
      return NextResponse.json({ error: "Utilisateur inactif" }, { status: 401 });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return NextResponse.json({ error: "Compte verrouillé. Réessayez plus tard." }, { status: 423 });
    }
    if (options?.roles && !options.roles.includes(user.role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    const rawParams = await reqCtx.params;
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawParams)) {
      params[k] = Array.isArray(v) ? v[0] : v;
    }
    return handler(req, { session, user, params });
  };
}

/** Parse a JSON body safely. */
export async function parseJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
