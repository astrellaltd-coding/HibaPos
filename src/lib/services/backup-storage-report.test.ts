import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "fs";
import os from "os";
import path from "path";
import { db } from "@/lib/db";
import { backupStorageReport } from "@/lib/services/backup";
import { sameVolume, backupVolumeReport } from "@/lib/paths";
import { wipeDatabase } from "@/lib/test-wipe";

// L-190 and L-194 — the backup screen stops believing only the table.
//
// ── L-190: THE FOLDER AND THE TABLE DRIFT, AND THE APP BELIEVES THE TABLE ────
// `listBackups()` is `db.backup.findMany()`. It never looks at the folder, so
// two things can be true and neither is noticed:
//
//   unmanaged  a FILE with no row. Invisible in Réglages, and `pruneBackups`
//              keeps the newest N ROWS — so retention will NEVER remove it.
//              Five appeared on 2026-09-12 when the audit's pass 5 ran
//              `createBackup` against the real `BACKUP_LOCATION` (L-188): files
//              in the operator's folder, rows in a throwaway test database.
//   missing    a ROW whose file is gone. **The one that bites.** The screen
//              lists a backup, the operator believes they have it, and they
//              find out at the moment they try to restore.
//
// ── L-194: AND THEY MAY NOT EVEN BE ON ANOTHER DISK ─────────────────────────
// C-06 is the entire reason `BACKUP_LOCATION` exists — « a backup on the same
// disk as the database is not a backup » — and the software had never checked.
// Measured 2026-09-14: the folder everybody believed was syncing is a plain
// directory (OneDrive is not installed) and `C:` is the only volume.
//
// ── WHAT IS DELIBERATELY NOT DONE ───────────────────────────────────────────
// Nothing is deleted and nothing is adopted. Writing a row for an unmanaged
// file would hand it to the retention prune, which would then delete a file
// this software did not create and cannot vouch for.

let dir: string;

beforeEach(async () => {
  await wipeDatabase();
  dir = mkdtempSync(path.join(os.tmpdir(), "hibapos-l190-"));
});

afterAll(async () => {
  await wipeDatabase();
});

/** A backup file on disk, with no row unless one is asked for. */
function fileOnDisk(name: string, bytes = 32): string {
  const full = path.join(dir, name);
  writeFileSync(full, Buffer.alloc(bytes, 7));
  return full;
}

async function row(filename: string, imagesPath: string | null = null) {
  return db.backup.create({
    data: { filename, size: 32, sizeBytes: 32, encrypted: true, imagesPath },
  });
}

/** The report over the fixture folder. `dbPath` defaults INSIDE it, so the
 *  volume verdict is SAME — which is the state the operator is actually in. */
const report = (dbPath = path.join(dir, "custom.db")) =>
  backupStorageReport({ backupDir: dir, dbPath, uploadsDir: dir, archivesDir: dir });

describe("L-190 — a file with no record", () => {
  it("reports it, because retention keeps ROWS and will never remove it", async () => {
    fileOnDisk("hibapos-backup-2026-09-12T11-18-23-632Z.dbenc", 557100);
    await row("hibapos-backup-2026-09-14T09-35-01-374Z.dbenc");
    fileOnDisk("hibapos-backup-2026-09-14T09-35-01-374Z.dbenc");

    const r = await report();
    expect(r.unmanaged.map((u) => u.filename)).toEqual([
      "hibapos-backup-2026-09-12T11-18-23-632Z.dbenc",
    ]);
    expect(r.unmanaged[0].sizeBytes, "the size is read from the file, not guessed").toBe(557100);
    expect(r.missing, "a managed file that is present is not missing").toEqual([]);
  });

  it("does NOT call the shared media archive unmanaged", async () => {
    // It is content-addressed and REFERENCED by rows rather than owned by one,
    // so a naive « no row names this file » would report the single file that
    // must never be deleted as the one nothing is using. That is the opposite
    // of useful, and it is 49 MB the operator would reasonably delete.
    fileOnDisk("hibapos-media-4b5ed80dca201113.enc", 4096);
    fileOnDisk("hibapos-backup-a.dbenc");
    await row("hibapos-backup-a.dbenc", "/anywhere/hibapos-media-4b5ed80dca201113.enc");

    const r = await report();
    expect(r.unmanaged, "the shared media archive was reported as unmanaged").toEqual([]);
  });
});

