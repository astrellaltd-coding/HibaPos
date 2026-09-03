import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs, existsSync } from "fs";
import path from "path";
import os from "os";
import { db } from "@/lib/db";
import {
  createBackup,
  restoreBackup,
  deleteBackup,
  type BackupPaths,
} from "@/lib/services/backup";
import { isRestoreInProgress } from "@/lib/services/maintenance";

// T-01 (Batch 2.1) — the round trip the project never had a test for:
// create a backup, change the world, restore, and prove the world came back.
// C-05 was three defects at once (images never restored, a non-atomic
// copyFile over the live database, and requests served during the swap), so
// these tests assert the *file* outcomes, not just the return value.
//
// Every path is injected, pointing at throwaway directories. Without that,
// a run from the project root would restore over the real db/custom.db.

const TEST_DB_PATH = path.join(os.tmpdir(), "hibapos-test-db", "test.db");
const TEST_USER_ID = "restore-test-user";

let tmpRoot: string;
let paths: BackupPaths;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hibapos-restore-"));
  paths = {
    backupDir: path.join(tmpRoot, "backups"),
    dbPath: TEST_DB_PATH, // the database Prisma is actually connected to
    uploadsDir: path.join(tmpRoot, "public", "uploads"),
    archivesDir: path.join(tmpRoot, "db", "fiscal-archives"),
  };
  await fs.mkdir(paths.backupDir, { recursive: true });
  await fs.mkdir(paths.uploadsDir, { recursive: true });
  await fs.mkdir(paths.archivesDir, { recursive: true });

  await db.backup.deleteMany({});
  await db.fiscalEvent.deleteMany({});
  await db.customer.deleteMany({});

  // A real operator row: the safety snapshot's createdById is a foreign key
  // into the RESTORED database, and audit entries reference it too.
  await db.user.upsert({
    where: { username: "restore-test" },
    update: {},
    create: {
      id: TEST_USER_ID,
      username: "restore-test",
      name: "Restore Test",
      role: "SUPER_ADMIN",
      pinHash: "not-a-real-hash",
    },
  });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
});

/** A marker row that is easy to create, count and destroy. */
async function addCustomer(name: string) {
  return db.customer.create({ data: { name } });
}

describe("backup → restore round trip (T-01)", () => {
  it("restores database rows that were deleted after the backup", async () => {
    await addCustomer("Avant sauvegarde");
    const backup = await createBackup(null, paths);

    await db.customer.deleteMany({});
    expect(await db.customer.count()).toBe(0);

    await restoreBackup(backup.id, TEST_USER_ID, paths);

    const restored = await db.customer.findMany();
    expect(restored).toHaveLength(1);
    expect(restored[0].name).toBe("Avant sauvegarde");
  });

  it("restores an uploads file deleted after the backup (C-05a)", async () => {
    // This is the defect that made a restore produce a working database in
    // which every product image is a broken link.
    const imagePath = path.join(paths.uploadsDir, "produit.webp");
    const imageBytes = Buffer.from("PRETEND-WEBP-BYTES-0123456789");
    await fs.writeFile(imagePath, imageBytes);

    const backup = await createBackup(null, paths);
    expect(backup.imagesPath).toBeTruthy(); // the archive was actually made

    await fs.unlink(imagePath);
    expect(existsSync(imagePath)).toBe(false);

    const result = await restoreBackup(backup.id, TEST_USER_ID, paths);

    expect(existsSync(imagePath)).toBe(true);
    expect((await fs.readFile(imagePath)).equals(imageBytes)).toBe(true);
    expect(result.images.restored).toBeGreaterThan(0);
  });

  it("restores rows and images in the same operation", async () => {
    const imagePath = path.join(paths.uploadsDir, "burger.webp");
    await fs.writeFile(imagePath, "BURGER");
    await addCustomer("Client sauvegardé");

    const backup = await createBackup(null, paths);

    await db.customer.deleteMany({});
    await fs.unlink(imagePath);

    await restoreBackup(backup.id, TEST_USER_ID, paths);

    expect(await db.customer.count()).toBe(1);
    expect(existsSync(imagePath)).toBe(true);
  });

  it("leaves files added after the backup in place rather than deleting them", async () => {
    // Extraction merges. An orphaned image is harmless; a deleted one is the
    // failure this batch exists to prevent.
    await fs.writeFile(path.join(paths.uploadsDir, "old.webp"), "OLD");
    const backup = await createBackup(null, paths);

    const newer = path.join(paths.uploadsDir, "added-later.webp");
    await fs.writeFile(newer, "NEW");

    await restoreBackup(backup.id, TEST_USER_ID, paths);

    expect(existsSync(newer)).toBe(true);
    expect(existsSync(path.join(paths.uploadsDir, "old.webp"))).toBe(true);
  });
});

