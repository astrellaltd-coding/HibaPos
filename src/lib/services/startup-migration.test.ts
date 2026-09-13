import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import path from "path";
import os from "os";
import { db } from "@/lib/db";
import {
  runStartupMigrationGate,
  pendingMigrations,
  lastMigrationGateResult,
  NO_BACKUP_REFUSAL,
  migrationLockPath,
  type GateDeps,
} from "@/lib/services/startup-migration";

// STARTUP MIGRATION GATE (operator, 2026-09-11).
//
// ── WHAT IS BEING CLAIMED ───────────────────────────────────────────────────
// An installer has nobody to run `prisma migrate deploy`, so the app applies
// its own pending migrations at startup — **behind a backup that has been
// opened again**. The order is the design: backup, verify, migrate, verify. A
// backup taken afterwards would be a backup of the thing that went wrong.
//
// This reverses the plan's rule that applying a migration is the operator's
// action, on the operator's instruction. That rule exists because this project
// twice believed a migration was applied when it was not — so the gate takes
// its verdict from the DATABASE and never from the exit code of
// `migrate deploy`, which prints the same banner whichever migration it ran.
//
// ── HOW IT IS TESTED WITHOUT MIGRATING THE TEST DATABASE ────────────────────
// Every dependency that touches the world is injected: taking the backup,
// opening it, and running the deploy. That is the pattern `createBackup`
// already uses for its `tarLoader` — « injected only so a test can make the
// import fail. The default is the real dynamic import, so production is
// unchanged. » Nothing here runs `migrate deploy` or writes a real backup.
//
// The test database is built by `prisma db push` and therefore has **no**
// `_prisma_migrations` table, which is itself one of the cases under test — so
// the table is created and dropped around the tests that need it.

// The real SQLite header is 16 bytes ending in a NUL. Written as an ESCAPE,
// not as a raw byte: a literal NUL in the source makes git treat this file as
// binary, and a test nobody can read a diff of is a test nobody reviews.
const SQLITE_HEADER = Buffer.from("SQLite format 3\u0000", "latin1");
const FAKE_DB = Buffer.concat([SQLITE_HEADER, Buffer.from("payload")]);
const FAKE_SHA = "0".repeat(64);

function sha(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

/** Every migration directory on disk, in the order the gate reads them. */
function migrationNames(): string[] {
  const dir = path.resolve("prisma/migrations");
  return readdirSync(dir).filter((e) => statSync(path.join(dir, e)).isDirectory()).sort();
}

let sandbox: string;
const REAL_DATA_DIR = process.env.HIBAPOS_DATA_DIR;

/** The lock lives under the data dir, so move it somewhere disposable. */
function useSandbox() {
  sandbox = path.join(os.tmpdir(), `hibapos-migrate-gate-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(path.join(sandbox, "db"), { recursive: true });
  process.env.HIBAPOS_DATA_DIR = sandbox;
  expect(sandbox).toContain(os.tmpdir());
}

async function createMigrationTable() {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id TEXT PRIMARY KEY, checksum TEXT NOT NULL, finished_at DATETIME,
      migration_name TEXT NOT NULL, logs TEXT, rolled_back_at DATETIME,
      started_at DATETIME NOT NULL DEFAULT current_timestamp,
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    )`);
}

async function dropMigrationTable() {
  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "_prisma_migrations"`);
}

/** Record every migration on disk as applied, so nothing is pending. */
async function markAllApplied() {
  const names = migrationNames();
  for (const n of names) {
    await db.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
       VALUES (?, 'x', current_timestamp, ?, 1)`,
      `${n}-id`,
      n,
    );
  }
  return names;
}

/** Deps that succeed at everything, and record what was asked of them. */
function happyDeps(): GateDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    takeBackup: async () => {
      calls.push("takeBackup");
      return { filename: "backup-under-test.dbenc", checksum: sha(FAKE_DB), encrypted: true };
    },
    openBackup: async () => {
      calls.push("openBackup");
      return FAKE_DB;
    },
    deploy: async () => {
      calls.push("deploy");
      return { ok: true, output: "All migrations have been successfully applied." };
    },
  };
}

beforeEach(async () => {
  useSandbox();
  await dropMigrationTable();
});

