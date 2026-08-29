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
import { existsSync, unlinkSync, mkdirSync } from "fs";
import path from "path";
import os from "os";

const testDbDir = path.join(os.tmpdir(), "hibapos-test-db");
const testDbPath = path.join(testDbDir, "test.db");

mkdirSync(testDbDir, { recursive: true });

// Fresh test DB for each run — delete any stale file + WAL/SHM sidecars.
for (const p of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
  if (existsSync(p)) {
    try { unlinkSync(p); } catch { /* Windows file lock — ignore */ }
  }
}

// Point Prisma at the test DB (absolute path, forward slashes for SQLite).
process.env.DATABASE_URL = `file:${testDbPath.replace(/\\/g, "/")}?_fk=1&_busy_timeout=5000`;

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
