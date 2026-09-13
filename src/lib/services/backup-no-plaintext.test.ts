import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs, readFileSync } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { db } from "@/lib/db";
import {
  createBackup,
  backupSecret,
  encryptFile,
  decryptFile,
  type BackupPaths,
} from "@/lib/services/backup";

// R9.3 — nothing readable is left behind, and the key is chosen in one place.
//
// L-104 · L-105 · L-141 · L-142. The restore half of L-105 is asserted through
// the same mechanism as L-104 because forcing a failure inside a real
// `restoreBackup` is irreversible against whatever database it points at —
// which is why the audit could only mark L-105 SUSPECTED.
//
// ── WHY THIS IS THE HIGH-SEVERITY ONE ────────────────────────────────────────
// `VACUUM INTO` writes the ENTIRE DATABASE to disk unencrypted, and it stays
// that way until the `unlink` after `encryptFile`. `createBackup` had no
// `try`/`finally` anywhere in its body, so any throw in between left the file
// there. It gets no `Backup` row, so `pruneBackups` never removes it and
// `listBackups` never shows it: **permanent and invisible.**
//
// The audit did not argue this — it patched `writeFile` to throw `ENOSPC`, ran
// the real `createBackup`, and found **741 376 bytes of readable database**
// with the `User.pinHash` column in it. And on this install `BACKUP_LOCATION`
// is inside OneDrive, **so the plaintext leaves the machine.**
//
// These tests reproduce that with the same method: break a real filesystem
// call, run the real function, then look at the directory.

const KEY = "r93-backup-key-0123456789abcdef0123456789";

let tmpRoot: string;
let paths: BackupPaths;
let realWriteFile: typeof fs.writeFile;
let realRename: typeof fs.rename;

beforeEach(async () => {
  await db.backup.deleteMany();
  await db.technicalLog.deleteMany();
  await db.auditLog.deleteMany();
  await db.fiscalEvent.deleteMany();

  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hibapos-r93-"));
  paths = {
    backupDir: path.join(tmpRoot, "db", "backups"),
    dbPath: path.join(tmpRoot, "db", "custom.db"),
    uploadsDir: path.join(tmpRoot, "public", "uploads"),
    archivesDir: path.join(tmpRoot, "db", "fiscal-archives"),
  };
  await fs.mkdir(paths.backupDir, { recursive: true });
  await fs.mkdir(paths.uploadsDir, { recursive: true });
  await fs.mkdir(paths.archivesDir, { recursive: true });

  realWriteFile = fs.writeFile;
  realRename = fs.rename;
  process.env.BACKUP_ENCRYPTION_KEY = KEY;
  delete process.env.BACKUP_SECRET;
});

