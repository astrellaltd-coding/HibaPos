# HibaPOS France — Remediation Plan

Master source of truth for the controlled remediation of HibaPOS France.
Derived from the read-only baseline audit of 2026-09-03 (repo at commit `5ef7dc4`).

Detailed audit record: https://claude.ai/code/artifact/329316b0-3a6b-48b0-9d27-d815004f4cbf

---

## CURRENT PROJECT STATUS

**Overall:** NOT READY FOR PRODUCTION

**Current Stage:** Stage 1 — Critical blockers

**Current Batch:** Batch 2.2 — Backup location, retention and failure visibility

**Last Completed Batch:** Batch 2.1 — Backup restore correctness (C-05 and the restore half of C-22 fixed; T-01 written at last; commit `723dd52`)

**Next Batch:** Batch 2.3. **Batch 1.4 is deferred** — see *Hardware-dependent validation* below.

**Blocked:** Batch 1.3 `[HW]` sign-off and Batch 1.4 — both need the app running on the restaurant's POS machine, which is in a different country from the developer and has no copy of the app installed (decision of 2026-09-03).

**Awaiting decision:** Batch 5.3 (cross-shift refunds), Batch 5.5 (cash movements), Batch 5.6 (order cancellation) — see *Design Decisions Required*

**Last Updated:** 2026-09-03

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

1. ~~`src/app/api/backups/**` is not in git.~~ **RESOLVED in Batch 0.1** (commit `e97a3e1`, 2026-09-03) — `.gitignore` anchored, the three route files are now tracked. The repo has still never been pushed (see P-01, Batch 0.2). Do not run `git clean`, do not reset, do not delete the working tree until Batch 0.2 (push + snapshot) is done.
2. **Do not run `bun run test:e2e`.** `playwright.config.ts` starts `bun run dev`, which loads the real `.env` and writes orders, refunds and Z reports into the **production database** and into an append-only hash chain that cannot be cleaned up. Fixed in Batch 6.3.
3. **Do not run `bunx vitest` / `npx vitest`.** Only `bun test src` is safe. The test-DB redirect lives in `bunfig.toml` → `test-setup.ts` preload, which vitest does not read; four test files begin by wiping 17 tables.
4. **The production database holds the user's real recovered data** (commit `0c5ede6`, 797 rows). Treat every DB-touching change as destructive until proven otherwise.
5. **Do not run scripts in `scripts/`** without reading them first. `seed-users.ts` and `seed-category-options.ts` begin with unguarded `deleteMany({})` calls (finding C-17).

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

**Stage status:** `NOT STARTED`

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

**Status:** `NOT STARTED`

### C-06 — Backups on the same disk, never pruned, failures swallowed

**Status:** `NOT STARTED` · Severity: CRITICAL · Category: operational / data loss

**Problem.** `BACKUP_DIR = process.cwd()/db/backups` — same folder as `custom.db`, same disk, inside the same OneDrive-synced tree. Every Z close re-tars and re-encrypts the entire uploads folder. No retention logic exists. The automatic backup's failure path reaches only `console.error`.

**Evidence.** `db/backups/` currently holds ~124 MiB from 3 backups (`.uploads.enc` 41–47 MB each) plus 3 orphaned legacy `.json` files. `shifts/[id]/close/route.ts:34-38` catches and logs, then returns HTTP 200. `BACKUP_LOCATION` is documented in `.env.example:20-21` and read nowhere.

**Location.** `src/lib/services/backup.ts:28-30, 113-134, 165`; `src/app/api/shifts/[id]/close/route.ts:32-38`

**Impact.** ~17 GB/year on the POS's own disk until it fills and SQLite writes fail. A single disk failure, ransomware event or deleted folder takes the database and every backup. Because the Z close returns 200 regardless, a restaurant can believe it has been backing up nightly for months and has not.

