#!/usr/bin/env bun
/**
 * L-39 (R4.4) — trim the stray leading/trailing whitespace out of catalogue
 * names, so they stop rendering indented on the till.
 *
 * ── IT IS A DRY RUN UNLESS GIVEN `--apply` ──────────────────────────────────
 *   bun scripts/trim-catalogue-names.ts            # list what would change
 *   bun scripts/trim-catalogue-names.ts --apply    # change it, then verify
 *
 * ── WHY A SCRIPT AND NOT FOURTEEN `UPDATE` STATEMENTS ───────────────────────
 * Because it can refuse. Raw SQL pasted into a shell cannot check that trimming
 * would not collide two siblings into the same name, cannot verify afterwards,
 * and cannot take a restore point. This does all three, and it addresses rows
 * by **id** — never by name, which is the thing being changed.
 *
 * ── WHAT IT TOUCHES ─────────────────────────────────────────────────────────
 * Only `name`, and only where `name <> trim(name)`, in the tables that carry a
 * label the till renders: Product, Category, CategoryOptionGroup,
 * CategoryOptionChoice, CategoryAddOn, OptionGroup, OptionChoice, ComboSlot.
 * Measured on the live catalogue 2026-09-11: fourteen rows, all a single ASCII
 * space (0x20) — one `CategoryOptionGroup` trailing («Sauces »), ten
 * `CategoryOptionChoice` and three `CategoryAddOn` leading. No tabs, no NBSP,
 * no zero-width characters.
 *
 * ── THE ONE THING THAT COULD MAKE THIS UNSAFE ───────────────────────────────
 * A trim that makes two siblings identical — two choices in one group, two
 * add-ons in one category. The script checks for that and REFUSES the whole run
 * if it finds one. (Measured: none today.)
 *
 * Nothing in the application matches these names by text. The references that
 * exist are test fixtures and `seed.ts`, which construct their own clean rows.
 * `normalizeGroupName()` in `product-options.ts` already trims for the
 * inheritance rule — its doc comment names « Sauces » as the case it absorbs —
 * so option inheritance behaves identically before and after.
 */

import { PrismaClient } from "@prisma/client";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { createHash } from "crypto";

const APPLY = process.argv.includes("--apply");

/** Tables whose `name` the till renders, with the column that groups siblings. */
const TABLES: { table: string; siblingKey: string | null }[] = [
  { table: "Product", siblingKey: "categoryId" },
  { table: "Category", siblingKey: "parentId" },
  { table: "CategoryOptionGroup", siblingKey: "categoryId" },
  { table: "CategoryOptionChoice", siblingKey: "groupId" },
  { table: "CategoryAddOn", siblingKey: "categoryId" },
  { table: "OptionGroup", siblingKey: "productId" },
  { table: "OptionChoice", siblingKey: "groupId" },
  { table: "ComboSlot", siblingKey: "productId" },
];

function databasePath(): string {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) {
    console.error("DATABASE_URL must be a file: URL. Run from the project root.");
    process.exit(1);
  }
  return resolve(url.slice("file:".length).split("?")[0]);
}

const sha256 = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");
const visible = (s: string) => `«${s}»`;

const db = new PrismaClient();
const dbPath = databasePath();

type Row = { id: string; name: string; sibling: string | null };

async function dirtyRows(table: string, siblingKey: string | null): Promise<Row[]> {
  const key = siblingKey ? `"${siblingKey}"` : "NULL";
  return db.$queryRawUnsafe<Row[]>(
    `SELECT id, name, ${key} AS sibling FROM "${table}" WHERE name <> trim(name) ORDER BY name`,
  );
}

