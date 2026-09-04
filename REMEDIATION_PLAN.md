# HibaPOS France — Remediation Plan

Master source of truth for the controlled remediation of HibaPOS France.
Derived from the read-only baseline audit of 2026-09-03 (repo at commit `5ef7dc4`).

Detailed audit record: https://claude.ai/code/artifact/329316b0-3a6b-48b0-9d27-d815004f4cbf

---

## CURRENT PROJECT STATUS

**Overall:** NOT READY FOR PRODUCTION

**Current Stage:** Stage 4 — Security & integrity, `IN PROGRESS` (4.1 through 4.4 and **4.4b** COMPLETED; **4.4c `NOT STARTED`**; 4.5 through 4.7 `NOT STARTED`). **C-18 is now closed** — the operator changed both PINs on 2026-09-04. **M-19s is closed** in Batch 4.4b, which also removed `CASHIER` from the product per DD-07's final answer. (**Stage 3 is COMPLETED** — every batch 3.1 through 3.6, plus 3.6b, which reopened it for one small batch on 2026-09-04 — with C-22's chain-design half carried forward as `REQUIRES EXTERNAL VERIFICATION` and V-03 open for professional confirmation. Stage 1 is **partly done**: 1.1 and 1.2 COMPLETED, 1.3 `IMPLEMENTED — TESTING REQUIRED` on hardware, 1.4 deferred. Stage 2 is COMPLETED.)

**Current Batch:** Batch 4.4c — Step-up PIN for large discounts and every refund · `NOT STARTED` — **nothing blocks it; start here**

**Last Completed Batch:** Batch 4.4b — Remove the CASHIER role, close M-19s. The role is gone from the enum, the `Role` union, both zod schemas, the nav table, the login screen, two server gates and one client mirror; `GET /api/settings` and `GET /api/reports/x` now agree with their writes. **No migration was needed** and nothing waits on the operator. Two consequences were carried deliberately and are written down rather than hidden: `LEAST_PRIVILEGED_ROLE` is one rung weaker (now `MANAGER`), and the approval machinery is **dormant, not deleted** — which is precisely what 4.4c picks up.

**Next Batch:** **Batch 4.4c — step-up PIN** for large discounts and every refund (DD-19). It is specified below, its decision is made, and nothing blocks it. Read Batch 4.4b's stub first: it left the dialog, the re-entry mechanism and the lockout in place on purpose, and it left one user-visible statement false until 4.4c lands (**L-35**). Batch 4.5 follows and **is** blocked on DD-08.

**Blocked:** Batch 1.3 `[HW]` sign-off and Batch 1.4 — both need the app running on the restaurant's POS machine, which is in a different country from the developer and has no copy of the app installed (decision of 2026-09-03).

**Awaiting decision:** **nothing blocks 4.4c.** **DD-08** blocks Batch 4.5 (guard the operator scripts, or remove them from the shipped tree) — note that C-17 also reintroduces default PINs if `scripts/seed-users.ts` is ever run, which now matters more than it did. DD-06, DD-07 and DD-19 were answered on 2026-09-04. A new question is recorded but not yet urgent: whether the now-dormant discount/refund approval machinery should eventually be removed — see DD-07's rationale in the record. Then Batch 5.3 (cross-shift refunds), Batch 5.5 (cash movements), Batch 5.6 (order cancellation) — see *Design Decisions Required*. **DD-03 and DD-17 were answered on 2026-09-03, DD-05 and DD-18 on 2026-09-04.**

**Last Updated:** 2026-09-04 (session 8 — Batch 4.4b only; read *OPEN THREADS* below before starting anything. Nothing waits on a `migrate deploy`: none of 4.1 through 4.4b added a migration, and 4.4b's was measured with `prisma migrate diff` rather than assumed — it emits an empty migration. The Prisma `EPERM` is resolved — stale `next start` servers were holding the engine DLL, and this session stopped its own scratch server by PID and re-verified `prisma generate` afterwards)
**Restructured:** 2026-09-04 — completed batches now live verbatim in `REMEDIATION_RECORD.md`; this file keeps the resume block, the open work, the registers and a stub per completed batch. Everything a session must know before acting sits above the first stage heading. See *HOW TO USE THIS FILE*.

### OPEN THREADS — read this before starting a batch

*Rewritten at the end of session 3 (2026-09-03), updated through Batch 3.6.
Everything below is current as of the Batch 3.6 commit.*

Work in this plan does not finish batch-by-batch. Several completed batches
shipped a mechanism whose **benefit is not yet delivered**, and several items
are waiting on somebody or something outside the code. A session that starts
by opening the next batch will miss all of it.

#### A. Shipped but NOT yet in effect on the production install

These are done in code, validated, and committed — and change nothing on the
real till until an action below is taken. Do not report them as delivered.

| What | Why it is inert | Unblocked by |
|---|---|---|
| **WAL journal mode** (2.3) | The database is on a OneDrive-synced path and the startup guard deliberately refuses WAL there. `db/custom.db` byte 18 is still `1` — re-verified this session. | Moving data to `C:\HibaPOS\data` (DD-02), then any restart |
| **`BACKUP_LOCATION`** (2.2) | Honoured by the code, but **unset** — backups still land next to the database on the same disk. | Choosing a second volume at deployment |
| **`HIBAPOS_DATA_DIR`** (2.2) | Defaults to the old layout on purpose, so an update cannot silently repoint a running install at an empty folder. | The deployment step in Batch 1.4 |
| **Thermal printing + drawer** (1.3) | `printerEnabled` is `false` and no printer IP is set. Confirmed this session: a reprint journals its `REIMPRESSION` event and then reports *"Impression désactivée dans les réglages."* | Commissioning on the real Sunso WTP-801 |
| **FACTICE simulation mode** (3.1b) | The switch now exists in Réglages but is **off**. Any testing before go-live is still journalled as genuine trading. | The operator turning it on for test sessions |
| **Audit-log retention** (2.4) | Deliberately `0` = keep forever. That table is still unbounded. | An operator decision, if a retention obligation appears |
| ~~**`MonthlyClose` / `AnnualClose` refunds columns** (3.6b)~~ ✅ **APPLIED** — see the correction below | — | — |
| ~~**`ZReport.refundsTotal` / `refundsCount`** (3.6)~~ ✅ **APPLIED** — applied 2026-09-04 00:54:37; its own correction was retired to the record in Batch 4.4b, and *G* carries the state | — | — |

**Correction, 2026-09-04 (session 6).** The 3.6b row above said its migration was unapplied. It is applied: `20260904091947_close_refund_totals` is in `_prisma_migrations` with `finished_at` **2026-09-04 09:43:54 (UTC+1)**, matching `db/custom.db`'s mtime, and `refundsTotal` / `refundsCount` are present on both `MonthlyClose` and `AnnualClose`, both tables still **empty** — so no sealed document was rewritten, exactly as the rehearsal predicted. **The production hash is now `a66bc96c20d3f00282ea249361dd80d6303434b1a43331c0725258b637db46f9`**, not the `7cc3367b…` recorded in *G*. Nothing is waiting on a `migrate deploy` any more. Everything else in the baseline is unchanged. Verified read-only.

#### B. Waiting on the operator

**Operator actions completed — 2026-09-04**

| Action | Evidence | Closes |
|---|---|---|
| **Both live PINs changed** | Done by the operator in `Utilisateurs` on the running app, twice: four `USER_UPDATED` audit rows at 15:33:25, 15:33:34, 15:41:12 and 15:41:43 UTC, and the database hash moved `a66bc96c…` → `e40735ca…` → `7839db18…`. Fiscal state untouched throughout: counters `20/3/2/2`, `integrity_check ok`, 78 products, 2 Z reports, 0 closes. | **C-18's credential half.** |

**Two things about that change a later session must not misread.** (1) **The values were never seen by Claude and are recorded nowhere** — not here, not in the record, not in a commit. Do not ask for them and do not write them down. (2) The **first** attempt set the super-administrator to a value that was itself one of the two published defaults — present in `prisma/seed.ts`, `scripts/seed-users.ts`, commit `5ef7dc4`'s message and in this plan's own Batch 4.3 record. That was flagged and the operator changed both again; the second change is the one that closes the finding. The lesson is worth keeping: **this repository documents its own default PINs, so a replacement must be checked against the repository, not just against the value it replaces.**


| Action | Why it matters | Related |
|---|---|---|
| ~~**Stop the leftover servers**~~ ✅ **DONE 2026-09-04 (session 7)** | Stopped at the user's explicit request: PIDs 4016 (`-p 3011`) and 24116 (`-p 3012`) with their `bunx` parents 10540 and 22844, all Batch 3.1b leftovers serving the session-3 scratch copy (marker `SCRATCH-3.1b-Administrateur`), none holding the production database. **`bunx prisma generate` then succeeded**, so the leftover `next start` really was the `EPERM` cause — the port number recorded against it was simply wrong. Ports 3010, 3011 and 3012 are now free. | — |
| Correct `printerName` in Réglages | Stored value is `"Epson TM-m30"`; the physical printer is the **Sunso WTP-801** (Ethernet). Cosmetic — nothing reads it. **This was impossible until Batch 3.1d**; the settings form now saves. | DOC-15 |
| Choose a second volume for backups | See A. | C-06 |
| Turn FACTICE on for any pre-go-live testing | See A. | L-18 |

#### C. Waiting on hardware / deployment

Covered by the deferral policy below: Batch 1.3's `[HW]` criteria, all of
Batch 1.4, and Batch 8.2.

#### D. Ordering constraints between batches

- **Batch letters are labels, not an order.** Stage 3 ran 3.1 → 3.1b → 3.1d →
  3.1c → 3.2 → 3.2b → 3.3 → 3.4. Nothing was renumbered, because the finding
  index maps `C-10 → 3.2`, `C-16 → 3.3` and so on.
- **Batch 1.4 needs Batch 2.2** — done. DD-02 is answered, so 1.4 is
  unblocked *in design* and waits only on the till.
- **Batch 1.4 carries the deployment step** that activates WAL,
  `BACKUP_LOCATION` and `HIBAPOS_DATA_DIR` — the inert items in A.
- **Batch 7.1** should re-check **DOC-01** (`README.md:10` "WAL"), which
  Batch 2.3 made *conditionally* true — true off a synced folder, false on
  one. DOC-02 and DOC-03 still describe the deleted `start.sh` mechanism.
  **DOC-12** is a special case: `IMPLEMENTATION_PLAN.md:162` claimed
  `VatBreakdown` is `Record<string, …>`, which was wrong when written and
  became true in Batch 3.1 — append a correction note, do not silently "fix"
  the line.
- **Batch 7.3 / DD-04** (secret rotation) is informed by L-05: the live
  `.env` sits in a OneDrive-synced folder, so the secrets are very likely
  already in cloud storage.
- **Batch 8.0 / P-04** (pre-go-live fiscal reset) must run **after** 1.3 and
  1.4 — otherwise commissioning puts fresh test sales into the journal that
  was just reset. Its scope grew in session 3: the journal now also contains
  `CLOTURE_M`, `CLOTURE_A`, `ARCHIVE_GENEREE`, `OUVERTURE_TIROIR` and
  `REIMPRESSION` events whenever the operator exercises the new fiscal screen,
  plus any `FiscalArchive` rows and files.
- **Batches 3.5 and 3.6 changed three event payload shapes**, so `CLOTURE_Z`
  now carries `refundsTotal` / `refundsCount` alongside the 3.5 changes below.
- **Batch 3.6b changed the sealed *close* payload**, which is a different
  thing: `MonthlyClose.dataJson` and `AnnualClose.dataJson` now carry
  `refundsCount` beside the `totalRefunded` they always had. Free of the
  vintage problem only because **zero closes exist** — the first sealed close
  fixes that shape for good. `CLOTURE_M` and `CLOTURE_A` event payloads were
  deliberately **not** touched.
- **Batch 3.5 changed two event payload shapes**, so the journal now contains
  events of two vintages. `VENTE` gained `discountApprovedById`; `REMBOURSEMENT`
  and `ANNULATION` changed `orderNumber` from a cuid to the ticket number.
  Older rows keep what they were sealed with and **must never be re-serialised
  to match** — their hashes cover the old bytes, and the chain verifies fine
  across the boundary (proved on a copy of production). Anything that later
  reads a payload — an archive reader, an inspection export, Batch 3.6's
  document work — has to tolerate both.
- **L-14** is unresolved by choice: receipts archived before Batch 2.2 are 80
  columns wide and will wrap when reprinted on 48-column paper. They must
  **not** be re-rendered — an archived receipt is immutable.

#### E. Open questions recorded for others to answer

**V-13** — must the JFP carry an `OUVERTURE_TIROIR` entry for the *automatic*
drawer kick on a cash tender, or only for the traced manual open? Batch 1.3
journals the manual open only, and Batch 3.4 gave that manual open a UI.
Fiscal question, flagged not decided.

**V-02** — whether the annual archive format satisfies the archiving
obligation. Batch 3.3 established the narrower, checkable part (the checksum
covers every byte including every date, and a third party can reproduce it
with `sha256sum`); the compliance judgement is not a code question.

#### F. Findings still open (sessions 3 and 4)

| ID | What | Suggested home |
|---|---|---|
| **L-19** | `report-widgets.tsx:76` renders rates with `toFixed(1)`, so a two-decimal rate (1,05 %) would display as "1.1 %". Not reachable while only 10 % and 5,5 % are in use. **Batch 3.6 deliberately did not reproduce it**: the receipt's new per-rate block labels rates from the breakdown *key*, not `toFixed`. So the defect is now confined to that one display site. | 7.1 |
| **L-21** | `renderReceipt()` centres but never wraps, so the restaurant's real 56-character address overflows 48-column paper on every ticket. **Re-measured in Batch 3.6 and still live** — 56 columns against a 48-column width, on a ticket rendered from the real settings. The four lines M-06 adds are at most 48, so the overflow is the address alone. | with the printer work |
| **L-22** | Validation errors surface as untranslated English zod messages in a French UI. | 7.1 |
| **L-24** | `bun test src` fails 23 tests on a slow machine — the backup/restore suite exceeds Bun's default 5 s timeout because scrypt at N=2^17 costs ~1.5 s per call here. Nothing to do with the code; it cost most of an hour to establish that in session 4. Run `bun test src --timeout 30000` if the failures are all in `backup*.test.ts`. | 6.1 |
| **L-27** | The open-caisse half of the 3.6b guard is scoped, as DD-18 wrote it, to caisses *opened inside* the period, so a caisse opened earlier and still open does not block the close. Reachable only through the first-ever close. | needs a decision — before 8.0 |
| **L-12**, **L-10**, **L-11** | Pre-existing, unchanged in sessions 3 and 4. | as recorded |

#### G. Current baselines — check these before trusting anything

| Thing | Value at the end of session 3 (updated through session 4) |
|---|---|
| Tests | **461 pass, 0 fail** (`bun test src --timeout 30000` — see L-24 for why the timeout flag). 453 before Batch 4.4b. Whole-suite runtime measured 64–80 s this session, against the ~192 s L-24 records |
| Production DB sha256 | **`7839db18a7c8b132d974bd834d39d2921def66dd234b2059b022949f22ea6f2e`** (mtime 2026-09-04 16:41:52) — moved by the operator's **PIN change**, not by any batch: Batches 4.1 through 4.4 left it at `a66bc96c…` and added no migration. The intermediate value after the first PIN change was `e40735ca…`. Before that, `a66bc96c…` was reached by the operator applying the 3.5, 3.6 and 3.6b migrations. The pre-3.6b value `7cc3367b…` is preserved in `db-snapshots/custom.db.pre-3.6b.2026-09-04T08-27-38Z` |
| Fiscal chain | `/api/fiscal/verify` → all three chains `ok`, `lastSequence: 2`. **Zero monthly and annual closes have ever been sealed** — which is why M-01's guard, DD-18's timing rules and L-26's payload change could all be imposed with nothing to accommodate. Re-verified read-only 2026-09-04 |
| Fiscal counters | `20/3/2/2` (receipt / shift / Z / event). Re-verified read-only after the PIN change, 2026-09-04 |
| Migrations | **6 applied on production**, latest `20260904091947_close_refund_totals` (applied 2026-09-04 09:43:54). **None pending.** Batches 4.1 through 4.4b added none — 4.4b's enum removal was measured with `prisma migrate diff` and emits an empty migration |
| Catalogue | 78 products — 17 drinks at **5,5 %**, 61 at 10 % |
| Accounts | **two, and that is now the product's whole role model**: `manager` (MANAGER) and `admin` (SUPER_ADMIN, the developer's). Both PINs changed 2026-09-04. `CASHIER` was **removed in Batch 4.4b** — zero rows carried it, confirmed read-only first. `LEAST_PRIVILEGED_ROLE` is therefore `MANAGER`, one rung weaker than before |
| Out-of-band snapshots | `db-snapshots/custom.db.pre-3.1c.2026-09-03T20-54-10Z` and `…pre-3.5.2026-09-03T23-01-34Z` (both hash `711de2f1…`), and `…pre-3.6b.2026-09-04T08-27-38Z` (`7cc3367b…`). All outside the repo |

**When running the app against a scratch copy**, override **both**
`DATABASE_URL` and `HIBAPOS_DATA_DIR` — Batch 3.4 overrode only the first and
wrote a test archive into the real `db/fiscal-archives/`, which had to be
deleted afterwards.

### Hardware-dependent validation (policy set 2026-09-03)

The developer is in a different country from the restaurant, and the restaurant's POS machine has **no copy of the app** — deployment is deliberately on hold until the software is fit to ship. Remote access to that machine is available in principle.

**Decision:** proceed with software-only work; defer every item that requires the app to be running on the POS all-in-one device. Affected items, none of which may be marked `COMPLETED` on automated evidence alone:

| Item | What is deferred | What was done instead |
|---|---|---|
| Batch 1.3 `[HW]` criteria | Real print, real drawer kick, real paper width | Full loopback validation against a mock ESC/POS printer — see the Batch 1.3 status record |
| Batch 1.4 (C-07) | Cold-reboot, supervisor restart, kiosk launch, update rehearsal | Not started. Also blocked on Batch 2.2 / DD-02 by its own dependency note |
| Batch 8.2 | Restore rehearsal, full-day trading | Not started |

These are **deferred, not waived.** Stage 1 cannot be declared complete, and no claim of production readiness may rest on the loopback evidence.

### Immediate warnings for any session picking this up

1. The repo **is** pushed: `origin/main` is `astrellaltd-coding/HibaPos`, and every session must leave its own commits pushed by the operator (Claude cannot push). Still: do not run `git clean` and do not delete the working tree without checking `git rev-list --left-right --count origin/main...HEAD` first.
2. **Do not run `bun run test:e2e`.** `playwright.config.ts` starts `bun run dev`, which loads the real `.env` and writes orders, refunds and Z reports into the **production database** and into an append-only hash chain that cannot be cleaned up. Fixed in Batch 6.3. *(Batch 6.3 is `NOT STARTED`; until it lands the command stays forbidden.)*
3. **Do not run `bunx vitest` / `npx vitest`.** Only `bun test src` is safe. The test-DB redirect lives in `bunfig.toml` → `test-setup.ts` preload, which vitest does not read; four test files begin by wiping 17 tables.
4. **The CATALOGUE in the production database is real and irreplaceable; the TRADING data is not.** Confirmed by the operator on 2026-09-03: categories, products, options and images are real work (commit `0c5ede6`); every order, payment, receipt, shift, Z report and fiscal event was created by the developer for testing, and P-04 deletes all of it before the first genuine sale. Treat catalogue changes as destructive and irreversible. Trading-data mistakes cost test data — which lowers the risk of exercising fiscal flows, but does **not** license careless writes to the live database: work on a scratch copy, as every batch in Stage 3 did.
5. **Do not run scripts in `scripts/`** without reading them first. `seed-users.ts` and `seed-category-options.ts` begin with unguarded `deleteMany({})` calls (finding C-17). The exception is `set-drink-vat-rates.ts` (Batch 3.1c), which is dry-run by default, idempotent, and refuses to run against an unexpected category tree.


7. **When running the app against a scratch copy, override `HIBAPOS_DATA_DIR` as well as `DATABASE_URL`.** Batch 3.4 overrode only the database and a generated archive landed in the real `db/fiscal-archives/`, orphaned from its row. It was deleted, but the next session should not repeat it.


9. **Claude cannot do three things in this project** — the permission classifier refuses them, and each refusal is correct: `prisma migrate deploy` against production, writes to real menu data, and killing processes. Prepare, rehearse and verify; then hand the operator the exact command.

   **`git push` is a fourth case and behaves differently.** Earlier sessions recorded it alongside the three above; that was wrong. It is an *explicit-permission* action, not a prohibited one — it goes through when the user asks for it in the session, which they did on 2026-09-04 (`3f31779..8a311dc`). Do not push unprompted, and do not tell the user it is impossible.

#### Environment as last seen — verify before trusting

*These items describe the developer's machine at the end of session 4, not the project. Check each before acting on it, and delete it here once it no longer holds. Their numbers are kept because other sections refer to them.*

6. ~~**`bunx prisma generate` fails `EPERM`.**~~ **RESOLVED 2026-09-04 (session 7)** — and the diagnosis was right in kind, wrong in detail. Batch 3.6b named a `next start` on **port 3010** (PID 2072); that process was already gone while the `EPERM` persisted. The actual holders were two *other* Batch 3.1b leftovers, PIDs 4016 (`-p 3011`) and 24116 (`-p 3012`), started 2026-09-03 23:05 and 23:12 and both serving the session-3 scratch copy. The user asked for them to be stopped; with all three ports free, `bunx prisma generate` **succeeded**, regenerating the client to v6.19.2, and `bun test src --timeout 30000` still gives 413 pass / 0 fail against it. **The lesson worth keeping: a stale `next start` holds `node_modules/.prisma/client/query_engine-windows.dll.node`, so kill every leftover server before blaming the filesystem or OneDrive — and check the port list rather than trusting a PID recorded in an earlier session.** The `bun run dev` half of the original claim was never re-tested here: `dev` loads the real `.env` and would open the production database, so it stays untried on this machine. Sessions that need a server should keep using `bunx next start` on a **spare port** — 3.6b used 3021, 4.1 used 3022/3023, 4.2 used 3024/3025 — and stop it by PID afterwards.

