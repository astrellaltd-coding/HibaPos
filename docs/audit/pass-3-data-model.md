# PASS 3 — Data model, migrations and integrity

**Read-only audit, 2026-09-12.** One of six focused passes, the last look at the project
before Tauri v2 planning. Nothing in this pass was fixed, committed, or applied. The only
file written is this one.

**Scope:** `prisma/schema.prisma` against the 15 migrations and against the code that uses
it; the startup migration gate (`src/lib/services/startup-migration.ts`) read as an
adversary; `restoreBackup`'s compatibility check.

**Numbering:** `pass-2-security.md` had already claimed **L-89 … L-100**, so this pass
starts at **L-101**. Checked by reading only the id tokens out of that file, not its
findings — the overlap the operator expects is resolved at consolidation, but a *number*
collision is pure friction and was cheap to avoid.

---

## 0. Baseline — re-measured, not carried forward

Everything § 4 of the plan asks to be re-measured, measured today. **No drift.**

| Thing | § 4 says | Measured 2026-09-12 | |
|---|---|---|---|
| Tests | 1382 pass / 0 fail / 114 files | **1382 pass / 0 fail / 114 files**, 360.41 s, 2 snapshots | ✅ |
| `expect()` calls | 4467 observed, "drifts a little" | **4473** — inside the stated drift | ✅ |
| `prisma:error` blocks | zero in a clean run | **zero** (`grep -c` on the full run) | ✅ |
| typecheck · lint | clean | **both exit 0** | ✅ |
| Migrations | 15 applied, none pending | **15 applied, 15 on disk, none pending, none rolled back, all `finished_at` set** | ✅ |
| `_prisma_migrations` checksums | *(not in § 4)* | **15 of 15 match sha256 of the file on disk; 0 drift; no recorded migration absent from disk** | ✅ |
| Trading tables | all zero | **all sixteen of `DELETION_ORDER` at zero** | ✅ |
| Fiscal counters | 0 / 0 / 0 / 0 | **0 / 0 / 0 / 0**, journal empty | ✅ |
| Catalogue | 84 products, 14 categories, 80 on the grid | **84 / 14 / 80** | ✅ |
| Duplicate names | none since R7.2 | **none** | ✅ |
| Column counts | Product 18, OrderItem 18, ZReport 28 | **18 / 18 / 28** | ✅ |
| `schema_version` | 171 | **171** | ✅ |
| `integrity_check` · FK errors | ok · 0 | **ok · 0** | ✅ |
| Journal mode | `delete`, not WAL | **`delete`** | ✅ |

Read with `bun:sqlite`, `readonly: true`. The database was never opened for writing and the
app was not started — this pass did not need it.

### The three structural checks § 4 does not carry

These are the pass's own, and all three came back clean:

1. **The 15 migrations replayed from nothing produce the live schema exactly.** Applied
   every `migration.sql` in order into a fresh scratch database and diffed tables, columns,
   column types, NOT NULL, defaults, primary keys and indexes against `db/custom.db`:
   **33 tables, 33 tables, 0 differences.**
2. **`schema.prisma` matches those migrations exactly.** Parsed all 33 models and compared
   every scalar field against the replayed schema, both directions, including nullability:
   **0 issues.** So there is no column the code writes that no migration created, and none
   the reverse.
3. **Declared indexes and physical indexes agree exactly.** Every `@@index`, `@@unique` and
   field-level `@unique` has a physical index; every non-automatic physical index is
   declared. **0 undeclared, 0 missing.**

Also checked: every `$queryRaw*` / `$executeRaw*` call site in `src/` and `scripts/`
(31 of them). None writes a column. They are `PRAGMA`s, `VACUUM INTO`, `sqlite_master`
introspection, and two name-only `UPDATE`s. And `catalogue-transfer.test.ts:182` already
pins `CATALOGUE_TABLES` against `PRAGMA table_info` for all ten catalogue tables, so the
export's hand-maintained column list cannot go stale silently.

**The data model itself is in good order.** Everything below is about what happens at the
edges: a category save, a migration that does not finish, a restore measured against the
wrong yardstick.

---

## 1. CONFIRMED findings

Ranked by what could lose money or corrupt the fiscal record, not by count.