afterEach(async () => {
  (fs as { writeFile: typeof fs.writeFile }).writeFile = realWriteFile;
  (fs as { rename: typeof fs.rename }).rename = realRename;
  delete process.env.BACKUP_SECRET;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

/** Every file the backup directory holds, so nothing can hide in it. */
async function inBackupDir(): Promise<string[]> {
  return (await fs.readdir(paths.backupDir)).sort();
}

/** Is this file a readable SQLite database? The 16-byte header says so. */
async function isPlainSqlite(file: string): Promise<boolean> {
  const fh = await fs.open(file, "r").catch(() => null);
  if (!fh) return false;
  try {
    const buf = Buffer.alloc(16);
    await fh.read(buf, 0, 16, 0);
    return buf.toString("latin1").startsWith("SQLite format 3");
  } finally {
    await fh.close();
  }
}

/**
 * Break `fs.writeFile` PART-WAY, which is what a disk filling up actually does.
 *
 * `breakWriteFileOnce` throws before the real call, so the target file never
 * exists — and a test built on it cannot see whether a half-written file is
 * cleaned up, because there is never one to clean. Measured: the revert that
 * removes the `.dbenc` cleanup survived it. This writes the first half and
 * then throws, so the file is there and truncated.
 */
function truncateWriteFileOnce(match: (p: string) => boolean) {
  let fired = false;
  (fs as { writeFile: typeof fs.writeFile }).writeFile = (async (
    ...args: Parameters<typeof fs.writeFile>
  ) => {
    if (!fired && match(String(args[0]))) {
      fired = true;
      const data = args[1] as Buffer;
      await realWriteFile(args[0], data.subarray(0, Math.floor(data.length / 2)));
      throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
    }
    return realWriteFile(...args);
  }) as typeof fs.writeFile;
  return () => fired;
}

/** Break `fs.writeFile` the way a full disk does — the audit's own method. */
function breakWriteFileOnce(match: (p: string) => boolean) {
  let fired = false;
  (fs as { writeFile: typeof fs.writeFile }).writeFile = (async (
    ...args: Parameters<typeof fs.writeFile>
  ) => {
    if (!fired && match(String(args[0]))) {
      fired = true;
      throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
    }
    return realWriteFile(...args);
  }) as typeof fs.writeFile;
  return () => fired;
}

describe("L-104 — a failed backup leaves no readable database behind", () => {
  it("strands nothing when the encrypted write fails", async () => {
    // `encryptFile` writes the `.dbenc`. Failing there is the exact window:
    // the plaintext `VACUUM INTO` snapshot is on disk and the unlink that
    // removes it is one statement away.
    const fired = breakWriteFileOnce((p) => p.endsWith(".dbenc"));

    await expect(createBackup(null, paths)).rejects.toThrow(/ENOSPC/);
    expect(fired(), "the failure never happened — this test proved nothing").toBe(true);

    const left = await inBackupDir();
    for (const f of left) {
      expect(
        await isPlainSqlite(path.join(paths.backupDir, f)),
        `${f} is a readable SQLite database left in the backup directory`,
      ).toBe(false);
    }
  });

  it("leaves no `.db` file at all, named or not", async () => {
    // Belt to the header check's braces: the header test would miss a
    // zero-length or truncated file, and the name is what a human scanning the
    // directory sees.
    breakWriteFileOnce((p) => p.endsWith(".dbenc"));
    await expect(createBackup(null, paths)).rejects.toThrow();
    expect(
      (await inBackupDir()).filter((f) => f.endsWith(".db")),
      "the plaintext VACUUM INTO snapshot survived the failure",
    ).toEqual([]);
  });

  it("leaves no half-written .dbenc that a later backup could trust", async () => {
    // A partial `.dbenc` is worse than none: `createBackup` would `fs.stat` it
    // and record a `Backup` row for a file that cannot be decrypted.
    //
    // TRUNCATING, not refusing. Throwing BEFORE the real write means the file
    // never exists, so the assertion holds whether or not anything cleans up —
    // measured, and the revert that deletes the cleanup survived that version
    // of this test. A disk that fills mid-write leaves a short file, and that
    // is the case worth asserting.
    const fired = truncateWriteFileOnce((p) => p.endsWith(".dbenc"));
    await expect(createBackup(null, paths)).rejects.toThrow(/ENOSPC/);
    expect(fired(), "nothing was truncated — this test proved nothing").toBe(true);
    expect(
      (await inBackupDir()).filter((f) => f.endsWith(".dbenc")),
      "a truncated .dbenc survived; the next backup would stat it and record a row",
    ).toEqual([]);
  });

  it("cleans up the truncated .dbenc AND the plaintext together", async () => {
    // The two halves of the same failure. One without the other is still a
    // backup directory nobody can trust.
    truncateWriteFileOnce((p) => p.endsWith(".dbenc"));
    await expect(createBackup(null, paths)).rejects.toThrow();
    expect(await inBackupDir()).toEqual([]);
  });

  it("records no Backup row for a backup that did not happen", async () => {
    breakWriteFileOnce((p) => p.endsWith(".dbenc"));
    await expect(createBackup(null, paths)).rejects.toThrow();
    expect(await db.backup.count()).toBe(0);
  });

  it("still succeeds, and still cleans up, when nothing fails", async () => {
    // The direction that would make all of the above worthless if wrong.
    const backup = await createBackup(null, paths);
    expect(backup.filename).toMatch(/\.dbenc$/);
    expect((await inBackupDir()).filter((f) => f.endsWith(".db"))).toEqual([]);
    const enc = path.join(paths.backupDir, backup.filename);
    expect(await isPlainSqlite(enc), "the SHIPPED backup is readable plaintext").toBe(false);
  });

  it("the next backup after a failure is clean", async () => {
    // A stranded file is not only a leak; it is also litter the reuse checks
    // walk past. Prove the directory is usable again.
    breakWriteFileOnce((p) => p.endsWith(".dbenc"));
    await expect(createBackup(null, paths)).rejects.toThrow();
    const ok = await createBackup(null, paths);
    const left = await inBackupDir();
    expect(left.filter((f) => f.endsWith(".db"))).toEqual([]);
    expect(left).toContain(ok.filename);
  });
});

describe("L-105 — the restore path's safety snapshot leaks nothing either", () => {
  it("is inside a try/finally, like L-104's", () => {
    // WHY THIS IS READ AND NOT DRIVEN. `restoreBackup` replaces the live
    // database by `rename`; forcing a failure part-way through it, against a
    // real file, is irreversible — which is exactly why the audit could only
    // mark L-105 SUSPECTED rather than reproduce it. The BEHAVIOUR the two
    // findings share is proved above on `createBackup`, where it can be forced
    // safely; what is pinned here is that the restore path has the same shape,
    // because the failure mode was structural: the three lines sat outside the
    // `try` that L-62's cleanup runs in.
    const src = readFileSync(
      path.join(process.cwd(), "src/lib/services/backup.ts"),
      "utf8",
    ) as string;
    const at = src.indexOf("const safetyPlain =");
    expect(at, "the safety snapshot moved — this assertion needs rewriting").toBeGreaterThan(0);
    const block = src.slice(at, src.indexOf("const safetyStat =", at));
    expect(block).toContain("VACUUM INTO");
    expect(block).toContain("encryptFile(safetyPlain");
    // The unlink is in a `finally`, so it runs on the paths nobody predicted —
    // L-62's argument, one function down, applied to the file it could not
    // reach because this one is created before the block it guards.
    expect(block).toMatch(/\}\s*finally\s*\{[^}]*unlink\(safetyPlain\)/);
  });

  it("stops the restore rather than proceeding without a rollback point", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/lib/services/backup.ts"),
      "utf8",
    ) as string;
    const at = src.indexOf("const safetyPlain =");
    const block = src.slice(at, src.indexOf("const safetyStat =", at));
    // Nothing irreversible has happened at this point — the swap is still
    // ahead — so the honest answer is to stop, not to carry on unprotected.
    expect(block).toContain("restauration annulée avant toute modification");
    expect(block).toContain("unlink(stagedDbPath)");
  });
});

