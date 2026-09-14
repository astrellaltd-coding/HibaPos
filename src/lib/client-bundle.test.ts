import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

// L-160 (R10.1) — no database in the browser bundle.
//
// THE FINDING: `cash-movement-dialog.tsx` is `"use client"` and imported two
// pure values from `services/cash-movement.ts`, whose module graph is
// `@/lib/db` → `@prisma/client`. Confirmed in the built artifact by a reverse
// import graph over 104 modules: a **501.7 KB client chunk** — the largest, and
// 19 % of 2.68 MB of client JS — containing `db.ts` compiled for the browser.
//
// It did not crash and **no secret leaked**. What it cost was a till loading
// half a megabyte of Prisma to draw a dialog. After the fix, measured the same
// way: largest chunk **376 KB**, total client JS **2.3 MB**, and **no Prisma in
// any chunk**.
//
// **THE FIX IS ON THE SERVICE SIDE, NEVER IN `db.ts`.** That module's top-level
// `globalThis` assignment is an invariant — it is what stops two PrismaClients
// existing, which was L-61's cause — and it is also what makes the module
// un-tree-shakeable.
//
// ── WHY THIS READS IMPORTS AND NOT THE BUILD ────────────────────────────────
// `bun test src` does not build, and `.next/` may be absent or stale on any
// given machine. So the INVARIANT is asserted over the source — no client
// module may reach `@/lib/db` — and the bundle is checked only when a build
// happens to be present. The import graph is the thing that is actually true;
// the artifact is evidence of it.

const REPO_ROOT = process.cwd();
const SRC = path.join(REPO_ROOT, "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : [];
  });
}

const rel = (f: string) => path.relative(REPO_ROOT, f).split(path.sep).join("/");

/** `@/lib/foo` → the file it resolves to, or null. */
function resolveAlias(spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const base = path.join(SRC, spec.slice(2));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* not this one */
    }
  }
  return null;
}

function importsOf(file: string): string[] {
  const src = readFileSync(file, "utf8");
  return [...src.matchAll(/from\s+"(@\/[^"]+)"/g)].map((m) => m[1]);
}

/** Every module reachable from `entry`, following `@/` imports. */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of importsOf(file)) {
      const next = resolveAlias(spec);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

const CLIENT_ENTRIES = sourceFiles(SRC).filter((f) =>
  /^\s*["']use client["']/.test(readFileSync(f, "utf8")),
);

describe("L-160 — no `\"use client\"` module can reach the database", () => {
  it("finds the client entry points at all", () => {
    // Without this the sweep below passes over an empty set, which is the
    // vacuous shape this project has been bitten by four times.
    expect(CLIENT_ENTRIES.length, "no \"use client\" files found").toBeGreaterThan(5);
    expect(CLIENT_ENTRIES.map(rel)).toContain("src/features/shifts/cash-movement-dialog.tsx");
  });

  it("reaches `@/lib/db` from none of them", () => {
    const db = path.join(SRC, "lib", "db.ts");
    const offenders: string[] = [];
    for (const entry of CLIENT_ENTRIES) {
      const graph = reachable(entry);
      if (!graph.has(db)) continue;
      // Name the shortest path, because « this file pulls in Prisma » is not
      // actionable and « through this import » is.
      const via = importsOf(entry)
        .map((s) => resolveAlias(s))
        .filter((f): f is string => f !== null && reachable(f).has(db))
        .map(rel);
      offenders.push(`${rel(entry)} → ${via.join(", ") || "@/lib/db"}`);
    }
    expect(
      offenders,
      `a client module reaches the database:\n${offenders.join("\n")}\n` +
        "Move the values it needs into a module with no `@/lib/db` in its graph — " +
        "`src/lib/cash-movement-policy.ts` is the pattern. Never change `db.ts`: its " +
        "top-level `globalThis` assignment is an invariant.",
    ).toEqual([]);
  });

  it("keeps the policy module free of the database, which is its whole job", () => {
    const policy = path.join(SRC, "lib", "cash-movement-policy.ts");
    const graph = [...reachable(policy)].map(rel);
    expect(graph, "the policy module now imports something").toEqual([
      "src/lib/cash-movement-policy.ts",
    ]);
  });

  it("still has ONE definition of DD-12's rules", () => {
    // L-155's property, which L-160 must not undo by copying the constants
    // instead of moving them. The service re-exports; it does not redeclare.
    const service = readFileSync(path.join(SRC, "lib", "services", "cash-movement.ts"), "utf8");
    expect(service).toContain('from "@/lib/cash-movement-policy"');
    expect(service, "the service declares its own copy again").not.toMatch(
      /const CASH_MOVEMENT_DIRECTION\s*:/,
    );
    expect(service, "the service declares its own category list again").not.toMatch(
      /const CASH_MOVEMENT_CATEGORIES\s*=/,
    );
  });
});

describe("L-160 — and the built artifact agrees, when there is one", () => {
  const chunks = path.join(REPO_ROOT, ".next", "static", "chunks");

  function builtChunks(): string[] {
    try {
      return readdirSync(chunks)
        .filter((f) => f.endsWith(".js"))
        .map((f) => path.join(chunks, f));
    } catch {
      return [];
    }
  }

  it("ships no Prisma to the browser", () => {
    const files = builtChunks();
    if (files.length === 0) {
      // `bun test src` does not build. The import graph above is the invariant;
      // this is evidence, and evidence is allowed to be absent.
      expect(true).toBe(true);
      return;
    }
    const leaking = files.filter((f) => /PrismaClient|query_engine/.test(readFileSync(f, "utf8")));
    expect(leaking.map((f) => path.basename(f)), "Prisma is in the client bundle").toEqual([]);
  });
});
