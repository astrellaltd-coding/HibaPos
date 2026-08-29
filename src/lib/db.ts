import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// SQLite pragmas are applied via the DATABASE_URL connection-string params:
//   - `?_fk=1`              → PRAGMA foreign_keys = ON (defense-in-depth)
//   - `?_busy_timeout=5000` → PRAGMA busy_timeout = 5000 (SQLite waits up to
//                            5s for lock contention instead of throwing
//                            SQLITE_BUSY immediately)
// They cannot be runtime-set here: Prisma rejects `PRAGMA <set>` statements
// that resolve to result rows ("Execute returned results" error). For the
// same reason `PRAGMA journal_mode = WAL` must be applied to the SQLite
// file once via the sqlite3 CLI; SQLite persists the journal-mode setting
// across connections. See IMPLEMENTATION_PLAN.md -> Batch C C-C2.