8. **`bun test src` fails 23 tests on this machine, and the code is fine.** All 23 are in `backup*.test.ts` / `auth.test.ts` and every one is a 5 s timeout: scrypt at N=2^17 costs ~1.5 s per call here, and a backup→restore round trip makes several. `bun test src --timeout 30000` gives **384 pass, 0 fail**. Confirmed on the untouched commit before any Batch 3.5 change was made. Recorded as **L-24**. Do not "fix" a test that fails this way.

---

## HOW TO USE THIS FILE

This file is the **working plan**. Its companion `REMEDIATION_RECORD.md` is the **evidence record**: every completed batch's specification, validation criteria and status record, moved there verbatim when the batch completed, plus the completion history, the resolved findings and the full rationale of answered decisions. The record is append-only and is never rewritten; a correction anywhere is an appended, dated note.

1. Read **CURRENT PROJECT STATUS** and **OPEN THREADS** above, then the warnings, the rules and the *Methods*. Everything a session must know before acting sits above the first stage heading; read all of it.
2. Open the **current batch**. Do only what is in that batch. If its work touches a subsystem an earlier batch changed, read that batch's stub here (its *Constraints this batch leaves behind*), then its section in the record.
3. Work the batch's items from `NOT STARTED` → `IN PROGRESS` → `IMPLEMENTED — TESTING REQUIRED`, using the methods below.
4. Run the batch's **Validation Required** section in full.
5. If validation passes, mark the items `COMPLETED` and, in this order:
   1. Write the **status record** at the end of the batch's section, in the usual fields (Status, Completed, Changes, Files, Tests, Commit, Notes). Keep *Changes* near 1,500 characters and *Tests* near 1,000; write *Notes* as numbered items. Evidence (hashes, counts, "production untouched") belongs here.
   2. **Move the whole batch section to the record**, verbatim, under its stage heading, with a provenance line (`*Moved verbatim from REMEDIATION_PLAN.md lines a–b (commit sha) on date.*`).
   3. Leave a **stub** in its place, in the format of the existing stubs: status, date, commit, findings, the record pointer, *Constraints this batch leaves behind* and *Left open*. Constraints are sentences **copied** from the record, never paraphrased; every sentence containing "must", "never" or "do not", every deliberate non-action and every deferred-not-waived criterion goes there.
   4. Update **CURRENT PROJECT STATUS** and the stage status line; tick the **FINDING INDEX**; touch **OPEN THREADS** only if a thread changed.
   5. Add new findings to **NEWLY DISCOVERED ISSUES**; move any row this batch resolved to the record's *Resolved findings*, unchanged. When a design decision is answered, cut its row here to one line and move the full row to the record's *Answered design decisions*.
   6. Add one line to the record's **COMPLETED REMEDIATION HISTORY**: batch, status, date, commit, one sentence.
6. Commit. One batch, one commit (or a small reversible series). Do not push unprompted.
7. Stop. Do not roll into the next batch without the user's go-ahead.

Two rules keep this file small. **Every fact has one home**: a finding's story is told once, in its record section, and everything else is a status, a commit and a pointer. **Completion retires**: a finished batch leaves this file. Anything above the first stage heading must fit in one read; if it grows past about 40 KB, retire something into the record rather than adding.

### Status values (use exactly these)

| Status | Meaning |
|---|---|
| `NOT STARTED` | No work done. |
| `IN PROGRESS` | Actively being changed. |
| `IMPLEMENTED — TESTING REQUIRED` | Code changed, validation not yet run or not yet passing. |
| `COMPLETED` | Changed **and** validated, with the validation recorded. |
| `BLOCKED` | Cannot proceed; blocker recorded in the item. |
| `DEFERRED` | Consciously postponed; reason recorded. |
| `REQUIRES DECISION` | Needs a business/product decision before any code is written. |
| `REQUIRES EXTERNAL VERIFICATION` | Needs a qualified external party (fiscal/legal/certification). |

### Finding-ID prefixes

| Prefix | Origin |
|---|---|
| `C-nn` | Audit finding, Critical or High severity. IDs are stable labels, not a ranking. |
| `M-nn` | Audit finding, Medium severity. |
| `L-nn` | Audit finding, Low severity. |
| `T-nn` | Testing gap from audit section G. IDs newly assigned in this plan. |
| `DOC-nn` | Documentation-vs-reality discrepancy from audit section D. IDs newly assigned in this plan. |
| `V-nn` | Final-validation task from audit section J step 9. IDs newly assigned in this plan. |

Audit IDs are **never renamed**. `T-`, `DOC-` and `V-` items are new IDs assigned here because the audit described them as groups rather than numbered findings.

### Validation commands available in this project

| Command | What it does | Safe? |
|---|---|---|
| `bun test src` | **363** unit + integration tests, Bun runner, redirected to a temp DB. On a slow machine add `--timeout 30000` — see **L-24**, and warning 8 below | ✅ Safe |
| `bun run typecheck` | `tsc --noEmit` (note: `scripts/` is excluded by `tsconfig.json:41`) | ✅ Safe |
| `bun run lint` | `eslint .` (note: `scripts/` is excluded by `eslint.config.mjs:49`) | ✅ Safe |
| `bun run build` | `next build` — requires `SESSION_SECRET` in env or it throws at import time | ✅ Safe |
| `bun run test:e2e` | Playwright | ❌ **Writes to the production DB until Batch 6.3** |
| `bunx vitest` | — | ❌ **Bypasses the test-DB redirect. Never run.** |

---

## SAFETY RULES FOR ALL REMEDIATION WORK

1. Never fix unrelated findings during a batch.
2. Never delete tests to make a batch pass.
3. Never weaken validation to obtain a green test result.
4. Never modify fiscal or data-integrity behaviour without targeted tests.
5. Never mark an item completed without recording how it was validated.
6. Preserve audit IDs.
7. Update this file after every batch.
8. Keep every change attributable to a specific batch.
9. Prefer small reversible commits.
10. If a new problem is discovered during a batch but is outside its scope, record it in *Newly Discovered Issues* below and do **not** fix it.
11. If a proposed fix changes business behaviour, stop and mark it `REQUIRES DECISION` rather than guessing.
12. Never assume documentation is more authoritative than the actual implementation.
13. Never claim French fiscal or legal compliance on the basis of automated testing.

---

## METHODS ESTABLISHED BY EARLIER BATCHES

Stated once here so no session has to rediscover them. The record sections named are where each was first used and proved; read them before departing from a method.

- **Scratch copy, proved before any write.** Copy `db/custom.db` to the session scratchpad, write a marker into the **copy only**, start the app with **both** `DATABASE_URL` and `HIBAPOS_DATA_DIR` pointed at the copy, and prove which database the server has open by reading the marker back from the pre-auth `GET /api/auth/profiles` **before** the first write. Afterwards confirm the production file's sha256 and mtime are unchanged and that no `-wal`/`-shm` files appeared beside it, and that `db/fiscal-archives/` and `db/backups/` are untouched. Record → Batch 1.1 (Tests), Batch 3.1b note 2, Batch 3.4 note 5 (why `HIBAPOS_DATA_DIR` too).
- **Migration rehearsal with a fingerprint diff.** Never apply a migration to production first. Take an out-of-band snapshot (`db-snapshots/…`, outside the repo tree), apply the migration to a copy, and diff a fingerprint of every fiscal table before and after — row counts, `FiscalCounter`, `GrandTotal`, every event hash, both sealed Z rows, order lines, `integrity_check`, foreign-key errors, column order. Only the intended columns and the `_prisma_migrations` row may differ. Then hand the operator the exact `bunx prisma migrate deploy` command; Claude cannot run it against production. Record → Batch 3.1c note 3, Batch 3.5 note 1, Batch 3.6 note 3.
- **Prove the test fails on the old code.** For any fiscal change, temporarily revert the fix, re-run the suite, confirm the new tests fail, and restore the files from a copy taken before the revert. This is Stage 3's rule and it is satisfied by demonstration, not assertion. Record → Batch 3.1 (Tests), Batch 3.5 (Tests), Batch 3.6 (Tests).
- **Read-only inspection of live data.** Use `bun:sqlite` with `readonly: true`; do not load Prisma or the WAL startup hook against the production file. Record → Batch 3.1 note 4.
- **Manual validation against the production build.** `bun run build` then `bunx next start` on the scratch copy; testing the built artifact is the stronger check, and `next dev` is blocked on this machine anyway (see the environment items above). Record → Batch 3.4 note 1.
- **Browser driving.** Claude cannot type PINs; the operator enters them, everything after is driven by Claude. When synthetic clicks do not land in the browser pane, dispatch through the DOM and say so in the record. Record → Batch 1.1 note 1, Batch 3.1b note 3.
- **Journal payload vintages.** Anything that reads `FiscalEvent.dataJson` must tolerate the pre-3.5 and post-3.5 shapes; sealed rows are never re-serialised. *Open Threads → D*; record → Batch 3.5 note 3.
- **Out-of-scope findings.** Record them in *Newly Discovered Issues* with an ID, a severity and a suggested home; do not fix them in the batch (safety rule 10).

---

# FINDING INDEX

Quick lookup from audit ID to batch.
Each completed batch has a stub in its stage below and its full section in `REMEDIATION_RECORD.md`; the completion history table is in the record too.

**✅ = remediated and validated.** It means the *code* is done and the batch is
recorded — several ✅ items are **not yet in effect on the production install**
(WAL, `BACKUP_LOCATION`, `HIBAPOS_DATA_DIR`, thermal printing); *OPEN THREADS →
A* is the list. **◐ = one half done, one half open** — the finding was split
across two batches. Audit IDs are never renamed, so a split keeps its ID.

*Ticks audited and corrected 2026-09-04: seventeen findings were `COMPLETED` in
their own status blocks while the index still showed them untouched.*

| ID | Batch | ID | Batch | ID | Batch |
|---|---|---|---|---|---|
| C-01 ✅ | 1.1 | M-01 ✅ | 3.6 | M-25 ✅ | 4.4 |
| C-02 ✅ | 1.2 | M-02 ✅ | 3.3 | M-26 ✅ | 4.4 |
| C-03 | 1.3 | M-03 ✅ | 2.2 | M-27 ✅ | 4.3 |
| C-04 ✅ | 3.3 | M-04 ✅ | 3.5 | M-28 ✅ | 4.3 |
| C-05 ✅ | 2.1 | M-05 | 5.5 | M-29 ✅ | 2.4 |
| C-06 ✅ | 2.2 | M-06 ✅ | 3.6 | M-30 ✅ | 2.4 |
| C-07 | 1.4 | M-07 ✅ | 3.6 | M-31 ✅ | 2.4 |
| C-08 ✅ | 4.1 | M-08 | 5.6 | L-01 | 7.2 |
| C-09 ✅ | 4.2 | M-09 | 5.7 | L-02 | 7.2 |
| C-10 ✅ | 3.2 | M-10 | 5.7 | L-03 | 7.2 |
| C-11 ✅ | 3.2 | M-11 | 5.7 | L-04 ◐ | 2.4 / 7.3 |
| C-12 ✅ | 3.1 | M-12 | 5.7 | L-05 | 2.4 (deferred) |
| C-13 ✅ | 3.5 | M-13 ✅ | 3.2 | L-06 | 6.3 |
| C-14 | 5.3 | M-14 ✅ | 3.2 | L-07 | 7.2 |
| C-15 ◐ | 2.3 + 4.7 | M-15 | 5.7 | L-08 | 7.2 |
| C-16 ✅ | 4.4 | M-16 | 5.7 | L-09 | deferred |
| C-17 | 4.5 | M-17 | 5.7 | L-10 | deferred |
| C-18 ✅ | 4.3 + operator | M-18 | 5.7 | L-11 | deferred |
| C-19 ✅ | 2.3 | M-19 | 5.7 | L-12 | 7.2 |
| C-20 | 5.1 | M-19s ✅ | 4.4b | T-01…T-07 | 6.1 |
| C-21 | 5.2 | M-20 | 5.7 | T-08, T-09 | 6.2 |
| C-22 ◐ | 2.1 + 3.5 | M-21 | 5.7 | T-10…T-12 | 6.3 |
| C-23 | 5.4 | M-22 | 5.7 | DOC-01…12 | 7.1 |
| C-24 | 4.6 | M-23 ✅ | 4.3 | V-01…V-03, V-08…V-12 | external |
| C-25 | 4.6 | M-24 ✅ | 4.4 | V-04…V-07 | 8.1 / 8.2 |
| C-26, C-26b ✅ | 0.1 | C-27 ✅ | 3.4 | P-01…P-03 ✅ | 0.2 |

**The three ◐ items, so nobody has to go looking:**

| ID | Done | Still open |
|---|---|---|
| **C-15** | Transaction timeouts, Batch 2.3 | The shift-state race, Batch 4.7 |
| **C-22** | Restore/deletion journalling, Batch 2.1 | Whether an unkeyed chain suffices — `REQUIRES EXTERNAL VERIFICATION`, V-01 |
| **L-04** | The 297 MB `.next/standalone/` tree carrying live secrets, deleted in Batch 2.4 | Rotating the secrets it exposed, Batch 7.3 / DD-04 |

---

# DESIGN DECISIONS REQUIRED

These cannot be resolved from the code. **Claude must not decide them.** Each blocks or reshapes the batch named.

| ID | Decision | Blocks | Context |
|---|---|---|---|
| **DD-01** | **ANSWERED 2026-09-03 — build the ESC/POS bridge now**, in the existing Bun/Next server, primary transport raw TCP to port 9100 over the LAN, behind a transport interface leaving a Windows-RAW-spooler slot for USB. Not deferred to Tauri. | Batch 1.3 (`IMPLEMENTED — TESTING REQUIRED`); shapes 1.4 and 3.4 | Decided by the user. Full question and rationale: `REMEDIATION_RECORD.md` → *Answered design decisions*. |
| **DD-02** | **ANSWERED 2026-09-03 — `C:\HibaPOS\data`.** Plumbing shipped in Batch 2.2 (`src/lib/paths.ts`, `HIBAPOS_DATA_DIR`), defaulting to the old layout; the physical move is a deployment step with Batch 1.4. | Batch 2.2 (`COMPLETED`); shapes 1.4 | Full question and rationale: record → *Answered design decisions*; evidence in the record's Batch 2.2 section. |
| **DD-03** | **CLOSED 2026-09-03 as NOT APPLICABLE** — no sealed row ever carried a `"6"` key, and all trading data is developer test data that P-04 deletes. Key format decided: minimal decimal string (`"5.5"`, `"10"`). | Batch 3.1 (`COMPLETED`) | Evidence: record → Batch 3.1 status record, and *Answered design decisions*. V-01 not engaged. |
| **DD-17** | **ANSWERED 2026-09-03 — the VAT rate lives on the category, inherited nearest-wins** (own category → parent → default), with a per-product override flag and a constrained selector. The original row lists 20 / 10 / 5,5 / 2,1 %; Batch 3.1c's record says it shipped 20 / 10 / 5,5 with 2,1 % excluded. | Batch 3.1c (`COMPLETED`) | Decided by the user. Full rationale: record → *Answered design decisions*. |
| **DD-19** | **ANSWERED 2026-09-04 — step up with the operator's OWN PIN.** A discount above the configured threshold, and **every refund with no threshold at all**, must be confirmed by the signed-in user re-entering their own PIN. This is re-authentication, not second-person approval: with one operational role there is no second person, and the existing `/api/auth/approve` forbids self-approval by design, so it cannot serve. | Batch 4.4c | Decided by the user: *“the manager doesn't need to approve a discount because it's the manager … but simply the manager needs to put his PIN”.* The control being bought is **not** distrust of the manager — it is the unattended till: today a passer-by can apply a 100 % discount or refund any amount with no challenge at all. Consequence to design for: this makes the discount dialog a PIN-guessing surface, so it takes Batch 4.1's lockout and Batch 4.2's bounded queue. |
| **DD-04** | **Backup key rotation policy.** Rotating `BACKUP_ENCRYPTION_KEY` orphans every existing backup permanently. Re-encrypt the retained set first, accept the loss, or introduce key versioning before rotating? | Batch 7.3; P-02 | Retention obligations may make discarding old backups unacceptable — see V-04. |
| **DD-05** | **ANSWERED 2026-09-04 — refuse out-of-order closes.** A close must be the period immediately following the last sealed one; the first close is unconstrained. Decided with zero closes in existence. | Batch 3.6 (`COMPLETED`) | Evidence: record → Batch 3.6 status record, and *Answered design decisions*. |
| **DD-18** | **ANSWERED 2026-09-04 — refuse a premature close, with no override.** Applied in Batch 3.6b, together with L-26's refunds columns. | Batch 3.6b (`COMPLETED`) | Full question and rationale: `REMEDIATION_RECORD.md` → *Answered design decisions*; evidence in the record's Batch 3.6b section. |
| **DD-06** | **ANSWERED 2026-09-04 — no LAN access; bind `127.0.0.1`.** The POS runs on the all-in-one till and nothing else. No `APP_URL` change is needed, and printing is unaffected (the ESC/POS bridge dials **out**). | Batch 4.3 | Decided by the user. The plan's old “protective by accident” line was **wrong** and is corrected in the record: the `Secure` cookie broke LAN login for staff while `profiles` and `login` still answered over the LAN unauthenticated. Full question, measurements and rationale: `REMEDIATION_RECORD.md` → *Answered design decisions*. |
| **DD-07** | **ANSWERED 2026-09-04, then amended twice the same day. Final answer: one operational role.** Only **MANAGER** operates the till; **SUPER_ADMIN is the developer's account** and its visibility to the manager is accepted; **`CASHIER` is REMOVED from the product** (the owner asked for a single role) — which is what lets M-19s close. | Batches 4.4 and **4.4b — both `COMPLETED`** | Decided by the user. The role was first retained, then removed once the owner's requirement was known; the removal shipped in Batch 4.4b on 2026-09-04. Full rationale and both amendments: `REMEDIATION_RECORD.md` → *Answered design decisions*. |
| **DD-08** | **Operator scripts.** Guard them, or remove them from the shipped tree? | Batch 4.5 (C-17) | Precedent exists: `scripts/delete-products.js` was removed for the same hazard. |
| **DD-09** | **Tables.** Wire table selection into the POS, or withdraw the feature from the documentation? | Batch 5.2 (C-21) | The floor plan, model and API all exist; only the POS link is missing. |
| **DD-10** | **Cross-shift refunds.** Allow, attributed to the current open shift? Restrict to MANAGER+? Or keep the current refusal and define an approved manual procedure? | Batch 5.3 (C-14) | The current refusal pushes staff toward untraced cash refunds. |
| **DD-11** | **Held orders.** Move server-side (visible from any terminal, surviving a device swap, accounted for at Z close), or keep them device-local? | Batch 5.4 (C-23) | The current shape is not what "held orders" usually means operationally. |
| **DD-12** | **Cash movements.** Add an entrée/sortie de caisse feature, and if so what categories and what approval level? | Batch 5.5 (M-05) | Without it, the variance figure C-02 fixes will still be wrong in practice. |
| **DD-13** | **Order cancellation.** Support a pre-payment order state and a void, or remove the dead `PENDING`/`CANCELLED` enum values and the zero counter? | Batch 5.6 (M-08) | Leaving them implies a feature that does not exist. |
| **DD-14** | **Zero-total orders.** Is a 100 % discount (staff meal, comp) a legitimate transaction? Currently impossible to check out. | Batch 5.7 (M-11) | If yes, it still needs a fiscal record — decide how it is journalled. |
| **DD-15** | **Orphaned schema surfaces.** `ProductAddon` (no writer) and `Customer.postalCode` (no consumer) — build the missing write paths or remove the surfaces? | Batch 5.7 (M-09, M-10) | Both are flagged in audit section I as possible lost functionality; compare against the historical project before removing. |
| **DD-16** | **Should `public/uploads/` be tracked in git?** 134 files currently are, contradicting the README and complicating any git-based update. | Batch 7.1 (DOC-06) | Interacts with DD-02: if uploads move to a data directory, the question resolves itself. |

*The other registers — *External / Legal / Fiscal Verification*, *Newly Discovered Issues*, *Deferred*, *Possibly overstated* — follow the stage sections below, so that everything above the first stage heading stays within one read.*

---

# STAGE 0 — PRESERVE / ESTABLISH SAFE BASELINE

**Stage status:** `COMPLETED` (2026-09-03) — both batches done. Corrected 2026-09-04: this header still read `NOT STARTED` long after 0.1 and 0.2 were recorded as `COMPLETED` in their own status blocks and in the history table.

Rationale (audit section J, step 1): the source of the backup/restore API exists on exactly one machine and in no commit. Nothing else should be touched until that is fixed, because ordinary remediation hygiene (`git clean`, branch switching, reset) would destroy it silently.

## Batch 0.1 — Source-control recovery

**Status:** `COMPLETED` · **Completed:** 2026-09-03 · **Commit:** `e97a3e1` · **Findings:** C-26, C-26b
**Record:** `REMEDIATION_RECORD.md` → *Batch 0.1* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- Git matches bare patterns at any depth, so a rule written for the `db/backups/` artifact folder also excludes `src/app/api/backups/`. *(record line 27)*
- Anchored four bare `.gitignore` patterns that matched at any depth: `backups/` → `/db/backups/` (C-26), and `test`/`prompt`/`db/` → `/test`/`/prompt`/`/db/` (C-26b). *(record line 71)*
- Anchor each pattern, or remove those that no longer serve a purpose. Do not change `/upload/` (line 62) in this batch — see DOC-06. *(record line 53)*
- `git status --ignored=matching -- src` reports nothing under `src/`. *(record line 62)*
- No file on disk currently matches `test` or `prompt` outside `node_modules`, so C-26b's latent hazard had not yet fired for those two — anchored per plan direction rather than removed, to preserve intent for future Z.ai-artifact scratch files at the repo root. *(record line 75)*
- Local-only git identity (`user.name`/`user.email`) had to be set in this repo to match the existing commit history (`HibaPOS Dev <dev@hibapos.fr>`) before a commit could be made — confirmed with the user first, not set globally. *(record line 75)*

**Left open:** DOC-06 (`/upload/` in `.gitignore`, deliberately untouched) → Batch 7.1 / DD-16.

