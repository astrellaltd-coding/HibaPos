// ⚠ TEST ONLY. Nothing in the application imports this module, and nothing
// should: it stubs `next/headers` the moment it is loaded.
//
// T-02 / T-05 / T-06 (Batch 6.1) — the request harness every batch since 4.4
// has deferred.
//
// ── WHY IT DID NOT EXIST ─────────────────────────────────────────────────────
// Every route goes through `withAuth`, which calls `getSession()`, which calls
// `cookies()` from `next/headers` — and that throws outside a request scope.
// So a test could assert what a route *declares* (`api-authorization.test.ts`
// walks all 61 modules and checks the gate each one stamps) and it could
// assert route *source* (`checkout-guards.test.ts`, `order-status.test.ts`),
// but it could not send a request and read the answer. Six batches wrote that
// limitation into their own test files rather than pretend otherwise:
//
//   "driving the route needs a request scope … which stays with Batch 6.1"
//
// This is Batch 6.1 keeping that promise. `mock.module` replaces
// `next/headers` with a cookie jar this module owns, which is enough for the
// whole chain: `getSession` reads the jar, and — because the stub's `set`
// writes back into it — the app's OWN `createSession` can be used to sign a
// test in. That last part matters more than it looks: the harness does not
// mint its own tokens, so a test cannot pass against a session shape the
// application would reject.
//
// ── WHAT IT DOES NOT DO ──────────────────────────────────────────────────────
// It does not run Next's routing, middleware, or the edge runtime. It calls an
// exported handler directly with a `Request`. So it proves what a handler does
// with a given request and session — which is exactly what T-02, T-05 and T-06
// are about — and proves nothing about URL matching or middleware order.

import { mock } from "bun:test";
import { db } from "@/lib/db";

/** The cookie jar the stubbed `next/headers` reads and writes. */
const jar = new Map<string, string>();

mock.module("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    has: (name: string) => jar.has(name),
    set: (name: string | { name: string; value: string }, value?: string) => {
      if (typeof name === "object") jar.set(name.name, name.value);
      else jar.set(name, value ?? "");
    },
    delete: (name: string) => jar.delete(name),
  }),
  headers: async () => new Headers({ "user-agent": "hibapos-route-harness" }),
}));

/** Forget any signed-in session. Call between tests. */
export function clearCookies(): void {
  jar.clear();
}

/** What the jar currently holds — for asserting that a route SET a cookie. */
export function cookieValue(name: string): string | undefined {
  return jar.get(name);
}

export type HarnessUser = { id: string; username: string; role: "SUPER_ADMIN" | "MANAGER" };

/**
 * Sign in as `user` using the application's own `createSession`, then write the
 * `Session` row `getSession` revalidates against.
 *
 * Deliberately not a hand-built cookie: `getSession` checks that the session
 * row exists and has not expired, so a harness that skipped the row would test
 * a path production never takes.
 */
export async function signInAs(user: HarnessUser): Promise<void> {
  const { createSession } = await import("@/lib/auth");
  await createSession({ userId: user.id, username: user.username, role: user.role });
  // `createSession` writes the row itself in this codebase; if that ever
  // changes, this assertion is what will notice rather than a silent 401.
  const rows = await db.session.count({ where: { userId: user.id } });
  if (rows === 0) throw new Error("route-harness: createSession wrote no Session row");
}

export type CallOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url?: string;
  body?: unknown;
  params?: Record<string, string | string[]>;
  headers?: Record<string, string>;
};

type RouteHandler = (
  req: Request,
  ctx: { params: Promise<Record<string, string | string[]>> },
) => Promise<Response>;

/** Send a request to an exported route handler and return its Response. */
export async function callRoute(
  handler: unknown,
  opts: CallOptions = {},
): Promise<Response> {
  const method = opts.method ?? "GET";
  const url = opts.url ?? "http://localhost/api/test";
  const init: RequestInit = { method };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { "content-type": "application/json", ...(opts.headers ?? {}) };
  } else if (opts.headers) {
    init.headers = opts.headers;
  }
  const req = new Request(url, init);
  return (handler as RouteHandler)(req, { params: Promise.resolve(opts.params ?? {}) });
}

/** `callRoute`, with the JSON body parsed — the shape most assertions want. */
export async function callJson<T = unknown>(
  handler: unknown,
  opts: CallOptions = {},
): Promise<{ status: number; body: T }> {
  const res = await callRoute(handler, opts);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body: body as T };
}