/** Would trimming make two siblings share a name? */
async function collisions(table: string, siblingKey: string | null): Promise<string[]> {
  const key = siblingKey ? `"${siblingKey}"` : `''`;
  const rows = await db.$queryRawUnsafe<{ sibling: string | null; n: string; c: number }[]>(
    `SELECT ${key} AS sibling, lower(trim(name)) AS n, COUNT(*) AS c
       FROM "${table}" GROUP BY ${key}, lower(trim(name)) HAVING c > 1`,
  );
  return rows.map((r) => `${table}: ${r.c} rows would share « ${r.n} » under ${r.sibling ?? "(no parent)"}`);
}

async function main() {
  console.log("");
  console.log("  Database : " + dbPath);
  console.log("  sha256   : " + sha256(dbPath));
  console.log("");

  const found: { table: string; rows: Row[] }[] = [];
  const clashes: string[] = [];
  for (const { table, siblingKey } of TABLES) {
    let rows: Row[] = [];
    try {
      rows = await dirtyRows(table, siblingKey);
    } catch {
      continue; // table or column absent in this schema version
    }
    if (rows.length) found.push({ table, rows });
    clashes.push(...(await collisions(table, siblingKey)));
  }

  const total = found.reduce((n, f) => n + f.rows.length, 0);
  if (total === 0) {
    console.log("  NOTHING TO TRIM — every catalogue name is already clean.");
    console.log("");
    return 0;
  }

  console.log(`  ${total} name(s) carry leading or trailing whitespace:`);
  for (const { table, rows } of found) {
    console.log("");
    console.log(`  ${table} (${rows.length})`);
    for (const r of rows) {
      console.log(`     ${visible(r.name)}  ->  ${visible(r.name.trim())}`);
    }
  }
  console.log("");

  // THE REFUSAL. A trim that merges two siblings is the one unsafe outcome.
  if (clashes.length) {
    console.error("  REFUSED: trimming would make siblings share a name.");
    for (const c of clashes) console.error("     " + c);
    console.error("  Rename one of them first; nothing was changed.");
    return 1;
  }
  console.log("  Collision check: none — no two siblings would share a name.");

  if (!APPLY) {
    console.log("");
    console.log("  DRY RUN. Nothing was changed.");
    console.log("     bun scripts/trim-catalogue-names.ts --apply");
    console.log("");
    return 0;
  }

  // A restore point, for the same reason the migration script takes one: this
  // edits the only copy of a real restaurant's catalogue.
  const stamp = new Date(statSync(dbPath).mtime).toISOString().slice(0, 10);
  const snapDir = resolve(dirname(dbPath), "..", "..", "db-snapshots");
  mkdirSync(snapDir, { recursive: true });
  const snap = join(snapDir, `custom.db.before-trim-names-${stamp}`);
  if (existsSync(snap)) {
    console.error(`  REFUSED: ${snap} already exists. Move it aside first.`);
    return 1;
  }
  copyFileSync(dbPath, snap);
  if (sha256(snap) !== sha256(dbPath)) {
    console.error("  REFUSED: the restore point does not match the original.");
    return 1;
  }
  console.log("");
  console.log("  Restore point: " + snap);

  let changed = 0;
  for (const { table, rows } of found) {
    for (const r of rows) {
      // BY ID, never by name — the name is the thing being changed.
      await db.$executeRawUnsafe(`UPDATE "${table}" SET name = ? WHERE id = ?`, r.name.trim(), r.id);
      changed += 1;
    }
  }

  // Verify rather than assume.
  let left = 0;
  for (const { table, siblingKey } of TABLES) {
    try {
      left += (await dirtyRows(table, siblingKey)).length;
    } catch {
      /* table absent */
    }
  }

  console.log("");
  console.log("  ── RESULT ──────────────────────────────────────────────────");
  console.log(`  Trimmed        : ${changed}`);
  console.log(`  Still untrimmed: ${left}`);
  console.log(`  sha256         : ${sha256(dbPath)}`);
  console.log("");
  console.log(left === 0 ? "  ✅ TRIMMED AND VERIFIED." : "  ❌ SOME NAMES REMAIN — read above.");
  return left === 0 ? 0 : 1;
}

main()
  .then(async (code) => {
    await db.$disconnect();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
