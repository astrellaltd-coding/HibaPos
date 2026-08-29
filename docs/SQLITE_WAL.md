# SQLite WAL Runbook

HibaPOS France uses SQLite for the local POS database. To keep concurrent
reader/writer throughput reasonable on busy shifts, the database file should
run in **WAL (Write-Ahead Log)** journal mode. WAL is a persistent file-level
setting that survives connection close/reopen, so it needs to be applied once
per database file.

## Why this is needed

- Default rollback-journal mode serializes readers against writers and
  throws `SQLITE_BUSY` immediately if a writer holds the lock.
- WAL allows one writer + many concurrent readers.
- The `?_busy_timeout=5000` query param applied via `DATABASE_URL` (see
  `.env.example`) makes SQLite wait up to 5s for a lock to be released before
  throwing `SQLITE_BUSY`.
- Prisma rejects `PRAGMA journal_mode = WAL` via raw query helpers (`$executeRaw`
  and `$queryRaw`) because the statement resolves to a result row — see the
  comment in `src/lib/db.ts`. WAL must therefore be set OUT-of-band.

## When to apply

- After cloning a fresh checkout (the dev DB file may exist but is on default
  rollback journal mode).
- After resetting / dropping the local DB.
- After deploy (the production `start.sh` now runs `sqlite3 … "PRAGMA
  journal_mode=WAL"` at first boot, when the sqlite3 CLI is available).
- After restoring a backup (the restored SQLite file is restored to whatever
  mode it was created with).

## Manual application (dev)

```powershell
# Requires the sqlite3 CLI on PATH. On Windows install via scoop:
#   scoop install sqlite
# Or via Chocolatey:
#   choco install sqlite
sqlite3 .\db\custom.db "PRAGMA journal_mode=WAL;"
```

Output: `wal` — the setting is persisted.

## Verification

```powershell
sqlite3 .\db\custom.db "PRAGMA journal_mode;"
# Expected output: wal
```

You should also see two auxiliary files next to the DB once WAL is active:

- `db/custom.db-wal` — write-ahead log
- `db/custom.db-shm` — shared memory index

These are SQLite-managed; do not delete them while the server is running.

## Notes

- WAL has minor quirks: the `-wal` file is checkpointed lazily. If the DB
  process is killed mid-write, on next open SQLite automatically replays the
  WAL — no data loss.
- Backups use `VACUUM INTO` which produces a consistent snapshot regardless
  of WAL state (so WAL is safe to leave on when running backups).
- If you ever need to downgrade the journal mode (e.g. some pre-WAL sync
  tool refuses to copy the auxiliary files):

  ```powershell
  sqlite3 .\db\custom.db "PRAGMA journal_mode=DELETE;"
  ```