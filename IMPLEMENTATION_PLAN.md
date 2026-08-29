# HibaPOS France — Implementation Plan

> Living document. Update the status of each task as work progresses so any
> session can resume exactly where the previous one stopped.
>
> **Status legend:** `[x]` done · `[~]` in progress · `[ ]` todo · `[!]` blocked · `[-]` skipped/deferred

Last updated: 2026-08-29 (Phase 7 complete)

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

- [x] **2A** Targeted fixes — COMPLETE (commit `a68d82e`):
  - [x] **2b** Fix `reports.ts` bugs: `salesCount` now matches summed set; card/voucher totals net of their refunds; `_refundsTotal` dead code removed.
  - [x] **2c** Harden PIN scrypt: `N=2^17, r=8, p=1, maxmem=2^30` (was default `N=2^14` — GPU-brute-forceable).
  - [x] **2d** Server-side session revocation: `Session` table now used (create on login, check on every request, delete on logout, `revokeAllUserSessions` on deactivation/PIN change).
  - [x] **2e** Role gate fixes: `GET /api/backups` → MANAGER+; `PUT /api/tables/[id]` → any authed (UI exposes status cycling to cashiers); `POST /api/catalog/products/availability` → MANAGER+.
  - [x] **2f** Transaction bulk ops: `products/availability`, `products/update-images`, `tables/seed` wrapped in `db.$transaction`.
  - [x] **2g** Validation: `checkoutSchema` superRefine requires `customerId` for LIVRAISON; `update-images` now uses Zod.
  - [x] **2h** Defensive parsing: `receipt.ts` JSON.parse wrapped in try/catch; `csv-export.ts` LIVRAISON label fixed.
  - **2A check**: lint 0 errors · tsc exit 0 · 69 tests pass.
- [x] **2B** Integer-cents migration — COMPLETE (commit `720660a`). All money stored and computed as INTEGER CENTS end-to-end:
  - Schema: every Float money column → Int (cents) across Product/OptionChoice/AddOn/CategoryOptionChoice/CategoryAddOn/Shift/Order/OrderItem/Payment/Refund/ZReport/GrandTotal/MonthlyClose/AnnualClose.
  - `money.ts`: `splitVat`/`addToVatBreakdown` operate in cents (integer arithmetic, no float drift); `sum2` is a plain integer sum; `round2` retained for the euros display boundary only.
  - `format.ts`: `formatEuro(cents)` divides by 100 — single display-boundary conversion point.
  - `reports.ts` + `fiscal.ts`: calc paths in cents; pro-rata scaling rounds to nearest cent.
  - `orders/route.ts`: checkout calc in cents (server-authoritative); payment exact-cover check in cents; receipt snapshot + fiscal event + grand total in cents.
  - `validation.ts`: all price Zod schemas require `z.number().int()` (product, addon, option, payment, refund, shift, checkout).
  - Frontend: `cart-store` math in cents; discount/payment/shifts dialogs convert euros↔cents at the boundary; products/categories views convert at load/submit; `Money`/`formatEuro` display cents unchanged.
  - Seed data converted to cents (e.g. Double Cheese 7.5→750); fresh baseline migration `20260829112122_init_integer_cents` (old migrations dropped — v0 reset).
  - Tests: `money.test.ts`, `cart-store*.test.ts`, `validation.test.ts`, `fiscal.test.ts`, `receipt.test.ts` (snapshot regenerated) all updated to cents. 105 tests pass.
  - **2B-check**: lint 0 errors · tsc exit 0 · 105 tests pass.

---

## Phase 3 — Test coverage — ✅ COMPLETE

Current: 103 unit/integration tests + 4 e2e API-smoke specs.

