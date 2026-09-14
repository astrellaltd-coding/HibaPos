import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { applyStartupPragmas, cloudSyncFolderIn, pragmaDecision } from "@/lib/db-pragmas";
import { db } from "@/lib/db";
import { TX_CHECKOUT, TX_Z_CLOSE, TX_FISCAL } from "@/lib/tx-options";

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

  // ── L-122 (R9.7) — THIS EXECUTED ZERO ASSERTIONS FOR A YEAR ────────────────
  //
  // The version below used to call `applyStartupPragmas()` and wrap every
  // `expect` in `if (result.skipped)`. `result.skipped` was **always
  // `undefined`**: that function reads `PRAGMA journal_mode` from the cached
  // global `db`, which this very file had already put into WAL, so it returned
  // at the `current === "wal"` early exit **before reaching the cloud-sync
  // branch at all.** Repointing `process.env.DATABASE_URL` cannot move `db` —
  // `db.ts` caches on `globalThis` unconditionally, which is an invariant.
  //
  // So the guard keeping the OneDrive-hosted PRODUCTION database out of WAL —
  // the reason `docs/BASELINES.md` records `journal_mode = delete` — had no
  // executed cover of any kind. Measured by the audit as a probe: the if-body
  // ran `false`.
  //
  // R9.7 split the decision out of the I/O (`pragmaDecision`), so the mode is
  // an argument rather than something the cached client happens to hold.

  it("refuses to enable WAL on a synced path", async () => {
    // WAL keeps -wal/-shm alongside the database permanently, and a sync
    // client that uploads or rolls those back can corrupt data in a way
    // rollback-journal mode cannot. The fix is to move the data (DD-02), so
    // the guard has to say that rather than quietly proceeding.
    // AND THE OLD FIXTURE WOULD NOT HAVE MATCHED EITHER. It built a temp
    // directory named `OneDrive-fake-XXXX`, and `cloudSyncFolderIn` matches a
    // segment that IS `onedrive`, or the `OneDrive - Contoso` / `Dropbox
    // (Personal)` shapes — `OneDrive-fake-a1b2` is none of them, and the test
    // two above this one asserts exactly that about `onedrive-backups`. So the
    // guard was unreachable AND the input would not have tripped it: two
    // independent reasons this could never fail.
    //
    // A literal path now, because `pragmaDecision` does no I/O — there is
    // nothing for a real directory to contribute.
    const dbPath = "C:/Users/einer/OneDrive/HibaPOS/db/custom.db";

    // `current: "delete"` — the mode the production database is actually in,
    // and the one `applyStartupPragmas` would have been holding if the cached
    // client were not already WAL.
    const result = pragmaDecision({ current: "delete", databasePath: dbPath });

    expect(result, "the guard let a synced path through").not.toBeNull();
    expect(result!.skipped).toBe("CLOUD_SYNC");
    expect(result!.applied).toBe(false);
    expect(result!.journalMode).toBe("delete");
    expect(result!.warning).toContain("HIBAPOS_DATA_DIR");
    expect(result!.warning).toContain("onedrive");
  });

  it("ALLOWS WAL on a path nothing is syncing — the other direction", async () => {
    // Without this the guard is satisfied by refusing everywhere, and the app
    // never gets WAL at all once the data moves off OneDrive, which is the
    // whole point of DD-02.
    expect(pragmaDecision({ current: "delete", databasePath: "C:/HibaPOS/data/db/custom.db" }))
      .toBeNull();
    expect(pragmaDecision({ current: "delete", databasePath: "/var/lib/hibapos/custom.db" }))
      .toBeNull();
  });

  it("does nothing when WAL is already on, whatever the path", async () => {
    // The early exit that hid the branch. Asserted on purpose so the ordering
    // is deliberate rather than incidental.
    const already = pragmaDecision({
      current: "wal",
      databasePath: "C:/Users/x/OneDrive/HibaPOS/db/custom.db",
    });
    expect(already).not.toBeNull();
    expect(already!.applied).toBe(false);
    expect(already!.skipped, "an already-WAL database is not a refusal").toBeUndefined();
  });

  it("treats every sync marker the same way", async () => {
    // `cloudSyncFolderIn` is tested above on its own; this is the DECISION
    // honouring it, which is the half that was unreachable.
    for (const dir of [
      "C:/Users/x/OneDrive/HibaPOS/db/custom.db",
      "C:/Users/x/OneDrive - Contoso Ltd/HibaPOS/db/custom.db",
      "C:/Users/x/Dropbox/HibaPOS/db/custom.db",
      "C:/Users/x/Google Drive/HibaPOS/db/custom.db",
    ]) {
      const r = pragmaDecision({ current: "delete", databasePath: dir });
      expect({ dir, skipped: r?.skipped }).toEqual({ dir, skipped: "CLOUD_SYNC" });
    }
  });

  it("cannot decide anything when the path is unknown, and says nothing rather than guessing", async () => {
    // `connectedDatabasePath()` can return null. Refusing WAL on « we do not
    // know where it is » would be a guess; allowing it is what the code has
    // always done, and it is pinned so a change is deliberate.
    expect(pragmaDecision({ current: "delete", databasePath: null })).toBeNull();
  });
});

describe("transaction budgets (C-15)", () => {
  it("gives every money-sealing transaction more than Prisma's 5 s default", () => {
    // The default is what made a slow checkout fail the order after the
    // customer had paid.
    for (const budget of [TX_CHECKOUT, TX_Z_CLOSE, TX_FISCAL]) {
      expect(budget.timeout).toBeGreaterThan(5_000);
      expect(budget.maxWait).toBeGreaterThanOrEqual(5_000);
    }
  });

  it("gives the Z close the longest budget", () => {
    // A failed close leaves a shift that cannot be closed at all.
    expect(TX_Z_CLOSE.timeout).toBeGreaterThanOrEqual(TX_CHECKOUT.timeout);
    // L-155 (R9.7): the `TX_CATALOG` comparison went with the constant — a
    // catalogue budget no transaction consumed. What remains is the pair
    // that money actually passes through.
    expect(TX_CHECKOUT.timeout).toBeGreaterThan(TX_FISCAL.timeout);
  });
});