| id | sev | file:line | what is wrong | how established | cost to fix |
|---|---|---|---|---|---|
| **L-101** | **High** | `src/app/api/catalog/categories/[id]/route.ts:147` | **Saving a category silently destroys the menu option rules that depend on it.** The PUT replaces option groups wholesale — `categoryOptionGroup.deleteMany({categoryId})` then re-`create` with fresh cuids. `ComboSlotOptionRule.categoryOptionGroupId` is `onDelete: Cascade`, so every rule pointing at those groups is deleted with them. No error, no warning, no audit line naming it: `CATEGORY_UPDATED` records the category name and nothing else. All **7** live `ComboSlotOptionRule` rows hang off one group, `Pizzas → Taille`. Losing them means Menu Chill / Menu Eco / Menu XXL stop fixing their pizza size, so (a) the cashier is asked the size again *inside* the menu and can ring a Junior in an XXL, and (b) `componentReferencePrice` loses the pinned choice, which changes the allocation weight and therefore the 10 % / 5,5 % split booked on every menu sale. | Read the route and the client. **The client always sends `optionGroups`** — `categories-view.tsx:351` builds the array unconditionally on every save, and never sends ids, so even a GET→PUT round trip with no edits triggers it. Proved the cascade actually fires, on a scratch copy with `PRAGMA foreign_keys=ON` (which is what production runs — see the note under § 3): the delete **succeeded** and took group, choices and rule with it; the `RESTRICT` on `categoryOptionChoiceId` never fired because the rule row was already gone. Live data read read-only: 7 rules, all on `Pizzas → Taille`, all with a non-null pinned choice, and that group's three choices carry absolute prices (Junior 8,90 / Senior 11,90 / Mega 15,90 à emporter), so the weight really does move. **No test covers it** — `catalog-payload.test.ts` pins the C-24 validate-before-delete rule and the "absent means leave alone" rule, neither of which is this. | Medium. The honest fix is to stop replacing groups wholesale — match incoming entries by id and update in place — which is a real change to a route that C-24 already had to harden once. A cheap interim: refuse the delete when a `ComboSlotOptionRule` depends on a group being removed, and say which menu. Either way it needs the operator's call, because the current behaviour is what the editor has always done. |
| **L-102** | **High** | `src/lib/services/startup-migration.ts:86` | **A migration that failed or was interrupted is counted as applied.** `appliedMigrations()` filters on `rolled_back_at IS NULL` and never on `finished_at IS NOT NULL`. Prisma writes the `_prisma_migrations` row *before* running the SQL and stamps `finished_at` only on success, so a power cut on the till, a killed process, or a `deploy` that errors leaves a row that this query reads as applied. Two consequences, and the second is worse than the first. **(a) Next boot:** `pendingMigrations()` returns empty → the gate returns `UP_TO_DATE` at `:208` → no backup, no deploy, and `instrumentation.ts` has no log branch for `UP_TO_DATE`, so **nothing is recorded anywhere**. The app serves against a half-applied schema. **(b) Same run:** `stillPending` at `:249` is computed by the same query, so it is empty even when the deploy failed — and `PRAGMA integrity_check` returns `ok` and `foreign_key_check` returns empty for a missing column, because neither is a corruption. The gate therefore returns **`APPLIED`** and `instrumentation.ts:53` logs *« Applied N migration(s) behind verified backup »*. This is the exact failure the gate was built to prevent, reported as success. | Read the SQL. Confirmed `finished_at` is nullable in the live `_prisma_migrations` DDL. Ran the gate's **verbatim** query against a synthesised migration table on a scratch database, for both shapes (killed mid-run, and `deploy` failed with `logs` written): both report **15 of 15 applied, pending empty, verdict `UP_TO_DATE`**, where a `finished_at`-aware query correctly reports the migration as pending. Read `startup-migration.test.ts`: **all three** insert sites use `finished_at = current_timestamp`, so no test has ever built the NULL state. Partial application is genuinely reachable rather than theoretical: Prisma's SQLite migrations are not wrapped in one transaction — this repo's own generated `RedefineTables` blocks depend on `PRAGMA foreign_keys=OFF` taking effect, which it cannot inside a transaction. *(That last clause is inference from the migration files, not a measurement.)* | Small to write, **not small to decide**. `AND finished_at IS NOT NULL` is one clause. But it changes behaviour: a failed migration then becomes *pending*, and the gate would retry it behind a fresh backup. Whether retrying a migration that already failed once is right, or whether the gate should instead refuse and name the row, is the operator's call. Add a test that builds a NULL-`finished_at` row either way. |
| **L-103** | **High** | `src/lib/services/startup-migration.ts:243, 265` | **`deploy()` reporting failure is never a condition.** `const applied = await deps.deploy()` is used in exactly one other place — the ternary at `:265` that decides whether to append the process output to a failure message. `applied.ok === false` never causes a failure verdict on its own. The gate's entire defence against a bad deploy is the three database checks at `:249-253`, and per L-102 the first of those cannot see a failed migration while the other two cannot see a missing column. So `bunx` not being present in a Tauri bundle, a non-zero exit, a crashed CLI — all produce `status: "APPLIED"`. | Read `startup-migration.ts:243-269`; `grep -n "applied"` returns exactly the assignment and the ternary. `grep -c "ok: false"` on `startup-migration.test.ts` returns **0** — no test ever drives the deploy dependency to failure. Note this is the *inverse* of the case PREP-4 does cover: its test makes `deploy` lie *positively* (`ok: true`, changed nothing). Deploy failing *honestly* is the gap. | Small. `if (!applied.ok)` → `FAILED_AFTER_MIGRATE`, plus one test. This one is a genuine one-liner; unlike L-102 it needs no decision, because a deploy that says it failed should never be reported as applied. |
| **L-104** | Medium | `src/lib/services/aggregate.ts:497` · `:572` · `src/lib/services/receipt.ts:31` | **A null `OrderItem.vatRate` is silently booked at 10 %.** The column is nullable (`schema.prisma:602`) and its comment says only *« snapshot of VAT rate at time of sale »* — **what null means is written down nowhere**. Three readers, all in the money path, default it: `item.vatRate ?? 10`. That figure flows into the printed ticket's VAT table, into the order's VAT breakdown, and therefore into the Z report and every close built on it. 10 % is the food rate; a drink à emporter is 5,5 %. The default is not conservative in either direction — it over-declares a 5,5 % line and under-declares a 20 % one. It also contradicts two principles this schema states explicitly about its own nullable columns: `referencePrice` — *« Null is the statement. Never backfill it, never default it to 0 »* — and `perpetualSalesTotal` — *« a fiscal document must not carry a figure that was never measured »*. | Read the three sites. Not reachable from the current checkout: `checkout.ts:85` types `vatRate: number` and `:240` always writes it, so nothing in the app writes a null today. It becomes reachable through a restore of an older database, a hand edit, or any future writer — and the column's nullability is the only thing standing between those and an invented rate on a fiscal document. **No test pins the `?? 10`** (`grep "?? 10"` across all `.test.ts` returns nothing). | Small, but it is a decision. Either document what null means and keep the default, or make the readers refuse a null line loudly. Given the two invariants above, refusing looks more consistent than defaulting — but `receipt.ts` renders a ticket and *« printing must never lose a sale »*, so the ticket and the aggregation may want different answers. Worth one line in `docs/INVARIANTS.md` whichever way it goes. |
| **L-105** | Medium | `src/lib/services/startup-migration.ts:70` | **The gate finds its migrations relative to the working directory, and answers `UP_TO_DATE` when it cannot find them at all.** `path.resolve("prisma/migrations")`, and `migrationsOnDisk()` returns `[]` when the directory is absent. Nothing distinguishes *« nothing is pending »* from *« I could not see the migrations »*, and `UP_TO_DATE` is the one status `instrumentation.ts` does not log. This is three different anchors in one function: the migrations come from `process.cwd()`, the lock from `dataDir()` (`HIBAPOS_DATA_DIR`, else cwd), and the database from `DATABASE_URL`. Today all three coincide by accident. A Tauri bundle, a Windows service, or a shortcut with the wrong *Start in* separates them. | Read `migrationsOnDisk()` and traced the return path to `:208`. Read `instrumentation.ts:52-63`: branches exist for `APPLIED`, `REFUSED_NO_VERIFIED_BACKUP`, `FAILED_AFTER_MIGRATE` and `SKIPPED_NO_MIGRATION_TABLE` — none for `UP_TO_DATE`. Confirmed the three anchors from `paths.ts:40-43` and `.env`. | Small. Distinguish the two cases — a `MIGRATIONS_NOT_FOUND` status, or refuse when the directory is missing — and resolve the path from a known root rather than the cwd. Genuinely a Tauri-phase decision about where the bundle puts `prisma/migrations`, so it may be better answered there than patched here. |
| **L-106** | Medium | `src/instrumentation.ts:65` | **The gate's most dangerous branch has its weakest reporting.** `runStartupMigrationGate` has no `catch` around steps 2 and 3 — only `try { … } finally { releaseLock() }`. A throw from `pendingMigrations()`, `PRAGMA integrity_check` or `PRAGMA foreign_key_check` escapes the function, so `lastResult` is never assigned and `lastMigrationGateResult()` keeps its previous value (null on a first boot). The caller catches it and writes `console.error` **only** — no `logTechnical`, unlike every other failure path, which all get an `ERROR` row. This is precisely where *« the backup succeeds but the disk fills during the migrate »* lands: `SQLITE_FULL` on the verification queries throws, and the operator's only trace is stdout, which in a packaged Tauri app is nowhere. A health route asking `lastMigrationGateResult()` would answer that nothing happened. | Read `startup-migration.ts:218-272` (no `catch`, only `finally`) and `instrumentation.ts:49-66`. Compared against the `REFUSED_NO_VERIFIED_BACKUP` / `FAILED_AFTER_MIGRATE` branch at `:58-60`, which does call `logTechnical`. The secret-bootstrap catch at `:38` has the same shape, with less at stake. | Small. Wrap steps 2–3, `record()` a failure status, and log it like the others. The wrinkle: `logTechnical` writes to the database, which is the thing that may be failing — so the fallback needs to survive that, which argues for keeping `console.error` **and** adding the row rather than swapping one for the other. |
| **L-107** | Medium | `src/lib/services/startup-migration.ts:146` | **The lock protects the data directory, not the database.** `lockPath()` is `dataDir()/db/migrate.lock`, where `dataDir()` is `HIBAPOS_DATA_DIR` or `process.cwd()`. The database is wherever `DATABASE_URL` points. Two installs sharing one database file — a share, a mapped drive, two Tauri installs pointed at a common data folder — take **two different locks** and both migrate the same file concurrently. The comment above `takeLock()` argues correctly that *« two workers booting together would both migrate »*; the mechanism it chose only covers two workers in the same install. Secondary, and true of this machine today: `HIBAPOS_DATA_DIR` is unset, so the lock is created at `…/OneDrive/Desktop/Work/HibaFood/The App/db/migrate.lock` — inside OneDrive. `db-pragmas.ts` already refuses WAL on this path class deliberately; the lock has no equivalent guard, and a sync client that restores or holds the file open turns `releaseLock()`'s swallowed `unlinkSync` failure into a ten-minute block. | Read `lockPath()`, `dataDir()` (`paths.ts:40`) and `.env` (`DATABASE_URL` is an absolute path; `HIBAPOS_DATA_DIR` is absent, confirming `dataDir() === cwd`, which is under OneDrive). DD-06 (one till, loopback only) makes the shared-database case a Tauri-era risk rather than a live one. | Small: derive the lock from the resolved database path instead of from `dataDir()`. The ten-minute reclaim already bounds the stale-lock case, so this is about the shared-database case, which is really a packaging decision. |
| **L-108** | Low | `src/lib/services/backup.ts:551-613` | **`assertCompatibleSchema` measures the backup against the live database, not against the code.** Both `listTables(db)` at `:571` and `columnsOf(db, table)` at `:598` read the **running** database. The bar is therefore whatever the live schema currently happens to be — so a degraded live database silently accepts an equally degraded backup, and this composes with L-102: half-apply a migration and every subsequent restore is checked against the half-applied schema. Three further limits, all consequences of it being a **presence** check: it compares names only — not types, not NOT NULL, not defaults, and **not unique indexes**, so a staged file carrying `Order.number` / `FiscalEvent.sequence` / `ZReport.number` as ordinary columns without their unique index restores cleanly and the gapless-numbering backstop is gone; extra **tables** produce a `WARN` at `:616` while extra **columns** produce nothing at all, so a downgrade is entirely silent; and `_prisma_migrations` is excluded by name at `:562`, for a reason the comment states honestly, with the consequence that a backup whose migration history differs restores and hands the problem to the startup gate. | Read the function. The ordering around it is right and worth saying so: decrypt → checksum → compatibility → media → safety snapshot → swap (`:731-809`), so nothing irreversible happens before the check. The second-client-on-the-staged-file concern that INVARIANTS raises for `db.ts` is handled here — it is a separate client on a separate file, `$disconnect()`ed in a `finally`, and `renameWithRetry` covers the millisecond lag. A null `Backup.checksum` fails the `!==` comparison and refuses, which is safe by accident but safe. | Small for the parts worth doing: warn on extra columns as it already does on extra tables, and add the unique indexes to the comparison. Checking against the code's expected schema rather than the live one is a larger change and probably belongs with whatever the Tauri phase decides about schema identity. |
| **L-109** | Low | `prisma/schema.prisma:661` · `:1012` · `:1056` · `:1088` | **Four id columns carry no foreign key and, alone in this schema, do not say so.** Every other FK-less id here states the convention and the reason — `Refund.approvedById`, `Refund.shiftId`, `Order.discountApprovedById`, `Order.fiscalEventId`, `CashMovement.approvedById`, `Table.currentOrderId` and the four `fiscalEventId`s all read *« plain id, NO FK »* with a justification. `OrderItem.comboProductId` and the three `sealedById` columns on `DailyClose` / `MonthlyClose` / `AnnualClose` do not. For `comboProductId` the omission has a behavioural edge: `OrderItem.productId` is `SET NULL`, so deleting a product makes the identity genuinely *gone* and `productKey()`'s name fallback fires exactly as the invariant describes — but `comboProductId` has no FK, so deleting a menu leaves a **dangling** id, and `aggregate.ts:216`'s `item.comboProductId ?? item.comboName ?? groupId` keys under an id that resolves to nothing rather than falling back to the label. | Read every FK-less column in the schema and its comment. Confirmed the FK actions against `PRAGMA foreign_key_list` on all 33 tables. **The one deletion path that exists already guards it** — `scripts/delete-product.ts:109` refuses on `OrderItem.comboProductId` explicitly, and `:116-122` on the four sealed `topProductsJson` payloads — so this is latent, not live, and there are zero `OrderItem` rows today. The gap is that the guard lives only in that script and the schema does not record why. | Trivial for the comments. Whether `comboProductId` should become a real `SET NULL` FK is a genuine question for the Tauri phase, since the catalogue transfer moves product ids between installs. |
| **L-110** | Low | `prisma/schema.prisma` (indexes) · `src/lib/services/aggregate.ts:815` | **Three indexes serve nothing, and one range filter has no index.** Unused, established by reading every call site: `CashMovement(category)` — all five `cashMovement` queries filter by `shiftId` or `createdAt`, none by category; `Table(status)` and `Table(active)` — the only `db.table.findMany` has no `where` at all. **These two are adjacent to a Deliberately-retained item:** `tables-view.tsx` is unreachable by design under DD-09 and `table-withdrawal.test.ts` pins it, so the `Table` indexes are the residue of a withdrawn feature and should not be touched without reopening DD-09. `CashMovement(category)` is on nothing's retained list, but DD-12's whole argument for a fixed category list was *« how much went to suppliers this month »*, so the index anticipates a query the reports have not been given yet — it is speculative, not dead. Missing: `Refund.createdAt` is range-filtered by `periodOrdersWhere` (`aggregate.ts:815`) on **every** sales / VAT / cashier / product report, not only by the annual archive. `fiscal.ts:1119-1121` argues the absence deliberately — *« the table holds zero rows on production, an archive is built once a year »* — and that argument is sound for the archive and does not cover the reports. | Grepped every `findMany` / `count` / `aggregate` / `groupBy` call site on each table and read the `where` clauses. Cross-checked declared indexes against physical ones (0 discrepancies, § 0). | Trivial, and probably **do nothing**. Zero rows today; a fast-food refund table stays small for years. This is recorded so the next person does not re-derive it, not because it should be changed. |
| **L-111** | Cosmetic | `scripts/pre-golive-reset.ts:88` | **A comment in the irreversible script states the wrong FK reason.** *« Customer is the parent of Order.customerId and deleting it first is an FK violation, not a cascade. »* `Order.customerId` is `onDelete: SetNull`. Deleting a Customer first would not violate anything — it would succeed and null the links on every order. The **ordering is correct** and the outcome is unaffected (Orders are already gone by that point), but the stated reason is wrong, in the one script that runs once and cannot be undone, at exactly the line a future editor would read before reordering it. | Read the comment against the FK dump: `Order.customerId -> Customer.id SET NULL`. Verified the whole `DELETION_ORDER` respects the FK graph — Receipt/OrderItem/Payment/Refund → Order → Customer, ZReport/CashMovement → Shift, then the unreferenced tables. All sixteen at zero today. | Trivial — one sentence. It is a comment in a script only the operator runs, so it does not need its own batch; it should ride along with whatever next touches that file. |