---

## Batch 0.2 — Working-state preservation

**Status:** `COMPLETED` · **Completed:** 2026-09-03 · **Commit:** plan-status commit only (no code change) · **Findings:** P-01, P-02, P-03 · Baseline Record
**Record:** `REMEDIATION_RECORD.md` → *Batch 0.2* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- Rotating or losing `.env` makes every existing `.dbenc` permanently undecryptable. *(record line 103)*
- **Claude must not read, print, copy or transmit these values.** *(record line 109)*
- `C:\Users\einer\HibaPOS-Baseline-Snapshots\2026-09-03\` (`custom.db` + `uploads/`), outside the project tree; hashes verified equal to source immediately after copy *(the Batch 0.2 baseline snapshot; V-05 compares against the Baseline Record in this batch's record section)* *(record line 139)*

**Left open:** P-04 (the pre-go-live reset that will later wipe the trading data this baseline records) → Batch 8.0; DD-04 / Batch 7.3 (any key rotation must respect P-02).

---

# STAGE 1 — CRITICAL BLOCKERS

**Stage status:** `IN PROGRESS` (1.1 and 1.2 `COMPLETED`; 1.3 `IMPLEMENTED — TESTING REQUIRED` — DD-01 was answered on 2026-09-03 and it now waits only on the physical printer; 1.4 `NOT STARTED`, unblocked in design but deferred on hardware). **Stage 1 cannot be declared complete on loopback evidence** — see *Hardware-dependent validation*.

Audit section J, step 2: the restaurant cannot open without these. The printing/drawer decision comes first because it is the only item that is a build rather than a fix; the two unit bugs are small, localised edits with disproportionate impact.

## Batch 1.1 — Refund amount unit correction

**Status:** `COMPLETED` · **Completed:** 2026-09-03 · **Commit:** `4766ceb` · **Findings:** C-01
**Record:** `REMEDIATION_RECORD.md` → *Batch 1.1* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- Refunds are immutable fiscal records — each writes a `REMBOURSEMENT`/`ANNULATION` event that cannot be deleted. *(record line 177)*
- The cent value is what goes into `pendingRefund`, so it is both POSTed to `/api/orders/[id]/refund` **and** HMAC-bound into the manager approval token; token and request therefore stay in the same unit (`lib/approvals.ts:114` verifies with tolerance 0.001, an exact match for integers). *(record line 198)*
- Added `parseEuroInput(raw): number | null` to `src/lib/money.ts` as the single euros→cents *input* boundary — the mirror of `formatEuro()` — accepting the French decimal comma as well as a dot, tolerating NBSP / narrow-NBSP grouping separators, rounding beyond two decimals to the nearest cent, returning `null` for text that is not a number, and leaving the zero policy to the caller (zero is legal for an opening float, not for a refund). *(record line 198)*

**Left open:** DOC-13 → *Newly Discovered Issues*; M-04 was resolved in Batch 3.5.

---

## Batch 1.2 — Z-close display unit correction

**Status:** `COMPLETED` · **Completed:** 2026-09-03 · **Commit:** `38d19a2` · **Findings:** C-02
**Record:** `REMEDIATION_RECORD.md` → *Batch 1.2* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- Independent of C-01 but the same class of defect — review both together for other survivors of the euros→cents migration (commit `720660a`). *(record line 226)*
- `countedCents` is now computed once from the operator's euros input and used for **both** the variance display and the submitted `closingFloat`; the expression is the identical `Math.round(counted * 100)` that was previously inlined in the submit handler, so what the operator is shown and what the Z report records cannot drift apart. *(record line 241)*
- Every other `/ 100` hit is a cents→euros conversion feeding a **form input** (`discount-dialog.tsx:30`, `addons-view.tsx:95`, `categories-view.tsx:218-257`, `products-view.tsx:71-385`, and `shifts-view.tsx:556` itself), which is the correct euros-boundary pattern and converts back with `toCents()`/`Math.round(x*100)` on submit; `orders/route.ts:205` is percent-discount maths and `:256` builds an error string. *(record line 245)*
- The auto-backup that fires on shift close wrote to the real project's `db/backups/` even though the app was running against a scratch database — three backup pairs (~50 MB each) were created and removed after the runs. *(record line 245)*

**Left open:** DOC-14 → *Newly Discovered Issues*.

---

## Batch 1.3 — Printing and cash-drawer strategy

**Status:** `IMPLEMENTED — TESTING REQUIRED` (DD-01 answered 2026-09-03; blocked only on the physical printer)

### C-03 — No receipt printing and no cash-drawer capability

**Status:** `IMPLEMENTED — TESTING REQUIRED` · Severity: CRITICAL · Category: incomplete functionality / hardware

**Problem.** Printing is `window.print()` into the OS print dialog. No ESC/POS, serial, USB, raw TCP:9100 or drawer-kick code exists anywhere in the repository.

**Evidence.** Repo-wide search for `escpos`, `node-thermal-printer`, `serialport`, `/dev/tty`, `COM1-9`, port 9100, `0x1B 0x70` / `ESC p`: no matches. Zero hardware dependencies in `package.json`. `settings.printerName` is written (`settings-view.tsx:230`), validated (`validation.ts:201`) and defaulted (`settings.ts:14`) but read by nothing that outputs. `POST /api/fiscal/drawer` appends a journal entry and returns JSON; its own comment says "trace a **manual** cash-drawer open".

**Location.** `src/components/pos/receipt-dialog.tsx:32,38`; `src/features/orders/orders-view.tsx:252`; `src/app/globals.css:210-235`; `src/app/api/fiscal/drawer/route.ts`

**Impact.** The target hardware (Sunso WTP-801, `IMPLEMENTATION_PLAN.md:15`) drives the drawer from its DK port on an ESC/POS kick command this codebase cannot send. Every cash sale needs a physical key; every receipt needs the cashier to confirm an OS dialog. `autoPrint` only auto-*opens* the dialog and no kiosk-printing launcher exists.

**Project position.** `IMPLEMENTATION_PLAN.md:226` — `[ ] 12f Hardware receipt printer integration (Epson ESC/POS) — blocked on Tauri (Phase 5)`, and Phase 5 is `DEFERRED`.

**Remediation direction (audit).** Either build the native bridge — a small local ESC/POS sidecar over raw TCP or a Windows printer share is far cheaper than the deferred Tauri shell — or agree explicitly with the client that this is not a cash-handling POS.

**Decision taken (DD-01, 2026-09-03).** Build the ESC/POS bridge inside the existing Bun/Next server, primary transport **raw TCP to port 9100** over the LAN, behind a transport interface that leaves a Windows-RAW-spooler slot for USB. Rationale recorded with DD-01: the receipt *content* renderer already exists (`renderReceipt()`), so what is missing is transport plus control bytes; a TCP socket is runtime-independent, so the work carries over to the deferred Tauri shell untouched rather than being done twice. Hardware setup (fixed printer IP, drawer wired to the DK port, model confirmed per DOC-15) proceeds in parallel — the batch stays `IMPLEMENTED — TESTING REQUIRED` until real-hardware validation passes.

**Dependencies.** Blocks nothing else technically, but the deployment stage (1.4) and the fiscal-UI batch (3.4) both change shape depending on the answer.

### Batch 1.3 — Validation Required

*(Finalised 2026-09-03 following DD-01. Items marked **[HW]** require the physical printer and cannot be satisfied by automated testing — safety rule 13 applies to the fiscal claims, and the audit's own rule applies here: no amount of unit testing substitutes for a real print.)*

- Unit tests for the ESC/POS byte layer: init, codepage selection, alignment, cut, and the drawer-kick sequence, asserted byte-for-byte.
- Unit tests for the text encoder covering the French repertoire actually used on receipts (é è ê à ç ù û î ô °, and €), including the ASCII-fold fallback for characters the selected code page cannot represent.
- Unit tests for the TCP transport against a local mock socket, including connect timeout, mid-write failure and printer-unreachable.
- L-13 resolved: `receiptWidth` semantics settled and the derived column count asserted (80 mm → 48 columns, 58 mm → 32 columns at Font A).
- A `POST /api/print/test` route that prints a self-test receipt — this is the operator's hardware-commissioning tool.

- Physical print of a real receipt on the target printer, 80 mm, correct character width.
- Physical drawer kick on cash tender and on the traced manual-open path.
- Failure path: printer offline / out of paper does not lose the sale or the fiscal event.
- The reprint path emits a `REIMPRESSION` fiscal event and increments `Receipt.reprintCount` (ties to C-27).
- Manual drawer-open emits `OUVERTURE_TIROIR` (ties to C-27).
- Real hardware testing is mandatory for this batch. No amount of unit testing substitutes.

### Batch 1.3 — Status Record

**Status:** `IMPLEMENTED — TESTING REQUIRED`
**Completed:** — (code 2026-09-03; cannot be marked COMPLETED until the **[HW]** criteria pass on the physical printer)
**Changes:** Built the ESC/POS bridge chosen in DD-01, in three layers so that only the innermost one is transport-specific. **(1) `escpos.ts`** — pure byte assembly, no I/O: `init`, `selectCodePage`, `feed`, `cut`, `drawerKick`, `buildPrintJob`. The CP1252 byte table is derived at module load from the runtime's own `TextDecoder('windows-1252')` rather than typed by hand, so it cannot contain a silent transcription error; characters outside the page fold to ASCII (é→e, €→EUR) instead of becoming mojibake, and NBSP / narrow NBSP — which fr-FR formatting emits around `€` and as the thousands separator — are flattened to a plain space, because printers render 0xA0 inconsistently. **(2) `printer-transport.ts`** — the JetDirect TCP transport behind a `PrinterTransport` interface, so a Windows-RAW-spooler transport for a USB printer implements the same two methods without touching the command layer, and a future Tauri shell would replace this file alone. `PrinterError` carries an operator-facing French message; a resolved `send()` means the bytes were flushed, which is the most port 9100 can ever tell us — paper-out and cover-open are not detectable this way, and that limit is accepted rather than papered over. **(3) `printer.ts`** — settings + transport + commands, where every function returns an outcome and **never throws**, because printing happens after the sale is committed. Wiring: `POST /api/orders/[id]/print` (first print, no fiscal event — the sale is already a `VENTE`), `POST /api/print/test` (commissioning self-test: column ruler, accents, €, drawer), physical printing added to the existing `/api/orders/[id]/reprint`, and a physical kick added to `/api/fiscal/drawer`. The POS fires the print after checkout commits and never awaits it into the failure path. Settings gained `printerHost`, `printerPort`, `printerEnabled`, `openDrawerOnCash` and two test buttons. **L-13 resolved**: `receiptWidth` is now unambiguously a COLUMN count (range 32–48, default 48), the settings selector stores columns while labelling the paper it matches ("80 mm (48 colonnes)"), and `normalizeReceiptColumns()` maps legacy millimetre rows (80→48, 58→32) on read **without** rewriting the stored value.
**Files:** `src/lib/services/escpos.ts` (new), `src/lib/services/printer-transport.ts` (new), `src/lib/services/printer.ts` (new), `src/app/api/print/test/route.ts` (new), `src/app/api/orders/[id]/print/route.ts` (new), `src/app/api/orders/[id]/reprint/route.ts`, `src/app/api/fiscal/drawer/route.ts`, `src/components/pos/payment-dialog.tsx`, `src/features/admin/settings-view.tsx`, `src/lib/validation.ts`, `src/lib/services/settings.ts`, `src/types/api.ts`, plus three new test files.
**Tests:** `bun test src` — **199/199 PASS** (153 + 46 new). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS, both new routes compile. The new tests cover the ESC/POS control bytes asserted byte for byte, the drawer-kick sequence and its millisecond→2 ms-unit conversion, the French repertoire and the ASCII-fold fallback, the invariant that no byte below 0x20 other than CR/LF ever reaches the printer, the L-13 column derivation and legacy repair, TCP delivery against a loopback mock printer, every transport failure path (unreachable, timeout, write failure, and a late close after a rejection) against an injected fake socket, and the service contract that a printer failure yields an outcome rather than an exception. **No hardware has been involved.** Every criterion marked **[HW]** in *Validation Required* is outstanding, and per this batch's own rule, none of the above substitutes for one real print.
**Loopback validation (2026-09-03).** With the real printer unavailable, the full print path was exercised against a **mock ESC/POS printer** listening on `127.0.0.1:9100` that decoded every byte it received. This is not a substitute for the `[HW]` criteria, but it validates everything up to the wire: settings resolution → printer service → ESC/POS assembly → TCP transport. Run against a **scratch copy** of the production database, with `receiptWidth` deliberately left at its legacy value of `80` so the L-13 repair was exercised for real. Results: (1) *test page* — `ok`, `columns: 48` (the 80 mm legacy value correctly normalised), and the printer received `ESC @`, `ESC t 16`, the ticket text, `ESC d 4`, `GS V 66 0`; the 48-character ruler arrived exactly 48 characters wide, and `é è ê à ç ù û î ô œ °` and `€` all decoded correctly from CP1252 on the receiving side. (2) *real archived receipt with a cash sale* — `ok`, and the job ended with `ESC p 0 25 250`, decoded by the mock as *cash drawer kick, pin 2, on 50 ms, off 500 ms*. (3) *manual drawer open* — a 7-byte job containing only the reset and the kick, no paper movement. (4) *printer unplugged* (port pointed at a closed 9101) — resolved to `{ ok: false, code: "UNREACHABLE" }` carrying the French operator message, with no exception thrown, confirming the contract that a dead printer cannot fail a sale. **Discovered during this run: L-14** — every pre-fix archived receipt is 80 columns wide and will wrap when reprinted on 48-column paper.
**Commit:** `483a86e` (ESC/POS layer, transport, service, routes) + `89d9629` (POS and settings wiring) + this plan update.
**Notes:** (1) **Open fiscal question, recorded as V-13**: an automatic drawer kick on a cash tender does **not** emit an `OUVERTURE_TIROIR` event — the `VENTE` event already journals the cash payment, and a second event per cash sale would duplicate it. The traced *manual* open still emits one. Whether the JFP must contain an entry for **every** physical opening is a fiscal question, not a technical one, so it is flagged rather than decided (safety rules 11 and 13). (2) The audit's claim that the reprint path lacks a `REIMPRESSION` event was **wrong** — `/api/orders/[id]/reprint` already emitted it and incremented `reprintCount` correctly; only the physical print was missing. Its `printStatus` was, however, set to `PRINTED` optimistically inside the transaction, which this batch corrected to reflect the real outcome. (3) A reprint deliberately does not kick the drawer: nothing is tendered, and a reprint that opened the till would route around the traced manual-open path. (4) `autoPrint` was kept but re-labelled — it now means "also open the browser print dialog", since thermal printing is governed by `printerEnabled`. (5) DOC-15 (Sunso vs Epson) is **not** resolved: nothing in the code reads `printerName`, so the contradiction is now harmless, but the physical device must still be confirmed during commissioning.

---

## Batch 1.4 — Startup, supervision and update path

**Status:** `NOT STARTED`

### C-07 — No auto-start, no supervisor, no installer, no update path

**Status:** `NOT STARTED` · Severity: CRITICAL · Category: operational / deployment

**Problem.** The only production launch path is a human running `.zscripts/start.ps1` in a foreground PowerShell window and opening a browser by hand.

**Evidence.** No `.bat`, `.cmd`, `.vbs`, `.msi`, `.iss`, no Task Scheduler XML, no nssm/WinSW config, no Startup shortcut, no kiosk launcher anywhere in the repo. `start.ps1` is 25 lines. Migrations run **only** inside the first-boot guard at `start.ps1:17-22`, so once `db/custom.db` exists `prisma migrate deploy` never runs again.

**Location.** `.zscripts/start.ps1`; `README.md:54-64`; `IMPLEMENTATION_PLAN.md:128-132`

**Impact.** After a power cut the restaurant boots to a desktop with no POS and no instructions. There is no way to ship a fix: a schema-changing update boots against an old database and fails at query time; a `git pull`-based update fights over the 134 committed files in `public/uploads/`, and `git clean -fd` would delete every product photo that restore cannot put back (C-05).

**Remediation direction.** Task Scheduler "at startup, run whether logged on or not" with an explicit *Start in* directory, plus a kiosk browser launch. A documented, scripted update procedure that runs `migrate deploy` and never touches the data directories.

**Related.** The `process.cwd()`-anchored paths (backups, uploads, fiscal archives, `dev.log`) mean an incorrect *Start in* silently splits data across two directory trees. Address the launcher and the path question together; the path refactor itself is Batch 2.2.

**Dependencies.** Interacts with DD-01 (kiosk printing) and with Batch 2.2 (data directory location). Do not finalise the launcher before 2.2 decides where data lives.

*Correction 2026-09-04: DD-02 is answered (`C:\HibaPOS\data`) and the plumbing shipped in Batch 2.2; the physical move is this batch's deployment step — *Open Threads → A, D*.*

### Batch 1.4 — Validation Required

- Cold reboot of the target machine: the POS is serving and the browser is in kiosk mode without human action.
- Kill the Node process: the supervisor restarts it; an in-flight request fails cleanly rather than corrupting data.
- Verify the working directory the service actually starts in, and confirm `db/`, `public/uploads/` and `db/fiscal-archives/` resolve to the intended locations (not a second tree).
- Simulated update: apply a schema-changing commit, run the documented update procedure, confirm `migrate deploy` ran and no data was lost.
- Confirm `public/uploads/` survives the update procedure untouched.
- `bun run build` — PASS (requires `SESSION_SECRET` present).
- Manual: full open-shift → sale → Z-close cycle after a reboot.

### Batch 1.4 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

# STAGE 2 — DATA SURVIVAL

**Stage status:** `COMPLETED` (2026-09-03) — all four batches done. Two shipped mechanisms are **not yet in effect on the production install**: WAL waits on the DD-02 move off OneDrive, and `BACKUP_LOCATION` still needs a second volume chosen at deployment.

Audit section J, step 3: before any real data accumulates. Restore must put images back and must not destroy the live database. Backups must leave the machine, be pruned, and fail loudly.

## Batch 2.1 — Backup restore correctness

**Status:** `COMPLETED` · **Completed:** 2026-09-03 · **Commit:** `723dd52` · **Findings:** C-05 · C-22 (restore-tracing half) · T-01 written
**Record:** `REMEDIATION_RECORD.md` → *Batch 2.1* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **What already works — do not regress it.** Checksum verification before the swap (`:232-236`) is correct, and AES-GCM `decipher.final()` authenticates independently. *(record line 274)*
- Restoring an older backup also silently rewinds `FiscalCounter`, so receipt numbers already printed can be reissued. *(record line 288)*
- Extraction **merges** rather than swapping the directory: a swap interrupted by a crash or an antivirus lock can lose images outright, and an orphaned image is harmless where a missing one is the failure this batch exists to prevent. *(record line 309)*
- The decrypted database is staged as `custom.db.restore-staged` — *next to* the live file, so the final move is a same-volume `fs.rename`, which is atomic (and on Windows replaces the destination via `MoveFileEx MOVEFILE_REPLACE_EXISTING`). *(record line 309)*
- A maintenance gate in `withAuth`/`withAuthParams` — the single choke point every API route passes through — returns **503 + `Retry-After: 5`** while the swap is in progress, so no request can reconnect Prisma onto a half-written file. *(record line 309)*
- **Ordering is the substance of the fix**: decrypt → checksum-verify → decrypt the images → take the safety snapshot → *only then* touch anything irreversible. *(record line 309)*
- The restore event is appended to the **restored** chain — it cannot go in the database the restore is about to destroy — and records what it displaced: `replacedCounter`, `replacedChainTip`, the images restored, the safety filename and checksum, and `rewound`. *(record line 309)*
- Deletion is journalled **before** the files are unlinked, so a process death mid-delete cannot lose the trace; `deleteBackup` also now writes the `BACKUP_DELETED` audit entry itself (with filename, imagesPath and fiscal sequence), replacing the bare one the route used to write. *(record line 309)*
- Backup paths are injectable (`BackupPaths`) — without this T-01 could not exist, because a test run from the project root would have restored over the real `db/custom.db`; production still uses the `process.cwd()` defaults, and *where* data should live remains DD-02 / Batch 2.2. *(record line 309)*
- (2) The remaining `[HW]`-style items for this batch — the full restore rehearsal onto a clean machine, and confirming product images render in the POS afterwards — are covered by the automated round trip at the file level but not on real hardware; they fall under the *Hardware-dependent validation* deferral. *(record line 313)*

**Left open:** C-22 chain-design half → Batch 3.5, still `REQUIRES EXTERNAL VERIFICATION` (V-01); the clean-machine restore rehearsal and the row-count comparison against the Batch 0.2 baseline are deferred to Batch 8.2 (V-06), not waived; L-15 was resolved in Batch 2.2.

---

## Batch 2.2 — Backup location, retention and failure visibility

**Status:** `COMPLETED` · **Completed:** 2026-09-03 · **Commit:** `d09252d`, `3a9bd1f` · **Findings:** C-06, M-03 · DD-02 answered · L-15 resolved
**Record:** `REMEDIATION_RECORD.md` → *Batch 2.2* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- Unset still falls back to the old location so an existing install keeps finding its backups. *(record line 371)*
- **Retention**: `pruneBackups()` keeps the newest N (default 30, `BACKUP_RETENTION_COUNT`), removing the `Backup` row and its files together so the list can never show a backup whose file is gone; a configured `0` is refused rather than honoured, because it would delete the backup just created. *(record line 371)*
- Since several backups then share one file, deletion **and** pruning are reference-counted; removing one backup must not strip the images from the others. *(record line 371)*
- The Z report itself still succeeds — it is a sealed fiscal document and a backup problem must not block a shift from closing. *(record line 371)*
- Archives written before this batch used a different layout, so restore chooses the extraction root from the recorded filename rather than guessing. *(record line 371)*
- `HIBAPOS_DATA_DIR` selects the root and **deliberately defaults to the old layout**: repointing a running install's database as a side effect of a code update would make it boot against an empty directory and behave like a fresh install. *(record line 371)*
- Uploads outside `public/` would no longer be served by Next — breaking every image in the catalogue — so `/uploads/[...path]` takes over at exactly the same URL, with a path-traversal guard and a media-type allowlist (without the guard, `/uploads/../../db/custom.db` would hand out the database over an unauthenticated URL). *(record line 371)*
- `assertCompatibleSchema()` runs after the checksum and before anything irreversible, comparing **tables and columns** between the staged backup and the live database; missing either refuses the restore, names what is missing, and points at `scripts/decrypt-backup.ts`. *(record line 371)*
- It compares structure rather than `_prisma_migrations` on purpose: a database created with `prisma db push` has no migration history, and refusing those would make restore unusable on any install bootstrapped that way. Extra tables (a newer backup) are allowed but logged. *(record line 371)*
- (1) **The data directory has not physically moved.** The code supports `C:\HibaPOS\data` and defaults to the current layout; setting the variable, moving the files and repointing `DATABASE_URL` is a deployment step that belongs with Batch 1.4, where the launcher's *Start in* is decided. Until then the live database remains on the OneDrive-synced path, which is a known hazard rather than a fixed one. *(record line 375)*

**Left open:** DD-02 physical move and the `BACKUP_LOCATION` second volume are deployment steps with Batch 1.4 (*Open Threads → A, B*); the criterion "the app functions with the data directory in its decided location" is carried to 1.4.

---

## Batch 2.3 — SQLite WAL and transaction safety

**Status:** `COMPLETED` · **Completed:** 2026-09-03 · **Commit:** `e07a860` · **Findings:** C-19 · C-15 (transaction-timeout half)
**Record:** `REMEDIATION_RECORD.md` → *Batch 2.3* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **⚠ Handling note.** Changing the journal mode of the production database is a write to that file. Do this only after Batch 0.2's snapshot exists, and verify the header byte before and after. *(record line 399)*
- (1) **WAL is NOT active on the production database, on purpose.** It sits on the OneDrive-synced path, so the guard refuses it — verified: byte 18 of `db/custom.db` is still 1 and the file is unchanged (`0e25f6f2…`). *(record line 433)*
- Only half of it is true: `$executeRawUnsafe("PRAGMA journal_mode = WAL")` fails with *"Execute returned results"*, but `PRAGMA journal_mode` **answers with a row**, so it is a query and `$queryRawUnsafe` runs it. *(record line 429)*
- Shipped: `src/instrumentation.ts`, the startup hook the audit noted was missing entirely (which is why no pragma could ever run), and `src/lib/db-pragmas.ts`, which applies WAL idempotently and **refuses on a cloud-synced path**. That refusal is deliberate: WAL keeps `-wal`/`-shm` beside the database permanently and they are not optional extras — a reader that sees a stale or restored `-wal` reads a database that never existed — so a sync client can corrupt data in a way rollback mode cannot, where the journal exists only for the duration of one write. *(record line 429)*
- The hook never blocks startup: a till that will not open is worse than a slow one. *(record line 429)*
- `src/lib/tx-options.ts` gives the transactions that seal money an explicit budget — checkout 30 s, Z close 60 s, refund / shift open / monthly / annual / archive 20 s — applied at seven call sites. *(record line 429)*
- Falsely refusing is not a safe failure: it silently leaves the database in the mode the batch exists to remove. Now matches whole path segments (and still catches business folders like *OneDrive - Contoso*), with a regression test naming this exact path. *(record line 433)*
- (3) **`start.ps1` was not changed.** The plan's validation item asked that it apply WAL idempotently on a fresh database and that the documented prerequisites match reality; putting the pragma in the application satisfies both more strongly — it runs on every start regardless of how the app was launched, and the `sqlite3` CLI prerequisite is now genuinely unnecessary rather than merely unmet. *(record line 433)*

**Left open:** C-15 shift-race half → Batch 4.7; DOC-01, DOC-02, DOC-03 → Batch 7.1 (*Open Threads → D*); a timed real checkout belongs with the hardware rehearsal, and transaction budgets should be re-measured once WAL is live on the till.

---

## Batch 2.4 — Resource bounds and retention

**Status:** `COMPLETED` · **Completed:** 2026-09-03 · **Commit:** `f9fd5cc` · **Findings:** M-29, M-30, M-31, L-04, L-05
**Record:** `REMEDIATION_RECORD.md` → *Batch 2.4* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **`FiscalEvent` must never be pruned** — it is append-only by design; only bound the others. *(record line 445)*
- **Treat the stale `.env` as a leaked-secret event** — see DD-04. *(record line 448)*
- Batch 1.4 may reinstate it deliberately, with the launcher pointed at `server.js` and the secret handling designed rather than inherited. *(record line 463)*
- `AuditLog`: **kept forever unless an operator opts in** — those rows record who approved a discount, who refunded, who restored a backup, and how long that evidence must live is a business and legal question rather than a disk-space one. *(record line 463)*
- Ranges are bounded to **370 days** (a full twelve months still fits) and **refused with a message naming the limit**, rather than silently returning a truncated report that looks complete. *(record line 463)*
- The chain algorithm was extracted into `verifyEventsChunk()` so there is still exactly **one** implementation of the check, and it is the one the unit tests exercise. *(record line 463)*
- **However**, the project root — and therefore the primary `.env` itself — sits in a OneDrive-synced folder, so the live secrets are very likely already in cloud storage. *(record line 467)*
- **Audit-log retention is deliberately a no-op by default.** If a retention obligation later says otherwise, `AUDIT_LOG_RETENTION_DAYS` turns it on; the plan should not treat "bounded" as achieved for that table. *(record line 467)*

**Left open:** DD-04 / Batch 7.3 (secret rotation; the L-05 exposure is its input); `AuditLog` is not bounded by default, so M-29 is only half achieved; the peak-RSS measurement was not taken, by choice.

---

# STAGE 3 — FISCAL CORRECTNESS

**Stage status:** `COMPLETED` (2026-09-04) — the ten batches 3.1, 3.1b, 3.1d, 3.1c, 3.2, 3.2b, 3.3, 3.4, 3.5, 3.6, plus **3.6b** (L-25, L-26; DD-18), which reopened the stage on 2026-09-04 for one small batch before Stage 4. All eleven done. Every thread the stage opened is closed: the VAT-*rate* thread (C-12, L-16, L-17), the reconciliation thread (C-10, C-11, M-13, M-14, L-23) — **every revenue figure in the application now comes from one aggregation** — archives (C-04, M-02), the operator interface (C-27), the audit trail (C-13, M-04) and close ordering (M-01, M-06, M-07).

**Two items leave the stage deliberately unresolved, and neither is a code question:**

- **C-22 (chain-design half)** — `REQUIRES EXTERNAL VERIFICATION`. Whether an unkeyed SHA-256 chain satisfies the inalterability requirement is V-01.
- **V-03** — what a compliant receipt must contain. Batch 3.6 added the per-rate VAT breakdown and the TVA number on the operator's own determination; whether anything further is required is open.

Safety rule 13 stands: **no claim of French fiscal compliance rests on any of this work.**

Audit section J, step 4: before the first Z report you would show an inspector. These are cheap now and expensive later, because sealed closes and generated archives cannot be corrected once written.

> **Rule for this entire stage:** no change to fiscal calculation, sealing or chaining may be marked `COMPLETED` without a targeted test that would fail on the old behaviour. Safety rule 4.

## Batch 3.1 — VAT rate keying

**Status:** `COMPLETED` · **Completed:** 2026-09-03 · **Commit:** `2d7e996` · **Findings:** C-12 · DD-03 closed as not applicable
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.1* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- It rounds to the nearest hundredth of a percent before rendering — so float noise (`5.500000000000001`) cannot split one rate across two keys — and emits **minimal form**: `"5.5"`, `"10"`, `"2.1"`, not `"10.0"`. *(record line 513)*
- Minimal form was chosen deliberately (DD-03 / A1): it is exactly what both existing `ZReport` rows already contain, so the fix gives no already-correct rate a second spelling. *(record line 513)*
- Two decimals rather than one because the Corsican and overseas rates include 0,90 %, 1,05 % and 1,75 % — one decimal would have merged 1,05 % into 1,1 %, repeating C-12 at a smaller scale. *(record line 513)*
- **The key `"6"` has never been written anywhere in this project's history.** Not inspected: the three `.dbenc` archives (encrypted; the key was not touched) — bounded by the fact that they are snapshots of *this* database taken after that product was gone. *(record line 523)*
- **`canonicalize()` output is insertion-order independent** (it sorts keys, `fiscal.ts:40`), confirmed by building the same breakdown in two different orders and comparing — so `computeCloseHash` stays stable now that non-integer keys exist. *(record line 527)*
- **Batch 7.1 must not "fix" that line**; it should append a correction note saying it was wrong until Batch 3.1 made it right. Do not rewrite history. *(record line 531)*

**Left open:** L-16, L-17 → resolved in Batch 3.1c; L-18 → resolved in 3.1b; L-19 open (*Newly Discovered Issues*); DOC-12 correction note owed by Batch 7.1 (*Open Threads → D*).

---

## VAT rate policy (operator determination, 2026-09-03)

Recorded here once because Batches 3.1c, 3.2 and 8.1 all depend on it. This is
the **operator's determination**, not a fiscal reference and not a Claude
conclusion — see V-14 and safety rule 13.

**Two rates are in use at this restaurant:**

| | Rate |
|---|---|
| Everything sold for consumption — food of every kind, and a drink served poured into a cup | **10 %** |
| A drink sold in a **sealed can or bottle** — the container is the criterion, not the drink | **5,5 %** |

**The restaurant sells no alcohol**, so 20 % is not currently used by any
product. It stays reachable in the interface anyway — making a needed rate
unselectable is precisely the defect L-17 records.

**The criterion is the container.** That matters for the data design in 3.1c:
`Canette` and `Bouteilles` *are* the sealed-container categories, so the 5,5 %
belongs on those two, while their parent `Boissons` stays on the 10 % default.
Placing it on the parent instead would encode "all drinks are 5,5 %", which
this determination says is false — a cup drink added later under `Boissons`
would silently inherit the wrong rate.

Nothing else in the catalogue changes: all 61 non-drink products stay at 10 %.

---

## Batch 3.1b — FACTICE simulation switch

**Status:** `COMPLETED` · **Completed:** 2026-09-03 · **Commit:** `8a8a09a` · **Findings:** L-18
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.1b* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **Out of scope.** Changing any existing row's `factice` value — the existing test trading stays as it is and is deleted by P-04. *(record line 549)*
- Both directions are covered deliberately, because the OFF direction is what must hold on the restaurant's first real sale: default `false` when no row exists; round-trips and persists as a real row; can be turned back **off**; survives an unrelated settings save; the journal entry is marked when on and unmarked when off; the ticket is stamped when on and completely unmarked when off or absent; and **`factice` is not in the hashed payload**, so toggling the mode cannot change how an otherwise identical sale chains. *(record line 572)*
- **(1) These tests would NOT fail on the old code, and that is stated rather than glossed.** Stage 3's rule — a targeted test that fails on the old behaviour — does not apply here, because the defect was **reachability, not behaviour**: the backend was already right, merely untested and unreachable. *(record line 572)*

**Left open:** L-20 → resolved in Batch 3.1d; L-21 open (*Newly Discovered Issues*); the switch is OFF on the live install (*Open Threads → A*).

---

## Batch 3.1d — Settings screen unblocked

**Status:** `COMPLETED` · **Completed:** 2026-09-03 · **Commit:** `be9efa1` · **Findings:** L-20
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.1d* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- Normalising in the service rather than in the route repairs **both** readers at once: the settings form, and `renderReceipt()`, which uses the value directly as its column count (`receipt.ts:8`) and was therefore still emitting **80-column receipt text** for a 48-column printer. *(record line 610)*
- `saveSettings()` compared each key against `getSettings()`. Once the read was repaired, the value equalled itself, so the row would never be corrected: `receiptWidth` would read as 48 forever while the database went on saying 80. It now compares against **what is actually stored**. *(record line 610)*
- A save is an explicit operator action and the right moment to persist the repair, so the legacy value corrects itself on the first save and nobody has to know to re-pick the width in the selector. Reads still never mutate settings (Batch 1.3's policy). *(record line 610)*
- L-20 was invisible to the entire unit suite because no test ever composed `getSettings()` with `settingsSchema`. The batch adds exactly that composition as a permanent regression test. *(record line 624)*
- **(2) Two OPEN THREADS operator items are now unblocked** — and one of them is obsolete. Correcting `printerName` to the Sunso WTP-801 (DOC-15) is now possible; it was not before. Saving `receiptWidth` as 48 **no longer needs doing by hand**: the value reads as 48 everywhere and the row corrects itself on the operator's next save of anything. *(record line 622)*

**Left open:** L-21, L-22 open (*Newly Discovered Issues*); DOC-15 is an operator action in Réglages (*Open Threads → B*); L-14 (archived 80-column receipts) unresolved by choice.

---

## Batch 3.1c — Category-level VAT rates

**Status:** `COMPLETED` · **Completed:** 2026-09-03 · **Commit:** `9feb4a0`, `23e2971` · **Findings:** L-16, L-17 · DD-17 answered · V-14 recorded
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.1c* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **Depends on Batch 3.1** and must not run before it: setting any product to 5,5 % while the key bug is live would seal the first Z report under a "6 %" heading. *(record line 636)*
- - `Category.vatRate` — optional. Resolved **nearest-wins**: the product's own category, then its parent, then the default. Same walk as `pricing.ts:71`. *(record line 643)*
- - `Product.inheritCategoryVat` — a per-product flag mirroring the existing `inheritCategoryGlobals`. Existing products default to **off**, keeping their stored rate, so the migration changes no behaviour on its own. *(record line 644)*
- **20 % is kept reachable although nothing uses it today** — an unselectable rate that is later needed is exactly the L-17 defect this batch removes. 2,1 % is excluded: it covers press and medicines and can never apply to a restaurant. *(record line 645)*
- Set **`Canette` and `Bouteilles`** to 5,5 % and switch their 17 products to inherit; leave `Boissons` on the 10 % default, per *VAT rate policy* above — the fiscal criterion is the sealed container, and those two category names are exactly that criterion. *(record line 648)*
- - **Targeted test: changing a category's rate does not alter any existing order.** `OrderItem.vatRate` is snapshotted at checkout (`orders/route.ts:194`) and every report reads that, not the product — this is the property that makes live inheritance safe and it must be pinned. *(record line 655)*
- When inheritance is on but no category in the chain sets a rate it falls back to the product's stored rate — deliberately the quietest failure, leaving a misconfigured category where it was rather than silently moving money. *(record line 666)*
- **(6) Data.** `scripts/set-drink-vat-rates.ts` — dry run by default, idempotent, and refuses to run unless it finds exactly `Canette` and `Bouteilles` *and* both sit under `Boissons`. *(record line 666)*
- `Canette` = 5,5 % (13 products), `Bouteilles` = 5,5 % (4), **`Boissons` deliberately unset** so a cup or fountain drink added under it later inherits 10 %. *(record line 676)*
- **(7) V-14 is the operator's determination, not Claude's.** The classification — 10 % standard, 5,5 % for sealed containers, no alcohol sold — came from the operator's own research on 2026-09-03 and is recorded under *VAT rate policy*. Claude applied it. Safety rule 13 stands: no fiscal claim rests on this work. *(record line 688)*

**Left open:** V-14 (operator determination, professional confirmation optional); exercising the encrypted backup path with `scripts/decrypt-backup.ts` is Batch 8.2's job.

---

## Batch 3.2 — Unify revenue and VAT aggregation

**Status:** `COMPLETED` · **Completed:** 2026-09-03 · **Commit:** `2631308` · **Findings:** C-10, C-11, M-13, M-14
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.2* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- A new pure module, `src/lib/services/aggregate.ts`, holds **the** period aggregation; all five callers delegate to it — `computeShiftReport` (X/Z), `aggregatePeriod` (monthly + annual closes), `/api/reports/vat`, `/api/reports/sales` and `/api/shifts/summary`. *(record line 755)*
- It takes orders the caller has already fetched and returns figures: no database, no dates, no HTTP, so whoever decides what "the period" means still gets everyone else's arithmetic. *(record line 755)*
- **M-13** — a new `apportion()` in `money.ts` distributes a total across lines by **largest remainder**, so the parts always sum to the whole; applied at checkout and in the aggregation, replacing per-line `Math.round`. *(record line 755)*
- Ties break toward the earlier line so the split is deterministic, which matters because these numbers reach sealed documents. *(record line 755)*
- **(2) One semantic was unified deliberately, and it is a behaviour change.** An order is now excluded from sales when `status === "REFUNDED"` **or** `refunds >= total`. *(record line 767)*
- **(4) `round2` was NOT deleted from `money.ts`, on purpose.** C-11's direction says "delete `round2` from every cents path", and it is gone from the four this batch owns. *(record line 771)*
- The function itself stays because it is still correct at the euros display boundary it was written for, and because removing it would silently change four routes this batch does not cover — see L-23. *(record line 771)*

**Left open:** L-23 → resolved in Batch 3.2b; C-27 → resolved in Batch 3.4.

---

## Batch 3.2b — The reports the audit did not count

**Status:** `COMPLETED` · **Completed:** 2026-09-03 · **Commit:** `54aa7ef` · **Findings:** L-23
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.2b* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- `orderNet()` is now exported from `services/aggregate.ts` — the per-order primitive deciding whether an order counts, what the customer actually paid, and how that net splits across the lines; `aggregateOrders()` is rebuilt on top of it, so there is literally one implementation. *(record line 793)*
- Reports that must group by something the shared aggregate does not return — by cashier, by hour, by product id — group the orders themselves and use the primitive, rather than being forced through one output shape or inventing their own arithmetic. *(record line 793)*
- `round2` now survives in these files only on two **percentage** figures, where 2-decimal rounding is correct because a percentage is not cents. *(record line 793)*
- **(2) One invariant is now pinned across reports:** every cent of a period's sales is attributed to some product and no cent is invented — `Σ product revenue === salesTotal`. *(record line 805)*

**Left open:** —

---

## Batch 3.3 — Archive integrity and lifecycle

**Status:** `COMPLETED` · **Completed:** 2026-09-03 · **Commit:** `a673a54` · **Findings:** C-04, M-02
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.3* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **Not affected — do not regress.** The `FiscalEvent` hash chain is unaffected: its payloads carry only numbers and strings, and the timestamp reaches `computeEventHash` as an ISO string. *(record line 838)*
- **⚠ Chain-compatibility warning.** `canonicalize` is also used by `appendFiscalEvent` (`services/fiscal.ts:49`) and by `closeMonth`/`closeYear`. Changing its output for any value type that already appears in stored `dataJson` would invalidate every existing hash. Verify that no stored payload contains a `Date`, an `undefined`, or a non-finite number before changing the function — otherwise version the canonicaliser instead of editing it in place. *(record line 842)*
- The archive checksum is now the SHA-256 of **the exact bytes written to disk**, and is deliberately **not** a field inside the file — a checksum placed inside the bytes it covers cannot be checked directly, which is precisely why the old one (hash of the canonical form, embedded in pretty-printed JSON) was unreproducible by anyone. *(record line 864)*
- A `.sha256` manifest ships beside the archive so `sha256sum -c` verifies it with no HibaPOS-specific knowledge. *(record line 864)*
- `generateAnnualArchive` split into `buildAnnualArchive()` (reads only, writes nothing) and `recordAnnualArchive()` (row + journal entry), so the route writes the file **first** and records only what reached the disk — the ordering principle from Batch 2.1's restore. *(record line 864)*
- A row whose file is missing is no longer a dead end: the route rebuilds the payload and repairs the file **if it reproduces byte for byte**, otherwise refusing with both checksums named, because writing different content under a recorded checksum would be a lie. *(record line 864)*
- Format `version` bumped 1 to 2. *(record line 864)*
- **(5) Still `REQUIRES EXTERNAL VERIFICATION`.** Whether this format satisfies the archiving obligation is not a code question — **V-02** stands, and safety rule 13 applies. What this batch establishes is narrower and checkable: the checksum covers every byte including every date, and a third party can reproduce it. *(record line 882)*

**Left open:** V-02 (whether the archive format satisfies the archiving obligation) — external.

---

## Batch 3.4 — Fiscal operator interface

**Status:** `COMPLETED` · **Completed:** 2026-09-03 · **Commit:** `f8c9e9a`, `36ef20c` · **Findings:** C-27
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.4* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **Reprint** in `orders-view.tsx` now posts to `/api/orders/[id]/reprint` **before** printing, so the `REIMPRESSION` event is journalled and `Receipt.reprintCount` increments; the route is MANAGER+ by its own design, so a cashier is told to ask rather than being silently given an untraced copy. *(record line 944)*
- `src/app/api/route.ts` — the `{"message":"Hello, world!"}` scaffold stub — became a **liveness probe** rather than being deleted, because Batch 1.4's launcher needs to know the server is accepting requests before opening the kiosk window; it is deliberately unauthenticated and uninformative, touches no database and reports no version or environment detail. *(record line 944)*
- The UI mirrors the server's own gates — closing a year and generating an archive are SUPER_ADMIN — so an operator is never offered a button that will 403. *(record line 944)*
- The fiscal event is written regardless, which is the right order: the trace does not depend on the hardware. The UI surfaces that message as a warning rather than swallowing it. *(record line 958)*
- The nav entry alone was not enough: `home-dashboard.tsx` keeps its **own** module list, so the module was reachable from the sidebar but invisible on the screen operators start on — the same class of defect as C-27 itself. Its role filter reads `NAV_ITEMS`, so the gate needed no duplication. *(record line 960)*
- **Any future scratch run must override `HIBAPOS_DATA_DIR` as well as `DATABASE_URL`.** *(record line 962)*
- **(6) One manual criterion is NOT met and is deferred, not waived.** *"A MANAGER sees exactly what nav-config and the server gates allow; a CASHIER sees none of it"* was verified on the **UI** side by test (the fiscal entry excludes `CASHIER`, and the cashier's module list is asserted unchanged), but not walked through by logging in as each role — that needs two more PINs, and role-gate parity across every route is Batch **4.4**'s own subject. The multi-role walkthrough belongs with the full-day rehearsal in **V-07 / Batch 8.2**. *(record line 964)*
- **(7) The drawer control lives in the fiscal screen, not the POS.** `/api/fiscal/drawer` is MANAGER+, so mid-service use already required a manager; putting it on the admin surface is consistent with that gate. If the operator wants a manager-gated drawer button inside the POS for making change, that is a UX follow-up, not a fiscal one. *(record line 966)*

**Left open:** The MANAGER / CASHIER role walkthrough → Batch 4.4 and V-07 / Batch 8.2 (deferred, not waived); a manager-gated drawer button inside the POS is a UX follow-up, not a finding.

---

## Batch 3.5 — Fiscal audit-trail completeness

**Status:** `COMPLETED` · **Completed:** 2026-09-04 · **Commit:** `83c3cfa` · **Findings:** C-13, M-04 · C-22 (chain-design half) carried forward as `REQUIRES EXTERNAL VERIFICATION`
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.5* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- `Order.discountApprovedById` (nullable, **no FK** — the same choice as `Refund.approvedById`, so a soft-deleted approver cannot take a fiscal record with them), written at `orders/route.ts:321` from the `discountApproverId` the route already had. *(record line 992)*
- Whether an unkeyed chain is sufficient is a certification question, not a code question. Options include keying the chain with a secret the operator cannot read, or anchoring periodic digests externally. **Do not implement either without the answer to V-01.** *(record line 1004)*
- **Warning:** changing an event payload changes its hash — this affects only *new* events; existing rows must not be touched. *(record line 1012)*
- `number` was added to `OrderForRefund` as a **required** field rather than an optional one, so the defect cannot quietly return through a caller that omits it; the route's structural cast was widened to match. *(record line 1014)*
- Existing rows keep the cuid they were sealed with. *(record line 1014)*
- The key is present-and-null on a sale with no approver rather than omitted, because absent is what every pre-3.5 event says and those rows are sealed. *(record line 1029)*
- **The operator must run `bunx prisma migrate deploy` before this code runs on the live install** — without the column, every checkout fails. Recorded in *OPEN THREADS → A and B*. *(done: applied on production and verified 2026-09-04 — the retired row is in the record)* *(record line 1039)*
- The journal now holds two payload vintages and the chain verifies across the boundary; that is a property of chaining on the predecessor's hash rather than on a payload schema, and Batch 3.6 inherits it. *(record line 1043)*
- **(7) The value is stored and journalled but not yet displayed anywhere.** No screen shows who approved a discount, and no report groups by approver. *(record line 1051)*

**Left open:** C-22 chain-design half — `REQUIRES EXTERNAL VERIFICATION` (V-01); T-02, T-05, T-06 → Batch 6.1 (extracting the inline checkout transaction); no screen shows who approved a discount; L-24 → *Newly Discovered Issues*.

---

## Batch 3.6 — Close chain ordering and fiscal document content

**Status:** `COMPLETED` · **Completed:** 2026-09-04 · **Commit:** `042bcbc` · **Findings:** M-01, M-06, M-07 · DD-05 answered
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.6* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- `assertNextPeriod()` in `services/fiscal.ts` refuses any close that is not the period immediately following the last sealed one; the first close is unconstrained. *(record line 1084)*
- The guard runs **before** `aggregatePeriod`, so a refusal touches nothing — a test asserts no row, no `CLOTURE_M` and no consumed sequence number. *(record line 1084)*
- Rate labels come from the breakdown **key** — already minimal form (`"5.5"`, `"10"`) — with the decimal point swapped for a comma; deliberately **not** `toFixed(1)`, which is L-19 and would print a 1,05 % rate as "1,1 %" on a fiscal document. *(record line 1084)*
- `dont TVA` still shows the **stored** `order.vatTotal`, not the recomputed sum: the rows are a derivation, that figure is the fiscal record. *(record line 1084)*
- **(3) The migration rebuilds a table of sealed fiscal documents.** *(record line 1098)* *(Correction, 2026-09-04, Batch 3.6b: it **has** been applied to production — verified read-only. See Open Threads → A.)*
- `renderReceipt` runs at checkout and the stored snapshot is what the reprint path prints, verbatim. Existing `Receipt.content` rows are untouched, which is both correct and unavoidable — an archived receipt is immutable (and see L-14). *(record line 1106)*
- **(6) V-03 is not answered and is not claimed to be.** *(record line 1104)*

**Left open:** L-25, L-26 → resolved in **Batch 3.6b** (2026-09-04); V-03 open (external); L-21 unchanged and not caused here; ~~the migration is unapplied~~ *(Correction, 2026-09-04: applied by the operator — Open Threads → A.)*

---

## Batch 3.6b — Close timing and close columns

**Status:** `COMPLETED` · **Completed:** 2026-09-04 · **Commit:** `545b255` · **Findings:** L-25, L-26 · DD-18 applied
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.6b* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- `assertPeriodEnded()` refuses a period whose exclusive upper bound `now` has not reached, and `assertNoOpenShiftInPeriod()` refuses one holding a still-`OPEN` caisse. *(record, Changes (1))*
- Both guards run **before** `aggregatePeriod` so a refusal writes nothing. *(record, Changes (1))*
- No override: a test pins that FACTICE mode does not unlock one. *(record, Changes (1))*
- The half-open local-time bounds live in `src/lib/period.ts` and both the service and the screen import them — no `node:` imports, so the client bundle takes it. *(record, Changes (2))*
- `buildAnnualArchive` still derives its own year bounds inline and was deliberately left alone: an archive is a read, not a close. *(record, Changes (2))*
- A close sealed before this batch would hash differently from one sealed after — safe here and nowhere else, because **zero closes have ever existed**. A test asserts that premise explicitly before pinning the payload's key list, so if the premise is ever gone the test says so instead of the change going through quietly. *(record, note 2)*
- `totalRefunded` was already in the payload and keeps its name; the column beside it is `refundsTotal`, matching `ZReport`. *(record, note 2)*
- `closeYear` asks **nothing** of the year's twelve monthly closes. Adding that requirement is a decision nobody has taken. A test pins the current behaviour so a future change has to be deliberate. *(record, note 6)*
- Claude cannot run `migrate deploy` against production; the operator's command is in *Open Threads → B*. *(record, note 3)*

**Left open:** L-27 → *Newly Discovered Issues*; the migration `20260904091947_close_refund_totals` is written and rehearsed but **not applied to production** (*Open Threads → A, B*); whether a compliant period close must satisfy further timing rules stays with V-08.

---

# STAGE 4 — SECURITY & INTEGRITY

**Stage status:** `IN PROGRESS` — 4.1 through 4.4 and **4.4b** `COMPLETED` (all 2026-09-04); **4.4c `NOT STARTED`, not blocked**; 4.5 through 4.7 `NOT STARTED`. **4.5 is blocked on DD-08.**

Audit section J, step 5: close the one real privilege-escalation path, stop blocking the event loop, rotate the default credentials, and stop the silent data-loss paths.

## Batch 4.1 — Manager-approval brute force

**Status:** `COMPLETED` · **Completed:** 2026-09-04 · **Commit:** `f14a50c` · **Findings:** C-08
**Record:** `REMEDIATION_RECORD.md` → *Batch 4.1* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- `clientIp()` now returns the constant `"local"` unless `TRUST_PROXY_HEADERS` declares a real proxy, in which case the old precedence is restored exactly. *(record, Changes (1))*
- Five routes key on this one function (`login`, `unlock`, `switch-user`, `profiles`, `approve`), so the bypass closes for all five. *(record, Changes (1))*
- The approve key is `approve:<caller>`, so header rotation cannot reach it even if a later deployment turns `TRUST_PROXY_HEADERS` on. *(record, Changes (2))*
- The lockout is checked **before** the manager loop, so a locked caller cannot make the server run scrypt against every manager. *(record, Changes (3))*
- A refusal records nothing, so hammering the lock cannot extend it. *(record, Changes (3))*
- The caller's account is deliberately **not** locked: `getSession()` treats a live `User.lockedUntil` as session revocation, so writing the lock where login writes it would eject a cashier from the till mid-service, with their caisse still open, every time a manager fumbled five PINs. *(record, Changes (4))*
- Locking every manager was never available either — the PIN is tested against all of them, and any cashier could then take manager approval off the till in twenty-five keystrokes. *(record, Changes (4))*
- `MANAGER_APPROVAL_LOCKED` carries its own action name, so it never inflates the failure count it describes. *(record, Changes (5))*
- **No migration** — nothing was added to the schema, so unlike Batches 3.5, 3.6 and 3.6b this fix is in force the moment the code runs. *(record, Files)*
- `audit()` swallows its own write failures: if the row is never written the count does not advance, and the in-memory limiter is then the only wall. That is why wall 1 was kept rather than replaced. *(record, note 1)*
- A successful approval does **not** reset the count, which login does. *(record, note 2)*
- No real PIN was used anywhere; the scratch accounts had PINs generated for the run. *(record, note 3)*

**Left open:** L-28 and L-29 → *Newly Discovered Issues*; **C-09** (Batch 4.2) is untouched — the approve route still runs `scryptSync` once per manager on the event loop, and this batch only stopped a *locked* caller from reaching that loop; whether the fifteen-minute capability lock is the right operational trade-off at a busy till is an operator judgement nobody has been asked for.

---

## Batch 4.2 — Asynchronous scrypt

**Status:** `COMPLETED` · **Completed:** 2026-09-04 · **Commit:** `4022c9c` · **Findings:** C-09 (T-04 written here as its prerequisite)
**Record:** `REMEDIATION_RECORD.md` → *Batch 4.2* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- Nothing about the KDF moved: same N=2^17, r=8, p=1, same 64-byte output, same `salt:hash` storage, so no stored hash is invalidated and there is **no migration**. *(record, Changes (1))*
- The fallback was `scryptSync(pin, salt, 64)`, i.e. whatever Node's defaults happen to be. It is now `{ N: 1 << 14, r: 8, p: 1 }` explicitly, so a change in a library default cannot silently lock out every pre-hardening account. *(record, Changes (2))*
- Two derivations run at once, thirty-two may wait, and the next is refused with `ScryptBusyError` **before** it starts. *(record, Changes (3))*
- Two rather than the pool's four: the pool also serves file I/O, and two caps derivation memory near 256 MiB. *(record, Changes (3))*
- `withAuth` / `withAuthParams` catch **only** `ScryptBusyError` and rethrow everything else, so no route's existing failure behaviour changes. *(record, Changes (4))*
- `login` and `unlock` spread `hashPin(pin)` straight into Prisma's `data` on the legacy-upgrade path; unawaited that writes the string `"[object Promise]"` into `User.pinHash` and locks the account out at the next login. *(record, Changes (5))*
- `scripts/seed-users.ts` is excluded from **both** `tsconfig.json` and `eslint.config.mjs`, so nothing but reading it catches the same mistake there. *(record, Changes (5))*
- `/api/auth/approve` still verifies managers sequentially. Deliberate: the loop no longer blocks anything, and running the managers in parallel would multiply the 128 MiB footprint by their number. *(record, Changes (6))*
- Refusing is a behaviour change: under a flood of PIN guesses an honest cashier can now be told `503` instead of waiting. *(record, note 2)*
- No real PIN was used anywhere, and the two real rows in the copy were never touched. *(record, note 3)*
- Nothing in the file says whether the two real PINs are legacy-hashed. That is precisely why the fallback had to survive this batch, and why T-04 was made its prerequisite. *(record, note 5)*

**Left open:** L-30 → *Newly Discovered Issues*. **T-04's status stays `NOT STARTED` in Batch 6.1** — the test was written here because 4.2 required it, and 6.1 closes the row, as it does for T-01. The validation criterion "login, unlock, switch-user and manager approval all still work **at the till**" is satisfied only at the route level (*record, note 4*); the till itself is covered by *Hardware-dependent validation*.

---

## Batch 4.3 — Credentials, sessions and network exposure

**Status:** `COMPLETED` · **Completed:** 2026-09-04 · **Commit:** `aac03f6` · **Findings:** C-18 (this batch closed its network half; **the credential half was closed the same day by operator action, so C-18 is ✅ overall** — see *Open Threads → B*), M-23, M-27, M-28
**Record:** `REMEDIATION_RECORD.md` → *Batch 4.3* — specification, the operator's credential policy, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- C-18's evidence blames a missing `-H` in `start.ps1`; **that file does not exist**, so `package.json` — tracked in git — is where the decision can live and where nothing untracked can undo it. *(record, Changes (1))*
- The broken cookie blocked the restaurant's own staff and blocked no attacker. *(record, Changes (2))*
- A non-SUPER_ADMIN self-edit carrying `pin` or `active` is refused in French, and **self-deactivation is refused for everyone**, super administrator included. *(record, Changes (3))*
- Name self-edit still works, and administering *another* account is untouched — which is what the `Utilisateurs` view does. *(record, Changes (3))*
- The counter check is the one that matters, because a script that wipes users and orders cannot rewind `FiscalCounter`. *(record, Changes (4))*
- ~~**The default PINs are untouched by operator decision** — see *Credential policy* — so C-18 is `◐`, not `COMPLETED`.~~ *(record, Changes (4))* — **SUPERSEDED 2026-09-04**: the operator changed both PINs later the same day. The sentence is kept struck rather than deleted because constraints are copied verbatim from the record and the record is append-only; the dated correction sits on the record's Batch 4.3 section.
- Swept unconditionally rather than past a size threshold the way `rate-limit.ts` does, because the two are not the same shape: a rate-limit key is minted by anyone who sends a request, an entry here costs a manager's correct PIN. *(record, Changes (5))*
- It now reads the request header, in a `try`/`catch` because `headers()` throws outside a request scope and a missing device hint must never stop a login. *(record, Changes (6))*
- **No migration** — the schema is untouched; `Session.device` already existed and was simply never filled. *(record, Files)*
- Changing them is an operator action, out-of-band, and **the values must never be written into these documents**. *(record, note 2)*
- Building the check without the screen would add an unreachable branch and a false suggestion in the code that self-service exists. *(record, note 3)*
- A SUPER_ADMIN may still reset their own PIN, deliberately — blocking it would break the only PIN-management surface the product has. *(record, note 4)*
- No real PIN was used anywhere. *(record, note 5)*
- `createSession` calls `cookies()` and `headers()`, which throw outside a request scope, so a unit test could only assert a mock of the very call that was wrong. *(record, note 7)*

**Left open:** ~~**C-18's credential half**~~ ✅ **CLOSED 2026-09-04** — the operator changed both live PINs on the running application the same day; see *Operator actions completed* in *Open Threads → B*, and the dated correction appended to this batch's record section. The values are recorded nowhere. **What replaced it, and is now the live risk:** `scripts/seed-users.ts` deletes every user and recreates `admin` and `manager` with the published default PINs hardcoded, so running it once undoes the change — that is **C-17 / DD-08**, Batch 4.5. **L-31** → *Newly Discovered Issues*. The *Credential policy* block moved to the record with this section; **its PIN half is superseded** by the change above, its network half still governs.

---

## Batch 4.4 — Authorization gating parity

**Status:** `COMPLETED` · **Completed:** 2026-09-04 · **Commit:** `36a9cd9` · **Findings:** C-16, M-24, M-25, M-26; **M-19s `DEFERRED`**; T-03 partly
**Record:** `REMEDIATION_RECORD.md` → *Batch 4.4* — specification, the operating model, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- `canAccessView(role, view)` in `nav-config.ts` is now the single authority, and `app-shell.tsx` renders `<AccessDenied />` instead of the view when it says no. *(record, Changes (1))*
- The check sits in the shell rather than in `initHashSync` because the hash is parsed before the session is known. *(record, Changes (1))*
- Every such default now resolves to `LEAST_PRIVILEGED_ROLE`, which is `CASHIER`. That is the reason DD-07 kept the role in the product: it is the floor the gate falls to. *(record, Changes (2))*
- `backups` was deliberately **not** opened: it holds the restore button, backups already run automatically at the Z close (Batch 2.2), and the manager account is whoever is standing at the till. *(record, Changes (3))*
- `GET` stays open to any authenticated role: the customers view is available to every role and reading a customer is what it is for. *(record, Changes (5))*
- **No HSTS, deliberately**: DD-06 binds the server to `127.0.0.1` over plain HTTP, and `Strict-Transport-Security` would teach the browser to refuse that origin — it would break the till. *(record, Changes (6))*
- A CSP that breaks the POS is worse than one that narrows it. *(record, Changes (6))*
- `withAuth`/`withAuthParams` stamp the gate they declare onto the handler they return (`roleGateOf`), which nothing in the request path reads. *(record, Changes (7))*
- **No migration.** *(record, Files)*
- It asserts the gate each route *declares* — that it is wrapped, and which roles it names. It does not drive requests and assert status codes. *(record, note 4)*
- They are **not** insecure — the handler refuses — but the two idioms mean the declarative matrix cannot see about twenty gates. *(record, note 5)*
- Closing a caisse is deliberately open to any role, per the business rule stated at `reports/z/route.ts:16`. *(record, note 6)*
- Drive the UI at `localhost`: a session cookie set at `http://127.0.0.1:<port>` did **not** persist in the browser, while the same cookie at `http://localhost:<port>` did. *(record, note 9)*