describe("L-141 — one place decides which backup key is used", () => {
  it("prefers BACKUP_ENCRYPTION_KEY", async () => {
    process.env.BACKUP_ENCRYPTION_KEY = KEY;
    delete process.env.BACKUP_SECRET;
    expect(await backupSecret()).toBe(KEY);
  });

  it("REFUSES when both names are set and differ", async () => {
    // The finding itself. `bootstrapSecrets()` and `rotate-secrets.ts` know
    // only the long name, so an install holding its key under the short one
    // gets a fresh long-named key generated beside it — and the `||` silently
    // prefers the new one, orphaning every backup ever made. Undecryptable
    // backups, discovered at the moment they are needed.
    process.env.BACKUP_ENCRYPTION_KEY = KEY;
    process.env.BACKUP_SECRET = "a-different-key-0123456789abcdef0123456789";
    await expect(backupSecret()).rejects.toThrow(/BACKUP_SECRET/);
    // And it says what to do, because the operator has to pick one.
    await expect(backupSecret()).rejects.toThrow(/decrypt-backup/);
  });

  it("allows both when they are the same value", async () => {
    // Belt and braces during a rename: setting the new name to the old value
    // before deleting the old one must not stop the till.
    process.env.BACKUP_ENCRYPTION_KEY = KEY;
    process.env.BACKUP_SECRET = KEY;
    expect(await backupSecret()).toBe(KEY);
  });

  it("uses BACKUP_SECRET alone, and says so every time", async () => {
    // The fallback is KEPT, not dropped: it is the only key an install
    // provisioned under the old name has, and removing it would turn a
    // documentation gap into unreadable backups.
    delete process.env.BACKUP_ENCRYPTION_KEY;
    process.env.BACKUP_SECRET = KEY;
    await db.technicalLog.deleteMany();

    expect(await backupSecret()).toBe(KEY);

    const warned = await db.technicalLog.findMany({ where: { source: "backup-service" } });
    expect(warned.length, "the legacy name was accepted silently").toBeGreaterThan(0);
    expect(warned[0].message).toContain("BACKUP_SECRET");
    expect(warned[0].level).toBe("WARN");

    process.env.BACKUP_ENCRYPTION_KEY = KEY;
  });

  it("answers null when neither is set, so the caller writes the message", async () => {
    delete process.env.BACKUP_ENCRYPTION_KEY;
    delete process.env.BACKUP_SECRET;
    expect(await backupSecret()).toBeNull();
    process.env.BACKUP_ENCRYPTION_KEY = KEY;
  });

  it("is what createBackup actually calls", async () => {
    // Without this the five above test a function nothing uses.
    process.env.BACKUP_ENCRYPTION_KEY = KEY;
    process.env.BACKUP_SECRET = "a-different-key-0123456789abcdef0123456789";
    await expect(createBackup(null, paths)).rejects.toThrow(/BACKUP_SECRET/);
    expect(await inBackupDir(), "a refused backup still wrote files").toEqual([]);
  });

  it("is documented in .env.example, which was the whole finding", async () => {
    // « A live fallback in four places, documented nowhere » — the second half
    // is what made the first dangerous.
    const env = await fs.readFile(path.join(process.cwd(), ".env.example"), "utf8");
    expect(env).toContain("BACKUP_SECRET");
    expect(env).toContain("BACKUP_ENCRYPTION_KEY");
  });

  it("has no open-coded `||` fallback left in the application", async () => {
    // Four sites became one. `scripts/decrypt-backup.ts` deliberately keeps its
    // own — it is the recovery tool, and it only ever READS.
    const { globSync } = await import("fs");
    const files = (globSync("src/**/*.ts", { cwd: process.cwd() }) as string[])
      .map((f) => f.split(path.sep).join("/"))
      // Test files quote the expression in order to assert its absence — this
      // one included. Scanning them makes the check match itself.
      .filter((f) => !f.endsWith(".test.ts"));
    const offenders = files.filter((f) => {
      const src = readFileSync(path.join(process.cwd(), f), "utf8") as string;
      return src.includes("process.env.BACKUP_ENCRYPTION_KEY || process.env.BACKUP_SECRET");
    });
    expect(files.length, "the sweep found no source files — it would pass empty").toBeGreaterThan(
      100,
    );
    // backup.ts names the old expression inside `backupSecret`'s comment, which
    // is the record of what was replaced — allowed, and only there.
    expect(offenders).toEqual(["src/lib/services/backup.ts"]);
  });
});

