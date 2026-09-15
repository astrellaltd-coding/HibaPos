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
// Note: we encrypt whole files in memory.
//
// CORRECTED 2026-09-05 (batch 7.1). This said SQLite backups are "typically a
// few MiB (single POS deployment)", which is true of the database and false of
// what this module actually buffers. Measured on the live install: the database
// part is ~586 KB, and the uploads archive beside it is **47 MB** and grows with
// the media library (public/uploads/ is 49 MB across 139 files today). Both are
// read into memory whole, encrypted, and written out. The buffered approach is
// still the deliberate choice — a stream would have to splice the GCM auth tag —
// but it is a choice about a 47 MB buffer, not a 1 MB one, and anyone changing
// it should know which number they are reasoning about.
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
  sameVolume,
  databasePath,
  fiscalArchivesDir,
  uploadsDir,
  type VolumeVerdict,
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
// for an "interactive / file-key" workload.
//
// L-142 (R9.3) — THE MEMORY FIGURE. This said "~1 GiB peak". It is **128 MiB**:
// scrypt's working set is `128 · N · r · p`, which at these parameters is
// exactly 134 217 728 bytes. Measured rather than left as arithmetic, because
// the audit could only do the arithmetic: RSS delta **128.8 MiB** across a real
// `crypto.scrypt` call, and the smallest `maxmem` that does not throw
// `Invalid scrypt params` is between 128 and 129 MiB — the 0.8 is scrypt's own
// bookkeeping on top of the block.
//
// It matters because it is the number anyone sizing a till, a container or an
// installer reaches for, and 8× high in that direction is the expensive way to
// be wrong.
const SCRYPT_N = 1 << 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

/**
 * The ceiling `crypto.scrypt` is allowed to allocate — L-142 (R9.3).
 *
 * DERIVED, not typed. It was a hard-coded 2 GiB here and a hard-coded 512 MiB
 * in `scripts/decrypt-backup.ts`; both work, both are far above the 128 MiB the
 * parameters actually need, and neither would follow the parameters if someone
 * raised N. A literal that is 16× the requirement does not fail when the
 * requirement changes — it silently allocates whatever the new one is.
 *
 * Twice the working set: enough headroom for the bookkeeping the measurement
 * found, tight enough that raising `SCRYPT_N` without thinking about memory
 * fails loudly at the first backup instead of on the till.
 */
const SCRYPT_WORKING_SET = 128 * SCRYPT_N * SCRYPT_R * SCRYPT_P;
const SCRYPT_MAXMEM = SCRYPT_WORKING_SET * 2;
const GCM_IV_LEN = 12; // 12 bytes is the conventional GCM IV; random per-file.

/**
 * The backup key — L-141 (R9.3). **The only place that decides.**
 *
 * `process.env.BACKUP_ENCRYPTION_KEY || process.env.BACKUP_SECRET` was written
 * out in four places and `BACKUP_SECRET` was documented in none of them — not
 * `.env.example`, not `docs/INVARIANTS.md`, not the plan. `bootstrapSecrets()`
 * and `scripts/rotate-secrets.ts` know only the long name, so an install
 * holding its key under the short one would have a fresh long-named key
 * generated, the `||` would prefer it, and **every existing backup would be
 * orphaned — silently, because both names "work".** Undecryptable backups
 * discovered at the moment they are needed.
 *
 * Three rules, and the middle one is the finding:
 *
 *   * `BACKUP_ENCRYPTION_KEY` alone — the normal case, and this install's.
 *   * BOTH set and DIFFERENT — **refuse.** This is the orphaning scenario
 *     itself, and the one outcome that must not be resolved by a coin toss
 *     hidden in an operator. Backups made under either key are still readable
 *     with `scripts/decrypt-backup.ts`; nothing is lost by stopping.
 *   * `BACKUP_SECRET` alone — used, and said out loud, every time. The
 *     fallback is kept rather than dropped because it is the only key an
 *     install provisioned under the old name has, and taking it away would
 *     turn a documentation gap into unreadable backups. It is now documented
 *     in `.env.example` as legacy.
 *
 * Nothing in this project uses the short name: `.env` here holds
 * `BACKUP_ENCRYPTION_KEY`, and the app has never shipped. So this guards a
 * scenario that does not exist yet — which is the only time it is cheap.
 */