describe("restore safety", () => {
  it("aborts on a checksum mismatch and leaves the live database untouched", async () => {
    await addCustomer("Doit survivre");
    const backup = await createBackup(null, paths);

    // Corrupt the recorded checksum: the archive no longer matches its row.
    await db.backup.update({
      where: { id: backup.id },
      data: { checksum: "0".repeat(64) },
    });

    await expect(restoreBackup(backup.id, TEST_USER_ID, paths)).rejects.toThrow(
      /Intégrité/,
    );

    // The live database is still open and still holds its row.
    expect(await db.customer.count()).toBe(1);
    expect(existsSync(TEST_DB_PATH)).toBe(true);
  });

  it("leaves no staged file behind when it aborts", async () => {
    const backup = await createBackup(null, paths);
    await db.backup.update({
      where: { id: backup.id },
      data: { checksum: "0".repeat(64) },
    });
    await expect(restoreBackup(backup.id, TEST_USER_ID, paths)).rejects.toThrow();

    expect(existsSync(`${TEST_DB_PATH}.restore-staged`)).toBe(false);
  });

  it("refuses a backup whose encrypted file is missing", async () => {
    const backup = await createBackup(null, paths);
    await fs.unlink(path.join(paths.backupDir, backup.filename));

    await expect(restoreBackup(backup.id, TEST_USER_ID, paths)).rejects.toThrow();
    expect(await db.customer.count()).toBe(0);
  });

  it("releases the maintenance gate even when the restore fails", async () => {
    const backup = await createBackup(null, paths);
    await db.backup.update({
      where: { id: backup.id },
      data: { checksum: "0".repeat(64) },
    });

    await expect(restoreBackup(backup.id, TEST_USER_ID, paths)).rejects.toThrow();
    // A stuck gate would 503 the entire API until the process restarted.
    expect(isRestoreInProgress()).toBe(false);
  });

  it("has released the gate by the time a successful restore returns", async () => {
    const backup = await createBackup(null, paths);
    await restoreBackup(backup.id, TEST_USER_ID, paths);
    expect(isRestoreInProgress()).toBe(false);
  });

  it("registers the pre-restore safety snapshot so the operator can roll back", async () => {
    await addCustomer("État actuel");
    const backup = await createBackup(null, paths);
    await db.customer.deleteMany({});

    const result = await restoreBackup(backup.id, TEST_USER_ID, paths);

    expect(result.safetyBackupId).toBeTruthy();
    const safety = await db.backup.findUnique({ where: { id: result.safetyBackupId! } });
    expect(safety).not.toBeNull();
    // The file it names must actually exist, or "roll back" is a lie.
    expect(existsSync(path.join(paths.backupDir, safety!.filename))).toBe(true);
  });
});