describe("L-142 — the scrypt cost is the measured one", () => {
  it("derives maxmem from the parameters instead of a literal", async () => {
    // It was a hard-coded 2 GiB here and 512 MiB in `decrypt-backup.ts`; both
    // work, both are far above the 128 MiB the parameters need, and neither
    // would follow the parameters if someone raised N.
    const src = await fs.readFile(
      path.join(process.cwd(), "src/lib/services/backup.ts"),
      "utf8",
    );
    expect(src).toContain("SCRYPT_WORKING_SET = 128 * SCRYPT_N * SCRYPT_R * SCRYPT_P");
    expect(src).toContain("maxmem: SCRYPT_MAXMEM");
    expect(src, "the 2 GiB literal is back").not.toContain("2 * 1024 * 1024 * 1024");
  });

  it("states 128 MiB, which is what it costs", async () => {
    const src = await fs.readFile(
      path.join(process.cwd(), "src/lib/services/backup.ts"),
      "utf8",
    );
    expect(src, "the ~1 GiB claim is back — it is 8x high").not.toMatch(/memory ~1 GiB peak/);
    expect(src).toContain("128 MiB");
  });

  it("agrees with what crypto.scrypt actually requires", async () => {
    // The arithmetic, checked against the implementation rather than against
    // itself: the audit could only compute `128 · N · r · p`, and this is the
    // measurement it could not make. Node refuses a maxmem below the working
    // set, so the boundary IS the requirement.
    const N = 1 << 17, r = 8, p = 1;
    const working = 128 * N * r * p;
    expect(working).toBe(134_217_728); // 128 MiB exactly

    // `crypto.scrypt` throws SYNCHRONOUSLY on invalid parameters rather than
    // calling back with the error — measured here, not assumed, because the
    // obvious `new Promise(... (e) => resolve(!e))` never settles and the
    // RangeError escapes the promise entirely.
    const derive = async (maxmem: number): Promise<boolean> => {
      try {
        return await new Promise<boolean>((resolve, reject) =>
          crypto.scrypt("x".repeat(48), crypto.randomBytes(16), 32, { N, r, p, maxmem }, (e) =>
            e ? reject(e) : resolve(true),
          ),
        );
      } catch {
        return false;
      }
    };
    expect(await derive(working - 1), "scrypt accepted less than the working set").toBe(false);
    // Just over the block, which is where the measured 128.8 MiB comes from:
    // scrypt's own bookkeeping sits on top.
    expect(await derive(working * 2), "the shipped ceiling does not work").toBe(true);
  });

  it("still round-trips a file at the shipped parameters", async () => {
    // The ceiling is derived now, so this is the test that fails if the
    // derivation is ever wrong: too low and every backup stops working.
    const plain = path.join(tmpRoot, "round-trip.bin");
    const enc = path.join(tmpRoot, "round-trip.enc");
    const back = path.join(tmpRoot, "round-trip.out");
    const payload = crypto.randomBytes(4096);
    await fs.writeFile(plain, payload);

    await encryptFile(plain, enc, KEY);
    await decryptFile(enc, back, KEY);

    expect(Buffer.compare(await fs.readFile(back), payload)).toBe(0);
    // …and the encrypted form is not the plaintext.
    expect(Buffer.compare(await fs.readFile(enc), payload)).not.toBe(0);
  });
});
