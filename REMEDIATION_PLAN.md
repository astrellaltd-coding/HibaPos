# HibaPOS France — Remediation Plan

Master source of truth for the controlled remediation of HibaPOS France.
Derived from the read-only baseline audit of 2026-09-03 (repo at commit `5ef7dc4`).

Detailed audit record: https://claude.ai/code/artifact/329316b0-3a6b-48b0-9d27-d815004f4cbf

---

## CURRENT PROJECT STATUS

**Overall:** NOT READY FOR PRODUCTION

**Current Stage:** **Stage 6 is COMPLETED** — 6.1, 6.2 and 6.3, all 2026-09-05. **The next unstarted stage is 7 (CLEANUP AND DOCUMENTATION TRUTH).** **Stage 5 is COMPLETED** (5.1 through 5.6 and 5.7a–5.7d, all 2026-09-05, alongside 3.6c). **Stage 4 is COMPLETED** (4.1 through 4.4, 4.4b, 4.4c, 4.5, 4.6 and 4.7, all 2026-09-04). **Stage 3 is COMPLETED** (twelve batches; **3.6c** reopened it 2026-09-05 for L-27 and closed it the same day). C-22's chain-design half stays carried forward as `REQUIRES EXTERNAL VERIFICATION`, and V-03 is open. Stage 1 is **partly done**: 1.1 and 1.2 COMPLETED, 1.3 `IMPLEMENTED — TESTING REQUIRED` on hardware, 1.4 deferred. Stage 2 is COMPLETED.

**Current Batch:** none. **Stages 5 and 6 are finished, and Stage 7 is under way** — 7.1 and 7.2 are `COMPLETED`; 7.4 and 7.3 remain, in that order. **5.7 was SPLIT on 2026-09-05 into 5.7a–5.7d** — it held twelve items across four risk classes, where every completed batch here has been one finding or a tight cluster. The router section carries the evidence, where each item and each criterion went, and three things measurement found that the rows did not say. Audit IDs are unchanged; the index still maps them to 5.7.

**Last Completed Batch:** Batch 7.2 — dead code and dependency removal: four files deleted, one dependency, seven dead exports, L-08's three duplications, **−428 lines**. Three things worth carrying: **two of L-07's ten entries were wrong** — `fromCents` is live and deleting `apiFetch` would have broken every screen, so *the list a batch is handed is evidence, not instruction*; **the de-duplication fired Batch 5.6's tripwire and it was amended to be stronger**, with three one-property reverts all caught; and **deleting a route left sixteen comments explaining a live decision by contrast with it**, so each says DELETED rather than being rewritten away. **L-33 is NOT closed** — its own text calls it a review, not a mechanical fix. *(Before it: 7.1, then the whole of Stage 6. Accounts: the record.)*

**Next Batch:** **Batch 7.4a** — the three reports that disagree (L-48, L-44/DD-21, L-50/DD-20), then **7.4b** (L-33/DD-22, L-30) and **7.4c** (five small corrections). Then **7.2** (dead code and dependency removal), **7.4** (the nine findings whose batch completed without them, opened 2026-09-05) and **7.3** (secret rotation, DD-04), which runs last by its own prerequisite. **What remains open beyond Stage 7**: Batch 1.3's `[HW]` sign-off and 1.4, both blocked on hardware; C-22's chain-design half and V-01…V-03, which need a qualified external party; and Batch 8.0's pre-go-live fiscal reset, which must run **after** 1.3 and 1.4.

**Blocked:** Batch 1.3 `[HW]` sign-off and Batch 1.4 — both need the app running on the restaurant's POS machine, which is in a different country from the developer and has no copy of the app installed (decision of 2026-09-03).

