# HibaPOS France — Remediation Record

Evidence record for the controlled remediation of HibaPOS France. Companion to `REMEDIATION_PLAN.md`, the working plan.

**What this file is.** Every batch that reached `COMPLETED` has its full section here — the finding specifications, the *Validation Required* criteria and the *Status Record* — exactly as it stood in `REMEDIATION_PLAN.md` at commit `5f0c2b1` when the plan was split on 2026-09-04. Also here: the completion history table, the resolved rows of *Newly Discovered Issues*, the full rationale of answered design decisions, and the open-thread rows that were retired. Each moved block carries a provenance line naming its source lines; `git show 5f0c2b1:REMEDIATION_PLAN.md` reproduces the file before the split.

**Rules.** Append-only. Nothing here is rewritten; a correction is an appended, dated note. When a batch completes, its whole section moves here verbatim from the plan, under its stage heading, and a stub stays in the plan carrying the constraints the batch leaves behind. Sessions slice this file by heading; it is not meant to be read whole.

**Contents.** Batch 0.1 · Batch 0.2 · Batch 1.1 · Batch 1.2 · Batch 2.1 · Batch 2.2 · Batch 2.3 · Batch 2.4 · Batch 3.1 · Batch 3.1b · Batch 3.1d · Batch 3.1c · Batch 3.2 · Batch 3.2b · Batch 3.3 · Batch 3.4 · Batch 3.5 · Batch 3.6 · Completed Remediation History · Resolved findings · Answered design decisions · Retired open-thread rows · Superseded procedure

---

# STAGE 0 — PRESERVE / ESTABLISH SAFE BASELINE

*Stage heading reproduced for navigation; the stage's status line stays in `REMEDIATION_PLAN.md`.*

## Batch 0.1 — Source-control recovery

*Moved verbatim from `REMEDIATION_PLAN.md` lines 259–315 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

*Moved verbatim from `REMEDIATION_PLAN.md` lines 319–391 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

*Stage heading reproduced for navigation; the stage's status line stays in `REMEDIATION_PLAN.md`.*

## Batch 1.1 — Refund amount unit correction

*Moved verbatim from `REMEDIATION_PLAN.md` lines 401–440 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

*Moved verbatim from `REMEDIATION_PLAN.md` lines 444–481 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

# STAGE 2 — DATA SURVIVAL

*Stage heading reproduced for navigation; the stage's status line stays in `REMEDIATION_PLAN.md`.*

## Batch 2.1 — Backup restore correctness

*Moved verbatim from `REMEDIATION_PLAN.md` lines 583–641 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

*Moved verbatim from `REMEDIATION_PLAN.md` lines 645–701 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

*Moved verbatim from `REMEDIATION_PLAN.md` lines 705–757 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

*Moved verbatim from `REMEDIATION_PLAN.md` lines 761–789 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

*Stage heading reproduced for navigation; the stage's status line stays in `REMEDIATION_PLAN.md`.*

## Batch 3.1 — VAT rate keying

*Moved verbatim from `REMEDIATION_PLAN.md` lines 808–864 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

## Batch 3.1b — FACTICE simulation switch

*Moved verbatim from `REMEDIATION_PLAN.md` lines 896–937 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

*Moved verbatim from `REMEDIATION_PLAN.md` lines 941–981 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

*Moved verbatim from `REMEDIATION_PLAN.md` lines 985–1041 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1045–1124 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1128–1156 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1160–1229 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1233–1311 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1315–1396 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

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

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1400–1449 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**Status:** `COMPLETED` (2026-09-04)

| ID | Status | Problem | Location | Direction |
|---|---|---|---|---|
| **M-01** ✅ | `COMPLETED` | Monthly/annual close chains link by lexicographic *period*, not insertion order. Closing 2026-03 then 2026-01 links January to March's hash; `verifyCloses` sorts by period ascending and reports a permanent break. | `services/fiscal.ts:265-269, 324-328` vs `fiscal.ts:114` | Chain by insertion order (or refuse out-of-order closes). Decide which — see DD-05. |
| **M-06** ✅ | `COMPLETED` (content still subject to V-03) | Receipts print a single "dont TVA" line with no per-rate breakdown, and never print `restaurantTva` despite the setting existing. | `services/receipt.ts:51-56`; `validation.ts:197` | Add the per-rate breakdown and the TVA number. **Content requirements are a fiscal question — see V-03.** |
| **M-07** ✅ | `COMPLETED` | `ZReport` has no refunds total, so the daily close does not itemise the period's corrections. | `prisma/schema.prisma:425-444` | Add refund count and total to the Z report. Requires a migration. |

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

**Status:** `COMPLETED` · **Completed:** 2026-09-04

**Changes:** **(1) M-01 — close sequence.** `assertNextPeriod()` in `services/fiscal.ts` refuses any close that is not the period immediately following the last sealed one; the first close is unconstrained. Applied to both `closeMonth` and `closeYear`, each with its own French wording. The rule is deliberately *exactly the next period* rather than *later than the last*: permitting any later period would let January → March through and strand February forever, which is M-01 again at a smaller scale. The guard runs **before** `aggregatePeriod`, so a refusal touches nothing — a test asserts no row, no `CLOTURE_M` and no consumed sequence number. `nextMonthlyPeriod()` exported and unit-tested, including the December → January rollover. **(2) M-06 — receipt.** A per-rate VAT block above the existing `dont TVA` line, plus `TVA : <restaurantTva>` in the header under SIRET. The breakdown reuses `apportion` + `addToVatBreakdown`, the same arithmetic the checkout transaction seals onto the order, so a ticket cannot disagree with the Z report it rolls into. Rate labels come from the breakdown **key** — already minimal form (`"5.5"`, `"10"`) — with the decimal point swapped for a comma; deliberately **not** `toFixed(1)`, which is L-19 and would print a 1,05 % rate as "1,1 %" on a fiscal document. Rows sort numerically because `"10"` sorts before `"5.5"` as text. `dont TVA` still shows the **stored** `order.vatTotal`, not the recomputed sum: the rows are a derivation, that figure is the fiscal record. **(3) M-07 — Z refunds.** `refundsTotal` and `refundsCount` on `ZReport`, through `aggregateOrders` → `computeShiftReport` → `generateZReport`, into the DTO, the `/api/reports/z` and shift-close responses, the Z detail dialog, **and the sealed `CLOTURE_Z` payload** — which omitted it too, so the daily close journalled its takings but not what it gave back. **(4)** `OrderItemDto` gained `vatRate`: the column has always existed and checkout has always written it, but the DTO never declared it, so no client-side consumer could read it. M-06 is the first.

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260903233731_zreport_refund_totals/`, `src/lib/services/fiscal.ts`, `src/lib/services/receipt.ts`, `src/lib/services/reports.ts`, `src/lib/services/aggregate.ts`, `src/app/api/reports/z/route.ts`, `src/app/api/shifts/[id]/close/route.ts`, `src/features/reports/reports-view.tsx`, `src/types/api.ts`, `src/lib/services/close-sequence.test.ts` (new), `src/lib/services/zreport-refunds.test.ts` (new), `src/lib/services/receipt.test.ts`, `src/lib/services/__snapshots__/receipt.test.ts.snap`

**Tests:** `bun test src --timeout 30000` — **363/363 PASS** (baseline 340 + 23 new). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — compiled successfully. All three fixes were **proved to fail on the pre-fix code**: removing the two guard calls failed 6 of the 12 M-01 tests (the 6 survivors assert what did *not* change — in-order sealing, the free first close, duplicate refusal, tamper detection, and the two pure `nextMonthlyPeriod` cases); reverting the receiver block failed 4 receipt tests including the snapshot; reverting the Z refund plumbing failed 5 of the 6 M-07 tests, the survivor being the zero-refund case, which reads 0 either way and is correct to survive.

**Commit:** `042bcbc` (code + migration + tests) + this plan update.

**Notes:**

**(1) M-01 was reproduced before it was fixed.** On a copy of the production database: seal 2026-03, then 2026-01, and January's `previousHash` becomes March's hash — `verifyMonthlyCloses()` returns `{ok:false, firstBreakAt:1}`. The same two months sealed in order return `{ok:true}`. Because a sealed close can be neither edited nor deleted, that break is permanent and unrepairable. The trigger is not exotic: the "Clôturer le mois" control is two free-typed number fields, defaulting to the current month but freely editable, so one wrong entry does it.

**(2) The premise check decided the design.** **Zero** `MonthlyClose` and `AnnualClose` rows have ever existed here — verified read-only on the live file. So the stricter option could be adopted with nothing to accommodate, and the decision cost nothing today that it will cost after the first real close. Recorded as **DD-05**.

**(3) The migration rebuilds a table of sealed fiscal documents.** Unlike Batch 3.5's plain `ADD COLUMN`, Prisma emitted a full `ZReport` rebuild — `CREATE TABLE new_ZReport` / `INSERT … SELECT` / `DROP TABLE` / `RENAME` — because the new columns are NOT NULL with a default. That is the same shape as the `Product` rebuild in Batch 3.1c and was treated the same way: applied to a copy and fingerprint-diffed. **Only the two new columns and the `_prisma_migrations` row changed.** Both sealed Z reports came through with identical `salesTotal`, `salesCount`, `vatTotal` and `vatBreakdownJson`; counts, `FiscalCounter`, `GrandTotal` and both event hashes identical; `integrity_check ok`, 0 FK errors, pre-existing column order preserved. Keeping the columns nullable would have avoided the rebuild, and was rejected: a Z report always has a refund total, and `0` is the true value for both existing rows — there are no refunds anywhere in the database — so a nullable column would encode "unknown" where the answer is known.

**(4) Rehearsed end-to-end on a migrated copy of the real database.** Using the real catalogue: `7 Up` (a real `Canette` product) resolves to **5,5 %** and `Margarita` to **10 %** through `resolveVatRate`, and the rendered ticket carries `TVA 5,5 % (HT 1,42 €) … 0,08 €` and `TVA 10 % (HT 8,09 €) … 0,81 €` in that order, `dont TVA 0,89 €` matching the stored `vatTotal` of 89, and `TVA : FR 12 345678901`. A partial refund then produced `Z#3 · refunds 100 × 1` in both the row and the sealed `CLOTURE_Z` payload. Sealing 2026-08 and then attempting 2026-07 was refused with *« Clôture hors séquence : le prochain mois à clôturer est 2026-09, pas 2026-07 »* and wrote nothing; 2026-09 and exercice 2026 then sealed normally. Afterwards all three chains verified — events `ok/7`, monthly `ok/2`, annual `ok/1` — both pre-existing events were byte-identical (`9471bd79…`, `b794c6a1…`), and both sealed Z rows read `0/0` rather than null.