**Left open:** ~~**M-19s** `DEFERRED`~~ ✅ **CLOSED 2026-09-04 in Batch 4.4b** — DD-07's final answer removed `CASHIER`, which gave the fix a no-op cost: `GET /api/settings` and `GET /api/reports/x` were raised to `["SUPER_ADMIN", "MANAGER"]` so read and write agree. **T-03** stays open for Batch 6.1 to close at status level; this batch delivered the declaration-level matrix, and 4.4b strengthened its destructive-route arm from a role exclusion to a pinned role list. **L-32** → *Newly Discovered Issues*.

**Correction, 2026-09-04 (Batch 4.4b).** Two constraints above were true when written and are now superseded; they are struck rather than rewritten, because a constraint is copied from the record and the record is append-only.
1. *"Every such default now resolves to `LEAST_PRIVILEGED_ROLE`, which is `CASHIER`. That is the reason DD-07 kept the role in the product: it is the floor the gate falls to."* — DD-07 was amended again the same day and the role was **removed**. `LEAST_PRIVILEGED_ROLE` is now **`MANAGER`**, one rung weaker. The fail-closed mechanism is unchanged and still refuses `users`, `backups` and `logs` to that floor.
2. *"`GET` stays open to any authenticated role"* still governs `customers`, but note **L-33**: with two roles left, the `["SUPER_ADMIN", "MANAGER"]` gates this batch and its predecessors declared now admit the entire role model, so several read as restrictions they no longer are.