**Awaiting decision:** **nothing — every design decision in this plan is answered**, DD-20, DD-21 and DD-22 last, on 2026-09-05 (they are Batch 7.4's, and each was put to the operator before a line was written). No batch is blocked on a decision and nothing waits on the operator; what remains blocked is blocked on hardware. The answers and the measurements behind them: `REMEDIATION_RECORD.md` → *Answered design decisions*.

**Last Updated:** 2026-09-05 (session 15 — **Stages 5 and 6 both completed**: 5.6, the 5.7 split, 5.7a–5.7d, 6.1, 6.2, 6.3). Three things to carry forward. (1) **When a revert or a test catches nothing, ask whether it took effect before concluding the test is weak** — a `schema.prisma` revert without `prisma generate` is a no-op (5.7b), and a revert run against four files says nothing about the other sixty (6.1). (2) **Drive it.** Reading did not show the operator an English zod message (5.7c), a receipt sealed under the wrong tender (5.7b), or seven e2e specs that had never met a database they could reach (6.3). (3) **Five tripwires from earlier batches fired across these stages and every one was amended or inverted, never adjusted to whatever the code returned** — C-25's column count, C-21's view table, C-23's cart version, C-23's session test (inverted, because it encoded the defect M-21 names), and 6.3's own per-run path, which broke three fixtures that hardcoded what another module decides. **Front matter: retire before you add, and measure at the END of a session.**

### OPEN THREADS — read this before starting a batch

*Updated through Batch 6.3, which **completes Stage 6**. **Only G has moved since Batch 5.7a's migration** — the test count, and now its STABILITY: 6.3 fixed L-43, so the suite runs clean rather than failing ~2 runs in 5. A, B, C, D and E are unchanged. This thread records the CURRENT state, not its history: each batch's account of what it moved is in that batch's record section.*

Work in this plan does not finish batch-by-batch. Several completed batches
shipped a mechanism whose **benefit is not yet delivered**, and several items
are waiting on somebody or something outside the code. A session that starts
by opening the next batch will miss all of it.

#### A. Shipped but NOT yet in effect on the production install

These are done in code, validated, and committed — and change nothing on the
real till until an action below is taken. Do not report them as delivered.

| What | Why it is inert | Unblocked by |
|---|---|---|
| **WAL journal mode** (2.3) | The database is on a OneDrive-synced path and the guard refuses WAL there; byte 18 is still `1`. | Moving data to `C:\HibaPOS\data` (DD-02), then any restart |
| **`BACKUP_LOCATION`** (2.2) | Honoured but **unset** — backups land beside the database, same disk. | Choosing a second volume at deployment |
| **`HIBAPOS_DATA_DIR`** (2.2) | Defaults to the old layout on purpose, so an update cannot silently repoint a running install at an empty folder. | The deployment step in Batch 1.4 |
| **Thermal printing + drawer** (1.3) | `printerEnabled` is `false`, no printer IP set. A reprint journals `REIMPRESSION`, then reports *"Impression désactivée…"* | Commissioning on the real Sunso WTP-801 |
| **FACTICE simulation mode** (3.1b) | The switch exists in Réglages but is **off**, so pre-go-live testing is journalled as genuine trading. | The operator turning it on |
| **Audit-log retention** (2.4) | Deliberately `0` = keep forever; the table is unbounded. | An operator decision, if an obligation appears |

#### B. Waiting on the operator

**The operator changed both live PINs on 2026-09-04, closing C-18's credential half.** Evidence is in Batch 4.3's record section and the hash lineage in *G*; the fuller block was retired to the record in Batch 4.5, because its lesson is now enforced in code (`PUBLISHED_DEFAULT_PINS` in `src/lib/auth.ts`, refused by `scripts/seed-users.ts`). **The values were never seen by Claude and are recorded nowhere — not here, not in the record, not in a commit. Do not ask for them and do not write them down.**

| Action | Why it matters | Related |
|---|---|---|
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
- **Batch 1.4 carries the deployment step** that activates WAL,
  `BACKUP_LOCATION` and `HIBAPOS_DATA_DIR` — the inert items in A.
- ~~**Batch 7.1** should re-check **DOC-01**…~~ **Done 2026-09-05 (Batch
  7.1), and this bullet is kept only for the one instruction that outlived
  it**: `IMPLEMENTATION_PLAN.md` is a historical record, so a claim that was
  false when written but is true today is recorded as **both** — never
  silently "fixed". That is Appendix D's rule, and it applies to anything else
  found in that file.
- **Batch 7.3 / DD-04** (secret rotation) is informed by L-05: the live
  `.env` sits in a OneDrive-synced folder, so the secrets are very likely
  already in cloud storage.
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
- **Two payloads have GROWN twice each, and both are safe only while nothing is
  sealed.** `CLOTURE_Z` gained `refundsTotal` / `refundsCount` (3.6, M-07) and
  then `cashInTotal` / `cashOutTotal` / `cashMovementsCount` (5.5, M-05). The
  sealed *close* `dataJson` — a different thing — gained `refundsCount` (3.6b,
  L-26) and the same three cash fields (5.5). Free of the vintage problem
  **only because zero closes exist**, re-verified 2026-09-05; the first sealed
  close fixes that shape for good. `close-timing.test.ts` pins the key list and
  caught 5.5's change rather than letting it through — edit it deliberately,
  never to make a run go green. **`CLOTURE_M` and `CLOTURE_A` EVENT payloads
  have never been touched.**
- **A new event TYPE is not a new vintage.** Batch 5.5 added `MOUVEMENT_CAISSE`
  — a shape nobody had before, not a changed shape of something old — so a
  reader tolerating the two vintages is still complete. A reader that
  **enumerates** types is not. Two such enumerations exist, `src/lib/fiscal.ts`
  and `src/types/api.ts`, and 5.5 first updated only the server's.
- **L-14** is unresolved by choice: receipts archived before Batch 2.2 are 80
  columns wide and will wrap when reprinted on 48-column paper. They must
  **not** be re-rendered — an archived receipt is immutable.

#### E. Open questions recorded for others to answer

**V-13** (must the JFP journal the *automatic* drawer kick, or only the traced manual open?) and **V-02** (does the annual archive format satisfy the archiving obligation?) are fiscal questions, flagged not decided. Both are stated in full in *External / Legal / Fiscal Verification* below — this thread exists only so a session planning work knows they are open.

#### G. Current baselines — check these before trusting anything

*(F was retired on 2026-09-05 and its instruction moved into Batch 7.1, which is what has to act on it. The letters are not renumbered: other sections cite them by letter.)*

| Thing | Current value, each with the date it was last measured |
|---|---|
| Tests | **763 pass, 0 fail, and STABLE since Batch 6.3** — three consecutive whole-suite runs with no flake, where before it the suite failed about 2 runs in 5. **L-43 is FIXED, so a `shift-race.test.ts` failure is now a REAL failure**: investigate it. Do not re-run and dismiss it — that instruction stood here until 2026-09-05 and is withdrawn. Counts: 765 before 6.2 (11 vacuous cases out, 9 real ones in), 737 before 6.1, 715 before 5.7d. **e2e: 13 passed, and `bun run test:e2e` is SAFE** (6.3, T-10). Whole-suite runtime 60–80 s; a run of 296–422 s with the same 0 failures is **L-24**, not a defect — add `--timeout 30000`. Two sessions may now run the suite at once (warning 3b) |
| Production DB sha256 | **`96b48ad0789151df5ec8f346ad6b1301f6f510a02820fb00d66d7d380706cf06`** (mtime 2026-09-05 17:48, **704 512** bytes) — moved by the operator applying **Batch 5.7a's** migration, whose rehearsal predicted the result with **zero differing fingerprint lines**. Before it: `7287640e…` (mtime 15:41, same size) — moved by the operator applying Batch 5.5's migration on 2026-09-05 14:41:21, the first change since the 2026-09-04 PIN change (`7839db18…`, 696 320 bytes). **The rehearsal predicted this state exactly**: a fiscal fingerprint of production taken afterwards is byte-for-byte identical to the one taken from the rehearsal copy — zero differing lines (record → Batch 5.5, appended note). Both sealed Z reports survived the `ZReport` table rebuild unchanged, with the three new columns at 0. Earlier lineage (`7cc3367b…` → `a66bc96c…` → `e40735ca…` → `7839db18…`) is in the record |
| Fiscal chain | `/api/fiscal/verify` → all three chains `ok`, `lastSequence: 2`. **Zero monthly and annual closes have ever been sealed** — which is why M-01's guard, DD-18's timing rules and the payload changes of L-26 **and Batch 5.5** could all be imposed with nothing to accommodate. Re-verified read-only 2026-09-04 |
| Fiscal counters | `20/3/2/2` (receipt / shift / Z / event). Re-verified read-only 2026-09-05 **after the migration** — a schema change moves no counter, and every batch write this session went to a scratch copy |
| Migrations | **8 applied on production**, latest `20260905162220_remove_product_addons_and_postal_code` (Batch 5.7a), applied by the operator 2026-09-05 17:48:00. **None pending.** Batches 4.1 through 4.4b added none — 4.4b's enum removal was measured with `prisma migrate diff` and emits an empty migration |
| Catalogue | 78 products — 17 drinks at **5,5 %**, 61 at 10 % |
| Accounts | **two, and that is now the product's whole role model**: `manager` (MANAGER) and `admin` (SUPER_ADMIN, the developer's). Both PINs changed 2026-09-04. `CASHIER` was **removed in Batch 4.4b** — zero rows carried it, confirmed read-only first. `LEAST_PRIVILEGED_ROLE` is therefore `MANAGER`, one rung weaker than before | **Since Batch 4.4c both accounts must re-enter their own PIN** for a discount above 20 % and for every refund; five wrong PINs lock both operations for 15 minutes, on the same counter as the (now callerless) manager approval
| Out-of-band snapshots | **Four**, all in `db-snapshots/` **outside the repo tree**, taken before 3.1c, 3.5, 3.6b and 5.5. Filenames and hashes: record → those four batches |

### Hardware-dependent validation (policy set 2026-09-03)

The developer is in a different country from the restaurant, and the restaurant's POS machine has **no copy of the app** — deployment is deliberately on hold until the software is fit to ship. Remote access to that machine is available in principle.

**Reaffirmed by the operator 2026-09-04** — the order is settled: **the software is finished before it is deployed**, not in parallel.

**One consequence for triage, and it expires the day deployment is scheduled.** Nothing here has a live audience: no operator reads its screens, no sale is real, every defect is found by us. That is what makes it defensible to carry a user-visible defect across a batch boundary rather than guess. **The moment an install date exists, re-triage every open finding whose severity was discounted for want of an audience.**

**Decision:** proceed with software-only work; defer every item that requires the app to be running on the POS all-in-one device — Batch 1.3's `[HW]` criteria (real print, real drawer kick, real paper width; validated instead against a mock ESC/POS printer on loopback), all of Batch 1.4 (cold reboot, supervisor restart, kiosk launch, update rehearsal), and Batch 8.2 (restore rehearsal, full-day trading). None may be marked `COMPLETED` on automated evidence alone.

These are **deferred, not waived.** Stage 1 cannot be declared complete, and no claim of production readiness may rest on the loopback evidence.

### Immediate warnings for any session picking this up

