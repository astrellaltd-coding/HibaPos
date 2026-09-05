import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync } from "fs";
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

  // ── DD-22 / L-33 (Batch 7.4b): EVERY authenticated handler, classified ────
  //
  // L-33 said that since Batch 4.4b removed `CASHIER`, a gate of
  // `["SUPER_ADMIN", "MANAGER"]` admits the entire role model — "no narrower
  // than declaring no roles at all" — and that **"deciding which of the 29
  // should narrow to `["SUPER_ADMIN"]` is a review, not a mechanical fix"**.
  // DD-22 ordered that review and it was done on 2026-09-05. This table is
  // its OUTPUT, and it converts a one-time review into a standing property:
  // change any gate anywhere and this fails, so the next change is deliberate.
  //
  // THE VERDICT ON THE 29. Every one of them is a till operation, a report, or
  // a management action the MANAGER genuinely performs — that account runs the
  // restaurant. Two were not, and they are the two DD-22 narrowed:
  // `GET /api/users` and `GET /api/backups` answered 200 to a MANAGER whose
  // navigation entry for those screens is deliberately SUPER_ADMIN-only
  // (DD-07), so the API contradicted the navigation. `GET /api/logs` already
  // answered 403 and is the shape they now match.
  //
  // Two boundaries were checked rather than assumed, because they are the ones
  // that look wrong at a glance: **`fiscal/close-month` admits a MANAGER and
  // `fiscal/close-year` does not**, which is exactly what the README's role
  // table says; and **`audit` (the business trail) admits a MANAGER while
  // `logs` (the technical one) does not**, which is also what it says.
  //
  //   BOTH        — declares ["SUPER_ADMIN", "MANAGER"]. Reviewed: the manager
  //                 needs it. Admits every role only because none is narrower.
  //   SUPER_ADMIN — declares ["SUPER_ADMIN"]. Genuinely narrower.
  //   INLINE      — any role at the wrapper, refused in the handler (L-32).
  //   ANY         — any authenticated role, deliberately.
  const GATES: Record<string, "BOTH" | "SUPER_ADMIN" | "INLINE" | "ANY"> = {
  "audit:GET": "BOTH",
  "auth/lock:POST": "ANY",
  "auth/step-up:POST": "ANY",
  "auth/switch-user:POST": "ANY",
  "backups:GET": "SUPER_ADMIN",
  "backups:POST": "INLINE",
  "backups/[id]:DELETE": "INLINE",
  "backups/[id]/restore:POST": "SUPER_ADMIN",
  "cash-movements:GET": "BOTH",
  "cash-movements:POST": "BOTH",
  "catalog/categories:GET": "ANY",
  "catalog/categories:POST": "INLINE",
  "catalog/categories/[id]:DELETE": "INLINE",
  "catalog/categories/[id]:GET": "ANY",
  "catalog/categories/[id]:PUT": "INLINE",
  "catalog/products:GET": "ANY",
  "catalog/products:POST": "INLINE",
  "catalog/products/[id]:DELETE": "INLINE",
  "catalog/products/[id]:GET": "ANY",
  "catalog/products/[id]:PUT": "INLINE",
  "catalog/products/availability:GET": "ANY",
  "catalog/products/availability:POST": "BOTH",
  "catalog/products/favorites:GET": "ANY",
  "catalog/products/update-images:POST": "SUPER_ADMIN",
  "customers:GET": "ANY",
  "customers:POST": "ANY",
  "customers/[id]:DELETE": "BOTH",
  "customers/[id]:GET": "ANY",
  "customers/[id]:PUT": "BOTH",
  "customers/[id]/detail:GET": "ANY",
  "dashboard:GET": "BOTH",
  "fiscal/archive:GET": "BOTH",
  "fiscal/archive:POST": "SUPER_ADMIN",
  "fiscal/archive/[year]:GET": "BOTH",
  "fiscal/close-month:POST": "BOTH",
  "fiscal/close-year:POST": "SUPER_ADMIN",
  "fiscal/closes:GET": "BOTH",
  "fiscal/drawer:POST": "BOTH",
  "fiscal/events:GET": "BOTH",
  "fiscal/grand-total:GET": "BOTH",
  "fiscal/verify:GET": "BOTH",
  "logs:GET": "SUPER_ADMIN",
  "media:DELETE": "INLINE",
  "media:GET": "ANY",
  "orders:GET": "ANY",
  "orders:POST": "ANY",
  "orders/[id]:GET": "ANY",
  "orders/[id]/print:POST": "ANY",
  "orders/[id]/refund:POST": "ANY",
  "orders/[id]/reprint:POST": "BOTH",
  "print/test:POST": "BOTH",
  "reports/cashiers:GET": "BOTH",
  "reports/products:GET": "BOTH",
  "reports/sales:GET": "BOTH",
  "reports/vat:GET": "BOTH",
  "reports/x:GET": "BOTH",
  "reports/x:POST": "BOTH",
  "reports/z:GET": "BOTH",
  "reports/z:POST": "BOTH",
  "settings:GET": "BOTH",
  "settings:PUT": "INLINE",
  "shifts:GET": "ANY",
  "shifts:POST": "ANY",
  "shifts/[id]/close:POST": "ANY",
  "shifts/current:GET": "ANY",
  "shifts/summary:GET": "ANY",
  "tables:GET": "ANY",
  "tables:POST": "INLINE",
  "tables/[id]:DELETE": "BOTH",
  "tables/[id]:PUT": "ANY",
  "tables/seed:POST": "BOTH",
  "upload:POST": "BOTH",
  "users:GET": "SUPER_ADMIN",
  "users:POST": "INLINE",
  "users/[id]:DELETE": "INLINE",
  "users/[id]:PUT": "INLINE",
  };

  /** Where the next `export const <METHOD> = withAuth(` starts, or EOF. */
  function nextExportIndex(src: string, from: number): number {
    const rest = src.slice(from + 10);
    const m = /export const (?:GET|POST|PUT|PATCH|DELETE)\s*=\s*withAuth/.exec(rest);
    return m ? from + 10 + m.index : src.length;
  }

  /** Does this handler refuse a non-SUPER_ADMIN inside its own body? (L-32) */
  function guardsInline(route: string, method: string): boolean {
    const src = readFileSync(path.join(API_ROOT, route, "route.ts"), "utf8");
    const at = src.indexOf(`export const ${method} =`);
    if (at === -1) return false;
    return /user\.role\s*!==\s*"SUPER_ADMIN"/.test(src.slice(at, nextExportIndex(src, at)));
  }

  it("classifies every authenticated handler, and none has changed gate (DD-22)", async () => {
    const seen: Record<string, string> = {};
    for (const route of ROUTES) {
      const mod = (await importRoute(route)) as Record<string, unknown>;
      for (const method of METHODS) {
        const handler = mod[method];
        if (typeof handler !== "function") continue;
        const gate = roleGateOf(handler);
        if (!gate) continue; // unauthenticated — the test above owns those
        const roles = gate.roles;
        seen[`${route}:${method}`] = roles
          ? roles.length === 1 && roles[0] === "SUPER_ADMIN"
            ? "SUPER_ADMIN"
            : "BOTH"
          : guardsInline(route, method)
            ? "INLINE"
            : "ANY";
      }
    }

    // Every handler is classified, and nothing is classified that no longer
    // exists — a route deleted without touching this table fails here too.
    expect(Object.keys(seen).sort()).toEqual(Object.keys(GATES).sort());
    expect(seen).toEqual(GATES);
  });

  it("the count of genuinely-narrow gates is what the review left (DD-22)", () => {
    // Stated as numbers so that widening one gate and narrowing another —
    // which the per-key comparison catches, but as two failures that could be
    // read as noise — shows up as one legible change.
    const counts = Object.values(GATES).reduce<Record<string, number>>((acc, v) => {
      acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ BOTH: 29, ANY: 26, INLINE: 14, SUPER_ADMIN: 7 });
  });

  it("matches the expected gate wherever one is pinned", async () => {
    for (const [key, expected] of Object.entries(EXPECTED_ROLES)) {
      const [route, method] = key.split(":");
      const mod = (await importRoute(route)) as Record<string, unknown>;
      expect(roleGateOf(mod[method])?.roles, key).toEqual(expected);
    }
  });
});
