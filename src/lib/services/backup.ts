// Backup & restore service — exports the full database + uploads as an
// encrypted archive. Uses AES-256-GCM with a per-file random salt for key
// derivation (scrypt N=2^17, r=8, p=1) so an attacker who breaks one
// backup file's KDF cannot reuse the work for any other backup.
//
// Snapshot strategy: SQLite's `VACUUM INTO` produces a transactionally-consistent
// copy without freezing the live file or relying on `fs.copyFile` of the
// Prisma-held handle (which is unreliable under WAL mode and on Windows where
// the file may be locked). We also archive `public/uploads/` so media (product
// images, etc.) is recoverable.
//
// Restore strategy: pre-restore safety copy is itself encrypted + registered
// as a `Backup` row (so the operator can roll back if needed); the live
// Prisma client is disconnected + reconnected after the file swap. The caller
// route is responsible for signalling the next process to restart.
//
// Note: we encrypt whole files in memory. SQLite backups are typically a few
// MiB (single POS deployment), which is small enough that a buffered approach
// beats a fragile stream + splice an GCM auth-tag insertion would require.
import { db } from "@/lib/db";
import { promises as fs, createReadStream } from "fs";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import { audit } from "@/lib/services/audit";
import { logTechnical } from "@/lib/services/technical-logger";
import { appendFiscalEvent } from "@/lib/services/fiscal";
import { beginRestore, endRestore } from "@/lib/services/maintenance";
import {
  backupsDir,
  databasePath,
  fiscalArchivesDir,
  uploadsDir,
} from "@/lib/paths";

/**
 * Where backups are written (C-06, Batch 2.2).
 *
 * `BACKUP_LOCATION` has been documented in `.env.example` since the project
 * started and read by nothing. It exists so backups can live on a SECOND
 * physical volume: kept next to `custom.db`, as they were, one disk failure,
 * one ransomware event or one deleted folder takes the database and every
 * copy of it at the same time.
 *
 * Unset falls back to the previous location, so an existing install keeps
 * working and finds its old backups.
 */
// Locations are resolved per call by lib/paths.ts rather than frozen into
// module constants at import time: the data root comes from the environment,
// and a constant would capture whatever it was when the first import ran.

/**
 * How many backups to keep (C-06). Every Z close creates one, so without a
 * cap the POS accumulates them until the disk fills and SQLite writes start
 * failing — roughly 17 GB a year at the pre-fix archive size.
 *
 * 30 keeps about a month of daily closes. Pruning removes the `Backup` row
 * and its files together, and is journalled.
 */
const DEFAULT_RETENTION = 30;

export function backupRetentionCount(): number {
  const raw = process.env.BACKUP_RETENTION_COUNT?.trim();
  if (!raw) return DEFAULT_RETENTION;
  const n = Number(raw);
  // A retention of 0 would delete the backup it just made. Refuse to go
  // below 1 rather than honouring a typo that destroys every copy.
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_RETENTION;
}

/**
 * The three locations a backup touches.
 *
 * Injectable so backup/restore can be exercised against throwaway
 * directories in tests — without this, an integration test run from the
 * project root would restore over the real `db/custom.db` (T-01 could not
 * safely exist). This is NOT the data-directory decision: production still
 * uses the `process.cwd()`-anchored defaults above, and where data should
 * actually live is DD-02 / Batch 2.2.
 */
export type BackupPaths = {
  backupDir: string;
  dbPath: string;
  uploadsDir: string;
  /** Generated annual fiscal archives — the files an inspector asks for (M-03). */
  archivesDir: string;
};

export function defaultBackupPaths(): BackupPaths {
  return {
    backupDir: backupsDir(),
    dbPath: databasePath(),
    uploadsDir: uploadsDir(),
    archivesDir: fiscalArchivesDir(),
  };
}

// Strong scrypt parameters. N=2^17 (~131k) is the OWASP 2024 recommendation
// for an "interactive / file-key" workload. r=8 p=1 keeps memory ~1 GiB peak,
// which is acceptable for a once-per-Z-report cadence.
const SCRYPT_N = 1 << 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const GCM_IV_LEN = 12; // 12 bytes is the conventional GCM IV; random per-file.

async function ensureDir(backupDir: string) {
  await fs.mkdir(backupDir, { recursive: true });
}

