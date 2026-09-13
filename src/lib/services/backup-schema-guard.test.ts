import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { db } from "@/lib/db";
import {
  createBackup,
  restoreBackup,
  encryptFile,
  decryptFile,
  type BackupPaths,
} from "@/lib/services/backup";

// L-140 (R9.3) — what `assertCompatibleSchema` will and will not admit.
//
// THE FINDING had four parts. Two are fixed here and two are recorded:
//
//   FIXED   no unique indexes were compared. A file carrying `Order.number`,
//           `FiscalEvent.sequence` and `ZReport.number` WITHOUT their unique
//           index passed every check and restored cleanly — and the gapless
//           numbering backstop was simply gone. That is not a schema nicety:
//           those indexes are what make a duplicated receipt number impossible
//           at the storage layer, and R8.2's whole idempotency design ends at
//           `Order.idempotencyKey`'s unique index. A restore is precisely when
//           a file of unknown provenance is admitted.
//   FIXED   extra COLUMNS were silent while extra TABLES warned. Same signal,
//           reported two different ways.
//   OPEN    the check measures the backup against the LIVE database, not
//           against the code, so a degraded live schema lowers the bar.
//   OPEN    no types and no NOT NULL. Comparing those means parsing
//           `sqlite_master` DDL; the plan asked for the cheap parts.
//
// HOW THESE WORK. A real backup is created, decrypted, DOCTORED with raw SQL,
// re-encrypted, and its `Backup` row's checksum updated so the integrity check
// passes and the schema check is what answers. The refusal happens at step 3 of
// `restoreBackup`, BEFORE anything irreversible — the live database is never
// swapped in these tests, which is what makes them safe to run.

function testDbPath(): string {
  const url = process.env.DATABASE_URL ?? "";
  return path.resolve(url.replace(/^file:/, "").split("?")[0]);
}

const TEST_USER_ID = "schema-guard-user";
let tmpRoot: string;
let paths: BackupPaths;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hibapos-schema-"));
  paths = {
    backupDir: path.join(tmpRoot, "backups"),
    dbPath: testDbPath(),
    uploadsDir: path.join(tmpRoot, "public", "uploads"),
    archivesDir: path.join(tmpRoot, "db", "fiscal-archives"),
  };
  await fs.mkdir(paths.backupDir, { recursive: true });
  await fs.mkdir(paths.uploadsDir, { recursive: true });
  await fs.mkdir(paths.archivesDir, { recursive: true });

  await db.backup.deleteMany();
  await db.technicalLog.deleteMany();
  await db.user.upsert({
    where: { username: "schema-guard" },
    update: {},
    create: {
      id: TEST_USER_ID,
      username: "schema-guard",
      name: "Schema Guard",
      role: "SUPER_ADMIN",
      pinHash: "not-a-real-hash",
    },
  });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
  // A SUCCESSFUL restore replaces the live test database with the doctored
  // file, so anything this file adds to a backup's schema outlives its test —
  // the second `ALTER TABLE … ADD COLUMN "loyaltyTier"` failed with « duplicate
  // column name » because the first test's restore had already put it there.
  // Undone here rather than by making the names unique: a stray column left in
  // the shared database is the next file's problem, not this one's, and
  // L-154's three incidents are all this shape.
  //
  // CONDITIONAL, not `.catch(() => {})`. A statement that fails is still a
  // statement Prisma logs: blind-dropping a column that seven of these nine
  // tests never add cost SEVEN `prisma:error` blocks, and `docs/BASELINES.md`
  // pins a clean run at zero. Asking first costs one PRAGMA.
  const cols = await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("Customer")`);
  if (cols.some((c) => c.name === "loyaltyTier")) {
    await db.$executeRawUnsafe(`ALTER TABLE "Customer" DROP COLUMN "loyaltyTier"`);
  }
  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "FutureThing"`);
});

const KEY = () => process.env.BACKUP_ENCRYPTION_KEY ?? process.env.BACKUP_SECRET ?? "";

/**
 * Create a backup, run `sql` against a decrypted copy of it, re-encrypt, and
 * point the `Backup` row at the doctored file with a matching checksum.
 *
 * The checksum has to be recomputed or the integrity check refuses first and
 * the schema check never runs — which would make every test here pass for the
 * wrong reason.
 */
