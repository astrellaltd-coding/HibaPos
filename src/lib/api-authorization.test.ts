import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "fs";
import path from "path";
import { roleGateOf } from "@/lib/api-handler";

// T-03 — the authorization matrix across the API. Batch 4.4.
//
// The audit's finding was that RBAC has zero tests across the API surface:
// nothing asserted that a CASHIER cannot close a shift, reprint, or restore a
// backup. It could not easily be asserted either, because `withAuth` closed
// over its `options` and the handler it returned told you nothing about what
// it required. Batch 4.4 stamps the declared gate onto every wrapped handler,
// and this file walks every route module and checks it against the table
// below.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. It asserts the gate each route
// *declares* — that a route is wrapped at all, and which roles it names. It
// does not drive real requests and assert status codes; that needs a request
// harness (`withAuth` → `getSession()` → `cookies()` throws outside a request
// scope) and stays with Batch 6.1. The distinction matters: this catches an
// unguarded route being added, a gate being widened, and the whole class of
// defect M-24 and M-25 were — it does not catch a handler that declares the
// right roles and then ignores them internally.

const API_ROOT = path.join(process.cwd(), "src", "app", "api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Every role the product has, after DD-07 / Batch 4.4b removed `CASHIER`.
 *  A gate naming all of them is no narrower than naming none. */
const ROLES = ["SUPER_ADMIN", "MANAGER"];

/** Routes that are deliberately reachable WITHOUT a session, with the reason.
 *  Anything not listed here must be wrapped. Adding a route to this list is a
 *  security decision and should be visible in review. */
const UNAUTHENTICATED: Record<string, string> = {
  "auth/login:POST": "the login form itself",
  "auth/unlock:POST": "unlocking a locked screen is a login",
  "auth/logout:POST": "clearing a cookie needs no privilege",
  "auth/profiles:GET": "the login profile picker; rate-limited, C-18 notes the enumeration surface",
  "auth/me:GET": "reports who you are, or null",
  "seed:GET": "first-boot check — reports whether the database is initialised",
  "seed:POST": "first-boot bootstrap; refuses once users exist or the database has traded (C-18, Batch 4.3)",
  "(root):GET": "GET /api — the liveness probe Batch 3.4 kept for the launcher; touches no database and reports no build detail",
};

/** The declared role gate expected of each authenticated route.
 *  `null` = any authenticated role. Keyed `<route path>:<METHOD>`. */
const EXPECTED_ROLES: Record<string, string[] | null> = {
  // Anything not named here is expected to be open to any authenticated role.
  //
  // M-19s (Batch 4.4b): these two reads were open to any authenticated caller
  // while `PUT /api/settings` is SUPER_ADMIN and `POST /api/reports/x` is
  // MANAGER+. Read and write now agree. Pinned here so a later widening is a
  // test failure rather than a quiet regression.
  "settings:GET": ["SUPER_ADMIN", "MANAGER"],
  "reports/x:GET": ["SUPER_ADMIN", "MANAGER"],
};

/** Every route.ts under src/app/api, as a path relative to that root. */
function routeFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...routeFiles(full, prefix ? `${prefix}/${entry}` : entry));
    } else if (entry === "route.ts") {
      out.push(prefix || "(root)"); // src/app/api/route.ts is GET /api
    }
  }
  return out;
}

/** Import a route module by its API path. `(root)` is `src/app/api/route.ts`. */
async function importRoute(route: string): Promise<unknown> {
  const rel = route === "(root)" ? "" : `/${route}`;
  return import(/* @vite-ignore */ `@/app/api${rel}/route`);
}

const ROUTES = routeFiles(API_ROOT).sort();