describe("L-190 — a record with no file", () => {
  it("reports it — the backup the screen lists and the disk does not have", async () => {
    await row("hibapos-backup-gone.dbenc");
    fileOnDisk("hibapos-backup-here.dbenc");
    await row("hibapos-backup-here.dbenc");

    const r = await report();
    expect(r.missing.map((m) => m.filename)).toEqual(["hibapos-backup-gone.dbenc"]);
    expect(r.missing[0].id, "the id is carried so the row can be acted on").toBeTruthy();
    expect(r.unmanaged).toEqual([]);
  });

  it("is quiet when the folder and the table agree", async () => {
    // The state the operator should normally be in, and the one a report that
    // cried wolf would make useless.
    for (const n of ["a.dbenc", "b.dbenc"]) {
      fileOnDisk(`hibapos-backup-${n}`);
      await row(`hibapos-backup-${n}`);
    }
    const r = await report();
    expect(r.unmanaged).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it("answers truthfully when the folder does not exist at all", async () => {
    // Nothing has ever been backed up. That is not an error and must not read
    // as « every record is missing » either — there are no records.
    const missingDir = path.join(dir, "not-created");
    const r = await backupStorageReport({
      backupDir: missingDir,
      dbPath: path.join(dir, "custom.db"),
      uploadsDir: dir,
      archivesDir: dir,
    });
    expect(r.unmanaged).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(r.directory).toBe(missingDir);
  });

  it("ignores files that are not backups", async () => {
    mkdirSync(path.join(dir, "sub"));
    writeFileSync(path.join(dir, "notes.txt"), "x");
    fileOnDisk("hibapos-backup-a.dbenc");
    await row("hibapos-backup-a.dbenc");
    const r = await report();
    expect(r.unmanaged).toEqual([]);
  });
});

describe("L-190 / L-194 — and the screen actually says it", () => {
  // A report with no reader is L-143's shape: `printStatus` had three writers
  // and zero readers for months. This one exists to be READ by a person
  // deciding whether their backups are real, so the rendering is the fix and
  // the service is the plumbing.
  const view = () =>
    readFileSync(
      path.join(process.cwd(), "src/features/admin/backups-view.tsx"),
      "utf8",
    );

  it("fetches the report", () => {
    const src = view();
    expect(src, "the screen never asks for it").toContain("/api/backups/storage");
    expect(src, "the report is fetched but never read").toMatch(/storage\?\./);
  });

  it("renders all three states, and each says what to DO", () => {
    const src = view();

    // L-194 — the same-disk warning. Naming the rule is not enough; the
    // operator needs to know what fixes it.
    expect(src, "the same-volume warning is gone").toMatch(/storage\?\.volume === "SAME"/);
    expect(src).toContain("BACKUP_LOCATION");
    expect(src, "it states the rule but not the remedy").toMatch(/clé USB|second disque|partage réseau/);

    // L-190 — the dangerous direction, and it must not be softened.
    expect(src, "a listed backup that is not on disk is not reported").toMatch(
      /storage\.missing\.length > 0/,
    );
    expect(src).toMatch(/introuvable/i);

    // …and the harmless one, which still has to be actionable: retention keeps
    // ROWS, so nothing will ever remove these.
    expect(src, "unmanaged files are not reported").toMatch(/storage\.unmanaged\.length > 0/);
    expect(src).toMatch(/non géré/i);
  });

  it("warns without blocking — the backup is still taken", () => {
    // Refusing to back up because the disk is wrong leaves the operator with no
    // backup at all, which is worse than a badly-placed one. The create button
    // must not be gated on the volume verdict.
    // ASSERTED OVER THE WHOLE FILE, not near the button. The first version
    // sliced FORWARD from the button's label and searched the next 400
    // characters — and `disabled=` sits BEFORE the label in the JSX, so it
    // could never have seen the prop it was written to guard. A revert that
    // disabled the button produced no failure at all, which is how it was
    // found. The property does not need locating: NO `disabled` expression
    // anywhere may consult the volume verdict.
    const src = view();
    const disabledProps = [...src.matchAll(/disabled=\{([^}]*)\}/g)].map((m) => m[1]);
    expect(disabledProps.length, "no disabled props found — the sweep is vacuous").toBeGreaterThan(
      0,
    );
    const gated = disabledProps.filter((d) => /volume/.test(d));
    expect(
      gated,
      `the backup button is gated on the volume verdict: ${gated.join(" | ")}\n` +
        "Refusing to back up because the disk is wrong leaves the operator with NO backup, " +
        "which is worse than a badly-placed one. Warn, do not block.",
    ).toEqual([]);
  });
});

describe("L-194 — the volume question, answered honestly", () => {
  it("compares Windows drives, and says UNKNOWN where a path cannot tell", () => {
    // Pure and total, so these hold on whatever machine runs the suite.
    expect(sameVolume("C:\\a", "C:\\b")).toBe("SAME");
    expect(sameVolume("C:\\a", "D:\\b")).toBe("DIFFERENT");
    expect(sameVolume("c:/a", "C:\\b"), "a drive letter is case-insensitive").toBe("SAME");
    expect(sameVolume("\\\\srv\\share\\a", "\\\\SRV\\Share\\b"), "same UNC share").toBe("SAME");
    expect(sameVolume("\\\\srv\\share\\a", "\\\\srv\\other\\b")).toBe("DIFFERENT");
    expect(sameVolume("\\\\srv\\share\\a", "C:\\b")).toBe("DIFFERENT");
  });

  it("refuses to guess when the path cannot answer — on EITHER platform", () => {
    // **THE THIRD ANSWER IS THE POINT.** A POSIX-absolute path shares `/` with
    // every other while sitting on any number of mounts, so `SAME` would be a
    // false alarm on every Linux install and `DIFFERENT` a false all-clear.
    //
    // THIS USED TO BRANCH ON `process.platform`, because `path.resolve` was
    // called first and `path.resolve("/var/data")` on Windows returns
    // `C:\var\data` — a drive letter the path never had. The `null` branch was
    // therefore DEAD on Windows and the assertion only meant anything on CI. A
    // revert that broke that branch produced no failure at all, which is how it
    // was found. `volumeOf` now inspects the path as GIVEN, so the answer is
    // the same wherever the suite runs and this needs no conditional.
    expect(sameVolume("/var/data", "/home/x")).toBe("UNKNOWN");
    expect(sameVolume("/var/data", "C:\\x"), "one side unknowable is unknowable").toBe("UNKNOWN");
    // …and a relative path is still resolved before the question is asked.
    expect(sameVolume(".", "."), "a relative path never answers UNKNOWN by accident").not.toBe(
      "DIFFERENT",
    );
  });

  it("reports the live configuration without throwing", () => {
    const r = backupVolumeReport();
    expect(["SAME", "DIFFERENT", "UNKNOWN"]).toContain(r.verdict);
    expect(r.backupsDirectory.length).toBeGreaterThan(0);
    expect(r.databaseDirectory.length).toBeGreaterThan(0);
  });

  it("reports the verdict for the paths it was GIVEN, not the global config", async () => {
    // The first version called the global `backupVolumeReport()` here, so with
    // injected paths the report described one folder and the volume of another
    // — and no test could reach SAME or DIFFERENT through it. It passed anyway,
    // asserting only « the live machine's answer is one of three », which is
    // true of every possible implementation. Driving both verdicts is what
    // makes this an assertion rather than a shape check.
    // BOTH PATHS SYNTHETIC, so both verdicts are reachable on any platform. The
    // folder need not exist: the scan is guarded and answers « nothing », which
    // is the truthful result and leaves the volume question isolated.
    //
    // Forward slashes on purpose — Node accepts them on Windows, and a
    // backslashed literal here is one shell round-trip away from becoming
    // `Z:hibaposcustom.db`, which is what happened while writing this file.
    const synthetic = (backupDir: string, dbPath: string) =>
      backupStorageReport({ backupDir, dbPath, uploadsDir: dbPath, archivesDir: dbPath });

    const same = await synthetic("C:/hibapos/backups", "C:/hibapos/app/db/custom.db");
    expect(same.volume, "one drive, two folders").toBe("SAME");

    const different = await synthetic("D:/backups", "C:/hibapos/app/db/custom.db");
    expect(different.volume, "two drives — the state the operator is aiming for").toBe("DIFFERENT");

    // The verdict FOLLOWS THE ARGUMENT. The first version called the global
    // `backupVolumeReport()` here, so with injected paths the report described
    // one folder and the volume of another — and no test could reach SAME or
    // DIFFERENT through it. It passed anyway, asserting only « the live
    // machine's answer is one of three », which is true of every possible
    // implementation.
    expect(same.volume).not.toBe(different.volume);
    expect(different.databaseDirectory).toBe(path.dirname("C:/hibapos/app/db/custom.db"));

    // …and the real fixture folder still reports against its own database.
    const live = await report(path.join(dir, "custom.db"));
    expect(live.databaseDirectory).toBe(path.resolve(dir));
  });
});