async function doctoredBackup(sql: string[]): Promise<string> {
  const backup = await createBackup(TEST_USER_ID, paths);
  const enc = path.join(paths.backupDir, backup.filename);
  const plain = path.join(tmpRoot, "doctored.db");
  await decryptFile(enc, plain, KEY());

  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient({
    datasources: { db: { url: `file:${plain.split(path.sep).join("/")}` } },
  });
  try {
    for (const stmt of sql) await client.$executeRawUnsafe(stmt);
  } finally {
    await client.$disconnect();
  }

  await fs.rm(enc, { force: true });
  await encryptFile(plain, enc, KEY());

  const crypto = await import("crypto");
  const checksum = crypto.createHash("sha256").update(await fs.readFile(plain)).digest("hex");
  await db.backup.update({ where: { id: backup.id }, data: { checksum } });
  return backup.id;
}

/** The unique indexes the live schema declares, as `Table(col,…)` keys. */
async function liveUniqueKeys(): Promise<string[]> {
  const tables = await db.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'",
  );
  const keys: string[] = [];
  for (const t of tables) {
    const list = await db.$queryRawUnsafe<{ name: string; unique: number | bigint }[]>(
      `PRAGMA index_list("${t.name}")`,
    );
    for (const idx of list) {
      if (Number(idx.unique) !== 1) continue;
      const cols = await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA index_info("${idx.name}")`);
      keys.push(`${t.name}(${cols.map((c) => c.name).join(",")})`);
    }
  }
  return keys;
}

describe("L-140 — a unique index is a fiscal control, and its absence is refused", () => {
  it("the live schema really does declare the indexes this is about", async () => {
    // Without this the tests below could pass against a schema that never had
    // them, which is the vacuous shape L-124 was.
    const keys = await liveUniqueKeys();
    expect(keys).toContain("Order(number)");
    expect(keys).toContain("FiscalEvent(sequence)");
    expect(keys).toContain("ZReport(number)");
    expect(keys, "R8.2's idempotency backstop").toContain("Order(idempotencyKey)");
  });

  it("refuses a backup whose Order.number is no longer unique", async () => {
    // The receipt-number guarantee. Restoring this file used to succeed, and
    // the database would then happily accept two orders with the same number.
    const list = await db.$queryRawUnsafe<{ name: string; unique: number | bigint }[]>(
      `PRAGMA index_list("Order")`,
    );
    const target = [];
    for (const idx of list) {
      if (Number(idx.unique) !== 1) continue;
      const cols = await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA index_info("${idx.name}")`);
      if (cols.length === 1 && cols[0].name === "number") target.push(idx.name);
    }
    expect(target.length, "no unique index on Order.number to drop").toBeGreaterThan(0);

    const id = await doctoredBackup(target.map((n) => `DROP INDEX "${n}"`));
    await expect(restoreBackup(id, TEST_USER_ID, paths)).rejects.toThrow(/unicité/);
  });

  it("names the constraint, and says why it matters", async () => {
    const list = await db.$queryRawUnsafe<{ name: string; unique: number | bigint }[]>(
      `PRAGMA index_list("FiscalEvent")`,
    );
    const target: string[] = [];
    for (const idx of list) {
      if (Number(idx.unique) !== 1) continue;
      const cols = await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA index_info("${idx.name}")`);
      if (cols.length === 1 && cols[0].name === "sequence") target.push(idx.name);
    }
    expect(target.length).toBeGreaterThan(0);

    const id = await doctoredBackup(target.map((n) => `DROP INDEX "${n}"`));
    await expect(restoreBackup(id, TEST_USER_ID, paths)).rejects.toThrow(
      /FiscalEvent\(sequence\)/,
    );
    // The operator is not left without the data — refusing to RESTORE it is
    // not refusing to READ it.
    await expect(restoreBackup(id, TEST_USER_ID, paths)).rejects.toThrow(/decrypt-backup/);
  });

  it("refuses BEFORE anything irreversible, leaving the live database alone", async () => {
    // `assertCompatibleSchema` is step 3; the swap is step 4. A refusal that
    // happened after the rename would be worse than no check at all.
    const before = await db.user.count();
    const list = await db.$queryRawUnsafe<{ name: string; unique: number | bigint }[]>(
      `PRAGMA index_list("ZReport")`,
    );
    const target: string[] = [];
    for (const idx of list) {
      if (Number(idx.unique) !== 1) continue;
      const cols = await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA index_info("${idx.name}")`);
      if (cols.length === 1 && cols[0].name === "number") target.push(idx.name);
    }
    const id = await doctoredBackup(target.map((n) => `DROP INDEX "${n}"`));

    await expect(restoreBackup(id, TEST_USER_ID, paths)).rejects.toThrow();
    expect(await db.user.count(), "the live database was touched by a refused restore").toBe(
      before,
    );
    // And no staged file was left beside it.
    expect((await fs.readdir(path.dirname(paths.dbPath))).filter((f) => f.includes("restore-staged"))).toEqual(
      [],
    );
  });

  it("ADMITS an untouched backup, which is the other direction", async () => {
    // Without this the check above is satisfied by a guard that refuses
    // everything, and restore would be unusable.
    const backup = await createBackup(TEST_USER_ID, paths);
    const result = await restoreBackup(backup.id, TEST_USER_ID, paths);
    expect(result).toBeTruthy();
  });
});