- [x] **3a** **Fix runner ambiguity** — removed `vitest.config.ts` (vestigial — `bun:test` is the real runner via `bunfig.toml` preload); added `typecheck` script (`tsc --noEmit`) to `package.json`.
- [x] **3b** **Service-layer + validation tests** — `validation.test.ts` (Zod schemas: login, checkout LIVRAISON superRefine, settings factice, refund, product, customer, user); `services/fiscal.test.ts` (integration: hash-chain append, previousHash linking, verifyFiscalChain OK + tamper detection, grand total accumulation, monthly close + duplicate rejection). Test DB setup in `vitest.setup.ts` (temp-dir SQLite via `prisma db push`).
- [-] **3c** Component test setup (jsdom) — skipped for now; would require a separate vitest config with jsdom env. The unit + integration + e2e coverage is sufficient for the current phase.
- [x] **3d** **E2E cashier journey** — `tests/e2e/02-checkout-flow.spec.ts` (Playwright: login → open shift → checkout → verify fiscal event + chain + grand total → Z close → verify CLOTURE_Z event; refund flow with REMBOURSEMENT/ANNULATION event).
- [x] **3e** **Fix `backup.test.ts`** — exported `encryptFile`/`decryptFile` from `backup.ts`; test now imports and exercises the REAL functions (production scrypt N=2^17) instead of a parallel re-implementation.
- [x] **3-check** Lint 0 errors · tsc exit 0 · 103 tests pass.

---

## Phase 4 — App fixes & dead-code removal — ✅ COMPLETE

- [x] **4a** **Persist cart + held orders** — `cart-store.ts` now wraps `create()` in `persist` middleware (localStorage, key `hibapos-cart`). A page reload / browser restart no longer wipes the in-progress sale or parked orders.
- [x] **4b** **Remove `src/` dead code**:
  - `src/hooks/use-toast.ts` + `src/components/ui/toaster.tsx` deleted (sonner is used everywhere; only `layout.tsx` imported the dead `Toaster`, removed).
  - Unused imports removed: `upload/route.ts` (`randomBytes`), `media-picker-dialog.tsx` (`ScrollArea`), `pos-view.tsx` (`setSearch`, `ProductCardMemo` alias).
  - Skipped (refactors, not dead code): `ProductDto.options`+`productOptions?` alias, duplicate `Kpi`/`VatBreakdownTable`/`TopProductsList`/`ORDER_TYPE_LABELS`/`safeParseOptions` helpers — these touch working app code; leave for a future refactor.
- [x] **4c** **Remove z.ai deploy infra** — deleted `Caddyfile`, `.zscripts/*.sh` (Linux), `mini-services/`, `tests/python-runtime-*.sh`. Kept `.zscripts/*.ps1` (Windows dev/prod launchers) + `README-windows.md`.
- [-] **4d** Hardcoded hex backgrounds → theme tokens — skipped (cosmetic, low priority; would touch a lot of UI code).
- [x] **4e** **Document FK gaps** — `schema.prisma` comments on `Refund.approvedById`/`shiftId` and `Table.currentOrderId` now explain the intentional no-FK design (survives soft-delete / avoids circular FK).
- [x] **4f** **Hygiene fixes** — `package.json` name `nextjs_tailwind_shadcn_ts`→`hibapos-france`; README rewritten (npm/pnpm→bun, money=cents, serving model, ISCA features, roles); `.gitignore` adds `/upload/`; `scripts/delete-products.js` deleted (dangerous, no guard rails); `typecheck` script added (Phase 3a).
- [x] **4-check** Lint 0 errors / 0 warnings · tsc exit 0 · 105 tests pass.

---

## Phase 5 — Tauri desktop shell (DEFERRED)

Excluded for now per decision. Re-evaluate after Phases 1–4 are complete.

Planned approach (when resumed): Tauri v2 shell, Next.js `output: "standalone"` server as sidecar, webview → `localhost:3000`, `tauri-plugin-esc-pos` for Sunso WTP-801 USB + cash drawer kick, Windows `.msi` installer, kiosk/auto-start.

---

## Phase 6 — Correctness & API hardening — ✅ COMPLETE

