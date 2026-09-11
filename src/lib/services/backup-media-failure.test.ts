import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { db } from "@/lib/db";
import { createBackup, type BackupPaths, type TarLoader } from "@/lib/services/backup";

// L-79 (R4.1) — a backup that silently contains no images must stop being
// silent, and must stay distinguishable from a backup that has no images to
// contain.
//
// ── THE DEFECT ───────────────────────────────────────────────────────────────
// `ensureMediaArchive` loads `tar` with a dynamic `import()`. On rejection it
// ran `console.warn(…)` — the ONLY `console.*` call in a 1054-line file where
// every other soft failure is journalled through `logTechnical` — and returned
// `null`. But `null` is also what it returns for « there is nothing to
// archive ». So the two outcomes were indistinguishable:
//
//   an installation with no media         -> Backup row, imagesPath null,
//                                            audit `mediaIncluded: false`
//   tar failed, media exist and are LOST  -> Backup row, imagesPath null,
//                                            audit `mediaIncluded: false`
//
// The operator could not tell them apart from the row, the audit log or the API
// response. The RESTORE side already answered this same failure properly —
// `restoreUploadsArchive` returns `{ failed: … }` — so this is the create side
// catching up, not a new pattern.
//
// ── WHY IT IS NOT THEORETICAL ────────────────────────────────────────────────
// `tar` is a production dependency loaded dynamically, so static analysis
// cannot see the use. The plan's own R5.3 prunes "unused" dependencies and
// carries an explicit **Keep `tar`** warning for exactly this reason. The tree
// also lives under OneDrive, where EPERM inside `node_modules` is a documented
// hazard in this repo.
//
// ── HOW THE FAILURE IS PRODUCED, AND WHY NOT `mock.module` ───────────────────
// Through the injected `TarLoader`, which defaults to the real dynamic import.
//
// `mock.module("tar", …)` was tried FIRST and abandoned on measurement, which is
// worth recording so nobody tries it again:
//   * a synchronous throwing factory does NOT make the import reject — bun
//     resolves it to an empty module and the failure surfaces later at
//     `tar.c is not a function`, outside the `try` under test;
//   * an async throwing factory does reject correctly, BUT bun's module mocks
//     are process-wide and `bun run test` runs every file in one process, so it
//     broke three real tests in `backup-restore.test.ts`.
// A test that breaks other tests is not a test. The injected loader is the same
// convention this file already uses for `BackupPaths`.

process.env.BACKUP_ENCRYPTION_KEY =
  process.env.BACKUP_ENCRYPTION_KEY ?? "test-backup-key-32-characters-or-more-0123456789";

/** What the dynamic import does when the package cannot be loaded. */
const brokenTar: TarLoader = async () => {
  throw new Error("simulated: tar could not be loaded");
};

function testDbPath(): string {
  const url = process.env.DATABASE_URL ?? "";
  return path.resolve(url.replace(/^file:/, "").split("?")[0]);
}

let tmpRoot: string;
let paths: BackupPaths;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hibapos-media-fail-"));
  paths = {
    backupDir: path.join(tmpRoot, "backups"),
    dbPath: testDbPath(),
    uploadsDir: path.join(tmpRoot, "public", "uploads"),
    archivesDir: path.join(tmpRoot, "db", "fiscal-archives"),
  };
  await fs.mkdir(paths.backupDir, { recursive: true });
  await fs.mkdir(paths.uploadsDir, { recursive: true });
  await fs.mkdir(paths.archivesDir, { recursive: true });
  await db.backup.deleteMany({});
  await db.technicalLog.deleteMany({});
  await db.auditLog.deleteMany({});
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function tarWarnings() {
  return db.technicalLog.findMany({ where: { source: "backup-service" } });
}

async function backupAudit() {
  const row = await db.auditLog.findFirst({
    where: { action: "BACKUP_CREATED" },
    orderBy: { createdAt: "desc" },
  });
  return row ? (JSON.parse(row.details ?? "{}") as Record<string, unknown>) : null;
}

describe("L-79 — the control: a backup whose media archive worked", () => {
  it("archives the media, reports no failure and journals nothing", async () => {
    // Uses the REAL tar loader (no third argument), so this is the ordinary
    // path. Without it the tests below would pass against code that cried wolf
    // on every single backup.
    await fs.writeFile(path.join(paths.uploadsDir, "produit.webp"), "IMAGE-BYTES");

    const backup = await createBackup(null, paths);

    expect(backup.media).not.toBeNull();
    expect(backup.mediaUnavailable).toBeNull();
    expect(backup.imagesPath).toBeTruthy();
    expect(await tarWarnings()).toHaveLength(0);

    const audit = await backupAudit();
    expect(audit?.mediaIncluded).toBe(true);
    // ABSENT, not false — a healthy backup's audit entry reads as it always did.
    expect(audit).not.toHaveProperty("mediaUnavailable");
  });
});