---

## 2. SUSPECTED — could not be settled read-only

| # | file | the suspicion | why it is not confirmed | what would settle it |
|---|---|---|---|---|
| **S-1** | `startup-migration.ts:154` | The lock's exclusivity may not hold on the paths it will actually sit on. `writeFileSync(…, { flag: "wx" })` is `O_CREAT\|O_EXCL`, whose atomicity is not guaranteed over SMB/CIFS, and OneDrive's placeholder handling can both re-materialise a deleted file and hold one open. The lock is inside OneDrive on this machine today (L-107). | Needs a real share, or a second concurrent boot against a synced path. Neither is reachable read-only, and I would have had to start two servers to try. | Two processes racing the gate against a mapped drive, in the Tauri phase, when where the data lives is decided. |
| **S-2** | `schema.prisma` — `ZReport.topProductsJson`, `ZReport.vatBreakdownJson` | Both are **nullable**, while the same two columns on `DailyClose`, `MonthlyClose` and `AnnualClose` are **NOT NULL**. Nothing documents the asymmetry, and readers paper over it with `?? "{}"` / `?? "[]"` (`reports/z/route.ts:54-55`, `shifts/[id]/close/route.ts:95-96`). A Z report with a null breakdown would print an empty VAT table rather than refuse. | `generateZReport` (`reports.ts:233,248`) always writes both, so a null is not reachable today, and I could not produce one without writing a Z report. Whether the nullability is a deliberate legacy allowance or an oversight is not recorded anywhere I found. | Either a line in the schema saying what null means, or making them NOT NULL — but that is a migration on a fiscal table for zero rows, which is the sort of thing this project has correctly declined before. Worth an answer, not necessarily a change. |
| **S-3** | `catalogue-transfer.ts:177, 213` | The catalogue export stamps the migration it was taken under, and `importCatalogue` never compares it. An **older** export into a **newer** install would succeed and leave the new columns at their defaults — e.g. a catalogue exported before `showOnPos` existed imports with every product `showOnPos = true`, putting R3.3's three deliberately-hidden menu components back on the till grid. A **newer** export into an older install fails loudly (Prisma rejects the unknown column, and the import is all-or-nothing), which is the right way round. | The failing direction is safe; the silent direction requires an export file older than a migration, and no such file exists to test against. The column list itself is pinned by `catalogue-transfer.test.ts:182`, so the mechanism is sound — the question is only whether the stamp should be enforced. | Directly a Tauri question: § 1 says the plan is *« a FRESH install in France, retaining this catalogue »*, so this export/import **is** the carrying mechanism. Decide there whether a mismatched stamp refuses. |

