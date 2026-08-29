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

const BACKUP_DIR = path.join(process.cwd(), "db", "backups");
const DB_PATH = path.join(process.cwd(), "db", "custom.db");
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

// Strong scrypt parameters. N=2^17 (~131k) is the OWASP 2024 recommendation
// for an "interactive / file-key" workload. r=8 p=1 keeps memory ~1 GiB peak,
// which is acceptable for a once-per-Z-report cadence.
const SCRYPT_N = 1 << 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const GCM_IV_LEN = 12; // 12 bytes is the conventional GCM IV; random per-file.

async function ensureDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
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
async function archiveUploads(targetPath: string): Promise<number | null> {
  if (!existsSync(UPLOADS_DIR)) return null;
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
    { gzip: true, file: targetPath, cwd: path.dirname(UPLOADS_DIR) },
    [path.basename(UPLOADS_DIR)],
  );
  try {
    const stat = await fs.stat(targetPath);
    return stat.size;
  } catch {
    return null;
  }
}

/**
 * Create an encrypted backup of the SQLite database. A uploads archive is
 * included when the `tar` package is installed and `public/uploads/` exists.
 */
export async function createBackup(userId: string | null) {
  await ensureDir();
  const secret = process.env.BACKUP_ENCRYPTION_KEY || process.env.BACKUP_SECRET;
  if (!secret) {
    throw new Error("BACKUP_ENCRYPTION_KEY environment variable is required to create backups.");
  }
  if (secret.length < 32) {
    throw new Error("BACKUP_ENCRYPTION_KEY must be at least 32 characters long.");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const plainDbFilename = `hibapos-backup-${stamp}.db`;
  const plainDbPath = path.join(BACKUP_DIR, plainDbFilename);

  // Crash-safe snapshot using `VACUUM INTO` — SQLite atomically copies the
  // database into a new file, applying any pending WAL writes. Prisma rejects
  // `PRAGMA journal_mode = WAL` via raw query (result rows), but VACUUM INTO
  // returns no rows and works here.
  await db.$executeRawUnsafe(`VACUUM INTO '${plainDbPath.replace(/'/g, "''")}'`);

  // Compute SHA-256 of the plaintext snapshot.
  const checksum = await sha256OfFile(plainDbPath);

  // Archive uploads alongside the DB snapshot.
  const uploadsPlainPath = path.join(BACKUP_DIR, `hibapos-backup-${stamp}.uploads.tar.gz`);
  const uploadsSize = await archiveUploads(uploadsPlainPath);
  const uploadsIncluded = uploadsSize != null;

  // Encrypt the DB snapshot.
  const encDbFilename = `hibapos-backup-${stamp}.dbenc`;
  const encDbPath = path.join(BACKUP_DIR, encDbFilename);
  await encryptFile(plainDbPath, encDbPath, secret);
  await fs.unlink(plainDbPath);

  // Encrypt the uploads archive (when present).
  let imagesPath: string | null = null;
  if (uploadsIncluded) {
    const encUploadsFilename = `hibapos-backup-${stamp}.uploads.enc`;
    const encUploadsPath = path.join(BACKUP_DIR, encUploadsFilename);
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
 * Restore a backup. The pre-restore safety snapshot is itself encrypted and
 * registered as a Backup row so the operator can roll back if the restore
 * uncovers corruption. The live Prisma client is disconnected before the
 * file swap and reconnected after, which prevents stale handles on Windows
 * and reads-from-the-old-inode on Linux.
 */
export async function restoreBackup(backupId: string, userId: string) {
  const backup = await db.backup.findUnique({ where: { id: backupId } });
  if (!backup) throw new Error("Sauvegarde introuvable");

  const secret = process.env.BACKUP_ENCRYPTION_KEY || process.env.BACKUP_SECRET;
  if (!secret) {
    throw new Error("BACKUP_ENCRYPTION_KEY manquant — impossible de déchiffrer");
  }
  if (secret.length < 32) {
    throw new Error("BACKUP_ENCRYPTION_KEY doit contenir au moins 32 caractères.");
  }

  const backupPath = path.join(BACKUP_DIR, backup.filename);
  const plainPath = path.join(BACKUP_DIR, `restore-${backup.id}.db`);
  await decryptFile(backupPath, plainPath, secret);

  const verifyChecksum = await sha256OfFile(plainPath);
  if (verifyChecksum !== backup.checksum) {
    await fs.unlink(plainPath).catch(() => {});
    throw new Error("Intégrité de la sauvegarde compromise (checksum mismatch)");
  }

  // Pre-restore safety snapshot — encrypted on disk BEFORE the swap. The
  // Backup-row registration happens AFTER the swap (in the RESTORED DB):
  // registering in the old DB would be destroyed by the restore itself
  // (post-audit N6). The filename is deterministic so the row can reference
  // the file written earlier.
  const safetyStamp = `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const safetyPlain = path.join(BACKUP_DIR, `${safetyStamp}.db`);
  await db.$executeRawUnsafe(`VACUUM INTO '${safetyPlain.replace(/'/g, "''")}'`);
  const safetyChecksum = await sha256OfFile(safetyPlain);
  const safetyEncPath = path.join(BACKUP_DIR, `${safetyStamp}.dbenc`);
  await encryptFile(safetyPlain, safetyEncPath, secret);
  await fs.unlink(safetyPlain);
  const safetyStat = await fs.stat(safetyEncPath);

  // Disconnect Prisma before swapping the file so the underlying handle is
  // released. On Windows an open handle would throw EPERM; on Linux the old
  // inode would persist for the running process. Always reconnect afterwards.
  await db.$disconnect();
  try {
    await fs.copyFile(plainPath, DB_PATH);
    // Remove stale WAL/SHM sidecar files from the PREVIOUS database — a
    // mismatched WAL replayed against the new file corrupts it.
    await fs.unlink(`${DB_PATH}-wal`).catch(() => {});
    await fs.unlink(`${DB_PATH}-shm`).catch(() => {});
  } finally {
    await db.$connect();
  }

  await fs.unlink(plainPath).catch(() => {});

  // Register the safety snapshot in the RESTORED database so it appears in
  // the backups list and the operator can roll back with one click.
  let safetyBackupRow: { id: string; filename: string } | null = null;
  try {
    safetyBackupRow = await db.backup.create({
      data: {
        filename: path.basename(safetyEncPath),
        size: safetyStat.size,
        checksum: safetyChecksum,
        encrypted: true,
        sizeBytes: safetyStat.size,
        createdById: userId,
      },
      select: { id: true, filename: true },
    });
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

  await audit(
    "BACKUP_RESTORED",
    "Backup",
    backup.id,
    {
      checksum: verifyChecksum,
      safetyBackupId: safetyBackupRow?.id ?? null,
      safetyFilename: path.basename(safetyEncPath),
    },
    userId,
  );
  await logTechnical(
    "INFO",
    "backup-service",
    `Backup ${backup.id} restored by ${userId}; safety snapshot ${safetyBackupRow?.id ?? path.basename(safetyEncPath)} created.`,
  );
  return { ok: true, safetyBackupId: safetyBackupRow?.id ?? null };
}

export async function listBackups() {
  return db.backup.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });
}

export async function deleteBackup(id: string) {
  const backup = await db.backup.findUnique({ where: { id } });
  if (!backup) return;
  const filepath = path.join(BACKUP_DIR, backup.filename);
  try {
    await fs.unlink(filepath);
  } catch {
    // file may already be gone
  }
  // Also clean up any uploads archive referenced by this backup.
  if (backup.imagesPath) {
    const uploadsFile = path.join(BACKUP_DIR, backup.imagesPath);
    try {
      await fs.unlink(uploadsFile);
    } catch {
      // ignore
    }
  }
  await db.backup.delete({ where: { id } });
}