1. The repo **is** pushed: `origin/main` is `astrellaltd-coding/HibaPos`, and every session should leave its own commits pushed — **Claude can push when the user asks in the session** (warning 9). Do not push unprompted. Do not run `git clean`, and do not delete the working tree without checking `git rev-list --left-right --count origin/main...HEAD` first.
2. **`bun run test:e2e` is SAFE since Batch 6.3, and this warning is lifted.** It used to start `bun run dev` against the real `.env`, writing orders, refunds and sealed Z reports into the **production** database and its append-only chain. It now prepares its own disposable database under the system temp directory, **refuses to start if that path is not disposable**, runs the production build on port **3100**, and its first spec proves the server opened that database before any other spec writes. Production was byte-identical across two full runs. **`bunx vitest` is still forbidden — see warning 3.**
3b. **Two sessions can now run `bun test src` at once — Batch 6.3 fixed this.** The test database path is per-run (`os.tmpdir()/hibapos-test-db/run-<pid>-<time>`), so one run cannot destroy another's, and a guard aborts any run whose `DATABASE_URL` is not under temp. **What is still true**: two sessions would both edit this file and `REMEDIATION_RECORD.md`, and an append-only audit trail is the worst place to resolve a merge conflict; and a `next start` in one session holds `query_engine-windows.dll.node`, making `bunx prisma generate` fail `EPERM` in the other (warning 9). **Safe in a second session:** read-only measurement, decision briefs, reviewing a finished diff.

3. **`bunx vitest` now REFUSES to run, and that is enforced rather than asked for.** `vitest.config.ts` throws at import (Batch 6.3, L-06), because vitest does not read `bunfig.toml` and so never loads `test-setup.ts` — the only thing pointing `DATABASE_URL` at a throwaway database, and where the guard lives. Four test files begin by wiping 17 tables. Only `bun test src` is the runner.
4. **The CATALOGUE in the production database is real and irreplaceable; the TRADING data is not.** Confirmed by the operator on 2026-09-03: categories, products, options and images are real work (commit `0c5ede6`); every order, payment, receipt, shift, Z report and fiscal event was created by the developer for testing, and P-04 deletes all of it before the first genuine sale. Treat catalogue changes as destructive and irreversible. Trading-data mistakes cost test data — which lowers the risk of exercising fiscal flows, but does **not** license careless writes to the live database: work on a scratch copy, as every batch in Stage 3 did.
5. **`scripts/` is safe by default since Batch 4.5, and still read the header first.** Every script there is now a dry run unless given `--apply`, and `bun run typecheck` / `bun run lint` cover the folder. Two were deleted rather than guarded: `port-real-data.ts` (**L-37** — it wiped `db/custom.db` by a hardcoded literal, ignoring both `DATABASE_URL` and `HIBAPOS_DATA_DIR`, so the scratch-copy method did **not** protect against it) and `seed-category-options.ts` (**C-17**). `seed-users.ts` is now a PIN reset that deletes nothing, and the two counter scripts refuse to lower a fiscal counter (**L-38**). `scripts/README.md` names every deletion every remaining script performs. **The rule that survives all of it: nothing in `scripts/` may open a database path not derived from `DATABASE_URL` or `HIBAPOS_DATA_DIR`** — that is what makes the scratch-copy method complete, and `git grep "new Database("` is how to check it.

7. **Override `HIBAPOS_DATA_DIR` as well as `DATABASE_URL`** on any scratch copy — the full rule, and why (a Batch 3.4 archive landed in the real `db/fiscal-archives/`), is the first *Methods* bullet.


9. **Claude cannot do two things in this project** — the permission classifier refuses them, and each refusal is correct: `prisma migrate deploy` against production, and writes to real menu data. Prepare, rehearse and verify; then hand the operator the exact command.

   **Killing processes was listed here as a third and needs one distinction (Batch 4.4b, 2026-09-04).** Claude does not kill **the operator's** processes. A server **Claude started in the same session** is a different matter: 4.4b's `bunx next start -p 3026` (PID 24188) survived `TaskStop` — which killed only the `bunx` parent — and was terminated with `taskkill //PID <pid> //T //F`, after which `bunx prisma generate` succeeded. **Do this every time.** A leftover `next start` holds `node_modules/.prisma/client/query_engine-windows.dll.node` and makes `bunx prisma generate` fail `EPERM` in another session — that phantom cost sessions 3 through 7 hours, and the environment item recording it was retired to the record in Batch 4.7 once the habit above replaced it. **`bun run dev` stays untried here** (it loads the real `.env` and would open the production database); use `bunx next start` on a spare port — 3021–3026, 3033/3034, 3040–3043, 3050–3052, 3060/3061 and **3062–3065** (this session) are spoken for.

   **`git push` is another case and behaves differently.** Earlier sessions recorded it as prohibited; that was wrong. It is an *explicit-permission* action — it goes through when the user asks for it in the session, which they did on 2026-09-04 (`3f31779..8a311dc`, and again for `7449683..1856cd7`). Do not push unprompted, and do not tell the user it is impossible.

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

### Validation commands available in this project

| Command | What it does | Safe? |
|---|---|---|
| `bun test src` | Unit + integration tests, Bun runner, redirected to a temp DB. *G* carries the current count. On a slow machine add `--timeout 30000` — see **L-24** | ✅ Safe |
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

Stated once here so no session has to rediscover them. The record sections named are where each was first used and proved; read them before departing from a method.