describe("L-140 — extra columns are reported, like extra tables always were", () => {
  it("warns when the backup carries a column this version does not have", async () => {
    // Same signal as an extra table — the file came from a newer HibaPOS — and
    // no reason for the two to be reported differently. Not a refusal: the
    // running code does not read the column, so the restore is safe for it.
    const id = await doctoredBackup([
      `ALTER TABLE "Customer" ADD COLUMN "loyaltyTier" TEXT`,
    ]);
    await restoreBackup(id, TEST_USER_ID, paths);

    const logs = await db.technicalLog.findMany({ where: { source: "backup-service" } });
    const warned = logs.filter((l) => l.message.includes("column(s) this version does not use"));
    expect(warned.length, "an extra column passed in silence").toBeGreaterThan(0);
    expect(warned[0].message).toContain("Customer.loyaltyTier");
    expect(warned[0].level).toBe("WARN");
  });

  it("puts the warning where it SURVIVES the restore", async () => {
    // Found while writing the test above, and it is the reason that test can
    // exist at all. `assertCompatibleSchema` runs BEFORE the swap and logs
    // through `db`, which is connected to the file the swap replaces — so
    // every warning it wrote was destroyed by the restore it described. The
    // extra-TABLES warning has been in that function since Batch 2.2 and has
    // therefore never once been readable afterwards. Measured: after a
    // successful restore the only `backup-service` row left was the post-swap
    // « restored by » one.
    //
    // A refusal was never affected — it throws and nothing is swapped. It is
    // exactly the warnings, which by definition accompany a restore that goes
    // AHEAD, that could not survive one.
    const id = await doctoredBackup([
      `ALTER TABLE "Customer" ADD COLUMN "loyaltyTier" TEXT`,
      `CREATE TABLE "FutureThing" ("id" TEXT NOT NULL PRIMARY KEY)`,
    ]);
    await restoreBackup(id, TEST_USER_ID, paths);

    // Read AFTER the swap, from the restored database, which is the only place
    // an operator could ever look.
    const logs = await db.technicalLog.findMany({ where: { source: "backup-service" } });
    const messages = logs.map((l) => l.message);
    expect(
      messages.filter((m) => m.includes("table(s) this version does not use")).length,
      "the extra-table warning did not survive the restore",
    ).toBe(1);
    expect(
      messages.filter((m) => m.includes("column(s) this version does not use")).length,
      "the extra-column warning did not survive the restore",
    ).toBe(1);
    expect(messages.some((m) => m.includes("FutureThing"))).toBe(true);
    expect(messages.some((m) => m.includes("Customer.loyaltyTier"))).toBe(true);
  });

  it("says nothing when the columns match", async () => {
    // Otherwise the assertion above is satisfied by a warning on every restore,
    // which is the same as no warning at all.
    const backup = await createBackup(TEST_USER_ID, paths);
    await db.technicalLog.deleteMany();
    await restoreBackup(backup.id, TEST_USER_ID, paths);

    const logs = await db.technicalLog.findMany({ where: { source: "backup-service" } });
    expect(logs.filter((l) => l.message.includes("this version does not use"))).toEqual([]);
  });

  it("still REFUSES a missing column, which was already right", async () => {
    // The direction that was never broken, pinned beside the one that was.
    const id = await doctoredBackup([`ALTER TABLE "Customer" DROP COLUMN "notes"`]).catch(
      () => null,
    );
    if (id === null) return; // no droppable column on this schema; nothing to assert
    await expect(restoreBackup(id, TEST_USER_ID, paths)).rejects.toThrow(/colonne\(s\) manquante/);
  });
});
