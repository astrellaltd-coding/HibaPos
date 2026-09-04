import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { LEAST_PRIVILEGED_ROLE, NAV_ITEMS, canAccessView } from "@/components/shared/nav-config";
import type { AppView } from "@/store/app-store";

// DD-07 (2026-09-04), Batch 4.4b — the product has one operational role.
//
// The restaurant's owner asked for a single operational role. `CASHIER` was
// implemented and navigable, no such account ever existed, its discount
// ceiling never fired, and the half-supported state was what kept M-19s open.
// Batch 4.4b removed it from the enum, the union, both zod schemas, the nav
// table, the login screen, two server gates and one client mirror.
//
// This file asserts the removal mechanically. The batch's validation criterion
// says "assert it, do not eyeball it": a role can be reintroduced by a single
// string literal in one route, and a reviewer reading a diff will not catch it
// the way a test walking the tree will.

const REPO_ROOT = process.cwd();
const SRC = path.join(REPO_ROOT, "src");
const SCHEMA = path.join(REPO_ROOT, "prisma", "schema.prisma");
const REMOVED_ROLE = "CASHIER";

/** Every .ts/.tsx under src/, plus the Prisma schema. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...sourceFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/** Strip `/* … *\/` blocks, then report the lines that still mention `token`
 *  and are not themselves comment lines.
 *
 *  The comment test is deliberately blunt: a surviving line passes only if its
 *  trimmed form opens with `//`, `*` or `/*`. That is every comment style in
 *  this codebase, and it errs toward failing — a trailing `// CASHIER` on a
 *  line of code would be reported rather than excused. A false positive here
 *  costs a comment move; a false negative costs the assertion its point. */
function codeLinesMentioning(source: string, token: string): string[] {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return withoutBlocks
    .split(/\r?\n/)
    .filter((line) => line.includes(token))
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .map((line) => line.trim());
}

describe("DD-07 — CASHIER is gone from the product", () => {
  it("finds the source tree", () => {
    // A guard on the guard: a walk that silently returned nothing would make
    // every assertion below pass vacuously.
    expect(sourceFiles(SRC).length).toBeGreaterThan(100);
  });

  it("leaves no reference outside a comment, anywhere under src/", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      // This file names the role in a string constant on purpose.
      if (file === path.join(SRC, "lib", "role-model.test.ts")) continue;
      for (const line of codeLinesMentioning(readFileSync(file, "utf8"), REMOVED_ROLE)) {
        offenders.push(`${path.relative(REPO_ROOT, file)}: ${line}`);
      }
    }
    // Named individually so a failure says where, not just how many.
    expect(offenders).toEqual([]);
  });

  it("leaves no value in the Prisma enum", () => {
    const schema = readFileSync(SCHEMA, "utf8");
    expect(codeLinesMentioning(schema, REMOVED_ROLE)).toEqual([]);
    // …and the enum still holds the two roles that remain, so a removal that
    // took the wrong line with it fails here.
    const block = /enum UserRole \{([^}]*)\}/.exec(schema);
    expect(block).not.toBeNull();
    const values = block![1]
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("//"));
    expect(values).toEqual(["SUPER_ADMIN", "MANAGER"]);
  });

  it("leaves no role in the nav table that the enum does not have", () => {
    const declared = new Set(NAV_ITEMS.flatMap((i) => i.roles));
    expect([...declared].sort()).toEqual(["MANAGER", "SUPER_ADMIN"]);
  });
});

describe("the fail-closed default after the removal", () => {
  it("falls to MANAGER, which is now the floor", () => {
    // Batch 4.4b degraded C-16's default by exactly one rung, deliberately.
    // Written down as an assertion so the degradation cannot be mistaken for
    // an oversight, and so restoring a lower role is a visible change here.
    expect(LEAST_PRIVILEGED_ROLE).toBe("MANAGER");
  });

  it("still refuses users, backups and logs to that floor", () => {
    // The reason the degradation is acceptable: the floor is still meaningfully
    // closed. `backups` holds the restore button, which overwrites the live
    // database; `users` holds PIN management; `logs` is the technical journal.
    for (const view of ["users", "backups", "logs"] as const) {
      expect(canAccessView(LEAST_PRIVILEGED_ROLE, view)).toBe(false);
      expect(canAccessView(undefined, view)).toBe(false);
      expect(canAccessView(null, view)).toBe(false);
    }
  });

  it("still refuses a view that is not in the nav table at all", () => {
    // An unknown hash must not fall through to "allowed" now that the default
    // role is a more privileged one.
    expect(canAccessView(undefined, "nonsense" as AppView)).toBe(false);
  });
});
