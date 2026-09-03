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
