import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

// L-61 (Batch 2.5) — the cache is UNCONDITIONAL, and the production exclusion
// that used to be here is what broke the restore.
//
// The line read `if (process.env.NODE_ENV !== "production") globalForPrisma
// .prisma = db;` — the standard Next.js guard against hot-reload piling up
// clients in dev. In production it left nothing sharing the instance, and Next
// bundles server code per entry point: `instrumentation.ts` gets one module
// instance of this file and the route handlers get another. Measured on the
// production build, one process, two constructions — one before "Ready" (the
// startup pragma hook) and one on the first request.
//
// Two clients means two open handles on the same SQLite file, and that defeats
// exactly one operation: `restoreBackup` calls `db.$disconnect()` and then
// renames a file over the live database. Windows refuses to replace a file
// another handle has open, so the restore died with `EPERM` — the recovery
// path for a fiscal database, failing on the platform it runs on (L-61).
//
// Caching in production is also simply correct: a second client is a second
// connection pool nobody asked for. The dev-only form existed to stop hot
// reload leaking clients, and an unconditional cache stops that too.
globalForPrisma.prisma = db;

// CORRECTED 2026-09-14 (R10.1 / L-164). THIS SAID THE DATABASE_URL PARAMETERS
// SET THE PRAGMAS. **Prisma ignores both**, and sets the same values itself.
//
// Probed against a throwaway database: no parameters at all →
// `foreign_keys = 1, busy_timeout = 5000`; `?_fk=1&_busy_timeout=5000` →
// identical; **`?_busy_timeout=99999` → still 5000.** So the query string
// changes nothing, and the old comment stated a causal mechanism that does not
// hold — anyone raising `_busy_timeout` for a slow disk would have changed
// nothing and believed they had.
//
// The values are right; only the explanation was wrong:
//   - `foreign_keys = ON`   — defence in depth, and what makes a `Restrict`
//                             violation actually throw (L-154's whole subject)
//   - `busy_timeout = 5000` — SQLite waits up to 5 s on lock contention rather
//                             than throwing SQLITE_BUSY immediately
//
// Both come from Prisma's own SQLite connector. Changing either means changing
// Prisma's configuration, not the URL. The query string still ships in
// `DATABASE_URL` and in `.env.example`; removing it changes nothing (measured)
// and is a separate decision from correcting this comment.
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