function sha256OfFile(filepath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filepath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function deriveKey(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      secret,
      salt,
      KEY_LEN,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: 2 * 1024 * 1024 * 1024,
      },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

/** Encrypt a single input file → outputPath (buffered). Format:
 *   salt(16) || iv(12) || authTag(16) || ciphertext
 */
export async function encryptFile(
  inputPath: string,
  outputPath: string,
  secret: string,
): Promise<void> {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(GCM_IV_LEN);
  const key = await deriveKey(secret, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const input = await fs.readFile(inputPath);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const out = Buffer.concat([salt, iv, authTag, encrypted]);
  await fs.writeFile(outputPath, out);
}

/** Decrypt a file written by `encryptFile` (buffered). */
export async function decryptFile(
  inputPath: string,
  outputPath: string,
  secret: string,
): Promise<void> {
  const data = await fs.readFile(inputPath);
  const salt = data.subarray(0, 16);
  const iv = data.subarray(16, 16 + GCM_IV_LEN);
  const tag = data.subarray(16 + GCM_IV_LEN, 16 + GCM_IV_LEN + 16);
  const encrypted = data.subarray(16 + GCM_IV_LEN + 16);
  const key = await deriveKey(secret, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  await fs.writeFile(outputPath, decrypted);
}

/**
 * The directories carried alongside the database, and the base they are
 * relative to inside the tar (M-03, Batch 2.2).
 *
 * `db/fiscal-archives/` is included because the annual archive is the file an
 * inspector actually asks for, and until now the backup mechanism did not
 * protect it at all.
 */
function mediaSources(paths: { uploadsDir: string; archivesDir: string }) {
  const base = commonBaseDir(paths.uploadsDir, paths.archivesDir);
  const entries: string[] = [];
  for (const dir of [paths.uploadsDir, paths.archivesDir]) {
    if (existsSync(dir)) {
      entries.push(path.relative(base, dir).split(path.sep).join("/"));
    }
  }
  return { base, entries };
}

/** Deepest directory that contains both paths. */
function commonBaseDir(a: string, b: string): string {
  const aParts = path.resolve(a).split(path.sep);
  const bParts = path.resolve(b).split(path.sep);
  const shared: string[] = [];
  for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
    if (aParts[i] !== bParts[i]) break;
    shared.push(aParts[i]);
  }
  // Different volumes on Windows share nothing — fall back to the uploads
  // parent, which is what the pre-2.2 archives used.
  return shared.length > 1 ? shared.join(path.sep) : path.dirname(path.resolve(a));
}

/**
 * A cheap content fingerprint of the media set: every file's path, size and
 * mtime, hashed (C-06).
 *
 * This is what stops every Z close re-tarring and re-encrypting ~49 MiB of
 * product images that have not changed since the last close. Photos are
 * uploaded once and then sit still for months, so in practice the archive is
 * built once and reused by reference thereafter.
 *
 * mtime + size is not a cryptographic guarantee, but nothing here is
 * security-critical: the worst case of a missed change is that one backup
 * carries slightly stale images, and the very next upload changes the
 * fingerprint again.
 */
async function mediaFingerprint(base: string, entries: string[]): Promise<string> {
  const hash = crypto.createHash("sha256");
  const walk = async (dir: string) => {
    let items: import("fs").Dirent<string>[];
    try {
      items = (await fs.readdir(dir, { withFileTypes: true })) as import("fs").Dirent<string>[];
    } catch {
      return;
    }
    for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        await walk(full);
      } else if (item.isFile()) {
        const st = await fs.stat(full).catch(() => null);
        if (!st) continue;
        hash.update(`${path.relative(base, full)}|${st.size}|${Math.floor(st.mtimeMs)}\n`);
      }
    }
  };
  for (const entry of entries) await walk(path.join(base, entry));
  return hash.digest("hex").slice(0, 16);
}

/**
 * Build (or reuse) the encrypted media archive for the current state of
 * `public/uploads/` and `db/fiscal-archives/`.
 *
 * Returns the encrypted filename to record in `Backup.imagesPath`, or null
 * when there is nothing to archive. Several `Backup` rows may point at the
 * same file — deletion is reference-counted accordingly.
 */