export async function backupSecret(): Promise<string | null> {
  const primary = process.env.BACKUP_ENCRYPTION_KEY?.trim() || null;
  const legacy = process.env.BACKUP_SECRET?.trim() || null;

  if (primary && legacy && primary !== legacy) {
    throw new Error(
      "BACKUP_ENCRYPTION_KEY et BACKUP_SECRET sont tous les deux définis et diffèrent. " +
        "Les sauvegardes chiffrées avec l'un ne s'ouvrent pas avec l'autre : " +
        "supprimez celui qui n'est plus utilisé avant de continuer. " +
        "Les fichiers existants restent lisibles avec scripts/decrypt-backup.ts.",
    );
  }
  if (!primary && legacy) {
    await logTechnical(
      "WARN",
      "backup-service",
      "BACKUP_SECRET est utilisé : c'est l'ancien nom de BACKUP_ENCRYPTION_KEY. " +
        "Renommez-le — bootstrapSecrets() et rotate-secrets.ts ne connaissent que " +
        "BACKUP_ENCRYPTION_KEY et généreraient une nouvelle clé à côté de celle-ci, " +
        "ce qui rendrait toutes les sauvegardes existantes illisibles.",
    );
  }
  return primary ?? legacy;
}

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
        maxmem: SCRYPT_MAXMEM,
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
  // L-108 (R9.3): which of the two configured directories are not on disk.
  // `entries` alone cannot answer that — an empty list means « neither is
  // there », and the caller needs to know it was LOOKING for them.
  const missing: string[] = [];
  for (const dir of [paths.uploadsDir, paths.archivesDir]) {
    if (existsSync(dir)) {
      entries.push(path.relative(base, dir).split(path.sep).join("/"));
    } else {
      missing.push(dir);
    }
  }
  return { base, entries, missing };
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
/**
 * Does the media set contain a single file? — L-108 (R9.3).
 *
 * `entries.length` cannot answer it: an entry is a DIRECTORY THAT EXISTS,
 * whatever is inside. Distinguishing « the configured directory is not there »
 * from « it is there and empty » is the whole of L-108, and the second must
 * stay a completely successful backup — that is L-79's invariant and it is
 * still right.
 *
 * Stops at the first file. On a full media library that is one `readdir`; on an
 * empty one it walks a tree with nothing in it, which is also nothing.
 */
async function hasAnyMedia(base: string, entries: string[]): Promise<boolean> {
  const walk = async (dir: string): Promise<boolean> => {
    let items: import("fs").Dirent<string>[];
    try {
      items = (await fs.readdir(dir, { withFileTypes: true })) as import("fs").Dirent<string>[];
    } catch {
      return false;
    }
    for (const item of items) {
      if (item.isFile()) return true;
      if (item.isDirectory() && (await walk(path.join(dir, item.name)))) return true;
    }
    return false;
  };
  for (const entry of entries) {
    if (await walk(path.join(base, entry))) return true;
  }
  return false;
}

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
type MediaArchive = { filename: string; bytes: number; reused: boolean };
/** L-79 (R4.1): the archive could not be built. Distinct from `null`, which
 *  means there was nothing to archive — see `ensureMediaArchive`. */
type MediaUnavailable = { unavailable: string };

/**
 * How `tar` is loaded. Injected for the same reason `BackupPaths` is: the
 * failure this function has to handle — the package not loading — cannot be
 * produced any other way in a test.
 *
 * `mock.module("tar", …)` was tried first and REJECTED as an approach: bun's
 * module mocks are process-wide, and `bun run test` runs every file in one
 * process, so mocking `tar` broke three real tests in `backup-restore.test.ts`.
 * Measured, not feared. An injected default keeps production on the real
 * dynamic import and leaves every other test alone.
 */
export type TarLoader = () => Promise<typeof import("tar")>;
const loadTar: TarLoader = () => import("tar") as Promise<typeof import("tar")>;

