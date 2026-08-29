// Helpers for building authenticated API route handlers.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
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
    // getSession already fetched + verified the user (active, not locked).
    // Reuse it instead of a second db.user.findUnique per request.
    const user = session.user;
    if (options?.roles && !options.roles.includes(user.role as Role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return handler(req, { session, user: { id: user.id, username: user.username, name: user.name, role: user.role as Role, active: user.active } });
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
    const user = session.user;
    if (options?.roles && !options.roles.includes(user.role as Role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    const rawParams = await reqCtx.params;
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawParams)) {
      params[k] = Array.isArray(v) ? v[0] : v;
    }
    return handler(req, { session, user: { id: user.id, username: user.username, name: user.name, role: user.role as Role, active: user.active }, params });
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