---

## 3. What I could not settle without writing something

Stated plainly, because the brief asks:

- **S-1's lock race.** Would need two concurrent processes against a network or synced path.
- **Whether a partial migration is byte-for-byte what I modelled.** L-102 is proved by
  running the gate's own query against a hand-built `_prisma_migrations` state. I did not
  make a real `prisma migrate deploy` fail halfway, because that means writing a broken
  migration and running it. The inference that Prisma's SQLite migrations are not one
  transaction rests on this repo's own `RedefineTables` blocks depending on
  `PRAGMA foreign_keys=OFF`, which is a no-op inside a transaction — sound, but reasoning.
- **The disk-full path (L-106).** Reasoned from the absence of a `catch`, not reproduced.
  Filling a disk was not a proportionate thing to do on this machine.
- **Whether the gate works at all against a real pending migration.** Unchanged from what
  PREP-4 already wrote down: production is at 15 of 15 and nothing has ever exercised it.
  This pass did not change that, and L-102 and L-103 both live in the untested half.

**One thing I expected to find and did not**, recorded so nobody re-derives it: I suspected
that a fresh install generating its own `.env` might produce a `DATABASE_URL` without
`?_fk=1` and silently lose every `RESTRICT` guard. Probed Prisma 7.10.0 directly against a
scratch database with `?_fk=1`, with `?_fk=0`, and with no parameter at all: **`PRAGMA
foreign_keys` came back `1` in all three cases.** The engine enables it regardless, so the
comment at `db.ts:36` calling `?_fk=1` *« defense-in-depth »* is accurate and there is no
finding. Worth one line for Tauri: FK enforcement here rests on Prisma engine behaviour
that nothing in this repo controls or tests.