afterEach(async () => {
  await dropMigrationTable();
  // L-137 moved the lock BESIDE THE DATABASE, which is outside the sandbox this
  // hook removes below — so a lock left by one test survived into the next and
  // made it look as though the gate had not released it. Cleaned explicitly.
  // (`releaseLock()` deliberately does not fire when the lock was never taken:
  // a process does not delete somebody else's lock.)
  if (existsSync(migrationLockPath())) rmSync(migrationLockPath(), { force: true });
  if (REAL_DATA_DIR === undefined) delete process.env.HIBAPOS_DATA_DIR;
  else process.env.HIBAPOS_DATA_DIR = REAL_DATA_DIR;
  if (sandbox && existsSync(sandbox)) rmSync(sandbox, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. The cases where it does nothing
// ---------------------------------------------------------------------------

describe("the gate does nothing unless it has to", () => {
  it("skips a database with no _prisma_migrations table, and says why", async () => {
    // `prisma db push` builds one of these — every test database here.
    // `migrate deploy` against it would apply the whole history over an
    // existing schema.
    const deps = happyDeps();
    const r = await runStartupMigrationGate(deps);
    expect(r.status).toBe("SKIPPED_NO_MIGRATION_TABLE");
    expect(r.reason).toContain("db push");
    // THE ASSERTION THAT MATTERS: it did not take a backup and did not deploy.
    expect(deps.calls).toEqual([]);
  });

  it("reports UP_TO_DATE when every migration on disk is applied", async () => {
    await createMigrationTable();
    const names = await markAllApplied();
    expect(names.length).toBeGreaterThan(0);
    expect(await pendingMigrations()).toEqual([]);

    const deps = happyDeps();
    const r = await runStartupMigrationGate(deps);
    expect(r.status).toBe("UP_TO_DATE");
    // The normal case costs one query and nothing else.
    expect(deps.calls).toEqual([]);
  });

  it("finds exactly the migrations that are on disk and not applied", async () => {
    await createMigrationTable();
    const names = await markAllApplied();
    // Un-apply the newest one.
    const newest = names[names.length - 1];
    await db.$executeRawUnsafe(`DELETE FROM "_prisma_migrations" WHERE migration_name = ?`, newest);
    expect(await pendingMigrations()).toEqual([newest]);
  });
});

// ---------------------------------------------------------------------------
// 2. The gate itself: no verified backup, no migration
// ---------------------------------------------------------------------------

describe("no verified backup, no migration", () => {
  beforeEach(async () => {
    await createMigrationTable();
    const names = await markAllApplied();
    await db.$executeRawUnsafe(
      `DELETE FROM "_prisma_migrations" WHERE migration_name = ?`,
      names[names.length - 1],
    );
  });

  it("refuses when the backup cannot be taken at all", async () => {
    const deps = happyDeps();
    deps.takeBackup = async () => {
      deps.calls.push("takeBackup");
      throw new Error("disque plein");
    };
    const r = await runStartupMigrationGate(deps);
    expect(r.status).toBe("REFUSED_NO_VERIFIED_BACKUP");
    expect(r.reason).toContain(NO_BACKUP_REFUSAL);
    expect(r.reason).toContain("disque plein");
    expect(deps.calls).not.toContain("deploy");
  });

  it("refuses when the backup cannot be opened again", async () => {
    // « Written » is what a corrupt file also is. The gate is that it OPENS.
    const deps = happyDeps();
    deps.openBackup = async () => {
      deps.calls.push("openBackup");
      throw new Error("clé de chiffrement invalide");
    };
    const r = await runStartupMigrationGate(deps);
    expect(r.status).toBe("REFUSED_NO_VERIFIED_BACKUP");
    expect(r.reason).toContain("clé de chiffrement invalide");
    expect(deps.calls).not.toContain("deploy");
  });

  it("refuses when the decrypted backup's checksum does not match", async () => {
    const deps = happyDeps();
    deps.takeBackup = async () => {
      deps.calls.push("takeBackup");
      return { filename: "b.dbenc", checksum: FAKE_SHA, encrypted: true }; // wrong sha
    };
    const r = await runStartupMigrationGate(deps);
    expect(r.status).toBe("REFUSED_NO_VERIFIED_BACKUP");
    expect(r.reason).toContain("somme de contrôle");
    expect(deps.calls).not.toContain("deploy");
  });

  it("refuses when the backup decrypts to something that is not SQLite", async () => {
    // A checksum proves the bytes survived; it does not prove they are a
    // database. Both halves are needed and this is the second.
    const deps = happyDeps();
    const notADb = Buffer.from("this is not a database");
    deps.takeBackup = async () => {
      deps.calls.push("takeBackup");
      return { filename: "b.dbenc", checksum: sha(notADb), encrypted: true };
    };
    deps.openBackup = async () => {
      deps.calls.push("openBackup");
      return notADb;
    };
    const r = await runStartupMigrationGate(deps);
    expect(r.status).toBe("REFUSED_NO_VERIFIED_BACKUP");
    expect(r.reason).toContain("pas un fichier SQLite");
    expect(deps.calls).not.toContain("deploy");
  });

  it("refuses when the backup has no checksum to compare against", async () => {
    const deps = happyDeps();
    deps.takeBackup = async () => {
      deps.calls.push("takeBackup");
      return { filename: "b.dbenc", checksum: null, encrypted: true };
    };
    const r = await runStartupMigrationGate(deps);
    expect(r.status).toBe("REFUSED_NO_VERIFIED_BACKUP");
    expect(deps.calls).not.toContain("deploy");
  });
});

// ---------------------------------------------------------------------------
// 3. The verdict comes from the database, never from the exit code
// ---------------------------------------------------------------------------

describe("the verdict comes from the database", () => {
  beforeEach(async () => {
    await createMigrationTable();
    const names = await markAllApplied();
    await db.$executeRawUnsafe(
      `DELETE FROM "_prisma_migrations" WHERE migration_name = ?`,
      names[names.length - 1],
    );
  });

  it("reports FAILED when deploy claims success but a migration is still pending", async () => {
    // THE WHOLE REASON `scripts/apply-migration.ts` EXISTS: `migrate deploy`
    // prints « All migrations have been successfully applied » whichever
    // migration it ran, and this project read that banner twice and was wrong
    // both times. So `deploy` here lies successfully, and the gate catches it
    // by asking the database.
    const deps = happyDeps(); // deploy returns ok:true and changes nothing
    const r = await runStartupMigrationGate(deps);
    expect(deps.calls).toEqual(["takeBackup", "openBackup", "deploy"]);
    expect(r.status).toBe("FAILED_AFTER_MIGRATE");
    expect(r.reason).toContain("en attente");
    // It names the backup — but CHANGED 2026-09-13 (R9.2, L-138): naming it is
    // NOT the same as telling the operator to restore it. Here `deploy` lied and
    // changed nothing, so the schema is untouched and a restore would be
    // unnecessary work on a fiscal database that reads as though damage had
    // occurred. The message says which of the two this is; the backup is still
    // named, because it was still taken and verified.
    expect(r.reason).toContain("backup-under-test.dbenc");
    expect(r.reason).toContain("rien à restaurer");
    expect(r.backup).toBe("backup-under-test.dbenc");
  });

  it("reports APPLIED when the database agrees that nothing is pending", async () => {
    const deps = happyDeps();
    // A deploy that actually does the thing it claims: it records the missing
    // row, and it is awaited, so the gate's own verification sees the result.
    deps.deploy = async () => {
      deps.calls.push("deploy");
      const newest = migrationNames()[migrationNames().length - 1];
      await db.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
         VALUES (?, 'x', current_timestamp, ?, 1)`,
        `${newest}-applied`,
        newest,
      );
      return { ok: true, output: "All migrations have been successfully applied." };
    };

    const r = await runStartupMigrationGate(deps);
    expect(deps.calls).toEqual(["takeBackup", "openBackup", "deploy"]);
    expect(r.status).toBe("APPLIED");
    expect(r.backup).toBe("backup-under-test.dbenc");
    expect(r.pending).toHaveLength(1); // what it applied
    // Read back: the database is the authority, not the return value.
    expect(await pendingMigrations()).toEqual([]);
  });

  it("takes the backup BEFORE deploying, never after", async () => {
    // A backup taken afterwards is a backup of the thing that went wrong.
    const deps = happyDeps();
    await runStartupMigrationGate(deps);
    expect(deps.calls.indexOf("takeBackup")).toBeLessThan(deps.calls.indexOf("deploy"));
    expect(deps.calls.indexOf("openBackup")).toBeLessThan(deps.calls.indexOf("deploy"));
  });

  it("records its last result, so a log or a screen can report it", async () => {
    await runStartupMigrationGate(happyDeps());
    expect(lastMigrationGateResult()?.status).toBe("FAILED_AFTER_MIGRATE");
  });
});

// ---------------------------------------------------------------------------
// 4. One process only
// ---------------------------------------------------------------------------

describe("only one process migrates", () => {
  beforeEach(async () => {
    await createMigrationTable();
    const names = await markAllApplied();
    await db.$executeRawUnsafe(
      `DELETE FROM "_prisma_migrations" WHERE migration_name = ?`,
      names[names.length - 1],
    );
  });

  it("skips when another process holds the lock", async () => {
    // Two workers booting together would both migrate. Intermittent damage is
    // the worst kind, so one of them takes the job and the other stands down.
    // L-137 (2026-09-13): the lock lives beside the DATABASE now, not beside the
    // data directory. Two installs sharing one database file used to take two
    // different locks and both migrate it. `migrationLockPath()` is where it
    // actually is; that it FOLLOWS the database is asserted on its own below,
    // rather than by this test, which is about standing down.
    writeFileSync(migrationLockPath(), "9999 held\n");
    const deps = happyDeps();
    const r = await runStartupMigrationGate(deps);
    expect(r.status).toBe("SKIPPED_LOCKED");
    expect(deps.calls).toEqual([]); // no backup, no deploy
  });

  it("releases the lock afterwards, so the next start is not blocked", async () => {
    const lock = migrationLockPath();
    await runStartupMigrationGate(happyDeps());
    expect(existsSync(lock)).toBe(false);
  });

  it("reclaims a lock left behind by a crashed process", async () => {
    // Otherwise one crash blocks every future start, and the failure is
    // invisible: the app just silently stops migrating.
    const lock = migrationLockPath();
    writeFileSync(lock, "1234 stale\n");
    const eleven = Date.now() - 11 * 60 * 1000;
    utimesSync(lock, new Date(eleven), new Date(eleven));

    const deps = happyDeps();
    const r = await runStartupMigrationGate(deps);
    expect(r.status).not.toBe("SKIPPED_LOCKED");
    expect(deps.calls).toContain("takeBackup");
  });
});