describe("L-79 — when tar cannot be loaded", () => {
  it("still completes the backup — the database is safe either way", async () => {
    await fs.writeFile(path.join(paths.uploadsDir, "produit.webp"), "IMAGE-BYTES");

    const backup = await createBackup(null, paths, brokenTar);

    // Why the journal entry is WARN and not ERROR: the database backup, which
    // is the part that matters, succeeded.
    expect(backup.id).toBeTruthy();
    expect(backup.filename).toMatch(/\.dbenc$/);
    expect(await db.backup.count()).toBe(1);
  });

  it("JOURNALS it, instead of a console.warn nobody reads", async () => {
    await fs.writeFile(path.join(paths.uploadsDir, "produit.webp"), "IMAGE-BYTES");
    await createBackup(null, paths, brokenTar);

    const warnings = await tarWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].level).toBe("WARN");
    expect(warnings[0].message).toMatch(/tar/i);
    // The operator needs the consequence, not just the cause.
    expect(warnings[0].message).toMatch(/UNIQUEMENT la base de données/);
  });

  it("says so in the audit entry and in what the caller gets back", async () => {
    await fs.writeFile(path.join(paths.uploadsDir, "produit.webp"), "IMAGE-BYTES");
    const backup = await createBackup(null, paths, brokenTar);

    expect(backup.media).toBeNull();
    expect(backup.mediaUnavailable).toContain("simulated");
    expect(backup.imagesPath).toBeNull();

    const audit = await backupAudit();
    expect(audit?.mediaIncluded).toBe(false);
    expect(audit?.mediaUnavailable).toContain("simulated");
  });

  it("survives the archive BUILD failing, not just the import — L-85", async () => {
    // R4.5. `tar.c`, `encryptFile` and `fs.stat` used to sit outside any try,
    // so a full disk, a permission error or a file vanishing mid-archive
    // propagated out of `createBackup` and **failed the whole backup —
    // including the database half that had already been snapshotted and
    // encrypted.** Losing the database backup because the images could not be
    // tarred is the wrong trade in every case.
    //
    // Produced by handing back a `tar` whose `c()` rejects: the import
    // succeeds, so the L-79 path is not involved and this is genuinely the
    // build path.
    // `c()` WRITES ITS FILE and then fails, which is what a real mid-archive
    // failure looks like — a full disk fills after some output, a source file
    // vanishes partway. A mock that throws before writing anything leaves
    // nothing to clean up, so the leftover assertion below would be vacuous:
    // the first version of this test did exactly that and survived the revert
    // of the cleanup.
    const brokenBuild = (async () => ({
      c: async (opts: { file: string }) => {
        await fs.writeFile(opts.file, "PARTIAL-ARCHIVE-BYTES");
        throw new Error("simulated: ENOSPC no space left on device");
      },
    })) as unknown as TarLoader;

    await fs.writeFile(path.join(paths.uploadsDir, "produit.webp"), "IMAGE-BYTES");
    const backup = await createBackup(null, paths, brokenBuild);

    // The database backup completed. That is the whole point.
    expect(backup.id).toBeTruthy();
    expect(backup.filename).toMatch(/\.dbenc$/);
    expect(await db.backup.count()).toBe(1);

    // And it is reported, through the same channel L-79 added.
    expect(backup.mediaUnavailable).toContain("ENOSPC");
    expect(backup.media).toBeNull();
    const warnings = await tarWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].level).toBe("WARN");
    expect(warnings[0].message).toMatch(/UNIQUEMENT la base de données/);

    // Nothing half-written was left behind. A stray `.tar.gz`, or an `.enc`
    // that was never completed, would be taken for a valid reuse by the
    // `existsSync(encPath)` check on the NEXT backup.
    const leftovers = (await fs.readdir(paths.backupDir)).filter(
      (f) => f.startsWith("hibapos-media-"),
    );
    expect(leftovers).toEqual([]);
    // Specifically: the partial `.tar.gz` `c()` wrote is gone. If it survived,
    // the NEXT backup's `existsSync(encPath)` reuse check could take a
    // half-written archive for a good one.
    expect(leftovers.some((f) => f.endsWith(".tar.gz"))).toBe(false);
  });

  it("KEEPS « nothing to archive » distinct from « could not archive »", async () => {
    // THE WHOLE FINDING, in one test. With neither media directory present,
    // `ensureMediaArchive` returns before it ever touches the loader — so even
    // with a broken tar this is a completely successful backup and must report
    // as one. If this ever starts reporting `mediaUnavailable`, the two
    // outcomes have been conflated again, in the other direction.
    //
    // The directories must be ABSENT, not merely empty: `mediaSources` counts a
    // directory as an entry when it EXISTS, regardless of contents.
    await fs.rm(paths.uploadsDir, { recursive: true, force: true });
    await fs.rm(paths.archivesDir, { recursive: true, force: true });

    const backup = await createBackup(null, paths, brokenTar);

    expect(backup.media).toBeNull();
    expect(backup.mediaUnavailable).toBeNull();
    expect(await tarWarnings()).toHaveLength(0);

    const audit = await backupAudit();
    expect(audit?.mediaIncluded).toBe(false);
    expect(audit).not.toHaveProperty("mediaUnavailable");
  });
});