describe("T-03 — every API route declares an authorization gate", () => {
  it("finds the API surface", () => {
    // A guard on the guard: if the walk silently returned nothing, every
    // assertion below would vacuously pass.
    expect(ROUTES.length).toBeGreaterThan(50);
  });

  it("leaves no route unauthenticated except the ones named here", async () => {
    const unexpected: string[] = [];
    for (const route of ROUTES) {
      const mod = (await importRoute(route)) as Record<string, unknown>;
      for (const method of METHODS) {
        if (typeof mod[method] !== "function") continue;
        const key = `${route}:${method}`;
        const gate = roleGateOf(mod[method]);
        if (gate === null && !(key in UNAUTHENTICATED)) unexpected.push(key);
      }
    }
    // Named individually so a failure says which route, not just how many.
    expect(unexpected).toEqual([]);
  });

  // Two idioms guard roles in this codebase: the declarative
  // `withAuth(handler, { roles })` option, and an inline
  // `if (user.role !== "SUPER_ADMIN") return 403` at the top of the handler.
  // Only the first is visible to `roleGateOf`. Converting the ~20 inline ones
  // would change the French error text each returns ("Réservé au super
  // administrateur" versus withAuth's "Accès refusé"), which is a
  // user-visible change outside this batch — recorded as **L-32** instead.
  // Until then this table says which idiom each destructive route uses, so an
  // inline guard being deleted is at least visible in review here.
  // Batch 4.4b: this table used to record only WHICH IDIOM each route used,
  // and the declarative arm asserted `not.toContain("CASHIER")`. DD-07 removed
  // the role, which made that assertion vacuous — and worse, made the property
  // it stood for untrue: with `SUPER_ADMIN` and `MANAGER` the only roles left,
  // a gate of `["SUPER_ADMIN", "MANAGER"]` admits every role in the product
  // and is no narrower than declaring none. Closing the day and reprinting a
  // ticket are both in exactly that position.
  //
  // Revisited rather than deleted (safety rule 2): the table now PINS the
  // declared role list, so widening one is a failure here instead of a quiet
  // regression, and the entries that name every role say so out loud.
  const DESTRUCTIVE: Record<string, string[] | "inline"> = {
    "backups/[id]/restore:POST": ["SUPER_ADMIN"], // overwrites the live database
    "backups:POST": "inline",
    "backups/[id]:DELETE": "inline",
    // Every role in the product — the gate is a statement of intent, not a
    // restriction, until a role below MANAGER exists again.
    "reports/z:POST": ["SUPER_ADMIN", "MANAGER"], // closing the day
    "orders/[id]/reprint:POST": ["SUPER_ADMIN", "MANAGER"], // journalled REIMPRESSION
    "users:POST": "inline",
    "settings:PUT": "inline",
  };

  it("keeps every destructive route authenticated, with its declared gate pinned", async () => {
    for (const [key, expected] of Object.entries(DESTRUCTIVE)) {
      const idx = key.lastIndexOf(":");
      const route = key.slice(0, idx);
      const method = key.slice(idx + 1);
      const mod = (await importRoute(route)) as Record<string, unknown>;
      expect(typeof mod[method], `${key} should exist`).toBe("function");
      const gate = roleGateOf(mod[method]);
      expect(gate, `${key} must require a session`).not.toBeNull();
      if (expected === "inline") {
        // The wrapper admits any authenticated role; the handler refuses
        // below. Pinned so that a later change to `{ roles }` is noticed here
        // rather than assumed.
        expect(gate?.roles, `${key} guards inline (L-32)`).toBeNull();
      } else {
        expect(gate?.roles, `${key} must declare exactly these roles`).toEqual(expected);
        // An empty list admits nobody and would break the till rather than
        // guard it, so a gate that names roles must name at least one.
        expect(expected.length, `${key} must name at least one role`).toBeGreaterThan(0);
      }
    }
  });

  it("records that only the restore button is narrower than the whole role model", async () => {
    // The consequence of DD-07 stated as an assertion rather than a comment.
    // If a role below MANAGER is ever added, this test should start failing —
    // and that failure is the reminder to re-examine every gate above.
    const narrower = Object.entries(DESTRUCTIVE).filter(
      ([, expected]) => expected !== "inline" && expected.length < ROLES.length,
    );
    expect(narrower.map(([key]) => key)).toEqual(["backups/[id]/restore:POST"]);
  });

  it("records that closing a caisse is deliberately open to any role", async () => {
    // Not an oversight: `reports/z/route.ts` states the business rule —
    // closing a shift is open to any authenticated role, while listing
    // historical Z reports is not. Asserted so that the absence of a gate here
    // reads as a decision rather than a gap the matrix missed. Batch 4.4b
    // removed the CASHIER role the rule was written for and deliberately left
    // the asymmetry alone: widening or narrowing it is a business decision.
    const mod = (await importRoute("shifts/[id]/close")) as Record<string, unknown>;
    const gate = roleGateOf(mod.POST);
    expect(gate).not.toBeNull(); // a session is still required
    expect(gate?.roles).toBeNull();
  });

  it("gates the two routes this batch closed (M-24, M-25)", async () => {
    const upload = (await import("@/app/api/upload/route")) as Record<string, unknown>;
    expect(roleGateOf(upload.POST)?.roles).toEqual(["SUPER_ADMIN", "MANAGER"]);

    const customer = (await import("@/app/api/customers/[id]/route")) as Record<string, unknown>;
    expect(roleGateOf(customer.PUT)?.roles).toEqual(["SUPER_ADMIN", "MANAGER"]);
    expect(roleGateOf(customer.DELETE)?.roles).toEqual(["SUPER_ADMIN", "MANAGER"]);
    // GET stays open to any authenticated role — the customers view is
    // available to every role and reading a customer is what it is for.
    expect(roleGateOf(customer.GET)?.roles).toBeNull();
  });

  it("matches the expected gate wherever one is pinned", async () => {
    for (const [key, expected] of Object.entries(EXPECTED_ROLES)) {
      const [route, method] = key.split(":");
      const mod = (await importRoute(route)) as Record<string, unknown>;
      expect(roleGateOf(mod[method])?.roles, key).toEqual(expected);
    }
  });
});