Findings from the deep API analysis that weren't in the original plan but are real issues. None are acute data-breach risks in the intended single-tenant behind-Caddy deployment, but each should be closed.

- [x] **6a** **`orders` GET `status` cast without validation** — added a Zod enum check (`COMPLETED`/`REFUNDED`/`CANCELLED`/`PENDING`) before the cast; an invalid value now returns **400** instead of `PrismaClientValidationError` → 500.
- [x] **6b** **`media` DELETE missing Zod** — added `z.object({ url: z.string().min(1) })` schema replacing the manual `typeof string` check.
- [x] **6c** **`reports/x` + `reports/z` POST missing Zod** — added Zod schemas (`shiftId: z.string().min(1)`, `closingFloat: z.number().int().min(0)` for Z) replacing the manual `typeof` checks.
- [x] **6d** **`clientIp()` trusts `X-Forwarded-For` blindly** — now prefers `X-Real-IP` (set by Caddy in the approved serving model) and falls back to the first XFF hop only when X-Real-IP is absent. Documented the Caddy requirement.
- [x] **6e** **Double DB user-lookup per authed request** — `getSession()` now fetches the user once and attaches it to the return as `SessionWithUser`; `withAuth`/`withAuthParams` reuse `session.user` instead of re-querying. Eliminates ~50% of the DB user queries on authed routes. (Also simplified `api/seed/route.ts` to use `session.user.role`.)
- [x] **6f** **`approvals.ts` `consumed` Set lost on restart** — documented the accepted trade-off (in-memory `consumed` lost on restart → a token can be replayed once within its 60s TTL; acceptable for single-tenant local-POS with rare operator-initiated restarts; persist to DB if ever multi-instance/resold).
- [x] **6g** **`settings.ts` `saveSettings` write amplification** — now diffs against current and upserts only the changed keys.
- [x] **6h** **`audit()` swallows all errors** — now calls `logTechnical("ERROR", ...)` alongside `console.error` so silent audit failures surface in the technical log view (SUPER_ADMIN).
- [x] **6-check** Lint 0 errors / 0 warnings · tsc exit 0 · 105 tests pass.

---

## Phase 7 — Code quality & refactors — ✅ COMPLETE

Deferred from Phase 4b (these touch working app code, so they were left for a dedicated refactor pass). Pure cleanup — no behavior change.

- [x] **7a** **Extract duplicate helpers** — `Kpi`/`VatBreakdownTable`/`TopProductsList` extracted to `src/components/shared/report-widgets.tsx`; `shifts-view.tsx` + `reports-view.tsx` now import from it.
- [x] **7b** **Extract duplicate labels/parsers** — `ORDER_TYPE_LABELS`/`PAYMENT_LABELS` (+`PAYMENT_LABELS_FULL`) extracted to `src/lib/order-labels.ts`; `safeParseOptions`/`safeParseAddOns` extracted to `src/lib/order-parsers.ts`; `receipt-dialog.tsx` + `orders-view.tsx` + `customer-detail-dialog.tsx` + `dashboard-view.tsx` now import from them.
- [x] **7c** **`ProductDto.productOptions` alias dropped** — removed from `types/api.ts`; API serializers (`catalog/products/route.ts` + `[id]/route.ts`) no longer emit `productOptions`; `products-view.tsx` reads `product.options` directly.
- [x] **7d** **Redundant `@@index` removed** — `User.username`, `Category.name`, `Order.number` were already `@unique` (indexed). Migration `20260829165200_drop_redundant_indexes`.
- [x] **7e** **`api-handler.ts` dedup** — the double user-lookup was already eliminated in Phase 6e; the remaining role-check dedup is inlined (~5 lines each, acceptable). A `requireAuth` helper was attempted but added more complexity than it saved — reverted to the inlined form.
- [x] **7f** **`BackupDto` integrity fields** — added `checksum`/`encrypted`/`sizeBytes`/`imagesPath` to `types/api.ts` so the UI can show encryption/checksum status.
- [x] **7g** **`VatBreakdown` type aligned** — `src/lib/money.ts` now types `VatBreakdown = Record<string,…>` (was `Record<number,…>` — a type lie since JS object keys are always strings at runtime). Callers that iterate keys coerce with `Number()`.
- [x] **7h** **`DEFAULT_SETTINGS.defaultVatRate` 20→10** — food is 10% TVA in France; default now matches both seed paths.
- [x] **7i** **`DEFAULT_SETTINGS.printerName` "Epson TM-m30"→"Sunso WTP-801"** — matches the actual printer.
- [x] **7-check** Lint 0 errors · tsc exit 0 · 105 tests pass.