async function ensureMediaArchive(
  backupDir: string,
  paths: { uploadsDir: string; archivesDir: string },
  secret: string,
): Promise<{ filename: string; bytes: number; reused: boolean } | null> {
  const { base, entries } = mediaSources(paths);
  if (entries.length === 0) return null;

  let tar: typeof import("tar") | null = null;
  try {
    tar = (await import("tar")) as typeof import("tar");
  } catch {
    console.warn("[backup] tar package not installed — media excluded from backup.");
    return null;
  }

  const fingerprint = await mediaFingerprint(base, entries);
  const encFilename = `hibapos-media-${fingerprint}.enc`;
  const encPath = path.join(backupDir, encFilename);

  if (existsSync(encPath)) {
    const stat = await fs.stat(encPath);
    return { filename: encFilename, bytes: stat.size, reused: true };
  }

  const plainPath = path.join(backupDir, `hibapos-media-${fingerprint}.tar.gz`);
  await tar.c({ gzip: true, file: plainPath, cwd: base, portable: true }, entries);
  await encryptFile(plainPath, encPath, secret);
  await fs.unlink(plainPath).catch(() => {});
  const stat = await fs.stat(encPath);
  return { filename: encFilename, bytes: stat.size, reused: false };
}

/**
 * Is this media archive still referenced by another backup?
 *
 * Fingerprint dedupe means one file can back several `Backup` rows; deleting
 * one row must not take the images of the others with it.
 */
async function mediaStillReferenced(imagesPath: string, excludeBackupId: string): Promise<boolean> {
  const count = await db.backup.count({
    where: { imagesPath, id: { not: excludeBackupId } },
  });
  return count > 0;
}

/**
 * Extract an uploads `.tar.gz` back over the uploads directory (C-05a).
 *
 * The archive was created with `cwd: dirname(uploadsDir)` and the single
 * entry `uploads/`, so it extracts to the same place.
 *
 * Extraction MERGES: files in the archive overwrite their counterparts, and
 * files added since the backup are left alone. Swapping the directory
 * wholesale would be a truer restore, but a swap interrupted by a crash or
 * an antivirus lock can lose images outright, and an orphaned image is
 * harmless where a missing one is not — the whole point of C-05 is that
 * images must stop disappearing.
 *
 * Returns the number of entries restored, or null when there was nothing to
 * restore. Never throws: a failure here must not undo a restored database.
 */
