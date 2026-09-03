// SQLite startup pragmas (C-19, Batch 2.3).
//
// WHAT WAS WRONG
// --------------
// The live database ran in rollback-journal mode while three documents said
// it was in WAL. In rollback mode readers block writers, so `_busy_timeout`
// turns contention into a five-second stall — and during a Z close,
// `VACUUM INTO` holds a read lock across the whole database while a ~47 MB
// tarball is encrypted, which is the till hanging in front of a customer.
//
// WHY IT STAYED WRONG
// -------------------
// `src/lib/db.ts` stated the pragma could not be issued through Prisma and
// had to be applied with the sqlite3 CLI — a prerequisite nobody installed,
// by a `start.sh` that was deleted in commit 0aeea30. That claim is only
// half true and it is the reason nothing ever applied it:
//
//   $executeRawUnsafe("PRAGMA journal_mode = WAL")  → fails, "returned results"
//   $queryRawUnsafe("PRAGMA journal_mode = WAL")    → works
//
// `PRAGMA journal_mode` answers with a row, so it is a *query*, not an
// execute. Verified against a copy of the production database: header byte
// 18 went from 1 to 2 and the setting persisted, which is what SQLite
// guarantees — journal mode lives in the file, not in the connection.

import { db } from "@/lib/db";

/**
 * Directories whose sync agents actively fight SQLite.
 *
 * WAL keeps `-wal` and `-shm` sidecars alongside the database permanently,
 * and they are not optional extras: a reader that sees a stale or restored
 * `-wal` reads a database that never existed. A sync client that uploads,
 * locks or rolls those files back can therefore corrupt data in a way
 * rollback-journal mode cannot, because there the journal only exists for
 * the duration of a write.
 *
 * This project already knows the failure mode — `test-setup.ts` moves the
 * test database to the system temp directory precisely because OneDrive
 * locks the Prisma engine's files with EPERM.
 */
const CLOUD_SYNC_MARKERS = ["onedrive", "dropbox", "google drive", "googledrive", "icloud", "icloud drive"];

/**
 * Name the sync folder a path sits inside, or null.
 *
 * Matches whole path SEGMENTS, never a bare substring. A substring test
 * looks equivalent and is not: this session's own scratch directory is
 * `…/Temp/claude/C--Users-einer-OneDrive-Desktop-…`, where "OneDrive" is
 * part of an encoded project name and the database is nowhere near a synced
 * folder. Falsely refusing WAL is not harmless — it silently leaves the
 * database in the slow, blocking mode this batch exists to get rid of.
 *
 * Business accounts name the folder "OneDrive - Contoso", so a segment that
 * *starts* with a marker followed by a separator counts too.
 */
export function cloudSyncFolderIn(filePath: string): string | null {
  const segments = filePath.split(/[\\/]+/).filter(Boolean);
  for (const segment of segments) {
    const lower = segment.toLowerCase().trim();
    for (const marker of CLOUD_SYNC_MARKERS) {
      if (lower === marker) return marker;
      // "OneDrive - Contoso", "Dropbox (Personal)"
      if (lower.startsWith(`${marker} -`) || lower.startsWith(`${marker} (`)) return marker;
    }
  }
  return null;
}

export type PragmaResult = {
  journalMode: string;
  applied: boolean;
  skipped?: "CLOUD_SYNC";
  databasePath: string | null;
  warning?: string;
};

/** The database file Prisma is actually connected to, from DATABASE_URL. */
function connectedDatabasePath(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) return null;
  return url.slice("file:".length).split("?")[0];
}

/**
 * Put the database into WAL mode, unless it sits somewhere WAL would make
 * things worse.
 *
 * Idempotent: SQLite stores the journal mode in the file, so this is a
 * no-op on every start after the first. Never throws — a POS must still
 * open if the pragma cannot be applied.
 */
export async function applyStartupPragmas(): Promise<PragmaResult> {
  const databasePath = connectedDatabasePath();

  let current = "unknown";
  try {
    const rows = await db.$queryRawUnsafe<{ journal_mode: string }[]>("PRAGMA journal_mode");
    current = rows[0]?.journal_mode ?? "unknown";
  } catch {
    return { journalMode: "unknown", applied: false, databasePath };
  }

  if (current.toLowerCase() === "wal") {
    return { journalMode: current, applied: false, databasePath };
  }

  const syncFolder = databasePath ? cloudSyncFolderIn(databasePath) : null;
  if (syncFolder) {
    const warning =
      `La base de données se trouve dans un dossier synchronisé (${syncFolder}). ` +
      `Le mode WAL n'a PAS été activé : ses fichiers -wal/-shm y seraient synchronisés ` +
      `et peuvent corrompre la base. Déplacez les données hors du dossier synchronisé ` +
      `(HIBAPOS_DATA_DIR), puis redémarrez pour activer le mode WAL.`;
    return {
      journalMode: current,
      applied: false,
      skipped: "CLOUD_SYNC",
      databasePath,
      warning,
    };
  }

  try {
    const rows = await db.$queryRawUnsafe<{ journal_mode: string }[]>(
      "PRAGMA journal_mode = WAL",
    );
    const mode = rows[0]?.journal_mode ?? "unknown";
    return { journalMode: mode, applied: mode.toLowerCase() === "wal", databasePath };
  } catch {
    return { journalMode: current, applied: false, databasePath };
  }
}
