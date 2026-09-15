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

/**
 * Can these two paths be on the same physical volume? — L-194.
 *
 * **THREE ANSWERS, NOT TWO, AND THE THIRD IS THE HONEST ONE.** A path alone
 * cannot always tell you: on Windows the drive letter decides it, and on POSIX
 * every absolute path shares the root `/` while sitting on any number of mounts.
 * Returning `"SAME"` there would be a false alarm on every Linux install and on
 * CI; returning `"DIFFERENT"` would be a false all-clear. `"UNKNOWN"` is what is
 * actually known, and the caller says so rather than inventing a verdict.
 *
 * Windows is what this product ships on (Tauri v2), so the case that matters is
 * answered precisely; the rest declines to guess. Pure and total, so the tests
 * drive it with fixed strings and pass on whichever machine runs them.
 */
export type VolumeVerdict = "SAME" | "DIFFERENT" | "UNKNOWN";

/**
 * The part of a path that identifies its volume, or null when unknowable.
 *
 * **THE PATH IS INSPECTED AS GIVEN, and only a RELATIVE one is resolved.**
 * `path.resolve("/var/data")` on Windows returns `C:\\var\\data` — so resolving
 * first handed a POSIX-absolute path a drive letter it never had, and the
 * `null` branch below became unreachable on Windows. The test for it passed on
 * CI and could not fail here, which a revert found by changing that branch and
 * producing no failure at all.
 */
function volumeOf(p: string): string | null {
  // RESOLVED ONCE, UP FRONT, and never recursively.
  //
  // The first version ended `return volumeOf(path.resolve(p))` for anything it
  // did not recognise, and argued that the resolved form is always either
  // drive-prefixed or `/`-prefixed so it terminates. **A revert disproved
  // that**: with the UNC branch removed, `\srv\share` matches no branch,
  // `path.resolve` returns it unchanged, and it recurses until the runner is
  // killed. The termination of one branch depended on another branch existing,
  // which is not a property anybody can maintain. There is no recursion now.
  const looksAbsolute = /^([A-Za-z]:|[\\/]{2}|\/)/.test(p);
  const abs = looksAbsolute ? p : path.resolve(p);

  // UNC: \\server\share\… — the share is the volume. Either slash, as Node
  // accepts both on Windows.
  const unc = /^[\\/]{2}([^\\/]+)[\\/]+([^\\/]+)/.exec(abs);
  if (unc) return `\\\\${unc[1].toLowerCase()}\\${unc[2].toLowerCase()}`;

  // Windows: a drive letter.
  const drive = /^([A-Za-z]):/.exec(abs);
  if (drive) return drive[1].toLowerCase() + ":";

  // POSIX-absolute, or a shape nothing here recognises: every such path shares
  // `/` with every other while sitting on any number of mounts. Nothing can say
  // which, on either operating system.
  return null;
}


export function sameVolume(a: string, b: string): VolumeVerdict {
  const va = volumeOf(a);
  const vb = volumeOf(b);
  if (va === null || vb === null) return "UNKNOWN";
  return va === vb ? "SAME" : "DIFFERENT";
}

/**
 * Are the backups on the same volume as the database? — L-194.
 *
 * **C-06 is the whole reason `BACKUP_LOCATION` exists**: « a backup on the same
 * disk as the database is not a backup ». The software had never once checked,
 * so on 2026-09-14 it turned out that the folder everybody believed was syncing
 * was a plain directory — OneDrive is not installed — and `C:` is the only
 * volume. Every copy of the restaurant's data was on one disk and nothing said
 * so. **This does not block anything**: refusing to take a backup because it
 * would land on the wrong disk leaves the operator with no backup at all, which
 * is worse than a badly-placed one.
 */
export function backupVolumeReport(): {
  verdict: VolumeVerdict;
  backupsDirectory: string;
  databaseDirectory: string;
} {
  const backups = backupsDir();
  const database = path.dirname(databasePath());
  return {
    verdict: sameVolume(backups, database),
    backupsDirectory: backups,
    databaseDirectory: database,
  };
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
