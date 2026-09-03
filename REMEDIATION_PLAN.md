# HibaPOS France — Remediation Plan

Master source of truth for the controlled remediation of HibaPOS France.
Derived from the read-only baseline audit of 2026-09-03 (repo at commit `5ef7dc4`).

Detailed audit record: https://claude.ai/code/artifact/329316b0-3a6b-48b0-9d27-d815004f4cbf

---

## CURRENT PROJECT STATUS

**Overall:** NOT READY FOR PRODUCTION

**Current Stage:** Stage 3 — Fiscal correctness. (Stage 1 is **partly done**: 1.1 and 1.2 COMPLETED, 1.3 `IMPLEMENTED — TESTING REQUIRED` on hardware, 1.4 deferred. Stage 2 is COMPLETED.)

**Current Batch:** Batch 3.6 — Close chain ordering and fiscal document content · `NOT STARTED`

**Last Completed Batch:** Batch 3.5 — Fiscal audit-trail completeness (C-13, M-04). The manager who approves a discount is now recorded, and a refund's journal entry names the printed ticket instead of a cuid. **C-22's chain-design half stays `REQUIRES EXTERNAL VERIFICATION`** and was carried forward untouched, as the batch allows. **The migration is written and rehearsed but NOT applied to the production database** — see *OPEN THREADS → A*.

**Next Batch:** Batch 3.6. **Batch 1.4 is unblocked in design** (DD-02 answered) but still deferred on hardware — see *Hardware-dependent validation* below.

**Blocked:** Batch 1.3 `[HW]` sign-off and Batch 1.4 — both need the app running on the restaurant's POS machine, which is in a different country from the developer and has no copy of the app installed (decision of 2026-09-03).

**Awaiting decision:** Batch 5.3 (cross-shift refunds), Batch 5.5 (cash movements), Batch 5.6 (order cancellation) — see *Design Decisions Required*. **DD-03 and DD-17 were answered on 2026-09-03**; nothing blocks Stage 3.

**Last Updated:** 2026-09-04 (session 4 — Batch 3.5; read *OPEN THREADS* below before starting anything)

### OPEN THREADS — read this before starting a batch

*Rewritten at the end of session 3 (2026-09-03), updated for Batch 3.5.
Everything below is current as of the Batch 3.5 commit.*

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
| **`Order.discountApprovedById`** (3.5) | The migration `20260903230305_order_discount_approver` is written and rehearsed, **not applied** — Claude cannot run `migrate deploy` against production. Until the operator runs it, the live install has no column to write to and **checkout will fail** on the new code. Do not deploy the code without the migration. | The operator running the command in *B* |

#### B. Waiting on the operator

| Action | Why it matters | Related |
|---|---|---|
| **Apply the Batch 3.5 migration** | `bunx prisma migrate deploy` from the project root. Adds one nullable column to `Order`; rehearsed on a copy with a before/after fingerprint diff showing nothing else moved. **Required before the 3.5 code runs on the live install.** | C-13 |
| **Push session-3 and session-4 commits** | Session 3 added ~20 commits. Claude cannot push (explicit-permission action, and the classifier refuses it). Check with `git rev-list --left-right --count origin/main...HEAD`. | P-01 |
| Correct `printerName` in Réglages | Stored value is `"Epson TM-m30"`; the physical printer is the **Sunso WTP-801** (Ethernet). Cosmetic — nothing reads it. **This was impossible until Batch 3.1d**; the settings form now saves. | DOC-15 |
| Choose a second volume for backups | See A. | C-06 |
| Turn FACTICE on for any pre-go-live testing | See A. | L-18 |
| Stop the stale `next dev` processes | Leftovers from the 3.1b run hold `.next/dev/lock`, so `bun run dev` fails. Claude is blocked from killing processes. `bunx next start` works meanwhile. | — |

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

#### F. Findings still open from session 3

| ID | What | Suggested home |
|---|---|---|
| **L-19** | `report-widgets.tsx:76` renders rates with `toFixed(1)`, so a two-decimal rate (1,05 %) would display as "1.1 %". Not reachable while only 10 % and 5,5 % are in use. | 7.1 |
| **L-21** | `renderReceipt()` centres but never wraps, so the restaurant's real 56-character address overflows 48-column paper on every ticket. | with the printer work |
| **L-22** | Validation errors surface as untranslated English zod messages in a French UI. | 7.1 |
| **L-24** | `bun test src` fails 23 tests on a slow machine — the backup/restore suite exceeds Bun's default 5 s timeout because scrypt at N=2^17 costs ~1.5 s per call here. Nothing to do with the code; it cost most of an hour to establish that in session 4. Run `bun test src --timeout 30000` if the failures are all in `backup*.test.ts`. | 6.1 |
| **L-12**, **L-10**, **L-11** | Pre-existing, unchanged this session. | as recorded |

#### G. Current baselines — check these before trusting anything

| Thing | Value at the end of session 3 |
|---|---|
| Tests | **340 pass, 0 fail** (`bun test src --timeout 30000` — see L-24 for why the timeout flag) |
| Production DB sha256 | `711de2f1280e30cad04d0cb49ba5cd7d7084453078ed5390e34b708de84a2534` (unchanged by Batch 3.5) |
| Fiscal chain | `/api/fiscal/verify` → all three chains `ok`, `lastSequence: 2` |
| Fiscal counters | `20/3/2/2` (receipt / shift / Z / event) |
| Migrations | **3 applied on production**, latest `20260903203715_category_vat_rates`. A **4th is committed and unapplied**: `20260903230305_order_discount_approver` |
| Catalogue | 78 products — 17 drinks at **5,5 %**, 61 at 10 % |
| Out-of-band snapshots | `db-snapshots/custom.db.pre-3.1c.2026-09-03T20-54-10Z` and `db-snapshots/custom.db.pre-3.5.2026-09-03T23-01-34Z` (outside the repo; both hash `711de2f1…`) |

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

1. ~~`src/app/api/backups/**` is not in git.~~ **RESOLVED in Batch 0.1** (commit `e97a3e1`) — `.gitignore` anchored, the three route files are now tracked. The repo **is** pushed: `origin/main` is `astrellaltd-coding/HibaPos`, and every session must leave its own commits pushed by the operator (Claude cannot push). Still: do not run `git clean` and do not delete the working tree without checking `git rev-list --left-right --count origin/main...HEAD` first.
2. **Do not run `bun run test:e2e`.** `playwright.config.ts` starts `bun run dev`, which loads the real `.env` and writes orders, refunds and Z reports into the **production database** and into an append-only hash chain that cannot be cleaned up. Fixed in Batch 6.3.
3. **Do not run `bunx vitest` / `npx vitest`.** Only `bun test src` is safe. The test-DB redirect lives in `bunfig.toml` → `test-setup.ts` preload, which vitest does not read; four test files begin by wiping 17 tables.
4. **The CATALOGUE in the production database is real and irreplaceable; the TRADING data is not.** Confirmed by the operator on 2026-09-03: categories, products, options and images are real work (commit `0c5ede6`); every order, payment, receipt, shift, Z report and fiscal event was created by the developer for testing, and P-04 deletes all of it before the first genuine sale. Treat catalogue changes as destructive and irreversible. Trading-data mistakes cost test data — which lowers the risk of exercising fiscal flows, but does **not** license careless writes to the live database: work on a scratch copy, as every batch in Stage 3 did.
5. **Do not run scripts in `scripts/`** without reading them first. `seed-users.ts` and `seed-category-options.ts` begin with unguarded `deleteMany({})` calls (finding C-17). The exception is `set-drink-vat-rates.ts` (Batch 3.1c), which is dry-run by default, idempotent, and refuses to run against an unexpected category tree.

6. **`bun run dev` currently fails.** Stale `next dev` processes from Batch 3.1b hold `.next/dev/lock`; Claude is blocked from killing processes, so the operator must stop them. `bunx next start` (after `bun run build`) works meanwhile and is what Batch 3.4 validated against.

7. **When running the app against a scratch copy, override `HIBAPOS_DATA_DIR` as well as `DATABASE_URL`.** Batch 3.4 overrode only the database and a generated archive landed in the real `db/fiscal-archives/`, orphaned from its row. It was deleted, but the next session should not repeat it.

8. **`bun test src` fails 23 tests on this machine, and the code is fine.** All 23 are in `backup*.test.ts` / `auth.test.ts` and every one is a 5 s timeout: scrypt at N=2^17 costs ~1.5 s per call here, and a backup→restore round trip makes several. `bun test src --timeout 30000` gives **340 pass, 0 fail**. Confirmed on the untouched commit before any Batch 3.5 change was made. Recorded as **L-24**. Do not "fix" a test that fails this way.

9. **Claude cannot do four things in this project** — the permission classifier refuses them, and each is correct: `git push`, `prisma migrate deploy` against production, writes to real menu data, and killing processes. Prepare, rehearse and verify; then hand the operator the exact command.

---

## HOW TO USE THIS FILE

1. Read **CURRENT PROJECT STATUS** above. It tells you exactly where to resume.
2. Open the **current batch**. Do only what is in that batch.
3. Work the batch's items from `NOT STARTED` → `IN PROGRESS` → `IMPLEMENTED — TESTING REQUIRED`.
4. Run the batch's **Validation Required** section in full.
5. If validation passes, mark items `COMPLETED`, fill in the status block (date, changes, files, tests, commit), and mark the batch `COMPLETED`.
6. Update **CURRENT PROJECT STATUS** and the **Completed Remediation History** table.
7. Commit. One batch, one commit (or a small reversible series).
8. Stop. Do not roll into the next batch without the user's go-ahead.

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
| `bun test src` | 136 unit + integration tests, Bun runner, redirected to a temp DB | ✅ Safe |
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

# STAGE 0 — PRESERVE / ESTABLISH SAFE BASELINE

**Stage status:** `NOT STARTED`

Rationale (audit section J, step 1): the source of the backup/restore API exists on exactly one machine and in no commit. Nothing else should be touched until that is fixed, because ordinary remediation hygiene (`git clean`, branch switching, reset) would destroy it silently.

## Batch 0.1 — Source-control recovery

**Status:** `COMPLETED`

### C-26 — Backup & restore API excluded from version control

**Status:** `COMPLETED` · Severity: CRITICAL · Category: source control / data loss

**Problem.** `.gitignore:59` is a bare `backups/`. Git matches bare patterns at any depth, so a rule written for the `db/backups/` artifact folder also excludes `src/app/api/backups/`.

**Evidence.** `git check-ignore -v` names `.gitignore:59` for all three route files. 59 `route.ts` files on disk; 56 tracked.

**Location.**
- `.gitignore:59`
- `src/app/api/backups/route.ts` (untracked)
- `src/app/api/backups/[id]/route.ts` (untracked)
- `src/app/api/backups/[id]/restore/route.ts` (untracked)

**Impact.** These files exist on one un-backed-up machine and in no commit, and the repo has never been pushed. A clone compiles and ships a Sauvegardes screen whose three API calls all 404 — the failure is silent because `src/lib/services/backup.ts` and its tests *are* tracked.

**Remediation direction.** Anchor the rule to `/db/backups/`. Verify the three files become trackable. Commit them.

**Dependencies.** None. This is the first action in the project.

### C-26b — Other bare `.gitignore` patterns with the same hazard

**Status:** `COMPLETED` · Severity: HIGH · Category: source control

**Problem.** `.gitignore:50` (`test`) and `.gitignore:51` (`prompt`) are bare patterns that would silently swallow any file or directory with those names at any depth. `.gitignore:58` (`db/`) would swallow any future `src/**/db/`. No file currently matches, so this is latent.

**Location.** `.gitignore:50`, `:51`, `:58`

**Impact.** The same class of silent exclusion that produced C-26.

**Remediation direction.** Anchor each pattern, or remove those that no longer serve a purpose. Do not change `/upload/` (line 62) in this batch — see DOC-06.

**Dependencies.** Same batch as C-26.

### Batch 0.1 — Validation Required

- `git check-ignore -v src/app/api/backups/route.ts` returns **no match**.
- `git status --porcelain` lists the three backup route files as untracked/added rather than ignored.
- `git ls-files "src/app/api/**route.ts" | wc -l` equals the on-disk count (59 at time of audit — re-derive, do not assume).
- `git status --ignored=matching -- src` reports nothing under `src/`.
- `bun run typecheck` — PASS (no code changed; confirms baseline).
- `bun test src` — PASS (baseline: 136/136 at audit time).
- Commit created containing the three route files.

### Batch 0.1 — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-03
**Changes:** Anchored four bare `.gitignore` patterns that matched at any depth: `backups/` → `/db/backups/` (C-26), and `test`/`prompt`/`db/` → `/test`/`/prompt`/`/db/` (C-26b). Added the three previously-untracked backup API route files. Line 62 (`/upload/`) left untouched per plan (DOC-06).
**Files:** `.gitignore`; `src/app/api/backups/route.ts`; `src/app/api/backups/[id]/route.ts`; `src/app/api/backups/[id]/restore/route.ts`
**Tests:** `git check-ignore -v` on the three route files → no match (was `.gitignore:59`). `git status --porcelain` shows them untracked/added, not ignored. `git ls-files "src/app/api/**route.ts" | wc -l` = 59, matching on-disk count (59). `git status --ignored=matching -- src` → empty. `bun run typecheck` → PASS. `bun test src` → 136/136 PASS.
**Commit:** `e97a3e1`
**Notes:** No file on disk currently matches `test` or `prompt` outside `node_modules`, so C-26b's latent hazard had not yet fired for those two — anchored per plan direction rather than removed, to preserve intent for future Z.ai-artifact scratch files at the repo root. Local-only git identity (`user.name`/`user.email`) had to be set in this repo to match the existing commit history (`HibaPOS Dev <dev@hibapos.fr>`) before a commit could be made — confirmed with the user first, not set globally.

---

## Batch 0.2 — Working-state preservation

**Status:** `COMPLETED`

These are preconditions derived from findings C-05, C-06 and the audit's Stage 2 concerns, brought forward so that remediation itself cannot destroy the user's recovered data. They are **not** the backup-subsystem fixes — those are Stage 2.

### P-01 — Push the repository to the configured remote

**Status:** `COMPLETED` · Category: operational

**Problem.** `origin` is configured (`https://github.com/astrellaltd-coding/HibaPos.git`) but no upstream and no remote-tracking branch exists. All 15 commits are local-only. `IMPLEMENTATION_PLAN.md:185` records the push as pending on interactive credential auth.

**Impact.** One copy of the codebase exists.

**Remediation direction.** Push `main` and set upstream. Requires the user's interactive GitHub credential prompt — this cannot be completed unattended.

**Dependencies.** Must run **after** Batch 0.1, otherwise the backup routes are pushed as still-ignored.

### P-02 — Preserve the encryption key and environment out-of-band

**Status:** `COMPLETED` · Category: operational / data loss

**Problem.** `BACKUP_ENCRYPTION_KEY` derives each backup's key with a per-file salt but reads the secret live from `process.env` at restore time. There is no key id, version or keyring. Rotating or losing `.env` makes every existing `.dbenc` permanently undecryptable. `.env` is gitignored and has no backup of its own.

**Location.** `src/lib/services/backup.ts:55-70, 220-226`

**Impact.** Losing `.env` loses the entire retained fiscal backup archive.

**Remediation direction.** The user must store the current `.env` values somewhere they control before any remediation touches backups. **Claude must not read, print, copy or transmit these values.** This item is a decision + a manual user action, not a code change.

**Dependencies.** Must happen before Stage 2.

### P-03 — Take a pre-remediation snapshot and record the fiscal baseline

**Status:** `COMPLETED` · Category: data integrity

**Problem.** No known-good reference point exists for comparing the database before and after remediation.

**Remediation direction.** With the user's approval, capture: a copy of `db/custom.db` and `public/uploads/` outside the project tree; the output of `GET /api/fiscal/verify`; the `FiscalCounter` row; and row counts per table. Record the results in the *Baseline Record* section below. This is read-plus-copy only — no writes to the live database.

**Dependencies.** After P-01.

### Batch 0.2 — Validation Required

- `git rev-parse --abbrev-ref --symbolic-full-name @{u}` resolves (upstream set).
- `git log --oneline origin/main -1` matches local `HEAD`.
- User confirms in writing that `.env` values are preserved out-of-band (P-02).
- Snapshot files exist outside the project tree and their sizes/hashes are recorded below.
- Fiscal chain baseline recorded: `ok`, `eventsChecked`, `lastSequence`, grand-total figures.
- `db/custom.db` unchanged by this batch (compare hash before/after).

### Baseline Record (fill during Batch 0.2)

| Item | Value | Recorded |
|---|---|---|
| `db/custom.db` size / hash | 671744 bytes / sha256 `4285a31015268917a008634828e39b5a2a31f581d538069404afb1603631d728` | 2026-09-03 |
| ↳ **superseded 2026-09-03** | Hash is now `61f5c62fa8124e952760b922e917ae435fb3b37044ac2358cae2e9a7716ccc52`. Cause: the operator ran the app (`bun run start`) against the production database for Batch 1.3 printer commissioning and logged in. Delta is **one `LOGIN_SUCCESS` audit row** (auditLog 457 → 458) plus the session row. Verified unchanged: user 2, order 20, payment 21, receipt 20, refund 0, fiscalEvent 2, zReport 2, shift 3, setting 12, and `FiscalCounter` identical (receipt 20 / shift 3 / Z 2 / event 2). No fiscal record was created. | 2026-09-03 |
| `public/uploads/` file count | 139 files, 49 MiB total | 2026-09-03 |
| Snapshot location | `C:\Users\einer\HibaPOS-Baseline-Snapshots\2026-09-03\` (`custom.db` + `uploads/`), outside the project tree; hashes verified equal to source immediately after copy | 2026-09-03 |
| `/api/fiscal/verify` → fiscalEvents.ok | `true` (eventsChecked: 2, firstBreakAt: null, lastSequence: 2, total: 2). `monthlyCloses.ok` and `annualCloses.ok` also `true` (both empty, lastSequence 0). `grandTotal`: totalSales 5480, totalOrders 2, totalVat 502, totalCash 5480, totalCard 0, totalVoucher 0, totalRefunded 0 | 2026-09-03 |
| `/api/fiscal/verify` → lastSequence | 2 | 2026-09-03 |
| FiscalCounter (receipt / shift / Z / event) | receipt 20 / shift 3 / Z-report 2 / fiscal-event 2 | 2026-09-03 |
| Baseline test result | `bun test src` — 136/136 pass. Row counts by table also recorded: user 2, session 1, category 14, product 78, productAddon 0, optionGroup 10, optionChoice 49, addOn 0, categoryOptionGroup 8, categoryOptionChoice 39, categoryAddOn 21, customer 2, table 1, shift 3, order 20, orderItem 82, payment 21, refund 0, receipt 20, zReport 2, fiscalCounter 1, auditLog 457, setting 12, backup 0, technicalLog 0, fiscalEvent 2, grandTotal 1, monthlyClose 0, annualClose 0, fiscalArchive 0 (846 rows total) | 2026-09-03 |

### Batch 0.2 — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-03
**Changes:** No code changes. (P-01) User pushed `main` to `origin` (`https://github.com/astrellaltd-coding/HibaPos.git`) interactively and confirmed it in GitHub; verified upstream tracking now resolves to `origin/main` and local `HEAD` matches `origin/main` exactly (`795d4fa`). (P-02) User confirmed in writing that a copy of `.env` is stored separately, out-of-band; Claude did not read, print, copy or transmit its contents at any point. (P-03) Took a read-plus-copy-only pre-remediation snapshot: copied `db/custom.db` and `public/uploads/` to `C:\Users\einer\HibaPOS-Baseline-Snapshots\2026-09-03\`, verified by hash/file-count that the copies are byte-identical to source and that the source was untouched; captured the fiscal chain baseline and per-table row counts via a temporary read-only script (`_baseline_check.ts`, deleted after use) that called the same `verifyFiscalChain`/`verifyMonthlyCloses`/`verifyAnnualCloses` functions the `/api/fiscal/verify` route uses, plus `db.<model>.count()` for all 29 Prisma models — no writes were made to the live database. Full figures are in the *Baseline Record* table above.
**Files:** None changed in the repo. `REMEDIATION_PLAN.md` updated with status only.
**Tests:** `db/custom.db` sha256 hash identical before and after the whole batch (`4285a310...631d728`). `bun test src` — 136/136 PASS. Snapshot copy verified byte-identical by hash (DB) and file count (uploads, 139/139).
**Commit:** *(this plan-status update commit — no code changes in this batch)*
**Notes:** Initial `git push` attempt from this session was blocked by the Claude Code auto-mode permission classifier (pushing is an explicit-permission action); the user ran the push from their own terminal instead. The `origin` remote was completely empty (0 refs) before the push, confirmed via `git ls-remote`, so there was no risk of overwriting existing remote history.

---

# STAGE 1 — CRITICAL BLOCKERS

**Stage status:** `IN PROGRESS` (Batches 1.1 and 1.2 COMPLETED; 1.3 REQUIRES DECISION; 1.4 NOT STARTED)

Audit section J, step 2: the restaurant cannot open without these. The printing/drawer decision comes first because it is the only item that is a build rather than a fix; the two unit bugs are small, localised edits with disproportionate impact.

## Batch 1.1 — Refund amount unit correction

**Status:** `COMPLETED`

### C-01 — Refund dialog mixes cents and euros

**Status:** `COMPLETED` · Severity: CRITICAL · Category: confirmed bug (money)

**Problem.** `maxRefund` is in cents. It is pre-filled into the input with `.toFixed(2)` under a label reading *Montant (€)*, read back with `Number(...)`, and sent as cents.

**Evidence.** `orders-view.tsx:210` cents → `:213` `setRefundAmount(maxRefund.toFixed(2))` → `:220` `Number(refundAmount)` → sent as `amount` (cents, `validation.ts:185` `z.number().int()`). `:667` displays `formatEuro(maxRefund)` = "12,50 €" above a field pre-filled "1250.00".

**Location.** `src/features/orders/orders-view.tsx:210-227, 664-682`

**Impact.** Typing `5` refunds 0,05 €. Typing `5.50` is rejected as "Invalide" because the server requires an integer. Only a full refund is correct, and only by accident. Refunds are immutable fiscal records — each writes a `REMBOURSEMENT`/`ANNULATION` event that cannot be deleted.

**Remediation direction.** Make the dialog a euros boundary, matching `OpenShiftForm` (`shifts-view.tsx:479`): pre-fill `(maxRefund/100).toFixed(2)`, submit `Math.round(euros * 100)`, compare against `maxRefund` in cents.

**Dependencies.** None.

### Batch 1.1 — Validation Required

- New targeted test covering the euros→cents boundary of the refund dialog (there is currently none).
- Manual workflow: create a test order in a scratch DB, refund a partial amount (e.g. 5,00 € of 12,50 €), confirm the `Refund.amount` row equals `500`.
- Manual workflow: refund a decimal amount (5,50 €) — must succeed, not 400.
- Manual workflow: full refund via the pre-filled value still equals the order total exactly.
- `bun test src` — PASS.
- `bun run typecheck` — PASS.
- `bun run lint` — PASS.
- Regression: confirm the resulting `REMBOURSEMENT` fiscal event payload carries the correct cent amount.

