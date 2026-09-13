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
  // Catalogue transfer (2026-09-11). The export hands over every product,
  // price and menu structure in one request — the class of read DD-22 made
  // `users:GET` and `backups:GET` SUPER_ADMIN for. The import writes the thing
  // every price is read from. Neither is a till operator's business.
  "catalog/export:GET": ["SUPER_ADMIN"],
  "catalog/import:POST": ["SUPER_ADMIN"],
  // First-run key handling (2026-09-11). `setup/secrets:GET` is the ONE route
  // in this application that returns a secret value, deliberately — a backup
  // key that exists only on the machine it protects is not a backup key. It
  // returns only keys nobody has recorded yet, and answers with nothing once
  // they have. `setup/chain-key:POST` arms the fiscal chain key (DD-25), which
  // is irreversible for the journal that follows it.
  "setup/secrets:GET": ["SUPER_ADMIN"],
  "setup/secrets:POST": ["SUPER_ADMIN"],
  "setup/chain-key:POST": ["SUPER_ADMIN"],
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
  // 2026-09-13 (R9.6, L-120): `"inline"` used to mean only « guarded somewhere
  // in the body », which is precisely the claim that turned out to be
  // unverifiable — seven handlers elsewhere carry an inline guard that refuses
  // nobody. These four are now pinned to the KIND of guard, so a destructive
  // route whose guard is widened into a no-op fails here as well as below.
  const DESTRUCTIVE: Record<string, string[] | "INLINE_SA"> = {
    "backups/[id]/restore:POST": ["SUPER_ADMIN"], // overwrites the live database
    "backups:POST": "INLINE_SA",
    "backups/[id]:DELETE": "INLINE_SA",
    // Every role in the product — the gate is a statement of intent, not a
    // restriction, until a role below MANAGER exists again.
    "reports/z:POST": ["SUPER_ADMIN", "MANAGER"], // closing the day
    "orders/[id]/reprint:POST": ["SUPER_ADMIN", "MANAGER"], // journalled REIMPRESSION
    "users:POST": "INLINE_SA",
    "settings:PUT": "INLINE_SA",
    // 2026-09-11: writes every row of the catalogue. It refuses unless all ten
    // catalogue tables are empty, and refuses INSIDE the transaction, so a
    // refusal leaves nothing behind — but the gate is what stops it being
    // reachable by a till operator in the first place.
    "catalog/import:POST": ["SUPER_ADMIN"],
    // Arming the chain key cannot be undone for the journal written after it:
    // re-arming would orphan every hash already computed under the first key.
    "setup/chain-key:POST": ["SUPER_ADMIN"],
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
      if (expected === "INLINE_SA") {
        // The wrapper admits any authenticated role; the handler refuses
        // below. Pinned so that a later change to `{ roles }` is noticed here
        // rather than assumed.
        expect(gate?.roles, `${key} guards inline (L-32)`).toBeNull();
        // … and pinned to WHICH inline guard, so widening it to
        // `&& user.role !== "MANAGER"` — which refuses nobody — fails here
        // instead of reading as the same thing (L-120).
        const [r, m] = [key.slice(0, key.lastIndexOf(":")), key.slice(key.lastIndexOf(":") + 1)];
        expect(guardsInline(r, m), `${key} must refuse everyone but SUPER_ADMIN`).toBe("INLINE_SA");
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
      ([, expected]) => expected !== "INLINE_SA" && expected.length < ROLES.length,
    );
    // Two since 2026-09-11. `catalog/import:POST` joined the restore button,
    // and the pairing is the right one: both replace a whole body of data
    // rather than editing a row of it. The list is asserted exactly so that a
    // THIRD arrival is a failure here and gets the same look.
    expect(narrower.map(([key]) => key).sort()).toEqual([
      "backups/[id]/restore:POST",
      "catalog/import:POST",
      "setup/chain-key:POST",
    ]);
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
  //   INLINE_SA   — any role at the wrapper, and the handler refuses everyone
  //                 but SUPER_ADMIN (L-32). A real gate.
  //   INLINE_ANY  — an inline guard that names EVERY role, so it refuses
  //                 nobody and the handler is open to any authenticated
  //                 caller. Dead code, and until L-120 it was indistinguishable
  //                 here from INLINE_SA. Listed as what it is, not as a guard.
  //   INLINE_SELF — SUPER_ADMIN, or the subject acting on their own row.
  const GATES: Record<
    string,
    "BOTH" | "SUPER_ADMIN" | "INLINE_SA" | "INLINE_ANY" | "INLINE_SELF" | "ANY"
  > = {
  "audit:GET": "BOTH",
  "auth/lock:POST": "ANY",
  "auth/step-up:POST": "ANY",
  "auth/switch-user:POST": "ANY",
  "backups:GET": "SUPER_ADMIN",
  "backups:POST": "INLINE_SA",
  "backups/[id]:DELETE": "INLINE_SA",
  "backups/[id]/restore:POST": "SUPER_ADMIN",
  "cash-movements:GET": "BOTH",
  "cash-movements:POST": "BOTH",
  "catalog/categories:GET": "ANY",
  "catalog/categories:POST": "INLINE_ANY",
  "catalog/categories/[id]:DELETE": "INLINE_ANY",
  "catalog/categories/[id]:GET": "ANY",
  "catalog/categories/[id]:PUT": "INLINE_ANY",
  "catalog/export:GET": "SUPER_ADMIN",
  "catalog/import:POST": "SUPER_ADMIN",
  "catalog/products:GET": "ANY",
  "catalog/products:POST": "INLINE_ANY",
  "catalog/products/[id]:DELETE": "INLINE_ANY",
  "catalog/products/[id]:GET": "ANY",
  "catalog/products/[id]:PUT": "INLINE_ANY",
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
  // DD-23 (Batch 3.8). `BOTH`, matching `close-month` and not `close-year`:
  // sealing the trading day is the operator's daily work, and gating it to the
  // developer's account would put a mandatory close behind an absent person.
  "fiscal/close-day:POST": "BOTH",
  "fiscal/close-month:POST": "BOTH",
  "fiscal/close-year:POST": "SUPER_ADMIN",
  "fiscal/closes:GET": "BOTH",
  "fiscal/drawer:POST": "BOTH",
  "fiscal/events:GET": "BOTH",
  "fiscal/grand-total:GET": "BOTH",
  "fiscal/verify:GET": "BOTH",
  "logs:GET": "SUPER_ADMIN",
  "media:DELETE": "INLINE_ANY",
  "media:GET": "ANY",
  "orders:GET": "ANY",
  "orders:POST": "ANY",
  "orders/[id]:GET": "ANY",
  "orders/[id]/print:POST": "ANY",
  "orders/[id]/refund:POST": "ANY",
  "orders/[id]/reprint:POST": "BOTH",
  "print/printers:GET": "BOTH",
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
  "settings:PUT": "INLINE_SA",
  "setup/chain-key:POST": "SUPER_ADMIN",
  "setup/secrets:GET": "SUPER_ADMIN",
  "setup/secrets:POST": "SUPER_ADMIN",
  "shifts:GET": "ANY",
  "shifts:POST": "ANY",
  "shifts/[id]/close:POST": "ANY",
  "shifts/current:GET": "ANY",
  "shifts/summary:GET": "ANY",
  "tables:GET": "ANY",
  "tables:POST": "INLINE_SA",
  "tables/[id]:DELETE": "BOTH",
  "tables/[id]:PUT": "ANY",
  "tables/seed:POST": "BOTH",
  "upload:POST": "BOTH",
  "users:GET": "SUPER_ADMIN",
  "users:POST": "INLINE_SA",
  "users/[id]:DELETE": "INLINE_SA",
  "users/[id]:PUT": "INLINE_SELF",
  };

  /** Where the next `export const <METHOD> = withAuth(` starts, or EOF. */
  function nextExportIndex(src: string, from: number): number {
    const rest = src.slice(from + 10);
    const m = /export const (?:GET|POST|PUT|PATCH|DELETE)\s*=\s*withAuth/.exec(rest);
    return m ? from + 10 + m.index : src.length;
  }

  // ── L-120 (audit pass 2): the detector below replaces a regex that could
  // not tell a guard from a no-op ─────────────────────────────────────────────
  //
  // What was here:
  //
  //     /user\.role\s*!==\s*"SUPER_ADMIN"/.test(handlerSource)
  //
  // It matched BOTH of these and called both `INLINE`:
  //
  //     if (user.role !== "SUPER_ADMIN") return 403                           // refuses MANAGER
  //     if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") return 403 // refuses NOBODY
  //
  // The second form names every role the product has (DD-07 left two), so the
  // condition is unsatisfiable and the guard is dead code. **Seven handlers
  // already use it**, which is why it reads as idiomatic and would survive
  // review. `settings:PUT` was classified `INLINE` on the strength of that
  // regex and nothing else, while `settingsSchema` carries
  // `discountApprovalThreshold` (max 100 — every discount escapes the DD-19
  // step-up) and `factice` (the R6.3 stamp).
  //
  // So: parse the condition instead of grepping it, and derive « who does this
  // refuse? » from `ROLES` rather than hard-coding it — add a third role and
  // the classification updates itself.
  //
  // AND FAIL LOUDLY ON ANYTHING UNRECOGNISED. That is the actual lesson of
  // L-120: a detector whose unknown case is `false` reports "no guard here"
  // for a guard it merely could not read, which is the same silence it is
  // supposed to break. Every unparsed shape throws with the text it choked on.

  /** One conjunct of a guard condition, classified. */
  type Clause =
    | { kind: "role"; role: string }
    | { kind: "self" }
    | { kind: "unknown"; text: string };

  /** The kinds of inline guard this codebase actually contains. */
  type InlineKind = "INLINE_SA" | "INLINE_ANY" | "INLINE_SELF";

  /**
   * The full `if (…)` condition containing the first `user.role !==` in `body`,
   * extracted by balancing parentheses rather than by regex — a condition that
   * spans lines or contains its own parens must not be truncated into
   * something that happens to look narrow.
   */
  function guardCondition(body: string): string | null {
    const hit = /user\.role\s*!==/.exec(body);
    if (!hit) return null;
    const ifAt = body.lastIndexOf("if (", hit.index);
    if (ifAt === -1) throw new Error(`a \`user.role !==\` outside any \`if (\`: ${body.slice(hit.index, hit.index + 80)}`);
    let depth = 0;
    for (let i = ifAt + 3; i < body.length; i++) {
      if (body[i] === "(") depth++;
      else if (body[i] === ")") {
        depth--;
        if (depth === 0) return body.slice(ifAt + 4, i).trim();
      }
    }
    throw new Error(`unbalanced \`if (\` in a role guard: ${body.slice(ifAt, ifAt + 120)}`);
  }

  /** Strip only WRAPPING parentheses — `(a)` → `a`, but `f(x)` is left whole.
   *  A greedy strip turned `!isSomethingElse(user)` into `!isSomethingElse(user`
   *  in the failure message, which is a misquote in the one place someone is
   *  reading carefully. */
  function unwrap(text: string): string {
    let t = text.trim();
    while (t.startsWith("(") && t.endsWith(")")) {
      let depth = 0;
      let wraps = true;
      for (let i = 0; i < t.length; i++) {
        if (t[i] === "(") depth++;
        else if (t[i] === ")") {
          depth--;
          if (depth === 0 && i < t.length - 1) { wraps = false; break; }
        }
      }
      if (!wraps) break;
      t = t.slice(1, -1).trim();
    }
    return t;
  }

  function parseClause(text: string): Clause {
    const t = unwrap(text);
    const role = /^user\.role\s*!==\s*"([A-Z_]+)"$/.exec(t);
    if (role) return { kind: "role", role: role[1] };
    if (/^user\.id\s*!==\s*\w+(\.\w+)*$/.test(t)) return { kind: "self" };
    return { kind: "unknown", text: t };
  }

  /**
   * Classify the inline guard in `body`, or `null` when there is none.
   *
   * Only `&&`-chains are understood. A `||` between role comparisons inverts
   * the meaning entirely — `!== "SUPER_ADMIN" || !== "MANAGER"` refuses
   * everybody — and guessing at one is exactly the mistake this replaces, so
   * it throws instead.
   */
  function classifyInline(body: string): InlineKind | null {
    const cond = guardCondition(body);
    if (cond === null) return null;
    if (/\|\|/.test(cond)) {
      throw new Error(`a role guard joined with \`||\`, whose meaning is not the same as \`&&\`: ${cond}`);
    }
    const clauses = cond.split("&&").map(parseClause);
    const unknown = clauses.filter((c) => c.kind === "unknown");
    if (unknown.length) {
      throw new Error(
        `unrecognised clause in a role guard — teach this parser rather than ` +
          `letting it report "no guard": ${unknown.map((c) => (c as { text: string }).text).join(" | ")} ` +
          `(whole condition: ${cond})`,
      );
    }
    const named = clauses.flatMap((c) => (c.kind === "role" ? [c.role] : []));
    if (named.length === 0) throw new Error(`a guard condition with no role comparison: ${cond}`);
    // The body runs — i.e. the request is refused — only when EVERY conjunct is
    // true, so the roles it refuses are the ones this condition does not name.
    const refused = ROLES.filter((r) => !named.includes(r));
    if (refused.length === 0) return "INLINE_ANY";
    if (clauses.some((c) => c.kind === "self")) return "INLINE_SELF";
    if (named.length === 1 && named[0] === "SUPER_ADMIN") return "INLINE_SA";
    throw new Error(`a role guard shape this table has no name for yet: ${cond}`);
  }

  /** The body of one exported handler, as source text. */
  function handlerSource(route: string, method: string): string | null {
    const src = readFileSync(path.join(API_ROOT, route, "route.ts"), "utf8");
    const at = src.indexOf(`export const ${method} =`);
    if (at === -1) return null;
    return src.slice(at, nextExportIndex(src, at));
  }

  /** What kind of inline guard does this handler carry? (L-32, L-120) */
  function guardsInline(route: string, method: string): InlineKind | null {
    const body = handlerSource(route, method);
    if (body === null) return null;
    return classifyInline(body);
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
          : (guardsInline(route, method) ?? "ANY");
      }
    }

    // Every handler is classified, and nothing is classified that no longer
    // exists — a route deleted without touching this table fails here too.
    expect(Object.keys(seen).sort()).toEqual(Object.keys(GATES).sort());
    expect(seen).toEqual(GATES);
  });

  /** The roles an inline guard of this kind refuses outright. */
  function refusedByInline(kind: InlineKind): string[] {
    switch (kind) {
      case "INLINE_ANY":
        return []; // names every role, so the condition never holds
      case "INLINE_SA":
        return ROLES.filter((r) => r !== "SUPER_ADMIN");
      case "INLINE_SELF":
        // Refused unless acting on their own row — conditional, but for the
        // purpose of « does the declared gate tell the truth? » it is a refusal.
        return ROLES.filter((r) => r !== "SUPER_ADMIN");
    }
  }

  it("no declared gate is contradicted by a guard inside its own handler (L-120)", async () => {
    // The classification above takes a DECLARED gate at its word and only
    // parses the body when no roles are declared. That leaves the other door
    // open: a handler can declare `["SUPER_ADMIN", "MANAGER"]` and then refuse
    // the MANAGER in its first three lines. The map then says a role may call
    // a route that answers it 403 — the same lie L-120 is about, reached from
    // the opposite side, and invisible to every assertion in this file until
    // now.
    //
    // Found by this check on the day it was written, and NOT fixed here:
    // whether a MANAGER should be able to seed the default tables is a product
    // question, not a test-suite one. Recorded as **L-184**. Pinning the known
    // case keeps the suite honest — green, but green with the exception
    // written down — and makes a SECOND one a failure.
    const KNOWN: Record<string, string> = {
      "tables/seed:POST": "L-184 — declares BOTH, body answers a MANAGER 403 " +
        "« Réservé au super administrateur ». Decide which is right, then delete this line.",
    };

    const contradictions: string[] = [];
    for (const route of ROUTES) {
      const mod = (await importRoute(route)) as Record<string, unknown>;
      for (const method of METHODS) {
        const handler = mod[method];
        if (typeof handler !== "function") continue;
        const declared = roleGateOf(handler)?.roles;
        if (!declared) continue; // no declared gate — the classifier owns these
        const kind = guardsInline(route, method);
        if (!kind) continue;
        const declaredNames: string[] = declared;
        const refused = refusedByInline(kind).filter((r) => declaredNames.includes(r));
        if (refused.length) contradictions.push(`${route}:${method} declares ${declared.join("+")} but its body refuses ${refused.join("+")}`);
      }
    }

    const unexpected = contradictions.filter(
      (c) => !Object.keys(KNOWN).some((k) => c.startsWith(k + " ")),
    );
    expect(
      unexpected,
      `a declared gate is contradicted by the handler's own guard. Either the ` +
        `declaration or the guard is wrong — decide which, do not silence this: ` +
        unexpected.join("; "),
    ).toEqual([]);

    // And the known one is still there: deleting the guard without deleting
    // this line should fail too, so the exception cannot outlive its cause.
    expect(contradictions.map((c) => c.split(" ")[0]).sort()).toEqual(Object.keys(KNOWN).sort());
  });

  it("the count of genuinely-narrow gates is what the review left (DD-22)", () => {
    // Stated as numbers so that widening one gate and narrowing another —
    // which the per-key comparison catches, but as two failures that could be
    // read as noise — shows up as one legible change.
    const counts = Object.values(GATES).reduce<Record<string, number>>((acc, v) => {
      acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    }, {});
    // AMENDED 2026-09-06 (Batch 3.8, DD-23): BOTH 29 → 30, the one new route
    // `fiscal/close-day`. Every other number is unmoved, which is the whole
    // point of stating them: a batch that added a route AND quietly widened an
    // existing gate would show up here as two changes, not one.
    // AMENDED 2026-09-09 (Batch 1.3d, L-70): BOTH 30 -> 31, the one new route
    // `print/printers`, which lists the Windows print queues for the settings
    // picker. ANY, INLINE and SUPER_ADMIN are unmoved, which is this
    // assertion earning its keep: it is the proof that adding a route did not
    // also widen an existing gate.
    // AMENDED 2026-09-11 (catalogue transfer): SUPER_ADMIN 7 -> 9, the two new
    // routes `catalog/export:GET` and `catalog/import:POST`. **BOTH, ANY and
    // INLINE are unmoved**, and that is this assertion doing its job — it is
    // the proof that two routes were added and no existing gate was widened to
    // make room for them.
    // AMENDED 2026-09-11 (first-run keys): SUPER_ADMIN 9 -> 12, the three new
    // `setup/*` routes. BOTH, ANY and INLINE unmoved again.
    // AMENDED 2026-09-13 (R9.6, L-120): INLINE 14 splits into INLINE_SA 6,
    // INLINE_ANY 7 and INLINE_SELF 1 — 6 + 7 + 1 = 14, and BOTH, ANY and
    // SUPER_ADMIN are all unmoved. **No gate changed. The map stopped lying
    // about seven of them.** Those seven name every role in the product, so
    // they refuse nobody: `catalog/categories` × 3, `catalog/products` × 3 and
    // `media:DELETE` are open to any authenticated caller and always were.
    // Whether they SHOULD be is a review, not this item — recorded as **L-183**
    // in `docs/audit/FINDINGS.md`. What changed here is that the table now says
    // so out loud instead of counting them among the guards.
    expect(counts).toEqual({
      BOTH: 31,
      ANY: 26,
      INLINE_SA: 6,
      INLINE_ANY: 7,
      INLINE_SELF: 1,
      SUPER_ADMIN: 12,
    });
  });

  it("matches the expected gate wherever one is pinned", async () => {
    for (const [key, expected] of Object.entries(EXPECTED_ROLES)) {
      const [route, method] = key.split(":");
      const mod = (await importRoute(route)) as Record<string, unknown>;
      expect(roleGateOf(mod[method])?.roles, key).toEqual(expected);
    }
  });
});