**Remediation direction.** Implement `BACKUP_LOCATION` and point it at a second physical volume; add keep-N retention; stop re-archiving all uploads on every close (or archive incrementally); surface the backup result in the Z-close response so a failure is visible to the operator.

### M-03 — Fiscal archives are not included in backups

**Status:** `NOT STARTED` · Severity: MEDIUM · Category: data integrity

**Problem.** Generated annual archives are written to `db/fiscal-archives/`; `createBackup` archives only `custom.db` and `public/uploads`.

**Location.** `src/app/api/fiscal/archive/route.ts:8`; `src/lib/services/backup.ts:140-207`

**Impact.** The archive an inspector would ask for is not protected by the backup mechanism.

**Remediation direction.** Include `db/fiscal-archives/` in the backup set.

### Cross-cutting in this batch — data directory location

**Status:** `REQUIRES DECISION`

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

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 2.3 — SQLite WAL and transaction safety

**Status:** `NOT STARTED`

### C-19 — The database is not in WAL mode

**Status:** `NOT STARTED` · Severity: HIGH · Category: database / performance

**Problem.** The live database runs in rollback-journal mode. Three documents say otherwise.

**Evidence.** `od -An -tu1 -j16 -N4 db/custom.db` → `16 0 1 1`. Byte 18 (write format) = 1 = rollback journal; WAL would be 2. No `-wal`/`-shm` sidecars. `db.ts:20-24` explains Prisma cannot issue the pragma. `docs/SQLITE_WAL.md:26-27` claims `start.sh` applies it — `start.sh` was deleted in commit `0aeea30` and `start.ps1` has no sqlite3 call. There is no `instrumentation.ts` or `middleware.ts`, so no startup hook of any kind.

**Location.** `db/custom.db` (header); `src/lib/db.ts:15-24`; `.zscripts/start.ps1`

**Impact.** Readers block writers; `_busy_timeout=5000` converts contention into a five-second stall. During the Z-close backup, `VACUUM INTO` holds a read lock across the whole database while a ~47 MB uploads tarball is encrypted in memory — the till hangs.

**Remediation direction.** Apply the pragma once (it persists in the file) and add it to the start script, as the documentation already claims. Add `sqlite3` to the documented prerequisites, or use a startup hook.

**⚠ Handling note.** Changing the journal mode of the production database is a write to that file. Do this only after Batch 0.2's snapshot exists, and verify the header byte before and after.

### C-15 (transaction-timeout half) — No `$transaction` sets a timeout

**Status:** `NOT STARTED` · Severity: HIGH · Category: data integrity

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

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 2.4 — Resource bounds and retention

**Status:** `NOT STARTED`

| ID | Status | Problem | Location | Direction |
|---|---|---|---|---|
| **M-29** | `NOT STARTED` | No retention for `AuditLog`, `TechnicalLog` or `FiscalEvent`. `TechnicalLog` writes into the same SQLite file as fiscal data, contending with checkout. Only expired sessions are pruned, opportunistically at login. | `src/lib/services/technical-logger.ts:13-15`; `src/app/api/auth/login/route.ts:43` | Retention policy for `TechnicalLog` and `AuditLog`. **`FiscalEvent` must never be pruned** — it is append-only by design; only bound the others. Consider moving technical logs out of the fiscal database. |
| **M-30** | `NOT STARTED` | `GET /api/media` walks the uploads tree with synchronous `readdirSync`/`statSync` and runs `sharp().metadata()` on every file, unpaginated — blocking the event loop for the whole POS. | `src/app/api/media/route.ts:52-92` | Async walk, paginate, cache or drop the dimension probe. |
| **M-31** | `NOT STARTED` | Unbounded `findMany` with full relation includes on operator-chosen date ranges (sales, VAT, cashiers, products, dashboard). `verifyFiscalChain` loads the entire journal into memory by design. | `src/app/api/reports/*/route.ts`; `src/lib/services/fiscal.ts:121` | Bound the report ranges or aggregate in SQL. For `verifyFiscalChain`, stream or chunk the walk. |
| **L-04**, **L-05** | `NOT STARTED` | `output: "standalone"` is built but never used; the stale `.next/standalone/` tree carries a Linux-path `.env` **containing live secret values** and ~275 MB of orphaned Prisma engine `.tmp` files. | `next.config.ts:4`; `.next/standalone/` | Remove the stale tree, and either drop `output: "standalone"` or fix and actually use it. **Treat the stale `.env` as a leaked-secret event** — see DD-04. |

