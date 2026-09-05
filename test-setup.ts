// Test setup — runs before any test file is loaded (via bunfig.toml preload).
// Sets the env vars required by auth + approvals + backup modules so their
// import-time guards (which throw on missing/too-short secrets) don't trip
// during test runs. Also points Prisma at a throwaway test DB (in the system
// temp directory, NOT on OneDrive where EPERM locks the Prisma engine) so
// service-layer integration tests can exercise the real Prisma client.

process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ??
  "test-session-secret-at-least-32-characters-long-0123456789";
process.env.BACKUP_ENCRYPTION_KEY =
  process.env.BACKUP_ENCRYPTION_KEY ??
  "test-backup-key-32-characters-or-more-0123456789";

// --- Test database (in the system temp dir to avoid OneDrive EPERM locks) ---
import { execSync } from "child_process";
import { existsSync, unlinkSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import path from "path";
import os from "os";

const TEST_DB_ROOT = path.join(os.tmpdir(), "hibapos-test-db");

/**
 * A PER-RUN database directory — L-40, L-43 and warning 3b, all three.
 *
 * This used to be one fixed file, `hibapos-test-db/test.db`, deleted at the top
 * of every run. Three separate problems came out of that single fact and the
 * plan lists them separately because they were found separately:
 *
 *   warning 3b — two sessions running `bun test src` at once destroy each
 *                other's database, and the failures look like code failures.
 *   L-40       — test files clean up BEFORE each test and not after, so the
 *                order files run in is load-bearing and a file can fail
 *                because of one it has nothing to do with.
 *   L-43       — `shift-race.test.ts`'s ten-sales race fails intermittently;
 *                its last assertion counts a table every file shares.
 *
 * A path unique per run closes the first outright and takes the shared-state
 * half out of the other two. What it does NOT do is make files independent of
 * each other WITHIN a run — they still share one database, and L-43's global
 * `db.order.count()` is fixed separately, in that file.
 */
const runId = `run-${process.pid}-${Date.now().toString(36)}`;
const testDbDir = path.join(TEST_DB_ROOT, runId);
const testDbPath = path.join(testDbDir, "test.db");

mkdirSync(testDbDir, { recursive: true });

// Sweep run directories older than an hour. Without this the temp tree grows
// by one database per run forever; with it, a crashed run's leftovers go on
// the next one rather than needing a person.
try {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const entry of readdirSync(TEST_DB_ROOT)) {
    if (!entry.startsWith("run-")) continue;
    const full = path.join(TEST_DB_ROOT, entry);
    if (full === testDbDir) continue;
    try {
      if (statSync(full).mtimeMs < cutoff) rmSync(full, { recursive: true, force: true });
    } catch { /* another run holds it — leave it alone */ }
  }
} catch { /* first run: the root may not exist yet */ }

// Fresh test DB — delete any stale file + WAL/SHM sidecars. Kept even though
// the directory is now unique per run: it costs nothing and it is what makes
// a re-used `runId` (same pid, same millisecond) safe.
for (const p of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
  if (existsSync(p)) {
    try { unlinkSync(p); } catch { /* Windows file lock — ignore */ }
  }
}

// Point Prisma at the test DB (absolute path, forward slashes for SQLite).
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, "/")}?_fk=1&_busy_timeout=5000`;
// Anything that writes a data file — fiscal archives, backups — goes to the
// same throwaway tree. Batch 3.4 shipped an archive into the real
// `db/fiscal-archives/` because only `DATABASE_URL` was overridden.
process.env.HIBAPOS_DATA_DIR = testDbDir;

/**
 * THE GUARD — L-06, and the reason it is here rather than in a comment.
 *
 * `bunfig.toml` preloads this file for `bun test`. It is the only thing
 * pointing Prisma away from the real database, and if it is ever bypassed or
 * edited wrongly, four test files begin by wiping seventeen tables — against
 * whatever `DATABASE_URL` happens to hold, which off a normal shell is the
 * restaurant's live till.
 *
 * So: refuse to continue unless the database this run will use is inside the
 * system temp directory. This aborts the run instead of destroying anything,
 * and it fails LOUDLY, because a silent fallback is exactly how the accident
 * happens.
 */
function assertDisposableDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  const filePath = url.replace(/^file:/, "").split("?")[0];
  const resolved = path.resolve(filePath);
  const tmp = path.resolve(os.tmpdir());
  const inTmp = resolved.toLowerCase().startsWith(tmp.toLowerCase() + path.sep);
  if (!inTmp) {
    throw new Error(
      [
        "",
        "  ABORTED: the test database is not a throwaway one.",
        "",
        `  DATABASE_URL resolves to: ${resolved}`,
        `  and must sit under:       ${tmp}`,
        "",
        "  Four test files start by wiping seventeen tables. Running them",
        "  against anything else destroys it. This is L-06 / warning 3.",
        "",
        "  Use `bun test src`, which preloads test-setup.ts. Do NOT use",
        "  `bunx vitest` — it does not read bunfig.toml and so never reaches",
        "  this guard.",
        "",
      ].join("\n"),
    );
  }
}
assertDisposableDatabase();

// Push the schema to the test DB. Uses the already-installed Prisma engine
// (no generate needed). If this fails, pure unit tests still run — only
// service-layer integration tests are affected.
try {
  execSync("bunx prisma db push --skip-generate --accept-data-loss", {
    stdio: "pipe",
    cwd: process.cwd(),
    timeout: 30_000,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
  });
} catch (e) {
  console.warn("[test-setup] prisma db push failed — service tests will fail:", e instanceof Error ? e.message : String(e));
}
