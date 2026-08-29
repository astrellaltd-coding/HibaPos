# HibaPOS France — Implementation Plan

> Living document. Update the status of each task as work progresses so any
> session can resume exactly where the previous one stopped.
>
> **Status legend:** `[x]` done · `[~]` in progress · `[ ]` todo · `[!]` blocked · `[-]` skipped/deferred

Last updated: 2026-08-29 (Phase 1 complete)

---

## Context & decisions

- **Product**: French restaurant POS (single fast-food restaurant in France), TVA-assujetti, B2C encaissements → in scope of art. 286-I-3° bis CGI (loi anti-fraude TVA). May later be resold to other restaurants.
- **Deployment target**: Windows all-in-one touchscreen PC, **single terminal**, Sunso WTP-801 thermal printer (80 mm, USB-B / RS232 / LAN, ESC/POS, cash-drawer DK port 24 V) + cash drawer driven via the printer.
- **Tauri desktop shell**: **DEFERRED** (excluded for now). Focus first on fixing the app and completing tests. Re-evaluate Tauri once the app is solid.
- **Dark mode**: **REMOVED completely** (Phase 0c done). Light-only.
- **NF525 / ISCA**: the app is the éditeur (custom/in-house). Path = build to ISCA standard + self-issue attestation de conformité (BOI-LETTRE-000242, both volets). Keep architecture NF525-auditable for future LNE/INFOCERT certification if reselling.
- **Git**: fresh repo, v0 baseline commit. Remote = `origin → https://github.com/astrellaltd-coding/HibaPos.git` (added, not yet pushed — needs credentials).
- **Serving model (PENDING DECISION — see 0e)**: how the app runs on the POS PC. Recommendation: `bun run start` (standalone) on localhost:3000, browser fullscreen. This makes the z.ai deploy infra (Caddy, .zscripts, mini-services, python tests) dead weight.

### Verification commands (run after each phase)
```powershell
bun run lint          # expect 0 errors
bunx tsc --noEmit     # expect exit 0
bun test src          # expect all pass
```

---

## Phase 0 — Foundation & Cleanup

