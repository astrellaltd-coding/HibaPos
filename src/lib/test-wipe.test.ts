import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { wipeDatabase, WIPE_ORDER } from "@/lib/test-wipe";

// L-154 (R9.7) — the wipe order is a thing, and it is checked.
//
// A shared helper that goes stale is worse than 71 hand-maintained lists,
// because everyone stops looking. So this file pins the two ways it can rot:
// **a model added to the schema and not to the order**, and **a file
// reintroducing the order bug in its own `deleteMany` sequence.**

const REPO_ROOT = process.cwd();

/** Every model in `schema.prisma`, as Prisma's client would name it. */
function schemaModels(): string[] {
  const schema = readFileSync(path.join(REPO_ROOT, "prisma", "schema.prisma"), "utf8");
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)]
    .map((m) => m[1])
    .map((n) => n.charAt(0).toLowerCase() + n.slice(1));
}

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return testFiles(full);
    return /\.test\.tsx?$/.test(full) ? [full] : [];
  });
}

describe("L-154 — one wipe order, and it cannot go stale", () => {
  it("covers every model the schema declares", () => {
    // THE WAY A SHARED HELPER ROTS. A table added next month that nobody adds
    // here leaves rows behind on every wipe, and the next file to delete its
    // parent dies on a foreign key three files away — which is L-154's whole
    // description.
    const missing = schemaModels().filter((m) => !(WIPE_ORDER as readonly string[]).includes(m));
    expect(
      missing,
      `these models are in schema.prisma and not in WIPE_ORDER: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("names nothing the schema does not have", () => {
    // The other direction: a renamed model would leave a dead entry that
    // throws at runtime rather than being skipped.
    const models = schemaModels();
    const unknown = (WIPE_ORDER as readonly string[]).filter((m) => !models.includes(m));
    expect(unknown, `not in schema.prisma: ${unknown.join(", ")}`).toEqual([]);
  });

  it("puts the two Restrict children before their parents", () => {
    // These are the edges that THROW rather than cascade, and they are the two
    // the finding is about.
    const at = (m: string) => (WIPE_ORDER as readonly string[]).indexOf(m);
    expect(at("zReport"), "ZReport.shiftId is Restrict").toBeLessThan(at("shift"));
    expect(at("refund"), "Refund.orderId is Restrict").toBeLessThan(at("order"));
  });

  it("puts every child before its parent, read from the schema", () => {
    // Not just the two known ones. Every `@relation(fields: […])` in the schema
    // is a child pointing at a parent, and the order has to respect all of
    // them — derived, so a new relation is covered without anyone remembering.
    const schema = readFileSync(path.join(REPO_ROOT, "prisma", "schema.prisma"), "utf8");
    const at = (m: string) => (WIPE_ORDER as readonly string[]).indexOf(m);

    const violations: string[] = [];
    let current: string | null = null;
    for (const line of schema.split("\n")) {
      const model = /^model\s+(\w+)\s*\{/.exec(line);
      if (model) {
        current = model[1].charAt(0).toLowerCase() + model[1].slice(1);
        continue;
      }
      if (!current) continue;
      // `  order  Order  @relation(fields: [orderId], references: [id], …)`
      const rel = /^\s*\w+\s+(\w+)(\?|\[\])?\s+@relation\(fields:/.exec(line);
      if (!rel) continue;
      const parent = rel[1].charAt(0).toLowerCase() + rel[1].slice(1);
      if (parent === current) continue; // self-relation
      if (at(current) < 0 || at(parent) < 0) continue;
      if (at(current) > at(parent)) {
        violations.push(`${current} is deleted after its parent ${parent}`);
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("actually empties the database, in an order the keys accept", async () => {
    // The helper doing its job, on real rows, with FK enforcement on. A
    // `Restrict` violation throws, so getting to the end IS the assertion.
    const user = await db.user.create({
      data: { username: `wipe-${Date.now()}-${Math.random()}`, name: "W", role: "MANAGER", pinHash: "x:y" },
    });
    const shift = await db.shift.create({
      data: { number: 9998, openedById: user.id, openingFloat: 0, status: "OPEN" },
    });
    // The exact row that makes `shift.deleteMany()` throw when the order is
    // wrong — `ZReport.shiftId` is Restrict.
    await db.zReport.create({
      data: {
        number: 9998,
        shiftId: shift.id,
        salesTotal: 0,
        salesCount: 0,
        vatTotal: 0,
        cashTotal: 0,
        cardTotal: 0,
        voucherTotal: 0,
        discountsTotal: 0,
        openingFloat: 0,
        expectedCash: 0,
        closingFloat: 0,
        cashVariance: 0,
      },
    });

    await wipeDatabase();

    expect(await db.zReport.count()).toBe(0);
    expect(await db.shift.count()).toBe(0);
    expect(await db.user.count()).toBe(0);
  });

  it("keeps what it is told to keep", async () => {
    const user = await db.user.create({
      data: { username: `keep-${Date.now()}-${Math.random()}`, name: "K", role: "MANAGER", pinHash: "x:y" },
    });
    await wipeDatabase({ keep: ["user"] });
    expect(await db.user.count()).toBe(1);
    await db.user.delete({ where: { id: user.id } });
  });
});

describe("L-154 — no test file reintroduces the order bug", () => {
  it("never deletes Shift before ZReport, or Order before Refund", () => {
    // The guard that makes the helper stick. Seventeen files had the first of
    // these when R9.7 measured it — the audit counted fourteen, so it was
    // growing — and each survived only because it happened not to create the
    // row that would block it.
    //
    // Files are allowed to keep their own sequences; what they may not do is
    // put a Restrict child after its parent.
    const offenders: string[] = [];
    for (const file of testFiles(path.join(REPO_ROOT, "src"))) {
      const src = readFileSync(file, "utf8");
      const calls = [...src.matchAll(/db\.(\w+)\.deleteMany/g)].map((m) => m[1]);
      if (calls.length === 0) continue;
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");

      for (const [child, parent] of [
        ["zReport", "shift"],
        ["refund", "order"],
      ] as const) {
        const p = calls.indexOf(parent);
        if (p < 0) continue;
        const c = calls.indexOf(child);
        if (c < 0 || c > p) {
          offenders.push(`${rel}: deletes ${parent} without ${child} before it`);
        }
      }
    }
    expect(offenders, `${offenders.length} file(s):\n${offenders.join("\n")}`).toEqual([]);
  });
});
