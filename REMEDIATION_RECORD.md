# HibaPOS France — Remediation Record

Evidence record for the controlled remediation of HibaPOS France. Companion to `REMEDIATION_PLAN.md`, the working plan.

**What this file is.** Every batch that reached `COMPLETED` has its full section here — the finding specifications, the *Validation Required* criteria and the *Status Record* — exactly as it stood in `REMEDIATION_PLAN.md` at commit `5f0c2b1` when the plan was split on 2026-09-04. Also here: the completion history table, the resolved rows of *Newly Discovered Issues*, the full rationale of answered design decisions, and the open-thread rows that were retired. Each moved block carries a provenance line naming its source lines; `git show 5f0c2b1:REMEDIATION_PLAN.md` reproduces the file before the split.

**Rules.** Append-only. Nothing here is rewritten; a correction is an appended, dated note. When a batch completes, its whole section moves here verbatim from the plan, under its stage heading, and a stub stays in the plan carrying the constraints the batch leaves behind. Sessions slice this file by heading; it is not meant to be read whole.

**Contents.** Batch 0.1 · Batch 0.2 · Batch 1.1 · Batch 1.2 · Batch 2.1 · Batch 2.2 · Batch 2.3 · Batch 2.4 · Batch 3.1 · Batch 3.1b · Batch 3.1d · Batch 3.1c · Batch 3.2 · Batch 3.2b · Batch 3.3 · Batch 3.4 · Batch 3.5 · Batch 3.6 · Batch 3.6b · Batch 4.1 · Batch 4.2 · Batch 4.3 · Batch 4.4 · Batch 4.4b · Batch 4.4c · Batch 4.5 · Batch 4.6 · Batch 4.7 · Completed Remediation History · Resolved findings · Answered design decisions · Retired open-thread rows · Superseded procedure

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

## Batch 3.6c — The close guard checks the wrong date

*Moved verbatim from `REMEDIATION_PLAN.md` lines 807–862 (commit `bd08823`) on 2026-09-05. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**Status:** `COMPLETED` — added 2026-09-05, on the answer to L-27.

### L-27 — A caisse opened before the period never blocks that period's close

**Status:** `COMPLETED` · Severity: LOW→MEDIUM · Category: data integrity (fiscal)

**Problem.** `assertNoOpenShiftInPeriod` (`fiscal.ts:358-370`) refuses a close only when a caisse whose **opening** falls inside the period is still `OPEN`:
`where: { status: "OPEN", openedAt: { gte: bounds.from, lt: bounds.to } }`.
A caisse opened *before* `bounds.from` is never matched, for any period. DD-18 scoped it that way and Batch 3.6b implemented it as written rather than widening it (safety rule 11).

**Correction to L-27's own row, from reading the code 2026-09-05.** The row says "the only way through is the **first-ever close**". That is too narrow. Once a long-lived caisse is open and its opening predates the earliest period being sealed, it matches no period's window — so it blocks **no** close, ever, not merely the first. The sequencing rule (DD-05) does not help: it requires the *previous period* to be sealed, which that same caisse also failed to block.

**Evidence, live on the current data.** Shift 3 opened **2026-08-28 02:24** and is still `OPEN`; it carries orders dated **2026-09-01**. Sealing September would pass the guard, while September's orders sit in a caisse that has never produced a Z report. (This particular data is developer test data that Batch 8.0 deletes — the *shape* is what survives.)

**Impact.** The figures are still right: the aggregation keys on `Order.createdAt`, not on the shift, so those orders are counted. What is missing is the guarantee 3.6b's guard exists to give — that the period's last Z report exists **before** the period is sealed, so that Batch 3.2's reconciliation (a close equals the sum of its Z reports) can be checked at sealing time rather than hoped for afterwards. A sealed close cannot be corrected.

**Decision (operator, 2026-09-05).** **Widen it to any caisse still `OPEN` at sealing time**, whatever period it was opened in. Chosen over the narrower "any caisse holding an order inside the period" because it cannot be reasoned past and needs no join; the operational cost is that the Z must be run before the month is sealed, which is the order the work happens in anyway.

**Remediation direction.** Drop the `openedAt` window from the `where`. Keep the refusal message useful — it names the caisse number and tells the operator to run its Z — and say *"n'est pas clôturée"* without claiming the caisse was opened during the period, which will no longer be true.

### Batch 3.6c — Validation Required

- Targeted test: a caisse opened **before** the period and still `OPEN` refuses the close, with the caisse number in the message.
- Targeted test: the pre-existing case still refuses — a caisse opened **inside** the period and still `OPEN`.
- Targeted test: a period all of whose caisses are `CLOSED` still seals, including one opened before the period and closed inside it. *(The over-refusal control: a guard that refused every close would satisfy both tests above.)*
- Regression: Batch 3.6b's L-25 timing tests and Batch 3.6's DD-05 sequencing tests pass unchanged.
- Prove the new tests fail on the old guard, one property at a time (Stage 3 rule).
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS.
- **No migration** expected — measure with `prisma migrate diff` and say so either way.

### Batch 3.6c — Status Record

**Status:** `COMPLETED` · **Completed:** 2026-09-05

**Changes:** One `where` clause and the sentence that explained it. `assertNoOpenShiftInPeriod(bounds, period, label)` becomes `assertNoOpenShift(period, label)`: the `openedAt: { gte: bounds.from, lt: bounds.to }` window is gone, so **any** caisse still `OPEN` refuses a monthly or annual close, whatever period it was opened in. `bounds` left the signature with the window — nothing in the guard is period-scoped any more, which is the whole of the change — while both callers still compute bounds for `assertPeriodEnded` and for the aggregation. The guard keeps its position **before** `aggregatePeriod`, so a refusal still writes nothing, and keeps `orderBy: { number: "asc" }`, so the operator is always pointed at the oldest unclosed till rather than at whichever row the database returned. **The message had to change with the rule**: it said *« la caisse n° N, ouverte pendant 2026-09, n'est pas clôturée »*, and that clause is false for exactly the case this batch exists to catch — it now reads *« Clôture impossible : la caisse n° N n'est pas clôturée. Clôturez-la (rapport Z) avant de sceller le mois 2026-09. »* The docstring records what DD-18 asked for, why the scope was the defect, and what replaced it, so the next person to narrow it back has the argument in front of them.

**Files:** `src/lib/services/fiscal.ts`, `src/lib/services/close-timing.test.ts`

**Tests:** `bun test src --timeout 30000` — **603 pass, 0 fail** (baseline 597 + 6 net: seven tests changed, of which one replaced an existing one). `bun run typecheck`, `bun run lint`, `bun run build` — all PASS. **No migration** — `prisma migrate diff --from-schema-datasource --to-schema-datamodel` prints *"This is an empty migration"*; nothing in `prisma/schema.prisma` was touched. Three one-property reverts, each applied alone and restored from a copy taken first: **R1** the `openedAt` window restored (5 of the 7 fail), **R2** `orderBy` reversed (1 fails), **R3** the old message wording with the new scope (1 fails). Manual walkthrough through the real `POST /api/fiscal/close-month` on a scratch copy of production.

**Commit:** `bd08823` + this plan/record update.

**Notes:**

**(1) The widened guard broke exactly one existing test, and it was the right one.** `close-timing.test.ts`'s *"ignores an open caisse that belongs to another period"* asserted, in as many words, the scope DD-18 asked for: *"a caisse opened in October must not block September's close."* It was a faithful test of a decision that turned out to be the defect. It is **inverted, not deleted** — the fixture is untouched and only the expectation is turned round — with the original quoted above it, so the two behaviours can be read against each other. Nothing else in the suite needed changing: the other five files that create an `OPEN` shift and then close a period either close it first (Batch 3.6b had already made `fiscal.test.ts` do so) or wipe shifts between tests, so no fixture was silently relying on the old scope.

**(2) The over-refusal control is the test that must NOT fail, and it is named as such.** *"still seals when every caisse is closed, including one that spans the period boundary"* survives all three reverts by design: a guard that refused every close would satisfy the other six tests in this batch, and this is the one that says it does not. A caisse opened in August and closed in September — the ordinary long-running case — must go on sealing nothing.

**(3) The finding's own row understated it, and the correction is worth more than the fix.** L-27 said *"the only way through is the first-ever close"*. It is not: a caisse whose opening predates the earliest period being sealed matches **no** period's window, so it blocks **no** close, ever. DD-05's sequencing rule does not catch it, because that same caisse failed to block the previous period on the same reasoning. A test is named for that case specifically (*"REFUSES because of a caisse opened BEFORE the period and never closed"*), and a second one reproduces the exact production shape it was found on — caisse n° 3, opened 2026-08-28 02:24, still open, holding an order created 2026-09-01.

**(4) Manual walkthrough, on production data, through the real endpoint.** Scratch copy with `DATABASE_URL` and `HIBAPOS_DATA_DIR` both overridden and the marker `SCRATCH-COPY-3.6c` proved through the pre-auth `GET /api/auth/profiles` before the first write. `POST /api/fiscal/close-month` for **2026-08** → **409**, *« Clôture impossible : la caisse n° 3 n'est pas clôturée. Clôturez-la (rapport Z) avant de sceller le mois 2026-08. »* — the new wording, naming the real caisse, with no false claim about when it was opened. The discriminating variant was then **constructed and labelled as such**: caisse n° 3's opening moved to 15 July on the copy, so that under DD-18's scope it matched no August window and August would have sealed; the new guard refuses it identically. The over-refusal control was run end to end too — caisse 3 closed, August then sealed (`2026-08`, 42 400 salesTotal, 18 sales) and `/api/fiscal/verify` returned `ok` for all three chains with the new `CLOTURE_M` in place. **That close exists only on the scratch copy**; production still has zero monthly and zero annual closes. Server killed with `taskkill //PID 6332 //T //F`. Production `db/custom.db` unchanged at `7839db18…`, 696 320 bytes, mtime 2026-09-04 16:41:52, no `-wal`/`-shm` beside it.

**(5) What this batch did NOT do, deliberately.** The narrower rule the operator declined — refuse only when an open caisse holds an order inside the period — is not implemented and is not a fallback hiding anywhere; the guard is now unconditional. `closeYear` still asks **nothing** of the year's twelve monthly closes (Batch 3.6b note 6), and this batch does not change that: a test still pins it. And `buildAnnualArchive` still derives its own year bounds inline, still deliberately, because an archive is a read and not a close.

---

## Batch 3.7 — French-law gaps found after Stage 7 (L-52, L-53, L-54)

*Moved verbatim from `REMEDIATION_PLAN.md` lines 822–850 (commit `c3ce9e9`) on 2026-09-06.*

**Status:** `IN PROGRESS` · **Opened:** 2026-09-06 · **Findings:** L-53 (done), L-54, L-52 · **Produces:** `docs/conformite-isca-map.md` and the answers to the seven questions in `docs/conformite-isca-recherche.md`.

**Why this batch exists.** Three rows in *Newly Discovered Issues* said *NO BATCH OWNS THIS* after Stage 7 closed. They are French-law gaps found on 2026-09-06 and they are **app fixes**, so on the operator's instruction of the same day they get a batch here rather than waiting for the separate audit. **The scope stays the app**: the audit and the Windows packaging are planned elsewhere. Reopens Stage 3 the way 3.6b and 3.6c did.

**Order, and what decides each item.** L-53 first — cheap, and the one thing a control actually turns on (BOI-CF-COM-20-60 verifies version correspondence). L-54 next — whether a per-shift Z is accepted as the « clôture journalière » is decided by the research answer to question 5, not by this plan; if it is only a mislabelled comment, correct the comment; if it is a defect, the fix changes when a till may stay open, which is business behaviour and goes to `REQUIRES DECISION` (safety rule 11). L-52 last, **and only if the restitution format is published** — if research question 2 finds no implementing text, L-52 stays open and says why; no target is invented.

| ID | Status | Item |
|---|---|---|
| **L-53** | `COMPLETED` (2026-09-06; evidence in the status record below) | The software states its version: last line of every ticket, the annual archive's notice and `software` key, `GET /api/fiscal/verify`, and the fiscal screen — all from `src/lib/version.ts`, pinned to `package.json` by a test. |
| **L-54** | `COMPLETED` (2026-09-06) — **as a mislabel and a missing notice, which is all the research could establish** | Research § 9.5: BOFiP § 170's « prévoir » means *provide*, and no source defines « journée » or accepts or rejects a per-shift close. The comment at `reports.ts:226` no longer calls a shift seal the daily close; the README and the attestation template say what the Z is; the shifts screen states the operator's responsibility and turns amber once the open till has crossed local midnight (`period.ts:74`, `shifts-view.tsx:399-416`). Nothing is refused: that is **DD-23**. |
| **L-52** | **left open** — `BLOCKED` on a text that does not exist | Research § 9.2: the obligation is in force since 27/06/2026 with no instrument, no deadline and no suspensive condition, and **no format has been published** anywhere as of 2026-09-06. No target was invented. Row returns to *NO BATCH OWNS THIS* with the search recorded. |

**Method.** Measure first (read-only on production, then a scratch copy with both `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden); one-property reverts in both directions; a success message is not evidence — check the artifact; record per *HOW TO USE* step 5.

### Batch 3.7 — Validation Required

- **L-53**: a ticket rendered on the production build ends with `HibaPOS France v<version>`; the archive file on disk carries `software.name`/`software.version` and the notice line; `GET /api/fiscal/verify` returns `software`; the fiscal screen renders it (component test + source assertion, L-47 blocking the pane). Every new assertion fails under a one-property revert; the strengthened fallback test is shown to survive its own revert in the old form and fail in the new. `GET /api` still reports no version. The client bundle carries **none** of `package.json` (`grep -rl db:push-force .next/static` → 0). Production `db/custom.db` byte-identical; no file under `db/fiscal-archives/` or `db/backups/` created.
- **L-54**: the answer to research question 5 is recorded with its source **before** any code moves; the misleading comment and the README claim are corrected in every outcome; any change to when a till may stay open is a decision, not a fix.
- **L-52**: closed only against a published format, with an exporter validated on a scratch copy; otherwise left open with the search recorded.
- `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build` all pass.

### Batch 3.7 — Status Record

**Status:** `COMPLETED` for L-53 and L-54; **L-52 deliberately left open** (no published format to build to) · **Completed:** 2026-09-06 · **Changes (L-54, 2026-09-06):** `reports.ts:226-241` — the comment that called a shift seal the « clôture journalière » now says what the seal is, what BOFiP § 170 requires (« prévoir »), what the research did and did not find, and that refusing sales past midnight is DD-23; `src/lib/period.ts:74` `openedOnEarlierLocalDay` (pure, local days, false when the clock has moved back); `shifts-view.tsx:399-416` — the open-till panel states the operator's responsibility to close at the end of each trading day and shows an amber notice once the till has crossed local midnight, **refusing nothing**; `README.md:91` and `docs/attestation-conformite.md` (note 4, the « Mise en œuvre » bullet, the périmètre line) stop calling the Z a daily close. **L-52:** searched, nothing published (research § 9.2), row returned to *NO BATCH OWNS THIS*. **Also produced:** `docs/conformite-isca-recherche.md` § 9 (the seven answers, verbatim quotes, sources, could-not-confirm), `docs/conformite-isca-map.md` filled, **DD-23** recorded, **L-55–L-58** recorded. **Changes (L-53, 2026-09-06):** `src/lib/version.ts` (new: `SOFTWARE_NAME`, `SOFTWARE_VERSION`, `SOFTWARE_IDENTITY`); `receipt.ts:129` prints the identity as the last line; `fiscal.ts:626` notice line and `:712` `software` key, archive schema `version` 2 → 3; `fiscal/verify/route.ts:23`; `components/shared/software-identity.tsx` (new) rendered by `fiscal-view.tsx:251`; `docs/attestation-conformite.md` note 1 updated. **First implementation imported `package.json` and was reverted after measurement**: the import put the whole file — scripts, dependency list — into three public client chunks, because `renderReceipt` also runs client-side for the ticket download. The literal is pinned to `package.json` by `version.test.ts`. · **Files:** the above plus `receipt.test.ts` (snapshot updated for exactly one added line; fallback test strengthened to the header line), `archive.test.ts`, `app/api/fiscal-verify-software.test.ts` (new), `software-identity.test.tsx` (new), `version.test.ts` (new). · **Tests:** 803 → **814 pass, 0 fail**; typecheck, lint, build pass. Ten reverts, every new assertion caught: R1 ticket line, R2 archive key, R3 notice line, R4 schema version, R5 verify route, R6 literal `0.0.0` (3 tests), R7 screen wiring, R8 component, **R9a/R9b** the fallback removed — the old whole-ticket assertion **passes** (16/16), the new header-line assertion fails. Controls that pass under every revert, by design: "renders nothing before the endpoint answers", "dotted release", and the `GET /api` regression pin. Walkthrough on the production build (`next start -p 3066`) against a scratch copy carrying marker `SCRATCH-COPY-3.7` in `User.name`, proved via pre-auth `GET /api/auth/profiles` **before** the first write: receipt **#21** last line `HibaPOS France v0.2.1`; 2025 archive file `software: {name, version}`, notice line 3, `sha256sum -c` → OK; `/api/fiscal/verify` → `software` and 4 events `ok`; server killed (`taskkill //PID 10760`). Production: `96b48ad0…`, 704 512 bytes, mtime 2026-09-05 17:48 unchanged, no `-wal`/`-shm`, `db/fiscal-archives/` does not exist. **Tests (L-54):** `period-daily-close.test.ts`, six cases; 814 → **820 pass, 0 fail**; typecheck, lint, build pass, leakage still 0 chunks. Five reverts, all caught: R10 helper always false (3 fail), R11 a 24-hour span instead of local days (2), R12 clock-moved-back guard removed (1), R13 banner wiring removed, R14 responsibility sentence removed, R15 the banner's `data-testid` removed (source assertion each). **The source assertion first failed on BOTH sides of its revert** — it looked for a plain apostrophe where the JSX carries `&apos;` — and was corrected before the reverts were re-run; the first run is recorded as the failure it was. · **Commit:** `203848e` (part 1: L-53, the map, the batch opened), part 2 and part 3 in the completion history · **Notes:** 1. **L-52 is left open on purpose, and that is the finding**: the obligation is in force since 27/06/2026 with no instrument, no deadline and no suspensive condition, and nothing defines the format — an exporter to a guessed schema would be work to redo. 2. **L-54 was decided by the research, as instructed**: « prévoir » means provide; no source accepts or rejects a per-shift close; so the software's part is the label, the notice and the flag, and the refusal is DD-23. 3. **L-57 is the research's most consequential find** — BOFiP § 170 says the perpetual total must be *recorded* at each close and HibaPOS records it at none — and it is **not fixed here** (safety rule 10); it must precede the first real close. 4. **The 2027 question is now a known unknown with a date**: the CIBS article delegates the proof regime to an unpublished décret. 5. **Measure the artifact**: the `package.json` import passed every test and shipped the dependency list to the browser. 6. Production untouched throughout; the scratch server was killed by PID.

---

## Batch 3.8 — The trading day (clôture du jour)

*Moved verbatim from `REMEDIATION_PLAN.md` lines 848–923 (commit `b6ed7e8`) on 2026-09-06.*

**Status:** `NOT STARTED` · **Opened:** 2026-09-06 · **Findings:** L-54 (second half), L-57 · **Decisions:** DD-23 and DD-24, both **ANSWERED 2026-09-06** before a line was written.

**Why this batch exists.** Batch 3.7 established what the sources do and do not say: BOFiP § 170 requires the software to *prévoir* a daily, a monthly and an annual close, calls the three « cumulatives et impératives », and requires that **for each close** cumulative data « comme le cumul du grand total de la période et le total perpétuel » be « calculées et enregistrées ». It never defines « journée ». HibaPOS today has no daily close at all: the Z seals a **caisse**, and on the production test data Z #2 covers five calendar days. The operator was given the choice in plain terms and chose to **build a real one** rather than continue calling the till Z a daily close (DD-23), on a **trading-day clock** so a service running past midnight stays in one day (DD-24). L-57 rides with it because it changes the same sealed payloads, and a second change after the first real close would be a second vintage in a document that cannot be corrected.

**The two answers, stated once so the code is not written against a guess.**
- **DD-23 — a separate `Clôture du jour`, and the till refuses nothing.** The caisse Z stays exactly what it is: the cash count for that till. A new sealed day close aggregates the whole trading day above it. The operator was offered a till that refuses to sell after midnight and **did not take it**; with a trading-day clock there is nothing to refuse.
- **DD-24 — the cut-off clock governs the month and the exercice as well.** June runs from 1 June at the cut-off hour to 1 July at the cut-off hour. Chosen so that a Friday service ending at 01:00 on 1 July sits in Friday **and** in June, and no two sealed documents disagree about the same tickets. **Free only because zero monthly and annual closes have ever been sealed** (re-verified 2026-09-06); this is the last moment it costs nothing.

| ID | Status | Item |
|---|---|---|
| **DD-24** | `NOT STARTED` | **`businessDayCutoffHour`**, an integer 0–23 defaulting to **5**, in Réglages and in `settingsSchema`. `src/lib/period.ts` gains `businessDayOf`, `businessDayBounds` and `lastCompletedBusinessDay`, and **`monthBounds` / `yearBounds` move onto the same clock**. One convention, derived in one module, as L-25 established. |
| **DD-23** | `NOT STARTED` | **`DailyClose`** — a sealed, chained document on the `MonthlyClose` pattern: `period` `"YYYY-MM-DD"` `@unique`, the aggregation columns, `dataJson`, `sealedAt`, `sealedById`, `previousHash`, `hash`, `fiscalEventId`. **`CLOTURE_J`** added to the event type union **in both enumerations** (`src/lib/fiscal.ts` *and* `src/types/api.ts` — Batch 5.5 updated only the first and *Open Threads → D* records why). `closeDay()` in `services/fiscal.ts`, aggregating through the existing `aggregatePeriod` so a day close cannot drift from the month that contains it (Batch 3.2's rule). |
| **DD-23** | `NOT STARTED` | **The guards, and one of them is deliberately NOT the monthly rule.** Refuse a duplicate; refuse a day that has not ended; refuse while any caisse is open (L-27's unconditional rule). **Sequencing differs from `assertNextPeriod`:** a restaurant closed on Mondays must not be blocked, so the rule is *strictly later than the last sealed day, and no earlier trading day left unsealed* — a day with no trading may be skipped, a day with sales may not. |
| **DD-23** | `NOT STARTED` | **The day-close ticket.** A printable document for the close, carrying its own fingerprint. **Batch 3.9 makes that fingerprint keyed; the ticket does not change again.** Nothing renders a Z to paper today, so this is the first fiscal document the printer path produces besides the receipt. |
| **DD-23** | `NOT STARTED` | **The operator surface.** The fiscal screen seals and lists day closes, defaulting to the last completed trading day. The shifts screen tells the operator when a **completed trading day is not yet closed** — the amber notice Batch 3.7 added warns about an open caisse spanning days, which is a different thing and stays. |
| **L-57** | `NOT STARTED` | **The perpetual total, recorded in every close.** `GrandTotal`'s figures as at the seal — sales, orders, VAT, per tender, refunded — written into the Z report, the day close, the monthly close and the annual close, in the row **and** in the sealed `dataJson`, so an inspector reads them without parsing (L-26's convention). This is BOFiP § 170's « calculées et enregistrées », and it is the finding with a clock on it. |

**What this batch deliberately does NOT do.**
1. **It does not refuse a sale, ever.** DD-23 was put to the operator with three options and the refusal was declined. The till's behaviour at 00:01 is unchanged.
2. **It does not make `closeMonth` require its days to be sealed**, exactly as `closeYear` asks nothing of its twelve months (Batch 3.6b, and a test pins that). Adding either requirement is a decision nobody has taken.
3. **It does not touch the keyed fingerprint.** That is Batch 3.9 and it arms at Batch 8.0's reset, where the journal is emptied anyway and no mixed-algorithm history can exist.
4. **It does not re-serialise a sealed row.** The two existing `ZReport` rows predate the journal — production carries **two fiscal events, both `VENTE`**, and no `CLOTURE_Z` has ever been written — so new columns default and nothing is rewritten (M-07's convention).

**Constraints carried in — copied, not paraphrased.**
- **`CLOTURE_Z` has GROWN twice and the sealed close three times, and both are safe only while nothing is sealed.** *(Open Threads → D.)* This batch is the **fourth** change to the sealed close payload and the **third** to `CLOTURE_Z`; `close-timing.test.ts` pins the key list and **caught 5.5's change rather than letting it through — edit it deliberately, never to make a run go green.**
- **A new event TYPE is not a new vintage** — but **a reader that enumerates types is not complete**, and two such enumerations exist. *(Open Threads → D.)*
- **Never apply a migration to production first.** Snapshot into `../db-snapshots/`, a **sibling** of the repo, apply to a copy, diff a fingerprint of every fiscal table, then hand the operator the exact command. *(Methods.)*
- **A period close equals the sum of its Z reports** (Batch 3.2) — extended here: **a month equals the sum of its days.**
- **Batch 8.0 / P-04's delete list must gain `DailyClose`**, as it gained `CashMovement` in Batch 5.5 and for the same reason: a reset that left day closes would carry development trading into the first real day.

### Batch 3.8 — Validation Required

- **The trading day is what the operator was promised.** A ticket rung at 01:00 with the cut-off at 05:00 is sealed into the **previous** day, proved by a test that reads the sealed row, not by inspection.
- **DD-24's own example is asserted**: a sale at 01:00 on 1 July, cut-off 05:00, appears in the day close for 30 June **and** in the monthly close for **June**.
- **A month equals the sum of its days**, asserted in a test — the Batch 3.2 rule at its new level; `report-agreement.test.ts` is where that class of claim already lives.
- **Every guard is exercised in both directions**: duplicate refused; unfinished day refused; open caisse refused; a day earlier than the last sealed refused; **a day skipped over an unsealed trading day refused**; **a day skipped over a day with no trading ALLOWED** — that last one is the restaurant closed on Mondays and it must pass.
- **Every close records the perpetual total**, and a test proves the sealed figure equals `GrandTotal` at the moment of sealing, for the Z, the day, the month and the year.
- `close-timing.test.ts`'s pinned key list is amended **deliberately**, and the record shows the old list beside the new one.
- **Changing the cut-off does not move an already-sealed close**, asserted.
- `/api/fiscal/verify` reports the day chain beside the other three, and it verifies.
- **Both** event enumerations carry `CLOTURE_J`, asserted the way `fiscal-surface.test.ts` asserts its neighbours.
- **Migration rehearsed on a copy with a fingerprint diff**: only the intended new table and columns, plus the `_prisma_migrations` row, may differ. The operator gets the exact `bunx prisma migrate deploy` command; Claude does not run it.
- **Every new assertion fails under a one-property revert, in both directions**, and the record **says which tests pass under no revert and why** — controls and regression pins are legitimate and must be named as such.
- `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build` all pass. Production `db/custom.db` byte-identical, no `-wal`/`-shm` beside it, `db/backups/` untouched.
- **P-04's delete list carries `DailyClose`** before this batch is called done.

### Batch 3.8 — Status Record

**Status:** `COMPLETED` in code and validated; **the migration is prepared and rehearsed but NOT applied to production** — that is the operator's, and the command is below. · **Completed:** 2026-09-06

**Changes.** `src/lib/period.ts` is the whole of the new clock: `businessDayOf` decides which trading day an instant belongs to, `businessDayBounds` gives the half-open window, `lastCompletedBusinessDay` is what the screen proposes, and `monthBounds` / `yearBounds` / `lastCompletedMonth` / `lastCompletedYear` moved onto the same clock (DD-24). **`cutoffHour` is a REQUIRED argument on every one of them**, deliberately: a default would let a caller take midnight boundaries while the closes around it took the cut-off, which is the disagreement DD-24 was answered to prevent — and the compiler duly found all nineteen call sites. `openedOnEarlierLocalDay` became `openedOnEarlierBusinessDay`, because on calendar days Batch 3.7's notice fired on every service that ran past midnight. New `localBoundary` names the hour in a refusal, found by the tests (see below). `DailyClose` is a sealed, chained document on the `MonthlyClose` pattern with `closeDay()`, `verifyDailyCloses()` and a `CLOTURE_J` event added to **both** enumerations. Its sequencing guard is deliberately **not** `assertNextPeriod`: a day may not be sealed before one already sealed, nor while an **earlier day that actually traded** is unsealed, but a day with no order and no cash movement may be skipped — otherwise a restaurant closed on Mondays would be blocked for the life of the business. L-57 writes `GrandTotal`'s figures into the Z report, the day, the month and the exercice, in the row and in the sealed payload. New `day-close-ticket.ts` renders the closing slip from the SEALED ROW, with the integrity code DD-25 will make keyed. New `POST /api/fiscal/close-day`; `GET /api/fiscal/verify` and `/api/fiscal/closes` carry the day chain; the fiscal screen seals, lists and reprints; the settings screen carries the cut-off in the operator's words. The archive gained `dailyCloses` and moved to the same year bounds as `closeYear`, schema **3 → 4** — left inline at midnight it would have disagreed with the exercice it archives, which is DD-24's own defect in a new place.

**Files.** 23 modified, 4 added: `prisma/schema.prisma` and its migration `20260906153622_daily_close_and_perpetual_totals`; `period.ts`, `services/fiscal.ts`, `services/reports.ts`, `services/day-close-ticket.ts` (new), `lib/fiscal.ts`, `types/api.ts`, `validation.ts`, `services/settings.ts`; routes `fiscal/close-day` (new), `fiscal/verify`, `fiscal/closes`; screens `fiscal-view.tsx`, `shifts-view.tsx`, `settings-view.tsx`; tests `daily-close.test.ts` (new), `period-daily-close.test.ts`, `close-timing.test.ts`, `api-authorization.test.ts`, `archive.test.ts`, `fiscal-verify-software.test.ts`, and four whose clocks were amended.

**Tests.** 820 → **857 pass, 0 fail**; `typecheck`, `lint`, `build` all pass; the client bundle still carries none of `package.json`. **Twenty reverts, and nineteen were caught.** R1 the cut-off ignored (10 fail), R2 day bounds at midnight (7), R3 `monthBounds` without the cut-off (4), R4 the cut-off not stored on the row (3), R5 the unsealed-trading-day check removed (2), R6 the day rule replaced by the monthly one (2 — including the Monday-closed case, which is the point), R7 no premature guard, R8 no open-caisse guard, R9/R10 the perpetual total dropped from the day and the month, R12 nulls instead of measured zeros (3), R13 `CLOTURE_J` removed from the client union only, R14 the integrity code unprinted, R15 a zero printed where the figure was never taken, R16 the refusal naming the day not the hour (2), R17 the day chain unwired from the verify route, R18 the archive without `dailyCloses`, R19 the duplicate guard, R20 the chaining. **R11 SURVIVED: removing the perpetual total from `generateZReport` broke nothing**, so L-57 was three-quarters asserted and the Z — one of BOFiP's four closes — had no test at all. A case was added, and it now fails under the revert in both directions, on the row and on the event payload. Adding it also turned seven unrelated cases red, because the file's reset helper never deleted `ZReport` and `ZReport.shift` is `onDelete: Restrict`; the helper was fixed rather than the test moved. **Passing under no revert, and named rather than counted as coverage:** the three cut-off-0 controls (the clock, the month, the notice), which exist to prove the setting can be turned off and nothing changes; "is quiet within the day it was opened"; and "does not warn about the future when the clock has been moved back", which R1 cannot reach because it returns early.

**Seven tests in five other files were amended deliberately, and each is a real behaviour change, not a relaxation.** Five sealed a month at midnight on the 1st, which is now five hours early because the month ends at the cut-off; each moved to 06:00 with the reason written above it. `archive.test.ts` pinned schema version 3 and now pins 4 and asserts `dailyCloses`. `api-authorization.test.ts` gained `fiscal/close-day:POST` as `BOTH` and its gate count moved `BOTH: 29 → 30`, every other number unmoved. **The two amended timing cases found a message defect and it was fixed rather than papered over**: the refusal said « à partir du 2026-10-01 » when the truth was 05:00 on 1 October, so it would have sent the operator back at a time that was itself refused.

**Migration rehearsal.** Snapshot to a scratch copy, `prisma migrate deploy` on the copy, fingerprint diff of every fiscal table before and after: **exactly 12 lines differ and every one is schema** — `DailyClose` created (0 rows), the three columns on `MonthlyClose` and `AnnualClose`, the two on `ZReport`, and `_prisma_migrations` 8 → 9. **Not one data row changed**, `integrity_check` and `foreign_key_check` unmoved. `MonthlyClose` and `AnnualClose` are rebuilt by SQLite because a defaulted column was added; both hold zero rows, re-verified in the same diff.

**Walkthrough, on the production build against a marker-proved scratch copy** (`SCRATCH-COPY-3.8` returned by the pre-auth `GET /api/auth/profiles` before the first write; server on 3067, killed by PID afterwards). Sealing a day while caisse 3 was open was **refused, and by the sequencing guard first**, naming 2026-08-20 as the earliest unsealed trading day. Caisse 3 was closed with a Z: **Z #3 carries `perpetualSalesTotal` 5 480 while Z #1 and #2 carry null**, which is L-57's nullable choice working exactly as designed. The eight trading days then sealed in order, and **the trading-day clock is visible in the result**: 2026-08-21 and 2026-08-29 sealed at zero because their early-hours tickets belong to the day before. **The eight day closes sum to the three Z reports exactly** — 47 880 cents, 20 tickets, 4 370 VAT — and **August's monthly close equals the sum of its trading days**, 42 400 over 18 tickets. All four chains verify. The slip for 2026-08-27 renders from the sealed row with its integrity code `A567-EF2F-EC1B-2C69` matching the fingerprint. The 2026 archive builds at schema 4 with 8 `dailyCloses`, and `sha256sum -c` says OK. **Production `db/custom.db` unchanged throughout**: `96b48ad0…`, 704 512 bytes, mtime 2026-09-05 17:48, no `-wal`/`-shm`, and `db/fiscal-archives/` still does not exist.

**Commit:** *(this commit)*

**Notes.**
1. **The operator must apply the migration.** Claude cannot run it against production and did not. The exact command, after a backup: `bunx prisma migrate deploy`. Until it runs, the code expects a `DailyClose` table the live database does not have. Nothing is running against that database today, which is why this is a hand-over and not an outage.
2. **R11 is the batch's lesson.** A finding stated as "every close" was asserted for three of the four. The revert protocol is what found it; re-reading the diff would not have.
3. **The day rule is not the month rule, and that is deliberate.** M-01 refuses a gap because a skipped month can never be sealed. A skipped day is normal — the restaurant closes — so the guard protects the property M-01 actually protects: no unsealed day that traded.
4. **This is the FOURTH growth of the sealed close payload and the last free one.** Zero closes existed when it landed, re-verified in the rehearsal. The first real close fixes the shape for good.
5. **A required argument found nineteen call sites the reader would not have.** Making `cutoffHour` non-optional was worth more than any comment about remembering it.
6. **The archive was moved onto the new clock as a consequence, not as a drive-by.** Left at midnight it would have disagreed with the exercice it archives about the tickets either side of 1 January.
7. **DD-23's refusal was offered and declined**, and the till still refuses nothing at any hour. That non-action is written into the code comments so a later session does not add it back as an obvious improvement.

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

**Correction, 2026-09-04 (session 7, after this batch was committed).** Note (7) above left the `EPERM` cause open, naming the two leftover servers and OneDrive as candidates. The user then asked for the servers to be stopped, which settled it: PIDs 4016 (`-p 3011`) and 24116 (`-p 3012`) — both serving the session-3 scratch copy, identified by the marker profile `SCRATCH-3.1b-Administrateur`, neither holding the production database — were stopped with their `bunx` parents 10540 and 22844, and `bunx prisma generate` then **succeeded**, regenerating the client to v6.19.2. So a stale `next start` was the cause all along; only the port recorded against it was wrong. `db/custom.db` was `a66bc96c20d3f00282ea249361dd80d6303434b1a43331c0725258b637db46f9` before and after with no journal sidecar, and `bun test src --timeout 30000` still gives **413 pass, 0 fail** against the regenerated client. OneDrive is exonerated.

**(8) This batch's own servers were stopped.** Ports 3024 (fixed code) and 3025 (pre-batch code) are free. As Batch 4.1 note 7 warned, `TaskStop` on the wrapper shell does not stop the `next start` child; both had to be stopped by PID.

**(9) The suite is faster than L-24 recorded**, at 80–100 s against the ~192 s in that finding, on the same `--timeout 30000`. Nothing in this batch explains it — only `auth.test.ts` and the three new files derive PINs. Recorded as an observation, not a claim; L-24's advice to pass the timeout stands.

## Batch 4.3 — Credentials, sessions and network exposure

*Moved verbatim from `REMEDIATION_PLAN.md` lines 923–1012 (commit `5664fd8`, plus this batch's status record) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**Status:** `COMPLETED` (2026-09-04)

### Credential policy (operator determination, 2026-09-04)

Two decisions from the operator shape this batch. Read them before touching
C-18 or M-23, because they narrow the work rather than describe it.

**1. Network exposure — DD-06 answered: no LAN access.** The POS runs on the
all-in-one till and nothing else. The server binds `127.0.0.1`, in
`package.json`'s `start` script, which is tracked in git. Note that C-18's own
evidence cites `start.ps1` for the missing `-H`; **that file does not exist**,
so there is no launcher to put it in and no untracked file that can undo it.
`APP_URL` stays unset — at a localhost origin the `Secure` cookie is accepted,
which was observed, so nothing else has to change. Printing is unaffected: the
ESC/POS bridge (DD-01) dials **out** to port 9100 and a listener bind does not
touch outbound connections.

**2. PIN handling — keep the current arrangement.** The operator's decision is
that PINs stay as they are for now. Concretely, for this batch:

- **No self-service PIN change is built.** There is none today: the only
  PIN-changing surface is the `Utilisateurs` view, gated `roles:
  ["SUPER_ADMIN"]` at `nav-config.ts:49`, so a cashier or manager cannot change
  their own PIN from anywhere in the application. That stays true.
- **The default PINs stay live.** `admin` / `123456` and `manager` / `111111`
  remain the credentials on the production machine. **No forced PIN change on
  first login is built**, which was C-18's suggested direction.
- **C-18 therefore cannot be marked `COMPLETED` by this batch.** Its network
  half closes with the bind; its credential half is an accepted residual risk,
  and the finding carries `◐` in the index like C-15, C-22 and L-04. See
  *C-18 — what this batch does and does not close* below.
- **M-23 is still fixed, and its fix must need no UI.** The finding is that
  `PUT /api/users/[id]` lets a caller edit their **own** `pin` and `active`
  with no knowledge of the current PIN — reachable today by anyone who can
  make a request from the till, with no screen required. The remediation
  direction in the finding ("require the current PIN") assumes a self-service
  flow that this batch is not building, so the shape that fits the decision is
  to **refuse `pin` and `active` on a non-SUPER_ADMIN self-edit outright**.
  That closes the hole, changes no screen, and leaves the `Utilisateurs` view
  working exactly as it does now, since a SUPER_ADMIN is not self-editing under
  that rule — they are administering. Confirm the shape before writing it.

### C-18 — what this batch does and does not close

| | State after this batch |
|---|---|
| Server reachable from the restaurant Wi-Fi | **Closed.** Binds `127.0.0.1`; verified refused at the LAN address. |
| `GET /api/auth/profiles` leaking the staff list | **Closed** by the bind — the route itself is unchanged and still public on localhost. |
| `POST /api/seed` bootstrapping a super-admin into an empty user table | **Closed to the network** by the bind; the local-only guard is still worth adding, because C-17's unguarded `deleteMany({})` scripts can empty that table. |
| `admin` / `123456` and `manager` / `111111` live | **Open, by decision.** The remaining threat is physical: anyone reaching the till while it is unattended can sign in as SUPER_ADMIN with the most-guessed PIN there is. Batch 4.1's lockout does not help against a first-guess success. |

### C-18 — Default PINs are live; an empty user table lets anyone bootstrap a super-admin

**Status:** `◐ PARTLY COMPLETED` — network half closed, credential half an accepted residual risk · Severity: HIGH · Category: security

**Problem.** `POST /api/seed` is unauthenticated when `user.count() === 0` and creates `admin` (SUPER_ADMIN) with `SEED_ADMIN_PIN ?? "123456"`. The production database uses exactly those defaults.

**Evidence.** `seed/route.ts:22-40`. Commit `5ef7dc4` states: "User credentials: admin=123456, manager=111111". `GET /api/seed` is unauthenticated and reports initialisation state. `GET /api/auth/profiles` is public and lists every active user's id, username, name and role.

**Location.** `src/app/api/seed/route.ts:22-40, 113-116`; `src/app/api/auth/profiles/route.ts`

**Impact.** The server binds `0.0.0.0` (no `-H` in `start.ps1`), so anyone on the restaurant Wi-Fi can enumerate users and try the two best-known PINs in the world. If the user table is ever emptied (see C-17), the seed endpoint hands a fresh super-admin to whoever asks first.

**Remediation direction.** Force a PIN change on first login; bind to `127.0.0.1` unless LAN access is required; gate the seed bootstrap behind a one-time token or a local-only check.

**Note.** If LAN access *is* required, `APP_URL` must be set to an `http://` value or the session cookie's `secure` flag silently rejects login over plain HTTP with no error. See DD-06.

| ID | Status | Problem | Location | Direction |
|---|---|---|---|---|
| **M-23** | `COMPLETED` | Changing a PIN requires no knowledge of the current PIN; `PUT /api/users/[id]` allows self-edit of `pin` and `active`. Anyone at an unlocked till can permanently change the signed-in user's PIN. | `users/[id]/route.ts:15-29` | Require the current PIN for a self-service PIN change; forbid self-deactivation. |
| **M-27** | `COMPLETED` | The approval-token `consumed` Set grows without bound and is lost on restart, permitting one replay inside the 60 s TTL. | `approvals.ts:22-28, 118-121` | Prune expired entries. The replay window is documented and accepted for single-tenant use; the unbounded growth is not. |
| **M-28** | `COMPLETED` | `Session.device` reads `store.get("user-agent")` from the *cookie* jar, not the header, so the column is always null. | `auth.ts:162` | Read the header. |

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

**Status:** `COMPLETED` · **Completed:** 2026-09-04 · **Commit:** `aac03f6` · **Findings:** C-18 `◐`, M-23, M-27, M-28

**Changes.**

**(1) The server stopped listening on the restaurant Wi-Fi — DD-06.** `package.json`'s `start` script became `next start -p 3000 -H 127.0.0.1`. Without `-H`, `next start` binds `0.0.0.0`: verified before the change on a production build, which announced `Network: http://192.168.1.12:3026` and answered there. C-18's evidence blames a missing `-H` in `start.ps1`; **that file does not exist**, so `package.json` — tracked in git — is where the decision can live and where nothing untracked can undo it. A test pins the flag.

**(2) The measurement that corrected the plan's framing.** The plan called the pre-batch state "protective by accident", on the grounds that the `Secure` cookie made LAN login fail. It was not protective. In a real browser at the LAN address, login returned **200 with a valid user** and the next `GET /api/auth/me` returned **`{user: null}`** — the session never sticks — while the same login at `http://localhost` worked, localhost being a secure context. But the endpoints that matter never read that cookie: unauthenticated from the LAN, `GET /api/auth/profiles` returned the full staff list and `POST /api/auth/login` returned 200 and a valid session token. The broken cookie blocked the restaurant's own staff and blocked no attacker. Full rationale: record → *Answered design decisions*, DD-06.

**(3) M-23 — a caller can no longer rewrite their own credentials.** `PUT /api/users/[id]` admitted any caller editing their own row and then applied `pin` and `active` from the body with no further check, so anyone at an unlocked till could permanently re-PIN the signed-in cashier or switch their account off — no screen needed, the route answers a plain request. The finding's direction ("require the current PIN") presumes a self-service flow that does not exist and that the operator has decided not to build, so the shape is a flat refusal: a non-SUPER_ADMIN self-edit carrying `pin` or `active` is refused in French, and **self-deactivation is refused for everyone**, super administrator included. Name self-edit still works, and administering *another* account is untouched — which is what the `Utilisateurs` view does.

**(4) C-18 — the bootstrap now belongs to a fresh install only, and only that half is closed.** `POST /api/seed` was guarded by `user.count() === 0` alone, so emptying `User` — one unguarded `deleteMany({})` away in the C-17 scripts — handed a new SUPER_ADMIN with the published default PIN to whoever asked first. It now also refuses when the database has ever traded: any order, any journal entry, or any advanced fiscal counter. The counter check is the one that matters, because a script that wipes users and orders cannot rewind `FiscalCounter`. **The default PINs are untouched by operator decision** — see *Credential policy* — so C-18 is `◐`, not `COMPLETED`.

**(5) M-27 — the consumed-token map is bounded.** `verifyApprovalToken` remembered every accepted token in a `Set<string>` nothing removed from. It is now a `Map<token, exp>` swept on every insert. Swept unconditionally rather than past a size threshold the way `rate-limit.ts` does, because the two are not the same shape: a rate-limit key is minted by anyone who sends a request, an entry here costs a manager's correct PIN. The map therefore holds only tokens inside the 300 s maximum TTL — tens of entries at a busy till — so the sweep walks a handful of keys and there is no tuning constant to get wrong.

**(6) M-28 — `Session.device` is populated for the first time.** It read `store.get("user-agent")` — the *cookie* jar, which has no such cookie — so the column was null on every row ever written. It now reads the request header, in a `try`/`catch` because `headers()` throws outside a request scope and a missing device hint must never stop a login.

**Files:** `package.json`, `src/lib/services/account-policy.ts` (new), `src/lib/services/account-policy.test.ts` (new), `src/lib/approvals-consumed.test.ts` (new), `src/lib/approvals.ts`, `src/lib/auth.ts`, `src/app/api/users/[id]/route.ts`, `src/app/api/seed/route.ts`. **No migration** — the schema is untouched; `Session.device` already existed and was simply never filled.

**Tests:** `bun test src --timeout 30000` → **430 pass, 0 fail** (413 before; 17 new across two files). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS. **Every fix proved against the pre-batch code**, per the Stage 3 method, on the same build and the same scratch data. **M-23**: on `HEAD`'s route a cashier logged in, `PUT`ed their own row and got `200` — the stored `pinHash` changed, and a second call set `active` to `0`, switching their own account off. Fixed: `403` on both, hash unchanged, `active` still `1`. **C-18**: on `HEAD`'s route the wiped database (users `0`, counters `20/3/2/2`) answered `POST /api/seed` with `200` and created `admin` (SUPER_ADMIN) and `manager`. Fixed: `409 « Base non vierge… »`, users still `0`. **M-28**: identical `user-agent` header, old code stored `device: null`, fixed code stored `"HibaPOS-Validation/4.3 (scratch)"`. **M-27**: the sweep call alone was removed, leaving the map and the counter export in place, so the failure isolates the fix rather than a missing export — 2 of the 4 cases fail, holding 7 entries where 2 are expected and 27 where at most 17 are. All four files were restored from copies and re-checked by sha256 (`35e497f9…`, `3ed14a9b…`, `a2c81b55…`, `f1b99f68…`).

**Notes.**

**(1) What this batch did NOT do, and why.** The operator's decision of 2026-09-04 is that PINs stay as they are: no self-service PIN change, no forced change on first login, default PINs live. C-18's own remediation direction named the forced change first, so this batch deliberately implements the other two thirds of it and leaves that one alone. *Credential policy* in the plan carries the decision; the finding keeps `◐`.

**Correction, 2026-09-04 (same session, after this batch was committed).** Notes (1) and (2) below describe the default PINs as a standing, accepted residual risk. **They no longer are.** The operator changed both PINs the same day, in `Utilisateurs` on the running application — four `USER_UPDATED` audit rows and a database hash moving `a66bc96c…` → `e40735ca…` → `7839db18…`, with fiscal state untouched throughout. **C-18 is closed**, and the index carries ✅ rather than ◐. Two things a later reader must know: the values were never seen by Claude and are recorded nowhere, in any file or commit; and the **first** replacement was itself one of the two published defaults — the repository documents its own seed PINs in `prisma/seed.ts`, `scripts/seed-users.ts`, commit `5ef7dc4` and in this very section — which was flagged and corrected by a second change. The forced-PIN-change-on-first-login mechanism named in C-18's remediation direction was **not** built, by the operator's decision of the same day; it is not required for the finding to be closed, because the condition the finding describes is no longer true.

**(2) The residual risk, stated so nobody has to infer it.** `admin` / `123456` and `manager` / `111111` remain valid on the production machine. After this batch the threat is physical rather than networked: anyone who reaches the till while it is unattended can sign in as SUPER_ADMIN with the most-guessed PIN there is. Batch 4.1's lockout does not help — it counts wrong guesses, and this one is right. Changing them is an operator action, out-of-band, and **the values must never be written into these documents**.

**(3) Why M-23's refusal is flat rather than a current-PIN check.** A current-PIN check is the better rule *when there is a screen to type the current PIN into*. There is none: `nav-config.ts:49` gates `Utilisateurs` to `SUPER_ADMIN`, so no cashier or manager can reach any PIN field. Building the check without the screen would add an unreachable branch and a false suggestion in the code that self-service exists. The flat refusal closes the same hole with nothing unreachable behind it.

**(4) A SUPER_ADMIN may still reset their own PIN, deliberately.** They reach the route through `Utilisateurs`, which lists their own row, and they are administering rather than self-servicing. Blocking it would break the only PIN-management surface the product has. Self-*deactivation* is refused for them too, because that is a lockout rather than an administration.

**(5) Validated end-to-end through the real routes on the production build, against three scratch copies.** The main copy was proved before the first write by reading the marker profile `MARQUEUR-4.3-SCRATCH` from the pre-auth `GET /api/auth/profiles`. All accounts were synthetic with PINs generated for the run — **no real PIN was used anywhere**. The bind was verified on the running server: `TCP 127.0.0.1:3028 LISTENING`, localhost `200`, the LAN address refused. Two further copies covered C-18's branches: one with users wiped and only the fiscal counters left (the C-17 scenario) → `409`, zero users created; one genuinely fresh, counters at zero → `200`, two users created, so **first boot still works**.

**(6) One limit on the C-18 evidence.** On the "genuinely fresh" copy the response read *« Base initialisée (requête concurrente). »* rather than the plain success message, because that copy still carried the real catalogue and `seedCatalogAndSettings` therefore threw on duplicate category names, landing in the route's catch-all. The users were created, which is what C-18 is about. Recorded as **L-31**.

**(7) `Session.device` is verified end-to-end, not by unit test.** `createSession` calls `cookies()` and `headers()`, which throw outside a request scope, so a unit test could only assert a mock of the very call that was wrong. The header→database path was exercised for real instead, on both the old and the new build, with the same header.

**(8) Production untouched.** `db/custom.db` is `a66bc96c20d3f00282ea249361dd80d6303434b1a43331c0725258b637db46f9` before and after, mtime unchanged at 2026-09-04 09:43:54, no `-wal` / `-shm` / `-journal` sidecars, `db/backups/` untouched, no `db/fiscal-archives/` created.

**(9) Environment.** This batch's scratch servers ran on ports 3026 and 3028–3032 and were all stopped by PID. The `next start` child still survives `TaskStop` on the wrapper, as Batch 4.1 note 7 recorded. The Prisma `EPERM` is gone since the session-5 leftovers were stopped — see the correction appended to Batch 4.2.

## Batch 4.4 — Authorization gating parity

*Moved verbatim from `REMEDIATION_PLAN.md` lines 949–1046 (commit `250d26c`, plus this batch's status record) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**Status:** `COMPLETED` (2026-09-04)

### Operating model (operator determination, 2026-09-04)

DD-07 was asked as "which reports and settings should a CASHIER see". **It has
no subject.** Production has carried exactly two accounts throughout —
`manager` (MANAGER) and `admin` (SUPER_ADMIN) — and the user has confirmed the
deployment:

- **Only the MANAGER account operates the till.**
- **The SUPER_ADMIN account is the developer's**, not the restaurant's. Staff
  do not use it. **Its visibility is accepted**: the manager may see that such
  an account exists, and the login screen keeps its SUPER_ADMIN button.
- **`CASHIER` stays in the code but no cashier account will exist.** The role
  is implemented and working; it is simply unused.
- **No discount or refund approval control is required in operation.**

**M-19s has no subject under this model — mark it `DEFERRED`, not
`COMPLETED`.** It described reads left ungated *for a CASHIER*: `GET
/api/settings` (SIRET, TVA number, discount threshold), `GET /api/reports/x`,
and the shift endpoints. There are no cashiers, and the only two roles that
exist are both entitled to all of it — a MANAGER running the restaurant may
read its own SIRET. The `GET`/`POST` disagreement on `/api/reports/x` is real
but unobservable here, because every account that can call the `GET` can also
call the `POST`.

Two things must therefore be written down rather than fixed, so neither is
lost if a cashier account is ever created: the ungated reads above, and the
fact that **`GET /api/auth/profiles` is public and returns every active user's
id, username, name and role**, with `login-screen.tsx:486-489` rendering a
dedicated button for the SUPER_ADMIN profile. The user has **accepted** that
the manager sees the developer's account, so this batch does not hide it. C-18
already carries the endpoint as an enumeration surface.

**What this does NOT change.** C-16, M-24, M-25 and M-26 are untouched by the
absence of cashiers. C-16 in particular is fully live between MANAGER and
SUPER_ADMIN: `users`, `settings`, `audit`, `backups` and `logs` are all
SUPER_ADMIN-only in `nav-config.ts`, but the render branch has no role
condition, so **a manager typing `#/backups` still gets the restore button
mounted**. The remediation direction's "default an unknown role to CASHIER"
still stands — the role is retained precisely so it can serve as the
least-privileged default.

**Two consequences recorded, not acted on** (safety rule 10 and rule 11):

1. **The approval gates never fire.** `orders/route.ts:223` requires an
   approval token only when `user.role === "CASHIER"`; `refund/route.ts:87`
   lets MANAGER and SUPER_ADMIN self-approve. So a manager may apply a discount
   of any size with **no approver recorded**, and refund any amount by
   self-approval. Batch 4.1's brute-force lockout and Batch 3.5's C-13 approver
   trail are therefore guarding a path this deployment does not use. This is
   the operator's decision and is not a defect to fix here.
2. **The approval machinery is kept, not deleted.** The user retained the
   `CASHIER` role, and that role is meaningless without the approval mechanism
   that gives it a discount ceiling. Deleting `/api/auth/approve`,
   `approvals.ts` and the dialog would also undo audited work from Batches 3.5
   and 4.1. Removal stays available as a later decision; nothing in this batch
   depends on it.

### C-16 — Role gating is client-side only; every admin view renders for every user

**Status:** `COMPLETED` · Severity: HIGH · Category: security

**Problem.** `app-shell.tsx:124-139` renders by `view ===` with no role condition, and `initHashSync` accepts any of the 17 valid hashes from the URL. Role filtering exists in exactly one place — the home dashboard's module list.

**Evidence.** A CASHIER typing `#/users`, `#/settings`, `#/audit`, `#/backups` or `#/logs` gets the full view mounted with live forms and buttons, including the database-restore button. `home-dashboard.tsx:207` — `const role = (user?.role as Role) ?? "MANAGER"` — an undefined role fails **open** to MANAGER.

**Location.** `src/components/shared/app-shell.tsx:124-139`; `src/store/app-store.ts:103-121`; `src/components/shared/home-dashboard.tsx:207, 259-261`

**Impact.** The server side was audited route by route and **holds** — every sensitive mutation re-checks the role. So this is exposure and confusion rather than direct compromise: a cashier sees admin screens, reads whatever the ungated GETs return, and gets 403s on the rest. But the UI is now the only thing between a curious employee and the restore button.

**Remediation direction.** Gate the render branch on `NAV_ITEMS.roles`, reject unauthorised hashes in `initHashSync`, and default an unknown role to CASHIER.

| ID | Status | Problem | Location | Direction |
|---|---|---|---|---|
| **M-19s** | `DEFERRED` — no subject under DD-07 | Ungated reads for CASHIER: `GET /api/settings` (SIRET, TVA number, discount threshold), `GET /api/reports/x`, all shift endpoints. The X report is deliberately open because the cashier-visible shifts view uses it — which makes the MANAGER+ gate on `POST /api/reports/x` decorative. | `settings/route.ts:7`; `reports/x/route.ts:38`; `shifts/*` | Decide the intended cashier visibility, then make GET and POST agree. See DD-07. |
| **M-24** | `COMPLETED` | `POST /api/upload` has no role gate, trusts the client-declared MIME type, and imposes no quota. | `upload/route.ts:31-56` | Add a role gate, magic-byte validation and a quota. Disk exhaustion is the realistic impact. |
| **M-25** | `COMPLETED` | `PUT`/`DELETE /api/customers/[id]` have no role check — any cashier can edit or deactivate any customer record. | `customers/[id]/route.ts:20,32` | Add role checks consistent with the intended matrix. |
| **M-26** | `COMPLETED` | No security headers anywhere: no CSP, X-Frame-Options, Referrer-Policy or HSTS, and no `middleware.ts` to add them. | `next.config.ts` | Add headers. Lower risk on a kiosk, but the app is served unencrypted over the LAN. |

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

**Status:** `COMPLETED` · **Completed:** 2026-09-04 · **Commit:** `36a9cd9` · **Findings:** C-16, M-24, M-25, M-26; M-19s `DEFERRED`; T-03 partly

**Changes.**

**(1) C-16 — one gate, and it fails closed.** `canAccessView(role, view)` in `nav-config.ts` is now the single authority, and `app-shell.tsx` renders `<AccessDenied />` instead of the view when it says no. Before this the shell rendered on `view ===` with no role condition and `initHashSync` accepted any valid hash, so typing `#/backups` mounted the backups view with its live controls. The check sits in the shell rather than in `initHashSync` because the hash is parsed before the session is known; the shell is the first point that has both, and it recomputes on every render, so a role change through switch-user takes effect immediately.

**(2) The fail-open default is gone.** `home-dashboard.tsx` read `(user?.role as Role) ?? "MANAGER"` — a user that failed to load produced a *manager's* module list. Every such default now resolves to `LEAST_PRIVILEGED_ROLE`, which is `CASHIER`. That is the reason DD-07 kept the role in the product: it is the floor the gate falls to.

**(3) The role table changed, on the operator's decision (DD-07).** `settings` and `audit` were opened to MANAGER — Réglages carries the printer IP and name, the receipt width and the SIRET / TVA number, and the plan still carries an operator action to correct `printerName` there; the audit journal is read-only. `backups` was deliberately **not** opened: it holds the restore button, backups already run automatically at the Z close (Batch 2.2), and the manager account is whoever is standing at the till. `users` and `logs` stay SUPER_ADMIN. Each decision is a comment at the row it governs.

**(4) M-24 — the upload route stopped trusting the client.** It had no role gate at all, believed the declared MIME type, and had no ceiling on the directory. It is now MANAGER+ (uploading is a catalogue action and `media` is MANAGER+), the bytes must carry the signature of the type they claim (`bytesMatchDeclaredType` in the new `image-upload.ts`), and the tree has a 250 MB quota against a live catalogue of ~49 MB. A file whose content contradicts its type is `400`; a full directory is `507`.

**(5) M-25 — customer writes are gated.** `PUT` and `DELETE /api/customers/[id]` carried no role check whatsoever. Both are MANAGER+ now. `GET` stays open to any authenticated role: the customers view is available to every role and reading a customer is what it is for.

**(6) M-26 — security headers.** CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and a `Permissions-Policy` denying camera, microphone, geolocation and payment. **No HSTS, deliberately**: DD-06 binds the server to `127.0.0.1` over plain HTTP, and `Strict-Transport-Security` would teach the browser to refuse that origin — it would break the till. `script-src` keeps `'unsafe-inline'`/`'unsafe-eval'` because Next injects inline bootstrap scripts and a nonce-based policy needs middleware on every response; the value taken here is `frame-ancestors`, `object-src` and pinning every fetch to `'self'`. A CSP that breaks the POS is worse than one that narrows it.

**(7) T-03 — the API surface is now walkable.** `withAuth`/`withAuthParams` stamp the gate they declare onto the handler they return (`roleGateOf`), which nothing in the request path reads. `api-authorization.test.ts` walks all 61 route modules and asserts that every exported method is wrapped, except eight named unauthenticated routes each carrying its reason.

**Files:** `src/components/shared/nav-config.ts`, `src/components/shared/app-shell.tsx`, `src/components/shared/home-dashboard.tsx`, `src/components/shared/nav-access.test.ts` (new), `src/lib/api-handler.ts`, `src/lib/api-authorization.test.ts` (new), `src/lib/services/image-upload.ts` (new), `src/lib/services/image-upload.test.ts` (new), `src/app/api/upload/route.ts`, `src/app/api/customers/[id]/route.ts`, `next.config.ts`. **No migration.**

**Tests:** `bun test src --timeout 30000` → **453 pass, 0 fail** (430 before; 23 new across three files). `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS. **C-16 proved against the pre-batch code** in a real browser, on the same build and scratch data: with `nav-config.ts`, `app-shell.tsx` and `home-dashboard.tsx` restored from `HEAD`, a **MANAGER** navigating to `#/backups` got the full *Sauvegardes* view — subtitle « Export et restauration des données », a live « Créer une sauvegarde » button — and after the fix the same navigation renders « Accès refusé » and the view never mounts. The three files were restored afterwards and verified with `sha256sum -c`, all three OK.

**Notes.**

**(1) The audit's characterisation is exactly right, and now measured.** C-16 was scored as exposure rather than compromise because the server holds. Confirmed on the pre-batch build: the manager saw the backups view *and* its buttons, and pressing one returned `403 « Réservé au super administrateur »`. So the fix closes a confusion and a temptation, not an open door — which is worth saying plainly rather than overselling.

**(2) What the browser run actually showed, and did not.** On the old build the *view* mounted with live controls; the per-backup **restore** button is rendered per row and that scratch copy had no backups yet, so the restore control itself was not observed — only the view that hosts it, and its create button. Everything else was observed directly: after the fix, `settings`, `audit`, `fiscal`, `reports` and `pos` opened for the MANAGER and `users`, `logs` and `backups` were refused.

**(3) The CSP was verified in a browser, not just on the wire.** Headers confirmed on a real response, then the app driven under them: the POS rendered, **85 images loaded with 0 broken**, and the console carried **no errors and no CSP violation reports**. This mattered enough to check — a policy that blocks the app's own assets would take the till down at exactly the moment nobody is watching a console.

**(4) T-03 is declaration-level, and that limit is in the test file's own header.** It asserts the gate each route *declares* — that it is wrapped, and which roles it names. It does not drive requests and assert status codes; `withAuth` → `getSession()` → `cookies()` throws outside a request scope, so a status-level matrix needs a harness and stays with Batch 6.1. What this catches: a new unguarded route, a widened gate, and the whole class M-24 and M-25 were. What it does not: a handler that declares the right roles and then ignores them.

**(5) The matrix found something on its first run, which is the point.** `POST /api/backups`, `DELETE /api/backups/[id]`, `POST /api/users` and `PUT /api/settings` are guarded by an inline `if (user.role !== "SUPER_ADMIN")` inside the handler rather than by the declarative option, so `roleGateOf` reports them as open to any authenticated role. They are **not** insecure — the handler refuses — but the two idioms mean the declarative matrix cannot see about twenty gates. Converting them would change the French error text each returns (« Réservé au super administrateur » against `withAuth`'s « Accès refusé »), which is user-visible and outside this batch. Recorded as **L-32**; the test pins which idiom each destructive route uses so a deleted inline guard is still visible in review.

**(6) Closing a caisse is deliberately open to any role**, per the business rule stated at `reports/z/route.ts:16`. A test asserts that absence so it reads as a decision rather than a gap the matrix missed.

**(7) M-19s is `DEFERRED`, not fixed.** DD-07 removed its subject: it described reads left ungated *for a CASHIER*, and the only two roles in existence are both entitled to them. The underlying facts are written into the DD-07 amendment so none is lost if a cashier account is ever created.

**Correction, 2026-09-04 (same session, after this batch was committed).** DD-07's rationale and this batch's *Operating model* both state that with no cashiers "a manager may apply a discount of any size with **no approver recorded**". **That is wrong.** `orders/route.ts:251` runs `} else if (discountPercent > threshold && (user.role === "MANAGER" || user.role === "SUPER_ADMIN")) { discountApproverId = user.id; }`, and `refund/route.ts:87` does the same for refunds — so the approver **is** recorded, as the acting user themselves. The accurate statement is that **no second person is required and no deliberate act is demanded**, not that the trail is empty. The substance of the operator's decision is unaffected; the claim about the data was not. This correction is what led to DD-19.

**(8) Production untouched.** `db/custom.db` is `a66bc96c20d3f00282ea249361dd80d6303434b1a43331c0725258b637db46f9` before and after, no `-wal` / `-shm` sidecars, no `db/fiscal-archives/` created. The scratch copy was proved before the first write by reading `MARQUEUR-4.4-SCRATCH` from the pre-auth `GET /api/auth/profiles`; all accounts were synthetic with PINs generated for the run.

**(9) Environment.** Scratch servers ran on ports 3033 and 3034 and were stopped by PID. One thing worth knowing for the next browser run: a session cookie set at `http://127.0.0.1:<port>` did **not** persist in the browser, while the same cookie at `http://localhost:<port>` did — so drive the UI at `localhost`. The bind is unaffected; both names resolve to the loopback interface the server listens on.

---

## Batch 4.4b — Remove the CASHIER role, close M-19s

*Moved verbatim from `REMEDIATION_PLAN.md` lines 983–1077 (commit `7449683`, plus this batch's status record) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**Status:** `COMPLETED` · **Decisions:** DD-07 (final answer) · **Findings:** M-19s

**Why this exists.** DD-07 was answered three times in one day, and the final
answer changed the work. The restaurant's owner asked for a **single
operational role**. `CASHIER` is therefore not part of this product, and the
half-supported state it is in today is the worst of the options: implemented
and navigable, its discount ceiling never fires, and M-19s cannot be closed
while it exists.

**Why M-19s could not be closed before.** It describes two reads left open to
any authenticated caller — `GET /api/settings` (SIRET, TVA number, address,
printer configuration, discount threshold) and `GET /api/reports/x` — while
`PUT /api/settings` is SUPER_ADMIN and `POST /api/reports/x` is MANAGER+. The
obvious fix is to raise the reads. Measured on 2026-09-04, that fix would
**break a cashier**: `discount-dialog.tsx:25`, `payment-dialog.tsx:58`,
`receipt-dialog.tsx:29` and `orders-view.tsx:176` all read `/api/settings`,
and `shifts-view.tsx:106` reads the X report — all in views that were
CASHIER-visible. Remove the role and the same fix becomes a no-op.

### M-19s — ungated reads, and GET disagreeing with POST

**Status:** `COMPLETED` · Severity: MEDIUM · Category: security (authorization)

**Scope after DD-07.** Raise `GET /api/settings` and `GET /api/reports/x` to
`{ roles: ["SUPER_ADMIN", "MANAGER"] }` so read and write agree. With one
operational role this changes no observable behaviour — which is the point:
it removes a latent inconsistency rather than fixing a live leak.

### The removal itself

Every site is listed so the next session does not have to rediscover them
(measured 2026-09-04; re-grep before trusting):

| Where | What |
|---|---|
| `prisma/schema.prisma:26` | the `CASHIER` enum value. **The enum is app-level only** — no migration in this project ever emitted a `CHECK` constraint, so Prisma stores it as TEXT. Expect **no SQL**; if `migrate dev` emits any, rehearse it the usual way and hand the operator the command. |
| `src/types/api.ts:2` | the `Role` union |
| `src/lib/validation.ts:142`, `src/app/api/users/[id]/route.ts:11` | the two role enums in schemas |
| `src/app/api/auth/profiles/route.ts:10`, `src/features/auth/login-screen.tsx:17,29,37` | role types and the role icon map |
| `src/components/shared/nav-config.ts` | five rows list `CASHIER`; `LEAST_PRIVILEGED_ROLE` becomes `MANAGER` |
| `src/app/api/auth/switch-user/route.ts:55-72` | the privilege-escalation guard is a CASHIER-only rule and becomes dead |
| `src/app/api/orders/route.ts:223`, `src/app/api/orders/[id]/refund/route.ts:91` | the CASHIER arms of the discount and refund gates |
| `src/components/pos/payment-dialog.tsx:122` | the client mirror of the discount gate |
| ~10 `*.test.ts` files | fixtures and assertions naming the role |

**⚠ Two consequences to carry deliberately, not by accident.**

1. **`LEAST_PRIVILEGED_ROLE` degrades from `CASHIER` to `MANAGER`.** C-16's
   fail-closed default gets weaker by exactly one rung. It stays meaningfully
   closed — a MANAGER cannot reach `users`, `backups` or `logs` — but say so
   in the record rather than letting it pass silently. `nav-access.test.ts`
   asserts the default can open strictly fewer views than a manager; that
   assertion must be revisited, not deleted (safety rule 2).
2. **The approval-token path becomes unreachable.** Nothing will require a
   token once no CASHIER exists. **Keep the machinery** — `/api/auth/approve`,
   `approvals.ts`, `manager-approval-dialog.tsx`, and Batch 4.1's lockout —
   because Batch 4.4c reuses the lockout, and deleting audited work to tidy up
   is not this plan's habit. Record it as dormant.

### Batch 4.4b — Validation Required

- Targeted test: no source file outside a comment references the `CASHIER` role — assert it, do not eyeball it.
- Targeted test: `canAccessView` still fails closed, with `MANAGER` as the floor, and still refuses `users` / `backups` / `logs` to a manager.
- Targeted test: `GET /api/settings` and `GET /api/reports/x` declare `["SUPER_ADMIN", "MANAGER"]`, and the T-03 matrix still passes over all 61 routes.
- Confirm read-only that **no `User` row carries `role = 'CASHIER'`** *before* changing the schema; record the count.
- Whether `prisma migrate dev` emits SQL at all — record the answer either way. If it does: snapshot, rehearse on a copy, fingerprint-diff, hand over the command.
- Manual: the manager can still take payment, discount, refund, reprint and open every view they are entitled to.
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS.

### Batch 4.4b — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-04

**Changes.** (1) `prisma/schema.prisma` — `CASHIER` removed from `enum UserRole`, with DD-07 recorded above the enum. (2) The type surfaces: `Role` in `types/api.ts`, `userSchema` in `validation.ts`, the update schema in `users/[id]/route.ts`, `LoginProfile` in both `auth/profiles/route.ts` and `login-screen.tsx` (whose `ROLE_STYLE` entry, `ChefHat` icon and now-unused import went with it). (3) `nav-config.ts` — five rows lose the role, and **`LEAST_PRIVILEGED_ROLE` degrades from `CASHIER` to `MANAGER`**, commented as the deliberate one-rung weakening it is. (4) `auth/switch-user/route.ts` — the privilege-escalation guard was a CASHIER-only rule and is removed; the target account's own PIN is what makes that route safe, not the rank comparison, and its `USER_SWITCH_BLOCKED` audit action is retired (older rows keep it). (5) `orders/route.ts` — the CASHIER arm of the discount gate is gone with its `verifyApprovalToken` import; every caller now self-approves above the threshold, which is exactly the gap DD-19 answers in 4.4c. `discount.approvalToken` stays on the wire, accepted and ignored. (6) `orders/[id]/refund/route.ts` — the arm that refused a token-less CASHIER is gone; the token path stays live because the Commandes view still sends one (M-18). (7) `payment-dialog.tsx` — the client mirror is **dormant, not deleted**: `MANAGER_APPROVAL_TOKEN_REQUIRED = false` keeps the dialog, the re-entry mechanism and `/api/auth/approve` in place for 4.4c to hook into. (8) **M-19s:** `GET /api/settings` and `GET /api/reports/x` raised to `["SUPER_ADMIN", "MANAGER"]`, so read and write agree. (9) `README.md`'s role table.

**Files.** `prisma/schema.prisma`; `src/types/api.ts`; `src/lib/validation.ts`; `src/app/api/users/[id]/route.ts`; `src/app/api/auth/profiles/route.ts`; `src/app/api/auth/switch-user/route.ts`; `src/app/api/orders/route.ts`; `src/app/api/orders/[id]/refund/route.ts`; `src/app/api/settings/route.ts`; `src/app/api/reports/x/route.ts`; `src/app/api/reports/z/route.ts` (comment only); `src/features/auth/login-screen.tsx`; `src/components/shared/nav-config.ts`; `src/components/pos/payment-dialog.tsx`; `README.md`; **new** `src/lib/role-model.test.ts`; revised tests `nav-access.test.ts`, `api-authorization.test.ts`, `fiscal-surface.test.ts`, `account-policy.test.ts`, and eight fixture files. **No migration** — see note 1.

**Tests.** `bun test src --timeout 30000` → **461 pass, 0 fail** (453 before). `bun run typecheck`, `bun run lint`, `bun run build` — all PASS. New `role-model.test.ts` (7 tests) walks all 245 source files and asserts no `CASHIER` outside a comment, checks the enum block, the nav table and the fail-closed floor. **Negative control:** the role was reintroduced in `types/api.ts`, `nav-config.ts` and `schema.prisma`, and **4 of the 7 failed**; the three files were restored from copies taken first and the suite returned to green. Manual, against the production build on a scratch copy (port 3026, both `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden, marker `SCRATCH-4.4b-Gerant` read back from pre-auth `GET /api/auth/profiles` **before** the first write): the manager logs in; `GET /api/settings` and `GET /api/reports/x` answer 200; `/api/logs` still 403; a control sale, a 30 % discounted sale, a full refund with no token and a reprint all succeed; the journal shows `VENTE #21` (no approver), `VENTE #22` with `discountApprovedById` = the manager's own id, `ANNULATION`, `REIMPRESSION`; chain `ok`. Through the real UI: the login screen renders two profiles and no ChefHat icon, all 14 entitled views open, `users` / `backups` / `logs` render `AccessDenied`, and a 40 % discounted checkout (order #23) completed **with no approval prompt**. Production `db/custom.db` unchanged throughout at `7839db18…`, mtime 2026-09-04 16:41:52, no `-wal`/`-shm` beside it, `db/backups` still 9 entries, no archive written into the real tree.

**Commit:** `45a6fb8`

**Notes.**

1. **No migration, and the answer was measured rather than assumed.** The batch asked whether `prisma migrate dev` emits SQL for an enum-value removal. `prisma migrate diff --from-url <scratch copy> --to-schema-datamodel prisma/schema.prisma --script` printed `-- This is an empty migration.` both before the schema edit (the control) and after it. The enum is app-level only, stored as TEXT with no `CHECK` constraint, exactly as the batch predicted. **Nothing is waiting on the operator**, and production still stands at 6 applied migrations.
2. **Zero `User` rows carried the role, confirmed read-only before the schema changed.** `SELECT role, COUNT(*) FROM User GROUP BY role` → `MANAGER 1, SUPER_ADMIN 1`; `role = 'CASHIER'` → **0**. The removal could not orphan a row because there was none.
3. **`LEAST_PRIVILEGED_ROLE` is one rung weaker, and it is said out loud in three places** — the constant's own comment, `role-model.test.ts`, and here. It stays meaningfully closed: a caller that falls to it cannot reach `users`, `backups` or `logs`, verified in the browser. Adding a role below MANAGER means changing this constant, not just the enum.
4. **Two assertions were revisited rather than deleted (safety rule 2).** `nav-access.test.ts` asserted the default opens "strictly fewer views than a manager", which the degradation makes impossible; it now asserts the floor property directly — every role opens at least what the default opens, and SUPER_ADMIN opens strictly more. `api-authorization.test.ts` asserted destructive routes `not.toContain("CASHIER")`, which the removal made vacuous; the `DESTRUCTIVE` table now **pins each declared role list**, which is a stronger check than the one it replaces.
5. **The removal exposed something the vacuous assertion had been hiding, and it is recorded as L-33, not fixed here.** With two roles left, a gate of `["SUPER_ADMIN", "MANAGER"]` admits every role in the product — it is no narrower than declaring none. **29 declaration sites across 26 route files are now in that position**, `POST /api/reports/z` and `POST /api/orders/[id]/reprint` among them. Two of them contradict the nav outright: `GET /api/users` and `GET /api/backups` answer 200 to a manager whose nav entry for those views is deliberately SUPER_ADMIN-only (measured; `GET /api/users` returns no PIN hashes). Outside this batch's scope, which DD-07 fixed at exactly two reads.
6. **The approval machinery is dormant, not deleted, and the batch instruction to keep it was followed literally.** `/api/auth/approve`, `approvals.ts`, `manager-approval-dialog.tsx` and Batch 4.1's lockout are untouched; `payment-dialog.tsx` keeps its wiring behind a `false` constant so 4.4c hooks into a path that already works, including the post-audit N1 re-entry mechanism. The dialog is still live in `orders-view.tsx`, which sends a token on every refund (M-18).
7. **One user-visible statement is now false until 4.4c lands, and it is recorded rather than reworded.** `discount-dialog.tsx` still tells the operator « Un manager doit approuver lors de l'encaissement » above the threshold, and after this batch nobody is asked. Rewording it is 4.4c's decision — DD-19 makes it true again with the caller's own PIN — so it is **L-35** rather than a guess made here (safety rules 10 and 11). **L-34**, found in the same file during the manual walkthrough, is a separate and older defect: the percentage under the amount field divides euros by cents, so the 40 % discount taken in that walkthrough displayed as « 0.4% du sous-total ».
8. **`reports/z/route.ts`'s business-rule comment was corrected, not its gate.** Closing a caisse stays open to any authenticated role. The asymmetry it describes was written for a cashier; widening or narrowing it is a business decision, and this batch deliberately left it alone.
9. **The scratch server was stopped and the port freed.** `bunx next start -p 3026`, PID 24188, terminated; `bunx prisma generate` succeeds afterwards, so no engine DLL is held. This is the leftover-server hazard that cost earlier sessions an `EPERM` diagnosis.

---

## Batch 4.4c — Step-up PIN for large discounts and every refund

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1007–1112 (commit `a2b34a7`, plus this batch's status record) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**Status:** `COMPLETED` · **Decisions:** DD-19 · **Findings:** **L-34** and **L-35**, both in `discount-dialog.tsx` and both required by *Validation Required* below. The step-up itself is a behaviour change the operator asked for, not a finding.

**What exists today.** Above the configured threshold a MANAGER or SUPER_ADMIN
is **silently self-approved**: `orders/route.ts:238` sets
`discountApproverId = user.id` with no prompt and no keystroke, and
`refund/route.ts:96` does the same for a refund of any amount. The record is
therefore not empty — it names the manager as their own approver — but
nothing about the act is deliberate. *(Line numbers re-measured after Batch
4.4b, which removed the CASHIER arms that used to sit above both. Re-grep
before trusting them.)*

**What Batch 4.4b left standing for this batch, deliberately.** Read its stub
above before starting; the short version is that the wiring is already there.

- `payment-dialog.tsx:121` holds `const MANAGER_APPROVAL_TOKEN_REQUIRED = false`
  and the gate it feeds at `:124`. The `ManagerApprovalDialog`, its
  `handleApproved`, and the **`finalize(tokenArg)` re-entry mechanism** are all
  still mounted and working — that mechanism was a post-audit bug fix (N1: a
  state-based re-entry captured a stale closure and re-opened the dialog
  forever), so **reuse it rather than rebuilding it**.
- `/api/auth/approve`, `approvals.ts`, `manager-approval-dialog.tsx` and Batch
  4.1's `approval-lockout.ts` are untouched and dormant.
- `discount.approvalToken` is still accepted on the wire at
  `orders/route.ts:40` and ignored. Decide whether the step-up replaces it or
  sits beside it.
- `orders-view.tsx` still opens the manager dialog on **every** refund and
  sends a token — that is **M-18**, assigned to Batch 5.7, and this batch will
  collide with it. Decide explicitly whether 4.4c supersedes M-18 or leaves it;
  do not let it be decided by accident.

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
- **L-35 must be closed by this batch.** `discount-dialog.tsx:74-80` still promises « Un manager doit approuver lors de l'encaissement », which Batch 4.4b made false and deliberately did not reword because DD-19 changes the words (the caller's **own** PIN, not a manager's). This batch may not close while that banner is wrong.
- **L-34 must be closed by this batch.** `discount-dialog.tsx:35` computes `percent` as euros ÷ cents, so a real 40 % discount displays as « 0.4% du sous-total ». This batch makes that very threshold the trigger for a PIN prompt, so an operator reading the wrong figure will be surprised by the challenge. `handleChange` at `:38` already has the arithmetic right — copy it, do not invent a third form.
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS.

### Batch 4.4c — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-04

**Changes.** (1) **New `src/lib/services/step-up.ts`** — `grantStepUp` reads Batch 4.1's lockout **before** any derivation, then verifies the caller's own PIN through `verifyPin` (Batch 4.2's bounded queue), records a failure through `recordApprovalFailure`, and on success issues a signed single-use `approvals.ts` token bound to (caller, action, cents) and writes `STEP_UP_PIN_GRANTED`. `consumeStepUpToken` verifies signature, expiry, action, exact amount and single use, then adds the one thing that makes it a step-up rather than an approval: **the token must name the caller**. (2) **New `src/lib/discount-policy.ts`** — `discountNeedsStepUp`, extracted verbatim from `orders/route.ts`, on its own with no imports because a `"use client"` component cannot import the service. The rule was previously written three ways; it is now one function with three callers. (3) **New `POST /api/auth/step-up`** — `withAuth`, open to any authenticated role, sharing `/api/auth/approve`'s **rate-limit key** so the two surfaces cannot be played off against each other. (4) `orders/route.ts` — `discount.approvalToken` → `stepUpToken`; the gate is `discountNeedsStepUp`, **decided where the old gate stood and consumed after the payment and livraison checks**, so a mistyped payment does not burn a single-use token. (5) `refund/route.ts` — the manager-token arm and the silent self-approve else-branch both replaced by one mandatory step-up, **every refund, no threshold**. (6) `validation.ts` — `refundSchema.approvalToken` → `stepUpToken`, left optional so the refusal is the route's French sentence rather than an English zod message (L-22). (7) **New `step-up-pin-dialog.tsx`**; `payment-dialog.tsx`'s mirror is live again (`MANAGER_APPROVAL_TOKEN_REQUIRED` deleted) reusing the N1 re-entry mechanism; `orders-view.tsx`'s refund switched to it (**M-18**). (8) `discount-dialog.tsx` — **L-34** and **L-35**. (9) `manager-approval-dialog.tsx` — header records that it is now dormant and unimported.

**Files.** **New:** `src/lib/services/step-up.ts`; `src/lib/discount-policy.ts`; `src/app/api/auth/step-up/route.ts`; `src/components/pos/step-up-pin-dialog.tsx`; tests `src/lib/services/step-up.test.ts`, `src/lib/discount-policy.test.ts`. **Modified:** `src/app/api/orders/route.ts`; `src/app/api/orders/[id]/refund/route.ts`; `src/lib/validation.ts`; `src/components/pos/payment-dialog.tsx`; `src/components/pos/discount-dialog.tsx`; `src/components/pos/manager-approval-dialog.tsx` (comment only); `src/features/orders/orders-view.tsx`. **No migration** — nothing was added to the schema, so the fix is in force the moment the code runs; production still stands at 6 applied migrations and **nothing waits on the operator**.

**Tests.** `bun test src --timeout 30000` → **482 pass, 0 fail** (461 before). `bun run typecheck`, `bun run lint`, `bun run build` — all PASS. 21 new tests: `step-up.test.ts` (11) and `discount-policy.test.ts` (10). **Negative control, five reverts to pre-batch shapes, each restored from a copy taken first:** (A) no token ⇒ self-approve — 2 failures; (B) drop the caller check — 1; (C) lockout read after the derivation — 1; (D) derive outside the bounded queue — 1; (E) the payment dialog's old `threshold + 0.01` fudge — 1. **C and D interact and had to be run separately**: with D applied, the bypassed `verifyPin` never touches the queue, which masks C. Run alone, C fails the ordering test with `ScryptBusyError`. Two tests were strengthened when the first control pass showed they did not catch C or E — see notes 3 and 4. **Manual, against the production build on a scratch copy** (port 3037, both `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden, marker `SCRATCH-4.4c-HibaPOS` read back from the pre-auth `GET /api/auth/profiles` **before the first write**): a 10 % discount checks out unchanged with `discountApprovedById` null; a 40 % discount is refused **403 « Confirmation par code PIN requise. »**; a wrong PIN is refused and writes one countable failure; the right PIN issues a token and the same checkout succeeds with the manager recorded; the replayed token is **409**; a **one-cent** refund with no token is refused; with a token it succeeds; a REFUND token cannot authorise a discount. Through the real UI: « **40%** du sous-total » (was « 0.4% »), the banner now promising the operator's own PIN, the step-up dialog at encaissement, order #23 completed, and a **full refund completed by the lone manager** — M-18. Chain `ok`, 7 events. Production `db/custom.db` unchanged at `7839db18…`, mtime 2026-09-04 16:41:52, no `-wal`/`-shm`, `db/backups` still 9, no `db/fiscal-archives/` created.

**Commit:** `d9b1b08`

**Notes.**

1. **No journal payload change, and that was a decision rather than an omission (operator, 2026-09-04).** `VENTE.discountApprovedById` and `REMBOURSEMENT.approverId` already carried the caller's id; what changed is that the id now means *this person typed their PIN* instead of *the route defaulted to them*. A "PIN was entered" flag would be **true on every record the batch can produce** — the sale is refused without it — so it would add no information while creating a **third payload vintage** for every future reader to tolerate (*Open Threads → D*). The deliberate act is evidenced in the audit log instead: `STEP_UP_PIN_GRANTED` with the action and the cent amount. Verified on the copy: the five new events carry exactly the keys their vintage always carried.

2. **One counter, not two (operator, 2026-09-04).** A step-up failure writes `MANAGER_APPROVAL_FAILED` — Batch 4.1's own action — so five wrong PINs are five **in total** across the step-up and the manager approval, not five each. The detail carries `stepUp: true` so the two surfaces stay distinguishable in the journal. **The operational cost is stated rather than hidden**: because every refund needs a PIN, five fumbles mean **no refunds and no large discounts for fifteen minutes**. Selling, cashing up and closing the day are unaffected. The operator was asked and chose this over a shorter window and over separate counters.

3. **Two tests claimed more than they proved, and the negative control is what caught it.** The lockout-ordering test asserted a 423 for a locked caller holding the *correct* PIN — but a lock checked *after* the derivation returns the same 423, so revert C passed. It now **fills the derivation queue first**: a step-up that reaches scrypt can only throw `ScryptBusyError`, so returning 423 proves no derivation was attempted. Deterministic, and no stopwatch.

4. **The same pass found the gate tests blind to the old client fudge.** Every boundary case tried (20 %, 20.05 %) sits outside the `+ 0.01` band, so revert E passed. Added: 20,01 € off 100,00 € — exactly 20.01 %, above the threshold and inside the old fudge — which now fails against it.

5. **Where the token is consumed matters, and it was moved deliberately.** The gate is evaluated where the old one stood, but `consumeStepUpToken` runs **after** the payment-total and livraison checks, immediately before the transaction. A 400 from those checks therefore leaves the token unused, and `payment-dialog.tsx` mirrors that exactly: it keeps the token on a 400 and discards it on anything else, so a retry never fails with « Token déjà utilisé ».

6. **A token presented by the wrong account is burned.** `verifyApprovalToken` marks a token consumed before `consumeStepUpToken` can compare the approver to the caller, so the rightful owner's next attempt gets a 409 and re-confirms. That order is the safe one — a token the wrong account has touched should not remain usable — and it is asserted rather than left to be discovered.

7. **`/api/auth/approve` and `manager-approval-dialog.tsx` are now fully dormant: reachable code, no caller.** DD-19 required a distinct path because that route tests the PIN against every manager *and forbids self-approval*, so with one operational role it can never confirm the caller's own action. Both are kept, as Batch 4.4b kept them, and a second operational role would want them back.

8. **No real PIN was used anywhere.** The live values were never seen and are recorded nowhere. The scratch copy was given a known PIN by a script guarded on its target path, which refuses anything outside the session scratchpad (Batch 4.4b's method). The marker was written into **`User.name`** as well as `restaurantName`, because `GET /api/auth/profiles` — the only pre-auth endpoint that proves which database the server opened — returns names, not settings.

9. **Environment, and a second confirmation of warning 9.** `bunx next start -p 3037`, PID 23808, **survived `TaskStop`** and was terminated with `taskkill //PID … //T //F`; `bunx prisma generate` succeeds afterwards. A stray `bun test` process from an earlier stopped run (PID 8552) did the same thing and **caused 12 spurious `EPERM` failures** in the backup suite — the whole suite was green again after it was killed. `TaskStop` kills the parent only; always check the port and the process list.

10. **Recorded, not fixed: L-36.** `ApprovalPayload.amount` in `approvals.ts` is commented "euros" and has carried **cents** since the routes were written. This batch binds and compares cents throughout and says so at the top of `step-up.ts`, but does not edit `approvals.ts` — that file is not this batch's (safety rule 10).
---

*Moved verbatim from REMEDIATION_PLAN.md lines 1001–1099 (commit `bcd31a5`) on 2026-09-04.*

## Batch 4.5 — Dangerous operator scripts

**Status:** `COMPLETED` · **Decisions:** DD-08 (answered 2026-09-04) · **Findings:** C-17, **L-37**, **L-38**; DOC-09 — all closed

**Read L-37 before touching anything in `scripts/`.** It is the reason this batch's scope is larger than C-17: a third script, which C-17 does not name, wipes `db/custom.db` by a hardcoded literal and is **not** covered by the scratch-copy method every other batch relies on.

### C-17 — Two operator scripts silently destroy the audit trail and the catalogue

**Status:** `COMPLETED` · Severity: HIGH · Category: data loss / documentation

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

**Remediation direction — DECIDED, DD-08 (2026-09-04).** Split, in six parts.

1. **Remove `scripts/port-real-data.ts`** (L-37). Its euros→cents port completed on 1 September; the data it produced is the live catalogue. Removal rather than a guard because the capability is spent.
2. **Remove `scripts/seed-category-options.ts`** (C-17). It seeded a demo catalogue that the real 78-product one replaced.
3. **Rebuild `scripts/seed-users.ts` as a PIN-reset tool** (C-17). **No `deleteMany` of any kind**, **no PIN in the file**, an explicit flag, and the new PIN supplied at run time. It is kept because `POST /api/seed` refuses once the till has traded, so with both PINs lost there is otherwise no way back in. It must not be able to recreate the published defaults — that is the half of C-17 the operator's 2026-09-04 PIN change would otherwise be undone by.
4. **Guard `fix-fiscal-counter.ts` and `init-fiscal-counter.ts`** (L-38) so a counter can never be **lowered**. Repair upward stays available; that is what the scripts are for.
5. **Bring `scripts/` under `tsc` and `eslint`** — remove the `tsconfig.json:41` and `eslint.config.mjs:49` exclusions. Accepted with its cost: pre-existing errors in these files must be fixed before `bun run build` passes again.
6. **Correct `scripts/README.md`**: it opens with *“Safe to delete after running”*, describes none of the deletions, and omits `port-real-data.ts` and `set-drink-vat-rates.ts` (**DOC-09**).

**Copy the two scripts that already do this right** rather than inventing a form: `set-drink-vat-rates.ts` (dry-run by default, refuses an unexpected category tree) and `fix-duplicate-product-options.ts` (`--dry`).

**Related blind spot — now part 5 above, decided.** `scripts/` is excluded from both eslint (`eslint.config.mjs:49`) and tsc (`tsconfig.json:41`), so nine DB-mutating scripts have zero static checking.

**Two things measured on 2026-09-04 so this batch does not have to re-derive them.**

1. **The other two seed paths are already guarded and are OUT of scope.** `prisma/seed.ts:14-16` returns early with *« Base déjà initialisée — aucune action »* when any user exists, and `POST /api/seed` answers **409** unless the database is fresh (it counts users, orders **and** fiscal events — `seed/route.ts:37,57-61`). Both take their PINs from `SEED_ADMIN_PIN` / `SEED_MANAGER_PIN` with the published values only as a fallback, and both validate six digits. So `bun run db:seed` is a **no-op** on the live database, and **`scripts/seed-users.ts` is the only path that deletes first and then recreates the published defaults** — which is why C-17's criterion is scoped to `scripts/` and why widening this batch to `prisma/seed.ts` would be scope creep, not thoroughness.
2. **`db/real-data-backup/` is untracked**, and holds `real-data.db` (634 KB, 1 September) plus its `-wal`/`-shm`. It is the source `port-real-data.ts` reads. Removing the script leaves it as an orphaned copy of **old real trading data** in a OneDrive-synced folder. Decide its fate deliberately — keep it as a pre-migration artefact, or move it out of the repo tree the way `db-snapshots/` already is — rather than leaving it behind by accident. It is **not** the live catalogue; that is `db/custom.db`.

### Batch 4.5 — Validation Required

- Manual: running each remaining script without the confirmation flag performs no writes.
- Targeted check: `scripts/README.md` accurately describes what every script deletes, and lists every file in the folder.
- ~~Confirm `scripts/port-real-data.ts` is documented (currently omitted — DOC-09).~~ **Superseded by DD-08: the script is removed, so DOC-09's remaining half is `set-drink-vat-rates.ts`, which is also undocumented.**
- **L-37:** `git grep` finds no surviving file that opens a database path not derived from `DATABASE_URL` or `HIBAPOS_DATA_DIR`. This is the criterion that matters most — it is what makes the scratch-copy method complete again.
- **L-38:** targeted test — a counter repair that would **lower** any of the three numbers is refused, and one that raises them succeeds. Prove it fails against the pre-batch code.
- **C-17:** the rebuilt `seed-users.ts` performs **no deletes**, and `git grep` finds neither published default PIN anywhere in `scripts/`.
- **Do not test these scripts against the production database.** Use a copy — and note that for `port-real-data.ts` the usual `DATABASE_URL` override is **not** a defence (L-37); the only safe way to exercise it is not to run it at all, which is why it is removed rather than guarded.
- `bun test src --timeout 30000` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS. **Expect typecheck and lint to fail first** once the `scripts/` exclusions come off; fixing what they report is part 5's work, not a surprise.
- Retire about 5 KB from the plan's front matter (see *Last Updated*). This batch is already rewriting warning 5 and `scripts/README.md`, so it is the right one to do it.

### Batch 4.5 — Status Record

**Status:** `COMPLETED` · **Completed:** 2026-09-04 (session 10)

**Changes:** DD-08's six parts, all applied. (1) **`scripts/port-real-data.ts` deleted** (L-37): it opened `db/custom.db` by a hardcoded literal, disabled foreign keys and ran `DELETE FROM` on every table, reading neither `DATABASE_URL` nor `HIBAPOS_DATA_DIR` — the one file the scratch-copy method could not protect against. Its euros→cents job completed 1 September. (2) **`scripts/seed-category-options.ts` deleted** (C-17). (3) **`scripts/seed-users.ts` rebuilt as a PIN reset**: no `deleteMany`, no `delete`, no `create` — one `update` of one column plus a `USER_PIN_RESET_SCRIPT` audit row, in one transaction. The PIN is typed at a hidden prompt (raw-mode stdin, digits only, no echo, confirmed twice) with a piped-stdin fallback for unattended runs; it is never printed. It refuses an account that does not exist rather than creating one, and refuses either published default via new **`PUBLISHED_DEFAULT_PINS` / `isPublishedDefaultPin()` in `src/lib/auth.ts`** — placed there, not in `scripts/`, so the batch's own "neither PIN anywhere in `scripts/`" check passes while the refusal is kept. (4) **Both counter scripts guarded** (L-38) by new **`src/lib/services/fiscal-counter-floor.ts`**: `fix-fiscal-counter.ts` now writes only fields that go **up** and refuses any proposal that would lower one; `init-fiscal-counter.ts` refuses when the fiscal tables are non-empty and points at the repair tool. Both now write `lastFiscalEventSequence` explicitly. (5) **`scripts/` brought under `tsc` and `eslint`** — exclusions removed from `tsconfig.json` and `eslint.config.mjs`. (6) **`scripts/README.md` rewritten** (DOC-09). Also: **`fix-duplicate-product-options.ts` flipped to dry-run-by-default** (`--apply`), since it was the last script that wrote with no flag; and `db/real-data-backup/` moved out of the repo tree.

**Files:** deleted `scripts/port-real-data.ts`, `scripts/seed-category-options.ts`; rewrote `scripts/seed-users.ts`, `scripts/fix-fiscal-counter.ts`, `scripts/init-fiscal-counter.ts`, `scripts/README.md`; edited `scripts/fix-duplicate-product-options.ts`, `scripts/decrypt-backup.ts` (two inline `require("fs")` → static imports), `scripts/inspect-db.ts`, `scripts/inspect-options.ts`, `scripts/inspect-product.ts` (`require()` → ESM imports; these three declared `db` and `main` in one global scope and collided the moment `tsc` saw them); added `src/lib/services/fiscal-counter-floor.ts` + `.test.ts`; edited `src/lib/auth.ts`, `src/lib/auth.test.ts`, `tsconfig.json`, `eslint.config.mjs`.

**Tests:** `bun test src --timeout 30000` → **498 pass, 0 fail** (482 before; +13 counter-floor, +3 published-default-PIN), 73.4 s. `bun run typecheck` PASS, `bun run lint` PASS, `bun run build` PASS — all three with `scripts/` now in scope; the first runs reported 11 typecheck errors and 2 lint errors in `scripts/`, all fixed, which is part 5's accepted cost. **L-38 proved against the pre-batch code three ways.** (a) Three one-property reverts of the floor module: no floor at all (the real pre-batch behaviour) → **7 of 13 fail**; refuse-every-change → **3 fail**; `<=` off-by-one at the boundary → **3 fail**. 7+3+3 = 13, so every test fails under exactly one revert and none is vacuous. Restored byte-identical (`86caff9c…`) each time. (b) The **actual pre-batch scripts**, restored from `git show HEAD:` and run against the scratch copy: old `init-fiscal-counter.ts` created the singleton at **0/0/0/0** beside tables holding 20 orders / 3 shifts / 2 Z reports / 2 journal events; old `fix-fiscal-counter.ts` **lowered 999/9/9 → 20/3/2** and printed "FiscalCounter synced" as though it were a repair. (c) The new scripts on the same states: lowering **refused, exit 1, database byte-identical**; raising **5/1/0 → 20/3/2 succeeded** and re-running was a no-op; `init` **refused** on populated tables, exit 1, no write. **C-17 validated on the scratch copy:** all nine remaining scripts run with no flag → **no writes, no sidecar files**; a missing account refused; both published defaults refused with the database unchanged; a 5-digit PIN refused; a real reset changed the hash `400154a0…` → `558a667f…`, verified through the application's own `verifyPin` (correct PIN `true`, wrong PIN `false`), and every table count identical to production except `AuditLog` 468 → **469**, the single row the reset *adds*. **L-37's criterion:** `git grep` finds **zero** tracked files importing `bun:sqlite`, calling `new Database(`, or using `better-sqlite3` — no file in the repo opens a database path outside `DATABASE_URL` / `HIBAPOS_DATA_DIR` any more. **Production untouched:** `7839db18…`, mtime 2026-09-04 16:41:52, 696 320 bytes, unchanged throughout; no `-wal`/`-shm` beside it; `db/backups/` untouched and `db/fiscal-archives/` still absent.

**Commit:** `1a0836b`

**Notes:**

1. **The scratch-copy method is complete again, and that is this batch's point.** Every batch since Stage 3 has relied on one protection: point `DATABASE_URL` and `HIBAPOS_DATA_DIR` at a copy and production cannot be reached. `port-real-data.ts` was a standing exception — both overrides set correctly and `bun scripts/port-real-data.ts` still destroyed the live fiscal record. It was removed rather than guarded because its capability was spent, and a removal cannot be got wrong the way a guard can. The `git grep` in *Tests* is the check that keeps it true; warning 5 now states the rule as a prohibition on any *new* file.

2. **L-38 had a fourth counter it did not name, and the guard covers it.** L-38 names `lastReceiptNumber`, `lastShiftNumber` and `lastZReportNumber` — the three `fix-fiscal-counter.ts` writes in its `update:` branch. Both scripts **omitted `lastFiscalEventSequence` in their `create:` branch**, so Prisma's `@default(0)` applied: on a database that lost its singleton but kept its `FiscalEvent` rows, creating the row rewound the journal sequence to 0 and the next event would reuse a sequence already inside the hash chain. Demonstrated, not inferred — the pre-batch `init` produced exactly that (evidence (b) above). Guarding three of four would have left the worst one, since the journal sequence is what the chain is ordered by. This is inside L-38's own last sentence (*"`init-fiscal-counter.ts` upserts the singleton at 0 and needs the same floor"*), not a scope extension.

3. **The refusal is a refusal, not a clamp.** Writing `max(current, proposed)` would have been less code and would have let the operator believe a repair happened. A counter *above* its tables means rows were destroyed; that is the incident, and the counter is only its symptom. So both scripts stop, name every offending field with both numbers, and point at `decrypt-backup.ts` — restore the backup, do not align the counter to amputated tables.

4. **One test passed against a disabled floor, and the fix was in the code, not the assertion.** `describeCounterRegressions([])` still emitted the header and trailer, so a test asserting only the guidance text passed either way. It now throws on an empty list, which makes the vacuous pass impossible rather than merely unlikely, and the test additionally pins the field line. This is *Methods* → *Prove the test fails on the old code*, and it is why that method now also says to revert in both directions.

5. **`scripts/` under static checking cost eleven typecheck errors, and one of them was the reason to do it.** The three `inspect-*.ts` files used `require()` in `.ts` files, which makes them global scripts rather than modules: all three declared `db` and `main` in one scope and produced "Cannot redeclare block-scoped variable" the instant `tsc` could see them, plus implicit `any` on every callback. `inspect-product.ts` also dereferenced a possibly-null `findFirst` result on a hardcoded demo product name (`"Chicken Club"`) the real catalogue replaced — it now takes the name as an argument. `decrypt-backup.ts` had two inline `require("fs")` calls beside a static `fs` import. None of this was hypothetical: the folder's own comment noted that `hashPin` became async in Batch 4.2 and a missing `await` would store `"[object Promise]"` as a PIN hash with nothing to catch it. `bun run build` still passes.

6. **`db/real-data-backup/` moved, on the operator's decision, not deleted.** It is now `../db-snapshots/real-data-backup.pre-cents-port.2026-09-01T17-13-56Z/`, outside the repo tree beside the other pre-migration snapshots, hash `87a376f0f3b95a7e817373dd12e2a81800096407d4bb11f0a954e337204bb7ea` unchanged by the move. It holds the **pre-port** state — 73 products, 18 orders, 2 sealed Z reports, 440 audit rows, 2 users, in old euros — and is the only surviving copy of the catalogue as it stood before the euros→cents conversion, which is why it was kept rather than removed with the script that read it. The three files were moved together so the `.db` keeps its sidecars.

7. **A read-only open of a WAL-mode database still touches its `-shm`.** Inspecting `real-data.db` with `bun:sqlite` and `readonly: true` moved that file's mtime while leaving the `.db` byte-identical. *Methods* → *Scratch copy* says to confirm "no `-wal`/`-shm` files appeared" after working on production; that check would misread this as a write. It does not affect `db/custom.db`, which is in rollback-journal mode (byte 18 = `1`, *Open Threads → A*) and produces no `-shm` — but a session inspecting a WAL-mode file should expect it.

8. **Three operator-facing behaviours changed, deliberately.** `fix-duplicate-product-options.ts` no longer deletes without a flag — it was live-by-default with `--dry` to opt out, so the shorter command was the destructive one; `--dry` is still accepted and is now a no-op. `inspect-product.ts` requires a product name. `inspect-options.ts` printed cent values with a `€` suffix, which read as euros and was wrong by a factor of 100 — it now formats them. Nobody is running these today (*Hardware-dependent validation*: the app is undeployed), which is what made it safe to change the interface rather than preserve it.

9. **What this batch did NOT touch.** `prisma/seed.ts` and `POST /api/seed` remain out of scope and are already guarded, as the batch specification measured on 2026-09-04 — both no-op or answer 409 once the till has traded. `prisma/seed.ts` therefore still carries the two published PINs as env fallbacks; that is not a live path, and widening the batch to it would have been scope creep. `.zscripts/dev.ps1` and `start.ps1` still reference `db\custom.db` by a literal path, but only via `Test-Path` — they do not open a database, so they do not defeat the scratch-copy method. No migration was added; nothing waits on the operator.

---

*Moved verbatim from REMEDIATION_PLAN.md lines 1026–1106 (commit `c23ae13`) on 2026-09-04.*

## Batch 4.6 — Catalogue data-loss paths

**Status:** `COMPLETED` · **Findings:** C-24, C-25 — both closed

### C-24 — Category and product updates delete option groups wholesale and skip invalid entries silently

**Status:** `COMPLETED` · Severity: HIGH · Category: data loss

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

**Status:** `COMPLETED` · Severity: HIGH · Category: data integrity

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

**Status:** `COMPLETED` · **Completed:** 2026-09-04 (session 10)

**Changes:** **C-24.** `PUT /api/catalog/categories/[id]` validated each option group and add-on *inside* the loop that recreated them — after `deleteMany` had run — and skipped a failing entry with `continue`, so one malformed entry destroyed the category's whole configuration and answered **200**. Validation now happens before the transaction opens, in new **`src/lib/services/catalog-payload.ts`**, and any invalid entry refuses the whole request with a 400 naming its 1-based position. A present-but-not-array value, which used to fall through `Array.isArray` and be silently ignored, is now also a 400. On the product side the defect was the schema: `productSchema.options` was `.default([])`, so a PUT that merely **omitted** `options` parsed as the empty list and deleted every product-specific option group. It is now `.optional()`; the PUT skips the replace entirely when the field is absent, an explicit `[]` still clears, and the create path treats absent as "none". **C-25.** The media library's usage scan and its reference cleanup each carried their own hardcoded list of three image columns while the schema has six. Both now derive from one declaration, **`IMAGE_COLUMNS` in new `src/lib/services/media-usage.ts`**, adding `CategoryOptionChoice.image`, `CategoryAddOn.image` and `AddOn.image`. `DELETE /api/media` now also writes a **`MEDIA_DELETED`** audit row with per-column counts — it wrote none at all before, alone among the destructive routes — and its path-traversal guard was moved **ahead of** the database writes. Add-ons get a new `supplement` usage badge, registered in `media-view.tsx` so it renders as "Supplément" rather than raw text.

**Files:** added `src/lib/services/catalog-payload.ts` + `.test.ts`, `src/lib/services/media-usage.ts` + `.test.ts`; edited `src/lib/validation.ts`, `src/lib/validation.test.ts`, `src/app/api/catalog/categories/[id]/route.ts`, `src/app/api/catalog/products/[id]/route.ts`, `src/app/api/catalog/products/route.ts`, `src/app/api/media/route.ts`, `src/features/media/media-view.tsx`.

**Tests:** `bun test src --timeout 30000` → **531 pass, 0 fail** (498 before; +33). `bun run typecheck`, `bun run lint`, `bun run build` all PASS. **Proved against the pre-batch code with eight one-property reverts**, in both directions: (1) invalid entries skipped → **7 fail**; (2) non-array treated as absent → **1**; (3) `options` back to `.default([])` → **1**; (4) usage scan back to three columns → **4**; (5) cleanup back to three columns → **3**; (6) `IMAGE_COLUMNS` back to three entries → **2**; (7) refuse every payload → **12**; (8) count non-`/uploads/` references → **1**. 25 of the 33 new tests failed under at least one revert; the remaining 8 assert pre-existing behaviour that must not break, which by construction cannot fail against the pre-batch code. All three files restored byte-identical after each revert (`96b6f4eb…`, `3fb2bebd…`, `0719d0a3…`). **Manual validation on a scratch copy of the real catalogue**, `next start` on ports 3040–3043 with both `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden and `public/uploads` copied alongside; open database proved before the first write by reading the marker `ZZ-SCRATCH-46` back from the pre-auth `GET /api/auth/profiles`. **C-24:** against the real `Sandwichs` category (4 option groups, 19 choices, 7 add-ons), a payload whose second group was nameless → **400** *« Groupe d'options n°2 invalide : Le nom est requis. Aucune modification n'a été enregistrée. »* with the configuration **byte-identical afterwards**; a malformed add-on beside valid groups → **400** naming *Supplément n°1*, groups again intact. Running the pre-batch logic on the same category deleted **4 groups and 19 choices** and would have returned 200. On the real `Tenders box` product (2 own groups, 21 own choices), a PUT omitting `options` → **200**, price 990 → 1350, **groups and choices intact**. Regression: a normal valid save returned 200 and stored 4 groups / 19 choices / 8 add-ons with all 19 choice images preserved. **C-25:** `GET /api/media` reported **124 of 139 files as used** — exactly the 124 distinct references measured read-only, against the 94 the three-column scan would have found; each of the 15 still reported unused was cross-checked against all six columns and none is referenced. Deleting `/uploads/Options/sauce-algerienne.webp` (used by two `CategoryOptionChoice` rows, invisible before) → 200, **both references cleared**, file removed, and a `MEDIA_DELETED` row recording `referencesCleared: 2` with all six per-column counts. **Production untouched:** `7839db18…`, mtime 2026-09-04 16:41:52, 696 320 bytes, unchanged throughout; no sidecars beside it; `public/uploads` still 139 files; `db/fiscal-archives/` still absent; every scratch server stopped with `taskkill //PID <pid> //T //F`.

**Commit:** `974372e`

**Notes:**

1. **The measurement was worse than the finding said.** C-25 described the missing columns as covering "the ones actually used at this restaurant"; measured read-only against production, it is **30 of the 124 referenced images — 24 %**. They are the entire condiment and topping catalogue: `sauce-algerienne.webp`, `sauce-samourai.webp`, `add_mozzarela.webp`, `add_viande_hache.webp` and 26 more. Every one displayed in the media library as *unused* and, because the list sorts unused first, presented at the top as a cleanup candidate. `AddOn.image` has **zero** rows today, so that third column is latent — covered anyway, because leaving one of six out is how this defect happened in the first place.

2. **The two lists are now one, and a test pins it to the schema.** The scan and the cleanup drifted apart because each hardcoded its own copy of the column list: three models were added to the schema and only the routes that wrote them were updated. `IMAGE_COLUMNS` is the single declaration both derive from, and `media-usage.test.ts` counts the schema's own `image`/`icon` columns and asserts `IMAGE_COLUMNS` has the same length. A seventh image column cannot now be added without that test failing — which is a stronger guarantee than either list being correct today.

3. **C-24 is two different defects that the finding names as one, and they needed different fixes.** The *category* route's fault was ordering: it validated inside the transaction, after the delete. The *product* route already validated the whole body up front and would 400 correctly on a malformed group — its fault was purely `.default([])` in the schema, which made "absent" indistinguishable from "clear everything". So one half needed a new module and the other needed one word. Worth keeping straight, because a reader who fixes only the ordering will leave the product path wiping option groups on every partial update.

4. **`absent` is a third state, deliberately.** `PayloadCheck` returns `absent` / `ok` / `invalid` rather than a boolean, and `productSchema.options` is `.optional()` rather than defaulted, because collapsing "not sent" into "empty" is the entire product-side defect. An explicit `[]` still deletes everything — that is how the form removes the last group — so the distinction has to survive all the way from the JSON body to the `if`.

5. **One correction made in passing, with no reachable impact.** `DELETE /api/media` cleared database references *before* running its path-traversal guard, so an unauthorised path did its writes and only then answered 400. Nothing was reachable through it: the cleanup matches the literal request string and no catalogue row holds a traversal path, so it always matched zero rows. Moved the guard first anyway — a handler in the batch about validating before mutating should not mutate before validating. Recorded here rather than as a finding because it was impact-free and lives in the lines this batch was already rewriting.

6. **A scratch copy runs in WAL mode, and that broke a restore.** `HIBAPOS_DATA_DIR` pointed at the scratchpad, which is not a cloud-synced path, so the startup guard *allowed* WAL — the scratch database ran `journal_mode=wal` while production sits in rollback-journal mode on OneDrive. Restoring the copy by overwriting `custom.db` alone therefore did nothing: the server's committed pages were in `custom.db-wal`, which replayed over the fresh bytes on the next start, and a category I had deliberately emptied came back empty. **Delete `-wal` and `-shm` with the `.db`, and stop the server first.** Costs a confusing ten minutes if missed, and it is the mirror image of *Open Threads → A*'s note that production is still not on WAL.

7. **Two harness gotchas, both mine, neither an application defect.** (a) **Git Bash rewrites a leading-slash argument into a Windows path**: passing `/uploads/Options/sauce-algerienne.webp` to a script arrived as `C:/Program Files/Git/uploads/…`, so an exact-match query returned 0 references and briefly looked like the cleanup had already run. `MSYS_NO_PATHCONV=1` and `MSYS2_ARG_CONV_EXCL='*'` suppress it. (b) **Round-tripping the category JSON through a shell pipeline corrupted its UTF-8**: re-sending `Crudités` and `Algérienne` through `curl | bun -e | curl` stored mojibake and duplicated rows in the scratch copy. Build request bodies in a file and send them with `--data-binary @file`. The scratch copy was rebuilt from production before the C-25 checks were trusted.

8. **What this batch did NOT change.** Deleting an in-use image is still **allowed with a warning**, not refused: the media view already lists what will break and says *« Les images de ces éléments seront retirées. »*, so the design intent was clear and C-25's remediation direction asks only that the warning be *complete*. Making it a refusal would be a behaviour decision, not a bug fix. `CategoryOptionChoice` rows duplicated on the same image (two rows both hold `sauce-algerienne.webp`) are pre-existing in production and out of scope — the usage list correctly reports both. No migration was added; nothing waits on the operator.

---

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1019-1049 (commit `803e760`) on 2026-09-04.*

## Batch 4.7 — Transaction and race safety

**Status:** `COMPLETED`

### C-15 (shift-race half) — Shift state is read outside the transaction

**Status:** `COMPLETED` · Severity: HIGH · Category: data integrity (race)

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

**Status:** `COMPLETED` · **Completed:** 2026-09-04 (session 11)

**Changes:** C-15's shift-race half, at **three** sites — the two the audit named and one it did not. **Checkout:** `POST /api/orders` looked up the open shift at `:126` and opened its transaction at `:280`, and nothing re-checked in between. The transaction body moved to new **`src/lib/services/checkout.ts`** — the shape `processRefund` established in Phase 8b — so the race is testable without an HTTP harness, and its **first statement** re-reads the shift and throws `CheckoutError(…, 409)` if it is no longer `OPEN`. **Z close:** `generateZReport` computed the report and only *then* opened the transaction that closed the shift. The computation, the duplicate-Z guard and a new shift-status assertion now all run **inside** that transaction; `computeShiftReport` takes an optional transaction client for it. Its refusals became a typed **`ZReportError`** carrying a status, mapped by both callers: `POST /api/reports/z` caught nothing at all before and answered **500** to a duplicate close, where `POST /api/shifts/[id]/close` answered 400 — both now answer **409**. **Refunds:** the route read `order.shift.status` outside the transaction, so a refund could land in a shift whose Z was already sealed and leave that Z's `refundsTotal` permanently short; `processRefund` now re-reads it under the lock (operator's decision of 2026-09-04 to close this third site here rather than defer it to 5.3). A shared **`isTransactionBusyError`** in `tx-options.ts` maps Prisma's `P2028`/`P1008` to a French **503** on both write paths. **No migration; nothing waits on the operator.**

**Files:** `src/lib/services/checkout.ts` (new) · `src/lib/services/shift-race.test.ts` (new, 12 tests) · `src/lib/services/reports.ts` · `src/lib/services/refund.ts` · `src/lib/tx-options.ts` · `src/app/api/orders/route.ts` · `src/app/api/reports/z/route.ts` · `src/app/api/shifts/[id]/close/route.ts`

**Tests:** **543 pass, 0 fail** (`bun test src --timeout 30000`, 117 s); 531 before, so 12 new, all in `shift-race.test.ts`. `bun run typecheck` PASS, `bun run lint` PASS, `bun run build` PASS. **Seven one-property reverts, in both directions.** Removing the checkout re-read failed 4; computing the Z report outside its transaction failed 3 (two of them ones the first revert survived); moving the duplicate-Z guard back outside as a bare `Error` failed 1; deleting the Z's status assertion failed 1; deleting the refund re-read failed 1; dropping `P1008` from the busy check failed 1. **The seventh failed nothing and is recorded as such** — see note 4. Nine of the twelve tests failed under something; the other three are labelled in the file as regression assertions or as a control. **Fiscal verification on a copy of production**, through HTTP: six checkouts raced one Z close — 2 landed, 3 refused **409**, 1 refused **503**; the sealed Z counted **8 of 8** orders, `Σ order.total = Z.salesTotal = 12 030`, `Σ vatTotal = Z.vatTotal = 1 082`, zero orders created after their shift closed, **no receipt-number gaps**, chain `ok` at `lastSequence: 6`. The same race on the pre-batch code, same data: **7 orders in the shift and a Z that counted 5** — 300 cents and 2 sales missing from an immutable document, and 1 order created after closure.

**Commit:** `951e14c`

**Notes:**

1. **The measurement that shaped the whole batch.** Prisma's interactive transactions on SQLite **do not overlap**: the second one's body does not begin until the first has committed. Measured on a scratch database in **both** journal modes — `delete`, which production runs, and `wal`, which a scratch copy runs — by timestamping two `$transaction` bodies. A read **outside** a transaction does not wait, and returns `OPEN` while a close is mid-flight; a read **inside** one sees everything committed before its body started. That is why re-asserting the status inside the transaction is decisive, and why moving `computeShiftReport` inside the Z's transaction closes the window rather than merely narrowing it. It also means there is no "during" left for a sale to fall into: a checkout either commits entirely before the Z transaction opens, and is counted, or begins after it and is refused.

2. **The behaviour choice the plan left open, and a second one, both put to the operator before any code was written (2026-09-04).** *(a)* An order created while a Z report is being generated: **refuse it, whichever got there first** — no `CLOSING` shift state, no migration, no deterministic pre-emption. The cart is kept client-side, so the cashier opens a new till and rings the sale again into the shift it belongs to. *(b)* The refund path, which C-15's stated Location does **not** name: **close it in this batch** rather than record it against Batch 5.3. Both were the recommended options and both were accepted.

3. **The pre-batch demonstration is the evidence, not the unit tests.** The unit tests prove the guards; the HTTP run on a copy of production proves the defect was real and what it cost. Restoring the scratch copy between the two runs meant stopping the server and deleting `-wal` and `-shm` with the `.db` — the copy runs in WAL even though production does not (*Methods → Scratch copy*). Production was verified untouched at the end: `7839db18…`, 696 320 bytes, mtime 2026-09-04 16:41:52, no `-wal`/`-shm` beside it, `db/backups/` unchanged (newest file 2026-08-28) — the close's automatic backup landed in the scratch `HIBAPOS_DATA_DIR`, which is what warning 7 exists to ensure.

4. **One revert failed nothing, and the test was corrected rather than accepted.** Moving the shift assertion to *after* `nextReceiptNumber` changed no test result, because the rollback restores the counter either way — the two orderings are indistinguishable at the database. The comment claiming the assertion's position was what prevented a burnt receipt number was wrong and now says so: what prevents it is the rollback, the assertion-first order is a clarity choice, and the counter check is kept as a regression pin against a future change that draws the number outside the transaction. Two more tests are labelled `REGRESSION ASSERTION`, and one `CONTROL` — it must pass with and without the refund guard, because its job is to show the guard does not over-refuse. Saying which is which was more useful here than manufacturing a revert each could fail.

5. **A test file that cleaned up only *before* each test broke a file it has nothing to do with.** `shift-race.test.ts` left `ZReport` rows behind, and `vat-inheritance.test.ts` — which deletes orders and shifts but not Z reports — then failed `shift.deleteMany()` on a foreign key, in a run where nothing was wrong with the code. Fixed here by giving this file an `afterAll` as well as a `beforeEach`. The general shape is recorded as **L-40** for Batch 6.3, which already owns the shared test-database path (warning 3b).

6. **Prisma raises `P1008`, not `P2028`, when a transaction cannot get through.** Discovered by the ten-sales-against-one-close test failing with a raw Prisma stack trace where a French message was expected. Both codes mean the same thing operationally — the transaction is rolled back, nothing was written, retrying is safe — so both map to the 503. Without this, a cashier racing a close would have met a Prisma error page.

7. **The step-up token is consumed before the transaction, so a raced *discounted* sale burns it.** The cashier must re-enter their PIN to retry. The client already handles this (it drops the token on any non-400 status and re-prompts), and the consumption cannot move inside the transaction without moving the whole discount decision with it, so it is left alone and recorded as **L-41** against Batch 5.7.

8. **What this batch did NOT change.** No `CLOSING` shift state and therefore no migration (note 2a). The pre-transaction shift lookup in `POST /api/orders` stays — it is a cheap early refusal that saves opening a transaction, and it is no longer the thing that decides. `POST /api/shifts/[id]/close`'s own "already closed" 409 pre-check stays for the same reason. The order in which the two Z guards fire was chosen deliberately: the duplicate-Z check runs **before** the status check, so a second close of the same shift still meets *« Clôture déjà effectuée pour cette caisse »* — the message its existing test asserts, and the more useful of two true answers. Nothing was done about the X report reading outside a transaction: it seals nothing, so it has no race to lose.

---

# STAGE 5 — WORKFLOW GAPS

---

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1043-1072 (commit `04a76c9`) on 2026-09-05.*

## Batch 5.1 — Keyboard shortcuts

**Status:** `COMPLETED`

### C-20 — Every POS keyboard shortcut is dead

**Status:** `COMPLETED` · Severity: HIGH · Category: confirmed bug (usability)

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

**Status:** `COMPLETED` · **Completed:** 2026-09-05 (session 12)

**Changes:** C-20 in three parts. **The matcher:** `use-keyboard-shortcuts.ts:32-34` compared an optional `boolean | undefined` against the event's real boolean with no coercion, so `undefined !== false` was true on the *ctrl* line for every shortcut on every keystroke and the loop `continue`d before it ever read the key — `Shift+?` included, which died on the ctrl line before reaching its own. `!!s.ctrl !== e.ctrlKey`, and the same for shift and alt, is the fix the plan named. The predicate moved into three exported pure functions — `matchesShortcut`, `findShortcut`, `isEditableTarget` — so it can be tested without a DOM, which `bun test` does not provide and for which this repo has no component tests. **The AZERTY slash:** Windows reports `/` on layout `0000040C` as vk `0xBF` **with SHIFT** (`VkKeyScanEx`), so this restaurant's own keyboard delivers `key: "/"` *and* `shiftKey: true`, and the strict matcher would have refused it — the plan's fix alone revived nine presses of ten and left the documented `/` search key dead at this till. A second registration `{ key: "/", shift: true }` now sits beside the plain one. The two cannot collide: QWERTY `Shift+/` emits `?` and AZERTY `Shift+:` emits `/`. **The dead search handler**, found only by running the app: `pos-view.tsx:41` declared its own `searchInputRef` and never attached it to an element, while the real input is the topbar's — so F1 and `/` fired into a no-op. Both files now import `POS_SEARCH_INPUT_ID` from `app-store.ts`, and `focusSearch` reaches the input by id. **No migration; nothing waits on the operator.**

**Files:** `src/hooks/use-keyboard-shortcuts.ts` · `src/hooks/use-keyboard-shortcuts.test.ts` (new, 25 tests) · `src/features/catalog/pos-view.tsx` · `src/components/shared/topbar.tsx` · `src/store/app-store.ts`

**Tests:** **568 pass, 0 fail** (`bun test src --timeout 30000`; 66 s on a fast run, 422 s on a slow one — L-24); 543 before, so 25 new, all in `use-keyboard-shortcuts.test.ts`. `bun run typecheck` PASS, `bun run lint` PASS, `bun run build` PASS. **Seventeen one-property reverts, in three directions** — uncoerced (the original bug), lenient (`if (s.x && !e.xKey)`) and unchecked (the line deleted) for each of ctrl, shift and alt; the field guard dropped and then made absolute; `isEditableTarget` forced to `false` and to `true`; the AZERTY registration removed; and the search `id` and the `getElementById` lookup each reverted. **Every one of the 25 tests fails under at least one.** Against the true pre-batch state of both files, **15 fail and 9 pass** — and those 9 are named in the file as regression assertions that **cannot fail against the old code**, because a matcher that refuses every keystroke satisfies any test asserting a shortcut is refused. **Manual walkthrough at the till**, production build on a scratch copy, over HTTP in a real browser: every row of the help dialog performs its documented action — F1, plain `/` and AZERTY `Shift+/` focus *and select* the search box (catalogue filtered to « Buffalo »); F2 / F3 / F5 move the order-type pill; F4 took held orders 1 → 2 and cleared the cart; F8 « Remise »; F9 « Encaissement »; `Shift+?` « Raccourcis clavier »; Échap closed each one (`data-state="closed"`). **F5 no longer reloads the page**, proved by a page-lifetime marker surviving the press. Production untouched: `7839db18…`, 696 320 bytes, mtime 2026-09-04 16:41:52, no `-wal`/`-shm` beside it, `db/backups/` unchanged, no `db/fiscal-archives/` created.

**Commit:** `8a4429a`

**Notes:**

1. **The one behaviour choice this batch held, and it is not the one flagged at handoff.** The session opened with the belief that 5.1 leaves nothing to adjudicate. `Shift+?` is indeed correct on both layouts — measured, not assumed: `VkKeyScanEx` against Windows layout `0000040C` puts `?` at vk `0xBC` with SHIFT on French AZERTY and at vk `0xBF` with SHIFT on US QWERTY, so `shift: true` is right for both. The same call puts `/` at vk `0xBF` **with SHIFT** on AZERTY and unshifted on QWERTY. The plan's named fix would therefore have left the restaurant's own `/` dead while the help dialog kept teaching it — the exact complaint in C-20's own *Impact*. Put to the operator as one question before any code was written; answered **register it both ways**, which also keeps a numeric keypad's `/` working, that key being unshifted on every layout.

2. **The help dialog is not a list of the nine registrations, and that is fine.** Its nine rows cover eight registrations plus one key the hook never had: `F1 / /` is a single row for two shortcuts, and **Échap** is Radix Dialog's own behaviour — no dialog in the POS overrides `onEscapeKeyDown`. That row was true throughout the years the hook was dead. It was exercised anyway, because the batch's criterion says *every key listed in the help dialog*, and it passed.

3. **A second dead thing behind C-20, found only by running the app.** With the matcher fixed, F1 and both `/` presses matched and called `preventDefault` — and focused nothing. `pos-view.tsx:41` held a `searchInputRef` that was never attached to an element; the search box is rendered by the topbar, which keeps its own ref, and the two components share no channel. Two of the nine documented shortcuts would have shipped still dead. Put to the operator with its cost; answered **fix it in this batch**. The shared constant lives in `app-store.ts` beside `posSearch` — the one module both files already imported, so neither gains a dependency — and the wiring now cannot drift without a type error. A source-level test covers the one thing that can still break silently: the `id` attribute on the input.

4. **What the regression assertions can and cannot prove, stated rather than implied.** Nine of the 25 tests pass against the pre-batch code. They hold the *other* edge of the contract — an unset modifier is a requirement, not a wildcard — and their value is against a future matcher gone lenient, not as evidence for C-20. Five of them survived the first eight reverts; rather than accept that as a pass, five further reverts were added (each modifier check deleted outright, then `isEditableTarget` forced both ways) until all 25 had failed under something. *Methods → Prove the test fails on the old code:* a revert that everything survives has told you something.

5. **F5 is not a behaviour choice, and this is why.** It stops reloading the POS screen and starts setting LIVRAISON. That is what the help dialog documents, what the registration says, and `LIVRAISON` is a first-class order type with its own pill in the cart panel and its own pricing column. The hook mounts only on the POS view, so F5 still reloads on every other screen, and `Ctrl+F5` and `Ctrl+R` still reload on this one — the modifier check refuses them, so nothing calls `preventDefault`. Recorded rather than asked.

6. **Shortcuts reach the till through an open dialog — measured, not fixed.** With « Encaissement » open and focus on a button, F5 flipped the sale to Livraison underneath it; `setOrderType` reprices every cart line, and `PaymentDialog` reads `orderType` from the store at submit time, so the checkout would then be refused **400** for want of a customer and address. Nothing is mis-journalled — the sale is blocked, not booked wrong. Suppressing shortcuts under a modal is feature design with its own questions (which dialogs, and whether Escape should join the hook rather than staying Radix's alone), so it is recorded as **L-42** under safety rule 10.

7. **A browser-driving trap, for the next session that needs one.** A `keydown` probe installed on `window` to read `e.defaultPrevented` reports **false for a shortcut that did fire**, if the hook re-registered its listener after the probe went on — and it does: the shortcuts array is memoized on cart-derived values, so adding an item tears the listener down and adds it back, behind the probe. It cost one wrong conclusion here. Install the probe after the last cart change, or observe the effect instead of the flag. *Methods → Browser driving.*

8. **What this batch did NOT change.** The `useMemo` and its dependency list stay as they are. No shortcut gained `allowInInput`, so every one of them still stands down while focus is in a text field — that is the documented contract, the batch tests it, and it is why nothing fires while the cashier is typing a search. Not one row of the help dialog was edited: every row now does what it says. `use-auto-lock.ts` (which counts keydowns as activity) and `receipt-dialog.tsx`'s `Ctrl+Enter` print listener were left alone; neither collides with a registered shortcut.

9. **Front matter: what was retired to make room, and where the fact lives now.** The subsection *Environment as last seen — verify before trusting* went, heading and intro and all, because item 8 was its last surviving occupant (item 6 went in Batch 4.7). Item 8 said `bun test src` fails 23 tests on this machine and the code is fine. **That fact has three other homes**, all of them fuller: **L-24**'s row in *Newly Discovered Issues* carries the measurement (~1519 ms per scrypt call at N=2^17, the misleading `SQLITE_CANTOPEN`/P2010 cascade, and the two options for fixing it), the *Validation commands* table says to add `--timeout 30000` and points at L-24, and *G* repeats it beside the current test count. The one pointer that named the retired subsection — *Methods → Manual validation against the production build*, on `next dev` being blocked here — now points at warning 9, which carries that fact. The subsection itself was **635 bytes**; after this batch's own additions to *G* and the status block, the front matter fell from **40 819 to 40 210 bytes**, leaving about **750** of its ~40 960-byte ceiling.

---

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1057-1091 (commit `c478a73`) on 2026-09-05, with the Validation Required re-derived in place — see the note under that heading for what was replaced and why.*

## Batch 5.2 — Table selection wiring

**Status:** `COMPLETED`

### C-21 — The table plan is disconnected from the POS

**Status:** `COMPLETED` · Severity: HIGH · Category: incomplete functionality

**Problem.** `setTableLabel` exists in the cart store and is called from nowhere.

**Evidence.** `grep -rn setTableLabel src/` → exactly two hits, both in `cart-store.ts` (type at `:59`, implementation at `:124`). `tables-view.tsx` imports neither `useCartStore` nor `setView`.

**Location.** `src/store/cart-store.ts:59,124`; `src/features/tables/tables-view.tsx`

**Impact.** `tableLabel` is permanently `""`, so `payment-dialog.tsx:156` always sends `null`. The server's dine-in table auto-link (`orders/route.ts:344-352`) never fires, tables never go OCCUPIED from a sale, receipts never show a table, and held-ticket labels always fall back to "Commande N". The floor plan is a decorative screen. README lists "tables (plan de salle)" as delivered.

**Remediation direction.** Wire a table picker into the POS order bar, or drop the feature from the documentation until it is wired. See DD-09.

**DD-09 answered 2026-09-05 — withdraw it.** There is no table service here, so 5.2 removes the floor-plan screen from the navigation and corrects the README, and leaves the `Table` model, its API and the server-side auto-link in place, unused. **Two things to carry:** held tickets keep their `Commande N` labels, which is now intended rather than a symptom; and production holds one stale `Table` row (`T1 / Salle`, `OCCUPIED`, never linked to any order) — that is live data, so removing it is the operator's action (warning 4). **The Validation Required below assumes the opposite answer and must be re-derived before the batch starts.**

### Batch 5.2 — Validation Required — **RE-DERIVED 2026-09-05**

**What stood here, and why not one criterion survived as written.** The six criteria below were authored against the *other* answer to DD-09 — wire a table picker into the POS — and every one of them names the picker or its consequences. They are reproduced first, in full, because deleting a validation section quietly is how a batch ends up claiming coverage it never had.

| # | The criterion as written | Disposition |
|---|---|---|
| 1 | *Manual: selecting a table in the POS carries the label through checkout to the order and the receipt.* | **VOID.** Its subject does not exist: there is no picker to select a table in, and after this batch there is no screen either. Nothing replaces it. |
| 2 | *Manual: completing a dine-in sale with a table sets that table OCCUPIED and links `currentOrderId`.* | **SURVIVES, HALVED AND STRENGTHENED → new B1.** The UI half is void with criterion 1. The server half is exactly what DD-09 retained, so it becomes an automated test of `createOrderInTransaction` instead of a manual walkthrough — stronger, because DD-09's promise to keep this "in case table service ever exists" is worth nothing if it is never executed again. |
| 3 | *Manual: a full refund frees the table (existing behaviour at `refund.ts:99-104` — confirm it now actually fires).* | **SURVIVES THE SAME WAY → new B2.** Note the line reference had already drifted: the release is at `refund.ts:131-136`. |
| 4 | *Targeted test: `tableLabel` reaches the order payload and the table auto-link executes.* | **INVERTED → new A4.** `tableLabel` reaching the payload is precisely what this batch makes permanently impossible from the POS. What is worth pinning is the opposite: that the setter still works, and that nothing calls it. |
| 5 | *Regression: takeaway and delivery orders are unaffected.* | **WIDENED → new C1.** With no picker, the order types are not what is at risk; the whole navigation is. Nothing about ordering changes in this batch, so the regression to pin is that the removal took exactly one row and one view and left every other one reachable. |
| 6 | *`bun test src` — PASS. `bun run typecheck` — PASS.* | **KEPT VERBATIM, extended** with `lint` and `build`, as every batch since 4.2 has run. |

**The criteria this batch was actually validated against.**

*A — the screen is withdrawn (the claim; these fail against the pre-batch code).*
- A1. `tables` has no row in `NAV_ITEMS`, so `canAccessView` refuses the view for `SUPER_ADMIN`, `MANAGER`, `null`, `undefined` and `LEAST_PRIVILEGED_ROLE`.
- A2. `#/tables` does not resolve to a view at all — not "Accès refusé", which would claim the address is gated rather than gone.
- A3. `tables` is absent from the till's own pinned surface in `fiscal-surface.test.ts`, which asserted its presence before.
- A4. `setTableLabel` still works and is called from nowhere in `src/`.
- A5. Manual, in a real browser against a production build: no Tables card on the home grid (this app's navigation), `#/tables` changes nothing as a hash change or as a deep link, and no floor plan renders.

*B — what DD-09 deliberately kept still works (regression assertions; these cannot fail against the pre-batch code).*
- B1. A dine-in sale carrying a table label still marks that table `OCCUPIED` and links `currentOrderId`.
- B2. A full refund of that sale still frees the table.
- B3. A dine-in sale with **no** label — which is every sale the POS can now produce — touches no table.
- B4. `tables-view.tsx`, the three `/api/tables*` routes and the receipt's label line are all still present; the screen is imported by nothing.

*C — the removal took only what it was meant to.*
- C1. The surviving `NAV_ITEMS` view list is pinned exactly, so removing a neighbour is a test failure.
- C2. A neighbour of the removed row opens in the real browser (`#/shifts`, `#/orders`, `#/products`).

*D — the usual gates.*
- D1. `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS.
- D2. Production `db/custom.db` unchanged by hash, size and mtime, with no `-wal`/`-shm` beside it and no `db/fiscal-archives/` created.

### Batch 5.2 — Status Record

**Status:** `COMPLETED` · **Completed:** 2026-09-05 (session 13)

**Changes:** C-21 closed by **withdrawal**, not by wiring (DD-09). The nav row at `nav-config.ts:36` is the gate and its removal is the batch: `canAccessView` refuses a view with no row (`if (!item) return false`), the sidebar reads that array, and `home-dashboard.tsx:221-225` filters its own module list against it — one deleted row closes all three. `tables` also left the **`AppView` union** and `VALID_VIEWS` in `app-store.ts`, which is the difference between a withdrawal and a gate: left in the union, `#/tables` would still resolve and the shell would answer *« Accès refusé »*, claiming the address is **gated** when the screen is **gone**. Removing it from the union made the compiler carry the change into `app-shell.tsx` (the `dynamic()` import and the render arm) and `home-dashboard.tsx` (`MODULE_ORDER` is `AppView[]`, `MODULE_META` a `Partial<Record<AppView, …>>`), so neither could be missed. `hashToView` is now exported so the refusal is testable without a DOM — the affordance Batch 5.1 made for `matchesShortcut`. **README:79 and :93** no longer claim the feature. **Nothing server-side was deleted**, per DD-09: the `Table` model, the three `/api/tables*` routes, the checkout auto-link and the refund release all stay, each now carrying a comment saying it is retained and unreachable, so the next dead-code sweep does not take it. `tables-view.tsx` stays on disk, imported by nothing — it is the only client `/api/tables*` has, and deleting one while keeping the other would be incoherent. `setTableLabel` stays for the same reason and is commented as deliberately callerless. **No migration; one operator action considered and declined — see note 3.**

**Files:** `src/components/shared/nav-config.ts` · `src/store/app-store.ts` · `src/components/shared/app-shell.tsx` · `src/components/shared/home-dashboard.tsx` · `src/lib/services/checkout.ts` (comment only) · `src/lib/services/refund.ts` (comment only) · `src/store/cart-store.ts` (comment only) · `src/components/shared/nav-access.test.ts` · `src/lib/services/fiscal-surface.test.ts` · `src/features/tables/table-withdrawal.test.ts` (new, 7 tests) · `README.md`

**Tests:** **578 pass, 0 fail** (`bun test src --timeout 30000`, 85 s); 568 before, so 10 new — 3 in `nav-access.test.ts`, 7 in the new file — plus one existing assertion in `fiscal-surface.test.ts` inverted rather than deleted. `bun run typecheck` PASS, `bun run lint` PASS, `bun run build` PASS (the three `/api/tables*` routes still appear in the route manifest). **Against the true pre-batch tree, 5 of this batch's 10 tests fail and 5 pass** — and the 5 that pass are named in the file as regression assertions that **cannot** fail against the old code, because the old code already had everything DD-09 retained. That ratio is inherent to a removal and is stated rather than implied: the view was always reachable, so only the *unreachability* is new evidence. **Fourteen one-property reverts, in both directions** — the nav row restored, `tables` restored to `VALID_VIEWS`, the shell's import and arm restored; and the other way, a *different* nav row removed, a *different* view removed from `VALID_VIEWS`, the checkout auto-link deleted, its label guard relaxed to link any table, the refund release deleted, the screen file deleted, a route file deleted, the receipt's label line deleted, and the setter renamed, deleted and given a caller. **Every one of the 11 tests fails under at least one**, and one revert that initially failed nothing exposed a defective assertion, which was strengthened rather than accepted (note 2). **Manual walkthrough** on a scratch copy in a real browser against a production build: no Tables card on the home grid, `#/tables` leaves the view unchanged from both `#/orders` and `#/products`, a full reload at `#/tables` lands on the home dashboard with no floor plan and no *« Accès refusé »*, and `#/shifts`, `#/orders` and `#/products` all still open. The scratch copy was proved by a marker name read back through the pre-auth `GET /api/auth/profiles` before any write, and the same marker was visible in the topbar throughout. Production untouched: `7839db18…`, 696 320 bytes, mtime 2026-09-04 16:41:52, no `-wal`/`-shm`, `db/backups/` still 9 files, no `db/fiscal-archives/` created.

**Commit:** `1abde1f`

**Notes:**

1. **Two integration points the handoff did not name, and one of them fails loudly.** The seven measured for this batch all held at the stated lines. Two more existed. **`home-dashboard.tsx:62` and `:78`** keep a module list separate from the nav table — the exact fact C-27 was about, cutting the other way — though the removal would have been safe anyway, because the filter at `:221-225` finds no nav row and drops the card. **`fiscal-surface.test.ts:37`** is the sharper one: a *second* test that walks `NAV_ITEMS`, asserting `expect(forTill).toContain("tables")`. It does not shrink silently the way `nav-access.test.ts` does — it goes red. It was **inverted, not deleted** (safety rules 2 and 3): a view vanishing from the till's own surface is what that test exists to catch, so the catch is answered in place, and the list still pins five views.

2. **A revert that changed nothing, and what it exposed.** The first version of B4's cart-store assertion was `expect(readFileSync("cart-store.ts")).toContain("setTableLabel")`. Renaming the setter to `setTableLabelX` did not fail it — the substring survives inside the longer name, and the type declaration matches it regardless — so the assertion was close to unfalsifiable. *Methods → Prove the test fails on the old code*: a revert that changes nothing is a defect in the test. It was replaced by A4, which drives the store for real and then walks `src/` asserting `setTableLabel` is mentioned in exactly one file and called in none. That is C-21's own evidence turned into a test, and it now fails in **three** directions: delete the setter, rename it, or give it a caller. A second, smaller instance of the same trap: an assertion that `app-shell.tsx` no longer contains `features/tables/tables-view` was satisfied by the *comment* this batch put there naming the file it no longer imports. Source-level assertions in this batch strip line comments first, for that reason.

3. **The stale `T1` row: asked for, or left? Left — and Batch 8.0 is amended so it does not survive by accident.** Production holds one `Table` row, re-verified read-only this session: `T1 / Salle`, `OCCUPIED`, `currentOrderId` **null** — not even a coherent occupancy — and zero of the 20 orders carry a table label. Deleting it is the operator's action (warning 4), and it was **not** requested, for four reasons. (a) It is provably inert: the only code that reads a `Table` row on a trading path is `checkout.ts:203`, behind `if (orderType === "DINE_IN" && tableLabel)`, and the cart's `tableLabel` has no writer — so no sale or refund can reach it. (b) It is not fiscal data: not in the chain, not in a Z, not in the grand total, so nothing about it needs to be true before the first real sale. (c) The benefit today is zero — no screen displays it and no report counts it — while the cost is a bespoke operator action, and operator attention is the scarce resource this plan spends carefully. (d) There is already a scheduled moment that opens the live database with a reviewed script and a verified out-of-band backup: **Batch 8.0 / P-04**. **But 8.0's *What must be KEPT* list names `tables` explicitly**, written when the floor plan was a live feature — so deferring silently would have been deciding to keep the row forever. That line is amended in the plan, dated, with the reasoning pointing here.

4. **What "withdrawn" means here, precisely, because two readings are available.** `DINE_IN` is **not** withdrawn: 18 of production's 20 orders carry it, it has its own pricing column and its own pill in the cart panel, and it means *eating in*, not *being served at a table*. What is withdrawn is the floor plan and the idea that a sale is attached to a numbered table. The measurement that makes the distinction concrete is that those 18 dine-in orders carry **zero** table labels between them — the restaurant's own test data was already rung the way DD-09 says it trades.

5. **Held tickets keep `Commande N`, and that is now a specification.** `cart-panel.tsx:95` calls `holdCurrent(tableLabel || \`Commande ${n}\`)` and `tableLabel` is permanently `""`, so the fallback is always taken. Before DD-09 that was a symptom of C-21; after it, it is the intended label. Recorded because Batch 5.4 owns held-order lifecycle and should not read it as a bug to fix.

6. **One test-suite failure observed, not attributed, and not "fixed".** The first full-suite run after this batch reported **577 pass, 1 fail** — `shift-race.test.ts` → *"ten sales racing one close: every order in the closed shift is in its Z totals"*, Batch 4.7's test. Three further post-batch runs were clean (578/578) and two pre-batch runs were clean (568/568), which is **not enough to establish whether it predates this batch**: at the observed rate, two clean pre-batch runs are likely either way. What *was* established is that the obvious interference vector is closed — the new test file leaves **zero rows** in every shared table, verified by reading the test database directly after running it alone — and that the test is timing-dependent by its author's own account (its comment names the P1008 503 as "what ten sales against one close actually produce on this machine"; record → Batch 4.7 note 6). Its final assertion, `expect(await db.order.count()).toBe(z.salesCount)`, is a **global** count over a database shared by 53 files, which is the shape L-40 describes. Recorded as **L-43** under safety rule 10 and assigned to Batch 6.3, which already owns the per-run test-database path. **Do not treat a lone failure of that test as a code failure without reproducing it**, and do not confuse it with L-24, which is about slow runs, not wrong results.

7. **Front matter: what was retired to make room, and where the fact lives now.** The *Last Completed Batch* paragraph for Batch 5.1 — the full account of the uncoerced matcher, the AZERTY `/`, and the unattached `searchInputRef` — was cut to a two-sentence pointer. **That story has two fuller homes**: the record's Batch 5.1 section carries it in its Changes field and notes 1 and 3, and the plan's Batch 5.1 stub carries the eight constraints as sentences copied from it. Nothing was lost; a paragraph that existed to tell the last session's story was doing so a second time. Front matter went from **40 418** to **40 144** bytes, leaving **816** of the ~40 960 ceiling.

---

## Batch 5.3 — Cross-shift refunds

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1078–1156 (commit `d608cf7`) on 2026-09-05. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**Status:** `COMPLETED` — unblocked by DD-10, answered 2026-09-05

### C-14 — Yesterday's order can never be refunded

**Status:** `COMPLETED` · Severity: HIGH · Category: workflow / business rule

**Problem.** The refund route rejects any order whose shift is `CLOSED`, with no override for any role.

**Evidence.** `orders/[id]/refund/route.ts:28-33` — "La caisse attachée à cette commande est déjà clôturée. Remboursement impossible." The comment suggests escalating to a SUPER_ADMIN; no such path exists.

**Location.** `src/app/api/orders/[id]/refund/route.ts:26-33`

**Impact.** A customer returning the next day cannot be refunded through the POS. The workaround an operator will reach for — refunding cash from the drawer without a record — is exactly the untraced correction the fiscal journal exists to prevent.

**Related.** `Refund.shiftId` is populated with the *order's* shift (`refund.ts:83`) despite the schema comment describing it as the shift that issued the refund, and no report reads the column at all.

**Remediation direction (audit).** Allow a cross-shift refund attributed to the *current* open shift, so the cash impact lands in the drawer that actually paid it out.

**Decision required.** See *Design Decisions Required → DD-10*. **Answered 2026-09-05 — allow, attributed to the current open till.** Two corrections for whoever runs the batch: the refusal lives at `refund/route.ts:28` **and**, since Batch 4.7, inside the transaction at `refund.ts:86` — the second is the decisive one; and “restrict to MANAGER+” was already true since 4.4c, so it was never a live option.

**SCOPE CORRECTION, measured 2026-09-05 (after Batch 5.2). Lifting the two refusals is NOT sufficient, and on its own it loses money silently.** DD-10 says the refund "comes out of today's drawer and lands in today's expected cash". **Nothing in the reporting path would make that true**, and one line is why: `aggregate.ts:182` builds the refund set as `orders.flatMap((o) => o.refunds)`, while `computeShiftReport` selects orders with `where: { shiftId, status: { in: ["COMPLETED","REFUNDED"] } }` (`reports.ts:63-64`). So a refund is counted by **the shift that owns the refunded order**, never by the shift that paid the cash out. Lift the two refusals and refund yesterday's order today, and: yesterday's shift is already sealed and immutable, so it cannot absorb it; today's report never selects that order, so `expectedCash` at `reports.ts:88` is short by the amount handed over; and the drawer is down with **no** report accounting for it — which is C-02's cash-variance figure made untrustworthy again, the exact outcome C-14's *Impact* says the journal exists to prevent. **`Refund.shiftId` is the column the fix turns on, and it is currently wrong for this purpose**: `refund.ts:116` writes `order.shift?.id` — the *order's* shift — while `schema.prisma:418` comments it as "the shift that issued the refund". Zero rows exist (verified read-only 2026-09-05: 0 refunds, 0 with a `shiftId`), so the column's meaning can be settled now at no cost. **This makes 5.3 a change to Batch 3.2's unified aggregation, not a two-line refusal flip** — and 3.2's whole point is that a Z report and the monthly close containing it cannot drift apart, so the same sourcing change has to be right for both. Budget the batch accordingly, and re-read Batch 3.2's stub before starting.

**Production baseline for this batch, re-verified read-only 2026-09-05:** 3 shifts (2 `CLOSED`, 1 `OPEN`), 20 orders — **15 in a closed shift and unrefundable today**, 5 in the open one; **0 refunds have ever been recorded**, so no row constrains the attribution decision; 2 sealed Z reports.

### Batch 5.3 — Validation Required

*(DD-10 answered 2026-09-05; these are now finalisable.)*
- Targeted test: refunding an order from a previous, closed shift succeeds and is attributed to the current open shift.
- Targeted test: the refund's cash impact appears in the *current* shift's expected cash, not the original shift's.
- Targeted test: the original shift's sealed Z report is **not** modified.
- **Fiscal verification:** the `REMBOURSEMENT` event chains correctly and the period aggregation (Batch 3.2) handles a cross-period refund coherently.
- `bun test src` — PASS.

#### What the five criteria did not ask for, and had to (added 2026-09-05, before any code was written)

Unlike Batch 5.2's, none of the five above is *wrong* — the SCOPE CORRECTION had already reconciled them with DD-10. They are **incomplete**, and the gaps are where the money is. Five criteria were added rather than substituted, and all ten were run:

- **A refusal has to replace the one being lifted.** The five say what must now succeed and nothing about what must still fail. A refund with **no caisse open** would put cash out of a drawer no report owns — the very outcome C-14's *Impact* describes. Criterion: refused `409`, in French, writing neither a `Refund` row nor a `REMBOURSEMENT` event.
- **`Refund.shiftId`'s meaning must be settled and pinned.** The plan's *Related* line names the contradiction; no criterion tested it. Criteria: a cross-shift refund names the paying till, a same-shift refund still names the till it always did, and the migration question is answered by measurement either way.
- **"Handles a cross-period refund coherently" needs a definition.** Made concrete as Batch 3.2's own property: the sealed monthly close equals the sum of its Z reports **field by field**, including rate by rate, with the refund crossing a shift boundary — and a month already sealed is not reopened by a refund issued in the next one.
- **The correction's VAT must reconcile to the cent.** `splitVat(1500) − splitVat(2000)` is `(−454, −46)` where `splitVat(−500)` is `(−455, −45)`: the split of a difference is not the difference of the splits. Nothing in the five would have caught a close ending a cent from the Z reports it contains.
- **The Z is not the only report that had to move.** `/api/reports/vat`, `/api/reports/sales` and `/api/shifts/summary` are three of Batch 3.2's five callers; leaving them on the old sourcing reopens C-11's and M-14's shape. Criterion: the VAT report and the close see one set of figures for the same period.

### Batch 5.3 — Status Record

**Status:** `COMPLETED` · **Completed:** 2026-09-05

**Changes:** The refusal is lifted at both sites and replaced by its opposite. `refund/route.ts:26-33` asked whether the ORDER's till was closed; it now asks whether ANY till is open, kept as a *pre*-check so a refund attempted with no caisse does not burn the operator's single-use step-up token (cf. L-41). `refund.ts` resolves the paying till **inside** the transaction — the same C-15 race, decided under the lock — and refuses `NO_OPEN_SHIFT_FOR_REFUND_MESSAGE` (409) when there is none; `SHIFT_CLOSED_DURING_REFUND_MESSAGE` is gone, and `OrderForRefund.shift` with it, so nothing about a refund can depend on the order's own till again. `refund.ts:116` writes the paying till, not the order's. **The reporting change is the batch.** `aggregate.ts` gained two options — `refundPosition` (`before` / `in` / `after` this period) and `saleInPeriod` — expressing one rule: *a period books the sales of its own orders and the corrections it issued*. An order refunded by a LATER period contributes the **difference** between its state before and after, so periods telescope and a month still equals the sum of the Z reports inside it. `shiftOrdersWhere` / `periodOrdersWhere` and their matching option factories sit beside `AGGREGATE_INCLUDE`, so a period's fetch and its filter cannot drift apart. All five of Batch 3.2's callers adopt them: `computeShiftReport` (X/Z), `aggregatePeriod` (monthly + annual closes), `/api/reports/vat`, `/api/reports/sales`, `/api/shifts/summary`. `money.ts` gained `addVatMoveToBreakdown`; `addToVatBreakdown` is now that function from zero, so there is still one implementation.

**Files:** `src/lib/services/refund.ts`, `src/app/api/orders/[id]/refund/route.ts`, `src/lib/services/aggregate.ts`, `src/lib/services/reports.ts`, `src/lib/services/fiscal.ts`, `src/lib/money.ts`, `src/app/api/reports/vat/route.ts`, `src/app/api/reports/sales/route.ts`, `src/app/api/shifts/summary/route.ts`, `prisma/schema.prisma` (comment only), `src/lib/services/cross-shift-refund.test.ts` (new), and — re-derived or re-fixtured — `src/lib/services/shift-race.test.ts`, `aggregate.test.ts`, `reports.test.ts`, `report-agreement.test.ts`, `close-timing.test.ts`, `src/features/tables/table-withdrawal.test.ts`.

**Tests:** `bun test src --timeout 30000` — **597 pass, 0 fail**, three consecutive full runs (baseline 578 + 19 new). `bun run typecheck`, `bun run lint`, `bun run build` — all PASS. **Eleven one-property reverts**, each applied alone against a copy taken first and restored from it, and every one failed at least one test: R1 the old closed-shift refusal (16 fail), R2 attribution to the order's shift (11), R3 the shift fetch without its second arm (9), R4 the shift filter (12), R5 the period fetch (1), R6 the period filter (1), R7 the split of the difference instead of the difference of the splits (3), R8 the current-status arm inside a period-scoped ask (3), R9 a foreign order's payments counted (5), R10 a foreign order's corrections ignored (7), R11 no refusal when no till is open (1 here plus 1 in `shift-race.test.ts`). Manual end-to-end walkthrough on a scratch copy of production through the real HTTP API, marker proved via `GET /api/auth/profiles` before the first write.

**Commit:** `3917f3a` + this plan update.

**Notes:**

**(1) No migration, measured two ways rather than asserted.** `Refund.shiftId` already exists, nullable and indexed, so only its *meaning* changed. `prisma migrate diff --from-schema-datasource --to-schema-datamodel` and `--from-migrations --to-schema-datamodel` both print *"This is an empty migration"* against the edited schema. **Nothing waits on the operator.** Making the column `NOT NULL` was considered and **declined**: it would need a migration for a guarantee the code already gives (`processRefund` refuses without an open till), and it would not survive the hard-deleted shift the missing FK exists to tolerate.

**(2) Lifting the two refusals and fixing `Refund.shiftId` would still not have been enough — the SALES side had to move with the cash.** Attributing only the tender netting to the paying till leaves `salesTotal` where the order is, and the sealed Z of the shift that sold cannot absorb a later correction. The monthly close, keying on `Order.createdAt`, then nets the refund into the order's period while the Z reports of that period do not — the sum stops equalling the close, which is C-10 in a new place and in a document that cannot be corrected. That is what forced the delta formulation: the paying period books `state(after) − state(before)` for a foreign order, across `salesTotal`, `salesCount`, `itemsCount`, `discountsTotal`, the VAT breakdown, product revenue and the per-day series. Summed over any set of periods those differences telescope to the order's final net, so a shift, a month and a year all agree by construction.

**(3) The one-cent trap, and why `addVatMoveToBreakdown` exists.** A correction's VAT is the **difference of the splits**, never the split of the difference: `splitVat(1500,10) − splitVat(2000,10)` is `(−454, −46)` while `splitVat(−500,10)` is `(−455, −45)`. Booking the second way puts the month one cent from the sum of its own Z reports. Revert R7 does exactly that and fails three tests, one of which states both figures so the trap is documented rather than merely avoided. `apportion` is never handed a negative target — a state's `netTotal` is zero or positive — so nothing about the largest-remainder split changed.

**(4) `Order.status` cannot answer a question about a past period, and that is a deliberate narrowing of Batch 3.2's rule.** `isFullyRefunded` checked `status === "REFUNDED" || refunds >= total`. A cross-shift **full** refund flips the status, so the status arm would retroactively drop yesterday's sale out of yesterday's report — which then contradicts the immutable Z beside it. A period-scoped caller now asks the arithmetic only, evaluated on the refunds that had happened by the end of the period it is asking about; every other caller keeps both arms. Nothing diverges for data this application wrote — `refund.ts` sets `REFUNDED` exactly when `totalRefunded >= total` — and revert R8 fails three tests, including a re-run of a closed shift's report against its own seal.

**(5) Which of the 19 tests cannot fail against the old code — said plainly, not implied.** Sixteen fail under at least one revert for their own stated reason. **Three do not.** *"still names the paying till when the refund is same-shift"* is a pure regression assertion: the old code wrote the order's shift, which in that case **is** the paying shift, so it was already right and is pinned only so a future change cannot take it. *"leaves every stored column of the sealed Z as it was"* fails under R1 only because the refund is refused and the test throws — nothing in this batch writes a `ZReport` row, so its stated property cannot be falsified by any revert here. *"chains the REMBOURSEMENT event and carries yesterday's ticket number"* asserts behaviour Batches 2.x and 3.5 already established; what is new is that the scenario can exist at all. The eight tests carrying the batch are the four cash tests, the two full-refund tests, the two reconciliation tests and the three-shift telescoping test.

**(6) The four NON-fiscal reports were deliberately left on the old sourcing, and that is a new finding, not an oversight.** `/api/dashboard`, `/api/reports/cashiers`, `/api/reports/products` and `/api/customers/[id]/detail` group by day, cashier, product and customer — dimensions for which "which period paid this refund" is not the question, and for which the right attribution is a decision rather than a mechanical change (does a cross-shift refund reduce the *selling* cashier's takings, or the *refunding* one's?). They keep Batch 3.2b's semantics, which are unchanged and self-consistent. The cost is that the dashboard and `/api/reports/sales` can now disagree for the same date range once a cross-period refund exists — L-23's shape at four reports 3.2b had made agree. Recorded as **L-44** under safety rule 10.

**(7) L-43's origin is established, and it is not what L-43 guessed — and it was not fixed here.** Running the new test file immediately before `shift-race.test.ts` reproduced the failure in roughly half of eight runs, so it was instrumented rather than inferred: `Promise.allSettled([...10 sales, generateZReport(...)])` never inspects the **eleventh** promise, and in a failing run that is the one that loses — `generateZReport` rejects with Prisma's SQLite socket timeout, no `ZReport` row is written, the shift stays `OPEN`, and the next line's `findUniqueOrThrow` throws `P2025`. The test's own comment already accepts exactly that contention on the sale side (`results.slice(0, 10)` tolerates 409 and 503) and never on the close side. So it is **neither cross-file contamination nor the global `db.order.count()` assertion** L-43 named as the likely shape. It does **not** reproduce in a whole-suite run — three consecutive 597/0 runs — because the file ordering differs. L-43's row is amended with this; the fix stays with Batch 6.3 (safety rule 10), and this batch's file is not what causes it.

**(8) Manual walkthrough, on production data, through the real HTTP API.** Scratch copy with `DATABASE_URL` and `HIBAPOS_DATA_DIR` both overridden, a six-digit PIN written in with the app's own `hashPin`, and the marker `SCRATCH-COPY-5.3` proved through the pre-auth `GET /api/auth/profiles` **before** the first write. Order **#15** (28,50 €, in shift 2, `CLOSED`) refunded 10,00 € from shift 3 (`OPEN`): **HTTP 201**. `Refund.shiftId` = shift 3 while the order sits in shift 2. Shift 3's X report `expectedCash` **21 580 → 20 580**, `refundsTotal` 1 000, `refundsCount` 1; shift 2's recomputed report **identical to sealed Z#2** (32 070 / 42 070); both sealed Z rows byte-unchanged; `/api/fiscal/verify` `ok` with the `REMBOURSEMENT` as event 3; the live shift panel agrees with the X report and still counts **5** own orders, not 6. August's VAT and sales reports show `totalRefunded: 0`. Server killed with `taskkill //PID 11480 //T //F`. Production `db/custom.db` unchanged at `7839db18…`, 696 320 bytes, mtime 2026-09-04 16:41:52, no `-wal`/`-shm` beside it, `db/backups/` untouched.

**(9) One shape noticed while resolving "the open till", and not fixed.** `POST /api/shifts` reads `findFirst({ where: { status: "OPEN" } })` **outside** the transaction that creates the shift, so two concurrent opens could both pass — the C-15 shape at a fourth site Batch 4.7 did not name. It matters slightly more now, because `processRefund` picks the till with `findFirst` + `orderBy: { openedAt: "desc" }` (the same ordering `/api/shifts/summary` and `GET /api/reports/x` already use, so all three name the same till). Recorded as **L-45**; not fixed (safety rule 10).

**(10) Front matter: what was retired to make room, and where each fact lives now.** It began this session at **40 740** bytes with **220** of headroom — the tightest it has been — and rotating the *Last Completed Batch* and *Last Updated* paragraphs was not enough on its own; the first attempt landed **693 bytes over** the ~40 960 ceiling. Three retirements, in order of size. (a) **Nine answered decision rows left the *DESIGN DECISIONS REQUIRED* table** — DD-03, DD-05, DD-06, DD-08, DD-09, DD-10, DD-17, DD-18, DD-19 — chosen by one rule: closed, batch `COMPLETED`, and no forward link to unfinished work. Each was already a pointer whose last cell read *"Full question and rationale: `REMEDIATION_RECORD.md` → Answered design decisions"*, so the row was the only copy of nothing; the full rows are there, unchanged, and each answer is also inline in the batch that carried it. A one-paragraph note above the table names all nine, so the index is not lost. DD-01, DD-02 and DD-07 were **kept** despite being answered, because each still shapes an unfinished batch. **2 792 bytes freed for 975 spent.** (b) The *Last Completed Batch* paragraph for Batch 5.2 was cut to a two-sentence pointer and Batch 5.1's parenthetical dropped; 5.2's story is in the record's *Batch 5.2* section and its nine constraints are in the plan's 5.2 stub. (c) The *Last Updated* paragraph's two session-13 lessons went with it — "a removal makes weak tests easy to write" is that section's Tests field and note 2, and the front-matter ceiling is a standing rule in *HOW TO USE THIS FILE*. The *Tests* row of *OPEN THREADS → G* also lost its duplicate of warning 3b's `EPERM` paragraph, which warning 3b states in full. Front matter ends at **39 837** bytes, **1 123** of headroom — more than the session inherited.

---

## Batch 5.4 — Held orders and cart lifecycle

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1115–1171 (commit `4bb7cda`) on 2026-09-05. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**Status:** `COMPLETED`

### C-23 — Held orders live only in one browser's localStorage and are never cleared on logout

**Status:** `COMPLETED` · Severity: HIGH · Category: workflow / data

**Problem.** The cart store persists `items` and `heldOrders` to `localStorage` under `hibapos-cart`. There is no held-order API route and no such table. Nothing clears the store on logout, lock, or user switch. The persist config has no `version`/`migrate`.

**Evidence.** `cart-store.ts:69-186`. `clear()` is called from exactly two places — a successful checkout (`payment-dialog.tsx:189`) and the manual "Vider" button (`cart-panel.tsx:369`). `app-store.ts:85-95` logs out without touching the cart.

**Location.** `src/store/cart-store.ts:69-186`; `src/store/app-store.ts:85-95`

**Impact.** Cashier A locks the till mid-ticket; cashier B logs in and inherits A's open cart and A's parked tickets, and books them under B's name. Held tickets are invisible from any other device, vanish if site data is cleared, and survive a Z close — recalling one afterwards books it into the next shift. Because the persist config is unversioned, a cart written before the euros→cents migration (`720660a`) rehydrates its euro values as cents.

**Remediation direction (audit).** Move held orders server-side (they are orders); clear the cart on logout/lock/switch; add a persist `version` with a migration that discards incompatible state.

**Carried in from Batch 5.2 (2026-09-05).** Held tickets fall back to `Commande N` because `cart-panel.tsx:95` calls `holdCurrent(tableLabel || …)` and the cart's `tableLabel` has no writer. Before DD-09 that was a symptom of C-21; **after it, it is the intended label** — do not read it as a bug for this batch to fix.

**Scope note.** The server-side move is a design change — see DD-11. The cart-clearing and persist-versioning parts are unambiguous and can proceed regardless. **DD-11 answered 2026-09-05 — one till, so held orders stay device-local**: the cart-clearing and persist-versioning parts are now the batch's whole content, and the server-side move is not built.

### Batch 5.4 — Validation Required

- Manual: logging out, locking, and switching user each clear the in-progress cart.
- Manual: an old-format persisted cart is discarded rather than rehydrated with wrong values.
- Targeted test: the persist version guard rejects an incompatible payload.
- ~~If held orders move server-side: targeted test that a held ticket is visible from a second client and survives a restart; and that a Z close accounts for open tickets coherently.~~ — **VOID (DD-11, 2026-09-05): one till, so there is no server-side move and no second client.** Struck rather than deleted, per *Methods*; the Scope note above carries the answer.
- Regression: an in-progress cart still survives a page refresh (the behaviour that persistence exists for).
- `bun test src` — PASS. `bun run typecheck` — PASS.

### Batch 5.4 — Status Record

**Status:** `COMPLETED` · **Completed:** 2026-09-05

**Changes:** **(1) One choke point for the identity, not three call sites.** A new pure `operatorChanged(prev, next)` in `app-store.ts` says which transitions are a change of person: `null → someone` is the page refresh and keeps the cart, while `someone → null`, `A → B` and a failed session all clear it. `setUser`, `logout` and `fetchUser` each consult it — the defect was precisely that `logout` set `user: null` with a bare `set()` and did not know it had to clear anything, and `fetchUser` did the same. Comparison is by `id`, because `fetchUser` builds a fresh object on every call and reference equality would empty the cart under the cashier. **(2) `clear()` and `clearForOperatorChange()` are now different things.** `clear()` ends a SALE — checkout, and the « Vider » button — and must leave parked tickets alone; `clearForOperatorChange()` ends an OPERATOR and takes the held orders with it. Both are built from one `emptySale()` / `emptyCart()` pair, so "empty" cannot come to mean two things. Both are **functions**, not shared constants: a shared object hands the same `items` array to every caller. **(3) The persisted cart is vetted on every hydration.** `vetPersistedCart()` discards a payload it cannot vouch for — deliberately a discard and not a euros→cents conversion, because nothing records which shape a payload is and a cart is seconds of re-keying, where a mis-scaled one is a sale rung at a hundredth of its price. The version is stamped **inside** the state by `partialize` and checked in `merge`, not left to `persist`'s own `version`/`migrate` — see note 2, which is the batch's real finding.

**Files:** `src/store/app-store.ts`, `src/store/cart-store.ts`, `src/store/cart-lifecycle.test.ts` (new), `src/store/cart-persist-wiring.test.ts` (new)

**Tests:** `bun test src --timeout 30000` — **629 pass, 0 fail** (baseline 603 + 26 new). `bun run typecheck`, `bun run lint`, `bun run build` — all PASS. **Sixteen one-property reverts**, each applied alone and restored from a copy taken first: R1 `setUser` does not clear (3 fail), R2 `logout` bypasses the guard (1), R3 the operator reset spares held orders (4), R4 no version gate (3), R5 no structural check (1), R6 a shared empty object instead of a factory (1), R7 no exemption for arriving from null (7), R8 compare by reference not id (3), R9 `clear()` also drops held tickets (1), R10 `→ null` is not a change (3), R11 `A → B` is not a change (3), R12 vetting discards everything (1), R13 merge without the empty base (1), R14 `version`+`migrate` with no `merge` (1), R15 `partialize` omits the stamp (1), R16 `fetchUser` bypasses the guard (1). **Every one of the 26 tests fails under at least one revert** — there are no regression assertions to disclaim in this batch. **No migration** (DD-11: no server model). **No production data touched at all**: this batch is client-side, and the walkthrough that did run used a scratch copy.

**Commit:** `4bb7cda` + this plan/record update.

**Notes:**

**(1) DD-11 removed the expensive half and the batch is what was left.** No server model, no new API, no migration, no decision about what a Z close does with a parked ticket. One of the six *Validation Required* criteria was already struck as void when the decision landed; the rest were run. The 5.2 note carried into this batch was honoured: held tickets keep their `Commande N` label, which is a specification since DD-09 and not a bug for this batch to fix.

**(2) THE FINDING OF THE BATCH: `version` + `migrate` does not close C-23, and it is what the audit's own remediation direction asks for.** The first implementation added `version: 1` and a `migrate` that discards — the documented zustand pattern. It was written, unit-tested against `migrateCart(payload, 0)`, and green. Then `cart-persist-wiring.test.ts` loaded the **real module** against a stubbed `localStorage` and the euros-era cart rehydrated **verbatim**: `unitPrice: 12.5` straight through. Reading `node_modules/zustand/middleware.js` (5.0.10) says why: `if (typeof deserializedStorageValue.version === "number" && ...version !== options.version)` — a payload with **no `version` key** is not a number, the branch is skipped, and the state is returned as-is. `migrate` is never called for exactly the payload the finding names. The unit tests passed because they *assumed* zustand would pass `0`; it passes `undefined` and then does not call the function at all. Fixed by stamping the version inside the state in `partialize` and checking it in `merge`, which zustand calls on every hydration whether it migrated or not. **`version` and `migrate` are kept** — they are correct for a future numbered upgrade — but they are not what makes this work, and the code says so.

**(3) A second defect the walkthrough found, which reading had not.** `fetchUser()` sets the user with a bare `set()` like `logout` did, so it bypassed the guard. Both of its arms can END a session — the server answers `{ user: null }` for an expired or revoked cookie, and the `catch` runs when the request fails outright — and either leaves the login screen in front of whoever is standing at the till, with the previous cashier's cart waiting behind it. It now goes through `operatorChanged` like the other two.

**(4) Two reverts told us something rather than passing.** R15 — `partialize` stopping stamping the version — **failed nothing**, because every fixture in the wiring test supplied the stamp itself. The property nobody was testing is the round trip: a cart this build wrote must survive the next load. Without it, a change that stopped stamping would make every reload silently wipe the cashier's open ticket — the opposite defect from the one being fixed, and a worse one. A `ROUND TRIP` case was added, driving the real store through `addItem` and re-loading the module against what `partialize` actually wrote; R15 then fails it. (The Methods rule earned its keep again: *a revert that everything survives has told you something*.)

**(5) The browser walkthrough did not work, and it was not this batch.** The pane rendered the login screen with a valid session — `GET /api/auth/me` returned the user, `/api/settings`, `/api/shifts/summary` and `/api/catalog/categories` all answered 200 — so the POS view, which is where the cart store is first imported, could not be reached. Before assuming the environment, the **pre-batch stores were stashed, the app rebuilt and the server restarted: the pre-batch build behaved identically**, so the condition predates the batch and is not a regression. Recorded as **L-47**. The two *Manual* criteria were converted rather than dropped: "logout, lock and switch each clear the cart" is now six automated tests over the real store, and "an old-format cart is discarded rather than rehydrated" is `cart-persist-wiring.test.ts` — which runs on every `bun test src` instead of once in a session, and which is what caught note 2.

**(6) What was deliberately NOT built.** No server-side held orders (DD-11). No operator id stored inside the persisted cart: the hole it would close is a browser closed without logging out and reopened by someone else, and the session cookie already stands in the way — the next person has to log in, which clears. Said here so the next reader knows it was considered. `setTableLabel` remains callerless per DD-09, and nothing in this batch touched it.

---

## Batch 5.5 — Cash movements

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1136–1197 (commit `51af203`) on 2026-09-05. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**Status:** `COMPLETED` — unblocked by DD-12, answered 2026-09-05

### M-05 — No cash-movement model

**Status:** `COMPLETED` · Severity: MEDIUM · Category: missing functionality (fiscal-adjacent)

**Problem.** There is no way to record a cash drop, a payout, or petty cash, so `expectedCash = openingFloat + cash − cashRefunds` will disagree with the drawer whenever real money moves.

**Location.** `src/lib/services/reports.ts:94`; `prisma/schema.prisma` (no model)

**Impact.** Every real cash movement produces a phantom variance, which trains staff to ignore the variance figure — defeating the purpose of C-02's fix.

**Remediation direction.** Add an entrée/sortie de caisse model, journalled, feeding `expectedCash`. Requires a migration and a schema decision — DD-12. **Answered 2026-09-05:** build it, with a fixed category list — *approvisionnement*, *prélèvement*, *dépense*, *erreur de caisse*.

**The approval level was the gap DD-12 left, and it is now answered (operator, 2026-09-05): a step-up PIN for money LEAVING the drawer only.** *prélèvement*, *dépense* and a *erreur de caisse* that reduces the till require the operator's own PIN, exactly as every refund has since 4.4c; *approvisionnement* — a float top-up, which only adds cash — does not. The rule is the direction of the money, not the category name, so a negative correction is gated and a positive one is not. Chosen over gating every movement (a till where **every payment ever taken is cash** will record movements routinely) and over an amount threshold (a small payout repeated is the same money as a large one). **The cost is inherited and must be stated in the record**: 4.4c put `/api/auth/approve` and `/api/auth/step-up` on ONE shared five-attempt counter by operator decision, so five fumbled PINs on a cash payout lock **refunds and discounts** for fifteen minutes. A separate counter for cash movements was NOT built — that would reopen 4.4c's decision, which is not this batch's to reopen.

### Batch 5.5 — Validation Required

*(Checked 2026-09-05 against DD-12, answered **add it with a fixed category list**. These criteria predate the answer and survive it — the feature is being built, which is what they assume. Two gaps the batch must close, both from DD-12's own carried notes.)*
- **Not covered below, and required:** the four categories are exactly *approvisionnement*, *prélèvement*, *dépense*, *erreur de caisse*, and a movement's category is totallable — the whole reason a fixed list beat free text.
- ~~**Still unanswered, and 5.5 must say plainly which it chose:** whether a cash movement needs a step-up PIN, as refunds do since 4.4c.~~ **ANSWERED 2026-09-05 — PIN on money leaving only** (see the direction above). Criteria: a *prélèvement*, a *dépense* and a negative *erreur de caisse* are each refused without a valid step-up token; an *approvisionnement* succeeds without one; and the token is bound to the movement's amount, as `consumeStepUpToken` already requires.
- Targeted test: a cash-in and a cash-out each adjust `expectedCash` in the right direction.
- Targeted test: cash movements appear in the X and Z reports and in the sealed period aggregation (Batch 3.2).
- **Fiscal verification:** each movement writes a journal event; the chain still verifies.
- Manual: a real drawer count reconciles to zero variance after recording a known drop.
- Migration applied cleanly on a copy of the production database.
- `bun test src` — PASS.

### Batch 5.5 — Status Record

**Status:** `COMPLETED` · **Completed:** 2026-09-05

**Changes:** A `CashMovement` model with the four categories DD-12 fixed, hung off the **Shift** the money moved through, and a **signed** amount — positive into the drawer, negative out — rather than a magnitude plus a direction flag, because `ERREUR_DE_CAISSE` genuinely goes both ways and a flag would let a row contradict its own category. `recordCashMovement` resolves the till **inside** the transaction (the C-15 lesson, at a fifth site), refuses a sign the category cannot have, refuses zero, refuses when no caisse is open, writes an audit row and a **`MOUVEMENT_CAISSE`** journal event, and deliberately does **not** touch the perpetual `GrandTotal` — a movement is not a sale. `expectedCash` becomes `openingFloat + grossCash − cashRefunds + net movements`, which is the finding in one line. `aggregateCashMovements` is one pure helper in `aggregate.ts`, used by both period scopes so a Z report and the close containing it cannot do their own arithmetic (Batch 3.2's rule); a shift books the movements it made, a date range books the movements made inside it (Batch 5.3's rule). Three columns — `cashInTotal`, `cashOutTotal`, `cashMovementsCount` — on `ZReport`, `MonthlyClose` and `AnnualClose`, and in the `CLOTURE_Z` payload. The PIN gate is the **direction of the money, not the category name**: `requiresStepUp(amount) = amount < 0`, so a negative *erreur de caisse* is gated and a positive one is not. `POST /api/cash-movements` refuses an impossible sign and a missing caisse **before** consuming the step-up token. The operator records one from the shift screen; the "Espèces attendues" hint, which said *« Fond + ventes espèces »*, is now true again.

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260905150626_cash_movements/`, `src/lib/services/cash-movement.ts` (new), `src/lib/services/aggregate.ts`, `src/lib/services/reports.ts`, `src/lib/services/fiscal.ts`, `src/lib/fiscal.ts`, `src/lib/approvals.ts`, `src/lib/validation.ts`, `src/app/api/cash-movements/route.ts` (new), `src/app/api/auth/step-up/route.ts`, `src/components/pos/step-up-pin-dialog.tsx`, `src/features/shifts/cash-movement-dialog.tsx` (new), `src/features/shifts/shifts-view.tsx`, `src/types/api.ts`, `src/lib/services/cash-movement.test.ts` (new), `src/lib/services/close-timing.test.ts`

**Tests:** `bun test src --timeout 30000` — **655 pass, 0 fail** (baseline 629 + 26 new). `bun run typecheck`, `bun run lint`, `bun run build` — all PASS. **Twenty one-property reverts**, each applied alone and restored from a copy taken first. **Twenty-one of the 26 tests fail under at least one revert; four do not, and they are named** — see note 5. One revert (R4, first attempt) failed nothing because the revert was a no-op, not because the test was weak; it was rewritten to actually remove the refusal and then failed. **Migration rehearsed** on a copy of production with a full fiscal fingerprint diff, after an out-of-band snapshot. Manual walkthrough through the real HTTP API on that migrated copy.

**Commit:** `51af203` + this plan/record update.

**Notes:**

**(1) The migration rebuilds `ZReport`, and that is Prisma's doing, not a choice.** Adding three `NOT NULL DEFAULT 0` columns to `ZReport`, `MonthlyClose` and `AnnualClose` makes Prisma emit SQLite's RedefineTables dance — create, copy, drop, rename — on all three, plus `CREATE TABLE CashMovement`, its three indexes, and one cheap `ALTER TABLE FiscalEvent ADD COLUMN cashMovementId`. Hand-writing `ADD COLUMN` instead was considered and **declined**: Batch 3.6's `zreport_refund_totals` rebuilt this same table, applied to production cleanly, and both sealed rows survived — deviating from the pattern the tool has already proved here is the riskier move, and the fingerprint diff is what makes it safe rather than the SQL's shape.

**(2) The rehearsal, and what it proved.** Snapshot `db-snapshots/custom.db.pre-5.5.2026-09-05T14-26-27Z` (696 320 bytes, `7839db18…`) taken outside the repo tree first. The migration was applied to a copy and the fiscal fingerprint diffed before and after: **both sealed Z reports came through the table rebuild with every existing column byte-identical** and the three new ones at 0; the fiscal event chain (sequence, type, timestamp, `dataJson`, `previousHash`, `hash`), the counters, `GrandTotal`, all three shifts, all 20 orders, the payment and refund sums, and the 78-product catalogue with its VAT split were unchanged; `integrity_check` and `foreign_key_check` both clean. The only differences were the new table, its three indexes, the intended columns, and the `_prisma_migrations` row. **Nothing is applied to production — the command is in *Open Threads → B*.**

**(3) The payload shape changed for a SECOND time, and Batch 3.6b's tripwire caught it.** `PeriodAgg` is spread into the sealed close's `dataJson`, so the three new fields change the hashed payload — and `close-timing.test.ts`'s *"changes the hashed payload's shape"* failed on the first full run, exactly as 3.6b designed it to. Safe for the same reason and no other: re-verified read-only the same day, `MonthlyClose` and `AnnualClose` still hold **zero rows**. The key list was extended deliberately and the note above it amended to say this has now happened twice. **The `CLOTURE_M` / `CLOTURE_A` EVENT payloads are still untouched** (*Open Threads → D*): those are a fixed five-field object, and only the close row's own `dataJson` moved.

**(4) A defect the walkthrough found, in this batch's own code, and fixed here.** A negative `APPROVISIONNEMENT` is negative, so the direction rule demanded a PIN — and the service then refused it whatever the PIN said. Through the real API that came back as *« Confirmation par code PIN requise »* for a request whose actual problem was the sign, and a caller would have spent a single-use token learning that. **That is L-41's shape at the site whose open-till check was already ordered to avoid it.** `categorySignRefusal()` is now a pure exported check the route runs *before* `consumeStepUpToken`, with the service keeping its own copy as the guarantee; a test pins both the messages and the ordering. Found by driving the API, not by reading the code.

**(5) Which of the 26 tests do NOT fail under any revert — said plainly.** Twenty-one do. Of the four that do not: **two are deliberate controls that must not fail** — *"leaves a shift with no movements exactly where it was"* (arithmetic that added something to an empty set would satisfy every direction test but not this) and *"returns zeros for an empty period rather than nothing"*. **Two are regression assertions**: *"accepts the four categories the operator chose, and only those"* pins a constant, so the only revert would be changing the constant the test exists to pin; and *"does not count sales as movements, nor movements as sales"* pins a separation that was never joined in the first place. The over-gating and over-refusing controls **do** fail under their opposite reverts (R5 and R6), which is why they are counted among the twenty-one.

**(6) An inherited cost, stated so it can be revisited deliberately.** Batch 4.4c put `/api/auth/approve` and `/api/auth/step-up` on **one shared five-attempt counter**, by operator decision. A cash-out PIN spends from that same budget, so five fumbled payout PINs lock **refunds and discounts** for fifteen minutes. A separate counter for cash movements was considered and **not built** — that would reopen 4.4c's decision, which is not this batch's to reopen. On a till where every payment ever taken is cash, movements will be routine, so this is worth an operator decision if it ever bites.

**(7) Walkthrough, on production data, through the real HTTP API.** Scratch copy of production with the migration applied, `DATABASE_URL` and `HIBAPOS_DATA_DIR` both overridden, marker `SCRATCH-COPY-5.5` proved through the pre-auth `GET /api/auth/profiles` before the first write. A **+50,00 € approvisionnement** was accepted with **no PIN**; a **−200,00 € dépense without one was refused 403**; the same movement **with** a step-up token returned **201**. The X report went `expectedCash` **21 580 → 6 580** (= 21 580 + 5 000 − 20 000), with `cashByCategory` totalling `{APPROVISIONNEMENT: 5000, DEPENSE: −20000}`; `/api/fiscal/verify` stayed `ok` across four events; the movement list showed the PIN approver on the outgoing row and none on the incoming one. Closing the till counting exactly 6 580 sealed **Z#3 with `cashVariance: 0`** and `cashInTotal` / `cashOutTotal` / `cashMovementsCount` of 5 000 / 20 000 / 2, all three also in the `CLOTURE_Z` payload — which is M-05's whole point: before this batch that drawer would have shown a 150,00 € phantom shortfall. Server killed with `taskkill //PID <pid> //T //F`. Production `db/custom.db` unchanged at `7839db18…`, 696 320 bytes, mtime 2026-09-04 16:41:52, no `-wal`/`-shm` beside it.

**(8) The UI could not be walked, for the reason recorded as L-47.** The browser pane still renders the login screen with a valid session, so `cash-movement-dialog.tsx` was exercised only by `tsc`, `eslint` and `next build`. Everything it depends on **was** exercised through the API, and the client imports the server's own `requiresStepUp` rather than reimplementing the rule — a client that guessed differently would either prompt for nothing or be refused after the operator had typed. Still: the dialog itself is **`IMPLEMENTED — TESTING REQUIRED` in substance**, and Batch 5.7 or whoever clears L-47 should open it once.

**(9) One test-suite failure observed and attributed, not "fixed".** The first post-batch full run reported 654 pass / 1 fail — `shift-race.test.ts`'s ten-sales race, which is **L-43**, whose origin was established earlier in this same session (the eleventh promise is never inspected, so a Z close that loses the contention leaves no row for the next line to read). Two immediate re-runs were clean at **655/655**. This batch touches neither the checkout nor the Z race.

**(10) APPENDED 2026-09-05, after the fact: the operator applied the migration, and the rehearsal was exact.** `20260905150626_cash_movements` was applied to production at **14:41:21**. A fiscal fingerprint of the live database taken afterwards was diffed against the one taken from the rehearsal copy: **zero differing lines**. Both sealed Z reports came through the `ZReport` table rebuild with every existing column unchanged and the three new ones at 0; the two `VENTE` events kept their hashes; the counters stayed `20/3/2/2`; 20 orders, 3 shifts, 0 refunds, 0 closes and 78 products all unchanged; `integrity_check` `ok` and `foreign_key_check` empty; `CashMovement` present and empty. **Production moved `7839db18…` / 696 320 bytes → `7287640e5fb17370c537e2e9216936aeb409940b245e7cd1ed1ec82948bad1fa` / 704 512 bytes, mtime 2026-09-05 15:41** — the first change since the operator's PIN change of 2026-09-04, and the plan's *Open Threads → G* row was updated to match. **The point worth keeping**: the fingerprint diff is not ceremony. It was taken on a copy before the operator touched anything, and it predicted the live outcome byte for byte — which is the evidence that makes "the sealed rows survived" a measurement rather than a hope.

---

## Batch 5.6 — Order cancellation and pre-payment void

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1158–1216 (commit `7658fbb`, plus this batch's status record) on 2026-09-05. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**No migration** — measured 2026-09-05 with `prisma migrate diff` against the live database, before the batch was started: removing `PENDING` and `CANCELLED` from `enum OrderStatus` emits *"This is an empty migration"*, because SQLite stores enums as TEXT. Exactly what Batch 4.4b found for the `CASHIER` removal. **Nothing waits on the operator for this batch.**

**Status:** `NOT STARTED` — unblocked by DD-13, answered 2026-09-05

### M-08 — Order cancellation is not implemented

**Status:** `NOT STARTED` · Severity: MEDIUM · Category: incomplete functionality

**Problem.** `OrderStatus.CANCELLED` and `d9b1b08` are read and filtered but **never written by any code path**. Orders are created directly as `COMPLETED`. `shifts/summary` exposes a permanently-zero `cancelledOrders` counter.

**Evidence.** `grep CANCELLED src/` → zero writers. `src/app/api/shifts/summary/route.ts:28`.

**Impact.** There is no pre-payment void. A mistaken order can only be corrected by taking payment and then refunding it — which produces a sale and a correction in the fiscal record where the truth is that no sale occurred.

**Remediation direction.** Decide whether HibaPOS should support a pre-payment order state and a void. If not, remove the dead enum values and the zero counter rather than leaving them to imply a feature. See DD-13. **Answered 2026-09-05 — remove them.** Note the count: **`PENDING` and `CANCELLED` are both dead**, and this finding's Problem line above carries a corrupted paste (a commit sha where an enum value belongs). Measure whether the removal needs a migration with `prisma migrate diff`, as Batch 4.4b did for `CASHIER`, rather than assuming.

### Batch 5.6 — Validation Required

*(Reconciled 2026-09-05 against DD-13, which was answered **remove both dead values**. The two criteria below were written as a fork while the decision was open; the first branch is now void. Per *Methods*, struck rather than deleted.)*
- ~~If implemented: targeted test that a void writes an `ANNULATION` event, does not increment the grand total, and does not appear in sales totals.~~ — **VOID: no pre-payment state is being built.**
- **If removed** *(this is the live branch)*: confirm no consumer breaks and the UI no longer implies the state exists. **Both** `PENDING` and `CANCELLED` go, plus the permanently-zero counter.
- **Not yet written, and this batch must add them:** that `prisma migrate diff` was run to measure whether the enum removal emits a migration at all (Batch 4.4b's method for the `CASHIER` removal), and that all 20 production orders being `COMPLETED` is re-confirmed read-only before anything is removed.
- `bun test src` — PASS. `bun run typecheck` — PASS.

### Batch 5.6 — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-05

**Changes.** `enum OrderStatus` goes from four values to the two anything ever wrote — `COMPLETED` (checkout.ts:155) and `REFUNDED` (refund.ts:156) — with DD-13's reasoning recorded above the enum, including where the state comes back if order-before-payment ever arrives. Six code surfaces follow it. (1) `orders/route.ts` — `STATUS_ENUM` narrows to the enum's two values, and its 400 message is now **built from `STATUS_ENUM.options`** rather than a second hand-maintained list of names; this is a **deliberate API-contract narrowing**, `?status=CANCELLED` answering 400 where it used to answer an empty list. (2) `shifts/summary/route.ts` — `cancelledOrders`, the permanently-zero counter, is deleted; a comment says why a zero was worse than an absence. (3) and (4) the two TypeScript copies of the union, in `refund.ts` and `types/api.ts`. (5) and (6) both `statusBadge` switches: the `case "CANCELLED"` arm goes, and — the half that mattered — the `default` arm stopped reading **« En attente »**, which is how these screens implied a pre-payment state. It now shows the status that actually arrived. `ORDER_STATUS_LABELS` in `order-labels.ts` is a new one-home map beside the existing `ORDER_TYPE_LABELS`, keyed by `OrderDto["status"]`, so the two switches cannot drift apart again — they already had, `orders-view.tsx`'s own `StatusFilter` having offered only COMPLETED / REFUNDED while its badge still handled a CANCELLED nothing could produce. **No migration**, measured not assumed.

**Files.** `prisma/schema.prisma`; `src/app/api/orders/route.ts`; `src/app/api/shifts/summary/route.ts`; `src/lib/services/refund.ts`; `src/types/api.ts`; `src/lib/order-labels.ts`; `src/features/orders/orders-view.tsx`; `src/features/dashboard/dashboard-view.tsx`; **new** `src/lib/order-status.test.ts`. **Deliberately not touched:** `src/lib/services/checkout.ts` and `src/app/api/orders/[id]/print/route.ts` — see note 1.

**Tests.** `bun test src --timeout 30000` — **667 pass, 0 fail** (baseline 655 + 12 new). `bun run typecheck`, `bun run lint`, `bun run build` — all PASS. **Fifteen one-property reverts**, each applied alone and restored from a copy taken first; **11 of the 12 new tests fail under at least one revert, and the one that does not is named** — see note 4. Three of the fifteen revert the *deletion* direction (the trap), and two further checks verify claims made in code comments with `tsc` rather than by assertion. Walkthrough through the real HTTP API on a scratch copy of production, marker `SCRATCH-COPY-5.6` proved through the pre-auth `GET /api/auth/profiles` before the first write — see note 3.

**Commit:** `1bb8a48` + this plan/record update.

**Notes.**

**(1) The trap was a name collision, and it is now written down as an assertion in both directions.** `PENDING` names two unrelated things: `OrderStatus.PENDING`, removed here, and `Receipt.printStatus`, a plain `String @default("PENDING")` written for every receipt at `checkout.ts:238` and moved to PRINTED / FAILED by the print route. `grep PENDING` spans both — **all 20 production receipts carry `printStatus = 'PENDING'`**, confirmed read-only — so a grep-driven removal breaks receipt creation on every sale. `order-status.test.ts` therefore holds an allowlist naming the receipt sites: an order-status `PENDING` reappearing anywhere fails, **and so does the receipt's `PENDING` disappearing**. Reverts R10, R11 and R12 exercise that second direction, which is the one a future session is actually at risk of. `CANCELLED` has no twin and is asserted flatly.

**(2) No migration, measured three ways rather than assumed.** `prisma migrate diff --from-url <scratch copy> --to-schema-datamodel --script` printed `-- This is an empty migration.` **before** the schema edit (the control) and again after it; `--from-migrations prisma/migrations` — what `migrate dev` would emit — printed the same. Read-only inspection of the live file confirms why: `Order.status` is `TEXT NOT NULL DEFAULT 'COMPLETED'` with **no CHECK constraint**, exactly as Batch 4.4b found for `CASHIER`. Production still stands at **7 applied migrations, none pending, and nothing waits on the operator.**

**(3) The walkthrough, and what it proved that reading could not.** Scratch copy of production on port 3066, both `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden, marker read back from the pre-auth profiles endpoint **before** the first write; the prep script's path guard was proved by pointing it at `db/custom.db` and watching it refuse. `?status=COMPLETED` → **200, 20 rows**; `?status=REFUNDED` → 200, 0 rows; `?status=CANCELLED` and `?status=PENDING` → **400**, *« Statut invalide : … (valeurs acceptées : COMPLETED, REFUNDED) »* — the derived message, live. `GET /api/shifts/summary` returned 15 keys with **no `cancelledOrders`**. Then the two live values were exercised end to end: a real sale (order #21) wrote `status: "COMPLETED"` **and a receipt with `printStatus: "PENDING"`** — the trap disproved at runtime, not merely in text — the print route answered its DISABLED path, a refund wrote `status: "REFUNDED"`, `?status=REFUNDED` then found it, and `refundedOrders` moved 0 → 1, proving the counter beside the deleted one still works. `/api/fiscal/verify` stayed `ok` across four events. Server killed with `taskkill //PID 4736 //T //F`; `bunx prisma generate` succeeds afterwards. **Production `db/custom.db` unchanged throughout at `7287640e…`, 704 512 bytes, mtime 2026-09-05 15:41:21**, no `-wal`/`-shm` beside it, `db/backups` still 9 entries, and no `db/fiscal-archives/` created in the real tree.

**(4) Which of the 12 new tests does NOT fail under any revert — said plainly.** Eleven do. The one that does not is *"finds the source tree"*, a **deliberate control**: it exists so that a source walk which silently returned nothing cannot make the three tree-sweeping assertions pass vacuously. It cannot fail under any revert of this batch's properties and is **not counted as coverage**. Of the eleven, none is a bare regression assertion — every one was reached by a revert that put a removed value back, widened a narrowed list, or deleted something the batch deliberately kept.

**(5) Three assertions read source text, and this is what that does and does not prove.** The query filter's zod enum and both `statusBadge` switches are module-private, and driving the route in a unit test needs a request scope (`withAuth` → `getSession()` → `cookies()` throws outside one) that stays with Batch 6.1 — the same boundary `api-authorization.test.ts` draws for the role matrix. Those three catch a value being reintroduced, a filter being widened and a fallback arm naming a state again; they do **not** prove the route returns 400, which is why note 3 drove it over HTTP instead. The other nine execute what they assert.

**(6) Two claims written into code comments were verified with `tsc`, not asserted.** The filter's comment says keeping the four-value list would need a cast past the generated type: widening it produces `TS2322 … Type '"CANCELLED"' is not assignable to type 'OrderStatus | EnumOrderStatusFilter<"Order">'` — so the old shape really would have reopened the 500 that check exists to prevent. `ORDER_STATUS_LABELS`'s comment says a *missing* label is a type error rather than a test failure: deleting one produces `TS2741 … Property 'REFUNDED' is missing`. Both were run and both restored.

**(7) The API contract narrowed on purpose, and the decision is recorded rather than implied.** `?status=CANCELLED` used to return `200 []`; it now returns 400. The alternative — keep accepting the dead names and quietly return nothing — was rejected for two reasons: it needs the cast in note 6, and it keeps making the claim the enum was making. Nothing in the product is affected, and that was measured rather than hoped: `StatusFilter` at `orders-view.tsx:82` has only ever offered `ALL | COMPLETED | REFUNDED`, and it is the sole caller that sends the parameter at all. An external caller hand-writing the URL is the only thing that can notice.

**(8) One defect found while measuring, recorded and NOT fixed (safety rule 10).** `/api/shifts/summary` computes `expectedCash` without Batch 5.5's cash-movement term, so it and `GET /api/reports/x` disagree for the same shift as soon as one movement exists — measured on the scratch copy: identical at 21 580 with no movements, then **21 580 against 26 580** after a +50,00 € approvisionnement. This is M-05's phantom shortfall surviving at the one aggregation caller 5.5 did not update, and M-14's "fourth aggregation semantic" at the endpoint M-14 was about. Latent — that endpoint still has **no client caller** — and outside this batch, which touches the counter beside it and not the arithmetic. Recorded as **L-48**.

**(9) `csv-export.ts` holds a fourth copy of the two French labels and was left alone, deliberately.** Its status line is already honest (`o.status === "COMPLETED" ? … : o.status`, falling back to the raw value rather than naming a state), so the batch's criterion is met there. It also duplicates `PAYMENT_LABELS` and `ORDER_TYPE_LABELS` in the same function; folding in only the status pair would be arbitrary, and folding in all three is a cleanup this batch was not asked for (safety rule 1). `ORDER_STATUS_LABELS`'s comment claims one home **for the two badge switches**, which is what it is.

---

## Batch 5.7a — Remove the dead add-on surface and `Customer.postalCode`

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1222–1291 (commit `8762e27`, plus this batch's status record) on 2026-09-05. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**Migration — the stage's second and last, and the only part of 5.7 that waits on the operator.** Measured 2026-09-05 with `prisma migrate diff` against the live database: DD-15's removals emit real DDL — `DROP TABLE "AddOn"`, `DROP TABLE "ProductAddon"`, and a full **rebuild of `Customer`** (SQLite's create-copy-drop-rename) to drop `postalCode`, preserving the other nine columns and all three named indexes. **Re-measure rather than trusting this**, and note what makes the rebuild non-trivial: `Customer` holds **2 rows**, and **2 orders carry a `customerId`** pointing at one of them, so a rebuild that loses a row orphans a sale. It needs the fingerprint diff of *Methods*, not a glance.

**Status:** `NOT STARTED` — unblocked by DD-15, answered 2026-09-05

| ID | Status | Problem | Location | Direction |
|---|---|---|---|---|
| **M-09** | `NOT STARTED` | `ProductAddon` has **zero writers anywhere**. Product-specific add-ons can never be created; `computeLinePricing`'s handling of them is unreachable. | `schema.prisma:119-127`; `pricing.ts:25,134-146` | Either build the write path or remove the dead surface — DD-15. ~~Flagged in section I as possible lost functionality.~~ **Answered 2026-09-05 — remove it, and the section-I framing is wrong**: nothing is lost. `CategoryAddOn` (21 rows, full editor) superseded this design; `AddOn` has 0 rows and the `ProductAddon` join has no writer anywhere. Removing `AddOn` also touches `media-usage.ts`, which reads `AddOn.image` in two places. |
| **M-10** | `NOT STARTED` | `Customer.postalCode` exists in the schema and migration with **zero references in `src/`**, despite the schema comment calling it a French delivery requirement. | `schema.prisma:214` | Either wire it into `customerSchema` and the delivery form, or remove it — DD-15. **Answered 2026-09-05 — remove it.** 0 of 2 customers have one, and the delivery rule at `orders/route.ts:261-274` requires name + phone + address and never asks for a postcode. |

### The trap in this batch, stated before the work

**`addon` names two things, and only one of them is dying.** Measured 2026-09-05:

| | rows | writer | reached by |
|---|---|---|---|
| **`AddOn`** + **`ProductAddon`** | **0** and **0** | `AddOn` has a full editor; **`ProductAddon` has no writer anywhere** | dying |
| **`CategoryAddOn`** | **21** | the editor inside `categories-view.tsx` | **must keep working** |

Both flow through **one** `addonMap` (`pricing.ts:175-183`), **one** `availableAddonIds` set, **one** `addons` request field (`orders/route.ts:28`, sent by `payment-dialog.tsx:169`) and **one** DTO field — `addOns: [...categoryAddOns, ...productAddOns]` (`products/route.ts:156`, `products/[id]/route.ts:153`). `media-usage.ts:51-52` lists `CategoryAddOn` and `AddOn` on consecutive lines. **A removal driven by `grep addon` breaks the 21 live category add-ons.** Batch 5.6's method applies: write the collision into the test as an allowlist so it fails in **both** directions.

### One thing M-09's row does not say, found by measuring

**`AddOn` is not a dead model — it is a navigable screen that lies to the operator.** `« Suppléments »` is a 446-line CRUD view (`features/catalog/addons-view.tsx`), wired at `nav-config.ts:47` for MANAGER and SUPER_ADMIN, `app-store.ts:15,39` and `app-shell.tsx:37-38,175`. An operator can create a supplement there, it saves, and **it can never appear on any product**, because attaching one needs `ProductAddon` and nothing writes that table. That is **C-21's shape** (Batch 5.2: the table plan looked connected because a screen existed) and it takes C-21's remedy — withdraw the screen — rather than only dropping the model.

### Batch 5.7a — Validation Required

*(Derived 2026-09-05 at the split. The parent's single DD-15 bullet is kept and **widened**: it named `media-usage.ts` but neither the navigable screen nor the `CategoryAddOn` collision.)*
- **Inherited from 5.7, kept:** a destructive schema change with zero rows to lose, so it needs the migration rehearsal and a handed-over command; and `media-usage.ts` reads `AddOn.image` in two places, so Batch 4.6's media scan must be re-verified after the model goes.
- **Added — the collision, asserted in both directions:** no `AddOn` / `ProductAddon` reference survives outside a comment, **and** `CategoryAddOn`'s 21 rows still reach a product. Assert that `ProductDto.addOns` still carries the category add-ons, that `computeLinePricing` still prices one, and that `media-usage.ts` still scans `CategoryAddOn.image` — a test that only checks the removal would be satisfied by the mistake.
- **Added — the screen:** `« Suppléments »` is gone from the navigation, the `AppView` union, the shell's render arms and the lazy-import table, and no route file for it remains. Nothing else in the catalogue group moves.
- **Added — read-only first, before anything is removed:** re-confirm `AddOn` = 0 rows, `ProductAddon` = 0 rows, `CategoryAddOn` = 21, `Customer` = 2 rows with 0 postcodes, and that 2 orders reference a customer.
- **Added — the rebuild:** after the rehearsal, **both `Customer` rows survive with all nine remaining columns**, all three named indexes are recreated, and the 2 orders still resolve their customer. This is what the fingerprint diff is for.
- **Regression (from 5.7's single bullet, the half that belongs here):** `pricing.test.ts` and the cart-store tests still pass, and this batch changes **no pricing figure at all** — a removal that moves a number has removed the wrong thing.
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS. `bun run build` — PASS.

### Batch 5.7a — Status Record

**Status:** `COMPLETED` (code) — **the migration is PREPARED AND REHEARSED, NOT APPLIED**; see *Open Threads → B*.
**Completed:** 2026-09-05

**Changes.** DD-15's two removals. **M-09:** `model AddOn` and the `ProductAddon` join leave the schema, and with them the whole surface that could only ever have been reached through them — `GET/POST /api/catalog/addons`, `PUT/DELETE /api/catalog/addons/[id]`, the 446-line **« Suppléments » screen** and its nav row, `AppView` value, lazy import and render arm, `addOnSchema` / `AddOnInput`, the `SEED_ADDONS` block in **both** seed files, and the `productAddons` include in both product serializers, the checkout, `pricing.ts` and `scripts/inspect-product.ts`. **M-10:** `Customer.postalCode`, which had zero references in `src/` — `customerSchema` and `CustomerDto` never carried it, so nothing in the application changed at all. **What did NOT change is the point of the batch**: `CategoryAddOn`, 21 live rows, keeps its editor, its schema, its media scan and its path into the POS. `ProductDto.addOns` was `[...categoryAddOns, ...productAddOns]` and is now `categoryAddOns` — the same value, because the second half was always `[]`. `pricing.ts`'s `availableAddonIds` was the union of two sets and is now one; the `addonMap`'s second loop is gone. Both the `addons` request field and the DTO field stay: they were never product-specific.

**Files.** `prisma/schema.prisma`; `prisma/migrations/20260905162220_remove_product_addons_and_postal_code/`; `prisma/seed.ts`; `scripts/inspect-product.ts`; `src/app/api/catalog/products/route.ts`; `src/app/api/catalog/products/[id]/route.ts`; `src/app/api/orders/route.ts`; `src/app/api/seed/route.ts`; `src/components/shared/app-shell.tsx`; `src/components/shared/nav-config.ts`; `src/lib/services/media-usage.ts`; `src/lib/services/pricing.ts`; `src/lib/services/seed.ts`; `src/lib/validation.ts`; `src/store/app-store.ts`; `.gitignore`; **deleted** `src/app/api/catalog/addons/route.ts`, `src/app/api/catalog/addons/[id]/route.ts`, `src/features/catalog/addons-view.tsx`; **new** `src/lib/addon-surface.test.ts`; revised tests `nav-access.test.ts`, `media-usage.test.ts`, `pricing.test.ts`.

**Tests.** `bun test src --timeout 30000` — **676 pass, 0 fail** (baseline 667, +10 new, −1 removed). `bun run typecheck`, `bun run lint`, `bun run build` — all PASS. **Sixteen one-property reverts**, each applied alone and restored from a copy taken first; **9 of the 10 new tests fail under at least one, and the one that does not is named** — note 5. **Eight of the sixteen revert the OVER-removal direction**, which is the one that matters here. **Migration rehearsed** on a copy of production after an out-of-band snapshot, with a 107-line fiscal fingerprint diffed before and after. Walkthrough through the real HTTP API on the migrated copy — note 4.

**Commit:** `982168c` + this plan/record update.

**Notes.**

**(1) The trap was `addon` meaning two things, and I fell into it anyway.** `pricing.ts` merged the dead `AddOn` and the live `CategoryAddOn` into one `addonMap`; `media-usage.ts` listed both models on consecutive lines. The batch section stated this before the work, the new test file asserts it in both directions — **and the `for (const a of categoryAddOns) add(...)` scan in `media-usage.ts` was deleted anyway**, along with the `AddOn` scan one line below it. That is C-25 reintroduced: the media library would have offered to delete the 19 images the live category add-ons use. **`eslint`'s unused-variable warning caught it** — `categoryAddOns` was fetched and never read — before any test ran. The lesson is not "write the trap down", which was done; it is that **a removal beside a survivor needs a positive assertion on the survivor**, and the cheapest one here was a compiler-adjacent check nobody wrote on purpose. Reverts R8–R13 now cover that direction deliberately.

**(2) Two tripwires from earlier batches fired, and both were amended rather than silenced.** `media-usage.test.ts`'s *"covers every image column in the Prisma schema"* (C-25, Batch 4.6) counts the schema's own `image`/`icon` columns and went **6 → 5**; `nav-access.test.ts`'s *"took exactly one row with it"* (C-21, Batch 5.2) pins the entire `ALL_VIEWS` table precisely so a removal cannot take a neighbour, and it fired when `"addons"` left. Both are edited with a dated comment saying they fired and why. Batch 5.5's rule, at two sites in one batch.

**(3) The migration, rehearsed and NOT applied.** Snapshot `../db-snapshots/custom.db.pre-5.7a.2026-09-05T16-07-54Z` (704 512 bytes, `7287640e…`) taken **outside the repo tree** first. The DDL is two `DROP TABLE`s and SQLite's create-copy-drop-rename on `Customer`, measured identically from the live database and from the migrations history. Applied to a copy, and a **107-line fiscal fingerprint** diffed before and after: the only differences are the two dropped tables, their columns, `AddOn`'s autoindex, `ProductAddon`'s foreign keys, `postalCode` leaving `Customer`'s column list and both its rows, and the `_prisma_migrations` row going 7 → 8. **Both `Customer` rows survived with all nine remaining columns**, all three named indexes were recreated, and **the 2 orders that reference a customer (#4 and #10, both "Aymen") still resolve it**. `integrity_check` ok, `foreign_key_check` empty, counters still `20/3/2/2`, both sealed Z reports and all 78 products untouched, `CategoryAddOn` still 21 rows. **Nothing is applied to production — the command is in *Open Threads → B*.**

**(4) The walkthrough, on the migrated copy, through the real HTTP API.** Port 3067, both `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden, marker `SCRATCH-COPY-5.7a` read back from the pre-auth `GET /api/auth/profiles` before the first write. `GET /api/catalog/addons?all=1` and `/api/catalog/addons/xyz` → **404**, not 403: the routes are gone, not gated. `GET /api/catalog/products/<Margarita>` → **200 with 14 `addOns`**, the category's. A real sale of **Margarita 890 + Junior 0 + Viande Hachee 150 = 1040** → **201**, and the line stored `addOnsJson` naming the add-on — so a category add-on still prices, orders and snapshots end to end. `GET /api/media` → **124 files, every one with a usage reference, 19 of them `supplement`**, which is C-25 still closed after the removal. Server killed with `taskkill //PID 9068 //T //F`. Production `db/custom.db` unchanged throughout at `7287640e…`, 704 512 bytes, mtime 2026-09-05 15:41:21, no `-wal`/`-shm`, `db/backups` still 9 entries, no `db/fiscal-archives/` in the real tree.

**(5) Which of the 10 new tests does NOT fail under any revert — said plainly.** Nine do. The one that does not is *"finds the source tree"*, a **deliberate control** against a source walk that silently returns nothing, which would make the three tree-sweeping assertions pass vacuously; it cannot fail under any revert of this batch and is **not counted as coverage**. Two others were reached only after the first fourteen reverts left them untouched, and rather than name them as gaps they were given reverts of their own: R15 removes the availability refusal (reaching *"still refuses an add-on the category does not offer"*) and R16 wires `postalCode` into `customerSchema` (reaching *"leaves the customer schema and DTO exactly as they were"*, which is otherwise a pure regression assertion against a future over-reach).

**(6) M-09's row understated the surface by a factor of six, and `tsc` found the rest.** The row named `pricing.ts` and `media-usage.ts`. The split section had already raised that to ten files by measurement; the compiler then found **two more the grep had not**: `prisma/seed.ts`, a second CLI seed that deliberately mirrors `src/lib/services/seed.ts` rather than importing it, and `scripts/inspect-product.ts`, which printed a "Product-specific add-ons" count that was always 0. **Twelve files in the end.** `bun run typecheck` covering `scripts/` since Batch 4.5 is what made the second one visible.

**(7) « Suppléments » was a screen, not a dead model, and it takes C-21's remedy.** M-09 described `ProductAddon` as having zero writers. True — and the consequence the row did not draw is that `AddOn`'s own 446-line editor, open to MANAGER and SUPER_ADMIN in the catalogue group, **accepted work it could never deliver**: a supplement created there could not be attached to any product, because attaching one needs the join with no writer. That is C-21's shape (Batch 5.2: the table plan looked connected because a screen existed), and it is why this batch withdrew the screen rather than only dropping the model.

**(8) One near-miss with the snapshot, worth a sentence because the plan does not say where they go.** *Methods* says the out-of-band snapshot lives in `db-snapshots/` "outside the repo tree". The previous four are in `../db-snapshots/`, a **sibling** of the repo; creating it at the obvious path puts a copy of the production database **inside** the working tree, untracked and — until this batch — **not in `.gitignore`**, one `git add .` from being committed. It happened here and was moved. `/db-snapshots/` is now an anchored ignore (anchored per C-26b, Batch 0.1), and the *Methods* bullet should say the path; that correction is in this batch's plan edit.

**(10) APPENDED 2026-09-05, after the fact: the operator applied the migration, and the rehearsal was exact.** `20260905162220_remove_product_addons_and_postal_code` was applied to production at **17:48:00**, the same day, from the command handed over in *Open Threads → B*. A fiscal fingerprint of the live database taken immediately afterwards was diffed against the one taken from the rehearsal copy: **zero differing lines** across all 102 facts. `AddOn` and `ProductAddon` are gone; `Customer` carries its nine remaining columns and **both rows survived**, with orders #4 and #10 still resolving "Aymen"; `CategoryAddOn` still holds 21 rows; the counters stayed `20/3/2/2`, both `VENTE` events kept their hashes, and 20 orders / 3 shifts / 2 sealed Z / 0 refunds / 78 products are all unchanged. `integrity_check` `ok`, `foreign_key_check` empty, no `-wal`/`-shm` beside the file, `db/backups` still 9 entries. **Production moved `7287640e…` → `96b48ad0789151df5ec8f346ad6b1301f6f510a02820fb00d66d7d380706cf06`, still 704 512 bytes, mtime 2026-09-05 17:48:00.** **The point, and it is the same one Batch 5.5 made:** the fingerprint diff is not ceremony. It was taken on a copy before the operator touched anything and it predicted the live outcome exactly — which is what makes "both `Customer` rows survived the rebuild" a measurement rather than a hope.

**(9) `bun run build` failing is not always the code.** After the routes were deleted, `tsc` and `next build` both failed on `.next/dev/types/validator.ts`, a **stale generated file from an old `next dev` run** that `next build` does not regenerate and `tsconfig.json` does include. Deleting `.next/dev/types/` cleared it. Worth knowing because the error names the deleted route and reads exactly like an incomplete removal.

---

## Batch 5.7b — « Offert / repas personnel », the zero-total sale

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1242–1291 (commit `2d06a87`, plus this batch's status record) on 2026-09-05. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**No DDL** — DD-14's new tender is a `PaymentMethod` enum value, and the parent's measurement of 2026-09-05 found it emits **nothing**. Re-measure and say so either way (Batch 4.4b's and 5.6's method).

**Status:** `NOT STARTED` — unblocked by DD-14, answered 2026-09-05

| ID | Status | Problem | Location | Direction |
|---|---|---|---|---|
| **M-11** | `NOT STARTED` | A 100 % discount cannot be checked out: the total becomes 0, but `payments` requires ≥1 entry with `amount ≥ 1`, and the server demands exact equality. | `orders/route.ts:42-50, 253` | Decide whether a zero-total order is legitimate — DD-14. **Answered 2026-09-05 — yes, under its own tender « Offert / repas personnel ».** Both walls (`payments.min(1)` with `amount.min(1)`, and the exact-equality check at `:251`) must come down together, and an « offert » line must not inflate revenue in the Batch 3.2 aggregation or the sealed period totals. |

### Batch 5.7b — Validation Required

*(Inherited whole from 5.7, whose list named this as **missing** and then supplied it.)*
- **M-11 (DD-14, « Offert / repas personnel »):** a zero-total sale completes under its own tender, is journalled with VAT at zero, and — the half that matters — **does not inflate revenue** in Batch 3.2's aggregation or in a sealed period total, not merely in the Z. Both walls at `orders/route.ts:51-59` and `:251` have to come down together.
- **Note for whoever runs it:** this is a fiscal change, so Stage 3's rule applies — prove the new tests fail on the old code, one property at a time and in both directions, and name the controls.
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS.

### Batch 5.7b — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-05

**Changes.** `OFFERT` joins `enum PaymentMethod` as « Offert / repas personnel », and a new pure module `src/lib/tender-policy.ts` carries the rules that make it safe — the same shape as `discount-policy.ts`, with no imports, because the route and `payment-dialog.tsx` both need it. **The revenue guarantee is structural, not conventional**: an OFFERT line must carry **0**, must be the **only** line, and requires a **zero total**. Take any one away and the tender becomes a way to book revenue nobody collected. `checkTenderComposition` also keeps the guarantee the schema gave up — a *paid* tender still needs `amount ≥ 1` — and the route runs it **before** `consumeStepUpToken`, so a malformed tender never costs the operator a PIN (L-41's shape, Batch 5.5 note 4). The checkout's `amount` relaxes from `min(1)` to `min(0)`; **the array-level `.min(1, "Au moins un paiement")` is untouched**, because an offert sale sends exactly one line. Surfaces that name a tender all follow: `types/api.ts`, `PAYMENT_LABELS`/`PAYMENT_LABELS_FULL`, the dashboard's pie colours, the Commandes badge and icon, and **`receipt.ts`, whose label was a two-branch ternary whose else-arm meant "Bon / Ticket"** — a new tender would have been sealed onto an immutable fiscal snapshot under the wrong name. `csv-export.ts`'s fourth hand-maintained copy of the labels now reads the shared table instead of gaining a fourth entry. The payment dialog gets its own path: at a total of 0 the tender grid is replaced by a single « Offert / repas personnel » button, because `addPayment` returns early when nothing remains — which is *why* M-11's 100 % discount could not be checked out — and the confirm button gains `lines.length === 0`, which at a zero total was leaving it enabled with no payment at all.

**Files.** `prisma/schema.prisma`; `src/lib/tender-policy.ts` (new); `src/app/api/orders/route.ts`; `src/lib/validation.ts`; `src/types/api.ts`; `src/lib/order-labels.ts`; `src/lib/services/receipt.ts`; `src/lib/csv-export.ts`; `src/components/pos/payment-dialog.tsx`; `src/features/dashboard/dashboard-view.tsx`; `src/features/orders/orders-view.tsx`; **new** `src/lib/services/offert-tender.test.ts`.

**Tests.** `bun test src --timeout 30000` — **696 pass, 0 fail** (baseline 676 + 20 new). `bun run typecheck`, `bun run lint`, `bun run build` — all PASS. **Sixteen one-property reverts**, each applied alone and restored from a copy taken first, **three of them inversions rather than removals** (Batch 4.5's both-directions rule) — **18 of the 20 new tests fail under at least one, and the two that do not are named** (note 5). **No migration**, measured three ways. Walkthrough through the real HTTP API on a scratch copy of production — note 4.

**Commit:** `5ccc964` + this plan/record update.

**Notes.**

**(1) The batch's own *Validation Required* overstated the change, and the narrower shape is the safer one.** It said "both walls at `orders/route.ts:51-59` and `:251` have to come down together". Only **one** did. An offert sale sends a single OFFERT line of amount 0 against a total of 0, so `.min(1, "Au moins un paiement")` is satisfied and `paidTotal !== totalAfterDiscount` is `0 !== 0` — **false**. The equality check does not come down at all; it keeps working, and it is what makes a zero-total order settleable *only* by OFFERT, because any paid line would need `amount ≥ 1` and then fail equality against 0. Per *Methods*, recorded here rather than silently done differently.

**(2) VAT at zero was already true, and that was measured rather than assumed.** DD-14 asked for the sale to be "journalled like any other sale with VAT at zero". `checkout.ts` apportions the discount across the lines with `apportion(lineTotals, totalAfterDiscount)`, so at a total of 0 every line net is 0 and `vatTotal` falls out at 0 — verified against the real `apportion` and `addToVatBreakdown` before any code was written, with a full-price control beside it. **No arithmetic was changed to achieve it.** One cosmetic consequence, observed on the walkthrough ticket: the breakdown still prints the *rate* that would have applied, as « TVA 5,5 % (HT 0,00 €)  0,00 € ». That is honest and was left alone.

**(3) `PaymentMethod` is shared with `Refund.method`, so adding a tender widened something nobody asked to widen.** OFFERT became a structurally valid *refund channel* — meaningless, because nothing was taken. `refundSchema` in `validation.ts` still lists only the three paid tenders and is the wall; a test executes the real schema in both directions. Recorded here because the next value added to this enum inherits the same hazard.

**(4) The walkthrough, and what it proved.** Scratch copy of production on port 3068, both `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden, marker `SCRATCH-COPY-5.7b` read back from the pre-auth profiles endpoint before the first write. **All four refusals fired with their own French message**: an OFFERT line carrying an amount, OFFERT mixed with cash, OFFERT against a non-zero total, and — the guarantee the relaxed schema gave up — **a 0,00 € CASH line, still refused**. Without a step-up token the 100 % discount was refused **403 « Confirmation par code PIN requise. »**, so 4.4c's gate still covers this; with the caller's own PIN the sale completed **201** as order #21: subtotal 150, discount 150, **VAT 0, total 0**. The payment row is `OFFERT`/`0`, the journal's `VENTE` payload carries `total 0`, `vatTotal 0`, `payments [{method:"OFFERT",amount:0}]`, and **the receipt prints « Offert / repas personnel »**, not "Bon / Ticket". The X report's `salesTotal`, `salesCount` and `expectedCash` were unmoved by it; `/api/fiscal/verify` stayed `ok`; the perpetual grand total gained **one order and zero money**. Server killed with `taskkill //PID 8832 //T //F`. Production `db/custom.db` unchanged throughout at `96b48ad0…`, 704 512 bytes, mtime 2026-09-05 17:48:00.

**(5) Which of the 20 new tests do NOT fail under any revert — said plainly.** Eighteen do. Of the two that do not: *"is already PIN-gated, because it is a 100 % discount"* is a **regression assertion** pinning Batch 4.4c's `discountNeedsStepUp` — this batch built no gate and needs none, and the assertion exists so that lowering 4.4c's gate surfaces here; and *"CONTROL: the same basket at full price moves every one of those"* is a **deliberate control** — without it the five "does NOT inflate" assertions would be satisfied just as well by an aggregation that counts nothing at all. Neither is counted as coverage.

**(6) Two reverts caught nothing on the first pass, and both were real gaps rather than weak tests.** Removing `OFFERT` from `enum PaymentMethod` failed **nothing** — because reverting `schema.prisma` does not regenerate the Prisma client, so the run still had a client that knew the value. Re-run **with `prisma generate`**, the same revert fails **eight** tests. That is Batch 5.5's R4 shape (a no-op revert, not a weak test) and it is why a schema assertion was added. The second was worse: reinstating `amount: z.number().int().min(1)` — **M-11's entire finding coming back** — failed nothing, because the route declares its schema inline and module-private so there was nothing to execute. A source assertion now pins `min(0)`, the tender list and the untouched array-level wall, labelled with what a source assertion does and does not prove.

**(7) A hazard demonstrated rather than asserted.** One test builds the mixed tender the sole-tender rule forbids by going **around** the rule — the checkout service does not re-check composition, the route does — and then asks the aggregation what it booked: **1000 cents of revenue against 500 collected**, a 500-cent hole at every close with nothing on the ticket to explain it. The rule is asserted separately. The point of the pair is that the rule's *reason* is measured, not argued.

**(8) A branch this batch made reachable has the wrong semantics, and it is recorded, not fixed.** `aggregate.ts`'s `isFullyRefunded` opens with `refundsTotal >= order.total`, and for a zero-total order that is `0 >= 0` — **true**. So the aggregation classifies a give-away as *fully refunded* and stops counting it, which also drops its items out of `itemsCount` and `topProducts`. The effect is benign — it under-counts and can never inflate anything, which is this batch's criterion — but zero-total orders could not exist before this batch, so the branch was unreachable and its meaning was never tested against this case. Fixing it means editing Batch 3.2's unified aggregation for a reporting question nobody has been asked (safety rules 10 and 11). Recorded as **L-50**, and pinned by an assertion so the day someone changes it, they do it deliberately.

**(9) `validation.ts`'s `checkoutSchema` / `paymentSchema` are a parallel copy the server does not use.** The live schema is `checkoutIntentSchema`, declared inline in `orders/route.ts`; the pair in `validation.ts` is exercised only by `validation.test.ts`. Both were kept in step by hand here so they do not diverge further, and a comment on each says which is which — but a test suite that validates a schema the server never runs is the shape T-08/T-09 (Batch 6.2) exists to remove. Recorded as **L-49**.

---

## Batch 5.7c — Pricing and validation defects

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1263–1314 (commit `9bf41e2`, plus this batch's status record) on 2026-09-05. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**No migration.** Every item is server or client arithmetic and every one is unit-testable.

**Status:** `NOT STARTED`

| ID | Status | Problem | Location | Direction |
|---|---|---|---|---|
| **M-19** | `NOT STARTED` | Order-type-specific option modifiers are stored in the generic `priceModifier` slot, so switching order type after adding an item computes the wrong client total — and the server then rejects the checkout with "Paiement incorrect". | `product-options-dialog-v2.tsx:86-98` vs `cart-store.ts:197-202` | Keep the dine-in modifier alongside the resolved one in `CartOption`. Existing tests miss this because they build `CartItem` by hand. |
| **M-12** | `NOT STARTED` | The `PERCENT` discount branch's comment says the value is *percent×100*; the code treats it as a plain percent and clamps at 100. Latent — the UI only sends `AMOUNT`. | `orders/route.ts:36, 203-205` | Correct the comment or the code. A client following the comment would apply a 100 % discount. |
| **M-15** | `NOT STARTED` | Options with negative modifiers (or an absolute category price below the base) can drive a line total negative; nothing clamps `unitPrice` at zero. | `pricing.ts:104-124, 164-165` | Clamp or reject. |
| **M-16** | `NOT STARTED` | Item quantity has a lower bound of 1 and no upper bound. | `orders/route.ts:24` | Add a sane maximum. |

**Also in this batch: L-41** *(row in *Newly Discovered Issues*)* — a sale refused for a closed shift burns the step-up PIN token, because `orders/route.ts` consumes it as its last check *before* `createOrderInTransaction` while Batch 4.7's shift assertion is the first statement *inside* the transaction. **Batch 5.5 note 4 is the pattern**: make the refusal a pure exported check the route runs *before* `consumeStepUpToken`, with the service keeping its own copy as the guarantee.

### Batch 5.7c — Validation Required

*(Inherited from 5.7. The M-19 and M-15/M-16 criteria are kept verbatim; the regression bullet is the half of 5.7's that belongs here.)*
- Targeted test for M-19 built through the options dialog's own mapping, not a hand-built `CartItem` — the existing tests miss the bug precisely because they bypass it.
- Targeted test: switching order type after adding an item produces a client total the server accepts.
- Targeted tests for M-15 (no negative line total) and M-16 (quantity bound).
- **Added for L-41:** a sale refused for a closed shift leaves the step-up token unspent, and the refusal is decided **before** the token is consumed — pin the ordering, as Batch 5.5 did for the cash-movement sign.
- Regression: `pricing.test.ts` (18 cases) and the cart-store tests still pass — several figures move here **deliberately**, so re-derive the expectations rather than adjusting them to whatever the code now returns.
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS.

### Batch 5.7c — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-05

**Changes.** Five items, no migration. **M-19:** `CartOption` gains `dineInPriceModifier`, kept alongside the resolved one, and `recalculateUnitPrice`'s DINE_IN arm reads it instead of re-using whatever the line was added under. The dialog's mapping was **extracted** from `product-options-dialog-v2.tsx` into `toCartOptions` — a `useMemo` inside a component cannot be tested, and the batch's criterion demands a test "built through the options dialog's own mapping". `CART_PERSIST_VERSION` goes **1 → 2**, as the guard's own comment instructs when the persisted shape changes. **M-15:** `computeLinePricing` now **refuses** a negative unit price, naming the product, rather than clamping — a clamp sells the item free and silently. **M-16:** `MAX_ITEM_QUANTITY = 99` in a new `order-limits.ts`, read by the route so a second literal cannot drift from it, **with a French refusal**. **M-12:** the schema comment claimed `percent×100` while the code computes a plain percent; the **comment** was corrected, because the UI has only ever sent `AMOUNT` so no caller depends on the documented reading. **L-41:** `isShiftStillOpen` is exported from `checkout.ts` and the route calls it **immediately before** `consumeStepUpToken` — the earlier lookup ran before every product was priced, one database read each, and a Z close landing in that window spent the operator's PIN on a sale the transaction was about to refuse.

**Files.** `src/store/cart-store.ts`; `src/components/pos/product-options-dialog-v2.tsx`; `src/features/orders/orders-view.tsx`; `src/lib/services/pricing.ts`; `src/lib/order-limits.ts` (new); `src/app/api/orders/route.ts`; `src/lib/services/checkout.ts`; **new** `src/store/cart-store-repricing.test.ts`, `src/lib/services/checkout-guards.test.ts`; revised tests `cart-persist-wiring.test.ts`, `cart-store-math.test.ts`, `cart-store.test.ts`.

**Tests.** `bun test src --timeout 30000` — **715 pass, 0 fail** (baseline 696 + 19 new). `bun run typecheck`, `bun run lint`, `bun run build` — all PASS. **Fifteen one-property reverts**, three of them inversions. **All 19 of the 19 new tests fail under at least one revert — there is nothing to excuse this time**, including the control, which R15 reached. Walkthrough over the real HTTP API on a scratch copy — note 3.

**Commit:** `9304d58` + this plan/record update.

**Notes.**

**(1) M-19 survived because the tests built the shape the dialog never produced.** `cart-store-math.test.ts` hand-builds a `CartItem` with `priceModifier: 0, // dine-in` — the ideal shape, in which the defect is invisible. The dialog stored the *resolved* modifier in that same field, and `recalculateUnitPrice` read it back as the dine-in one. That is why the mapping had to be extracted rather than merely fixed: a test that keeps building the fixture by hand would keep passing whatever the component does. The two old files were updated with the new field and a comment saying they are why the bug lasted; their expectations did not move, because in their fixtures the two values are equal.

**(2) M-15 refuses rather than clamps, and the choice was measured.** A negative *modifier* is normal — an absolute category price below the base produces one by design — so a blanket ban would break real configuration. Measured read-only before choosing: **zero** negative modifiers exist on this catalogue, and the three absolute-priced category choices resolve to **0, +300 and +700** against the cheapest product in their category. So the refusal breaks nothing that exists. Clamping to zero was rejected because it sells the item free **silently**: a 10 € product with a −15 € option would ring at 0,00 € and nobody would ever see it, whereas a negative line total would reduce the subtotal, corrupt the VAT apportionment and reach a sealed document.

**(3) The walkthrough, and one thing it caught.** Scratch copy on ports 3069 then 3070, both env vars overridden, marker `SCRATCH-COPY-5.7c` proved pre-auth. Quantity **1 → 201**, **99 → 201**, **100 → 400**, **1 000 000 → 400**. A negative-modifier option was created **on the copy** to reach M-15's refusal, which answered **400 « Prix négatif pour 7 Up — vérifiez les options de ce produit. »**; a control sale of quantity 2 completed **201**. **What the walkthrough caught:** the first run returned M-16's refusal as zod's own English — *"Too big: expected number to be <=99"*. That is **L-22**'s exact class, which is Batch 7.1's to clear — but a bound added here must not *enlarge* it, so the new rule carries a French message and a test pins it. Reading the code would not have shown this; driving it did. Production `db/custom.db` unchanged at `96b48ad0…`.

**(4) A third tripwire fired this session, and was amended rather than silenced.** `cart-persist-wiring.test.ts` (C-23, Batch 5.4) pins `CART_PERSIST_VERSION` and its fixture to version 1, precisely so a bump is deliberate. M-19's shape change bumped it to 2 and the test failed. The pin and the fixture moved together with a dated comment. Batch 5.7a fired two (C-25's column count, C-21's view table); this is the third.

**(5) Every one of the 19 new tests fails under some revert — including the control.** Unusually, nothing needs excusing. *"Prices correctly at the moment it is added"* was written as a control — the dialog was never wrong about the price it *showed*, only about what it *stored* — and R15, which stops `toCartOptions` resolving the modifier at all, reaches it. The property tests are the strongest of the set: *"round-trips through every order type from every starting point"* fixes what a line costs to the type it is priced **for**, never the one it was added under, and *"agrees with what the SERVER would charge"* runs the client's repriced line against `computeLinePricing` itself — M-19's visible symptom was « Paiement incorrect », the two sides disagreeing.

**(6) L-41 is narrowed, not closed, and the record says so.** Nothing outside a transaction can close this race — that is C-15's whole point, and Batch 4.7's assertion **inside** the transaction remains the guarantee, with a test asserting it is still there and still inside. What the pre-check removes is the window that was costing a PIN: from "before all the pricing work" to "one statement before the token". A test also pins that consuming the token stays the **last** thing before the write, which is DD-19's ordering and must not be disturbed by this batch. `isShiftStillOpen` fails **closed** on a missing row — a revert making it fail open is one of the fifteen.

---

## Batch 5.7d — POS resilience and error boundaries

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1284–1337 (commit `3e5ca90`, plus this batch's status record) on 2026-09-05. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**No migration.** This is the slice whose *Manual* criteria **L-47 blocks** — the browser pane renders the login screen with a valid session, so no authenticated view can be driven there. Read L-47's row before planning the validation: Batch 5.4 converted two such criteria into automated coverage over the real module rather than dropping them, and that is the precedent.

**Status:** `NOT STARTED`

| ID | Status | Problem | Location | Direction |
|---|---|---|---|---|
| **M-20** | `NOT STARTED` | The POS product grid has no error state; an API failure renders "Aucun produit dans cette catégorie". | `pos-view.tsx:43-51, 235-240` | Distinguish empty from failed. The worst false empty state in the app. |
| **M-21** | `NOT STARTED` | Any transient failure of `/api/auth/me` is caught and treated as logged-out, ejecting the cashier mid-service. | `app-store.ts:81-83` | Distinguish a network error from a 401. |
| **M-22** | `NOT STARTED` | A single global error boundary wraps the whole shell; a crash in any view blanks the till. No App Router `error.tsx`. | `app-shell.tsx:115,161`; `src/app/` | Per-view boundaries plus an `error.tsx` fallback. |

**M-21 is worse than its row above records, measured 2026-09-05.** `app-store.ts:147-155` catches **any** `/api/auth/me` failure to `next = null`, and that value reaches `operatorChanged(someone, null) → true → clearForOperatorChange()`. So a transient network failure does not merely show the login screen — **it clears the in-progress cart**, which is the exact payload Batch 5.4 (C-23) built persistence to protect. Fixing M-21 must therefore distinguish three cases, not two: a real 401, a transient failure, and a genuine sign-out.

**Also in this batch: L-42** *(row in *Newly Discovered Issues*)* — every POS shortcut still fires while a modal dialog is open, so a stray F5 during payment changes the sale being paid. Its row says plainly that fixing it is **feature design, not a coercion**: which dialogs suppress which shortcuts, and whether Escape joins the hook rather than staying Radix's alone.

### Batch 5.7d — Validation Required

*(Inherited from 5.7. All three *Manual* criteria are kept and **at risk from L-47** — say in the record how each was actually run, or converted, rather than reporting it as done.)*
- Manual: a failed catalogue fetch shows an error, not an empty category (M-20).
- Manual: a transient `/api/auth/me` failure does not log the cashier out (M-21) — **widened at the split**: it must not clear the cart either, which is the half that loses money.
- Manual: a crash in one view does not blank the topbar or the POS (M-22).
- **Added for L-42:** decide and record which dialogs suppress which shortcuts before writing the guard; a blanket "no shortcuts while any dialog is open" is a design choice, not a bug fix, and belongs in the record either way.
- `bun test src` — PASS. `bun run typecheck` — PASS. `bun run lint` — PASS.

### Batch 5.7d — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-05

**Changes.** **M-21** is the one that loses money, and its fix is a new pure module, `session-policy.ts`. `fetchUser` folded **every** failure to `next = null`, which reached `operatorChanged(someone, null) → true → clearForOperatorChange()` — so a network blip destroyed the in-progress sale. There are now **three** cases, not two: a 401/403 or an explicit `{ user: null }` is a real sign-out and still clears the cart; **anything else — no status at all, a 5xx, a proxy page — is `unreachable`, and the operator and their basket are kept.** Failing towards keeping the session is safe because the auto-lock still guards the screen and every privileged action is re-checked server-side, while a wrongly-cleared cart is unrecoverable work. **L-42:** `isModalOpen` in the shortcut hook, checked **first** and before `preventDefault`, so a suppressed keystroke reaches the dialog exactly as it would with no shortcuts registered. **M-20:** both catalogue queries expose `isError`, and the failure branch is tested **before** the empty one — which is the whole finding, since a failed fetch leaves the list empty. **M-22:** a second `ErrorBoundary` around the view area only, `key={view}` so navigation remounts it, plus an `inline` variant so a per-view boundary does not render `h-screen` and blank the till anyway; and `src/app/error.tsx`, the App Router fallback that did not exist — a React class boundary never sees what Next itself raises.

**Files.** `src/lib/session-policy.ts` (new); `src/store/app-store.ts`; `src/hooks/use-keyboard-shortcuts.ts`; `src/features/catalog/pos-view.tsx`; `src/components/shared/app-shell.tsx`; `src/components/shared/error-boundary.tsx`; `src/app/error.tsx` (new); **new** `src/lib/pos-resilience.test.ts`; revised `src/store/cart-lifecycle.test.ts`.

**Tests.** `bun test src --timeout 30000` — **737 pass, 0 fail** (baseline 715 + 22 net). `bun run typecheck`, `bun run lint`, `bun run build` — all PASS. **Twenty-one one-property reverts**, several of them inversions; **22 of the 23 new-or-rewritten tests fail under at least one, and the one that does not is named** (note 4). **All three inherited *Manual* criteria were blocked by L-47 and were converted, not dropped** — note 1.

**Commit:** `d922ce0` + this plan/record update.

**Notes.**

**(1) How this batch was validated, since every criterion it inherited was *Manual* and L-47 blocks all of them.** The browser pane still renders the login screen with a valid session, so no authenticated view can be driven there. Batch 5.4 set the precedent — convert the criterion into automated coverage over the **real module** rather than dropping it — and that is what happened, stated per criterion. *"A failed catalogue fetch shows an error, not an empty category"* became assertions that both queries expose `isError`, that the failure branch is **ordered before** the empty one, and that its text and retry differ from the empty state's. *"A transient `/api/auth/me` failure does not log the cashier out"* became the executed policy tests **plus** a test that drives the real `fetchUser` with `fetch` stubbed, which is stronger than a manual check because it runs on every suite. *"A crash in one view does not blank the topbar or the POS"* became assertions that there are two boundaries, that the inner one sits **after** `<Topbar />`, and that it renders inline rather than full-screen. **Three of those are source-order assertions and say so in the file**; what they cannot prove is that React actually catches a thrown render, which needs a component harness and belongs with Stage 6.

**(2) M-21's row understated it, and the widened criterion is the reason this batch matters.** The audit recorded "ejecting the cashier mid-service". Measured at the 5.7 split, the same `null` also clears the cart — the exact payload Batch 5.4 built persistence to protect. Losing a session is an annoyance; losing the basket mid-service is money and a queue. The *Validation Required* was widened at the split to say so, and the test named **THE DEFECT** asserts the cart survives.

**(3) A fourth tripwire fired, and this one had to be INVERTED rather than amended.** `cart-lifecycle.test.ts`'s *"clears when the session ends underneath the cashier"* (C-23, Batch 5.4) relied on *"no server in a test: the catch takes it"* — it asserted that **any** failure ends the session, which is precisely the behaviour M-21 identifies as the defect. This is the shape the plan warns about at 3.6c: *a batch's own earlier test can encode the decision you are now reversing.* So its trigger moved from "the request failed" to "the server said so" — stubbing `fetch` to return `{ user: null }`, which is what the case was always about — and **its opposite was added beside it**, asserting that a mere failure keeps both the operator and the cart. C-23's protection is not weakened: a real sign-out still clears, and a different operator still clears, both proved through `fetchUser` itself.

**(4) Which of the 23 does NOT fail under any revert — said plainly.** Twenty-two do. The one that does not is *"does NOT clear the cart on an ordinary refresh of the same session"*, a **regression assertion** pinning Batch 5.4's identity rule (`null → someone` and `someone → the same someone` are not operator changes). It cannot fail under a revert of **this** batch's properties, because the batch delegates to `operatorChanged` rather than reimplementing it — which is the point of injecting it. Two other assertions were **strengthened** rather than excused when the first pass left them unreached: *"registers no Escape shortcut anywhere"* was a comment pin and became a sweep of every file under `src/`, and reverts R16–R21 were added to reach the M-21 controls, the modal detector and the M-20 text.

**(5) The L-42 decision, recorded because its row says the fix is feature design rather than a coercion.** **Every shortcut is suppressed while any modal is open.** A per-dialog allow-list was rejected as the more dangerous default: a shortcut wrongly suppressed costs one mouse click, while a shortcut wrongly fired changes the sale being paid and the operator's next keystroke is the one that takes the money. **Escape stays Radix's alone** and is deliberately not routed through the hook — Radix already closes the top-most dialog and handles stacking, and a second `window` handler would double-fire or have to reimplement that ordering. A test sweeps every source file to assert no shortcut registers `key: "Escape"`.

**(6) The per-view boundary had to gain a variant, or the fix would have been the symptom.** `ErrorBoundary` rendered `h-screen`. Dropping it around the view area unchanged would have made a crashed view fill the display exactly as before — M-22's own complaint. `variant="inline"` fills its container instead, so the Topbar and the navigation survive; the shell-level boundary keeps `screen`, because at that point there is nothing left to keep. A revert removing the variant is one of the twenty-one.

**(7) No browser walkthrough, and no claim of one.** L-47 stands. The four changes are a store policy, a hook guard, a query branch and a boundary; the first is executed in tests through the real `fetchUser`, the second through the real matcher, and the last two are asserted on source with that limitation stated in the file. **Production `db/custom.db` was not opened by this batch at all** and is unchanged at `96b48ad0…`, 704 512 bytes, mtime 2026-09-05 17:48:00.

---

## Batch 6.1 — Tests for the things that can lose money

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1320–1371 (commit `b3000f0`, plus this batch's status record) on 2026-09-05. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**Status:** `NOT STARTED`

| ID | Status | Gap | Why it matters |
|---|---|---|---|
| **T-01** | `NOT STARTED` | `createBackup` and `restoreBackup` have **zero tests**. The suite proves AES-GCM round-trips a buffer; nothing proves a backup of a real database is produced or restorable. | The most destructive function in the codebase. Directly where C-05 lives. Required by Batch 2.1. *Correction 2026-09-04: T-01 was written in Batch 2.1 (`backup-restore.test.ts`) and extended in 2.2 — record → Batch 2.1. Status left as recorded for Batch 6.1 to close.* |
| **T-02** | `NOT STARTED` | Discount-authorization *enforcement* is untested. The token primitive has 7 tests in isolation; nothing exercises the route branch deciding whether a discount needs one. | A regression accepting an unapproved discount passes 136/136. The classic POS fraud vector. *Correction 2026-09-05: **partly written, and the gap has moved.** Batch 4.4c replaced the manager token with a step-up on the caller's own PIN (DD-19) and `discount-policy.ts` now holds the trigger **both sides consult**, tested directly; `step-up.test.ts`, `approvals-consumed.test.ts` and `approval-lockout.test.ts` cover the primitive, single use and the lockout; Batch 5.7b asserts the route's ORDERING (the tender check before the token) and 5.7c that the token stays last before the write. **Still open for 6.1:** nothing drives `POST /api/orders` and asserts that a discount above the threshold with no token is refused **403** — the route branch itself, over HTTP. That needs the request harness named in the stage correction above.* |
| **T-03** | `NOT STARTED` | RBAC has zero tests across 59 routes. Nothing asserts a CASHIER cannot close a shift, reprint, or restore a backup. | Required by Batch 4.4. *Correction 2026-09-05: **written in Batch 4.4** (`src/lib/api-authorization.test.ts`, 7 cases) and extended in 4.4b, which also removed the CASHIER role the row names — so its example is now unreachable by construction. The file walks every route module, checks the gate each declares against a pinned table, and lists the routes deliberately left unauthenticated. **What it proves and does not:** it asserts the gate a route DECLARES, not that the handler honours it — the same limitation the file states in its own header. Status left as recorded for 6.1 to close, as T-01 and T-04 are.* |
| **T-04** | `NOT STARTED` | The legacy-PIN fallback that broke login in commit `5ef7dc4` is untested. `auth.test.ts` only feeds `verifyPin` a freshly-generated strong hash; no test supplies a legacy N=2^14 hash, and the re-hash-on-login upgrade is untested. | **Required before Batch 4.2.** A regression re-locks every pre-hardening account out of the till. *Correction 2026-09-04: T-04 was written in Batch 4.2 as its prerequisite (`src/lib/auth-legacy-pin.test.ts`, 6 cases) and proved to bite — deleting the legacy fallback fails 2 of the 6 — record → Batch 4.2. Status left as recorded for Batch 6.1 to close, as for T-01.* |
| **T-05** | `NOT STARTED` | Order-level money assembly is untested — subtotal → discount → VAT breakdown → payment reconciliation. `orders/route.ts:290` `addToVatBreakdown` on `netLineTotal` is never asserted. | Where C-11, C-12 and M-13 live. *Correction 2026-09-04: Batch 4.7 moved the checkout transaction body into `src/lib/services/checkout.ts`, so T-05 and T-06 can be written against `createOrderInTransaction` directly — neither needs the HTTP request harness that `api-authorization.test.ts` says is deferred to 6.1.* |
| **T-06** | `NOT STARTED` | No transaction-rollback test. Nothing proves a mid-checkout failure leaves no orphaned order, payment, sequence gap or fiscal event. | The failure mode most likely to break gapless numbering in production. |
| **T-07** | `NOT STARTED` | Concurrency tests cover only counter increments via in-process `Promise.all`. Nothing tests two simultaneous checkouts, a double Z close, or concurrent refunds on one order. | Required by Batch 4.7. *Correction 2026-09-04: partly written in Batch 4.7 — `shift-race.test.ts` covers a **double Z close** and a checkout, and a refund, racing a Z close, against real transactions. **Still open for 6.1:** two simultaneous checkouts, and concurrent refunds on one order. Read that batch's record note 1 first: interactive transactions on SQLite do not overlap, so a "simultaneous" test asserts serialisation and the staleness each operation carries in, not interleaving.* |

### Batch 6.1 — Validation Required

- Each new test **fails against the pre-fix code** and passes after. A test that passes both ways proves nothing.
- `bun test src` — PASS, with the new total recorded.
- Test runtime remains acceptable (baseline 25.9 s; scrypt-heavy tests dominate). *Correction 2026-09-04: about 192 s on the developer's machine with `--timeout 30000` — see L-24.*
- No test writes outside the temp database — re-verify the `test-setup.ts:34` redirect still holds.

### Batch 6.1 — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-05

**Changes.** **The request harness first, because it is what T-02, T-05 and T-06 were actually waiting for.** Every route goes through `withAuth` → `getSession()` → `cookies()`, which throws outside a request scope, so **six batches since 4.4 wrote that limitation into their own test files and deferred it here**. `src/lib/route-harness.ts` stubs `next/headers` with a cookie jar it owns; because the stub's `set` writes back into that jar, a test signs in with the application's **own `createSession`** rather than a hand-minted token — so a test cannot pass against a session shape the app would reject. **T-02** is the first use and closes the audit's "classic POS fraud vector": nine cases drive `POST /api/orders` and prove the branch REFUSES — 30 % with no token is 403 and writes nothing, a 100 % give-away gets no back door, a token bound to a smaller discount, one already spent, one minted for a REFUND and one minted by **another operator** are each refused, and the two controls (an in-threshold discount needs no PIN; the same discount with the caller's own PIN is accepted) keep "refuse everything" from passing. **T-05** writes orders through the real `createOrderInTransaction` and then asks the aggregation about them — which is the only way to catch C-10's class, two components computing the same money differently. **T-06** injects a failure *late*, after the order, lines, payments and receipt exist, and proves the rollback takes **the receipt number** with it; a gap in a fiscal sequence cannot be repaired afterwards. **T-07**'s remaining half — two simultaneous checkouts, concurrent refunds on one order — asserts serialisation and the staleness each operation carries in, per Batch 4.7 note 1. **T-01, T-03 and T-04 are closed on evidence**, not rewritten: their tests were written in Batches 2.1/2.2, 4.4/4.4b and 4.2, and each was re-run here.

**Files.** `src/lib/route-harness.ts` (new); `src/types/bun-test.d.ts` (new); **new tests** `src/app/api/orders-route.test.ts`, `src/lib/services/checkout-money.test.ts`, `src/lib/services/checkout-rollback.test.ts`, `src/lib/services/checkout-concurrency.test.ts`; `src/store/cart-lifecycle.test.ts` (one cast widened). **No application code changed** — see note 6.

**Tests.** `bun test src --timeout 30000` — **765 pass, 0 fail** (baseline 737 + 28 new). `bun run typecheck`, `bun run lint`, `bun run build` — all PASS. **Twelve one-property reverts**; **27 of the 28 new tests fail under at least one, and the one that does not is named** (note 5). Runtime ≈ 90 s, within the L-24 envelope.

**Commit:** `a8734f4` + this plan/record update.

**Notes.**

**(1) The stage's own header was wrong, and the sharper claim is what this batch acted on.** It said "zero touch any of the 59 API routes". Re-measured before starting: **61 routes**, and a dozen files already reference one. What was true is that almost nothing **drives** a route, and that is precisely because of the request scope. The de-staling commit records this; the harness is the answer to it. **T-02, T-05 and T-06 were never blocked on effort — they were blocked on one missing 130-line file.**

**(2) A revert that catches nothing is a question, not a verdict — twice over in this batch.** Removing the step-up token's **caller binding** failed nothing at first. That did **not** mean the property was uncovered: `step-up.test.ts` (Batch 4.4c) covers it, and my harness had only run this batch's four files. Re-run across the whole suite, the revert fails that file. The lesson from Batch 5.7b's `prisma generate` no-op generalises: **ask whether the revert took effect, and whether the cover lives elsewhere, before concluding the test is weak.** A route-level assertion was added anyway — the service proving it and the route honouring it are two claims, and DD-19's point is the second one.

**(3) Two of this batch's own assertions were WRONG about the code, and measuring said so.** *"Ten simultaneous checkouts all succeed"* failed on a 503 `CHECKOUT_BUSY_MESSAGE` — interactive transactions on SQLite serialise, so ten at once exhaust the budget and the loser is refused, exactly as Batch 4.7 note 6 describes. That is **L-43's shape**: a test asserting an outcome the contention does not guarantee. It now tolerates the refusal and asserts what must hold regardless — every number issued is unique and the set is gapless from 1. And *"two refunds produce two REMBOURSEMENT events"* was wrong: `refund.ts:193` is `fullyRefunded ? "ANNULATION" : "REMBOURSEMENT"`, so two 500s against a 1000 sale produce **one of each**. Nothing tested that distinction before; it does now.

**(4) The blast radius of one revert is the best evidence in this batch.** Drawing the receipt number **outside** the transaction (R9) fails **22 of the 28** tests. That is the transaction boundary being load-bearing, measured rather than argued — and it is the answer to T-06's "the failure mode most likely to break gapless numbering in production".

**(5) Which of the 28 does NOT fail under any revert — said plainly.** Twenty-seven do. The one that does not is *"refuses an unauthenticated caller before any of this"*, a **control on the harness itself**: it proves the harness's anonymous state really is anonymous, so the other eight cases are not passing because everything 401s. The property it names — that the route requires a session — is covered by `api-authorization.test.ts`. It is not counted as coverage.

**(6) This batch changed no application code, deliberately, and that is a claim worth checking rather than assuming.** T-02 through T-07 are coverage gaps, not defects; if writing a test had required changing behaviour, that would have been a finding for another batch (safety rules 10 and 11). The only non-test edits are the new harness, a five-line `bun:test` declaration, and one widened cast in an existing test. **`bun-types` is a devDependency and referencing it — globally or file-locally — redefines `fetch` and `ReadableStream` and fights the `dom` lib**, producing errors in files that had none; declaring the one function used is the surgical alternative and is written down in the `.d.ts` itself.

**(7) L-43 got more frequent, and this batch is why.** Measured across five whole-suite runs here: two failed, always the same P2025 on `shift-race.test.ts:227`. The new concurrency tests add real transaction contention ahead of that file, which is exactly what L-43's row predicts widens the window. **Not a new defect and not this batch's to fix** — it is 6.3's, and the per-run test-database path is what closes it. Recorded so the next session does not re-diagnose it.

**(8) Production was not opened by this batch.** Every test runs against the temp database `test-setup.ts` redirects to. `db/custom.db` is unchanged at `96b48ad0…`, 704 512 bytes, mtime 2026-09-05 17:48:00.

---

## Batch 6.2 — Remove misleading tests

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1342–1385 (commit `2d417a0`, plus this batch's status record) on 2026-09-05. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**Status:** `NOT STARTED`

| ID | Status | Problem | Location |
|---|---|---|---|
| **T-08** | `NOT STARTED` | Six tests certify dead code. `validation.test.ts:34-89` exercises `checkoutSchema`, which no route uses — the live route validates with a differently-shaped inline `checkoutIntentSchema`. A reader concludes checkout input is validated; it is validated by nothing. | `src/lib/validation.test.ts:34-89` *Correction 2026-09-05: **L-49 is this finding, opened again by mistake.** Batch 5.7b re-discovered the parallel schema while adding the OFFERT tender and recorded it as new without checking this table. **T-08 is the canonical ID** — audit IDs are never renamed, and this one predates L-49 by the whole remediation. L-49's row now points here. 5.7b kept the two schemas in step by hand and commented each with which is which, which makes the duplication visible but does not remove it; **the removal is still this batch's**, and the note below about doing it together with L-02 still governs.* |
| **T-09** | `NOT STARTED` | Two tests cannot fail: `receipt.test.ts:109` asserts a refunds section is absent while passing `refunds: []`; `:142` asserts `not.toThrow()` on a call already made successfully two lines above. `cart-store.test.ts` is ~80 % a restatement of `cart-store-math.test.ts` (4 of 5 cases assert identical values). | `src/lib/services/receipt.test.ts:109,142`; `src/store/cart-store.test.ts` |

**⚠ Safety rule 2 and 3 apply.** These tests are being removed because they assert nothing, **not** to make anything pass. Removing them must not reduce real coverage. If `checkoutSchema` itself is removed (L-02), that is a Stage 7 cleanup item — do the test removal and the dead-code removal together or not at all.

### Batch 6.2 — Validation Required

- For each removed test, record what it asserted and why that assertion was vacuous.
- Confirm no *real* behaviour loses its only coverage — grep for another test covering the same function before removing.
- `bun test src` — PASS, with the new total recorded and the delta explained.

### Batch 6.2 — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-05

**Changes.** **T-08 was re-pointed, not deleted, and that was decided by measurement rather than preference.** The six `checkoutSchema` cases tested a schema no route runs — but four of them named behaviour that is real and had **no other cover**: nothing tested the LIVRAISON customer rule against the route, and nothing tested the empty-order or no-payments refusals at all. Deleting them would have reduced real coverage, which this batch's own criterion forbids. They now drive `POST /api/orders`, and the move **added** a seventh the old shape could not express: a livraison customer who exists but has no address. **L-02 went with them, together as both rows instruct** — `orderItemSchema`, `paymentSchema`, `checkoutSchema`, `CheckoutInput`, `OrderItemInput`, all referenced only by tests. **T-09**: the refunds assertion passed `refunds: []`, which cannot produce a refunds section under any implementation, so it now passes **real refunds**; the redundant `not.toThrow()` went, because the line above had already called the same function and asserted its output; and `cart-store.test.ts` was removed, with its **one unique case** — `computeCartTotals`, which had no other cover anywhere — moved to `cart-store-math.test.ts` and given a second case for the zero clamp.

**Files.** `src/lib/validation.ts` (L-02 removal); `src/lib/validation.test.ts`; `src/app/api/orders-route.test.ts`; `src/lib/services/receipt.test.ts`; `src/store/cart-store-math.test.ts`; **deleted** `src/store/cart-store.test.ts`.

**Tests.** `bun test src --timeout 30000` — **763 pass, 0 fail** (765 before). **The delta is −2 and every unit of it is accounted for:** −6 vacuous `checkoutSchema` cases, **+7** re-pointed at the route, −5 duplicated cart cases, **+2** for `computeCartTotals` and its new clamp. `bun run typecheck`, `bun run lint`, `bun run build` — all PASS. **Six one-property reverts**, all six caught — including the one this batch exists for, note 2.

**Commit:** `6201e4d` + this plan/record update.

**Notes.**

**(1) "Removing them must not reduce real coverage" is a measurement, and it changed the plan.** Before touching anything: `grep` for another test covering each behaviour. The LIVRAISON customer rule had **none** against the route; the empty-order and no-payments refusals had **none at all** — only a source assertion for the string `.min(1, "Au moins un paiement")` that Batch 5.7b left behind. So the six could not simply go. Re-pointing turns six vacuous tests into seven real ones, which is what makes deleting `checkoutSchema` safe rather than merely tidy.

**(2) The vacuity was DEMONSTRATED, not argued — and the first attempt at demonstrating it was wrong.** Reverting `receipt.ts` to print a refunds section **unconditionally** fails both the old and the new assertion, so it proves nothing about the difference. The realistic regression is a **conditional** one — `if (refunds.length) print` — and under that: **the old assertion (`refunds: []`) PASSES, and the new one (real refunds) FAILS.** That is the whole of T-09 in one measurement, and it is the evidence that the fix is a fix.

**(3) A third name collision, found while removing dead code.** `CheckoutInput` existed in **both** `validation.ts` (dead) and `services/checkout.ts` (live, and the type `createOrderInTransaction` takes). A removal driven by the symbol name would have taken the live one. That is the same shape as `PENDING` in Batch 5.6 and `addon` in 5.7a — three in four batches — and the pattern is now explicit enough to state as a rule: **before deleting a symbol, check whether the name means something else somewhere.**

**(4) L-49 was this finding twice, and the double-count is on the record rather than quietly dropped.** Batch 5.7b re-discovered the parallel `checkoutSchema` while adding the OFFERT tender and opened it as new without checking the Stage 6 table. T-08 predates it by the whole remediation and is canonical; the de-staling commit annotated L-49's row to point here, and this batch closes both.

**(5) What the removed tests asserted, and why each was vacuous — as the criterion requires.** *`checkoutSchema` × 6*: they parsed an object the server never parses, so a change to the real `checkoutIntentSchema` could not fail them; four asserted real intentions and were re-pointed, two (valid DINE_IN, TAKEAWAY without customer) were already covered by this batch's own route tests and re-pointed anyway for symmetry. *Receipt refunds*: asserted absence using input that could not produce presence. *`not.toThrow()`*: the preceding line had already executed the same call and asserted its output — strictly stronger. *Cart store × 4*: identical values to `cart-store-math.test.ts` — the same 2300 line total, the same 900/1100 order-type prices, the same 1050 option modifier.

**(6) A slow run was observed and attributed, not investigated.** One whole-suite run took **296 s** against the usual ~90 s, with the same 763/0 result. That is **L-24**, which is about slow runs rather than wrong results, and it is recorded here only so the next session does not read it as this batch's doing.

---

## Batch 6.3 — E2E and CI safety

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1358–1408 (commit `deec436`, plus this batch's status record) on 2026-09-05. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

**Status:** `NOT STARTED`

| ID | Status | Problem | Location | Direction |
|---|---|---|---|---|
| **T-10** | `NOT STARTED` | `playwright.config.ts` runs `bun run dev` against the real `.env`, so the e2e suite writes orders, refunds and Z closes into the **production database** — into an append-only hash chain that cannot be cleaned up. `reuseExistingServer: true` also hijacks a running dev server. | `playwright.config.ts:22-23` | Point e2e at a disposable database with its own env. **Until this is done, `bun run test:e2e` must never be run.** |
| **T-11** | `NOT STARTED` | The e2e suite is not re-runnable: `03-shift-flow.spec.ts:97-113` opens a shift and never closes it, so the next run's `POST /api/shifts` gets 409 where it expects 200. Credentials are hardcoded `admin`/`123456`. Euro-era arithmetic survives (`02:60`, `02:91`, `02:95`) and passes by luck. *Correction 2026-09-04: the operator changed both live PINs, so those hardcoded credentials **no longer authenticate at all** — every spec now fails at login rather than at the assertions described here. Do not read that failure as a regression in the application.* | `tests/e2e/*.spec.ts` | Make specs self-cleaning and seed their own credentials. |
| **T-12** | `NOT STARTED` | No CI exists. No `.github/`, no pipeline config anywhere. Tests run only when someone remembers. All "lint 0 errors · tsc exit 0 · N tests pass" claims in `IMPLEMENTATION_PLAN.md` rest on manual local runs. | repo root | Add CI running `typecheck`, `lint`, `bun test src` — and e2e only after T-10. Depends on the repo being pushed (P-01). *Correction 2026-09-04: P-01 was done in Batch 0.2; the repository is on `origin/main`.* |
| **L-06** | `NOT STARTED` | `vitest@^3` is a devDependency with no config and no script. Running `bunx vitest` bypasses the `bunfig.toml` preload that redirects `DATABASE_URL`, and four test files begin by wiping 17 tables. | `package.json`; `bunfig.toml:8-9`; `test-setup.ts:34` | Remove the `vitest` devDependency, or add a hard guard in `test-setup.ts` asserting the DB path is a temp path. Prefer both. |

**Also assigned to this batch, from *Newly Discovered Issues* — they are not rows in the table above and are easy to miss:** **L-40** (test files clean up before each test and not after, so file order is load-bearing and a file can fail because of one it has nothing to do with) and **L-43** (one unreproduced failure of `shift-race.test.ts`'s ten-sales race; its last assertion is a **global** `db.order.count()` over a database 53 files share). Both are the same underlying hazard as warning 3b, and **the per-run test-database path fixes all three** — `test-setup.ts:21-22` builds the path from `os.tmpdir()` with no per-run suffix.

### Batch 6.3 — Validation Required

- **A test run must not be able to observe another run's or another file's rows** — the per-run database path, plus a check that L-43's assertion is scoped to the shift under test rather than counting every order in the database.
- Run the e2e suite twice in a row against the disposable database: both runs pass (proves re-runnability).
- Confirm `db/custom.db` hash is unchanged by an e2e run.
- Confirm a guard exists that aborts any test run whose `DATABASE_URL` is not a temp path.
- CI green on a clean checkout.
- `bun test src` — PASS.

### Batch 6.3 — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-05

**Changes.** **The guards first, before anything that could run.** `test-setup.ts` gains a hard refusal — if `DATABASE_URL` does not resolve under the system temp directory the run **aborts**, because four test files begin by wiping seventeen tables and a silent fallback is how that accident happens. It also gains `HIBAPOS_DATA_DIR`, which only `DATABASE_URL` was covering. **L-06's real hole was that the guard cannot protect a runner that never loads it**, so `vitest.config.ts` now **throws at import**: `bunx vitest` fails before collecting a single test. **The per-run database path** (`run-<pid>-<time>`) closes warning 3b outright and takes the shared-state half out of L-40 and L-43, with a sweep of directories older than an hour. **L-43 itself is fixed the way its own row prescribes**: `shift-race.test.ts` never inspected the ELEVENTH promise, so a close that lost the contention left no `ZReport` row and the next line threw P2025 — `results[10]` is now asserted like the sales, and the global `db.order.count()` beside it is scoped to the shift. **T-10:** Playwright gets its own disposable database under temp, its own port (**3100**, never 3000), `reuseExistingServer: false`, the **production build** rather than `next dev`, and an environment passed explicitly instead of inherited from `.env`. **T-11:** the suite seeds its own operator, logs in **once per run** via a setup project, and closes any till it opens. **T-12:** CI on push and pull request — typecheck, lint, `bun test src`, and e2e in its own job, which is only possible because T-10 landed.

**Files.** `test-setup.ts`; `vitest.config.ts` (new); `playwright.config.ts`; `package.json`; `.github/workflows/ci.yml` (new); `tests/e2e/env.ts`, `helpers.ts`, `prepare-db.ts`, `auth.setup.ts`, `00-disposable-database.spec.ts` (all new); the four existing specs; `src/lib/services/shift-race.test.ts`; and `db-pragmas.test.ts`, `backup-restore.test.ts`, `backup-retention.test.ts` — see note 5.

**Tests.** `bun test src --timeout 30000` — **763 pass, 0 fail, three consecutive runs with no flake** (it failed ~2 runs in 5 before this batch). `bun run test:e2e` — **13 passed, twice in a row**, which is the re-runnability criterion. `bun run typecheck`, `bun run lint`, `bun run build` — all PASS. **`db/custom.db` is byte-identical before and after two full e2e runs**, at `96b48ad0…`.

**Commit:** `71324f2` + this plan/record update.

**Notes.**

**(1) The e2e suite had never actually been run, and it showed.** Seven specs failed on the first safe run, and not one failure was a regression — every one was an expectation that had never met a database it could reach. `POST /api/shifts` answers **201**; two specs expected 200. `GET /api/shifts/current` answers **200 with a null body** when no till is open; one expected 404. `04-catalog.spec.ts` never logged in at all, and every catalogue read has been gated since Batch 4.4. And the refund spec still said *"admin self-approves"* and sent no token — the world **before** DD-19 / Batch 4.4c, which made the caller's own PIN mandatory for every refund at any amount. That one is now asserted in **both** directions: refused 403 without a token, accepted with one.

**(2) Batch 4.1's brute-force protection refused the test suite, and the SUITE changed.** Logging in per test answered **429 « Trop de tentatives. »** partway through. That is the control working exactly as designed, and the tempting fix — exempting the suite, raising the limit — would have been a security regression dressed as a test fix. Instead the suite logs in **once per run** through a Playwright setup project and shares the session, which is also closer to how a till is used: one operator, one session, a shift's worth of work.

**(3) The marker proof is now permanent, not a per-batch ritual.** Every batch that started a server against a copy of production proved which database it had open by reading a marker back from the pre-auth `GET /api/auth/profiles` before the first write. `00-disposable-database.spec.ts` runs first on every e2e run and does exactly that: the seeded `e2e-admin` must be present and `admin` / `manager` must **not** be, and the till must hold zero orders. If it ever fails, everything after it is about to write into a database nobody chose.

**(4) L-47 does NOT reproduce, and the hypothesis I tested was FALSIFIED — said plainly because a wrong cause on the record is worse than none.** Against a current build on a disposable database, the browser pane logged in and rendered the authenticated shell (« Bonjour, E2E Admin ») — `showsLoginScreen: false`. I hypothesised the cause was the session cookie's `Secure` flag: `APP_URL` is **unset** in `.env`, so `auth.ts` sets `secure: true`, and a browser rejects a Secure cookie over plain http. The `Set-Cookie` header does carry `Secure` with `APP_URL` unset — measured — **but the pane authenticated anyway**, because `127.0.0.1` is a *trustworthy origin* and browsers accept Secure cookies there. So that is not it. **Cause not established, and L-47 is recorded as not-reproducible rather than fixed** — the condition may have been resolved incidentally by a later batch or been environmental. **The practical consequence is real**: the pane can drive authenticated views again, so the *Manual* criteria that 5.4 and 5.7d had to convert are available to future batches. A session that meets it again should re-open the row rather than assume this settled it.

**(5) This batch's own change broke three tests, and that is worth recording rather than quietly repairing.** The per-run database path is correct, and `db-pragmas.test.ts`, `backup-restore.test.ts` and `backup-retention.test.ts` each **hardcoded** `os.tmpdir()/hibapos-test-db/test.db` — so they read a stale file from before the change, or nothing. All three now derive the path from `DATABASE_URL`, which is what they always meant and which cannot drift from the setup that owns it. **The general shape**: a fixture that hardcodes what another module decides is a duplicate contract, and this remediation has now found that three times over — the schemas of T-08, the labels of Batch 5.7b, and these paths.

**(6) CI includes e2e, which was impossible before this batch.** The stage's own instruction is "add CI running `typecheck`, `lint`, `bun test src` — and e2e **only after T-10**". T-10 landed here, so the workflow has a second job for it. Two jobs rather than one so a failure says which kind it is; the e2e job uploads `test-results/` on failure, because a Playwright failure without its trace is a failure you have to reproduce locally to read.

**(7) Nothing here weakened a check to get a pass.** The 429, the 403 on the token-less refund, the 201s and the 200-with-null are all the application being right and the tests being wrong. The one place a test was made more tolerant is `shift-race.test.ts`'s eleventh promise, and it is more tolerant of exactly one thing — a close that lost the contention — while asserting, in that branch, that **no `ZReport` row exists**, which is the property under test.

**APPENDED 2026-09-05, after the batch was committed (`71324f2`) — Batch 6.3 also resolved L-28, and neither the batch nor its record noticed.** Found in the post-Stage-6 staleness sweep of the plan. **L-28** said `test-setup.ts` clears a stale `-wal` and `-shm` beside the test database but **not** a stale `-journal`, and that a run killed mid-transaction leaves a hot journal SQLite will try to roll into the next run's fresh file. **The per-run directory removes the failure mode rather than the file**: this run's directory did not exist when the previous run died, so no leftover of any name can be sitting in it. **Demonstrated, not reasoned about** — a 21 KB file with SQLite's hot-journal magic header was planted both at the old fixed path (`hibapos-test-db/test.db-journal`) and inside a stale `run-*` directory, and `bun test src/lib/db-pragmas.test.ts` then ran **9 pass, 0 fail**. The row is marked resolved in *Resolved findings* with the date it was recognised, which is not the date it was fixed; the distinction is kept because the batch cannot claim evidence it did not produce. One piece of dead state does survive in temp — a `test.db` at the old fixed path, from before this batch — and it is now addressed by nothing and read by nothing.

---

# STAGE 7 — CLEANUP AND DOCUMENTATION TRUTH

## Batch 7.1 — Documentation corrections

*Moved verbatim from `REMEDIATION_PLAN.md` lines 1382–1418 (commit `85e9ce6`) on 2026-09-05.*


**Status:** `NOT STARTED`

**Carried in from *Open Threads → F*, retired from the front matter on 2026-09-05 (Batch 5.5) and moved here, where the person doing this work will read it.** The session-3/4 *Findings still open* snapshot lives in `REMEDIATION_RECORD.md` → *Retired open-thread rows*, verbatim. **Merge it into `NEWLY DISCOVERED ISSUES`** as part of this batch: it holds re-measurements of **L-19** and **L-21** that exist nowhere else. **L-22** is the only one of its rows still open.

Do **not** correct these before the corresponding fix lands — a document that describes the intended state is more dangerous than one that is visibly stale. Each row records the correct action.

| ID | Status | Claim | Reality | Action |
|---|---|---|---|---|
| **DOC-01** ✅ | `COMPLETED` 2026-09-05 | `README.md:10` "SQLite via Prisma ORM (WAL)" | Rollback journal (header byte 18 = 1) | True after Batch 2.3; verify then leave. *Correction 2026-09-04: Batch 2.3 made this conditionally true — true off a synced folder, false on one (*Open Threads → D*).* **Done in Batch 7.1.** Verified 2026-09-05: header byte 18 = 1, so the claim is FALSE on this install. The README now states the condition — WAL is applied at startup unless the file is in a cloud-synced folder, where it is refused — rather than asserting or denying WAL flatly. |
| **DOC-02** ✅ | `COMPLETED` 2026-09-05 | `docs/SQLITE_WAL.md:26-27` "the production `start.sh` now runs `sqlite3 … journal_mode=WAL`" | `start.sh` deleted in `0aeea30`; `start.ps1` has no sqlite3 call | Rewrite to describe the real mechanism after Batch 2.3. **Done in Batch 7.1.** The sentence is struck through and answered underneath: `start.sh` was deleted in `0aeea30` and never replaced, so for months nothing applied WAL; since Batch 2.3 the application does it at every start. |
| **DOC-03** ✅ | `COMPLETED` 2026-09-05 | `.zscripts/README-windows.md:51` "initializes automatically … in SQLite WAL mode on first launch" | Nothing applies WAL; init only happens when the DB file is absent | Rewrite after Batch 2.3. **Done in Batch 7.1.** Both halves of the sentence were wrong — initialization happens only when the file is absent, and nothing applied WAL. Corrected with a note saying so. |
| **DOC-04** ✅ | `COMPLETED` 2026-09-05 | `README.md:76` "105 tests" | 136 at audit time | Update to the real number after Stage 6. *Unblocked 2026-09-05: **Stage 6 is COMPLETED**, and the number is **763** unit/integration tests plus **13** e2e — re-measure before writing it, do not copy this line.* **Done in Batch 7.1.** 763 unit/integration tests, measured, with the date; the neighbouring e2e line said "caissier flow" for a role withdrawn on 2026-09-04 and now names the four flows and the disposable database. |
| **DOC-05** ✅ | `COMPLETED` 2026-09-05 | `README.md:97` "restauration sécurisée" | Restore does not restore images and is non-atomic | True after Batch 2.1. **Verified true in Batch 7.1 and left unchanged**, which the row anticipated. `backup.ts` archives `public/uploads/` (C-05a) and restores through a staged file. Note L-46 separately: the mechanism works, and no backup on this install is reachable. |
| **DOC-06** ✅ | `COMPLETED` 2026-09-05 | `README.md:107` "`public/uploads/` → Images téléchargées (non commité)" | **Re-measured 2026-09-05: 139 files, 49 MB, all tracked**, in `Options/`, `Produits/` and `categories/`; `.gitignore:62` ignores `/upload/`, a different empty directory | **DD-16 answered — keep them tracked.** So this is a documentation error, not a repository one: correct the README line (it is at `:111` now, not `:107`) to say the images **are** committed, and fix the `.gitignore` typo so it stops implying an intent nothing enforces. **Do not untrack them** — git is currently their only version-controlled copy, which matters more given L-46. **Done in Batch 7.1.** README says the images are versioned (139 files, 49 MB), and the `.gitignore` comment above `/upload/` no longer implies a policy about `public/uploads/`. `/upload/` is a real, empty, untracked directory — the rule stays, its comment is corrected. |
| **DOC-07** ✅ | `COMPLETED` 2026-09-05 | `.env.example:20-21` `BACKUP_LOCATION` override | Read nowhere | True after Batch 2.2. **Verified true in Batch 7.1 and left unchanged.** `BACKUP_LOCATION` is read at `src/lib/paths.ts:64`; the `.env.example` documentation is now accurate. |
| **DOC-08** ✅ | `COMPLETED` 2026-09-05 | `README.md:31`, `.env.example:9`, `README-windows.md:46` show a relative `DATABASE_URL` | The live `.env` uses an absolute Windows path | Make the docs match the decided convention (DD-02). **Done in Batch 7.1, and deliberately NOT changed to the DD-02 path.** The live `.env` uses an absolute path; the docs showed a relative one. Both are now described, with `C:\HibaPOS\data` marked as decided-but-pending — writing it as fact would describe the intended state, which this batch's own preamble forbids. |
| **DOC-09** ✅ | `COMPLETED` 2026-09-04 | `scripts/README.md` documents 8 scripts and describes two destructively-wrong | 9 files; `port-real-data.ts` undocumented; `inspect-product.ts` takes no argument; the "not `src/lib/db`" note is contradicted by `fix-duplicate-product-options.ts:1` | **Done in Batch 4.5**: README rewritten around what each script deletes, `port-real-data.ts` removed outright, `inspect-product.ts` now takes the product name as an argument, and the `src/lib/db` exception is stated. Record → Batch 4.5. |
| **DOC-10** ✅ | `COMPLETED` 2026-09-05 | `README.md:112-113` role table | Understates cashier privileges (shift open/close have no role gate); "suppression définitive" — no hard-delete path exists | Make the table match the enforced matrix after Batch 4.4. *Correction 2026-09-05 (Batch 5.2): the line reference is stale — the role table is at `README.md:92-94`, and `:112-113` is now inside the project-structure block. Two things already moved under it: Batch 4.4b's paragraph above the table says `CASHIER` was removed, and 5.2 struck "tables" from the MANAGER row at `:93`. Neither of DOC-10's two claims is addressed by that; both stand.* **Done in Batch 7.1.** The cashier clause is moot (role withdrawn 2026-09-04). "Suppression définitive" was measured: the only permanent deletion is `DELETE /api/backups/[id]`; categories and products are soft-deleted and no path erases an order, receipt or fiscal event. |
| **DOC-11** ✅ | `COMPLETED` 2026-09-05 | `README.md:80` reports list; `README.md:90` SUPER_ADMIN fiscal duties; ~~`README.md:95` "tables (plan de salle)"~~ | VAT/cashiers/products reports and all fiscal functions have no UI; ~~tables cannot be attached to an order~~ | *Correction 2026-09-05 (Batch 5.2).* **The tables clause is closed, and not the way this row expected.** It read "True after Batches 3.4 and 5.2" — i.e. 5.2 would make the claim true by wiring a picker. DD-09 answered *withdraw*, so 5.2 made the claim **go away** instead: the line (at `:79`, not `:95`) is deleted, and "tables" is struck from the MANAGER row at `:93`. **Nothing in the README now claims a floor plan**, which is the outcome DOC-11 wanted by either route. The other two clauses stand and are 7.1's: the reports list at `:80` is unchanged, and the SUPER_ADMIN fiscal duties are now at `:94`, not `:90` — Batch 3.4 built that UI, so re-check rather than assume. **Done in Batch 7.1, and the re-check the row demanded changed the answer.** Measured: nothing in `src/` fetches `/api/reports/vat` or `/api/reports/cashiers`, but a VAT table IS rendered inside the X and Z reports and the product breakdown IS in the sales tab. So the claim was corrected precisely rather than struck. |
| **DOC-12** ✅ | `COMPLETED` 2026-09-05 | `IMPLEMENTATION_PLAN.md` — Phase 1 "✅ COMPLETE (NF525/ISCA)"; `:63` cites two deleted migrations; `:162` claims `VatBreakdown` is `Record<string,…>` (it is `Record<number,…>` at `money.ts:35`); `:164` claims the printer default was fixed (both seed paths still write "Epson TM-m30"); `:144` justifies `X-Real-IP` by a Caddy proxy the same document deleted at `:120`; `:256` says 50 route files (59); `:38` vs `:123` contradict each other on 0f/4f; `:33` cites a git-history archive path that does not exist | Historical record. **Do not rewrite history** — append a correction note, and never mark compliance complete on the basis of code alone. **Done in Batch 7.1 as an APPENDED Appendix D — nothing above it edited.** Eight claims re-verified plus a ninth found while writing it. Item 1 is the Phase 1 "✅ COMPLETE (ISCA/NF525)" tick, which is answered rather than removed. |

Also in scope: `src/lib/db.ts:24` cites "IMPLEMENTATION_PLAN.md → Batch C C-C2", a section that does not exist; `src/lib/services/fiscal.test.ts:8` cites `vitest.setup.ts`, renamed in `c1cbe03`; `src/lib/http-rate-limit.ts:6-14` and `src/lib/services/backup.ts:12-19` carry rationale that no longer holds.

### Batch 7.1 — Validation Required

- Every corrected claim re-verified against the code at the time of correction, not against another document.
- No claim of French fiscal or legal compliance is added or retained on the basis of this remediation (safety rule 13).
- Cross-check that each DOC item's prerequisite batch is `COMPLETED` before the doc is updated.

### Batch 7.1 — Status Record

**Status:** `COMPLETED`
**Completed:** 2026-09-05

**Changes.** **Eleven DOC items closed, and the two that needed no change are recorded as verified rather than silently ticked.** `README.md`: the WAL claim becomes the condition that is actually implemented; "105 tests" becomes 763 with the date it was measured; the e2e line stops naming a role withdrawn on 2026-09-04; the reports list is corrected **precisely** — a VAT table and a product breakdown really are rendered, inside the X and Z reports, while `/api/reports/vat` and `/api/reports/cashiers` have no caller at all; "suppression définitive" is narrowed to the one thing that does it; the uploads line says the images are versioned, per DD-16. `docs/SQLITE_WAL.md` and `.zscripts/README-windows.md` lose the `start.sh` and "WAL on first launch" claims. `.env.example` stops telling the operator to apply WAL with the sqlite3 CLI — **the instruction that is why nothing ever applied it**. `.gitignore`'s comment no longer implies a policy about `public/uploads/`. `IMPLEMENTATION_PLAN.md` gains **Appendix D**, appended, with nothing above it edited. `fiscal.test.ts` stops naming `vitest.setup.ts`, renamed in `c1cbe03`. `backup.ts`'s size rationale is corrected with a measurement.

**Files.** `README.md`; `docs/SQLITE_WAL.md`; `.zscripts/README-windows.md`; `.env.example`; `.gitignore`; `IMPLEMENTATION_PLAN.md`; `src/lib/services/fiscal.test.ts`; `src/lib/services/backup.ts`. **No application behaviour changed** — every edit is a comment or a document.

**Tests.** `bun test src --timeout 30000` — **763 pass, 0 fail**, unchanged, as a documentation batch should be. `bun run typecheck`, `bun run lint`, `bun run build` — all PASS. **`db/custom.db` byte-identical**, `96b48ad0…`. Every DOC item's prerequisite batch confirmed `COMPLETED` before its document was touched, which is this batch's third criterion.

**Commit:** `b2262bf` + this plan/record update.

**Notes.**

**(1) Two of the four "also in scope" code comments did not need fixing, and one of the two claims about them was simply WRONG.** `src/lib/db.ts:24` was said to cite "IMPLEMENTATION_PLAN.md → Batch C C-C2", a section that does not exist — **there is no such citation anywhere in `db.ts`**; Batch 2.3 rewrote that comment block and the plan's item had gone stale behind it. `src/lib/http-rate-limit.ts:6-14` was said to "carry rationale that no longer holds" — **it holds exactly**: no proxy exists, the headers are distrusted by default, and `TRUST_PROXY_HEADERS` is read per call at `:19`. Neither was touched. **A documentation batch that "fixes" a correct comment has made the documentation worse**, and safety rule 12 cuts both ways: the plan is not more authoritative than the code either.

**(2) The compliance claim was the point of this batch, and it was in the first line of the README.** *"Système de point de vente pour restaurant, **conforme à la réglementation française** (ISCA)."* This batch's own criterion forbids a compliance claim being **retained**, not merely added. It is **qualified, not deleted** — the app really is built to those requirements, and denying that would be its own untruth. The line now says *built to* the ISCA requirements, that this repository does not establish conformity, that conformity flows from the éditeur's attestation, that a false attestation is a criminal offence, and that three questions (V-01, V-02, V-13) are open for a qualified third party and **no automated test can answer them**. `docs/attestation-conformite.md` was read and **not touched**: it is the operator's legal instrument and it already states the penalty.

**(3) DOC-11's re-check changed its answer, which is why the row demanded one.** The row said VAT, cashiers and products reports "have no UI". Measured 2026-09-05: `reports-view.tsx` renders `VatBreakdownTable` in the X report and the Z report, and `TopProductsList` in the sales tab — so two of the three claims were **false**, made true only for the standalone endpoints. The corrected line says what has an interface and what does not, and names the endpoints without one. **Batch 3.4 built that UI after the audit**, exactly as the row warned.

**(4) A ninth false claim in `IMPLEMENTATION_PLAN.md`, found while writing the correction for the other eight.** `:140` (item 6a) describes a Zod enum of `COMPLETED`/`REFUNDED`/`CANCELLED`/`PENDING`; Batch 5.6 removed the last two on 2026-09-05. It is item 9 of Appendix D. **The audit's list of eight was a sample, not a census** — nothing in this batch searched that document exhaustively, and a later reader should not treat Appendix D as complete either.

**(5) `:162` was FALSE when written and is TRUE today, and that is why it is neither ticked nor deleted.** It claimed `VatBreakdown` had been aligned to `Record<string,…>`; at the time `money.ts` still said `Record<number,…>`, and the alignment landed in remediation Batch 3.1. Verified 2026-09-05 at `money.ts:57` — the claim is now accurate by accident of a later fix. Appendix D says exactly that, because "correct today" and "correct when written" are different facts and the second one is what a historical record is for.

**(6) One new finding, recorded and not fixed (safety rule 10): L-51.** Correcting `backup.ts`'s size comment required measuring what it buffers, and the measurement is worse than the comment suggested — the uploads archive is **47 MB**, read into memory whole and encrypted there, at every Z close. The comment is now accurate; the behaviour is untouched and unexamined.

---

## Batch 7.2 — Dead code and dependency removal

*Moved verbatim from `REMEDIATION_PLAN.md` (commit `66f274c`) on 2026-09-05.*


**Status:** `NOT STARTED`

| ID | Status | Item | Location |
|---|---|---|---|
| **L-01** ✅ | `COMPLETED` 2026-09-05 | `src/lib/logger.ts` (72 lines) is dead — zero imports. Note the app has two other logging paths. | `src/lib/logger.ts` **Done in Batch 7.2.** Deleted — zero importers, measured before the deletion, not assumed. |
| **L-02** ✅ | `COMPLETED` 2026-09-05 | ~~`checkoutSchema`, `orderItemSchema`, `paymentSchema`, `CheckoutInput`, `OrderItemInput` are dead — referenced only by tests. Remove together with T-08.~~ **Done in Batch 6.2**, together with T-08 exactly as this row instructed. `CheckoutInput` was a name collision — `services/checkout.ts` exports a live one, which is untouched. Record → Batch 6.2. | ~~`validation.ts:129-182`~~ |
| **L-03** ✅ | `COMPLETED` 2026-09-05 | `z-ai-web-dev-sdk@^0.0.18` — zero imports; an unaudited 0.0.x package in a system handling fiscal data. | `package.json` **Done in Batch 7.2.** Removed from `package.json` **and from `bun.lock`** — CI runs `bun install --frozen-lockfile`, so leaving the lockfile stale would have failed the build rather than the audit. |
| **L-07** ✅ | `COMPLETED` 2026-09-05 | Unused exports: `useIsMobile` (whole file), `GROUP_LABELS`, `formatNumber`, `formatTime`, `apiFetch`, `fromCents`, `limitOr429`, `ensureGrandTotal`, `getSetting`, `setSetting`. | various **Done in Batch 7.2, and two of the ten entries did not survive measurement.** `fromCents` is **LIVE** — `orders-view.tsx:231` calls it — so the row was stale and it was left alone. `apiFetch` and `ensureGrandTotal` have callers **inside their own modules**, so they lost the `export`, not the function; deleting either would have broken every screen or the grand total. The other seven went: `useIsMobile` (whole file), `GROUP_LABELS`, `formatNumber` (with its private `numberFormatter`), `formatTime`, `limitOr429`, `getSetting`, `setSetting`. |
| **L-08** ✅ | `COMPLETED` 2026-09-05 | Duplicated helpers missed by the Phase 7 extraction: `statusBadge` ×2, `formatBytes` ×2, three overlapping variance helpers. | `orders-view.tsx:96`; `dashboard-view.tsx:52`; `backups-view.tsx:41`; `media-view.tsx:45`; `shifts-view.tsx:58`; `reports-view.tsx:55,62` **Done in Batch 7.2.** The two `statusBadge` switches were **byte-identical, 21 lines each** — verified by diff — and became `OrderStatusBadge`. `formatBytes` merged into `format.ts` with one behaviour deliberately chosen over the other. The variance half was the one that mattered: a **tested** helper used ONCE with four hand-written copies of it on the cash screens. |
| **L-12** ✅ | `COMPLETED` 2026-09-05 | Four files carry a UTF-8 BOM before `"use client"`; both seed paths still write `printerName: "Epson TM-m30"`. | `error-boundary.tsx`, `home-dashboard.tsx`, `audit-view.tsx`, `login-screen.tsx`; `services/seed.ts:243`; `prisma/seed.ts:127` **Done in Batch 7.2.** Four BOMs stripped at byte level. `printerName` corrected in both seed paths **and at a third site the row did not name** — `settings-view.tsx:267`, the placeholder the operator actually reads. The stored SETTING is still `Epson TM-m30` and is the operator's to change. |
| **APPROVE-DEAD** ✅ | `COMPLETED` 2026-09-05 | **`POST /api/auth/approve` (193 lines) and `manager-approval-dialog.tsx` (127 lines) have had no runtime caller since Batch 4.4c**, and the route can never succeed anyway: it tests a PIN against every active manager and then forbids self-approval, which with one operational role (DD-07) admits nobody. Measured 2026-09-05 — every other mention in `src/` is a comment or a test comment, and the dialog is imported by nothing. **The reason to delete rather than leave**: the route is `withAuth` with no role restriction, so any signed-in user can POST a PIN to it, and it **deliberately shares the five-attempt lockout counter with `/api/auth/step-up`** — so exhausting a route that can never succeed locks out the one that gates every refund and every large discount. **`src/lib/approvals.ts` stays**: `services/step-up.ts` uses it. No test exercises the route; `auth-async-pin.test.ts:10` and `approval-lockout.test.ts:15` name it in comments that need updating. | `src/app/api/auth/approve/route.ts`; `src/components/pos/manager-approval-dialog.tsx` **Done in Batch 7.2.** Both deleted. **Sixteen comments in thirteen files describe a design decision by contrast with that route**, and every one of them now says it was deleted — the reasoning is what makes those comments make sense, so none was rewritten away. The full account moved to the successor, `api/auth/step-up/route.ts`. |
| — | `DEFERRED` | 27 of 51 shadcn `ui/*` components are orphaned, keeping ~20 dependencies transitively alive (`@dnd-kit/*`, `@tanstack/react-table`, `date-fns`, `@hookform/resolvers`, `recharts`, `cmdk`, `vaul`, `input-otp`, `react-day-picker`, `react-resizable-panels`, and many `@radix-ui/*`). Template residue, not deletion evidence — **except `@dnd-kit/*`**, see M-09/section I. | `src/components/ui/` |

**DO NOT REMOVE, and they will look exactly like this batch's targets (Batch 5.2, DD-09, 2026-09-05).** The table feature was **withdrawn, not deleted**, so five surfaces are now unreferenced *on purpose* and are retained in case table service ever exists:
- `src/features/tables/tables-view.tsx` — on disk, **imported by nothing** since the shell's `dynamic()` import was removed.
- `src/app/api/tables/route.ts`, `.../[id]/route.ts`, `.../seed/route.ts` — **no client caller**; that screen was their only one. They stay under `api-authorization.test.ts`'s filesystem walk, which is a second reason to keep them.
- The checkout auto-link (`checkout.ts:202`) and the refund release (`refund.ts:131`) — live code on a branch **no sale can enter**, because the cart's `tableLabel` has no writer.
- `setTableLabel` (`cart-store.ts`) — deliberately callerless; `table-withdrawal.test.ts` fails if anything calls it.

Each carries a comment saying so, and `src/features/tables/table-withdrawal.test.ts` fails if any of them is deleted. **Removing them is reopening DD-09, which is a decision, not a cleanup.** Full reasoning: record → Batch 5.2.

### Batch 7.2 — Validation Required

- `bun run build` — PASS after every removal.
- `bun test src` — PASS with an explained count delta.
- `bun run typecheck` — PASS. `bun run lint` — PASS.
- Manual smoke: every screen still renders after the dependency removals.
- Confirm no removed export had a runtime-only consumer (dynamic import, string reference).

### Batch 7.2 — Status Record

**Status:** `COMPLETED` — **except L-33, which is not this batch's kind of work; see note 5**
**Completed:** 2026-09-05

**Changes.** **Four files deleted** — `logger.ts` (72 lines, zero importers), `hooks/use-mobile.ts`, and the pair APPROVE-DEAD named: `POST /api/auth/approve` (193 lines) and `manager-approval-dialog.tsx` (127). **One dependency removed**, `z-ai-web-dev-sdk`, from `package.json` **and `bun.lock`**. **Seven dead exports removed and two un-exported**: `apiFetch` and `ensureGrandTotal` are called inside their own modules, so they lost the `export` and kept the function. **L-08's three duplications closed**: the two byte-identical `statusBadge` switches became `OrderStatusBadge`; `formatBytes` merged into `format.ts`; and `formatVariance` moved beside the `formatEuro` it wraps, replacing **four hand-written copies** on the cash screens. **L-12**: four BOMs stripped, `printerName` corrected at three sites. Net **−428 lines** across 40 files.

**Files.** Deleted: `src/lib/logger.ts`, `src/hooks/use-mobile.ts`, `src/app/api/auth/approve/route.ts`, `src/components/pos/manager-approval-dialog.tsx`. New: `src/components/shared/order-status-badge.tsx`. Changed: `package.json`, `bun.lock`, `format.ts`, `api-client.ts`, `http-rate-limit.ts`, `nav-config.ts`, `services/{settings,fiscal,seed}.ts`, `prisma/seed.ts`, six feature views, `z-close.ts` + its test, `order-status.test.ts`, and the thirteen files carrying a comment about the deleted route.

**Tests.** `bun test src --timeout 30000` — **763 pass, 0 fail**. **The delta is ZERO and that is explained, not shrugged at**: no test was added or removed, and `api-authorization.test.ts` walks the route tree inside seven `it()` blocks rather than one per route, so deleting a route changes what those seven iterate over and not the count. `bun run typecheck`, `bun run lint`, `bun run build` — PASS. `bun run test:e2e` — **13 passed**. **Manual smoke on a scratch copy with marker proof**: ten screens driven in the browser, **zero console errors**. `db/custom.db` byte-identical at `96b48ad0…`, and `db/backups/` still holds its nine files.

**Commit:** `97c74fb` + this plan/record update.

**Notes.**

**(1) Two of L-07's ten entries were wrong, and measuring is the only reason the batch did not break the app.** **`fromCents` is live** — `orders-view.tsx:231` uses it to prefill a refund amount — so the audit's claim that it is unused had gone stale. **`apiFetch` and `ensureGrandTotal`** each have callers inside their own module: `apiFetch` is what the whole `api` object is built from, so deleting it would have broken every screen. They lost the `export` instead, which is the finding's real content — the *export* was dead, the function was not. **The list a batch is handed is evidence, not instruction.**

**(2) The de-duplication fired Batch 5.6's tripwire, and it was amended to be STRICTLY STRONGER.** `order-status.test.ts` read both view files as source and asserted each contains `ORDER_STATUS_LABELS.COMPLETED`; after the extraction neither does. The assertion **moved** to the module that now renders the badge, and a third was **added** that the old shape could not express: neither view may declare a `statusBadge` switch again — the property this batch established, and the one that would let them drift apart a second time. **Three one-property reverts, all three caught**: a switch reappearing in a view, the badge hardcoding a label instead of the shared map, and M-08 itself (« En attente » coming back).

**(3) The variance duplication was the one worth finding, and it is not cosmetic.** `formatVariance` was defined in `z-close.ts`, **used once**, and hand-copied at four call sites — `reports-view.tsx` ×2 and `shifts-view.tsx` ×2 — on the screens whose purpose is catching missing cash. Its own file header records why it exists: `formatEuro` performs the single cents→euros division and no caller may divide by 100 as well, because doing exactly that was **C-02**, a 5,00 € shortage rendered as "0,05 €". Four hand-written copies are four places that could come back. The helper moved to `format.ts` beside the `formatEuro` it wraps, **its rationale travelling with it**, and `z-close.test.ts` still pins C-02 by importing it from its new home.

**(4) Deleting a route left sixteen comments in thirteen files pointing at something that no longer exists** — and every one of them explains a live design decision *by contrast with* it (why step-up is not approve, why the lockout is shared, why self-approval mattered with one role). Rewriting them away would have destroyed the reasoning. Each file's first mention now says **DELETED in Batch 7.2** and names the successor, and the full account — including *why* it was deleted rather than left dormant, that it was `withAuth` with no role restriction and shared the five-attempt lockout with the route that gates every refund — lives in `api/auth/step-up/route.ts`.

**(5) L-33 IS NOT DONE, and it is not this batch's kind of work.** The sweep of 2026-09-05 pointed it here because 6.1 had completed without it. **Its own text says why that was wrong**: *"Deciding which of the 29 should narrow to `["SUPER_ADMIN"]` is a review, not a mechanical fix."* Two sites are sharper than the rest — `GET /api/users` and `GET /api/backups` answer **200** to a MANAGER whose nav entry for those views is deliberately SUPER_ADMIN-only, while `GET /api/logs` returns 403 and is the shape the other two should match. Narrowing them changes who may call an endpoint, which is safety rule 11's definition of a decision. **Recorded as open and routed to a decision rather than guessed at.**

**(6) The smoke test found nothing broken and confirmed two things nobody had seen.** Ten screens driven on a scratch copy of production, marker-proved through the pre-auth profiles endpoint: home, dashboard, orders (the extracted badge renders « Terminée » in the Statut column), reports X and Z (`formatVariance` renders the Écart column), shifts, media (`formatBytes` renders "—" for the null sizes those rows carry), backups, settings and the login screen. `error-boundary.tsx` was not driven — it renders only on an error — and its BOM strip is covered by the build. **Two incidental confirmations**: the scratch database, being under `%TEMP%` rather than OneDrive, **did go into WAL** — `smoke.db-wal` and `smoke.db-shm` appeared beside it, which is DOC-01's conditional claim demonstrated rather than asserted; and the settings form shows placeholder `Sunso WTP-801` over a stored value of `Epson TM-m30`, which is exactly the code-default-versus-live-setting distinction DOC-15 turns on.

**(7) A backup taken on the scratch copy does NOT exercise L-51, and saying so matters.** The run created one in 0.3 s at 684 076 bytes with `imagesPath: null` — because `HIBAPOS_DATA_DIR` pointed at a scratch directory with no `uploads/`. L-51 is about the **47 MB uploads archive**, which this measurement never touched. It does prove `HIBAPOS_DATA_DIR` works: the file landed in the scratch directory and `db/backups/` still holds its original nine.

---

## Batch 7.4a — Reports that disagree

*Written directly into the record on 2026-09-05: 7.4a was specified by the split commit `9a137ce` and worked the same day, so there was no plan section to move.*

**Status:** `COMPLETED` · **Completed:** 2026-09-05

**Changes.** **L-48**: `/api/shifts/summary` computed `expectedCash` without the cash-movement term, so it and `GET /api/reports/x` answered differently for the same till the moment one movement existed — **21 580 versus 26 580** after a single +50,00 € approvisionnement. One term added, same scoping, term for term identical to `computeShiftReport`. **L-44 / DD-21**: the four management reports adopt the fiscal rule, *a period books the sales of its own orders and the corrections it itself issued* — the dashboard and the products report take the period scope, and the cashier report gains `cashierAggregateOptions`, which books a refund to the cashier who **issued** it (`Refund.cashierId`) rather than the one who sold. **L-50 / DD-20**: a give-away is now counted **beside** the sales — `givenAwayCount`, `givenAwayItemsCount` and `givenAwayProducts` on `PeriodAggregate`, on the X and Z reports, on the period sales report, in the **sealed close payload**, and rendered on the reports screen as « Offerts — non comptés dans les ventes ».

**Files.** `src/lib/services/aggregate.ts` (`isGiveaway`, the three fields, `cashierAggregateOptions`), `services/reports.ts`, `services/fiscal.ts`, `app/api/shifts/summary/route.ts`, `app/api/dashboard/route.ts`, `app/api/reports/{cashiers,products,sales}/route.ts`, `app/api/customers/[id]/detail/route.ts` (comment only), `src/types/api.ts`, `src/features/reports/reports-view.tsx`. Tests: **new** `app/api/shift-summary-agreement.test.ts` and `app/api/report-attribution.test.ts`; amended `services/offert-tender.test.ts` and `services/close-timing.test.ts`.

**Tests.** `bun test src --timeout 30000` — **776 pass, 0 fail** (763 before). **+13, accounted for**: 5 for the `expectedCash` agreement, 6 for the attribution rule, 2 added to the give-away file. `bun run typecheck`, `bun run lint`, `bun run build` — PASS. **`db/custom.db` byte-identical** at `96b48ad0…`. **Six one-property reverts, all six caught.**

**Commit:** `807e0c5` + this plan/record update.

**Notes.**

**(1) L-48 is M-14 reopening for the third time, and that is why it got a test rather than only a fix.** M-14 was "a fourth aggregation semantic" at this very endpoint; Batch 3.2 unified it; Batch 5.5 moved five callers onto `cash.net` and its record names all five — this was the one not carried across. A fix alone would be the same repair a third time. The assertion is **driven over HTTP**, because the claim is about what the two ENDPOINTS answer, and it is stated as an equality *and* as literal figures, so a change breaking both the same way still fails. The revert — dropping `+ cash.net` — fails 4 of the 5, and the one that passes is the zero-movement control, which is exactly why nobody noticed: **the disagreement needs a movement to exist.**

**(2) The sealed close payload grew for the third time, deliberately and with the cost stated in advance.** `close-timing.test.ts` pins the key list precisely so a payload cannot grow by accident; it fired, and was amended rather than adjusted. Safe for one reason and no other: **zero monthly and annual closes have ever been sealed**, re-verified by the test's own two assertions in the same run. **This is the first of the three payload changes an operator asked for** rather than a defect forcing — and the decision was put to them WITH that cost attached, because after the first sealed close it means a second vintage in a document that cannot be corrected.

**(3) A correcting period contributes a NEGATIVE count, and two of my own assertions were wrong about it before the code was.** I wrote the attribution test expecting "today made one sale, so today's count is 1", and expecting a cashier who only issued a refund to show `salesTotal: 0`. The endpoints answered **0** and **−3000 with −1 order**, and the endpoints were right: under *a period books the corrections it issued*, an order that stops counting because THIS period refunded it contributes −1. That is what makes the parts of a year add up to the year, and `cross-shift-refund.test.ts:544` already pinned the same shape for shifts as `[1, 0, −1]`. **The assertions were corrected to the truth and the reasoning written into the test**, so nobody "fixes" it back into a naive count. Same lesson as Batch 6.1's two wrong assertions: *check what the code does before asserting what it should do.*

**(4) L-44 named four reports and only three needed changing — the fourth is recorded in place rather than silently skipped.** `customers/[id]/detail` has **no date range**: it aggregates every order a customer ever placed, so there is no period for a correction to be booked into, and `AggregateOptions` says in as many words that its defaults "stay correct for any caller whose scope is not a period". A refund also cannot move between customers the way it moves between days and cashiers. The comment in the file says so, so the finding cannot be re-opened there.

**(5) The cashier report gained a bucket it never had.** It bucketed strictly by the SELLING cashier, so a refunding cashier who sold nothing in the range had no line at all — there was nowhere for the correction to go, which is half of why the old attribution existed. An order now lands in a bucket if the cashier sold it **or** issued one of its refunds, and a second query fetches the names of refunders who sold nothing.

**(6) The products report was doing something subtler than the row described, and the fix is a behaviour change worth naming.** It called `orderNet(order)`, which nets **every** refund the order has ever had — so a past period's product revenue changed retroactively when a later refund landed. It now takes the difference between the state at the start of the range and the state at its end, which is the telescoping the shared aggregate performs. **Quantity deliberately follows the SALE, not the correction**: a refund does not un-sell a dish that left the kitchen, and a negative quantity on a product line would be its own kind of wrong.

**(7) The give-away is rendered, not just returned.** A count in an API response nobody displays is the same invisibility L-50 was about, one layer up. The block appears on the X report, the Z report and the period report, and **renders nothing at all when there were none** — a permanent "0 offert" on every screen an operator reads during service is noise. It states in French that an offered order is a 100 % discount settled as « Offert » and counts in neither the takings nor the number of sales, because that sentence is the whole decision.

---


---

## Batch 7.4b — Authorization and the login queue

*Written directly into the record on 2026-09-05.*

**Status:** `COMPLETED` · **Completed:** 2026-09-05

**Changes.** **L-33 / DD-22**: `GET /api/users` and `GET /api/backups` narrowed from `["SUPER_ADMIN", "MANAGER"]` to `["SUPER_ADMIN"]`, so the API stops contradicting a navigation that hides both screens from a MANAGER (DD-07); `GET /api/logs` already answered 403 and is the shape they now match. The other 27 were reviewed, and the review's output is a **`GATES` table classifying all 76 authenticated handlers** — BOTH / SUPER_ADMIN / INLINE / ANY — which the test derives from the source and compares, key by key and as counts. **L-30**: a second rate-limit budget on the unknown-username path, keyed `login-unknown:<ip>` **without** the username, so inventing names no longer mints buckets. Past it the response is identical and only the scrypt burn is skipped.

**Files.** `src/app/api/users/route.ts`, `src/app/api/backups/route.ts`, `src/app/api/auth/login/route.ts`, `src/lib/api-authorization.test.ts`; **new** `src/app/api/login-unknown-budget.test.ts`.

**Tests.** `bun test src --timeout 30000` — **782 pass, 0 fail** (776 before; +2 classification, +4 login budget). `bun run typecheck`, `bun run lint`, `bun run build` — PASS. `db/custom.db` byte-identical. **Three one-property reverts, all three caught** — but only after the fourth was found useless; see note 3.

**Commit:** `215d9fd` + this plan/record update.

**Notes.**

**(1) DD-22's review is now a standing property rather than a paragraph.** L-33 said "deciding which of the 29 should narrow is a review, not a mechanical fix", and a review that produces prose decays the moment someone edits a gate. The `GATES` table names every one of the **76** authenticated handlers and the test recomputes each from the source: **29 BOTH, 26 ANY, 14 INLINE, 7 SUPER_ADMIN**. Change any gate and it fails; add a route without classifying it and it fails; delete one and it fails. **The verdict on the 29 is that every one is a till operation, a report or a management action the MANAGER genuinely performs** — that account runs the restaurant. Two boundaries were checked rather than assumed because they look wrong at a glance and are not: `fiscal/close-month` admits a MANAGER while `fiscal/close-year` does not, and `audit` (the business trail) admits a MANAGER while `logs` (the technical one) does not. Both are exactly what the README's role table says.

**(2) L-30 was fixed without removing the burn, which is the whole difficulty.** Every unknown username burns one `hashPin` on purpose, and those derivations pass through the bounded queue — 2 concurrent + 32 queued = **34**, which is precisely why the finding measured "60 simultaneous logins → 34 served, 26 refused 503". The tempting fix is to stop burning; that trades a denial-of-service for the account-enumeration oracle Batch 4.2 closed, which is a worse trade. Instead the *number* of burns one caller can demand is bounded, by a key that carries no username. **The response past the budget is byte-for-byte identical** — same 401, same message — so nothing about the answer reveals whether a burn happened; only the timing differs, and only for a caller who has already made five unknown-username attempts in a minute. **It costs an honest operator nothing, and that is structural**: the login screen is a profile picker (`GET /api/auth/profiles`), so a real sign-in never sends a username that does not exist.

**(3) MY FIRST TEST FOR L-30 PASSED UNDER ITS OWN REVERT, and that is the note worth keeping.** It fired fifty unknown-username logins and asserted they finished in under ten seconds. With the fix removed it *still* passed — thirty-four burns two-at-a-time at ~390 ms come in under the threshold — so it certified nothing. Two lessons, and the second is the general one. **A timing threshold is the easiest useless assertion to write**, and L-24 says this machine's timings swing by a factor of five. And **the revert is what found it**: the test looked reasonable, read reasonably, and was worthless. Rewritten, it fires sixty unknown logins **concurrently with an honest one** and asserts the honest login is **not 503** — the exact harm the finding names — and the revert now fails with `Expected: not 503`.

**(4) The narrowing broke no screen, and that was measured before the decision was put, not after.** Nothing in `src/` calls either endpoint as a MANAGER; both screens are already SUPER_ADMIN-only in the navigation. Had that not been true, DD-22 would have been a different question.


**APPENDED 2026-09-05, after the batch was pushed — CI FAILED ON THIS FILE AND THE LOCAL SUITE HAD NOT.** `login-unknown-budget.test.ts` wiped only sessions, audit rows and users. On CI it failed with **P2003**, a foreign-key violation on `user.deleteMany()`, because another file's orders still referenced those users. **This is L-40's within-run half**, which Batch 6.3 fixed only ACROSS runs and said so in as many words: the per-run database directory "does NOT make files independent of each other WITHIN a run". A partial wipe is not a shortcut — it is a dependency on the order files happen to run in, and Linux ordered them differently from Windows. Fixed in `ea24595`; the wipe now clears every table referencing `User`, in dependency order. **Honest about the verification: the adverse ordering was NOT reproduced locally** — running the file after one that leaves orders behind still passed — and the fix does not depend on reproducing it, because it removes the ordering dependency rather than accommodating one neighbour. **This is the second thing CI has caught that the local suite could not**, and it is exactly what Batch 6.3 added it for.
---


---

## Batch 7.4c — Small correctness

*Written directly into the record on 2026-09-05. **This completes Batch 7.4**, and with it every finding whose original batch had completed without it.*

**Status:** `COMPLETED` · **Completed:** 2026-09-05

**Changes.** **L-45**: `POST /api/shifts` read its single-open-till guard OUTSIDE the transaction that creates the shift; the guard now runs inside it, and a loser is refused with the same 409 and the same message. **L-31**: `POST /api/seed` reported every catalogue failure as a won race; it now distinguishes P2002 — the genuine race, as the users branch above it already did — from a real failure, which answers 500 and says which half happened. **L-19**: the VAT breakdown rendered rates with `toFixed(1)`, so 1,05 % displayed as "1.1 %"; a `formatVatRate` helper shows up to two decimals with the French comma, and the KEY is untouched. **L-24**: `bun run test` carries `--timeout 30000` itself. **L-32**: no code changed — see note 4.

**Files.** `src/app/api/shifts/route.ts`, `src/app/api/seed/route.ts`, `src/components/shared/report-widgets.tsx`, `package.json`; **new** `src/app/api/shift-open-race.test.ts`, `src/components/shared/vat-rate-display.test.ts`, `src/app/api/seed-failure-honesty.test.ts`.

**Tests.** **`bun run test` — 793 pass, 0 fail, WITH NO FLAGS**, which is L-24's own validation criterion. 782 before; **+11**: 3 for the till race, 5 for the VAT display, 3 for the seed honesty. `bun run typecheck`, `bun run lint`, `bun run build` — PASS. `db/custom.db` byte-identical. **Four one-property reverts, all four caught.**

**Commit:** `9e8e4e7` + this plan/record update. **Plus `4a2c5d8`, a fix — see note 6.**

**Notes.**

**(1) L-45 is C-15's shape at the fourth and last site, and the fix is the one Batch 4.7 used three times.** The guard is read inside the transaction that acts on it, so a second opener either sees the first's row or is serialised behind it. **The refusal an operator reads did not change** — same 409, same French sentence — because only where it is decided moved. The test asserts **the database**, not a fixed split of the ten responses: exactly one shift exists whatever the replies were, and at most one caller was told it succeeded. Asserting a fixed split of ten concurrent calls is precisely what L-43 was made of, and this file says so where the next person will read it.

**(2) L-31's bare `catch` is a small change with an operator-facing point.** Being told « Base initialisée » when the catalogue did not seed leaves someone unable to tell a real race from a real failure — and the branch immediately above it already knew how: P2002 is the unique-constraint violation a lost race produces, and everything else is not. The failure response now names **both halves**: the two bootstrap accounts *were* created, the catalogue was *not*. The test stubs the service rather than provoking it, because the claim is about what the ROUTE does with each kind of failure, and a real duplicate-name collision only reproduces the P2002 half.

**(3) L-24 was fixed by removing the need to remember.** The row offered a cheaper burn or a raised timeout; **lowering the scrypt cost was never an option** — it is the security parameter that makes a 6-digit PIN defensible. `bun run test` now carries `--timeout 30000`, so the flag is not something a session has to know. `bun test src` still exists and still needs it, which the validation-commands table now says. The suite ran **793/0 with no flags**, which is the criterion the batch set itself.

**(4) L-32 needed no code, because Batch 7.4b closed its stated cost — and that is recorded rather than claimed here.** L-32 said role gating uses two idioms and *"only one is visible to the T-03 matrix… a future route copying the inline pattern inherits that blind spot."* 7.4b's `GATES` table classifies **INLINE explicitly** and asserts that every authenticated handler appears in it, so a new route copying that pattern now **fails the build until it is classified**. The blind spot is gone. **The conversion the row also described was considered and declined**: the inline guards answer « Réservé au super administrateur » while `withAuth` answers « Accès refusé », so converting fourteen routes would make the message an operator reads strictly less informative. The row itself said to do it "as one deliberate change with the message decided" — the deliberate decision is not to, and the reason is written here.

**(5) L-19's row insisted the display layer was the defect and not the key, and the test pins both.** `vatRateKey` decides how a rate is stored and grouped, and Batch 3.1 settled it — changing it here would regroup figures that are already sealed. So `formatVatRate` renders, `vatRateKey` keys, and the test asserts that the display of a key round-trips to the rate. It also asserts an unparseable key renders as itself rather than "NaN %", because a report shows whatever the key says.


**(6) The batch commit did not typecheck, and I committed before checking.** `bun test` compiles nothing, so a test file can pass and still be a type error — this session has now leaned on that twice. The new seed test imported `describe`/`it`/`expect`/`beforeEach` from `bun:test`, and `src/types/bun-test.d.ts` deliberately declares **only** `mock.module` (Batch 6.1 kept that surface minimal so reaching for more is a type error, which is exactly what it did); it also called the seed handler with a `Request`, and `POST` takes no argument. Both fixed in `4a2c5d8`. **Recorded rather than amended away**: the commit sequence is the honest account, and the lesson — *run the typecheck before the commit, not beside it* — is worth more than a tidy history.
---


---

## Batch 7.3 — Secret rotation

*Moved verbatim from `REMEDIATION_PLAN.md` (commit `8813e06`) on 2026-09-05.*


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

**Status:** `COMPLETED` **for everything this repository can do — THE SECRETS ARE NOT YET ROTATED.** The rotation is an operator action, prepared, rehearsed and handed over; it is tracked in *Open Threads → B* until it is done.
**Completed:** 2026-09-05

**Changes.** **No application code changed, and that is the finding.** **L-04** asked for the stale `.next/standalone/` tree carrying live secret values to be gone and not to regenerate: **it already is.** `output: "standalone"` was removed from `next.config.ts` in Batch 2.4, the tree is absent after a fresh `bun run build`, and `.next/` is gitignored and appears in **no commit in any branch** — so that copy of the secrets never entered git. **SEC-ROT** is the operator's: this batch rehearsed it end to end on a scratch copy and hands over the exact commands. A **leaked-secret sweep** of the working tree found the live values in **`.env` and nowhere else**. `src/lib/secret-rotation.test.ts` (new) pins what the rotation does.

**Files.** `src/lib/secret-rotation.test.ts` (new). Nothing else.

**Tests.** `bun run test` — **798 pass, 0 fail** (793 before; +5). `bun run typecheck`, `bun run lint` — PASS. **`db/custom.db` byte-identical** after the whole rehearsal, and the rehearsal's scratch tree was deleted.

**Commit:** `d937ef2` + this plan/record update.

**Notes.**

**(1) THE REHEARSAL PROVES THE THREE CRITERIA, and it took three attempts because the first two measured the wrong thing.** Running a server on a scratch copy under an OLD secret, signing in, then restarting the same database under a NEW one: the old cookie yields **`{"user":null}`**, the same PIN still logs in **200**, and the fresh cookie yields the full user. All three of the batch's stated criteria, demonstrated.

**(2) The first attempt concluded the rotation did NOT invalidate the session, and that conclusion was WRONG.** `GET /api/auth/me` answers **200 with `{"user": null}`** when there is no session — so asserting the status code proved nothing at all. This is the third time in this session that an assertion measured a status where the body carried the answer: Batch 6.3 found the e2e suite expecting 404 from a route that answers 200-with-null, and 7.4b's first L-30 test asserted a clock. **The pattern is worth naming: assert the thing the finding is about, not the thing that is easy to read.**

**(3) The second attempt concluded the ENVIRONMENT was being ignored, and that was wrong too.** A server started with `SESSION_SECRET="tooshort"` served `GET /api/auth/profiles` happily, which looked like proof that `.env` overrides the inherited environment — which would have broken the scratch-copy method the whole remediation rests on. It does not: **`/api/auth/profiles` is the pre-auth endpoint and never imports `auth.ts`**, so the import-time guard could not fire. A route that does import it answers **500** with *"SESSION_SECRET must be at least 32 characters long"*. The environment override works exactly as every batch has assumed. **Two wrong conclusions in one rehearsal, both caught by measuring again rather than by writing them down.**

**(4) What the rotation costs, stated plainly because the operator is the one who pays it.** Every session is invalidated, so whoever is signed in is signed out — including, if it is done remotely, the person doing it. Any step-up or approval token in flight stops verifying and the refund or discount it authorised must be re-approved. **No PIN changes and nobody is locked out**: PINs are scrypt hashes with per-row salts and have nothing to do with `SESSION_SECRET`, which the test asserts.

**(5) Rotating `BACKUP_ENCRYPTION_KEY` loses nothing, and L-46's premise was re-verified rather than assumed — as its row instructs.** Read-only on production, 2026-09-05: the `Backup` table holds **0 rows** while **9 files** sit in `db/backups/`. `listBackups()` and `restoreBackup()` both key on that table, so not one of those files is reachable through the application today. That is why DD-04 could answer *"rotate and accept the loss"*: the key is not what makes them unreachable, and re-encrypting them first would be work in service of a capability that does not exist.

**(6) Claude does not generate the new secrets, and does not see them.** The hand-over gives the operator the command that generates each value on their own machine. A secret pasted into this transcript would be a secret in a log.


### Batch 7.3 — HAND-OVER: the exact rotation procedure

*Prepared and rehearsed by Claude on 2026-09-05; **run by the operator**. Claude never generates or sees the values (note 6). Rehearsed end to end on a scratch copy of production, where all three criteria held.*

**Before you start.** You will be signed out — every session is invalidated, including yours. Do it when the till is not in service. Nothing is lost that you can currently reach: no backup in `db/backups/` is restorable through the app today (L-46, re-verified 0 rows / 9 files on 2026-09-05).

**1. Generate the two values, on this machine, one at a time.**

```bash
openssl rand -hex 32
```

Run it **twice** — once for `SESSION_SECRET`, once for `BACKUP_ENCRYPTION_KEY`. Do not reuse one value for both. If `openssl` is not on PATH, `bun -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` produces the same thing.

**2. Take a copy of `.env` first**, outside the repository and outside OneDrive:

```bash
cp ".env" "C:/HibaPOS-secrets-backup/env-before-rotation-2026-09-05.txt"
```

**3. Edit `.env`** and replace the two lines. Keep the quotes, change nothing else — in particular leave `DATABASE_URL` alone.

**4. Restart the application.** Whatever normally starts it; the new values are read at startup.

**5. Verify, in this order.** Each of these was demonstrated in the rehearsal.

```bash
curl -s http://127.0.0.1:3000/api/auth/me
```

- Before signing in it must answer `{"user":null}` — **including in a browser tab that was signed in before the rotation.** That is the old session being refused.
- Sign in with your usual PIN. It must work: **no PIN changed.**
- `curl -s -b <your cookie> http://127.0.0.1:3000/api/auth/me` must now name you.

**If a signed-in tab still shows you as signed in**, it is showing cached client state — reload it. The check that matters is the `/api/auth/me` body, not the screen.

**What to tell Claude afterwards**, so the plan stops saying it is pending: that the rotation is done and the date. **Do not send the values.**

**If something goes wrong**, put the copy from step 2 back and restart; the old secret starts working again immediately, because nothing about it is stored anywhere else.

---

---

# COMPLETED REMEDIATION HISTORY

*Moved verbatim from `REMEDIATION_PLAN.md` lines 2357–2378 (commit `5f0c2b1`) on 2026-09-04. Nothing in this section has been rewritten; corrections, if any, are appended dated notes.*

*Row order is as it was: 0.1, 0.2, 1.1, then 3.6 down to 1.2, because later sessions inserted above rather than appended. New rows go at the bottom, one line each: batch, status, date, commit, one sentence.*

| Batch | Status | Date | Commit | Notes |
|---|---|---|---|---|
| 7.3 | COMPLETED (rotation handed over) | 2026-09-05 | `d937ef2` | L-04 was already closed by Batch 2.4 — the standalone tree is gone, does not regenerate, and never entered git. A sweep found the live secrets in `.env` and nowhere else. The rotation is rehearsed end to end and handed to the operator; **it is not yet done**. Two wrong conclusions during the rehearsal, both caught by measuring again. **Completes Stage 7.** 798/0. |
| 7.4c | COMPLETED | 2026-09-05 | `9e8e4e7` | L-45, L-31, L-19, L-24 and L-32. C-15's shape closed at its fourth site; a failed catalogue seed is no longer reported as success; VAT rates display exactly; the test timeout is no longer something to remember. **793/0 with no flags**, four reverts all caught. Completes Batch 7.4. |
| 7.4b | COMPLETED | 2026-09-05 | `215d9fd` | L-33 (DD-22), L-30. Two gates narrowed so the API matches the navigation; all 76 authenticated handlers classified in a table the tests check. L-30 fixed without removing the burn. 782/0. **My first test for L-30 passed under its own revert** — a timing threshold — and was rewritten to assert the 503 the finding names. |
| 7.4a | COMPLETED | 2026-09-05 | `807e0c5` | L-48, L-44 (DD-21), L-50 (DD-20). *A period books the corrections it issued* now holds in all nine aggregation callers; a give-away is visible without being a sale; the sealed close payload grew for the third time, possible only because zero closes exist. 776/0, six reverts all caught. Two of my own assertions were wrong about the code — a correcting period contributes a negative count. |
| 7.2 | COMPLETED | 2026-09-05 | `97c74fb` | L-01, L-03, L-07, L-08, L-12, L-29, APPROVE-DEAD. Four files, one dependency and seven dead exports removed; −428 lines. Two of L-07's ten entries were wrong and were left alone. Batch 5.6's tripwire fired and was amended stronger, three reverts all caught. Ten screens smoke-tested on a marker-proved scratch copy, zero console errors. **L-33 not closed** — a review, not a mechanical fix. |
| 7.1 | COMPLETED | 2026-09-05 | `b2262bf` | DOC-01…DOC-08, DOC-10, DOC-11, DOC-12 — every DOC item. Documentation only; 763/0 unchanged. Two of the four code comments it was told to fix needed no change and one claim about them was wrong; DOC-11's re-check reversed its answer; the README's opening conformity claim was qualified, not deleted; `IMPLEMENTATION_PLAN.md` gained an appended Appendix D with eight corrections plus a ninth found while writing it. Opened L-51. |
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
| 4.3 | COMPLETED (C-18 `◐`) | 2026-09-04 | `aac03f6` | C-18 + M-23 + M-27 + M-28, on two operator decisions. **DD-06 answered — no LAN access**: the server binds `127.0.0.1`, and the measurement corrected the plan's own framing, which called the previous state "protective by accident". It was not: in a browser at the LAN address login returned 200 and the session silently never stuck, while unauthenticated `profiles` and `login` answered over the LAN perfectly well — the broken `Secure` cookie blocked the staff and no attacker. **M-23**: `PUT /api/users/[id]` let any caller rewrite their own `pin` and `active` with no current PIN, so anyone at an unlocked till could re-PIN the signed-in cashier or switch their account off; proved on the old build (200, hash changed, `active` 0) and now a flat refusal, with self-deactivation refused for everyone including the super administrator. The finding's own "require the current PIN" was **not** built: no self-service screen exists, and the operator decided PINs stay as they are. **C-18**: the seed bootstrap now refuses any database that has ever traded — the counter check catches the C-17 wipe that leaves counts at zero; proved on the old build, where a wiped copy with counters at 20/3/2/2 handed out a fresh SUPER_ADMIN with the published default PIN. **Its credential half stays open by decision**, so the finding is `◐` and the residual threat is physical rather than networked. **M-27**: the consumed-token set became a swept map (7 entries where 2 are expected, without the sweep). **M-28**: `Session.device` read the cookie jar, so it was null on every row ever written; now the header, verified end to end on both builds. **No migration.** Recorded L-31. 430/430. |
| 4.4 | COMPLETED (M-19s `DEFERRED`) | 2026-09-04 | `36a9cd9` | C-16 + M-24 + M-25 + M-26, on DD-07's operating model. **C-16**: role gating was client-side only and lived in one place — the shell rendered on `view ===` with no role condition, so any account could type `#/backups` and mount the view with its live controls, and the home dashboard's `?? "MANAGER"` meant a user that failed to load failed **open**. `canAccessView` is now the single gate, defaulting to the least privilege (which is why DD-07 kept `CASHIER` in the product). Proved in a real browser on the same build and data: pre-batch, a MANAGER at `#/backups` got the full *Sauvegardes* view — « Export et restauration des données », live create button — and pressing it returned `403`, which is exactly the audit's "exposure and confusion rather than direct compromise"; post-batch the same navigation renders « Accès refusé » and nothing mounts. Per DD-07 the manager **gained** `settings` and `audit` and **did not gain** `backups`, which holds the restore button. **M-24**: upload had no role gate, believed the client's MIME type and had no ceiling — now MANAGER+, signature-checked against the declared type, 250 MB quota against a ~49 MB live catalogue. **M-25**: customer `PUT`/`DELETE` had no role check at all — now MANAGER+, `GET` left open. **M-26**: CSP, frame, nosniff, referrer and permissions headers, verified on the wire *and* in the browser (85 images, 0 broken, no violations); **no HSTS**, because DD-06 serves plain HTTP on loopback and HSTS would break the till. **T-03 delivered at declaration level**: wrappers now stamp their declared gate, and a test walks all 61 route modules asserting every method is wrapped bar eight named exceptions — status-level coverage stays with 6.1. **M-19s `DEFERRED`**: DD-07 removed its subject. **No migration.** Recorded L-32. 453/453. |

---
| 4.4b | COMPLETED | 2026-09-04 | `45a6fb8` | M-19s, on DD-07's final answer. The owner asked for a **single operational role**, so `CASHIER` left the enum, the `Role` union, both zod schemas, five nav rows, the login screen, the CASHIER-only privilege-escalation guard on `switch-user`, and the CASHIER arms of the discount and refund gates. **Zero `User` rows carried it**, confirmed read-only before the schema changed. **M-19s closes as a no-op by construction**: `GET /api/settings` (SIRET, TVA number, discount threshold) and `GET /api/reports/x` were open to any authenticated caller while their writes were SUPER_ADMIN and MANAGER+; raising both to `["SUPER_ADMIN", "MANAGER"]` makes read and write agree without changing what anyone can do — which is the point, and is only possible because the role that made the fix breaking is gone. **Whether a migration was needed was measured, not assumed**: `prisma migrate diff` printed an empty migration both before and after the schema edit, so the enum really is app-level TEXT and **nothing waits on the operator**. Two consequences were carried deliberately and written down rather than hidden — `LEAST_PRIVILEGED_ROLE` degrades `CASHIER` → `MANAGER`, one rung weaker but still refusing `users` / `backups` / `logs`; and the approval machinery is **dormant, not deleted**, because 4.4c reuses it. Two test assertions were **revisited, not deleted**: the floor property in `nav-access.test.ts`, and the destructive-route table in `api-authorization.test.ts`, which now pins each declared role list — stronger than the vacuous `not.toContain("CASHIER")` it replaced, and the rewrite is what surfaced L-33. A new `role-model.test.ts` walks all 245 source files and fails if the role returns; 4 of its 7 tests were proved to fail against a deliberately reintroduced role, then the files were restored from copies. Manual walkthrough on a scratch copy and in a real browser: the manager takes payment, discounts 40 %, refunds with no token, reprints, opens all 14 entitled views and is refused the other three; production `db/custom.db` byte-identical throughout. Recorded L-33, L-34, L-35. 461/461. |
| 4.4c | COMPLETED | 2026-09-04 | `d9b1b08` | DD-19, plus L-34, L-35 and — unplanned — the audit's own **M-17** and **M-18**. A discount above the configured threshold and **every** refund at any amount now require the signed-in operator to re-enter **their own** PIN; until this batch both were self-approved with no keystroke, so an unattended till would take a 100 % discount or refund the day's takings from anyone who walked up. Re-authentication, not second-person approval: with one operational role (DD-07) `/api/auth/approve` forbids self-approval and can never succeed, so a distinct `POST /api/auth/step-up` was built — reusing Batch 4.1's lockout (**one shared counter**, five attempts in total), Batch 4.2's bounded scrypt queue, and `approvals.ts`'s signed single-use amount-bound token, which now must **name the caller**. Four implementation choices were put to the operator and answered: replace the old manager token rather than keep both; close M-18 here rather than in 5.7; **no change to the sealed journal payloads** (a “PIN was typed” flag would be true on every record and would create a third vintage — the audit log carries the deliberate act instead); keep 5 wrong PINs / 15 minutes, accepting that five fumbles cost fifteen minutes of refunds. L-34 and the banner it sits under (L-35) both closed — the discount dialog showed a real 40 % as « 0.4% » and promised an approval that no longer happened. **No migration; nothing waits on the operator.** Five-revert negative control, with two tests strengthened when it showed they proved less than they claimed. Validated on a scratch copy through the routes and the real UI; production untouched at `7839db18…`. Recorded L-36. 482/482. |
| 4.5 | COMPLETED | 2026-09-04 | `1a0836b` | DD-08's six parts, closing C-17, L-37, L-38 and DOC-09: deleted `port-real-data.ts` (which wiped production by a hardcoded path, defeating the scratch-copy method) and `seed-category-options.ts`; rebuilt `seed-users.ts` as a delete-free PIN reset with both published defaults refused from `src/lib/auth.ts`; guarded both counter scripts against lowering any of four counters via the tested `fiscal-counter-floor.ts`; made every script dry-run-by-default; brought `scripts/` under `tsc` and `eslint`; rewrote `scripts/README.md`. 498/498 tests. Production untouched; no migration. Retired 6 656 bytes of plan front matter, bringing it under its ~40 KB ceiling. |
| 4.6 | COMPLETED | 2026-09-04 | `974372e` | C-24 and C-25, both HIGH catalogue data-loss. Category PUT no longer validates entries after `deleteMany` — one malformed option group used to destroy a category's sauces and breads and return 200 (proved on the real `Sandwichs`: 4 groups, 19 choices deleted); `productSchema.options` no longer defaults to `[]`, so a PUT omitting it no longer wipes a product's option groups. Media usage scan and delete-time cleanup now cover all six image columns from one declaration instead of three each — 30 of 124 referenced images (the whole condiment catalogue) displayed as unused — and `DELETE /api/media` journals `MEDIA_DELETED`. 531/531 tests, eight one-property reverts. Production untouched; no migration. |
| 4.7 | COMPLETED | 2026-09-04 | `951e14c` | C-15's shift-race half, closing C-15 and finishing Stage 4. Shift state was read outside the transaction at **three** sites, not the audit's two: the checkout looked up the open shift 150 lines before it wrote anything, `generateZReport` totalled the shift and only then opened the transaction that closed it, and the refund route read `order.shift.status` before `processRefund`. Measured first: Prisma's interactive transactions on SQLite do not overlap, in either journal mode, while reads outside a transaction do not wait — so the checkout re-asserts `OPEN` as the first statement inside its transaction (body moved to new `services/checkout.ts`), the Z report is computed inside the transaction that seals it, and the refund re-reads under the lock. Duplicate-Z and shift-status refusals became a typed `ZReportError`; `POST /api/reports/z` answered 500 to a duplicate close and now answers 409. Six sales racing one close on a copy of production: the old code left 7 orders in a shift whose immutable Z counted 5, losing 3,00 €; the new code counted 8 of 8 and refused four sales in French. 543/543. |
| 5.1 | COMPLETED | 2026-09-05 | `8a4429a` | C-20, the one Stage 5 batch needing no design decision — and it held one anyway. The matcher compared an optional `boolean | undefined` against the event's real boolean with no coercion, so `undefined !== false` was true on the ctrl line for every shortcut on every keystroke: not one of the nine had ever fired since the initial commit, `Shift+?` included. `!!s.ctrl !== e.ctrlKey` and the same for shift and alt is the plan's own fix, and it revived nine presses of ten. The tenth is this restaurant's: Windows reports `/` on the French AZERTY layout as vk `0xBF` **with SHIFT**, so the strict matcher would have refused the documented `/` search key at the till it was written for. Operator answered **register it both ways**, and a second `{ key: "/", shift: true }` sits beside the plain one — the two cannot collide, because QWERTY `Shift+/` emits `?` and AZERTY `Shift+:` emits `/`. Running the app then found a second dead thing behind C-20: `pos-view.tsx` declared a `searchInputRef` it never attached, the real input being the topbar's, so F1 and `/` fired into a no-op; operator answered **fix it in this batch**, and both files now reach the input through a shared `POS_SEARCH_INPUT_ID`. Seventeen one-property reverts in three directions, until all 25 new tests had failed under something; 9 of them are named in the file as regression assertions that cannot fail against the old code. Manual walkthrough on a scratch copy in a real browser: every row of the help dialog does what it says, Échap included, and F5 no longer reloads the page. Production untouched; no migration. Recorded L-42. 568/568. |
| 5.2 | COMPLETED | 2026-09-05 | `1abde1f` | C-21, by **withdrawal** rather than wiring (DD-09: this restaurant does not serve at tables). The floor-plan screen left the navigation and the README; the `Table` model, the three `/api/tables*` routes, the checkout auto-link and the refund release stay, unused and now commented as such. Removing the `NAV_ITEMS` row is the gate — `canAccessView` refuses a view with no row, and the home grid filters on the same array — and `tables` also left the `AppView` union, so `#/tables` resolves to nothing rather than to *« Accès refusé »*, and the compiler carried the removal into `app-shell.tsx` and `home-dashboard.tsx`. **The batch's own *Validation Required* was the trap**: all six criteria assumed a table picker was being added, so they were re-derived in place — one void, two halved into automated tests of the server side DD-09 kept, one inverted, one widened, one kept — and the originals are reproduced in the record beside what replaced them. Two integration points the handoff had not named turned up, one of them a second test walking `NAV_ITEMS` that goes red rather than shrinking silently; it was inverted, not deleted. **5 of the batch's 10 tests fail against the pre-batch tree and 5 cannot**, which is inherent to a removal and is said plainly rather than implied. Fourteen one-property reverts in both directions, one of which failed nothing and exposed an unfalsifiable assertion that was replaced. Manual walkthrough on a scratch copy in a real browser. The stale production `T1` row was **not** requested as an operator action; Batch 8.0's *What must be KEPT* list is amended instead so P-04 sweeps it. Production untouched; no migration. Recorded **L-43**. 578/578. |
| 5.3 | COMPLETED | 2026-09-05 | `3917f3a` | C-14, on DD-10: yesterday's sale is refundable today, out of today's till. The refusal lived at two sites and lifting both was **the small half** — `aggregate.ts:182` sourced a period's refunds from the refunded ORDER while `computeShiftReport` selected orders by `shiftId`, so today's report never selected yesterday's order and today's `expectedCash` would have been short by the cash handed over the counter, with the drawer down and no report accounting for it. So this was a change to **Batch 3.2's unified aggregation**, stated once as *a period books the sales of its own orders and the corrections it issued*: an order refunded by a LATER period contributes the DIFFERENCE between its state before and after, so shifts, months and years telescope and a sealed close still equals the sum of the Z reports inside it. All five of 3.2's callers moved together; the four **non**-fiscal reports 3.2b unified were deliberately left, because attributing a cross-shift refund by cashier or by product is a decision nobody has been asked (**L-44**). Two traps inside the difference, both tested and both caught by their own revert: a correction's VAT is the difference of the splits and not the split of the difference — `(−454, −46)` against `(−455, −45)`, one cent, in a document that cannot be corrected — and `Order.status` is CURRENT state, so a full cross-shift refund would otherwise drop yesterday's sale out of yesterday's own report. `Refund.shiftId`'s meaning settled with **zero rows in existence**, and **no migration**, measured two ways with `prisma migrate diff`; `NOT NULL` considered and declined. Eleven one-property reverts, every one failing something; **3 of the 19 new tests cannot fail against the old code** and are named as regression assertions. Batch 4.7's two refund-race tests were **re-derived, not deleted** — the same race, the same 409, a different reason. End-to-end on a scratch copy through the real API: order #15 from a CLOSED shift refunded 10,00 € from the open one, HTTP 201, `expectedCash` 21 580 → 20 580, the closed shift recomputing identically to its sealed Z. **L-43's origin established and deliberately not fixed.** Production untouched at `7839db18…`. Recorded L-44, L-45. 597/597. |
| 3.6c | COMPLETED | 2026-09-05 | `bd08823` | L-27, the last thread Stage 3 left open. `assertNoOpenShiftInPeriod` matched only shifts whose OPENING fell inside the period being sealed — DD-18's scope, faithfully built by 3.6b — and the scope was the defect. **The finding's own row understated it**: a caisse whose opening predates the earliest period being sealed matches no period's window, so it blocked **no** close, ever, not merely the first; DD-05's sequencing does not catch it, because that caisse failed to block the previous period on the same reasoning. Live on production data when found — caisse n° 3, opened 2026-08-28 02:24, still OPEN, holding an order created 2026-09-01 — so sealing September would have passed while September's takings sat in a caisse with no Z report, leaving Batch 3.2's reconciliation uncheckable in a document that cannot be corrected. Widened on the operator's answer to **any** caisse still OPEN; the message lost its *« ouverte pendant »* clause, which was false for exactly this case. **The one existing test it broke was the right one and was inverted, not deleted** — it asserted DD-18's scope in as many words, and its original is quoted above the replacement. Six further tests, including the over-refusal control that must NOT fail. Three one-property reverts. Walkthrough through the real `POST /api/fiscal/close-month` on a scratch copy: 409 with the new wording naming caisse n° 3, and August sealing normally once every caisse was closed. **No migration.** Production untouched at `7839db18…`, still zero closes. 603/603. |
| 5.4 | COMPLETED | 2026-09-05 | `4bb7cda` | C-23, shrunk to its two unambiguous halves by DD-11 (one till, so held orders stay device-local — no server model, no API, no migration, and one of the six validation criteria struck as void). **(1)** Nothing cleared the cart when the person at the till changed: `logout` set `user: null` with a bare `set()` and did not touch it, so cashier B inherited A's open ticket AND A's parked tickets and rang them under B's name. A pure `operatorChanged(prev, next)` now decides — `null → someone` is the page refresh and KEEPS the cart, while `someone → null`, `A → B` and a failed session clear it — and `setUser`, `logout` and `fetchUser` all consult it. `clear()` still spares held tickets; `clearForOperatorChange()` takes them. **(2)** The persisted cart had no version guard, so a cart written before `720660a` rehydrated euros into cent fields. **The part worth reading: `version` + `migrate` — what the audit's own direction asks for and what the zustand docs show — does NOT close it.** zustand 5.0.10 only migrates when `typeof storedVersion === "number"`, and a euros-era payload has no `version` key at all, so it hydrates verbatim and `migrate` never runs for exactly the payload the finding names. Found by loading the real module against a stubbed `localStorage`, not by reading; the version is now stamped inside the state and checked in `merge`. Sixteen one-property reverts, and **all 26 new tests fail under at least one — no regression assertions to disclaim**. One revert failed nothing and exposed a missing round-trip control. A second defect (`fetchUser` bypassing the guard) was found by walking the app. The browser walkthrough could not reach the POS view; the pre-batch build was rebuilt and behaved identically, so it is **L-47**, not a regression. No migration; no production data touched. 629/629. |
| 5.5 | COMPLETED | 2026-09-05 | `51af203` | M-05 on DD-12: entrée / sortie de caisse, four fixed categories, because prose reasons cannot be totalled. **The finding in one line**: `expectedCash` was `openingFloat + cash − cashRefunds` and there was no model of any kind for cash moving otherwise, so a 200 € supplier payment produced a phantom 200 € shortfall at every close — which trains staff to ignore the variance figure and defeats C-02. On a till where every payment ever taken is cash, not a corner case. The amount is **signed** rather than a magnitude plus a flag, because an *erreur de caisse* goes both ways and a flag would let a row contradict its own category. The till is resolved **inside** the transaction (C-15 at a fifth site); a `MOUVEMENT_CAISSE` event is journalled; the perpetual `GrandTotal` is deliberately **not** touched, because a movement is not a sale. One pure `aggregateCashMovements` serves both period scopes (Batch 3.2's rule), a shift books what it did and a date range what happened inside it (Batch 5.3's rule), and three columns land on `ZReport`, `MonthlyClose`, `AnnualClose` and the `CLOTURE_Z` payload. **The PIN gate is the DIRECTION of the money, not the category name** (operator, 2026-09-05), so a negative *erreur de caisse* is gated and a positive one is not. **Batch 3.6b's payload tripwire fired as designed** — the sealed close's `dataJson` gains three keys, safe only because zero closes still exist, re-verified the same day; the `CLOTURE_M`/`CLOTURE_A` EVENT payloads are still untouched. **A defect in this batch's own code was found by driving the API**: a negative `APPROVISIONNEMENT` was answered *« Confirmation par code PIN requise »* for a request whose real problem was the sign, burning a single-use token — L-41's shape, fixed here with a pure `categorySignRefusal` the route runs before the token. **Migration rehearsed** after an out-of-band snapshot: both sealed Z reports survived the `ZReport` table rebuild byte-identical, chain, counters, catalogue and FK/integrity checks all clean; **handed over, not applied**. Twenty one-property reverts; 21 of 26 tests fail under at least one, and the four that do not are named as two controls and two regression assertions. Walkthrough on the migrated copy: +50 € accepted with no PIN, −200 € refused 403 without one and 201 with, `expectedCash` 21 580 → 6 580, and Z#3 sealed with **zero variance**. The UI dialog could not be walked (**L-47**). Production untouched at `7839db18…`. 655/655. |
| 5.6 | COMPLETED | 2026-09-05 | `1bb8a48` | M-08 on DD-13: there is no pre-payment order state, so `enum OrderStatus` loses `PENDING` and `CANCELLED` — neither ever written — with the permanently-zero `cancelledOrders` counter and a badge `default` arm reading « En attente » that was how two screens implied the state existed. **The risk was a name collision, not scope**: `Receipt.printStatus` is a plain String defaulting to "PENDING" on all 20 production receipts, so a `grep PENDING` removal breaks receipt creation — the new `order-status.test.ts` allowlists those sites and fails in both directions. No migration (measured three ways); the query filter narrowed deliberately, `?status=CANCELLED` answering 400 instead of an empty list. |
| 5.7a | COMPLETED | 2026-09-05 | `982168c` | DD-15's two removals, M-09 and M-10, the first slice of the split 5.7. `AddOn` and the `ProductAddon` join go with everything only they could reach — two API route files, the 446-line **« Suppléments » screen** and its nav row, `addOnSchema`, `SEED_ADDONS` in **both** seed files, and the `productAddons` include in four more places; `Customer.postalCode` goes with zero code to change. **The risk was `addon` naming two things**: the dead `AddOn` (0 rows) and the live `CategoryAddOn` (21 rows) shared one `addonMap`, one request field and consecutive lines of `IMAGE_COLUMNS` — and the surviving media scan **was** deleted beside the dying one before `eslint` caught it, which would have been C-25 all over again. Two earlier tripwires (C-25's column count, C-21's view table) fired and were amended, not silenced. Migration rehearsed with a 107-line fingerprint diff: both `Customer` rows and the 2 orders referencing one survived. |
| 5.7b | COMPLETED | 2026-09-05 | `5ccc964` | M-11 on DD-14: « Offert / repas personnel », the give-away tender, so a staff meal or a comp can reach the till at all. **The revenue guarantee is structural**: an OFFERT line carries 0, must be the only line, and requires a zero total — take any one away and it books revenue nobody collected, which one test demonstrates by going around the rule and measuring the hole (1000 booked, 500 collected). Only ONE of the two walls the batch named came down; the equality check keeps working and is what makes a zero total settleable only by OFFERT. VAT at zero was already true and was measured, not changed. Two reverts caught nothing on the first pass — a schema revert without `prisma generate` (a no-op, 8 failures once regenerated) and M-11's own wall, which had no test until this batch added one. L-49 and L-50 opened. |
| 5.7c | COMPLETED | 2026-09-05 | `9304d58` | M-19, M-12, M-15, M-16 and L-41 — pricing and validation, no migration. **M-19 survived because the tests built the shape the dialog never produced**, so the mapping was extracted from the component into `toCartOptions` and every case goes through it; `CartOption` gains `dineInPriceModifier` and the persisted version goes 1 → 2. M-15 **refuses** a negative unit price rather than clamping (a clamp sells the item free and silently); measured first — zero negative modifiers exist and the three absolute-priced choices resolve to 0, +300, +700. M-16 bounds quantity at 99, grounded on a measured maximum of 2. M-12 corrected the comment, not the code. L-41 is **narrowed, not closed** — the in-transaction assertion is still the guarantee. **All 19 new tests fail under some revert, including the control.** The walkthrough caught M-16 answering in English (L-22's class) and it was made French. |
| 5.7d | COMPLETED | 2026-09-05 | `d922ce0` | M-20, M-21, M-22 and L-42 — POS resilience, and **the end of Stage 5**. M-21 is the one that loses money: `fetchUser` folded EVERY failure to null, which cleared the cart, so a network blip destroyed the sale in progress. Three cases now — a 401 or an explicit `{user:null}` signs out and clears; anything else keeps the operator AND the basket. L-42 suppresses every shortcut while a modal is open (Escape stays Radix's, asserted by a sweep). M-20 tests the failure branch BEFORE the empty one, which is the whole finding. M-22 adds a per-view boundary — with an `inline` variant, or the fix would have been the symptom — and the App Router `error.tsx` that never existed. **Every inherited criterion was Manual and L-47 blocked all three; each was converted, per 5.4's precedent, and the file says which claims are source-order rather than behaviour.** A fourth tripwire fired and had to be INVERTED: C-23's own test asserted that any failure ends the session. |
| 6.1 | COMPLETED | 2026-09-05 | `a8734f4` | T-01 through T-07 — and the **request harness** they were actually waiting for. Six batches since 4.4 wrote "driving a route needs a request scope, which stays with 6.1" into their own files; `route-harness.ts` stubs `next/headers` and signs in with the app's OWN `createSession`. T-02's nine cases then close the audit's "classic POS fraud vector" by driving `POST /api/orders` and proving it REFUSES. T-05 writes through the real checkout and asks the aggregation — C-10's class. T-06 injects a LATE failure and proves the rollback takes the receipt number with it. T-07 covers two simultaneous checkouts and concurrent refunds. T-01, T-03, T-04 closed on evidence, not rewritten. **765 pass; 27 of 28 new tests fail under some revert.** Two of the batch's own assertions were wrong about the code and measurement said so. **No application code changed.** |
| 6.2 | COMPLETED | 2026-09-05 | `6201e4d` | T-08, T-09 and **L-02, done together as both rows instruct**. T-08's six `checkoutSchema` cases were **re-pointed at the live route, not deleted** — measured first, four of them named real behaviour with NO other cover, so deleting would have reduced coverage. The move added a seventh. T-09's refunds assertion passed an EMPTY array and could not fail; it now passes real refunds, and the vacuity was **demonstrated** with a conditional regression under which the old assertion passes and the new one fails. `cart-store.test.ts` removed with its one unique case moved. 765 → **763**, and every unit of the −2 is accounted for. A third name collision found: `CheckoutInput` existed dead in validation.ts and live in checkout.ts. |
| 6.3 | COMPLETED | 2026-09-05 | `71324f2` | T-10, T-11, T-12, L-06, L-40, L-43 — **and Stage 6 with them**. Guards first: `test-setup.ts` ABORTS unless the database is under temp, and `vitest.config.ts` throws at import so `bunx vitest` cannot reach one at all. Per-run database path closes warning 3b; **L-43 fixed as its own row prescribes** — the eleventh promise is now asserted — and the suite ran **763/0 three times with no flake**, from ~2 failures in 5. T-10 gave Playwright its own disposable database, its own port and the production build, with a **marker-proof spec that runs first**. The suite had never actually been run: seven specs failed and not one was a regression. **Batch 4.1's rate limiter refused the suite and the SUITE changed**, not the limiter. e2e 13 passed twice; `db/custom.db` byte-identical. **L-47 does not reproduce and my hypothesis for it was falsified** — recorded as not-reproducible, not fixed. |
| 3.7 | COMPLETED (L-52 left open) | 2026-09-06 | `203848e`, `c3ce9e9`, and the closing commit | L-53, L-54; L-52 searched and left open. **The software states its version** on every ticket, in the archive, on the fiscal screen and in `GET /api/fiscal/verify` — a `package.json` import passed every test and shipped the dependency list to the browser, measured and replaced. **The seven research questions answered from official sources** (`docs/conformite-isca-recherche.md` § 9): the attestation route is valid to 31 Dec 2026 and then depends on an unpublished décret; no restitution format exists; « prévoir » means provide; BOFiP § 170 says the perpetual total must be *recorded* at each close and it is not (**L-57**, before the first real close). **The ISCA map** (`docs/conformite-isca-map.md`) maps every sub-requirement to `file:line` and found L-55–L-58. 803 → **820/0**; fifteen reverts, all caught after one assertion was corrected. Stage 3 closed again. |
| 3.8 | COMPLETED (migration NOT applied) | 2026-09-06 | (this commit) | DD-23, DD-24, L-54's second half and **L-57**. **A sealed `Clôture du jour`** on a trading-day clock that governs the month and the exercice too, so a service past midnight sits in one day and one month and no two sealed documents disagree; the till still refuses nothing, which the operator chose. **L-57**: BOFiP § 170 requires every close to record the perpetual total and none did. **Twenty reverts, nineteen caught — R11 SURVIVED and found that the Z report had been missed**, so L-57 was three-quarters asserted; fixing it turned seven unrelated cases red on an `onDelete: Restrict` the reset helper ignored. Seven tests in five other files amended deliberately, and the two timing ones found a refusal message that named the day where the truth was the hour. Migration rehearsed: **12 fingerprint lines differ, all schema, not one data row**. Walkthrough on the production build: eight trading days sealed, **the day closes sum to the Z reports exactly** (47 880 / 20 / 4 370) and August equals the sum of its days. 820 → **857/0**. |

# RESOLVED FINDINGS

*Rows moved verbatim from *Newly Discovered Issues* in `REMEDIATION_PLAN.md` (commit `5f0c2b1`) on 2026-09-04; each was resolved by the batch named in the row and is also recorded in that batch's status record above. Source lines: 2340, 2342, 2344, 2345, 2346, 2348, 2350. When a later batch resolves an open row, move the row here unchanged.*

| ID | Date | Found during | Description | Severity | Assigned to batch |
|---|---|---|---|---|---|
| **L-54** ✅ **RESOLVED in Batch 3.7** (2026-09-06 — as a mislabel and a missing notice; the refusal is DD-23) | 2026-09-06 | French-law gap check | **The Z close is per SHIFT, and the code calls it the « clôture journalière » — they are not the same thing.** BOI-TVA-DECLA-30-10-30 (25/03/2026) requires that the software provide "obligatoirement une clôture journalière et une clôture mensuelle et annuelle […] **Ces trois échéances sont cumulatives et impératives**". HibaPOS has all three, and the monthly and annual ones are genuinely calendar-keyed. The daily one is not: `generateZReport(shiftId, …)` seals a **shift**, and `reports.ts:226` labels that seal *"clôture journalière scellée (ISCA conservation)"*. Measured 2026-09-06: **nothing anywhere keys a close to a calendar day**, and nothing prompts or records a day that ended without one. Three realistic divergences: a service running past midnight produces **one Z covering two calendar days**; a day worked under two shifts produces two (harmless, arguably better); and **a trading day where the till is simply never closed produces none at all**, with nothing to surface the omission. Whether "prévoir" is satisfied by providing the mechanism, or requires the software to ensure the day is closed, is a question for a fiscal professional — but the code comment asserting the two are equivalent is a claim the code does not support, which is exactly the class Batch 7.1 existed to clear. | MEDIUM (a mandatory close may be missing or mis-scoped; latent while one shift = one day) | **3.7** — **fixed 2026-09-06 as far as the research allows**: « prévoir » means provide, not force, and no source accepts or rejects a per-shift close (research § 9.5), so the mislabel is corrected, the operator is told on the shifts screen, and a till that crossed midnight is flagged; **refusing sales after midnight is DD-23**. *Measured on production: Z #2 covers five calendar days (08-21, 23, 24, 27, 28).* Row moves to the record when the batch completes |
| **L-53** ✅ **RESOLVED in Batch 3.7** (2026-09-06) | 2026-09-06 | French-law gap check | **The software never states which version it is — not on the ticket, not in the UI, not in the archive — and the entire attestation regime is version-matched.** BOFiP: the attestation is individual and nominative, and the assujetti must hold the one "correspondant à **la version** du logiciel ou système de caisse qu'il utilise"; BOI-CF-COM-20-60 says a control verifies exactly that correspondence between versions held and attestations held. Measured 2026-09-06: `package.json` declares `0.2.1` and **nothing in `src/` reads it**. `renderReceipt` prints the restaurant's name, address, phone, SIRET and TVA number and **no software identification at all** — `receipt.ts:49` uses `"HibaPOS France"` only as a fallback for a missing `restaurantName`, so on this install, where the name is set, the software is never named on a ticket. The annual archive carries `format: "hibapos-fiscal-archive", version: 2`, which is the **archive schema** version, not the software's. Consequence: at a control the operator cannot demonstrate which version is running, and after an update nobody can tell whether the attestation on file still corresponds. Note V-03 already listed "software identification" as an open question about receipt contents; this is the measurement behind it. Cheap to fix and worth doing before any attestation is signed. | MEDIUM–HIGH for the attestation route (the operator cannot evidence version correspondence, which is the one thing a control checks) | **3.7** — **fixed 2026-09-06**: ticket, archive, `GET /api/fiscal/verify` and the fiscal screen all state `HibaPOS France v0.2.1`; row moves to the record when the batch completes |
| **L-57** ✅ **RESOLVED in Batch 3.8** (2026-09-06 — the perpetual total is now recorded in the Z, the day, the month and the exercice; the revert protocol found that the Z had been missed) | 2026-09-06 | Batch 3.7 (the research) | **The perpetual total is written into no close, and BOFiP says it must be.** BOI-TVA-DECLA-30-10-30 § 170 (25/03/2026), verbatim: « Pour chaque clôture, des données cumulatives et récapitulatives, intègres et inaltérables, doivent être **calculées et enregistrées** par le logiciel ou système de caisse, comme le cumul du grand total de la période et **le total perpétuel** pour la période. » (research § 9.5; the LNE referential's Exigence 7 says the same). Measured 2026-09-06: the `CLOTURE_Z` payload (`reports.ts:247-271`), the `ZReport` row, and the `MonthlyClose` / `AnnualClose` `dataJson` (`fiscal.ts` `PeriodAgg`) carry the **period's** figures only; `GrandTotal` is a live singleton (`schema.prisma:659`, `fiscal.ts:109-136`) snapshotted **only into the annual archive** (`fiscal.ts:714`). So no sealed document records what the perpetual total was when the period closed. Fix: seal `GrandTotal`'s figures (sales, orders, VAT, per tender, refunded) into the Z, monthly and annual payloads and rows. **Do it BEFORE the first real close** — DD-20's reasoning: zero monthly/annual closes exist and P-04 resets the two test Z reports, so today it costs nothing; after the first real close it is a second payload vintage in a document that cannot be corrected. `close-timing.test.ts` pins the key list and must be amended deliberately. Not fixed in 3.7 (safety rule 10: a change to a sealed payload is not a version-label batch's business). | MEDIUM (a stated BOFiP requirement, unmet; cheap now, permanent later) | ****3.8** — opened 2026-09-06 for exactly this, beside the day close, because both change the same sealed payloads and a second change after the first real close would be a second vintage. **Must precede Batch 8.0's reset and the first real Z** |
| **L-50** ✅ **RESOLVED in Batch 7.4a** (2026-09-05) | 2026-09-05 | Batch 5.7b | **`aggregate.ts`'s `isFullyRefunded` classifies a ZERO-TOTAL order as fully refunded, so a give-away is silently dropped from `salesCount`, `itemsCount` and `topProducts`.** The function opens `if (refundsTotal >= order.total) return true;` and for a zero-total order that is `0 >= 0`. **The branch was unreachable before Batch 5.7b** — zero-total orders could not be checked out at all (M-11) — so its meaning was never tested against this case, and "given away" is not "refunded". **The effect is benign and that is measured, not assumed**: it under-counts and can never inflate anything, which is 5.7b's own criterion; `salesTotal`, `cashTotal`, the Z report, the sealed close and the grand total's money columns are all unmoved either way, and a test pins `salesCount === 1` for a paid sale plus a give-away. What it costs is reporting: **a meal given away never appears in the product breakdown**, which is mildly at odds with DD-14's stated reason for a dedicated tender ("keeps what was given away separable from what was sold") — separable at the payment level, invisible at the product level. Fixing it means editing **Batch 3.2's unified aggregation**, a fiscal core, for a reporting question nobody has been asked; whether a comp should count as a ticket, and whether its items belong in `topProducts`, are both decisions (safety rules 10 and 11). Entirely latent today: zero offert orders exist on production. | LOW (under-counts only; no fiscal document is affected) | **7.4** — opened 2026-09-05 for exactly this. 6.1 completed 2026-09-05 without it — a coverage batch, not a semantics change. Needs a reporting decision before any batch can carry it |
| **L-48** ✅ **RESOLVED in Batch 7.4a** (2026-09-05) | 2026-09-05 | Batch 5.6 | **`/api/shifts/summary` computes `expectedCash` without Batch 5.5's cash-movement term, so it and `GET /api/reports/x` disagree for the same shift as soon as one movement exists.** `shifts/summary/route.ts:69` is `openingFloat + grossCashTotal - cashRefundsTotal`; `reports.ts:133` is the same expression **plus `cash.net`**, which is M-05's whole point — before it, a 200 € supplier payment showed as a 200 € shortfall at every close. **Measured, not inferred**, on a scratch copy of production during 5.6's walkthrough: with zero movements the two endpoints both answered **21 580**; after a single +50,00 € approvisionnement they answered **21 580 and 26 580**. This is M-14's *"a fourth aggregation semantic"* reopening at the exact endpoint M-14 was about, and it is the one of Batch 3.2's five aggregation callers that Batch 5.5 did not carry across — 5.5's record names all five as moved, and this one was not. **Latent today, for one reason only: `/api/shifts/summary` still has no client caller** (recorded at Batch 3.2, re-verified by grep in 5.6 — nothing in `src/` fetches it), so no screen shows the wrong figure. That protection ends the moment anything wires the live shift panel up, which is what the endpoint exists for. The fix is one term, and it should come with the assertion that the two endpoints agree — `report-agreement.test.ts` is where that kind of claim already lives. Not fixed in 5.6, whose scope is the dead counter beside it and not the arithmetic (safety rule 10). | MEDIUM (two figures for the same till; latent while the endpoint has no caller) | **7.4** — opened 2026-09-05 for exactly this. 6.1 completed 2026-09-05 without it. A one-term fix plus the agreement assertion, still open |
| **L-45** ✅ **RESOLVED in Batch 7.4c** (2026-09-05) | 2026-09-05 | Batch 5.3 | **`POST /api/shifts` reads its single-open-shift guard outside the transaction that creates the shift** — `db.shift.findFirst({ where: { status: "OPEN" } })` at `shifts/route.ts:23`, then `db.$transaction` at `:35`. Two concurrent opens could both pass the guard and both create a shift, which is the **C-15 shape at a fourth site** — Batch 4.7 closed the checkout, the Z report and the refund, and did not name this one. Nothing has ever produced two open shifts (three shifts exist on production, one open), and the till has one operator, so this is latent. It matters slightly more after Batch 5.3, because "the current open till" is now the thing a refund is attributed to: `processRefund` resolves it with `findFirst` + `orderBy: { openedAt: "desc" }`, the same ordering `/api/shifts/summary` and `GET /api/reports/x` already use, so all three would agree on **which** of two open tills they meant — but the second till should not exist. **Update 2026-09-05: Batch 5.5 landed and did NOT widen this.** It asks the same question — "which till is open" — but resolves it **inside** its own transaction, as 4.7 did three times and 5.3 a fourth, so the cash-movement path adds no exposure. `POST /api/shifts` is still the only site reading the guard outside the transaction that acts on it. Fix it the same way. | LOW (latent; no path has ever produced two open shifts) | **7.4** — opened 2026-09-05 for exactly this. 5.5 and 6.1 both completed without it. Still open, still latent |
| **L-44** ✅ **RESOLVED in Batch 7.4a** (2026-09-05) | 2026-09-05 | Batch 5.3 | **The four non-fiscal reports still attribute a refund to the refunded ORDER's dimension, so they can disagree with `/api/reports/sales` for the same date range.** Batch 5.3 moved the five aggregation callers that feed a fiscal document — the X/Z report, the monthly and annual closes, `/api/reports/vat`, `/api/reports/sales` and `/api/shifts/summary` — onto "a period books the corrections it issued". The four Batch 3.2b unified — `dashboard/route.ts`, `reports/cashiers/route.ts`, `reports/products/route.ts` and `customers/[id]/detail/route.ts` — were deliberately left on `orders.flatMap(o => o.refunds)`, because they group by day, cashier, product and customer, and the right attribution there is **a decision, not a mechanical change**: a cross-shift refund plainly comes out of the refunding till's drawer, but whether it reduces the *selling* cashier's takings or the *refunding* one's is a management question nobody has been asked. The consequence is real and is L-23's shape at the four reports 3.2b had made agree: once a refund is paid on a different day from its sale, the dashboard's "today" and `/api/reports/sales` for the same day give two different figures. **Nothing sealed is affected** — no fiscal document reads these. Entirely latent today: zero refunds exist on production. | MEDIUM (two figures for the same period, on screens a manager compares) | **7.4** — opened 2026-09-05 for exactly this. 6.1 completed without it, and 7.2 is dead-code removal, which this is not. Needs a management decision (whose takings a cross-period refund reduces) |
| **L-33** ✅ **RESOLVED in Batch 7.4b** (2026-09-05) | 2026-09-04 | Batch 4.4b | **With one operational role removed, every gate naming `["SUPER_ADMIN", "MANAGER"]` now admits the entire role model — it is no narrower than declaring no roles at all.** Measured after the removal: **29 declaration sites across 26 route files**, including `POST /api/reports/z` (closing the day) and `POST /api/orders/[id]/reprint` (a journalled REIMPRESSION). Nothing regressed — these gates were never wider than they are — but a reader now cannot tell a deliberate restriction from a decorative one, and `api-authorization.test.ts` had been asserting exactly that property via `not.toContain("CASHIER")`, which the removal made vacuous (the test was rewritten to pin each declared list instead). **Two sites are sharper than the rest:** `GET /api/users` and `GET /api/backups` both answer **200** to a MANAGER whose nav entry for those views is deliberately SUPER_ADMIN-only (DD-07), so the API contradicts the navigation. Verified on a scratch copy: `GET /api/users` returns ids, usernames, names, roles and active flags — **no PIN hashes** — and `GET /api/backups` returns the backup list. `GET /api/logs` correctly returns 403 and is the shape the other two should match. This is the same defect class as M-19s at two routes M-19s did not name. Deciding which of the 29 should narrow to `["SUPER_ADMIN"]` is a review, not a mechanical fix. | MEDIUM (authorization declarations no longer mean what they read as; two contradict the nav) | **7.4** — Batch 7.2 read this row and did NOT act on it, because the row itself says deciding is *"a review, not a mechanical fix"*. The two sharp sites are `GET /api/users` and `GET /api/backups`; `GET /api/logs` already answers 403 and is the shape they should match. Narrowing changes who may call an endpoint — safety rule 11 |
| **L-32** ✅ **RESOLVED in Batch 7.4b** (2026-09-05) | 2026-09-04 | Batch 4.4 | **Role gating uses two idioms, and only one is visible to the T-03 matrix.** About twenty routes declare their gate as `withAuth(handler, { roles })`; about twenty others admit any authenticated caller at the wrapper and then refuse inside the handler with `if (user.role !== "SUPER_ADMIN") return 403` — `POST /api/backups`, `DELETE /api/backups/[id]`, `POST /api/users` and `PUT /api/settings` among them. **Neither group is insecure**: the inline checks work. The cost is that `api-authorization.test.ts` cannot see the second group, so the declaration-level matrix is complete only for the first, and a future route copying the inline pattern inherits that blind spot. Converting them is mechanical but **user-visible**: the inline guards answer « Réservé au super administrateur » while `withAuth` answers « Accès refusé », so a conversion changes the message an operator reads on every one of those routes. Do it as one deliberate change with the message decided, not incidentally. The test pins which idiom each destructive route uses in the meantime. | LOW (test coverage blind spot; no live exposure) | **7.4** — opened 2026-09-05 for exactly this. 6.1 completed without it, and 7.2 is dead-code removal. A test-visibility gap, still open |
| **L-31** ✅ **RESOLVED in Batch 7.4c** (2026-09-05) | 2026-09-04 | Batch 4.3 | **`POST /api/seed` reports any catalogue-seeding failure as a won race.** The catalogue step is wrapped in `catch { return … "Base initialisée (requête concurrente)." }`, so every error — not just a genuine concurrent request — is reported to the operator as success. Observed during this batch's validation: on a copy whose users were empty but whose catalogue was intact, `seedCatalogAndSettings` threw on duplicate category names and the route answered `200` with that message. The two bootstrap users *were* created, so the C-18 behaviour under test was unaffected, but an operator seeing that message cannot tell a real race from a catalogue that failed to seed. Narrower after this batch — the new freshness guard refuses most databases that could reach it — but the swallow-everything catch is still there. Distinguish the P2002 unique-constraint case from the rest, as the users branch above it already does. | LOW (misleading operator message on a bootstrap path) | **7.4** — opened 2026-09-05 for exactly this. 5.7a–5.7d completed without it, and 7.1 is documentation — this is a code fix |
| **L-30** ✅ **RESOLVED in Batch 7.4b** (2026-09-05) | 2026-09-04 | Batch 4.2 | **The unknown-username burn at login competes for the bounded PIN queue, so username enumeration can push honest cashiers to `503`.** `login/route.ts:52` runs a full `hashPin("dummy")` for an unknown user, on purpose, to flatten the timing signal that would otherwise enumerate accounts. Batch 4.2 put that derivation inside the concurrency bound, which is where it belongs — unbounded it is the memory-exhaustion path C-09 names. The residue is that the login rate limit is keyed `login:<ip>:<username>` and, since Batch 4.1 correctly stopped believing the proxy headers, `<ip>` is the constant `"local"`: each distinct username is its own bucket and nothing caps how many buckets a caller can mint. Measured on a scratch copy: **60 simultaneous logins with 60 unknown usernames → 34 served, 26 refused `503`**, and a legitimate login arriving inside that window would have been among the refused. Candidate fixes: a global (not per-username) budget for the unknown-user path, a cheaper constant-time burn, or binding the login limiter to something the caller cannot vary. Interacts with **DD-06** — if the app binds `127.0.0.1` the reachable surface shrinks to the till itself. | MEDIUM (availability of the login screen under a LAN-side flood) | **7.4** — opened 2026-09-05 for exactly this. 4.3 completed 2026-09-04 without it, and Stage 4 closed with it |
| **L-24** ✅ **RESOLVED in Batch 7.4c** (2026-09-05) | 2026-09-04 | Batch 3.5 baseline | **`bun test src` fails 23 tests on a machine this slow, with no code defect involved.** All 23 are timeouts against Bun's 5 s default: 22 in `backup*.test.ts` and 1 in `auth.test.ts`. Measured cause — `scryptSync` at N=2^17 costs **~1519 ms** per call here (N=2^16 costs ~727 ms), and a backup→restore round trip performs several: the archive encrypt, the pre-restore safety-snapshot encrypt, and the decrypt. The cascade that follows is misleading: the test times out, `afterEach` deletes the temp directory, and the still-running `VACUUM INTO` then reports `unable to open database` (SQLITE_CANTOPEN, P2010), which reads like a filesystem or Prisma fault and is not one. `bun test src --timeout 30000` → **340 pass, 0 fail**. Whole-suite runtime is ~192 s against the 25,9 s the plan recorded for the same suite, so this is machine state, not a regression. Established on the untouched pre-batch commit `e86c5e4`. Options: raise the timeout in `bunfig.toml`, or lower the scrypt cost in test runs only — the second must not touch the production KDF parameters. | LOW (test infrastructure; hides real failures behind noise and costs a session an hour to diagnose) | **7.4** — opened 2026-09-05 for exactly this. 6.1 completed without it. **Mitigated, not fixed** — `--timeout 30000`, per the validation-commands table |
| **L-19** ✅ **RESOLVED in Batch 7.4c** (2026-09-05) | 2026-09-03 | Batch 3.1 consumer verification | **The VAT breakdown table renders rates with `toFixed(1)`, which cannot show a two-decimal rate.** `report-widgets.tsx:76` renders `Number(r).toFixed(1) + " %"`, so 10 % displays as "10.0 %" (cosmetic) and a Corsican/overseas rate such as 1,05 % would display as "1.1 %" — a wrong rate on a fiscal report. Pre-existing and **improved** by Batch 3.1 (before the fix, 1,05 % was keyed "1" and lost entirely), and unreachable while every product is at 10 %. Recorded so 3.2/3.4 does not preserve it. Note the display layer, not the key, is what needs fixing. | LOW (latent display defect; not reachable today) | **7.4** — opened 2026-09-05 for exactly this. 3.4 completed without it, and 7.1 is documentation — this is a display fix |
| **L-29** ✅ **RESOLVED in Batch 7.2** (2026-09-05) | 2026-09-04 | Batch 4.1 | **`limitOr429` is exported from `http-rate-limit.ts` and called from nowhere.** Every route reaches for `clientIp` + `rateLimit` directly and builds its own 429 response, so the helper meant to standardise that is dead code — and it embeds the same key shape (`<ip>:<parts>`) whose IP component was the C-08 bypass. It inherits Batch 4.1's fix because it calls `clientIp`, so there is no live risk; the hazard is a future route adopting it and reintroducing an IP-keyed limit without noticing. Either use it everywhere or delete it. | LOW (dead code in a security-relevant module) | 7.2 |
| **L-49** ✅ **RESOLVED in Batch 6.2** (2026-09-05) | 2026-09-05 | Batch 5.7b | **`validation.ts`'s `checkoutSchema` and `paymentSchema` are a parallel copy of the checkout schema that the server never runs, and `validation.test.ts` exercises the copy.** The live schema is `checkoutIntentSchema`, declared inline in `orders/route.ts`. Nothing imports `checkoutSchema` outside the test file — measured. So a test asserting "a checkout with no payments is refused" proves it of a schema no request ever reaches, which is precisely the shape **T-08 / T-09** (Batch 6.2, *remove misleading tests*) exists to clear. Batch 5.7b kept the two in step by hand and commented each with which is which, rather than letting them diverge further — but hand-syncing two copies is the defect, not the fix. Two directions, both decisions: delete the unused pair and move its assertions onto the route's own schema (which needs the schema exported or extracted), or make the route import it. **Latent by nature** — it costs nothing at runtime and everything in false confidence. **⚠ DUPLICATE, recorded 2026-09-05: this is T-08**, which predates it by the whole remediation and says the same thing about the same file. It was opened again because Batch 5.7b re-discovered the parallel schema while adding the OFFERT tender and did not check the Stage 6 table first. **T-08 is the canonical ID** — audit IDs are never renamed — and the row is kept rather than deleted so the double-count is visible. Work it as T-08 in Batch 6.2. | LOW (test integrity; no production impact — and it is T-08) | 6.2, as T-08 |
| **L-28** ✅ **RESOLVED in Batch 6.3** (2026-09-05 — recognised in the post-stage sweep, not by the batch itself) | 2026-09-04 | Batch 4.1 | **`test-setup.ts` clears a stale `-wal` and `-shm` beside the test database but not a stale `-journal`.** The preload deletes `test.db`, `test.db-wal` and `test.db-shm` before `prisma db push` recreates the file (`test-setup.ts:27`). The test DB runs in rollback-journal mode, so the sidecar it actually produces is `test.db-journal` — and a run killed mid-transaction leaves one behind. Observed this session: a runaway test loop was stopped and left a 21 KB `test.db-journal` next to a deleted `test.db`. SQLite treats a journal beside a database as *hot* and tries to roll it back into the new file, so the failure mode is a confusing lock or corruption error on the **next** run, attributed to whatever code that run happened to touch. One extra path in the existing delete loop. | LOW (test infrastructure; misattributed failures) | 6.1 |
| **L-43** ✅ **RESOLVED in Batch 6.3** (2026-09-05) | 2026-09-05 | Batch 5.2 | **`shift-race.test.ts`'s ten-sales-against-one-close test failed once in a whole-suite run and could not be reproduced, and its final assertion counts a table the whole suite shares.** Observed once: `577 pass, 1 fail` on the first post-batch run of `bun test src`; three further post-batch runs and two pre-batch runs were clean, which is **not enough to say whether it predates Batch 5.2** — at that rate two clean pre-batch runs are likely either way. Two facts narrow it. (a) The obvious interference vector is closed: Batch 5.2's new test file leaves **zero rows** in every shared table, verified by reading the test database directly after running the file alone. (b) The test's last assertion is `expect(await db.order.count()).toBe(z.salesCount)` — a **global** count across a database shared by 53 files, so any file that leaves an order behind fails it, which is the shape **L-40** already describes at a different table. The test is also timing-dependent by design: its own comment names the P1008 → 503 refusal as "what ten sales against one close actually produce on this machine" (record → Batch 4.7 note 6). **ORIGIN ESTABLISHED 2026-09-05 (Batch 5.3), and it is none of the above.** Running 5.3's new file immediately before this one reproduced the failure in roughly half of eight runs, so it was instrumented rather than inferred. `Promise.allSettled([...10 sales, generateZReport(...)])` never inspects the **eleventh** promise, and in a failing run that is the one that loses: `generateZReport` rejects with Prisma's SQLite socket timeout, no `ZReport` row is written, the shift stays `OPEN`, and the very next line — `db.zReport.findUniqueOrThrow({ where: { shiftId } })` at `shift-race.test.ts:227` — throws `P2025`. The test's own comment already accepts exactly that contention on the SALE side (`results.slice(0, 10)` tolerates 409 and 503) and never on the close side. So it is **not** cross-file contamination and **not** the global `db.order.count()` assertion guessed at above; that assertion is a separate L-40-shaped hazard and is still worth scoping to the shift under test. **FREQUENCY ROSE SHARPLY WITH BATCH 5.5, measured 2026-09-05.** It used to spare whole-suite runs — three consecutive clean at 597/0 after Batch 5.3, three more at 629/0 after 5.4 — and bite only when `cross-shift-refund.test.ts` ran immediately before it. After 5.5 took the suite to 655 it fails **4 of 7** whole-suite runs, always with the same **P2025** signature, which is the diagnosed cause and not a new one: a bigger, slower suite ahead of this file widens the window in which the close loses the contention. **Practical consequence for the next session: a lone red run is now likely rather than rare, so do not spend time on it — check for P2025 on `shift-race.test.ts:227` and re-run.** Nothing in 5.5 touches the checkout or the Z race. **The fix is to assert on `results[10]` the way the sales are asserted on** — tolerate a 503/timeout close and skip the Z assertions when it lost — and it stays with 6.3 (safety rule 10). **Distinct from L-24**, which is about slow runs, not wrong results. | LOW (test infrastructure; a real failure would be misattributed, and a spurious one wastes a session) | 6.3 |
| **L-40** ✅ **RESOLVED in Batch 6.3** (2026-09-05) | 2026-09-04 | Batch 4.7 | **Test files clean up before each test and not after, so the order in which files run is load-bearing — and a file can fail because of a file it has nothing to do with.** `shift-race.test.ts` left `ZReport` rows behind; `vat-inheritance.test.ts` deletes orders and shifts but not Z reports, and its `shift.deleteMany()` then failed on a foreign key in a run where the code was fine. Fixed locally in 4.7 by giving the new file an `afterAll`, but the shape is general: any file that writes a table another file's teardown does not clear can do this. Belongs with the per-run test-database path already assigned to 6.3 (warning 3b). | LOW | 6.3 |
| **L-42** ✅ **RESOLVED in Batch 5.7d** (2026-09-05) | 2026-09-05 | Batch 5.1 | **Every POS shortcut still fires while a modal dialog is open, so a stray F5 during payment changes the sale being paid.** Measured at the till on a scratch copy: with « Encaissement » open and focus on a button, F5 set the order type to LIVRAISON underneath it. `setOrderType` reprices every cart line (`cart-store.ts:116-123`) and `PaymentDialog` reads `orderType` from the store at submit time, so the total on screen changes and the checkout is then refused **400** — *« Un client est obligatoire pour une livraison. »* — unless a customer with an address is attached. F2 and F3 do the same thing more quietly, switching between dine-in and takeaway prices; F8 stacks the discount dialog on top of the payment dialog. **Nothing is mis-journalled**: the server recomputes from the `orderType` it is sent, so the sale is *blocked*, not booked wrong. This is inherent to the current shape rather than a regression — Radix does not stop keydown propagation and the hook listens on `window` — and it was simply unreachable while every shortcut was dead. Fixing it is feature design, not a coercion: which dialogs suppress which shortcuts, and whether Escape should join the hook rather than staying Radix's alone. | MEDIUM (one keystroke changes the sale being paid; refused rather than mis-recorded) | 5.7 |
| **L-41** ✅ **RESOLVED in Batch 5.7c** (2026-09-05) | 2026-09-04 | Batch 4.7 | **A sale refused for a closed shift burns the step-up PIN token, so the cashier must re-enter their PIN to ring it again.** `orders/route.ts` consumes the single-use token as its last check *before* `createOrderInTransaction`, and Batch 4.7's shift assertion is the first statement *inside* the transaction — so a discounted sale that loses the race to a Z close is refused with the token already spent. The client handles it correctly (it drops the token on any non-400 status and re-prompts), so the cost is one extra PIN entry in a rare case, not a lost sale or a wrong record. Moving the consumption inside the transaction would drag the whole discount decision with it. | LOW | 5.7 |
| **L-27** ✅ **RESOLVED in Batch 3.6c** (`bd08823`) | 2026-09-04 | Batch 3.6b (L-25) | **The open-caisse guard is scoped to caisses *opened inside* the period, so one opened earlier and still open does not block the close.** DD-18 defined the rule that way and Batch 3.6b implemented it as written rather than widening it. The residual path is narrow but real: sealing any period other than the first requires the previous one to be sealed, and a caisse opened in that previous period would itself have blocked it — so the only way through is the **first-ever close**, with a caisse opened before the period, still open, and carrying orders inside the period. Those orders *are* counted (the aggregation keys on `Order.createdAt`, not on the shift), so the figures are right; what is missing is the guarantee that the period's last Z report exists before the period is sealed. Widening the rule — to any caisse still open at sealing time, or to any caisse holding an order inside the period — is a decision, not a bug fix. **ANSWERED 2026-09-05 — widen it to any caisse still `OPEN` at sealing time**, and assigned to the new **Batch 3.6c**. **Two corrections to this row, from reading the code the same day.** (1) *"The only way through is the first-ever close"* is **too narrow**: a caisse whose opening predates the earliest period being sealed matches no period's window, so it blocks **no** close, ever — DD-05's sequencing does not help, because that same caisse failed to block the previous period too. (2) The path is **live on the current data**, not hypothetical: shift 3 opened 2026-08-28, is still `OPEN`, and carries orders dated 2026-09-01, so sealing September would pass the guard today. | LOW→MEDIUM (reconciliation guarantee absent, not merely incomplete; figures still correct) | **3.6c** — before 8.0 |
| **L-35** ✅ **RESOLVED in Batch 4.4c** (`d9b1b08`) | 2026-09-04 | Batch 4.4b | **The discount dialog still promises a manager approval that no longer happens.** `discount-dialog.tsx:74-80` renders an amber banner above the threshold — « Remise supérieure à {threshold}%. Un manager doit approuver lors de l'encaissement. » — and after Batch 4.4b removed the CASHIER arm of the server gate, nobody is asked for anything: the caller is silently recorded as their own approver. The statement is false for the interval between 4.4b and 4.4c. It was **recorded rather than reworded on purpose**: DD-19 makes it true again with different words (the caller re-enters *their own* PIN, not a manager's), so choosing the replacement wording is 4.4c's decision, not a guess made while removing a role (safety rules 10 and 11). Note the banner's own trigger, `needsApproval`, computes the percentage **correctly** — it is three lines from L-34's defect and does not share it. | LOW (operator-facing text; wrong for one batch's duration) | 4.4c |
| **L-34** ✅ **RESOLVED in Batch 4.4c** (`d9b1b08`) — **and it was already the audit's M-17**, re-recorded under a new ID in Batch 4.4b; both are closed | 2026-09-04 | Batch 4.4b manual validation | **The discount dialog displays the discount percentage 100× too small, dividing euros by cents.** `discount-dialog.tsx:35` computes `percent = Math.round((value / subtotal) * 1000) / 10`, where `value` is in **euros** (the file's own comment at :28-29 says so — `apply()` calls `toCents(value)`) and `subtotal` comes from `computeCartTotals` in **cents**. Observed in this batch's browser walkthrough: a 1,20 € discount on a 3,00 € subtotal — a genuine **40 %** — displayed as « **0.4**% du sous-total ». Three lines below, `handleChange` gets the same arithmetic right (`(v / (subtotal / 100)) * 100`), so the amber threshold banner fires correctly while the number beside it does not. Pre-existing and unrelated to the role removal; it matters more after Batch 4.4c, because that batch makes this threshold the trigger for a PIN prompt and the operator will be reading this figure to predict it. Same class as C-01: a unit confusion in a money path. | MEDIUM (misleading figure on the control the operator uses to judge a discount) | 4.4c or 5.7 |
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


**Moved from `REMEDIATION_PLAN.md` → *Newly Discovered Issues* on 2026-09-04, unchanged, when Batch 4.5 closed them.**

| ID | Date | Found during | Description | Severity | Assigned to batch |
|---|---|---|---|---|---|
| **L-37** | 2026-09-04 | DD-08 premise check | **`scripts/port-real-data.ts` wipes the production database by a hardcoded path, and is the one file the scratch-copy method cannot protect against.** C-17 names two dangerous scripts; this is a third, and the worst. Its own header says *“The current DB at `db/custom.db` is wiped and re-populated”*. `port-real-data.ts:16` sets `const NEW_DB = "db/custom.db"` as a **literal**, `:74` opens it read-write, `:81-83` runs `PRAGMA foreign_keys = OFF` then `DELETE FROM "<table>"` for **every** table found in `sqlite_master` — the 78 real products, all orders, both sealed Z reports, every `FiscalEvent` and its hash chain, `FiscalCounter`, `GrandTotal` and the audit log — before re-inserting from `db/real-data-backup/real-data.db` (still present, dated 1 September). There is **no flag, no confirmation and no dry-run**: `bun scripts/port-real-data.ts` from the project root does it immediately. **The reason this outranks C-17's two:** it reads neither `DATABASE_URL` nor `HIBAPOS_DATA_DIR`, so the scratch-copy method that has kept every batch since Stage 3 safe does not apply to it — overriding both variables and running this script still destroys production. Its job is finished (the euros→cents port completed 1 September). Also undocumented in `scripts/README.md` (DOC-09). | **HIGH** (one command destroys the live fiscal record; the standing protection does not cover it) | 4.5 — **removal decided, DD-08** |
| **L-38** | 2026-09-04 | DD-08 premise check | **`scripts/fix-fiscal-counter.ts` can rewind `FiscalCounter`, which the plan elsewhere states is impossible.** The script sets `lastReceiptNumber` / `lastShiftNumber` / `lastZReportNumber` to `max(number)` of the surviving rows (`fix-fiscal-counter.ts:9-13, 17-29`), with **no floor at the current value**. Run after anything that removes orders — L-37's script, `seed-users.ts`, or a bad restore — it resets the counters **downward**, to 0 if the tables are empty, so the next genuine sale prints a receipt number already sealed into the journal. This directly contradicts Batch 4.3's recorded reasoning that *“the counter check is the one that matters, because a script that wipes users and orders cannot rewind `FiscalCounter`”* — true of the scripts 4.3 examined, false of this one. `init-fiscal-counter.ts` upserts the singleton at 0 and needs the same floor. Nothing has run either script against production: counters read `23/3/2/7` on the scratch copy and `20/3/2/2` live, both consistent with their tables. **Fix by refusing to lower a counter, not by removing the repair capability** — a counter that is too *low* is the condition these scripts exist to repair. | **HIGH** (duplicate receipt numbers in a sealed fiscal journal) | 4.5 — **guard decided, DD-08** |

---

# ANSWERED DESIGN DECISIONS — FULL RATIONALE

**DD-16** *(retired from the plan's table on 2026-09-05: answered, and Batch 7.1 completed it the same day.)*

| **DD-16** | **ANSWERED 2026-09-05 — keep them tracked; the documentation is what is wrong.** 139 files, 49 MB, all real catalogue images. Batch 7.1 corrects `README.md` and the `/upload/` typo in `.gitignore` so both say what is true. | Batch 7.1 (DOC-06) | Full question and rationale: `REMEDIATION_RECORD.md` → *Answered design decisions*. |


**DD-20** *(moved from the plan's DESIGN DECISIONS table on 2026-09-05, the day it was answered — the row was cut to a pointer because the three of them together put the front matter 1,542 bytes over its ceiling).*

| **DD-20** | **ANSWERED 2026-09-05 — a given-away order is shown SEPARATELY: it is not counted as a sale, and a distinct "given away" count and item list appear beside the sales figures.** L-50 asked whether a 100 %-discounted order should count as a ticket and whether its items belong in `topProducts`. Today it is dropped from every count, because `isFullyRefunded` opens `refundsTotal >= order.total` and for a zero-total order that is `0 >= 0`. **The operator's reasoning, in their own framing**: they had not seen the tender at all — it landed the same day and the app is not installed — and the option chosen keeps *average spend per meal* truthful and `topProducts` meaning *what sold*, while still making the give-away visible. **Timing is why it is decided now**: the new field changes the shape of the sealed close `dataJson`, and **zero closes have ever been sealed** (*Open Threads → D*), so it costs nothing today and would create a second payload vintage later. | Batch 7.4a | Full question, the measurement and the rejected options: `REMEDIATION_RECORD.md` → *Answered design decisions* |

**DD-21** *(moved from the plan's DESIGN DECISIONS table on 2026-09-05, the day it was answered — the row was cut to a pointer because the three of them together put the front matter 1,542 bytes over its ceiling).*

| **DD-21** | **ANSWERED 2026-09-05 — the four non-fiscal reports adopt the FISCAL rule: a period books the corrections it issued.** L-44 asked whose takings a refund reduces when it is paid on a different day from the sale. Batch 5.3 moved the five fiscal callers to the refunding period; `dashboard`, `reports/cashiers`, `reports/products` and `customers/[id]/detail` were left on the selling one, so the dashboard's "today" and `/api/reports/sales` can disagree for the same day. **One rule everywhere**, and the refunding cashier's takings drop — which is also what their drawer does. | Batch 7.4a | Full question and the rejected options: `REMEDIATION_RECORD.md` → *Answered design decisions* |

**DD-22** *(moved from the plan's DESIGN DECISIONS table on 2026-09-05, the day it was answered — the row was cut to a pointer because the three of them together put the front matter 1,542 bytes over its ceiling).*

| **DD-22** | **ANSWERED 2026-09-05 — narrow `GET /api/users` and `GET /api/backups` to `["SUPER_ADMIN"]`, and review the other 27 gates, marking each deliberate or decorative.** L-33: since Batch 4.4b removed `CASHIER`, a gate naming `["SUPER_ADMIN", "MANAGER"]` admits the entire role model. Those two answer **200** to a MANAGER whose nav entry is deliberately SUPER_ADMIN-only (DD-07), while `GET /api/logs` answers **403** and is the shape they should match. **Nothing in the UI calls either as a MANAGER**, so no screen breaks — verified before the decision was put. | Batch 7.4b | Full question: `REMEDIATION_RECORD.md` → *Answered design decisions* |

**How these three were put, because the method is part of the answer.** Each was written as a brief in plain language before any code existed, per safety rule 11 and the operator's standing instruction. **DD-20 took three attempts and the operator corrected the question**: the first brief used the word "comp", which is jargon; the second explained it as a free meal; the operator then asked *"how can we give a meal for free I think we dont have this option, or you mean applying 100 discount?"* — and was **right**. There is no "free" button. A give-away is a **100 % discount** (which needs the caller's own PIN, DD-19) settled with the OFFERT tender, which exists only because M-11 made a zero-total order unpayable. The brief was rewritten in those terms and the decision taken against the corrected description. **An operator who has never seen a feature cannot be asked about it in its own vocabulary** — the app is not installed, and 5.7b had landed the same day.



*Rows moved verbatim from *Design Decisions Required* in `REMEDIATION_PLAN.md` (commit `5f0c2b1`) on 2026-09-04; the plan keeps a one-line summary of each answer. Source lines: 2255, 2256, 2257, 2258, 2260.*

| ID | Decision | Blocks | Context |
|---|---|---|---|
| **DD-08** | ~~**Operator scripts.** Guard them, or remove them from the shipped tree?~~ **ANSWERED 2026-09-04 — SPLIT: remove the two whose job is finished, guard and rebuild the rest.** (1) **`port-real-data.ts` — removed.** (2) **`seed-category-options.ts` — removed.** (3) **`seed-users.ts` — rebuilt** as a PIN-reset tool: no deletes, no built-in PINs, an explicit flag, and the new PIN supplied at run time. (4) **`fix-fiscal-counter.ts` and `init-fiscal-counter.ts` — guarded** so a counter can never be lowered. (5) **`scripts/` brought under `tsc` and `eslint`.** (6) **`scripts/README.md` corrected.** | Batch 4.5 (C-17, L-37, L-38) | Decided by the user, 2026-09-04, in one batched question. **The premise as DD-08 was written undercounted, and the measurement is why the answer took this shape.** C-17 names two dangerous scripts; there are three, and the missing one is the worst: **`port-real-data.ts` opens `db/custom.db` by a HARDCODED literal, disables foreign keys and runs `DELETE FROM` on every table** before refilling from a 1 September copy — no flag, no dry-run. It therefore **bypasses the single protection every batch since Stage 3 has relied on**, because it reads neither `DATABASE_URL` nor `HIBAPOS_DATA_DIR` (**L-37**). Second, `fix-fiscal-counter.ts` **sets the counters to whatever survives in the tables, so it can rewind them** — which contradicts the sentence in Batch 4.3's record that *“a script that wipes users and orders cannot rewind `FiscalCounter`”*; that was true of the scripts 4.3 was looking at and false of this one (**L-38**). The two removals were chosen over guards because **neither script has a remaining purpose** — `port-real-data.ts` completed the euros→cents migration on 1 September and `seed-category-options.ts` seeded a demo catalogue the real 78-product one replaced — so guarding them would be writing code to protect a capability nobody needs, and a removal cannot be got wrong the way a guard can. `seed-users.ts` was rebuilt rather than removed for one reason the user weighed explicitly: `POST /api/seed` **refuses once the till has traded**, so with both PINs lost there is otherwise no way back in. Bringing `scripts/` under static checking was accepted with its cost (pre-existing errors must be fixed before the build passes) on concrete evidence: `seed-users.ts` calls `hashPin`, which became **async in Batch 4.2**, and a missing `await` there would store the string `"[object Promise]"` as a PIN hash with nothing to catch it — the file's own comment says so. Precedent for removal: `scripts/delete-products.js` was already removed for exactly this hazard. |
| **DD-01** | ~~**Printing and cash drawer.**~~ **ANSWERED 2026-09-03: build the ESC/POS bridge now, in the existing Bun/Next server, primary transport raw TCP to port 9100 over the LAN**, behind a transport interface leaving a Windows-RAW-spooler slot for USB. Not deferred to Tauri. | Batch 1.3 (now `IN PROGRESS`); shapes 1.4 and 3.4 | Decided by the user. Reasoning: `renderReceipt()` already produces the receipt text, so only transport + control bytes are missing; a TCP socket is runtime-independent and carries over to a future Tauri shell untouched, so building now is not throwaway work. Deferring would keep the restaurant on a physical drawer key per cash sale, and would leave the Batch 1.2 cash-variance figure with no drawer accountability behind it. |
| **DD-02** | ~~**Where does application data live?**~~ **ANSWERED 2026-09-03: `C:\HibaPOS\data`.** Plumbing shipped in Batch 2.2 (`src/lib/paths.ts`, `HIBAPOS_DATA_DIR`), defaulting to the old layout; the physical move is a deployment step with Batch 1.4. Original question: `%ProgramData%\HibaPOS\`, a dedicated `C:\HibaPOS\`, or the current install directory? The current path is inside a OneDrive-synced Desktop folder, which locks SQLite files. Under `C:\Program Files\` the app cannot write at all. | Batch 2.2; shapes 1.4 | Every path except `DATABASE_URL` is `process.cwd()`-anchored. |
| **DD-03** | ~~**Already-sealed rows with the wrong VAT key.**~~ **CLOSED 2026-09-03 as NOT APPLICABLE — there was never an affected row.** The premise (that sealed rows carry a `"6"` key) was an audit assumption, not an observation. Read-only inspection of every database on the machine found zero `"6"` keys and zero non-10 % rates anywhere, including in the legacy July exports whose dataset *did* contain a 5,5 % product. The operator then confirmed that all trading data is developer test data and that P-04 deletes it before the first real sale, so the two `ZReport` rows are not fiscal records at all. Key format decided: **minimal decimal string** (`"5.5"`, `"10"` — option A1), because it is byte-identical to what those rows already hold. | Batch 3.1 (`COMPLETED`) | Full evidence in the Batch 3.1 status record. No annotation, re-issue or explanation was needed, so V-01 is not engaged. |
| **DD-17** | ~~**Where does a product's VAT rate come from?**~~ **ANSWERED 2026-09-03: on the category, inherited nearest-wins (own category → parent → default), with a per-product override flag and a selector constrained to 20 / 10 / 5,5 / 2,1 %.** Original question raised by the operator: should a VAT percentage be settable per category instead of via the hardcoded "Bouteille / Canette" switch? | Batch 3.1c | Decided by the user. Reasoning: the current design encodes a **tax rule as a string match on a category name** (`products-view.tsx:498`), so renaming a category silently removes the control — and it already has, which is L-16/L-17. Category-level inheritance is not a new mechanism here: `pricing.ts:71` already resolves `product.category?.parent ?? product.category` for options and add-ons, with `inheritCategoryGlobals` as the per-product opt-out. This applies the established pattern to one more field. The snapshot in `OrderItem.vatRate` is what makes it safe — past sales cannot move when a category is edited. |
| **DD-05** | ~~**Out-of-order period closes.**~~ **ANSWERED 2026-09-04: refuse.** A close must be the period immediately following the last sealed one; the first close is unconstrained. Chaining by insertion order was the alternative and was rejected — it needs an extra sequence column (a migration), and it leaves the sealed sequence reading March → January. Refusing keeps `verifyCloses` correct unchanged and makes period order and seal order permanently identical. Decided with **zero closes in existence**, so nothing had to be accommodated. | Batch 3.6 (`COMPLETED`) | Evidence in the Batch 3.6 status record, including the reproduction of the break on a copy of production. |
| **DD-06** | ~~**Is LAN access required?**~~ **ANSWERED 2026-09-04: no — the POS runs on the all-in-one till and nothing else, so the server binds `127.0.0.1`.** Original question: bind `127.0.0.1`, or set `APP_URL` to an `http://` value and accept unencrypted traffic on the restaurant network? | Batch 4.3 | Decided by the user, on a measured brief. **The plan's framing — that the current state is “protective by accident” — was wrong, and the measurement is why.** Observed on a production build against a scratch copy: the server binds `0.0.0.0` and announces `Network: http://192.168.1.12:3026`; with `APP_URL` unset the session cookie carries `Secure`, so in a real browser a login at the LAN address returns **200 with a valid user** and the very next `GET /api/auth/me` returns **`{user: null}`** — the session never sticks — while the same login at `http://localhost` works, because localhost is a secure context. But the endpoints that matter do not depend on that cookie: from the LAN address, unauthenticated, `GET /api/auth/profiles` returned the full staff list and `POST /api/auth/login` returned **200 and a valid session token**. So the broken cookie blocked the restaurant's own staff and blocked no attacker — the worst of both. `-H 127.0.0.1` was then verified to close it: `TCP 127.0.0.1:3027 LISTENING`, localhost `200`, the LAN address refused. Two further reasons the bind is the right shape rather than a stopgap: the ESC/POS bridge (DD-01) makes an **outbound** connection to the printer on port 9100, which a listener bind does not touch, so printing is unaffected; and the delivery target is a Windows application with a Tauri shell later, whose webview loads from localhost — the same argument DD-01 used for building the printer bridge now. No `APP_URL` change is needed: at a localhost origin the `Secure` cookie is accepted as observed. The bind belongs in `package.json`'s `start` script, which is tracked in git — C-18's evidence cites a `start.ps1` that **does not exist**, so there is no launcher for it to live in and nothing outside version control can silently undo it. |
| **DD-07** | ~~**Intended cashier visibility.**~~ **ANSWERED 2026-09-04: there are no cashiers.** Only the **MANAGER** account operates the till. The **SUPER_ADMIN account belongs to the developer**, not to the restaurant, and staff are not to have access to it or to see it. The `CASHIER` role stays implemented but no cashier account will exist. No discount or refund approval control is required in operation. | Batch 4.4 (M-19s) | Decided by the user. **The original question has no subject**: it asked which reports and settings a CASHIER should see, and there are no cashiers — production has carried exactly two accounts, `manager` and `admin`, throughout. Verified read-only. What replaces it is a different matrix: what the restaurant's MANAGER may see, and what must be hidden because it is the developer's. **That second half is not satisfied today** — `login-screen.tsx:486-489` renders a dedicated button for the SUPER_ADMIN profile, and `GET /api/auth/profiles` is public and returns every active user's id, username, name and role, so the restaurant both sees the developer's account and can select it. Closing that is Batch 4.4's work, and it is the concrete form M-19s now takes. **Two consequences recorded rather than acted on:** (1) the discount and refund approval gates key on `user.role === "CASHIER"` (`orders/route.ts:223`) or self-approve for MANAGER+ (`refund/route.ts:87`), so with no cashiers **neither gate ever fires** — a manager may apply any discount with no approver recorded and refund any amount by self-approval; Batch 4.1's lockout and Batch 3.5's C-13 approver trail therefore guard a path this deployment does not use. (2) The approval machinery is **kept, not deleted**, because the user chose to retain the `CASHIER` role and that role is meaningless without it; removal stays available as a later decision. |
| **DD-07** *(amendment, 2026-09-04)* | **The visibility half is withdrawn.** The original answer said restaurant staff were not to see the SUPER_ADMIN account; the user amended this the same day: **it is acceptable for the manager to see that a super-admin account exists**, and the login screen keeps its SUPER_ADMIN button. Batch 4.4 therefore does **not** hide it. | Batch 4.4 | Everything else in the DD-07 row above stands. The consequence is that **M-19s has no subject** under this operating model and is marked `DEFERRED` rather than `COMPLETED`: it described reads left ungated for a CASHIER, and the only two roles that exist are both entitled to them. The underlying facts are recorded so they are not lost if a cashier account is ever created — `GET /api/settings` exposes SIRET, TVA number and the discount threshold to any authenticated caller; `GET /api/reports/x` is open while `POST` is MANAGER+, a disagreement that is unobservable while every account can call both; and `GET /api/auth/profiles` is public and returns every active user's id, username, name and role. |
| **DD-07** *(second amendment, 2026-09-04)* | **`CASHIER` is removed from the product.** The restaurant's owner asked for a **single operational role**. The first answer retained the role unused; this supersedes that. | Batch 4.4b | Decided by the user once the owner's requirement was known. Two things made it the coherent choice rather than merely the requested one. **(1) The half-supported state was the worst option**: the role was implemented and navigable, its discount ceiling never fired, and M-19s could not be closed while it existed — raising the two ungated reads would have given a cashier 403s mid-payment, because `discount-dialog`, `payment-dialog`, `receipt-dialog`, `orders-view` and `shifts-view` all read them. Remove the role and the same fix is a no-op. **(2) It is cheap**: the enum is app-level, with no `CHECK` constraint in any migration this project has ever emitted, so no `migrate deploy` is expected. The costs are recorded in Batch 4.4b: `LEAST_PRIVILEGED_ROLE` degrades one rung to `MANAGER`, and the approval-token path becomes unreachable — the machinery is **kept**, because Batch 4.4c reuses its lockout. |
| **DD-19** | **ANSWERED 2026-09-04 — step up with the operator's OWN PIN**, on a discount above the configured threshold and on **every refund, with no threshold**. | Batch 4.4c | Decided by the user: *“the manager doesn't need to approve a discount because it's the manager … but simply the manager needs to put his PIN”*, and separately, that all refunds should ask. **What it buys is not distrust of the manager — it is the unattended till.** Today a discount above the threshold and a refund of any amount are silently self-approved: the approver is written as the acting user, with no prompt and no keystroke, so anyone reaching the POS while the manager is elsewhere can discount a ticket to zero or refund it. **It cannot reuse `/api/auth/approve`**: that route tests the PIN against every manager and forbids self-approval by design — built for a cashier asking a manager — so with one operational role it can never succeed. It therefore needs a distinct re-authentication path, which is itself a PIN-guessing surface and inherits Batch 4.1's lockout and Batch 4.2's bounded queue. |
| **DD-19** *(implementation choices, 2026-09-04)* | **Four choices the specification left open, put to the operator as one set before any code was written, and all four answered as recommended.** **(1) The old manager approval token is REPLACED, not kept beside the step-up** — `discount.approvalToken` and `refund.approvalToken` leave the wire; `/api/auth/approve` stays in the tree, dormant. Keeping both would have meant two ways to authorise the same act and two paths to keep correct, for a second-person approval that a single-role product cannot perform. **(2) M-18 closes here, not in Batch 5.7** — 4.4c rewrites the very screen M-18 describes, and its recorded direction (“skip the dialog”) would have made the refund silent, which is the opposite of what DD-19 buys; the lone manager now refunds with their own PIN. Leaving it would have meant two PINs per refund in the interim. **(3) No change to the sealed VENTE / REMBOURSEMENT payloads** — they already name the authoriser, and a “PIN was entered” flag would be true on every record the batch can produce, so it would add no information while creating a third payload vintage (*Open Threads → D*). The deliberate act is evidenced by `STEP_UP_PIN_GRANTED` audit rows carrying the action and the cent amount. **(4) One shared lockout at 5 wrong PINs / 15 minutes** — the step-up writes Batch 4.1's own `MANAGER_APPROVAL_FAILED` action and shares its rate-limit key, so a guesser gets five attempts in total rather than five per surface. The cost was stated when the choice was offered and accepted: five fumbles mean no refunds and no large discounts for fifteen minutes, while selling, cashing up and closing the day continue. | Batch 4.4c (`COMPLETED`) | Decided by the user, 2026-09-04, in one batched question before implementation. Evidence for each: the record's Batch 4.4c section — (1) Changes (4) and (5), (2) Changes (7) and the UI walkthrough, (3) note 1, (4) note 2. |
| **DD-18** | ~~**Premature period closes.**~~ **ANSWERED 2026-09-04 — refuse a premature close, with no override.** A month or year close is refused while its period has not ended, and while a shift inside the period is still `OPEN`; the close screen defaults to the last completed period instead of the current one. L-26's missing refunds columns on the period closes are added in the same batch, while zero closes exist. | Batch 3.6b (`COMPLETED`) | Decided by the user on a plain-language brief. Reasoning: the first premature seal is unrepairable (a sealed period cannot be edited, deleted or re-sealed), the screen proposed the wrong period by default, and zero closes exist today so the rule costs nothing to impose. A confirmation dialog was rejected as too weak for an irreversible fiscal action. Whether French practice imposes further rules on period closes stays with V-08; this is a code decision and claims nothing fiscal. *(Row moved from the plan on 2026-09-04, at the close of Batch 3.6b.)* |

---
| **DD-09** | ~~**Tables.** Wire table selection into the POS, or withdraw the feature from the documentation?~~ **ANSWERED 2026-09-05 — this restaurant does not serve at tables; withdraw the feature.** The floor-plan screen leaves the navigation and the README; the `Table` model, its API and the server-side auto-link stay in place, unused, in case table service ever exists. | Batch 5.2 (C-21) | Decided by the user, 2026-09-05, on a measured brief. **The plan's framing was too kind and the measurement is why.** It calls the floor plan "a decorative screen"; read-only inspection of production found it emptier than that — **exactly one `Table` row, `T1 / Salle`, and it is stuck at `OCCUPIED`** although **no order has ever carried a table label** (`SELECT COUNT(*) FROM 'Order' WHERE tableLabel IS NOT NULL AND tableLabel <> ''` → 0). Nobody has ever laid out this restaurant's room, which is the fact the decision actually turned on. Everything *server*-side is complete and was verified: `checkout.ts:202-208` marks a matching table `OCCUPIED` and links `currentOrderId`, `refund.ts:131-136` frees it again on a full refund, and `tableLabel` is carried by the payment dialog, stored by the order route, searchable, and rendered on receipts and in customer history. The single missing piece is the POS input — `setTableLabel` has exactly two references, its type and its implementation, both in `cart-store.ts`. So the cost of wiring it was small; the reason not to is that the workflow does not exist. **Two consequences to carry into Batch 5.2:** held tickets keep falling back to their `Commande N` labels, which is now the intended behaviour rather than a symptom; and the stale `T1` row is live data, so removing it is the operator's action, not Claude's (warning 4) — 5.2 should decide whether to ask for that or simply leave a hidden row in an unreachable screen. |
| **DD-10** | ~~**Cross-shift refunds.** Allow, attributed to the current open shift? Restrict to MANAGER+? Or keep the current refusal and define an approved manual procedure?~~ **ANSWERED 2026-09-05 — allow, attributed to the CURRENT open till.** A refund for a previous day's sale comes out of today's drawer and lands in today's expected cash; the original shift's sealed Z report is never touched. | Batch 5.3 (C-14) | Decided by the user, 2026-09-05, on a measured brief — the audit's own remediation direction, chosen with two corrections to the plan's picture. **First, the refusal now lives in two places, not one.** The plan cites only the route pre-check at `refund/route.ts:28`; Batch 4.7 added a second, decisive one **inside the refund transaction** at `refund.ts:86` (`SHIFT_CLOSED_DURING_REFUND_MESSAGE`, 409), because the pre-transaction read was one of C-15's three race sites. Batch 5.3 must change both, and the one inside the transaction is the one that matters. **Second, the option the plan offered as a middle way — "restrict to MANAGER+" — is already true and buys nothing.** Since Batch 4.4c every refund at any amount requires the operator's own PIN, and since Batch 4.4b `MANAGER` is the only operational role, so a role restriction would restrict nothing. That was put to the user explicitly rather than left as a live-looking option. **Measured stakes:** 15 of the 20 orders in production sit in a `CLOSED` shift and are unrefundable today, and **zero refunds have ever been recorded** — the developer never exercised the path on the live database, which is consistent with the trading data being test data. **Carried into the batch:** `Refund.shiftId` is populated with the *order's* shift (`refund.ts:83`) despite the schema comment describing it as the shift that issued the refund, and no report reads the column at all — so the attribution change has to settle what that column means before anything starts depending on it. |
| **DD-11** | ~~**Held orders.** Move server-side (visible from any terminal, surviving a device swap, accounted for at Z close), or keep them device-local?~~ **ANSWERED 2026-09-05 — one till, so held orders stay device-local.** Batch 5.4 does the cart-lifecycle fixes and the persist version guard only: no server model, no new API, no migration. | Batch 5.4 (C-23) | Decided by the user, 2026-09-05, on the fact the decision turns on: **this restaurant runs one till.** The server-side move is what "held orders" usually means operationally, and it is the right shape for two or more terminals — visible anywhere, surviving a device swap, accounted for at the Z close — but every one of those benefits is defined relative to a second terminal that does not exist, and the cost is a migration, a new API and a decision about what a Z close does with a ticket still parked. **What proceeds regardless, and the plan already said so:** the cart is persisted to `localStorage` under `hibapos-cart` with **no `version` and no `migrate`** (verified: `cart-store.ts:173` carries only `name`), and `app-store.ts`'s `logout` sets `user: null` without touching the cart, so cashier B inherits cashier A's open ticket and parked tickets and books them under B's name. Clearing on logout, lock and user switch, and adding a version guard that discards a cart written before the euros→cents migration (`720660a`) rather than rehydrating euro values as cents, are unambiguous and are Batch 5.4's whole content now. |
| **DD-12** | ~~**Cash movements.** Add an entrée/sortie de caisse feature, and if so what categories and what approval level?~~ **ANSWERED 2026-09-05 — add it, with a fixed category list**: *approvisionnement* (float top-up), *prélèvement* (cash to the safe), *dépense* (supplier or petty cash), *erreur de caisse*. Each movement is journalled, feeds `expectedCash`, and appears in the X and Z reports. | Batch 5.5 (M-05) | Decided by the user, 2026-09-05, on a measured brief. The alternative offered was a free-text reason instead of a category, and it was rejected for the reason that makes categories worth their cost: prose reasons cannot be totalled, so "how much went to suppliers this month" stops being answerable the moment it is asked. **Measured context that argued for building it at all:** there is **no cash-movement model of any kind** in `schema.prisma`, `expectedCash = openingFloat + grossCashTotal − cashRefundsTotal` (`reports.ts:88`), and **every payment ever recorded on this till is CASH** — 21 payments, 478,80 €, zero card, zero voucher. A restaurant that takes only cash is exactly the one where a 200 € supplier payment out of the drawer produces a phantom 200 € shortfall at every close, which trains staff to ignore the variance figure and defeats the point of C-02's correction. **Carried into the batch:** it needs a migration, so the rehearse-then-hand-over method applies (*Methods → Migration rehearsal with a fingerprint diff*), and the approval level was not separately specified — with one operational role since DD-07, any gate narrower than MANAGER would gate nobody, so 5.5 should say plainly whether a step-up PIN is wanted here as it is for refunds. |
| **DD-13** | ~~**Order cancellation.** Support a pre-payment order state and a void, or remove the dead `CANCELLED` enum values and the zero counter?~~ **ANSWERED 2026-09-05 — no pre-payment state; remove the dead values.** Both of them, plus the permanently-zero counter. | Batch 5.6 (M-08) | Decided by the user, 2026-09-05, on a measured brief. **Two corrections to the plan's row, both found by measuring.** (1) Its text contains a corrupted paste — a commit sha (`d9b1b08`, Batch 4.4c's) sitting where an enum value should be. (2) There are **two** dead statuses, not one: `enum OrderStatus { PENDING COMPLETED REFUNDED CANCELLED }`, and only `COMPLETED` (written once, `checkout.ts:155`) and `REFUNDED` (written once, `refund.ts:127`) are ever written by anything. All 20 orders in production are `COMPLETED`. **What made the answer easy, and it is worth stating because it is the thing that changes if the business changes:** today an order does not exist until it is paid — the cart is client-side — so there is nothing to cancel, and a mis-rung ticket is cleared from the cart before payment, which already works. A real void only becomes necessary when an order is saved *before* payment: kitchen tickets fired in advance, telephone orders, table service. The user has just answered DD-09 saying there is no table service, so none of those apply. **Carried into the batch:** if order-before-payment ever arrives, these enum values were deleted deliberately, not overlooked. Removing them is app-level for SQLite and may emit an empty migration — measure it with `prisma migrate diff` as Batch 4.4b did for the `CASHIER` removal rather than assuming either way. |
| **DD-14** | ~~**Zero-total orders.** Is a 100 % discount (staff meal, comp) a legitimate transaction? Currently impossible to check out.~~ **ANSWERED 2026-09-05 — yes, under its own tender.** A zero-total sale goes through as « Offert / repas personnel » rather than as an ordinary 0,00 € cash sale, journalled like any other sale with VAT at zero. | Batch 5.7 (M-11) | Decided by the user, 2026-09-05, on a measured brief. The plain-zero-sale alternative was rejected for a reporting reason: a dedicated tender keeps what was *given away* separable from what was *sold*, which a 0,00 € cash line does not. **Measured:** the checkout is walled off twice, independently — `payments` requires at least one entry (`.min(1, "Au moins un paiement")`) and each entry requires `amount ≥ 1` cent (`orders/route.ts:51-59`), and then `paidTotal !== totalAfterDiscount` refuses (`:251`). Both walls have to come down together for the case to work at all. It is entirely latent today: **zero orders with a total of 0 and zero orders carrying any discount** exist in production. **Carried into the batch:** the tender is a new value in the `CASH | CARD | VOUCHER` payment-method enum, so measure whether it needs a migration the same way (`prisma migrate diff`); and whatever the reports do with it, an « offert » line must not inflate revenue — the aggregation of Batch 3.2 and the sealed period totals both need to be checked against it, not just the Z. |
| **DD-15** | ~~**Orphaned schema surfaces.** `ProductAddon` (no writer) and `Customer.postalCode` (no consumer) — build the missing write paths or remove the surfaces?~~ **ANSWERED 2026-09-05 — remove both.** The `ProductAddon` join and the empty `AddOn` catalogue with its routes go; `Customer.postalCode` goes. | Batch 5.7 (M-09, M-10) | Decided by the user, 2026-09-05, on a measured brief. **The plan's context line is wrong and the measurement is why.** It says both are "flagged in audit section I as possible lost functionality; compare against the historical project before removing." Nothing is lost: **there are two add-on designs and the newer one won.** `CategoryAddOn` — self-contained (`name`, `price`, `image`) and hung off a category — has **21 rows in production**, a full write path in the category editor (`categories/[id]/route.ts:183-190`), and is what the POS actually serves. `AddOn` + `ProductAddon` — a shared add-on catalogue plus a product join — is the older design: `AddOn` has a CRUD API at `/api/catalog/addons` but **0 rows**, and the `ProductAddon` join has **no writer anywhere in `src/`, `scripts/` or `prisma/`**, so even an add-on that was created could never be attached to a product. The products route merges the two lists (`addOns: [...categoryAddOns, ...productAddOns]`) and the second half is permanently empty, which is why `computeLinePricing`'s handling of them is unreachable. On **`Customer.postalCode`**: **0 of 2 customers have one**, it has zero references in `src/`, and the app's own delivery rule requires name + phone + address and never asks for a postcode (`orders/route.ts:261-274`). The user was asked directly whether French delivery paperwork needs a *code postal* as its own field and answered no. **Carried into the batch:** this is a destructive schema change with zero rows to lose, so it needs the migration rehearsal and a hand-over of the exact command; and `media-usage.ts` reads `AddOn.image` in two places, so removing the model touches the media scan that Batch 4.6 rebuilt. |
| **DD-04** | ~~**Backup key rotation policy.** Rotating `BACKUP_ENCRYPTION_KEY` orphans every existing backup permanently. Re-encrypt the retained set first, accept the loss, or introduce key versioning before rotating?~~ **ANSWERED 2026-09-05 — rotate, and accept the loss.** No re-encryption pass and no key versioning. | Batch 7.3; P-02 | Decided by the user, 2026-09-05, on a measured brief — and **the premise the question rested on turned out to be already spent**, which is what made the answer easy rather than a trade-off. The row assumed the existing backups are restorable and that the key is what would orphan them. Measured read-only on production: `db/backups/` holds **nine files, 126 MB** — three legacy `.json` from July and three `.dbenc` + three `.uploads.enc` pairs from 18, 21 and 28 August — while the **`Backup` table holds zero rows**. Both `listBackups()` and `restoreBackup()` key on that table, so **not one of those files is reachable by the application today**, with the current key or any other. Rotating destroys nothing that can presently be restored. Two further facts pointed the same way: the 41–47 MB `uploads.enc` archives duplicate `public/uploads/`, which is tracked in git (DD-16), so the *images* are not at risk either way; and the `.dbenc` snapshots hold July/August **trading** data, which warning 4 records as developer test data that Batch 8.0 deletes before the first genuine sale — the catalogue inside them is real, but it is also in the live database and in git. The two alternatives were offered and declined: decrypting the three snapshots to plaintext before rotating (about ten minutes, the format is documented at `backup.ts:139` — declined as insurance against a loss that has already happened), and adding a key-version field to the backup format and the `Backup` model (declined as real work — format change, schema change, migration — for backups that cannot be restored). **Carried into Batch 7.3:** rotate `SESSION_SECRET` outside service hours because it invalidates every session and every outstanding step-up token; take a **new** backup after rotating and restore it before the old key is discarded, which per **L-46** will be the first end-to-end restore this installation has ever managed; and record the nine old files as retained-but-undecryptable rather than re-encrypted. **The zero-rows finding is its own defect and is recorded separately as L-46** — the audit log carries three `BACKUP_CREATED` entries naming `Backup` ids that no longer exist, and no `BACKUP_DELETED` entry at all, so the rows did not leave through the application. Answering DD-04 does not close that. |
| **DD-16** | ~~**Should `public/uploads/` be tracked in git?** 134 files currently are, contradicting the README and complicating any git-based update.~~ **ANSWERED 2026-09-05 — keep them tracked; the documentation is what is wrong.** Batch 7.1 corrects the README and the `.gitignore` typo instead of untracking anything. | Batch 7.1 (DOC-06) | Decided by the user, 2026-09-05, on a measured brief. **The row's own numbers were stale and its framing had it backwards.** Re-measured: **139** files, not 134, totalling **49 MB**, in `public/uploads/Options/`, `/Produits/` and `/categories/`, and **all 139 are tracked** — `git ls-files` returns 139, `--others` returns none. The `.gitignore` line the row cites reads `/upload/` — **singular**, a typo for a directory that does not exist — so `public/uploads/` was never actually ignored, and the README's *« non commité »* at `:111` has been false for the life of the repository. So nothing drifted out of compliance with an intention; the intention was never enforced, and the question is whether to start now. **What decided it:** these are the real catalogue images, which warning 4 records as irreplaceable operator work, and git is currently their **only** version-controlled copy — a point sharpened the same afternoon by **L-46**, which established that the application cannot restore any backup at all. Untracking them would remove the one working copy of irreplaceable work in exchange for a tidier repository and 49 MB, which is nothing. The alternative offered was to untrack and move them to `C:\\HibaPOS\\data` per DD-02, making the README true as written; it was declined on that ground, and can be revisited once Batch 1.4's deployment step exists and backups are demonstrably restorable. **Carried into Batch 7.1:** correct `README.md:111` to say the images **are** committed, fix the `/upload/` → `public/uploads/` typo in `.gitignore` so it stops implying an intent nothing enforces, and do **not** untrack the files. DOC-06 is therefore a documentation correction, not a repository change. |

*DD-09 through DD-15 moved from *Design Decisions Required* in `REMEDIATION_PLAN.md` (commit `bdf863d`) on 2026-09-05, after the operator answered all seven in one brief; the plan keeps a one-line summary of each.*


**DD-23, DD-24 and DD-25** *(all three ANSWERED 2026-09-06 and moved from the plan's DESIGN DECISIONS table the same day, each cut there to a one-line pointer. They open Batches 3.8 and 3.9. DD-23's row is reproduced below exactly as it stood in the plan while it was open, followed by the answer; DD-24 and DD-25 were never in the plan as open rows, because both were raised and answered inside the same exchange.)*

**DD-23 — the daily close. The row as it stood while open:**

| ID | Decision | Blocks | Context |
|---|---|---|---|
| **DD-23** | **OPEN, 2026-09-06 — should the till refuse to ring up a sale once the open caisse has crossed midnight, until it is closed with a Z?** Today nothing stops a caisse staying open for days — on the test data caisse 3 was opened on 28 August and was still taking orders on 1 September — and since Batch 3.7 the caisse screen *says* it is your job to close at the end of every trading day and turns amber once midnight has passed. The regulation requires the software to *provide* a daily close (BOFiP § 170), not to force one, and no source found says whether one Z per caisse counts as the daily close (research § 9.5). Three options, in till terms. **A — warn only (today):** you can always sell; if you forget to close, one Z covers several days and only you would notice. **B — refuse after midnight:** from 00:00 the till answers « clôturez la caisse d'abord »; a Friday service running to 00:30 would need a Z at midnight and its last tickets would land in Saturday's caisse. **C — refuse after a cut-off hour you choose, say 05:00:** a service past midnight stays in one Z, and a till simply left open is caught the next morning before the first sale. **Recommendation: C** if the restaurant ever trades past midnight, otherwise **B**. Either changes what the till allows, which is why it is yours. **Blocks nothing today.** | a later batch, once answered | `docs/conformite-isca-map.md` § 3.1; research § 9.5; L-54 |

**How the question changed before it was answered, which matters more than the answer.** The row above offers three ways to *refuse a sale*. The operator's own research, carried out independently and shared on 2026-09-06, proposed a fourth thing nobody in this plan had considered: stop treating the caisse Z as the daily close at all, and add a **separate daily closure** above it, so the structure becomes caisse Z, caisse Z, day close, month close, year close. That is a better answer than any of A, B or C, because it removes the ambiguity the finding is about instead of managing it. The question was rewritten in those terms and put again. **This is the second time an operator's reply has changed the question rather than selected from it** — DD-14 was the first — and the lesson is the same one: brief the decision in the operator's terms and expect the premise to move.

**DD-23 — ANSWERED 2026-09-06: build a separate `Clôture du jour`, on a trading-day clock, and refuse nothing.** The caisse Z keeps its job as the cash count for one till. A new sealed, chained day close aggregates the whole trading day above it, alongside the monthly and annual closes that already exist. The trading day runs from a cut-off hour the operator sets, defaulting to 05:00 and editable in Réglages, so a service running to 01:30 stays inside the previous day. **The refusal was offered and declined**: with a trading-day clock there is nothing at 00:01 to refuse, and the operator chose not to block the till. On the underlying question of trading hours the operator answered « based on what I know the answer is no but it can happen so take it in consideration » — the restaurant normally closes before midnight but not always, which is exactly the case the cut-off costs nothing to cover. → **Batch 3.8**

**DD-24 — the month boundary. ANSWERED 2026-09-06: the cut-off clock governs the month and the exercice as well.** Raised by Claude as a direct consequence of DD-23's answer, and put to the operator before any code: a Friday service on 30 June running to 01:00 on 1 July produces tickets whose calendar date is July but whose trading day is Friday. The day close would say June; the monthly close, keyed to the calendar date as it is today, would say July; and two sealed documents that can never be corrected would disagree about the same sales. That is the C-10 class of defect Stage 3 spent itself eliminating. **The operator chose to move the month onto the same clock**: June runs from 1 June at the cut-off to 1 July at the cut-off. **Free only because zero monthly and annual closes have ever been sealed**, re-verified 2026-09-06, and impossible to change cheaply after the first one. The alternative — leave `closeMonth` alone and accept the disagreement at month edges — was stated with its cost and rejected. → **Batch 3.8**

**DD-25 — tamper proofing. ANSWERED 2026-09-06: keyed fingerprints plus an integrity code printed on the day close, armed at Batch 8.0's reset.** The operator asked, twice and explicitly, whether the law required this before deciding. **It does not, and the answer given was that it does not**: BOFiP § 60 records that the legislator defined no specification and no technical solution, and § 140 names chaining and electronic signature as alternatives rather than as a pair. HibaPOS chains. What was put to the operator instead was the gap underneath the requirement to *demonstrate* that data has not been altered (§ 120): the recipe is readable in the source, so an administrator on the till could rewrite a sale and recompute every fingerprint after it, and `/api/fiscal/verify` would still report `ok`. The person able to do that is the assujetti, who is who the regime exists to constrain. Three options were offered — leave it; add a secret to the recipe; add the secret **and** print the day close's fingerprint on its ticket so a rewritten database no longer matches the filed paper. **The operator chose the third**, which is also what the private LNE referential asks for when it requires the last fingerprint to be held « hors d'accès de l'utilisateur ». The honest limit was stated before the choice and must reach the attestation: on a machine where the operator is administrator the secret is findable, so the secret defeats a casual edit and the paper defeats a determined one. → **Batch 3.9**


# RETIRED OPEN-THREAD ROWS AND SUPERSEDED FRONT-MATTER LINES

**APPENDED 2026-09-05 (Batch 5.7d).** The OPEN THREADS preamble had re-accumulated into a chain of "updated through X… before that Y… before that Z" for the second time in one session, and was collapsed to the current state again. The rule it now states explicitly — *this thread records the CURRENT state, not its history* — is the durable fix; each batch's account of what it moved belongs in that batch's record section, which is where it already is. *Last Completed Batch* was trimmed of its restatements in the same pass. Nothing operative was dropped: no thread row changed, and A, B, C, D and E are untouched by 5.7b, 5.7c and 5.7d.

**APPENDED 2026-09-05 (Batch 5.7a).** Recording 5.7a took the front matter **698 bytes OVER** its ~40 960 ceiling, so four paragraphs written in this same session were compressed rather than any older content retired. *Last Completed Batch*, *Next Batch* and *Last Updated* keep every operative fact and lose their restatements. The **OPEN THREADS preamble** lost its accumulated per-batch history — it had grown into "updated through X, before that Y, before that Z" — and now records only the current state; each batch's own account of what it moved is in that batch's record section, which is where the history belongs. Nothing was dropped that is not written down elsewhere: 5.7a's migration hand-over is in *Open Threads → B* with the exact command, its inertness in *A*, and its full account in this record.

**APPENDED 2026-09-05 (Batch 5.6).** Two rows left *Design Decisions Required* in this batch, under the criterion the earlier eleven were retired by — closed, batch `COMPLETED`, row already a pointer. **DD-13** (no pre-payment order state) went because 5.6 completed it. **DD-07** (one operational role) went to pay for 5.6's additions to the status block: Stage 4 is complete, both 4.4 and 4.4b are `COMPLETED`, and its full row has been in *Answered design decisions* since it was answered. The plan still names DD-07 in five places — the 4.4 and 4.4b stubs, L-33's row and the APPROVE-DEAD row in 7.2 — and each of those is a pointer to the same place.

**Also 2026-09-05 (Batch 5.6), one front-matter line compressed rather than retired.** *Awaiting decision* lost its list of which decisions were answered last and the two recorded-but-not-urgent questions it named — *"the callerless `/api/auth/approve` → delete in 7.2, and L-27 → done as Batch 3.6c"*. Both survive in the plan where they are actionable: the APPROVE-DEAD row in Batch 7.2, and the Batch 3.6c stub plus the finding index. The operative sentence — nothing is blocked on a decision, what remains blocked is blocked on hardware — is unchanged.

**Front matter subsection *Environment as last seen — verify before trusting*, retired whole on 2026-09-05 (Batch 5.1), from `REMEDIATION_PLAN.md` lines 162–167 at commit `04a76c9`.** Retired for size: the section stood at 40 819 bytes of its ~40 KB ceiling, leaving about 141 bytes, and this subsection was 635 of them — and item 8 was the subsection's last surviving occupant after Batch 4.7 retired item 6. **The fact is not lost and was never only here** — `L-24`'s row in *Newly Discovered Issues* carries the full measurement, the *Validation commands* table carries the `--timeout 30000` instruction, and *G* carries it beside the test count. The single pointer that named this subsection, in *Methods → Manual validation against the production build*, was repointed at warning 9 in the same commit.

#### Environment as last seen — verify before trusting

*These items describe the developer's machine at the end of session 4, not the project. Check each before acting on it, and delete it here once it no longer holds. Their numbers are kept because other sections refer to them.*

8. **`bun test src` fails 23 tests on this machine, and the code is fine.** All 23 are 5 s timeouts in `backup*.test.ts` / `auth.test.ts`: scrypt at N=2^17 costs ~1.5 s per call here and a backup→restore round trip makes several. Use `--timeout 30000`; the current count is in *G*. Recorded as **L-24** — do not "fix" a test that fails this way.

---

**Open Threads → F, retired whole on 2026-09-04 (Batch 4.4c), from `REMEDIATION_PLAN.md` lines 135–150 at commit `a2b34a7`.** Retired for size, not because it was wrong: the front matter stood at 45 233 bytes against the ~40 KB ceiling, and this was its stalest occupant — unextended since session 4, self-described as annotation rather than inventory, and pointing at `NEWLY DISCOVERED ISSUES` as the authoritative register. **Batch 7.1 still owes the merge it asks for**; the L-19 and L-21 re-measurements below exist nowhere else.

#### F. Findings still open — a sessions 3-and-4 snapshot, NOT the register

*Read this as annotation, not inventory.* It carries re-measurements that exist
nowhere else (L-19's and L-21's especially), but it has not been extended since
session 4 and therefore **omits L-28 through L-35**. **`NEWLY DISCOVERED ISSUES`
below the stage sections is the authoritative list.* Merge this into it in 7.1.

| ID | What | Suggested home |
|---|---|---|
| **L-19** | `report-widgets.tsx:76` renders rates with `toFixed(1)`, so a two-decimal rate (1,05 %) would display as "1.1 %". Not reachable while only 10 % and 5,5 % are in use. **Batch 3.6 deliberately did not reproduce it**: the receipt's new per-rate block labels rates from the breakdown *key*, not `toFixed`. So the defect is now confined to that one display site. | 7.1 |
| **L-21** | `renderReceipt()` centres but never wraps, so the restaurant's real 56-character address overflows 48-column paper on every ticket. **Re-measured in Batch 3.6 and still live** — 56 columns against a 48-column width, on a ticket rendered from the real settings. The four lines M-06 adds are at most 48, so the overflow is the address alone. | with the printer work |
| **L-22** | Validation errors surface as untranslated English zod messages in a French UI. | 7.1 |
| **L-24** | `bun test src` fails 23 tests on a slow machine — the backup/restore suite exceeds Bun's default 5 s timeout because scrypt at N=2^17 costs ~1.5 s per call here. Nothing to do with the code; it cost most of an hour to establish that in session 4. Run `bun test src --timeout 30000` if the failures are all in `backup*.test.ts`. | 6.1 |
| **L-27** | The open-caisse half of the 3.6b guard is scoped, as DD-18 wrote it, to caisses *opened inside* the period, so a caisse opened earlier and still open does not block the close. Reachable only through the first-ever close. | needs a decision — before 8.0 |
| **L-12**, **L-10**, **L-11** | Pre-existing, unchanged in sessions 3 and 4. | as recorded |

---

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

**Retired 2026-09-04 (Batch 4.4b).** The front matter stood at 42 700 bytes before this batch, already past the ~40 KB ceiling *HOW TO USE THIS FILE* sets, so four fully-superseded items were retired here verbatim rather than carried. (1) The leftover-server action row, which the resolved environment note directly above it already contradicted — those exact PIDs were stopped in session 7 and `bunx prisma generate` succeeded afterwards. (2) Session 5's migration correction, superseded in full by session 6's, three paragraphs below it. (3) and (4) The two ticked *Apply the migration* rows in *Waiting on the operator*, both restated in the *G* baselines table.

```
*(Row moved here from Open Threads → B.)*

| Action | Why it matters | Related |
|---|---|---|
| Stop the two leftover servers (PIDs 4016 on port 3011 and 24116 on port 3012, with their `bunx` parents 10540 and 22844) | *Corrected 2026-09-04 (session 7): the port-3010 process named here before is gone and the `EPERM` remains.* `bunx prisma generate` still fails renaming the Prisma engine DLL. Claude does not kill the operator's processes. `bunx next start -p <spare port>` works meanwhile. | — |

---
```

```
**Correction, 2026-09-04 (session 5).** The row above said the Batch 3.6 migration was unapplied. It is applied: `20260903233731_zreport_refund_totals` is in `_prisma_migrations` with `finished_at` 2026-09-04 00:54:37, matching `db/custom.db`'s mtime to the millisecond, and both sealed Z rows read `0/0`. **The production hash is now `7cc3367b8ff8518338bc5d00354cce4fde761d71d3b6a14336ed22c6209cc152`**, not the `ea990b79…` in *G*; everything else in the baseline is unchanged. Verified read-only.
```

```
| ~~**Apply the Batch 3.6b migration**~~ ✅ **DONE 2026-09-04 09:43** | Applied by the operator; verified read-only in Batch 4.1. See the correction in *A*. **No migration is pending** — Batch 4.1 added none. | L-26 |
```

```
| ~~**Apply the Batch 3.6 migration**~~ ✅ **DONE 2026-09-04** | Applied by the operator; verified read-only in Batch 3.6b. See the correction in *A*. | M-07 |
```

---

**Retired 2026-09-04 (after Batch 4.4b, preparing the file for a cold session).** Two more resolved items, retired to keep the front matter inside its own ~40 KB ceiling while warnings 1, 6 and 9 were corrected. Both concern the `EPERM` that cost sessions 3 through 7 several hours and turned out to be a stale `next start` holding the Prisma engine DLL: (1) warning 6's forensics — the dead PID 2072 on port 3010, and the live holders 4016 and 24116 — with the lesson kept in place; (2) the ticked *Stop the leftover servers* row in *Waiting on the operator*, whose operative instruction now lives in warning 9 as a rule about a session cleaning up after itself.

```
6. ~~**`bunx prisma generate` fails `EPERM`.**~~ **RESOLVED 2026-09-04 (session 7)** — and the diagnosis was right in kind, wrong in detail. Batch 3.6b named a `next start` on **port 3010** (PID 2072); that process was already gone while the `EPERM` persisted. The actual holders were two *other* Batch 3.1b leftovers, PIDs 4016 (`-p 3011`) and 24116 (`-p 3012`), started 2026-09-03 23:05 and 23:12 and both serving the session-3 scratch copy. The user asked for them to be stopped; with all three ports free, `bunx prisma generate` **succeeded**, regenerating the client to v6.19.2, and `bun test src --timeout 30000` still gives 413 pass / 0 fail against it. **The lesson worth keeping: a stale `next start` holds `node_modules/.prisma/client/query_engine-windows.dll.node`, so kill every leftover server before blaming the filesystem or OneDrive — and check the port list rather than trusting a PID recorded in an earlier session.** The `bun run dev` half of the original claim was never re-tested here: `dev` loads the real `.env` and would open the production database, so it stays untried on this machine. Sessions that need a server should keep using `bunx next start` on a **spare port** — 3.6b used 3021, 4.1 used 3022/3023, 4.2 used 3024/3025, 4.4 used 3033/3034, 4.4b used 3026 — and stop it by PID afterwards, `//T //F` so the child dies with the `bunx` parent (warning 9).
```

```
| ~~**Stop the leftover servers**~~ ✅ **DONE 2026-09-04 (session 7)** | Stopped at the user's explicit request: PIDs 4016 (`-p 3011`) and 24116 (`-p 3012`) with their `bunx` parents 10540 and 22844, all Batch 3.1b leftovers serving the session-3 scratch copy (marker `SCRATCH-3.1b-Administrateur`), none holding the production database. **`bunx prisma generate` then succeeded**, so the leftover `next start` really was the `EPERM` cause — the port number recorded against it was simply wrong. Ports 3010, 3011 and 3012 are now free. | — |
```

---

**Retired 2026-09-04 (after Batch 4.4b, same cold-session pass).** Session 6's migration correction in *Open Threads → A*. Everything operative in it is stated in three other places: the *G* baselines table carries the full hash lineage, the struck row it annotated now names the migration and its timestamp inline, and the status block says no migration is pending. The hash it announced, `a66bc96c…`, has since moved twice — to `e40735ca…` and then to `7839db18…` — through the operator's PIN change, so leaving it in the resume block was actively misleading.

```
**Correction, 2026-09-04 (session 6).** The 3.6b row above said its migration was unapplied. It is applied: `20260904091947_close_refund_totals` is in `_prisma_migrations` with `finished_at` **2026-09-04 09:43:54 (UTC+1)**, matching `db/custom.db`'s mtime, and `refundsTotal` / `refundsCount` are present on both `MonthlyClose` and `AnnualClose`, both tables still **empty** — so no sealed document was rewritten, exactly as the rehearsal predicted. **The production hash is now `a66bc96c20d3f00282ea249361dd80d6303434b1a43331c0725258b637db46f9`**, not the `7cc3367b…` recorded in *G*. Nothing is waiting on a `migrate deploy` any more. Everything else in the baseline is unchanged. Verified read-only.
```

---

**Retired 2026-09-04 (Batch 4.5), from `REMEDIATION_PLAN.md` at commit `bcd31a5`.** The front matter stood at **47 506 bytes** against the ~40 KB ceiling *HOW TO USE THIS FILE* sets, and *Last Updated* had already named the first three of these as the batch's retirement debt. Six items, all superseded rather than wrong.

**(1) The *Operator actions completed* block in *Open Threads → B*** — the PIN-change evidence table and the two-paragraph note under it. Retired because its lesson is now **enforced in code**: this batch put both published default PINs behind `PUBLISHED_DEFAULT_PINS` / `isPublishedDefaultPin()` in `src/lib/auth.ts`, with tests, and `scripts/seed-users.ts` refuses either value outright. The instruction it carried — *check a replacement PIN against the repository, not just against the value it replaces* — no longer depends on a human remembering it. The evidence itself is duplicated in Batch 4.3's record section and the hash lineage is in *G*. **What must survive and is restated in the trimmed *B*: the live PIN values were never seen by Claude and are recorded nowhere. Do not ask for them and do not write them down.**

```
**Operator actions completed — 2026-09-04**

| Action | Evidence | Closes |
|---|---|---|
| **Both live PINs changed** | Done by the operator in `Utilisateurs` on the running app, twice: four `USER_UPDATED` audit rows at 15:33:25, 15:33:34, 15:41:12 and 15:41:43 UTC, and the database hash moved `a66bc96c…` → `e40735ca…` → `7839db18…`. Fiscal state untouched throughout: counters `20/3/2/2`, `integrity_check ok`, 78 products, 2 Z reports, 0 closes. | **C-18's credential half.** |

**Two things about that change a later session must not misread.** (1) **The values were never seen by Claude and are recorded nowhere** — not here, not in the record, not in a commit. Do not ask for them and do not write them down. (2) The **first** attempt set the super-administrator to a value that was itself one of the two published defaults — present in `prisma/seed.ts`, `scripts/seed-users.ts`, commit `5ef7dc4`'s message and in this plan's own Batch 4.3 record. That was flagged and the operator changed both again; the second change is the one that closes the finding. The lesson is worth keeping: **this repository documents its own default PINs, so a replacement must be checked against the repository, not just against the value it replaces.**
```

**(2) Warning 5's DD-08 premise correction.** Retired because the file it warns about **no longer exists** — `scripts/port-real-data.ts` was removed in this batch, which is what the correction said Batch 4.5 would do. Warning 5 is rewritten in its place to describe the folder as it now is. The finding's own text survives in full in *Resolved findings* (L-37).

```
   **Corrected 2026-09-04 (DD-08 premise check) — the two scripts named above are an undercount, and the third one breaks a rule stated elsewhere in this file.** `port-real-data.ts` opens `db/custom.db` by a **hardcoded literal**, disables foreign keys and runs `DELETE FROM` on every table before refilling from a 1 September copy — no flag, no dry-run. It reads **neither `DATABASE_URL` nor `HIBAPOS_DATA_DIR`**, so *Methods → scratch copy* and warning 7 do **not** protect against it: both overrides set correctly, and running this script still destroys production. It is **L-37**, and Batch 4.5 removes it. Until then, treat `scripts/` as a folder where reading first is not optional.
```

**(3) Environment item 8's session-4 test count.** The sentence *"`bun test src --timeout 30000` gave **384 pass, 0 fail** at the time — that figure is a session-4 measurement kept for context; the current count is in *G*"* was a pointer to *G* wrapped around a stale number. *G* now reads 498. The L-24 lesson — 23 timeout failures on this machine are machine state, not a code defect, and must not be "fixed" — is kept in place.

**(4) The *Restructured* line.** Purely historical, and its operative half (*everything a session must know before acting sits above the first stage heading*) is stated in *HOW TO USE THIS FILE* rules and in step 1.

```
**Restructured:** 2026-09-04 — completed batches now live verbatim in `REMEDIATION_RECORD.md`; this file keeps the resume block, the open work, the registers and a stub per completed batch. Everything a session must know before acting sits above the first stage heading. See *HOW TO USE THIS FILE*.
```

**(5) The two applied migration rows in *Open Threads → A*.** Both struck through and ticked `✅ APPLIED` — so neither is "shipped but not yet in effect", which is what that table is for. Their timestamps are in *G* and in their own batches' records.

```
| ~~**`MonthlyClose` / `AnnualClose` refunds columns** (3.6b)~~ ✅ **APPLIED** — `20260904091947_close_refund_totals`, 2026-09-04 09:43:54, both tables still empty so no sealed document was rewritten | — | — |
| ~~**`ZReport.refundsTotal` / `refundsCount`** (3.6)~~ ✅ **APPLIED** — applied 2026-09-04 00:54:37; its own correction was retired to the record in Batch 4.4b, and *G* carries the state | — | — |
```

**(6) The answered design decisions, compressed to one line each.** *HOW TO USE THIS FILE* step 5.5 requires an answered decision's row to be cut to one line here with the full row moved to *Answered design decisions* — that had been done for the rationale but not for the rows, so ten answered decisions still occupied multi-sentence rows above the first stage heading. Every one of them is present in full in *Answered design decisions* above (DD-01, DD-02, DD-03, DD-05, DD-06, DD-07, DD-08, DD-17, DD-18, DD-19), verified before trimming. Nothing was summarised away that is not recorded there; the corrections some of them carry — DD-06's "protective by accident" premise, DD-07's two amendments, DD-08's undercounted premise — are all in those record entries.

---
**Compressed 2026-09-04 (Batch 4.6), from `REMEDIATION_PLAN.md` at commit `c23ae13`.** Batch 4.6's status block is longer than the one it replaced, which pushed the front matter back over the ~40 KB ceiling, so four passages were cut to pointers. Nothing was lost: (1) ***Open Threads → E*** held V-13 and V-02 in full while *External / Legal / Fiscal Verification* states both completely — E is now one sentence saying they are open. (2) **Warning 3b** kept its rule and lost the retold history of the leftover-`bun` incident, which is in Batch 4.5's record. (3) The **hardware-deferral table** became a sentence; each deferred criterion is in its own batch's status record. (4) **Environment item 8** kept the L-24 rule and lost the re-diagnosis. Batch 4.6's own WAL-restore and Git-Bash lessons were put in *Methods → Scratch copy* rather than in *Last Updated*, so they have one home.

---


**APPENDED 2026-09-06 (Batch 3.8).** DD-23 and DD-24 are retired from the plan's *DESIGN DECISIONS REQUIRED* table now that Batch 3.8 is `COMPLETED`, on the criterion the earlier twenty-two were retired by — answered, batch complete, row already a pointer. **DD-25 stays in the plan**, because Batch 3.9 has not started. The one-line pointers as they stood:

| ID | Decision | Blocks | Context |
|---|---|---|---|
| **DD-23** | **ANSWERED 2026-09-06 — a separate `Clôture du jour` above the caisse Z, on a trading-day clock; the till refuses nothing.** The operator was offered a refusal and declined it. | Batch 3.8 | Full row, and how the operator’s own research changed the question: `REMEDIATION_RECORD.md` → *Answered design decisions* |
| **DD-24** | **ANSWERED 2026-09-06 — the cut-off clock governs the month and the exercice too**, so a service past midnight sits in one trading day *and* one month, and no two sealed documents disagree. Free only while zero closes exist. | Batch 3.8 | idem |

# FINDING-ID PREFIXES

*Moved verbatim from `REMEDIATION_PLAN.md` on 2026-09-05 (Batch 5.5's de-stale pass), to keep the plan's front matter under its ~40 KB ceiling. It had not changed since the plan was written and is reference material, not a status.*

`C-nn` audit Critical/High · `M-nn` Medium · `L-nn` Low · `T-nn` testing gap (audit section G) · `DOC-nn` documentation-vs-reality (section D) · `V-nn` final-validation task (section J step 9) · `P-nn` preservation task. IDs are stable labels, not a ranking. **Audit IDs are never renamed**; `T-`, `DOC-`, `V-` and `P-` are new IDs assigned in this plan because the audit described those as groups rather than numbered findings.

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


---

**Retired from `REMEDIATION_PLAN.md` front matter in Batch 4.7 (2026-09-04), to make room under the ~40 KB ceiling.**

**(1) Environment item 6 — `bunx prisma generate` fails `EPERM`.** Marked `RESOLVED 2026-09-04` in session 4 and carried unchanged since. Its text: *"**The lesson: a stale `next start` holds `node_modules/.prisma/client/query_engine-windows.dll.node`, so stop every leftover server before blaming the filesystem or OneDrive, and check the port list rather than trusting a PID from an earlier session.** **`bun run dev` stays untried here** — it loads the real `.env` and would open the production database. Use `bunx next start` on a spare port (3021–3026, 3033/3034 and 3040–3043 are spoken for) and stop it with `taskkill //PID <pid> //T //F` (warning 9)."* Retired because warning 9 already carries the habit that prevents it; the `EPERM` cause, the `bun run dev` prohibition and the port list were folded into warning 9 in the same edit, and the port list extended with 3050–3052, which Batch 4.7 used.

**(2) The session-10 three-item note in *Last Updated*.** *Last Updated* is rewritten each session, so this is a replacement rather than a deletion — but two of its three items were retired rather than carried, because both are now stated in *Methods established by earlier batches*: "revert in BOTH directions" is in *Prove the test fails on the old code*, and the scratch-copy restore procedure (stop the server, delete `-wal` and `-shm` with the `.db`) is in *Scratch copy*. The third item, the front-matter ceiling itself, was carried forward.

*End of record as split on 2026-09-04. Append below this line.*

**APPENDED 2026-09-06 (Batch 3.7, session 16).** The front-matter *Last Updated* paragraph of session 15 was superseded by session 16's and is retired here verbatim, so its four lessons keep a home: « **Last Updated:** 2026-09-06 (session 15 — **Stages 5, 6 AND 7 all completed**, then a French-law gap check). Four things to carry forward. (1) **Assert the thing the finding is about, not the thing that is easy to read.** Three assertions this session measured a status where the body carried the answer (`/api/auth/me` answers 200-with-null), or a clock where a status code did — and one PASSED under its own revert. **Run the revert.** (2) **A test that passes locally is not a test that passes**: `bun test` compiles nothing, and a partial wipe passes until the file order changes — CI caught both. (3) **The list a batch is handed is evidence, not instruction** — two of L-07's ten entries were wrong and one stale citation did not exist. (4) **The law moved and nothing here knew** — two 2026 texts post-date the assistant's knowledge cutoff; `docs/conformite-isca-recherche.md` carries them with sources. **Front matter: retire before you add, and `plan-freshness.test.ts` now fails the build if an open finding names a COMPLETED batch.** »

**APPENDED 2026-09-06 (Batch 3.7, session 16).** Recording DD-23 took the front matter to 41 506 bytes, over its ~40 960 ceiling, so the four answered decision rows still in the plan's *DESIGN DECISIONS REQUIRED* table — each already a pointer to its full row in *Answered design decisions* above, each closed with its batch `COMPLETED` (7.4a, 7.4a, 7.4b, 7.3) — are retired here verbatim, as the earlier eighteen were on 2026-09-05:

| ID | Decision | Blocks | Context |
|---|---|---|---|
| **DD-20** | **ANSWERED 2026-09-05 — a given-away order is shown SEPARATELY**: not counted as a sale, with a distinct "given away" count and item list beside the sales figures. Average spend stays truthful and `topProducts` keeps meaning *what sold*. **Decided now because it changes the sealed close payload and zero closes exist.** | Batch 7.4a (L-50) | Full question, measurement and rejected options: `REMEDIATION_RECORD.md` → *Answered design decisions* |
| **DD-21** | **ANSWERED 2026-09-05 — the four non-fiscal reports adopt the FISCAL rule**: a period books the corrections it issued. One rule everywhere, so the dashboard's "today" stops disagreeing with `/api/reports/sales`. | Batch 7.4a (L-44) | Full question and rejected options: `REMEDIATION_RECORD.md` → *Answered design decisions* |
| **DD-22** | **ANSWERED 2026-09-05 — narrow `GET /api/users` and `GET /api/backups` to `["SUPER_ADMIN"]`, and review the other 27 gates**, marking each deliberate or decorative. Nothing in the UI calls either as a MANAGER — verified before the decision was put. | Batch 7.4b (L-33) | Full question: `REMEDIATION_RECORD.md` → *Answered design decisions* |
| **DD-04** | **ANSWERED 2026-09-05 — rotate, and accept the loss.** No re-encryption step and no key versioning: the premise was already spent. The `Backup` table holds **zero rows**, so `listBackups()` and `restoreBackup()` cannot reach any of the nine files on disk with or without the key. | Batch 7.3 (`NOT STARTED`); P-02 | Full question and rationale: `REMEDIATION_RECORD.md` → *Answered design decisions*. The zero-rows finding is **L-46**. |
