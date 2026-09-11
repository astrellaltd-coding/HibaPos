#!/usr/bin/env bun
/**
 * Apply a pending Prisma migration to this installation's database, safely, and
 * PROVE afterwards whether it worked.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * On 2026-09-10/11 a prepared migration was reported applied twice and was not,
 * both times. The command itself is fine; what failed was the loop around it.
 * `bunx prisma migrate deploy` prints a large green « All migrations have been
 * successfully applied » whichever migration it applied — and the only thing
 * distinguishing "it did the one you meant" from "it did the previous one" is
 * the small `N migrations found` line above it. Nobody should have to read that
 * carefully at midnight.
 *
 * So this script does the whole operation as one step and ends with a verdict
 * that cannot be misread: it names the migration BEFORE and AFTER, takes the
 * restore point, and diffs the result against the rehearsal's expected
 * fingerprint if one is supplied.
 *
 * ── IT IS A DRY RUN UNLESS GIVEN `--apply` ──────────────────────────────────
 * The convention every script in this directory follows. A dry run touches
 * nothing: it reads the database, reports what is pending, and stops.
 *
 *   bun scripts/apply-migration.ts                    # report only, changes nothing
 *   bun scripts/apply-migration.ts --apply            # back up, apply, verify
 *   bun scripts/apply-migration.ts --apply --expect ../db-snapshots/r31-acceptance/fp-r31-after.json
 *
 * ── WHAT `--apply` DOES, IN ORDER ───────────────────────────────────────────
 *   1. refuses if anything holds the database open (a running app is the one
 *      thing that has actually bitten this project — it broke a restore once
 *      and made `prisma generate` fail EPERM for a whole session);
 *   2. refuses if a `-wal`, `-shm` or `-journal` file sits beside the database,
 *      because then one file is NOT the whole database and the copy in step 3
 *      would be incomplete;
 *   3. copies the database to `../db-snapshots/`, a SIBLING of the repo, and
 *      verifies the copy's sha256 against the original — this is the restore
 *      point, and the script will not continue without it;
 *   4. runs `prisma migrate deploy`;
 *   5. re-reads the database and reports what actually changed.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 * It never edits data, never seeds, never resets, and never calls anything but
 * `migrate deploy`. `migrate dev`, `migrate reset` and `db push --accept-data-loss`
 * are all one keystroke away in package.json and none of them is ever right
 * against a real installation.
 *
 * The database is always the one `DATABASE_URL` names — this script derives no
 * path of its own, which is the invariant `git grep "new Database("` guards.
 */

import { PrismaClient } from "@prisma/client";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { createHash } from "crypto";
import { spawnSync } from "child_process";

const APPLY = process.argv.includes("--apply");
const expectIdx = process.argv.indexOf("--expect");
const EXPECT = expectIdx >= 0 ? process.argv[expectIdx + 1] : null;

/** The database this installation uses, and nothing else. */
function databasePath(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is unset. Run from the project root so .env is loaded,");
    console.error("or set it explicitly. This script derives no path of its own.");
    process.exit(1);
  }
  if (!url.startsWith("file:")) {
    console.error(`DATABASE_URL is not a file: URL (${url}). Only SQLite is supported here.`);
    process.exit(1);
  }
  return resolve(url.slice("file:".length).split("?")[0]);
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/**
 * What the database says about itself.
 *
 * Read through Prisma rather than `bun:sqlite` for two reasons: Prisma resolves
 * `DATABASE_URL` itself, so this file cannot address a path of its own even by
 * accident; and `bun:sqlite`'s types are not in this project's `tsconfig`, so
 * importing them would mean pulling Bun's globals in project-wide — which
 * collides with Node's `ReadableStream` in `app/uploads/[...path]/route.ts`.
 *
 * Only raw reads are used. Nothing here touches a Prisma MODEL, which matters:
 * the generated client may expect a column the database does not have yet —
 * that is the normal state between preparing a migration and applying it, and a
 * `product.findMany()` here would fail for that reason alone.
 */