---

## Batch 4.4b — Remove the CASHIER role, close M-19s

**Status:** `COMPLETED` · **Completed:** 2026-09-04 · **Commit:** `<pending>` · **Findings:** M-19s; DD-07 applied
**Record:** `REMEDIATION_RECORD.md` → *Batch 4.4b* — specification, the removal inventory, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **`LEAST_PRIVILEGED_ROLE` degrades from `CASHIER` to `MANAGER`.** C-16's fail-closed default gets weaker by exactly one rung. *(record, the removal itself)*
- Adding a role below MANAGER means changing this constant, not just the enum. *(record, note 3)*
- **Keep the machinery** — `/api/auth/approve`, `approvals.ts`, `manager-approval-dialog.tsx`, and Batch 4.1's lockout — because Batch 4.4c reuses the lockout, and deleting audited work to tidy up is not this plan's habit. Record it as dormant. *(record, the removal itself)*
- `payment-dialog.tsx` keeps its wiring behind a `false` constant so 4.4c hooks into a path that already works, including the post-audit N1 re-entry mechanism. *(record, note 6)*
- The `USER_SWITCH_BLOCKED` audit action it wrote is retired with it; older rows in the journal keep it and must still render. *(record, Changes (4))*
- `nav-access.test.ts` asserts the default can open strictly fewer views than a manager; that assertion must be revisited, not deleted (safety rule 2). *(record, the removal itself — done in note 4)*
- **No migration** — the enum is app-level only, stored as TEXT with no `CHECK` constraint. **Nothing is waiting on the operator**, and production still stands at 6 applied migrations. *(record, note 1)*
- Closing a caisse stays open to any authenticated role. The asymmetry it describes was written for a cashier; widening or narrowing it is a business decision, and this batch deliberately left it alone. *(record, note 8)*
- Rewording it is 4.4c's decision — DD-19 makes it true again with the caller's own PIN — so it is **L-35** rather than a guess made here. *(record, note 7)*
- With one operational role this changes no observable behaviour — which is the point: it removes a latent inconsistency rather than fixing a live leak. *(record, M-19s scope)*