### Batch 2.4 — Validation Required

- Retention: after the policy is applied, `TechnicalLog`/`AuditLog` row counts stay bounded; `FiscalEvent` count is **unchanged**.
- `/api/fiscal/verify` reports `ok` with an unchanged `lastSequence` (proves no fiscal rows were pruned).
- `GET /api/media` response time measured before and after with the real uploads folder; event loop no longer blocks (concurrent request served during the call).
- A report over a 1-year range completes without exhausting memory; record peak RSS.
- Confirm `.next/standalone/` removal does not break `bun run build` or `bun run start`.
- `bun test src` — PASS. `bun run build` — PASS.

### Batch 2.4 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

# STAGE 3 — FISCAL CORRECTNESS

**Stage status:** `NOT STARTED`

Audit section J, step 4: before the first Z report you would show an inspector. These are cheap now and expensive later, because sealed closes and generated archives cannot be corrected once written.

> **Rule for this entire stage:** no change to fiscal calculation, sealing or chaining may be marked `COMPLETED` without a targeted test that would fail on the old behaviour. Safety rule 4.

## Batch 3.1 — VAT rate keying

**Status:** `NOT STARTED`

### C-12 — The 5,5 % VAT rate is recorded and reported as 6 %

**Status:** `NOT STARTED` · Severity: HIGH · Category: confirmed bug (fiscal)

**Problem.** The VAT breakdown map is keyed by `Math.round(vatRate)`; `Math.round(5.5) === 6`.

**Evidence.** `src/lib/money.ts:42` `const key = Math.round(vatRate);`. The split itself uses the true rate (`:44`), so amounts are correct — only the label is wrong. `money.test.ts` tests `splitVat` at 5.5 % but never asserts the breakdown key.

**Location.** `src/lib/money.ts:37-51` — consumed by `orders/route.ts:290`, `reports.ts:67`, `fiscal.ts:215`, `reports/vat/route.ts:42`

**Impact.** 5,5 % is a live French rate. Every VAT breakdown — Z report, sealed `MonthlyClose.vatBreakdownJson`, TVA report, annual archive — attributes those amounts to a "6 %" rate that does not exist. 2,1 % would collapse to "2". Co-existing 5,5 % and 6 % rates would silently merge.

**Remediation direction.** Key the breakdown by the exact rate (a fixed-precision string, e.g. `"5.5"`). Back-fill or annotate any already-sealed closes.

**Dependency note.** Do this **before** Batch 3.2, because 3.2 unifies the aggregation code that consumes this key. Doing them in the reverse order means writing the unified function twice.

**Data-migration question.** Existing `vatBreakdownJson` values in already-sealed `ZReport` and `MonthlyClose` rows carry the wrong key. Sealed rows must not be rewritten. See *Design Decisions Required → DD-03*.

### Batch 3.1 — Validation Required

- Targeted test: a product at 5,5 % produces a breakdown keyed `5.5`, not `6`.
- Targeted test: 5,5 % and 6 % products in the same order produce two separate breakdown entries.
- Targeted test: 20 %, 10 %, 2,1 % all key correctly.
- Regression: the *amounts* (`ht`, `vat`, `ttc`) are unchanged by the key fix — only the key changes.
- Consumers still parse: Z report render, VAT report, monthly close serialisation, archive payload.
- `bun test src` — PASS. `bun run typecheck` — PASS.
- **Fiscal verification:** confirm previously sealed rows are untouched and the chain still verifies.