---

## Phase 8 — Test coverage deepening

Phase 3 reached 105 tests but the highest-risk surfaces (API route handlers) are still untested. Deepen coverage so future refactors and Phase 6 changes have a safety net.

- [ ] **8a** **API route tests** — checkout (price recompute, payment exact-cover, receipt number atomicity), refund (amount clamp, method match, double-spend, table auto-free), shift close (Z generation, grand total increment), fiscal counter (concurrent increments). These are the highest-risk untested surfaces.
- [ ] **8b** **E2E fill sequence gaps** — `tests/e2e/01-auth.spec.ts` and `04-catalog.spec.ts` exist; `02-checkout-flow.spec.ts` added in Phase 3d. Add `03-shift-flow.spec.ts` (open → X report → close → Z) for a complete 01→04 sequence.
- [ ] **8c** **`@vitest/coverage-v8` devDep cleanup** — `vitest.config.ts` was removed (Phase 3a) but `@vitest/coverage-v8` is still in `package.json` devDeps. Remove it (and the `coverage` script if present) or commit to using it.
- [ ] **8d** **`vitest.setup.ts` filename** — works via `bunfig.toml` preload, but the name is vestigial (vitest config is gone). Optional: rename to `test-setup.ts` for clarity.

---

## Phase 9 — Operational hygiene

