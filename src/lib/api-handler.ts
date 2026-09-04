// Helpers for building authenticated API route handlers.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { SessionPayload, AuthUser } from "@/lib/auth";
import type { Role } from "@/types/api";
import { isRestoreInProgress, restoreElapsedSeconds } from "@/lib/services/maintenance";
import {
  isScryptBusyError,
  PIN_HASH_BUSY_MESSAGE,
  PIN_HASH_BUSY_RETRY_AFTER_SEC,
} from "@/lib/pin-hash-queue";

export type RequestContext = { params: Promise<Record<string, string | string[]>> };

/** The role gate a wrapped handler declares, attached to the returned function.
 *
 *  T-03 (Batch 4.4): the authorization matrix across the API was untested in
 *  its entirety, and it could not be tested from outside — `withAuth` closed
 *  over its `options` and the returned handler told you nothing. Every wrapper
 *  now stamps what it requires, so `api-authorization.test.ts` can walk all 61
 *  route modules and assert the declared gate of every exported method. That
 *  is what caught nothing here only because M-24 and M-25 were fixed first;
 *  it is what stops the next unguarded route being added silently.
 *
 *  Read by tests only. Nothing in the request path branches on it. */
export type RoleGate = {
  /** true once wrapped by withAuth/withAuthParams — i.e. a session is required. */
  authenticated: true;
  /** Roles allowed, or null when any authenticated role may call it. */
  roles: Role[] | null;
};

const ROLE_GATE = Symbol.for("hibapos.roleGate");

function stampGate<T extends object>(handler: T, roles: Role[] | undefined): T {
  Object.defineProperty(handler, ROLE_GATE, {
    value: { authenticated: true, roles: roles ?? null } satisfies RoleGate,
    enumerable: false,
  });
  return handler;
}

/** Read the gate a route handler declares. `null` = never wrapped, so the
 *  route is unauthenticated. */
export function roleGateOf(handler: unknown): RoleGate | null {
  if (typeof handler !== "function") return null;
  const gate = (handler as unknown as Record<symbol, unknown>)[ROLE_GATE];
  return (gate as RoleGate | undefined) ?? null;
}

export type AuthContext = {
  session: SessionPayload;
  user: AuthUser;
};

type Handler<T> = (req: NextRequest, ctx: AuthContext) => Promise<T>;

/**
 * 503 while a restore is swapping the database file (C-05, Batch 2.1).
 *
 * Every API route goes through withAuth/withAuthParams, so this is the one
 * place that can guarantee no request reconnects Prisma onto a half-written
 * file. The restore route itself is admitted before it claims the gate, so it
 * does not need an exemption.
 */
function maintenanceResponse(): NextResponse | null {
  if (!isRestoreInProgress()) return null;
  return NextResponse.json(
    {
      error:
        "Restauration de la base en cours. L'application sera de nouveau disponible dans quelques secondes.",
      maintenance: true,
      elapsedSeconds: restoreElapsedSeconds(),
    },
    { status: 503, headers: { "Retry-After": "5" } },
  );
}

/**
 * 503 when the bounded PIN-derivation queue is full (C-09, Batch 4.2).
 *
 * Same shape as the maintenance 503 above, and the same reasoning: this is a
 * capacity answer, not an error. Every route that hashes or verifies a PIN
 * returns it, so a caller flooding the till with PIN guesses is told to come
 * back rather than being allowed to queue unbounded 128 MiB derivations.
 */
export function scryptBusyResponse(): NextResponse {
  return NextResponse.json(
    { error: PIN_HASH_BUSY_MESSAGE, busy: true },
    {
      status: 503,
      headers: { "Retry-After": String(PIN_HASH_BUSY_RETRY_AFTER_SEC) },
    },
  );
}

/** Wrap a handler so it requires a valid session. Returns 401 if not authed. */
export function withAuth<T>(
  handler: Handler<T>,
  options?: { roles?: Role[] },
) {
  return stampGate(async (req: NextRequest) => {
    const blocked = maintenanceResponse();
    if (blocked) return blocked;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const user = session.user;
    if (options?.roles && !options.roles.includes(user.role as Role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    // Only ScryptBusyError is caught; every other error propagates exactly as
    // it did before, so no route's failure behaviour changes.
    try {
      return await handler(req, { session, user });
    } catch (e) {
      if (isScryptBusyError(e)) return scryptBusyResponse();
      throw e;
    }
  }, options?.roles);
}

/** Wrap a handler that also takes dynamic params. */
export function withAuthParams<T>(
  handler: (req: NextRequest, ctx: AuthContext & { params: Record<string, string> }) => Promise<T>,
  options?: { roles?: Role[] },
) {
  return stampGate(async (req: NextRequest, reqCtx: RequestContext) => {
    const blocked = maintenanceResponse();
    if (blocked) return blocked;
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
    try {
      return await handler(req, { session, user, params });
    } catch (e) {
      if (isScryptBusyError(e)) return scryptBusyResponse();
      throw e;
    }
  }, options?.roles);
}

/** Parse a JSON body safely. */
export async function parseJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