- **Scratch copy, proved before any write.** Copy `db/custom.db` to the session scratchpad, write a marker into the **copy only**, start the app with **both** `DATABASE_URL` and `HIBAPOS_DATA_DIR` pointed at the copy, and prove which database the server has open by reading the marker back from the pre-auth `GET /api/auth/profiles` **before** the first write. Afterwards confirm the production file's sha256 and mtime are unchanged and that no `-wal`/`-shm` files appeared beside it, and that `db/fiscal-archives/` and `db/backups/` are untouched. **A scratch copy runs in WAL mode even though production does not** — the startup guard enables WAL off a cloud-synced path — so **restoring one means stopping the server first and deleting `-wal` and `-shm` with the `.db`**; overwriting the `.db` alone lets the WAL replay over the fresh bytes. Two harness gotchas: Git Bash rewrites a leading-slash argument into a Windows path (`MSYS_NO_PATHCONV=1`), and round-tripping JSON through a shell pipeline corrupts UTF-8 — build request bodies in a file and send with `--data-binary @file`. Record → Batch 1.1 (Tests), Batch 3.1b note 2, Batch 3.4 note 5 (why `HIBAPOS_DATA_DIR` too), Batch 4.6 notes 6 and 7.
- **Migration rehearsal with a fingerprint diff.** Never apply a migration to production first. Take an out-of-band snapshot in **`../db-snapshots/`, a SIBLING of the repo** — creating it *inside* puts a production database copy in the working tree (Batch 5.7a note 8) — apply the migration to a copy, and diff a fingerprint of every fiscal table before and after — row counts, `FiscalCounter`, `GrandTotal`, every event hash, both sealed Z rows, order lines, `integrity_check`, foreign-key errors, column order. Only the intended columns and the `_prisma_migrations` row may differ. Then hand the operator the exact `bunx prisma migrate deploy` command; Claude cannot run it against production. Record → Batch 3.1c note 3, Batch 3.5 note 1, Batch 3.6 note 3.
- **Prove the test fails on the old code.** For any fiscal change, temporarily revert the fix, re-run the suite, confirm the new tests fail, and restore the files from a copy taken before the revert. This is Stage 3's rule and it is satisfied by demonstration, not assertion. Record → Batch 3.1 (Tests), Batch 3.5 (Tests), Batch 3.6 (Tests). **The rules, each learned the hard way: revert ONE property at a time (4.4c); revert in BOTH directions (4.5); never apply two together, because they mask each other (4.4c); and expect to need many — 4.5 needed three reverts and 5.5 twenty before every test had failed under something.** A revert that everything survives has told you something: either the revert is a no-op (5.5's first R4) or the test proves less than it claims (4.4c strengthened two; 5.4 gained a whole missing control that way). **Say which tests fail under no revert and why** — controls that must pass, and regression assertions, are both legitimate and must be named as such rather than counted as coverage. Record → Batch 4.4c (Tests, notes 3–4), Batch 4.5, Batch 5.4 note 4, Batch 5.5 note 5.
- **Is it a race? Measure, do not assume.** Prisma's interactive transactions on SQLite **do not overlap** — the second body does not begin until the first has committed, in both journal modes — while a read *outside* a transaction does not wait at all. So the question is only ever whether the read sits inside the transaction that depends on it. Measure it with two timestamped concurrent `$transaction` bodies on a scratch copy. Record → Batch 4.7 note 1.
- **Read-only inspection of live data.** Use `bun:sqlite` with `readonly: true`; do not load Prisma or the WAL startup hook against the production file. Record → Batch 3.1 note 4.
- **Manual validation against the production build.** `bun run build` then `bunx next start` on the scratch copy; testing the built artifact is the stronger check, and `next dev` is blocked on this machine anyway (warning 9). Record → Batch 3.4 note 1.
- **A scratch copy can carry a PIN Claude knows, which makes the walkthrough unattended.** Claude cannot type a *production* PIN — the live values were never seen and are recorded nowhere. On a **copy**, write a known PIN with the app's own `hashPin` before starting the server and the whole manual validation runs without the operator. Guard the script on the target path (refuse anything outside the scratchpad) so it can never address the live file. Record → Batch 4.4b (Tests).
- **Browser driving.** Claude cannot type PINs on production; the operator enters them, everything after is driven by Claude. When synthetic clicks do not land in the browser pane, dispatch through the DOM and say so in the record. **A `keydown` probe reading `e.defaultPrevented` reports false for a handler that did fire, if the app re-registered its listener after the probe went on** — install the probe last, or observe the effect instead of the flag. Record → Batch 1.1 note 1, Batch 3.1b note 3, Batch 5.1 note 7.
- **Journal payload vintages.** Anything that reads `FiscalEvent.dataJson` must tolerate the pre-3.5 and post-3.5 shapes; sealed rows are never re-serialised. *Open Threads → D*; record → Batch 3.5 note 3.
- **A batch's *Validation Required* may predate its answer — read it before running it.** Many were written while the design decision was still open and quietly assume one answer. Batch 5.2's assumed a table picker; DD-09 said withdraw, so none of its six criteria was runnable. **Re-derive in place and show each original beside what replaced it** — void, halved, inverted, widened, kept — rather than dropping a criterion silently (5.7 already strikes through two that 4.4c overtook). Criteria can also be *missing*: 5.7 has none for M-11, M-09 or M-10. Record → Batch 5.2.
- **Out-of-scope findings.** Record them in *Newly Discovered Issues* with an ID, a severity and a suggested home; do not fix them in the batch (safety rule 10).

---

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
| C-07 | 1.4 | M-07 ✅ | 3.6 | M-31 ✅ | 2.4 |
| C-08 ✅ | 4.1 | M-08 ✅ | 5.6 | L-01 | 7.2 |
| C-09 ✅ | 4.2 | M-09 ✅ | 5.7a | L-02 ✅ | 6.2 |
| C-10 ✅ | 3.2 | M-10 ✅ | 5.7a | L-03 | 7.2 |
| C-11 ✅ | 3.2 | M-11 ✅ | 5.7b | L-04 ◐ | 2.4 / 7.3 |
| C-12 ✅ | 3.1 | M-12 ✅ | 5.7c | L-05 | 2.4 (deferred) |
| C-13 ✅ | 3.5 | M-13 ✅ | 3.2 | L-06 ✅ | 6.3 |
| C-14 ✅ | 5.3 | M-14 ✅ | 3.2 | L-07 | 7.2 |
| C-15 ✅ | 2.3 + 4.7 | M-15 ✅ | 5.7c | L-08 | 7.2 |
| C-16 ✅ | 4.4 | M-16 ✅ | 5.7c | L-09 | deferred |
| C-17 ✅ | 4.5 | M-17 ✅ | 4.4c | L-10 | deferred |
| C-18 ✅ | 4.3 + operator | M-18 ✅ | 4.4c | L-11 | deferred |
| C-19 ✅ | 2.3 | M-19 ✅ | 5.7c | L-12 | 7.2 |
| C-20 ✅ | 5.1 | M-19s ✅ | 4.4b | T-01…T-07 ✅ | 6.1 |
| C-21 ✅ | 5.2 | M-20 ✅ | 5.7d | T-08, T-09 ✅ | 6.2 |
| C-22 ◐ | 2.1 + 3.5 | M-21 ✅ | 5.7d | T-10…T-12 ✅ | 6.3 |
| C-23 ✅ | 5.4 | M-22 ✅ | 5.7d | DOC-01…12 (**09 ✅** 4.5) | 7.1 |
| C-24 ✅ | 4.6 | M-23 ✅ | 4.3 | V-01…V-03, V-08…V-12 | external |
| C-25 ✅ | 4.6 | M-24 ✅ | 4.4 | V-04…V-07 | 8.1 / 8.2 |
| C-26, C-26b ✅ | 0.1 | C-27 ✅ | 3.4 | P-01…P-03 ✅ | 0.2 |

**The two remaining ◐ items**, whose open halves are: **C-22** whether an unkeyed chain suffices (`REQUIRES EXTERNAL VERIFICATION`, V-01; restore journalling done in 2.1), and **L-04** rotating the secrets the deleted `.next/standalone/` tree exposed (Batch 7.3 / DD-04). **C-15 closed in Batch 4.7** — both halves are done, and its row is ticked above.

---

# DESIGN DECISIONS REQUIRED

These cannot be resolved from the code. **Claude must not decide them.** Each blocks or reshapes the batch named.

**Eighteen answered decisions have been retired from this table** (2026-09-05, Batches 5.3, 5.5, 5.6, the 5.7 split, 5.7a, 5.7b, 6.3 and 7.1), each closed with its batch `COMPLETED` and no forward link. Full rows: `REMEDIATION_RECORD.md` → *Answered design decisions*.

