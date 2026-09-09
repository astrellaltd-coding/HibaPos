# HibaPOS France — Remediation Plan

Master source of truth for the controlled remediation of HibaPOS France.
Derived from the read-only baseline audit of 2026-09-03 (repo at commit `5ef7dc4`).

Detailed audit record: https://claude.ai/code/artifact/329316b0-3a6b-48b0-9d27-d815004f4cbf

---

## CURRENT PROJECT STATUS

**Overall:** NOT READY FOR PRODUCTION

**Current Stage:** **Stages 0 and 2 through 7 are all COMPLETED** — **Stage 2 reopened 2026-09-06 for 2.5** (the restore could not complete on Windows) and closed the same day; Stage 3 reopened three times that day (3.7, 3.8/3.9, 3.10) and closed each time. Stage 1 is partly done — 1.1, 1.2, **1.3b**, **1.3c**, **1.4b** and **1.4c** COMPLETED, **1.3 and 1.4 both `IMPLEMENTED — TESTING REQUIRED`**, waiting only on the till. **Stage 8 is `IN PROGRESS` — 8.1 `COMPLETED` 2026-09-06**; 8.0 and 8.2 wait on the commissioning session, 8.3 is external. C-22's chain-design half stays `REQUIRES EXTERNAL VERIFICATION` (V-01) and V-03 is open. Per-batch dates: the completion history in `REMEDIATION_RECORD.md`.