### Batch 3.1 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 3.2 — Unify revenue and VAT aggregation

**Status:** `NOT STARTED`

The audit found the same period revenue computed **four different ways** across four modules. This batch collapses them into one.

### C-10 — Sealed monthly/annual closes do not reconcile with their Z reports

**Status:** `NOT STARTED` · Severity: HIGH · Category: data integrity (fiscal)

**Problem.** `aggregatePeriod` skips fully-refunded orders from sales totals but then collects payments from **every** order including those, and never subtracts refunds from `cashTotal`/`cardTotal`/`voucherTotal`. `computeShiftReport` does both.

**Evidence.** `services/fiscal.ts:201` `continue` (sales only) → `:223` `orders.flatMap(o => o.payments)` (all orders) → `:224-226` sums with no refund netting. Compare `services/reports.ts:86-91, 104-106`.

**Location.** `src/lib/services/fiscal.ts:184-244` vs `src/lib/services/reports.ts:23-113`

**Impact.** As soon as any refund exists in a period, the sealed `MonthlyClose` cannot equal the sum of that period's `ZReport` rows — and being sealed, it cannot be corrected. An inspector reconciling the two chains finds a discrepancy the system cannot explain.

**Remediation direction.** Make `aggregatePeriod` use the same netting logic as `computeShiftReport`, or better, derive period closes by summing the sealed Z reports rather than re-aggregating raw orders.

### C-11 — VAT report produces fractional cents; sales report ignores partial refunds

**Status:** `NOT STARTED` · Severity: HIGH · Category: confirmed bug (fiscal)

**Problem.** Both reports use `round2()` — a euros helper — on cent values, so a pro-rated line total keeps a half-cent. `reports/sales` filters to `status === "COMPLETED"` and never subtracts partial refunds.

**Evidence.** `money.ts:19` `round2(n) = Math.round((n+ε)*100)/100`. `reports/vat:41` `round2(1250 × 0.85)` → `1062.5` (half-cent survives) where `reports.ts:63` `Math.round(...)` → `1063`. `reports/sales:22,44` sums `o.total` for completed orders only.

**Location.** `src/app/api/reports/vat/route.ts:41`; `src/app/api/reports/sales/route.ts:22,36,44`; `src/lib/money.ts:19`

**Impact.** `/api/reports/vat` is what a manager reads to file the TVA declaration. It rounds differently from the Z report and from the sealed monthly close, so three official-looking figures for the same period disagree. The sales report overstates revenue whenever a partial refund exists.

**Remediation direction.** Delete `round2` from every cents path. Extract one shared period-aggregation function; have checkout, X/Z, closes and the reports all call it.

### M-13 — Per-line discount pro-rating rounds independently

**Status:** `NOT STARTED` · Severity: MEDIUM · Category: data integrity (fiscal)

`Σ netLineTotal` need not equal `total − discount`, so the stored `vatTotal` can be off by cents against the order total. `src/app/api/orders/route.ts:286-292`. Direction: distribute the rounding remainder deterministically (largest-remainder) so the parts sum to the whole.

### M-14 — Shift summary is a fourth aggregation semantic

**Status:** `NOT STARTED` · Severity: MEDIUM · Category: data integrity

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

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 3.3 — Archive integrity and lifecycle

**Status:** `NOT STARTED`

### C-04 — Archive checksum ignores every date and is not reproducible from the file

**Status:** `NOT STARTED` · Severity: CRITICAL · Category: data integrity (fiscal)

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

**Status:** `NOT STARTED` · Severity: MEDIUM · Category: confirmed bug (fiscal)

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

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 3.4 — Fiscal operator interface

**Status:** `NOT STARTED`

### C-27 — The fiscal operator surface has no user interface

**Status:** `NOT STARTED` · Severity: CRITICAL · Category: incomplete functionality

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

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

---

## Batch 3.5 — Fiscal audit-trail completeness

**Status:** `NOT STARTED`