**(5) Every line M-06 adds fits the paper; one pre-existing line does not.** The four added lines are at most **48** columns. The receipt's widest line is **56** — the restaurant's real address, `23 Grande Rue 45210, 45210 Ferrières-en-Gâtinais, France` — which is **L-21**, recorded in session 3 and deliberately not touched here. The rehearsal asserts both directions so a future session cannot mistake L-21 for something this batch caused.

**(6) V-03 is not answered and is not claimed to be.** The operator chose on 2026-09-04 to add the per-rate breakdown and the TVA number now, on the same footing as the V-14 VAT-rate determination: their call, applied by Claude, with professional confirmation still available and nothing waiting on it. Safety rule 13 stands — no compliance claim rests on this work. Whether a compliant ticket needs anything further (software identification, for instance) remains open.

**(7) Only new receipts change.** `renderReceipt` runs at checkout and the stored snapshot is what the reprint path prints, verbatim. Existing `Receipt.content` rows are untouched, which is both correct and unavoidable — an archived receipt is immutable (and see L-14).

**(8) Two issues recorded, neither fixed** (safety rule 10): **L-25** (the close guard does not stop you sealing a month that has not finished) and **L-26** (`MonthlyClose` / `AnnualClose` hash a `totalRefunded` they have no column for).

---

## Batch 3.6b — Close timing and close columns

