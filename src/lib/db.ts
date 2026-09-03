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
// They cannot be set through `$executeRaw`: Prisma rejects `PRAGMA <set>`
// statements that resolve to result rows ("Execute returned results").
//
// CORRECTED in Batch 2.3 (C-19): the conclusion previously drawn from that —
// that `PRAGMA journal_mode = WAL` therefore had to be applied with the
// sqlite3 CLI — was wrong, and it is why nothing ever applied it. The pragma
// answers with a row, so it is a *query*: `$queryRawUnsafe` runs it fine.
// See `src/lib/db-pragmas.ts`, applied once at startup from
// `src/instrumentation.ts`. SQLite persists journal mode in the file itself,
// so it survives restarts and needs no external tooling.