**Left open:** **L-33** (29 declaration sites now name the entire role model, so those gates are no narrower than declaring none — `GET /api/users` and `GET /api/backups` contradict the nav outright), **L-34** (the discount dialog's percentage divides euros by cents) and **L-35** (the discount dialog still promises a manager approval that no longer happens) → *Newly Discovered Issues*. **M-18** is unchanged and still belongs to 5.7. The self-approval gap this batch leaves — a discount of any size and a refund of any amount recorded against the caller with no keystroke — is **Batch 4.4c**'s subject, not a regression.

---

## Batch 4.4c — Step-up PIN for large discounts and every refund

**Status:** `NOT STARTED` · **Decisions:** DD-19 · **Findings:** none — this is a behaviour change the operator asked for

**What exists today.** Above the configured threshold a MANAGER or SUPER_ADMIN
is **silently self-approved**: `orders/route.ts:251` sets
`discountApproverId = user.id` with no prompt and no keystroke, and
`refund/route.ts:87` does the same for a refund of any amount. The record is
therefore not empty — it names the manager as their own approver — but
nothing about the act is deliberate.

**What DD-19 asks for.** The signed-in user re-enters **their own PIN** to
confirm. The control is not distrust of the manager; it is the unattended
till, where today a passer-by can apply a 100 % discount or refund any amount
with no challenge whatsoever.

**Shape.**

- **Discounts:** required above `Setting.discountApprovalThreshold` — the
  existing, configurable value, in Réglages, which the manager can now reach
  after Batch 4.4.
- **Refunds:** required on **every refund, with no threshold** (operator
  decision, 2026-09-04).
- **Both roles.** The same rule applies to SUPER_ADMIN: identical argument,
  and one code path instead of two.
- **It re-authenticates the caller, and must not reuse `/api/auth/approve`.**
  That route tests the PIN against every manager *and forbids self-approval* —
  it was built for a cashier asking a manager, and with one operational role
  it can never succeed. A distinct path is required.
- **It is a new brute-force surface, so it inherits the existing walls.**
  Guessing your own PIN is pointless; guessing the *manager's* PIN through the
  discount dialog at an unattended till is exactly the threat. Reuse
  `approval-lockout.ts` (Batch 4.1) rather than inventing a second lockout,
  and route every derivation through `pin-hash-queue.ts` (Batch 4.2).
- **Journalling.** Decide explicitly whether the confirmed authorisation adds
  anything to the `VENTE` / `REMBOURSEMENT` payloads. If it does, that is a
  **payload vintage change** — *Open Threads → D* applies, and sealed rows are
  never re-serialised.

### Batch 4.4c — Validation Required

- Targeted test: a discount above the threshold without a valid PIN is refused; with one, it proceeds and records the authorisation.
- Targeted test: a refund without a valid PIN is refused **at any amount**, including the smallest.
- Targeted test: a wrong PIN counts toward the existing lockout and does not extend it once locked (Batch 4.1's property).
- Targeted test: the derivation goes through the bounded queue — the event loop is not blocked (Batch 4.2's property).
- Each new test **fails against the pre-batch code**.
- Manual, on a scratch copy through the real routes: discount below threshold unchanged; above threshold prompts; refund prompts; both appear correctly in the journal and the audit log.
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS.

### Batch 4.4c — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 4.5 — Dangerous operator scripts

**Status:** `NOT STARTED`

### C-17 — Two operator scripts silently destroy the audit trail and the catalogue

**Status:** `NOT STARTED` · Severity: HIGH · Category: data loss / documentation

**Problem.** `scripts/seed-users.ts` begins with three unconditional `deleteMany({})` calls. `scripts/seed-category-options.ts` deletes products and wipes every category option group, choice and add-on globally. Neither is transactional; neither is described accurately.

**Evidence.**
```
seed-users.ts:8-10
  db.auditLog.deleteMany({})    ← the entire ISCA audit trail
  db.session.deleteMany({})
  db.user.deleteMany({})

seed-category-options.ts:12-21
  db.optionGroup.deleteMany({ where:{productId} })
  db.productAddon.deleteMany({ where:{productId} })
  db.product.delete({ where:{id} })
  db.categoryOptionChoice.deleteMany({})
  db.categoryOptionGroup.deleteMany({})
  db.categoryAddOn.deleteMany({})
```
`scripts/README.md` calls the first "Standalone user seeding … for ad-hoc repair" and the second "Adds option groups + choices…". Neither description mentions deletion. The header says these are "Safe to delete after running."

**Location.** `scripts/seed-users.ts:8-10`; `scripts/seed-category-options.ts:12-21`; `scripts/README.md`

**Impact.** An operator following the README to repair a login problem destroys the entire audit log. `user.deleteMany` then fails on the Order foreign key — but only *after* the audit rows are gone, with no transaction to roll back. The second script deletes products whose `OrderItem` links are `SetNull`, silently detaching historical order lines from their products.

**Precedent.** The plan already removed `scripts/delete-products.js` for exactly this hazard (`IMPLEMENTATION_PLAN.md:42`); these two were missed.

**Remediation direction.** Add explicit confirmation guards and accurate warnings, or remove the scripts from the shipped tree. Decide which — DD-08.

**Related blind spot.** `scripts/` is excluded from both eslint (`eslint.config.mjs:49`) and tsc (`tsconfig.json:41`), so nine DB-mutating scripts have zero static checking. Consider including them.

### Batch 4.5 — Validation Required

- Manual: running each remaining script without the confirmation flag performs no writes.
- Targeted check: `scripts/README.md` accurately describes what every script deletes.
- Confirm `scripts/port-real-data.ts` is documented (currently omitted — DOC-09).
- If scripts are brought under typecheck/lint, `bun run typecheck` and `bun run lint` — PASS.
- **Do not test these scripts against the production database.** Use a copy.

### Batch 4.5 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 4.6 — Catalogue data-loss paths

**Status:** `NOT STARTED`

### C-24 — Category and product updates delete option groups wholesale and skip invalid entries silently

**Status:** `NOT STARTED` · Severity: HIGH · Category: data loss

**Problem.** Both PUT handlers `deleteMany` the existing option groups and re-create from the request body. A group that fails validation is skipped with `continue` — after the delete has run — and the response is 200.

**Evidence.**
```
categories/[id]:134  tx.categoryOptionGroup.deleteMany({categoryId})
categories/[id]:140  if (!groupParsed.success) continue;   ← old gone, new not created
categories/[id]:172  tx.categoryAddOn.deleteMany({categoryId})
categories/[id]:177  if (!addonParsed.success) continue;
products/[id]:207    tx.optionGroup.deleteMany({productId})
validation.ts:88     options: z.array(optionGroupSchema).default([])
                     → a PUT omitting "options" wipes every option group
```

**Location.** `src/app/api/catalog/categories/[id]/route.ts:134-190`; `src/app/api/catalog/products/[id]/route.ts:207`; `src/lib/validation.ts:88`

**Impact.** A malformed option in an otherwise-valid save silently loses the existing configuration with a success response. The product-side variant is currently latent (the one UI form always sends the full payload) but is a live hazard for any partial update.

**Remediation direction.** Validate the whole payload up front and 400 on any invalid entry before deleting anything. Make `options` absent-means-unchanged rather than defaulting to `[]`.

### C-25 — The media library invites deletion of images that are in use

**Status:** `NOT STARTED` · Severity: HIGH · Category: data integrity

**Problem.** Usage detection covers `Category.icon`, `Product.image` and `OptionChoice.image` only. `CategoryOptionChoice.image`, `CategoryAddOn.image` and `AddOn.image` are counted neither as usage nor cleared on delete. The DELETE handler also writes no audit entry, unlike every other destructive route.

**Location.** `src/app/api/media/route.ts:12-44, 118-162`

**Impact.** Images used by category option choices and add-ons — the ones actually used at this restaurant, per the ported dataset — display as unused, inviting cleanup. Deleting one removes the file and leaves a dangling `/uploads/…` reference, producing broken images in the POS with no audit record.

**Remediation direction.** Add the three missing models to both the usage scan and the reference cleanup, and audit the deletion.

### Batch 4.6 — Validation Required

- Targeted test: a category PUT with one malformed option group returns 400 and leaves the existing groups intact.
- Targeted test: a product PUT omitting `options` leaves the existing option groups intact.
- Targeted test: an image referenced by a `CategoryOptionChoice`, `CategoryAddOn` or `AddOn` is reported as *used* by `GET /api/media`.
- Targeted test: deleting a media file clears references in all six models and writes an audit entry.
- Manual: against a copy of the real dataset, confirm no in-use image is listed as unused.
- Regression: normal category and product editing still saves correctly.
- `bun test src` — PASS. `bun run typecheck` — PASS.

### Batch 4.6 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 4.7 — Transaction and race safety

**Status:** `NOT STARTED`

### C-15 (shift-race half) — Shift state is read outside the transaction

**Status:** `NOT STARTED` · Severity: HIGH · Category: data integrity (race)

*The transaction-timeout half of C-15 is Batch 2.3.* *(Done; record → Batch 2.3.)*

**Problem.** Checkout looks up the open shift at `orders/route.ts:126`, well before `db.$transaction` begins at `:280`. Symmetrically, `generateZReport` computes the report at `reports.ts:124` and only then opens the transaction that closes the shift at `:128`. No row lock, no re-check of `shift.status` inside either transaction; SQLite has no `SELECT … FOR UPDATE`.

**Location.** `src/app/api/orders/route.ts:126-135, 280`; `src/lib/services/reports.ts:115-192`

**Impact.** A sale completing while the manager closes the till is attached to a shift whose immutable Z report has already been generated. The order exists, the money was taken, the `VENTE` event is chained — and the Z report for that shift does not include it. Because the Z is immutable, the discrepancy is permanent.

**Remediation direction.** Re-read and assert `shift.status === "OPEN"` as the first statement inside the checkout transaction. Compute the Z report inside its own transaction, or lock the shift first.

### Batch 4.7 — Validation Required

- Targeted concurrency test: a checkout racing a Z close either lands in the open shift and appears in the Z, or is rejected — never lands silently in a closed shift.
- Targeted test: a checkout against a shift closed between lookup and transaction returns 409, not a committed order.
- Targeted test: an order created during Z generation is either included or rejected.
- Regression: `sequence.test.ts` concurrency cases still pass.
- **Fiscal verification:** after a concurrency run, every order in a closed shift appears in that shift's Z report totals.
- `bun test src` — PASS. `bun run typecheck` — PASS.

### Batch 4.7 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

# STAGE 5 — WORKFLOW GAPS

**Stage status:** `NOT STARTED`

Audit section J, step 6: none of these are subtle; all of them generate support calls in week one.

## Batch 5.1 — Keyboard shortcuts

**Status:** `NOT STARTED`

### C-20 — Every POS keyboard shortcut is dead

**Status:** `NOT STARTED` · Severity: HIGH · Category: confirmed bug (usability)

**Problem.** The matcher compares an optional boolean against an actual boolean without coercion.

**Evidence.** `use-keyboard-shortcuts.ts:32` — `if (s.ctrl !== e.ctrlKey) continue;`. `s.ctrl` is `undefined` for every shortcut registered at `pos-view.tsx:121-141`; `e.ctrlKey` is `false`; `undefined !== false` → `continue`, always. Dead: F1 search, F2/F3/F5 order type, F4 hold, F8 discount, F9 checkout, `/` search, `Shift+?` help. Present since the initial commit `be9113e`; the help dialog at `pos-view.tsx:311-320` lists all of them.

**Location.** `src/hooks/use-keyboard-shortcuts.ts:32-34`; `src/features/catalog/pos-view.tsx:121-141, 311-320`

**Impact.** Speed is the point of a fast-food till. The documented keyboard workflow has never worked, and the in-app help teaches staff keys that do nothing.

**Remediation direction.** `!!s.ctrl !== e.ctrlKey` (and the same for shift/alt).

### Batch 5.1 — Validation Required

- Targeted unit test of the matcher: modifier-less shortcuts fire; `Shift+?` fires only with shift; a shortcut requiring ctrl does not fire without it.
- Targeted test: shortcuts do not fire while focus is in an input, unless `allowInInput`.
- Manual: every key listed in the help dialog performs its documented action at the till.
- `bun test src` — PASS. `bun run typecheck` — PASS.

### Batch 5.1 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 5.2 — Table selection wiring

**Status:** `NOT STARTED`

### C-21 — The table plan is disconnected from the POS

**Status:** `NOT STARTED` · Severity: HIGH · Category: incomplete functionality

**Problem.** `setTableLabel` exists in the cart store and is called from nowhere.

**Evidence.** `grep -rn setTableLabel src/` → exactly two hits, both in `cart-store.ts` (type at `:59`, implementation at `:124`). `tables-view.tsx` imports neither `useCartStore` nor `setView`.

**Location.** `src/store/cart-store.ts:59,124`; `src/features/tables/tables-view.tsx`

**Impact.** `tableLabel` is permanently `""`, so `payment-dialog.tsx:156` always sends `null`. The server's dine-in table auto-link (`orders/route.ts:344-352`) never fires, tables never go OCCUPIED from a sale, receipts never show a table, and held-ticket labels always fall back to "Commande N". The floor plan is a decorative screen. README lists "tables (plan de salle)" as delivered.

**Remediation direction.** Wire a table picker into the POS order bar, or drop the feature from the documentation until it is wired. See DD-09.

### Batch 5.2 — Validation Required

- Manual: selecting a table in the POS carries the label through checkout to the order and the receipt.
- Manual: completing a dine-in sale with a table sets that table OCCUPIED and links `currentOrderId`.
- Manual: a full refund frees the table (existing behaviour at `refund.ts:99-104` — confirm it now actually fires).
- Targeted test: `tableLabel` reaches the order payload and the table auto-link executes.
- Regression: takeaway and delivery orders are unaffected.
- `bun test src` — PASS. `bun run typecheck` — PASS.

### Batch 5.2 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 5.3 — Cross-shift refunds

**Status:** `REQUIRES DECISION`

### C-14 — Yesterday's order can never be refunded

**Status:** `REQUIRES DECISION` · Severity: HIGH · Category: workflow / business rule

**Problem.** The refund route rejects any order whose shift is `CLOSED`, with no override for any role.

**Evidence.** `orders/[id]/refund/route.ts:28-33` — "La caisse attachée à cette commande est déjà clôturée. Remboursement impossible." The comment suggests escalating to a SUPER_ADMIN; no such path exists.

**Location.** `src/app/api/orders/[id]/refund/route.ts:26-33`

**Impact.** A customer returning the next day cannot be refunded through the POS. The workaround an operator will reach for — refunding cash from the drawer without a record — is exactly the untraced correction the fiscal journal exists to prevent.

**Related.** `Refund.shiftId` is populated with the *order's* shift (`refund.ts:83`) despite the schema comment describing it as the shift that issued the refund, and no report reads the column at all.

**Remediation direction (audit).** Allow a cross-shift refund attributed to the *current* open shift, so the cash impact lands in the drawer that actually paid it out.

**Decision required.** See *Design Decisions Required → DD-10*.

### Batch 5.3 — Validation Required

*(Finalise after DD-10.)*
- Targeted test: refunding an order from a previous, closed shift succeeds and is attributed to the current open shift.
- Targeted test: the refund's cash impact appears in the *current* shift's expected cash, not the original shift's.
- Targeted test: the original shift's sealed Z report is **not** modified.
- **Fiscal verification:** the `REMBOURSEMENT` event chains correctly and the period aggregation (Batch 3.2) handles a cross-period refund coherently.
- `bun test src` — PASS.

### Batch 5.3 — Status Record

**Status:** `REQUIRES DECISION` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 5.4 — Held orders and cart lifecycle

**Status:** `NOT STARTED`

### C-23 — Held orders live only in one browser's localStorage and are never cleared on logout

**Status:** `NOT STARTED` · Severity: HIGH · Category: workflow / data

**Problem.** The cart store persists `items` and `heldOrders` to `localStorage` under `hibapos-cart`. There is no held-order API route and no such table. Nothing clears the store on logout, lock, or user switch. The persist config has no `version`/`migrate`.

**Evidence.** `cart-store.ts:69-186`. `clear()` is called from exactly two places — a successful checkout (`payment-dialog.tsx:189`) and the manual "Vider" button (`cart-panel.tsx:369`). `app-store.ts:85-95` logs out without touching the cart.

**Location.** `src/store/cart-store.ts:69-186`; `src/store/app-store.ts:85-95`

**Impact.** Cashier A locks the till mid-ticket; cashier B logs in and inherits A's open cart and A's parked tickets, and books them under B's name. Held tickets are invisible from any other device, vanish if site data is cleared, and survive a Z close — recalling one afterwards books it into the next shift. Because the persist config is unversioned, a cart written before the euros→cents migration (`720660a`) rehydrates its euro values as cents.

**Remediation direction (audit).** Move held orders server-side (they are orders); clear the cart on logout/lock/switch; add a persist `version` with a migration that discards incompatible state.

**Scope note.** The server-side move is a design change — see DD-11. The cart-clearing and persist-versioning parts are unambiguous and can proceed regardless.

### Batch 5.4 — Validation Required

- Manual: logging out, locking, and switching user each clear the in-progress cart.
- Manual: an old-format persisted cart is discarded rather than rehydrated with wrong values.
- Targeted test: the persist version guard rejects an incompatible payload.
- If held orders move server-side: targeted test that a held ticket is visible from a second client and survives a restart; and that a Z close accounts for open tickets coherently.
- Regression: an in-progress cart still survives a page refresh (the behaviour that persistence exists for).
- `bun test src` — PASS. `bun run typecheck` — PASS.

### Batch 5.4 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 5.5 — Cash movements

**Status:** `REQUIRES DECISION`

### M-05 — No cash-movement model

**Status:** `REQUIRES DECISION` · Severity: MEDIUM · Category: missing functionality (fiscal-adjacent)

**Problem.** There is no way to record a cash drop, a payout, or petty cash, so `expectedCash = openingFloat + cash − cashRefunds` will disagree with the drawer whenever real money moves.

**Location.** `src/lib/services/reports.ts:94`; `prisma/schema.prisma` (no model)

**Impact.** Every real cash movement produces a phantom variance, which trains staff to ignore the variance figure — defeating the purpose of C-02's fix.

**Remediation direction.** Add an entrée/sortie de caisse model, journalled, feeding `expectedCash`. Requires a migration and a schema decision — DD-12.

### Batch 5.5 — Validation Required

- Targeted test: a cash-in and a cash-out each adjust `expectedCash` in the right direction.
- Targeted test: cash movements appear in the X and Z reports and in the sealed period aggregation (Batch 3.2).
- **Fiscal verification:** each movement writes a journal event; the chain still verifies.
- Manual: a real drawer count reconciles to zero variance after recording a known drop.
- Migration applied cleanly on a copy of the production database.
- `bun test src` — PASS.

### Batch 5.5 — Status Record

**Status:** `REQUIRES DECISION` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 5.6 — Order cancellation and pre-payment void

**Status:** `REQUIRES DECISION`

### M-08 — Order cancellation is not implemented

**Status:** `REQUIRES DECISION` · Severity: MEDIUM · Category: incomplete functionality

**Problem.** `OrderStatus.CANCELLED` and `PENDING` are read and filtered but **never written by any code path**. Orders are created directly as `COMPLETED`. `shifts/summary` exposes a permanently-zero `cancelledOrders` counter.

**Evidence.** `grep CANCELLED src/` → zero writers. `src/app/api/shifts/summary/route.ts:28`.

**Impact.** There is no pre-payment void. A mistaken order can only be corrected by taking payment and then refunding it — which produces a sale and a correction in the fiscal record where the truth is that no sale occurred.

**Remediation direction.** Decide whether HibaPOS should support a pre-payment order state and a void. If not, remove the dead enum values and the zero counter rather than leaving them to imply a feature. See DD-13.

### Batch 5.6 — Validation Required

*(Finalise after DD-13.)*
- If implemented: targeted test that a void writes an `ANNULATION` event, does not increment the grand total, and does not appear in sales totals.
- If removed: confirm no consumer breaks and the UI no longer implies the state exists.
- `bun test src` — PASS.

### Batch 5.6 — Status Record

**Status:** `REQUIRES DECISION` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 5.7 — POS and catalogue defects

**Status:** `NOT STARTED`

| ID | Status | Problem | Location | Direction |
|---|---|---|---|---|
| **M-19** | `NOT STARTED` | Order-type-specific option modifiers are stored in the generic `priceModifier` slot, so switching order type after adding an item computes the wrong client total — and the server then rejects the checkout with "Paiement incorrect". | `product-options-dialog-v2.tsx:86-98` vs `cart-store.ts:197-202` | Keep the dine-in modifier alongside the resolved one in `CartOption`. Existing tests miss this because they build `CartItem` by hand. |
| **M-17** | `NOT STARTED` | The discount dialog's "% du sous-total" caption divides euros by cents — a 25 % discount displays as "0,3 %", directly above a correctly-computed approval banner. | `discount-dialog.tsx:35` vs `:39` | Use one unit. Same class as C-01/C-02. |
| **M-18** | `NOT STARTED` | A lone manager cannot refund through the UI: the client always opens the PIN dialog, and the server blocks self-approval — while the refund route would have accepted the manager's own session with no token. | `orders-view.tsx:233-238`; `approve/route.ts:121-126`; `refund/route.ts:87-89` | Skip the dialog when `user.role !== "CASHIER"`. |
| **M-20** | `NOT STARTED` | The POS product grid has no error state; an API failure renders "Aucun produit dans cette catégorie". | `pos-view.tsx:43-51, 235-240` | Distinguish empty from failed. The worst false empty state in the app. |
| **M-21** | `NOT STARTED` | Any transient failure of `/api/auth/me` is caught and treated as logged-out, ejecting the cashier mid-service. | `app-store.ts:81-83` | Distinguish a network error from a 401. |
| **M-22** | `NOT STARTED` | A single global error boundary wraps the whole shell; a crash in any view blanks the till. No App Router `error.tsx`. | `app-shell.tsx:115,161`; `src/app/` | Per-view boundaries plus an `error.tsx` fallback. |
| **M-11** | `NOT STARTED` | A 100 % discount cannot be checked out: the total becomes 0, but `payments` requires ≥1 entry with `amount ≥ 1`, and the server demands exact equality. | `orders/route.ts:42-50, 253` | Decide whether a zero-total order is legitimate — DD-14. |
| **M-12** | `NOT STARTED` | The `PERCENT` discount branch's comment says the value is *percent×100*; the code treats it as a plain percent and clamps at 100. Latent — the UI only sends `AMOUNT`. | `orders/route.ts:36, 203-205` | Correct the comment or the code. A client following the comment would apply a 100 % discount. |
| **M-15** | `NOT STARTED` | Options with negative modifiers (or an absolute category price below the base) can drive a line total negative; nothing clamps `unitPrice` at zero. | `pricing.ts:104-124, 164-165` | Clamp or reject. |
| **M-16** | `NOT STARTED` | Item quantity has a lower bound of 1 and no upper bound. | `orders/route.ts:24` | Add a sane maximum. |
| **M-09** | `NOT STARTED` | `ProductAddon` has **zero writers anywhere**. Product-specific add-ons can never be created; `computeLinePricing`'s handling of them is unreachable. | `schema.prisma:119-127`; `pricing.ts:25,134-146` | Either build the write path or remove the dead surface — DD-15. Flagged in section I as possible lost functionality. |
| **M-10** | `NOT STARTED` | `Customer.postalCode` exists in the schema and migration with **zero references in `src/`**, despite the schema comment calling it a French delivery requirement. | `schema.prisma:214` | Either wire it into `customerSchema` and the delivery form, or remove it — DD-15. |

### Batch 5.7 — Validation Required

- Targeted test for M-19 built through the options dialog's own mapping, not a hand-built `CartItem` — the existing tests miss the bug precisely because they bypass it.
- Targeted test: switching order type after adding an item produces a client total the server accepts.
- Manual: the discount dialog's percentage caption matches the approval banner (M-17).
- Manual: a manager alone can complete a refund (M-18).
- Manual: a failed catalogue fetch shows an error, not an empty category (M-20).
- Manual: a transient `/api/auth/me` failure does not log the cashier out (M-21).
- Manual: a crash in one view does not blank the topbar or the POS (M-22).
- Targeted tests for M-15 (no negative line total) and M-16 (quantity bound).
- Regression: `pricing.test.ts` (18 cases) and the cart-store tests still pass.
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS.

### Batch 5.7 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

# STAGE 6 — TESTING

**Stage status:** `NOT STARTED`

Audit section J, step 7: the suite is honest but tests the wrong third. 136 tests pass; **zero touch any of the 59 API routes**, RBAC or sessions. Add coverage where a regression would be invisible and expensive.

*Correction 2026-09-04: the suite is **363** tests since Batch 3.6 (*Open Threads → G*). The claim that no test touches an API route has not been re-audited.*

> Several Stage 1–5 batches specify new tests as their own validation. Those tests belong to their batch. This stage covers the structural gaps that do not attach to a single fix.

## Batch 6.1 — Tests for the things that can lose money

**Status:** `NOT STARTED`

| ID | Status | Gap | Why it matters |
|---|---|---|---|
| **T-01** | `NOT STARTED` | `createBackup` and `restoreBackup` have **zero tests**. The suite proves AES-GCM round-trips a buffer; nothing proves a backup of a real database is produced or restorable. | The most destructive function in the codebase. Directly where C-05 lives. Required by Batch 2.1. *Correction 2026-09-04: T-01 was written in Batch 2.1 (`backup-restore.test.ts`) and extended in 2.2 — record → Batch 2.1. Status left as recorded for Batch 6.1 to close.* |
| **T-02** | `NOT STARTED` | Discount-authorization *enforcement* is untested. The token primitive has 7 tests in isolation; nothing exercises the route branch deciding whether a discount needs one. | A regression accepting an unapproved discount passes 136/136. The classic POS fraud vector. |
| **T-03** | `NOT STARTED` | RBAC has zero tests across 59 routes. Nothing asserts a CASHIER cannot close a shift, reprint, or restore a backup. | Required by Batch 4.4. |
| **T-04** | `NOT STARTED` | The legacy-PIN fallback that broke login in commit `5ef7dc4` is untested. `auth.test.ts` only feeds `verifyPin` a freshly-generated strong hash; no test supplies a legacy N=2^14 hash, and the re-hash-on-login upgrade is untested. | **Required before Batch 4.2.** A regression re-locks every pre-hardening account out of the till. *Correction 2026-09-04: T-04 was written in Batch 4.2 as its prerequisite (`src/lib/auth-legacy-pin.test.ts`, 6 cases) and proved to bite — deleting the legacy fallback fails 2 of the 6 — record → Batch 4.2. Status left as recorded for Batch 6.1 to close, as for T-01.* |
| **T-05** | `NOT STARTED` | Order-level money assembly is untested — subtotal → discount → VAT breakdown → payment reconciliation. `orders/route.ts:290` `addToVatBreakdown` on `netLineTotal` is never asserted. | Where C-11, C-12 and M-13 live. |
| **T-06** | `NOT STARTED` | No transaction-rollback test. Nothing proves a mid-checkout failure leaves no orphaned order, payment, sequence gap or fiscal event. | The failure mode most likely to break gapless numbering in production. |
| **T-07** | `NOT STARTED` | Concurrency tests cover only counter increments via in-process `Promise.all`. Nothing tests two simultaneous checkouts, a double Z close, or concurrent refunds on one order. | Required by Batch 4.7. |

### Batch 6.1 — Validation Required

- Each new test **fails against the pre-fix code** and passes after. A test that passes both ways proves nothing.
- `bun test src` — PASS, with the new total recorded.
- Test runtime remains acceptable (baseline 25.9 s; scrypt-heavy tests dominate). *Correction 2026-09-04: about 192 s on the developer's machine with `--timeout 30000` — see L-24.*
- No test writes outside the temp database — re-verify the `test-setup.ts:34` redirect still holds.

### Batch 6.1 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 6.2 — Remove misleading tests

**Status:** `NOT STARTED`

| ID | Status | Problem | Location |
|---|---|---|---|
| **T-08** | `NOT STARTED` | Six tests certify dead code. `validation.test.ts:34-89` exercises `checkoutSchema`, which no route uses — the live route validates with a differently-shaped inline `checkoutIntentSchema`. A reader concludes checkout input is validated; it is validated by nothing. | `src/lib/validation.test.ts:34-89` |
| **T-09** | `NOT STARTED` | Two tests cannot fail: `receipt.test.ts:109` asserts a refunds section is absent while passing `refunds: []`; `:142` asserts `not.toThrow()` on a call already made successfully two lines above. `cart-store.test.ts` is ~80 % a restatement of `cart-store-math.test.ts` (4 of 5 cases assert identical values). | `src/lib/services/receipt.test.ts:109,142`; `src/store/cart-store.test.ts` |

**⚠ Safety rule 2 and 3 apply.** These tests are being removed because they assert nothing, **not** to make anything pass. Removing them must not reduce real coverage. If `checkoutSchema` itself is removed (L-02), that is a Stage 7 cleanup item — do the test removal and the dead-code removal together or not at all.

### Batch 6.2 — Validation Required

- For each removed test, record what it asserted and why that assertion was vacuous.
- Confirm no *real* behaviour loses its only coverage — grep for another test covering the same function before removing.
- `bun test src` — PASS, with the new total recorded and the delta explained.

### Batch 6.2 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 6.3 — E2E and CI safety

**Status:** `NOT STARTED`

| ID | Status | Problem | Location | Direction |
|---|---|---|---|---|
| **T-10** | `NOT STARTED` | `playwright.config.ts` runs `bun run dev` against the real `.env`, so the e2e suite writes orders, refunds and Z closes into the **production database** — into an append-only hash chain that cannot be cleaned up. `reuseExistingServer: true` also hijacks a running dev server. | `playwright.config.ts:22-23` | Point e2e at a disposable database with its own env. **Until this is done, `bun run test:e2e` must never be run.** |
| **T-11** | `NOT STARTED` | The e2e suite is not re-runnable: `03-shift-flow.spec.ts:97-113` opens a shift and never closes it, so the next run's `POST /api/shifts` gets 409 where it expects 200. Credentials are hardcoded `admin`/`123456`. Euro-era arithmetic survives (`02:60`, `02:91`, `02:95`) and passes by luck. *Correction 2026-09-04: the operator changed both live PINs, so those hardcoded credentials **no longer authenticate at all** — every spec now fails at login rather than at the assertions described here. Do not read that failure as a regression in the application.* | `tests/e2e/*.spec.ts` | Make specs self-cleaning and seed their own credentials. |
| **T-12** | `NOT STARTED` | No CI exists. No `.github/`, no pipeline config anywhere. Tests run only when someone remembers. All "lint 0 errors · tsc exit 0 · N tests pass" claims in `IMPLEMENTATION_PLAN.md` rest on manual local runs. | repo root | Add CI running `typecheck`, `lint`, `bun test src` — and e2e only after T-10. Depends on the repo being pushed (P-01). *Correction 2026-09-04: P-01 was done in Batch 0.2; the repository is on `origin/main`.* |
| **L-06** | `NOT STARTED` | `vitest@^3` is a devDependency with no config and no script. Running `bunx vitest` bypasses the `bunfig.toml` preload that redirects `DATABASE_URL`, and four test files begin by wiping 17 tables. | `package.json`; `bunfig.toml:8-9`; `test-setup.ts:34` | Remove the `vitest` devDependency, or add a hard guard in `test-setup.ts` asserting the DB path is a temp path. Prefer both. |

### Batch 6.3 — Validation Required

- Run the e2e suite twice in a row against the disposable database: both runs pass (proves re-runnability).
- Confirm `db/custom.db` hash is unchanged by an e2e run.
- Confirm a guard exists that aborts any test run whose `DATABASE_URL` is not a temp path.
- CI green on a clean checkout.
- `bun test src` — PASS.

### Batch 6.3 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

# STAGE 7 — CLEANUP AND DOCUMENTATION TRUTH

**Stage status:** `NOT STARTED`

Audit section J, step 8. Correct the false statements, remove the dead weight, then rotate secrets.

## Batch 7.1 — Documentation corrections

**Status:** `NOT STARTED`

Do **not** correct these before the corresponding fix lands — a document that describes the intended state is more dangerous than one that is visibly stale. Each row records the correct action.

| ID | Status | Claim | Reality | Action |
|---|---|---|---|---|
| **DOC-01** | `NOT STARTED` | `README.md:10` "SQLite via Prisma ORM (WAL)" | Rollback journal (header byte 18 = 1) | True after Batch 2.3; verify then leave. *Correction 2026-09-04: Batch 2.3 made this conditionally true — true off a synced folder, false on one (*Open Threads → D*).* |
| **DOC-02** | `NOT STARTED` | `docs/SQLITE_WAL.md:26-27` "the production `start.sh` now runs `sqlite3 … journal_mode=WAL`" | `start.sh` deleted in `0aeea30`; `start.ps1` has no sqlite3 call | Rewrite to describe the real mechanism after Batch 2.3. |
| **DOC-03** | `NOT STARTED` | `.zscripts/README-windows.md:51` "initializes automatically … in SQLite WAL mode on first launch" | Nothing applies WAL; init only happens when the DB file is absent | Rewrite after Batch 2.3. |
| **DOC-04** | `NOT STARTED` | `README.md:76` "105 tests" | 136 at audit time | Update to the real number after Stage 6. |
| **DOC-05** | `NOT STARTED` | `README.md:97` "restauration sécurisée" | Restore does not restore images and is non-atomic | True after Batch 2.1. |
| **DOC-06** | `NOT STARTED` | `README.md:107` "`public/uploads/` → Images téléchargées (non commité)" | 134 files tracked; `.gitignore:62` ignores `/upload/`, a different empty directory | Decide whether uploads should be tracked (DD-16), then make the doc match. |
| **DOC-07** | `NOT STARTED` | `.env.example:20-21` `BACKUP_LOCATION` override | Read nowhere | True after Batch 2.2. |
| **DOC-08** | `NOT STARTED` | `README.md:31`, `.env.example:9`, `README-windows.md:46` show a relative `DATABASE_URL` | The live `.env` uses an absolute Windows path | Make the docs match the decided convention (DD-02). |
| **DOC-09** | `NOT STARTED` | `scripts/README.md` documents 8 scripts and describes two destructively-wrong | 9 files; `port-real-data.ts` undocumented; `inspect-product.ts` takes no argument; the "not `src/lib/db`" note is contradicted by `fix-duplicate-product-options.ts:1` | Rewrite with Batch 4.5. |
| **DOC-10** | `NOT STARTED` | `README.md:112-113` role table | Understates cashier privileges (shift open/close have no role gate); "suppression définitive" — no hard-delete path exists | Make the table match the enforced matrix after Batch 4.4. |
| **DOC-11** | `NOT STARTED` | `README.md:80` reports list; `README.md:90` SUPER_ADMIN fiscal duties; `README.md:95` "tables (plan de salle)" | VAT/cashiers/products reports and all fiscal functions have no UI; tables cannot be attached to an order | True after Batches 3.4 and 5.2. |
| **DOC-12** | `NOT STARTED` | `IMPLEMENTATION_PLAN.md` — Phase 1 "✅ COMPLETE (NF525/ISCA)"; `:63` cites two deleted migrations; `:162` claims `VatBreakdown` is `Record<string,…>` (it is `Record<number,…>` at `money.ts:35`); `:164` claims the printer default was fixed (both seed paths still write "Epson TM-m30"); `:144` justifies `X-Real-IP` by a Caddy proxy the same document deleted at `:120`; `:256` says 50 route files (59); `:38` vs `:123` contradict each other on 0f/4f; `:33` cites a git-history archive path that does not exist | Historical record. **Do not rewrite history** — append a correction note, and never mark compliance complete on the basis of code alone. |

Also in scope: `src/lib/db.ts:24` cites "IMPLEMENTATION_PLAN.md → Batch C C-C2", a section that does not exist; `src/lib/services/fiscal.test.ts:8` cites `vitest.setup.ts`, renamed in `c1cbe03`; `src/lib/http-rate-limit.ts:6-14` and `src/lib/services/backup.ts:12-19` carry rationale that no longer holds.

### Batch 7.1 — Validation Required

- Every corrected claim re-verified against the code at the time of correction, not against another document.
- No claim of French fiscal or legal compliance is added or retained on the basis of this remediation (safety rule 13).
- Cross-check that each DOC item's prerequisite batch is `COMPLETED` before the doc is updated.

### Batch 7.1 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 7.2 — Dead code and dependency removal

**Status:** `NOT STARTED`

| ID | Status | Item | Location |
|---|---|---|---|
| **L-01** | `NOT STARTED` | `src/lib/logger.ts` (72 lines) is dead — zero imports. Note the app has two other logging paths. | `src/lib/logger.ts` |
| **L-02** | `NOT STARTED` | `checkoutSchema`, `orderItemSchema`, `paymentSchema`, `CheckoutInput`, `OrderItemInput` are dead — referenced only by tests. Remove together with T-08. | `validation.ts:129-182` |
| **L-03** | `NOT STARTED` | `z-ai-web-dev-sdk@^0.0.18` — zero imports; an unaudited 0.0.x package in a system handling fiscal data. | `package.json` |
| **L-07** | `NOT STARTED` | Unused exports: `useIsMobile` (whole file), `GROUP_LABELS`, `formatNumber`, `formatTime`, `apiFetch`, `fromCents`, `limitOr429`, `ensureGrandTotal`, `getSetting`, `setSetting`. | various |
| **L-08** | `NOT STARTED` | Duplicated helpers missed by the Phase 7 extraction: `statusBadge` ×2, `formatBytes` ×2, three overlapping variance helpers. | `orders-view.tsx:96`; `dashboard-view.tsx:52`; `backups-view.tsx:41`; `media-view.tsx:45`; `shifts-view.tsx:58`; `reports-view.tsx:55,62` |
| **L-12** | `NOT STARTED` | Four files carry a UTF-8 BOM before `"use client"`; both seed paths still write `printerName: "Epson TM-m30"`. | `error-boundary.tsx`, `home-dashboard.tsx`, `audit-view.tsx`, `login-screen.tsx`; `services/seed.ts:243`; `prisma/seed.ts:127` |
| — | `DEFERRED` | 27 of 51 shadcn `ui/*` components are orphaned, keeping ~20 dependencies transitively alive (`@dnd-kit/*`, `@tanstack/react-table`, `date-fns`, `@hookform/resolvers`, `recharts`, `cmdk`, `vaul`, `input-otp`, `react-day-picker`, `react-resizable-panels`, and many `@radix-ui/*`). Template residue, not deletion evidence — **except `@dnd-kit/*`**, see M-09/section I. | `src/components/ui/` |

### Batch 7.2 — Validation Required

- `bun run build` — PASS after every removal.
- `bun test src` — PASS with an explained count delta.
- `bun run typecheck` — PASS. `bun run lint` — PASS.
- Manual smoke: every screen still renders after the dependency removals.
- Confirm no removed export had a runtime-only consumer (dynamic import, string reference).

### Batch 7.2 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 7.3 — Secret rotation

**Status:** `REQUIRES DECISION`

**Prerequisite: every other Stage 7 batch complete.**

| ID | Status | Item |
|---|---|---|
| **L-04** | `NOT STARTED` | `.next/standalone/.env` is a stale build artifact carrying **live secret values** and a Linux `/home/z/…` DB path. Treat as a leaked-secret event. |
| **SEC-ROT** | `REQUIRES DECISION` | Rotate `SESSION_SECRET` and `BACKUP_ENCRYPTION_KEY`. **Rotating `BACKUP_ENCRYPTION_KEY` orphans every existing backup permanently** — there is no key id or envelope encryption. See DD-04. |

**⚠ Order matters.** Rotating the backup key before the retained backups are re-encrypted or superseded destroys the ability to restore any of them. Rotating `SESSION_SECRET` invalidates all sessions and all outstanding approval tokens — do it outside service hours.

### Batch 7.3 — Validation Required

- Confirm the stale `.next/standalone/` tree is gone and does not regenerate with secrets.
- After `SESSION_SECRET` rotation: all users can log in; existing sessions are invalidated; approval tokens issued before rotation are rejected.
- After `BACKUP_ENCRYPTION_KEY` rotation: a **new** backup is created and successfully restored before the old key is discarded. Old backups' status is explicitly recorded (retained-but-undecryptable, or re-encrypted, or discarded — per DD-04).
- Never record any secret value in this file, in a commit message, or in a log.

### Batch 7.3 — Status Record

**Status:** `REQUIRES DECISION` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

# STAGE 8 — FINAL VALIDATION

**Stage status:** `NOT STARTED`

Audit section J, step 9. Nothing here is a code change; all of it is proof — with the exception of P-04 below, which is a deliberate data operation.

## Batch 8.0 — Pre-go-live fiscal reset

**Status:** `NOT STARTED` · Must run **before the restaurant's first real sale**, and can never be run after one.

### P-04 — Reset the fiscal journal for a clean opening

**Status:** `NOT STARTED` · Category: pre-production data operation · **Decided by the operator, 2026-09-03**

**Why.** The live database carries development test trading: **20 orders, 21 payments, 20 receipts, 3 shifts, 2 Z-reports, 2 fiscal events** and a `GrandTotal` of 54,80 €, all created while building the app — the restaurant has never run HibaPOS. Opening on that state would make the first genuine receipt **#21**, sitting in a journal behind twenty tickets that never happened, with a grand total that never was.

**Decision (operator, 2026-09-03).** Keep the database and the catalogue; delete the trading data — orders, order items, payments, receipts, refunds, shifts, Z reports, fiscal events, grand total, monthly/annual closes and fiscal archives — and reset `FiscalCounter` to zero, immediately before go-live.

**What must be KEPT.** Categories, products, option groups, option choices, add-ons, product images, customers, tables, users and settings. The catalogue is real work recovered in commit `0c5ede6`; only the trading is fake.

**Hard constraints.**
1. **Timing is the whole safety property.** This runs once, before the first real sale. From that sale onwards the chain is append-only and a reset becomes precisely the deletion the attestation in `docs/attestation-conformite.md` states is impossible.
2. Take a full backup first, verify it opens with `scripts/decrypt-backup.ts`, and keep it out-of-band.
3. It must be a written, reviewed script — **not** an ad-hoc `deleteMany` at a console, and not one of the existing unguarded seed scripts (C-17).
4. Record the before/after row counts and the reset counters in this plan, the way the Batch 0.2 baseline was recorded. *(The Batch 0.2 Baseline Record is in `REMEDIATION_RECORD.md` → Batch 0.2.)*
5. Re-verify `/api/fiscal/verify` afterwards: an empty chain must report `ok` with `lastSequence: 0`.

**Related.** `settings.factice` exists precisely so test transactions are stamped as simulations and can never be mistaken for real ones. It is currently `false`, which is why the development sales look genuine. Consider setting it `true` for any further testing on the live machine before go-live, and `false` at opening.

**Dependencies.** Deployment (Batch 1.4) and the printer sign-off (Batch 1.3) should be settled first — otherwise the commissioning itself would put new test sales into the freshly reset journal.

## Batch 8.1 — Live database verification

**Status:** `NOT STARTED`

| ID | Status | Task |
|---|---|---|
| **V-04** | `NOT STARTED` | Verify the live database directly — chain continuity, `FiscalCounter` alignment against `max(number)` of orders/shifts/Z reports, orphan rows, and whether `_prisma_migrations` matches the squashed baseline. Deliberately out of scope for the read-only audit. Note `scripts/fix-fiscal-counter.ts` exists in the tree, which suggests counter drift has occurred before. |
| **V-05** | `NOT STARTED` | Compare the final state against the Batch 0.2 baseline: row counts, chain `lastSequence`, grand-total figures. Every difference must have a recorded explanation. *(Baseline Record: `REMEDIATION_RECORD.md` → Batch 0.2.)* |

### Batch 8.1 — Validation Required

- `/api/fiscal/verify` reports `ok` for events, monthly closes and annual closes.
- `FiscalCounter` values are ≥ the maximum issued number in every corresponding table, with no duplicates.
- No orphan `OrderItem`, `Payment`, `Refund` or `Receipt` rows.
- Every difference from the Batch 0.2 baseline is explained in writing. *(Baseline Record: `REMEDIATION_RECORD.md` → Batch 0.2.)*

## Batch 8.2 — Restore rehearsal and full-day trading

**Status:** `NOT STARTED`

| ID | Status | Task |
|---|---|---|
| **V-06** | `NOT STARTED` | Restore rehearsal onto a clean machine: database and images both come back; product images render in the POS; the fiscal chain verifies. |
| **V-07** | `NOT STARTED` | A full day of trading in FACTICE mode on the real hardware: open shift, mixed order types, split payments, discounts with approval, refunds, reprints, drawer opens, X report, Z close, automatic backup, then a month close. |

### Batch 8.2 — Validation Required

- Every receipt printed physically and legibly at 80 mm (contingent on DD-01).
- Every drawer open occurred physically and appears in the journal.
- The Z report reconciles to the counted drawer with a variance the operator can explain.
- The FACTICE stamp appears on every ticket and every event carries `factice: true`; confirm none of the day's data is mistakable for real fiscal data.
- Power-cut simulation mid-shift: the app returns on reboot, the open shift is intact, no partial order exists.
- `/api/fiscal/verify` reports `ok` at the end of the day.

## Batch 8.3 — External compliance review

**Status:** `REQUIRES EXTERNAL VERIFICATION`

Revisit the compliance question with a certification body and a qualified French tax professional — **not with this document, and not with `IMPLEMENTATION_PLAN.md`'s checkboxes**. See *External / Legal / Fiscal Verification* below.

### Stage 8 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

# EXTERNAL / LEGAL / FISCAL VERIFICATION

**Nothing in this plan, and no test result produced by it, constitutes evidence of French fiscal or legal compliance.** The audit deliberately did not offer a compliance opinion, and neither does this document.

The repository ships `docs/attestation-conformite.md`, a fill-in-and-sign editor's attestation. It cites art. 441-1 of the code pénal, which makes a false attestation a criminal offence. The accuracy of its ISCA section should be settled by a qualified party **before anyone signs it**.

| ID | Status | Question for external verification |
|---|---|---|
| **V-01** | `REQUIRES EXTERNAL VERIFICATION` | Is an **unkeyed SHA-256 chain** sufficient for the inalterability requirement, or is a keyed/signed scheme or external anchoring expected? Anyone who can write to the database file can recompute the whole chain and `/api/fiscal/verify` will report `ok`. (C-22) |
| **V-02** | `REQUIRES EXTERNAL VERIFICATION` | Does the annual archive format satisfy the archiving requirement, and what integrity property must its checksum actually have? (C-04) |
| **V-03** | `REQUIRES EXTERNAL VERIFICATION` — **partially acted on 2026-09-04, still open** | What must a compliant receipt contain — per-rate VAT breakdown, TVA number, software identification, others? (M-06) **Batch 3.6 added the per-rate VAT breakdown and the TVA number** on the operator's own determination, the same footing as V-14. That is not an answer to this item: whether anything further is required — software identification in particular — is unresolved, and no compliance claim rests on the work (safety rule 13). |
| **V-08** | `REQUIRES EXTERNAL VERIFICATION` | What must a compliant Z report and period close contain, and how must refunds and corrections be presented? (M-07, C-10) |
| **V-14** | **DETERMINED BY THE OPERATOR 2026-09-03** — professional sign-off optional, no longer blocking | **Which VAT rate applies to which product?** The operator researched this and gave the determination recorded in *VAT rate policy* below: **two rates are in use — 10 % standard, 5,5 % for drinks in a sealed can or bottle** — and the restaurant **sells no alcohol**, so 20 % is not currently used. Batch 3.1c implements exactly that. Claude did not derive the classification and does not certify it (safety rule 13); it is recorded as the operator's own determination. A confirmation from whoever files the TVA remains available but nothing waits on it. |
| **V-09** | `REQUIRES EXTERNAL VERIFICATION` | Retention: the archive notice states six years. What must actually be retained, in what form, and does the current backup arrangement satisfy it? Interacts with DD-04. |
| **V-10** | `REQUIRES EXTERNAL VERIFICATION` | Is certification by a body, or self-attestation, the applicable route for this software and this operator? No certificate, test report or certifying-body reference exists in the repository. |
| **V-11** | `REQUIRES EXTERNAL VERIFICATION` | Are the legal citations in `docs/attestation-conformite.md` current and correctly applied — art. 286-I-3° bis CGI, art. 1770 duodecies CGI, *Loi n° 2026-103 du 19 février 2026 art. 125*, BOI-TVA-DECLA-30-10-30, BOI-LETTRE-000242? The audit recorded these verbatim and did **not** evaluate them. |
| **V-13** | `REQUIRES EXTERNAL VERIFICATION` | Must the JFP carry an `OUVERTURE_TIROIR` entry for **every** physical opening of the cash drawer, including the automatic kick on a cash tender? Batch 1.3 journals the traced *manual* open only, on the reasoning that the `VENTE` event already records the cash payment. If every opening must appear, the automatic kick needs its own event. (C-03, C-27) |
| **V-12** | `REQUIRES EXTERNAL VERIFICATION` | Do the *operator's* processes — archive custody, retention, attestation signing — meet the requirement independently of the software? |

**Rule:** `IMPLEMENTATION_PLAN.md:54` marks "Phase 1 — ISCA / NF525 compliance — ✅ COMPLETE". That marking is not supportable from the code and must not be treated as an answer to any question above.

---

# NEWLY DISCOVERED ISSUES

Record anything found *during* remediation that is outside the current batch's scope. Do not fix it in that batch (safety rule 10).

Open rows only. A row resolved by a batch moves, unchanged, to `REMEDIATION_RECORD.md` → *Resolved findings* when that batch completes (seven rows moved there on 2026-09-04: L-13, L-15, L-16, L-17, L-18, L-20, L-23).

| ID | Date | Found during | Description | Severity | Assigned to batch |
|---|---|---|---|---|---|
| **L-35** | 2026-09-04 | Batch 4.4b | **The discount dialog still promises a manager approval that no longer happens.** `discount-dialog.tsx:74-80` renders an amber banner above the threshold — « Remise supérieure à {threshold}%. Un manager doit approuver lors de l'encaissement. » — and after Batch 4.4b removed the CASHIER arm of the server gate, nobody is asked for anything: the caller is silently recorded as their own approver. The statement is false for the interval between 4.4b and 4.4c. It was **recorded rather than reworded on purpose**: DD-19 makes it true again with different words (the caller re-enters *their own* PIN, not a manager's), so choosing the replacement wording is 4.4c's decision, not a guess made while removing a role (safety rules 10 and 11). Note the banner's own trigger, `needsApproval`, computes the percentage **correctly** — it is three lines from L-34's defect and does not share it. | LOW (operator-facing text; wrong for one batch's duration) | 4.4c |
| **L-34** | 2026-09-04 | Batch 4.4b manual validation | **The discount dialog displays the discount percentage 100× too small, dividing euros by cents.** `discount-dialog.tsx:35` computes `percent = Math.round((value / subtotal) * 1000) / 10`, where `value` is in **euros** (the file's own comment at :28-29 says so — `apply()` calls `toCents(value)`) and `subtotal` comes from `computeCartTotals` in **cents**. Observed in this batch's browser walkthrough: a 1,20 € discount on a 3,00 € subtotal — a genuine **40 %** — displayed as « **0.4**% du sous-total ». Three lines below, `handleChange` gets the same arithmetic right (`(v / (subtotal / 100)) * 100`), so the amber threshold banner fires correctly while the number beside it does not. Pre-existing and unrelated to the role removal; it matters more after Batch 4.4c, because that batch makes this threshold the trigger for a PIN prompt and the operator will be reading this figure to predict it. Same class as C-01: a unit confusion in a money path. | MEDIUM (misleading figure on the control the operator uses to judge a discount) | 4.4c or 5.7 |
| **L-33** | 2026-09-04 | Batch 4.4b | **With one operational role removed, every gate naming `["SUPER_ADMIN", "MANAGER"]` now admits the entire role model — it is no narrower than declaring no roles at all.** Measured after the removal: **29 declaration sites across 26 route files**, including `POST /api/reports/z` (closing the day) and `POST /api/orders/[id]/reprint` (a journalled REIMPRESSION). Nothing regressed — these gates were never wider than they are — but a reader now cannot tell a deliberate restriction from a decorative one, and `api-authorization.test.ts` had been asserting exactly that property via `not.toContain("CASHIER")`, which the removal made vacuous (the test was rewritten to pin each declared list instead). **Two sites are sharper than the rest:** `GET /api/users` and `GET /api/backups` both answer **200** to a MANAGER whose nav entry for those views is deliberately SUPER_ADMIN-only (DD-07), so the API contradicts the navigation. Verified on a scratch copy: `GET /api/users` returns ids, usernames, names, roles and active flags — **no PIN hashes** — and `GET /api/backups` returns the backup list. `GET /api/logs` correctly returns 403 and is the shape the other two should match. This is the same defect class as M-19s at two routes M-19s did not name. Deciding which of the 29 should narrow to `["SUPER_ADMIN"]` is a review, not a mechanical fix. | MEDIUM (authorization declarations no longer mean what they read as; two contradict the nav) | 6.1 or 7.2 |
| **L-32** | 2026-09-04 | Batch 4.4 | **Role gating uses two idioms, and only one is visible to the T-03 matrix.** About twenty routes declare their gate as `withAuth(handler, { roles })`; about twenty others admit any authenticated caller at the wrapper and then refuse inside the handler with `if (user.role !== "SUPER_ADMIN") return 403` — `POST /api/backups`, `DELETE /api/backups/[id]`, `POST /api/users` and `PUT /api/settings` among them. **Neither group is insecure**: the inline checks work. The cost is that `api-authorization.test.ts` cannot see the second group, so the declaration-level matrix is complete only for the first, and a future route copying the inline pattern inherits that blind spot. Converting them is mechanical but **user-visible**: the inline guards answer « Réservé au super administrateur » while `withAuth` answers « Accès refusé », so a conversion changes the message an operator reads on every one of those routes. Do it as one deliberate change with the message decided, not incidentally. The test pins which idiom each destructive route uses in the meantime. | LOW (test coverage blind spot; no live exposure) | 6.1 or 7.2 |
| **L-31** | 2026-09-04 | Batch 4.3 | **`POST /api/seed` reports any catalogue-seeding failure as a won race.** The catalogue step is wrapped in `catch { return … "Base initialisée (requête concurrente)." }`, so every error — not just a genuine concurrent request — is reported to the operator as success. Observed during this batch's validation: on a copy whose users were empty but whose catalogue was intact, `seedCatalogAndSettings` threw on duplicate category names and the route answered `200` with that message. The two bootstrap users *were* created, so the C-18 behaviour under test was unaffected, but an operator seeing that message cannot tell a real race from a catalogue that failed to seed. Narrower after this batch — the new freshness guard refuses most databases that could reach it — but the swallow-everything catch is still there. Distinguish the P2002 unique-constraint case from the rest, as the users branch above it already does. | LOW (misleading operator message on a bootstrap path) | 5.7 or 7.1 |
| **L-30** | 2026-09-04 | Batch 4.2 | **The unknown-username burn at login competes for the bounded PIN queue, so username enumeration can push honest cashiers to `503`.** `login/route.ts:52` runs a full `hashPin("dummy")` for an unknown user, on purpose, to flatten the timing signal that would otherwise enumerate accounts. Batch 4.2 put that derivation inside the concurrency bound, which is where it belongs — unbounded it is the memory-exhaustion path C-09 names. The residue is that the login rate limit is keyed `login:<ip>:<username>` and, since Batch 4.1 correctly stopped believing the proxy headers, `<ip>` is the constant `"local"`: each distinct username is its own bucket and nothing caps how many buckets a caller can mint. Measured on a scratch copy: **60 simultaneous logins with 60 unknown usernames → 34 served, 26 refused `503`**, and a legitimate login arriving inside that window would have been among the refused. Candidate fixes: a global (not per-username) budget for the unknown-user path, a cheaper constant-time burn, or binding the login limiter to something the caller cannot vary. Interacts with **DD-06** — if the app binds `127.0.0.1` the reachable surface shrinks to the till itself. | MEDIUM (availability of the login screen under a LAN-side flood) | 4.3 |
| **L-28** | 2026-09-04 | Batch 4.1 | **`test-setup.ts` clears a stale `-wal` and `-shm` beside the test database but not a stale `-journal`.** The preload deletes `test.db`, `test.db-wal` and `test.db-shm` before `prisma db push` recreates the file (`test-setup.ts:27`). The test DB runs in rollback-journal mode, so the sidecar it actually produces is `test.db-journal` — and a run killed mid-transaction leaves one behind. Observed this session: a runaway test loop was stopped and left a 21 KB `test.db-journal` next to a deleted `test.db`. SQLite treats a journal beside a database as *hot* and tries to roll it back into the new file, so the failure mode is a confusing lock or corruption error on the **next** run, attributed to whatever code that run happened to touch. One extra path in the existing delete loop. | LOW (test infrastructure; misattributed failures) | 6.1 |
| **L-29** | 2026-09-04 | Batch 4.1 | **`limitOr429` is exported from `http-rate-limit.ts` and called from nowhere.** Every route reaches for `clientIp` + `rateLimit` directly and builds its own 429 response, so the helper meant to standardise that is dead code — and it embeds the same key shape (`<ip>:<parts>`) whose IP component was the C-08 bypass. It inherits Batch 4.1's fix because it calls `clientIp`, so there is no live risk; the hazard is a future route adopting it and reintroducing an IP-keyed limit without noticing. Either use it everywhere or delete it. | LOW (dead code in a security-relevant module) | 7.2 |
| **L-27** | 2026-09-04 | Batch 3.6b (L-25) | **The open-caisse guard is scoped to caisses *opened inside* the period, so one opened earlier and still open does not block the close.** DD-18 defined the rule that way and Batch 3.6b implemented it as written rather than widening it. The residual path is narrow but real: sealing any period other than the first requires the previous one to be sealed, and a caisse opened in that previous period would itself have blocked it — so the only way through is the **first-ever close**, with a caisse opened before the period, still open, and carrying orders inside the period. Those orders *are* counted (the aggregation keys on `Order.createdAt`, not on the shift), so the figures are right; what is missing is the guarantee that the period's last Z report exists before the period is sealed. Widening the rule — to any caisse still open at sealing time, or to any caisse holding an order inside the period — is a decision, not a bug fix. | LOW (narrow path; figures correct, reconciliation guarantee incomplete) | needs a decision — before 8.0 |
| **L-24** | 2026-09-04 | Batch 3.5 baseline | **`bun test src` fails 23 tests on a machine this slow, with no code defect involved.** All 23 are timeouts against Bun's 5 s default: 22 in `backup*.test.ts` and 1 in `auth.test.ts`. Measured cause — `scryptSync` at N=2^17 costs **~1519 ms** per call here (N=2^16 costs ~727 ms), and a backup→restore round trip performs several: the archive encrypt, the pre-restore safety-snapshot encrypt, and the decrypt. The cascade that follows is misleading: the test times out, `afterEach` deletes the temp directory, and the still-running `VACUUM INTO` then reports `unable to open database` (SQLITE_CANTOPEN, P2010), which reads like a filesystem or Prisma fault and is not one. `bun test src --timeout 30000` → **340 pass, 0 fail**. Whole-suite runtime is ~192 s against the 25,9 s the plan recorded for the same suite, so this is machine state, not a regression. Established on the untouched pre-batch commit `e86c5e4`. Options: raise the timeout in `bunfig.toml`, or lower the scrypt cost in test runs only — the second must not touch the production KDF parameters. | LOW (test infrastructure; hides real failures behind noise and costs a session an hour to diagnose) | 6.1 |
| **L-22** | 2026-09-03 | Batch 3.1d | **Validation errors reach the French UI as untranslated English zod messages.** `settings/route.ts` returns `parsed.error.issues[0]?.message`, and `settingsSchema` defines custom messages for only a few fields, so the operator saw `Too big: expected number to be <=48` (L-20). That specific message is now unreachable, but any other out-of-range settings value produces the same class of output. Applies to other schemas in `validation.ts` too. | LOW (operator-facing text) | 7.1 or 3.4 |
| **L-21** | 2026-09-03 | Batch 3.1b manual validation | **`renderReceipt()` centres but never wraps, so an over-long field overflows the paper.** A receipt rendered at the corrected 48 columns still contained a **56-character** line: the restaurant's real address, `23 Grande Rue 45210, 45210 Ferrières-en-Gâtinais, France`. On 48-column paper that wraps mid-address on every ticket. Distinct from L-14, which is about *archived* 80-column receipts — this is new output at the correct width. Affects any long `restaurantAddress`, `restaurantName` or `footerNote`. | MEDIUM (every printed ticket, once the printer is live) | 3.4 or with L-20 |
| **L-19** | 2026-09-03 | Batch 3.1 consumer verification | **The VAT breakdown table renders rates with `toFixed(1)`, which cannot show a two-decimal rate.** `report-widgets.tsx:76` renders `Number(r).toFixed(1) + " %"`, so 10 % displays as "10.0 %" (cosmetic) and a Corsican/overseas rate such as 1,05 % would display as "1.1 %" — a wrong rate on a fiscal report. Pre-existing and **improved** by Batch 3.1 (before the fix, 1,05 % was keyed "1" and lost entirely), and unreachable while every product is at 10 %. Recorded so 3.2/3.4 does not preserve it. Note the display layer, not the key, is what needs fixing. | LOW (latent display defect; not reachable today) | 3.4 or 7.1 |
| L-14 | 2026-09-03 | Batch 1.3 loopback validation | **Receipts archived before L-13 was fixed are 80 columns wide and cannot fit the paper.** Every existing `Receipt.content` row (checked #18, #19, #20) has a widest line of 80 characters, because `renderReceipt` was fed the millimetre value. 80 mm paper fits 48 columns at Font A and 64 at Font B, so **reprinting any pre-fix ticket will wrap**. Re-rendering them is **not** an option — an archived receipt is an immutable fiscal artifact and the reprint path must print it verbatim. Options are to accept wrapped legacy reprints, or to print pre-fix receipts in a condensed font. Affects reprints only; new receipts render at 48 once `receiptWidth` is saved. | LOW (cosmetic, legacy rows only) | 7.1 or accept |
| DOC-15 ⚠️ **half-resolved 2026-09-03** | 2026-09-03 | Batch 1.3 decision prep | **The documented printer is not the configured printer.** `IMPLEMENTATION_PLAN.md:15` names the *Sunso WTP-801*; the live `Setting` row says `printerName = "Epson TM-m30"`. **The operator confirmed on 2026-09-03 that the physical device is the Sunso WTP-801 and that it has an Ethernet port** — so the documentation is correct and the *stored setting value is wrong*. Nothing reads `printerName`, so this is cosmetic; the operator should correct the value in Réglages. Left open until that is done. | LOW (stale data value) | operator action |
| DOC-14 | 2026-09-03 | Batch 1.2 | `src/components/pos/product-options-dialog-v2.tsx:110` computes `lineTotal = Math.round((unitPrice + addonsTotal) * qty * 100) / 100` and passes it to `formatEuro` at `:368-369`. `productUnitPrice()` returns integer cents (`cart-store.ts:225`) and add-on prices are cents, so `Math.round(cents * qty * 100) / 100` is exactly `cents * qty` — the displayed figure is **correct**, but the `* 100 / 100` is vestigial euros-era rounding that reads like a cents/euros confusion in a money path. Remove it or replace with a comment. | LOW (code clarity, not a defect) | 7.2 |
| DOC-13 | 2026-09-03 | Batch 1.1 | `src/lib/approvals.ts:17` documents `ApprovalPayload.amount` as `// euros`. Every caller passes and verifies **cents** (`orders-view.tsx` → `/api/auth/approve` → `refund/route.ts:72`, and `payment-dialog.tsx` for discounts). Comment only — the code is unit-consistent and correct — but it is a misleading comment in the module that binds money to an approval, i.e. exactly the class of comment that produced C-01. | LOW (documentation) | 7.1 |

---

# DEFERRED / LOW PRIORITY

Retained with their audit IDs. Revisit after Stage 8.

| ID | Status | Item | Location |
|---|---|---|---|
| **L-05** | `DEFERRED` | `output: "standalone"` is built but never used; the bundle is missing `.next/static` and most of `public/`, so it would not run. Drop it or fix it. | `next.config.ts:4`; `.zscripts/start.ps1:25` *Correction 2026-09-04: Batch 2.4 removed the stale tree and dropped `output: "standalone"`; what remains deferred is whether Batch 1.4 reinstates it deliberately (record → Batch 2.4).* |
| **L-09** | `DEFERRED` | Touch-target regressions from the Phase 10 pass: `h-9 min-h-[48px] w-9` (48 px tall, 36 px wide); a 28 px "Ouvrir" button on the blocking no-shift banner. | `payment-dialog.tsx:340`; `pos-view.tsx:451` |
| **L-10** | `DEFERRED` | `aria-label` coverage absent from shifts, reports, orders, dashboard, settings, logs, audit and four dialogs, despite the Phase 10 claim. | `src/features/**` |
| **L-11** | `DEFERRED` | Two payment tolerances disagree (`paid < total - 1` vs `paid < total - 0.01`, both on integer cents); dialog resets run on uncleaned 200/350 ms timers. | `payment-dialog.tsx:86,128,377`; `product-options-dialog-v2.tsx:60` |
| — | `DEFERRED` | 27 orphaned shadcn `ui/*` components and their ~20 transitive dependencies. Template residue. | `src/components/ui/` |
| — | `DEFERRED` | `src/app/api/route.ts` returns `{"message":"Hello, world!"}`, unauthenticated. Remove or convert to a health check (in scope for Batch 3.4). | `src/app/api/route.ts` *Correction 2026-09-04: done in Batch 3.4 — it is now a liveness probe.* |
| — | `DEFERRED` | `src/app/api/catalog/categories/[id]/options/` is an empty route segment predating the repo reset. Compare against the historical project before removing. | — |
| — | `DEFERRED` | `scripts/` is excluded from both eslint and tsc — nine DB-mutating scripts with zero static checking. Considered in Batch 4.5. | `eslint.config.mjs:49`; `tsconfig.json:41` |

---

# FINDINGS REQUIRING VERIFICATION OR POSSIBLY OVERSTATED

Kept per the instruction not to drop a finding because of disagreement. None was removed.

| ID | Note |
|---|---|
| **C-16** | Real, but its *practical* severity is bounded: the server side was audited route by route and holds. This is exposure and confusion, not direct compromise. Do not let that reduce its priority — the restore button is behind it. |
| **C-11** | The VAT report's rounding defect is real, but `/api/reports/vat` currently has **no client caller** (C-27). Its practical reach is therefore zero *today* and full as soon as Batch 3.4 wires the fiscal UI. Fix it before wiring, not after. *Correction 2026-09-04: both done — C-11 fixed in Batch 3.2, the VAT report wired in Batch 3.4.* |
| **M-12** | Latent only. The UI sends `AMOUNT`, never `PERCENT`. Real risk is to any future client that follows the comment. |
| **M-15**, **M-16** | Theoretical until someone crafts the input. Both are cheap to fix; neither is urgent. |
| **M-27** | The replay window after a restart is documented and consciously accepted in `approvals.ts:22-28`. Only the unbounded set growth is unambiguously a defect. |
| **DOC-04** | The README undercounts tests (105 vs 136). Stale, not inflated — the direction of the error is worth noting. |
| **Audit section I generally** | The git history **cannot** answer whether files were accidentally deleted: the repo was re-initialised at `be9113e` and the claimed pre-v0 archive path does not exist. All "possibly missing" items are inferences from orphaned code, not from deletion evidence. Compare against the historical 3 GB project before acting on any of them. |

---

*Plan created 2026-09-03 from the baseline audit of commit `5ef7dc4`. No application code was modified in its creation.*
*Split into working plan and evidence record on 2026-09-04 (record: `REMEDIATION_RECORD.md`, extracted at commit `5f0c2b1`). Every line of the pre-split file survives verbatim in one of the two files or in the record's retired-lines section.*