---

## 4. Proposed § 7 rows — for the operator to place, not for me

Compressed to the plan's format. The operator decides whether they go in, and where.

| ID | Severity | Finding | Owner |
|---|---|---|---|
| **L-101** | High | Saving a category through the admin editor silently deletes the `ComboSlotOptionRule` rows that depend on its option groups — `categories/[id]/route.ts:147` replaces groups wholesale and the FK is `Cascade`. All 7 live rules hang off `Pizzas → Taille`; losing them un-fixes the pizza size in Menu Chill / Eco / XXL and moves the reference price the VAT allocation divides by. Cascade proved to win over the sibling `RESTRICT` on a scratch copy. No test covers it. | none |
| **L-102** | High | `startup-migration.ts:86` counts a failed or interrupted migration as applied — it filters `rolled_back_at IS NULL` but never `finished_at IS NOT NULL`. Next boot reports `UP_TO_DATE` with no backup, no deploy and no log; within the same run it makes `FAILED_AFTER_MIGRATE` unable to fire on a partial migration, so the gate answers `APPLIED`. Proved with the gate's own query against a synthesised migration table. Fixing it is one clause but needs a decision: a failed migration then becomes pending and would be retried. | none |
| **L-103** | High | `startup-migration.ts:243` — `deploy()` returning `ok: false` is never a condition; `applied.ok` is used only to decide whether to append output to a message. A missing `bunx` in a Tauri bundle, a non-zero exit or a crashed CLI all produce `APPLIED`. No test drives the deploy dependency to failure. Genuine one-liner. | none |
| **L-104** | Medium | `OrderItem.vatRate` is nullable with no documented meaning for null, and three readers default it to 10 % — `aggregate.ts:497`, `:572`, `receipt.ts:31` — putting an invented rate on the ticket, in the VAT breakdown and in every close. Unreachable from the current checkout; contradicts the stated rules for `referencePrice` and `perpetualSalesTotal`. Unpinned by any test. | none |
| **L-105** | Medium | `startup-migration.ts:70` resolves `prisma/migrations` from the working directory and returns `UP_TO_DATE` when it cannot find it — the one status `instrumentation.ts` does not log. Three anchors in one function (cwd, `dataDir()`, `DATABASE_URL`) that coincide only by accident today. A Tauri-phase question. | none |
| **L-106** | Medium | `runStartupMigrationGate` has no `catch` around its verification queries, so a throw leaves `lastMigrationGateResult()` stale and `instrumentation.ts:65` writes `console.error` only — no `logTechnical`, unlike every other failure path. The disk-full-mid-migrate case lands here and leaves no trace a packaged app could show. | none |
| **L-107** | Medium | The migration lock is anchored to `dataDir()` (`startup-migration.ts:146`) while the database is at `DATABASE_URL`. Two installs sharing one database take two locks and both migrate. Also: with `HIBAPOS_DATA_DIR` unset the lock sits inside OneDrive, which `db-pragmas.ts` already refuses WAL on. | none |
| **L-108** | Low | `assertCompatibleSchema` (`backup.ts:571,598`) compares the backup against the **live** database rather than against the code, so a degraded schema lowers the bar — and it is presence-only: no types, no NOT NULL, no unique indexes, and extra columns are silent where extra tables warn. Composes with L-102. | none |
| **L-109** | Low | `OrderItem.comboProductId` and the three `*Close.sealedById` columns carry no FK and, alone in this schema, no *« plain id, NO FK »* note. `productId` is `SET NULL` so its identity→name fallback fires; `comboProductId` dangles instead, so `aggregate.ts:216` keys under an id that resolves to nothing. `scripts/delete-product.ts:109` already guards the only deletion path that exists. | none |
| **L-110** | Low | `CashMovement(category)`, `Table(status)` and `Table(active)` are read by no query. The two `Table` ones are DD-09 residue — do not touch without reopening it. Conversely `Refund.createdAt` is range-filtered by every period report via `periodOrdersWhere`, not only by the annual archive its code comment justifies. Recommendation: record it, change nothing. | none |
| **L-111** | Cosmetic | `pre-golive-reset.ts:88` says deleting `Customer` before `Order` would be *« an FK violation »*; it is `SET NULL`, so it would silently null the links. Ordering is correct, reason is wrong, in the script that runs once irreversibly. | none |