### Batch 1.1 — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-03
**Changes:** The refund dialog is now a euros boundary, as the remediation direction required. `openRefund()` pre-fills `fromCents(maxRefund).toFixed(2)` instead of `maxRefund.toFixed(2)` (a 40,20 € order now pre-fills `40.20`, not `4020.00`). `submitRefund()` parses the field into integer cents through the new `parseEuroInput()` helper, rejects unparseable or non-positive input, and compares cents against cents (`amountCents > maxRefund`) — the old guard compared euros against `maxRefund + 0.01`, i.e. euros against cents. The cent value is what goes into `pendingRefund`, so it is both POSTed to `/api/orders/[id]/refund` **and** HMAC-bound into the manager approval token; token and request therefore stay in the same unit (`lib/approvals.ts:114` verifies with tolerance 0.001, an exact match for integers). Added `parseEuroInput(raw): number | null` to `src/lib/money.ts` as the single euros→cents *input* boundary — the mirror of `formatEuro()` — accepting the French decimal comma as well as a dot, tolerating NBSP / narrow-NBSP grouping separators, rounding beyond two decimals to the nearest cent, returning `null` for text that is not a number, and leaving the zero policy to the caller (zero is legal for an opening float, not for a refund). No server-side, schema or fiscal-logic change: `src/lib/services/refund.ts:72` already enforced the maximum inside the transaction, so C-01 was a client-boundary defect only.
**Files:** `src/features/orders/orders-view.tsx` (import, `openRefund`, `submitRefund`), `src/lib/money.ts` (new `parseEuroInput`), `src/lib/money.test.ts` (9 new tests).
**Tests:** `bun test src` — **145/145 PASS** (baseline 136 + 9 new). `bun run typecheck` — PASS. `bun run lint` — PASS. New targeted tests cover the euros→cents boundary the audit found untested: whole euros (`5` → 500, not 5), the French comma (`5,50` → 550), the dot (`5.50` → 550), fr-FR grouping whitespace, amounts float arithmetic drifts on (`0,29`/`1,15`/`8,35`/`11,45`), rounding past two decimals, `null` for `""`/`abc`/`5€`/`5,5,5`/`-5`/`.`, `0` parsed as `0`, and the full-refund pre-fill round-trip `fromCents(n).toFixed(2)` → exactly `n` for nine cent values. Manual workflows were run against a **scratch copy** of the production database (`db/custom.db` copied to the session scratchpad; `bunx next dev -p 3010` with `DATABASE_URL` overridden to the copy). Which database the server had open was proved **before any write** by a scratch-only marker returned from the pre-auth `GET /api/auth/profiles`. Results, read straight out of the scratch DB: order #18 (4020) refunded `5,00` → `Refund.amount = 500`; order #17 (1390) refunded `5,50` → `550` and accepted, where the pre-fix client would have sent 5.5 and been rejected 400 "Invalide"; order #16 (690) refunded via the **untouched** pre-filled value → `690` exactly, order status `REFUNDED`, `refundedAt` set. Regression on the fiscal side: events 3 and 4 are `REMBOURSEMENT` with `amount` 500 and 550, event 5 is `ANNULATION` with `amount` 690 and `fullyRefunded: true`; `/api/fiscal/verify` on the scratch instance returned `fiscalEvents.ok: true`, `eventsChecked: 5`, `firstBreakAt: null`; `grandTotal.totalRefunded` = 1740 = 500 + 550 + 690. **Production database untouched throughout** — `db/custom.db` sha256 is still `4285a31015268917a008634828e39b5a2a31f581d538069404afb1603631d728` (the Batch 0.2 baseline) with its pre-session mtime, and no `-wal`/`-shm` files were created next to it.
**Commit:** `4766ceb` (code) + this plan-status commit.
**Notes:** (1) Claude cannot type authentication credentials, so the user entered the login PIN and the three manager-approval PINs by hand in the browser pane; everything else in the manual runs was driven by Claude. (2) The first approval attempt was refused with *Auto-approbation interdite* — that is `src/app/api/auth/approve/route.ts:120-125` working as designed (the caller was logged in as the manager whose PIN was entered); the runs used the SUPER_ADMIN PIN as approver instead. Not a defect. (3) The dialog pre-fills and accepts a dot (`40.20`) while the surrounding UI displays the French comma (`40,20 €`); the input accepts both, so this was left as-is rather than widened beyond C-01. (4) One out-of-scope observation recorded under *Newly Discovered Issues* (DOC-13). M-04 (`orderNumber` holding a cuid) was directly observed in the new fiscal-event payloads, confirming the audit; it stays assigned to Batch 3.5 and was not touched.

---

## Batch 1.2 — Z-close display unit correction

**Status:** `COMPLETED`

### C-02 — Z-close dialog divides cents by 100 twice

**Status:** `COMPLETED` · Severity: CRITICAL · Category: confirmed bug (money display)

**Problem.** `Money` → `formatEuro` already divides by 100. Three call sites divide first and pass euros in.

**Evidence.** `shifts-view.tsx:566` `expectedCashEuros = expectedCash / 100` → `:567` `variance` in euros → `:597` `<Money amount={openingFloat / 100} />`, `:601` `<Money amount={expectedCash / 100} />`, `:607` `formatEuro(variance)`. `:631` submits `Math.round(counted * 100)` — correct.

**Location.** `src/features/shifts/shifts-view.tsx:566-607`; `src/components/shared/money.tsx:17`; `src/lib/format.ts:15`

**Impact.** A 200,00 € opening float renders "2,00 €"; a 5,00 € shortage renders "0,05 €" and is styled by `varianceStyle` as negligible. The submitted value is correct, so the Z report is right — but the operator is shown three wrong numbers on the one screen whose purpose is catching missing cash. Till errors and theft become invisible.

**Remediation direction.** Pass cents to `Money`/`formatEuro` at all three sites; keep `variance` in cents and format once.

**Dependencies.** None. Independent of C-01 but the same class of defect — review both together for other survivors of the euros→cents migration (commit `720660a`).

### Batch 1.2 — Validation Required

- New targeted test asserting the displayed strings for a known float/expected/variance triple.
- Manual workflow: open a shift with a 200,00 € float in a scratch DB, take one sale, close — confirm the dialog shows 200,00 € and a correctly-signed variance.
- Manual workflow: deliberately miscount by 5,00 € and confirm the variance reads 5,00 €, not 0,05 €, and is styled as a real discrepancy.
- Cross-check: the generated `ZReport` row values are unchanged by this fix (display-only change).
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS.
- Grep sweep for other `/ 100` passed into `Money`/`formatEuro`, recorded in the status note (do **not** fix out-of-scope hits — record them under *Newly Discovered Issues*).

### Batch 1.2 — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-03
**Changes:** All three display sites in `CloseShiftForm` now pass CENTS, as the remediation direction required: `<Money amount={openingFloat} />` and `<Money amount={expectedCash} />` (the `/ 100` removed from both), and the variance is kept in cents and formatted once. Added `src/features/shifts/z-close.ts` holding the dialog's pure display maths — `cashVarianceCents(countedCents, expectedCashCents)` and `formatVariance(varianceCents)` (explicit `+` for a surplus, the formatter's own `-` for a shortage, no sign for an exact count) — so the arithmetic behind the three numbers is unit-testable without React test infrastructure, which this project does not have. `countedCents` is now computed once from the operator's euros input and used for **both** the variance display and the submitted `closingFloat`; the expression is the identical `Math.round(counted * 100)` that was previously inlined in the submit handler, so what the operator is shown and what the Z report records cannot drift apart. The `round2` import became unused and was dropped. The euros input itself (`countedStr`, pre-filled `(expectedCash / 100).toFixed(2)`) was **not** touched — it was never wrong, and changing input parsing was out of scope for a display fix.
**Files:** `src/features/shifts/shifts-view.tsx` (import, variance computation, 3 display sites, submit), `src/features/shifts/z-close.ts` (new), `src/features/shifts/z-close.test.ts` (new, 8 tests).
**Tests:** `bun test src` — **153/153 PASS** (145 + 8 new). `bun run typecheck` — PASS. `bun run lint` — PASS. The new tests pin the three displayed strings for the batch's own scenario (float 20000 → "200,00 €", expected 42070 → "420,70 €"), both variance signs ("-5,00 €" / "+5,00 €"), the signless zero, a one-cent discrepancy, the fr-FR thousands separator, and a **regression pin** asserting what the removed `/ 100` used to produce ("2,00 €"). Manual validation used a scratch copy of the production database (`bunx next dev -p 3010` with `DATABASE_URL` overridden; the server's identity proved before any write by a scratch-only marker on the pre-auth `GET /api/auth/profiles`). The plan's cross-check that the ZReport values are unchanged was done **empirically, not by assertion**: the identical scenario — 200,00 € opening float, one 8,90 € Margarita sold for cash, close counting 203,90 € — was run twice, once with the fix `git stash`ed (shift #4) and once with it applied (shift #5). *Pre-fix* the dialog showed **2,00 €** / **2,09 €** / **-0,05 €**; *post-fix* it shows **200,00 €** / **208,90 €** / **-5,00 € (Manquant)**. Comparing the two ZReport rows field by field: `salesTotal` 890, `salesCount` 1, `vatTotal` 81, `cashTotal` 890, `cardTotal` 0, `voucherTotal` 0, `discountsTotal` 0, `openingFloat` 20000, `expectedCash` 20890, `closingFloat` 20390, `cashVariance` -500, `vatBreakdownJson` and `topProductsJson` — **every field identical**, and the two `Shift` rows identical too. `/api/fiscal/verify` on the scratch instance: `ok: true`, 7 events, `firstBreakAt: null`. **Production database untouched** — sha256 still `4285a31015268917a008634828e39b5a2a31f581d538069404afb1603631d728` with its pre-session mtime.
**Commit:** `38d19a2` (code) + this plan-status commit.
**Notes:** (1) **Grep sweep** (required by this batch): the only `/ 100` values reaching `Money`/`formatEuro` anywhere in `src/` were the two fixed here. Every other `/ 100` hit is a cents→euros conversion feeding a **form input** (`discount-dialog.tsx:30`, `addons-view.tsx:95`, `categories-view.tsx:218-257`, `products-view.tsx:71-385`, and `shifts-view.tsx:556` itself), which is the correct euros-boundary pattern and converts back with `toCents()`/`Math.round(x*100)` on submit; `orders/route.ts:205` is percent-discount maths and `:256` builds an error string. One vestigial hit is recorded below as DOC-14. No out-of-scope fixes were made (safety rule 10). (2) **The audit's impact claim is right about the numbers but wrong about the styling**: `varianceStyle()` (`shifts-view.tsx:58-78`) branches on sign only and has no magnitude threshold, so a 5,00 € shortage displayed as "-0,05 €" was still coloured red and labelled *Manquant*. The defect is that the operator reads the wrong magnitude — and that the correct figure (`-5,00 €`) only appears in the post-close result dialog, i.e. **after** the immutable Z report has been written. Confirmed live in both runs. (3) The auto-backup that fires on shift close wrote to the real project's `db/backups/` even though the app was running against a scratch database — three backup pairs (~50 MB each) were created and removed after the runs. The backup location is Batch 2.2's subject (C-06); noted here only because it is a side effect any future scratch run will reproduce.

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

**Status:** `COMPLETED`

### C-05 — Restore never restores images and overwrites the live DB non-atomically

**Status:** `COMPLETED` · Severity: CRITICAL · Category: data integrity

**Problem.** Three defects in one function.
(a) `backup.imagesPath` — the encrypted uploads archive — is written on backup and deleted on delete, but never read on restore.
(b) The swap is `fs.copyFile` over the live file, not copy-to-temp-then-rename.
(c) Only Prisma is disconnected; the HTTP server keeps serving, so any request between `$disconnect()` and `$connect()` reconnects onto a half-written file.

**Evidence.** `grep imagesPath src/` → 4 hits in `backup.ts` (175, 181, 194 write; 330 delete). `restoreBackup` (216-311) contains none. `:255` `$disconnect()` → `:257` `fs.copyFile(plainPath, DB_PATH)` → `:263` `finally { $connect() }`. The file's own header comment at `:15` says the caller route must signal a restart; `backups/[id]/restore/route.ts` does not.

**Location.** `src/lib/services/backup.ts:216-311`; `src/app/api/backups/[id]/restore/route.ts`

**Impact.** Restoring onto a replacement machine yields a working database in which every product image is a broken link, unrecoverable from the backup that contains them. A power cut, disk-full or antivirus lock during `copyFile` leaves `custom.db` truncated and unopenable; the pre-restore safety snapshot exists on disk but its `Backup` row was to be written into the database that no longer opens, and **no CLI exists in the repo to decrypt it out-of-band**.

**What already works — do not regress it.** Checksum verification before the swap (`:232-236`) is correct, and AES-GCM `decipher.final()` authenticates independently.

**Remediation direction.** Untar `imagesPath` as part of restore; copy to a temp file on the same volume and `rename`; refuse to restore while requests are in flight (or restore offline via a CLI); ship a standalone decrypt tool for the safety snapshot.

**Dependencies.** Batch 0.1 must be complete — these route files are currently untracked. P-02 (key preserved) must be confirmed.

### C-22 (restore-tracing half) — Restore and backup deletion emit no fiscal event

**Status:** `COMPLETED` · Severity: HIGH · Category: fiscal traceability

*Cross-referenced here because the fix lives in the same function. The hash-chain-design half of C-22 is Batch 3.5.*

**Problem.** `POST /api/backups/[id]/restore` replaces the whole database — rewinding receipt numbers, Z reports and the journal — and appends no `FiscalEvent`. There is no event type for it. `DELETE /api/backups/[id]` destroys backups outright.

**Impact.** The attestation states there is no path to delete or modify tickets, payments and Z closes. A UI-reachable restore is exactly such a path, and it leaves no fiscal trace. Restoring an older backup also silently rewinds `FiscalCounter`, so receipt numbers already printed can be reissued.

**Remediation direction.** Append a fiscal event for restore and for backup deletion. Consider refusing or loudly warning on a restore that would rewind `FiscalCounter` below its current value.

**Dependencies.** Same batch as C-05.

### Batch 2.1 — Validation Required

- New integration test: `createBackup` → mutate DB and delete an uploads file → `restoreBackup` → assert both DB rows and the uploads file are restored. **This is the single most important missing test in the project (T-01).**
- New test: a restore whose `copyFile` fails leaves the original `custom.db` intact and openable.
- New test: checksum mismatch aborts before the swap (guard against regressing the one part that works).
- Manual: full restore rehearsal onto a clean machine — DB and images both come back, product images render in the POS.
- Manual: verify the out-of-band decrypt tool recovers a `pre-restore-*.dbenc`.
- Assert a `FiscalEvent` is written for restore and for backup deletion, and that `/api/fiscal/verify` still reports `ok` afterwards.
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS.
- **Fiscal/data-integrity verification:** compare row counts and the fiscal chain state before and after a rehearsal restore against the Batch 0.2 baseline.

### Batch 2.1 — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-03
**Changes:** **C-05(a) images.** `restoreUploadsArchive()` decrypts and extracts the uploads tarball that `createBackup` has always written and `restoreBackup` never read. Extraction **merges** rather than swapping the directory: a swap interrupted by a crash or an antivirus lock can lose images outright, and an orphaned image is harmless where a missing one is the failure this batch exists to prevent. **C-05(b) atomicity.** The decrypted database is staged as `custom.db.restore-staged` — *next to* the live file, so the final move is a same-volume `fs.rename`, which is atomic (and on Windows replaces the destination via `MoveFileEx MOVEFILE_REPLACE_EXISTING`). The previous `fs.copyFile` over the live file could leave `custom.db` truncated and unopenable. **C-05(c) requests in flight.** A maintenance gate in `withAuth`/`withAuthParams` — the single choke point every API route passes through — returns **503 + `Retry-After: 5`** while the swap is in progress, so no request can reconnect Prisma onto a half-written file. The gate is claimed with `beginRestore()` and released in a `finally`; two tests pin that a failed restore does not leave it stuck (a stuck gate would 503 the whole application until the process restarted). **Ordering is the substance of the fix**: decrypt → checksum-verify → decrypt the images → take the safety snapshot → *only then* touch anything irreversible. A bad key, a corrupt archive or an unreadable image tarball now costs nothing at all. **C-22 (restore half).** `RESTAURATION` and `SUPPRESSION_SAUVEGARDE` added to the event union, the schema comment and the API type. The restore event is appended to the **restored** chain — it cannot go in the database the restore is about to destroy — and records what it displaced: `replacedCounter`, `replacedChainTip`, the images restored, the safety filename and checksum, and `rewound`. A restore that **rewinds** the receipt / Z / event counters is detected by comparing the counters before and after, logged as a `WARN`, carried in the event payload and returned to the caller. Deletion is journalled **before** the files are unlinked, so a process death mid-delete cannot lose the trace; `deleteBackup` also now writes the `BACKUP_DELETED` audit entry itself (with filename, imagesPath and fiscal sequence), replacing the bare one the route used to write. **Supporting changes.** Backup paths are injectable (`BackupPaths`) — without this T-01 could not exist, because a test run from the project root would have restored over the real `db/custom.db`; production still uses the `process.cwd()` defaults, and *where* data should live remains DD-02 / Batch 2.2. The safety snapshot's `Backup` row now falls back to an unattributed row when `createdById` does not exist in the restored database — restoring a backup taken before your own account existed silently lost the one-click rollback, which the new tests caught. `scripts/decrypt-backup.ts` is the out-of-band recovery tool the audit asked for: read-only, refuses to write over `custom.db`, `--list` mode, and a French operator-facing failure for a wrong key.
**Files:** `src/lib/services/backup.ts`, `src/lib/services/maintenance.ts` (new), `src/lib/api-handler.ts`, `src/lib/fiscal.ts`, `src/types/api.ts`, `src/app/api/backups/[id]/route.ts`, `prisma/schema.prisma` (comment only), `scripts/decrypt-backup.ts` (new), `src/lib/services/backup-restore.test.ts` (new).
**Tests:** `bun test src` — **214/214 PASS** (199 + 15 new). `bun run typecheck` — PASS. `bun run lint` — PASS. **T-01 exists at last**, and asserts file outcomes rather than return values: rows deleted after a backup come back; an uploads file deleted after a backup comes back byte-identical; both come back in the same operation; files *added* after the backup are left alone. Safety: a checksum mismatch aborts before the swap with the live database still open and still holding its row (guards the one part that already worked); no staged file is left behind on abort; a missing archive file is refused; the maintenance gate is released on both the success and the failure path. Tracing: a `RESTAURATION` event is appended with the backup id, checksum and safety filename, and carries `replacedCounter` / `replacedChainTip` / `rewound`; `SUPPRESSION_SAUVEGARDE` is appended on delete and the uploads archive is removed with it; and `verifyFiscalChain()` still reports `ok` after a restore. **The decrypt tool was verified against a real encrypted backup** (`hibapos-backup-2026-08-28T01-21-34-082Z.dbenc`): it produced a valid SQLite file (0.56 MB, header verified) that opened read-only with 2 users, 15 orders, 15 payments and 15 receipts, and it refused when pointed at `db/custom.db`.
**Commit:** `723dd52` + this plan update.
**Notes:** (1) **Newly discovered and NOT fixed — L-15, a serious one.** Verifying the decrypt tool against the real 2026-08-28 backup showed it is missing **five tables the live schema has**: `AnnualClose`, `FiscalArchive`, `FiscalEvent`, `GrandTotal`, `MonthlyClose` (26 tables vs 31). Restoring it would leave the application running against a database with **no fiscal journal at all**. There is no schema-version check anywhere in the restore path. Recorded below; fixing it needs a decision (refuse / warn / migrate after restore) and is out of this batch's scope. (2) The remaining `[HW]`-style items for this batch — the full restore rehearsal onto a clean machine, and confirming product images render in the POS afterwards — are covered by the automated round trip at the file level but not on real hardware; they fall under the *Hardware-dependent validation* deferral. (3) The plan's final validation item (compare row counts and chain state against the Batch 0.2 baseline after a rehearsal restore) is deferred with the rehearsal; the production database was **not** used for any test in this batch.

---

## Batch 2.2 — Backup location, retention and failure visibility

**Status:** `COMPLETED`

### C-06 — Backups on the same disk, never pruned, failures swallowed

**Status:** `COMPLETED` · Severity: CRITICAL · Category: operational / data loss

**Problem.** `BACKUP_DIR = process.cwd()/db/backups` — same folder as `custom.db`, same disk, inside the same OneDrive-synced tree. Every Z close re-tars and re-encrypts the entire uploads folder. No retention logic exists. The automatic backup's failure path reaches only `console.error`.

**Evidence.** `db/backups/` currently holds ~124 MiB from 3 backups (`.uploads.enc` 41–47 MB each) plus 3 orphaned legacy `.json` files. `shifts/[id]/close/route.ts:34-38` catches and logs, then returns HTTP 200. `BACKUP_LOCATION` is documented in `.env.example:20-21` and read nowhere.

**Location.** `src/lib/services/backup.ts:28-30, 113-134, 165`; `src/app/api/shifts/[id]/close/route.ts:32-38`

**Impact.** ~17 GB/year on the POS's own disk until it fills and SQLite writes fail. A single disk failure, ransomware event or deleted folder takes the database and every backup. Because the Z close returns 200 regardless, a restaurant can believe it has been backing up nightly for months and has not.

**Remediation direction.** Implement `BACKUP_LOCATION` and point it at a second physical volume; add keep-N retention; stop re-archiving all uploads on every close (or archive incrementally); surface the backup result in the Z-close response so a failure is visible to the operator.

### M-03 — Fiscal archives are not included in backups

**Status:** `COMPLETED` · Severity: MEDIUM · Category: data integrity

**Problem.** Generated annual archives are written to `db/fiscal-archives/`; `createBackup` archives only `custom.db` and `public/uploads`.

**Location.** `src/app/api/fiscal/archive/route.ts:8`; `src/lib/services/backup.ts:140-207`

**Impact.** The archive an inspector would ask for is not protected by the backup mechanism.

**Remediation direction.** Include `db/fiscal-archives/` in the backup set.

### Cross-cutting in this batch — data directory location

**Status:** `COMPLETED` (DD-02 answered 2026-09-03: `C:\HibaPOS\data`; plumbing shipped, the physical move is a deployment step)

