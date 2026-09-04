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
  return async (req: NextRequest) => {
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
  };
}

/** Wrap a handler that also takes dynamic params. */
export function withAuthParams<T>(
  handler: (req: NextRequest, ctx: AuthContext & { params: Record<string, string> }) => Promise<T>,
  options?: { roles?: Role[] },
) {
  return async (req: NextRequest, reqCtx: RequestContext) => {
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