**Rediscovered and not re-reported:** none of § 7's nine turned up in this pass's scope.
L-84 borders L-101 (both are about a rule that holds in the interface and not underneath)
but they are different columns and different mechanisms, so L-101 is filed as new. L-75 and
L-05 are already carried to Tauri and § 5 below does not restate them.

---

## 5. What Tauri needs to know from this pass

The packaging phase inherits the data model in good order and the *migration machinery* in
worse order than the plan currently believes. Six things, in the order they will bite.

**1. The startup gate has never run against a real pending migration, and the first Tauri
update is that run.** PREP-4 said so itself. What this pass adds is that two of its
failure paths are wrong before it ever gets there: a partially-applied migration reports
`UP_TO_DATE` (L-102) and a failed deploy reports `APPLIED` (L-103). **Fix L-103 and decide
L-102 before the first packaged update ships**, not after. They are the difference between
*« the gate protected us »* and *« the gate told us it protected us »* — and this project's
own history is why that distinction has a rule written about it.

**2. `bunx prisma migrate deploy` inside a bundle is still unanswered, and the answer is
now worse than PREP-4 assumed.** Its left-behind note reasoned that if the CLI is missing,
*« deploy fails, the verdict comes back FAILED_AFTER_MIGRATE and the schema is untouched
behind a verified backup — which is the correct outcome »*. Per L-103 that is not what
happens: `deploy` failing produces `APPLIED`. The reasoning was right and the code does not
implement it. Either fix L-103, or make the gate prove the CLI exists before it takes the
backup.