**Current Batch:** none. **3.12 closed L-68 on 2026-09-09**, end to end — the migration and the category rates were applied by the operator the same day, and the live journal now shows the same 7 Up at **10 % sur place (#37)** and **5,5 % à emporter (#38)**. **Where the project actually is: not installed, § 6 not run, nothing traded.** The delivery plan changed on 2026-09-08 and is no longer one hand-over evening — a copy goes to the restaurant for a **three-day parallel trial** with the owner's **old till as the system of record** and **FACTICE ON**, then the feedback is worked here and the final copy is installed over AnyDesk. `CLAUDE.md` rule 6 carries the same statement.

**Last Batch:** **3.12, 2026-09-09** — L-68, VAT not varying by order type. **Its lesson is *Methods → Run the thing*, and the session learned it twice.** The worked example on real data came back 10 % for both order types; the code was right and the **build was stale** — `.next` compiled at 22:27, `pricing.ts` edited at 00:15 — and only the arithmetic (takeaway VAT should be 8, the response said 14) exposed it after every test had passed. Then the same shape again on the till: two sales still showed 0,08 € because the categories' old 5,5 was sitting in the column that now means *sur place*, exactly as the batch item said it would. Before it, **5.8, 2026-09-08** — the catalogue editor writing inherited option groups back onto the product. Records → those batches.

**Next Batch:** **5.9 — menus composés (combos)**, specified 2026-09-09 and `NOT STARTED`. **3.12 was its prerequisite and is done.** Read **`docs/politique-ventilation-tva.md`** first: it is the VAT allocation policy agreed with the operator, with the nine worked cases computed by the application's own `apportion()` and `splitVat()`. The batch section carries every ruling — prices, compositions, the higher-rate fallback, supplements outside the forfait, no combo inside a combo, and what the ticket prints. **One thing is genuinely open and it is not code:** the accountant has not confirmed the allocation *method*. The rates are settled; the division of a forfait between them is the claim that is not. **Also still ahead:** § 0b's install, § 6's reset and the chain-key arming, 1.3's `[HW]` and 1.4's `[MACHINE]` criteria, and 8.2's V-07.

**Blocked:** the `[HW]` / `[MACHINE]` criteria of **1.3 and 1.4**, and **8.2's V-07** — nothing else. All three need a human at the till; everything around them is built. See *Hardware-dependent validation* for exactly what remains.

**Awaiting decision:** **nothing** — the table is empty (record → *Answered design decisions*).

**Last Updated:** 2026-09-09 (session 21 — **5.8**, **3.12**, and 5.9 specified). Carry forward: (0) **A unit test on an extracted rule proves the rule, not that anything calls it.** Both batches this session shipped that gap and both were caught by reverting the WIRING rather than the logic. (1) **Run the thing, and check the arithmetic against the answer.** 3.12's worked example ran against a build compiled before the fix; nothing but the number said so. (2) **A fallback that is safe by design is also silent by design** — 3.12's nullable column spared every existing row and thereby hid the operator's un-done step until the data was read. (3) **A repair script that exists is evidence of a cause nobody removed.** (4) Earlier sessions' lessons stand in the record.

### OPEN THREADS — read this before starting a batch

*Updated through **2026-09-07**, twice — the second time by the de-stale pass after 1.3b and 1.3c. **B, C and G moved then**: **B** gained the address correction and now holds **four** operator actions, all inside `docs/mise-en-service.md`; **C** narrowed again, because 8.2's V-06 is done and only V-07 waits on hardware; **G** — tests 934 → **963**, and the e2e figure was corrected from 13 to **12**, which is what the spec files have defined since Batch 6.3. **A is unchanged and every row in it was re-measured** on 2026-09-07 and still holds. **E** was trimmed to a pointer. This thread records the CURRENT state, not its history: each batch's account of what it moved is in that batch's record section.*

Work in this plan does not finish batch-by-batch. Several completed batches
shipped a mechanism whose **benefit is not yet delivered**, and several items
are waiting on somebody or something outside the code. A session that starts
by opening the next batch will miss all of it.

#### A. Shipped but NOT yet in effect on the production install

These are done in code, validated, and committed — and change nothing on the
real till until an action below is taken. Do not report them as delivered.

| What | Why it is inert | Unblocked by |
|---|---|---|
| **WAL journal mode** (2.3) | Byte 18 is still `1`: the guard refuses WAL on a OneDrive-synced path. **Batch 1.4 measured the other half** — the same database under a non-synced root came up `2` as soon as the app opened it. | Running `install-windows.ps1 -Apply` (built in 1.4), then any restart |
| **`BACKUP_LOCATION`** (2.2) | Honoured but **unset** — backups land beside the database, same disk. | Choosing a second volume at deployment |
| **`HIBAPOS_DATA_DIR`** (2.2) | Defaults to the old layout on purpose. **1.4 built and rehearsed the mover**; setting it in `.env` is the remaining manual step. | `install-windows.ps1 -Apply`, then editing `.env` |
| **Thermal printing + drawer** (1.3) | `printerEnabled` is `false`, no printer IP set. A reprint journals `REIMPRESSION`, then reports *"Impression désactivée…"* | Commissioning on the real Sunso WTP-801 — runbook § 4 |
| **FACTICE simulation mode** (3.1b) | The switch exists in Réglages but is **off**, so any pre-go-live testing is journalled as genuine trading. **It does NOT keep a sale out of the journal** — nothing can; it stamps the ticket and flags the row so 8.0 deletes it cleanly. | The operator turning it on — runbook § 3, before anything is rung up |
| **Audit-log retention** (2.4) | Deliberately `0` = keep forever; unbounded. **8.0 does not clear it either** — deleting an audit trail is what this app forbids everywhere else. | An operator decision, if an obligation appears |
| **The keyed fiscal chain** (3.9) | Built and tested, and **`FISCAL_CHAIN_KEY` is set on no machine**, so the chain is plain SHA-256 exactly as before. Arming it on a journal that already has history is refused by design. | **Batch 8.0's reset**, then the five steps in P-04 — in that order |
| **The `Clôture du jour`** (3.8) | Shipped and reachable, and **zero day closes exist on production**: the trading data there is development trading that P-04 deletes. The operator has never run one. | The first real trading day, after go-live |

#### B. Waiting on the operator

**Both live PINs were changed 2026-09-04 (C-18) and both secrets rotated 2026-09-07 (SEC-ROT).** **No PIN or secret value was ever seen by Claude, and none is recorded here, in the record or in any commit. Do not ask for them and do not write them down.** The lesson is enforced in code: `PUBLISHED_DEFAULT_PINS` in `src/lib/auth.ts`, refused by `scripts/seed-users.ts`.

| Action | Why it matters | Related |
|---|---|---|
| ~~Rotate `SESSION_SECRET` and `BACKUP_ENCRYPTION_KEY`~~ | **✅ DONE 2026-09-07**, by the operator with `scripts/rotate-secrets.ts`. **Verified**: both values are now 64 hex chars, the app signs in under the new secret, and the 2026-08-28 backup that decrypted hours earlier now **fails** — which is the proof. `FISCAL_CHAIN_KEY` untouched. The pre-rotation `.env` at `C:\HibaPOS-secrets-backup\` — **copied off the machine by the operator 2026-09-07** — is the only way the three old backups will ever open. Record → *Batch 7.3*. | SEC-ROT, L-04, DD-04 |
| ~~**Correct the address in Réglages**~~ **✅ DONE 2026-09-07** | `restaurantAddress` reads `23 Grande Rue 45210, 45210 Ferrières-en-Gâtinais, France` — **the postcode appears twice**, once inside the street line. The operator asked for it corrected on 2026-09-07 to `23 Grande Rue, 45210 Ferrières-en-Gâtinais, France`. **Claude cannot write it** (CLAUDE.md rule 3); rehearsed on a scratch copy, where two things were measured: at **50 characters it still exceeds the paper** (1.3b is why that is now harmless), and **saving also persists `receiptWidth` 80 → 48**. | L-21, L-20, DOC-15 |
| ~~Correct `printerName` in Réglages~~ | **✅ DONE 2026-09-07** — reads `Sunso WTP-801`. Verified read-only. **DOC-15 closed.** | DOC-15 |
| ~~**Apply Batch 3.11's migration**~~ **✅ DONE 2026-09-07, verified** | `bunx prisma migrate deploy` — adds `lineNetTotal` and `lineHt` to `OrderItem` (L-58, BOFiP § 50). Two `ADD COLUMN`s, no table rebuild; rehearsed with a fingerprint diff whose only difference was the `_prisma_migrations` row. **Claude cannot run it** (CLAUDE.md rule 4). Command and checks: Batch 3.11's status record. | L-58 |
| Choose a second volume for backups | See A. | C-06 |
| Turn FACTICE on for any pre-go-live testing | See A. | L-18 |

#### C. Waiting on hardware / deployment

Covered by the deferral policy below: Batch 1.3's `[HW]` criteria — **which now also carry 1.3b's and 1.3c's**, since the ticket wraps and only a real print settles what the printer does with a line it cannot fit — the four `[MACHINE]` criteria of Batch 1.4, and **8.2's V-07 alone**. *(Narrowed 2026-09-07 from "all of Batch 1.4, and Batch 8.2": 1.4 defers four criteria, not all of it, and 8.2's **V-06 is COMPLETED**.)*

#### D. Ordering constraints between batches

- **Batch letters are labels, not an order** — Stage 3 ran out of numerical
  order and nothing was renumbered, because the finding index is what maps an
  audit ID to its batch.
- **Batch 1.4 carries the deployment step** that activates WAL,
  `BACKUP_LOCATION` and `HIBAPOS_DATA_DIR` — the inert items in A.
- **`IMPLEMENTATION_PLAN.md` is a historical record**: nothing above its
  Appendix D may be edited, and a claim that was false when written but is true
  today is recorded as **both** (Batch 7.1).
- **The rotation is done** (*Open Threads → B*). What survives it as an ordering rule: **the new `.env` must be the one carried to the till**, and L-05 is why — the old values very likely sit in OneDrive still.
- **Batch 8.0 / P-04** (pre-go-live fiscal reset) must run **after** 1.3 and
  1.4 — otherwise commissioning puts fresh test sales into the journal that
  was just reset. Its scope grew in session 3: the journal now also contains
  `CLOTURE_M`, `CLOTURE_A`, `ARCHIVE_GENEREE`, `OUVERTURE_TIROIR` and
  `REIMPRESSION` events whenever the operator exercises the new fiscal screen,
  plus any `FiscalArchive` rows and files.
- **The journal holds events of TWO payload vintages, and only two.** Batch 3.5
  changed two shapes: `VENTE` gained `discountApprovedById`, and `REMBOURSEMENT`
  / `ANNULATION` changed `orderNumber` from a cuid to the ticket number. Older
  rows keep what they were sealed with and **must never be re-serialised to
  match** — their hashes cover the old bytes, and the chain verifies across the
  boundary (proved on a copy of production). Anything reading a payload — an
  archive reader, an inspection export, Batch 3.6's document work — must
  tolerate both. **Batches 4.4c, 4.7, 5.3 and 5.5 added no third vintage.**
- **The sealed close payloads grew five times and every one of them was free only because ZERO closes existed.** **3.8 was the last free change** — it added the fifth shape, `DailyClose`, and the `CLOTURE_J` event type: it landed 2026-09-06 and **from the first real close every one of these shapes is fixed for good.** `close-timing.test.ts` pins the key list and has caught an unannounced change before — edit it deliberately, never to make a run go green. `CLOTURE_M` and `CLOTURE_A` event payloads have never been touched. Which batch added which field: record → *Retired open-thread rows*.

- **A new event TYPE is not a new vintage.** Batch 5.5 added `MOUVEMENT_CAISSE`
  — a shape nobody had before, not a changed shape of something old — so a
  reader tolerating the two vintages is still complete. A reader that
  **enumerates** types is not. Two such enumerations exist, `src/lib/fiscal.ts`
  and `src/types/api.ts`, and 5.5 first updated only the server's.
- **L-14** is unresolved by choice: receipts archived before Batch 2.2 are 80
  columns wide and will wrap when reprinted on 48-column paper. They must
  **not** be re-rendered — an archived receipt is immutable.

#### E. Open questions recorded for others to answer

**V-13** and **V-02** are open fiscal questions, stated in full in *External / Legal / Fiscal Verification* below.

#### G. Current baselines — check these before trusting anything

*(F was retired on 2026-09-05 and its instruction moved into Batch 7.1, which is what has to act on it. The letters are not renumbered: other sections cite them by letter.)*

| Thing | Current value, each with the date it was last measured |
|---|---|
| Tests | **1007 pass, 0 fail** (997 before Batch 1.4c, 993 before 1.4b, 992 before 7.7, 986 before 7.6, 976 before 7.5, 967 before 3.11, 963 before `readme-counts.test.ts`, 943 before Batch 1.3c, 934 before 1.3b, 923 before 2.5, 891 before 1.4, 879 before 3.10), **and STABLE since Batch 6.3** — three consecutive whole-suite runs with no flake, where before it the suite failed about 2 runs in 5. **L-43 is FIXED, so a `shift-race.test.ts` failure is now a REAL failure**: investigate it. Do not re-run and dismiss it — that instruction stood here until 2026-09-05 and is withdrawn. **e2e: 13 passed — MEASURED 2026-09-07 by running the suite**, the first time it has been run in this project, and pinned since by `readme-counts.test.ts`, which counts `auth.setup.ts` because Playwright does. *(A de-stale pass the same day "corrected" 13 to 12 and was wrong; the history is in the record's *Retired open-thread rows*.)* **`bun run test:e2e` is SAFE** (6.3, T-10). **`readme-counts.test.ts` counts DECLARATIONS plus declared EXPANSIONS**, so a test generated by a loop must be declared there — 1.4c's guard was the third, and the failure message says so rather than inviting a one-digit edit. Whole-suite runtime **105–125 s**; a run of 296–422 s with the same 0 failures is **L-24**, not a defect; **`bun run test` carries the timeout itself since 7.4c**. Two sessions may now run the suite at once (warning 3b) |
| Production DB sha256 | **`d09369c09dd9b4515c78af31118e8dc47516e74c0ab4d41e2bc4d93c5e54b16b`** (mtime 2026-09-07 15:33:56, **704 512** bytes) — **Batch 3.11's migration, applied by the OPERATOR** 2026-09-07 and verified read-only: 10 migrations, counters 20/3/2/2 and `GrandTotal` unmoved in every field, all four chains `ok` (recomputed with the app's own verifier), `integrity_check` ok, no FK errors, journal byte 18 still `1`, and **the fingerprint diff against the pre-migration snapshot is one line, the `_prisma_migrations` row** — the third time a migration here has done that (5.7a, 3.8, 3.11). Snapshot: `../db-snapshots/custom.db.pre-3.11.2026-09-07T11-53-44Z`. Earlier the same day the operator's Réglages save moved it `c9f26516…` → `58781596…`; the only thing outside the fingerprint since is one `SESSION_LOCKED` audit row. Earlier lineage is in the record |
| Fiscal chain | `/api/fiscal/verify` → **all FOUR chains** `ok` since Batch 3.8 added the daily one, `lastSequence: 2` on production. **UNKEYED, and that is current and correct** — Batch 3.9 built the keyed mode and `FISCAL_CHAIN_KEY` is set on no machine; arming is P-04's step. **Zero monthly and annual closes have ever been sealed** — which is why M-01's guard, DD-18's timing rules and the payload changes of L-26 **and Batch 5.5** could all be imposed with nothing to accommodate. Re-verified read-only 2026-09-04 |
| Fiscal counters | `20/3/2/2` (receipt / shift / Z / event) — and **Batch 8.1 verified the whole live database read-only on 2026-09-06: 27 checks pass, no counter drift, no orphans, no migration drift** (`docs/verification-8.1-2026-09-06.txt`). Re-verified **2026-09-06 after Batch 3.8's migration** — a schema change moves no counter, and every batch write this session went to a scratch copy. `DailyClose` holds **zero rows** on production |
| Migrations | **9 applied on production**, latest `20260906153622_daily_close_and_perpetual_totals` (Batch 3.8), applied by the operator 2026-09-06 17:49. **None pending** — `prisma migrate status` says *Database schema is up to date*. Batches 4.1 through 4.4b added none — 4.4b's enum removal was measured with `prisma migrate diff` and emits an empty migration |
| Catalogue | 78 products — 17 drinks at **5,5 %**, 61 at 10 %. **Intact through 8.0's rehearsal**: all 14 preserved tables unchanged |
| Accounts | **two, and that is now the product's whole role model**: `manager` (MANAGER) and `admin` (SUPER_ADMIN, the developer's). Both PINs changed 2026-09-04. `CASHIER` was **removed in Batch 4.4b** — zero rows carried it, confirmed read-only first. `LEAST_PRIVILEGED_ROLE` is therefore `MANAGER`, one rung weaker than before | **Since Batch 4.4c both accounts must re-enter their own PIN** for a discount above 20 % and for every refund; five wrong PINs lock both operations for 15 minutes, on the same counter as the (now callerless) manager approval
| Out-of-band snapshots | **Four**, all in `db-snapshots/` **outside the repo tree**, taken before 3.1c, 3.5, 3.6b and 5.5. Filenames and hashes: record → those four batches |

### Hardware-dependent validation (policy set 2026-09-03)

**⚠ THIS SECTION'S PREMISE EXPIRED ON 2026-09-07** and the paragraph explaining why is in the record. In short: the software is fit to ship — 1.4 built the installer, launcher and update path, 8.0's reset script is rehearsed, and `docs/mise-en-service.md` is the ordered session. **What is deferred is now only what a human must physically watch:**

**Still deferred, and still not markable `COMPLETED` on automated evidence:**
- **1.3's `[HW]`** — a real print at 48 columns, a real drawer kick, real paper-out behaviour, and confirming the box is a Sunso WTP-801. **Since 1.3b/1.3c the ticket wraps**, so the print also settles what this printer does with an over-long line, which no test here can (1.3b note 2). Validated meanwhile against a mock ESC/POS printer on loopback.
- **1.4's `[MACHINE]`** — cold reboot, supervisor restart, the Scheduled Task registration itself, and a full shift-to-Z cycle after a reboot. Everything else in 1.4 was rehearsed on a scratch install, including the data move and the launcher's refusals.
- **8.2's V-07** — a full day of trading on the real hardware. **V-06, the restore rehearsal, is DONE** (Batch 2.5 fixed what it found).

**One consequence for triage, and it has now arrived.** For months nothing here had a live audience: no operator read its screens, no sale was real, every defect was found by us — which made it defensible to carry a user-visible defect rather than guess. **That expires at the commissioning session. Re-triage every open finding whose severity was discounted for want of an audience.** **L-21 is CLOSED** (1.3b) **and so is L-63, its remainder** (1.3c), both 2026-09-07. **The rest of that re-triage has not been done.**

These are **deferred, not waived.** Stage 1 cannot be declared complete, and no claim of production readiness may rest on the loopback evidence.

### Immediate warnings for any session picking this up

1. The repo **is** pushed: `origin/main` is `astrellaltd-coding/HibaPos`, and every session should leave its own commits pushed (warning 9 for the rule). Do not run `git clean`, and do not delete the working tree without checking `git rev-list --left-right --count origin/main...HEAD` first.
2. **`bun run test:e2e` is SAFE since Batch 6.3 and this warning is lifted** — it prepares its own disposable database under temp, refuses to start if that path is not disposable, runs `next start` (never `next dev`, which would load the real `.env`) on port 3100, and its **first spec reads `GET /api/auth/profiles` back and fails the suite if a production operator answers**. **`CLAUDE.md` rule 2 contradicted this until 2026-09-07 and now agrees**; remove any of the three protections and both documents go back. **`bunx vitest` is still forbidden — warning 3.** Full history: record → *Retired open-thread rows*.
3b. **Two sessions can now run `bun test src` at once — Batch 6.3 fixed this.** The test database path is per-run (`os.tmpdir()/hibapos-test-db/run-<pid>-<time>`), so one run cannot destroy another's, and a guard aborts any run whose `DATABASE_URL` is not under temp. **What is still true**: two sessions would both edit this file and `REMEDIATION_RECORD.md`, and an append-only audit trail is the worst place to resolve a merge conflict; and warning 9's `EPERM` interaction applies. **Safe in a second session:** read-only measurement, decision briefs, reviewing a finished diff.

3. **`bunx vitest` now REFUSES to run, and that is enforced rather than asked for.** `vitest.config.ts` throws at import (Batch 6.3, L-06): vitest does not read `bunfig.toml`, so it never loads `test-setup.ts` — the only thing pointing `DATABASE_URL` at a throwaway database, and where the guard lives. **Only `bun test src` is the runner.**
4. **The CATALOGUE in the production database is real and irreplaceable; the TRADING data is not.** Confirmed by the operator on 2026-09-03: categories, products, options and images are real work (commit `0c5ede6`); every order, payment, receipt, shift, Z report and fiscal event was created by the developer for testing, and P-04 deletes all of it before the first genuine sale. Treat catalogue changes as destructive and irreversible. Trading-data mistakes cost test data — which lowers the risk of exercising fiscal flows, but does **not** license careless writes to the live database: work on a scratch copy, as every batch in Stage 3 did.
5. **`scripts/` is safe by default since Batch 4.5, and still read the header first.** Every script there is now a dry run unless given `--apply`, and `bun run typecheck` / `bun run lint` cover the folder. Two were deleted rather than guarded (**L-37**, **C-17**); `seed-users.ts` deletes nothing, and the counter scripts refuse to lower a fiscal counter (**L-38**). `scripts/README.md` names every deletion every remaining script performs. **The rule that survives all of it: nothing in `scripts/` may open a database path not derived from `DATABASE_URL` or `HIBAPOS_DATA_DIR`** — that is what makes the scratch-copy method complete, and `git grep "new Database("` is how to check it.

7. **Override `HIBAPOS_DATA_DIR` as well as `DATABASE_URL`** on any scratch copy — the full rule, and why (a Batch 3.4 archive landed in the real `db/fiscal-archives/`), is the first bullet of *Methods*, now in `REMEDIATION_RECORD.md`.


9. **Claude cannot do two things in this project**, and each refusal is correct: `prisma migrate deploy` against production, and writes to real menu data. Prepare, rehearse and verify; then hand the operator the exact command.

   **Killing processes is NOT a third.** Claude does not kill the operator's processes, but a server **Claude started in the same session** must be stopped with `taskkill //PID <pid> //T //F` — `TaskStop` kills only the `bunx` parent, and a leftover `next start` holds `query_engine-windows.dll.node` and makes `bunx prisma generate` fail `EPERM` in another session. **Do this every time.** `bun run dev` stays untried here (it loads the real `.env`). Use `bunx next start` on a spare port — 3021–3026, 3033/3034, 3040–3043, 3050–3052, 3060/3061, 3062–3065 and **3070–3080** are spoken for.

   **`git push` is an explicit-permission action**, not a prohibited one: it goes through when the user asks in the session, which they have done repeatedly. Do not push unprompted, and do not tell the user it is impossible.
---

## HOW TO USE THIS FILE

This file is the **working plan**. Its companion `REMEDIATION_RECORD.md` is the **evidence record**: every completed batch's specification, validation criteria and status record, moved there verbatim when the batch completed, plus the completion history, the resolved findings and the full rationale of answered decisions. The record is append-only and is never rewritten; a correction anywhere is an appended, dated note.

1. Read **CURRENT PROJECT STATUS** and **OPEN THREADS** above, then the warnings and the rules — and then **`REMEDIATION_RECORD.md` → *Methods established by earlier batches***, which is where the *Methods* went on 2026-09-07 and is still required. Everything else a session must know before acting sits above the first stage heading; read all of it.
2. Open the **current batch**. Do only what is in that batch. If its work touches a subsystem an earlier batch changed, read that batch's stub here (its *Constraints this batch leaves behind*), then its section in the record.
3. Work the batch's items from `NOT STARTED` → `IN PROGRESS` → `IMPLEMENTED — TESTING REQUIRED`, using the methods below.
4. Run the batch's **Validation Required** section in full.
5. If validation passes, mark the items `COMPLETED` and, in this order:
   1. Write the **status record** at the end of the batch's section, in the usual fields (Status, Completed, Changes, Files, Tests, Commit, Notes). Keep *Changes* near 1,500 characters and *Tests* near 1,000; write *Notes* as numbered items. Evidence (hashes, counts, "production untouched") belongs here.
   2. **Move the whole batch section to the record**, verbatim, under its stage heading, with a provenance line (`*Moved verbatim from REMEDIATION_PLAN.md lines a–b (commit sha) on date.*`).
   3. Leave a **stub** in its place, in the format of the existing stubs: status, date, commit, findings, the record pointer, *Constraints this batch leaves behind* and *Left open*. Constraints are sentences **copied** from the record, never paraphrased; every sentence containing "must", "never" or "do not", every deliberate non-action and every deferred-not-waived criterion goes there.
   4. Update **CURRENT PROJECT STATUS** and the stage status line; **tick the FINDING INDEX** — Batches 7.1 and 7.2 both forgot, and an unticked row reads as unfinished work; touch **OPEN THREADS** only if a thread changed.
   5. Add new findings to **NEWLY DISCOVERED ISSUES**; move any row this batch resolved to the record's *Resolved findings*, unchanged. When a design decision is answered, cut its row here to one line and move the full row to the record's *Answered design decisions*.
   6. Add one line to the record's **COMPLETED REMEDIATION HISTORY**: batch, status, date, commit, one sentence.
6. Commit. One batch, one commit (or a small reversible series). Do not push unprompted.
7. Stop. Do not roll into the next batch without the user's go-ahead.

**One rule is now enforced rather than remembered.** `src/lib/plan-freshness.test.ts` reads this file and fails the build if an **open finding is assigned to a batch this same file says is `COMPLETED`** — the rot that accumulated twice, after Stage 6 (nine rows) and after Stage 7 (four). It also checks that every batch status is one of the values below, and that the front matter still fits under ~40 KB. It cannot tell whether a finding is really fixed; it closes one mechanical, recurring kind of lie.

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

### Validation commands available in this project

| Command | What it does | Safe? |
|---|---|---|
| `bun run test` | Unit + integration tests, Bun runner, temp DB. **Carries `--timeout 30000` itself since Batch 7.4c** — L-24 no longer needs remembering. `bun test src` still works and still needs the flag on this machine | ✅ Safe |
| `bun run typecheck` | `tsc --noEmit` — **covers `scripts/` since Batch 4.5** | ✅ Safe |
| `bun run lint` | `eslint .` — **covers `scripts/` since Batch 4.5** | ✅ Safe |
| `bun run build` | `next build` — requires `SESSION_SECRET` in env or it throws at import time | ✅ Safe |
| `bun run test:e2e` | Playwright, against its own disposable database | ✅ Safe **since Batch 6.3** — it refuses to start otherwise |
| `bunx vitest` | — | ❌ **Refuses to run** since 6.3 (`vitest.config.ts` throws) |

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

**Moved to `REMEDIATION_RECORD.md` → *Methods established by earlier batches* on 2026-09-07, and it is still REQUIRED READING — `CLAUDE.md` names it.** It was not retired for being stale: every method in it is current, and this session used three of them. It was moved because it was 10,5 KB of the plan's ~40 KB front matter, the front matter had reached that ceiling, and of everything above the first stage heading it is the one part that is **reference rather than status** — it does not change when a batch completes. The same reasoning retired *Finding-ID prefixes* on 2026-09-05.

**Read it before writing any code here.** It is nine methods, each with the record section where it was first proved: the scratch-copy rule and how to prove which database a server has open; migration rehearsal with a fingerprint diff; **prove the test fails on the old code** — one property at a time, both directions, and say which tests pass under no revert; how to tell a race from an assumption by measuring; read-only inspection of live data; manual validation against the production build; how to make a walkthrough unattended without ever typing a production PIN; browser driving and its two known traps; journal payload vintages; re-deriving a batch's *Validation Required* when it predates its own answer; and what to do with an out-of-scope finding.

# FINDING INDEX

Quick lookup from audit ID to batch. **What the prefixes mean** — and the rule that audit IDs are never renamed — moved to `REMEDIATION_RECORD.md` → *Finding-ID prefixes* on 2026-09-05; it had not changed since the plan was written.
Each completed batch has a stub in its stage below and its full section in `REMEDIATION_RECORD.md`; the completion history table is in the record too.

**✅ = code done and batch recorded** — not necessarily in effect on the
production install; *OPEN THREADS → A* is that list. **◐ = one half done, one
half open**, split across two batches. Audit IDs are never renamed.

| ID | Batch | ID | Batch | ID | Batch |
|---|---|---|---|---|---|
| C-01 ✅ | 1.1 | M-01 ✅ | 3.6 | M-25 ✅ | 4.4 |
| C-02 ✅ | 1.2 | M-02 ✅ | 3.3 | M-26 ✅ | 4.4 |
| C-03 | 1.3 | M-03 ✅ | 2.2 | M-27 ✅ | 4.3 |
| C-04 ✅ | 3.3 | M-04 ✅ | 3.5 | M-28 ✅ | 4.3 |
| C-05 ✅ | 2.1 | M-05 ✅ | 5.5 | M-29 ✅ | 2.4 |
| C-06 ✅ | 2.2 | M-06 ✅ | 3.6 | M-30 ✅ | 2.4 |
| C-07 ◐ | 1.4 (built; `[MACHINE]` open) | M-07 ✅ | 3.6 | M-31 ✅ | 2.4 |
| C-08 ✅ | 4.1 | M-08 ✅ | 5.6 | L-01 ✅ | 7.2 |
| C-09 ✅ | 4.2 | M-09 ✅ | 5.7a | L-02 ✅ | 6.2 |
| C-10 ✅ | 3.2 | M-10 ✅ | 5.7a | L-03 ✅ | 7.2 |
| C-11 ✅ | 3.2 | M-11 ✅ | 5.7b | L-04 ✅ | 2.4 + 7.3 |
| C-12 ✅ | 3.1 | M-12 ✅ | 5.7c | L-05 | 2.4 (deferred) |
| C-13 ✅ | 3.5 | M-13 ✅ | 3.2 | L-06 ✅ | 6.3 |
| C-14 ✅ | 5.3 | M-14 ✅ | 3.2 | L-07 ✅ | 7.2 |
| C-15 ✅ | 2.3 + 4.7 | M-15 ✅ | 5.7c | L-08 ✅ | 7.2 |
| C-16 ✅ | 4.4 | M-16 ✅ | 5.7c | L-09 ✅ | 7.6 |
| C-17 ✅ | 4.5 | M-17 ✅ | 4.4c | L-10 ✅ | 7.6 |
| C-18 ✅ | 4.3 + operator | M-18 ✅ | 4.4c | L-11 | deferred |
| C-19 ✅ | 2.3 | M-19 ✅ | 5.7c | L-12 ✅ | 7.2 |
| C-20 ✅ | 5.1 | M-19s ✅ | 4.4b | T-01…T-07 ✅ | 6.1 |
| C-21 ✅ | 5.2 | M-20 ✅ | 5.7d | T-08, T-09 ✅ | 6.2 |
| C-22 ◐ | 2.1 + 3.5 | M-21 ✅ | 5.7d | T-10…T-12 ✅ | 6.3 |
| C-23 ✅ | 5.4 | M-22 ✅ | 5.7d | DOC-01…12 ✅ | 7.1 |
| C-24 ✅ | 4.6 | M-23 ✅ | 4.3 | V-01…V-03, V-08…V-12 | external |
| C-25 ✅ | 4.6 | M-24 ✅ | 4.4 | V-04 ✅, V-05 ✅ | 8.1 | V-06 ✅, V-07 | 8.2 (**V-06 closed via 2.5**) |
| C-26, C-26b ✅ | 0.1 | C-27 ✅ | 3.4 | P-01…P-03 ✅ | 0.2 |
| L-53 ✅, L-54 ✅ | 3.7 | L-57 ✅ | 3.8 | L-52 | 3.7 searched — **open, no format published** |
| L-55 ✅, L-56 ✅ | 3.10 | **L-58 ✅** | 3.10 (label) + **3.11 (stored line HT)** | DD-23 ✅, DD-24 ✅ | 3.8 |
| L-59 ✅ | 1.4 | L-60 | 8.0 | L-61 ✅, L-62 ✅ | 2.5 |
| L-21 ✅ | 1.3b | L-63 ✅ | 1.3c | | |
| DD-25 ✅ | 3.9 | DOC-15 ✅ | operator | | |
| DOC-13 ✅ | 7.5 (with L-36) | DOC-14 ✅ | 7.5 | **L-66 ✅** | **1.4c** |
| **DOC-16 ✅** | 1.4b | **DOC-17 ✅** | **1.4c** | **L-65 ✅** | 1.4b |
| L-22 ✅ | 7.5 | L-36 ✅ | 7.5 (with DOC-13) | **L-64 ✅** | 7.7 |
| L-46 | 8.2 | L-51 | 8.2 | L-39 | operator (cosmetic) |
| L-14 | 8.0 dissolves it | L-47 | none — twice unreproducible | | |

**L-04 is CLOSED — both halves.** 2.4 removed the standalone tree; 7.3 rehearsed and handed over the rotation, and **the operator ran it on 2026-09-07** (verified: the pre-rotation backups no longer decrypt). **ONE ◐ item remains, and it is C-22**: whether an unkeyed chain suffices (`REQUIRES EXTERNAL VERIFICATION`, V-01; the restore journalling half was done in 2.1). *(Corrected 2026-09-07: it said "the two remaining ◐ items" and named **L-04** as the second, in the same paragraph that opens "L-04 is CLOSED".)* **L-58 is also ◐** and is tracked as such in the table above and in *Newly Discovered Issues*: its label half closed in 3.10, its stored per-line HT is open and owned by no batch. **C-15 closed in Batch 4.7** — both halves are done, and its row is ticked above.

---

# DESIGN DECISIONS REQUIRED

These cannot be resolved from the code. **Claude must not decide them.** Each blocks or reshapes the batch named.

**The table is empty, and that is the honest state: no batch in this plan is waiting on a decision.** Twenty-five have been retired from it, DD-01 to DD-25. *(**DD-24 and DD-25 only reached the record's register on 2026-09-07** — this line said they had on the 6th; found by counting the register against the claim.)* Full rows: `REMEDIATION_RECORD.md` → *Answered design decisions*; the retirement history and the one-line pointers: → *Retired open-thread rows*.

| ID | Decision | Blocks | Context |
|---|---|---|---|

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

**Stage status:** `IN PROGRESS` (1.1, 1.2, **1.3b** and **1.3c** `COMPLETED`; **1.3 and 1.4 both `IMPLEMENTED — TESTING REQUIRED`**). **1.3b and 1.3c** closed **L-21** and **L-63** on 2026-09-07 — the code half of 1.3's receipt work, split out so 1.3's record stays as written. Between them, **no line any of the three text renderers emits can exceed the paper**. Both their `[HW]` prints stay with 1.3. 1.3 waits only on the physical printer; **1.4 was built on 2026-09-06** and waits on four `[MACHINE]` criteria — a cold reboot, a killed process, the task registration itself, and a full shift-to-Z cycle after a reboot. Everything in 1.4 that could be validated from here was: the mover ran for real on a scratch install and the app then served from the moved tree, and the launcher's refusals were executed rather than reasoned about. **Stage 1 cannot be declared complete on loopback evidence** — see *Hardware-dependent validation*.

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

## Batch 1.3b — The receipt renderer never wraps (L-21)

**Status:** `COMPLETED` · **Completed:** 2026-09-07 · **Commit:** `57f109e` · **Findings:** L-21 (**closed** — the code half; the `[HW]` print stays with 1.3) · **Decisions:** none; the table stays empty.
**Record:** `REMEDIATION_RECORD.md` → *Batch 1.3b* — specification, validation criteria and status record, moved there verbatim on 2026-09-07.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **The wrap is at render time on purpose**: the stored `Receipt.content` is the fiscal artifact, both print routes send it verbatim, and `buildPrintJob()` is contractually forbidden from reflowing it (`escpos.ts`) — so a wrap anywhere downstream would make the printed ticket differ from the archived one. *(record, Changes)*
- **`wrapToWidth` returns a string that already fits byte-identical**, which is what makes the pre-existing snapshot the proof that this batch cannot have altered a ticket that was already correct. **Do not remove that early return**: R7 (wrapping one column early) and R8 (over-applying) both break pre-existing tests, which is the control working in the other direction. *(record, Changes and Reverts)*
- **A single token wider than the paper is hard-broken.** Word-wrapping alone cannot place it, and emitting it whole would reinstate the defect for the one input that provokes it. *(record, `receipt.ts`)*
- **Every centred line goes through `pushCentred`**, so the guarantee is an invariant over the centred block rather than a list of the three fields somebody remembered. A new centred line must use it. *(record, Changes)*
- **What the printer would have done is not asserted, because it cannot be from here** — hard wrap or truncate depends on the model, and **only the `[HW]` print settles which one this Sunso does**. Nothing here substitutes for it. *(record, note 2)*
- **All 20 archived `Receipt.content` rows are 80 columns wide and were not touched.** That is **L-14**, unresolved by choice, and an archived receipt is immutable. *(record, note 4)*
- **Lengths are counted in UTF-16 units**, the unit `center()` and `leftRight()` have always used, so the three agree. *(record, note 5)*
- **The operator's stored address was not touched** — it is real settings data and theirs to correct (warning 4), and shortening it would have "fixed" the ticket without fixing the renderer. *(record, note 8)*

**Left open:** ~~**L-63**~~ *(Correction, 2026-09-07: **resolved in Batch 1.3c**, the same day, at the operator's request — `leftRight()`'s different overflow, the unlaid-out option/add-on lines, and the same `center()` helper copied into `renderDayCloseTicket()` and `renderTestPage()`. `wrapToWidth` moved out of `receipt.ts` into `services/ticket-layout.ts` with it, which is what note 6 anticipated.)* **L-14** unresolved by choice. **1.3's `[HW]` print** of a wrapped ticket, at the commissioning session. The rest of the *Hardware-dependent validation* re-triage — L-21 was the first item on that list and is the only one done.

---

## Batch 1.3c — The three overflows 1.3b did not own (L-63)

**Status:** `COMPLETED` · **Completed:** 2026-09-07 · **Commit:** `e2b14ed` · **Findings:** L-63 (**closed** — the code half; the `[HW]` print stays with 1.3) · **Decisions:** none; the table stays empty.
**Record:** `REMEDIATION_RECORD.md` → *Batch 1.3c* — specification, validation criteria and status record, moved there verbatim on 2026-09-07.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **Nothing is ever truncated**: BOFiP § 50 lists « détail des articles (libellé, quantité, prix unitaire, total HT de la ligne, taux de TVA) » among the data in scope, so an ellipsis on an article's designation would remove required information from a fiscal document to make it fit the paper. *(record, Changes)*
- **Every function returns a line that already fits byte-identically**, which for `leftRight` is a property of the arithmetic rather than a special case — the label's budget is `width − right − 1`, so it wraps on exactly the inequality that decides whether the pair fits at all. *(record, Changes)*
- **`renderTestPage`'s ruler is deliberately not laid out**: it exists so that a wrapped ruler tells the operator the column count is wrong for the paper (L-13). **Note that no test can currently distinguish this**: `centred(s, w)` is the identity when `s.length === w`, so routing the ruler through it is a no-op — the comment states an intention, and what is pinned is the ruler's own construction. *(record, Changes and note R9)*
- **The wrap breaks only at ORDINARY whitespace.** `\s` includes U+00A0, and `formatEuro` emits a NO-BREAK SPACE before the euro sign and a narrow one between the thousands precisely to forbid that break; splitting on `\s+` tore `(1,50 €)` in half on a fiscal document and would silently have replaced the NBSP with a plain space in the archived `Receipt.content`. *(record, note 1)*
- **Both invisible characters are written as escapes, in the source and in the test, and that is deliberate** — a literal NBSP is invisible in an editor and one careless edit from becoming a plain space, after which the test would pass while asserting nothing. *(record, note 2)*
- **The layout is a design decision and it is recorded as one**: the amount goes on the last line so each article still ends with exactly one amount, and continuations are indented past the marker so a wrapped choice cannot read as a second choice. *(record, note 6 and Changes)*
- **`role-model.test.ts`'s guard was not weakened** when a test constant tripped it; the constant was renamed. *(record, note 4)*
- **The operator's stored `restaurantAddress` was still not written from here** (CLAUDE.md rule 3), and at 50 characters the corrected value is **still wider than 48-column paper** — which is why the renderer had to be fixed rather than the address shortened. *(record, note 8)*

**Left open:** **1.3's `[HW]` print** of a wrapped item line, at the commissioning session, alongside 1.3b's. **L-14** unresolved by choice. The operator's two Réglages edits — the duplicated postcode in `restaurantAddress`, and `printerName` (DOC-15) — both in *Open Threads → B*. The rest of the *Hardware-dependent validation* re-triage, of which L-21 and L-63 are the only items done.

---

## Batch 1.4 — Startup, supervision and update path

**Status:** `IMPLEMENTED — TESTING REQUIRED` (code 2026-09-06; the four [MACHINE] criteria wait on the till)

### C-07 — No auto-start, no supervisor, no installer, no update path

**Status:** `IMPLEMENTED — TESTING REQUIRED` · Severity: CRITICAL · Category: operational / deployment

**Problem.** The only production launch path is a human running `.zscripts/start.ps1` in a foreground PowerShell window and opening a browser by hand.

**Evidence.** No `.bat`, `.cmd`, `.vbs`, `.msi`, `.iss`, no Task Scheduler XML, no nssm/WinSW config, no Startup shortcut, no kiosk launcher anywhere in the repo. `start.ps1` is 25 lines. Migrations run **only** inside the first-boot guard at `start.ps1:17-22`, so once `db/custom.db` exists `prisma migrate deploy` never runs again.

**Location.** `.zscripts/start.ps1`; `README.md:54-64`; `IMPLEMENTATION_PLAN.md:128-132`

**Impact.** After a power cut the restaurant boots to a desktop with no POS and no instructions. There is no way to ship a fix: a schema-changing update boots against an old database and fails at query time; a `git pull`-based update fights over the 134 committed files in `public/uploads/`, and `git clean -fd` would delete every product photo that restore cannot put back (C-05).

**Remediation direction.** Task Scheduler "at startup, run whether logged on or not" with an explicit *Start in* directory, plus a kiosk browser launch. A documented, scripted update procedure that runs `migrate deploy` and never touches the data directories.

**Related.** The `process.cwd()`-anchored paths (backups, uploads, fiscal archives, `dev.log`) mean an incorrect *Start in* silently splits data across two directory trees. Address the launcher and the path question together; the path refactor itself is Batch 2.2.

**Dependencies.** Interacts with DD-01 (kiosk printing) and with Batch 2.2 (data directory location). Do not finalise the launcher before 2.2 decides where data lives.

*Correction 2026-09-04: DD-02 is answered (`C:\HibaPOS\data`) and the plumbing shipped in Batch 2.2; the physical move is this batch's deployment step — *Open Threads → A, D*.*

### Batch 1.4 — Validation Required

*(Re-derived 2026-09-06, as **Methods** requires: these criteria were written on
2026-09-03 assuming the batch would run **on the till**. Six of the seven are
acts on that machine and none of them can happen from Tunisia. Each original is
shown with what replaced it, rather than dropped silently. Items marked
**[MACHINE]** are `DEFERRED, not waived` under the *Hardware-dependent
validation* policy — this batch is `IMPLEMENTED — TESTING REQUIRED` for exactly
that reason, on the same terms as Batch 1.3.)*

- ~~Cold reboot of the target machine: the POS is serving and the browser is in kiosk mode without human action.~~ — **[MACHINE], kept.** Nothing here substitutes.
- ~~Kill the Node process: the supervisor restarts it; an in-flight request fails cleanly rather than corrupting data.~~ — **[MACHINE], kept.** What *was* done: the supervisor is Task Scheduler's own `-RestartCount 3 -RestartInterval 1min`, asserted in the registration, and the launcher deliberately does **not** loop, so a crash surfaces as a task failure rather than a silent respawn.
- ~~Verify the working directory the service actually starts in, and confirm `db/`, `public/uploads/` and `db/fiscal-archives/` resolve to the intended locations (not a second tree).~~ — **REPLACED, and satisfied here.** Rehearsed end to end on a scratch install: the mover ran for real, then the built app was started with `HIBAPOS_DATA_DIR` and `DATABASE_URL` pointed at the moved tree, and it served the moved database (marker read back pre-auth) and the moved product images including a nested subdirectory. **This is what found the nested-copy defect.**
- ~~Simulated update: apply a schema-changing commit, run the documented update procedure, confirm `migrate deploy` ran and no data was lost.~~ — **[MACHINE] for the `-Apply` half.** Done here: the dry run was executed and its plan read; the ordering (migrate before build) and the absence of every destructive command are asserted by test and shown to fail under revert.
- ~~Confirm `public/uploads/` survives the update procedure untouched.~~ — **REPLACED and strengthened.** `update.ps1` contains no `Remove-Item`, no `rmdir`, no `git clean` at any strength — asserted over the command lines, with reverts adding each back to prove the assertions bite.
- `bun run build` — PASS (requires `SESSION_SECRET` present). — **kept, and passes.**
- ~~Manual: full open-shift → sale → Z-close cycle after a reboot.~~ — **[MACHINE], kept.**

**Added by this batch, and all satisfied:**

- Every `.ps1` parses under `[System.Management.Automation.Language.Parser]::ParseFile` — the check that found three broken scripts.
- The launcher's refusals were **executed**, not reasoned about: pointed at a non-existent database it logged, refused and exited `1`, and created nothing.
- `install-windows.ps1 -Apply` was run for real against a scratch install; the database moved byte-identically (sha256 verified both sides), directories moved with their file counts checked and their nesting preserved, and every source was renamed aside rather than deleted.
- Production `db/custom.db` sha256, size and mtime unchanged throughout; no `-wal`/`-shm` beside it.

### Batch 1.4 — Status Record

**Status:** `IMPLEMENTED — TESTING REQUIRED`
**Completed:** — (code 2026-09-06; cannot be `COMPLETED` until the four **[MACHINE]** criteria pass on the till)
**Commit:** *(this commit)*
**Findings:** C-07 (**implemented**), **L-59 (new, found and fixed here)**
**Decisions:** the launcher shape was put to the operator on 2026-09-06 and answered — Task Scheduler now, packaged app later.

**Changes.** Five scripts and a manifest, in two halves. **(1) Startup and supervision.** `hibapos-server.ps1` is what Task Scheduler runs at boot: it loads `.env` explicitly (a Scheduled Task inherits nothing, and a future Tauri sidecar will need the same), then **refuses** rather than starting wrong — no database, or a pending migration, and it stops with a French message, a log line and exit 1. `hibapos-kiosk.ps1` runs at *log on*, waits for `/api` to answer, and opens Edge with `--app=` + `--start-fullscreen`: no address bar, no tabs. The split is the point — the server must survive a power cut with nobody signed in, and a browser cannot start before a desktop session exists. `install-windows.ps1` moves the data to `C:\HibaPOS\data` (DD-02) and registers both tasks; dry run by default, `-SkipTasks` to move data only. `update.ps1` is the answer to "there is no way to ship a fix": back up → stop → code → **migrate** → build → start → verify, touching no data directory. **(2) It looks like an app.** `src/app/manifest.ts` plus real PNG icons make it installable — desktop shortcut, Start Menu entry, own icon, chromeless window — which works on `http://localhost` because localhost is a secure context. No service worker, deliberately: the server is on the same machine, so a cache buys a stale UI after an update and nothing else. **L-59:** `start.ps1` no longer bootstraps.

**Files.** New: `.zscripts/hibapos-server.ps1`, `.zscripts/hibapos-kiosk.ps1`, `.zscripts/install-windows.ps1`, `.zscripts/update.ps1`, `src/app/manifest.ts`, `src/lib/deployment.test.ts`, `public/icons/` (icon.svg, icon-maskable.svg and five PNGs). Modified: `.zscripts/start.ps1` (L-59), `.zscripts/README-windows.md`, `.zscripts/build.ps1` and `dev.ps1` (encoding), `src/app/layout.tsx` (icons).

**Tests.** **923 pass, 0 fail** (891 before). 32 new cases in `deployment.test.ts`, which reads the PowerShell as text — `bun test` cannot run it, `tsc` does not see it and `eslint` does not lint it, so every property these scripts carry would otherwise live only in a comment. **Twenty-three one-property reverts, in both directions; every new case fails under at least one.** Two reverts passed everything and both were the batch's best findings: **R17** deleted the mandatory backup step from `update.ps1` and nothing caught it, because the assertion read the raw text and the script's own header *mentions* `decrypt-backup.ts` while explaining why the backup is manual — strengthened to the command lines and shown to fail under R17 and under R17b (removing only the confirmation prompt). Reverts that bite include putting the bootstrap seed back (R1), applying migrations at boot (R4), adding `git clean` (R5), building before migrating (R6), stripping a BOM (R7), one em dash (R8), `Move-Item` (R9), dropping restart-on-failure (R10), recommending `AutoAdminLogon` (R11), the LAN address (R12) and `display: browser` (R13). `typecheck`, `lint`, `build` clean.

**Notes.**

1. **Three of the four new scripts did not parse, and only the parser said so.** `[Parser]::ParseFile` reported "the string is missing the terminator" because **Windows PowerShell 5.1 reads a BOM-less `.ps1` as ANSI (Windows-1252)**: a UTF-8 em dash inside a double-quoted string arrives as three characters, one of them `0x94` — a smart quote, which PowerShell honours as a delimiter. So the same dash is harmless in a comment and fatal in a message. Fixed by making every script ASCII and adding a UTF-8 BOM, and **pinned by test for all seven** so the next accented French message fails in CI rather than on the till. `build.ps1` and `dev.ps1` were swept in, because a test that exempts two files in the same folder is worse than one that covers it.

2. **The rehearsal found an install defect the dry run could not, and it was the dangerous kind — silent.** `Copy-Item <dir> -Destination <existing dir> -Recurse` puts the source *inside* the target, and step 1 pre-creates the targets. The first real run produced `data\uploads\uploads\` and `data\db\backups\backups\`. The **database moved correctly** because it is a file — so the till would have come up on the right fiscal data with **no product images and no visible backups**, and nothing would have said so. Directories now copy their contents and their file count is verified. The dry run had printed a flawless plan.

3. **L-59, found while reading the file this batch replaces.** `start.ps1` answered a missing database by running `prisma migrate deploy` **and** `prisma db seed`, and `prisma/seed.ts` falls back to the PINs this repository publishes (123456 / 111111) when `SEED_ADMIN_PIN` / `SEED_MANAGER_PIN` are unset. After DD-02's move, any reason the path looks wrong — a typo, an unmounted drive — would have produced a live till with an empty fiscal journal, a grand total of zero, numbering from 1 and known credentials, while the real database sat elsewhere. Both launchers now refuse. The premise is asserted too: a test reads `prisma/seed.ts` and pins the two fallbacks, so if that ever changes the refusals can be reconsidered on evidence rather than on memory.

4. **Measured, not predicted: the data move is what turns WAL on.** Byte 18 of production's database is `01` (rollback journal) because the WAL guard refuses a cloud-synced path, and the same database copied under a non-synced root came up `02` (WAL) as soon as the app opened it. So Batch 2.3's shipped-but-inert WAL is activated by this batch's deployment step, not by a separate action. *Open Threads → A* is updated.

5. **Task Scheduler is the supervisor, and no service wrapper is shipped.** `-RestartCount 3 -RestartInterval 1min` is built into Windows, visible in a GUI the operator can be walked through by phone, and enough for one till. nssm/WinSW would add a binary to install and hide the logs. The launcher deliberately does not loop: a crash must surface as a task failure, not a silent respawn.

6. **`bun` is installed per-user on the development machine and `Get-Command` found it perfectly well — from a user session.** The server task runs as `SYSTEM`, which would not have. The installer now detects a per-user path and names three ways out; the failure it prevents is silent, because the task "runs" and the till simply never comes up.

7. **Not registered anywhere.** `Register-ScheduledTask` was never executed — `-SkipTasks` exists partly so the data move could be rehearsed without putting a POS server on the developer's boot sequence. The registration code is therefore **[MACHINE]**, like the reboot.

8. **Production untouched.** `db/custom.db` sha256 `c9f265163691c93e3402354616b1902f5898006657d47eb8da999e1c6813dceb`, 704 512 bytes, mtime 2026-09-06 17:49:32 — identical before and after. No `-wal`/`-shm` appeared beside it. Every write went to a scratch install under the session scratchpad; the server Claude started on port **3071** was killed with `taskkill /PID 18224 /T /F`.

---

## Batch 1.4b — The launcher's one silent refusal, and the corruption in the runbook it led to (L-65, DOC-16)

**Status:** `COMPLETED` · **Completed:** 2026-09-07 · **Commit:** `ce27fa4` · **Findings:** L-65 (**closed**), DOC-16 (**closed**) · **Decisions:** none; the table stays empty.
**Record:** `REMEDIATION_RECORD.md` → *Batch 1.4b* — specification, validation criteria and status record, moved there verbatim on 2026-09-07.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **A refusal is loud: it writes to the log and exits non-zero**, so the Task Scheduler entry shows a failure instead of a green tick over a dead till — and refusal 4 is checked **before** the database and the migrations because nothing below it works without bun. *(record, Fix and Changes)*
- **`Get-Command bun` succeeding is not evidence that the task will.** It succeeded here, from a user session. What decides it is whose PATH: the machine PATH has no bun, and `SYSTEM` reads that one. The measurement is the two PATH scopes, not the lookup. *(record, note 3)*
- **Do NOT run `rotate-secrets.ts` on the till.** A second rotation would leave the new `BACKUP_ENCRYPTION_KEY` in exactly one place — the till's own `.env` — so the copy the operator carried off the machine would no longer open the § 6b backup, and nobody would find out until a restore was needed. *(record, Also corrected)*
- **Nothing goes into a runbook from here without being executed.** The first version of § 6a's verification snippet reported `1 chars` — `.Length` on the single-element array PowerShell returns from `-match` — while the verdict line beside it was correct, so a reader would have believed the whole output. *(record, note 1)*
- **BEL and BACKSPACE are ASCII**, so `deployment.test.ts`'s pure-ASCII assertion would not have caught this class even inside the scripts, and no assertion of any kind reads `docs/`. **This batch adds no guard for it** — a standing test for control characters in `docs/` is a reasonable Stage 8 addition rather than something to bolt on the evening before delivery. *(record, note 4)*
- **§ 0a was NOT run and 1.4's four `[MACHINE]` criteria remain open**; there is no spare Windows machine in this session, and § 0a's second command registers two Scheduled Tasks pointing at the copy. *(record, note 5)*
- **That `SYSTEM` cannot see this bun is inferred from the two PATH scopes**, not demonstrated by running the launcher **as** `SYSTEM`; the refusal's own message is what will settle it on the till in one line of `server.log`. *(record, note 7)*

**Left open:** **prerequisite 1 still FAILS on the development machine** — bun is `%APPDATA%\npm\bun.ps1`, on the user PATH only, and it must be fixed before travel by one of the installer's three options; the real binary is at `%APPDATA%\npm\node_modules\bun\bin\bun.exe`. **1.4's four `[MACHINE]` criteria** and **1.3's `[HW]`** are untouched by this batch. A control-character guard for `docs/`, unowned. The rest of the *Hardware-dependent validation* re-triage, of which L-21 and L-63 are still the only items done.

---

## Batch 1.4c — How the app gets onto the till, and the refusal that was missing for it (L-66, DOC-17)

**Status:** `COMPLETED` · **Completed:** 2026-09-08 · **Commit:** `1dcbe79` · **Findings:** L-66 (**closed**), DOC-17 (**closed**) · **Decisions:** none; the table stays empty.
**Record:** `REMEDIATION_RECORD.md` → *Batch 1.4c* — specification, validation criteria and status record, moved there verbatim on 2026-09-08.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **`install-windows.ps1` does not fetch code, install dependencies or build**, and it **relocates** a database already in the install directory rather than creating one — it prints `skip (absent)` when there is none. *(record, Why it exists and DOC-17)*
- **`.env` before `bun run build`**, because `next build` throws at import time without `SESSION_SECRET` and blames the import; and **the build before § 2's reboot**, because `bun run start` is `next start`, which needs `.next/BUILD_ID`. *(record, DOC-17)*
- **Refusal 5 checks `BUILD_ID`, not the `.next` DIRECTORY, and that distinction is the point** — `next dev` creates `.next` with no BUILD_ID, and so does a build that failed halfway, so the directory's existence proves nothing. *(record, L-66)*
- **`db/custom.db` is carried by hand and nothing here will create one** (L-59); it is 704 KB and holds the restaurant's real catalogue. **Skip `db/backups/`**: not restorable (L-46) and undecryptable since the rotation. *(record, measurements and § 0b)*
- **Inside a double-quoted PowerShell here-string the backtick is the escape character.** The file stays pure ASCII either way, so the ASCII assertion cannot see the damage — it happens at expansion, in front of the operator. A backtick in a `#` comment and inside `@'…'@` are both still legal. *(record, note 1)*
- **A fixed-width window's strength depends on what lies downstream, so it decays as the file grows, and nothing announces it.** Use `sliceBlock(src, start, ownEndMarker)`, which cannot reach past its own block at any size. *(record, notes 2 and 3)*
- **No installer was written, deliberately.** The database cannot be automated without recreating L-59, and neither can the secrets, `BACKUP_LOCATION`, the printer, FACTICE or § 6; the rest is a timing judgement — every automation script here earned trust by being run. *(record, note 5)*

**Left open:** **1.4's four `[MACHINE]` criteria** and **1.3's `[HW]`**, untouched by this batch. **One question § 0b names rather than answers**: how long `next build` takes on all-in-one hardware, which nothing here can measure. *(The other — whether the till has internet — **was answered by the operator on 2026-09-08: it has it**, so `bun install` is the path and the 880 MB `node_modules` fallback is a contingency only.)* **A one-shot installer is a Stage 9 candidate**, once a till exists that can be re-imaged. A control-character guard for `docs/` remains unowned — the backtick guard added here covers `.ps1` here-strings only.

---

# STAGE 2 — DATA SURVIVAL

**Stage status:** `COMPLETED` (2026-09-06) — **five batches done. Reopened 2026-09-06 for 2.5** and closed the same day: Batch 8.2's rehearsal found that the restore this stage built could not complete on Windows (**L-61**, HIGH), because `db.ts` cached its PrismaClient only outside production and the server therefore ran two, so `$disconnect()` never closed the file. Fixed, and the restore now completes in 2,6 s. Before it, `COMPLETED` (2026-09-03) with all four earlier batches. Two shipped mechanisms are **not yet in effect on the production install**: WAL waits on the DD-02 move off OneDrive (which **Batch 1.4 built the mover for**), and `BACKUP_LOCATION` still needs a second volume chosen at deployment.

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

**Left open:** ~~C-15 shift-race half → Batch 4.7~~ **closed in Batch 4.7** (`951e14c`), so C-15 is complete; DOC-01, DOC-02, DOC-03 → Batch 7.1 (*Open Threads → D*); a timed real checkout belongs with the hardware rehearsal, and transaction budgets should be re-measured once WAL is live on the till.

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

## Batch 2.5 — The restore could not complete on Windows (L-61, L-62)

**Status:** `COMPLETED` · **Completed:** 2026-09-06 · **Commit:** `52c66c0` · **Findings:** **L-61 (HIGH, closed)**, **L-62 (closed)**. **Unblocks Batch 8.2's V-06.**
**Record:** `REMEDIATION_RECORD.md` → *Batch 2.5* — specification, validation criteria and status record, moved there verbatim on 2026-09-06.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **The first diagnosis was wrong and measurement is what caught it.** 8.2 recorded "`$disconnect()` does not release the Windows file handle"; an isolated probe released it in **4–9 ms** in every configuration — WAL, rollback, `VACUUM INTO`, transactions — which turned the question into "how many clients are there". The answer was two. *(record, note 1)*
- **`src/lib/db.ts` must cache the client on `globalThis` UNCONDITIONALLY.** The `NODE_ENV !== "production"` guard meant Next's per-entry-point bundling built one client for `instrumentation.ts` and another for the route handlers — measured on the real build, one process, two constructions — so `$disconnect()` never closed the file. *(record, What was actually wrong)*
- **A production-only guard hid it**: the defect could not appear in dev, in `bun test`, or in any unit test — only in a production build, and only in the one operation that needs the file closed. *(record, note 2)*
- **The retry is not the fix and must not be read as one.** With two clients it would have retried for five seconds and still failed. *(record, note 3)*
- **Only `EPERM`, `EACCES` and `EBUSY` are retried.** Anything else is raised at once, because waiting five seconds for a missing source is five seconds of a dead till and no better outcome. *(record, The fix)*
- **`rename` is injected for the tests deliberately**: a retry loop reimplemented in the test file would let every case pass while the shipped code was broken. *(record, note 4)*
- **This does NOT fix L-46.** The three real backups on production remain unrestorable because they predate seven fiscal tables; **a fresh backup at commissioning is still required.** *(record, note 5)*
- **The restore still requires the app to be running.** A database so broken the app will not start is still recovered by hand with `scripts/decrypt-backup.ts`. *(record, note 5)*

**Left open:** nothing of its own. **8.2's V-07** (a full trading day on the real hardware) is untouched and still `[MACHINE]`.

---

# STAGE 3 — FISCAL CORRECTNESS

**Stage status:** `COMPLETED` — **reopened and closed a fourth time 2026-09-09 by 3.12** (L-68, VAT not varying by order type; migration and rates applied by the operator the same day). Before that, `COMPLETED` (2026-09-06) — **seventeen batches done**, the last being **3.10** (L-55, L-56 and L-58's label half), which reopened the stage a third time on 2026-09-06 and closed it the same day; before it **3.8** (the trading day, L-57) and **3.9** (DD-25, the keyed chain), both specified in full before any code on the operator's instruction and both completed the same day. Before them **3.7** (the French-law gaps: L-53 and L-54 closed, **L-52 left open** for want of a published format, L-57 found and not yet owned), which reopened the stage on 2026-09-06 and closed it the same day. Before it, `COMPLETED` (2026-09-05) with **all twelve earlier batches done**: 3.1, 3.1b, 3.1d, 3.1c, 3.2, 3.2b, 3.3, 3.4, 3.5, 3.6, **3.6b**, and **3.6c**, which reopened the stage on 2026-09-05 for L-27 and closed it the same day. The eleventh, **3.6b** (L-25, L-26; DD-18), which reopened the stage on 2026-09-04 for one small batch before Stage 4. Every thread the stage opened is closed: the VAT-*rate* thread (C-12, L-16, L-17), the reconciliation thread (C-10, C-11, M-13, M-14, L-23) — **every revenue figure in the application now comes from one aggregation** — archives (C-04, M-02), the operator interface (C-27), the audit trail (C-13, M-04) and close ordering (M-01, M-06, M-07). **Reopened 2026-09-05 for one small batch: 3.6c**, added on an answered decision to close **L-27** — the close guard 3.6b shipped checks a caisse's OPENING date, and a caisse opened before the first sealed period and never closed therefore blocks no close at all. Everything else in this stage stands as completed. **Reopened a FOURTH time on 2026-09-07 for 3.11** (L-58's stored per-line HT) and **closed again the same day**: the operator applied the migration and it was verified read-only — 10 migrations, counters unmoved, all four chains `ok`, and a fingerprint diff of one line, the `_prisma_migrations` row.

**Two items leave the stage deliberately unresolved, and neither is a code question:**

- **C-22 (chain-design half)** — `REQUIRES EXTERNAL VERIFICATION`. Whether an unkeyed SHA-256 chain satisfies the inalterability requirement is V-01, and **the research of 2026-09-06 found no official source either way** (`docs/conformite-isca-recherche.md` § 9.4). Batch 3.9 built a keyed mode on the operator's own decision; **that is a choice, not an answer to V-01.**
- **V-03** — what a compliant receipt must contain. Batch 3.6 added the per-rate VAT breakdown and the TVA number on the operator's own determination, 3.7 the software identity and 3.10 a real « numéro de caisse »; whether anything further is required is open. **Batch 3.10 left one item of BOFiP § 50's own list unbuilt on purpose** — the *stored* per-line HT total — because it needs a migration and no source read so far says the figure must be stored rather than reproducible.

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

**Left open:** L-20 → resolved in Batch 3.1d; L-21 → resolved in **Batch 1.3b** (2026-09-07); the switch is OFF on the live install (*Open Threads → A*).

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

**Left open:** L-21 → resolved in **Batch 1.3b** (2026-09-07); L-22 open (*Newly Discovered Issues*); DOC-15 is an operator action in Réglages (*Open Threads → B*); L-14 (archived 80-column receipts) unresolved by choice.

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
- Whether an unkeyed chain is sufficient is a certification question, not a code question. Options include keying the chain with a secret the operator cannot read, or anchoring periodic digests externally. **Do not implement either without the answer to V-01.** *(record line 1004)* — **OVERTAKEN 2026-09-06 (Batch 3.9, DD-25).** V-01 is still open and the research (§ 9.4) found no official source either way, so this sentence was right that the law does not settle it. What changed is that the **operator** settled it: told plainly that nothing requires keying, they chose the first of the two options above. The chain can now be keyed, and the code is unarmed until Batch 8.0. **The instruction stands for anything beyond that** — external anchoring is still not to be built on a guess.
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

**Left open:** L-25, L-26 → resolved in **Batch 3.6b** (2026-09-04); V-03 open (external); L-21 unchanged and not caused here *(resolved in **Batch 1.3b**, 2026-09-07)*; ~~the migration is unapplied~~ *(Correction, 2026-09-04: applied by the operator — Open Threads → A.)*

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

**Left open:** ~~L-27 → *Newly Discovered Issues*~~ — **closed in Batch 3.6c, 2026-09-05**, by widening the guard this batch shipped; ~~the migration `20260904091947_close_refund_totals` is written and rehearsed but not applied to production~~ *(Correction, 2026-09-05, Batch 5.5's de-stale pass: it **has** been applied — `_prisma_migrations` records it at 2026-09-04 08:43:54, the same morning this stub was written, so the claim has been wrong since the day it was made. This is the second stub to carry that error; Batch 3.6's was corrected on 2026-09-04 for the same reason. **A migration written by a batch is not applied by that batch** — check `_prisma_migrations` rather than the stub.)*; whether a compliant period close must satisfy further timing rules stays with V-08.

---

## Batch 3.6c — The close guard checks the wrong date

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `bd08823` · **Findings:** L-27 (**closes L-27**)
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.6c* — specification, validation criteria and status record, moved there verbatim on 2026-09-05.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- `bounds` left the signature with the window — nothing in the guard is period-scoped any more, which is the whole of the change. *(record, Changes)*
- The guard keeps its position **before** `aggregatePeriod`, so a refusal still writes nothing. *(record, Changes)*
- It keeps `orderBy: { number: "asc" }`, so the operator is always pointed at the oldest unclosed till rather than at whichever row the database returned. *(record, Changes)*
- The message had to change with the rule: the *« ouverte pendant »* clause is false for exactly the case this batch exists to catch. *(record, Changes)*
- *"Ignores an open caisse that belongs to another period"* was a faithful test of a decision that turned out to be the defect. It is **inverted, not deleted**. *(record, note 1)*
- The over-refusal control survives all three reverts **by design**: a guard that refused every close would satisfy the other six tests. *(record, note 2)*
- L-27's row said *"the only way through is the first-ever close"*. It is not. *(record, note 3)*
- The narrower rule the operator declined — refuse only when an open caisse holds an order inside the period — is not implemented and is not a fallback hiding anywhere; the guard is now unconditional. *(record, note 5)*
- `closeYear` still asks **nothing** of the year's twelve monthly closes, and this batch does not change that: a test still pins it. *(record, note 5)*
- `buildAnnualArchive` still derives its own year bounds inline, still deliberately, because an archive is a read and not a close. *(record, note 5)*

**Left open:** — (V-08, whether a compliant period close must satisfy further timing rules, stays where Batch 3.6b left it.)

---

## Batch 3.7 — French-law gaps found after Stage 7 (L-52, L-53, L-54)

**Status:** `COMPLETED` for L-53 and L-54; **L-52 deliberately left open** · **Completed:** 2026-09-06 · **Commits:** `203848e`, `c3ce9e9`, and the closing commit · **Findings:** L-53 (**closed**), L-54 (**closed as far as the research allows** — the refusal is DD-23), L-52 (**open — no published format**). **Produced:** `docs/conformite-isca-map.md`, `docs/conformite-isca-recherche.md` § 9, DD-23, L-55–L-58.
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.7* — specification, validation criteria and status record, moved there verbatim on 2026-09-06.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **L-52 is left open on purpose, and that is the finding**: the obligation is in force since 27/06/2026 with no instrument, no deadline and no suspensive condition, and nothing defines the format — an exporter to a guessed schema would be work to redo. *(record, note 1)*
- **L-54 was decided by the research, as instructed**: « prévoir » means provide; no source accepts or rejects a per-shift close; so the software's part is the label, the notice and the flag, and the refusal is DD-23. *(record, note 2)*
- **L-57 is the research's most consequential find** — BOFiP § 170 says the perpetual total must be *recorded* at each close and HibaPOS records it at none — and it is **not fixed here** (safety rule 10); it must precede the first real close. *(record, note 3)*
- **The 2027 question is now a known unknown with a date**: the CIBS article delegates the proof regime to an unpublished décret. *(record, note 4)*
- **First implementation imported `package.json` and was reverted after measurement**: the import put the whole file — scripts, dependency list — into three public client chunks, because `renderReceipt` also runs client-side for the ticket download. The literal is pinned to `package.json` by `version.test.ts`. *(record, Changes)* **Bump both.**
- The open-till panel states the operator's responsibility to close at the end of each trading day and shows an amber notice once the till has crossed local midnight, **refusing nothing**. *(record, Changes)*
- `GET /api` still reports no version. *(record, Validation)*
- **The source assertion first failed on BOTH sides of its revert** — it looked for a plain apostrophe where the JSX carries `&apos;` — and was corrected before the reverts were re-run. *(record, Tests)*

**Left open:** **L-52** (no batch until a format is published); **DD-23** (the operator's); **L-55, L-56, L-57, L-58** (no batch — L-57 before the first real close); V-01 and V-10 stay external, better informed.

---
## Batch 3.8 — The trading day (clôture du jour)

**Status:** `COMPLETED` in code and validated · **Completed:** 2026-09-06 · **Commit:** *(this commit)* · **Findings:** L-54 (second half, **closes L-54**), **L-57 (closed)** · **Decisions:** DD-23, DD-24.
**The migration was applied by the operator on 2026-09-06 17:49**, after a backup, and the rehearsal predicted the result with **zero differing fingerprint lines**.
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.8* — specification, validation criteria and status record, moved there verbatim on 2026-09-06.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **`cutoffHour` is a REQUIRED argument on every period helper, deliberately**: a default would let a caller take midnight boundaries while the closes around it took the cut-off, which is the disagreement DD-24 was answered to prevent. *(record, Changes)*
- **The day sequencing guard is deliberately NOT `assertNextPeriod`.** A day may not be sealed before one already sealed, nor while an **earlier day that actually traded** is unsealed, but a day with no order and no cash movement may be skipped — otherwise a restaurant closed on Mondays would be blocked for the life of the business. *(record, Changes and note 3)*
- **The till still refuses nothing at any hour.** DD-23's refusal was offered and declined, and that non-action is written into the code comments so a later session does not add it back as an obvious improvement. *(record, note 7)*
- **This is the FOURTH growth of the sealed close payload and the last free one.** Zero closes existed when it landed; the first real close fixes the shape for good. *(record, note 4)*
- **`closeMonth` still asks nothing of its days**, exactly as `closeYear` asks nothing of its twelve months. Adding either requirement is a decision nobody has taken. *(batch spec, deliberate non-action 2)*
- **The archive moved onto the new clock as a consequence, not a drive-by**: left at midnight it would have disagreed with the exercice it archives. Schema **3 → 4**. *(record, note 6)*
- **A month now ends at the cut-off**, so it can no longer be sealed the instant the calendar turns over, and the refusal names the hour. *(record, Tests)*
- **R11 is the batch's lesson**: a finding stated as "every close" was asserted for three of the four, and only the revert protocol found it. *(record, note 2)*

**Left open:** **Batch 3.9** (DD-25, the integrity code, which arms at 8.0); the operator's migration; and the day-close ticket reaching real paper, which waits on the printer with everything else in 1.3.

---
## Batch 3.9 — The integrity code (DD-25)

**Status:** `COMPLETED` in code and validated · **Completed:** 2026-09-06 · **Commit:** *(this commit)* · **Decision:** DD-25.
**The key is deliberately NOT set on any machine.** Arming it is Batch 8.0's step, written out in full in **P-04**.
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.9*.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **Nothing in law requires any of this**, and the code says so where a reader will meet it. BOFiP § 60 imposes no technique and § 140 names chaining and signature as alternatives. *(record, note 1)*
- **The honest limit belongs in the attestation, not in a footnote.** On a till where the operator is administrator, a secret in a file on that machine is findable. **The half that actually works is the integrity code printed on the day-close slip** and filed with the books. *(record, note 2)*
- **Keying creates a new way to lose everything.** Lose the key and the journal can never be verified again — which is why arming is optional rather than default. *(record, note 3)*
- **A key problem must never be reported as tampering.** `diagnoseChainKey` proves the one direction it can and states the other as a possibility beside tampering, never as a fact. *(record, note 4)*
- **Unkeyed is a supported state**: `computeEventHash` without a key is byte-for-byte its old self, so every event written before this batch still verifies. *(record, Changes)*
- **The arming guard is evidence, not a flag.** A stored "this journal is keyed" marker could be flipped; recomputing the previous entry cannot be argued with. *(record, note 6)*
- **A refusal that only reaches the log is not a refusal.** The typed error is mapped to `503` in `withAuth` / `withAuthParams`, where `ScryptBusyError` set the precedent. *(record, the walkthrough)*
- **Claude does not generate the key and must not see it** (Batch 7.3's rule). *(P-04, step 2)*

**Left open:** arming, which is P-04's step and therefore Batch 8.0's; and the day-close slip reaching real paper, which waits on the printer with everything else in 1.3.

## Batch 3.10 — The three the map left unowned (L-55, L-56, L-58)

**Status:** `COMPLETED` for L-55, L-56 and L-58's label half · **Completed:** 2026-09-06 · **Commit:** `28e1fc2` · **Findings:** L-55 (**closed**), L-56 (**closed in BOTH places** — the archive notice and the signed attestation), L-58 (**◐ — the label is closed, the stored per-line HT is not**) · **Decisions:** none; the table stays empty.
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.10* — specification, validation criteria and status record, moved there verbatim on 2026-09-06.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **The plan's own citations were wrong, and the code is the authority.** Both the plan and the map cite `fiscal.ts:634` and `receipt.ts:58`; `src/lib/fiscal.ts` is 220 lines of pure, DB-free helpers and contains neither. Every citation was missing the `services/` prefix. *(record, note 1)*
- **The archive's `refunds` and `cashMovements` are keyed on the date the money moved**, not on the sale they correct — so a refund paid in a later exercice belongs to the exercice that paid it. *(record, Changes)*
- **A same-exercice refund is listed TWICE, under its order and in the period section, under the same `id` — deliberately.** R10 shows how easily a later batch would "fix" that; the test refuses, and the notice explains the two questions the sections answer. *(record, note 6)*
- **Schema `version` 4 → 5.** A reader keyed on this number must not expect `refunds` or `cashMovements` in a 4. *(record, Changes)*
- **`Caisse N° 1` is a literal on purpose** — one database, one till. **If a second till ever exists this must become per-install**, and so must the counters it sits beside. *(record, note 5)*
- **The attestation's date-certaine assertion runs on the *declaration* only**, from `## Volet 1` down, because the editorial notes say of themselves that they « ne font pas partie de la déclaration » and note 6 deliberately quotes the withdrawn sentence. A whole-file assertion would have forbidden the file from recording its own correction. *(record, note 2)*
- **Do not reintroduce « date certaine »** in the notice or in a signed attestation: a file written, timestamped and hashed by the till confers none, and art. 441-1 is what a false attestation costs. *(attestation, editorial note 6)*
- **`Service N` is exactly as wide as the `Caisse #N` it replaces**, asserted at the narrowest supported width, so **L-21** is not made worse at any column count. *(record, note 4)*
- **The stored per-line HT total was deliberately not built**: it needs an `OrderItem` column, therefore a migration, and the HT the ticket prints is computed on the discounted net after a largest-remainder apportionment, so reproducing it from stored columns means re-running that algorithm rather than dividing by the rate. *(record, note 7)*
- **The four other « Caisse #N » labels in the UI were deliberately left** — the app's own vocabulary for a till session, on screens no fiscal reader sees (safety rule 10). *(record, note 7)*
- **`Shift` rows are still absent from the archive**, noted by map § 4.4 and named by no finding. *(record, note 7)*

**Left open:** **L-58's stored-line-HT half** (no batch owns it; it is the first thing to decide in any batch that opens a migration on `OrderItem`); **L-52** (still no published format); the attestation's remaining reflections — **L-52, L-54, V-01, V-13** — before signature (map § 5.3); V-01, V-03 and V-10 stay external.

---
## Batch 3.11 — The stored per-line HT (L-58's open half)

**Status:** `COMPLETED` · **Completed:** 2026-09-07 · **Commit:** `0996622` + `b8ccb53` · **Findings:** **L-58 CLOSED — both halves** (3.10 the label, 3.11 the stored figure) · **Decisions:** none; the table stays empty.
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.11* — specification, validation criteria and status record, moved there verbatim on 2026-09-07.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **`lineNetTotal` is the line's TTC AFTER the order's discount has been apportioned**, and `lineHt` is `splitVat(lineNetTotal, vatRate).ht` — **the same helper the VAT breakdown uses, so there is no second implementation of the split**. `Σ (lineNetTotal − lineHt)` must equal the order's sealed `vatTotal`; R3 replaced `splitVat` with a floor division and four tests caught it. *(record, Changes and Reverts)*
- **The VAT is `net − HT` and is not stored, because subtraction is not an algorithm.** *(record, note 1)*
- **Existing rows are NOT backfilled**, and null means "recorded before the till kept this figure". Computing HT figures for completed sales and writing them in would be inventing fiscal data. *(record, note 2)*
- **The receipt is deliberately unchanged** — § 50 governs the data the caisse records, not what the ticket prints, and the ticket already carries HT per rate (M-06). *(record, Changes and note 6)*
- **No third journal payload vintage**: `buildVentePayload` carries `itemCount` and no line detail, so nothing hashed changes and *Open Threads → D*'s two-vintage rule still holds. **Checked rather than assumed.** *(record, note 3)*
- **Archive schema `version` 5 → 6**, because `buildAnnualArchive` selects `items: true` and the columns reach the file without the archive code naming them. A reader keyed on the number must not expect these fields in a 5. *(record, Changes and note 4)*
- **§ 50 was re-read before acting, and the research's own caveat stands**: `docs/conformite-isca-recherche.md` § 9.6 **renders** the list, it does not quote it verbatim, and § 50 should be re-read at source before any attestation rests on it. *(record, note 6)*
- **Claude stops only servers Claude started.** `bunx prisma generate` failed `EPERM` because the operator's own server held the query engine; it was not killed. *(record, note 7)*

**Left open:** nothing of L-58's. The `[OPERATOR]` migration **was applied on 2026-09-07 and verified**; Stage 3 closed again with it.


## Batch 3.12 — VAT does not vary by order type, and the drinks are rated as if it did (L-68)

**Status:** `COMPLETED` · **Completed:** 2026-09-09 · **Commit:** `004c112` · **Findings:** L-68 (**closed**)
**Record:** `REMEDIATION_RECORD.md` → *Batch 3.12* — specification, validation criteria and status record, moved there verbatim on 2026-09-09.

**Migration:** `20260909101500_category_vat_rate_takeaway` — one nullable column on `Category`. **Applied to production by the operator on 2026-09-09**, along with the rates. **Stage 3 closes again.**

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **Null `vatRateTakeaway` means "the same rate whatever the order type"**, and that is the property that made the column safe to add: every category resolves exactly as before until one is set. *(record, Changes)*
- `resolveVatRate` resolves **one governing level and reads both rates off it**, so a sale can never be taxed from two places in the catalogue. *(record, Changes)*
- The order type **defaults to `DINE_IN`, deliberately**: defaulting to the reduced rate would let a caller that forgot quietly under-declare. *(record, Changes)*
- `orders/route.ts` is **the one call site that decides what is booked**; the two `effectiveVatRate` call sites are display only. *(record, Changes)*
- **A deploy of this needs `bun run build`.** The worked example was run against a build compiled before the fix and returned a wrong answer that every test had passed. *(record, notes 3 and 4)*
- **`CartItem.vatRate` is vestigial** — nothing displays VAT before checkout and the route ignores what the client sends — so L-68d was dropped after measurement rather than written. *(record, note 6)*
- **L-68f was a SWAP, not an addition**, and the trap sprang anyway: the old 5,5 sat in the column that now means *sur place*. **A fallback that is safe by design is also silent by design.** *(record, notes 7 and 10)*
- **FACTICE must be on for the client's three-day trial**, where the old till is the system of record. *(record, note 12)*

**Left open:** nothing of L-68's. **The combo/menu feature was deliberately excluded and now unblocks**: a menu price cannot be split across rates until the rates themselves are right, and they now are. **`vatRateTakeaway` is category-level only** — a product that overrides VAT keeps its single rate under every order type, which no product on production does today.

# STAGE 4 — SECURITY & INTEGRITY

**Stage status:** `COMPLETED` (2026-09-04) — 4.1 through 4.4, **4.4b**, **4.4c**, **4.5**, **4.6** and **4.7**, all on 2026-09-04.

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

**Left open:** L-28 and L-29 → *Newly Discovered Issues*. *Correction 2026-09-05: **L-28 is resolved** and is no longer in that register — Batch 6.3's per-run database directory removed its failure mode, proved by planting a hot journal; record → Batch 6.3, appended note. L-29 is still open, assigned to 7.2.* **C-09** (Batch 4.2) is untouched — the approve route still runs `scryptSync` once per manager on the event loop, and this batch only stopped a *locked* caller from reaching that loop; whether the fifteen-minute capability lock is the right operational trade-off at a busy till is an operator judgement nobody has been asked for.

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

**Left open:** ~~**C-18's credential half**~~ ✅ **CLOSED 2026-09-04** — the operator changed both live PINs on the running application the same day; see *Operator actions completed* in *Open Threads → B*, and the dated correction appended to this batch's record section. The values are recorded nowhere. ~~**What replaced it, and is now the live risk:** `scripts/seed-users.ts` deletes every user and recreates `admin` and `manager` with the published default PINs hardcoded, so running it once undoes the change — that is **C-17 / DD-08**, Batch 4.5.~~ ✅ **CLOSED 2026-09-04 in Batch 4.5**: the script deletes nothing, holds no PIN, and refuses both published defaults. **L-31** → *Newly Discovered Issues*. The *Credential policy* block moved to the record with this section; **its PIN half is superseded** by the change above, its network half still governs.

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

**Status:** `COMPLETED` · **Completed:** 2026-09-04 · **Commit:** `45a6fb8` · **Findings:** M-19s; DD-07 applied
**Record:** `REMEDIATION_RECORD.md` → *Batch 4.4b* — specification, the removal inventory, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **`LEAST_PRIVILEGED_ROLE` degrades from `CASHIER` to `MANAGER`.** C-16's fail-closed default gets weaker by exactly one rung. *(record, the removal itself)*
- Adding a role below MANAGER means changing this constant, not just the enum. *(record, note 3)*
- **Keep the machinery** — `/api/auth/approve`, `approvals.ts`, `manager-approval-dialog.tsx`, and Batch 4.1's lockout — because Batch 4.4c reuses the lockout, and deleting audited work to tidy up is not this plan's habit. Record it as dormant. *(record, the removal itself)*
- `payment-dialog.tsx` keeps its wiring behind a `false` constant so 4.4c hooks into a path that already works, including the post-audit N1 re-entry mechanism. *(record, note 6)*
- The `USER_SWITCH_BLOCKED` audit action it wrote is retired with it; older rows in the journal keep it and must still render. *(record, Changes (4))*
- `nav-access.test.ts` asserts the default can open strictly fewer views than a manager; that assertion must be revisited, not deleted (safety rule 2). *(record, the removal itself — done in note 4)*
- **No migration** — the enum is app-level only, stored as TEXT with no `CHECK` constraint. **Nothing is waiting on the operator**, and production stood at 6 applied migrations when this was written *(7 since 2026-09-05 — Batch 5.5; the count is a snapshot, not a constraint this batch imposes)*. *(record, note 1)*
- Closing a caisse stays open to any authenticated role. The asymmetry it describes was written for a cashier; widening or narrowing it is a business decision, and this batch deliberately left it alone. *(record, note 8)*
- Rewording it is 4.4c's decision — DD-19 makes it true again with the caller's own PIN — so it is **L-35** rather than a guess made here. *(record, note 7)*
- With one operational role this changes no observable behaviour — which is the point: it removes a latent inconsistency rather than fixing a live leak. *(record, M-19s scope)*

**Left open:** **L-33** (29 declaration sites now name the entire role model, so those gates are no narrower than declaring none — `GET /api/users` and `GET /api/backups` contradict the nav outright), **L-34** (the discount dialog's percentage divides euros by cents) and **L-35** (the discount dialog still promises a manager approval that no longer happens) → *Newly Discovered Issues*. **M-18** is unchanged and still belongs to 5.7. The self-approval gap this batch leaves — a discount of any size and a refund of any amount recorded against the caller with no keystroke — is **Batch 4.4c**'s subject, not a regression.

---

## Batch 4.4c — Step-up PIN for large discounts and every refund

**Status:** `COMPLETED` · **Completed:** 2026-09-04 · **Commit:** `d9b1b08` · **Findings:** L-34, L-35, **M-18** (closed here rather than in 5.7, by operator decision); DD-19 applied
**Record:** `REMEDIATION_RECORD.md` → *Batch 4.4c* — specification, the four operator decisions, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- The token must name the caller. *(record, Changes (1))*
- `discountNeedsStepUp`, extracted verbatim from `orders/route.ts`, on its own with no imports because a `"use client"` component cannot import the service. *(record, Changes (2))*
- Sharing `/api/auth/approve`'s **rate-limit key** so the two surfaces cannot be played off against each other. *(record, Changes (3))*
- **Decided where the old gate stood and consumed after the payment and livraison checks**, so a mistyped payment does not burn a single-use token. *(record, Changes (4))*
- One mandatory step-up, **every refund, no threshold**. *(record, Changes (5))*
- Left optional so the refusal is the route's French sentence rather than an English zod message (L-22). *(record, Changes (6))*
- **No migration** — nothing was added to the schema, so the fix is in force the moment the code runs; production stood at 6 applied migrations when this was written *(7 since 2026-09-05 — Batch 5.5; the count is a snapshot, not a constraint this batch imposes)* and **nothing waits on the operator**. *(record, Files)*
- A "PIN was entered" flag would be **true on every record the batch can produce** — the sale is refused without it — so it would add no information while creating a **third payload vintage** for every future reader to tolerate. *(record, note 1)*
- A step-up failure writes `MANAGER_APPROVAL_FAILED` — Batch 4.1's own action — so five wrong PINs are five **in total** across the step-up and the manager approval, not five each. *(record, note 2)*
- Because every refund needs a PIN, five fumbles mean **no refunds and no large discounts for fifteen minutes**. *(record, note 2)*
- A 400 from those checks therefore leaves the token unused, and `payment-dialog.tsx` mirrors that exactly: it keeps the token on a 400 and discards it on anything else. *(record, note 5)*
- `verifyApprovalToken` marks a token consumed before `consumeStepUpToken` can compare the approver to the caller, so the rightful owner's next attempt gets a 409 and re-confirms. *(record, note 6)*
- Both are kept, as Batch 4.4b kept them, and a second operational role would want them back. *(record, note 7)*
- **No real PIN was used anywhere.** The live values were never seen and are recorded nowhere. *(record, note 8)*
- `TaskStop` kills the parent only; always check the port and the process list. *(record, note 9)*
- This batch binds and compares cents throughout and says so at the top of `step-up.ts`, but does not edit `approvals.ts` — that file is not this batch's (safety rule 10). *(record, note 10)*

**Left open:** **L-36** → *Newly Discovered Issues* (`ApprovalPayload.amount` is commented "euros" and has carried cents since the routes were written). **T-03** is unaffected and still belongs to Batch 6.1: `POST /api/auth/step-up` declares no role list, which the declarative matrix expects of a route open to any authenticated caller, and the matrix asserts declarations rather than driving requests. **L-33** is unchanged — this batch added one gate to the 29 it counts, and narrowing them is still a review. Whether the now-fully-dormant `/api/auth/approve` and `manager-approval-dialog.tsx` should eventually be deleted is the question DD-07's rationale recorded and nobody has yet been asked.

---

## Batch 4.5 — Dangerous operator scripts

**Status:** `COMPLETED` · 2026-09-04 · commit `1a0836b` · **Findings:** C-17 ✅, **L-37** ✅, **L-38** ✅, DOC-09 ✅ · **Decision:** DD-08 (answered 2026-09-04)

Full section, validation and evidence: `REMEDIATION_RECORD.md` → *Batch 4.5*.

Removed `scripts/port-real-data.ts` and `scripts/seed-category-options.ts`; rebuilt `scripts/seed-users.ts` as a delete-free PIN reset; guarded both counter scripts with `src/lib/services/fiscal-counter-floor.ts`; brought `scripts/` under `tsc` and `eslint`; rewrote `scripts/README.md`.

**Constraints this batch leaves behind:**

- **Nothing in `scripts/` may open a database path not derived from `DATABASE_URL` or `HIBAPOS_DATA_DIR`.** That is what makes the scratch-copy method complete; `git grep "new Database("` and `git grep "bun:sqlite"` are how to check it, and both must stay empty.
- **Every script in `scripts/` is a dry run unless given `--apply`, and a new one must be too.** Running any of them with no flag must perform no writes — that is the batch's own validation criterion, and it is why `fix-duplicate-product-options.ts` was flipped from `--dry`-to-opt-out.
- **A fiscal counter may be raised or left alone. It may never be lowered** — all four fields, `lastFiscalEventSequence` included. Repair upward stays available; that is what the scripts are for. The rule lives in `src/lib/services/fiscal-counter-floor.ts` with its own tests, not inline in a script, because `bun test src` cannot reach `scripts/`.
- **The refusal must stay a refusal, never a clamp.** A counter above its tables means rows were destroyed; writing `max(current, proposed)` would let the operator believe a repair happened.
- **`scripts/seed-users.ts` must never delete, never create an account, and never contain a PIN.** It resets one existing account's PIN, journals it as `USER_PIN_RESET_SCRIPT`, and refuses an account that does not exist — minting a super-administrator is the capability the old script abused.
- **Neither published default PIN may appear anywhere under `scripts/`.** The denylist is `PUBLISHED_DEFAULT_PINS` in `src/lib/auth.ts` deliberately, so the refusal is kept without the values living in the folder.
- **`scripts/` stays inside `tsconfig.json` and `eslint.config.mjs`.** Re-excluding it would restore the blind spot that let an async `hashPin` be called without `await`, storing `"[object Promise]"` as a PIN hash.
- **`scripts/README.md` must name every deletion every script performs, and list every file in the folder.** Its old *“Safe to delete after running”* header was false and must not come back.
- Deliberate non-action: **`prisma/seed.ts` and `POST /api/seed` were left alone** — both are already guarded and out of scope, so `prisma/seed.ts` still carries the two published PINs as env fallbacks.
- Deliberate non-action: **`.zscripts/dev.ps1` and `start.ps1` still name `db\custom.db` literally**, but only via `Test-Path` — they open no database and so do not defeat the scratch-copy method.

**Left open:** nothing from this batch. `db/real-data-backup/` was moved out of the repo tree to `../db-snapshots/real-data-backup.pre-cents-port.2026-09-01T17-13-56Z/` on the operator's decision — kept, not deleted, as the only surviving copy of the pre-cents catalogue.

---

## Batch 4.6 — Catalogue data-loss paths

**Status:** `COMPLETED` · 2026-09-04 · commit `974372e` · **Findings:** C-24 ✅, C-25 ✅

Full section, validation and evidence: `REMEDIATION_RECORD.md` → *Batch 4.6*.

Category and product updates no longer delete option groups before validating the payload, and `options` absent no longer means "delete them all". The media library now sees all six image columns instead of three, and journals a deletion.

**Constraints this batch leaves behind:**

- **Validate the whole payload before deleting anything.** A collection that is replaced wholesale must be parsed in full first, and any invalid entry must refuse the entire request. The rule lives in `src/lib/services/catalog-payload.ts` with its own tests; a route must not re-introduce per-entry validation inside the transaction that deletes.
- **`absent` and `[]` are different, and must stay different.** Absent means *leave the existing rows alone*; an explicit `[]` means *delete them all*. `productSchema.options` is `.optional()` and must never be given a `.default([])` again — that default is the whole product-side defect. `PayloadCheck` returns three states for the same reason.
- **Never add an image column to the schema without adding it to `IMAGE_COLUMNS`** in `src/lib/services/media-usage.ts`. The usage scan and the reference cleanup both derive from that one declaration, and they drifted apart the last time each kept its own copy. `media-usage.test.ts` counts the schema's `image`/`icon` columns and fails if the two disagree.
- **`DELETE /api/media` must journal every deletion** as `MEDIA_DELETED` with its per-column reference counts. It wrote no audit row at all before this batch, alone among the destructive routes.
- **Validate the path before touching the database**, in that handler and generally.
- Deliberate non-action: **deleting an in-use image stays allowed with a warning, not refused.** The media view already lists what will break; C-25's remediation asks only that the warning be complete. Making it a refusal is a behaviour decision, not a bug fix.
- Method note: **a scratch copy runs in WAL mode** (the startup guard allows WAL off a cloud-synced path), so restoring one means stopping the server and deleting `-wal` and `-shm` with the `.db` — otherwise the WAL replays over the fresh bytes.

**Left open:** nothing from this batch. `AddOn.image` is covered but carries zero rows in production today, so that column's protection is latent. Duplicate `CategoryOptionChoice` rows sharing one image are pre-existing and out of scope; the usage list correctly reports both.

---

## Batch 4.7 — Transaction and race safety

**Status:** `COMPLETED` · **Completed:** 2026-09-04 · **Commit:** `951e14c` · **Findings:** C-15 (shift-race half — **closes C-15**)
**Record:** `REMEDIATION_RECORD.md` → *Batch 4.7* — specification, validation criteria and status record, moved there verbatim on 2026-09-04.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- Prisma's interactive transactions on SQLite **do not overlap**: the second one's body does not begin until the first has committed. *(record, note 1)*
- A read **outside** a transaction does not wait, and returns `OPEN` while a close is mid-flight; a read **inside** one sees everything committed before its body started. *(record, note 1)*
- An order created while a Z report is being generated: **refuse it, whichever got there first** — no `CLOSING` shift state, no migration, no deterministic pre-emption. *(record, note 2a)*
- The order in which the two Z guards fire was chosen deliberately: the duplicate-Z check runs **before** the status check, so a second close of the same shift still meets *« Clôture déjà effectuée pour cette caisse »*. *(record, note 8)*
- The pre-transaction shift lookup in `POST /api/orders` stays — it is a cheap early refusal that saves opening a transaction, and it is no longer the thing that decides. *(record, note 8)*
- Both codes mean the same thing operationally — the transaction is rolled back, nothing was written, retrying is safe — so both map to the 503. *(record, note 6, on Prisma `P2028` and `P1008`)*
- What prevents [a burnt receipt number] is the rollback, the assertion-first order is a clarity choice. *(record, note 4)*
- Restoring the scratch copy between the two runs meant stopping the server and deleting `-wal` and `-shm` with the `.db` — the copy runs in WAL even though production does not. *(record, note 3)*

**Left open:** **L-40** (a test file that cleans up only *before* each test can break an unrelated file) → Batch 6.3; **L-41** (a raced discounted sale burns the step-up token) → Batch 5.7; the X report still reads outside a transaction, deliberately, because it seals nothing.

---

# STAGE 5 — WORKFLOW GAPS

**Stage status:** `IN PROGRESS` — **5.9 (menus composés) is specified and `NOT STARTED` as of 2026-09-09**; before it the stage was **reopened and closed again 2026-09-08 by 5.8** (L-67, the catalogue editor writing inherited option groups back onto the product). 5.1 through 5.6 and 5.7a–5.7d are all `COMPLETED`, all 2026-09-05. **5.7 was SPLIT into four** on the day it was run; its router section carries the evidence and the criterion map. **DD-09 through DD-15 were all answered 2026-09-05 in one brief**, so 5.4 through 5.7 are unblocked and can be worked in turn. Each batch's spec below carries its answer inline. **Six batches found their own *Validation Required* wanting, in six different ways** — the stage's most reusable lesson: 5.2's was written for the answer it did not get and was re-derived; 5.3's was correct and *incomplete*, and gained five criteria; 5.4's two *Manual* criteria could not be run by hand at all (L-47) and were converted into automated coverage that turned out stronger; 5.6's **assumed a single dead value where there were two**, and said nothing about the second namespace the removal would have destroyed; 5.7b's said **both walls must come down together** when only one had to, and keeping the second is what makes the fix safe; and **5.7d inherited three *Manual* criteria that L-47 blocked outright**, all three converted. Read the criteria before running them, for what they omit as well as what they assume.

Audit section J, step 6: none of these are subtle; all of them generate support calls in week one.

## Batch 5.1 — Keyboard shortcuts

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `8a4429a` · **Findings:** C-20 (**closes C-20**)
**Record:** `REMEDIATION_RECORD.md` → *Batch 5.1* — specification, validation criteria and status record, moved there verbatim on 2026-09-05.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- The contract is strict in both directions: an unset modifier means the key must be pressed *without* it, so Shift+F9 does not check out and Ctrl+F9 does not either. *(hook docstring; record, Tests)*
- Windows reports `/` on layout `0000040C` as vk `0xBF` **with SHIFT**, so this restaurant's own keyboard delivers `key: "/"` *and* `shiftKey: true`. *(record, Changes and note 1)*
- The two cannot collide: QWERTY `Shift+/` emits `?` and AZERTY `Shift+:` emits `/`. *(record, Changes)*
- Both files now import `POS_SEARCH_INPUT_ID` from `app-store.ts` — the wiring cannot drift without a type error, and a source-level test covers the one thing that can still break silently: the `id` attribute on the input. *(record, note 3)*
- Nine of the 25 tests **cannot fail against the old code**, because a matcher that refuses every keystroke satisfies any test asserting a shortcut is refused; they are named in the file as regression assertions. *(record, Tests and note 4)*
- Échap is Radix Dialog's own behaviour — no dialog in the POS overrides `onEscapeKeyDown`. *(record, note 2)*
- No shortcut gained `allowInInput`, so every one of them still stands down while focus is in a text field. *(record, note 8)*
- Not one row of the help dialog was edited: every row now does what it says. *(record, note 8)*
- A `keydown` probe installed on `window` to read `e.defaultPrevented` reports **false for a shortcut that did fire**, if the hook re-registered its listener after the probe went on. *(record, note 7)*

**Left open:** **L-42** (every POS shortcut still fires while a modal dialog is open — F5 during payment flips the sale to Livraison and the checkout is then refused 400) → Batch 5.7. F5 no longer reloads the POS screen, deliberately; `Ctrl+F5` and `Ctrl+R` still do, and F5 still reloads on every other view.

---

## Batch 5.2 — Table selection wiring

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `1abde1f` · **Findings:** C-21 (**closes C-21**), DD-09
**Record:** `REMEDIATION_RECORD.md` → *Batch 5.2* — specification, the **re-derived** validation criteria (with the six they replaced, and why each was void, halved, inverted, widened or kept) and the status record, moved there on 2026-09-05.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- `canAccessView` refuses a view with no row (`if (!item) return false`), the sidebar reads that array, and `home-dashboard.tsx:221-225` filters its own module list against it — one deleted row closes all three. *(record, Changes)*
- Left in the union, `#/tables` would still resolve and the shell would answer *« Accès refusé »*, claiming the address is **gated** when the screen is **gone**. *(record, Changes)*
- **Nothing server-side was deleted**, per DD-09: the `Table` model, the three `/api/tables*` routes, the checkout auto-link and the refund release all stay, each now carrying a comment saying it is retained and unreachable, so the next dead-code sweep does not take it. *(record, Changes)*
- `tables-view.tsx` stays on disk, imported by nothing — it is the only client `/api/tables*` has, and deleting one while keeping the other would be incoherent. *(record, Changes)*
- The 5 that pass are named in the file as regression assertions that **cannot** fail against the old code, because the old code already had everything DD-09 retained. *(record, Tests)*
- `DINE_IN` is **not** withdrawn: it means *eating in*, not *being served at a table*. *(record, note 4)*
- Held tickets keep `Commande N`, and that is now a specification — Batch 5.4 owns held-order lifecycle and should not read it as a bug to fix. *(record, note 5)*
- **Do not treat a lone failure of that test as a code failure without reproducing it**, and do not confuse it with L-24, which is about slow runs, not wrong results. *(record, note 6, on L-43)*
- Source-level assertions in this batch strip line comments first, because an assertion that a file no longer contains a name was satisfied by the *comment* naming what had been removed. *(record, note 2)*

**Left open:** **L-43** (one unreproduced failure of Batch 4.7's ten-sales-against-one-close test; origin not established) → Batch 6.3. The stale production `Table` row (`T1 / Salle`, `OCCUPIED`) was **deliberately not** requested as an operator action — Batch 8.0's *What must be KEPT* list is amended instead, so P-04 sweeps it rather than preserving it (record, note 3).

---

## Batch 5.3 — Cross-shift refunds

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `3917f3a` · **Findings:** C-14 (**closes C-14**), DD-10
**Record:** `REMEDIATION_RECORD.md` → *Batch 5.3* — specification, the five validation criteria plus the five they were missing, and the status record, moved there verbatim on 2026-09-05.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- A refund with **no caisse open** would put cash out of a drawer no report owns — the very outcome C-14's *Impact* describes. *(record, Validation Required)*
- `refund.ts` resolves the paying till **inside** the transaction — the same C-15 race, decided under the lock. *(record, Changes)*
- `SHIFT_CLOSED_DURING_REFUND_MESSAGE` is gone, and `OrderForRefund.shift` with it, so nothing about a refund can depend on the order's own till again. *(record, Changes)*
- One rule: *a period books the sales of its own orders and the corrections it issued*. *(record, Changes)*
- `shiftOrdersWhere` / `periodOrdersWhere` and their matching option factories sit beside `AGGREGATE_INCLUDE`, so a period's fetch and its filter cannot drift apart. *(record, Changes)*
- Making the column `NOT NULL` was considered and **declined**: it would need a migration for a guarantee the code already gives, and it would not survive the hard-deleted shift the missing FK exists to tolerate. *(record, note 1)*
- A correction's VAT is the **difference of the splits**, never the split of the difference. *(record, note 3)*
- `apportion` is never handed a negative target — a state's `netTotal` is zero or positive — so nothing about the largest-remainder split changed. *(record, note 3)*
- `Order.status` is CURRENT state, so it cannot answer a question about a past period; a period-scoped caller asks the arithmetic only, every other caller keeps both arms. *(record, note 4)*
- Three of the 19 tests **cannot fail** against the old code for their own stated reason, and are named as such. *(record, note 5)*
- The four non-fiscal reports keep Batch 3.2b's semantics; the right attribution for a cashier, a product or a customer is **a decision, not a mechanical change**. *(record, note 6)*
- `processRefund` picks the till with `findFirst` + `orderBy: { openedAt: "desc" }`, the same ordering `/api/shifts/summary` and `GET /api/reports/x` already use, so all three name the same till. *(record, note 9)*

**Left open:** **L-44** (the dashboard, cashier, product and customer reports can disagree with `/api/reports/sales` for the same range once a cross-period refund exists) and **L-45** (`POST /api/shifts` reads its single-open-shift guard outside the transaction). **L-43's origin was established here and deliberately not fixed** — it is the eleventh promise in `shift-race.test.ts`'s ten-sales race, not cross-file contamination and not the global `db.order.count()` assertion; the fix stays with Batch 6.3.

---

## Batch 5.4 — Held orders and cart lifecycle

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `4bb7cda` · **Findings:** C-23 (**closes C-23**), DD-11
**Record:** `REMEDIATION_RECORD.md` → *Batch 5.4* — specification, validation criteria and status record, moved there verbatim on 2026-09-05.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- `null → someone` is the page refresh and keeps the cart; `someone → null`, `A → B` and a failed session clear it. *(record, Changes (1))*
- Comparison is by `id`, because `fetchUser` builds a fresh object on every call and reference equality would empty the cart under the cashier. *(record, Changes (1))*
- `clear()` ends a SALE — checkout, and the « Vider » button — and must leave parked tickets alone; `clearForOperatorChange()` ends an OPERATOR and takes the held orders with it. *(record, Changes (2))*
- Both are **functions**, not shared constants: a shared object hands the same `items` array to every caller. *(record, Changes (2))*
- Deliberately a discard and not a euros→cents conversion, because nothing records which shape a payload is and a cart is seconds of re-keying, where a mis-scaled one is a sale rung at a hundredth of its price. *(record, Changes (3))*
- **`version` + `migrate` does not close C-23**, and it is what the audit's own remediation direction asks for: zustand 5.0.10 skips migration entirely when the stored payload has no `version` key, which is exactly the euros-era shape. *(record, note 2)*
- `version` and `migrate` **are kept** — they are correct for a future numbered upgrade — but they are not what makes this work, and the code says so. *(record, note 2)*
- Held tickets keep their `Commande N` label, which is a specification since DD-09 and not a bug for this batch to fix. *(record, note 1)*
- No operator id is stored inside the persisted cart: the hole it would close is a browser closed without logging out, and the session cookie already stands in the way. *(record, note 6)*
- `setTableLabel` remains callerless per DD-09, and nothing in this batch touched it. *(record, note 6)*

**Left open:** **L-47** (the browser pane rendered the login screen with a valid session, on the pre-batch build as well, so the two *Manual* criteria were converted to automated coverage rather than run by hand).

---

## Batch 5.5 — Cash movements

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `51af203` · **Findings:** M-05 (**closes M-05**), DD-12
**Record:** `REMEDIATION_RECORD.md` → *Batch 5.5* — specification, validation criteria and status record, moved there verbatim on 2026-09-05.

**Migration applied 2026-09-05 14:41:21 by the operator**, and production came out **exactly** as the rehearsal predicted — a fiscal fingerprint taken afterwards differs from the rehearsal copy's by zero lines. Both sealed Z reports survived the `ZReport` rebuild unchanged. Production moved `7839db18…` (696 320 bytes) → `7287640e…` (704 512). Record → Batch 5.5, appended note.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- The amount is **signed** — positive into the drawer, negative out — rather than a magnitude plus a direction flag, because `ERREUR_DE_CAISSE` genuinely goes both ways and a flag would let a row contradict its own category. *(record, Changes)*
- `recordCashMovement` resolves the till **inside** the transaction (the C-15 lesson, at a fifth site). *(record, Changes)*
- It deliberately does **not** touch the perpetual `GrandTotal` — a movement is not a sale. *(record, Changes)*
- A shift books the movements it made, a date range books the movements made inside it (Batch 5.3's rule). *(record, Changes)*
- The PIN gate is the **direction of the money, not the category name**. *(record, Changes)*
- Hand-writing `ADD COLUMN` instead of Prisma's table rebuild was considered and **declined**: Batch 3.6 rebuilt this same table and both sealed rows survived, so deviating from the pattern the tool has already proved here is the riskier move. *(record, note 1)*
- The `CLOTURE_M` / `CLOTURE_A` **EVENT** payloads are still untouched; only the close row's own `dataJson` moved. *(record, note 3)*
- Refusing an impossible sign before the token is L-41's shape at the site whose open-till check was already ordered to avoid it. *(record, note 4)*
- Four of the 26 tests fail under no revert: **two are deliberate controls that must not fail**, two are regression assertions. *(record, note 5)*
- A separate lockout counter for cash movements was considered and **not built** — that would reopen 4.4c's decision. Five fumbled payout PINs lock refunds and discounts for fifteen minutes. *(record, note 6)*
- The dialog itself is **`IMPLEMENTED — TESTING REQUIRED` in substance**, and Batch 5.7 or whoever clears L-47 should open it once. *(record, note 8)*

**Left open:** the cash-movement **dialog is untested in a browser** because of **L-47**; nothing else.

---

## Batch 5.6 — Order cancellation and pre-payment void

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `1bb8a48` · **Findings:** M-08 (**closes M-08**), DD-13
**Record:** `REMEDIATION_RECORD.md` → *Batch 5.6* — specification, validation criteria and status record, moved there verbatim on 2026-09-05.

**No migration, and nothing waits on the operator.** `prisma migrate diff` printed *"This is an empty migration"* before the schema edit and after it, and again from the migrations history — `Order.status` is `TEXT NOT NULL DEFAULT 'COMPLETED'` with no CHECK constraint. Production stays at **7 applied migrations, none pending**.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- `PENDING` names two unrelated things: `OrderStatus.PENDING`, removed here, and `Receipt.printStatus`, a plain `String @default("PENDING")` written for every receipt at `checkout.ts:238` — so a grep-driven removal breaks receipt creation on every sale. *(record, note 1)*
- `order-status.test.ts` therefore holds an allowlist naming the receipt sites: an order-status `PENDING` reappearing anywhere fails, **and so does the receipt's `PENDING` disappearing**. *(record, note 1)*
- **Shrinking that allowlist means a receipt no longer starts life unprinted; growing it means `PENDING` came back as an order state under a different name. Either is a decision, and either fails there.** *(`order-status.test.ts`, the allowlist's own comment)*
- If order-before-payment ever arrives — kitchen tickets fired in advance, telephone orders, table service — the enum is where the state comes back, together with a void that journals an `ANNULATION`; these values were deleted deliberately, not overlooked. *(record, Changes; `schema.prisma`, above the enum)*
- `?status=CANCELLED` used to return `200 []`; it now returns 400. Keeping the dead names needs a cast past the generated type, which would reopen the 500 that check exists to prevent. *(record, notes 6 and 7)*
- Keep `STATUS_ENUM` derived from the enum, not from habit; the 400 message is built from `STATUS_ENUM.options` so a second hand-maintained list cannot drift. *(`orders/route.ts`; record, Changes)*
- Three of the new assertions read source text and do **not** prove the route returns 400 — the HTTP behaviour was proved by driving it, and a request-scoped test stays with Batch 6.1. *(record, note 5)*
- One of the 12 new tests fails under no revert: *"finds the source tree"*, a deliberate control against a vacuous source walk, **not counted as coverage**. *(record, note 4)*
- `csv-export.ts` was left alone deliberately — its status line already falls back to the raw value, and folding in only the status pair of its three duplicated label sets would be arbitrary (safety rule 1). *(record, note 9)*

**Left open:** nothing in scope. **L-48** was found while measuring and deliberately not fixed — `/api/shifts/summary` computes `expectedCash` without Batch 5.5's cash-movement term, so it disagrees with `GET /api/reports/x` for the same shift once a movement exists (measured: 21 580 against 26 580). Latent, because that endpoint still has no client caller.

---

## Batch 5.7 — POS and catalogue defects — **SPLIT 2026-09-05 into 5.7a–5.7d**

**Status:** `SPLIT` — this heading is now a router. The work is in the four sections below, each of which is a batch in its own right with its own *Validation Required* and status record.

**Why it was split, and on what evidence.** As written, 5.7 held **twelve items across four risk classes** — a fiscal tender change, two destructive schema removals, pricing arithmetic and a UI architecture change — where every completed batch in this plan has been one finding or a tight cluster. Three measurements taken 2026-09-05 before any code was written settled it.

1. **M-09's surface is far wider than its row says.** The row names `pricing.ts` and `media-usage.ts`. It is **ten files**, including two whole API route files, both product serializers, `seed.ts`'s `SEED_ADDONS`, and three test files.
2. **`addon` is a name collision, the same shape as 5.6's `PENDING`.** `pricing.ts:170-183` merges the **dead** `AddOn` (0 rows) and the **live** `CategoryAddOn` (**21 rows**) into one `addonMap`, reached through one `addons` request field and one `availableAddonIds` set; `media-usage.ts:51-52` lists both models one line apart. A removal driven by `grep addon` breaks the 21 live category add-ons.
3. **M-21 is worse than its row records.** `app-store.ts:147-155` catches any `/api/auth/me` failure to `next = null`, which reaches `operatorChanged(someone, null) → true → clearForOperatorChange()`. A transient network blip does not only eject the cashier — **it wipes the in-progress cart** Batch 5.4 built persistence to protect. Carried into 5.7d.

**Precedent:** 3.1 → 3.1b/3.1c/3.1d and 4.4 → 4.4b/4.4c. **Audit IDs are not renamed and nothing is renumbered**; the finding index still maps each ID to "5.7", and the sub-batch letter is where the work is.

**Where each item went.**

| Sub-batch | Items | Risk class | Migration? |
|---|---|---|---|
| **5.7a** | M-09, M-10 (DD-15) | destructive schema removal | **Yes** — the stage's second and last |
| **5.7b** | M-11 (DD-14) | fiscal — a new tender, and the revenue it must not inflate | No DDL (an enum value) |
| **5.7c** | M-19, M-12, M-15, M-16, L-41 | pricing and validation arithmetic | No |
| **5.7d** | M-20, M-21, M-22, L-42 | POS resilience and UI architecture | No |

**M-17 and M-18 stay here**, resolved in Batch 4.4c on 2026-09-04, before the split. They are kept because audit IDs are never renamed and because their rows record *how* they closed — M-18 by a different mechanism than the one first proposed.

| **M-17** ✅ **RESOLVED in Batch 4.4c** (2026-09-04) | ~~`NOT STARTED`~~ | The discount dialog's "% du sous-total" caption divides euros by cents — a 25 % discount displays as "0,3 %", directly above a correctly-computed approval banner. | `discount-dialog.tsx:35` vs `:39` | Use one unit. Same class as C-01/C-02. **This is the same defect Batch 4.4b re-recorded as L-34** without noticing the audit had already numbered it; 4.4c closed both, and the audit ID is kept because audit IDs are never renamed. |
| **M-18** ✅ **RESOLVED in Batch 4.4c** (2026-09-04) | ~~`NOT STARTED`~~ | A lone manager cannot refund through the UI: the client always opens the PIN dialog, and the server blocks self-approval — while the refund route would have accepted the manager's own session with no token. | `orders-view.tsx:233-238`; `approve/route.ts:121-126`; `refund/route.ts:87-89` | ~~Skip the dialog when `user.role !== "CASHIER"`.~~ **Closed by a different mechanism, by operator decision (2026-09-04):** the refund dialog now asks for the caller's *own* PIN rather than skipping the prompt, so the refund stays a deliberate act instead of becoming a silent one. Verified in the UI — the lone manager completed a full refund. |

**Where each original *Validation Required* criterion went.** Per *Methods*, shown rather than dropped.

| Original criterion | Went to | As |
|---|---|---|
| Missing — M-11 (DD-14, « Offert ») | **5.7b** | kept, and it is that batch's whole spine |
| Missing — M-09 / M-10 (DD-15) | **5.7a** | kept, and **widened**: it named `media-usage.ts` but not the navigable `« Suppléments »` screen, nor the collision with `CategoryAddOn` |
| Targeted test for M-19 through the dialog's own mapping | **5.7c** | kept |
| Targeted test: switching order type produces a total the server accepts | **5.7c** | kept |
| ~~Manual: discount caption matches the banner (M-17)~~ | — | already struck; done in 4.4c |
| ~~Manual: a lone manager can refund (M-18)~~ | — | already struck; done in 4.4c |
| Manual: a failed catalogue fetch shows an error (M-20) | **5.7d** | kept — and **L-47 blocks it**, see that batch |
| Manual: a transient `/api/auth/me` failure does not log the cashier out (M-21) | **5.7d** | kept and **widened** to "does not clear the cart either" |
| Manual: a crash in one view does not blank the topbar or POS (M-22) | **5.7d** | kept — L-47 blocks it |
| Targeted tests for M-15 and M-16 | **5.7c** | kept |
| Regression: `pricing.test.ts` and the cart-store tests still pass | **5.7a and 5.7c** | **split** — 5.7a must not change any pricing figure, 5.7c changes several deliberately |
| `bun test src` / `typecheck` / `lint` — PASS | **all four** | kept in each |

---

## Batch 5.7a — Remove the dead add-on surface and `Customer.postalCode`

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `982168c` · **Findings:** M-09, M-10 (**closes both**), DD-15
**Record:** `REMEDIATION_RECORD.md` → *Batch 5.7a* — specification, validation criteria and status record, moved there verbatim on 2026-09-05.

**Migration applied 2026-09-05 17:48:00 by the operator**, and production came out **exactly** as the rehearsal predicted — a fiscal fingerprint taken afterwards differs from the rehearsal copy's by **zero lines** across all 102 facts. Both `Customer` rows survived the table rebuild, orders #4 and #10 still resolve their customer, and `CategoryAddOn` still holds 21 rows. Production moved `7287640e…` → `96b48ad0…` (still 704 512 bytes). Record → Batch 5.7a, appended note 10.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- `CategoryAddOn`, 21 live rows, keeps its editor, its schema, its media scan and its path into the POS. *(record, Changes)*
- Both the `addons` request field and the DTO field stay: they were never product-specific. *(record, Changes)*
- **A removal beside a survivor needs a positive assertion on the survivor** — the batch stated the trap before the work, the test asserts it in both directions, and the surviving media scan was deleted anyway. *(record, note 1)*
- Dropping `CategoryAddOn.image` from `IMAGE_COLUMNS` makes the media library offer to delete images that are in use, which is C-25, the finding that scan exists to close. *(`media-usage.ts`, and record note 1)*
- Two tripwires fired and **both were amended rather than silenced**, each with a dated comment saying it fired: C-25's image-column count (6 → 5) and C-21's `ALL_VIEWS` table. *(record, note 2)*
- One of the 10 new tests fails under no revert: *"finds the source tree"*, a deliberate control, **not counted as coverage**. *(record, note 5)*
- The out-of-band snapshot goes in **`../db-snapshots/`, a SIBLING of the repo** — creating it inside puts a production database copy in the working tree, and `/db-snapshots/` is now an anchored `.gitignore` entry because of it. *(record, note 8)*
- A `bun run build` failure naming a deleted route may be `.next/dev/types/validator.ts`, a stale generated file `next build` does not regenerate; delete `.next/dev/types/`. *(record, note 9)*

**Left open:** nothing. The migration is applied and verified.

---

## Batch 5.7b — « Offert / repas personnel », the zero-total sale

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `5ccc964` · **Findings:** M-11 (**closes M-11**), DD-14
**Record:** `REMEDIATION_RECORD.md` → *Batch 5.7b* — specification, validation criteria and status record, moved there verbatim on 2026-09-05.

**No migration, and nothing waits on the operator.** `prisma migrate diff` printed *"This is an empty migration"* before the enum edit, after it, and again from the migrations history; `Payment.method` is TEXT with no CHECK. Production stays at **8 applied, none pending**.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- The revenue guarantee is structural, not conventional: an OFFERT line must carry **0**, must be the **only** line, and requires a **zero total**. Take any one away and the tender becomes a way to book revenue nobody collected. *(record, Changes)*
- `checkTenderComposition` also keeps the guarantee the schema gave up — a *paid* tender still needs `amount ≥ 1`. *(record, Changes)*
- The route runs it **before** `consumeStepUpToken`, so a malformed tender never costs the operator a PIN. *(record, Changes)*
- The array-level `.min(1, "Au moins un paiement")` is untouched, because an offert sale sends exactly one line. **Only ONE of the two walls the batch named came down**; the equality check keeps working and is what makes a zero total settleable *only* by OFFERT. *(record, note 1)*
- **No arithmetic was changed to get VAT to zero** — `apportion` already yields it at a total of 0, verified against the real functions with a full-price control. *(record, note 2)*
- `PaymentMethod` is shared with `Refund.method`: OFFERT is **not** a refund channel, `refundSchema` is the wall, and the next value added to this enum inherits the same hazard. *(record, note 3)*
- Two of the 20 new tests fail under no revert and are named: one regression assertion pinning 4.4c's gate, one deliberate control. *(record, note 5)*
- **A schema revert without `prisma generate` is a no-op, not a passing test** — the same revert fails 8 tests once regenerated. *(record, note 6)*
- `receipt.ts`'s tender label reads the shared table and falls back to the raw value; it was a two-branch ternary whose else-arm meant "Bon / Ticket", which would have sealed a new tender onto an immutable snapshot under the wrong name. *(record, Changes)*

**Left open:** nothing in scope. Two findings opened and deliberately not fixed: **L-50** (`isFullyRefunded` treats a zero-total order as fully refunded — benign, under-counts, but the branch was unreachable before this batch) and **L-49** (`validation.ts`'s `checkoutSchema`/`paymentSchema` are a parallel copy the server does not run).

---

## Batch 5.7c — Pricing and validation defects

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `9304d58` · **Findings:** M-19, M-12, M-15, M-16 (**closes all four**) and **L-41**
**Record:** `REMEDIATION_RECORD.md` → *Batch 5.7c* — specification, validation criteria and status record, moved there verbatim on 2026-09-05.

**No migration.** Every item is server or client arithmetic.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **L-41 is narrowed, not closed.** Nothing outside a transaction can close this race — Batch 4.7's assertion **inside** the transaction remains the guarantee, and a test asserts it is still there and still inside. *(record, note 6)*
- Consuming the step-up token stays the **last** thing before the write, which is DD-19's ordering and must not be disturbed. *(record, note 6)*
- `isShiftStillOpen` fails **closed** on a missing row. *(record, note 6)*
- M-15 **refuses** rather than clamps: a clamp sells the item free and silently, and nobody would ever see it. A negative *modifier* stays legal — absolute category pricing produces one by design. *(record, note 2)*
- `MAX_ITEM_QUANTITY` is a till bound, not a business rule, and the route reads the shared constant so a second literal cannot drift from it. *(record, Changes)*
- **A bound added here must not enlarge L-22** — the new refusal is French, and a test pins it. L-22's pre-existing instances stay with Batch 7.1. *(record, note 3)*
- The options-dialog mapping lives in `toCartOptions`, not in the component: a test that keeps building the fixture by hand would keep passing whatever the component does. *(record, note 1)*
- `CART_PERSIST_VERSION` is 2; bump it when the persisted shape changes, as its own comment says. *(record, Changes)*

**Left open:** nothing.

---

## Batch 5.7d — POS resilience and error boundaries

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `d922ce0` · **Findings:** M-20, M-21, M-22 (**closes all three**) and **L-42**
**Record:** `REMEDIATION_RECORD.md` → *Batch 5.7d* — specification, validation criteria and status record, moved there verbatim on 2026-09-05.

**No migration.** **This batch completes Stage 5.**

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- Anything that is not a 401/403 or an explicit `{ user: null }` is `unreachable`, and **the operator and their basket are kept**. Failing towards keeping the session is safe because the auto-lock still guards the screen and every privileged action is re-checked server-side, while a wrongly-cleared cart is unrecoverable work. *(record, Changes)*
- **Every shortcut is suppressed while any modal is open.** A shortcut wrongly suppressed costs one mouse click; a shortcut wrongly fired changes the sale being paid. **Escape stays Radix's alone** and must not be routed through the hook. *(record, note 5)*
- The suppression is checked **first and before `preventDefault`**, so a suppressed keystroke reaches the dialog exactly as it would with no shortcuts registered. *(record, Changes)*
- M-20's failure branch is tested **before** the empty one — a failed fetch leaves the list empty, so an error branch placed after it can never be reached. *(record, Changes)*
- The per-view boundary needs its `inline` variant: rendering `h-screen` would blank the till exactly as the finding complains. *(record, note 6)*
- **Three of this batch's assertions are source-order, not behaviour**, and the test file says so; proving React actually catches a thrown render needs a component harness and belongs with Stage 6. *(record, note 1)*
- One of the 23 tests fails under no revert: a **regression assertion** pinning Batch 5.4's identity rule, which this batch delegates to rather than reimplementing. *(record, note 4)*
- **No browser walkthrough was run and none is claimed** — L-47 stands. *(record, note 7)*

**Left open:** nothing. **L-47 is untouched and still blocks any authenticated browser walkthrough** — it remains assigned to 6.3.

## Batch 5.8 — The catalogue editor writes inherited option groups back onto the product (L-67)

**Status:** `COMPLETED` · **Completed:** 2026-09-08 · **Commit:** `6994e5f` · **Findings:** L-67 (**closed**)
**Record:** `REMEDIATION_RECORD.md` → *Batch 5.8* — specification, validation criteria and status record, moved there verbatim on 2026-09-08.

**No migration.** **Stage 5 closes again.**

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- The guard is **silent rather than a 400, because the client is returning what the GET gave it**; failing the save would stop an operator editing the price of any product with inherited options. *(record, Changes)*
- **The size group is deliberately not filtered** out of the product form: `existingSizes` reads it from the merged list and it drives the product's own base price, which does save. *(record, Changes)*
- The guard is **not** narrowed to spare « Taille ». **Had it been, the same corruption would have been left open for every size group.** *(record, note 4)*
- **Category groups are `CategoryOptionGroup`; `OptionGroup` carries only `productId`.** *(record, note 5)*
- With `inheritCategoryGlobals` false the category contributes nothing, so an identically-named group **is** the product's own and survives; a route test pins it. *(record, note 6)*
- **Criterion 4 was re-derived, not run as written.** What replaced it does not cover the admin form itself (L-67d), which **remains an [OWNER] check on the till**. *(record, note 7)*
- **Production was read, never written, by this session** — only `inspect-options.ts`, `inspect-product.ts` and the repair script's dry run. *(record, note 8)*
- **L-67e was completed by the operator**, who backed the database up and ran `scripts/fix-duplicate-product-options.ts --apply`; the dry run now reports 0. *(record, note 2)*

**Left open:** the override hatch is **all-or-nothing**. `inheritCategoryGlobals = false` drops every inherited option group *and* every inherited add-on, so a product cannot override one inherited group while keeping the rest. That is the pre-existing data model, not something this batch introduced, and no product on production needs it today — recorded here so a future session does not rediscover it as a defect. ~~The [OWNER] check on the admin form (note 7) is the one piece of validation this batch could not run.~~ **Run on 2026-09-08 after the batch closed, at the operator's request** — the editor offers no « Sauces » group for a Croustillant, saving through it leaves one inherited group and no duplicate, and Calzone comes back byte-identical with its sizes intact. Record → *Batch 5.8 → Appended 2026-09-08*.

## Batch 5.9 — Menus composés (combos): the cashier cannot ring one, and the VAT cannot be split

**Status:** `NOT STARTED` · **Specified 2026-09-09** from the operator's rulings; **no code written.** Prerequisite **3.12 is done**, which is what unblocks it.

**Read `docs/politique-ventilation-tva.md` before anything here.** It is the allocation policy, agreed with the operator on 2026-09-09, and this batch implements it.

### The gap

The restaurant sells menus — a fixed price covering several items the cashier must choose one after another. **The application has no notion of a product composed of configurable slots**, and `git grep` finds nothing: no table, no type, no code.

Four such products exist in the catalogue **as ordinary single-price products**: *Menu Eco* (being deactivated by the operator) and the three *Duo* meals. Tapping one drops a single line in the basket and asks nothing, so the kitchen never learns which pizzas were ordered and the price cannot be split across VAT rates.

**The blocking structural fact:** `CartItem` holds **one** set of options and **one** set of add-ons. Two burgers configured differently — the first with salad, the second without — **cannot be represented at all**. This is the shape of the basket, not a screen.

### The operator's rulings — 2026-09-09, and they are the specification

| | |
|---|---|
| **VAT** | Split across rates, by the policy in `docs/politique-ventilation-tva.md`: **prorata of the components' standalone catalogue prices for the order type concerned**. **Sur place performs no split** — every component is 10 % there. |
| **Fallback** | If a menu cannot be allocated, **the whole price is taxed at the higher rate present (10 %)** — never lower. And the admin must **refuse to save** an incompletely configured menu, so the fallback should not be reachable in service. |
| **Supplements** | Charged **on top** of the menu price at their own rate, **outside** the allocation. The forfait that gets split is the menu price alone. |
| **Prices** | Fixed per menu and per order type. Sizes are fixed by the menu, so the cashier **never chooses a size** — only which pizza. |
| **Slots** | "Any pizza" means any product in the Pizzas tree. **A combo may never be a component of a combo** — *Menu Eco* sits under Pizzas and would otherwise offer itself. |
| **Receipt** | The client ticket is the **only** paper — there is no kitchen ticket. It must show the composition, as **indented, price-less lines** in the idiom `receipt.ts` already uses for options (`pushMarked("  · ", …)`). Per-component **amounts are not printed**: they are allocation artefacts, not prices, and printing them would state a price the customer did not pay. The existing *Détail TVA* block carries the rates. |
| **Policy document** | Lives in `docs/politique-ventilation-tva.md` **and** as a setting in Réglages. **Explicitly NOT in `docs/attestation-conformite.md`** — that is the BOI-LETTRE-000242 ISCA model, carrying criminal liability, and VAT ventilation is not an ISCA matter. |

### The three menus

| Menu | Composition | Sur place | À emporter | Livraison |
|---|---|---|---|---|
| **Menu Eco** | 3 × pizza Junior + 1 bouteille | 24,90 | 24,90 | 24,90 |
| **Menu Chill** | 2 × pizza Senior + 1 bouteille | 24,90 | 24,90 | 28,90 |
| **Menu XXL** | 2 × pizza Mega + 1 bouteille | 33,90 | 33,90 | 36,90 |

**None of the three exists yet.** The operator creates them once the feature is built; *Menu Eco* as it stands is a different, damaged product being deactivated. Worked allocations for all nine cases are in the policy document, computed with the application's own `apportion()` and `splitVat()`.

### Items

| Item | Status | What |
|---|---|---|
| **5.9a** | `NOT STARTED` | A data model for a composed product: slots, each with a quantity, a fixed size where relevant, and what may fill it. Migration. Combos excluded from being components. |
| **5.9b** | `NOT STARTED` | The basket can hold a line whose components are **individually configured**. This is the deep change — `CartItem` today cannot express it. |
| **5.9c** | `NOT STARTED` | The slot-by-slot configuration flow: slot *n* of *m*, back and next, a running summary, and the size never asked because the menu fixes it. |
| **5.9d** | `NOT STARTED` | Allocation at checkout, per the policy: explode into one `OrderItem` per component, each carrying its allocated share and its own rate from `resolveVatRate(component, orderType)`. **Use `apportion()`** — largest remainder — so the parts always sum to the menu price. |
| **5.9e** | `NOT STARTED` | The higher-rate fallback, plus admin-side validation that makes it unreachable. |
| **5.9f** | `NOT STARTED` | The composition on the client ticket, and the allocation policy surfaced in Réglages. |
| **5.9g** | `NOT STARTED` | **[OWNER]** Create the three menus once the feature exists. |

### Validation Required

1. **Unit tests on the allocation** — all nine cases in the policy document, asserting the parts sum to the selling price exactly and that sur place produces a single 10 % bucket.
2. **A route-level test on `POST /api/orders`** proving what is **booked** for a menu: the `OrderItem` rows, their rates and their shares, under all three order types. **Batch 5.8's and 3.12's lesson: a rule can be right while nothing consults it — the revert must fail this, not only the unit tests.**
3. **The fallback tested directly**: a menu that cannot be allocated books the whole amount at 10 %, and the admin refuses to save that configuration in the first place.
4. **Supplements**: added on top at their own rate and **excluded** from the allocation base.
5. **The revert protocol** — one property at a time, both directions, and say which tests pass under no revert.
6. **A worked example on a scratch copy**, end to end, through the real UI: ring each menu sur place and à emporter, and read the ticket's *Détail TVA* against the policy document's table. **Rebuild first** — 3.12 note 3 is what happens otherwise.
7. `bun run test`, `bun run typecheck`, `bun run lint`; README counts re-pinned.
8. **Production untouched**, demonstrated rather than asserted.

### Open before coding

- **The accountant has not yet confirmed the allocation method.** The policy document names the three points needing confirmation. The rates are settled; **the division method is the open claim**, and the plan forbids claiming fiscal compliance from testing.
- Whether the *Duo* meals become composed products too, or stay flat. They are live and now have inheritance off, so they ask nothing wrong — but they have the same unrecorded-composition problem.

---

# STAGE 6 — TESTING

**Stage status:** `COMPLETED` (2026-09-05) — 6.1, 6.2 and 6.3. **The stage's own header was wrong on both its headline figures and was corrected before the stage was started** (see the de-staling note above it): 737 tests, not 136 or 363, and 61 routes, not 59. Its claim that *nothing* touched a route was false; what was true is that almost nothing **drove** one, because `withAuth` → `getSession()` → `cookies()` throws outside a request scope. **That was one missing 130-line file** — `route-harness.ts`, built in 6.1 — and six batches had deferred T-02, T-05 and T-06 to here because of it. **Warning 2 is lifted**: `bun run test:e2e` was made safe in 6.3 and now runs against its own disposable database.

Audit section J, step 7: the suite is honest but tests the wrong third. 136 tests pass; **zero touch any of the 59 API routes**, RBAC or sessions. Add coverage where a regression would be invisible and expensive.

*Correction 2026-09-04: the suite is **363** tests since Batch 3.6 (*Open Threads → G*). The claim that no test touches an API route has not been re-audited.*

***Correction 2026-09-05, re-measured before Stage 6 was started — both headline figures are now wrong, and one of the two claims is false.***
- ***737 tests*** *pass, not 136 or 363 (*Open Threads → G* carries it batch by batch).*
- ***61 routes***, *not 59: Stage 5 removed two (`/api/catalog/addons` and its `[id]`, Batch 5.7a) from a tree that already held more than the audit counted.*
- ***"Zero touch any of the 59 API routes, RBAC or sessions" is FALSE.*** *`api-authorization.test.ts` (Batch 4.4, T-03) walks **every** route module and asserts the gate each one declares; a dozen further files reference a route path, and `checkout-guards.test.ts`, `offert-tender.test.ts` and `order-status.test.ts` assert route source directly. **What remains true is the sharper version**: almost nothing DRIVES a route over HTTP inside the suite, because `withAuth` → `getSession()` → `cookies()` throws outside a request scope. Every batch since 4.4 has drawn that boundary explicitly and deferred it here. **That request harness is the real T-02/T-05/T-06 enabler and is what Stage 6 should build first.***

> Several Stage 1–5 batches specify new tests as their own validation. Those tests belong to their batch. This stage covers the structural gaps that do not attach to a single fix.

## Batch 6.1 — Tests for the things that can lose money

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `a8734f4` · **Findings:** T-01…T-07 (**closes all seven**)
**Record:** `REMEDIATION_RECORD.md` → *Batch 6.1* — specification, validation criteria and status record, moved there verbatim on 2026-09-05.

**No application code changed.** T-02…T-07 were coverage gaps, not defects.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **`src/lib/route-harness.ts` is TEST ONLY** — it stubs `next/headers` the moment it is loaded, and nothing in the application may import it. *(record, Changes; the file's own header)*
- A test signs in with the application's **own `createSession`** rather than a hand-minted token, so a test cannot pass against a session shape the app would reject. *(record, Changes)*
- The harness **does not** run Next's routing, middleware or the edge runtime; it proves what a handler does with a given request and session, and nothing about URL matching. *(`route-harness.ts` header)*
- **`bun-types` must not be referenced** — globally or file-locally — because it redefines `fetch` and `ReadableStream` and fights the `dom` lib. `src/types/bun-test.d.ts` declares the one function used. *(record, note 6)*
- **A revert that catches nothing is a question, not a verdict**: ask whether it took effect, and whether the cover lives in another file, before concluding the test is weak. *(record, note 2)*
- Ten simultaneous checkouts do **not** all succeed on this machine, and that is not a defect — the loser is refused 503. A test asserting otherwise is L-43's shape. *(record, note 3)*
- `refund.ts` journals a partial refund as `REMBOURSEMENT` and the one completing the reversal as `ANNULATION`; two half-refunds produce **one of each**. *(record, note 3)*
- Drawing the receipt number outside the transaction fails **22 of 28** tests — the boundary is load-bearing, measured. *(record, note 4)*
- One of the 28 fails under no revert: a **control on the harness itself**, proving its anonymous state really is anonymous. *(record, note 5)*

**Left open:** nothing. **L-43 became more frequent** (2 of 5 whole-suite runs here) because this batch's concurrency tests add contention ahead of `shift-race.test.ts` — exactly what its row predicts. Not this batch's to fix; **Batch 6.3** owns it, and the per-run test-database path is the fix.

---

## Batch 6.2 — Remove misleading tests

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `6201e4d` · **Findings:** T-08, T-09 (**closes both**), **L-02** and **L-49** (which was T-08 opened twice)
**Record:** `REMEDIATION_RECORD.md` → *Batch 6.2* — specification, validation criteria and status record, moved there verbatim on 2026-09-05.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **"Removing them must not reduce real coverage" is a measurement.** Four of the six named behaviour with no other cover, so they were **re-pointed at the live route, not deleted**. *(record, note 1)*
- The live checkout validates with `checkoutIntentSchema`, declared **inline in `orders/route.ts`**. There is no longer a second copy in `validation.ts`, and there must not be one again. *(record, Changes)*
- **Before deleting a symbol, check whether the name means something else somewhere** — `CheckoutInput` was dead in `validation.ts` and live in `services/checkout.ts`. Third such collision in four batches, after `PENDING` (5.6) and `addon` (5.7a). *(record, note 3)*
- A vacuity claim is **demonstrated, not argued**: an unconditional revert proves nothing, because it fails the old assertion too. The realistic regression is a conditional one. *(record, note 2)*
- The test-count delta must be **accounted for unit by unit**, not just reported. *(record, Tests)*

**Left open:** nothing.

---

## Batch 6.3 — E2E and CI safety

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `71324f2` · **Findings:** T-10, T-11, T-12, L-06, L-40, L-43 (**closes all six**). **This batch completes Stage 6.**
**Record:** `REMEDIATION_RECORD.md` → *Batch 6.3* — specification, validation criteria and status record, moved there verbatim on 2026-09-05.

**⚠ `bun run test:e2e` IS NOW SAFE, and warning 2 is lifted.** It prepares a disposable database under the system temp directory, refuses to start if that path is not disposable, runs the **production build** on port **3100**, and its first spec proves the SERVER opened that database before any other spec writes.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- `test-setup.ts` **ABORTS** unless `DATABASE_URL` resolves under the system temp directory — four test files begin by wiping seventeen tables, and a silent fallback is how that accident happens. *(record, Changes)*
- **A guard cannot protect a runner that never loads it**, which was L-06's real hole: `vitest.config.ts` throws at import so `bunx vitest` fails before collecting a test. *(record, Changes)*
- Playwright must never `reuseExistingServer` — a server already listening is one whose database this config did not choose. *(`playwright.config.ts`)*
- The suite logs in **once per run**. Logging in per test trips Batch 4.1's brute-force limiter, and exempting the suite would be a security regression dressed as a test fix. *(record, note 2)*
- **A fixture that hardcodes what another module decides is a duplicate contract** — three tests hardcoded the test-database path and broke on this batch's own change. *(record, note 5)*
- Nothing here weakened a check to get a pass; the one added tolerance asserts, in that branch, that **no `ZReport` row exists**. *(record, note 7)*

**Left open:** **L-47 is NOT reproducible and is NOT fixed.** The pane rendered the authenticated shell on a current build; the `Secure`-cookie hypothesis was tested and **falsified** (`127.0.0.1` is a trustworthy origin). Cause not established. Its row stays open — a session that meets it again should re-open it rather than assume this settled it.

---

# STAGE 7 — CLEANUP AND DOCUMENTATION TRUTH

**Stage status:** `COMPLETED` (2026-09-05) — 7.1, 7.2, 7.4a, 7.4b, 7.4c and 7.3. **7.3's rotation is an operator action, and it is DONE**: the operator ran it on **2026-09-07** and it was verified, the proof being that the 2026-08-28 backup which decrypted hours earlier no longer does. *(Corrected 2026-09-07: this line read "is NOT yet done" for a day after it was.)* **Reopened 2026-09-07 for 7.5** — the three small findings nobody owned (L-22, L-36 / DOC-13, DOC-14) — **and closed again the same day**. **Reopened again 2026-09-07 for 7.6** — L-09 and L-10, pulled forward from *Deferred* because the commissioning session is the first day anyone uses this as a touchscreen — **and closed the same day**. **Reopened a third time 2026-09-07 for 7.7** — L-64, the Button primitive's base sizes, which 7.6 had opened and declined — **and closed the same day**.

Audit section J, step 8. Correct the false statements, remove the dead weight, then rotate secrets. **Batch 7.4 was added 2026-09-05** and runs before 7.3: it carries the nine findings whose assigned batch completed without them.

## Batch 7.1 — Documentation corrections

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `b2262bf` · **Findings:** DOC-01…DOC-08, DOC-10, DOC-11, DOC-12 (**DOC-09 was already done in Batch 4.5**) — *closes every DOC item.*
**Record:** `REMEDIATION_RECORD.md` → *Batch 7.1* — the DOC table, validation criteria and status record, moved there verbatim on 2026-09-05.

**No application behaviour changed.** Every edit is a comment or a document.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **A documentation batch that "fixes" a correct comment has made the documentation worse.** Two of the four "also in scope" comments needed no change, and one claim about them was simply wrong. *(record, note 1)*
- **Safety rule 12 cuts both ways**: the plan is not more authoritative than the code either. *(record, note 1)*
- The README's compliance claim is **qualified, not deleted** — the app is built to the ISCA requirements, and denying that would be its own untruth. *(record, note 2)*
- **`docs/attestation-conformite.md` was read and NOT touched**: it is the operator's legal instrument and it already states the penalty. *(record, note 2)*
- `IMPLEMENTATION_PLAN.md` is a historical record: **nothing above Appendix D may be edited**, and a claim that was false when written but is true today must be recorded as both. *(record, notes 4 and 5)*
- **The audit's list of eight false claims was a sample, not a census**, and Appendix D is not complete either. *(record, note 4)*
- **DOC-08 was deliberately NOT changed to `C:\HibaPOS\data`** — writing a decided-but-unmoved path as fact describes the intended state, which this batch's preamble forbids. *(DOC-08 row)*

**Left open:** **L-51** — `backup.ts` buffers a 47 MB uploads archive in memory at every Z close. The comment is corrected; the behaviour is untouched and unexamined (safety rule 10).

---

## Batch 7.2 — Dead code and dependency removal

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `97c74fb` · **Findings:** L-01, L-03, L-07, L-08, L-12, L-29, APPROVE-DEAD (**L-02 was already done in Batch 6.2**). **L-33 is NOT closed** — see *Left open*.
**Record:** `REMEDIATION_RECORD.md` → *Batch 7.2* — the item table, the DO-NOT-REMOVE list, validation criteria and status record, moved there verbatim on 2026-09-05.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **The list a batch is handed is evidence, not instruction.** Two of L-07's ten entries were wrong; `fromCents` is live and deleting `apiFetch` would have broken every screen. *(record, note 1)*
- An **export** being dead is not the same as a **function** being dead — `apiFetch` and `ensureGrandTotal` lost the `export` and kept the function. *(record, note 1)*
- `formatVariance` exists because `formatEuro` performs the single cents→euros division and **no caller may divide by 100 as well** — that was C-02. Its rationale travelled with it to `format.ts`. *(record, note 3)*
- **Sixteen comments in thirteen files explain a design decision by contrast with the deleted `/api/auth/approve`.** The reasoning is what makes them make sense; each says DELETED and names the successor. *(record, note 4)*
- The five-attempt lockout was **shared** between the deleted route and `/api/auth/step-up`, which is why the dead route could lock out the live one. *(`api/auth/step-up/route.ts`)*
- **The stored `printerName` setting is the operator's to change**; this batch changed only the code defaults and the form placeholder. *(record, note 6)*
- **The DO-NOT-REMOVE list still stands** — the withdrawn tables surfaces are retained on purpose, and `table-withdrawal.test.ts` fails if any is deleted. Removing them is reopening DD-09. *(record, the list)*

**Left open:** **L-33.** Its own text says deciding which of the 29 `["SUPER_ADMIN", "MANAGER"]` gates should narrow is *"a review, not a mechanical fix"*. Two sites are sharper: `GET /api/users` and `GET /api/backups` answer 200 to a MANAGER whose nav entry is SUPER_ADMIN-only, while `GET /api/logs` returns 403 and is the shape they should match. Narrowing them changes who may call an endpoint — safety rule 11. Routed to a decision, not guessed at.

---

## Batch 7.4 — Findings whose batch completed without them

**Status:** `SPLIT` into **7.4a, 7.4b and 7.4c** on 2026-09-05. **It runs BEFORE 7.3**, whose own prerequisite is "every other Stage 7 batch complete"; the numbering is a label, not an order (*Open Threads → D*).

**Why it was split, on the same reasoning as Batch 5.7.** Opened as one batch it held ten items across **three risk classes**, and every completed batch here has been one finding or a tight cluster. Two of the ten change what a fiscal report says and one of those changes the shape of a sealed payload; two are authorization work; six are small independent corrections. Mixing them makes one commit that cannot be reviewed and one revert that cannot be targeted.

| Batch | Items | Why they belong together |
|---|---|---|
| **7.4a — reports that disagree** | **L-48**, **L-44** (DD-21), **L-50** (DD-20) | All three change what a report says about the same underlying orders, all three are answered by an *agreement* assertion, and `report-agreement.test.ts` is where that kind of claim already lives. **L-50 changes the sealed close payload**, which is only safe while zero closes exist. |
| **7.4b — authorization and the login queue** | **L-33** (DD-22), **L-30** | Both are security review rather than defect repair, and both have a plausible wrong fix that must be refused: narrowing a gate the UI needs, and removing the login burn that flattens the timing signal on purpose. |
| **7.4c — small correctness** | **L-45**, **L-31**, **L-32**, **L-19**, **L-24** | Five independent one-file corrections with no shared surface and no decision behind any of them. |

**Audit IDs are unchanged**, and the register still maps each to 7.4.

---

## Batch 7.4a — Reports that disagree

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `807e0c5` · **Findings:** L-48, L-44 (DD-21), L-50 (DD-20) — **closes all three.**
**Record:** `REMEDIATION_RECORD.md` → *Batch 7.4a*.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **A period books the sales of its own orders and the corrections it itself issued** — now the rule in ALL nine aggregation callers, not five. *(record, Changes)*
- **A correcting period contributes a NEGATIVE count, and that is the rule rather than a defect.** Today's figure for "one sale made, one older sale refunded" is **0**, not 1, and a cashier who only issued refunds shows −1 order and a negative total. It is what makes the parts of a year add up to the year, and `cross-shift-refund.test.ts` already pinned the same shape for shifts as `[1, 0, −1]`. *(record, note 3)*
- A give-away is recognised by its **TENDER, not by its zero total** — a zero total is the symptom, an `OFFERT` line is the intent. A zero-total order with no OFFERT line stays uncounted. *(`aggregate.ts`, `isGiveaway`)*
- **A give-away is never a sale**: it stays out of `salesCount`, `itemsCount`, `topProducts`, the VAT breakdown and `byDay`, so *ticket moyen* stays truthful and "top produits" keeps meaning what SOLD. That is DD-20 and it must not be quietly relaxed. *(record, Changes)*
- **The sealed close payload now carries `givenAwayCount` and `givenAwayProducts`**, and could only be changed while **zero closes exist**. The first sealed close fixes the shape for good. `close-timing.test.ts` pins the key list and was amended deliberately, for the third time. *(record, note 2)*
- **`customers/[id]/detail` was examined and deliberately NOT changed**: it has no date range, so there is no period for a correction to be booked into. Recorded in the file so nobody re-opens L-44 there. *(record, note 4)*
- The products report keeps its own **UTC `completedAt`** bounds; that difference is pre-existing and was not settled here. *(`reports/products/route.ts`)*

**Left open:** nothing. **L-51 is untouched** — it belongs to 7.4c or 8.2.

---

## Batch 7.4b — Authorization and the login queue

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `215d9fd` · **Findings:** L-33 (DD-22), L-30 — **closes both.**
**Record:** `REMEDIATION_RECORD.md` → *Batch 7.4b*.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **The unknown-username burn is deliberate and must not be removed.** Batch 4.2 put that derivation inside the concurrency bound on purpose, and the burn flattens the timing signal that would otherwise enumerate accounts. Removing it trades a denial-of-service for an enumeration oracle. *(record, note 2)*
- Past the unknown-user budget the response is **byte-for-byte the one an unknown username already gets** — same status, same message — and only the burn is skipped. *(`login/route.ts`)*
- **The login screen is a profile picker**, so a real sign-in never sends a username that does not exist. That is what makes the budget free for an honest operator, and it is a property of this product rather than an assumption. *(record, note 2)*
- **`GATES` in `api-authorization.test.ts` classifies EVERY authenticated handler**; change any gate anywhere and it fails. Adding a route without classifying it fails too. *(record, note 1)*
- Two boundaries were checked rather than assumed and are correct: **`fiscal/close-month` admits a MANAGER and `fiscal/close-year` does not**; **`audit` admits a MANAGER and `logs` does not**. Both match the README's role table. *(record, note 1)*
- **A test that survives its own revert proves nothing**, and a timing threshold is the easiest way to write one — L-24's machine makes it easier still. *(record, note 3)*

**Left open:** nothing. **L-32** — the two role-gating idioms — is 7.4c's.

---

## Batch 7.4c — Small correctness

**Status:** `COMPLETED` · **Completed:** 2026-09-05 · **Commit:** `9e8e4e7` · **Findings:** L-45, L-31, L-19, L-24 — **and L-32, which 7.4b had already closed.** *This completes Batch 7.4 and every carried-over finding it was opened for.*
**Record:** `REMEDIATION_RECORD.md` → *Batch 7.4c*.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **A guard must be read inside the transaction that acts on it** — C-15's shape, now closed at all four sites Batch 4.7 and this batch found. *(record, note 1)*
- The 409 an operator reads when a till is already open is **unchanged**; only where it is decided moved. *(`shifts/route.ts`)*
- **A lost race has a signature — P2002 — and everything else is a real failure.** A bare `catch` that reports success is how an operator is told a catalogue seeded when it did not. *(record, note 2)*
- **L-19's DISPLAY layer was the defect, not the key.** `vatRateKey` decides how a rate is stored and grouped; changing it would regroup figures that are already sealed. *(`report-widgets.tsx`)*
- **L-24 was fixed by removing the need to remember, not by lowering the scrypt cost**, which is a security parameter. `bun run test` now carries `--timeout 30000` itself. *(record, note 3)*
- A concurrency test must assert **the database**, not a fixed split of the responses — asserting the split is what L-43 was made of. *(`shift-open-race.test.ts`)*

**Left open:** nothing. **L-51** (`backup.ts` buffers a 47 MB archive) belongs to **8.2**, which rehearses a restore and has to read one of those files back.

---


**Why this batch exists, stated plainly so it is not mistaken for a dumping ground.** Every row below was recorded by an earlier batch under safety rule 10 — *found it, did not fix it, it is not this batch's file* — and assigned to whichever batch looked likely to touch that code next. That batch then completed without it, and nothing re-pointed the row. Nine rows accumulated that way, and a row naming a `COMPLETED` batch reads as done. **Nothing here is new work discovered in Stage 7**; every item's full text, measurement and severity is its row in *Newly Discovered Issues*, which stays the single home of the fact.

**All three decisions are ANSWERED** — DD-20, DD-21 and DD-22, put to the operator in plain language on 2026-09-05 before a line was written, as safety rules 10 and 11 require. **One of the three exchanges changed the question itself**: the operator had not seen the give-away tender, asked what it was, and correctly identified that a free meal is a **100 % discount** settled with the OFFERT tender rather than a separate "free" button. The brief was rewritten in those terms before the decision was taken.

| ID | Status | Item | Severity as recorded |
|---|---|---|---|
| **L-48** | `NOT STARTED` | `/api/shifts/summary` computes `expectedCash` without Batch 5.5's cash-movement term, so it and `GET /api/reports/x` answer differently for the same till the moment one movement exists — measured at 21 580 vs 26 580. One term, plus the assertion that the two endpoints agree; `report-agreement.test.ts` is where that claim already lives. | MEDIUM |
| **L-30** | `NOT STARTED` | The unknown-username burn at login competes for the bounded PIN queue, so username enumeration can push honest cashiers to `503`. **Do not "fix" it by removing the burn** — that restores the timing signal Batch 4.2 flattened on purpose. | MEDIUM |
| **L-31** | `NOT STARTED` | `POST /api/seed` reports **any** catalogue-seeding failure as a won race, so a genuine error reaches the operator as success. | LOW |
| **L-32** | `NOT STARTED` | Role gating uses two idioms and only one is visible to the T-03 matrix: about twenty routes declare `withAuth(…, { roles })`, about twenty others admit any authenticated caller and refuse inside the handler. Neither is insecure; `api-authorization.test.ts` cannot see the second. | LOW |
| **L-45** | `NOT STARTED` | `POST /api/shifts` reads its single-open-shift guard **outside** the transaction that creates the shift — the C-15 shape at a fourth site, after Batch 4.7 closed three. Fix it the same way. | LOW |
| **L-19** | `NOT STARTED` | The VAT breakdown renders rates with `toFixed(1)`, so a two-decimal rate such as 1,05 % would display as "1.1 %" on a fiscal report. The display layer needs fixing, **not the key**. | LOW |
| **L-24** | `NOT STARTED` | `bun test src` times out on this machine with no code defect — `scryptSync` at N=2^17 costs ~1519 ms per call here. **Mitigated today by remembering `--timeout 30000`.** The fix is to stop requiring anyone to remember it; **do not lower the scrypt cost**, which is a security parameter. CI already passes it explicitly. | LOW |
| **L-33** | `ANSWERED` — see below | **29 gates across 26 route files declare `["SUPER_ADMIN", "MANAGER"]`, which since Batch 4.4b admits the entire role model** — no narrower than declaring no roles at all. **Decide first**: which of the 29 should narrow to `["SUPER_ADMIN"]`? Two are sharper than the rest — `GET /api/users` and `GET /api/backups` answer **200** to a MANAGER whose nav entry for those views is deliberately SUPER_ADMIN-only (DD-07), while `GET /api/logs` returns **403** and is the shape they should match. Batch 7.2 read this and declined to guess: narrowing changes who may call an endpoint. **ANSWERED — DD-22: narrow the two, review the rest.** `GET /api/users` and `GET /api/backups` → `["SUPER_ADMIN"]`; the other 27 marked deliberate or decorative. → **7.4b** | MEDIUM |
| **L-50** | `ANSWERED` — see below | `isFullyRefunded` treats a zero-total order as fully refunded, so a give-away never appears in `salesCount`, `itemsCount` or `topProducts`. **Decide first**: does a comp count as a ticket, and do its items belong in the product breakdown? Fixing it means editing Batch 3.2's unified aggregation, a fiscal core, for a reporting question nobody has been asked. **ANSWERED — DD-20: show it separately.** Not counted as a sale; a distinct give-away count and item list beside the sales figures, added to the sealed close payload **now**, while zero closes exist. → **7.4a** | LOW (under-counts only) |
| **L-44** | `ANSWERED` — see below | The four non-fiscal reports attribute a refund to the refunded **order's** dimension, so the dashboard's "today" and `/api/reports/sales` disagree once a refund is paid on a different day from its sale. **Decide first**: does a cross-period refund reduce the *selling* cashier's takings or the *refunding* one's? A management question, not a mechanical change. **ANSWERED — DD-21: adopt the fiscal rule.** A period books the corrections it issued, in all four reports. → **7.4a** | MEDIUM |

**Constraints carried in from the rows themselves — copied, not paraphrased.**
- **L-30**: the burn is deliberate. Batch 4.2 put the derivation inside the concurrency bound because unbounded it is the memory-exhaustion path C-09 names.
- **L-50 / L-44**: both were recorded as decisions by the batches that found them. A batch that writes code for either without an answer has violated safety rule 11.
- **L-19** is unreachable while every product is at 10 % or 5,5 %, and it is recorded so a later batch does not preserve it.
- **L-45** is latent: nothing has ever produced two open shifts, and the till has one operator.

### Batch 7.4 — Validation Required

- Each item is fixed **or** explicitly deferred with a reason; none is closed by re-reading the row.
- **L-48**: the two endpoints agree for the same shift with at least one cash movement, asserted in a test, not measured by hand once.
- **L-30**: the timing signal stays flattened — a test proves an unknown username still costs the same as a known one.
- **L-45**: the guard and the create are in one transaction, proved by the concurrency shape Batch 4.7 used three times.
- **L-24**: a run started with no flags does not time out on this machine.
- No decision item has code written for it before the decision is recorded here and in the record.
- `bun test src`, `bun run typecheck`, `bun run lint`, `bun run build` all pass; production `db/custom.db` byte-identical.

### Batch 7.4 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 7.3 — Secret rotation

**Status:** `COMPLETED` for everything this repository can do · **Completed:** 2026-09-05 · **Commit:** `d937ef2` · **Findings:** L-04 (already closed by Batch 2.4), SEC-ROT, DD-04.
**⚠ THE SECRETS ARE NOT YET ROTATED.** That is an operator action, prepared, rehearsed and handed over — *Open Threads → B*, and the hand-over in the record.
**Record:** `REMEDIATION_RECORD.md` → *Batch 7.3*.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **Claude does not generate the new secrets and does not see them.** A secret pasted into a transcript is a secret in a log. *(record, note 6)*
- **Assert the thing the finding is about, not the thing that is easy to read.** `GET /api/auth/me` answers 200 with `{"user": null}`, so a status-code assertion about a session proves nothing. *(record, note 2)*
- **`/api/auth/profiles` never imports `auth.ts`**, so an import-time guard cannot fire on it — it is the wrong probe for anything about secrets or sessions. *(record, note 3)*
- Rotating **invalidates every session and every approval token in flight**, and **changes no PIN** — nobody is locked out. *(record, note 4)*
- **Rotating the backup key loses nothing**, and L-46's premise was re-verified read-only rather than assumed: 0 `Backup` rows, 9 files on disk. *(record, note 5)*
- `output: "standalone"` stays removed. Batch 1.4 may bring it back — **deliberately, with the secret handling designed rather than inherited**. *(`next.config.ts`)*

**Left open:** nothing — **the rotation was done by the operator on 2026-09-07 and verified** (record → *Batch 7.3*, completion note). Its hand-over had been corrected on 2026-09-06 (record → *Batch 7.3*, appended note). Four things moved under it: `FISCAL_CHAIN_KEY` now exists and must **not** be rotated; the restart command is `Restart-ScheduledTask -TaskName "HibaPOS Server"` (1.4); the claim that nothing need precede the rotation **reverses** once the commissioning backup exists, so it belongs at `docs/mise-en-service.md` § 6a, before it; and the hand-over's own verification step — restore a backup taken after rotating — **could not have been carried out until Batch 2.5 fixed L-61**.

---
## Batch 7.5 — The three small findings nobody owned (L-22, L-36 / DOC-13, DOC-14)

**Status:** `COMPLETED` · **Completed:** 2026-09-07 · **Commit:** `6e498e6` · **Findings:** L-22 (**closed**), L-36 and DOC-13 (**closed — one defect, filed twice**), DOC-14 (**closed**) · **Decisions:** none; the table stays empty.
**Record:** `REMEDIATION_RECORD.md` → *Batch 7.5* — specification, validation criteria and status record, moved there verbatim on 2026-09-07.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **The zod locale is imported in two places and both are load-bearing**: `validation.ts` covers the shared schemas and the client forms, `instrumentation.ts` covers the **13 API routes that declare inline schemas and never import `validation.ts`**. Removing either silently returns half the application to English. *(record, Changes and note 2)*
- **A unit test cannot prove this fix.** In `bun test`, any test importing `validation.ts` configures zod for the whole process, so the inline-schema case passes whether `instrumentation.ts` is wired or not. **R2 failed only the assertion that reads the two files as text** — keep that assertion, and prove changes here through an HTTP response. *(record, note 2)*
- **Per-field messages still win** — zod prefers a message declared on a field over the locale — so the 19 French messages already in `validation.ts` are untouched, and that is the property that makes a global change safe. *(record, Changes)*
- **`ApprovalPayload.amount` is integer CENTS, never euros**, and every caller has always bound cents. *(record, Changes)*
- **On integer cents, `Math.round(x * 100) / 100` is the identity** — which is why DOC-14's displayed figure was never wrong and why its test is a control rather than coverage. *(record, note ... and Reverts)*

**Left open:** **L-14** and **L-47**, both deliberately — **neither is code work**. L-14: an archived receipt is immutable and must not be re-rendered, and Batch 8.0 deletes the affected population, so the finding empties rather than closes. L-47: Batch 6.3 could not reproduce it and falsified its own hypothesis; **re-open on the next occurrence** rather than assigning it to a batch with nothing to reproduce.
## Batch 7.6 — Touch targets and label association (L-09, L-10)

**Status:** `COMPLETED` · **Completed:** 2026-09-07 · **Commit:** `1439628` · **Findings:** L-09 (**closed**), L-10 (**closed** — and its premise substantially corrected) · **Opened:** **L-64** · **Decisions:** none; the table stays empty.
**Record:** `REMEDIATION_RECORD.md` → *Batch 7.6* — specification, validation criteria and status record, moved there verbatim on 2026-09-07.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **The guard parses whole JSX elements, tracking braces, quotes and nesting.** Two measurements in this batch were wrong from cheap parsing — a line-based grep reported 10 nameless icon buttons (real: 0) and a non-greedy regex reported 33 nameless inputs (real: 5), defeated by the `>` inside `onChange={(e) => …}`. **R7 exists to prove that matters.** *(record, note 2)*
- **A group label's `id` alone is not enough — it must be POINTED AT** by an `aria-labelledby` in the same file. R5 was a revert nothing caught until the test was strengthened. *(record, note 3)*
- **`htmlFor` is preferred to `aria-label` wherever a visible label exists** — an `aria-label` on a control that already shows text creates a second name, and a screen reader announcing something different from what is on screen is worse than the gap it closed. *(record, note 4)*
- **The Button primitive's base sizes were deliberately NOT changed** — `default h-9` (36 px), `sm h-8` (32), `lg h-10` (40), `icon size-9` (36). Raising them grows every button in the application, in dense tables nobody in this session can see rendered. **That is L-64, a decision for the operator.** *(record, note 5)*
- **No visual verification is claimed.** Eleven controls got taller and no session saw them render; **that the till still reads well is an `[OWNER]` check**, in runbook § 2. *(record, Not claimed)*

**Left open:** **L-64** — the Button primitive's base sizes, recorded in *Newly Discovered Issues* as a decision rather than taken here.
## Batch 7.7 — The Button primitive's base sizes (L-64)

**Status:** `COMPLETED` · **Completed:** 2026-09-07 · **Commit:** `1379e93` · **Findings:** L-64 (**closed**) · **Decisions:** none; taken by the operator.
**Record:** `REMEDIATION_RECORD.md` → *Batch 7.7*.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **`sm` is now the same height as `default`, deliberately** — it stays smaller in padding, gap and type. On a till where every control is touched, "small" cannot mean "below the floor"; it means "takes less room across". *(record, note 3)*
- **103 of 144 `<Button>` elements declare no height of their own** and take the variant's, which is why the call-site guard could not see them. Both levels are now asserted. *(record, L-64)*
- **A constraint recorded once is worth re-testing before it is inherited a third time.** 7.6 deferred partly because nobody could see the application render; going and looking turned out to be possible. *(record, note 2)*

**Left open:** nothing of L-64's. **L-47 is amended, not closed** — see *Newly Discovered Issues*.

# STAGE 8 — FINAL VALIDATION

**Stage status:** `IN PROGRESS` — **8.1 `COMPLETED`** (the live database verified read-only: 27 checks pass, 1 flagged and explained) and **8.2 `IN PROGRESS`**: **V-06 is `COMPLETED`** and only **V-07**, a full trading day on the real hardware, is left. 8.0 waits on 1.3/1.4's commissioning and must run before the first real sale; 8.3 is external. *(Corrected 2026-09-07. This line said 8.2 was `BLOCKED` on **L-61**, and stated the diagnosis as "`fs.rename` over the open database returns `EPERM`" — **Batch 2.5 fixed L-61 on 2026-09-06 and established that this diagnosis was the wrong one**: `$disconnect()` releases the handle in 4–9 ms, and the real cause was that the server built **two** PrismaClients. Keeping the superseded cause in a stage header is how a wrong diagnosis outlives its correction.)*

Audit section J, step 9. Nothing here is a code change; all of it is proof — with the exception of P-04 below, which is a deliberate data operation.

## Batch 8.0 — Pre-go-live fiscal reset

**Status:** `NOT STARTED` · **PREPARED AND REHEARSED 2026-09-06** · Must run **before the restaurant's first real sale**, and can never be run after one.

**The script P-04's hard constraint 3 requires now exists: `scripts/pre-golive-reset.ts`**, dry run by default. It refuses if `FISCAL_CHAIN_KEY` is already armed (the arming comes *after* the reset, so a key in place means the order was inverted or the reset already ran), refuses while the application still answers on port 3000, and asks for `EFFACER` plus a backup confirmation before it writes. `--yes` exists only for rehearsal and is itself refused unless `DATABASE_URL` looks disposable — demonstrated: pointed at a non-disposable path it refused and the 20 orders were still there afterwards.

**Rehearsed end to end on a copy of production**: 152 rows and 2 archive files deleted, counters to `0/0/0/0`, **catalogue intact across all 14 preserved tables**, and the resulting database passes **all 28 of Batch 8.1's checks** with an empty chain reporting `ok` at `lastSequence: 0` (hard constraint 5). The app was then started on it and the first sale came out as **Caisse #1, Ticket N° 1, fiscal event #1, `GrandTotal` 1 050 / 1 order** — which is the whole point of the batch.

**The ordered session that runs it is `docs/mise-en-service.md`.** It closes 1.3's `[HW]`, 1.4's `[MACHINE]` and this batch in one sitting, in the only order that works.

**Deliberately NOT deleted, and P-04 does not ask for it: `AuditLog`.** 468 rows of development history stay. Deleting an audit trail is the exact thing this application forbids everywhere else, and the audit log is not fiscal data — the fiscal journal is, and that is what the reset clears. Same for `TechnicalLog`, `Session` and `Backup`.

### P-04 — Reset the fiscal journal for a clean opening

**Status:** `NOT STARTED` · Category: pre-production data operation · **Decided by the operator, 2026-09-03**

**Why.** The live database carries development test trading: **20 orders, 21 payments, 20 receipts, 3 shifts, 2 Z-reports, 2 fiscal events** and a `GrandTotal` of 54,80 €, all created while building the app — the restaurant has never run HibaPOS. Opening on that state would make the first genuine receipt **#21**, sitting in a journal behind twenty tickets that never happened, with a grand total that never was.

**Decision (operator, 2026-09-03).** Keep the database and the catalogue; delete the trading data — orders, order items, payments, receipts, refunds, shifts, Z reports, fiscal events, grand total, monthly/annual closes and fiscal archives — and reset `FiscalCounter` to zero, immediately before go-live.

**What must be KEPT.** Categories, products, option groups, option choices, add-ons, product images, customers, ~~tables~~, users and settings. The catalogue is real work recovered in commit `0c5ede6`; only the trading is fake.

**Amendment, 2026-09-05 (Batch 5.2).** **`tables` is struck from that list and moves to the delete list.** This sentence was written while the floor plan was a live feature; DD-09 has since withdrawn it, and 5.2 removed the screen from the navigation. What remains in production is **one row** — `T1 / Salle`, status `OCCUPIED`, `currentOrderId` **null**, never linked to any order — which no screen can now display and no code can now reach (`checkout.ts:203` is guarded on a `tableLabel` the cart has no writer for). Deleting it is the operator's action (warning 4) and was **deliberately not** requested as a standalone one, because the benefit today is zero and this batch is already scheduled to open the live database with a reviewed script and a verified backup. **The `Table` model itself stays** — DD-09 keeps the model, the API and the server-side auto-link in case table service ever exists; it is the stale row that goes. Reasoning in full: record → Batch 5.2 note 3.

**Amendment, 2026-09-05 (Batch 5.5).** **`CashMovement` joins the delete list.** The decision above enumerates the tables to clear and was written before the table existed; entrée/sortie de caisse rows are trading data by the same argument as payments and refunds, and a reset that left them would carry development cash movements into the first real day and corrupt the opening `expectedCash`. **Zero rows exist today** — the feature is inert on production until its migration runs (*Open Threads → A*) — so this costs nothing now and is easy to forget later, which is why it is written here rather than discovered during the reset. The `MOUVEMENT_CAISSE` journal entries go with the rest of `FiscalEvent`.

**Amendment, 2026-09-06 (Batch 3.8, written when the batch was specified rather than when it lands).** **`DailyClose` joins the delete list**, by the same argument as `CashMovement` in 5.5: the decision above enumerates the tables to clear and was written before the table existed, and a reset that left day closes would carry development trading into the first real day and break the day chain's sequencing guard. The `CLOTURE_J` journal entries go with the rest of `FiscalEvent`. **Zero rows will exist until 3.8 ships**, so this costs nothing now and is easy to forget later, which is why it is written here rather than discovered during the reset.

**Amendment, 2026-09-06 (Batch 3.9), rehearsed end to end the same day.** **The reset is also where the keyed fingerprint is ARMED**, and the order matters: reset first, so the journal is empty, then set the secret, then the first real sale. Doing it the other way round leaves a chain whose early rows were written unkeyed, which 3.9's guard refuses — **proved on a scratch copy: with the key set over the existing two-event journal, `POST /api/fiscal/drawer` answered `503` with the French refusal and the journal did not move; after emptying the journal the same armed server wrote freely, and the event recomputes under the key and NOT without it.**

**The exact step, between P-04's reset and the first real sale:**
1. Run the reset. `FiscalEvent` is empty and `FiscalCounter.lastFiscalEventSequence` is 0.
2. **The operator generates the key and pastes it into `.env`** as `FISCAL_CHAIN_KEY` — 32 characters or more, `openssl rand -hex 32`. **Claude does not generate it and must not see it** (Batch 7.3's rule).
3. **Back the key up somewhere that is not the till.** ⚠ **Lose it and the journal can never be verified again**; every hash was computed with it. Treat it like `BACKUP_ENCRYPTION_KEY`.
4. Restart the application.
5. Confirm before trading: `GET /api/fiscal/verify` answers `"chainKeyed": true` with the event chain `ok`. If it answers `ok: false` with a `keyDiagnosis`, the order was wrong — stop and fix it before the first sale.

**Arming is optional and skipping it is a supported state.** Unset, the chain stays plain SHA-256 and everything works exactly as it does today. Nothing in law requires the key (`docs/conformite-isca-recherche.md` § 9.4).

**Hard constraints.**
1. **Timing is the whole safety property.** This runs once, before the first real sale. From that sale onwards the chain is append-only and a reset becomes precisely the deletion the attestation in `docs/attestation-conformite.md` states is impossible.
2. Take a full backup first, verify it opens with `scripts/decrypt-backup.ts`, and keep it out-of-band.
3. It must be a written, reviewed script — **not** an ad-hoc `deleteMany` at a console, and not one of the existing unguarded seed scripts (C-17).
4. Record the before/after row counts and the reset counters in this plan, the way the Batch 0.2 baseline was recorded. *(The Batch 0.2 Baseline Record is in `REMEDIATION_RECORD.md` → Batch 0.2.)*
5. Re-verify `/api/fiscal/verify` afterwards: an empty chain must report `ok` with `lastSequence: 0`.

**Related.** `settings.factice` exists precisely so test transactions are stamped as simulations and can never be mistaken for real ones. It is currently `false`, which is why the development sales look genuine. Consider setting it `true` for any further testing on the live machine before go-live, and `false` at opening.

**Dependencies.** Deployment (Batch 1.4) and the printer sign-off (Batch 1.3) should be settled first — otherwise the commissioning itself would put new test sales into the freshly reset journal.

## Batch 8.1 — Live database verification

**Status:** `COMPLETED` · **Completed:** 2026-09-06 · **Commit:** `ce500ac` · **Findings:** V-04 (**closed**), V-05 (**closed**); **L-60 recorded, resolved by 8.0**.
**Result: 27 checks pass, 1 flagged** — and the flagged one is a fact about the development data, not a defect. Evidence: `docs/verification-8.1-2026-09-06.txt`.
**Record:** `REMEDIATION_RECORD.md` → *Batch 8.1* — specification, validation criteria and status record, moved there verbatim on 2026-09-06.

**Constraints this batch leaves behind** *(sentences copied from the record, not paraphrased)*
- **The chains were verified against the live bytes rather than through the route**, because running the route means starting a server against the production database and *Methods* allows read-only inspection only; they were recomputed with the app's **own** `verifyEvents` / `verifyCloses`, imported rather than reimplemented, so the check cannot pass by agreeing with a copy of the bug. *(record, Validation)*
- **V-04's own suspicion is not borne out. There is no counter drift.** Every counter equals its table's maximum exactly: receipt 20/20, shift 3/3, Z 2/2, event 2/2. *(record, V-04 (3))*
- **`GrandTotal` is unchanged from the Batch 0.2 baseline in every field**, as are `FiscalCounter` and the chain's `lastSequence`. Three months of remediation, nine migrations, and not one fiscal figure moved. *(record, V-05)*
- **L-60 is not a defect in today's code**: `checkout.ts:293` appends the `VENTE` inside the same transaction that creates the order, and `sale-journal.test.ts` covers it. The eighteen unjournalled orders predate commit `d7ceb18` (2026-08-29), which is where the journal entered the checkout path. *(record, note 1)*
- **The Z-report-versus-grand-total gap is arithmetic, not corruption, and it reconciles exactly.** The Z reports aggregate `Order` rows and are internally correct; `GrandTotal` counts only what was journalled. **Both numbers are right about different questions.** *(record, note 2)*
- **This is one more reason 8.0 is not optional**: until the reset the journal cannot be reconciled against the orders table at all, and no attestation should be signed over a database in that state. *(record, note 3)*
- **Shift 3 has been open since 2026-08-28** and holds 5 orders — development state, deleted by 8.0; noted so a later session does not read it as an incident. *(record, note 4)*
- **Nothing was written**: sha256, size and mtime byte-identical before and after, no `-wal`/`-shm`, and the script opens the file `readonly: true` from the session scratchpad rather than from `scripts/`. *(record, note 5)*

**Left open:** **L-60**, which 8.0's reset resolves; **8.2** (restore rehearsal and a full trading day) and **8.3** (external review) are untouched by this batch.

## Batch 8.2 — Restore rehearsal and full-day trading

**Status:** `IN PROGRESS` — **V-06 `COMPLETED`**: rehearsed 2026-09-06, failed on **L-61**, which **Batch 2.5 then fixed**, after which the same rehearsal succeeded end to end. **V-07 `DEFERRED` `[MACHINE]`** — a full trading day on the real hardware.

| ID | Status | Task |
|---|---|---|
| **V-06** | `COMPLETED` (via 2.5) | Restore rehearsal onto a clean machine: database and images both come back; product images render in the POS; the fiscal chain verifies. |
| **V-07** | `DEFERRED` `[MACHINE]` | A full day of trading in FACTICE mode on the real hardware: open shift, mixed order types, split payments, discounts with approval, refunds, reprints, drawer opens, X report, Z close, automatic backup, then a month close. |

### Batch 8.2 — Validation Required

*(Re-derived 2026-09-06, per **Methods**. All six were written for **V-07**, the
day of trading on real hardware — none of them is runnable from Tunisia, and
none is void. They are kept verbatim and marked `[MACHINE]`. **V-06 had no
criteria of its own**, which is the gap this batch fills.)*

- Every receipt printed physically and legibly at 80 mm (contingent on DD-01). — **[MACHINE]**
- Every drawer open occurred physically and appears in the journal. — **[MACHINE]**
- The Z report reconciles to the counted drawer with a variance the operator can explain. — **[MACHINE]**
- The FACTICE stamp appears on every ticket and every event carries `factice: true`; confirm none of the day's data is mistakable for real fiscal data. — **[MACHINE]**
- Power-cut simulation mid-shift: the app returns on reboot, the open shift is intact, no partial order exists. — **[MACHINE]**
- `/api/fiscal/verify` reports `ok` at the end of the day. — **[MACHINE]**

**Added for V-06, and all of them were run:**

- [x] A backup is created **through the real route** on a scratch install, and the `.dbenc` and media archive both land on disk.
- [x] `GET /api/backups` lists it — the half L-46 says is empty on production.
- [x] The database diverges from the backup (a sale) and a product image is deleted, so a restore has something to undo.
- [x] `POST /api/backups/[id]/restore` is driven, **and its outcome recorded whatever it is.**
- [x] After recovery: the sale is gone, the grand total and the chain are back to the backup's state, all four chains verify, and the deleted image serves again.
- [x] The three **real** encrypted backups on production are tested for readability with `scripts/decrypt-backup.ts` — the question L-46 leaves open.
- [x] L-51's memory cost measured, on the real server, not estimated.
- [x] Production untouched.

### Batch 8.2 — Status Record

**Status:** `BLOCKED`
**Completed:** — · **Commit:** *(this commit)*
**Findings:** **V-06 rehearsed and FAILED — the failure is the finding (L-61, HIGH).** V-07 `[MACHINE]`, untouched. **L-46's cause established.** **L-51 measured.** **L-62** recorded.
**Blocker:** V-06 cannot pass until **L-61** is fixed — a code change to a fiscal recovery path, which a proof batch may not make (safety rule 10). V-07 needs the till.

**What was done.** A scratch install was built from a copy of production with all 139 product images, marker-proved through the pre-auth `GET /api/auth/profiles` before the first write, and driven through the real routes on ports 3072–3074. A backup was created (700 KB `.dbenc` + 47.6 MB media, 6 s), listed, diverged from by a sale and a deleted image, and then restored. **The restore failed, reproducibly, on a clean second run.**

**L-61 — `restoreBackup` cannot complete on Windows while the app is running, and the app is the only way to reach it.** The swap is `fs.rename(staged, dbPath)`. The code does the right thing around it — `await db.$disconnect()` first, `$connect()` in `finally` — but **`$disconnect()` does not release the Windows file handle**. Proved rather than inferred: with the server up, `File.Open(custom.db, ReadWrite, share=None)` fails with *"being used by another process"*, and the rename returns `EPERM`. Since `POST /api/backups/[id]/restore` is an HTTP route, the process that must release the file is the one serving the request. **This is the recovery path for a fiscal database, built in Batch 2.1, and it has never completed on this installation** — which is exactly what L-46 said, without knowing why.

**What held, and it is most of the design.** The failure lands at the swap — *after* everything reversible and *before* anything irreversible — so **the live database is never touched**: chain `ok`, counters intact, application still serving. A `pre-restore-*.dbenc` safety snapshot is written first and survives. The staged file is checksum- and schema-verified **before** the swap is attempted. **No `RESTAURATION` event is journalled for a restore that did not happen** — the journal stayed truthful, verified event by event.

**And the data is recoverable — by hand.** Stop the app, put the decrypted file in place, delete `-wal`/`-shm`, extract the media archive, restart. Done end to end: events rolled back **3 → 2**, grand total **6530 → 5480**, all four chains `ok`, uploads **138 → 139**, and the deleted `Burger.png` served again at **74 680 bytes** — its exact pre-deletion size. So the capability exists; the one-click path does not.

**L-46 — cause established, and it also explains L-60.** The finding says "cause not established" for three backup files on disk with zero `Backup` rows and no `BACKUP_DELETED` in the audit log. The baseline migration `20260829112122_init_integer_cents` is **30 `CREATE TABLE` statements and zero `INSERT INTO`** — a from-scratch schema, not an alter-and-copy. On 2026-08-29 the database was rebuilt empty and the data re-imported selectively: the catalogue, orders and 468 audit rows came back; `Backup` rows did not, and neither did any `FiscalEvent` (there was no such table before that day). That single event accounts for **both** open findings — the unreachable backups **and** L-60's eighteen unjournalled orders — and for why the audit log still holds three `BACKUP_CREATED` rows naming `Backup` ids that no longer exist.

**And it is worse than L-46 says, for a second and independent reason.** Even with the rows present, **none of the three files could be restored into today's app**: the newest decrypts to a valid SQLite database with **26 tables and no `FiscalEvent`, `GrandTotal`, `MonthlyClose`, `AnnualClose`, `FiscalArchive`, `DailyClose` or `CashMovement`**, so `assertCompatibleSchema` refuses it — correctly, and with the right message. **The live install therefore has no restorable backup at all, and cannot have one until a fresh backup is taken against the current schema.** That is an action for the commissioning session, and it costs six seconds.

**L-51 — measured, and about five times the estimate.** The finding guessed "on the order of 100 MB". On the real server, a create-plus-restore cycle over the 47.6 MB media archive took the process to a **peak working set of 510.5 MB**, from a 135 MB baseline. Standalone, decrypting the archive alone costs **136 MB and 0.8 s**. A backup runs at **every Z close**, so this is a nightly half-gigabyte spike on a machine whose RAM nobody has measured — and it grows with the photo library, not with the trading.

**Notes.**

1. **The rehearsal is the point, and it worked.** Batches 2.1 and 2.2 built the restore, six batches of tests covered it, and it took driving the real route on a real copy to find that it cannot finish. Nothing short of this would have.

2. **I mis-tested the cause once and the first answer was wrong.** The first isolation renamed the staged file to a *new* name, which always succeeds, and reported "the handle is not the cause". The correct test is a rename **over** the open file, plus an exclusive open. Both were then run and both fail. Recorded because the wrong conclusion was on screen for a minute and would have been easy to keep.

3. **L-62: a failed restore leaves a 47.6 MB PLAINTEXT copy of every product photo in `db/backups/`**, alongside `custom.db.restore-staged`, and the `pre-restore-*.dbenc` it wrote has **no `Backup` row** — so the one-click rollback the route's own comment promises does not exist after a failure, and the litter is never cleaned up. Recorded, not fixed.

4. **Production runs in rollback-journal mode; the rehearsal ran in WAL**, because the scratchpad is not cloud-synced. It is therefore **not established** whether L-61 also bites in rollback mode — the handle test says the file is held either way, but that was measured only under WAL. **Batch 1.4's move to `C:\HibaPOS\data` turns WAL on**, so the commissioning session will be running the mode this was reproduced under. Worth knowing before, not after.

5. **The legacy July `.json` backups were checked for credential exposure and are clean**: user records carry `id, username, name, role, active, createdAt, updatedAt` and **no `pinHash`**. They do contain 4 customer rows in plaintext, which is personal data sitting unencrypted on the till; noted for the operator, not decided here.

6. **Production untouched.** `db/custom.db` sha256 `c9f265163691c93e3402354616b1902f5898006657d47eb8da999e1c6813dceb`, 704 512 bytes, mtime 2026-09-06 17:49:32 — identical before and after. No `-wal`/`-shm`. `db/backups/` still 9 files, `public/uploads/` still 139, `db/fiscal-archives/` still absent. Every write went to the scratchpad; the prep script refuses any path outside it, demonstrated when it correctly rejected a path from the previous batch. Servers on 3072, 3073 and 3074 all stopped by PID.

## Batch 8.3 — External compliance review

**Status:** `REQUIRES EXTERNAL VERIFICATION`

Revisit the compliance question with a certification body and a qualified French tax professional — **not with this document, and not with `IMPLEMENTATION_PLAN.md`'s checkboxes**. See *External / Legal / Fiscal Verification* below.

### Stage 8 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

# EXTERNAL / LEGAL / FISCAL VERIFICATION

**📎 `docs/conformite-isca-recherche.md` (2026-09-06) is the sourced research behind the annotations in this section** — the four ISCA conditions as BOFiP words them, the attestation rules, the penalties, what a control actually inspects, and the seven questions still owed to a fiscal professional. It reports what published sources say and **asserts no compliance**. Read it before re-litigating anything here.

**Nothing in this plan, and no test result produced by it, constitutes evidence of French fiscal or legal compliance.** The audit deliberately did not offer a compliance opinion, and neither does this document.

The repository ships `docs/attestation-conformite.md`, a fill-in-and-sign editor's attestation. It cites art. 441-1 of the code pénal, which makes a false attestation a criminal offence. The accuracy of its ISCA section should be settled by a qualified party **before anyone signs it**.

| ID | Status | Question for external verification |
|---|---|---|
| **V-01** | `REQUIRES EXTERNAL VERIFICATION` | Is an **unkeyed SHA-256 chain** sufficient for the inalterability requirement, or is a keyed/signed scheme or external anchoring expected? Anyone who can write to the database file can recompute the whole chain and `/api/fiscal/verify` will report `ok`. (C-22) **⚠ THAT SENTENCE IS NOW CONDITIONAL (Batch 3.9).** It is true while the chain is unkeyed, which is its state on production today. With `FISCAL_CHAIN_KEY` armed the fingerprints are HMAC-SHA-256 and cannot be recomputed from the source alone. **The question V-01 asks is unchanged** — no official source addresses either form — and the keyed mode is the operator's choice, not an answer to it. **RESEARCHED 2026-09-06 — better than assumed, still not settled.** BOFiP is deliberately technology-neutral (*« Le législateur n'a pas défini de cahier des charges, ni de solution technique »*) and names **chaining explicitly** as acceptable for both conditions: inaltérabilité *« (empreinte numérique à clé privée, **chaînage**, etc.) »*, sécurisation *« tout procédé technique fiable […] une technique de **chaînage des enregistrements** ou de signature électronique »* — alternatives, not cumulative. **Two honest caveats:** the fingerprint example BOFiP gives is a **keyed** one, and **no source found addresses unkeyed SHA-256 specifically**, in either direction. Sources: `docs/conformite-isca-recherche.md`. **Mapped 2026-09-06 (`docs/conformite-isca-map.md` §1.4–1.5): the chain covers the event PAYLOAD — a `VENTE` carries totals, tender split and cashier, not the order lines or the receipt text — so a line item or a stored ticket edited directly in SQLite with totals unchanged breaks no hash; the archive checksum covers those rows only as they stood at archive time.** **Researched again 2026-09-06 (§ 9.4): official sources stay silent on an unkeyed chain; the LNE referential (private) accepts only keyed (HMAC-SHA-256) or signed chains with a key the assujetti cannot know, and asks that a restore to an earlier state be « détectée ou rendue impossible » — HibaPOS journals a restore made through the app and detects an older `custom.db` put back by hand not at all (map § 1.6).** |
| **V-02** | `REQUIRES EXTERNAL VERIFICATION` | Does the annual archive format satisfy the archiving requirement, and what integrity property must its checksum actually have? (C-04) **RESEARCHED 2026-09-06, and the question GREW.** The *archivage* condition requires a **« format ouvert »** at a periodicity of at most a year — HibaPOS satisfies both (annual JSON). But `loi n° 2026-534 du 25 juin 2026, art. 87` added a **restitution-format** requirement, in force 27 June 2026, whose implementing text was not found — see **L-52**. **Searched again 2026-09-06 (§ 9.2): nothing published** — no arrêté, décret, BOFiP paragraph or notice; the statute names no instrument, deadline or suspensive condition; BOFiP § 230 still asks only for a « format ouvert » with a French notice, which the archive has. |
| **V-03** | `REQUIRES EXTERNAL VERIFICATION` — **partially acted on 2026-09-04, still open** | What must a compliant receipt contain — per-rate VAT breakdown, TVA number, software identification, others? (M-06) **Batch 3.6 added the per-rate VAT breakdown and the TVA number** on the operator's own determination, the same footing as V-14. That is not an answer to this item: whether anything further is required — software identification in particular — is unresolved, and no compliance claim rests on the work (safety rule 13). |
| **V-08** | `REQUIRES EXTERNAL VERIFICATION` | What must a compliant Z report and period close contain, and how must refunds and corrections be presented? (M-07, C-10) **RESEARCHED 2026-09-06.** BOFiP requires that the software provide *« obligatoirement une clôture journalière et une clôture mensuelle et annuelle […] cumulatives et impératives »*, with a grand total and a perpetual total per period. HibaPOS has all three and the perpetual `GrandTotal` — **and, since Batch 3.8, a sealed `DailyClose` on a trading-day clock distinct from the caisse Z — L-54 is CLOSED.** It used to read « but its daily close is keyed to a shift, not to a calendar day », which was true until 2026-09-06. **Mapped 2026-09-06 (map §3.5, §1.1): the perpetual total is maintained but written into NO close** — Z, monthly and annual payloads carry the period's figures only, and `GrandTotal` is snapshotted only into the annual archive — so whether « cumul perpétuel » must be *recorded at each close* or merely *maintained* is a question this row now carries; and a fully refunded order has its `status` flag written onto the original row (`refund.ts:157`), amounts untouched. **Researched 2026-09-06 (§ 9.5): BOFiP § 170 answers the first half — « Pour chaque clôture … doivent être calculées et enregistrées … le total perpétuel » — so the perpetual total not being recorded at each close is now a finding, L-57, not a question.** The status flag stays a question. **CLOSED 2026-09-06 (Batch 3.8): L-57 is fixed — the Z, the day, the month and the exercice all record `GrandTotal` now, in the row and in the hashed payload.** What this row still asks is untouched by any of it: what a compliant close must *contain*, and how corrections must be presented. |
| **V-14** | **DETERMINED BY THE OPERATOR 2026-09-03** — professional sign-off optional, no longer blocking | **Which VAT rate applies to which product?** The operator researched this and gave the determination recorded in *VAT rate policy* below: **two rates are in use — 10 % standard, 5,5 % for drinks in a sealed can or bottle** — and the restaurant **sells no alcohol**, so 20 % is not currently used. Batch 3.1c implements exactly that. Claude did not derive the classification and does not certify it (safety rule 13); it is recorded as the operator's own determination. A confirmation from whoever files the TVA remains available but nothing waits on it. |
| **V-09** | `REQUIRES EXTERNAL VERIFICATION` | Retention: the archive notice states six years. What must actually be retained, in what form, and does the current backup arrangement satisfy it? Interacts with DD-04. **RESEARCHED 2026-09-06.** Six years confirmed (LPF art. L. 102 B), and the archive notice already states it (`fiscal.ts:648`). |
| **V-10** | `REQUIRES EXTERNAL VERIFICATION` | Is certification by a body, or self-attestation, the applicable route for this software and this operator? No certificate, test report or certifying-body reference exists in the repository. **RESEARCHED 2026-09-06 — the route question is answered for now, and it has a date on it.** Self-attestation by the éditeur is valid **today**: `loi n° 2026-103 du 19 fév. 2026, art. 125` restored it in force 21 Feb 2026, a year after `loi n° 2025-127, art. 43` had abolished it. Certification by an accredited body is **NOT** mandatory; the two are alternatives, and much online commentary still says otherwise because it was written during the 2025–26 gap. **A foreign éditeur may issue it** — BOI-TVA-DECLA-30-10-30 § 365 admits *« un éditeur établi à l'étranger »* with no EU condition, and BOFiP elsewhere anticipates foreign éditeurs being sanctioned, which confirms it expects them to issue. **The éditeur here is established in TUNISIA**, outside the EU and the EEA, so the argument rests entirely on « à l'étranger » being read literally — BOFiP never says « pays tiers » either way. ⚠ **And from 1 Jan 2027** the obligation moves into the CIBS (`ordonnance n° 2026-671`); both the 2027 text of art. 1770 duodecies and LPF art. L. 80 O refer only to *« le certificat »*. Whether the attestation survives was **not verified**. Sources: `docs/conformite-isca-recherche.md`. **Researched again 2026-09-06 (§ 9.1, § 9.3): the CIBS article was retrieved — L. 216-48 and L. 216-40 are the same article, and its text says « Un décret détermine les caractéristiques … », naming neither route; the proof regime from 1 Jan 2027 sits in a décret that is not published. The attestation route is therefore valid to 31 Dec 2026 and undecided after. On the Tunisian éditeur: § 365, § 370, § 400, § 410 permit a foreign éditeur with no establishment condition — the EU condition of § 320 binds the accreditation body in the certificate route only — and no source documents practice with a third-country éditeur.** |
| **V-11** | `REQUIRES EXTERNAL VERIFICATION` | Are the legal citations in `docs/attestation-conformite.md` current and correctly applied — art. 286-I-3° bis CGI, art. 1770 duodecies CGI, *Loi n° 2026-103 du 19 février 2026 art. 125*, BOI-TVA-DECLA-30-10-30, BOI-LETTRE-000242? The audit recorded these verbatim and did **not** evaluate them. **RESEARCHED AND PARTLY CORRECTED 2026-09-06.** The citations in `docs/attestation-conformite.md` and `IMPLEMENTATION_PLAN.md` were right as far as they went and are now extended: **art. 441-7** is the on-point offence for a false *attestation* (aggravated to 3 yrs / €45 000 for prejudice to the Trésor), 441-1 being the general *faux*; the **30-day** LPF L. 80 O window is distinct from 1770 duodecies' **60-day** one and is the one where producing the document means **no fine at all**; and the €7 500 falls on the **assujetti — the restaurant — not the éditeur**. Two 2026 texts nobody here knew about are now cited. **Still for a professional:** the 2027 CIBS question, and whether a third-country (Tunisian) éditeur is accepted in practice. **2026-09-06 (§ 9.7): art. 441-7 retrieved verbatim — the on-point offence; BOFiP and the model cite 441-1, and the template now carries both. BOFiP § 300's carve-out and § 310's « dernier intervenant » rule are quoted; no professional-body or insurer guidance exists to cite.** |
| **V-13** | `REQUIRES EXTERNAL VERIFICATION` | Must the JFP carry an `OUVERTURE_TIROIR` entry for **every** physical opening of the cash drawer, including the automatic kick on a cash tender? Batch 1.3 journals the traced *manual* open only, on the reasoning that the `VENTE` event already records the cash payment. If every opening must appear, the automatic kick needs its own event. (C-03, C-27) |
| **V-12** | `REQUIRES EXTERNAL VERIFICATION` | Do the *operator's* processes — archive custody, retention, attestation signing — meet the requirement independently of the software? |

**Rule:** `IMPLEMENTATION_PLAN.md:54` marks "Phase 1 — ISCA / NF525 compliance — ✅ COMPLETE". That marking is not supportable from the code and must not be treated as an answer to any question above.

---

# NEWLY DISCOVERED ISSUES

Record anything found *during* remediation that is outside the current batch's scope. Do not fix it in that batch (safety rule 10).

Open rows only. A row resolved by a batch moves, unchanged, to `REMEDIATION_RECORD.md` → *Resolved findings* when that batch completes (seven rows moved there on 2026-09-04: L-13, L-15, L-16, L-17, L-18, L-20, L-23; since then L-27, L-41, L-42, L-40, L-43, on 2026-09-05 **L-49** and **L-28**, and on 2026-09-06 **L-55** and **L-56**).

**⚠ THREE ROWS HERE SAY *NO BATCH OWNS THIS* — L-52, L-47, L-14 — and that is the plan's honest state**: Stages 0–7 are finished and these outlived them. *(The count read EIGHT until 2026-09-06 and was **already wrong before this batch**: seven rows carried the phrase at commit `6847691`. Counted, not estimated, this time.)* **The three French-law gaps (L-52, L-53, L-54) got their batch on 2026-09-06 — Batch 3.7, on the operator's instruction.** It fixed L-53 and L-54, **left L-52 open because the format it needs is not published**, and its map and research added **L-55, L-56, L-57 and L-58**. **Three of those four are now closed** — L-57 by Batch 3.8, L-55 and L-56 by **Batch 3.10**, which also closed L-58's label half. **L-58's row below is therefore ◐: only the stored per-line HT is still open**, and it is the one item here that needs a migration.

**⚠ THE LAST COLUMN HAS A SHAPE, and `plan-freshness.test.ts` reads it:** `<assignment> — <anything>`. The assignment is a batch number, **Operator action**, or **NO BATCH OWNS THIS**; everything after the first em dash is prose the test ignores, which is where the history of who completed without it belongs.

**⚠ Read the last column before assuming a row is handled.** A row naming a batch that has since `COMPLETED` reads as done, and is not. **This has now happened twice**: nine rows after Stage 6, four more after Stage 7 (L-51, L-36, L-22, L-47). Rows with no remaining owner say **NO BATCH OWNS THIS** — a statement about the plan, not about the finding; none has been dismissed. **`plan-freshness.test.ts` now fails the build when it happens again**, so this column no longer depends on somebody remembering to sweep it.

| ID | Date | Found during | Description | Severity | Assigned to batch |
|---|---|---|---|---|---|
| **L-60** | 2026-09-06 | Batch 8.1 | **Eighteen of the twenty orders on production carry no `fiscalEventId`, and the journal holds only two `VENTE` events.** Measured read-only, then traced rather than guessed: orders **1–18** were rung 2026-08-20 to 2026-08-29 01:38 and orders **19–20** on 2026-09-01, while the fiscal journal entered the checkout path in commit **`d7ceb18`** (2026-08-29), the day the repository was re-initialised at `be9113e`. So the eighteen predate the journal's existence. **Not a defect in today's code** — `checkout.ts:293` appends the `VENTE` inside the same transaction that creates the order and writes the back-link, and `sale-journal.test.ts` covers it. Consequence while it lasts: the Z reports (which aggregate `Order` rows) total 36 300 while `GrandTotal` (which counts only journalled sales) reads 5 480, and **both are correct about different questions** — Z#1 and Z#2 each equal their own shift's orders to the cent. Nothing can be reconciled across the two until the reset. | LOW (development data only; no code defect, and it never reaches real trading) | **8.0** — P-04 deletes all twenty orders before the first real sale, which is what resolves this. One more reason the reset is not optional |
| **L-52** | 2026-09-06 | French-law gap check | **A new legal requirement exists that nothing in this repository knew about: archived data must be restituted in a format set by the administration.** `LOI n° 2026-534 du 25 juin 2026, art. 87` added a second paragraph to CGI art. 286-I-3° bis, in force **27 June 2026**: *"Les données archivées […] sont restituées dans un format répondant aux normes établies par l'administration."* The research of 2026-09-06 **could not locate the arrêté or BOFiP commentary defining that format**, so the target is currently unknown. Where HibaPOS stands, measured the same day: the annual archive is `JSON` — an *"format ouvert"*, which is what the **archivage** condition itself requires and which HibaPOS satisfies — but its **schema is bespoke** (`format: "hibapos-fiscal-archive", version: 2`, carrying fiscal events, orders with items/payments/refunds/receipts, Z reports, monthly and annual closes and a grand-total snapshot), with a `sha256sum`-compatible manifest beside it. If the administration prescribes a schema — France already prescribes one for accounting entries, the FEC — an exporter or converter is needed, not a change to how the data is stored. **Nothing can be built until the implementing text is found**, which makes this the first question for a fiscal professional rather than an engineering task. **⚠ RE-CHECKED AT SOURCE 2026-09-07 (session 19) — nothing has changed, and the citation is now verified verbatim.** (a) Legifrance, CGI art. 286 « Version en vigueur depuis le 27/06/2026 »: the second alinéa is present and reads exactly as quoted above. (b) **BOI-TVA-DECLA-30-10-30 is STILL the 25/03/2026 version** — earlier than the law it would implement — and its § 230 still requires only « un format ouvert » plus a French notice. (c) No arrêté, décret or BOFiP actualité defining the format was found. **The reading that produces, for a professional to confirm rather than for this file to assert**: the only norm the administration has published about this archive is § 230's open format, which HibaPOS satisfies — so the honest position is « conforme à la seule norme publiée, en attendant celle que la loi annonce », not « non-conforme ». Recherche § 9.2 carries the sources. | MEDIUM (a live obligation since 27/06/2026 with an unknown target; no data is wrong, the export may be in the wrong shape) | ⚠ **NO BATCH OWNS THIS, and after three searches that is the finding rather than a gap in the searching** — 3.7 searched 2026-09-06 and session 19 re-checked 2026-09-07, both **finding nothing to build to** (research § 9.2: no arrêté, décret, BOFiP paragraph or impots.gouv.fr notice; BOFiP unchanged since 25/03/2026; the Sénat's intent was « un format informatique standard »). The obligation has no suspensive condition, so it is live with no content. Re-check Legifrance and BOFiP before every attestation; re-open the moment a text appears |
| **L-51** | 2026-09-05 | Batch 7.1 | **`backup.ts` reads the entire uploads archive into memory and encrypts it there, and it is 47 MB, not the "few MiB" its own comment claimed.** Measured on the live install while correcting that comment for DOC-12's neighbours: `db/backups/` holds three `.uploads.enc` files at 41.3 MB, 41.3 MB and **47.4 MB**, beside `.dbenc` files of 455 KB, 471 KB and 586 KB — so the database part really is small and the media part is two orders of magnitude larger. `public/uploads/` is **49 MB across 139 files** today and grows every time the operator adds a product photo. The buffered approach is deliberate and the reason is sound — a streaming implementation would have to splice the GCM auth tag — but the comment justified it with a size that was never true of the file it buffers, so nobody has ever weighed the real one. **A backup is taken automatically at every Z close**, i.e. once a day in normal trading, on a Windows all-in-one whose RAM nobody has measured; the transient cost is the plaintext buffer plus the ciphertext, so on the order of 100 MB, and it grows with the media library rather than with the trading data. **No failure has been observed** — three backups exist and all three completed — and this is recorded rather than fixed because changing how a fiscal backup is written is not a documentation batch's business (safety rule 10). Note the interaction with **L-46**: none of those files is reachable through the application anyway. **⚠ AMENDED 2026-09-06 (Batch 8.2) — MEASURED, and about five times the estimate.** On the real server, a create-plus-restore cycle over the 47,6 MB media archive took the process to a **peak working set of 510,5 MB**, from a 135 MB baseline. Standalone, decrypting the archive alone costs **136 MB and 0,8 s**. The row guessed “on the order of 100 MB”. A backup runs at **every Z close**, so this is a nightly half-gigabyte spike on a machine whose RAM still nobody has measured, and it grows with the photo library rather than with the trading. No failure observed at 47,6 MB. | MEDIUM (**measured**: 510 MB peak at every Z close, growing with the photo library; no failure observed yet) | **8.2** — it rehearses a restore and has to read one of these files back, which is where a 47 MB in-memory decrypt is either fine or is not. *(Opened for 7.4; **7.4 completed without it**, deliberately — it is behaviour in a fiscal backup path, not a carried-over correction.)* |
| **L-47** | 2026-09-05 | Batch 5.4 | **The app renders its login screen even with a valid session, in the in-app browser pane — so no browser walkthrough can reach any authenticated view.** Observed while running Batch 5.4's two *Manual* criteria on a scratch copy: after `POST /api/auth/login` returned 200 from inside the page, `GET /api/auth/me` returned the full user, and `/api/settings`, `/api/shifts/summary` and `/api/catalog/categories` all answered 200 — yet `page.tsx`'s `if (!user) return <LoginScreen />` kept rendering the picker across several reloads. Synthetic clicks on the profile card did not advance it either, which is the shape Batch 5.1 note 7 and Batch 3.1b note 3 already describe for this pane. **Not a regression, and that was measured rather than assumed**: the pre-5.4 stores were stashed, the app rebuilt and the server restarted on port 3064, and the pre-batch build behaved identically. So it predates the batch and is a property of the environment or of the client's session handling, not of the cart work. Cause not established — deliberately not guessed at. **Consequence for the plan**: any batch whose validation depends on driving an authenticated screen in this pane needs a way through this first, and 5.7 (POS defects, L-42's modal-shortcut work) is the next one that will. Two candidate directions, neither investigated: the cookie may not be applied to the pane's context on navigation even though `fetch` from inside the page carries it, or the client's `fetchUser` may be resolving after a render the pane does not repaint. Batch 5.4 worked around it by proving the same properties in `cart-persist-wiring.test.ts`, which loads the real store module against a stubbed `localStorage` — a better artifact, but not a substitute for driving the real UI. **⚠ AMENDED 2026-09-07 (Batch 7.7) — it did not reproduce, for the SECOND time, and this attempt got further than any before it.** The application was started on a scratch copy and driven in the in-app browser pane: a profile was selected, **a PIN was typed on the keypad**, and the session reached the **dashboard, the POS, the product-options dialog, the Catégories list and the category editor dialog**. Synthetic clicks landed. So the row's operative sentence — *"no browser walkthrough can reach any authenticated view"* — **is contradicted by a walkthrough that did**. Not closed: a defect nobody can reproduce is not proven absent, and 6.3's attempt failed differently. But **any batch that defers work on the grounds of this row should try first**, because two sessions running have found the pane usable. | MEDIUM → **LOW in practice** (it has now failed to reproduce twice, and a full authenticated walkthrough succeeded) | ⚠ **NO BATCH OWNS THIS** — and that is correct. 6.3 attempted it, could NOT reproduce it, and **falsified its own hypothesis** (`127.0.0.1` is a trustworthy origin, so the `Secure` flag was not the cause). Cause not established. **Re-open on the next occurrence** rather than assigning it to a batch that would have nothing to reproduce. |
| **L-46** | 2026-09-05 | DD-04 brief | **Three `Backup` rows were created and are gone, with no journalled deletion — so the application cannot list or restore any of the 126 MB of backups sitting on disk.** Measured read-only on production 2026-09-05: `db/backups/` holds **nine files** — three legacy `.json` (July) and three `.dbenc` + three `.uploads.enc` pairs whose mtimes are **2026-08-18 23:38, 2026-08-21 01:22 and 2026-08-28 02:21** — while `SELECT COUNT(*) FROM Backup` returns **0**. The audit log settles that they were not merely never created: three `BACKUP_CREATED` rows exist, at exactly those three timestamps, each naming a `Backup` entityId (`cmsz8vdo7001dn3mg3mblr8sk`, `cmt27gpe10005n3xw5ysbc07m`, `cmtc9nb470027n36slusvqpx5`). There is **no `BACKUP_DELETED` action anywhere in the 468-row audit log**, and `deleteBackup` journals one before removing files (C-22), so the rows did not leave through the application either. **Cause not established** — deliberately not guessed at. Consequence: `listBackups()` and `restoreBackup()` both key on the `Backup` table, so the Réglages backup list is empty, no file on disk is restorable through the UI, and **no backup has ever been restored end-to-end on this installation** — which is what Batches 2.1 and 2.2 built and what Batch 8.2 is meant to rehearse. Two of the three backups were taken automatically at a Z close (their timestamps match `Z_REPORT_GENERATED` to the millisecond), so the mechanism itself works. This is also **why DD-04 could be answered "rotate and accept the loss"**: the key is not what makes those files unreachable. **⚠ AMENDED 2026-09-06 (Batch 8.2). The cause is established, and the finding is worse than it reads.** *(a)* **Cause**: the baseline migration `20260829112122_init_integer_cents` is **30 `CREATE TABLE` statements and zero `INSERT INTO`** — a from-scratch schema, not an alter-and-copy. On 2026-08-29 the database was rebuilt empty and the data re-imported selectively: catalogue, orders and 468 audit rows came back, `Backup` rows did not. That one event also explains **L-60**, and explains why three `BACKUP_CREATED` audit rows still name `Backup` ids that no longer exist. Nothing was deleted through the application, which is why no `BACKUP_DELETED` exists. *(b)* **Restoring them would fail anyway, for a second and independent reason**: the newest decrypts to a valid SQLite database with **26 tables and no `FiscalEvent`, `GrandTotal`, `MonthlyClose`, `AnnualClose`, `FiscalArchive`, `DailyClose` or `CashMovement`**, so `assertCompatibleSchema` refuses it — correctly. **The live install has no restorable backup at all and cannot have one until a fresh backup is taken against the current schema** (six seconds, through the app). *(c)* The three files **do decrypt** with `scripts/decrypt-backup.ts` — the key works and the ciphertext is intact — so they remain readable evidence even though they are not restorable. | MEDIUM–HIGH (**no restorable backup exists on the live install, for two independent reasons**; the audit trail contradicts the data) | **8.2** — *The row's other instruction — "re-check before 7.3 rotates the key" — was carried out on 2026-09-05: read-only on production, **0 `Backup` rows against 9 files on disk**, so nothing restorable is lost by the rotation. That is why DD-04 could answer as it did.* |
| **L-39** | 2026-09-04 | Batch 4.6 | **Thirteen catalogue names carry a leading space, which the POS picker renders as an indented label.** Measured read-only on production: **10 `CategoryOptionChoice` rows** (`" Mayonnaise"`, `" Barbecue"`, `" Algérienne"`, `" Harissa"`, `" Biggy"`, `" Potatoes"`, and duplicates of the first three in a second category's group) and **3 `CategoryAddOn` rows** (`" Pepperoni"`, `" Pomme de terre"`, `" Oeuf"`). Found while confirming that images shared across two categories' groups are legitimate rather than duplicates — they are, and no group contains the same choice twice, so this is purely cosmetic. It is **real catalogue data, not a code defect**: nothing in the app trims these on write, and `fix-duplicate-product-options.ts` matches on `name.trim().toLowerCase()` so it already tolerates them. Two ways to close it, and they are different decisions: the operator edits the thirteen names in Réglages, or the catalogue write paths start trimming (which changes what a save stores and would need the same treatment on the product side). **Claude must not edit real menu data** (warning 4), so the first is an operator action and the second is a batch. | LOW (cosmetic; every affected label is visible in the POS picker) | **Operator action** — a live-catalogue edit, which is theirs to make (warning 4). 5.7a–5.7d completed without it |
| L-14 | 2026-09-03 | Batch 1.3 loopback validation | **Receipts archived before L-13 was fixed are 80 columns wide and cannot fit the paper.** Every existing `Receipt.content` row (checked #18, #19, #20) has a widest line of 80 characters, because `renderReceipt` was fed the millimetre value. 80 mm paper fits 48 columns at Font A and 64 at Font B, so **reprinting any pre-fix ticket will wrap**. Re-rendering them is **not** an option — an archived receipt is an immutable fiscal artifact and the reprint path must print it verbatim. Options are to accept wrapped legacy reprints, or to print pre-fix receipts in a condensed font. Affects reprints only; new receipts render at 48 once `receiptWidth` is saved. **Measured 2026-09-07 (Batch 1.3b): all 20 stored `Receipt.content` rows are 80 columns wide** — and all 20 are development trading data that **Batch 8.0's reset deletes**, so on this install the affected population empties at go-live rather than being fixed. | LOW (cosmetic, legacy rows only; population deleted by 8.0) | ⚠ **NO BATCH OWNS THIS** — *(corrected 2026-09-07: the cell read "7.1 or accept" and 7.1 completed 2026-09-05 without it. The row was invisible to `plan-freshness.test.ts` because it is not bolded — the parser only read bolded rows until that hole was closed the same day.)* Re-rendering them is refused by design; the live choice is 8.0's reset, not a batch |

---

# DEFERRED / LOW PRIORITY

Retained with their audit IDs. Revisit after Stage 8.

| ID | Status | Item | Location |
|---|---|---|---|
| **L-05** | `DEFERRED` | `output: "standalone"` is built but never used; the bundle is missing `.next/static` and most of `public/`, so it would not run. Drop it or fix it. | `next.config.ts:4`; `.zscripts/start.ps1:25` *Correction 2026-09-04: Batch 2.4 removed the stale tree and dropped `output: "standalone"`; what remains deferred is whether Batch 1.4 reinstates it deliberately (record → Batch 2.4).* |
| **L-11** | `DEFERRED` | Two payment tolerances disagree (`paid < total - 1` vs `paid < total - 0.01`, both on integer cents); dialog resets run on uncleaned 200/350 ms timers. | `payment-dialog.tsx:86,128,377`; `product-options-dialog-v2.tsx:60` |
| — | `DEFERRED` | 27 orphaned shadcn `ui/*` components and their ~20 transitive dependencies. Template residue. | `src/components/ui/` |
| — | `DEFERRED` | `src/app/api/route.ts` returns `{"message":"Hello, world!"}`, unauthenticated. Remove or convert to a health check (in scope for Batch 3.4). | `src/app/api/route.ts` *Correction 2026-09-04: done in Batch 3.4 — it is now a liveness probe.* |
| — | `DEFERRED` | `src/app/api/catalog/categories/[id]/options/` is an empty route segment predating the repo reset. Compare against the historical project before removing. | — |

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
| **DOC-04** ✅ **CLOSED 2026-09-07 — pinned rather than corrected a third time.** The README undercounted its tests; corrected twice and drifted again both times (105 vs 136, then 879 vs 963). `src/lib/readme-counts.test.ts` now recomputes both figures from the test files and fails if the README disagrees. Two declarations expand into several runs each — an `it.each` of seven and a loop over seven scripts — so the count carries a small registry, and adding a third expansion fails the test with a message saying where to record it. **Both figures were then measured rather than reasoned**: `bun run test` reports **967**, and `bun run test:e2e` was run for the first time in this project and reports **13**, which put back a figure an earlier de-stale pass had "corrected" to 12. |
| **Audit section I generally** | The git history **cannot** answer whether files were accidentally deleted: the repo was re-initialised at `be9113e` and the claimed pre-v0 archive path does not exist. All "possibly missing" items are inferences from orphaned code, not from deletion evidence. Compare against the historical 3 GB project before acting on any of them. |

---

*Plan created 2026-09-03 from the baseline audit of commit `5ef7dc4`. No application code was modified in its creation.*
*Split into working plan and evidence record on 2026-09-04 (record: `REMEDIATION_RECORD.md`, extracted at commit `5f0c2b1`). Every line of the pre-split file survives verbatim in one of the two files or in the record's retired-lines section.*
