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
- ~~After deploy (the production `start.sh` now runs `sqlite3 … "PRAGMA
  journal_mode=WAL"` at first boot, when the sqlite3 CLI is available).~~
  **CORRIGÉ 2026-09-05 (lot 7.1, DOC-02).** `start.sh` a été supprimé dans le
  commit `0aeea30` et n'a jamais été remplacé : pendant des mois, rien
  n'appliquait WAL. Depuis le lot 2.3 c'est **l'application** qui le fait, à
  chaque démarrage, depuis `src/instrumentation.ts` → `src/lib/db-pragmas.ts`.
  Aucun outil externe n'est requis et la CLI sqlite3 n'est plus nécessaire.
  **Le pragma est refusé — délibérément — si la base est dans un dossier
  synchronisé** (OneDrive, Dropbox, Google Drive, iCloud) : les fichiers
  `-wal`/`-shm` y sont corruptibles par l'agent de synchronisation. C'est le
  cas de l'installation actuelle, qui reste donc en journal rollback.
- After restoring a backup (the restored SQLite file is restored to whatever
  mode it was created with).

## Manual application — NOT ON THIS INSTALL

> **This section used to give `sqlite3 .\db\custom.db "PRAGMA
> journal_mode=WAL;"`. Struck 2026-09-11:** `db/custom.db` is the live till
> database and this repository sits under OneDrive. Running it would force WAL
> past the guard in `src/lib/db-pragmas.ts` that refuses it on a synced folder
> — the refusal this document explains fifteen lines above — and create the
> `-wal`/`-shm` pair that `scripts/apply-migration.ts` reads as « a process
> still has the database open » and refuses to run beside.
>
> **The application sets the pragma itself, at every boot.** There is nothing
> to apply by hand, on any install. If some *other* checkout ever needs it,
> name that checkout's file explicitly — never a relative `.\db\custom.db`,
> which resolves to production whenever the working directory is this
> repository.

## Verification — read-only, safe anywhere

```powershell
bun -e "const {Database}=require('bun:sqlite');const d=new Database(process.argv[1],{readonly:true});console.log(d.query('PRAGMA journal_mode').get());d.close()" .\db\custom.db
```

On this install the expected output is **`delete`** (rollback journal), not
`wal` — see the OneDrive refusal above. `wal` here would mean the guard has
been bypassed.

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