async function restoreUploadsArchive(
  tarPath: string,
  paths: { uploadsDir: string; archivesDir: string },
  legacyLayout: boolean,
): Promise<{ restored: number } | { failed: string }> {
  let tar: typeof import("tar") | null = null;
  try {
    tar = (await import("tar")) as typeof import("tar");
  } catch {
    return { failed: "le paquet tar n'est pas installé" };
  }
  // Archives written before Batch 2.2 hold a single `uploads/` entry relative
  // to the uploads parent. Newer ones hold uploads AND fiscal archives
  // relative to their common base. Extracting either at the wrong root would
  // scatter files into a second tree, so the layout is decided by the
  // filename the backup recorded, not guessed.
  const cwd = legacyLayout
    ? path.dirname(paths.uploadsDir)
    : commonBaseDir(paths.uploadsDir, paths.archivesDir);
  try {
    await fs.mkdir(cwd, { recursive: true });
    let restored = 0;
    await tar.x({
      file: tarPath,
      cwd,
      onentry: () => {
        restored += 1;
      },
    });
    return { restored };
  } catch (e) {
    return { failed: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Create an encrypted backup: the database, plus a media archive covering
 * `public/uploads/` and `db/fiscal-archives/` when `tar` is available.
 *
 * The media archive is content-addressed and reused across backups whose
 * media has not changed, and old backups are pruned to the retention limit
 * afterwards (C-06).
 */
export async function createBackup(
  userId: string | null,
  paths: BackupPaths = defaultBackupPaths(),
) {
  const { backupDir, uploadsDir, archivesDir } = paths;
  await ensureDir(backupDir);
  const secret = process.env.BACKUP_ENCRYPTION_KEY || process.env.BACKUP_SECRET;
  if (!secret) {
    throw new Error("BACKUP_ENCRYPTION_KEY environment variable is required to create backups.");
  }
  if (secret.length < 32) {
    throw new Error("BACKUP_ENCRYPTION_KEY must be at least 32 characters long.");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const plainDbFilename = `hibapos-backup-${stamp}.db`;
  const plainDbPath = path.join(backupDir, plainDbFilename);

  // Crash-safe snapshot using `VACUUM INTO` — SQLite atomically copies the
  // database into a new file, applying any pending WAL writes. Prisma rejects
  // `PRAGMA journal_mode = WAL` via raw query (result rows), but VACUUM INTO
  // returns no rows and works here.
  await db.$executeRawUnsafe(`VACUUM INTO '${plainDbPath.replace(/'/g, "''")}'`);

  // Compute SHA-256 of the plaintext snapshot.
  const checksum = await sha256OfFile(plainDbPath);

  // Media archive (uploads + fiscal archives), reused when unchanged.
  const media = await ensureMediaArchive(backupDir, { uploadsDir, archivesDir }, secret);

  // Encrypt the DB snapshot.
  const encDbFilename = `hibapos-backup-${stamp}.dbenc`;
  const encDbPath = path.join(backupDir, encDbFilename);
  await encryptFile(plainDbPath, encDbPath, secret);
  await fs.unlink(plainDbPath);

  const imagesPath = media?.filename ?? null;

  const encStat = await fs.stat(encDbPath);
  const sizeBytes = encStat.size;

  const backup = await db.backup.create({
    data: {
      filename: encDbFilename,
      size: sizeBytes,
      checksum,
      encrypted: true,
      sizeBytes,
      imagesPath,
      createdById: userId,
    },
  });

  await audit(
    "BACKUP_CREATED",
    "Backup",
    backup.id,
    {
      filename: encDbFilename,
      size: sizeBytes,
      encrypted: true,
      mediaIncluded: media != null,
      mediaReused: media?.reused ?? false,
      mediaBytes: media?.bytes ?? 0,
      backupDir,
    },
    userId,
  );

  const pruned = await pruneBackups(userId, paths);

  return Object.assign(backup, {
    media: media
      ? { filename: media.filename, bytes: media.bytes, reused: media.reused }
      : null,
    pruned,
  });
}

/**
 * Refuse a restore whose schema does not match the running application
 * (L-15, Batch 2.2).
 *
 * `restoreBackup` verified the *data* checksum and nothing else, so a backup
 * taken under an older schema restored cleanly and left the application
 * running against a database missing tables it needs. This is not
 * theoretical: the real 2026-08-28 backup in this project has 26 tables
 * against the live schema's 31, missing `FiscalEvent` among them — restoring
 * it would leave HibaPOS with no fiscal journal at all, and the RESTAURATION
 * event recording what happened could not even be written.
 *
 * Compares the applied Prisma migrations in the staged file against the live
 * database. Opens the staged file with its own client so the live connection
 * is untouched, and always disconnects it — a leaked handle would block the
 * rename that follows.
 */
async function assertCompatibleSchema(stagedDbPath: string): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  const staged = new PrismaClient({
    // SQLite URLs want forward slashes even on Windows. Built by splitting on
    // the platform separator rather than with a backslash regex literal.
    datasources: { db: { url: `file:${stagedDbPath.split(path.sep).join("/")}` } },
  });

  type Named = { name: string };
  const listTables = (client: { $queryRawUnsafe: typeof db.$queryRawUnsafe }) =>
    client.$queryRawUnsafe<Named[]>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' ORDER BY name",
    );

  try {
    // Structure, not migration history: a database created with `prisma db
    // push` has no `_prisma_migrations` at all, and refusing those would make
    // restore unusable on any install bootstrapped that way. What actually
    // matters is whether the tables and columns this code uses are present.
    const stagedTables = (await listTables(staged)).map((r) => r.name);
    const liveTables = (await listTables(db)).map((r) => r.name);

    const missingTables = liveTables.filter((t) => !stagedTables.includes(t));
    if (missingTables.length > 0) {
      throw new Error(
        `Sauvegarde incompatible : ${missingTables.length} table(s) manquante(s) — ` +
          `${missingTables.slice(0, 5).join(", ")}${missingTables.length > 5 ? "…" : ""}. ` +
          "Elle a été créée par une version antérieure de HibaPOS et la restaurer " +
          "laisserait l'application sans ces tables. Restauration refusée. " +
          "Le fichier reste lisible avec scripts/decrypt-backup.ts.",
      );
    }

    // Columns matter as much as tables: a table that exists but lacks a
    // column the code writes fails at the first query instead of at restore.
    const columnsOf = async (
      client: { $queryRawUnsafe: typeof db.$queryRawUnsafe },
      table: string,
    ) => {
      const rows = await client.$queryRawUnsafe<Named[]>(
        `PRAGMA table_info("${table.replace(/"/g, '""')}")`,
      );
      return rows.map((r) => r.name);
    };

    const missingColumns: string[] = [];
    for (const table of liveTables) {
      const live = await columnsOf(db, table);
      const stagedCols = await columnsOf(staged, table);
      for (const col of live) {
        if (!stagedCols.includes(col)) missingColumns.push(`${table}.${col}`);
      }
    }
    if (missingColumns.length > 0) {
      throw new Error(
        `Sauvegarde incompatible : ${missingColumns.length} colonne(s) manquante(s) — ` +
          `${missingColumns.slice(0, 5).join(", ")}${missingColumns.length > 5 ? "…" : ""}. ` +
          "Restauration refusée.",
      );
    }

    // Extra tables mean the backup came from a NEWER version. The running
    // code does not read them, so the restore is safe for it — but the
    // mismatch is worth a trace rather than silence.
    const extraTables = stagedTables.filter((t) => !liveTables.includes(t));
    if (extraTables.length > 0) {
      await logTechnical(
        "WARN",
        "backup-service",
        `Restore: backup carries ${extraTables.length} table(s) this version does not use (${extraTables.join(", ")}). It was probably taken by a newer HibaPOS.`,
      );
    }
  } finally {
    await staged.$disconnect().catch(() => {});
  }
}

/**
 * Restore a backup (C-05, C-22 restore half — Batch 2.1).
 *
 * The order of operations is the whole point of this function:
 *
 *  1. Decrypt and checksum-verify BEFORE anything is touched. A bad key or a
 *     corrupt archive must cost nothing.
 *  2. Decrypt the uploads archive too, so a media failure also surfaces
 *     before the database is replaced.
 *  3. Take the pre-restore safety snapshot, encrypted, on disk.
 *  4. Close the API (maintenance gate) so no request can reconnect Prisma
 *     onto a half-written file, then swap the database by `rename`, which is
 *     atomic on the same volume — never `copyFile` over the live file.
 *  5. Only then extract the images, journal the restore, and reopen.
 *
 * The safety snapshot's `Backup` row is written AFTER the swap, into the
 * restored database: writing it before would put the row in the database the
 * restore is about to destroy.
 */
export async function restoreBackup(
  backupId: string,
  userId: string,
  paths: BackupPaths = defaultBackupPaths(),
) {
  const { backupDir, dbPath, uploadsDir, archivesDir } = paths;
  const backup = await db.backup.findUnique({ where: { id: backupId } });
  if (!backup) throw new Error("Sauvegarde introuvable");

  const secret = process.env.BACKUP_ENCRYPTION_KEY || process.env.BACKUP_SECRET;
  if (!secret) {
    throw new Error("BACKUP_ENCRYPTION_KEY manquant — impossible de déchiffrer");
  }
  if (secret.length < 32) {
    throw new Error("BACKUP_ENCRYPTION_KEY doit contenir au moins 32 caractères.");
  }

  // Stage the decrypted database NEXT TO the live file so the final move is a
  // same-volume rename. Decrypting into db/backups/ and copying across would
  // reintroduce the non-atomic write this batch exists to remove.
  const stagedDbPath = `${dbPath}.restore-staged`;
  const backupPath = path.join(backupDir, backup.filename);

  await decryptFile(backupPath, stagedDbPath, secret);

  const verifyChecksum = await sha256OfFile(stagedDbPath);
  if (verifyChecksum !== backup.checksum) {
    await fs.unlink(stagedDbPath).catch(() => {});
    throw new Error("Intégrité de la sauvegarde compromise (checksum mismatch)");
  }

  // Structure check before anything irreversible (L-15).
  try {
    await assertCompatibleSchema(stagedDbPath);
  } catch (e) {
    await fs.unlink(stagedDbPath).catch(() => {});
    throw e;
  }

  // Decrypt the uploads archive up front (C-05a). Doing it here means a bad
  // media archive is discovered while the live database is still intact.
  let stagedUploadsTar: string | null = null;
  if (backup.imagesPath) {
    const encUploads = path.join(backupDir, backup.imagesPath);
    if (existsSync(encUploads)) {
      stagedUploadsTar = path.join(backupDir, `restore-${backup.id}.uploads.tar.gz`);
      try {
        await decryptFile(encUploads, stagedUploadsTar, secret);
      } catch (e) {
        await fs.unlink(stagedDbPath).catch(() => {});
        await fs.unlink(stagedUploadsTar).catch(() => {});
        throw new Error(
          `Archive des images illisible — restauration annulée : ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    } else {
      await logTechnical(
        "WARN",
        "backup-service",
        `Restore ${backup.id}: imagesPath ${backup.imagesPath} is recorded but missing from disk — images will not be restored.`,
      );
    }
  }

  // Fiscal state of the database about to be replaced, so a rewind can be
  // detected and journalled (C-22). Receipt numbers already printed must not
  // silently become reissuable.
  const counterBefore = await db.fiscalCounter.findFirst();
  const chainBefore = await db.fiscalEvent.findFirst({
    orderBy: { sequence: "desc" },
    select: { sequence: true, hash: true },
  });

  // Pre-restore safety snapshot — encrypted on disk BEFORE the swap.
  const safetyStamp = `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const safetyPlain = path.join(backupDir, `${safetyStamp}.db`);
  await db.$executeRawUnsafe(`VACUUM INTO '${safetyPlain.replace(/'/g, "''")}'`);
  const safetyChecksum = await sha256OfFile(safetyPlain);
  const safetyEncPath = path.join(backupDir, `${safetyStamp}.dbenc`);
  await encryptFile(safetyPlain, safetyEncPath, secret);
  await fs.unlink(safetyPlain);
  const safetyStat = await fs.stat(safetyEncPath);

  // --- The irreversible part. Hold the maintenance gate across all of it. ---
  beginRestore();
  let uploadsResult: { restored: number } | { failed: string } | null = null;
  try {
    await db.$disconnect();
    try {
      // rename() is atomic on the same volume: either the old file or the new
      // one is at dbPath, never a partial mixture. On Windows it replaces the
      // destination (MoveFileEx MOVEFILE_REPLACE_EXISTING).
      await fs.rename(stagedDbPath, dbPath);
      // Sidecars belong to the PREVIOUS database; replaying a mismatched WAL
      // against the restored file would corrupt it.
      await fs.unlink(`${dbPath}-wal`).catch(() => {});
      await fs.unlink(`${dbPath}-shm`).catch(() => {});
    } finally {
      await db.$connect();
    }

    if (stagedUploadsTar) {
      uploadsResult = await restoreUploadsArchive(
        stagedUploadsTar,
        { uploadsDir, archivesDir },
        backup.imagesPath!.endsWith(".uploads.enc"),
      );
      await fs.unlink(stagedUploadsTar).catch(() => {});
    }
  } finally {
    endRestore();
  }

  // --- Everything below runs against the RESTORED database. ---

  const counterAfter = await db.fiscalCounter.findFirst();
  const rewind =
    counterBefore && counterAfter
      ? {
          receipt: counterBefore.lastReceiptNumber - counterAfter.lastReceiptNumber,
          zReport: counterBefore.lastZReportNumber - counterAfter.lastZReportNumber,
          fiscalEvent:
            counterBefore.lastFiscalEventSequence - counterAfter.lastFiscalEventSequence,
        }
      : null;
  const rewound = rewind != null && (rewind.receipt > 0 || rewind.zReport > 0 || rewind.fiscalEvent > 0);

  // Register the safety snapshot in the RESTORED database so it appears in
  // the backups list and the operator can roll back with one click.
  let safetyBackupRow: { id: string; filename: string } | null = null;
  const safetyRowData = {
    filename: path.basename(safetyEncPath),
    size: safetyStat.size,
    checksum: safetyChecksum,
    encrypted: true,
    sizeBytes: safetyStat.size,
  };
  try {
    safetyBackupRow = await db.backup.create({
      data: { ...safetyRowData, createdById: userId },
      select: { id: true, filename: true },
    });
  } catch {
    // `createdById` must exist in the RESTORED database. Restoring a backup
    // taken before the current operator's account was created violates the
    // foreign key — and losing the one-click rollback because of who is
    // logged in would be absurd. Retry unattributed; the audit entry and the
    // RESTAURATION event still record who did it.
    try {
      safetyBackupRow = await db.backup.create({
        data: { ...safetyRowData, createdById: null },
        select: { id: true, filename: true },
      });
      await logTechnical(
        "WARN",
        "backup-service",
        `Restore ${backup.id}: safety snapshot registered without an owner — user ${userId} does not exist in the restored database.`,
      );
    } catch {
      // The restored snapshot may predate the Backup table or carry a
      // conflicting schema. The encrypted safety file still exists on disk —
      // log and continue rather than failing the restore.
      await logTechnical(
        "WARN",
        "backup-service",
        `Restore ${backup.id}: safety file ${path.basename(safetyEncPath)} written but Backup-row registration failed.`,
      );
    }
  }

  // Journal the restore in the RESTORED chain (C-22). It cannot go in the old
  // database — the restore destroys it — so the event chains onto whatever
  // the backup's last event was, which is exactly the record an auditor
  // needs: this journal was replaced, here is what it replaced.
  let fiscalSequence: number | null = null;
  try {
    const ev = await db.$transaction((tx) =>
      appendFiscalEvent(tx, {
        type: "RESTAURATION",
        userId,
        data: {
          backupId: backup.id,
          backupFilename: backup.filename,
          backupCreatedAt: backup.createdAt.toISOString(),
          checksum: verifyChecksum,
          imagesRestored:
            uploadsResult && "restored" in uploadsResult ? uploadsResult.restored : 0,
          imagesFailure:
            uploadsResult && "failed" in uploadsResult ? uploadsResult.failed : null,
          safetyFilename: path.basename(safetyEncPath),
          safetyChecksum,
          replacedCounter: counterBefore
            ? {
                receipt: counterBefore.lastReceiptNumber,
                zReport: counterBefore.lastZReportNumber,
                fiscalEvent: counterBefore.lastFiscalEventSequence,
              }
            : null,
          replacedChainTip: chainBefore
            ? { sequence: chainBefore.sequence, hash: chainBefore.hash }
            : null,
          rewound,
        },
      }),
    );
    fiscalSequence = ev.sequence;
  } catch (e) {
    // A restore that cannot be journalled is a serious event in itself.
    await logTechnical(
      "ERROR",
      "backup-service",
      `Restore ${backup.id}: RESTAURATION fiscal event could not be appended: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (rewound) {
    await logTechnical(
      "WARN",
      "backup-service",
      `Restore ${backup.id} REWOUND the fiscal counters (receipt -${rewind!.receipt}, Z -${rewind!.zReport}, event -${rewind!.fiscalEvent}). Receipt numbers already issued can be reissued.`,
    );
  }

  await audit(
    "BACKUP_RESTORED",
    "Backup",
    backup.id,
    {
      checksum: verifyChecksum,
      safetyBackupId: safetyBackupRow?.id ?? null,
      safetyFilename: path.basename(safetyEncPath),
      imagesRestored: uploadsResult && "restored" in uploadsResult ? uploadsResult.restored : 0,
      imagesFailure: uploadsResult && "failed" in uploadsResult ? uploadsResult.failed : null,
      fiscalSequence,
      rewound,
    },
    userId,
  );
  await logTechnical(
    "INFO",
    "backup-service",
    `Backup ${backup.id} restored by ${userId}; safety snapshot ${safetyBackupRow?.id ?? path.basename(safetyEncPath)} created.`,
  );

  return {
    ok: true,
    safetyBackupId: safetyBackupRow?.id ?? null,
    images:
      uploadsResult == null
        ? { restored: 0, skipped: true as const }
        : "restored" in uploadsResult
          ? { restored: uploadsResult.restored, skipped: false as const }
          : { restored: 0, skipped: false as const, failed: uploadsResult.failed },
    fiscalSequence,
    rewound,
    rewind: rewound ? rewind : null,
  };
}

/**
 * Enforce the retention limit (C-06).
 *
 * Every Z close creates a backup and nothing ever removed one, so the POS
 * accumulated them until the disk filled and SQLite writes began to fail.
 * Keeps the newest N by creation time and removes the rest — row and files
 * together, so the list can never show a backup whose file is gone.
 *
 * The whole prune is journalled as ONE `SUPPRESSION_SAUVEGARDE` event: the
 * destruction of a recovery path has to leave a trace (C-22), but an event
 * per pruned file would bury the journal in housekeeping.
 */
export async function pruneBackups(
  userId: string | null,
  paths: BackupPaths = defaultBackupPaths(),
): Promise<{ deleted: number; freedBytes: number }> {
  const keep = backupRetentionCount();
  const all = await db.backup.findMany({ orderBy: { createdAt: "desc" } });
  const doomed = all.slice(keep);
  if (doomed.length === 0) return { deleted: 0, freedBytes: 0 };

  let freedBytes = 0;
  const removed: { id: string; filename: string; createdAt: string }[] = [];

  for (const backup of doomed) {
    const dbFile = path.join(paths.backupDir, backup.filename);
    try {
      const stat = await fs.stat(dbFile);
      freedBytes += stat.size;
      await fs.unlink(dbFile);
    } catch {
      // Already gone — the row still has to go.
    }

    // Media archives are content-addressed and shared between backups whose
    // images did not change. Only remove one when nothing else points at it.
    if (backup.imagesPath && !(await mediaStillReferenced(backup.imagesPath, backup.id))) {
      const mediaFile = path.join(paths.backupDir, backup.imagesPath);
      try {
        const stat = await fs.stat(mediaFile);
        freedBytes += stat.size;
        await fs.unlink(mediaFile);
      } catch {
        // ignore
      }
    }

    await db.backup.delete({ where: { id: backup.id } }).catch(() => {});
    removed.push({
      id: backup.id,
      filename: backup.filename,
      createdAt: backup.createdAt.toISOString(),
    });
  }

  try {
    await db.$transaction((tx) =>
      appendFiscalEvent(tx, {
        type: "SUPPRESSION_SAUVEGARDE",
        userId,
        data: { reason: "retention", keep, deleted: removed, freedBytes },
      }),
    );
  } catch (e) {
    await logTechnical(
      "ERROR",
      "backup-service",
      `Retention prune: SUPPRESSION_SAUVEGARDE event could not be appended: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  await logTechnical(
    "INFO",
    "backup-service",
    `Retention prune removed ${removed.length} backup(s), freeing ${(freedBytes / 1024 / 1024).toFixed(1)} MiB (keep=${keep}).`,
  );

  return { deleted: removed.length, freedBytes };
}

export async function listBackups() {
  return db.backup.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });
}

export async function deleteBackup(
  id: string,
  userId: string | null = null,
  paths: BackupPaths = defaultBackupPaths(),
) {
  const backup = await db.backup.findUnique({ where: { id } });
  if (!backup) return;

  // Journal the deletion BEFORE the files go (C-22). The attestation states
  // there is no path to delete fiscal records; destroying the backup that
  // contains them is close enough to one that it has to leave a trace, and a
  // trace written afterwards would be lost if the process died mid-delete.
  let fiscalSequence: number | null = null;
  try {
    const ev = await db.$transaction((tx) =>
      appendFiscalEvent(tx, {
        type: "SUPPRESSION_SAUVEGARDE",
        userId,
        data: {
          backupId: backup.id,
          filename: backup.filename,
          imagesPath: backup.imagesPath,
          checksum: backup.checksum,
          sizeBytes: backup.sizeBytes,
          backupCreatedAt: backup.createdAt.toISOString(),
        },
      }),
    );
    fiscalSequence = ev.sequence;
  } catch (e) {
    await logTechnical(
      "ERROR",
      "backup-service",
      `Delete ${backup.id}: SUPPRESSION_SAUVEGARDE fiscal event could not be appended: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const filepath = path.join(paths.backupDir, backup.filename);
  try {
    await fs.unlink(filepath);
  } catch {
    // file may already be gone
  }
  // Media archives are content-addressed and may back several backups whose
  // images never changed. Removing one because a single row was deleted
  // would silently strip the images from every other backup pointing at it.
  if (backup.imagesPath && !(await mediaStillReferenced(backup.imagesPath, backup.id))) {
    const mediaFile = path.join(paths.backupDir, backup.imagesPath);
    try {
      await fs.unlink(mediaFile);
    } catch {
      // ignore
    }
  }
  await db.backup.delete({ where: { id } });

  await audit(
    "BACKUP_DELETED",
    "Backup",
    backup.id,
    { filename: backup.filename, imagesPath: backup.imagesPath, fiscalSequence },
    userId,
  );
}