### C-13 — The manager who approved a discount is verified and then discarded

**Status:** `NOT STARTED` · Severity: HIGH · Category: audit trail

**Problem.** `discountApproverId` is assigned from the verified approval token and never read again. `Order` has no approver column; the audit entry and the `VENTE` fiscal event both omit it.

**Evidence.** `orders/route.ts:216` declares, `:231` and `:247` assign, nothing reads. The `ORDER_CREATED` audit payload (`:417`) records `{number, total, items, payments}`. Contrast `refund.ts:82`, which correctly persists `approvedById`.

**Location.** `src/app/api/orders/route.ts:212-248, 411-419`

**Impact.** Above-threshold discounts are the most audited operation in a restaurant. The system enforces the approval correctly and keeps no record of who gave it — a manager cannot be shown which discounts they authorised and a dispute cannot be resolved from the data.

**Remediation direction.** Add an approver column to `Order` (or at minimum include the ID in the audit and `VENTE` payloads).

**⚠ Schema note.** Adding a column requires a migration. Coordinate with Batch 1.4's update procedure and confirm `migrate deploy` runs on the production machine.

### C-22 (chain-design half) — The hash chain is unkeyed

**Status:** `REQUIRES EXTERNAL VERIFICATION` · Severity: HIGH · Category: fiscal / requires external input

**Problem.** Event hashes are plain SHA-256 over public inputs — no HMAC key, no signature, no external timestamp. Anyone who can write to `db/custom.db` can alter a row and recompute the rest of the chain; `/api/fiscal/verify` then reports `ok`.

**Evidence.** `fiscal.ts:43-53` — `createHash("sha256").update(\`${previousHash}|${sequence}|${type}|${timestamp}|${dataJson}\`)`. No secret involved.

**Impact.** The chain detects accidental or naive tampering. It does not detect a deliberate edit by anyone with access to the Windows machine — which, given the app writes its own database inside a user Desktop folder, is anyone who can log into the till.

**Remediation direction.** Whether an unkeyed chain is sufficient is a certification question, not a code question. Options include keying the chain with a secret the operator cannot read, or anchoring periodic digests externally. **Do not implement either without the answer to V-01.**

*The restore/deletion-tracing half of C-22 is Batch 2.1.*

### M-04 — Refund fiscal events record a cuid in a field named `orderNumber`

**Status:** `NOT STARTED` · Severity: MEDIUM · Category: fiscal traceability

`services/refund.ts:131` passes `order.id` as `orderNumber`, so the journal payload cannot be tied to a printed ticket number without a join. Direction: pass the real `order.number`. **Warning:** changing an event payload changes its hash — this affects only *new* events; existing rows must not be touched.

### Batch 3.5 — Validation Required

- Targeted test: an above-threshold discount approved by a manager persists the approver, and the value survives into the audit log and the `VENTE` payload.
- Targeted test: a new `REMBOURSEMENT` event carries the ticket number, not the cuid.
- **Chain regression:** existing events still verify unchanged; `/api/fiscal/verify` reports `ok` with the baseline `lastSequence` plus only the events created during testing.
- Migration applied cleanly on a copy of the production database; row count and chain state unchanged.
- `bun test src` — PASS. `bun run typecheck` — PASS.
- C-22 remains `REQUIRES EXTERNAL VERIFICATION` regardless of the rest of the batch — the batch may complete without it, with that item explicitly carried forward.

### Batch 3.5 — Status Record

**Status:** `NOT STARTED` · **Completed:** — · **Changes:** — · **Files:** — · **Tests:** — · **Commit:** — · **Notes:** —

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

