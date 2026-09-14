# HibaPOS France — CURRENT BASELINES

**Re-measure before trusting any of these.** Every figure here is a measurement with a date,
not a fact. The row is responsible for saying when it was taken; where one does, believe the
row and not the line at the top.

---

## Why this file exists, and why it is not in the plan

It was **§ 4 of `REMEDIATION_PLAN.md`** until 2026-09-12, and it moved for the same two
reasons `docs/INVARIANTS.md` did on 2026-09-11:

1. **It is not outstanding work.** `REMEDIATION_PLAN.md` holds what is still to do. A table of
   measurements is not a task, and its own heading tells you to re-measure it rather than act
   on it.
2. **The plan has a 40 960-byte ceiling**, deliberately, so a session can read it in one pass
   before touching anything. This section was **5 997** of those bytes and growing — it grew
   again on 2026-09-12 when the audit's seven independent readings were recorded — and it was
   crowding the thing the ceiling exists to protect. The immediate cause of the move was the
   audit's twenty batch rows entering § 6, which did not fit otherwise.

**Read `REMEDIATION_PLAN.md` for what is outstanding, `docs/INVARIANTS.md` for the rules that
never expire, and this file for what the numbers were last time somebody looked.**

---


*Re-measured **2026-09-12 at the audit's consolidation**, and again by each of the six passes
at their own times that day: **every figure in this table held, in all seven readings**, and
the production sha256 and mtime did not move once. The only variation is the `expect()` total,
4454–4473 across seven runs, which the Tests row already predicts. Wall time ran 155 s to
364 s — the 4× spread that row warns about, confirmed again. Previously re-measured on
**2026-09-11 at 15:50**; every figure was confirmed unchanged from the
13:55 reading except the test counts, which R7.1 moved. **The e2e row carries its own older
date.** Each row is responsible for saying when it was taken; where one does, believe the
row, not this line.*

