// Where HibaPOS keeps its data (DD-02, Batch 2.2).
//
// THE PROBLEM THIS SOLVES
// -----------------------
// Five locations — the database, backups, fiscal archives, uploads and the
// Next build — were each anchored to `process.cwd()` independently. That
// makes the working directory the app happens to start in the de-facto
// decision about where a restaurant's data lives, so a launcher with the
// wrong "Start in" silently splits data across two directory trees, and the
// current install sits inside a OneDrive-synced Desktop folder, which locks
// SQLite files (the project's own test-setup.ts documents that failure).
//
// THE DECISION (operator, 2026-09-03)
// -----------------------------------
// Production data lives in `C:\HibaPOS\data`: writable without elevation,
// outside OneDrive, outside the install directory so an update cannot touch
// it, and obvious enough that a restaurant owner can find and copy it.
//
// HOW THE SWITCH HAPPENS
// ----------------------
// `HIBAPOS_DATA_DIR` selects the root. It deliberately DEFAULTS TO THE OLD
// LAYOUT: changing where a running install looks for its database as a side
// effect of a code update would make the app boot against an empty
// directory and behave like a fresh install. Moving to the new location is
// an explicit deployment step — set the variable, move the files, point
// DATABASE_URL at the new path — and belongs with the launcher work in
// Batch 1.4, which is where "Start in" is decided anyway.

import { existsSync } from "fs";
import path from "path";

/** The recommended production root, per DD-02. */
export const RECOMMENDED_DATA_DIR = "C:\\HibaPOS\\data";

/**
 * Root of all mutable application data.
 *
 * Unset ⇒ the historical layout (the install directory), so existing
 * installs keep working untouched.
 */
export function dataDir(): string {
  const configured = process.env.HIBAPOS_DATA_DIR?.trim();
  return configured ? path.resolve(configured) : process.cwd();
}

/** True when data has been moved out of the install directory. */
export function usingExternalDataDir(): boolean {
  return Boolean(process.env.HIBAPOS_DATA_DIR?.trim());
}

/**
 * The SQLite database file.
 *
 * NOTE: Prisma is configured by `DATABASE_URL`, not by this function — this
 * is what the backup/restore code uses to find the file it swaps. The two
 * must agree, which the deployment step is responsible for.
 */
export function databasePath(): string {
  return path.join(dataDir(), "db", "custom.db");
}

/** Encrypted backups. `BACKUP_LOCATION` overrides this outright (C-06): a
 *  backup on the same disk as the database is not a backup. */
export function backupsDir(): string {
  const configured = process.env.BACKUP_LOCATION?.trim();
  if (configured) return path.resolve(configured);
  return path.join(dataDir(), "db", "backups");
}

/** Generated annual fiscal archives — what an inspector asks for. */
export function fiscalArchivesDir(): string {
  return path.join(dataDir(), "db", "fiscal-archives");
}

/**
 * Uploaded media (product images).
 *
 * In the legacy layout this is `public/uploads`, which Next serves
 * statically. Once data moves out of the install directory the files are no
 * longer under `public/`, so they are served by the `/uploads/[...path]`
 * route instead — see that file for why the URL shape stays identical.
 */
export function uploadsDir(): string {
  return usingExternalDataDir()
    ? path.join(dataDir(), "uploads")
    : path.join(process.cwd(), "public", "uploads");
}

// ── WHERE THE APPLICATION ITSELF LIVES (L-114, L-137 — R9.2) ─────────────────
//
// `dataDir()` above answers « where is the restaurant's data ». These answer
// two different questions that were previously both answered by
// `process.cwd()`, which is not a decision anybody made:
//
//   * `appRoot()`  — where the application's OWN files are, `prisma/migrations`
//                    among them. Read-only, replaced by an update.
//   * `resolvedDatabasePath()` — the file Prisma is actually connected to.
//
// **Today all three coincide, and only by accident.** A packaged build
// separates them: the working directory is wherever the launcher happened to
// start, `dataDir()` is `C:\HibaPOS\data`, and the app's files are inside the
// bundle. `startup-migration.ts` resolved `prisma/migrations` against the cwd
// and returned `[]` when it could not find it — reporting `UP_TO_DATE`, the one
// status nothing logged. That is L-114, and anchoring here rather than there is
// the form that survives becoming a native app.

/** Walk up from `from` looking for a directory containing `marker`. */
function findUp(from: string, marker: string): string | null {
  let dir = path.resolve(from);
  for (let i = 0; i < 12; i++) {
    if (existsSync(path.join(dir, marker))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

const MIGRATIONS_MARKER = path.join("prisma", "migrations");

/**
 * Root of the application's own files.
 *
 * `HIBAPOS_APP_DIR` is the explicit answer and **is what a packaged build
 * should set** — a bundle has no reason for its resources to be reachable by
 * walking up from a working directory. Unset, this walks up from the cwd
 * looking for `prisma/migrations`, which finds the repository root from
 * anywhere inside it, and falls back to the cwd so behaviour is unchanged
 * where the two already agree.
 */
export function appRoot(): string {
  const configured = process.env.HIBAPOS_APP_DIR?.trim();
  if (configured) return path.resolve(configured);
  return findUp(process.cwd(), MIGRATIONS_MARKER) ?? process.cwd();
}

/** The migrations directory. May not exist — callers must say so out loud
 *  rather than treating absence as « nothing is pending » (L-114). */
export function migrationsDir(): string {
  return path.join(appRoot(), "prisma", "migrations");
}

/**
 * The database file Prisma is actually connected to, from `DATABASE_URL`.
 *
 * Moved here from `db-pragmas.ts` in R9.2, where it was private, because
 * `startup-migration.ts` needs the same answer for its lock (L-137) and a
 * third copy of a path rule is how the three drift apart.
 */
export function connectedDatabasePath(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) return null;
  return url.slice("file:".length).split("?")[0];
}

/**
 * The database file, preferring what Prisma is actually connected to.
 *
 * `databasePath()` says where the layout PUTS the database; this says where it
 * IS. They differ whenever `DATABASE_URL` was pointed somewhere else — which is
 * every test run, and any install whose data was moved without
 * `HIBAPOS_DATA_DIR` following it. Anything that must line up with the actual
 * file (the migration lock, L-137) belongs on this one.
 */
export function resolvedDatabasePath(): string {
  return connectedDatabasePath() ?? databasePath();
}