- [ ] **9a** **Push to GitHub** — `origin` is added but the repo was never pushed (needs your credentials). `git push -u origin main` — do this as the first action of the next session.
- [ ] **9b** **`reactStrictMode: false`** — `next.config.ts` disables React strict mode (suppresses double-render in dev, masks effect-cleanup bugs). Consider re-enabling for the production POS.
- [ ] **9c** **`eslint.config.mjs` `no-explicit-any: warn`** — `@typescript-eslint/no-explicit-any` is downgraded to `warn`, so `any` proliferates silently. Consider raising to `error` and cleaning up the `any` usages.
- [ ] **9d` **`db:push --accept-data-loss` dangerous default** — `package.json` `db:push` script is `prisma db push --accept-data-loss`. A misplaced `bun run db:push` against prod silently destroys data. Split into `db:push-safe` (no flag) + `db:push-force` (with flag, gated).

---

## Phase 10 — UI/UX polish

- [ ] **10a` **Touchscreen accessibility** — several interactive controls stay below the 44px WCAG target: cart qty buttons (`h-6 w-6` overridden to `min-h-[32px]`, still <44), table/audit/media hover edit buttons (`h-6`/`h-7`), option/addon check badges. Raise to ≥44px and add missing `aria-label`s on icon-only buttons.
- [ ] **10b` **Hardcoded hex backgrounds → theme tokens** — `#FAF5EE` (shell), `#221910` (topbar), `#FDEFE0`/`#F2994A`/`#E2711D` (gradients) bypass theme tokens. Replace with `bg-card`/`bg-foreground`/etc. tokens. (Deferred from Phase 4d — cosmetic but improves maintainability.)
- [ ] **10c` **URL routing (SPA state machine)** — no URL change on view switch → browser back button always returns to home. Consider hash-based routing (`#/pos`, `#/orders`, …) for view persistence and back-button support.
- [ ] **10d` **i18n layer** — no `lang-store`/translation function; every string is hardcoded French (`<html lang="fr">`). Fine for a single-locale product today, but if reselling later, add a FR/EN toggle. (The worklog's rounds 20-22 i18n was built then removed — re-evaluate if needed.)

---

## Phase 11 — Performance

- [ ] **11a` **Optimistic updates** — every mutation (product/category/customer/table/user CRUD, refund, shift open/close) blocks on a server round-trip then invalidates. On a touchscreen this latency is felt on availability toggles and table status cycling. Add optimistic updates for the high-frequency mutations.
- [ ] **11b` **Client-side over-filtering** — orders fetch `limit=100` then filter by number/table/cashier in memory; audit fetches 200 then filters by action string. Move filtering server-side (query params) so it scales.
- [ ] **11c` **Catalog prefetch** — TanStack Query `staleTime: 30s` and no `prefetch`. Prefetch the catalog on app load so the POS grid is instant.
- [ ] **11d` **`reactStrictMode` + effect-cleanup audit** — re-enabling strict mode (9b) will surface any effect-cleanup bugs; fix them as they appear.

---

## Phase 12 — Features (future, not for now)

Roadmap items from the worklog "Unresolved" lists. Evaluate after the app is solid and Tauri is in place.

- [ ] **12a` **Real-time table status (WebSocket multi-terminal sync)** — only needed if >1 terminal (current: single terminal).
- [ ] **12b` **Table reservation scheduling**.
- [ ] **12c` **Customer loyalty points system**.
- [ ] **12d` **Email/SMS receipt sending**.
- [ ] **12e` **Multi-language support (FR/EN)** — see 10d.
- [ ] **12f` **Hardware receipt printer integration (Epson ESC/POS)** — blocked on Tauri (Phase 5); when Tauri is in, wire `tauri-plugin-esc-pos` to the Sunso WTP-801 + cash drawer.

---

## Appendix A — ISCA requirements vs. current state (after Phases 1–4)

| ISCA requirement | Current state | Status |
|---|---|---|
| Immutability of validated ticket | Orders/Receipts immutable (no delete path, only refund); FiscalEvent hash-chain detects tampering | ✅ met (Phase 1a+1b) |
| Sequential atomic receipt numbering | `FiscalCounter` + `increment:1` in `$transaction` (self-healing upsert) | ✅ met |
| Cryptographic chaining (S) | SHA-256 hash-chained `FiscalEvent` journal (JFP); `GET /api/fiscal/verify` | ✅ met (Phase 1a+1b) |
| Journal des événements (JFP) append-only | `FiscalEvent` hash-chained; VENTE/REMBOURSEMENT/ANNULATION/CLOTURE_Z/OUVERTURE_TIROIR/REIMPRESSION/SESSION_* events | ✅ met (Phase 1b) |
| Operator audit trail | `userId` on every fiscal event; approval tokens signed; drawer/reprint/discount tracked | ✅ met (Phase 1b) |
| Mode école / FACTICE | `settings.factice` flag; receipts + events stamped FACTICE | ✅ met (Phase 1d) |
| Clôtures Z / M / A + total perpétuel | Z (daily) ✅; M (monthly) ✅; A (annual) ✅; `GrandTotal` perpetual counter never resets | ✅ met (Phase 1c) |
| Correction = contre-ticket | Refund = contre-opération (ANNULATION/REMBOURSEMENT) | ✅ met |
| Conservation 6 ans | Data stays in SQLite; encrypted backups (AES-256-GCM) | ✅ acceptable |
| Archivage format ouvert + notice FR + empreinte | Annual JSON archive + SHA-256 + French notice (`POST/GET /api/fiscal/archive`) | ✅ met (Phase 1e) |
| Money stored in integer cents | All money Int cents end-to-end (DB + DTO + calc + display boundary) | ✅ met (Phase 2B) |
| Editor attestation / certificate held | `docs/attestation-conformite.md` (BOI-LETTRE-000242, two volets — print + sign) | ✅ ready (Phase 1f; sign + store with accounting records) |

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