describe("fiscal tracing of restore and deletion (C-22)", () => {
  it("appends a RESTAURATION event to the restored journal", async () => {
    const backup = await createBackup(null, paths);
    const result = await restoreBackup(backup.id, TEST_USER_ID, paths);

    const events = await db.fiscalEvent.findMany({ where: { type: "RESTAURATION" } });
    expect(events).toHaveLength(1);
    expect(result.fiscalSequence).toBe(events[0].sequence);

    const data = JSON.parse(events[0].dataJson);
    expect(data.backupId).toBe(backup.id);
    expect(data.checksum).toBe(backup.checksum);
    expect(data.safetyFilename).toContain("pre-restore-");
  });

  it("records what the restore replaced, not just that it happened", async () => {
    const backup = await createBackup(null, paths);
    await restoreBackup(backup.id, TEST_USER_ID, paths);

    const event = await db.fiscalEvent.findFirst({ where: { type: "RESTAURATION" } });
    const data = JSON.parse(event!.dataJson);
    // An auditor has to be able to see which journal was displaced.
    expect(data).toHaveProperty("replacedCounter");
    expect(data).toHaveProperty("replacedChainTip");
    expect(data).toHaveProperty("rewound");
  });

  it("appends a SUPPRESSION_SAUVEGARDE event when a backup is deleted", async () => {
    const backup = await createBackup(null, paths);
    const filename = backup.filename;

    await deleteBackup(backup.id, TEST_USER_ID, paths);

    const events = await db.fiscalEvent.findMany({
      where: { type: "SUPPRESSION_SAUVEGARDE" },
    });
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].dataJson).filename).toBe(filename);
    expect(await db.backup.findUnique({ where: { id: backup.id } })).toBeNull();
  });

  it("deletes the uploads archive alongside the database archive", async () => {
    await fs.writeFile(path.join(paths.uploadsDir, "x.webp"), "X");
    const backup = await createBackup(null, paths);
    const imagesFile = path.join(paths.backupDir, backup.imagesPath!);
    expect(existsSync(imagesFile)).toBe(true);

    await deleteBackup(backup.id, TEST_USER_ID, paths);
    expect(existsSync(imagesFile)).toBe(false);
  });

  it("keeps the chain verifiable after a restore", async () => {
    const { verifyFiscalChain } = await import("@/lib/services/fiscal");
    const backup = await createBackup(null, paths);
    await restoreBackup(backup.id, TEST_USER_ID, paths);

    const verdict = await verifyFiscalChain();
    expect(verdict.ok).toBe(true);
  });
});

describe("schema compatibility guard (L-15)", () => {
  it("refuses a backup that predates a table the app now needs", async () => {
    // The real hazard this guards: the project's own 2026-08-28 backup has 26
    // tables against the live schema's 31 — no FiscalEvent at all. Restoring
    // it would leave HibaPOS running with no fiscal journal.
    const backup = await createBackup(TEST_USER_ID, paths);

    // The live database gains a table the backup cannot know about.
    await db.$executeRawUnsafe(`CREATE TABLE "NouvelleTable" ("id" TEXT PRIMARY KEY)`);
    try {
      await expect(restoreBackup(backup.id, TEST_USER_ID, paths)).rejects.toThrow(
        /incompatible.*NouvelleTable|NouvelleTable/,
      );
    } finally {
      await db.$executeRawUnsafe(`DROP TABLE "NouvelleTable"`);
    }
  });

  it("refuses a backup missing a column the app now writes", async () => {
    const backup = await createBackup(TEST_USER_ID, paths);

    await db.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN "nouveauChamp" TEXT`);
    try {
      await expect(restoreBackup(backup.id, TEST_USER_ID, paths)).rejects.toThrow(
        /colonne\(s\) manquante\(s\)/,
      );
    } finally {
      await db.$executeRawUnsafe(`ALTER TABLE "Customer" DROP COLUMN "nouveauChamp"`);
    }
  });

  it("leaves the live database untouched when it refuses", async () => {
    await addCustomer("Doit survivre au refus");
    const backup = await createBackup(TEST_USER_ID, paths);
    await db.$executeRawUnsafe(`CREATE TABLE "AutreTable" ("id" TEXT PRIMARY KEY)`);
    try {
      await expect(restoreBackup(backup.id, TEST_USER_ID, paths)).rejects.toThrow();
      // Nothing was swapped, nothing was staged, the gate is free.
      expect(await db.customer.count()).toBe(1);
      expect(existsSync(`${TEST_DB_PATH}.restore-staged`)).toBe(false);
      expect(isRestoreInProgress()).toBe(false);
    } finally {
      await db.$executeRawUnsafe(`DROP TABLE "AutreTable"`);
    }
  });

  it("allows a restore when the structures match", async () => {
    // The guard must not become a wall: an ordinary same-version restore has
    // to keep working, which every other test in this file also depends on.
    const backup = await createBackup(TEST_USER_ID, paths);
    await expect(restoreBackup(backup.id, TEST_USER_ID, paths)).resolves.toMatchObject({
      ok: true,
    });
  });
});
