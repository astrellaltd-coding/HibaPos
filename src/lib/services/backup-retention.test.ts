import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs, existsSync } from "fs";
import path from "path";
import os from "os";
import { db } from "@/lib/db";
import {
  backupRetentionCount,
  createBackup,
  deleteBackup,
  pruneBackups,
  restoreBackup,
  type BackupPaths,
} from "@/lib/services/backup";

// C-06 + M-03 (Batch 2.2). Three failures cost data or disk here:
// backups accumulating until the disk fills, every Z close re-encrypting
// ~49 MiB of unchanged product images, and the annual fiscal archive — the
// file an inspector actually asks for — not being in the backup set at all.

/** The test database's real path, read from the environment `test-setup.ts`
 *  set. Batch 6.3 gave every run its own directory (L-40 / L-43 / warning 3b),
 *  so a hardcoded `hibapos-test-db/test.db` now names a stale file from before
 *  that change — which is exactly how these three tests broke. Derived, never
 *  written twice. */
function testDbPath(): string {
  const url = process.env.DATABASE_URL ?? "";
  return path.resolve(url.replace(/^file:/, "").split("?")[0]);
}

const TEST_DB_PATH = testDbPath();
const TEST_USER_ID = "retention-test-user";

let tmpRoot: string;
let paths: BackupPaths;
let savedRetention: string | undefined;

beforeEach(async () => {
  savedRetention = process.env.BACKUP_RETENTION_COUNT;
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hibapos-retention-"));
  paths = {
    backupDir: path.join(tmpRoot, "backups"),
    dbPath: TEST_DB_PATH,
    uploadsDir: path.join(tmpRoot, "public", "uploads"),
    archivesDir: path.join(tmpRoot, "db", "fiscal-archives"),
  };
  for (const dir of [paths.backupDir, paths.uploadsDir, paths.archivesDir]) {
    await fs.mkdir(dir, { recursive: true });
  }

  await db.backup.deleteMany({});
  await db.fiscalEvent.deleteMany({});
  await db.user.upsert({
    where: { username: "retention-test" },
    update: {},
    create: {
      id: TEST_USER_ID,
      username: "retention-test",
      name: "Retention Test",
      role: "SUPER_ADMIN",
      pinHash: "not-a-real-hash",
    },
  });
});

afterEach(async () => {
  if (savedRetention === undefined) delete process.env.BACKUP_RETENTION_COUNT;
  else process.env.BACKUP_RETENTION_COUNT = savedRetention;
  await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
});

describe("retention configuration", () => {
  it("keeps a month of daily closes by default", () => {
    delete process.env.BACKUP_RETENTION_COUNT;
    expect(backupRetentionCount()).toBe(30);
  });

  it("honours an explicit limit", () => {
    process.env.BACKUP_RETENTION_COUNT = "7";
    expect(backupRetentionCount()).toBe(7);
  });

  it("refuses a limit that would delete every backup", () => {
    // A retention of 0 would prune the backup that was just created.
    for (const bad of ["0", "-5", "abc", ""]) {
      process.env.BACKUP_RETENTION_COUNT = bad;
      expect(backupRetentionCount()).toBe(30);
    }
  });
});

describe("retention pruning (C-06)", () => {
  it("keeps only the newest N backups", async () => {
    process.env.BACKUP_RETENTION_COUNT = "2";

    const first = await createBackup(TEST_USER_ID, paths);
    const second = await createBackup(TEST_USER_ID, paths);
    const third = await createBackup(TEST_USER_ID, paths);

    const remaining = await db.backup.findMany({ orderBy: { createdAt: "asc" } });
    expect(remaining).toHaveLength(2);
    expect(remaining.map((b) => b.id)).toEqual([second.id, third.id]);
    expect(remaining.map((b) => b.id)).not.toContain(first.id);
  });

  it("removes the pruned backup's file, not just its row", async () => {
    // A row without a file is a backup that only looks like one.
    process.env.BACKUP_RETENTION_COUNT = "1";
    const first = await createBackup(TEST_USER_ID, paths);
    const firstFile = path.join(paths.backupDir, first.filename);
    expect(existsSync(firstFile)).toBe(true);

    await createBackup(TEST_USER_ID, paths);

    expect(existsSync(firstFile)).toBe(false);
    expect(await db.backup.findUnique({ where: { id: first.id } })).toBeNull();
  });

  it("reports what it freed", async () => {
    process.env.BACKUP_RETENTION_COUNT = "1";
    await createBackup(TEST_USER_ID, paths);
    await createBackup(TEST_USER_ID, paths);

    process.env.BACKUP_RETENTION_COUNT = "1";
    const result = await pruneBackups(TEST_USER_ID, paths);
    expect(result.deleted).toBe(0); // already at the limit

    process.env.BACKUP_RETENTION_COUNT = "0"; // coerced back to 30
    expect(backupRetentionCount()).toBe(30);
  });

  it("journals the whole prune as one event, not one per file", async () => {
    process.env.BACKUP_RETENTION_COUNT = "1";
    await createBackup(TEST_USER_ID, paths);
    await createBackup(TEST_USER_ID, paths);
    await createBackup(TEST_USER_ID, paths);

    const events = await db.fiscalEvent.findMany({
      where: { type: "SUPPRESSION_SAUVEGARDE" },
    });
    const retentionEvents = events.filter(
      (e) => JSON.parse(e.dataJson).reason === "retention",
    );
    expect(retentionEvents.length).toBeGreaterThan(0);
    for (const e of retentionEvents) {
      const data = JSON.parse(e.dataJson);
      expect(Array.isArray(data.deleted)).toBe(true);
      expect(data.keep).toBe(1);
    }
  });
});