**3. Three different roots, and packaging is where they come apart.** Migrations from
`process.cwd()` (L-105), the lock from `dataDir()` (L-107), the database from
`DATABASE_URL`. On this machine all three are the repo folder and everything works.
A bundle that puts the binary in `Program Files`, the data in `%APPDATA%` and the
migrations in a resource directory separates all three at once, and the failure is silent:
no migrations found reads as nothing pending. **Decide one root, resolve all three from it,
and make "I could not find the migrations" a distinct, logged status.** DD-02 is already
marked moot with *« where data lives is the Tauri phase's decision »* — this is the rest of
that decision.

**4. Where the data lives also decides the lock and WAL together.** § 4 records that the
journal stays `delete` because the guard refuses WAL on a OneDrive path, *« it will switch
to WAL the first time the database sits under a non-synced root »*. The migration lock sits
on the same path and has no such guard (L-107, S-1). Moving the data out of a synced folder
fixes both at once; leaving it in leaves both. One decision, two consequences.

**5. Restore compatibility is measured against the running database, not against the
shipped code (L-108).** For a single long-lived install that is nearly the same thing. For
a versioned installer it is not: v1.1 restoring a v1.0 backup, or v1.0 restoring a v1.1
one, are both ordinary events once there are versions, and today the second is completely
silent — extra columns produce no warning at all. Whatever Tauri decides about update
channels should decide at the same time what a backup is allowed to be restored *into*.

**6. The catalogue transfer is the thing that carries this restaurant's real work to
France, and it does not check its own version stamp (S-3).** The mechanism is sound —
`CATALOGUE_TABLES` is pinned against `PRAGMA table_info` by a test, and it does carry
`ComboSlotOptionRule`, so the pizza-size rules travel. But the export records the migration
it was taken under and the import ignores it, and an older export into a newer install
succeeds with new columns silently at their defaults. Given § 1's plan — a fresh install in
France retaining this catalogue — this is the single most load-bearing untested assumption
in the packaging path.

**And one that is not about packaging but will reach the French install anyway:** L-101 is
live today, through an ordinary admin save, and it destroys real operator configuration
without saying so. If the catalogue is carried to France and someone then edits the
`Pizzas` category on the new install, the rules go and nothing reports it. It is the only
finding in this pass that can lose money without a migration being involved.

---

*Nothing in this document is evidence of French fiscal compliance, and no measurement in it
should be read as such. `bun run test`, `bun run typecheck` and `bun run lint` were run to
establish the baseline in § 0; no source file, test, script, plan or invariant was modified,
no migration was applied, no script was run with `--apply`, and the live database was opened
read-only throughout. Scratch databases used for the four experiments were created under the
session scratchpad and deleted.*