- [x] **0a** Git reset to v0 (old history archived at `…\opencode\hibapos-git-backup-20260829023844`)
- [x] **0b** Remote `origin` added; **PUSH PENDING** (needs GitHub auth): `git push -u origin main`
- [x] **0c** Dark mode removed completely (next-themes dep, ThemeProvider, useTheme, all `dark:` in authored files; shadcn primitives' inert `dark:` left as dead code)
- [x] **0d** Stale artifacts deleted: `dev-err.log`, `dev-out.log`, `agent-ctx/`, `download/`, `worklog.md`, `upload/pasted_image_…`, `.zscripts/dev.pid`
- [x] **0e** **Serving model decided**: `bun run start` on localhost:3000, browser fullscreen. → z.ai deploy infra (`Caddyfile`, `.zscripts/*.sh`, `mini-services/`, `tests/python-runtime-*.sh`) becomes dead weight to remove in Phase 4c. (DB path also fixed: `.env` now absolute `file:C:/.../The App/db/custom.db` — the old `/home/z/my-project/...` Linux path was stale.)
- [ ] **0f** Hygiene fixes:
  - [ ] rename `package.json` `name` from `nextjs_tailwind_shadcn_ts` → `hibapos-france`
  - [ ] README: replace npm/pnpm instructions with `bun` (project uses `bun@1.3.14`, ships `bun.lock`)
  - [ ] `.gitignore`: add `/upload/` so runtime uploads aren't committed
  - [ ] remove or guard `scripts/delete-products.js` (currently wipes ALL products unconditionally; README claims it filters by name — doc/code mismatch, dangerous)
  - [ ] add `typecheck` script to `package.json` (`bunx tsc --noEmit`)

**Phase 0 commit (ready to make):** includes 0c + 0d changes already on disk.
```
git add -A
git commit -m "Phase 0: remove dark mode, delete stale dev artifacts, add implementation plan"
git push -u origin main
```

---

## Phase 1 — ISCA / NF525 compliance (LEGAL BLOCKER) — ✅ COMPLETE

The 4 conditions (art. 286-I-3° bis CGI, BOI-TVA-DECLA-30-10-30): **I**naltérabilité, **S**écurisation, **C**onservation, **A**rchivage. Penalty: €7,500/software + 60 days (art. 1770 duodecies).

> Implemented via a unified hash-chained `FiscalEvent` journal (JFP). Each event
> stores `previousHash` + `hash` (SHA-256 of previous + sequence + type + timestamp +
> canonical data). Orders/Refunds/ZReports reference their event via `fiscalEventId`.
> `GrandTotal` perpetual counter, `MonthlyClose`/`AnnualClose` sealed clôtures,
> `FiscalArchive` annual exports. Verification via `GET /api/fiscal/verify`.
> Migration: `20260829020705_add_fiscal_journal` + `20260829022715_close_datajson`.

- [x] **1a+1b** **Hash-chained FiscalEvent journal (JFP)** — `src/lib/fiscal.ts` (pure: canonicalize, computeEventHash, verifyEvents, verifyCloses) + `src/lib/services/fiscal.ts` (appendFiscalEvent, verifyFiscalChain). Wired into checkout (VENTE), refund (REMBOURSEMENT/ANNULATION), shift close (CLOTURE_Z), reprint (REIMPRESSION), drawer (OUVERTURE_TIROIR).
- [x] **1c** **Monthly/annual clôtures + grand total perpétuel** — `GrandTotal` singleton (incremented on sale, never resets), `closeMonth`/`closeYear` sealed + chained, `GET /api/fiscal/closes`, `POST /api/fiscal/close-month|close-year`, `GET /api/fiscal/grand-total`.
- [x] **1d** **Mode FACTICE / SIMULATION** — `settings.factice` flag; receipts stamp `*** FACTICE — SIMULATION ***` + `TICKET NON VALABLE`; every FiscalEvent tagged `factice`.
- [x] **1e** **Annual fiscal archive export** — `generateAnnualArchive` (open JSON + SHA-256 + French notice), `POST/GET /api/fiscal/archive`, `GET /api/fiscal/archive/[year]` (download).
- [x] **1f** **Attestation de conformité** — `docs/attestation-conformite.md` (BOI-LETTRE-000242, two volets — print + sign both, store with accounting records).
- [x] **1g** **Tests** — `src/lib/fiscal.test.ts` (22 tests: canonicalize, computeEventHash, verifyEvents round-trip/tamper/broken-link, verifyCloses). 69 total tests pass.
- [x] **1-check** Lint 0 errors · tsc exit 0 · 69 tests pass.

---

## Phase 2 — Correctness & Security

- [ ] **2a** **Integer-cents migration** — schema Float→Int (cents) for every money column (`Product.price*`, `OptionChoice.*priceModifier`, `AddOn.price`, `Shift.*float`, `Order.*total`, `OrderItem.*`, `Payment.*`, `Refund.amount`, `ZReport.*`); rewrite `money.ts` calc paths to operate in cents end-to-end (convert to euros only at the formatting/DTO boundary via existing `fromCents`); rewrite `reports.ts` pro-rata in integer cents; update Zod schemas. Data migration SQL: `UPDATE … SET col = ROUND(col*100)`.
- [ ] **2b** **Fix `reports.ts` bugs** — `salesCount` must match the summed set (exclude fully-refunded from count too); net card/voucher totals by their respective refunds (not just cash); remove `_refundsTotal` dead code. Add unit tests (currently zero).
- [ ] **2c** **Harden PIN hashing** — `scryptSync(pin, salt, 64, { N: 1<<17, r: 8, p: 1, maxmem: 2**30 })` (match `backup.ts`); consider longer PINs. Currently default N=2^14 on a 6-digit keyspace is GPU-brute-forceable from the local DB.
- [ ] **2d** **Session revocation** — either use the `Session` table (persist sessionId, check existence + expiry + lastActivity on each request, support per-session revoke) or delete the `Session` model. Currently a stolen signed cookie is valid 12h with no per-session revoke.
- [ ] **2e** **Role gate fixes**:
  - `GET /api/backups` → gate to SUPER_ADMIN (currently any cashier can list backups)
  - `PUT /api/tables/[id]` (status cycling) → allow MANAGER+ (UI exposes it to cashiers → 403)
  - `POST /api/catalog/products/availability` → allow MANAGER+ (README assigns catalog to MANAGER)
  - reconcile README shift open/close (says MANAGER) vs implementation (any authed) — update README
- [ ] **2f** **Transaction bulk ops** — wrap `products/availability`, `products/update-images`, `tables/seed` in `db.$transaction`.
- [ ] **2g** **`validation.ts` contracts** — `checkoutSchema`: enforce customer name/phone/address when `orderType=LIVRAISON` (`.superRefine`); `orderItemSchema`: drop trust of client `unitPrice`/`lineTotal` (server recomputes anyway — keep schema minimal); add Zod to `update-images`, `media` DELETE, `reports/x|z` POST for consistency.
- [ ] **2h** **Defensive parsing** — `services/receipt.ts`: wrap `JSON.parse(optionsJson/addOnsJson)` in try/catch so a corrupt row doesn't break receipt printing. `csv-export.ts`: fix `LIVRAISON` mislabeled as "À emporter" → "Livraison".

---

## Phase 3 — Test coverage

Current: 47 unit tests (lib utilities only), 2 e2e API-smoke specs. Zero tests for any API route handler or React component.

- [ ] **3a** **Fix runner ambiguity** — project has `vitest.config.ts` + `vitest` devDep but `test` script uses `bun:test` (via `bunfig.toml` preload). Pick ONE: recommendation = keep `bun:test` (fast, already working), remove `vitest.config.ts`/`vitest.setup.ts`/`@vitest/coverage-v8` OR fully commit to vitest. Document the choice.
- [ ] **3b** **API route tests** — checkout (price recompute, payment exact-cover, receipt number atomicity), refund (amount clamp, method match, double-spend, table auto-free), shift close (Z generation, grand total), fiscal counter (concurrent increments). These are the highest-risk untested surfaces.
- [ ] **3c** **Component test setup** — if needed, add jsdom environment config so React views can be tested (currently `environment: node`).
- [ ] **3d** **E2E cashier journey** — Playwright: login → open shift → build cart → pay → print receipt → close shift → Z report. Fill the 02/03 sequence gaps. (Single browser chromium is fine for a Windows POS.)
- [ ] **3e** **Fix `backup.test.ts`** — currently tests a parallel re-implementation of the crypto, not the real (unexported) `encryptFile`/`decryptFile`. Export the helpers or test via the public `createBackup`/`restoreBackup` surface with a fixture DB.

---

## Phase 4 — App fixes & dead-code removal

- [ ] **4a** **Persist cart + held orders** — add Zustand `persist` middleware (at least for `heldOrders`, ideally cart too) to `localStorage`. Currently a page reload wipes the in-progress sale and every parked order.
- [ ] **4b** **Remove `src/` dead code** (no app/core logic changes, pure removal):
  - `Session` Prisma model — drop if 2d chose not to use it
  - `src/hooks/use-toast.ts` + `src/components/ui/toaster.tsx` — sonner is used everywhere; these are dead (verify no imports first)
  - `ProductDto.options` + `productOptions?` redundant alias — keep one
  - `_refundsTotal` dead var in `reports.ts` (if not already removed in 2b)
  - `safeParseOptions`/`ORDER_TYPE_LABELS`/`PAYMENT_LABELS` duplicated across `receipt-dialog.tsx` + `orders-view.tsx` → extract to a shared module
  - `Kpi`/`VatBreakdownTable`/`TopProductsList` duplicated in `shifts-view.tsx` + `reports-view.tsx` → extract to shared
  - redundant `@@index` on already-unique columns (`User.username`, `Category.name`, `Order.number`)
  - unused imports flagged by the 4 lint warnings (`upload/route.ts` randomBytes, `media-picker-dialog.tsx` ScrollArea, `pos-view.tsx` setSearch + ProductCardMemo)
- [ ] **4c** Remove z.ai deploy infra (after 0e decision): `Caddyfile`, `.zscripts/*.sh`, `mini-services/`, `tests/python-runtime-*.sh`.
- [ ] **4d** Hardcoded hex backgrounds in shell/topbar → replace with theme tokens (was a dark-mode blocker; now just hygiene).
- [ ] **4e** `Refund.approvedById`/`shiftId` and `Table.currentOrderId` plain strings with no FK — add FKs or document the intentional omission.

---

## Phase 5 — Tauri desktop shell (DEFERRED)

Excluded for now per decision. Re-evaluate after Phases 1–4 are complete.

Planned approach (when resumed): Tauri v2 shell, Next.js `output: "standalone"` server as sidecar, webview → `localhost:3000`, `tauri-plugin-esc-pos` for Sunso WTP-801 USB + cash drawer kick, Windows `.msi` installer, kiosk/auto-start.

---

## Appendix A — ISCA requirements vs. current state

| ISCA requirement | Current state | Gap |
|---|---|---|
| Immutability of validated ticket | Orders/Receipts immutable in practice (no delete path, only refund) | SQLite file directly editable — needs hash-chaining (1a) for tamper detection |
| Sequential atomic receipt numbering | `FiscalCounter` + `increment:1` in `$transaction` | ✅ met (but has needed manual repair — `fix-fiscal-counter.ts`) |
| Cryptographic chaining (S) | ❌ none | 🔴 1a |
| Journal des événements (JFP) append-only | `AuditLog` mutable, not hash-chained | 🔴 1b |
| Operator audit trail | `cashierId` on orders/payments/refunds; approval tokens | 🟡 partial — drawer/reprint/discount not in inalterable trail |
| Mode école / FACTICE | ❌ none | 🟠 1d |
| Clôtures Z / M / A + total perpétuel | Z (daily) ✅; monthly/annual ❌; perpetual total ❌ | 🔴 1c |
| Correction = contre-ticket | Refund = contre-opération | ✅ met |
| Conservation 6 ans | Data stays in SQLite; encrypted backups exist | 🟡 acceptable |
| Archivage format ouvert + notice FR + empreinte | Encrypted `.dbenc` (proprietary) + CSV export; no formal archive | 🟠 1e |
| Money stored in integer cents | Float euros (SQLite REAL) | 🟠 2a (correctness, inspected at control) |
| Editor attestation / certificate held | None | 🔴 1f |

## Appendix B — Key file paths

- Schema: `prisma/schema.prisma` · seed: `prisma/seed.ts` + `src/lib/services/seed.ts`
- Auth: `src/lib/auth.ts` · approvals: `src/lib/approvals.ts` · middleware: `src/lib/api-handler.ts`
- Money/VAT: `src/lib/money.ts` · reports: `src/lib/services/reports.ts` · sequence: `src/lib/services/sequence.ts`
- Backup: `src/lib/services/backup.ts` · receipt: `src/lib/services/receipt.ts`
- Validation: `src/lib/validation.ts` · types: `src/types/api.ts`
- SPA shell: `src/app/page.tsx` · `src/components/shared/app-shell.tsx` · `src/components/shared/topbar.tsx`
- State: `src/store/app-store.ts` · `src/store/cart-store.ts`
- API routes: `src/app/api/**` (50 route files)

## Appendix C — Legal references

- Art. 286-I-3° bis CGI (obligation ISCA) · Art. 1770 duodecies CGI (€7,500 penalty + 60 days)
- Loi n° 2026-103 du 19 fév 2026 art. 125 (rétablit l'attestation éditeur depuis 21 fév 2026)
- BOI-TVA-DECLA-30-10-30 (ISCA conditions) · BOI-LETTRE-000242 (attestation model, 2 volets)
- Accredited certifiers: INFOCERT/AFNOR (NF525) · LNE. Fausse attestation = 3 yrs prison + €45,000 (art. 441-1 code pénal).