| ID | Decision | Blocks | Context |
|---|---|---|---|
| **DD-20** | **ANSWERED 2026-09-05 — a given-away order is shown SEPARATELY**: not counted as a sale, with a distinct "given away" count and item list beside the sales figures. Average spend stays truthful and `topProducts` keeps meaning *what sold*. **Decided now because it changes the sealed close payload and zero closes exist.** | Batch 7.4a (L-50) | Full question, measurement and rejected options: `REMEDIATION_RECORD.md` → *Answered design decisions* |
| **DD-21** | **ANSWERED 2026-09-05 — the four non-fiscal reports adopt the FISCAL rule**: a period books the corrections it issued. One rule everywhere, so the dashboard's "today" stops disagreeing with `/api/reports/sales`. | Batch 7.4a (L-44) | Full question and rejected options: `REMEDIATION_RECORD.md` → *Answered design decisions* |
| **DD-22** | **ANSWERED 2026-09-05 — narrow `GET /api/users` and `GET /api/backups` to `["SUPER_ADMIN"]`, and review the other 27 gates**, marking each deliberate or decorative. Nothing in the UI calls either as a MANAGER — verified before the decision was put. | Batch 7.4b (L-33) | Full question: `REMEDIATION_RECORD.md` → *Answered design decisions* |
| **DD-04** | **ANSWERED 2026-09-05 — rotate, and accept the loss.** No re-encryption step and no key versioning: the premise was already spent. The `Backup` table holds **zero rows**, so `listBackups()` and `restoreBackup()` cannot reach any of the nine files on disk with or without the key. | Batch 7.3 (`NOT STARTED`); P-02 | Full question and rationale: `REMEDIATION_RECORD.md` → *Answered design decisions*. The zero-rows finding is **L-46**. |

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

# STAGE 3 — FISCAL CORRECTNESS

**Stage status:** `COMPLETED` (2026-09-05) — **all twelve batches done**: 3.1, 3.1b, 3.1d, 3.1c, 3.2, 3.2b, 3.3, 3.4, 3.5, 3.6, **3.6b**, and **3.6c**, which reopened the stage on 2026-09-05 for L-27 and closed it the same day. The eleventh, **3.6b** (L-25, L-26; DD-18), which reopened the stage on 2026-09-04 for one small batch before Stage 4. Every thread the stage opened is closed: the VAT-*rate* thread (C-12, L-16, L-17), the reconciliation thread (C-10, C-11, M-13, M-14, L-23) — **every revenue figure in the application now comes from one aggregation** — archives (C-04, M-02), the operator interface (C-27), the audit trail (C-13, M-04) and close ordering (M-01, M-06, M-07). **Reopened 2026-09-05 for one small batch: 3.6c**, added on an answered decision to close **L-27** — the close guard 3.6b shipped checks a caisse's OPENING date, and a caisse opened before the first sealed period and never closed therefore blocks no close at all. Everything else in this stage stands as completed.

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

**Stage status:** `COMPLETED` — 5.1 through 5.6 and 5.7a–5.7d, all 2026-09-05. **5.7 was SPLIT into four** on the day it was run; its router section carries the evidence and the criterion map. **DD-09 through DD-15 were all answered 2026-09-05 in one brief**, so 5.4 through 5.7 are unblocked and can be worked in turn. Each batch's spec below carries its answer inline. **Six batches found their own *Validation Required* wanting, in six different ways** — the stage's most reusable lesson: 5.2's was written for the answer it did not get and was re-derived; 5.3's was correct and *incomplete*, and gained five criteria; 5.4's two *Manual* criteria could not be run by hand at all (L-47) and were converted into automated coverage that turned out stronger; 5.6's **assumed a single dead value where there were two**, and said nothing about the second namespace the removal would have destroyed; 5.7b's said **both walls must come down together** when only one had to, and keeping the second is what makes the fix safe; and **5.7d inherited three *Manual* criteria that L-47 blocked outright**, all three converted. Read the criteria before running them, for what they omit as well as what they assume.

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

**Stage status:** `IN PROGRESS` — 7.1 and 7.2 `COMPLETED` 2026-09-05; **7.4 split into 7.4a/b/c**, then 7.3

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

**Status:** `NOT STARTED` — **unblocked by DD-04, answered 2026-09-05**

**Prerequisite: every other Stage 7 batch complete.**

| ID | Status | Item |
|---|---|---|
| **L-04** | `NOT STARTED` | `.next/standalone/.env` is a stale build artifact carrying **live secret values** and a Linux `/home/z/…` DB path. Treat as a leaked-secret event. |
| **SEC-ROT** | `NOT STARTED` | Rotate `SESSION_SECRET` and `BACKUP_ENCRYPTION_KEY`. There is still no key id and no envelope encryption, and **DD-04 answered that this does not matter here**: measured read-only 2026-09-05, the `Backup` table holds **zero rows**, so no file in `db/backups/` is reachable by `listBackups()` or `restoreBackup()` with or without the key (**L-46**). Rotate and accept the loss; build no versioning. |

**⚠ Order matters, and one half of it was retired by DD-04.** The rule used to be that rotating the backup key before the retained backups are re-encrypted destroys the ability to restore them; **that ability does not currently exist** (L-46), so nothing has to precede the rotation. What still stands: rotating `SESSION_SECRET` invalidates all sessions and every outstanding step-up token — do it outside service hours. And take a **new** backup after rotating, then restore it, before the old key is discarded.

### Batch 7.3 — Validation Required