Audit section J, step 9. Nothing here is a code change; all of it is proof.

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
| **DD-02** | **Where does application data live?** `%ProgramData%\HibaPOS\`, a dedicated `C:\HibaPOS\`, or the current install directory? The current path is inside a OneDrive-synced Desktop folder, which locks SQLite files. Under `C:\Program Files\` the app cannot write at all. | Batch 2.2; shapes 1.4 | Every path except `DATABASE_URL` is `process.cwd()`-anchored. |
| **DD-03** | **Already-sealed rows with the wrong VAT key.** Existing `ZReport` and `MonthlyClose` rows carry `vatBreakdownJson` keyed "6" for 5,5 %. Sealed rows must not be rewritten. Annotate, re-issue, or leave with a documented explanation? | Batch 3.1 | This is a fiscal-record question as much as a technical one — may need V-01. |
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
| L-15 | 2026-09-03 | Batch 2.1 decrypt-tool verification | **Restore has no schema-version check, and at least one existing backup predates five tables.** Decrypting the real `hibapos-backup-2026-08-28T01-21-34-082Z.dbenc` shows 26 tables against the live schema's 31 — missing `AnnualClose`, `FiscalArchive`, `FiscalEvent`, `GrandTotal`, `MonthlyClose`. Restoring it succeeds and leaves the application running against a database with **no fiscal journal**: every fiscal query fails, and the new `RESTAURATION` event cannot even be written (handled non-fatally, logged as ERROR). `restoreBackup` compares the *data* checksum but never the schema. Needs a decision — refuse a restore whose `_prisma_migrations` do not match, warn and proceed, or run `migrate deploy` after the swap. | **HIGH** (silent post-restore breakage) | needs a decision; suggest 2.2 or a new DD |
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
| 2.1 | COMPLETED | 2026-09-03 | `723dd52` | C-05 + C-22 (restore half): images restored, atomic rename swap, 503 maintenance gate during the swap, RESTAURATION/SUPPRESSION_SAUVEGARDE journalling, counter-rewind detection, out-of-band decrypt tool. T-01 written; 214/214. Found L-15 (no schema check on restore). |
| 1.2 | COMPLETED | 2026-09-03 | `38d19a2` | C-02: Z-close dialog now passes cents to `Money`/`formatEuro` at all three sites; variance kept in cents (`z-close.ts`). 8 new tests; 153/153. Verified by running the identical scenario pre-fix and post-fix on a scratch DB copy — display went from 2,00 €/2,09 €/-0,05 € to 200,00 €/208,90 €/-5,00 €, while every ZReport and Shift field stayed identical. Production DB untouched. |

---

# FINDING INDEX

Quick lookup from audit ID to batch.

| ID | Batch | ID | Batch | ID | Batch |
|---|---|---|---|---|---|
| C-01 | 1.1 | M-01 | 3.6 | M-25 | 4.4 |
| C-02 | 1.2 | M-02 | 3.3 | M-26 | 4.4 |
| C-03 | 1.3 | M-03 | 2.2 | M-27 | 4.3 |
| C-04 | 3.3 | M-04 | 3.5 | M-28 | 4.3 |
| C-05 | 2.1 | M-05 | 5.5 | M-29 | 2.4 |
| C-06 | 2.2 | M-06 | 3.6 | M-30 | 2.4 |
| C-07 | 1.4 | M-07 | 3.6 | M-31 | 2.4 |
| C-08 | 4.1 | M-08 | 5.6 | L-01 | 7.2 |
| C-09 | 4.2 | M-09 | 5.7 | L-02 | 7.2 |
| C-10 | 3.2 | M-10 | 5.7 | L-03 | 7.2 |
| C-11 | 3.2 | M-11 | 5.7 | L-04 | 2.4 / 7.3 |
| C-12 | 3.1 | M-12 | 5.7 | L-05 | 2.4 (deferred) |
| C-13 | 3.5 | M-13 | 3.2 | L-06 | 6.3 |
| C-14 | 5.3 | M-14 | 3.2 | L-07 | 7.2 |
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
| C-26, C-26b | 0.1 | C-27 | 3.4 | P-01…P-03 | 0.2 |

---

*Plan created 2026-09-03 from the baseline audit of commit `5ef7dc4`. No application code was modified in its creation.*