The app writes into its own installation directory in five places (`db/custom.db`, `db/backups/`, `db/fiscal-archives/`, `public/uploads/`, `.next/`), all `process.cwd()`-anchored except `DATABASE_URL`. The current install sits on a OneDrive-synced Desktop path, which actively locks SQLite files (the project's own `test-setup.ts:5` documents this failure mode). Under `C:\Program Files\` a non-elevated process cannot write at all and the POS could not take a single order.

See *Design Decisions Required → DD-02*.

### Batch 2.2 — Validation Required

- `BACKUP_LOCATION` honoured: backups land on the configured second volume; unset falls back to the current path.
- Retention: after N+1 backups, exactly N remain and the oldest files (both `.dbenc` and `.uploads.enc`) are removed together.
- A forced backup failure (unset key, unwritable target) makes the Z close report the failure to the operator; the Z report itself still succeeds and is still correct.
- Disk-growth check: measure the size of one Z-close backup after the change and record it.
- Archives included: generate an archive, take a backup, restore it, confirm the archive file returns.
- `bun test src` — PASS. `bun run typecheck` — PASS.
- Manual: confirm the app functions with the data directory in its decided location (DD-02).

### Batch 2.2 — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-03
**Changes:** **C-06.** `BACKUP_LOCATION` is finally read — it had been documented in `.env.example` since the project started and wired to nothing, so every backup sat next to `custom.db` on the same disk inside the same OneDrive-synced tree, where one disk failure, one ransomware event or one deleted folder takes the database and every copy of it together. Unset still falls back to the old location so an existing install keeps finding its backups. **Retention**: `pruneBackups()` keeps the newest N (default 30, `BACKUP_RETENTION_COUNT`), removing the `Backup` row and its files together so the list can never show a backup whose file is gone; a configured `0` is refused rather than honoured, because it would delete the backup just created. **Disk growth**: every Z close used to re-tar and re-encrypt ~49 MiB of product images that had not changed. The media archive is now content-addressed — `hibapos-media-<fingerprint>.enc`, the fingerprint being a hash of every file's path, size and mtime — and reused by reference when nothing moved. Since several backups then share one file, deletion **and** pruning are reference-counted; removing one backup must not strip the images from the others. **Failure visibility**: the automatic backup's failure reached only `console.error` while the close returned 200, so a restaurant could believe it had been backing up nightly for months and have nothing. The failure is now returned with the Z close, written to the technical log and the audit trail, and rendered as a red panel in the close dialog. The Z report itself still succeeds — it is a sealed fiscal document and a backup problem must not block a shift from closing. **M-03.** `db/fiscal-archives/` is in the backup set; the media archive carries uploads and archives together, rooted at their common base. Archives written before this batch used a different layout, so restore chooses the extraction root from the recorded filename rather than guessing. **DD-02.** `src/lib/paths.ts` is now the single source of truth for the five locations that were each `process.cwd()`-anchored independently — that independence is what made the working directory the de-facto decision about where a restaurant's data lives. `HIBAPOS_DATA_DIR` selects the root and **deliberately defaults to the old layout**: repointing a running install's database as a side effect of a code update would make it boot against an empty directory and behave like a fresh install. Uploads outside `public/` would no longer be served by Next — breaking every image in the catalogue — so `/uploads/[...path]` takes over at exactly the same URL, with a path-traversal guard and a media-type allowlist (without the guard, `/uploads/../../db/custom.db` would hand out the database over an unauthenticated URL). **L-15.** `assertCompatibleSchema()` runs after the checksum and before anything irreversible, comparing **tables and columns** between the staged backup and the live database; missing either refuses the restore, names what is missing, and points at `scripts/decrypt-backup.ts`. It compares structure rather than `_prisma_migrations` on purpose: a database created with `prisma db push` has no migration history, and refusing those would make restore unusable on any install bootstrapped that way. Extra tables (a newer backup) are allowed but logged.
**Files:** `src/lib/paths.ts` (new), `src/app/uploads/[...path]/route.ts` (new), `src/lib/services/backup.ts`, `src/lib/services/backup-retention.test.ts` (new), `src/lib/services/backup-restore.test.ts`, `src/app/api/shifts/[id]/close/route.ts`, `src/features/shifts/shifts-view.tsx`, `src/app/api/fiscal/archive/route.ts`, `src/app/api/fiscal/archive/[year]/route.ts`, `src/app/api/upload/route.ts`, `src/app/api/media/route.ts`, `.env.example`.
**Tests:** `bun test src` — **230/230 PASS** (214 + 16 new). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS, including the new `/uploads/[...path]` route. Coverage: retention configuration including the refusal of a limit that would delete everything; pruning keeps exactly N and removes the pruned backup's **file**, not just its row; the prune is journalled as one event rather than one per file; the media archive is reused when nothing changed (one file on disk for two backups) and rebuilt when an image is added; a shared media archive survives the deletion of one of its backups and goes with the last; fiscal archives are backed up and restored, together with uploads. For L-15: a backup predating a table is refused by name, a backup missing a column is refused, the live database and the maintenance gate are untouched by a refusal, and — the test that stops the guard becoming a wall — an ordinary same-version restore still succeeds.
**Commit:** `d09252d` (C-06, M-03) + `3a9bd1f` (DD-02, L-15) + this plan update.
**Notes:** (1) **The data directory has not physically moved.** The code supports `C:\HibaPOS\data` and defaults to the current layout; setting the variable, moving the files and repointing `DATABASE_URL` is a deployment step that belongs with Batch 1.4, where the launcher's *Start in* is decided. Until then the live database remains on the OneDrive-synced path, which is a known hazard rather than a fixed one. (2) The plan's disk-growth measurement is superseded by the reuse mechanism: a second Z close with unchanged images now writes only the database archive (~0.6 MB) instead of ~50 MB, and the media archive is written once per distinct media state. (3) The forced-backup-failure check was exercised through the code path and the UI, not on the till; a real forced failure on the POS falls under the hardware deferral. (4) `BACKUP_LOCATION` still needs a real second volume chosen at deployment — the code honours it, but nothing is protecting the data until an operator sets it.

---

## Batch 2.3 — SQLite WAL and transaction safety

**Status:** `COMPLETED` (code); WAL is **not yet active on the production database** — see the status record

### C-19 — The database is not in WAL mode

**Status:** `COMPLETED` (mechanism shipped; blocked on the DD-02 move for the live file) · Severity: HIGH · Category: database / performance

**Problem.** The live database runs in rollback-journal mode. Three documents say otherwise.

**Evidence.** `od -An -tu1 -j16 -N4 db/custom.db` → `16 0 1 1`. Byte 18 (write format) = 1 = rollback journal; WAL would be 2. No `-wal`/`-shm` sidecars. `db.ts:20-24` explains Prisma cannot issue the pragma. `docs/SQLITE_WAL.md:26-27` claims `start.sh` applies it — `start.sh` was deleted in commit `0aeea30` and `start.ps1` has no sqlite3 call. There is no `instrumentation.ts` or `middleware.ts`, so no startup hook of any kind.

**Location.** `db/custom.db` (header); `src/lib/db.ts:15-24`; `.zscripts/start.ps1`

**Impact.** Readers block writers; `_busy_timeout=5000` converts contention into a five-second stall. During the Z-close backup, `VACUUM INTO` holds a read lock across the whole database while a ~47 MB uploads tarball is encrypted in memory — the till hangs.

**Remediation direction.** Apply the pragma once (it persists in the file) and add it to the start script, as the documentation already claims. Add `sqlite3` to the documented prerequisites, or use a startup hook.

**⚠ Handling note.** Changing the journal mode of the production database is a write to that file. Do this only after Batch 0.2's snapshot exists, and verify the header byte before and after.

### C-15 (transaction-timeout half) — No `$transaction` sets a timeout

**Status:** `COMPLETED` · Severity: HIGH · Category: data integrity

*The shift-race half of C-15 is Batch 4.7. The timeout is here because it is inseparable from the WAL/locking question.*

**Problem.** No `$transaction` call anywhere passes a `timeout` option, so Prisma's 5 s default applies. The checkout transaction performs 8+ sequential writes on a non-WAL database.

**Location.** `src/app/api/orders/route.ts:280`; all other `$transaction` call sites

**Impact.** Exceeding the timeout fails the order **after** the customer has paid.

**Remediation direction.** Set an explicit, generous timeout on the checkout and Z-close transactions. Re-measure after WAL is enabled.

### Batch 2.3 — Validation Required

- Header check: byte 18 of `db/custom.db` equals 2 after the change; `-wal`/`-shm` sidecars appear.
- The pragma survives an app restart (it is persisted in the file — confirm, do not assume).
- `start.ps1` applies WAL idempotently on a fresh database, and the documented prerequisites match reality.
- Timed measurement of a checkout transaction and of a Z close with backup, before and after; recorded in the status note.
- Concurrency check: a read-heavy request (dashboard) during a checkout no longer stalls.
- `bun test src` — PASS. Existing sequence-concurrency tests still pass.
- **Fiscal/data-integrity verification:** `/api/fiscal/verify` reports `ok` and the same `lastSequence` as the Batch 0.2 baseline.

### Batch 2.3 — Status Record

**Status:** `COMPLETED` (code) — WAL is active for any install outside a synced folder; the **production database is deliberately still in rollback mode**, see note (1).
**Completed:** 2026-09-03
**Changes:** **C-19.** The batch turned on a wrong comment. `src/lib/db.ts` stated the pragma could not be issued through Prisma and therefore had to be applied with the `sqlite3` CLI — a prerequisite nobody installed, by a `start.sh` deleted in `0aeea30` — and that belief is why nothing ever applied it. Only half of it is true: `$executeRawUnsafe("PRAGMA journal_mode = WAL")` fails with *"Execute returned results"*, but `PRAGMA journal_mode` **answers with a row**, so it is a query and `$queryRawUnsafe` runs it. Verified against a copy of the production database before writing any code: header byte 18 went 1 → 2 and the mode persisted. Shipped: `src/instrumentation.ts`, the startup hook the audit noted was missing entirely (which is why no pragma could ever run), and `src/lib/db-pragmas.ts`, which applies WAL idempotently and **refuses on a cloud-synced path**. That refusal is deliberate: WAL keeps `-wal`/`-shm` beside the database permanently and they are not optional extras — a reader that sees a stale or restored `-wal` reads a database that never existed — so a sync client can corrupt data in a way rollback mode cannot, where the journal exists only for the duration of one write. The hook never blocks startup: a till that will not open is worse than a slow one. The false claim in `db.ts` was corrected in place. **C-15 (timeout half).** No `$transaction` anywhere passed a `timeout`, so every one ran on Prisma's 5 s default. `src/lib/tx-options.ts` gives the transactions that seal money an explicit budget — checkout 30 s, Z close 60 s, refund / shift open / monthly / annual / archive 20 s — applied at seven call sites. The checkout performs 8+ sequential writes and exceeding the default rolls the sale back **after the customer has paid**; a failed Z close leaves a shift that cannot be closed at all.
**Files:** `src/instrumentation.ts` (new), `src/lib/db-pragmas.ts` (new), `src/lib/db-pragmas.test.ts` (new), `src/lib/tx-options.ts` (new), `src/lib/db.ts`, `src/app/api/orders/route.ts`, `src/app/api/shifts/route.ts`, `src/lib/services/reports.ts`, `src/lib/services/refund.ts`, `src/lib/services/fiscal.ts`.
**Tests:** `bun test src` — **239/239 PASS** (230 + 9 new). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS. **Header check performed for real**: a scratch copy of the production database started at byte 18 = 1, the app was started against it, and it became 2 with `-wal` and `-shm` sidecars present; after shutdown and a brand-new connection `PRAGMA journal_mode` still answered `wal`, so persistence was confirmed rather than assumed. The idempotence, the header byte and the cloud-sync guard are all unit-tested. **Concurrency measurement** (the plan's timed check), one writer and one reader running together against identical copies of the production data: median write **6 ms → 3 ms**, worst write **37 ms → 19 ms**, worst read while writing **64 ms → 10 ms**, reads completed in 6 s 2 539 → 2 828. The worst-case read is the readers-block-writers symptom and it is six times better.
**Commit:** `e07a860` + this plan update.
**Notes:** (1) **WAL is NOT active on the production database, on purpose.** It sits on the OneDrive-synced path, so the guard refuses it — verified: byte 18 of `db/custom.db` is still 1 and the file is unchanged (`0e25f6f2…`). It will switch itself on at the first start after the data moves to `C:\HibaPOS\data` (DD-02), which is the deployment step in Batch 1.4. Until then the till keeps the stall behaviour C-19 describes. This is the honest state: the mechanism is done, the benefit is not yet delivered. (2) **A bug of my own, caught by running it rather than by a test.** The cloud-sync guard first matched a bare substring, which refused WAL on this session's scratch directory — `…/Temp/claude/C--Users-einer-OneDrive-Desktop-…`, where "OneDrive" is part of an encoded project name. Falsely refusing is not a safe failure: it silently leaves the database in the mode the batch exists to remove. Now matches whole path segments (and still catches business folders like *OneDrive - Contoso*), with a regression test naming this exact path. (3) **`start.ps1` was not changed.** The plan's validation item asked that it apply WAL idempotently on a fresh database and that the documented prerequisites match reality; putting the pragma in the application satisfies both more strongly — it runs on every start regardless of how the app was launched, and the `sqlite3` CLI prerequisite is now genuinely unnecessary rather than merely unmet. **DOC-01** (`README.md:10` "SQLite via Prisma ORM (WAL)") becomes true for any install outside a synced folder; Batch 7.1 should verify and leave it, and should note the cloud-sync caveat. `docs/SQLITE_WAL.md` and `.zscripts/README-windows.md` still describe the deleted script mechanism (DOC-02, DOC-03) and remain 7.1's work. (4) The plan's checkout/Z-close timing comparison was done as the concurrency measurement above rather than by driving real checkouts, which would have written fiscal records; a timed real checkout belongs with the hardware rehearsal.

---

## Batch 2.4 — Resource bounds and retention

**Status:** `COMPLETED`

| ID | Status | Problem | Location | Direction |
|---|---|---|---|---|
| **M-29** | `COMPLETED` | No retention for `AuditLog`, `TechnicalLog` or `FiscalEvent`. `TechnicalLog` writes into the same SQLite file as fiscal data, contending with checkout. Only expired sessions are pruned, opportunistically at login. | `src/lib/services/technical-logger.ts:13-15`; `src/app/api/auth/login/route.ts:43` | Retention policy for `TechnicalLog` and `AuditLog`. **`FiscalEvent` must never be pruned** — it is append-only by design; only bound the others. Consider moving technical logs out of the fiscal database. |
| **M-30** | `COMPLETED` | `GET /api/media` walks the uploads tree with synchronous `readdirSync`/`statSync` and runs `sharp().metadata()` on every file, unpaginated — blocking the event loop for the whole POS. | `src/app/api/media/route.ts:52-92` | Async walk, paginate, cache or drop the dimension probe. |
| **M-31** | `COMPLETED` | Unbounded `findMany` with full relation includes on operator-chosen date ranges (sales, VAT, cashiers, products, dashboard). `verifyFiscalChain` loads the entire journal into memory by design. | `src/app/api/reports/*/route.ts`; `src/lib/services/fiscal.ts:121` | Bound the report ranges or aggregate in SQL. For `verifyFiscalChain`, stream or chunk the walk. |
| **L-04**, **L-05** | `COMPLETED` | `output: "standalone"` is built but never used; the stale `.next/standalone/` tree carries a Linux-path `.env` **containing live secret values** and ~275 MB of orphaned Prisma engine `.tmp` files. | `next.config.ts:4`; `.next/standalone/` | Remove the stale tree, and either drop `output: "standalone"` or fix and actually use it. **Treat the stale `.env` as a leaked-secret event** — see DD-04. |

### Batch 2.4 — Validation Required

- Retention: after the policy is applied, `TechnicalLog`/`AuditLog` row counts stay bounded; `FiscalEvent` count is **unchanged**.
- `/api/fiscal/verify` reports `ok` with an unchanged `lastSequence` (proves no fiscal rows were pruned).
- `GET /api/media` response time measured before and after with the real uploads folder; event loop no longer blocks (concurrent request served during the call).
- A report over a 1-year range completes without exhausting memory; record peak RSS.
- Confirm `.next/standalone/` removal does not break `bun run build` or `bun run start`.
- `bun test src` — PASS. `bun run build` — PASS.

### Batch 2.4 — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-03
**Changes:** **L-04 / L-05 first, because it was the secret-handling item.** `.next/standalone/` held **297 MB** of unused runtime and a **byte-identical copy of `.env`** — `DATABASE_URL`, `SESSION_SECRET`, `BACKUP_ENCRYPTION_KEY` — in a second location nobody was thinking about. Removed, and `output: "standalone"` dropped from `next.config.ts`: it was produced on every build, consumed by nothing, and made `next start` — what the launcher actually runs — print *"next start does not work with output: standalone"*. Batch 1.4 may reinstate it deliberately, with the launcher pointed at `server.js` and the secret handling designed rather than inherited. **M-29.** `pruneLogs()` runs on the Z close (the natural once-a-day hook) and is non-fatal. `TechnicalLog`: 90 days by default, because it is operational noise written into the *same SQLite file as the fiscal data*, so an unbounded log table competes for the same write lock as a checkout. `AuditLog`: **kept forever unless an operator opts in** — those rows record who approved a discount, who refunded, who restored a backup, and how long that evidence must live is a business and legal question rather than a disk-space one. Expired sessions, previously cleared only opportunistically at login, are pruned too. **`FiscalEvent` is never touched.** **M-30.** `GET /api/media` walked the tree with `readdirSync`/`statSync` and ran `sharp().metadata()` on **every** file, sequentially and unpaginated. Now an async walk, probes in bounded parallel (8 at a time), and dimensions cached by `path|size|mtime` so a file is re-probed only when it actually changes. **M-31.** The report routes took `from`/`to` straight from the query string and ran `findMany` with full relation includes over whatever came back — *"2020 → today"* pulls every order, item and payment into memory on a till that also has to take the next customer's money. Ranges are bounded to **370 days** (a full twelve months still fits) and **refused with a message naming the limit**, rather than silently returning a truncated report that looks complete. `verifyFiscalChain()` loaded the entire append-only journal in one `findMany` — a memory ceiling that arrives silently — and now walks it in pages, carrying each page's last hash across the seam. The chain algorithm was extracted into `verifyEventsChunk()` so there is still exactly **one** implementation of the check, and it is the one the unit tests exercise.
**Files:** `next.config.ts`, `src/lib/services/log-retention.ts` (new), `src/lib/services/log-retention.test.ts` (new), `src/lib/report-range.ts` (new), `src/lib/fiscal.ts`, `src/lib/services/fiscal.ts`, `src/app/api/media/route.ts`, `src/app/api/reports/{sales,vat,cashiers,products}/route.ts`, `src/app/api/shifts/[id]/close/route.ts`, `.env.example`. Deleted: `.next/standalone/`.
**Tests:** `bun test src` — **253/253 PASS** (239 + 14 new). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS, and **no standalone tree is emitted**. Retention coverage: technical logs past the cutoff go and the rest stay; audit logs survive by default and are pruned only when opted in; a typo in the retention value is ignored rather than deleting; expired sessions are removed. The critical one — **`FiscalEvent` count is unchanged after a prune with both retentions set to 1 day, and `verifyFiscalChain()` still reports `ok`**. Paging coverage: the verdict is identical at page sizes 1, 2, 5, 7, 11, 12 and 13, and a tampered row is still found when it lands first in a page — which only works if the previous page's hash was carried across. Range coverage: default 7 days, a multi-year range refused with the limit named, a full twelve months allowed, inverted and unparseable dates rejected. **Media measured on the real 139-file uploads folder: 778 ms → 43 ms cold** (before the cache helps at all), worst event-loop lag 9 ms → 1 ms.
**Commit:** `f9fd5cc` + this plan update.
**Notes:** (1) **Exposure assessment for L-05.** The stale `.env` copy was identical to the live one, `.next/` is gitignored (`.gitignore:17`) and `git log --all -- .next` is empty, so the copy never left the machine through version control. **However**, the project root — and therefore the primary `.env` itself — sits in a OneDrive-synced folder, so the live secrets are very likely already in cloud storage. That is a pre-existing condition the standalone copy did not create and removing it does not fix; it is one more reason for the DD-02 move, and it is input to **DD-04 / Batch 7.3** (rotation), which remains where secret rotation is decided. No secret value was read, printed or transmitted at any point in this batch — only file hashes and key names. (2) **Audit-log retention is deliberately a no-op by default.** If a retention obligation later says otherwise, `AUDIT_LOG_RETENTION_DAYS` turns it on; the plan should not treat "bounded" as achieved for that table. (3) Two of the new tests were wrong on first run and the failures were informative rather than noise: backdating a `FiscalEvent.timestamp` broke the chain, because the timestamp is an input to the event hash — the tamper detection working exactly as designed — and a hardcoded `lastSequence` of 6 was wrong because `FiscalCounter` never rewinds, so sequences are global across a test file. Both were fixed in the test, not the code. (4) The plan's peak-RSS measurement for a one-year report was not taken: the range limit makes the unbounded case unreachable, so the figure would describe a state that can no longer occur. The paging and range tests cover the behaviour that replaced it.

---

# STAGE 3 — FISCAL CORRECTNESS

**Stage status:** `IN PROGRESS` — 3.1, 3.1b, 3.1c, 3.1d, 3.2, 3.2b, 3.3 and 3.4 are `COMPLETED`; 3.5 and 3.6 are `NOT STARTED`. The VAT-*rate* thread (C-12, L-16, L-17) and the reconciliation thread (C-10, C-11, M-13, M-14, L-23) are both closed — **every revenue figure in the application now comes from one aggregation**. What remains is archives, the operator interface, the audit trail and close ordering.

Audit section J, step 4: before the first Z report you would show an inspector. These are cheap now and expensive later, because sealed closes and generated archives cannot be corrected once written.

> **Rule for this entire stage:** no change to fiscal calculation, sealing or chaining may be marked `COMPLETED` without a targeted test that would fail on the old behaviour. Safety rule 4.

## Batch 3.1 — VAT rate keying

**Status:** `COMPLETED` (2026-09-03) — DD-03 was investigated before any code and closed as **not applicable**: the key `"6"` has never been written in this project's history, so there were no sealed rows to annotate, re-issue or explain. See the status record below.

### C-12 — The 5,5 % VAT rate is recorded and reported as 6 %

**Status:** `COMPLETED` · Severity: HIGH · Category: confirmed bug (fiscal)

**Problem.** The VAT breakdown map is keyed by `Math.round(vatRate)`; `Math.round(5.5) === 6`.

**Evidence.** `src/lib/money.ts:42` `const key = Math.round(vatRate);`. The split itself uses the true rate (`:44`), so amounts are correct — only the label is wrong. `money.test.ts` tests `splitVat` at 5.5 % but never asserts the breakdown key.

**Location.** `src/lib/money.ts:37-51` — consumed by `orders/route.ts:290`, `reports.ts:67`, `fiscal.ts:215`, `reports/vat/route.ts:42`

**Impact.** 5,5 % is a live French rate. Every VAT breakdown — Z report, sealed `MonthlyClose.vatBreakdownJson`, TVA report, annual archive — attributes those amounts to a "6 %" rate that does not exist. 2,1 % would collapse to "2". Co-existing 5,5 % and 6 % rates would silently merge.

**Remediation direction.** Key the breakdown by the exact rate (a fixed-precision string, e.g. `"5.5"`). Back-fill or annotate any already-sealed closes.

**Dependency note.** Do this **before** Batch 3.2, because 3.2 unifies the aggregation code that consumes this key. Doing them in the reverse order means writing the unified function twice.

**Data-migration question — RESOLVED, there was nothing to migrate.** The audit assumed already-sealed rows carried the wrong key. They do not, and never did. Read-only inspection of every database on the machine on 2026-09-03 found **zero** occurrences of a `"6"` key and zero products or order lines at any rate other than 10 %. Full evidence in the status record and in *Design Decisions Required → DD-03*.

### Batch 3.1 — Validation Required

- Targeted test: a product at 5,5 % produces a breakdown keyed `5.5`, not `6`.
- Targeted test: 5,5 % and 6 % products in the same order produce two separate breakdown entries.
- Targeted test: 20 %, 10 %, 2,1 % all key correctly.
- Regression: the *amounts* (`ht`, `vat`, `ttc`) are unchanged by the key fix — only the key changes.
- Consumers still parse: Z report render, VAT report, monthly close serialisation, archive payload.
- `bun test src` — PASS. `bun run typecheck` — PASS.
- **Fiscal verification:** confirm previously sealed rows are untouched and the chain still verifies.

### Batch 3.1 — Status Record

**Status:** `COMPLETED` · **Completed:** 2026-09-03

**Changes:** The breakdown key moved from `Math.round(vatRate)` to the exact rate, via a new exported **`vatRateKey()`**. It rounds to the nearest hundredth of a percent before rendering — so float noise (`5.500000000000001`) cannot split one rate across two keys — and emits **minimal form**: `"5.5"`, `"10"`, `"2.1"`, not `"10.0"`. Minimal form was chosen deliberately (DD-03 / A1): it is exactly what both existing `ZReport` rows already contain, so the fix gives no already-correct rate a second spelling. Two decimals rather than one because the Corsican and overseas rates include 0,90 %, 1,05 % and 1,75 % — one decimal would have merged 1,05 % into 1,1 %, repeating C-12 at a smaller scale. `VatBreakdown` widened from `Record<number, …>` to `Record<string, …>`; the single caller that declared the map inline (`orders/route.ts:290`) now imports the shared type. **No consumer required a change** — all four read the map through `Object.entries` / `Object.keys` + `Number(key)` — but each was verified rather than assumed.

**Files:** `src/lib/money.ts`, `src/lib/money.test.ts`, `src/app/api/orders/route.ts`

**Tests:** `bun test src` — **261/261 PASS** (baseline 253 + 8 new). `bun run typecheck` — PASS. `bun run lint` — PASS. The five behavioural tests were **proved to fail on the pre-fix code**, not assumed to: `vatRateKey(vatRate)` was temporarily reverted to `String(Math.round(vatRate))`, the suite re-run (5 fail, `"5.5"` → `"6"`), and the fix restored from a scratch copy. Stage 3's rule is satisfied by demonstration.

**Commit:** `2d7e996` + this plan update.

**Notes:**

**(1) DD-03's premise was false, and checking cost less than acting on it.** The plan carried the audit's assumption that sealed rows already held a `"6"` key. Read-only inspection of every database on the machine says otherwise: 78 products and 82 order lines **all at 10 %**; two `ZReport` rows (Z#1 2026-08-21, Z#2 2026-08-28) both keyed `"10"`; **zero** `MonthlyClose`, `AnnualClose` and `FiscalArchive` rows and no `db/fiscal-archives/` directory; `FiscalCounter.lastZReportNumber = 2`, and that counter never rewinds, so exactly two Z reports have ever existed here. `db/real-data-backup/real-data.db` contains no `"6"` key and no 5,5 % rate. The three legacy July JSON exports — from the demo dataset that *did* contain one 5,5 % product, `Eau Minérale 50cl` — hold three Z reports keyed only `"10"` and `"20"`: the 5,5 % product was never sold into a sealed breakdown. **The key `"6"` has never been written anywhere in this project's history.** Not inspected: the three `.dbenc` archives (encrypted; the key was not touched) — bounded by the fact that they are snapshots of *this* database taken after that product was gone.

**(2) The operator then removed the question entirely.** Told on 2026-09-03 that every order, payment, receipt, shift, Z report and fiscal event in the database is **test data the developer created**, and that only the catalogue is real. So the two `ZReport` rows are not fiscal records at all, and P-04 deletes them before the first genuine sale. DD-03 is closed as *not applicable* rather than answered.

**(3) Verified, not assumed, on the consumer side.** A mixed 2,1 / 5,5 / 10 / 20 breakdown was round-tripped through all four: `JSON.stringify` → row → `JSON.parse` (`z/route.ts:49`, `shifts/[id]/close/route.ts:86`) → UI sort and label (`report-widgets.tsx:52,73` renders `2.1 % | 5.5 % | 10.0 % | 20.0 %`, correct order) → VAT report rows (`reports/vat/route.ts:54`, no `NaN` rate). **`canonicalize()` output is insertion-order independent** (it sorts keys, `fiscal.ts:40`), confirmed by building the same breakdown in two different orders and comparing — so `computeCloseHash` stays stable now that non-integer keys exist. Both sealed `ZReport` rows were re-read and the new code emits **byte-identical** keys for them.

**(4) The production database was not written to.** Every inspection used `bun:sqlite` with `readonly: true`; `money.ts` imports nothing and `fiscal.ts` imports only `node:crypto`, so no verification script loaded Prisma or the WAL startup hook. After the batch: counters still `20/3/2/2`, both Z reports unchanged, the two `VENTE` event hashes unchanged (`9471bd79…`, `b794c6a1…`), `GrandTotal` still 5480/2/502/0, 20 receipts / 3 shifts / 21 payments, journal-mode byte 18 still `1` (rollback — WAL still waits on the DD-02 move). Size unchanged at 671 744 bytes and no `-wal`/`-shm` appeared. **The file's mtime did move** (19:03 → 20:28) with identical size and identical content in every field sampled — consistent with OneDrive touching a synced file, which is the condition DD-02 exists to remove. Hash for the next session to compare against: `3f925bf47e1e00ca8efea4137abccfb6f4c58efd13b3f1cf9a3f5290fab9185a`.

**(5) DOC-12 becomes accidentally true.** `IMPLEMENTATION_PLAN.md:162` claims `VatBreakdown` is `Record<string, …>` — wrong when written, correct now. **Batch 7.1 must not "fix" that line**; it should append a correction note saying it was wrong until Batch 3.1 made it right. Do not rewrite history.

**(6) Four issues recorded, none fixed** (safety rule 10): L-16, L-17, L-18, L-19. L-16 and L-17 are the substance of Batch 3.1c.

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

**Status:** `COMPLETED` (2026-09-03) · Approved by the operator 2026-09-03 · Addresses **L-18**

Runs **after 3.1 and before 3.1c**, so that any manual testing done while 3.1c is built is stamped as a simulation rather than journalled as genuine trading.

**Problem.** `settings.factice` is read on eight fiscal write paths — checkout (`orders/route.ts:390`), refund (`refund/route.ts:109`), reprint (`reprint/route.ts:52`), drawer (`drawer/route.ts:19`), Z close (`reports.ts:168`), month close, year close — and stamps the receipt (`receipt.ts:14`) and every `FiscalEvent`. `validation.ts:216` already accepts the field. **No screen sets it**, and there is no `factice` row in `Setting` at all, so it defaults to `false`. That is why 20 development orders were journalled as genuine sales.

**Scope.** A control in Réglages, the settings write, and a test that a sale made with `factice = true` produces a `FiscalEvent` carrying `factice: true` and a receipt bearing the stamp. Nothing else.

**Out of scope.** Changing any existing row's `factice` value — the existing test trading stays as it is and is deleted by P-04.

### Batch 3.1b — Validation Required

- Targeted test: with `factice = true`, a checkout writes `FiscalEvent.factice = true` and `renderReceipt()` emits the simulation stamp.
- Targeted test: the default is still `false` when the setting is absent — an install that has never seen the switch must not silently start marking real sales as tests.
- Manual: toggle in Réglages, confirm it persists and appears on a test ticket. Run against a **scratch copy** of the database, per the Batch 1.1 method.
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS.

### Batch 3.1b — Status Record

**Status:** `COMPLETED` · **Completed:** 2026-09-03

**Changes:** One control. The FACTICE backend was already complete and correct — `settingsSchema` accepts the field (`validation.ts:216`), `DEFAULT_SETTINGS` carries it, `saveSettings()` persists it, `renderReceipt()` stamps on it (`receipt.ts:14`) and all eight fiscal write paths read it. Nothing could set it, and no `factice` row existed in `Setting`, so it was permanently `false`. `settings-view.tsx` gains a **Mode formation (FACTICE)** card: a checkbox bound to `form.factice`, an explanation naming the exact mention printed on the ticket, an "à désactiver avant la première vente réelle" instruction, and an amber card border plus a banner while the mode is active — so an operator cannot leave it on at opening without seeing it.

**Files:** `src/features/admin/settings-view.tsx`, `src/lib/services/receipt.test.ts`, `src/lib/services/settings-factice.test.ts` (new)

**Tests:** `bun test src` — **271/271 PASS** (baseline 261 + 10 new). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — compiled successfully, production DB hash unchanged across the build.

**Commit:** `8a8a09a` + this plan update.

**Notes:**

**(1) These tests would NOT fail on the old code, and that is stated rather than glossed.** Stage 3's rule — a targeted test that fails on the old behaviour — does not apply here, because the defect was **reachability, not behaviour**: the backend was already right, merely untested and unreachable. The tests pin behaviour that was previously unprotected; the actual fix is verified manually below. Both directions are covered deliberately, because the OFF direction is what must hold on the restaurant's first real sale: default `false` when no row exists; round-trips and persists as a real row; can be turned back **off**; survives an unrelated settings save; the journal entry is marked when on and unmarked when off; the ticket is stamped when on and completely unmarked when off or absent; and **`factice` is not in the hashed payload**, so toggling the mode cannot change how an otherwise identical sale chains.

**(2) Manual validation, end to end, on a scratch copy** — the Batch 1.1 method. `db/custom.db` was copied to the scratchpad, a marker (`SCRATCH-3.1b-Administrateur`) written into the **copy only**, and `bunx next dev -p 3010` started with `DATABASE_URL` pointed at it. Which database the server had open was proved **before any write** by that marker coming back from the pre-auth `GET /api/auth/profiles`. The operator entered the SUPER_ADMIN PIN by hand (Claude cannot type credentials); everything after that was driven by Claude. Results: the card renders below Imprimante; toggling it turns the card amber and shows the banner; **saving persisted `Setting.factice = "true"`** and wrote a `SETTINGS_UPDATED` audit entry listing `factice`; after a full page reload the checkbox reads back **checked** with the banner shown. A **real checkout through `POST /api/orders`** then produced `FiscalEvent` seq 3, type `VENTE`, **`factice = 1`**, with `dataJson` containing no `factice` key, and a stored `Receipt` whose first two lines are `*** FACTICE — SIMULATION ***` / `TICKET NON VALABLE`. **Production database untouched throughout** — `db/custom.db` is still `3f925bf47e1e00ca8efea4137abccfb6f4c58efd13b3f1cf9a3f5290fab9185a` with its pre-run mtime.

**(3) Method note on the browser driving.** Synthetic pointer clicks did not land in the Browser pane (a coordinate-frame mismatch between the pane's scaled screenshot and the page viewport), so clicks were dispatched through the DOM with `element.click()`. That fires the same click event React's `onChange` handles, so the binding is genuinely exercised; it is recorded here because it is not a pixel-level test of the control's hit area.

**(4) The manual run earned its keep — it found two defects no unit test could reach.** **L-20**: `PUT /api/settings` returns **400 "Too big: expected number to be <=48"** for the settings as they are actually stored, because `receiptWidth` is still the legacy `80`. The settings screen therefore **cannot be saved at all** on the live install until the width selector is re-picked. **L-21**: a receipt rendered at 48 columns still contains a 56-character line — the restaurant's real address — because `renderReceipt()` centres but never wraps. Both recorded, neither fixed (safety rule 10).

**(5) Incidental confirmation of Batch 2.3.** The scratch database sat under `…/Temp/claude/C--Users-einer-OneDrive-Desktop-…` and acquired `-wal`/`-shm` files, i.e. WAL was applied. That is the whole-path-segment cloud-sync guard from Batch 2.3 working: the earlier substring version would have falsely refused WAL on this exact path.

---

## Batch 3.1d — Settings screen unblocked

**Status:** `COMPLETED` (2026-09-03) · Approved by the operator 2026-09-03 · Addresses **L-20**

**Ran before Batch 3.1c** despite the later letter: L-20 froze the settings screen, and 3.1c adds a VAT selector to that same surface.

**Problem.** Batch 1.3 (L-13) made `receiptWidth` a COLUMN count and tightened `settingsSchema` to `min(32).max(48)`. The live row still held the legacy millimetre value `80`, and `getSettings()` returned it raw — so the form loaded 80, PUT it straight back, and the server rejected the **entire payload** with `400 Too big: expected number to be <=48`. Every setting was frozen, not only the width.

**Scope.** Normalise `receiptWidth` on the settings read path, and make an explicit save persist the repair. Nothing else.

### Batch 3.1d — Validation Required

- Targeted test: a stored `80` reads as `48`; a stored `58` reads as `32`; an in-range value is untouched.
- Targeted test: **`settingsSchema.safeParse(await getSettings())` succeeds with a legacy row** — the operator's exact failure.
- Targeted test: an unrelated setting (DOC-15's `printerName`) can be changed while a legacy width row exists.
- Targeted test: a read does **not** rewrite the stored row.
- Targeted test: a save **does** persist the corrected width.
- Targeted test: `renderReceipt()` fed `getSettings()` output rules at 48 columns, not 80.
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS.

### Batch 3.1d — Status Record

**Status:** `COMPLETED` · **Completed:** 2026-09-03

**Changes:** **(1) Read path.** `getSettings()` now passes `receiptWidth` through the existing `normalizeReceiptColumns()`, whose own doc comment already described itself as "what the settings UI should offer" — it had simply never been wired into the settings read path, only into `printer.ts:134`. Normalising in the service rather than in the route repairs **both** readers at once: the settings form, and `renderReceipt()`, which uses the value directly as its column count (`receipt.ts:8`) and was therefore still emitting **80-column receipt text** for a 48-column printer. That is new receipts, not only the archived ones L-14 covers. **(2) Write path — found by this batch's own test.** `saveSettings()` compared each key against `getSettings()`. Once the read was repaired, the value equalled itself, so the row would never be corrected: `receiptWidth` would read as 48 forever while the database went on saying 80. It now compares against **what is actually stored**. A save is an explicit operator action and the right moment to persist the repair, so the legacy value corrects itself on the first save and nobody has to know to re-pick the width in the selector. Reads still never mutate settings (Batch 1.3's policy). A key with no row is written once and skipped thereafter, so the write amplification the original comment guarded against is one-time, not per-save.

**Files:** `src/lib/services/settings.ts`, `src/lib/services/settings.test.ts` (new)

**Tests:** `bun test src` — **279/279 PASS** (baseline 271 + 8 new). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — compiled successfully. **6 of the 8 new tests fail against the pre-fix code**, including the GET → PUT round-trip that reproduces the operator's exact failure; the 2 that pass describe behaviour that was already correct (in-range values untouched, reads do not mutate). Verified by temporarily reverting both halves and re-running.

**Commit:** `be9efa1` + this plan update.

**Notes:**

**(1) Verified against the real data, not only fixtures.** A copy of `db/custom.db` was taken and `getSettings()` run against it with `DATABASE_URL` pointed at the copy: stored row `80` → `getSettings()` `48` → `settingsSchema.safeParse` **accepted** → the DOC-15 `printerName` correction also **accepted**. Production database untouched (`3f925bf4…`).

**(2) Two OPEN THREADS operator items are now unblocked** — and one of them is obsolete. Correcting `printerName` to the Sunso WTP-801 (DOC-15) is now possible; it was not before. Saving `receiptWidth` as 48 **no longer needs doing by hand**: the value reads as 48 everywhere and the row corrects itself on the operator's next save of anything.

**(3) Found by manual validation, not by a test — which is the point.** L-20 was invisible to the entire unit suite because no test ever composed `getSettings()` with `settingsSchema`. The batch adds exactly that composition as a permanent regression test.

**(4) L-21 and L-22 were left alone** (safety rule 10). L-21 (receipts do not wrap a long address) touches `renderReceipt`, a fiscal-artifact renderer with a snapshot test, and deserves its own consideration rather than riding along here.

---

## Batch 3.1c — Category-level VAT rates

**Status:** `COMPLETED` (2026-09-03) · Design decided in **DD-17**, approved 2026-09-03 · Addresses **L-16**, **L-17**

**Depends on Batch 3.1** and must not run before it: setting any product to 5,5 % while the key bug is live would seal the first Z report under a "6 %" heading.

**Problem (L-17).** The only control that sets a product's VAT is a "Bouteille / Canette" switch (`products-view.tsx:498`) shown when the *immediate* category's name contains `"boisson"`. It does not walk to the parent, unlike every other category-inherited property — `pricing.ts:71` resolves `product.category?.parent ?? product.category` for options and add-ons. The real drinks live in `Canette` (13 products) and `Bouteilles` (4), both children of `Boissons`, so the switch never appears for them and there is no other VAT control in the form.

**Problem (L-16).** Consequently all 17 cans and bottles are stored at **10 %** where the operator states 5,5 % applies. At the fixed TTC prices this over-declares roughly **6 c per can** (1,50 €) and **14 c per bottle** (3,50 €) — money owed to the restaurant, not the state, on every drink sold from opening day.

**Design (DD-17).** Both open points were confirmed by the operator on 2026-09-03: the rate list is 20 / 10 / 5,5, and the 5,5 % is stored on `Canette` and `Bouteilles` rather than on their parent. Follow the pattern the codebase already uses for options and add-ons rather than inventing one:
- `Category.vatRate` — optional. Resolved **nearest-wins**: the product's own category, then its parent, then the default. Same walk as `pricing.ts:71`.
- `Product.inheritCategoryVat` — a per-product flag mirroring the existing `inheritCategoryGlobals`. Existing products default to **off**, keeping their stored rate, so the migration changes no behaviour on its own.
- The selector offers exactly **20 % / 10 % / 5,5 %** (operator-confirmed 2026-09-03), replacing the free `z.number().min(0).max(100)` on the product path. This makes a whole class of mistake unreachable, including re-creating a "6 %". **20 % is kept reachable although nothing uses it today** — an unselectable rate that is later needed is exactly the L-17 defect this batch removes. 2,1 % is excluded: it covers press and medicines and can never apply to a restaurant.
- Sub-categories may override a parent, so a *Boissons* child holding cup drinks at 10 % is expressible alongside `Canette` at 5,5 %.

**The data change — operator-authorised, not Claude's judgement.** Set **`Canette` and `Bouteilles`** to 5,5 % and switch their 17 products to inherit; leave `Boissons` on the 10 % default, per *VAT rate policy* above — the fiscal criterion is the sealed container, and those two category names are exactly that criterion. The other 61 products keep their explicit 10 %, which is correct for food and is the smallest possible change to real menu data. **Before touching anything:** a full backup, verified openable with `scripts/decrypt-backup.ts`, and the whole change rehearsed on a scratch copy first. Recorded as an operator decision of 2026-09-03; whether 5,5 % is the right classification is **V-14**, not a Claude determination (safety rule 13).

### Batch 3.1c — Validation Required

- Targeted test: a product with `inheritCategoryVat` resolves through `Canette` → `Boissons` and prices at 5,5 %.
- Targeted test: a sub-category rate overrides its parent's.
- Targeted test: a product with the flag **off** keeps its own rate even when the category's rate differs.
- **Targeted test: changing a category's rate does not alter any existing order.** `OrderItem.vatRate` is snapshotted at checkout (`orders/route.ts:194`) and every report reads that, not the product — this is the property that makes live inheritance safe and it must be pinned.
- Targeted test: the product API rejects a rate outside {20, 10, 5.5, 2.1}.
- End-to-end on a scratch copy: a drink checks out at 5,5 %, and the Z report shows a `"5.5"` breakdown row alongside `"10"` — the first real exercise of the Batch 3.1 fix.
- Manual: confirm the VAT control now appears for `Canette` and `Bouteilles`.
- Fiscal: the chain still verifies; no sealed row changed.
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS.

### Batch 3.1c — Status Record

**Status:** `COMPLETED` · **Completed:** 2026-09-03

**Changes:** **(1) Schema.** `Category.vatRate` (optional; NULL = "not set here") and `Product.inheritCategoryVat` (mirrors the existing `inheritCategoryGlobals`), defaulting to **false** so the migration changes no behaviour on its own. **(2) Resolution.** `resolveVatRate()` in `pricing.ts` — nearest wins: the product's own rate unless it opts in, then its own category, then the parent. Categories are at most two deep (`categories/route.ts` refuses a grandchild), so this is the same one-step walk `computeLinePricing` already did for options and add-ons at `pricing.ts:71`. When inheritance is on but no category in the chain sets a rate it falls back to the product's stored rate — deliberately the quietest failure, leaving a misconfigured category where it was rather than silently moving money. **(3) Checkout.** `orders/route.ts:194` resolves the effective rate and snapshots it onto `OrderItem.vatRate`, which is what every report reads. **(4) Rate list.** A fixed **20 / 10 / 5,5** with a French message, replacing `z.number().min(0).max(100)` on the product path — which accepted 37,3 %, and would have accepted the "6 %" C-12 used to invent. 20 % stays selectable although no alcohol is sold, because a needed rate that cannot be chosen is exactly the L-17 defect. The product default moves 20 → 10; only reachable by an API caller that omits the field. **(5) UI.** The name-matched "Bouteille / Canette" switch is deleted. The product form gets a TVA block (inherit toggle, resolved-rate readout, or a three-way rate picker), and the category form gets a rate selector. The DTO carries `effectiveVatRate` alongside the stored `vatRate` so the form can still edit an override. **(6) Data.** `scripts/set-drink-vat-rates.ts` — dry run by default, idempotent, and refuses to run unless it finds exactly `Canette` and `Bouteilles` *and* both sit under `Boissons`.

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260903203715_category_vat_rates/`, `src/lib/services/pricing.ts`, `src/lib/validation.ts`, `src/app/api/orders/route.ts`, `src/app/api/catalog/products/route.ts`, `src/app/api/catalog/products/[id]/route.ts`, `src/app/api/catalog/categories/route.ts`, `src/features/catalog/products-view.tsx`, `src/features/catalog/categories-view.tsx`, `src/features/catalog/pos-view.tsx`, `src/components/pos/product-options-dialog-v2.tsx`, `src/types/api.ts`, `scripts/set-drink-vat-rates.ts`, `src/lib/services/vat-inheritance.test.ts` (new)

**Tests:** `bun test src` — **291/291 PASS** (baseline 279 + 12 new). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — compiled successfully, re-run after the production migration.

**Commit:** `9feb4a0` (code) + `23e2971` (data script) + this plan update.

**Notes:**

**(1) The live result, read straight out of the production database.** Migration applied (`20260903203715_category_vat_rates` now third in `_prisma_migrations`). `Canette` = 5,5 % (13 products), `Bouteilles` = 5,5 % (4), **`Boissons` deliberately unset** so a cup or fountain drink added under it later inherits 10 %. **17/17 drinks resolve to 5,5 %**, all inheriting; **61/61 other products at 10 %**, none inheriting; **no product resolves outside {10, 5.5}**. `integrity_check ok`, 0 FK errors. New baseline hash: `711de2f1280e30cad04d0cb49ba5cd7d7084453078ed5390e34b708de84a2534` (the pre-batch `3f925bf4…` is superseded).

**(2) Nothing fiscal moved — verified on the real data, not only in a test.** After the change: `FiscalCounter` still `20/3/2/2`; both `ZReport` rows still keyed `"10"` with identical figures; both `FiscalEvent` hashes unchanged (`9471bd79…`, `b794c6a1…`); `GrandTotal` still 5480/2/502/0; and **all 82 `OrderItem` rows still carry `vatRate = 10`**. That last one is the point: the drinks' rate changed, and every sale already made kept the rate it was sold at. Counts identical throughout — 78 products, 14 categories, 20 orders, 82 lines, 20 receipts.

**(3) The migration was rehearsed before it was run.** Prisma rebuilds the whole `Product` table (its standard SQLite path for a new NOT NULL column) rather than issuing `ADD COLUMN`, which is more invasive than it sounds on a table holding the real menu and referenced by fiscal order lines. So it was generated against a copy, applied to a copy, and the data fingerprint diffed: all 78 products with identical ids, prices and rates, 82 order lines, 0 orphans, 0 FK errors — **identical**. Only then was it run for real.

**(4) End-to-end through the real report code, on a rehearsal copy.** A can and a portion of fries sold into one shift, then `computeShiftReport()`: `{"10":{"ht":318,"vat":32,"ttc":350},"5.5":{"ht":142,"vat":8,"ttc":150}}`. Two separate rows, keyed `"10"` and `"5.5"`, **no `"6"`** — the first real exercise of the Batch 3.1 fix, and the reason 3.1 had to land first. The 1,50 € can yields **8 c** of VAT where 10 % gave 14 c, which is the L-16 money going back to the restaurant.

**(5) Two commands were run by the operator, not by Claude.** `bunx prisma migrate deploy` and `bun run scripts/set-drink-vat-rates.ts --apply` were both refused by the permission classifier — correctly, as a schema migration and a write to real menu data. Claude prepared, rehearsed and verified; the operator executed. Same division as the PIN entry in Batches 1.1 and 3.1b.

**(6) Backup taken out-of-band, not through the app.** `db-snapshots/custom.db.pre-3.1c.2026-09-03T20-54-10Z`, outside the repo tree so `git clean` cannot reach it, byte-identical hash to the pre-change file, `integrity_check ok`, 0 FK errors. The batch's own validation asked for an encrypted backup verified with `scripts/decrypt-backup.ts`; a raw file snapshot was used instead **on purpose** — for rollback it is strictly better (no key, no decrypt step, a straight file copy back), it writes nothing to the production database, and exercising the encrypted backup path is Batch 8.2's job, not a side effect of a data change.

**(7) V-14 is the operator's determination, not Claude's.** The classification — 10 % standard, 5,5 % for sealed containers, no alcohol sold — came from the operator's own research on 2026-09-03 and is recorded under *VAT rate policy*. Claude applied it. Safety rule 13 stands: no fiscal claim rests on this work.

---

## Batch 3.2 — Unify revenue and VAT aggregation

**Status:** `COMPLETED` (2026-09-03)

The audit found the same period revenue computed **four different ways** across four modules. This batch collapses them into one.

### C-10 — Sealed monthly/annual closes do not reconcile with their Z reports

**Status:** `COMPLETED` · Severity: HIGH · Category: data integrity (fiscal)

**Problem.** `aggregatePeriod` skips fully-refunded orders from sales totals but then collects payments from **every** order including those, and never subtracts refunds from `cashTotal`/`cardTotal`/`voucherTotal`. `computeShiftReport` does both.

**Evidence.** `services/fiscal.ts:201` `continue` (sales only) → `:223` `orders.flatMap(o => o.payments)` (all orders) → `:224-226` sums with no refund netting. Compare `services/reports.ts:86-91, 104-106`.

**Location.** `src/lib/services/fiscal.ts:184-244` vs `src/lib/services/reports.ts:23-113`

**Impact.** As soon as any refund exists in a period, the sealed `MonthlyClose` cannot equal the sum of that period's `ZReport` rows — and being sealed, it cannot be corrected. An inspector reconciling the two chains finds a discrepancy the system cannot explain.

**Remediation direction.** Make `aggregatePeriod` use the same netting logic as `computeShiftReport`, or better, derive period closes by summing the sealed Z reports rather than re-aggregating raw orders.

### C-11 — VAT report produces fractional cents; sales report ignores partial refunds

**Status:** `COMPLETED` · Severity: HIGH · Category: confirmed bug (fiscal)

**Problem.** Both reports use `round2()` — a euros helper — on cent values, so a pro-rated line total keeps a half-cent. `reports/sales` filters to `status === "COMPLETED"` and never subtracts partial refunds.

**Evidence.** `money.ts:19` `round2(n) = Math.round((n+ε)*100)/100`. `reports/vat:41` `round2(1250 × 0.85)` → `1062.5` (half-cent survives) where `reports.ts:63` `Math.round(...)` → `1063`. `reports/sales:22,44` sums `o.total` for completed orders only.

**Location.** `src/app/api/reports/vat/route.ts:41`; `src/app/api/reports/sales/route.ts:22,36,44`; `src/lib/money.ts:19`

**Impact.** `/api/reports/vat` is what a manager reads to file the TVA declaration. It rounds differently from the Z report and from the sealed monthly close, so three official-looking figures for the same period disagree. The sales report overstates revenue whenever a partial refund exists.

**Remediation direction.** Delete `round2` from every cents path. Extract one shared period-aggregation function; have checkout, X/Z, closes and the reports all call it.

### M-13 — Per-line discount pro-rating rounds independently

**Status:** `COMPLETED` · Severity: MEDIUM · Category: data integrity (fiscal)

`Σ netLineTotal` need not equal `total − discount`, so the stored `vatTotal` can be off by cents against the order total. `src/app/api/orders/route.ts:286-292`. Direction: distribute the rounding remainder deterministically (largest-remainder) so the parts sum to the whole.

### M-14 — Shift summary is a fourth aggregation semantic

**Status:** `COMPLETED` · Severity: MEDIUM · Category: data integrity

The live shift panel counts only `status === "COMPLETED"` orders at face value, disagreeing with both the X and Z reports for the same shift. `src/app/api/shifts/summary/route.ts:26-59`. Direction: call the unified aggregation. *Note: this endpoint currently has no client caller (C-27) — fix it as part of unification, wire it in Batch 3.4 if the fiscal UI needs it.*

### Batch 3.2 — Validation Required

- **Reconciliation test (the point of this batch):** build a period containing a full refund and a partial refund; assert `MonthlyClose` totals equal the sum of the period's `ZReport` rows, field by field.
- Targeted test: partial-refund netting produces integer cents at every stage; no fractional value survives into any stored or returned figure.
- Targeted test: `/api/reports/vat` and the Z report agree exactly for the same period.
- Targeted test: `/api/reports/sales` nets partial refunds.
- Targeted test: `Σ netLineTotal === total − discount` for a multi-line order with an odd discount ratio (M-13).
- Regression: existing `reports.test.ts` Z-report cases still pass unchanged.
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS.
- **Fiscal verification:** re-run against the Batch 0.2 baseline data and record any figure that changes, with an explanation for each.

### Batch 3.2 — Status Record

**Status:** `COMPLETED` · **Completed:** 2026-09-03

**Changes:** A new pure module, `src/lib/services/aggregate.ts`, holds **the** period aggregation; all five callers delegate to it — `computeShiftReport` (X/Z), `aggregatePeriod` (monthly + annual closes), `/api/reports/vat`, `/api/reports/sales` and `/api/shifts/summary`. It takes orders the caller has already fetched and returns figures: no database, no dates, no HTTP, so whoever decides what "the period" means still gets everyone else's arithmetic. **C-10** — `aggregatePeriod` was a near-copy of `computeShiftReport` with one difference: it summed payments **gross** and never subtracted refunds, so a fully refunded order left its payment in `cashTotal` with nothing to cancel it. **C-11** — `/api/reports/vat` and `/api/reports/sales` ran cent values through `round2()`, a euros helper, so a pro-rated line kept a half-cent; the sales report additionally filtered to `COMPLETED` and summed `o.total` at face value, making a partial refund invisible. Both now use the shared aggregation in integer cents; `avgTicket` became an integer too. **M-13** — a new `apportion()` in `money.ts` distributes a total across lines by **largest remainder**, so the parts always sum to the whole; applied at checkout and in the aggregation, replacing per-line `Math.round`. Ties break toward the earlier line so the split is deterministic, which matters because these numbers reach sealed documents. **M-14** — the shift summary shared nothing with anything; it now calls the same function and also returns `expectedCash`.

**Files:** `src/lib/services/aggregate.ts` (new), `src/lib/services/aggregate.test.ts` (new), `src/lib/money.ts`, `src/lib/services/reports.ts`, `src/lib/services/fiscal.ts`, `src/app/api/reports/vat/route.ts`, `src/app/api/reports/sales/route.ts`, `src/app/api/shifts/summary/route.ts`, `src/app/api/orders/route.ts`

**Tests:** `bun test src` — **306/306 PASS** (baseline 291 + 15 new). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS.

**Commit:** `2631308` + this plan update.

**Notes:**

**(1) The reconciliation test is the batch, and it was proved to fail on the old behaviour.** It builds an April containing two shifts, each with a plain sale, a **partially** refunded sale and a **fully** refunded one; closes both shifts with real `generateZReport` calls; runs a real `closeMonth`; then asserts the sealed close equals the sum of its Z reports **field by field**, including the VAT breakdown rate by rate. Reintroducing C-10 (payments summed gross) makes it fail, along with four unit tests. Before this batch the two chains could not agree once any refund existed — in a document that by design cannot be corrected.

**(2) One semantic was unified deliberately, and it is a behaviour change.** An order is now excluded from sales when `status === "REFUNDED"` **or** `refunds >= total`. `computeShiftReport` checked both; `aggregatePeriod` checked only the second. Taking the stricter of the two means a period and its own shifts can never disagree about which orders count. On the live data the two conditions coincide, so nothing moved.

**(3) Fiscal verification: zero figures changed.** Both sealed `ZReport` rows were recomputed under the new code against a **copy** of the production database and compared field by field — `salesTotal`, `salesCount`, `vatTotal`, `cashTotal`, `cardTotal`, `voucherTotal`, `discountsTotal`, `expectedCash` and the serialised VAT breakdown were **all identical** (Z#1 4230/385, Z#2 32070/2927). That is the expected result rather than a lucky one: the live data contains **no refunds and no discounts** (verified directly — 0 rows in `Refund`, 0 orders with `discountTotal > 0`), which are precisely the inputs every defect in this batch needed. The invariants the apportionment relies on were also checked against the live data: `total = subtotal − discountTotal` and `Σ lineTotal = subtotal` hold for all 20 orders. Production database untouched (`711de2f1…`).

**(4) `round2` was NOT deleted from `money.ts`, on purpose.** C-11's direction says "delete `round2` from every cents path", and it is gone from the four this batch owns. The function itself stays because it is still correct at the euros display boundary it was written for, and because removing it would silently change four routes this batch does not cover — see L-23.

**(5) The audit's "four different ways" was an undercount.** Chasing `round2` out of this batch's routes turned up **three more** aggregation sites, recorded as **L-23** and not fixed (safety rule 1). Two of them carry the exact C-11 half-cent defect and one carries the C-10 shape. None feeds a sealed fiscal document, which is why the batch was not widened — but a manager comparing the dashboard or the cashier report to a Z report will still see different numbers.

---

## Batch 3.2b — The reports the audit did not count

**Status:** `COMPLETED` (2026-09-03) · Approved by the operator 2026-09-03 · Addresses **L-23**

Ran between 3.2 and 3.3. Batch 3.2 unified the five aggregations that feed fiscal documents; this one finishes the job for the four that do not.

**Problem.** `dashboard/route.ts` filtered to `COMPLETED` and summed `o.total` at face value (a partial refund was invisible), computed `round2(lineTotal × (1 − discountRatio))` per line (the C-11 half-cent), added the **raw** `lineTotal` to category revenue (discount and all), and compared week-over-week against gross figures. `reports/cashiers/route.ts` summed payments **gross** and never netted refunds — the C-10 shape. `reports/products/route.ts` ran a ratio product through `round2()` per line, each rounding independently. `customers/[id]/detail` used face-value totals and a fractional-cent average.

**Why it was not folded into 3.2.** None of these feeds a sealed fiscal document, so none could corrupt the chain — the inspector-facing problem was genuinely closed by 3.2. But a manager comparing the dashboard or the cashier report against a Z report for the same period still saw different numbers.

### Batch 3.2b — Status Record

**Status:** `COMPLETED` · **Completed:** 2026-09-03

**Changes:** `orderNet()` is now exported from `services/aggregate.ts` — the per-order primitive deciding whether an order counts, what the customer actually paid, and how that net splits across the lines; `aggregateOrders()` is rebuilt on top of it, so there is literally one implementation. Reports that must group by something the shared aggregate does not return — by cashier, by hour, by product id — group the orders themselves and use the primitive, rather than being forced through one output shape or inventing their own arithmetic. `reports/cashiers` groups by cashier and calls `aggregateOrders` per group; `reports/products` uses `orderNet` and groups by product id; the dashboard uses both; `customers/[id]/detail` uses `aggregateOrders`. `round2` now survives in these files only on two **percentage** figures, where 2-decimal rounding is correct because a percentage is not cents.

**Files:** `src/lib/services/aggregate.ts`, `src/app/api/dashboard/route.ts`, `src/app/api/reports/cashiers/route.ts`, `src/app/api/reports/products/route.ts`, `src/app/api/customers/[id]/detail/route.ts`, `src/lib/services/report-agreement.test.ts` (new)

**Tests:** `bun test src` — **311/311 PASS** (baseline 306 + 5 new). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS.

**Commit:** `54aa7ef` + this plan update.

**Notes:**

**(1) Each test contrasts the new arithmetic with the old**, rather than only asserting the new figure. On a fixture with one clean sale, one partially refunded sale and one fully refunded sale: the dashboard's old face-value sum gives **3500** where the netted figure is **3000**; the cashier report's old gross sum gives **900** of cash for a cashier whose only sale was refunded in full, where the correct figure is **0**. Both contrasts are asserted, so the defect is documented in the test rather than only in a commit message.

**(2) One invariant is now pinned across reports:** every cent of a period's sales is attributed to some product and no cent is invented — `Σ product revenue === salesTotal`. Independent per-line rounding could not promise that; the apportionment can.

**(3) No data touched.** Production database unchanged at `711de2f1…`.

---

## Batch 3.3 — Archive integrity and lifecycle

**Status:** `COMPLETED` (2026-09-03)

### C-04 — Archive checksum ignores every date and is not reproducible from the file

**Status:** `COMPLETED` · Severity: CRITICAL · Category: data integrity (fiscal)

**Problem.** `canonicalize()` has no `Date` branch. A `Date` falls into the generic object case, `Object.keys(date)` is `[]`, and it serialises to `{}`. The archive checksum is computed over `canonicalize(payload)` where the payload is Prisma rows full of `Date` fields.

**Evidence (executed against the exact function body).**
```
canonicalize({orderNumber:1, createdAt: 2026-01-01}) → {"createdAt":{},"orderNumber":1}
canonicalize({orderNumber:1, createdAt: 2019-05-05}) → {"createdAt":{},"orderNumber":1}
identical? TRUE  (timestamps 7 years apart)

a verifier reading the .json file computes:
  → {"createdAt":"2026-01-01T10:00:00.000Z","orderNumber":1}
matches the stored checksum? FALSE
```

**Location.** `src/lib/fiscal.ts:24-39`; `src/lib/services/fiscal.ts:423-439`

**Impact.** The archive's own French notice states the checksum makes any later alteration detectable. As implemented, every timestamp in the archive can be changed without altering the checksum, and an inspector recomputing the checksum from the delivered file gets a mismatch on an untampered archive. Both halves of the promise fail.

**Not affected — do not regress.** The `FiscalEvent` hash chain is unaffected: its payloads carry only numbers and strings, and the timestamp reaches `computeEventHash` as an ISO string.

**Remediation direction.** Give `canonicalize` an explicit `Date → toISOString()` branch, and compute the checksum over the exact bytes written to disk so a third party can reproduce it with `sha256sum`.

**⚠ Chain-compatibility warning.** `canonicalize` is also used by `appendFiscalEvent` (`services/fiscal.ts:49`) and by `closeMonth`/`closeYear`. Changing its output for any value type that already appears in stored `dataJson` would invalidate every existing hash. Verify that no stored payload contains a `Date`, an `undefined`, or a non-finite number before changing the function — otherwise version the canonicaliser instead of editing it in place.

### M-02 — Archive row is created before the file is written

**Status:** `COMPLETED` · Severity: MEDIUM · Category: confirmed bug (fiscal)

The `FiscalArchive` row is created inside the service transaction; the route writes the file afterwards. If the write fails, the row blocks regeneration with a 409 while the download route tells the operator to regenerate — an unrecoverable dead end. `src/lib/services/fiscal.ts:443-454`; `src/app/api/fiscal/archive/route.ts:28-29`; `src/app/api/fiscal/archive/[year]/route.ts:26-31`. Direction: write the file first, or make the row recoverable when its file is missing.

### Batch 3.3 — Validation Required

- Targeted test: `canonicalize` on a `Date` produces its ISO string, and two payloads differing only in a date produce **different** checksums.
- **Reproducibility test:** generate an archive, then recompute its checksum from the written file with an independent method; assert equality. This is the property the notice promises.
- **Chain-compatibility regression:** every existing `FiscalEvent`, `MonthlyClose` and `AnnualClose` still verifies after the change — `/api/fiscal/verify` reports `ok` with the baseline `lastSequence`. If it does not, the canonicaliser must be versioned rather than edited.
- Targeted test: a failed file write does not leave an unregenerable archive (M-02).
- Manual: open a generated archive and confirm it is readable and self-describing without HibaPOS.
- `bun test src` — PASS. `bun run typecheck` — PASS.
- **Requires external verification:** whether the resulting archive format satisfies the archiving requirement is not a code question — see V-02.

### Batch 3.3 — Status Record

**Status:** `COMPLETED` · **Completed:** 2026-09-03

**Changes:** **C-04, first half.** `canonicalize()` gains an explicit `Date` branch serialising to the ISO instant; an Invalid Date takes the same `"null"` as a non-finite number. Without it a `Date` fell through to the generic object case, `Object.keys(date)` is `[]`, and every timestamp became `{}`. **C-04, second half.** The archive checksum is now the SHA-256 of **the exact bytes written to disk**, and is deliberately **not** a field inside the file — a checksum placed inside the bytes it covers cannot be checked directly, which is precisely why the old one (hash of the canonical form, embedded in pretty-printed JSON) was unreproducible by anyone. A `.sha256` manifest ships beside the archive so `sha256sum -c` verifies it with no HibaPOS-specific knowledge. The notice was rewritten to describe what the checksum actually is, including why it sits outside the file. Format `version` bumped 1 to 2. **M-02.** `generateAnnualArchive` split into `buildAnnualArchive()` (reads only, writes nothing) and `recordAnnualArchive()` (row + journal entry), so the route writes the file **first** and records only what reached the disk — the ordering principle from Batch 2.1's restore. A row whose file is missing is no longer a dead end: the route rebuilds the payload and repairs the file **if it reproduces byte for byte**, otherwise refusing with both checksums named, because writing different content under a recorded checksum would be a lie.

**Files:** `src/lib/fiscal.ts`, `src/lib/services/fiscal.ts`, `src/app/api/fiscal/archive/route.ts`, `src/lib/services/archive.test.ts` (new)

**Tests:** `bun test src` — **324/324 PASS** (baseline 311 + 13 new). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS.

**Commit:** `a673a54` + this plan update.

**Notes:**

**(1) The chain-compatibility warning was answered with evidence, not assumption.** The plan required proving no stored payload contains a `Date`, an `undefined` or a non-finite number before editing `canonicalize` in place. Checked first: the only two payload fields that could carry a date — `backup.ts:734` and `:921` — already call `.toISOString()`; the two live `FiscalEvent` payloads contain nothing but strings, numbers and an array of `{amount, method}`; and there were **zero** `MonthlyClose`, `AnnualClose` and `FiscalArchive` rows. Checked again afterwards, against a copy of production: `verifyFiscalChain()` returns `{ok: true, eventsChecked: 2, firstBreakAt: null, lastSequence: 2}` — the Batch 0.2 baseline — both stored hashes recompute **identically**, and re-canonicalising both stored payloads reproduces their `dataJson` byte for byte. The canonicaliser did **not** need versioning.

**(2) Reproducibility was proved with the actual tool, not asserted.** An archive was built from a copy of the production database, written to disk with its manifest, and verified from a shell: `sha256sum hibapos-archive-2026.json` gave `d617fec2f617…`, exactly the recorded value, and `sha256sum -c hibapos-archive-2026.json.sha256` returned **`OK`**. This is the property the notice promises and the one that was entirely absent before.

**(3) A caller-visible wart found by the batch's own test.** `recordAnnualArchive` returned the row created *before* its `fiscalEventId` was set, so a caller reading it would have seen an unjournalled archive. It now returns the updated row. The test was asserting the right thing; the code was fixed rather than the test.

**(4) The manual criterion was met.** A generated archive opens as plain JSON with `format`, `version`, `year`, `generatedAt`, the French `notice`, and the `fiscalEvents` / `orders` / `zReports` / `monthlyCloses` / `annualClose` / `grandTotalSnapshot` sections; dates render as ISO strings; no HibaPOS code is needed to read or verify it.

**(5) Still `REQUIRES EXTERNAL VERIFICATION`.** Whether this format satisfies the archiving obligation is not a code question — **V-02** stands, and safety rule 13 applies. What this batch establishes is narrower and checkable: the checksum covers every byte including every date, and a third party can reproduce it.

---

## Batch 3.4 — Fiscal operator interface

**Status:** `COMPLETED` (2026-09-03)

### C-27 — The fiscal operator surface has no user interface

**Status:** `COMPLETED` · Severity: CRITICAL · Category: incomplete functionality

**Problem.** Nineteen of 59 API routes have zero client callers, and the group includes every `/api/fiscal/*` endpoint.

**Evidence.** Every `"/api/…"` literal reachable from `src/features`, `src/components`, `src/hooks`, `src/store` and `page.tsx` was enumerated — 27 distinct endpoints, none under `/api/fiscal/`. Routes with no caller:

| Route | What it does |
|---|---|
| `/api/fiscal/close-month` | clôture mensuelle |
| `/api/fiscal/close-year` | clôture annuelle |
| `/api/fiscal/closes` | list sealed closes |
| `/api/fiscal/archive` | generate annual archive |
| `/api/fiscal/archive/[year]` | download annual archive |
| `/api/fiscal/verify` | hash-chain verification |
| `/api/fiscal/events` | fiscal journal listing |
| `/api/fiscal/grand-total` | perpetual grand total |
| `/api/fiscal/drawer` | `OUVERTURE_TIROIR` event |
| `/api/orders/[id]/reprint` | `REIMPRESSION` event |
| `/api/reports/vat`, `/cashiers`, `/products` | reports |
| `/api/shifts/summary` | live shift panel |
| `/api/auth/unlock`, `/auth/switch-user` | session flows |
| `/api/catalog/products/favorites`, `/update-images`, `/api/tables/seed` | catalogue utilities |
| `/api/route.ts` | `{"message":"Hello, world!"}` scaffold stub |

Both print paths call `window.print()` directly (`orders-view.tsx:253`, `receipt-dialog.tsx:32`), never the reprint route.

**Location.** `src/components/shared/nav-config.ts` (no fiscal entry); `src/features/reports/reports-view.tsx:89-114` (three tabs: X, Z, Ventes)

**Impact.** The Conservation and Archivage mechanisms are implemented and tested but an operator cannot perform them — no screen seals a month, seals a year, generates an archive, downloads one for an inspector, or runs the chain verification the attestation names as its tamper-detection control. The grand total is never displayed. Because the reprint route is never called, **no `REIMPRESSION` event is ever written and `Receipt.reprintCount` never increments**; the same is true of drawer openings.

**Remediation direction.** Build the fiscal administration screen the backend is already waiting for. It is a small amount of UI over endpoints that exist, are gated and are tested — the cheapest large win in this plan.

**Scope note.** Wiring reprint and drawer through their routes may depend on DD-01 (printing strategy). If DD-01 defers hardware, still route reprints through `/api/orders/[id]/reprint` so the fiscal event is written, then call `window.print()`.

**Also in scope.** Decide what to do with `src/app/api/route.ts` (an unauthenticated "Hello, world!" scaffold stub) — remove it or make it a health check.

### Batch 3.4 — Validation Required

- Manual: a SUPER_ADMIN can seal a month, seal a year, generate an archive, download an archive, view the journal, view the grand total, and run chain verification — all from the UI.
- Manual: a MANAGER sees exactly what `nav-config` and the server gates allow; a CASHIER sees none of it.
- Reprint through the UI writes a `REIMPRESSION` event and increments `reprintCount`.
- Manual drawer-open through the UI writes an `OUVERTURE_TIROIR` event.
- API-level test: each newly wired endpoint returns the expected shape and enforces its role gate.
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS.
- **Fiscal verification:** after exercising the new UI, `/api/fiscal/verify` still reports `ok`.

### Batch 3.4 — Status Record

**Status:** `COMPLETED` · **Completed:** 2026-09-03

**Changes:** A new `src/features/fiscal/fiscal-view.tsx` plus a **Fiscal (JFP)** entry in `nav-config.ts` (MANAGER+, hidden from cashiers) and in the home grid. It covers: **chain verification** across all three chains, naming the break sequence if there is one; the **perpetual grand total**; **sealed closes** with their hashes and the actions to seal a month and a year; **annual archives** — generate and download; a **traced drawer opening** with an optional reason; and the **last 50 journal entries** with their FACTICE marking. The UI mirrors the server's own gates — closing a year and generating an archive are SUPER_ADMIN — so an operator is never offered a button that will 403. **Reprint** in `orders-view.tsx` now posts to `/api/orders/[id]/reprint` **before** printing, so the `REIMPRESSION` event is journalled and `Receipt.reprintCount` increments; the route is MANAGER+ by its own design, so a cashier is told to ask rather than being silently given an untraced copy. `src/app/api/route.ts` — the `{"message":"Hello, world!"}` scaffold stub — became a **liveness probe** rather than being deleted, because Batch 1.4's launcher needs to know the server is accepting requests before opening the kiosk window; it is deliberately unauthenticated and uninformative, touches no database and reports no version or environment detail.

**Files:** `src/features/fiscal/fiscal-view.tsx` (new), `src/components/shared/nav-config.ts`, `src/components/shared/home-dashboard.tsx`, `src/components/shared/app-shell.tsx`, `src/store/app-store.ts`, `src/features/orders/orders-view.tsx`, `src/app/api/route.ts`, `src/lib/services/fiscal-surface.test.ts` (new)

**Tests:** `bun test src` — **329/329 PASS** (baseline 324 + 5 new). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS.

**Commit:** `f8c9e9a` + `36ef20c` (home grid) + this plan update.

**Notes:**

**(1) Manual validation ran against the PRODUCTION BUILD on a scratch copy** — `bunx next start` rather than `next dev`, because leftover `next dev` processes from Batch 3.1b still hold `.next/dev/lock` (see *Immediate warnings*). Testing the built artifact is the stronger check anyway. `db/custom.db` was copied to the scratchpad, a marker written into the **copy only**, and which database the server had open was proved before any write by that marker returning from the pre-auth `GET /api/auth/profiles`. The operator entered the SUPER_ADMIN PIN; everything after was driven by Claude.

**(2) Everything the batch claims was exercised from the UI, and the journal proves it.** Sealing 2026-08 → `Clôture mensuelle scellée`; sealing 2025 → `Clôture annuelle scellée`; generating the 2026 archive → `Archive 2026 générée — 3e3fd349470d…`; the drawer → `Ouverture de tiroir enregistrée`; a reprint → `201`, `reprintCount` **0 → 1**. Afterwards the journal read: `1:VENTE 2:VENTE 3:CLOTURE_M 4:CLOTURE_A 5:ARCHIVE_GENEREE 6:OUVERTURE_TIROIR 7:REIMPRESSION`. **Five of those seven event types had never been written by this application before this batch** — the mechanisms existed and nothing could reach them. `/api/fiscal/verify` afterwards: all three chains `ok`, `firstBreakAt: null`, 7 events. Download returned 200 with the right `Content-Disposition`, `version: 2`, and no checksum field inside — and `sha256sum -c` on the file **the UI produced** returned **OK**, which re-proves Batch 3.3's property through the real path.

**(3) The reprint reported `printed: false` — correctly.** `printerEnabled` is `false` on this install, so the route answered *"Impression désactivée dans les réglages."* The fiscal event is written regardless, which is the right order: the trace does not depend on the hardware. The UI surfaces that message as a warning rather than swallowing it.

**(4) A defect found by the manual run, fixed in `36ef20c`.** The nav entry alone was not enough: `home-dashboard.tsx` keeps its **own** module list, so the module was reachable from the sidebar but invisible on the screen operators start on — the same class of defect as C-27 itself. Its role filter reads `NAV_ITEMS`, so the gate needed no duplication.

**(5) A test artifact was written into the real data directory, and removed.** The server ran with `DATABASE_URL` overridden but **not** `HIBAPOS_DATA_DIR`, so the generated archive landed in the project's `db/fiscal-archives/` — a directory that did not exist before — while its `FiscalArchive` row went to the scratch database. That orphan would have confused a later real generation, so `db/fiscal-archives/` was deleted afterwards; it is gitignored (`.gitignore:58`) and nothing was committed. **Any future scratch run must override `HIBAPOS_DATA_DIR` as well as `DATABASE_URL`.**

**(6) One manual criterion is NOT met and is deferred, not waived.** *"A MANAGER sees exactly what nav-config and the server gates allow; a CASHIER sees none of it"* was verified on the **UI** side by test (the fiscal entry excludes `CASHIER`, and the cashier's module list is asserted unchanged), but not walked through by logging in as each role — that needs two more PINs, and role-gate parity across every route is Batch **4.4**'s own subject. The multi-role walkthrough belongs with the full-day rehearsal in **V-07 / Batch 8.2**.

**(7) The drawer control lives in the fiscal screen, not the POS.** `/api/fiscal/drawer` is MANAGER+, so mid-service use already required a manager; putting it on the admin surface is consistent with that gate. If the operator wants a manager-gated drawer button inside the POS for making change, that is a UX follow-up, not a fiscal one.

---

## Batch 3.5 — Fiscal audit-trail completeness

**Status:** `COMPLETED` (2026-09-04) — C-22 carried forward as the batch allows

### C-13 — The manager who approved a discount is verified and then discarded

**Status:** `COMPLETED` · Severity: HIGH · Category: audit trail

**Problem.** `discountApproverId` is assigned from the verified approval token and never read again. `Order` has no approver column; the audit entry and the `VENTE` fiscal event both omit it.

**Evidence.** `orders/route.ts:216` declares, `:231` and `:247` assign, nothing reads. The `ORDER_CREATED` audit payload (`:417`) records `{number, total, items, payments}`. Contrast `refund.ts:82`, which correctly persists `approvedById`.

**Location.** `src/app/api/orders/route.ts:212-248, 411-419`

**Impact.** Above-threshold discounts are the most audited operation in a restaurant. The system enforces the approval correctly and keeps no record of who gave it — a manager cannot be shown which discounts they authorised and a dispute cannot be resolved from the data.

**Remediation direction.** Add an approver column to `Order` (or at minimum include the ID in the audit and `VENTE` payloads).

**⚠ Schema note.** Adding a column requires a migration. Coordinate with Batch 1.4's update procedure and confirm `migrate deploy` runs on the production machine.

**Resolved.** `Order.discountApprovedById` (nullable, **no FK** — the same choice as `Refund.approvedById`, so a soft-deleted approver cannot take a fiscal record with them), written at `orders/route.ts:321` from the `discountApproverId` the route already had. The id also travels into the `VENTE` payload and the `ORDER_CREATED` audit entry, both now built by `services/sale-journal.ts` so a test runs the same code the route runs. The audit entry carries `discountTotal` alongside the approver: an audit row naming an approver but not the amount cannot answer the question C-13 says cannot be asked. Migration `20260903230305_order_discount_approver` — a plain `ADD COLUMN`, **unapplied on production**.

### C-22 (chain-design half) — The hash chain is unkeyed

**Status:** `REQUIRES EXTERNAL VERIFICATION` — **carried forward out of Batch 3.5 untouched** · Severity: HIGH · Category: fiscal / requires external input

**Problem.** Event hashes are plain SHA-256 over public inputs — no HMAC key, no signature, no external timestamp. Anyone who can write to `db/custom.db` can alter a row and recompute the rest of the chain; `/api/fiscal/verify` then reports `ok`.

**Evidence.** `fiscal.ts:43-53` — `createHash("sha256").update(\`${previousHash}|${sequence}|${type}|${timestamp}|${dataJson}\`)`. No secret involved.

**Impact.** The chain detects accidental or naive tampering. It does not detect a deliberate edit by anyone with access to the Windows machine — which, given the app writes its own database inside a user Desktop folder, is anyone who can log into the till.

**Remediation direction.** Whether an unkeyed chain is sufficient is a certification question, not a code question. Options include keying the chain with a secret the operator cannot read, or anchoring periodic digests externally. **Do not implement either without the answer to V-01.**

*The restore/deletion-tracing half of C-22 is Batch 2.1.*

### M-04 — Refund fiscal events record a cuid in a field named `orderNumber`

**Status:** `COMPLETED` · Severity: MEDIUM · Category: fiscal traceability

`services/refund.ts:131` passes `order.id` as `orderNumber`, so the journal payload cannot be tied to a printed ticket number without a join. Direction: pass the real `order.number`. **Warning:** changing an event payload changes its hash — this affects only *new* events; existing rows must not be touched.

**Resolved.** `refund.ts:142` passes `order.number`. `number` was added to `OrderForRefund` as a **required** field rather than an optional one, so the defect cannot quietly return through a caller that omits it; the route's structural cast was widened to match. A sweep of every `orderNumber:` assignment in `src/` found only one other — `orders/[id]/reprint/route.ts:44,55` — and it was already correct. Existing rows keep the cuid they were sealed with.

### Batch 3.5 — Validation Required

- Targeted test: an above-threshold discount approved by a manager persists the approver, and the value survives into the audit log and the `VENTE` payload.
- Targeted test: a new `REMBOURSEMENT` event carries the ticket number, not the cuid.
- **Chain regression:** existing events still verify unchanged; `/api/fiscal/verify` reports `ok` with the baseline `lastSequence` plus only the events created during testing.
- Migration applied cleanly on a copy of the production database; row count and chain state unchanged.
- `bun test src` — PASS. `bun run typecheck` — PASS.
- C-22 remains `REQUIRES EXTERNAL VERIFICATION` regardless of the rest of the batch — the batch may complete without it, with that item explicitly carried forward.

### Batch 3.5 — Status Record

**Status:** `COMPLETED` · **Completed:** 2026-09-04

**Changes:** **(1) Schema.** `Order.discountApprovedById`, nullable, **no foreign key** — deliberately the same convention as `Refund.approvedById`. An FK would make a fiscal record refuse to let its approver's account be deleted, and would silently blank the approver on a `SetNull`; a plain id keeps the sale intact either way, which a test proves by hard-deleting the approver. **(2) Persistence.** The route already held a verified `discountApproverId` and threw it away; `orders/route.ts:321` now writes it. **(3) Payloads.** `services/sale-journal.ts` (new) builds the `VENTE` data and the `ORDER_CREATED` audit details, and the route calls it at `:420` and `:438`. Extraction was the point: these two payloads sit inside an HTTP-bound handler that no test can reach, so a test would otherwise have asserted against a copy of the code instead of the code. The audit entry gained `discountTotal` as well as the approver — C-13's stated impact is that a manager cannot be shown *which discounts* they authorised, and an `AuditLog` query returning rows that do not say what was approved does not answer it. The key is present-and-null on a sale with no approver rather than omitted, because absent is what every pre-3.5 event says and those rows are sealed. **(4) M-04.** `refund.ts:142` passes `order.number`; `number` joined `OrderForRefund` as **required**, not optional, so no future caller can quietly reintroduce the cuid.

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260903230305_order_discount_approver/`, `src/lib/services/sale-journal.ts` (new), `src/lib/services/sale-journal.test.ts` (new), `src/app/api/orders/route.ts`, `src/lib/services/refund.ts`, `src/app/api/orders/[id]/refund/route.ts`, `src/lib/services/refund.test.ts`

**Tests:** `bun test src --timeout 30000` — **340/340 PASS** (baseline 329 + 11 new). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — compiled successfully. Both fixes were **proved to fail on the pre-fix code**, not assumed to: reverting `order.number` → `order.id` failed the two M-04 tests; reverting the two payload builders to their pre-batch shape failed six of the nine C-13 tests, and the three that still passed are the three that assert what *did not* change (the untouched audit fields, chain verifiability, and the no-FK behaviour, which lives in the column rather than the payload). Both files were restored from copies taken before the revert.

**Commit:** `83c3cfa` (code + migration + tests) + this plan update.

**Notes:**

**(1) The migration is written, rehearsed and NOT applied.** `20260903230305_order_discount_approver` is one line — `ALTER TABLE "Order" ADD COLUMN "discountApprovedById" TEXT;`. Prisma chose a plain `ADD COLUMN`, not the whole-table rebuild it used for `Product` in Batch 3.1c, because the column is nullable with no default: much less invasive on a table holding fiscal order rows. Rehearsed on a copy of production and fingerprint-diffed before and after: **every key identical except the new column and the `_prisma_migrations` row** — 20 orders, 82 lines, 21 payments, 20 receipts, 3 shifts, 2 Z reports, 2 fiscal events, 78 products, 14 categories, 460 audit rows, `FiscalCounter` 20/3/2/2, `GrandTotal` 5480/2/502/0, both Z breakdowns still keyed `"10"`, `integrity_check ok`, 0 FK errors, pre-existing column order preserved. **The operator must run `bunx prisma migrate deploy` before this code runs on the live install** — without the column, every checkout fails. Recorded in *OPEN THREADS → A and B*.

**(2) Verified end-to-end on a migrated copy of the real database, not only in unit tests.** A rehearsal drove the actual service code against a copy carrying the real catalogue and the real journal: chain before `ok / lastSequence 2`; a 25 % manager-approved discount on a 100,00 € sale; a 10,00 € partial refund through `processRefund`. Results: `Order.discountApprovedById` = the manager's id; audit details `{"number":21,"total":7500,"items":2,"payments":1,"discountTotal":2500,"discountApprovedById":"cms5rne7l…"}`; `VENTE` payload carrying the approver and ticket 21; `REMBOURSEMENT` payload carrying `"orderNumber":21` where it would have carried a cuid. Chain after: `ok`, `lastSequence 4` — the baseline 2 plus exactly the 2 events the rehearsal created.

**(3) The sealed rows were checked, not assumed.** Both pre-existing events came through byte-identical: hashes `9471bd79…` and `b794c6a1…` unchanged, `dataJson` unchanged, and both still **omit** `discountApprovedById` — asserted explicitly, because "the old rows must not be rewritten to match" is the kind of claim that is easy to state and easy to violate. The journal now holds two payload vintages and the chain verifies across the boundary; that is a property of chaining on the predecessor's hash rather than on a payload schema, and Batch 3.6 inherits it.

**(4) The production database was not written to.** sha256 `711de2f1280e30cad04d0cb49ba5cd7d7084453078ed5390e34b708de84a2534` before and after — the same value session 3 recorded. Every write went to a copy under the session scratch directory, with **both** `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden (the Batch 3.4 lesson: overriding only the first put a real fiscal archive in `db/fiscal-archives/`). Re-checked afterwards: no `db/fiscal-archives/` directory exists, `db/backups/` is unchanged, and the rehearsal's data directory is empty. A fresh out-of-band snapshot was taken first: `db-snapshots/custom.db.pre-3.5.2026-09-03T23-01-34Z`, outside the repo tree, byte-identical to the live file.

**(5) What is proved and what is only pinned.** The two payloads and the refund path are proved by execution — the tests call the same functions the routes call. The checkout transaction around them is **not**: it is still inline in an HTTP handler, so `sale-journal.test.ts` reproduces its writes and pins the composition by comment (`orders/route.ts:321`, `:420`, `:438`), the same technique Batch 3.1b used. Extracting that transaction was considered and rejected as out of scope — it is **T-02, T-05 and T-06 in Batch 6.1**, and moving ~140 lines of the most critical path in the app on a batch that asked for three small items would trade a real risk for a testing convenience. The rehearsal in note (2) covers the gap for this batch by exercising the whole path against real data once.

**(6) C-22 is carried forward untouched**, as the batch's own validation section allows. Keying the chain or anchoring digests externally is a certification question (V-01), and implementing either without that answer would bake a guess into the one mechanism that is supposed to be unarguable.

**(7) The value is stored and journalled but not yet displayed anywhere.** No screen shows who approved a discount, and no report groups by approver. C-13's remediation direction asked for the record, and the record now exists — but the manager-facing view that would make it useful is a UI question for a later batch, not something this one invented a scope for. Flagged rather than built.

**(8) One environment finding, recorded not fixed** (safety rule 10): **L-24** — `bun test src` fails 23 tests on this machine purely on the 5 s default timeout. Established on the untouched pre-batch commit, before any change was made.

---

## Batch 3.6 — Close chain ordering and fiscal document content

**Status:** `NOT STARTED`

| ID | Status | Problem | Location | Direction |
|---|---|---|---|---|
| **M-01** | `NOT STARTED` | Monthly/annual close chains link by lexicographic *period*, not insertion order. Closing 2026-03 then 2026-01 links January to March's hash; `verifyCloses` sorts by period ascending and reports a permanent break. | `services/fiscal.ts:265-269, 324-328` vs `fiscal.ts:114` | Chain by insertion order (or refuse out-of-order closes). Decide which — see DD-05. |
| **M-06** | `NOT STARTED` | Receipts print a single "dont TVA" line with no per-rate breakdown, and never print `restaurantTva` despite the setting existing. | `services/receipt.ts:51-56`; `validation.ts:197` | Add the per-rate breakdown and the TVA number. **Content requirements are a fiscal question — see V-03.** |
| **M-07** | `NOT STARTED` | `ZReport` has no refunds total, so the daily close does not itemise the period's corrections. | `prisma/schema.prisma:425-444` | Add refund count and total to the Z report. Requires a migration. |

### Batch 3.6 — Validation Required

- Targeted test: closing months out of order produces a chain that still verifies (M-01).
- Targeted test: `verifyCloses` correctly detects a genuine tamper after the ordering change.
- Snapshot test update for the receipt renderer, showing the per-rate VAT block (M-06).
- Targeted test: `ZReport` refund totals match the period's refunds (M-07).
- Migration applied cleanly on a copy of the production database.
- Existing sealed rows unchanged; `/api/fiscal/verify` reports `ok`.
- `bun test src` — PASS. `bun run typecheck` — PASS.
- **Requires external verification** before the receipt content is considered correct — V-03.

### Batch 3.6 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

# STAGE 4 — SECURITY & INTEGRITY

**Stage status:** `NOT STARTED`

Audit section J, step 5: close the one real privilege-escalation path, stop blocking the event loop, rotate the default credentials, and stop the silent data-loss paths.

## Batch 4.1 — Manager-approval brute force

**Status:** `NOT STARTED`

### C-08 — Manager-approval PIN can be brute-forced

**Status:** `NOT STARTED` · Severity: HIGH · Category: security (privilege escalation)

**Problem.** `POST /api/auth/approve` tests the submitted PIN against every active MANAGER/SUPER_ADMIN. On failure it **does not increment `failedAttempts` and never locks the account** — unlike `login`, `unlock` and `switch-user`. The only wall is `rateLimit(\`approve:${ip}:${caller.id}\`, …)`, and `ip` comes from `X-Real-IP` falling back to `X-Forwarded-For` — both attacker-supplied.

**Evidence.** `approve/route.ts:96-118` writes an audit row and returns 403 with no `db.user.update`; compare `login/route.ts:76-96`. `http-rate-limit.ts:7-14` justifies trusting `X-Real-IP` because of "the approved serving model … behind Caddy" — the Caddyfile was deleted in commit `0aeea30` and no reverse proxy exists. The comment itself names the consequence.

**Location.** `src/app/api/auth/approve/route.ts:47-118`; `src/lib/http-rate-limit.ts:16-25`

**Impact.** An authenticated CASHIER — the exact threat manager approval defends against — can rotate a header per request and grind the 10⁶ PIN space with no lockout. A recovered PIN yields signed approval tokens for unauthorised discounts and refunds. This is the classic POS fraud vector.

**Remediation direction.** Apply the same `failedAttempts`/`lockedUntil` escalation used by `login`, keyed on the caller. Ignore proxy headers entirely unless a trusted proxy is actually deployed.

### Batch 4.1 — Validation Required

- Targeted test: N consecutive wrong manager PINs lock the *calling* account (or the approval capability) as designed.
- Targeted test: rotating `X-Real-IP`/`X-Forwarded-For` no longer resets the limit.
- Targeted test: a correct PIN still issues a valid, amount-bound, single-use token; self-approval is still blocked.
- Regression: `approvals.test.ts` (7 cases) still passes.
- Manual: a legitimate manager approval flow still works at the till after the change.
- `bun test src` — PASS. `bun run typecheck` — PASS.

### Batch 4.1 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 4.2 — Asynchronous scrypt

**Status:** `NOT STARTED`

### C-09 — Synchronous scrypt on the request thread freezes the POS

**Status:** `NOT STARTED` · Severity: HIGH · Category: security / availability

**Problem.** `hashPin`/`verifyPinDetail` use `scryptSync` with `N=2^17, r=8` (~128 MiB, ~100 ms) directly on the Node event loop. A failed verify runs it **twice** (strong params, then the legacy fallback). `/api/auth/approve` runs it once per manager, sequentially. An unknown username at login deliberately burns a full `hashPin("dummy")`.

**Evidence.** `auth.ts:28` `SCRYPT_OPTS = { N: 1 << 17, r: 8, p: 1, maxmem: 1 << 30 }`; `:36, :65, :73` all `scryptSync`; `login/route.ts:52`; `approve/route.ts:97-104`.

**Location.** `src/lib/auth.ts:28-79`; `src/app/api/auth/login/route.ts:52`; `src/app/api/auth/approve/route.ts:97-104`

**Impact.** The parameters are correctly chosen for PIN security — running them synchronously means every wrong PIN stalls the single Node process serving the till. With five managers, one wrong approval PIN blocks the event loop for roughly a second. An unauthenticated client on the LAN can freeze the POS and exhaust memory (128 MiB per in-flight call).

**Remediation direction.** Switch to the async `crypto.scrypt` callback/promise form, as `backup.ts:55-70` already does. Bound concurrency on the auth routes.

**⚠ Regression risk.** `verifyPinDetail`'s legacy-N=2^14 fallback (commit `5ef7dc4`) is what keeps existing users able to log in. It is currently untested (T-04). Do not touch this function without first adding that test.

### Batch 4.2 — Validation Required

- **Prerequisite:** T-04 (legacy-PIN fallback test) exists and passes *before* this change. A regression here locks every user out of the till.
- Targeted test: a legacy N=2^14 hash still verifies and is transparently upgraded on success.
- Targeted test: a strong N=2^17 hash verifies without touching the legacy path.
- Load check: concurrent requests during a wrong-PIN attempt are still served (event loop not blocked); measure and record.
- Manual: login, unlock, switch-user and manager approval all still work at the till.
- `bun test src` — PASS. `bun run typecheck` — PASS.

### Batch 4.2 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 4.3 — Credentials, sessions and network exposure

**Status:** `NOT STARTED`

### C-18 — Default PINs are live; an empty user table lets anyone bootstrap a super-admin

**Status:** `NOT STARTED` · Severity: HIGH · Category: security

**Problem.** `POST /api/seed` is unauthenticated when `user.count() === 0` and creates `admin` (SUPER_ADMIN) with `SEED_ADMIN_PIN ?? "123456"`. The production database uses exactly those defaults.

**Evidence.** `seed/route.ts:22-40`. Commit `5ef7dc4` states: "User credentials: admin=123456, manager=111111". `GET /api/seed` is unauthenticated and reports initialisation state. `GET /api/auth/profiles` is public and lists every active user's id, username, name and role.

**Location.** `src/app/api/seed/route.ts:22-40, 113-116`; `src/app/api/auth/profiles/route.ts`

**Impact.** The server binds `0.0.0.0` (no `-H` in `start.ps1`), so anyone on the restaurant Wi-Fi can enumerate users and try the two best-known PINs in the world. If the user table is ever emptied (see C-17), the seed endpoint hands a fresh super-admin to whoever asks first.

**Remediation direction.** Force a PIN change on first login; bind to `127.0.0.1` unless LAN access is required; gate the seed bootstrap behind a one-time token or a local-only check.

**Note.** If LAN access *is* required, `APP_URL` must be set to an `http://` value or the session cookie's `secure` flag silently rejects login over plain HTTP with no error. See DD-06.

| ID | Status | Problem | Location | Direction |
|---|---|---|---|---|
| **M-23** | `NOT STARTED` | Changing a PIN requires no knowledge of the current PIN; `PUT /api/users/[id]` allows self-edit of `pin` and `active`. Anyone at an unlocked till can permanently change the signed-in user's PIN. | `users/[id]/route.ts:15-29` | Require the current PIN for a self-service PIN change; forbid self-deactivation. |
| **M-27** | `NOT STARTED` | The approval-token `consumed` Set grows without bound and is lost on restart, permitting one replay inside the 60 s TTL. | `approvals.ts:22-28, 118-121` | Prune expired entries. The replay window is documented and accepted for single-tenant use; the unbounded growth is not. |
| **M-28** | `NOT STARTED` | `Session.device` reads `store.get("user-agent")` from the *cookie* jar, not the header, so the column is always null. | `auth.ts:162` | Read the header. |

### Batch 4.3 — Validation Required

- Manual: default PINs are changed on the production machine and the change is recorded (out-of-band; **do not record the values here**).
- Targeted test: first login forces a PIN change (if that is the chosen mechanism).
- Targeted test: the seed bootstrap is refused from a non-local origin / without the token.
- Verify the bind address: the server no longer answers on the LAN address (or, if LAN access is chosen, `APP_URL` is set and login over HTTP works).
- Targeted test: a self-service PIN change without the current PIN is refused (M-23).
- Targeted test: the `consumed` set does not grow unboundedly (M-27).
- Targeted test: `Session.device` is populated (M-28).
- Regression: login, unlock, switch-user, lock all still work.
- `bun test src` — PASS. `bun run typecheck` — PASS.

### Batch 4.3 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 4.4 — Authorization gating parity

**Status:** `NOT STARTED`

### C-16 — Role gating is client-side only; every admin view renders for every user

**Status:** `NOT STARTED` · Severity: HIGH · Category: security

**Problem.** `app-shell.tsx:124-139` renders by `view ===` with no role condition, and `initHashSync` accepts any of the 17 valid hashes from the URL. Role filtering exists in exactly one place — the home dashboard's module list.

**Evidence.** A CASHIER typing `#/users`, `#/settings`, `#/audit`, `#/backups` or `#/logs` gets the full view mounted with live forms and buttons, including the database-restore button. `home-dashboard.tsx:207` — `const role = (user?.role as Role) ?? "MANAGER"` — an undefined role fails **open** to MANAGER.

**Location.** `src/components/shared/app-shell.tsx:124-139`; `src/store/app-store.ts:103-121`; `src/components/shared/home-dashboard.tsx:207, 259-261`

**Impact.** The server side was audited route by route and **holds** — every sensitive mutation re-checks the role. So this is exposure and confusion rather than direct compromise: a cashier sees admin screens, reads whatever the ungated GETs return, and gets 403s on the rest. But the UI is now the only thing between a curious employee and the restore button.

**Remediation direction.** Gate the render branch on `NAV_ITEMS.roles`, reject unauthorised hashes in `initHashSync`, and default an unknown role to CASHIER.

| ID | Status | Problem | Location | Direction |
|---|---|---|---|---|
| **M-19s** | `NOT STARTED` | Ungated reads for CASHIER: `GET /api/settings` (SIRET, TVA number, discount threshold), `GET /api/reports/x`, all shift endpoints. The X report is deliberately open because the cashier-visible shifts view uses it — which makes the MANAGER+ gate on `POST /api/reports/x` decorative. | `settings/route.ts:7`; `reports/x/route.ts:38`; `shifts/*` | Decide the intended cashier visibility, then make GET and POST agree. See DD-07. |
| **M-24** | `NOT STARTED` | `POST /api/upload` has no role gate, trusts the client-declared MIME type, and imposes no quota. | `upload/route.ts:31-56` | Add a role gate, magic-byte validation and a quota. Disk exhaustion is the realistic impact. |
| **M-25** | `NOT STARTED` | `PUT`/`DELETE /api/customers/[id]` have no role check — any cashier can edit or deactivate any customer record. | `customers/[id]/route.ts:20,32` | Add role checks consistent with the intended matrix. |
| **M-26** | `NOT STARTED` | No security headers anywhere: no CSP, X-Frame-Options, Referrer-Policy or HSTS, and no `middleware.ts` to add them. | `next.config.ts` | Add headers. Lower risk on a kiosk, but the app is served unencrypted over the LAN. |

**Note on M-19s:** this ID is a sub-label for the ungated-reads row in the audit's Medium table, which had no distinct number. Recorded here to preserve traceability without renaming an existing ID.

### Batch 4.4 — Validation Required

- **API authorization test matrix (T-03):** for each of the 59 routes, assert the expected status for CASHIER / MANAGER / SUPER_ADMIN / unauthenticated. This is currently untested in its entirety.
- Manual: a CASHIER navigating to `#/users`, `#/settings`, `#/audit`, `#/backups`, `#/logs` is redirected or refused, not shown the view.
- Targeted test: an unknown/undefined role resolves to the least-privileged behaviour.
- Targeted test: upload rejects a non-image with an image MIME header (M-24).
- Targeted test: a CASHIER cannot modify or deactivate a customer (M-25).
- Response headers verified on a real request (M-26).
- Regression: every legitimate role can still perform its documented work.
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS.

### Batch 4.4 — Status Record

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

*The transaction-timeout half of C-15 is Batch 2.3.*

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

> Several Stage 1–5 batches specify new tests as their own validation. Those tests belong to their batch. This stage covers the structural gaps that do not attach to a single fix.

## Batch 6.1 — Tests for the things that can lose money

**Status:** `NOT STARTED`

| ID | Status | Gap | Why it matters |
|---|---|---|---|
| **T-01** | `NOT STARTED` | `createBackup` and `restoreBackup` have **zero tests**. The suite proves AES-GCM round-trips a buffer; nothing proves a backup of a real database is produced or restorable. | The most destructive function in the codebase. Directly where C-05 lives. Required by Batch 2.1. |
| **T-02** | `NOT STARTED` | Discount-authorization *enforcement* is untested. The token primitive has 7 tests in isolation; nothing exercises the route branch deciding whether a discount needs one. | A regression accepting an unapproved discount passes 136/136. The classic POS fraud vector. |
| **T-03** | `NOT STARTED` | RBAC has zero tests across 59 routes. Nothing asserts a CASHIER cannot close a shift, reprint, or restore a backup. | Required by Batch 4.4. |
| **T-04** | `NOT STARTED` | The legacy-PIN fallback that broke login in commit `5ef7dc4` is untested. `auth.test.ts` only feeds `verifyPin` a freshly-generated strong hash; no test supplies a legacy N=2^14 hash, and the re-hash-on-login upgrade is untested. | **Required before Batch 4.2.** A regression re-locks every pre-hardening account out of the till. |
| **T-05** | `NOT STARTED` | Order-level money assembly is untested — subtotal → discount → VAT breakdown → payment reconciliation. `orders/route.ts:290` `addToVatBreakdown` on `netLineTotal` is never asserted. | Where C-11, C-12 and M-13 live. |
| **T-06** | `NOT STARTED` | No transaction-rollback test. Nothing proves a mid-checkout failure leaves no orphaned order, payment, sequence gap or fiscal event. | The failure mode most likely to break gapless numbering in production. |
| **T-07** | `NOT STARTED` | Concurrency tests cover only counter increments via in-process `Promise.all`. Nothing tests two simultaneous checkouts, a double Z close, or concurrent refunds on one order. | Required by Batch 4.7. |

### Batch 6.1 — Validation Required

- Each new test **fails against the pre-fix code** and passes after. A test that passes both ways proves nothing.
- `bun test src` — PASS, with the new total recorded.
- Test runtime remains acceptable (baseline 25.9 s; scrypt-heavy tests dominate).
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
| **T-11** | `NOT STARTED` | The e2e suite is not re-runnable: `03-shift-flow.spec.ts:97-113` opens a shift and never closes it, so the next run's `POST /api/shifts` gets 409 where it expects 200. Credentials are hardcoded `admin`/`123456`. Euro-era arithmetic survives (`02:60`, `02:91`, `02:95`) and passes by luck. | `tests/e2e/*.spec.ts` | Make specs self-cleaning and seed their own credentials. |
| **T-12** | `NOT STARTED` | No CI exists. No `.github/`, no pipeline config anywhere. Tests run only when someone remembers. All "lint 0 errors · tsc exit 0 · N tests pass" claims in `IMPLEMENTATION_PLAN.md` rest on manual local runs. | repo root | Add CI running `typecheck`, `lint`, `bun test src` — and e2e only after T-10. Depends on the repo being pushed (P-01). |
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
| **DOC-01** | `NOT STARTED` | `README.md:10` "SQLite via Prisma ORM (WAL)" | Rollback journal (header byte 18 = 1) | True after Batch 2.3; verify then leave. |
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
4. Record the before/after row counts and the reset counters in this plan, the way the Batch 0.2 baseline was recorded.
5. Re-verify `/api/fiscal/verify` afterwards: an empty chain must report `ok` with `lastSequence: 0`.

**Related.** `settings.factice` exists precisely so test transactions are stamped as simulations and can never be mistaken for real ones. It is currently `false`, which is why the development sales look genuine. Consider setting it `true` for any further testing on the live machine before go-live, and `false` at opening.

**Dependencies.** Deployment (Batch 1.4) and the printer sign-off (Batch 1.3) should be settled first — otherwise the commissioning itself would put new test sales into the freshly reset journal.

## Batch 8.1 — Live database verification

**Status:** `NOT STARTED`

| ID | Status | Task |
|---|---|---|
| **V-04** | `NOT STARTED` | Verify the live database directly — chain continuity, `FiscalCounter` alignment against `max(number)` of orders/shifts/Z reports, orphan rows, and whether `_prisma_migrations` matches the squashed baseline. Deliberately out of scope for the read-only audit. Note `scripts/fix-fiscal-counter.ts` exists in the tree, which suggests counter drift has occurred before. |
| **V-05** | `NOT STARTED` | Compare the final state against the Batch 0.2 baseline: row counts, chain `lastSequence`, grand-total figures. Every difference must have a recorded explanation. |

### Batch 8.1 — Validation Required

- `/api/fiscal/verify` reports `ok` for events, monthly closes and annual closes.
- `FiscalCounter` values are ≥ the maximum issued number in every corresponding table, with no duplicates.
- No orphan `OrderItem`, `Payment`, `Refund` or `Receipt` rows.
- Every difference from the Batch 0.2 baseline is explained in writing.

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

# DESIGN DECISIONS REQUIRED

These cannot be resolved from the code. **Claude must not decide them.** Each blocks or reshapes the batch named.

| ID | Decision | Blocks | Context |
|---|---|---|---|
| **DD-01** | ~~**Printing and cash drawer.**~~ **ANSWERED 2026-09-03: build the ESC/POS bridge now, in the existing Bun/Next server, primary transport raw TCP to port 9100 over the LAN**, behind a transport interface leaving a Windows-RAW-spooler slot for USB. Not deferred to Tauri. | Batch 1.3 (now `IN PROGRESS`); shapes 1.4 and 3.4 | Decided by the user. Reasoning: `renderReceipt()` already produces the receipt text, so only transport + control bytes are missing; a TCP socket is runtime-independent and carries over to a future Tauri shell untouched, so building now is not throwaway work. Deferring would keep the restaurant on a physical drawer key per cash sale, and would leave the Batch 1.2 cash-variance figure with no drawer accountability behind it. |
| **DD-02** | ~~**Where does application data live?**~~ **ANSWERED 2026-09-03: `C:\HibaPOS\data`.** Plumbing shipped in Batch 2.2 (`src/lib/paths.ts`, `HIBAPOS_DATA_DIR`), defaulting to the old layout; the physical move is a deployment step with Batch 1.4. Original question: `%ProgramData%\HibaPOS\`, a dedicated `C:\HibaPOS\`, or the current install directory? The current path is inside a OneDrive-synced Desktop folder, which locks SQLite files. Under `C:\Program Files\` the app cannot write at all. | Batch 2.2; shapes 1.4 | Every path except `DATABASE_URL` is `process.cwd()`-anchored. |
| **DD-03** | ~~**Already-sealed rows with the wrong VAT key.**~~ **CLOSED 2026-09-03 as NOT APPLICABLE — there was never an affected row.** The premise (that sealed rows carry a `"6"` key) was an audit assumption, not an observation. Read-only inspection of every database on the machine found zero `"6"` keys and zero non-10 % rates anywhere, including in the legacy July exports whose dataset *did* contain a 5,5 % product. The operator then confirmed that all trading data is developer test data and that P-04 deletes it before the first real sale, so the two `ZReport` rows are not fiscal records at all. Key format decided: **minimal decimal string** (`"5.5"`, `"10"` — option A1), because it is byte-identical to what those rows already hold. | Batch 3.1 (`COMPLETED`) | Full evidence in the Batch 3.1 status record. No annotation, re-issue or explanation was needed, so V-01 is not engaged. |
| **DD-17** | ~~**Where does a product's VAT rate come from?**~~ **ANSWERED 2026-09-03: on the category, inherited nearest-wins (own category → parent → default), with a per-product override flag and a selector constrained to 20 / 10 / 5,5 / 2,1 %.** Original question raised by the operator: should a VAT percentage be settable per category instead of via the hardcoded "Bouteille / Canette" switch? | Batch 3.1c | Decided by the user. Reasoning: the current design encodes a **tax rule as a string match on a category name** (`products-view.tsx:498`), so renaming a category silently removes the control — and it already has, which is L-16/L-17. Category-level inheritance is not a new mechanism here: `pricing.ts:71` already resolves `product.category?.parent ?? product.category` for options and add-ons, with `inheritCategoryGlobals` as the per-product opt-out. This applies the established pattern to one more field. The snapshot in `OrderItem.vatRate` is what makes it safe — past sales cannot move when a category is edited. |
| **DD-04** | **Backup key rotation policy.** Rotating `BACKUP_ENCRYPTION_KEY` orphans every existing backup permanently. Re-encrypt the retained set first, accept the loss, or introduce key versioning before rotating? | Batch 7.3; P-02 | Retention obligations may make discarding old backups unacceptable — see V-04. |
| **DD-05** | **Out-of-order period closes.** Chain by insertion order, or refuse to close a month out of sequence? | Batch 3.6 (M-01) | Refusing is simpler and arguably more correct fiscally; chaining by insertion order is more permissive. |
| **DD-06** | **Is LAN access required?** If no, bind to `127.0.0.1`. If yes, set `APP_URL` to an `http://` value so the session cookie works, and accept unencrypted traffic on the restaurant network. | Batch 4.3 | Currently binds `0.0.0.0` with a `secure` cookie, so LAN login silently fails — protective by accident. |
| **DD-07** | **Intended cashier visibility.** Which reports and settings should a CASHIER see? The X report is currently open to cashiers via the shifts view while `POST /api/reports/x` is MANAGER+. | Batch 4.4 (M-19s) | Decide the matrix first, then make GET and POST agree and update the README role table. |
| **DD-08** | **Operator scripts.** Guard them, or remove them from the shipped tree? | Batch 4.5 (C-17) | Precedent exists: `scripts/delete-products.js` was removed for the same hazard. |
| **DD-09** | **Tables.** Wire table selection into the POS, or withdraw the feature from the documentation? | Batch 5.2 (C-21) | The floor plan, model and API all exist; only the POS link is missing. |
| **DD-10** | **Cross-shift refunds.** Allow, attributed to the current open shift? Restrict to MANAGER+? Or keep the current refusal and define an approved manual procedure? | Batch 5.3 (C-14) | The current refusal pushes staff toward untraced cash refunds. |
| **DD-11** | **Held orders.** Move server-side (visible from any terminal, surviving a device swap, accounted for at Z close), or keep them device-local? | Batch 5.4 (C-23) | The current shape is not what "held orders" usually means operationally. |
| **DD-12** | **Cash movements.** Add an entrée/sortie de caisse feature, and if so what categories and what approval level? | Batch 5.5 (M-05) | Without it, the variance figure C-02 fixes will still be wrong in practice. |
| **DD-13** | **Order cancellation.** Support a pre-payment order state and a void, or remove the dead `PENDING`/`CANCELLED` enum values and the zero counter? | Batch 5.6 (M-08) | Leaving them implies a feature that does not exist. |
| **DD-14** | **Zero-total orders.** Is a 100 % discount (staff meal, comp) a legitimate transaction? Currently impossible to check out. | Batch 5.7 (M-11) | If yes, it still needs a fiscal record — decide how it is journalled. |
| **DD-15** | **Orphaned schema surfaces.** `ProductAddon` (no writer) and `Customer.postalCode` (no consumer) — build the missing write paths or remove the surfaces? | Batch 5.7 (M-09, M-10) | Both are flagged in audit section I as possible lost functionality; compare against the historical project before removing. |
| **DD-16** | **Should `public/uploads/` be tracked in git?** 134 files currently are, contradicting the README and complicating any git-based update. | Batch 7.1 (DOC-06) | Interacts with DD-02: if uploads move to a data directory, the question resolves itself. |

---

# EXTERNAL / LEGAL / FISCAL VERIFICATION

**Nothing in this plan, and no test result produced by it, constitutes evidence of French fiscal or legal compliance.** The audit deliberately did not offer a compliance opinion, and neither does this document.

The repository ships `docs/attestation-conformite.md`, a fill-in-and-sign editor's attestation. It cites art. 441-1 of the code pénal, which makes a false attestation a criminal offence. The accuracy of its ISCA section should be settled by a qualified party **before anyone signs it**.

| ID | Status | Question for external verification |
|---|---|---|
| **V-01** | `REQUIRES EXTERNAL VERIFICATION` | Is an **unkeyed SHA-256 chain** sufficient for the inalterability requirement, or is a keyed/signed scheme or external anchoring expected? Anyone who can write to the database file can recompute the whole chain and `/api/fiscal/verify` will report `ok`. (C-22) |
| **V-02** | `REQUIRES EXTERNAL VERIFICATION` | Does the annual archive format satisfy the archiving requirement, and what integrity property must its checksum actually have? (C-04) |
| **V-03** | `REQUIRES EXTERNAL VERIFICATION` | What must a compliant receipt contain — per-rate VAT breakdown, TVA number, software identification, others? (M-06) |
| **V-08** | `REQUIRES EXTERNAL VERIFICATION` | What must a compliant Z report and period close contain, and how must refunds and corrections be presented? (M-07, C-10) |
| **V-14** | **DETERMINED BY THE OPERATOR 2026-09-03** — professional sign-off optional, no longer blocking | **Which VAT rate applies to which product?** The operator researched this and gave the determination recorded in *VAT rate policy* below: **two rates are in use — 10 % standard, 5,5 % for drinks in a sealed can or bottle** — and the restaurant **sells no alcohol**, so 20 % is not currently used. Batch 3.1c implements exactly that. Claude did not derive the classification and does not certify it (safety rule 13); it is recorded as the operator's own determination. A confirmation from whoever files the TVA remains available but nothing waits on it. |
| **V-09** | `REQUIRES EXTERNAL VERIFICATION` | Retention: the archive notice states six years. What must actually be retained, in what form, and does the current backup arrangement satisfy it? Interacts with DD-04. |
| **V-10** | `REQUIRES EXTERNAL VERIFICATION` | Is certification by a body, or self-attestation, the applicable route for this software and this operator? No certificate, test report or certifying-body reference exists in the repository. |
| **V-11** | `REQUIRES EXTERNAL VERIFICATION` | Are the legal citations in `docs/attestation-conformite.md` current and correctly applied — art. 286-I-3° bis CGI, art. 1770 duodecies CGI, *Loi n° 2026-103 du 19 février 2026 art. 125*, BOI-TVA-DECLA-30-10-30, BOI-LETTRE-000242? The audit recorded these verbatim and did **not** evaluate them. |
| **V-13** | `REQUIRES EXTERNAL VERIFICATION` | Must the JFP carry an `OUVERTURE_TIROIR` entry for **every** physical opening of the cash drawer, including the automatic kick on a cash tender? Batch 1.3 journals the traced *manual* open only, on the reasoning that the `VENTE` event already records the cash payment. If every opening must appear, the automatic kick needs its own event. (C-03, C-27) |
| **V-12** | `REQUIRES EXTERNAL VERIFICATION` | Do the *operator's* processes — archive custody, retention, attestation signing — meet the requirement independently of the software? |

**Rule:** `IMPLEMENTATION_PLAN.md:54` marks "Phase 1 — ISCA / NF525 compliance — ✅ COMPLETE". That marking is not supportable from the code and must not be treated as an answer to any question above.

---

# DEFERRED / LOW PRIORITY

Retained with their audit IDs. Revisit after Stage 8.

| ID | Status | Item | Location |
|---|---|---|---|
| **L-05** | `DEFERRED` | `output: "standalone"` is built but never used; the bundle is missing `.next/static` and most of `public/`, so it would not run. Drop it or fix it. | `next.config.ts:4`; `.zscripts/start.ps1:25` |
| **L-09** | `DEFERRED` | Touch-target regressions from the Phase 10 pass: `h-9 min-h-[48px] w-9` (48 px tall, 36 px wide); a 28 px "Ouvrir" button on the blocking no-shift banner. | `payment-dialog.tsx:340`; `pos-view.tsx:451` |
| **L-10** | `DEFERRED` | `aria-label` coverage absent from shifts, reports, orders, dashboard, settings, logs, audit and four dialogs, despite the Phase 10 claim. | `src/features/**` |
| **L-11** | `DEFERRED` | Two payment tolerances disagree (`paid < total - 1` vs `paid < total - 0.01`, both on integer cents); dialog resets run on uncleaned 200/350 ms timers. | `payment-dialog.tsx:86,128,377`; `product-options-dialog-v2.tsx:60` |
| — | `DEFERRED` | 27 orphaned shadcn `ui/*` components and their ~20 transitive dependencies. Template residue. | `src/components/ui/` |
| — | `DEFERRED` | `src/app/api/route.ts` returns `{"message":"Hello, world!"}`, unauthenticated. Remove or convert to a health check (in scope for Batch 3.4). | `src/app/api/route.ts` |
| — | `DEFERRED` | `src/app/api/catalog/categories/[id]/options/` is an empty route segment predating the repo reset. Compare against the historical project before removing. | — |
| — | `DEFERRED` | `scripts/` is excluded from both eslint and tsc — nine DB-mutating scripts with zero static checking. Considered in Batch 4.5. | `eslint.config.mjs:49`; `tsconfig.json:41` |

---

# FINDINGS REQUIRING VERIFICATION OR POSSIBLY OVERSTATED

Kept per the instruction not to drop a finding because of disagreement. None was removed.

| ID | Note |
|---|---|
| **C-16** | Real, but its *practical* severity is bounded: the server side was audited route by route and holds. This is exposure and confusion, not direct compromise. Do not let that reduce its priority — the restore button is behind it. |
| **C-11** | The VAT report's rounding defect is real, but `/api/reports/vat` currently has **no client caller** (C-27). Its practical reach is therefore zero *today* and full as soon as Batch 3.4 wires the fiscal UI. Fix it before wiring, not after. |
| **M-12** | Latent only. The UI sends `AMOUNT`, never `PERCENT`. Real risk is to any future client that follows the comment. |
| **M-15**, **M-16** | Theoretical until someone crafts the input. Both are cheap to fix; neither is urgent. |
| **M-27** | The replay window after a restart is documented and consciously accepted in `approvals.ts:22-28`. Only the unbounded set growth is unambiguously a defect. |
| **DOC-04** | The README undercounts tests (105 vs 136). Stale, not inflated — the direction of the error is worth noting. |
| **Audit section I generally** | The git history **cannot** answer whether files were accidentally deleted: the repo was re-initialised at `be9113e` and the claimed pre-v0 archive path does not exist. All "possibly missing" items are inferences from orphaned code, not from deletion evidence. Compare against the historical 3 GB project before acting on any of them. |

---

# NEWLY DISCOVERED ISSUES

Record anything found *during* remediation that is outside the current batch's scope. Do not fix it in that batch (safety rule 10).

| ID | Date | Found during | Description | Severity | Assigned to batch |
|---|---|---|---|---|---|
| **L-24** | 2026-09-04 | Batch 3.5 baseline | **`bun test src` fails 23 tests on a machine this slow, with no code defect involved.** All 23 are timeouts against Bun's 5 s default: 22 in `backup*.test.ts` and 1 in `auth.test.ts`. Measured cause — `scryptSync` at N=2^17 costs **~1519 ms** per call here (N=2^16 costs ~727 ms), and a backup→restore round trip performs several: the archive encrypt, the pre-restore safety-snapshot encrypt, and the decrypt. The cascade that follows is misleading: the test times out, `afterEach` deletes the temp directory, and the still-running `VACUUM INTO` then reports `unable to open database` (SQLITE_CANTOPEN, P2010), which reads like a filesystem or Prisma fault and is not one. `bun test src --timeout 30000` → **340 pass, 0 fail**. Whole-suite runtime is ~192 s against the 25,9 s the plan recorded for the same suite, so this is machine state, not a regression. Established on the untouched pre-batch commit `e86c5e4`. Options: raise the timeout in `bunfig.toml`, or lower the scrypt cost in test runs only — the second must not touch the production KDF parameters. | LOW (test infrastructure; hides real failures behind noise and costs a session an hour to diagnose) | 6.1 |
| **L-23** ✅ **RESOLVED in Batch 3.2b** (`54aa7ef`) | 2026-09-03 | Batch 3.2 | **Three more aggregation sites the audit did not count, two with the C-11 half-cent defect and one with the C-10 shape.** `dashboard/route.ts:47` and `reports/products/route.ts:70` both compute `round2(lineTotal × (1 − discountRatio) × …)` — a ratio product through a euros helper, so the half-cent survives exactly as C-11 described (`round2(1250 × 0.85)` = `1062.5`, where the Z report gives `1063`). `reports/cashiers/route.ts:77-79` sums payments **gross** and never nets refunds off them, which is the C-10 shape in a management report. Also `dashboard:27` and `customers/[id]/detail:37` return `avgTicket` as a fractional cent. Note most other `round2` calls in these files are **no-ops** — `round2` of an integer returns the integer — so the defect is specifically where a ratio or a division feeds it. None of these feeds a sealed fiscal document, which is why Batch 3.2 did not widen to cover them; but they mean a manager comparing the dashboard or the cashier report against a Z report still sees different figures for the same period. Fix by routing them through `aggregateOrders`. | MEDIUM (management reports disagree with the fiscal ones) | needs a decision — a small follow-on to 3.2 |
| **L-22** | 2026-09-03 | Batch 3.1d | **Validation errors reach the French UI as untranslated English zod messages.** `settings/route.ts` returns `parsed.error.issues[0]?.message`, and `settingsSchema` defines custom messages for only a few fields, so the operator saw `Too big: expected number to be <=48` (L-20). That specific message is now unreachable, but any other out-of-range settings value produces the same class of output. Applies to other schemas in `validation.ts` too. | LOW (operator-facing text) | 7.1 or 3.4 |
| **L-20** ✅ **RESOLVED in Batch 3.1d** (`be9efa1`) | 2026-09-03 | Batch 3.1b manual validation | **The Réglages screen cannot be saved at all on the live install.** `Setting.receiptWidth` still holds the legacy millimetre value `80`. Batch 1.3 (L-13) tightened `settingsSchema` to `z.number().int().min(32).max(48)` and `getSettings()` returns the stored value raw, so the form loads 80 and PUTs it straight back: **`PUT /api/settings` → 400 "Too big: expected number to be <=48"**. Reproduced on a scratch copy of the production database. `normalizeReceiptColumns()` already exists but runs only in the receipt renderer, not on the settings read path. Consequences: **every** settings change is blocked — including the two operator actions this plan already asks for (correcting `printerName` per DOC-15, and saving `receiptWidth` as 48) — and the operator sees an untranslated English zod message in a French UI. Workaround: re-pick the width in the selector before saving anything, which is not discoverable (the selector renders blank because 80 matches no option). Candidate fix: normalise on read in `getSettings()`, as the renderer already does. | **HIGH** (live install; blocks all configuration) | needs a decision — suggest a small batch before 3.1c |
| **L-21** | 2026-09-03 | Batch 3.1b manual validation | **`renderReceipt()` centres but never wraps, so an over-long field overflows the paper.** A receipt rendered at the corrected 48 columns still contained a **56-character** line: the restaurant's real address, `23 Grande Rue 45210, 45210 Ferrières-en-Gâtinais, France`. On 48-column paper that wraps mid-address on every ticket. Distinct from L-14, which is about *archived* 80-column receipts — this is new output at the correct width. Affects any long `restaurantAddress`, `restaurantName` or `footerNote`. | MEDIUM (every printed ticket, once the printer is live) | 3.4 or with L-20 |
| **L-16** ✅ **RESOLVED in Batch 3.1c** (`9feb4a0`, `23e2971`) | 2026-09-03 | Batch 3.1 (DD-03 investigation) | **All 17 real cans and bottles are stored at 10 % where the operator states 5,5 % applies.** `Canette` (13 products at 1,50 €) and `Bouteilles` (4 at 3,50 €) are all `vatRate = 10`; so are all 78 products in the catalogue. Unlike the trading data, **the menu is real** — so this is a live error in production data, not a test artifact. At the fixed TTC prices it over-declares ≈ 6 c per can and ≈ 14 c per bottle, money owed to the restaurant rather than the state, on every drink sold from opening day. Caused by L-17: the interface offers no way to set the rate for these products. | **HIGH** (real data, real money, from day one) | 3.1c — operator authorised the change 2026-09-03; classification is V-14 |
| **L-17** ✅ **RESOLVED in Batch 3.1c** (`9feb4a0`) | 2026-09-03 | Batch 3.1 (DD-03 investigation) | **The VAT switch matches the immediate category's name and never walks to the parent.** `products-view.tsx:498` shows the "Bouteille / Canette" 5,5 % toggle only when the selected category's name contains `"boisson"`. `Canette` and `Bouteilles` are **children of** `Boissons`, so it never renders for them — and it is the only VAT control in the product form. Every other category-inherited property resolves `product.category?.parent ?? product.category` (`pricing.ts:71`); this one does not. The form already has the full tree loaded, so it is a one-line inconsistency with an established convention, not a missing capability. | **HIGH** (blocks any fix for L-16) | 3.1c |
| **L-18** ✅ **RESOLVED in Batch 3.1b** (`8a8a09a`) | 2026-09-03 | Batch 3.1 (DD-03 investigation) | **FACTICE simulation mode is wired into every fiscal write but no screen can turn it on.** `settings.factice` is read on eight write paths and stamps both the receipt (`receipt.ts:14`) and every `FiscalEvent`; `validation.ts:216` already accepts the field. There is no `factice` row in `Setting` and no control anywhere, so it is permanently `false` — which is why 20 developer test orders were journalled as genuine sales with `factice = 0`. P-04 deletes them, but any testing before go-live has the same problem. | MEDIUM (fiscal-record hygiene before go-live) | 3.1b — operator approved 2026-09-03 |
| **L-19** | 2026-09-03 | Batch 3.1 consumer verification | **The VAT breakdown table renders rates with `toFixed(1)`, which cannot show a two-decimal rate.** `report-widgets.tsx:76` renders `Number(r).toFixed(1) + " %"`, so 10 % displays as "10.0 %" (cosmetic) and a Corsican/overseas rate such as 1,05 % would display as "1.1 %" — a wrong rate on a fiscal report. Pre-existing and **improved** by Batch 3.1 (before the fix, 1,05 % was keyed "1" and lost entirely), and unreachable while every product is at 10 %. Recorded so 3.2/3.4 does not preserve it. Note the display layer, not the key, is what needs fixing. | LOW (latent display defect; not reachable today) | 3.4 or 7.1 |
| L-15 ✅ **RESOLVED in Batch 2.2** (`3a9bd1f`, refuse) | 2026-09-03 | Batch 2.1 decrypt-tool verification | **Restore has no schema-version check, and at least one existing backup predates five tables.** Decrypting the real `hibapos-backup-2026-08-28T01-21-34-082Z.dbenc` shows 26 tables against the live schema's 31 — missing `AnnualClose`, `FiscalArchive`, `FiscalEvent`, `GrandTotal`, `MonthlyClose`. Restoring it succeeds and leaves the application running against a database with **no fiscal journal**: every fiscal query fails, and the new `RESTAURATION` event cannot even be written (handled non-fatally, logged as ERROR). `restoreBackup` compares the *data* checksum but never the schema. Needs a decision — refuse a restore whose `_prisma_migrations` do not match, warn and proceed, or run `migrate deploy` after the swap. | **HIGH** (silent post-restore breakage) | needs a decision; suggest 2.2 or a new DD |
| L-14 | 2026-09-03 | Batch 1.3 loopback validation | **Receipts archived before L-13 was fixed are 80 columns wide and cannot fit the paper.** Every existing `Receipt.content` row (checked #18, #19, #20) has a widest line of 80 characters, because `renderReceipt` was fed the millimetre value. 80 mm paper fits 48 columns at Font A and 64 at Font B, so **reprinting any pre-fix ticket will wrap**. Re-rendering them is **not** an option — an archived receipt is an immutable fiscal artifact and the reprint path must print it verbatim. Options are to accept wrapped legacy reprints, or to print pre-fix receipts in a condensed font. Affects reprints only; new receipts render at 48 once `receiptWidth` is saved. | LOW (cosmetic, legacy rows only) | 7.1 or accept |
| L-13 ✅ **RESOLVED in Batch 1.3** (`483a86e`) | 2026-09-03 | Batch 1.3 decision prep | **`receiptWidth` is a millimetre value being used as a character count.** The live `Setting` row is `receiptWidth = 80` and `validation.ts:202` allows 32–80, but `renderReceipt()` (`services/receipt.ts:8`) uses it as `const w = Math.max(32, s.receiptWidth ?? 42)` — a column count. 80 mm of thermal paper is **48 characters** at ESC/POS Font A (64 at Font B), not 80. Harmless while printing is `window.print()`; guaranteed to wrap every receipt into garbage the moment real printing exists. Decide whether the setting means millimetres (and derive columns) or columns (and re-label + re-default it). | MEDIUM (latent; blocks correct output in 1.3) | 1.3 |
| DOC-15 ⚠️ **half-resolved 2026-09-03** | 2026-09-03 | Batch 1.3 decision prep | **The documented printer is not the configured printer.** `IMPLEMENTATION_PLAN.md:15` names the *Sunso WTP-801*; the live `Setting` row says `printerName = "Epson TM-m30"`. **The operator confirmed on 2026-09-03 that the physical device is the Sunso WTP-801 and that it has an Ethernet port** — so the documentation is correct and the *stored setting value is wrong*. Nothing reads `printerName`, so this is cosmetic; the operator should correct the value in Réglages. Left open until that is done. | LOW (stale data value) | operator action |
| DOC-14 | 2026-09-03 | Batch 1.2 | `src/components/pos/product-options-dialog-v2.tsx:110` computes `lineTotal = Math.round((unitPrice + addonsTotal) * qty * 100) / 100` and passes it to `formatEuro` at `:368-369`. `productUnitPrice()` returns integer cents (`cart-store.ts:225`) and add-on prices are cents, so `Math.round(cents * qty * 100) / 100` is exactly `cents * qty` — the displayed figure is **correct**, but the `* 100 / 100` is vestigial euros-era rounding that reads like a cents/euros confusion in a money path. Remove it or replace with a comment. | LOW (code clarity, not a defect) | 7.2 |
| DOC-13 | 2026-09-03 | Batch 1.1 | `src/lib/approvals.ts:17` documents `ApprovalPayload.amount` as `// euros`. Every caller passes and verifies **cents** (`orders-view.tsx` → `/api/auth/approve` → `refund/route.ts:72`, and `payment-dialog.tsx` for discounts). Comment only — the code is unit-consistent and correct — but it is a misleading comment in the module that binds money to an approval, i.e. exactly the class of comment that produced C-01. | LOW (documentation) | 7.1 |

---

# COMPLETED REMEDIATION HISTORY

| Batch | Status | Date | Commit | Notes |
|---|---|---|---|---|
| 0.1 | COMPLETED | 2026-09-03 | `e97a3e1` | C-26, C-26b: anchored 4 bare `.gitignore` patterns; recovered 3 untracked backup API route files into version control. |
| 0.2 | COMPLETED | 2026-09-03 | *(this update)* | P-01/P-02/P-03: repo pushed to `origin/main` (user, interactive), `.env` confirmed preserved out-of-band by user, pre-remediation snapshot + fiscal/row-count baseline recorded. No code changes. |
| 1.1 | COMPLETED | 2026-09-03 | `4766ceb` | C-01: refund dialog made a euros boundary (`parseEuroInput()` in `money.ts`, pre-fill + submit + max-check in `orders-view.tsx`). 9 new tests; 145/145. Validated end-to-end on a scratch copy of the production DB — 5,00 € → 500, 5,50 € → 550, full refund → 690, fiscal chain ok. Production DB untouched. |
| 3.5 | COMPLETED | 2026-09-04 | `83c3cfa` | C-13 + M-04: the manager who approves an above-threshold discount is recorded — a nullable, FK-free `Order.discountApprovedById`, plus the id in the `VENTE` payload and in the `ORDER_CREATED` audit entry (with the amount approved, so an audit query can answer what was authorised). The two payloads moved into `services/sale-journal.ts` so the tests run the route's own code rather than a copy of it. M-04: a refund's journal entry names the printed ticket instead of a cuid, with `number` made a **required** field of `OrderForRefund` so it cannot silently come back. Migration is a plain `ADD COLUMN`, rehearsed on a copy with a fingerprint diff showing nothing else moved — and **not applied to production**; the operator must run `migrate deploy`. Rehearsed end-to-end on a migrated copy: approver in all three places, `orderNumber` 21 not a cuid, chain `ok` at `lastSequence 4`, both pre-existing events byte-identical and still omitting the new key. Both fixes proved to fail on the pre-fix code. **C-22 carried forward as `REQUIRES EXTERNAL VERIFICATION`.** Recorded L-24. 340/340. |
| 3.4 | COMPLETED | 2026-09-03 | `f8c9e9a`, `36ef20c` | C-27: built the fiscal operator screen the backend was already waiting for — chain verification, grand total, sealed closes + the actions to seal, archive generate/download, traced drawer opening, and the journal. Reprint routed through `/api/orders/[id]/reprint` so `REIMPRESSION` is journalled and `reprintCount` increments; the Hello-World scaffold stub became a liveness probe for Batch 1.4's launcher. Validated against the production build on a scratch copy: **five journal event types that had never once been written** (CLOTURE_M, CLOTURE_A, ARCHIVE_GENEREE, OUVERTURE_TIROIR, REIMPRESSION) now written from the UI, all three chains still `ok`, and `sha256sum -c` OK on the archive the UI produced. Manual run found that the home grid keeps its own module list (fixed). 329/329. |
| 3.3 | COMPLETED | 2026-09-03 | `a673a54` | C-04 + M-02: `canonicalize()` gains a Date branch — every timestamp used to serialise to `{}`, so two payloads seven years apart hashed identically — and the archive checksum became the SHA-256 of the exact file bytes, with a `.sha256` manifest, so `sha256sum -c` returns OK for a third party. The checksum is deliberately no longer inside the file. Archive generation split from recording so the file is written before the row, ending the dead end where a failed write blocked regeneration; a row with a missing file is now repaired only if it reproduces byte for byte. Chain re-verified against a copy of production: ok, lastSequence 2, both hashes identical, no payload's canonical form moved. 324/324. |
| 3.2b | COMPLETED | 2026-09-03 | `54aa7ef` | L-23: the four reports the audit did not count — dashboard, cashiers, products, customer detail — routed through the same aggregation. `orderNet()` extracted as the per-order primitive so reports that group by cashier, hour or product id share the rules without sharing an output shape. Tests contrast old against new: the dashboard's face-value sum gave 3500 where the netted figure is 3000; the cashier report gave 900 of cash for a cashier whose only sale was fully refunded. `round2` now only on percentages. 311/311. |
| 3.2 | COMPLETED | 2026-09-03 | `2631308` | C-10 + C-11 + M-13 + M-14: five aggregations collapsed into one pure `aggregateOrders()`. C-10 was the critical one — `aggregatePeriod` summed payments gross, so one refund anywhere in a month put a sealed MonthlyClose permanently out of step with its own Z reports. New `apportion()` (largest remainder) makes per-line splits sum exactly to the whole, at checkout and in the aggregation. `round2` gone from the cents paths this batch owns; `avgTicket` is an integer. Fiscal verification against a copy of production: both sealed Z reports recompute **identically**, zero fields changed. Recorded L-23 — the audit's "four aggregations" was an undercount and three more remain. 306/306. |
| 3.1c | COMPLETED | 2026-09-03 | `9feb4a0`, `23e2971` | L-16 + L-17 + DD-17: VAT moved onto the category with nearest-wins inheritance (own → parent → the product's own rate), mirroring the `inheritCategoryGlobals` pattern the codebase already used; the name-matched "Bouteille / Canette" switch replaced by a real TVA control on both the product and category forms; the rate list constrained to 20/10/5,5 with a French message, which now rejects the "6 %" C-12 used to invent. Checkout snapshots the resolved rate onto `OrderItem`, pinned by a test that moves a category to 20 % and asserts an existing line still reads 5,5 %. Migration rehearsed on a copy and fingerprint-diffed before being run. **Live result: 17/17 drinks at 5,5 %, 61/61 others at 10 %, `Boissons` unset, and every fiscal counter, Z report, event hash and order line unchanged.** 291/291. |
| 3.1d | COMPLETED | 2026-09-03 | `be9efa1` | L-20: the Réglages screen could not be saved at all — the legacy `receiptWidth = 80` failed the max-48 schema Batch 1.3 introduced, so every settings change was rejected, including the two operator actions this plan asks for by hand. `getSettings()` now normalises through the existing `normalizeReceiptColumns()`, which also stops `renderReceipt()` emitting 80-column text for 48-column paper. `saveSettings()` now compares against the stored row, so the legacy value corrects itself on the next save instead of reading as 48 forever while the database says 80. 8 new tests, 6 of which fail on the pre-fix code; verified against a copy of the production database. Recorded L-22. 279/279. |
| 3.1b | COMPLETED | 2026-09-03 | `8a8a09a` | L-18: exposed FACTICE simulation mode, which was wired into all eight fiscal write paths and into renderReceipt() but had no control anywhere, so development sales were journalled as genuine. One card in Réglages, amber while active. 10 new tests covering both directions (the OFF direction is what must hold at the first real sale) plus a pin that `factice` stays out of the hashed payload. Validated end-to-end on a scratch copy: setting persisted and audited, survived a reload, and a real checkout produced FiscalEvent factice=1 and a receipt stamped FACTICE — SIMULATION / TICKET NON VALABLE. Production DB untouched. The manual run found **L-20** (settings screen unsaveable on the live install) and **L-21** (receipts do not wrap a long address). 271/271. |
| 3.1 | COMPLETED | 2026-09-03 | `2d7e996` | C-12: VAT breakdown keyed by the exact rate (new `vatRateKey()`) instead of `Math.round`, so 5,5 % is no longer filed as "6 %" and 2,1 % no longer collapses to "2". Minimal form (`"5.5"`, `"10"`) keeps both existing ZReport rows byte-identical. **DD-03 closed as not applicable** — the `"6"` key has never been written anywhere in this project's history, and the operator confirmed all trading data is test data awaiting P-04. 8 new tests, the 5 behavioural ones proved to fail on the pre-fix code; all four consumers round-tripped; canonicalize() confirmed order-independent. Production DB read-only throughout. 261/261. Recorded L-16/L-17 (drinks at the wrong rate, and the UI that prevents fixing them), L-18, L-19. |
| 2.4 | COMPLETED | 2026-09-03 | `f9fd5cc` | M-29/M-30/M-31/L-04/L-05: removed a 297 MB standalone tree holding a copy of every secret and dropped `output: standalone`; log retention on the Z close (FiscalEvent never pruned); media library 778 ms → 43 ms; report ranges bounded to 370 days; chain verification walks in pages. 253/253. |
| 2.3 | COMPLETED | 2026-09-03 | `e07a860` | C-19 + C-15 (timeout half): WAL applied by a new startup hook — the `sqlite3`-CLI claim in db.ts was wrong, `$queryRawUnsafe` runs the pragma — with a guard that refuses cloud-synced paths; explicit budgets on the seven transactions that seal money. Verified header byte 1→2 and persistence on a scratch copy; worst read while writing 64 ms → 10 ms. Production DB still rollback mode until the DD-02 move. 239/239. |
| 2.2 | COMPLETED | 2026-09-03 | `d09252d`, `3a9bd1f` | C-06 + M-03 + DD-02 + L-15: BACKUP_LOCATION honoured, keep-30 retention, content-addressed media reuse (a Z close no longer re-encrypts ~49 MiB), backup failures surfaced at the Z close, fiscal archives backed up, one data-directory root (`HIBAPOS_DATA_DIR` → `C:\HibaPOS\data`) with an `/uploads` route, and restore refuses a schema mismatch. 230/230. |
| 2.1 | COMPLETED | 2026-09-03 | `723dd52` | C-05 + C-22 (restore half): images restored, atomic rename swap, 503 maintenance gate during the swap, RESTAURATION/SUPPRESSION_SAUVEGARDE journalling, counter-rewind detection, out-of-band decrypt tool. T-01 written; 214/214. Found L-15 (no schema check on restore). |
| 1.2 | COMPLETED | 2026-09-03 | `38d19a2` | C-02: Z-close dialog now passes cents to `Money`/`formatEuro` at all three sites; variance kept in cents (`z-close.ts`). 8 new tests; 153/153. Verified by running the identical scenario pre-fix and post-fix on a scratch DB copy — display went from 2,00 €/2,09 €/-0,05 € to 200,00 €/208,90 €/-5,00 €, while every ZReport and Shift field stayed identical. Production DB untouched. |

---

# FINDING INDEX

Quick lookup from audit ID to batch.

| ID | Batch | ID | Batch | ID | Batch |
|---|---|---|---|---|---|
| C-01 | 1.1 | M-01 | 3.6 | M-25 | 4.4 |
| C-02 | 1.2 | M-02 ✅ | 3.3 | M-26 | 4.4 |
| C-03 | 1.3 | M-03 | 2.2 | M-27 | 4.3 |
| C-04 ✅ | 3.3 | M-04 ✅ | 3.5 | M-28 | 4.3 |
| C-05 | 2.1 | M-05 | 5.5 | M-29 | 2.4 |
| C-06 | 2.2 | M-06 | 3.6 | M-30 | 2.4 |
| C-07 | 1.4 | M-07 | 3.6 | M-31 | 2.4 |
| C-08 | 4.1 | M-08 | 5.6 | L-01 | 7.2 |
| C-09 | 4.2 | M-09 | 5.7 | L-02 | 7.2 |
| C-10 ✅ | 3.2 | M-10 | 5.7 | L-03 | 7.2 |
| C-11 ✅ | 3.2 | M-11 | 5.7 | L-04 | 2.4 / 7.3 |
| C-12 ✅ | 3.1 | M-12 | 5.7 | L-05 | 2.4 (deferred) |
| C-13 ✅ | 3.5 | M-13 ✅ | 3.2 | L-06 | 6.3 |
| C-14 | 5.3 | M-14 ✅ | 3.2 | L-07 | 7.2 |
| C-15 | 2.3 + 4.7 | M-15 | 5.7 | L-08 | 7.2 |
| C-16 | 4.4 | M-16 | 5.7 | L-09 | deferred |
| C-17 | 4.5 | M-17 | 5.7 | L-10 | deferred |
| C-18 | 4.3 | M-18 | 5.7 | L-11 | deferred |
| C-19 | 2.3 | M-19 | 5.7 | L-12 | 7.2 |
| C-20 | 5.1 | M-19s | 4.4 | T-01…T-07 | 6.1 |
| C-21 | 5.2 | M-20 | 5.7 | T-08, T-09 | 6.2 |
| C-22 | 2.1 + 3.5 | M-21 | 5.7 | T-10…T-12 | 6.3 |
| C-23 | 5.4 | M-22 | 5.7 | DOC-01…12 | 7.1 |
| C-24 | 4.6 | M-23 | 4.3 | V-01…V-03, V-08…V-12 | external |
| C-25 | 4.6 | M-24 | 4.4 | V-04…V-07 | 8.1 / 8.2 |
| C-26, C-26b | 0.1 | C-27 ✅ | 3.4 | P-01…P-03 | 0.2 |

---

*Plan created 2026-09-03 from the baseline audit of commit `5ef7dc4`. No application code was modified in its creation.*
