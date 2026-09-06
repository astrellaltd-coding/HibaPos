# HibaPOS France — Windows deployment guide

Running and deploying **HibaPOS France** on the restaurant's Windows all-in-one.

> **Read the ordering rule first, because one step in it cannot be undone.**
> Batch 8.0 empties the fiscal journal of the development trading still in the
> database, and it **can only run before the restaurant's first real sale**.
> After that the journal is append-only and clearing it would be exactly the
> deletion `docs/attestation-conformite.md` states is impossible.
>
> ```
> install  ->  commission the printer  ->  demo / test  ->  8.0 reset
>          ->  arm FISCAL_CHAIN_KEY    ->  restart      ->  first real sale
> ```
>
> **Anything rung up before 8.0 must have FACTICE switched on** (Réglages →
> mode simulation). It does *not* keep the sale out of the journal — nothing
> can, and a mode that could would be a fraud tool — but it stamps the ticket
> *FACTICE — SIMULATION / TICKET NON VALABLE* and flags the journal row, so
> 8.0 deletes it cleanly and no test ticket can ever be mistaken for a real one.

---

## 1. Prerequisites

- **Bun** — and where it is installed matters. The server runs as a Scheduled
  Task under `SYSTEM`, which does not see a per-user install
  (`%USERPROFILE%\.bun`, `%APPDATA%\npm`). Install it machine-wide, or run the
  installer with `-ServerAccount <compte>`. `install-windows.ps1` checks this
  and warns.
- **Microsoft Edge** — ships with Windows 10/11.
- A `.env` file — copy `.env.example` and fill it in.

## 2. Installing

```powershell
# 1. See what it would do. Changes nothing.
powershell -ExecutionPolicy Bypass -File .zscripts\install-windows.ps1

# 2. Do it.
powershell -ExecutionPolicy Bypass -File .zscripts\install-windows.ps1 -Apply
```

It creates `C:\HibaPOS\data`, moves the database, backups, fiscal archives and
product images there, and registers two Scheduled Tasks. Useful switches:
`-DataDir <path>`, `-ServerAccount <compte>`, `-SkipTasks` (move the data and
register nothing).

**It copies, verifies and renames the source aside — it never deletes.** The
database is checked by SHA-256 and directories by file count; the old copies
stay as `custom.db.moved-<timestamp>` until you remove them by hand.

Then, by hand:

1. **Edit `.env`:**
   ```ini
   HIBAPOS_DATA_DIR=C:\HibaPOS\data
   DATABASE_URL=file:C:\HibaPOS\data\db\custom.db?_fk=1&_busy_timeout=5000
   BACKUP_LOCATION=<a SECOND physical volume — not this disk>
   ```
2. **Reboot** and confirm the till comes up with nobody touching it.
3. **Install the app**: open it, then Edge menu → *Installer HibaPOS*. That
   gives a desktop icon, a Start Menu entry and a window with no address bar.
4. **Réglages**: printer IP, `printerEnabled`, receipt width, and **FACTICE on**
   for any testing.
5. **Auto-login** (optional): run `netplwiz` and untick *Users must enter a user
   name and password*. **Do not use the `AutoAdminLogon` registry key — it
   stores the password in clear text.** Note that this only skips the *Windows*
   sign-in; the HibaPOS staff PIN is unaffected and still required, which is
   what puts a `userId` on every fiscal event.

## 3. What starts what

| Task | Trigger | Runs as | Why |
|---|---|---|---|
| **HibaPOS Server** | At startup | `SYSTEM` | So a power cut recovers with nobody signed in. Restarts 3× at 1-minute intervals on failure — Task Scheduler *is* the supervisor, which is why no nssm/WinSW is shipped. |
| **HibaPOS Kiosk** | At log on | the logged-in user | A browser needs a desktop session, so it cannot start earlier. Waits for the server to answer `/api` before opening, so the first thing on the till is never a connection-refused page. |

The server logs to `C:\HibaPOS\data\logs\server.log` — **with the data, not with
the install**, so an update cannot take the evidence of the last crash with it.

### The launcher refuses to start in two cases, on purpose

- **No database at `DATABASE_URL`.** It will not create one. A database created
  on a mistyped path would be empty, with an empty fiscal journal, numbering
  restarting at 1 and the PINs published in this repository — while the real
  one sat untouched somewhere else (L-59).
- **Pending migrations.** A schema mismatch fails at query time, mid-sale, in
  front of a customer. Better to stop here. Applying migrations automatically at
  boot was considered and rejected: on this project `migrate deploy` against
  production is a deliberate act, rehearsed on a copy and backed up first.

Both write to the log and exit non-zero, so the task shows a failure rather than
a green tick over a dead till.

## 4. Updating

```powershell
powershell -ExecutionPolicy Bypass -File .zscripts\update.ps1          # dry run
powershell -ExecutionPolicy Bypass -File .zscripts\update.ps1 -Apply
```

Back up → stop → update code → **migrate** → build → start → verify. Migrations
run *before* the build so a failure leaves the old code on disk and the old
server one `Start-ScheduledTask` away.

**It never touches the data directory** — no `Remove-Item`, no `git clean`.
Use `-NoGit` when the code arrives as a zip rather than through git.

Afterwards, signed in, check `GET /api/fiscal/verify`: all four chains `ok`, and
**`grandTotal` identical to its value before the update**. The perpetual total
must never return to zero, including across software updates — that is what the
attestation claims.

## 5. Database and secrets

```ini
DATABASE_URL="file:C:\HibaPOS\data\db\custom.db?_fk=1&_busy_timeout=5000"
SESSION_SECRET="…32+ chars…"
BACKUP_ENCRYPTION_KEY="…32+ chars…"
```

The database is **not** created automatically any more; `install-windows.ps1`
is the only path that puts one in place.

> **Corrected 2026-09-05 (batch 7.1, DOC-03).** This section used to say the
> database initializes "in SQLite WAL mode on first launch". Both halves were
> wrong. Initialization only happened when the file was **absent**, and nothing
> applied WAL at all until batch 2.3 moved the pragma into the application
> (`src/lib/db-pragmas.ts`, run from `src/instrumentation.ts` at every start).
>
> **Measured 2026-09-06 (batch 1.4):** WAL is refused on a cloud-synced path,
> which is why the current install — inside a OneDrive-synced Desktop folder —
> has byte 18 of the database at `01` (rollback journal). A copy of the same
> database under `C:\HibaPOS\data` came up at `02` (WAL). **So moving the data
> is what turns WAL on**; it is not a separate step. Verify with
> `PRAGMA journal_mode` rather than trusting this file.

## 6. Development scripts

```powershell
powershell -ExecutionPolicy Bypass -File .zscripts\dev.ps1     # dev server
powershell -ExecutionPolicy Bypass -File .zscripts\build.ps1   # prisma generate + next build
powershell -ExecutionPolicy Bypass -File .zscripts\start.ps1   # manual foreground start
```

`start.ps1` is for a manual start on a development machine. The till uses
`hibapos-server.ps1` through Task Scheduler.

## 7. If you edit these scripts

**Save them as UTF-8 *with* a BOM, and keep them ASCII.** Windows PowerShell 5.1
reads a BOM-less `.ps1` as ANSI, so a typographic dash (`—`) inside a string
arrives as three characters, one of which is a smart quote — which PowerShell
honours as a string delimiter. Three of these scripts failed to parse on first
write for exactly that reason. The French messages here are deliberately written
without accents. `src/lib/deployment.test.ts` asserts both properties.