*Moved verbatim from `REMEDIATION_PLAN.md` lines 840–913 (commit `b7c9807`, plus this batch's status record) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**Status:** `COMPLETED` (2026-09-04) · Decided in **DD-18**, 2026-09-04 · Addresses **L-25**, **L-26**

Runs **before Batch 4.1**. Both items are cheap while zero monthly and annual closes exist (*Open Threads → G*) and expensive afterwards: a premature seal is permanent, and L-26's migration would then rebuild tables holding sealed fiscal documents.

### L-25 — A month or year can be sealed before it has ended

**Status:** `COMPLETED` · Severity: MEDIUM · Category: fiscal (sealed-period integrity)

**Problem.** `closeMonth` and `closeYear` check order (Batch 3.6, `assertNextPeriod()`) but not time. Sealing the current month succeeds on any day of it and seals a partial period as the whole; the period is `@unique`, so the rest of the month can never be sealed and never appears in any close. The "Clôturer le mois" control defaults to the current month, so the wrong period is the one proposed. A second timing gap in the same place: a period can be sealed while a shift inside it is still `OPEN`, so the sealed period exists before its own last Z report does, and the reconciliation Batch 3.2 established (period close = sum of its Z reports) cannot be checked at sealing time.

**Location.** `src/lib/services/fiscal.ts` (`closeMonth`, `closeYear`, `assertNextPeriod`); `src/features/fiscal/fiscal-view.tsx` (period fields and their defaults); `src/app/api/fiscal/close-month/route.ts`, `src/app/api/fiscal/close-year/route.ts`.

**Decision (DD-18, 2026-09-04).** Refuse, server-side and without an override: a close whose period end is still in the future, and a close with any `OPEN` shift whose opening time falls inside the period. The screen defaults to the last completed month, and the last completed year, not the current one. "Ended" is judged the way the existing code derives period boundaries (confirm the convention in `aggregatePeriod` and reuse it rather than inventing a second one); refusing at 23:30 on the last day of the period is accepted behaviour.

**Remediation direction.** A guard beside `assertNextPeriod()`, running **before** `aggregatePeriod` so a refusal writes nothing; French messages naming the period and the reason; the same two rules applied to `closeYear`. Confirm what `closeYear` currently requires of the year's monthly closes and record it — do not add a further requirement without a decision. Change only the defaults in the UI, not its shape.

### L-26 — Monthly and annual closes hash a refunds total they have no column for

**Status:** `COMPLETED` · Severity: LOW · Category: data integrity (consistency with M-07)

**Problem.** `aggregatePeriod` returns `totalRefunded`; it is spread into `dataPayload`, so it is inside `dataJson` and covered by the close hash, but `MonthlyClose` and `AnnualClose` have no column for it, so no query, report or screen can read it without parsing JSON. `ZReport` gained `refundsTotal` / `refundsCount` in M-07; the period closes did not, because M-07 named only `ZReport`.

**Location.** `prisma/schema.prisma` (`MonthlyClose`, `AnnualClose`); `src/lib/services/fiscal.ts` (`closeMonth`, `closeYear`); `src/features/fiscal/fiscal-view.tsx` (closes list).

**Remediation direction.** Add `refundsTotal` and `refundsCount` to both models, NOT NULL with default 0 (the M-07 convention), write them from the aggregation, and show them beside the sales figures. **The hashed payload must not change shape** unless the change is proved not to alter any existing close — with zero closes there is nothing to alter, and the test must say so explicitly rather than assume it. Requires a migration: rehearse and fingerprint-diff on a copy (*Methods*), then hand the operator the command.

### Batch 3.6b — Validation Required

- Targeted test: sealing the current month is refused, writes no row, no `CLOTURE_M`, and consumes no sequence number; sealing the previous month succeeds.
- Targeted test: the boundary — a close attempted on the last day of the period is refused; the same close on the first day of the next period succeeds.
- Targeted test: a period with an `OPEN` shift inside it is refused; the same period succeeds once the shift is closed.
- Targeted test: `closeYear` obeys both rules.
- Targeted test: `assertNextPeriod()` and the timing guard both run before `aggregatePeriod`; a refusal for either reason leaves the database untouched.
- Test: the fiscal screen's default period is the last completed month and the last completed year.
- Targeted test: `MonthlyClose.refundsTotal` / `refundsCount` and the annual equivalents equal the period's refunds; the `CLOTURE_M` / `CLOTURE_A` payloads still verify.
- Migration applied cleanly on a copy of the production database; the fingerprint diff shows only the new columns and the `_prisma_migrations` row; every sealed row (Z reports, events) unchanged; `/api/fiscal/verify` reports `ok`.
- Every new behavioural test proved to fail on the pre-fix code (Stage 3 rule).
- `bun test src --timeout 30000` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS.
- Manual, on a scratch copy with **both** `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden: the screen proposes the last completed month; attempting the current month shows the French refusal and writes nothing.
- **Fiscal question, not a code question:** whether a compliant period close must satisfy further timing rules stays with V-08. No compliance claim rests on this batch (safety rule 13).

### Batch 3.6b — Status Record

**Status:** `COMPLETED` · **Completed:** 2026-09-04

**Changes:** **(1) L-25 — timing.** Two guards beside `assertNextPeriod()` in `services/fiscal.ts`, both running **before** `aggregatePeriod` so a refusal writes nothing: `assertPeriodEnded()` refuses a period whose exclusive upper bound `now` has not reached, and `assertNoOpenShiftInPeriod()` refuses one holding a still-`OPEN` caisse. Applied to `closeMonth` and `closeYear` alike, each with its own French wording naming the period and — for a premature close — the first date it becomes sealable. No override: a test pins that FACTICE mode does not unlock one. Both functions gained a trailing `now = new Date()` parameter so the clock is injectable; the two routes are unchanged. **(2) One convention, not two.** DD-18 asked that "ended" be judged the way the code already derives period boundaries, so the half-open local-time bounds `closeMonth` / `closeYear` were handing to `aggregatePeriod` moved into a new pure `src/lib/period.ts` (`monthBounds`, `yearBounds`, `hasPeriodEnded`, `lastCompletedMonth`, `lastCompletedYear`, `localDay`), which the service and the screen both import — no `node:` imports, so the client bundle takes it. `buildAnnualArchive` still derives its own year bounds inline and was deliberately left alone: an archive is a read, not a close. **(3) The screen.** `fiscal-view.tsx` proposed the **current** month — the one period the server now refuses. Both close fields now propose the last completed period; the exercice field already did, which this batch confirms rather than changes. Two hint lines state the new rules; the shape of the screen is unchanged. **(4) L-26 — columns.** `refundsTotal` and `refundsCount` on `MonthlyClose` and `AnnualClose`, NOT NULL with default 0 (the M-07 convention), written from the aggregation and shown as a `Remboursements` column beside Ventes and TVA. `PeriodAgg` gained `refundsCount`, so the hashed payload gains it too — see note 2.

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260904091947_close_refund_totals/`, `src/lib/period.ts` (new), `src/lib/services/fiscal.ts`, `src/features/fiscal/fiscal-view.tsx`, `src/lib/services/close-timing.test.ts` (new), `src/lib/services/close-sequence.test.ts`, `src/lib/services/fiscal.test.ts`, `src/lib/services/aggregate.test.ts`, `src/lib/services/fiscal-surface.test.ts`

**Tests:** `bun test src --timeout 30000` — **384/384 PASS** (baseline 363 + 21 new). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — compiled successfully. Both halves were **proved to fail on the pre-fix code**: removing the four guard calls failed **7 of the 21** new tests, and removing the two column writes plus `PeriodAgg.refundsCount` failed **3 of the 4** L-26 tests — the survivor being the zero-refund case, which reads 0 either way and is correct to survive, the same shape as M-07's survivor in Batch 3.6. The rest of the new tests are boundary and default-proposal tests over `src/lib/period.ts`, a module this batch creates: "fails on the old code" is not a meaningful claim for them, and they are not counted as if it were.

**Commit:** `545b255` (code + migration + tests) + this plan/record update.

**Notes:**

**(1) The Batch 3.6 migration had already been applied — the plan was stale.** Open Threads → A and B said `20260903233731_zreport_refund_totals` was written but unapplied. Read-only inspection of `db/custom.db` at the start of this batch shows it in `_prisma_migrations` with `finished_at` 2026-09-04 00:54:37, matching the file's mtime to the millisecond, and `ZReport` carrying `refundsTotal` / `refundsCount` with both sealed rows reading `0/0`. The production hash is therefore **`7cc3367b8ff8518338bc5d00354cce4fde761d71d3b6a14336ed22c6209cc152`**, not the `ea990b79…` the plan recorded. Everything else matches the session-4 baseline exactly: 2 Z reports, 2 fiscal events with unchanged hashes, counters `20/3/2/2`, 78 products, **0 `MonthlyClose` and 0 `AnnualClose` rows**. Threads A, B and G corrected.

**(2) The hashed payload's shape changed, and that is provable rather than assumed.** `dataPayload` spreads the aggregation, so adding `refundsCount` to `PeriodAgg` puts it inside `dataJson` and under the close hash. A close sealed before this batch would hash differently from one sealed after — safe here and nowhere else, because **zero closes have ever existed** (note 1). A test asserts that premise explicitly (`monthlyClose.count() === 0`, `annualClose.count() === 0`) before pinning the payload's key list, so if the premise is ever gone the test says so instead of the change going through quietly. `totalRefunded` was already in the payload and keeps its name; the column beside it is `refundsTotal`, matching `ZReport`.

**(3) Migration rehearsed on a copy, fingerprint-diffed.** Out-of-band snapshot first: `db-snapshots/custom.db.pre-3.6b.2026-09-04T08-27-38Z` (`7cc3367b…`). Prisma emits a **table rebuild** for both models — `CREATE TABLE new_…` / `INSERT … SELECT` / `DROP` / `RENAME` — its usual choice for NOT NULL + default, and the same shape as the 3.6 one. It is far less invasive here: both tables are **empty**, so the `INSERT … SELECT` moves nothing and no sealed document is rewritten. The fingerprint diff over every fiscal table before and after is **50 lines and contains nothing else**: the two new columns on each model (with the following columns' `cid` shifted by two, which is what a rebuild does), `_prisma_migrations` 5 → 6, and the new migration row. Row counts, `FiscalCounter`, `GrandTotal`, both event hashes, both sealed Z reports, all 20 orders and their lines, all 78 products, categories, settings, every index, `integrity_check ok` and 0 foreign-key errors — identical. Claude cannot run `migrate deploy` against production; the operator's command is in *Open Threads → B*.

**(4) Rehearsed end-to-end through the real HTTP routes, on a migrated copy of the production database.** Server started with **both** `DATABASE_URL` and `HIBAPOS_DATA_DIR` pointed at the copy, and the copy proved before the first write by reading a marker back from the pre-auth `GET /api/auth/profiles` (`Administrateur SCRATCH-3.6B`). `POST /api/fiscal/close-month {2026,9}` → 409 *« Clôture prématurée : le mois 2026-09 n'est pas terminé. Il ne pourra être clôturé qu'à partir du 2026-10-01… »*. `{2026,8}` → 409 *« Clôture impossible : la caisse n° 3, ouverte pendant 2026-08, n'est pas clôturée. Clôturez-la (rapport Z) avant de sceller le mois 2026-08 »* — the real caisse #3, genuinely still open on the live data. `POST /api/fiscal/close-year {2026}` → 409 *« …l'exercice 2026 n'est pas terminé… à partir du 2027-01-01 »*. After all three: no close row, journal still `ok` at `lastSequence 2`, counters untouched. Caisse #3 was then marked closed on the copy and 2026-08 sealed normally — `salesTotal 42400`, `refundsTotal 0`, `refundsCount 0`, `refundsCount` present in the sealed `dataJson`, all three chains `ok`. Production afterwards: same sha256, same mtime, same size, no `-wal` / `-shm` sidecars, `db/backups/` untouched and no `db/fiscal-archives/` created.

**(5) The screen was driven, not merely reasoned about.** On that same server the fiscal view proposed **2026 / 8** and **exercice 2025**, not the current month or year. Typing `9` and pressing « Clôturer le mois » produced the French refusal toast verbatim and left the closes table showing only 2026-08. The `Remboursements` column renders as `0,00 € × 0`. Claude cannot type a PIN, so the session was established by minting a signed cookie for the copy's own SUPER_ADMIN and setting it through the DOM; everything after that is the application's own code path, and the refusal came from the route, not from the client.

**(6) What `closeYear` still does not require, recorded rather than changed.** It asks **nothing** of the year's twelve monthly closes. The screen's hint has always said « Clôturez les douze mois avant l'exercice » and the code has never enforced it. The plan asked for this to be confirmed and recorded, not tightened: adding that requirement is a decision nobody has taken. A test pins the current behaviour so a future change has to be deliberate.

**(7) Five existing tests were updated, none deleted or weakened.** The timing guard makes any test that seals a not-yet-finished period fail by design, so `close-sequence.test.ts` (which is about *order*) now runs on a clock set past every period it touches, `fiscal.test.ts` closes its caisse and seals at the first instant of the following month, and `aggregate.test.ts` / `fiscal-surface.test.ts` pin their clock instead of depending on the real one. Every assertion in all five is unchanged; the guard-specific reason is stated in a comment at each site.

**(8) One issue recorded, not fixed** (safety rule 10): **L-27** — the open-caisse rule is scoped, as DD-18 wrote it, to caisses *opened inside* the period, so a caisse opened earlier and still open does not block the close. Reachable only through the first-ever close, because sealing any later period requires the previous one, which that caisse would itself have blocked.

**(9) Environment.** `bunx prisma generate` fails `EPERM` on the query-engine DLL, and the cause is now identified: the leftover process from Batch 3.1b is a **`next start` server still listening on port 3010**, serving a session-3 scratch copy (its admin is still named `SCRATCH-3.1b-Administrateur`). It holds the engine open. Prisma writes the TypeScript client *before* copying the engine, so generation is in fact complete and only the redundant DLL copy fails — but the operator should stop PID 2072. This batch's own server ran on port 3021 and was stopped when it finished.

---

# STAGE 4 — SECURITY & INTEGRITY

*Stage heading reproduced for navigation; the stage's status line stays in `REMEDIATION_PLAN.md`.*

## Batch 4.1 — Manager-approval brute force

*Moved verbatim from `REMEDIATION_PLAN.md` lines 876–907 (commit `0285ce6`, plus this batch's status record) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**Status:** `COMPLETED` (2026-09-04)

### C-08 — Manager-approval PIN can be brute-forced

**Status:** `COMPLETED` · Severity: HIGH · Category: security (privilege escalation)

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

**Status:** `COMPLETED` · **Completed:** 2026-09-04 · **Commit:** `f14a50c` · **Findings:** C-08

**Changes.**

**(1) The rate-limit key stopped believing the caller.** `clientIp()` read `X-Real-IP`, falling back to the first `X-Forwarded-For` hop, on the strength of a comment describing a Caddy reverse proxy deleted in commit `0aeea30`. With no proxy in front, both headers are whatever the caller sent, so any authenticated caller could mint a fresh bucket per request. It now returns the constant `"local"` unless `TRUST_PROXY_HEADERS` declares a real proxy, in which case the old precedence is restored exactly. This costs nothing in the real deployment — a browser sends neither header, so legitimate traffic already collapsed onto the single key `"unknown"`; only a caller who forged the header got a private bucket. Five routes key on this one function (`login`, `unlock`, `switch-user`, `profiles`, `approve`), so the bypass closes for all five.

**(2) The approve key dropped the IP outright.** `approve:<ip>:<caller>` became `approve:<caller>` (`approvalRateLimitKey`), so header rotation cannot reach it even if a later deployment turns `TRUST_PROXY_HEADERS` on. Both windows are unchanged: 5 per minute, 15 per fifteen minutes.

**(3) A persistent lockout — `src/lib/services/approval-lockout.ts`.** Five wrong manager PINs from one caller inside fifteen minutes — login's own constants — and every further approval from that caller is refused `423` with `Retry-After`, until the oldest counted failure ages out of the window. It is checked **before** the manager loop, so a locked caller cannot make the server run scrypt against every manager. A refusal records nothing, so hammering the lock cannot extend it. The counter is the `MANAGER_APPROVAL_FAILED` audit row this route already wrote — indexed on `userId`, unchanged in shape, and durable across a restart, which the in-memory limiter is not.

**(4) What is deliberately *not* locked: the caller's account.** `getSession()` treats a live `User.lockedUntil` as session revocation, so writing the lock where login writes it would eject a cashier from the till mid-service, with their caisse still open, every time a manager fumbled five PINs. The lock is on the approval *capability* instead: sales continue, only the operations needing a manager stop. Locking every manager was never available either — the PIN is tested against all of them, and any cashier could then take manager approval off the till in twenty-five keystrokes.

**(5) One new audit action.** `MANAGER_APPROVAL_LOCKED`, written once at the transition, so an operator can see in the audit view why approvals stopped working. It carries its own action name, so it never inflates the failure count it describes.

**Files:** `src/lib/http-rate-limit.ts`, `src/app/api/auth/approve/route.ts`, `src/lib/services/approval-lockout.ts` (new), `src/lib/services/approval-lockout.test.ts` (new), `src/lib/http-rate-limit.test.ts` (new), `.env.example`. **No migration** — nothing was added to the schema, so unlike Batches 3.5, 3.6 and 3.6b this fix is in force the moment the code runs.

**Tests:** `bun test src --timeout 30000` → **400 pass, 0 fail** (384 before; 16 new across two files). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS. The seven `approvals.test.ts` cases still pass untouched. **Proved to fail on the pre-batch behaviour**, per the Stage 3 method: with `clientIp` reverted to its old body and the lockout replaced by the pre-batch route logic (write the audit row, return, no counter), **10 of the 16 fail** — every header-rotation assertion and every lock assertion. The one `clientIp` test that passed on old code is the one asserting the *trusted-proxy* path, which is the old behaviour by design. Files were restored from copies taken before the revert and re-checked by sha256 (`ac0d1bef…`, `f6d60c5d…`).

**Notes.**

**(1) The lock is derived from the audit log, and that was a choice.** The alternative was two new columns on `User`, which means a migration — and a migration means the operator must run `migrate deploy` before the fix does anything, which is exactly the inert-until-someone-acts state *Open Threads → A* exists to track. A security fix should not wait on that. The audit rows were already being written, `AuditLog.userId` is indexed, and `AUDIT_LOG_RETENTION_DAYS` prunes in whole days at best (`log-retention.ts` floors the value), so pruning can never reach inside a fifteen-minute window. The cost is that `audit()` swallows its own write failures: if the row is never written the count does not advance, and the in-memory limiter is then the only wall. That is why wall 1 was kept rather than replaced.

**(2) A sliding window, not login's fixed stamp.** Login writes `lockedUntil = now + 15 min`. Here the window slides: the lock lifts as the oldest counted failure ages out, so a caller who stops trying recovers gradually instead of at a stamped instant. It also means a successful approval does **not** reset the count, which login does — the `MANAGER_APPROVAL_GRANTED` row is keyed to the *approver*, with the requester only inside the JSON `details`, so counting failures since the last grant would need an unindexed `LIKE` over an unbounded table. Five cumulative fumbles in fifteen minutes at one till costs that till its discount and refund approvals for a few minutes; it does not cost it a sale.

**(3) Validated end-to-end against the production build on a scratch copy.** Server started with **both** `DATABASE_URL` and `HIBAPOS_DATA_DIR` pointed at the copy, and the copy proved before the first write by reading the marker `MARQUEUR-4.1-SCRATCH` back from the pre-auth `GET /api/auth/profiles`. Accounts were synthetic, with PINs generated for the run — no real PIN was used anywhere. With a **different forged `X-Real-IP` and `X-Forwarded-For` on every request**: attempts 1–4 → `403 « PIN manager invalide. »`, attempt 5 → `423 « Approbations bloquées après 5 PIN manager invalides. Réessayez dans 15 min. »` with `Retry-After: 895`, attempt 6 → `429` from wall 1. `GET /api/auth/me` then returned the cashier's own user, so **the session survived the lock**. A second cashier got a plain `403` (per-caller), a correct manager PIN returned `200` with an amount-bound token (`amount 12.5`), and a manager approving themselves got `403 « Auto-approbation interdite. »`. **The limit of this evidence:** the flow was exercised through the real HTTP routes, not through the `ManagerApprovalDialog` in a browser, and not at the till — the restaurant's machine has no copy of the app (*Hardware-dependent validation*) and Claude cannot type a PIN. That the `423` reaches the operator as a French toast is read from `api-client.ts` (any non-`ok` response throws with `data.error`) and `manager-approval-dialog.tsx:74-76`, not observed.

**(4) The lock was then proved to survive a restart.** The server was stopped and a **fresh process** started on another port — emptying the in-memory limiter — and the locked cashier's next attempt returned `423`, not `429`, with `Retry-After: 867`, i.e. the same window counting down. On that same fresh process the untouched cashier still obtained a token. The scratch audit trail afterwards reads exactly five `MANAGER_APPROVAL_FAILED` rows, then one `MANAGER_APPROVAL_LOCKED` three milliseconds later, then the second cashier's separate failure and two `MANAGER_APPROVAL_GRANTED` rows in their unchanged shape — and no failure row for the `429`, confirming a refused attempt does not extend the lock. All four scratch `User` rows still read `failedAttempts 0`, `lockedUntil null`.

**(5) Production untouched, and it had moved before this session started.** `db/custom.db` was `a66bc96c20d3f00282ea249361dd80d6303434b1a43331c0725258b637db46f9` before and after, same mtime (2026-09-04 09:43), no `-wal` / `-shm` sidecars, `db/backups/` untouched, no `db/fiscal-archives/` created. That hash is **not** the `7cc3367b…` the plan recorded: read-only inspection found `20260904091947_close_refund_totals` applied at 2026-09-04 09:43:54 UTC+1 with `refundsTotal` / `refundsCount` present on `MonthlyClose` and `AnnualClose`, both still empty, so **the operator applied the Batch 3.6b migration** and *Open Threads → A and B* were stale. Everything else in the baseline is unchanged: 78 products, counters `20/3/2/2`, zero closes, `journal_mode delete`, `integrity_check ok`, all three chains `ok` at `lastSequence 2`. Production carried **zero** `MANAGER_APPROVAL_*` audit rows, so the new counter starts from nothing.

**(6) Two issues recorded, not fixed** (safety rule 10): **L-28** — `test-setup.ts` deletes a stale `test.db-wal` and `-shm` but not `test.db-journal`, and a killed run leaves one behind; **L-29** — `limitOr429` in the same module is exported and called from nowhere.

**(7) Environment.** The Batch 3.1b leftover (PID 2072, port 3010) is still listening and was **not** touched. `bun run build` succeeded despite it. This batch's two scratch servers ran on ports 3022 and 3023 and were both stopped; `TaskStop` on the wrapper shell did not stop the `next start` child, which had to be stopped by PID — worth knowing for the next session that starts one.

## Batch 4.2 — Asynchronous scrypt

*Moved verbatim from `REMEDIATION_PLAN.md` lines 901–932 (commit `5c249f2`, plus this batch's status record) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**Status:** `COMPLETED` (2026-09-04)

### C-09 — Synchronous scrypt on the request thread freezes the POS

**Status:** `COMPLETED` · Severity: HIGH · Category: security / availability

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

**Status:** `COMPLETED` · **Completed:** 2026-09-04 · **Commit:** `4022c9c` · **Findings:** C-09 (and T-04, written here as its prerequisite)

**Changes.**

**(1) The derivation left the request thread.** `hashPin`, `verifyPin` and `verifyPinDetail` return promises and call `crypto.scrypt`'s callback form — the shape `backup.ts:120-135` already used. Nothing about the KDF moved: same N=2^17, r=8, p=1, same 64-byte output, same `salt:hash` storage, so no stored hash is invalidated and there is **no migration**. Measured against a build of the pre-batch code on the same scratch copy: while one wrong manager PIN was verified against every manager (~1.6 s of scrypt), the old build served **6** concurrent `GET /api/auth/profiles`, worst latency **1608 ms**; the new build served **491**, worst **24 ms**.

**(2) The legacy parameters are now written out.** The fallback was `scryptSync(pin, salt, 64)`, i.e. whatever Node's defaults happen to be. It is now `{ N: 1 << 14, r: 8, p: 1 }` explicitly, so a change in a library default cannot silently lock out every pre-hardening account. T-04's fixtures are still generated with the old default-argument call, which is what proves the two are the same thing.

**(3) A bound, because off-thread is not the same as free — `src/lib/pin-hash-queue.ts` (new).** Async scrypt still holds ~128 MiB per call and still occupies the shared thread pool. Two derivations run at once, thirty-two may wait, and the next is refused with `ScryptBusyError` **before** it starts. Two rather than the pool's four: the pool also serves file I/O, and two caps derivation memory near 256 MiB. Measured: 60 simultaneous logins with unknown usernames → 34 served, 26 refused `503`; on the pre-batch build all 60 were accepted and the burst took **29.3 s**.

**(4) The refusal is a 503, not a 500.** `scryptBusyResponse()` sits beside the restore-maintenance 503 in `api-handler.ts`, and `withAuth` / `withAuthParams` catch **only** `ScryptBusyError` and rethrow everything else, so no route's existing failure behaviour changes. `login`, `unlock` and `seed` are not wrapped by those helpers and catch it themselves.

**(5) Every call site awaited, including two that would otherwise have stored a promise.** `login` and `unlock` spread `hashPin(pin)` straight into Prisma's `data` on the legacy-upgrade path; unawaited that writes the string `"[object Promise]"` into `User.pinHash` and locks the account out at the next login. Both were hoisted to an awaited local. `scripts/seed-users.ts` is excluded from **both** `tsconfig.json` and `eslint.config.mjs`, so nothing but reading it catches the same mistake there — it now carries a comment saying so.

**(6) `/api/auth/approve` still verifies managers sequentially.** Deliberate: the loop no longer blocks anything, and running the managers in parallel would multiply the 128 MiB footprint by their number.

**Files:** `src/lib/auth.ts`, `src/lib/pin-hash-queue.ts` (new), `src/lib/pin-hash-queue.test.ts` (new), `src/lib/auth-legacy-pin.test.ts` (new), `src/lib/auth-async-pin.test.ts` (new), `src/lib/auth.test.ts`, `src/lib/api-handler.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/unlock/route.ts`, `src/app/api/auth/switch-user/route.ts`, `src/app/api/auth/approve/route.ts`, `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`, `src/app/api/seed/route.ts`, `prisma/seed.ts`, `scripts/seed-users.ts`. **No migration** — the schema is untouched, so as in Batch 4.1 the fix is in force as soon as the code runs.

**Tests:** `bun test src --timeout 30000` → **413 pass, 0 fail** (400 before; 13 new across three files, and `auth.test.ts`'s three existing cases now await). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS. **Both halves proved against the pre-batch code**, per the Stage 3 method. C-09: with `src/lib/auth.ts` restored from `HEAD` and every other file left as this batch wrote it — so that only `scryptSync` versus `scrypt` differed — the two `auth-async-pin.test.ts` cases fail with **zero** timer ticks delivered during a 476 ms and a 439 ms derivation, against the ~19 and ~17 the assertions demand. The nine T-04 and `auth.test.ts` cases pass on that same old code, which is correct: they guard behaviour that already worked. T-04's own bite was shown separately, by deleting the legacy fallback from the fixed `auth.ts` — 2 of its 6 cases fail, and they are exactly the two that touch the legacy path. `pin-hash-queue.test.ts` has no pre-batch counterpart; the module is new. `src/lib/auth.ts` was restored from a copy taken before each revert and re-checked by sha256 (`af397503…`).

**Notes.**

**(1) The load check in full, because the finding is about latency and nothing else here states it.** Two production builds of this same tree, differing only in `src/lib/auth.ts`, each started with **both** `DATABASE_URL` and `HIBAPOS_DATA_DIR` pointed at a scratch copy of the production database. Idle `GET /api/auth/profiles` is 4–8 ms on both. During one wrong manager PIN: pre-batch, **6 requests served, worst 1608 ms** — a till that stops answering for a second and a half every time a manager fumbles a PIN, which is what the audit described. Post-batch, **491 served, worst 24 ms**. The approve itself takes about the same wall-clock time either way (1644 ms → 1854 ms); that was never the complaint.

**(2) What the bound costs, stated plainly.** Refusing is a behaviour change: under a flood of PIN guesses an honest cashier can now be told `503 « Trop de vérifications de code PIN en cours. Réessayez dans un instant. »` instead of waiting. That is the trade the finding asks for — a till that answers is worth more than a till that queues — but it is a trade, and the numbers above are what it was chosen on.

**(3) Validated end-to-end through the real routes, on the production build, against a scratch copy.** The copy was proved before the first write by reading the marker profile `MARQUEUR-4.2-SCRATCH` back from the pre-auth `GET /api/auth/profiles`. Every account was synthetic with a PIN generated for the run — **no real PIN was used anywhere**, and the two real rows in the copy were never touched. A **legacy N=2^14** account logged in `200`, its stored hash changed, and the new hash answers to the strong parameters and not the legacy ones; a second login left it alone. The same upgrade was exercised through `/api/auth/unlock` with a second legacy account. A strong-hashed account logged in with its hash untouched, a wrong PIN still returned `401 « Code PIN incorrect »`, `switch-user` returned `200`, a correct manager PIN returned `200` with an amount-bound token, and a wrong one `403 « PIN manager invalide. »` — Batch 4.1's walls intact.

**(4) The limit of that evidence.** All of it went through HTTP, not through the PIN pad in a browser, and not at the till: the restaurant's machine has no copy of the app (*Hardware-dependent validation*) and Claude cannot type a PIN. The criterion "login, unlock, switch-user and manager approval all still work **at the till**" is therefore satisfied only at the route level. That the 503 reaches the operator as a French toast is read from `api-client.ts` and the dialogs, not observed.

**(5) Production untouched.** `db/custom.db` is `a66bc96c20d3f00282ea249361dd80d6303434b1a43331c0725258b637db46f9` before and after, mtime unchanged at 2026-09-04 09:43:54, no `-wal` / `-shm` sidecars, `db/backups/` untouched, no `db/fiscal-archives/` created. Read-only inspection re-confirmed the rest of the baseline: 78 products, counters `20/3/2/2`, two Z reports, zero closes, six migrations with none pending, `journal_mode delete`, `integrity_check ok`. Both live accounts store a 161-character hash — 32 hex of salt, a colon, 128 hex of key — which is the shape produced by **both** parameter sets, so nothing in the file says whether the two real PINs are legacy-hashed. That is precisely why the fallback had to survive this batch, and why T-04 was made its prerequisite.

**(6) One issue recorded, not fixed** (safety rule 10): **L-30** — the unknown-username burn at login now competes for the bounded queue, and since Batch 4.1 made the rate-limit key's IP component a constant, a caller cycling usernames still gets a fresh bucket per name. The 26 × `503` in the burst above is that path working as designed, and also that path being abused.

**(7) Environment, corrected.** The plan's environment item 6 blames a leftover `next start` on **port 3010** (PID 2072) for `bunx prisma generate` failing `EPERM`. Port 3010 is now free and PID 2072 is gone, and **`bunx prisma generate` still fails `EPERM`** on the same query-engine DLL rename. Two older `next start` servers are still running from an earlier session — PIDs 4016 (`-p 3011`) and 24116 (`-p 3012`), with their `bunx` parents 10540 and 22844, started 2026-09-03 23:05 and 23:12. They are the remaining candidates. The failure stays harmless for the same reason as before: Prisma writes the TypeScript client before copying the engine.

**(8) This batch's own servers were stopped.** Ports 3024 (fixed code) and 3025 (pre-batch code) are free. As Batch 4.1 note 7 warned, `TaskStop` on the wrapper shell does not stop the `next start` child; both had to be stopped by PID.

**(9) The suite is faster than L-24 recorded**, at 80–100 s against the ~192 s in that finding, on the same `--timeout 30000`. Nothing in this batch explains it — only `auth.test.ts` and the three new files derive PINs. Recorded as an observation, not a claim; L-24's advice to pass the timeout stands.

---

# COMPLETED REMEDIATION HISTORY

*Moved verbatim from `REMEDIATION_PLAN.md` lines 2357–2378 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

*Row order is as it was: 0.1, 0.2, 1.1, then 3.6 down to 1.2, because later sessions inserted above rather than appended. New rows go at the bottom, one line each: batch, status, date, commit, one sentence.*

| Batch | Status | Date | Commit | Notes |
|---|---|---|---|---|
| 0.1 | COMPLETED | 2026-09-03 | `e97a3e1` | C-26, C-26b: anchored 4 bare `.gitignore` patterns; recovered 3 untracked backup API route files into version control. |
| 0.2 | COMPLETED | 2026-09-03 | *(this update)* | P-01/P-02/P-03: repo pushed to `origin/main` (user, interactive), `.env` confirmed preserved out-of-band by user, pre-remediation snapshot + fiscal/row-count baseline recorded. No code changes. |
| 1.1 | COMPLETED | 2026-09-03 | `4766ceb` | C-01: refund dialog made a euros boundary (`parseEuroInput()` in `money.ts`, pre-fill + submit + max-check in `orders-view.tsx`). 9 new tests; 145/145. Validated end-to-end on a scratch copy of the production DB — 5,00 € → 500, 5,50 € → 550, full refund → 690, fiscal chain ok. Production DB untouched. |
| 3.6 | COMPLETED | 2026-09-04 | `042bcbc` | M-01 + M-06 + M-07, completing Stage 3. **M-01**: sealing 2026-03 then 2026-01 chained January to March and broke `verifyCloses` permanently — reproduced on a copy of production (`{ok:false, firstBreakAt:1}`) before the fix. DD-05 answered *refuse*: a close must be the period immediately after the last sealed one, the first close free, the guard running before the aggregation so a refusal writes nothing. "Exactly next" rather than "later than", because "later than" strands the month in between. **M-06**: a per-rate VAT block plus the restaurant's TVA number, using the checkout's own apportionment so ticket and Z report cannot disagree; labels from the breakdown key, not `toFixed(1)` (that is L-19); rows sorted numerically because "10" sorts before "5.5" as text. **M-07**: `refundsTotal`/`refundsCount` on the Z report, in the DTO, in the UI, and in the sealed `CLOTURE_Z` payload, which had omitted them too. Migration rebuilds `ZReport` (Prisma's choice for NOT NULL + default) — rehearsed and fingerprint-diffed, both sealed Z rows byte-identical — and is **not yet applied to production**. Rehearsed end-to-end on a migrated copy with the real catalogue: 7 Up → 5,5 %, Margarita → 10 %, both printed in order with the TVA number, refund sealed into Z#3, out-of-order close refused in French and wrote nothing, all three chains `ok`. All three fixes proved to fail on the pre-fix code. Recorded L-25, L-26. 363/363. |
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
| 3.6b | COMPLETED | 2026-09-04 | `545b255` | L-25 + L-26, closing Stage 3 for good. **L-25**: Batch 3.6's guard enforced the ORDER of period closes but not their TIMING — sealing September on 4 September succeeded and sealed a partial month as the whole, permanently, because `period` is `@unique`. DD-18 answered *refuse, with no override*: a close is refused while its period has not ended, and while a caisse opened inside it is still open, both guards running before the aggregation so a refusal writes nothing. "Ended" reuses the half-open local-time bounds `aggregatePeriod` already used, extracted into a pure `src/lib/period.ts` the screen imports too — so the screen now proposes the last completed month and exercice instead of the current ones, which is the half no server guard can fix. **L-26**: `refundsTotal` / `refundsCount` on `MonthlyClose` and `AnnualClose`, the M-07 convention the period closes had been left out of; the sealed payload gains `refundsCount`, provable only because **zero closes exist**, and a test asserts that premise rather than assuming it. Migration rehearsed and fingerprint-diffed on a copy — both tables empty, so no sealed document is rewritten — and **not yet applied to production**. Rehearsed end-to-end through the real routes on a migrated copy: the current month, the current exercice and a month holding the real still-open caisse #3 all refused in French with nothing written; 2026-08 then sealed at `salesTotal 42400`, `refundsTotal 0/0`, all three chains `ok`. Screen driven in the browser: proposes 2026/8 and exercice 2025, refusal toast verbatim. Found the plan stale on the 3.6 migration (applied) and identified the port-3010 leftover. Recorded L-27. 384/384. |
| 4.1 | COMPLETED | 2026-09-04 | `f14a50c` | C-08, opening Stage 4. Two walls where there had been none that held. **The bypass**: `clientIp` believed `X-Real-IP` / `X-Forwarded-For` on the strength of a comment describing a Caddy proxy deleted in commit `0aeea30`, so an authenticated cashier could rotate a header per request, mint a fresh bucket each time and grind the 10⁶ PIN space. It now returns a constant unless `TRUST_PROXY_HEADERS` declares a real proxy — which costs nothing, because a browser sends neither header — and the approve key drops the IP outright. **The missing lockout**: five wrong manager PINs from one caller inside fifteen minutes now refuse further approvals `423` until the window slides, checked before the scrypt loop, counted from the `MANAGER_APPROVAL_FAILED` audit rows the route already wrote — so it is durable across a restart and needed **no migration**. The caller's *account* is deliberately not locked: `getSession()` treats a live `lockedUntil` as session revocation, which would eject a cashier from the till mid-service with their caisse open. Validated end-to-end against the production build on a scratch copy with synthetic PINs: 403 ×4 then 423 with `Retry-After 895` under a rotating forged IP, `429` on the sixth, the cashier's session still valid, a second cashier unaffected, a correct PIN still issuing an amount-bound token, self-approval still refused — then the server was restarted and the lock held at `423`. 10 of the 16 new tests proved to fail on the pre-batch behaviour. Found the plan stale again: the operator has applied the 3.6b migration, so **nothing waits on a `migrate deploy`**; the production hash is now `a66bc96c…`. Recorded L-28, L-29. 400/400. |
| 4.2 | COMPLETED | 2026-09-04 | `4022c9c` | C-09 (and T-04, its prerequisite). PIN key derivation was `scryptSync` at N=2^17 on the request thread — ~390 ms of frozen event loop per call, twice for a wrong PIN and once per manager on `/api/auth/approve`, so five managers and one fumbled PIN stopped the whole till. It now uses the async `crypto.scrypt`, the form `backup.ts` already used, behind a bound of **two concurrent derivations and a thirty-two-deep queue** in a new `pin-hash-queue.ts`; past that the auth routes answer `503` rather than let a caller queue unbounded 128 MiB buffers, which is the memory-exhaustion half of the finding. Measured on two production builds of the same tree differing only in `auth.ts`: during one wrong manager PIN the old build served **6** concurrent requests at a worst latency of **1608 ms**, the new one **491** at **24 ms**; 60 simultaneous unknown-user logins took **29.3 s** and were all accepted before, and are now 34 served + 26 refused. **T-04 was written first**, as the plan required, and the legacy N=2^14 fallback survives: a pre-hardening hash verifies, is flagged legacy, and is transparently re-hashed on success — proved end-to-end through both `login` and `unlock` on a scratch copy with synthetic PINs. Both halves proved against the pre-batch code: zero timer ticks during a 476 ms derivation on old `auth.ts`, and 2 of T-04's 6 cases fail when the fallback is deleted. **No migration.** Corrected the environment note blaming port 3010 for the Prisma `EPERM` — that process is gone and the `EPERM` remains. Recorded L-30. 413/413. |

---

# RESOLVED FINDINGS

*Rows moved verbatim from *Newly Discovered Issues* in `REMEDIATION_PLAN.md` (commit `5f0c2b1`) on 2026-09-04; each was resolved by the batch named in the row and is also recorded in that batch's status record above. Source lines: 2340, 2342, 2344, 2345, 2346, 2348, 2350. When a later batch resolves an open row, move the row here unchanged.*

| ID | Date | Found during | Description | Severity | Assigned to batch |
|---|---|---|---|---|---|
| **L-23** ✅ **RESOLVED in Batch 3.2b** (`54aa7ef`) | 2026-09-03 | Batch 3.2 | **Three more aggregation sites the audit did not count, two with the C-11 half-cent defect and one with the C-10 shape.** `dashboard/route.ts:47` and `reports/products/route.ts:70` both compute `round2(lineTotal × (1 − discountRatio) × …)` — a ratio product through a euros helper, so the half-cent survives exactly as C-11 described (`round2(1250 × 0.85)` = `1062.5`, where the Z report gives `1063`). `reports/cashiers/route.ts:77-79` sums payments **gross** and never nets refunds off them, which is the C-10 shape in a management report. Also `dashboard:27` and `customers/[id]/detail:37` return `avgTicket` as a fractional cent. Note most other `round2` calls in these files are **no-ops** — `round2` of an integer returns the integer — so the defect is specifically where a ratio or a division feeds it. None of these feeds a sealed fiscal document, which is why Batch 3.2 did not widen to cover them; but they mean a manager comparing the dashboard or the cashier report against a Z report still sees different figures for the same period. Fix by routing them through `aggregateOrders`. | MEDIUM (management reports disagree with the fiscal ones) | needs a decision — a small follow-on to 3.2 |
| **L-20** ✅ **RESOLVED in Batch 3.1d** (`be9efa1`) | 2026-09-03 | Batch 3.1b manual validation | **The Réglages screen cannot be saved at all on the live install.** `Setting.receiptWidth` still holds the legacy millimetre value `80`. Batch 1.3 (L-13) tightened `settingsSchema` to `z.number().int().min(32).max(48)` and `getSettings()` returns the stored value raw, so the form loads 80 and PUTs it straight back: **`PUT /api/settings` → 400 "Too big: expected number to be <=48"**. Reproduced on a scratch copy of the production database. `normalizeReceiptColumns()` already exists but runs only in the receipt renderer, not on the settings read path. Consequences: **every** settings change is blocked — including the two operator actions this plan already asks for (correcting `printerName` per DOC-15, and saving `receiptWidth` as 48) — and the operator sees an untranslated English zod message in a French UI. Workaround: re-pick the width in the selector before saving anything, which is not discoverable (the selector renders blank because 80 matches no option). Candidate fix: normalise on read in `getSettings()`, as the renderer already does. | **HIGH** (live install; blocks all configuration) | needs a decision — suggest a small batch before 3.1c |
| **L-16** ✅ **RESOLVED in Batch 3.1c** (`9feb4a0`, `23e2971`) | 2026-09-03 | Batch 3.1 (DD-03 investigation) | **All 17 real cans and bottles are stored at 10 % where the operator states 5,5 % applies.** `Canette` (13 products at 1,50 €) and `Bouteilles` (4 at 3,50 €) are all `vatRate = 10`; so are all 78 products in the catalogue. Unlike the trading data, **the menu is real** — so this is a live error in production data, not a test artifact. At the fixed TTC prices it over-declares ≈ 6 c per can and ≈ 14 c per bottle, money owed to the restaurant rather than the state, on every drink sold from opening day. Caused by L-17: the interface offers no way to set the rate for these products. | **HIGH** (real data, real money, from day one) | 3.1c — operator authorised the change 2026-09-03; classification is V-14 |
| **L-17** ✅ **RESOLVED in Batch 3.1c** (`9feb4a0`) | 2026-09-03 | Batch 3.1 (DD-03 investigation) | **The VAT switch matches the immediate category's name and never walks to the parent.** `products-view.tsx:498` shows the "Bouteille / Canette" 5,5 % toggle only when the selected category's name contains `"boisson"`. `Canette` and `Bouteilles` are **children of** `Boissons`, so it never renders for them — and it is the only VAT control in the product form. Every other category-inherited property resolves `product.category?.parent ?? product.category` (`pricing.ts:71`); this one does not. The form already has the full tree loaded, so it is a one-line inconsistency with an established convention, not a missing capability. | **HIGH** (blocks any fix for L-16) | 3.1c |
| **L-18** ✅ **RESOLVED in Batch 3.1b** (`8a8a09a`) | 2026-09-03 | Batch 3.1 (DD-03 investigation) | **FACTICE simulation mode is wired into every fiscal write but no screen can turn it on.** `settings.factice` is read on eight write paths and stamps both the receipt (`receipt.ts:14`) and every `FiscalEvent`; `validation.ts:216` already accepts the field. There is no `factice` row in `Setting` and no control anywhere, so it is permanently `false` — which is why 20 developer test orders were journalled as genuine sales with `factice = 0`. P-04 deletes them, but any testing before go-live has the same problem. | MEDIUM (fiscal-record hygiene before go-live) | 3.1b — operator approved 2026-09-03 |
| L-15 ✅ **RESOLVED in Batch 2.2** (`3a9bd1f`, refuse) | 2026-09-03 | Batch 2.1 decrypt-tool verification | **Restore has no schema-version check, and at least one existing backup predates five tables.** Decrypting the real `hibapos-backup-2026-08-28T01-21-34-082Z.dbenc` shows 26 tables against the live schema's 31 — missing `AnnualClose`, `FiscalArchive`, `FiscalEvent`, `GrandTotal`, `MonthlyClose`. Restoring it succeeds and leaves the application running against a database with **no fiscal journal**: every fiscal query fails, and the new `RESTAURATION` event cannot even be written (handled non-fatally, logged as ERROR). `restoreBackup` compares the *data* checksum but never the schema. Needs a decision — refuse a restore whose `_prisma_migrations` do not match, warn and proceed, or run `migrate deploy` after the swap. | **HIGH** (silent post-restore breakage) | needs a decision; suggest 2.2 or a new DD |
| L-13 ✅ **RESOLVED in Batch 1.3** (`483a86e`) | 2026-09-03 | Batch 1.3 decision prep | **`receiptWidth` is a millimetre value being used as a character count.** The live `Setting` row is `receiptWidth = 80` and `validation.ts:202` allows 32–80, but `renderReceipt()` (`services/receipt.ts:8`) uses it as `const w = Math.max(32, s.receiptWidth ?? 42)` — a column count. 80 mm of thermal paper is **48 characters** at ESC/POS Font A (64 at Font B), not 80. Harmless while printing is `window.print()`; guaranteed to wrap every receipt into garbage the moment real printing exists. Decide whether the setting means millimetres (and derive columns) or columns (and re-label + re-default it). | MEDIUM (latent; blocks correct output in 1.3) | 1.3 |
| **L-25** ✅ **RESOLVED in Batch 3.6b** (`545b255`) | 2026-09-04 | Batch 3.6 (M-01) | **The close guard enforces order, but nothing stops you sealing a month that has not finished.** `closeMonth(2026, 9, …)` succeeds on 4 September and seals a partial September as if it were the whole month; the period is then `@unique`, so the rest of the month can never be sealed and never appears in any close. M-01's guard does not help — sealing September early is perfectly in sequence. Pre-existing, not introduced by Batch 3.6, and out of its scope (the batch's decision was about ordering, not about timing). Candidate fix: refuse a period whose end is still in the future, or require an explicit confirmation. Worth deciding before the first real close, because the first premature seal is unrepairable. | MEDIUM (a sealed, permanently incomplete fiscal period) | needs a decision — suggest a small batch before 8.0 → **decided 2026-09-04, DD-18; Batch 3.6b** |
| **L-26** ✅ **RESOLVED in Batch 3.6b** (`545b255`) | 2026-09-04 | Batch 3.6 (M-07) | **`MonthlyClose` and `AnnualClose` hash a `totalRefunded` they have no column for.** `aggregatePeriod` returns `totalRefunded` and it is spread into `dataPayload`, so it *is* inside `dataJson` and *is* covered by the close hash — but there is no column, so no query, report or screen can read it without parsing the JSON. The Z report gained exactly these columns in M-07; the period closes did not, because the plan's M-07 names only `ZReport`. Trivial to add while zero closes exist (the same argument as DD-05); much less trivial afterwards. | LOW (data present but unreadable; consistency with M-07) | 3.6 follow-on or 8.0 → **Batch 3.6b** (DD-18) |

---

# ANSWERED DESIGN DECISIONS — FULL RATIONALE

*Rows moved verbatim from *Design Decisions Required* in `REMEDIATION_PLAN.md` (commit `5f0c2b1`) on 2026-09-04; the plan keeps a one-line summary of each answer. Source lines: 2255, 2256, 2257, 2258, 2260.*

| ID | Decision | Blocks | Context |
|---|---|---|---|
| **DD-01** | ~~**Printing and cash drawer.**~~ **ANSWERED 2026-09-03: build the ESC/POS bridge now, in the existing Bun/Next server, primary transport raw TCP to port 9100 over the LAN**, behind a transport interface leaving a Windows-RAW-spooler slot for USB. Not deferred to Tauri. | Batch 1.3 (now `IN PROGRESS`); shapes 1.4 and 3.4 | Decided by the user. Reasoning: `renderReceipt()` already produces the receipt text, so only transport + control bytes are missing; a TCP socket is runtime-independent and carries over to a future Tauri shell untouched, so building now is not throwaway work. Deferring would keep the restaurant on a physical drawer key per cash sale, and would leave the Batch 1.2 cash-variance figure with no drawer accountability behind it. |
| **DD-02** | ~~**Where does application data live?**~~ **ANSWERED 2026-09-03: `C:\HibaPOS\data`.** Plumbing shipped in Batch 2.2 (`src/lib/paths.ts`, `HIBAPOS_DATA_DIR`), defaulting to the old layout; the physical move is a deployment step with Batch 1.4. Original question: `%ProgramData%\HibaPOS\`, a dedicated `C:\HibaPOS\`, or the current install directory? The current path is inside a OneDrive-synced Desktop folder, which locks SQLite files. Under `C:\Program Files\` the app cannot write at all. | Batch 2.2; shapes 1.4 | Every path except `DATABASE_URL` is `process.cwd()`-anchored. |
| **DD-03** | ~~**Already-sealed rows with the wrong VAT key.**~~ **CLOSED 2026-09-03 as NOT APPLICABLE — there was never an affected row.** The premise (that sealed rows carry a `"6"` key) was an audit assumption, not an observation. Read-only inspection of every database on the machine found zero `"6"` keys and zero non-10 % rates anywhere, including in the legacy July exports whose dataset *did* contain a 5,5 % product. The operator then confirmed that all trading data is developer test data and that P-04 deletes it before the first real sale, so the two `ZReport` rows are not fiscal records at all. Key format decided: **minimal decimal string** (`"5.5"`, `"10"` — option A1), because it is byte-identical to what those rows already hold. | Batch 3.1 (`COMPLETED`) | Full evidence in the Batch 3.1 status record. No annotation, re-issue or explanation was needed, so V-01 is not engaged. |
| **DD-17** | ~~**Where does a product's VAT rate come from?**~~ **ANSWERED 2026-09-03: on the category, inherited nearest-wins (own category → parent → default), with a per-product override flag and a selector constrained to 20 / 10 / 5,5 / 2,1 %.** Original question raised by the operator: should a VAT percentage be settable per category instead of via the hardcoded "Bouteille / Canette" switch? | Batch 3.1c | Decided by the user. Reasoning: the current design encodes a **tax rule as a string match on a category name** (`products-view.tsx:498`), so renaming a category silently removes the control — and it already has, which is L-16/L-17. Category-level inheritance is not a new mechanism here: `pricing.ts:71` already resolves `product.category?.parent ?? product.category` for options and add-ons, with `inheritCategoryGlobals` as the per-product opt-out. This applies the established pattern to one more field. The snapshot in `OrderItem.vatRate` is what makes it safe — past sales cannot move when a category is edited. |
| **DD-05** | ~~**Out-of-order period closes.**~~ **ANSWERED 2026-09-04: refuse.** A close must be the period immediately following the last sealed one; the first close is unconstrained. Chaining by insertion order was the alternative and was rejected — it needs an extra sequence column (a migration), and it leaves the sealed sequence reading March → January. Refusing keeps `verifyCloses` correct unchanged and makes period order and seal order permanently identical. Decided with **zero closes in existence**, so nothing had to be accommodated. | Batch 3.6 (`COMPLETED`) | Evidence in the Batch 3.6 status record, including the reproduction of the break on a copy of production. |
| **DD-18** | ~~**Premature period closes.**~~ **ANSWERED 2026-09-04 — refuse a premature close, with no override.** A month or year close is refused while its period has not ended, and while a shift inside the period is still `OPEN`; the close screen defaults to the last completed period instead of the current one. L-26's missing refunds columns on the period closes are added in the same batch, while zero closes exist. | Batch 3.6b (`COMPLETED`) | Decided by the user on a plain-language brief. Reasoning: the first premature seal is unrepairable (a sealed period cannot be edited, deleted or re-sealed), the screen proposed the wrong period by default, and zero closes exist today so the rule costs nothing to impose. A confirmation dialog was rejected as too weak for an irreversible fiscal action. Whether French practice imposes further rules on period closes stays with V-08; this is a code decision and claims nothing fiscal. *(Row moved from the plan on 2026-09-04, at the close of Batch 3.6b.)* |

---

# RETIRED OPEN-THREAD ROWS AND SUPERSEDED FRONT-MATTER LINES

*Lines removed from or altered in the front matter of `REMEDIATION_PLAN.md` on 2026-09-04, kept here verbatim (source line numbers at commit `5f0c2b1`). Each describes something that was done and verified; the plan no longer needs to carry it.*

**Open Threads → A, line 52:**

| What | Why it is inert | Unblocked by |
|---|---|---|
| ~~**`Order.discountApprovedById`** (3.5)~~ ✅ **APPLIED 2026-09-04** | The operator ran `migrate deploy` immediately after the batch. Verified read-only against the live file: the **only** differences from the pre-batch snapshot are the `_prisma_migrations` row and the new column — every count, counter, event hash, Z report, order row and VAT rate identical, `integrity_check ok`, 0 FK errors. New baseline hash below. | — |

**Open Threads → B, lines 59 and 60:**

| Action | Why it matters | Related |
|---|---|---|
| ~~**Apply the Batch 3.5 migration**~~ ✅ **DONE 2026-09-04** | `20260903230305_order_discount_approver` is applied on production and verified. | C-13 |
| ~~**Push session-3 and session-4 commits**~~ ✅ **DONE 2026-09-04** | Pushed at the user's explicit request: `3f31779..8a311dc`, `origin/main` now `0 0` with `HEAD`. Earlier sessions recorded this as impossible for Claude; it is not — it is an explicit-permission action, so it needs the user to ask for it in the session, which they did. | P-01 |

**Immediate warnings, item 1 as it read at line 167** (the struck-through opening and the resolution note were removed; the rest stays in the plan):

1. ~~`src/app/api/backups/**` is not in git.~~ **RESOLVED in Batch 0.1** (commit `e97a3e1`) — `.gitignore` anchored, the three route files are now tracked. The repo **is** pushed: `origin/main` is `astrellaltd-coding/HibaPos`, and every session must leave its own commits pushed by the operator (Claude cannot push). Still: do not run `git clean` and do not delete the working tree without checking `git rev-list --left-right --count origin/main...HEAD` first.

**Open Threads → G table header, line 136** (the plan now labels the column "updated through session 4"):

| Thing | Value at the end of session 3 |

---

# SUPERSEDED PROCEDURE

*The plan's original *HOW TO USE THIS FILE* steps, lines 186–194, replaced on 2026-09-04 by the two-file protocol.*


1. Read **CURRENT PROJECT STATUS** above. It tells you exactly where to resume.
2. Open the **current batch**. Do only what is in that batch.
3. Work the batch's items from `NOT STARTED` → `IN PROGRESS` → `IMPLEMENTED — TESTING REQUIRED`.
4. Run the batch's **Validation Required** section in full.
5. If validation passes, mark items `COMPLETED`, fill in the status block (date, changes, files, tests, commit), and mark the batch `COMPLETED`.
6. Update **CURRENT PROJECT STATUS** and the **Completed Remediation History** table.
7. Commit. One batch, one commit (or a small reversible series).
8. Stop. Do not roll into the next batch without the user's go-ahead.

*End of record as split on 2026-09-04. Append below this line.*