async function ensureMediaArchive(
  backupDir: string,
  paths: { uploadsDir: string; archivesDir: string },
  secret: string,
  tarLoader: TarLoader = loadTar,
): Promise<MediaArchive | MediaUnavailable | null> {
  const { base, entries, missing } = mediaSources(paths);

  // L-108 (R9.3) — « THE DIRECTORY IS NOT THERE » IS NOT « THERE ARE NO IMAGES ».
  //
  // `mediaSources` includes a directory only `if (existsSync(dir))`, and with
  // neither present this returned `null` — which by the R4.1 invariant means
  // « nothing to archive », the same answer an install with genuinely no images
  // gets. So a backup containing no images at all was recorded exactly like a
  // complete one. **Observed in the audit's pass-4 run: `media: null` while
  // 48 MB of catalogue images sat in `public/uploads`.**
  //
  // A NEW FACET OF L-79, which closed this same conflation at the LOADER and
  // left it open at the PATH. Reported through the channel L-79 built, so
  // nothing downstream changes shape: `{ unavailable }` is already « the
  // database backup succeeded, the media did not ».
  //
  // **This fires the day the data directory moves** — `uploadsDir()` answers
  // `public/uploads` today and `<HIBAPOS_DATA_DIR>/uploads` once
  // `HIBAPOS_DATA_DIR` is set, which is a deployment step that has not happened
  // yet. Which is why it is worth fixing now and not then.
  if (entries.length === 0) {
    const reason = `dossier(s) média introuvable(s) : ${missing.join(", ")}`;
    await logTechnical(
      "WARN",
      "backup-service",
      `Sauvegarde : archive média ignorée — ${reason}. ` +
        `Cette sauvegarde contient UNIQUEMENT la base de données. Si ce dossier devrait ` +
        `exister, HIBAPOS_DATA_DIR a probablement changé sans que les fichiers aient suivi.`,
    );
    return { unavailable: reason };
  }

  // …and « the directories are there and hold nothing » is still NULL: a
  // completely successful backup of an installation with no images. That is
  // L-79's invariant and this batch does not touch it — it only stops the
  // OTHER case from borrowing the same answer.
  if (!(await hasAnyMedia(base, entries))) return null;

  // One of the two is missing while the other is present. Not fatal — the
  // archive is built from what is there — but it is not silent either: the
  // fiscal archives directory going absent is exactly the case an inspector's
  // request would discover at the worst moment.
  if (missing.length > 0) {
    await logTechnical(
      "WARN",
      "backup-service",
      `Sauvegarde : ${missing.join(", ")} introuvable(s) — l'archive média est construite ` +
        `sans ce contenu.`,
    );
  }

  let tar: typeof import("tar") | null = null;
  try {
    tar = await tarLoader();
  } catch (e) {
    // L-79 (R4.1). This was `console.warn(...)` and `return null` — the only
    // `console.*` call in this file, and a return value indistinguishable from
    // « nothing to archive ». So a backup that silently contained no images at
    // all was recorded, in the audit log and in the `Backup` row, exactly like
    // one from an installation with no images: `mediaIncluded: false` either
    // way. The operator had no way to learn the difference.
    //
    // `restoreUploadsArchive` above already answers this same failure with
    // `{ failed: … }`; this is the create side catching up, not a new pattern.
    //
    // WARN, not ERROR, and that is this file's own convention rather than a
    // judgement: ERROR is used where a journal entry that should exist could
    // not be written, WARN where the operation completed but degraded. The
    // database backup DID succeed — only the media are missing.
    const reason = e instanceof Error ? e.message : String(e);
    await logTechnical(
      "WARN",
      "backup-service",
      `Sauvegarde : archive média ignorée — le paquet « tar » n'a pas pu être chargé (${reason}). ` +
        `Cette sauvegarde contient UNIQUEMENT la base de données ; les images et les archives ` +
        `fiscales n'y sont pas.`,
    );
    return { unavailable: reason };
  }

  const fingerprint = await mediaFingerprint(base, entries);
  const encFilename = `hibapos-media-${fingerprint}.enc`;
  const encPath = path.join(backupDir, encFilename);

  if (existsSync(encPath)) {
    const stat = await fs.stat(encPath);
    return { filename: encFilename, bytes: stat.size, reused: true };
  }

  // L-85 (R4.5) — BUILDING the archive is guarded too, not just LOADING `tar`.
  //
  // These four statements used to sit outside any `try`, so a failure here —
  // a full disk, a permission error, a file vanishing mid-archive, a corrupt
  // source — propagated out of `ensureMediaArchive`, out of `createBackup`, and
  // **failed the whole backup, including the database half that had already
  // been snapshotted and encrypted.** Losing the database backup because the
  // images could not be tarred is the wrong trade in every case: the database
  // is the part that cannot be reconstructed.
  //
  // The restore side has always worked this way — `restoreUploadsArchive` wraps
  // its `tar.x` and returns `{ failed }` — so this is the create side matching
  // it, and it reports through the same `{ unavailable }` channel L-79 added.
  const plainPath = path.join(backupDir, `hibapos-media-${fingerprint}.tar.gz`);
  try {
    await tar.c({ gzip: true, file: plainPath, cwd: base, portable: true }, entries);
    await encryptFile(plainPath, encPath, secret);
    await fs.unlink(plainPath).catch(() => {});
    const stat = await fs.stat(encPath);
    return { filename: encFilename, bytes: stat.size, reused: false };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    // Leave nothing half-written behind: a stray `.tar.gz`, or an `.enc` that
    // was never completed, would be picked up as a valid reuse by the
    // `existsSync(encPath)` check above on the NEXT backup.
    await fs.unlink(plainPath).catch(() => {});
    await fs.unlink(encPath).catch(() => {});
    await logTechnical(
      "WARN",
      "backup-service",
      `Sauvegarde : archive média non construite — ${reason}. ` +
        `Cette sauvegarde contient UNIQUEMENT la base de données ; les images et les archives ` +
        `fiscales n'y sont pas.`,
    );
    return { unavailable: reason };
  }
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
  /** L-79 (R4.1): injected only so a test can make the `tar` import fail. The
   *  default is the real dynamic import, so production is unchanged. */
  tarLoader: TarLoader = loadTar,
) {
  const { backupDir, uploadsDir, archivesDir } = paths;
  await ensureDir(backupDir);
  const secret = await backupSecret();
  if (!secret) {
    throw new Error("BACKUP_ENCRYPTION_KEY environment variable is required to create backups.");
  }
  if (secret.length < 32) {
    throw new Error("BACKUP_ENCRYPTION_KEY must be at least 32 characters long.");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const plainDbFilename = `hibapos-backup-${stamp}.db`;
  const plainDbPath = path.join(backupDir, plainDbFilename);
  const encDbFilename = `hibapos-backup-${stamp}.dbenc`;
  const encDbPath = path.join(backupDir, encDbFilename);

  // L-104 (R9.3) — THE PLAINTEXT WINDOW IS CLOSED ON EVERY EXIT.
  //
  // `VACUUM INTO` writes the ENTIRE DATABASE to disk unencrypted, and it stayed
  // that way until the `unlink` after `encryptFile`. `createBackup` had no
  // `try`/`finally` anywhere in its body, so any throw in between left the file
  // there — a full disk being the obvious one. It gets no `Backup` row, so
  // `pruneBackups` never removes it and `listBackups` never shows it: it is
  // permanent and invisible.
  //
  // MEASURED, not feared. The audit patched `writeFile` to throw `ENOSPC` and
  // ran the real `createBackup`: **741 376 bytes of readable database left in
  // the backup directory, `User.pinHash` column and all.** And on this install
  // `BACKUP_LOCATION` is inside OneDrive, **so the plaintext leaves the
  // machine.**
  //
  // `finally`, not `catch`, for L-62's reason one function down: the failure
  // that leaves litter is by definition the one nobody predicted. The unlink
  // swallows its own error so a housekeeping detail cannot mask the real cause,
  // and on the success path it is a no-op because the file is already gone.
  let checksum: string;
  let media: MediaArchive | MediaUnavailable | null;
  try {
    // Crash-safe snapshot using `VACUUM INTO` — SQLite atomically copies the
    // database into a new file, applying any pending WAL writes. Prisma rejects
    // `PRAGMA journal_mode = WAL` via raw query (result rows), but VACUUM INTO
    // returns no rows and works here.
    await db.$executeRawUnsafe(`VACUUM INTO '${plainDbPath.replace(/'/g, "''")}'`);

    // Compute SHA-256 of the plaintext snapshot.
    checksum = await sha256OfFile(plainDbPath);

    // Media archive (uploads + fiscal archives), reused when unchanged.
    media = await ensureMediaArchive(backupDir, { uploadsDir, archivesDir }, secret, tarLoader);

    // Encrypt the DB snapshot.
    await encryptFile(plainDbPath, encDbPath, secret);
  } catch (e) {
    // A half-written `.dbenc` is worse than none: `createBackup` would go on to
    // `fs.stat` it and record a `Backup` row for a file that cannot be
    // decrypted. Nothing reuses this name, so removing it costs nothing.
    await fs.unlink(encDbPath).catch(() => {});
    throw e;
  } finally {
    await fs.unlink(plainDbPath).catch(() => {});
  }

  // L-79: three outcomes now, not two. `archived` is the success case; a
  // `unavailable` reason is a degraded backup; `null` is an installation with
  // no media, which is not a problem at all.
  const archived: MediaArchive | null = media && "filename" in media ? media : null;
  const mediaUnavailable: string | null = media && "unavailable" in media ? media.unavailable : null;
  const imagesPath = archived?.filename ?? null;

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
      mediaIncluded: archived != null,
      mediaReused: archived?.reused ?? false,
      mediaBytes: archived?.bytes ?? 0,
      // L-79: present ONLY when the archive could not be built, so an audit
      // entry without this key still means what it always meant.
      ...(mediaUnavailable ? { mediaUnavailable } : {}),
      backupDir,
    },
    userId,
  );

  const pruned = await pruneBackups(userId, paths);

  return Object.assign(backup, {
    media: archived
      ? { filename: archived.filename, bytes: archived.bytes, reused: archived.reused }
      : null,
    // L-79: the caller can tell a degraded backup from a complete one. Null on
    // every backup that was not degraded, which is every backup today.
    mediaUnavailable,
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
async function assertCompatibleSchema(stagedDbPath: string): Promise<string[]> {
  // L-140 (R9.3) — RETURNED, not logged here.
  //
  // This function runs BEFORE the swap and `logTechnical` writes through `db`,
  // which is connected to the file the swap is about to replace. So every
  // warning it emitted was destroyed by the restore it was describing — the
  // extra-TABLES warning included, which has been in this function since Batch
  // 2.2 and has therefore never once been readable afterwards. Measured, not
  // reasoned: after a successful restore the only `backup-service` row left is
  // the post-swap « restored by » one.
  //
  // A refusal is unaffected — it throws, nothing is swapped, and the message
  // reaches the operator directly. It is only the warnings, which by definition
  // accompany a restore that GOES AHEAD, that could not survive.
  const warnings: string[] = [];
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
    // L-140 (R9.3): extra COLUMNS were silent while extra TABLES warned. Same
    // signal — the file came from a newer HibaPOS — and no reason for the two
    // to be reported differently.
    const extraColumns: string[] = [];
    for (const table of liveTables) {
      const live = await columnsOf(db, table);
      const stagedCols = await columnsOf(staged, table);
      for (const col of live) {
        if (!stagedCols.includes(col)) missingColumns.push(`${table}.${col}`);
      }
      for (const col of stagedCols) {
        if (!live.includes(col)) extraColumns.push(`${table}.${col}`);
      }
    }
    if (missingColumns.length > 0) {
      throw new Error(
        `Sauvegarde incompatible : ${missingColumns.length} colonne(s) manquante(s) — ` +
          `${missingColumns.slice(0, 5).join(", ")}${missingColumns.length > 5 ? "…" : ""}. ` +
          "Restauration refusée.",
      );
    }

    // ── L-140 (R9.3) — UNIQUE INDEXES, which are a fiscal control ────────────
    //
    // The check compared names only: no types, no NOT NULL, and **no unique
    // indexes**. A file carrying `Order.number`, `FiscalEvent.sequence` and
    // `ZReport.number` as ordinary columns — the same names, the same tables —
    // passed every assertion above and restored cleanly, and **the gapless
    // numbering backstop was simply gone.** Not a schema nicety: those three
    // indexes are what make a duplicated receipt number impossible at the
    // storage layer, and R8.2's whole idempotency design ends at
    // `Order.idempotencyKey`'s unique index. A restore is exactly when a file
    // of unknown provenance is admitted.
    //
    // Missing unique index ⇒ REFUSE, on the same footing as a missing column,
    // because what is lost is a guarantee rather than a field. Types and NOT
    // NULL are still not checked and that is still a gap — recorded here rather
    // than half-done, because comparing them properly means parsing
    // `sqlite_master` DDL and the plan asks for the cheap parts.
    const uniqueKeysOf = async (client: {
      $queryRawUnsafe: typeof db.$queryRawUnsafe;
    }): Promise<Set<string>> => {
      const keys = new Set<string>();
      for (const table of liveTables) {
        const list = await client
          .$queryRawUnsafe<{ name: string; unique: number | bigint }[]>(
            `PRAGMA index_list("${table.replace(/"/g, '""')}")`,
          )
          .catch(() => [] as { name: string; unique: number | bigint }[]);
        for (const idx of list) {
          if (Number(idx.unique) !== 1) continue;
          const cols = await client
            .$queryRawUnsafe<{ name: string }[]>(
              `PRAGMA index_info("${idx.name.replace(/"/g, '""')}")`,
            )
            .catch(() => [] as { name: string }[]);
          if (cols.length === 0) continue;
          keys.add(`${table}(${cols.map((c) => c.name).join(",")})`);
        }
      }
      return keys;
    };
    const liveUnique = await uniqueKeysOf(db);
    const stagedUnique = await uniqueKeysOf(staged);
    const missingUnique = [...liveUnique].filter((k) => !stagedUnique.has(k)).sort();
    if (missingUnique.length > 0) {
      throw new Error(
        `Sauvegarde incompatible : ${missingUnique.length} contrainte(s) d'unicité ` +
          `manquante(s) — ${missingUnique.slice(0, 5).join(", ")}` +
          `${missingUnique.length > 5 ? "…" : ""}. ` +
          "Ces index sont ce qui rend impossible un numéro de ticket en double ; " +
          "restaurer sans eux retirerait cette garantie. Restauration refusée. " +
          "Le fichier reste lisible avec scripts/decrypt-backup.ts.",
      );
    }

    // Extra tables mean the backup came from a NEWER version. The running
    // code does not read them, so the restore is safe for it — but the
    // mismatch is worth a trace rather than silence.
    const extraTables = stagedTables.filter((t) => !liveTables.includes(t));
    if (extraTables.length > 0) {
      warnings.push(
        `Restore: backup carries ${extraTables.length} table(s) this version does not use (${extraTables.join(", ")}). It was probably taken by a newer HibaPOS.`,
      );
    }
    if (extraColumns.length > 0) {
      warnings.push(
        `Restore: backup carries ${extraColumns.length} column(s) this version does not use (${extraColumns.slice(0, 10).join(", ")}${extraColumns.length > 10 ? "…" : ""}). It was probably taken by a newer HibaPOS.`,
      );
    }
  } finally {
    await staged.$disconnect().catch(() => {});
  }
  return warnings;
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
/** How long to keep trying the swap before giving up (L-61, Batch 2.5). */
export const RENAME_RETRY_BUDGET_MS = 5_000;
const RENAME_RETRY_INTERVAL_MS = 100;

/**
 * Replace `dest` with `src`, tolerating a destination handle that is on its way
 * out (L-61, Batch 2.5).
 *
 * Windows refuses to rename over a file another handle still has open, and
 * `PrismaClient.$disconnect()` releases its handle a few milliseconds after it
 * resolves rather than synchronously. Retrying is safe: `rename` is atomic, so
 * each attempt either completes or changes nothing.
 *
 * Only `EPERM`, `EACCES` and `EBUSY` are retried — the three Windows reports
 * for "someone else has this file". Anything else (a missing source, a full
 * disk, a cross-volume move) is a real failure and is raised immediately
 * rather than after five seconds of pointless waiting.
 */
export async function renameWithRetry(
  src: string,
  dest: string,
  deps: {
    budgetMs?: number;
    sleep?: (ms: number) => Promise<void>;
    // Injected so a test can drive THIS function against a simulated Windows
    // handle. Reimplementing the loop in the test file would let the tests
    // pass while the shipped code was broken, which is the one thing a
    // recovery path must not allow.
    rename?: (from: string, to: string) => Promise<void>;
  } = {},
): Promise<{ attempts: number; waitedMs: number }> {
  const budgetMs = deps.budgetMs ?? RENAME_RETRY_BUDGET_MS;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const rename = deps.rename ?? fs.rename;
  const started = Date.now();
  let attempts = 0;
  for (;;) {
    attempts++;
    try {
      await rename(src, dest);
      return { attempts, waitedMs: Date.now() - started };
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      const retryable = code === "EPERM" || code === "EACCES" || code === "EBUSY";
      if (!retryable || Date.now() - started >= budgetMs) {
        if (retryable) {
          // Say what actually happened, in the language the operator reads.
          throw new Error(
            `La base n'a pas pu être remplacée : le fichier est resté ouvert par un autre ` +
              `processus pendant ${Math.round((Date.now() - started) / 1000)} s (${code}). ` +
              `Aucune donnée n'a été modifiée. Arrêtez l'application et restaurez le fichier ` +
              `à la main : voir scripts/decrypt-backup.ts.`,
          );
        }
        throw e;
      }
      await sleep(RENAME_RETRY_INTERVAL_MS);
    }
  }
}

export async function restoreBackup(
  backupId: string,
  userId: string,
  paths: BackupPaths = defaultBackupPaths(),
) {
  const { backupDir, dbPath, uploadsDir, archivesDir } = paths;
  const backup = await db.backup.findUnique({ where: { id: backupId } });
  if (!backup) throw new Error("Sauvegarde introuvable");

  const secret = await backupSecret();
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
  let schemaWarnings: string[] = [];
  try {
    schemaWarnings = await assertCompatibleSchema(stagedDbPath);
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
  //
  // L-105 (R9.3) — L-104's leak on the restore path, and structurally the same
  // three lines: `VACUUM INTO` → `sha256OfFile` → `encryptFile` → `unlink`.
  // These sat OUTSIDE the `try` that begins below, so L-62's cleanup — which
  // exists precisely to catch what nobody predicted — could not reach them: it
  // guards the STAGED files, and this one is created before the block it
  // guards. A failure at `encryptFile` stranded a plaintext copy of the whole
  // live database, on the same install whose backup directory is inside
  // OneDrive.
  //
  // Same shape as L-104 above and for the same reason. The staged database and
  // the staged media archive are NOT unlinked here — those belong to L-62's
  // `finally`, which runs later and covers the irreversible part too.
  const safetyStamp = `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const safetyPlain = path.join(backupDir, `${safetyStamp}.db`);
  const safetyEncPath = path.join(backupDir, `${safetyStamp}.dbenc`);
  let safetyChecksum: string;
  try {
    await db.$executeRawUnsafe(`VACUUM INTO '${safetyPlain.replace(/'/g, "''")}'`);
    safetyChecksum = await sha256OfFile(safetyPlain);
    await encryptFile(safetyPlain, safetyEncPath, secret);
  } catch (e) {
    // Nothing irreversible has happened yet — the live database is untouched
    // and the swap is still ahead. Clear the staged restore too and stop,
    // rather than proceeding without the rollback point.
    await fs.unlink(safetyEncPath).catch(() => {});
    await fs.unlink(stagedDbPath).catch(() => {});
    if (stagedUploadsTar) await fs.unlink(stagedUploadsTar).catch(() => {});
    throw new Error(
      `Instantané de sécurité impossible — restauration annulée avant toute modification : ` +
        `${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    await fs.unlink(safetyPlain).catch(() => {});
  }
  const safetyStat = await fs.stat(safetyEncPath);

  // --- The irreversible part. Hold the maintenance gate across all of it. ---
  beginRestore();
  let uploadsResult: { restored: number } | { failed: string } | null = null;
  try {
    await db.$disconnect();
    try {
      // rename() is atomic on the same volume: either the old file or the new
      // one is at dbPath, never a partial mixture. On Windows it replaces the
      // destination (MoveFileEx MOVEFILE_REPLACE_EXISTING) — but ONLY if no
      // other handle still has the destination open.
      //
      // L-61 (Batch 2.5): that is why this used to fail with `EPERM` on every
      // attempt. The root cause was two PrismaClients (see `lib/db.ts`), and it
      // is fixed there. The retry below is the belt to that fix's braces: the
      // handle is released by `$disconnect()` a few milliseconds later rather
      // than synchronously — measured at 4–9 ms — and a machine under load can
      // take longer. Retrying a rename is safe because it either happened or it
      // did not; there is no partial state to re-enter.
      await renameWithRetry(stagedDbPath, dbPath);
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
      stagedUploadsTar = null;
    }
  } finally {
    // L-62 (Batch 2.5) — clean up whatever the attempt staged, on EVERY exit.
    //
    // These unlinks used to live only on the paths that anticipated a failure,
    // so an unexpected one — L-61's `EPERM` on the swap — left the staged
    // database beside the live file AND, worse, a **decrypted** copy of the
    // whole media archive in `db/backups/`: 47,6 MB of every product photo,
    // unencrypted, on the till, one per failed attempt. Measured, not feared.
    //
    // Deliberately in `finally` rather than in a `catch`: the failure that
    // leaves litter is by definition the one nobody predicted. Both unlinks
    // swallow their own errors, because a cleanup that throws would mask the
    // real cause with a housekeeping detail. On the success path both files
    // are already gone and these are no-ops.
    await fs.unlink(stagedDbPath).catch(() => {});
    if (stagedUploadsTar) await fs.unlink(stagedUploadsTar).catch(() => {});
    endRestore();
  }

  // --- Everything below runs against the RESTORED database. ---

  // L-140 (R9.3): the schema check's warnings, written HERE because writing
  // them where they were produced put them in the file the swap replaced.
  for (const message of schemaWarnings) {
    await logTechnical("WARN", "backup-service", message);
  }

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

  // L-107 (R9.3) — THE TRACE IS WRITTEN BEFORE THE FILES GO.
  //
  // This journalled `SUPPRESSION_SAUVEGARDE` after the loop, once every file
  // was already unlinked. `deleteBackup` — the RARE, manual path — journals
  // first and says why in its own comment: « a trace written afterwards would
  // be lost if the process died mid-delete ». **The rule was stated in the rare
  // path and broken in the common one.** This is the automatic path; it runs at
  // every Z close, so it is the one that will actually be interrupted one day.
  //
  // What is journalled is therefore the DOOMED list, decided and recorded
  // before anything is destroyed, not a list of what was successfully removed.
  // That is the right record either way: an interrupted prune leaves an event
  // naming files that may still exist, which is recoverable and obvious, where
  // the old order left destroyed files and no event at all.
  //
  // `freedBytes` is measured during the loop and cannot be in the event —
  // stated here rather than silently dropped. The sizes are in the `Backup`
  // rows the event names, and the technical log below still reports the total.
  const doomedForEvent = doomed.map((b) => ({
    id: b.id,
    filename: b.filename,
    imagesPath: b.imagesPath,
    checksum: b.checksum,
    sizeBytes: b.sizeBytes,
    createdAt: b.createdAt.toISOString(),
  }));
  try {
    await db.$transaction((tx) =>
      appendFiscalEvent(tx, {
        type: "SUPPRESSION_SAUVEGARDE",
        userId,
        data: { reason: "retention", keep, doomed: doomedForEvent },
      }),
    );
  } catch (e) {
    await logTechnical(
      "ERROR",
      "backup-service",
      `Retention prune: SUPPRESSION_SAUVEGARDE event could not be appended: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

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

/**
 * What is ACTUALLY in the backup folder, against what the database believes —
 * L-190 — and whether it is even on a different disk — L-194.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `listBackups()` above is `db.backup.findMany()`. It reads the TABLE and never
 * looks at the folder, so the two can drift, and **the application believes the
 * table**. Both directions are real and only one of them is harmless:
 *
 *   unmanaged  a FILE with no row. Invisible in Réglages, and `pruneBackups`
 *              keeps the newest N ROWS — so nothing will ever remove it. Five
 *              of these appeared on 2026-09-12 when the audit's pass 5 ran
 *              `createBackup` against the real `BACKUP_LOCATION` (**L-188**):
 *              the files landed in the operator's folder, the rows in a
 *              throwaway test database.
 *   missing    a ROW whose file is gone. **This is the one that bites.**
 *              Réglages lists a backup, the operator believes they have it, and
 *              they find out at the moment they try to restore. Nothing
 *              produced one yet — hand-deleting a file is all it would take.
 *
 * ── IT REPORTS AND DELETES NOTHING ──────────────────────────────────────────
 * Adopting an unmanaged file (writing it a row) would put it under the
 * retention prune, which would then delete a file this software did not create
 * and cannot vouch for. Deleting one is worse. So this answers the question and
 * the operator acts — which is also why it is safe to call on every render.
 */
export type BackupStorageReport = {
  directory: string;
  databaseDirectory: string;
  /** L-194 — `SAME` means C-06 is being violated: a backup on the same disk as
   *  the database is not a backup. `UNKNOWN` where a path cannot answer. */
  volume: VolumeVerdict;
  /** Files present with no row. Never removed by retention. */
  unmanaged: { filename: string; sizeBytes: number; modifiedAt: string }[];
  /** Rows whose file is absent — a backup that is listed and is not there. */
  missing: { id: string; filename: string; createdAt: string }[];
};

export async function backupStorageReport(
  paths: BackupPaths = defaultBackupPaths(),
): Promise<BackupStorageReport> {
  // **THE VERDICT IS ABOUT THE PATHS THIS WAS GIVEN**, not about the global
  // configuration. The first version called `backupVolumeReport()`, which reads
  // `BACKUP_LOCATION` and `databasePath()` directly — so with injected paths the
  // report described the folder it had scanned and the volume of a different
  // one, and no test could drive SAME or DIFFERENT through it at all. The test
  // passed; it was asserting « the live machine's answer is one of three ».
  const dir = paths.backupDir;
  const databaseDirectory = path.dirname(paths.dbPath);
  const volume = sameVolume(dir, databaseDirectory);

  let onDisk: string[] = [];
  try {
    onDisk = (await fs.readdir(dir)).filter((f) => f.endsWith(".dbenc") || f.endsWith(".enc"));
  } catch {
    // No folder yet is not a fault: nothing has been backed up. Every list
    // below is then empty, which is the truthful answer rather than an error.
  }

  const rows = await db.backup.findMany({
    select: { id: true, filename: true, createdAt: true, imagesPath: true },
    orderBy: { createdAt: "desc" },
  });

  // The media archive is CONTENT-ADDRESSED and shared by every backup whose
  // images have not changed, so it is referenced by rows rather than owned by
  // one. Counting it as unmanaged would report the one file that must never be
  // deleted as the one nothing is using.
  const referenced = new Set<string>();
  for (const r of rows) {
    referenced.add(r.filename);
    if (r.imagesPath) referenced.add(path.basename(r.imagesPath));
  }

  const unmanaged: BackupStorageReport["unmanaged"] = [];
  for (const filename of onDisk.sort()) {
    if (referenced.has(filename)) continue;
    try {
      const stat = await fs.stat(path.join(dir, filename));
      unmanaged.push({
        filename,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    } catch {
      // Vanished between the listing and the stat — then it is not there, and
      // « not there » is not something to report as present.
    }
  }

  const present = new Set(onDisk);
  const missing = rows
    .filter((r) => !present.has(r.filename))
    .map((r) => ({ id: r.id, filename: r.filename, createdAt: r.createdAt.toISOString() }));

  return { directory: dir, databaseDirectory, volume, unmanaged, missing };
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