- Confirm the stale `.next/standalone/` tree is gone and does not regenerate with secrets.
- After `SESSION_SECRET` rotation: all users can log in; existing sessions are invalidated; approval tokens issued before rotation are rejected.
- After `BACKUP_ENCRYPTION_KEY` rotation: a **new** backup is created and successfully restored before the old key is discarded — which, per L-46, will be the **first** end-to-end restore this installation has ever managed. Old backups are recorded as **retained-but-undecryptable and already unreachable** (DD-04's answer), not re-encrypted.
- Never record any secret value in this file, in a commit message, or in a log.

### Batch 7.3 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

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

**What must be KEPT.** Categories, products, option groups, option choices, add-ons, product images, customers, ~~tables~~, users and settings. The catalogue is real work recovered in commit `0c5ede6`; only the trading is fake.

**Amendment, 2026-09-05 (Batch 5.2).** **`tables` is struck from that list and moves to the delete list.** This sentence was written while the floor plan was a live feature; DD-09 has since withdrawn it, and 5.2 removed the screen from the navigation. What remains in production is **one row** — `T1 / Salle`, status `OCCUPIED`, `currentOrderId` **null**, never linked to any order — which no screen can now display and no code can now reach (`checkout.ts:203` is guarded on a `tableLabel` the cart has no writer for). Deleting it is the operator's action (warning 4) and was **deliberately not** requested as a standalone one, because the benefit today is zero and this batch is already scheduled to open the live database with a reviewed script and a verified backup. **The `Table` model itself stays** — DD-09 keeps the model, the API and the server-side auto-link in case table service ever exists; it is the stale row that goes. Reasoning in full: record → Batch 5.2 note 3.

**Amendment, 2026-09-05 (Batch 5.5).** **`CashMovement` joins the delete list.** The decision above enumerates the tables to clear and was written before the table existed; entrée/sortie de caisse rows are trading data by the same argument as payments and refunds, and a reset that left them would carry development cash movements into the first real day and corrupt the opening `expectedCash`. **Zero rows exist today** — the feature is inert on production until its migration runs (*Open Threads → A*) — so this costs nothing now and is easy to forget later, which is why it is written here rather than discovered during the reset. The `MOUVEMENT_CAISSE` journal entries go with the rest of `FiscalEvent`.

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

Open rows only. A row resolved by a batch moves, unchanged, to `REMEDIATION_RECORD.md` → *Resolved findings* when that batch completes (seven rows moved there on 2026-09-04: L-13, L-15, L-16, L-17, L-18, L-20, L-23; since then L-27, L-41, L-42, L-40, L-43, and on 2026-09-05 **L-49** and **L-28**).

**⚠ Read the last column before assuming a row is handled.** Nine rows here name a batch that has since **completed without doing the work**, and a row reading "6.1" beside a `COMPLETED` 6.1 reads as done. Swept 2026-09-05 after Stage 6: each such row now says so, and the ones with no remaining owner say **NO BATCH OWNS THIS**. That is a statement about the plan, not about the finding — none of them has been dismissed.

| ID | Date | Found during | Description | Severity | Assigned to batch |
|---|---|---|---|---|---|
| **L-51** | 2026-09-05 | Batch 7.1 | **`backup.ts` reads the entire uploads archive into memory and encrypts it there, and it is 47 MB, not the "few MiB" its own comment claimed.** Measured on the live install while correcting that comment for DOC-12's neighbours: `db/backups/` holds three `.uploads.enc` files at 41.3 MB, 41.3 MB and **47.4 MB**, beside `.dbenc` files of 455 KB, 471 KB and 586 KB — so the database part really is small and the media part is two orders of magnitude larger. `public/uploads/` is **49 MB across 139 files** today and grows every time the operator adds a product photo. The buffered approach is deliberate and the reason is sound — a streaming implementation would have to splice the GCM auth tag — but the comment justified it with a size that was never true of the file it buffers, so nobody has ever weighed the real one. **A backup is taken automatically at every Z close**, i.e. once a day in normal trading, on a Windows all-in-one whose RAM nobody has measured; the transient cost is the plaintext buffer plus the ciphertext, so on the order of 100 MB, and it grows with the media library rather than with the trading data. **No failure has been observed** — three backups exist and all three completed — and this is recorded rather than fixed because changing how a fiscal backup is written is not a documentation batch's business (safety rule 10). Note the interaction with **L-46**: none of those files is reachable through the application anyway. | LOW–MEDIUM (unmeasured memory spike at every Z close; no failure observed, and it grows with the photo library) | 7.4, with the other carried-over findings — or 8.2, which rehearses a restore and would have to read one of these files back |
| **L-50** | 2026-09-05 | Batch 5.7b | **`aggregate.ts`'s `isFullyRefunded` classifies a ZERO-TOTAL order as fully refunded, so a give-away is silently dropped from `salesCount`, `itemsCount` and `topProducts`.** The function opens `if (refundsTotal >= order.total) return true;` and for a zero-total order that is `0 >= 0`. **The branch was unreachable before Batch 5.7b** — zero-total orders could not be checked out at all (M-11) — so its meaning was never tested against this case, and "given away" is not "refunded". **The effect is benign and that is measured, not assumed**: it under-counts and can never inflate anything, which is 5.7b's own criterion; `salesTotal`, `cashTotal`, the Z report, the sealed close and the grand total's money columns are all unmoved either way, and a test pins `salesCount === 1` for a paid sale plus a give-away. What it costs is reporting: **a meal given away never appears in the product breakdown**, which is mildly at odds with DD-14's stated reason for a dedicated tender ("keeps what was given away separable from what was sold") — separable at the payment level, invisible at the product level. Fixing it means editing **Batch 3.2's unified aggregation**, a fiscal core, for a reporting question nobody has been asked; whether a comp should count as a ticket, and whether its items belong in `topProducts`, are both decisions (safety rules 10 and 11). Entirely latent today: zero offert orders exist on production. | LOW (under-counts only; no fiscal document is affected) | **7.4** — opened 2026-09-05 for exactly this. 6.1 completed 2026-09-05 without it — a coverage batch, not a semantics change. Needs a reporting decision before any batch can carry it |
| **L-48** | 2026-09-05 | Batch 5.6 | **`/api/shifts/summary` computes `expectedCash` without Batch 5.5's cash-movement term, so it and `GET /api/reports/x` disagree for the same shift as soon as one movement exists.** `shifts/summary/route.ts:69` is `openingFloat + grossCashTotal - cashRefundsTotal`; `reports.ts:133` is the same expression **plus `cash.net`**, which is M-05's whole point — before it, a 200 € supplier payment showed as a 200 € shortfall at every close. **Measured, not inferred**, on a scratch copy of production during 5.6's walkthrough: with zero movements the two endpoints both answered **21 580**; after a single +50,00 € approvisionnement they answered **21 580 and 26 580**. This is M-14's *"a fourth aggregation semantic"* reopening at the exact endpoint M-14 was about, and it is the one of Batch 3.2's five aggregation callers that Batch 5.5 did not carry across — 5.5's record names all five as moved, and this one was not. **Latent today, for one reason only: `/api/shifts/summary` still has no client caller** (recorded at Batch 3.2, re-verified by grep in 5.6 — nothing in `src/` fetches it), so no screen shows the wrong figure. That protection ends the moment anything wires the live shift panel up, which is what the endpoint exists for. The fix is one term, and it should come with the assertion that the two endpoints agree — `report-agreement.test.ts` is where that kind of claim already lives. Not fixed in 5.6, whose scope is the dead counter beside it and not the arithmetic (safety rule 10). | MEDIUM (two figures for the same till; latent while the endpoint has no caller) | **7.4** — opened 2026-09-05 for exactly this. 6.1 completed 2026-09-05 without it. A one-term fix plus the agreement assertion, still open |
| **L-47** | 2026-09-05 | Batch 5.4 | **The app renders its login screen even with a valid session, in the in-app browser pane — so no browser walkthrough can reach any authenticated view.** Observed while running Batch 5.4's two *Manual* criteria on a scratch copy: after `POST /api/auth/login` returned 200 from inside the page, `GET /api/auth/me` returned the full user, and `/api/settings`, `/api/shifts/summary` and `/api/catalog/categories` all answered 200 — yet `page.tsx`'s `if (!user) return <LoginScreen />` kept rendering the picker across several reloads. Synthetic clicks on the profile card did not advance it either, which is the shape Batch 5.1 note 7 and Batch 3.1b note 3 already describe for this pane. **Not a regression, and that was measured rather than assumed**: the pre-5.4 stores were stashed, the app rebuilt and the server restarted on port 3064, and the pre-batch build behaved identically. So it predates the batch and is a property of the environment or of the client's session handling, not of the cart work. Cause not established — deliberately not guessed at. **Consequence for the plan**: any batch whose validation depends on driving an authenticated screen in this pane needs a way through this first, and 5.7 (POS defects, L-42's modal-shortcut work) is the next one that will. Two candidate directions, neither investigated: the cookie may not be applied to the pane's context on navigation even though `fetch` from inside the page carries it, or the client's `fetchUser` may be resolving after a render the pane does not repaint. Batch 5.4 worked around it by proving the same properties in `cart-persist-wiring.test.ts`, which loads the real store module against a stubbed `localStorage` — a better artifact, but not a substitute for driving the real UI. | MEDIUM (blocks manual validation of every authenticated screen in this pane; no production impact) | ⚠ **6.3 ATTEMPTED IT AND COULD NOT REPRODUCE IT** (2026-09-05): the pane rendered the authenticated shell, and the `Secure`-cookie hypothesis was **falsified**. Not fixed, cause not established. Re-open on the next occurrence |
| **L-46** | 2026-09-05 | DD-04 brief | **Three `Backup` rows were created and are gone, with no journalled deletion — so the application cannot list or restore any of the 126 MB of backups sitting on disk.** Measured read-only on production 2026-09-05: `db/backups/` holds **nine files** — three legacy `.json` (July) and three `.dbenc` + three `.uploads.enc` pairs whose mtimes are **2026-08-18 23:38, 2026-08-21 01:22 and 2026-08-28 02:21** — while `SELECT COUNT(*) FROM Backup` returns **0**. The audit log settles that they were not merely never created: three `BACKUP_CREATED` rows exist, at exactly those three timestamps, each naming a `Backup` entityId (`cmsz8vdo7001dn3mg3mblr8sk`, `cmt27gpe10005n3xw5ysbc07m`, `cmtc9nb470027n36slusvqpx5`). There is **no `BACKUP_DELETED` action anywhere in the 468-row audit log**, and `deleteBackup` journals one before removing files (C-22), so the rows did not leave through the application either. **Cause not established** — deliberately not guessed at. Consequence: `listBackups()` and `restoreBackup()` both key on the `Backup` table, so the Réglages backup list is empty, no file on disk is restorable through the UI, and **no backup has ever been restored end-to-end on this installation** — which is what Batches 2.1 and 2.2 built and what Batch 8.2 is meant to rehearse. Two of the three backups were taken automatically at a Z close (their timestamps match `Z_REPORT_GENERATED` to the millisecond), so the mechanism itself works. This is also **why DD-04 could be answered "rotate and accept the loss"**: the key is not what makes those files unreachable. | MEDIUM–HIGH (no restorable backup exists on the live install, and the audit trail contradicts the data) | 8.2 — and re-check before 7.3 rotates the key |
| **L-45** | 2026-09-05 | Batch 5.3 | **`POST /api/shifts` reads its single-open-shift guard outside the transaction that creates the shift** — `db.shift.findFirst({ where: { status: "OPEN" } })` at `shifts/route.ts:23`, then `db.$transaction` at `:35`. Two concurrent opens could both pass the guard and both create a shift, which is the **C-15 shape at a fourth site** — Batch 4.7 closed the checkout, the Z report and the refund, and did not name this one. Nothing has ever produced two open shifts (three shifts exist on production, one open), and the till has one operator, so this is latent. It matters slightly more after Batch 5.3, because "the current open till" is now the thing a refund is attributed to: `processRefund` resolves it with `findFirst` + `orderBy: { openedAt: "desc" }`, the same ordering `/api/shifts/summary` and `GET /api/reports/x` already use, so all three would agree on **which** of two open tills they meant — but the second till should not exist. **Update 2026-09-05: Batch 5.5 landed and did NOT widen this.** It asks the same question — "which till is open" — but resolves it **inside** its own transaction, as 4.7 did three times and 5.3 a fourth, so the cash-movement path adds no exposure. `POST /api/shifts` is still the only site reading the guard outside the transaction that acts on it. Fix it the same way. | LOW (latent; no path has ever produced two open shifts) | **7.4** — opened 2026-09-05 for exactly this. 5.5 and 6.1 both completed without it. Still open, still latent |
| **L-44** | 2026-09-05 | Batch 5.3 | **The four non-fiscal reports still attribute a refund to the refunded ORDER's dimension, so they can disagree with `/api/reports/sales` for the same date range.** Batch 5.3 moved the five aggregation callers that feed a fiscal document — the X/Z report, the monthly and annual closes, `/api/reports/vat`, `/api/reports/sales` and `/api/shifts/summary` — onto "a period books the corrections it issued". The four Batch 3.2b unified — `dashboard/route.ts`, `reports/cashiers/route.ts`, `reports/products/route.ts` and `customers/[id]/detail/route.ts` — were deliberately left on `orders.flatMap(o => o.refunds)`, because they group by day, cashier, product and customer, and the right attribution there is **a decision, not a mechanical change**: a cross-shift refund plainly comes out of the refunding till's drawer, but whether it reduces the *selling* cashier's takings or the *refunding* one's is a management question nobody has been asked. The consequence is real and is L-23's shape at the four reports 3.2b had made agree: once a refund is paid on a different day from its sale, the dashboard's "today" and `/api/reports/sales` for the same day give two different figures. **Nothing sealed is affected** — no fiscal document reads these. Entirely latent today: zero refunds exist on production. | MEDIUM (two figures for the same period, on screens a manager compares) | **7.4** — opened 2026-09-05 for exactly this. 6.1 completed without it, and 7.2 is dead-code removal, which this is not. Needs a management decision (whose takings a cross-period refund reduces) |
| **L-39** | 2026-09-04 | Batch 4.6 | **Thirteen catalogue names carry a leading space, which the POS picker renders as an indented label.** Measured read-only on production: **10 `CategoryOptionChoice` rows** (`" Mayonnaise"`, `" Barbecue"`, `" Algérienne"`, `" Harissa"`, `" Biggy"`, `" Potatoes"`, and duplicates of the first three in a second category's group) and **3 `CategoryAddOn` rows** (`" Pepperoni"`, `" Pomme de terre"`, `" Oeuf"`). Found while confirming that images shared across two categories' groups are legitimate rather than duplicates — they are, and no group contains the same choice twice, so this is purely cosmetic. It is **real catalogue data, not a code defect**: nothing in the app trims these on write, and `fix-duplicate-product-options.ts` matches on `name.trim().toLowerCase()` so it already tolerates them. Two ways to close it, and they are different decisions: the operator edits the thirteen names in Réglages, or the catalogue write paths start trimming (which changes what a save stores and would need the same treatment on the product side). **Claude must not edit real menu data** (warning 4), so the first is an operator action and the second is a batch. | LOW (cosmetic; every affected label is visible in the POS picker) | **Operator action** — a live-catalogue edit, which is theirs to make (warning 4). 5.7a–5.7d completed without it |
| **L-36** | 2026-09-04 | Batch 4.4c | **`ApprovalPayload.amount` is documented as euros and has always carried cents.** `approvals.ts:17` declares `amount: number | null; // euros`, but every caller binds cents: `refund/route.ts` passes `parsed.data.amount` (cents, per the `refundSchema` comment), `orders-view.tsx` passes `amountCents` by that name, and `payment-dialog.tsx` passes `discountTotal`. The HMAC therefore binds a cent figure while the type says otherwise, and the `tolerance ?? 0.001` in `verifyApprovalToken` reads as a floating-point euro guard when it is in fact an exact-integer-cent comparison. Nothing is mis-computed today — both sides agree — so this is a comment and a type-doc defect, not a money defect. It matters because Batch 4.4c's step-up now binds amounts through the same field, and the next person to add a caller will read the comment. Recorded rather than fixed: `approvals.ts` is not this batch's file (safety rule 10). **Fix by correcting the comment, not the code.** | LOW (documentation contradicts the implementation in a money path) | 7.1 — 5.7a–5.7d completed without it |
| **L-33** | 2026-09-04 | Batch 4.4b | **With one operational role removed, every gate naming `["SUPER_ADMIN", "MANAGER"]` now admits the entire role model — it is no narrower than declaring no roles at all.** Measured after the removal: **29 declaration sites across 26 route files**, including `POST /api/reports/z` (closing the day) and `POST /api/orders/[id]/reprint` (a journalled REIMPRESSION). Nothing regressed — these gates were never wider than they are — but a reader now cannot tell a deliberate restriction from a decorative one, and `api-authorization.test.ts` had been asserting exactly that property via `not.toContain("CASHIER")`, which the removal made vacuous (the test was rewritten to pin each declared list instead). **Two sites are sharper than the rest:** `GET /api/users` and `GET /api/backups` both answer **200** to a MANAGER whose nav entry for those views is deliberately SUPER_ADMIN-only (DD-07), so the API contradicts the navigation. Verified on a scratch copy: `GET /api/users` returns ids, usernames, names, roles and active flags — **no PIN hashes** — and `GET /api/backups` returns the backup list. `GET /api/logs` correctly returns 403 and is the shape the other two should match. This is the same defect class as M-19s at two routes M-19s did not name. Deciding which of the 29 should narrow to `["SUPER_ADMIN"]` is a review, not a mechanical fix. | MEDIUM (authorization declarations no longer mean what they read as; two contradict the nav) | **7.4** — Batch 7.2 read this row and did NOT act on it, because the row itself says deciding is *"a review, not a mechanical fix"*. The two sharp sites are `GET /api/users` and `GET /api/backups`; `GET /api/logs` already answers 403 and is the shape they should match. Narrowing changes who may call an endpoint — safety rule 11 |
| **L-32** | 2026-09-04 | Batch 4.4 | **Role gating uses two idioms, and only one is visible to the T-03 matrix.** About twenty routes declare their gate as `withAuth(handler, { roles })`; about twenty others admit any authenticated caller at the wrapper and then refuse inside the handler with `if (user.role !== "SUPER_ADMIN") return 403` — `POST /api/backups`, `DELETE /api/backups/[id]`, `POST /api/users` and `PUT /api/settings` among them. **Neither group is insecure**: the inline checks work. The cost is that `api-authorization.test.ts` cannot see the second group, so the declaration-level matrix is complete only for the first, and a future route copying the inline pattern inherits that blind spot. Converting them is mechanical but **user-visible**: the inline guards answer « Réservé au super administrateur » while `withAuth` answers « Accès refusé », so a conversion changes the message an operator reads on every one of those routes. Do it as one deliberate change with the message decided, not incidentally. The test pins which idiom each destructive route uses in the meantime. | LOW (test coverage blind spot; no live exposure) | **7.4** — opened 2026-09-05 for exactly this. 6.1 completed without it, and 7.2 is dead-code removal. A test-visibility gap, still open |
| **L-31** | 2026-09-04 | Batch 4.3 | **`POST /api/seed` reports any catalogue-seeding failure as a won race.** The catalogue step is wrapped in `catch { return … "Base initialisée (requête concurrente)." }`, so every error — not just a genuine concurrent request — is reported to the operator as success. Observed during this batch's validation: on a copy whose users were empty but whose catalogue was intact, `seedCatalogAndSettings` threw on duplicate category names and the route answered `200` with that message. The two bootstrap users *were* created, so the C-18 behaviour under test was unaffected, but an operator seeing that message cannot tell a real race from a catalogue that failed to seed. Narrower after this batch — the new freshness guard refuses most databases that could reach it — but the swallow-everything catch is still there. Distinguish the P2002 unique-constraint case from the rest, as the users branch above it already does. | LOW (misleading operator message on a bootstrap path) | **7.4** — opened 2026-09-05 for exactly this. 5.7a–5.7d completed without it, and 7.1 is documentation — this is a code fix |
| **L-30** | 2026-09-04 | Batch 4.2 | **The unknown-username burn at login competes for the bounded PIN queue, so username enumeration can push honest cashiers to `503`.** `login/route.ts:52` runs a full `hashPin("dummy")` for an unknown user, on purpose, to flatten the timing signal that would otherwise enumerate accounts. Batch 4.2 put that derivation inside the concurrency bound, which is where it belongs — unbounded it is the memory-exhaustion path C-09 names. The residue is that the login rate limit is keyed `login:<ip>:<username>` and, since Batch 4.1 correctly stopped believing the proxy headers, `<ip>` is the constant `"local"`: each distinct username is its own bucket and nothing caps how many buckets a caller can mint. Measured on a scratch copy: **60 simultaneous logins with 60 unknown usernames → 34 served, 26 refused `503`**, and a legitimate login arriving inside that window would have been among the refused. Candidate fixes: a global (not per-username) budget for the unknown-user path, a cheaper constant-time burn, or binding the login limiter to something the caller cannot vary. Interacts with **DD-06** — if the app binds `127.0.0.1` the reachable surface shrinks to the till itself. | MEDIUM (availability of the login screen under a LAN-side flood) | **7.4** — opened 2026-09-05 for exactly this. 4.3 completed 2026-09-04 without it, and Stage 4 closed with it |
| **L-24** | 2026-09-04 | Batch 3.5 baseline | **`bun test src` fails 23 tests on a machine this slow, with no code defect involved.** All 23 are timeouts against Bun's 5 s default: 22 in `backup*.test.ts` and 1 in `auth.test.ts`. Measured cause — `scryptSync` at N=2^17 costs **~1519 ms** per call here (N=2^16 costs ~727 ms), and a backup→restore round trip performs several: the archive encrypt, the pre-restore safety-snapshot encrypt, and the decrypt. The cascade that follows is misleading: the test times out, `afterEach` deletes the temp directory, and the still-running `VACUUM INTO` then reports `unable to open database` (SQLITE_CANTOPEN, P2010), which reads like a filesystem or Prisma fault and is not one. `bun test src --timeout 30000` → **340 pass, 0 fail**. Whole-suite runtime is ~192 s against the 25,9 s the plan recorded for the same suite, so this is machine state, not a regression. Established on the untouched pre-batch commit `e86c5e4`. Options: raise the timeout in `bunfig.toml`, or lower the scrypt cost in test runs only — the second must not touch the production KDF parameters. | LOW (test infrastructure; hides real failures behind noise and costs a session an hour to diagnose) | **7.4** — opened 2026-09-05 for exactly this. 6.1 completed without it. **Mitigated, not fixed** — `--timeout 30000`, per the validation-commands table |
| **L-22** | 2026-09-03 | Batch 3.1d | **Validation errors reach the French UI as untranslated English zod messages.** `settings/route.ts` returns `parsed.error.issues[0]?.message`, and `settingsSchema` defines custom messages for only a few fields, so the operator saw `Too big: expected number to be <=48` (L-20). That specific message is now unreachable, but any other out-of-range settings value produces the same class of output. Applies to other schemas in `validation.ts` too. | LOW (operator-facing text) | 7.1 — and note 5.7c fixed **one instance** of this class, not the class |
| **L-21** | 2026-09-03 | Batch 3.1b manual validation | **`renderReceipt()` centres but never wraps, so an over-long field overflows the paper.** A receipt rendered at the corrected 48 columns still contained a **56-character** line: the restaurant's real address, `23 Grande Rue 45210, 45210 Ferrières-en-Gâtinais, France`. On 48-column paper that wraps mid-address on every ticket. Distinct from L-14, which is about *archived* 80-column receipts — this is new output at the correct width. Affects any long `restaurantAddress`, `restaurantName` or `footerNote`. | MEDIUM (every printed ticket, once the printer is live) | **1.3** — the printing batch, still open on hardware, which is where this is felt. 3.4 completed without it |
| **L-19** | 2026-09-03 | Batch 3.1 consumer verification | **The VAT breakdown table renders rates with `toFixed(1)`, which cannot show a two-decimal rate.** `report-widgets.tsx:76` renders `Number(r).toFixed(1) + " %"`, so 10 % displays as "10.0 %" (cosmetic) and a Corsican/overseas rate such as 1,05 % would display as "1.1 %" — a wrong rate on a fiscal report. Pre-existing and **improved** by Batch 3.1 (before the fix, 1,05 % was keyed "1" and lost entirely), and unreachable while every product is at 10 %. Recorded so 3.2/3.4 does not preserve it. Note the display layer, not the key, is what needs fixing. | LOW (latent display defect; not reachable today) | **7.4** — opened 2026-09-05 for exactly this. 3.4 completed without it, and 7.1 is documentation — this is a display fix |
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