describe("media archive reuse (C-06 disk growth)", () => {
  it("reuses the archive when the media has not changed", async () => {
    await fs.writeFile(path.join(paths.uploadsDir, "burger.webp"), "BURGER");

    const first = await createBackup(TEST_USER_ID, paths);
    const second = await createBackup(TEST_USER_ID, paths);

    // Same content ⇒ same content-addressed archive, encrypted once.
    expect(first.imagesPath).toBe(second.imagesPath);
    expect(first.media?.reused).toBe(false);
    expect(second.media?.reused).toBe(true);

    const mediaFiles = (await fs.readdir(paths.backupDir)).filter((f) =>
      f.startsWith("hibapos-media-"),
    );
    expect(mediaFiles).toHaveLength(1);
  });

  it("builds a new archive when an image is added", async () => {
    await fs.writeFile(path.join(paths.uploadsDir, "a.webp"), "A");
    const first = await createBackup(TEST_USER_ID, paths);

    await fs.writeFile(path.join(paths.uploadsDir, "b.webp"), "B");
    const second = await createBackup(TEST_USER_ID, paths);

    expect(second.imagesPath).not.toBe(first.imagesPath);
    expect(second.media?.reused).toBe(false);
  });

  it("does not delete a shared archive when one of its backups goes", async () => {
    // Fingerprint dedupe means one file can back several backups. Deleting
    // one must not strip the images from the others.
    await fs.writeFile(path.join(paths.uploadsDir, "shared.webp"), "SHARED");
    const first = await createBackup(TEST_USER_ID, paths);
    const second = await createBackup(TEST_USER_ID, paths);
    expect(first.imagesPath).toBe(second.imagesPath);

    const mediaFile = path.join(paths.backupDir, first.imagesPath!);
    await deleteBackup(first.id, TEST_USER_ID, paths);

    expect(existsSync(mediaFile)).toBe(true);

    // …and goes when the last reference does.
    await deleteBackup(second.id, TEST_USER_ID, paths);
    expect(existsSync(mediaFile)).toBe(false);
  });
});

describe("fiscal archives in the backup set (M-03)", () => {
  it("backs up and restores db/fiscal-archives", async () => {
    // This is the file an inspector asks for, and it was not protected at all.
    const archiveFile = path.join(paths.archivesDir, "archive-2026.json");
    const contents = '{"year":2026,"events":[]}';
    await fs.writeFile(archiveFile, contents);

    const backup = await createBackup(TEST_USER_ID, paths);
    await fs.unlink(archiveFile);
    expect(existsSync(archiveFile)).toBe(false);

    await restoreBackup(backup.id, TEST_USER_ID, paths);

    expect(existsSync(archiveFile)).toBe(true);
    expect(await fs.readFile(archiveFile, "utf8")).toBe(contents);
  });

  it("restores archives and uploads together", async () => {
    await fs.writeFile(path.join(paths.archivesDir, "archive-2025.json"), "ARCHIVE");
    await fs.writeFile(path.join(paths.uploadsDir, "photo.webp"), "PHOTO");

    const backup = await createBackup(TEST_USER_ID, paths);
    await fs.rm(paths.archivesDir, { recursive: true, force: true });
    await fs.rm(paths.uploadsDir, { recursive: true, force: true });

    await restoreBackup(backup.id, TEST_USER_ID, paths);

    expect(existsSync(path.join(paths.archivesDir, "archive-2025.json"))).toBe(true);
    expect(existsSync(path.join(paths.uploadsDir, "photo.webp"))).toBe(true);
  });
});
