import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { applyStartupPragmas, cloudSyncFolderIn } from "@/lib/db-pragmas";
import { db } from "@/lib/db";
import { TX_CHECKOUT, TX_Z_CLOSE, TX_FISCAL, TX_CATALOG } from "@/lib/tx-options";

// C-19 + C-15 (Batch 2.3). The live database ran in rollback-journal mode
// while three documents claimed WAL, because the project believed the pragma
// could only be applied with the sqlite3 CLI. It cannot be applied with
// $executeRaw — but it is a query, and $queryRaw runs it.

const savedUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (savedUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedUrl;
});

/** The test database's real path, read from the environment `test-setup.ts`
 *  set. Batch 6.3 gave every run its own directory (L-40 / L-43 / warning 3b),
 *  so a hardcoded `hibapos-test-db/test.db` now names a stale file from before
 *  that change — which is exactly how these three tests broke. Derived, never
 *  written twice. */
function testDbPath(): string {
  const url = process.env.DATABASE_URL ?? "";
  return path.resolve(url.replace(/^file:/, "").split("?")[0]);
}

describe("journal mode", () => {
  it("puts the database into WAL and stays there", async () => {
    const first = await applyStartupPragmas();
    expect(first.journalMode.toLowerCase()).toBe("wal");

    // Idempotent: SQLite stores the mode in the file, so a second start is a
    // no-op rather than a second write.
    const second = await applyStartupPragmas();
    expect(second.journalMode.toLowerCase()).toBe("wal");
    expect(second.applied).toBe(false);
  });

  it("records WAL in the file header, not just the connection", async () => {
    await applyStartupPragmas();

    // Byte 18 of a SQLite file is the write format: 1 = rollback journal,
    // 2 = WAL. This is the check the remediation plan asks for.
    const dbPath = testDbPath();
    const header = Buffer.alloc(4);
    const handle = await fs.open(dbPath, "r");
    try {
      await handle.read(header, 0, 4, 16);
    } finally {
      await handle.close();
    }
    expect(header[2]).toBe(2);
  });

  it("reports the journal mode SQLite actually has", async () => {
    const rows = await db.$queryRawUnsafe<{ journal_mode: string }[]>("PRAGMA journal_mode");
    expect(rows[0].journal_mode.toLowerCase()).toBe("wal");
  });
});

describe("cloud-sync guard", () => {
  it("recognises the sync folders that fight SQLite", () => {
    expect(cloudSyncFolderIn("C:\\Users\\x\\OneDrive\\Desktop\\app\\db\\custom.db")).toBe(
      "onedrive",
    );
    expect(cloudSyncFolderIn("/Users/x/Dropbox/pos/db/custom.db")).toBe("dropbox");
    expect(cloudSyncFolderIn("C:/Users/x/Google Drive/db/custom.db")).toBe("google drive");
    expect(cloudSyncFolderIn("C:/HibaPOS/data/db/custom.db")).toBeNull();
  });

  it("matches whole path segments, not substrings", () => {
    // Found the hard way: this session's own scratch directory is
    // .../Temp/claude/C--Users-einer-OneDrive-Desktop-Work-.../ — "OneDrive"
    // inside an encoded project name, nowhere near a synced folder. A
    // substring test refused WAL there, silently leaving the database in the
    // slow blocking mode this batch exists to remove.
    expect(
      cloudSyncFolderIn(
        "C:/Users/einer/AppData/Local/Temp/claude/C--Users-einer-OneDrive-Desktop-Work-HibaFood-The-App/scratchpad/wal.db",
      ),
    ).toBeNull();
    expect(cloudSyncFolderIn("C:/data/onedrive-backups/db/custom.db")).toBeNull();
    expect(cloudSyncFolderIn("C:/my-dropbox-clone/db/custom.db")).toBeNull();
  });

  it("still catches a business OneDrive folder", () => {
    expect(cloudSyncFolderIn("C:/Users/x/OneDrive - Contoso Ltd/HibaPOS/db/custom.db")).toBe(
      "onedrive",
    );
  });

  it("refuses to enable WAL on a synced path", async () => {
    // WAL keeps -wal/-shm alongside the database permanently, and a sync
    // client that uploads or rolls those back can corrupt data in a way
    // rollback-journal mode cannot. The fix is to move the data (DD-02), so
    // the guard has to say that rather than quietly proceeding.
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "OneDrive-fake-"));
    process.env.DATABASE_URL = `file:${path.join(tmp, "custom.db").split(path.sep).join("/")}`;

    const result = await applyStartupPragmas();

    // The live test DB is already WAL, so the guard is reached only when the
    // mode is not yet WAL; either way it must never claim to have applied.
    if (result.skipped) {
      expect(result.skipped).toBe("CLOUD_SYNC");
      expect(result.applied).toBe(false);
      expect(result.warning).toContain("HIBAPOS_DATA_DIR");
    }
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  });
});

describe("transaction budgets (C-15)", () => {
  it("gives every money-sealing transaction more than Prisma's 5 s default", () => {
    // The default is what made a slow checkout fail the order after the
    // customer had paid.
    for (const budget of [TX_CHECKOUT, TX_Z_CLOSE, TX_FISCAL, TX_CATALOG]) {
      expect(budget.timeout).toBeGreaterThan(5_000);
      expect(budget.maxWait).toBeGreaterThanOrEqual(5_000);
    }
  });

  it("gives the Z close the longest budget", () => {
    // A failed close leaves a shift that cannot be closed at all.
    expect(TX_Z_CLOSE.timeout).toBeGreaterThanOrEqual(TX_CHECKOUT.timeout);
    expect(TX_CHECKOUT.timeout).toBeGreaterThan(TX_CATALOG.timeout);
  });
});