| Thing | Value |
|---|---|
| Tests | **1382 pass, 0 fail**, 114 files. **Wall time varies by 4x on the same tree — 135 s to 510 s observed**; not a regression signal, do not chase it. The `expect()` total drifts a little between runs too (**4467** observed). `typecheck` and `lint` clean. **Zero `prisma:error` blocks** in a clean run, down from twelve (R4.3 + R4.6). **Nothing pins this table** — `readme-counts.test.ts` reads `README.md` and only `README.md`, so it pins the same 1382 *there*; the 114 is pinned nowhere. If these drift, no test fails. Re-measure. |
| e2e | **13 passed** (measured 2026-09-07, not re-run since). `bun run test:e2e` is **safe** — see § 5. |
| Production DB | sha256 `14ebf310be14c24f117a53a43d6c8569ec1f4315a68ea7e2eac07c1b07a18f45`, 884 736 bytes, app stopped — **re-measured 2026-09-14**, after a fresh backup was taken. *(It was `44a45a71…` from 2026-09-13 until then. **The sha moved because taking a backup records itself**: `createBackup` writes a `Backup` row and its `BACKUP_CREATED` audit entry into this database. Two rows, no trading data, and the operator asked for the backup — but `CLAUDE.md` reserves writes to this file, so it is recorded rather than left to be noticed.)* Every trading table is still at zero and `FiscalCounter` is still `0/0/0/0`, re-checked after the write; catalogue unchanged at 84 products in 14 categories. **The SIZE has never moved across five schema changes and now a row insert — do not use it as a check.** |
| How to check it | **A sha is only a baseline while nothing is running** — a signed-in session still writes `Session.lastActivityAt`, at most once a minute since R4.6. If the app may be up, check *structure*, not the hash. **File SIZE is not evidence**: an `ADD COLUMN` leaves it unchanged, measured. The sha256, the mtime and `PRAGMA schema_version` are what move. |
| Trading tables | **All zero.** Order, OrderItem, Payment, Receipt, Refund, Shift, ZReport, FiscalEvent, GrandTotal, DailyClose, MonthlyClose, AnnualClose, CashMovement, Customer, Table. |
| Fiscal counters | `0 / 0 / 0 / 0` (receipt / shift / Z / event). Journal **empty**. |
| Fiscal chain | **Empty and UNKEYED**, which is correct here. Arming is R6.2, after R6.1's reset and never before. |
| Catalogue | **84 products in 14 categories.** **9 menus composés · 25 slots · 9 whitelist rows · 7 option rules.** 17 active drinks in `Canette`/`Bouteilles`, all resolving to 5,5 % à emporter and 10 % sur place. **NO two products share a name** since R7.2 (2026-09-11) — the three pairs became `Coca`/`Coca 1.5L`, `Fanta`/`Fanta 1.5L`, `Orangina`/`Orangina 1.5L`. **Longest name 26 characters**, against the 36 at which a ticket line would wrap. **80 products on the till grid**: 84 less the 3 hidden components R3.3 created (`showOnPos = 0`) and `5 nuggets test`, which is still `active = 0` (L-81). **0 names carry stray whitespace** since R4.4. |
| Accounts | Two: `manager` (MANAGER) and `admin` (SUPER_ADMIN, the developer's). `CASHIER` was removed from the product. Both must re-enter their own PIN for a discount above 20 % and for **every** refund. |
| Journal mode | `delete`, not WAL — the guard refuses WAL on this OneDrive path, deliberately. It will switch to WAL the first time the database sits under a non-synced root. |
| Settings | `factice=true`, `printerEnabled=true`, `printerHost=""`, `businessDayCutoffHour=5`. **`printerConnection` and `printerQueue` are both absent**, so BOTH come from `DEFAULT_SETTINGS` — and since 2026-09-11 that means **`usb`**, not `network`. So production's effective connection is already USB and a print attempt now answers *« Choisissez l'imprimante Windows »* instead of *« Renseignez l'adresse IP »*, which was never an answer available to this restaurant. **Only the queue is left**, and that is R6.4. |
| Backups | **THREE verified restorable backups**, the newest taken **2026-09-14** and **decrypted to verify, not assumed**: `hibapos-backup-2026-09-14T09-35-01-374Z.dbenc`, 741 420 bytes, plaintext sha256 `df8abe7b60c1328fb219eba817952b7e2de4b0f813c5e8d631f71df5cf58c273` — re-opened, confirmed to carry the `SQLite format 3` header, and its decrypted sha matched the recorded checksum exactly. It **reuses** the existing media archive (`hibapos-media-4b5ed80dca201113.enc`, 49 129 786 bytes): the images have not changed since 2026-09-11, and the archive is content-addressed, so one copy backs all three. The two earlier ones (2026-09-10, 2026-09-11) are kept — retention is 30 and nothing was pruned. |
| ⚠ Backup gap | **CLOSED 2026-09-14 for the schema half, still open for the sync half.** A fresh backup now exists at the current schema — the previous two predated four schema changes and would have restored a database at `schema_version` 171. **What is NOT confirmed is that it has left the machine**: the folder is inside OneDrive so it should sync, and whether OneDrive is actually running is the operator's to check. A copy on the same disk as the database is not a backup (C-06), which is why `BACKUP_LOCATION` exists at all. |
| Other copies | `../db-snapshots/` holds **15 plaintext databases**, 12 MB: 14 loose snapshots plus `real-data.db` in `real-data-backup.pre-cents-port.2026-09-01T17-13-56Z/`, which still carries a `-wal`/`-shm` pair. Also `r31-acceptance/`'s fingerprints. *(This row inventories every unencrypted copy of real catalogue data on this disk; it said 13 until 2026-09-11.)* The newest, `custom.db.before-20260911160000_zreport_given_away-2026-09-11`, is R7.1's restore point — sha256 `c265e6ff…25ea28`, the last pre-migration state. **Keep it.** `r71-acceptance/` holds only fingerprints; its rehearsal copy was deleted. `../HibaPOS-docs-archive/` holds **three** files: the two R0.3 would have destroyed, plus a `README.md` mapping which runbook sections are live. **Read it before Phase 6, not the runbook cold** (§ 1). |

---

