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

const BACKUP_DIR = path.join(process.cwd(), "db", "backups");
const DB_PATH = path.join(process.cwd(), "db", "custom.db");
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

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
};

export function defaultBackupPaths(): BackupPaths {
  return { backupDir: BACKUP_DIR, dbPath: DB_PATH, uploadsDir: UPLOADS_DIR };
}

// Strong scrypt parameters. N=2^17 (~131k) is the OWASP 2024 recommendation
// for an "interactive / file-key" workload. r=8 p=1 keeps memory ~1 GiB peak,
// which is acceptable for a once-per-Z-report cadence.
const SCRYPT_N = 1 << 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const GCM_IV_LEN = 12; // 12 bytes is the conventional GCM IV; random per-file.

async function ensureDir(backupDir: string = BACKUP_DIR) {
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

/** Stream-tar the `public/uploads/` directory into a single `.tar.gz` file.
 * `tar` is an optional dependency: when not installed (e.g. minimal deploys
 * that exclude media from backups), uploads are skipped with a console warn.
 */
async function archiveUploads(
  targetPath: string,
  uploadsDir: string = UPLOADS_DIR,
): Promise<number | null> {
  if (!existsSync(uploadsDir)) return null;
  let tar: typeof import("tar") | null = null;
  try {
    tar = (await import("tar")) as typeof import("tar");
  } catch {
    console.warn("[backup] tar package not installed — public/uploads excluded from backup.");
    return null;
  }
  // In `tar` v7 `tar.c({ file, gzip })` returns a Promise that resolves once
  // the archive is fully written. We await directly.
  await tar.c(
    { gzip: true, file: targetPath, cwd: path.dirname(uploadsDir), portable: true },
    [path.basename(uploadsDir)],
  );
  try {
    const stat = await fs.stat(targetPath);
    return stat.size;
  } catch {
    return null;
  }
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
  uploadsDir: string,
): Promise<{ restored: number } | { failed: string }> {
  let tar: typeof import("tar") | null = null;
  try {
    tar = (await import("tar")) as typeof import("tar");
  } catch {
    return { failed: "le paquet tar n'est pas installé" };
  }
  try {
    await fs.mkdir(path.dirname(uploadsDir), { recursive: true });
    let restored = 0;
    await tar.x({
      file: tarPath,
      cwd: path.dirname(uploadsDir),
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
 * Create an encrypted backup of the SQLite database. A uploads archive is
 * included when the `tar` package is installed and `public/uploads/` exists.
 */
export async function createBackup(
  userId: string | null,
  paths: BackupPaths = defaultBackupPaths(),
) {
  const { backupDir, uploadsDir } = paths;
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

  // Archive uploads alongside the DB snapshot.
  const uploadsPlainPath = path.join(backupDir, `hibapos-backup-${stamp}.uploads.tar.gz`);
  const uploadsSize = await archiveUploads(uploadsPlainPath, uploadsDir);
  const uploadsIncluded = uploadsSize != null;

  // Encrypt the DB snapshot.
  const encDbFilename = `hibapos-backup-${stamp}.dbenc`;
  const encDbPath = path.join(backupDir, encDbFilename);
  await encryptFile(plainDbPath, encDbPath, secret);
  await fs.unlink(plainDbPath);

  // Encrypt the uploads archive (when present).
  let imagesPath: string | null = null;
  if (uploadsIncluded) {
    const encUploadsFilename = `hibapos-backup-${stamp}.uploads.enc`;
    const encUploadsPath = path.join(backupDir, encUploadsFilename);
    await encryptFile(uploadsPlainPath, encUploadsPath, secret);
    await fs.unlink(uploadsPlainPath);
    imagesPath = encUploadsFilename;
  }

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
    { filename: encDbFilename, size: sizeBytes, encrypted: true, uploadsIncluded },
    userId,
  );
  return backup;
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
  const { backupDir, dbPath, uploadsDir } = paths;
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
      uploadsResult = await restoreUploadsArchive(stagedUploadsTar, uploadsDir);
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
  // Also clean up any uploads archive referenced by this backup.
  if (backup.imagesPath) {
    const uploadsFile = path.join(paths.backupDir, backup.imagesPath);
    try {
      await fs.unlink(uploadsFile);
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