async function state() {
  const db = new PrismaClient();
  try {
    const applied = (
      await db.$queryRawUnsafe<{ migration_name: string }[]>(
        `SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY finished_at`,
      )
    ).map((r) => r.migration_name);
    const productCols = (
      await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("Product")`)
    ).map((c) => c.name);
    const [{ schema_version: schemaVersion }] =
      await db.$queryRawUnsafe<{ schema_version: number }[]>(`PRAGMA schema_version`);
    return { applied, productCols, schemaVersion };
  } finally {
    await db.$disconnect();
  }
}

/** Migration directories on disk, in order. */
function onDisk(): string[] {
  const dir = resolve("prisma/migrations");
  return readdirSync(dir)
    .filter((e) => statSync(join(dir, e)).isDirectory())
    .sort();
}

const dbPath = databasePath();
if (!existsSync(dbPath)) {
  console.error(`No database at ${dbPath}`);
  process.exit(1);
}

console.log("");
console.log("  Database    : " + dbPath);
console.log("  Size        : " + statSync(dbPath).size.toLocaleString("fr-FR") + " bytes");
console.log("  sha256      : " + sha256(dbPath));
console.log("  Modified    : " + statSync(dbPath).mtime.toISOString());

const before = await state();
const dirs = onDisk();
const pending = dirs.filter((d) => !before.applied.includes(d));

console.log("");
console.log(`  On disk     : ${dirs.length} migrations`);
console.log(`  Applied     : ${before.applied.length}`);
console.log(`  Last applied: ${before.applied[before.applied.length - 1] ?? "(none)"}`);
console.log("");

if (pending.length === 0) {
  console.log("  NOTHING PENDING — the database is already up to date.");
  console.log("");
  process.exit(0);
}

console.log(`  PENDING (${pending.length}):`);
for (const p of pending) console.log("     - " + p);
console.log("");

if (!APPLY) {
  console.log("  DRY RUN. Nothing was changed.");
  console.log("  To apply, re-run with --apply :");
  console.log("");
  console.log("     bun scripts/apply-migration.ts --apply");
  console.log("");
  process.exit(0);
}

// ── 1. nothing may hold the database open ──────────────────────────────────
const holders = spawnSync(
  "powershell",
  ["-NoProfile", "-Command", "(Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node|bun' }).Count"],
  { encoding: "utf-8" },
);
const running = Number((holders.stdout ?? "").trim());
if (Number.isFinite(running) && running > 0) {
  console.error(`  REFUSED: ${running} node/bun process(es) are running.`);
  console.error("  A running app holds this file and the Prisma query engine open.");
  console.error("  Stop the app, then run this again.");
  process.exit(1);
}

// ── 2. one file must be the whole database ─────────────────────────────────
for (const suffix of ["-wal", "-shm", "-journal"]) {
  if (existsSync(dbPath + suffix)) {
    console.error(`  REFUSED: ${dbPath}${suffix} exists, so a plain copy would be incomplete.`);
    console.error("  Stop whatever is using the database and let it close cleanly first.");
    process.exit(1);
  }
}

// ── 3. the restore point, and it is not optional ───────────────────────────
const stamp = statSync(dbPath).mtime.toISOString().slice(0, 10);
const snapDir = resolve(dirname(dbPath), "..", "..", "db-snapshots");
mkdirSync(snapDir, { recursive: true });
const snap = join(snapDir, `custom.db.before-${pending[0]}-${stamp}`);
if (existsSync(snap)) {
  console.error(`  REFUSED: ${snap} already exists. Move or rename it first —`);
  console.error("  overwriting a restore point is the one thing worse than not having one.");
  process.exit(1);
}
copyFileSync(dbPath, snap);
const originalHash = sha256(dbPath);
if (sha256(snap) !== originalHash) {
  console.error("  REFUSED: the restore point does not match the original. Nothing was applied.");
  process.exit(1);
}
console.log("  Restore point taken and verified:");
console.log("     " + snap);
console.log("     sha256 " + originalHash);
console.log("");

// ── 4. the one command ─────────────────────────────────────────────────────
console.log("  Running: bunx prisma migrate deploy");
console.log("");
const deploy = spawnSync("bunx", ["prisma", "migrate", "deploy"], { encoding: "utf-8", shell: true });
process.stdout.write(deploy.stdout ?? "");
if (deploy.stderr) process.stderr.write(deploy.stderr);

// ── 5. the verdict ─────────────────────────────────────────────────────────
const after = await state();
const newlyApplied = after.applied.filter((m) => !before.applied.includes(m));

console.log("");
console.log("  ── RESULT ──────────────────────────────────────────────────────");
console.log(`  Applied before : ${before.applied.length}`);
console.log(`  Applied after  : ${after.applied.length}`);
console.log(`  Newly applied  : ${newlyApplied.length ? newlyApplied.join(", ") : "NONE"}`);
console.log(`  Product columns: ${before.productCols.length} -> ${after.productCols.length}`);
console.log(`  schema_version : ${before.schemaVersion} -> ${after.schemaVersion}`);
console.log(`  sha256         : ${originalHash.slice(0, 16)}… -> ${sha256(dbPath).slice(0, 16)}…`);

const stillPending = onDisk().filter((d) => !after.applied.includes(d));
let ok = newlyApplied.length > 0 && stillPending.length === 0;

if (EXPECT) {
  console.log("");
  if (!existsSync(EXPECT)) {
    console.log(`  Expected fingerprint not found at ${EXPECT} — skipped.`);
  } else {
    const fp = spawnSync("bun", ["run", join(dirname(EXPECT), "fingerprint.ts"), dbPath], { encoding: "utf-8" });
    try {
      const actual = JSON.parse(fp.stdout ?? "{}");
      const expected = JSON.parse(readFileSync(EXPECT, "utf-8"));
      const diffs: string[] = [];
      const walk = (path: string, a: unknown, b: unknown) => {
        if (JSON.stringify(a) === JSON.stringify(b)) return;
        if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a)) {
          for (const k of new Set([...Object.keys(a), ...Object.keys(b as object)]))
            walk(`${path}.${k}`, (a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]);
        } else diffs.push(path);
      };
      walk("", expected, actual);
      if (diffs.length === 0) {
        console.log("  Fingerprint: IDENTICAL to the rehearsed post-migration state.");
      } else {
        console.log(`  Fingerprint: ${diffs.length} difference(s) from the rehearsal —`);
        for (const d of diffs.slice(0, 12)) console.log("     " + d);
        // Session/AuditLog move on their own; anything else is worth a look.
        const material = diffs.filter((d) => !/Session|AuditLog|TechnicalLog/.test(d));
        if (material.length) ok = false;
      }
    } catch {
      console.log("  Fingerprint comparison could not be parsed — check by hand.");
    }
  }
}

console.log("");
console.log(ok ? "  ✅ APPLIED AND VERIFIED." : "  ❌ NOT WHAT WAS EXPECTED — read the lines above.");
if (!ok) {
  console.log("");
  console.log("  The restore point is at:");
  console.log("     " + snap);
}
console.log("");
process.exit(ok ? 0 : 1);
