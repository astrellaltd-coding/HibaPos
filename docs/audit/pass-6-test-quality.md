# Pass 6 — Is the test suite load-bearing?

**Read-only audit, 2026-09-12.** Nothing was changed except this file. No commit, no migration,
no `--apply`, no `bun run dev`, no `bun run start`. The application was never started: everything
below was settled with the test runner against its own throwaway database, with `bun:sqlite`
in `readonly: true` against `db/custom.db`, and by reading source. No scratch copy of the
production database was made, because none was needed.

**The production database is untouched.** `db/custom.db` is sha256
`0d304ee79ad3b06adb0b89542a8906bf706f85868ae56035b8c600e3f9083cdb`, 884 736 bytes, mtime
2026-09-11 16:33 — byte-identical to § 4's recorded value, with no `-wal`, `-shm` or `-journal`
beside it.

---

## 1. Baseline, re-measured

| Thing | § 4 says | Measured 2026-09-12 | |
|---|---|---|---|
| Unit suite | 1382 pass / 0 fail / 114 files | **1382 pass / 0 fail / 114 files**, 4454 `expect()`, 340 s | ✅ |
| `typecheck` · `lint` | clean | **clean** (`tsc --noEmit` exit 0, `eslint .` exit 0) | ✅ |
| `prisma:error` blocks in a clean run | zero | **zero** | ✅ |
| e2e | 13 passed, *not re-run since 2026-09-07* | **13 passed** (10.4 s), re-run today; `00-disposable-database.spec.ts` gate ran first and held | ✅ |
| Migrations | 15 applied, none pending | **15 applied**, 0 unfinished, 0 rolled back | ✅ |
| Trading tables | all fifteen at zero | **all fifteen at zero** | ✅ |
| Fiscal counters | 0 / 0 / 0 / 0 | **0 / 0 / 0 / 0**, journal empty | ✅ |
| Catalogue | 84 products, 14 categories, 80 on the grid | **84 / 14 / 80** | ✅ |
| Duplicate product names | none | **none** | ✅ |
| Menus / slots / whitelist / option rules | 9 / 25 / 9 / 7 | **9 / 25 / 9 / 7** | ✅ |
| Active drinks | 17, 10 % sur place, 5,5 % à emporter | **17** (Canette 13, Bouteilles 4), `vatRate` 10 / `vatRateTakeaway` 5.5 on both | ✅ |
| Longest product name | 26 | **26** (`Tenders box (sans boisson)`) | ✅ |
| Names with stray whitespace | 0 | **0** | ✅ |
| `showOnPos = 0` | 3 | **3** (the three box components) | ✅ |
| L-81 `5 nuggets test` | still there, `active=0` | **still there**, `active=0 available=0` | ✅ |
| Columns | Product 18, OrderItem 18, ZReport 28 | **18 / 18 / 28**, `schema_version` 171 | ✅ |
| Integrity / FK / journal mode | ok / 0 / `delete` | **ok / 0 / `delete`** | ✅ |

**No drift.** Every figure in § 4 that this pass could reach is unchanged. The one stale number I
found is inside a *test*, not in the plan — see L-99.

Two extra measurements this pass took:

- **Reverse file order: 1382 pass / 0 fail.** The whole suite was re-run with the 114 files
  passed in reverse of the runner's own walk. Same verdict. (180 s against 340 s — the 4× wall-time
  variance § 4 warns about, confirmed again; not a signal.)
- **Every file alone: 113 of 114 clean, 1 fails.** Each test file was run on its own. Exactly one
  has a live order dependency — see **L-93**.

---

## 2. Findings

New ids continue the § 7 series (L-88 is its highest today). Ranked by what could lose money or
corrupt the fiscal journal, not by how many.

### CONFIRMED

| id | sev | file:line | what is wrong | how established | cost to fix |
|---|---|---|---|---|---|
| **L-89** | **High** | `src/lib/validation.ts:374` and `:356` vs `src/lib/services/settings.ts` (`DEFAULT_SETTINGS`) | **Two default tables disagree on `factice`, and the write side wins.** `settingsSchema` materialises `factice: false` and `printerConnection: "network"` when the key is absent; `DEFAULT_SETTINGS` answers `true` and `"usb"`. `PUT /api/settings` parses with the schema and hands the result to `saveSettings`, which merges present keys over stored ones — so a settings save that omits `factice` **performs R6.3 silently**, and one that omits `printerConnection` undoes the 2026-09-11 USB decision that R6.4 rests on. `validation.test.ts:55` pins the write default; `fresh-install-defaults.test.ts:79` pins the read default; **no test compares them**, so both files are green while the product holds two answers. | Ran a probe importing both modules, parsed `{restaurantName, defaultVatRate}` and diffed key-by-key against `DEFAULT_SETTINGS`, distinguishing absent keys from present-undefined. Exactly two keys are materialised with a disagreeing value: `factice` (`false` vs `true`) and `printerConnection` (`"network"` vs `"usb"`). Read `saveSettings` (`settings.ts:86-116`) to confirm `{...current, ...input}` lets a present key overwrite. | One test that parses `{}`-ish input and asserts every materialised key equals `DEFAULT_SETTINGS` (~20 lines), plus an operator decision on which table is authoritative. **Latent, not live:** `settings-view.tsx:121` posts the whole DTO, so today's only client always sends both keys. |
| **L-90** | **High** | `src/app/api/orders/route.ts:390` | **The server-authoritative payment check has no test.** `paidTotal !== totalAfterDiscount → 400 « Paiement incorrect »` is the one thing stopping a basket from booking a 10,00 € sale against a 1,00 € tender. Removing it fails nothing. | Grepped the whole tree for the message: it appears in `orders/route.ts`, in six *comments*, and in **no test and no e2e spec**. Read every route-driving test helper (`orders-route.test.ts:80`, `orders-vat-by-order-type.test.ts:96`, `orders-combo.test.ts`): each computes the payment from the price, so none can express the mismatch. | ~15 lines in `orders-route.test.ts`: underpay, overpay, and a control, asserting 400 and `order.count() === 0`. |
| **L-91** | **High** | `src/lib/db-pragmas.test.ts:112-135` | **The test that guards WAL off a synced folder executes zero assertions.** Every `expect` sits inside `if (result.skipped)`, and `result.skipped` is always `undefined`: `applyStartupPragmas()` reads `PRAGMA journal_mode` from the cached global `db` — which the same file already put into WAL — and returns at the `current === "wal"` early exit (`db-pragmas.ts:105`) **before** reaching the cloud-sync branch. Repointing `process.env.DATABASE_URL` cannot move `db`, because `db.ts` caches on `globalThis` unconditionally (an invariant). So the guard that keeps the OneDrive-hosted production database out of WAL — the reason § 4 records `journal_mode = delete` — has no executed cover, and `cloudSyncFolderIn` being correct (4 tests, exact values) is a different claim. Note this is the *only* conditional-assertion block in the suite with no preceding assertion on its discriminant; the other ~35 are all disciplined `expect(r.kind).toBe("ok"); if (r.kind === "ok")` narrowing. | Ran the test's exact sequence as a standalone probe. Output: `result = {"journalMode":"wal","applied":false,...}`, `result.skipped = undefined`, `the test's if-body runs: false`. | ~25 lines: give the guard its own `PrismaClient` against a temp `OneDrive-fake-*/…db`, or split `applyStartupPragmas` so the sync check is callable with an injected current mode. |
| **L-92** | **High** | `src/lib/services/log-retention.test.ts:122-142` | **"NEVER prunes the fiscal journal, whatever the retention says" cannot fail against the bug it names.** The test writes a `FiscalEvent` with `appendFiscalEvent` (timestamp = now), sets retention to 1 day, calls `pruneLogs()` with the real clock, and asserts the count is unchanged. A dated prune — `fiscalEvent.deleteMany({ where: { timestamp: { lt: cutoff(days) } } })` added beside the two that are there — deletes nothing, because a row written this second is never older than a one-day cutoff. Only an *unconditional* `deleteMany` would fail it. The test's own comment argues an aged row is "not needed"; it is exactly what is needed. | Read `pruneLogs` (`log-retention.ts:68-120`): every delete is `createdAt < cutoff(days)`, and the function already takes `now` as its first parameter. The test calls it with none. Arithmetic is decisive; I could not execute the revert because I may not edit source. | **One line.** `pruneLogs(new Date(Date.now() + 400 * DAY))` pushes the cutoff past the fresh event with no tampering and no backdating — the signature was built for it. |
| **L-93** | Medium | `src/lib/services/reports.test.ts:97` | **The one live order dependency in the suite.** `expect(events[0].factice).toBe(false)` on the `CLOTURE_Z` event. `generateZReport` reads `getSettings().factice`, whose default is `true`; the file's `wipe()` never touches `Setting` and never saves one. It passes only because some earlier file left a `Setting{factice:false}` row behind. The assertion reports the state of a shared table, not the behaviour it names — the same defect as the already-fixed « leaves the journal unmarked when the setting is off », in a new file. | Ran all 114 files individually. 113 clean; this one gives **3 pass / 1 fail**, `Expected: false / Received: true`. | One line: `await saveSettings({ factice: false })` in the `beforeEach`, or add `setting` to the wipe and set it explicitly. |
| **L-94** | Medium | `src/lib/auth.test.ts:34-53` · `src/app/api/seed/route.ts:65-66` | **A rule the running application never calls.** `isPublishedDefaultPin` / `PUBLISHED_DEFAULT_PINS` have three tests and six assertions. The only caller anywhere is `scripts/seed-users.ts:155`. `POST /api/seed` — unauthenticated on a fresh install, and wired to a button at `login-screen.tsx:238` — creates the first SUPER_ADMIN with `SEED_ADMIN_PIN ?? "123456"` and the MANAGER with `"111111"`, the exact two values the denylist names, and consults the denylist nowhere. `POST /api/users` validates six digits and nothing else. docs/INVARIANTS.md reads « `PUBLISHED_DEFAULT_PINS` … refuses the two values this repository publishes about itself »; for the application, it does not. **This is the path the France fresh install will take.** | Grepped every reference across `src/` and `scripts/`. Read `seed/route.ts`, `users/route.ts`, `validation.ts:281`, `login-screen.tsx`. The test file states the limitation in its own header, so it is known — the gap it leaves is not written down anywhere. | A refusal in `seed/route.ts` and `users/route.ts` plus a test, ~20 lines. Or a decision, recorded, that the operator's rotation is the control. |
| **L-95** | Medium | `src/lib/services/fiscal-surface.test.ts:65` and `:85` | **Two tests headed "What POST /api/fiscal/drawer does" and "What POST /api/orders/[id]/reprint does" re-implement the routes inline.** They call `appendFiscalEvent` and `receipt.update` by hand. `orders/[id]/reprint/route.ts` is invoked by **no test in either suite**. The invariant « a `REIMPRESSION` or `OUVERTURE_TIROIR` is journalled **before** the paper is attempted, and whether or not it succeeds » — the ordering both routes carry a comment about — is asserted nowhere, in either route. If the reprint route stopped incrementing `reprintCount`, stopped journalling, or moved the journal write after `printReceiptText`, both tests stay green. | Read both routes and both tests. Grepped for every test reference to the two event types. The drawer route *is* driven once, at `fiscal-chain-key.test.ts:353`, but only for its 503 chain-key path. `offert-tender.test.ts:230` shows the house pattern for pinning an ordering when the route cannot be driven; neither of these uses it — and `route-harness.ts` now exists, so both can be driven properly. | ~40 lines to drive both through `route-harness`, with a failing transport so the "journalled anyway" half is real. |
| **L-96** | Medium | `src/lib/services/restore-swap.test.ts:202` · `src/lib/pos-resilience.test.ts:104` | **Two source-text assertions break on any fresh checkout of this repository.** `core.autocrlf=true` is set and there is no `.gitattributes`; the index is LF, so a clone or a re-checkout writes CRLF. `restore-swap.test.ts` then finds `src.indexOf("} finally {\n    // L-62")` = −1 and **fails** (a false failure on a clean tree). `pos-resilience.test.ts`'s `expect(store).not.toContain("} catch {\n      next = null;\n    }")` **passes vacuously** — a negative assertion that can no longer detect M-21 returning. `plan-freshness.test.ts:35` already learned this for `.md` and normalises; nothing else does. | `git config core.autocrlf` → `true`. `git ls-files --eol` → `i/lf w/lf attr/`. `git checkout-index --prefix=<scratch>/` reproduced the checkout: 211 CR bytes in `restore-swap.test.ts`'s subject, 238 in `app-store.ts`. Then evaluated both needles against the CRLF copies: `indexOf` → −1, and a re-introduced CRLF defect → `includes` false. | One line: `* text=auto eol=lf` in `.gitattributes`. Or `.replace(/\r\n/g,"\n")` on both reads, the way `plan-freshness.test.ts` does. |
| **L-97** | Low–Med | `src/lib/services/cash-movement.ts:43` · `src/lib/tx-options.ts:40` · `src/lib/services/escpos.ts:40` | **Three exported symbols that only tests use.** `CASH_MOVEMENT_CATEGORIES` is pinned by `cash-movement.test.ts:126` as « the order the screen offers them » — the screen (`cash-movement-dialog.tsx:120`) builds its list from a **local** `DIRECTION` map instead, and the service keeps a third copy in `REQUIRED_SIGN`. So DD-12's « fixed category list » exists in three hand-copied places and the one the test pins is used by none of them; reorder the dialog, or let its `DIRECTION` drift from the service's `REQUIRED_SIGN`, and nothing fails. `TX_CATALOG` is a transaction budget no transaction consumes, guarded by two assertions at `db-pragmas.test.ts:121,130`. `columnsForPaperMm` is called by nothing and pinned at `escpos.test.ts:119-120`. **None of the three is on docs/INVARIANTS.md's *Deliberately retained* list.** | Enumerated every `export function` / `export const` under `src/`, counted non-test references in `src/` **and** `scripts/`, and hand-checked each hit. (The same sweep cleared `TablesView` — retained by design — and the eight route-harness/introspection helpers.) | Point the dialog at the exported list, ~5 lines, which makes the existing test load-bearing. `TX_CATALOG` and `columnsForPaperMm`: delete with their assertions, or give them a caller. |
| **L-98** | Low | `src/features/shifts/z-close.test.ts:30-33` | **A "regression pin" that asserts the bug's own output.** `expect(formatEuro(openingFloat / 100)).toBe("2,00 €")` is a restatement of `formatEuro`'s contract — it cannot fail for any change to the product. C-02's defect was a `/ 100` at a *call site* (`shifts-view.tsx`), and no test reads any `.tsx` for a doubled cents division. The file's other tests pin `cashVarianceCents` and `formatVariance`, which are real; this pair is decoration. | Read the file and `z-close.ts`. Confirmed `cashVarianceCents` is genuinely called (`shifts-view.tsx:638`) — so the module is wired; only the "before the fix" pair is inert. Swept the suite for the same shape: this is the only instance. | ~15 lines: scan `.tsx` for `formatEuro(` / `<Money` with a `/ 100` in the same expression, the way `order-status.test.ts` scans for `CANCELLED`. |
| **L-99** | Cosmetic | `src/lib/services/receipt.test.ts:378` | `LIVE_ADDRESS`, commented « the live `restaurantAddress`, read from the production `Setting` row … Measured read-only on the live settings 2026-09-07 », is `"23 Grande Rue 45210, 45210 Ferrières-en-Gâtinais, France"` (56 chars). Production today holds `"23 Grande Rue, 45210 Ferrières-en-Gâtinais, France"` (50 chars) — the operator has since removed the duplicated postcode. The assertion still exercises wrapping (both exceed 48 columns), so nothing is broken; the comment is simply no longer true, in a file whose value is that its constants are the real ones. | Read `Setting.restaurantAddress` from `db/custom.db` with `bun:sqlite` readonly and compared. | One line, plus the date in the comment. |
| **L-100** | Low | `src/lib/readme-counts.test.ts:157-168` | The "every registered expansion still exists where it says it does" check tests the **file**, not the **entry**: it asks whether `e.where` contains *any* `it.each(` or `for (…) { it(` . Two `EXPANSIONS` entries name `deployment.test.ts`; delete one of its two loops and the check still passes on the strength of the other, while the recomputed README total is wrong by 7 — which is the exact failure the test's own comment says it exists to prevent. | Read the test. The two `deployment.test.ts` entries are at `:56-60` and `:61-65`, both `runs: 8`; the check at `:161-164` is file-scoped. | ~10 lines: match against the entry's own shape (e.g. count loops and compare with how many entries name the file). |

### SUSPECTED — reasoned through, not executed, because this pass may not edit source

| id | sev | file:line | what is wrong | how established | cost to fix |
|---|---|---|---|---|---|
| **L-101** | Medium | `scripts/init-fiscal-counter.ts:81-92` | **The counter-floor guard on the *create* path is untested, and a test claims otherwise.** `fiscal-counter-floor.test.ts:126` is captioned « This is `init-fiscal-counter.ts` on the database it is written for », but that script never calls `counterRegressions`; it implements its own inline `populated > 0` refusal. Delete that block and the whole suite stays green, and the script re-creates `FiscalCounter` at 0/0/0/0 on a database that still holds sealed orders and journal events — L-38's exact outcome, which is the next genuine sale printing a receipt number that already exists. `bun test src` globs `src/` only, so nothing under `scripts/` can be reached at all. | Grepped every reference to `counterRegressions`: `fix-fiscal-counter.ts:97` is the sole caller. Read `init-fiscal-counter.ts` end to end. Could not run the revert (no source edits). | ~30 lines: extract the refusal into `src/lib/services/fiscal-counter-floor.ts` beside the rule it belongs with — the same move L-38 made for the other half — and call it from the script. |
| **L-102** | Low | `src/lib/services/aggregate.test.ts:20-55` | **All four `apportion` tests are satisfied by a degenerate implementation** that gives the entire target to the first weight and zero to the rest: sums match, `[100,100]→1` still gives `[1,0]`, and the zero-weight cases return early. Nothing in that describe pins **proportionality**, which is what `apportion` is for. It is pinned, but only transitively and one module away, by `combo-allocation.test.ts`'s nine menu cases (`combo.ts:260`) — the discount path (`checkout.ts:194`, `receipt.ts:29`, `aggregate.ts:353`) is pinned only against `apportion` itself (`line-ht.test.ts:165`), which is a tautology with respect to the splitter. Also `expect(apportion(w,500)).toEqual(apportion(w,500))` at `:47` compares a function with itself and can only ever catch literal nondeterminism. | Hand-evaluated the degenerate implementation against each of the four tests, then against `combo-allocation.test.ts`'s nine expected per-rate TTC/HT pairs (which it fails). Could not run the revert. | ~3 lines: one exact-value assertion, e.g. `expect(apportion([2000,1000], 2400)).toEqual([1600,800])` — the split `checkout-money.test.ts:106` already relies on. |

### What I could not settle without writing something

- **Every "would this fail?" answer marked SUSPECTED above.** The method the plan prescribes —
  revert one property at a time, in both directions — needs a source edit. L-101 and L-102 are
  reasoned only. Everything under CONFIRMED was settled by running something (a probe, a file in
  isolation, a simulated checkout) rather than by argument.
- **Whether the 35 uninvoked routes (§ 3) hide real defects.** Establishing that needs tests
  written, not read. What is established is that no test would notice if they did.
- **Whether `deployment.test.ts`'s 48 runs still describe reality.** They pin the *text* of eight
  `.ps1` files for a retired model. Checking whether each assertion still names something true
  would mean running PowerShell against a Windows till, which is not this pass.

---

## 3. The twenty most load-bearing assertions, and what would break each

The exercise the brief asks for. "Nothing plausible" is a finding; those rows are marked.

| # | the claim | where it is asserted | what single source change fails it |
|---|---|---|---|
| 1 | A tampered basket cannot choose its own VAT rate | `orders-vat-by-order-type.test.ts:148` | the route reading `item.vatRate` instead of `resolveVatRate` — real, driven over the route |
| 2 | A discount over the threshold cannot be taken without the caller's own PIN | `orders-route.test.ts:193` | removing the `needsStepUp` branch, or widening the token binding — real, 403 + `order.count()===0` |
| 3 | A step-up token is single-use, caller-bound, action-bound and amount-bound | `orders-route.test.ts:243-300` | any one of the four bindings — real, all four asserted separately with a control |
| 4 | Arming a chain key onto an unkeyed journal is refused | `fiscal-chain-key.test.ts` (whole file) | removing the recompute-unkeyed guard in `appendFiscalEvent` — real |
| 5 | A refusal reaches the operator as 503, not an empty 500 | `fiscal-chain-key.test.ts:333` | removing the wrapper's typed-error arm — real, driven over the drawer route |
| 6 | A refund cannot exceed the balance, or touch a fully-refunded order | `refund.test.ts:133,151` | either guard in `refund.ts:125-130` — real |
| 7 | A sealed Z agrees with the sales that exist, whatever the race | `shift-race.test.ts:260` | moving the total back outside the transaction — real, raced |
| 8 | A mid-checkout failure leaves nothing, receipt number included | `checkout-rollback.test.ts:151,176` | writing outside the transaction — real |
| 9 | A menu's forfait splits by TTC standalone price, to the cent | `combo-allocation.test.ts` (9 cases) | any change to `allocateCombo`'s weights or `apportion` — real, exact per-rate TTC/HT |
| 10 | VAT is computed on the net, rate by rate, with a discount | `checkout-money.test.ts:106` | blending the rate, or taxing gross — real, exact cents |
| 11 | The aggregation agrees with the row it wrote | `checkout-money.test.ts:157` | a second arithmetic anywhere in `aggregate.ts` — real |
| 12 | `GET /api/reports/z` sends what was SEALED, not what the aggregator says today | `zreport-given-away.test.ts:325` | reading live instead of the sealed JSON — real, and unusually good |
| 13 | No ticket line exceeds the paper, at any supported width | `receipt-combo.test.ts:212`, `daily-close.test.ts:453`, `printer.test.ts:113` | any renderer bypassing `ticket-layout.ts` — real, all three renderers covered |
| 14 | Every printer function returns an outcome instead of throwing | `printer.test.ts:66,96` | a rethrow — real |
| 15 | A restore that fails leaves the live database untouched and no litter | `backup-restore.test.ts:147,166`, `restore-swap.test.ts:196` | real for the behaviour; the "uses `renameWithRetry`" half is a source-text match (and see L-96) |
| 16 | Every API route declares an authorization gate | `api-authorization.test.ts` | adding an unwrapped route, or widening a gate — real for the *declaration*; the file says plainly it does not drive requests |
| 17 | Counters can be repaired upward and never rewound | `fiscal-counter-floor.test.ts` (13 tests) | any direction check in the rule — real **for the rule**; the *create* path's own guard is uncovered (**L-101**) |
| 18 | The fiscal journal is never pruned by any retention | `log-retention.test.ts:122` | **nothing plausible** — a dated prune passes (**L-92**) |
| 19 | WAL is never enabled on a cloud-synced path | `db-pragmas.test.ts:112` | **nothing at all** — zero assertions execute (**L-91**) |
| 20 | Payments must equal the order total | — | **nothing — there is no such test** (**L-90**) |

Sixteen of twenty are load-bearing, several of them unusually well built (#3, #9, #12, #13). Three
of the four that are not are the top three findings; the fourth (#17) is half-covered.

---

## 4. Order dependence and the wipe-order hazard

The brief asks about L-40 and about a file wiping a table without clearing what references it.
Both were measured rather than reasoned.

**FK enforcement is on.** `PRAGMA foreign_keys` returns `1` in the test database, and a
`Restrict` violation really throws: a probe created a `User` and a `Shift` referencing it, then
called `user.deleteMany()` — `Foreign key constraint violated`, nothing deleted. So the hazard is
real in mechanism.

**The hazard is latent, not live.** Of the 57 files that call `deleteMany`, **fourteen delete
`Shift` without first deleting `ZReport`** (`ZReport.shiftId` is `Restrict`), and four of those
that create `ZReport` rows have no `afterAll` cleanup: `archive`, `catalogue-transfer`,
`checkout-rollback`, `close-sequence`, `close-timing`, `fiscal-surface`, `fresh-install-defaults`,
`line-ht`, `refund`, `report-agreement`, `sale-journal`, `seed-failure-honesty`,
`table-withdrawal`, `vat-inheritance`. Two more (`approval-lockout`, `step-up`, `session-activity`)
delete `User` with nothing else cleared. Under today's data none of them trips, because the
files that leave rows behind do not leave the particular combination a later file's wipe meets.

**Measured three ways:**

| run | result |
|---|---|
| natural order (`bun run test`) | 1382 pass / 0 fail |
| reverse file order (all 114 passed explicitly, reversed) | 1382 pass / 0 fail |
| every file alone, 114 separate runs | 113 files clean; **`reports.test.ts` 3 pass / 1 fail** |

So: **one live order dependency (L-93), and a standing wipe-order hazard that has not yet bitten.**
The per-run database directory `test-setup.ts` introduced did the work it was built for. What it
did not do — and says so — is make files independent within a run. The cheap durable fix is a
shared wipe helper in FK order rather than 57 hand-maintained lists; a rough count says the lists
already disagree with each other on which tables they include.

---

## 5. The pinned numbers — do they still pin something real?

| test | pins | verdict |
|---|---|---|
| `readme-counts.test.ts` | README's `1382 tests unitaires` and `Playwright — 13 tests`, recomputed from the files | **Real.** The README's 1382 matches today's measured 1382 and the e2e 13 matches today's measured 13. Both recomputed, not copied. One weakness: the expansion-existence check is file-scoped (**L-100**). |
| `plan-freshness.test.ts` | 5 task rows, 9 open findings, allowed statuses, no DONE row left in the plan, the done-file index both ways, and a 40 960-byte ceiling | **Real, and the strongest guard in the suite.** Verified against the live files: § 6 has exactly the five Phase-6 rows, § 7 exactly the nine findings (L-88, L-84, L-81, L-75, L-05, L-11, L-47, L-51, L-52), the index matches the 35 headings. Deliberately pinned as counts rather than `> 0`, with the reason written down. **Note for whoever places my proposed rows: adding 14 rows to § 7 makes `openFindings(src).size` 23 and this test fails until the number is edited with it — which is the design.** |
| `touch-and-labels.test.ts` | no `Button` under 44 px, every `Button` size variant ≥ 44 px, every `Label`/`Input`/icon-Button named, ids unique per file | **Real.** It parses whole JSX elements with a brace/quote tracker rather than a line regex, and carries its own vacuity guards (`> 100` Buttons parsed). Its history shows the two measurement errors a cheaper matcher produced. It says plainly what it cannot prove (the rendered page). |

All three pin something. None is hollow.

---

## 6. Where the coverage actually is, and is not

**Route layer.** 66 route modules. **24** have their handlers invoked by a unit test; the e2e suite
adds **7** more; **35 are invoked by neither suite.** Among them, by consequence:

`settings` · `users` · `users/[id]` · `backups`, `backups/[id]`, `backups/[id]/restore` ·
`cash-movements` · `fiscal/close-day`, `close-month`, `close-year`, `closes` ·
`fiscal/archive`, `archive/[year]` · `orders/[id]/print`, `orders/[id]/reprint` ·
`auth/lock`, `auth/unlock`, `auth/logout`, `auth/switch-user` · `print/printers`, `print/test` ·
`reports/vat` · `audit` · `logs` · `media`.

The services beneath most of these are well covered — this is a wiring gap, not a logic gap. But
it is the wiring gap that has bitten this project three times (the plan's § 2 step 3 counts them),
and `route-harness.ts` now exists, so several tests still carrying « driving the route needs a
request scope … stays with Batch 6.1 » (`offert-tender.test.ts:212,232`, `api-authorization.test.ts:19`)
are describing a limitation that was lifted.

**Text versus behaviour.** 450 of 1353 declarations live in a file that reads source or document
text as a string. That is an upper bound — those files hold behavioural tests too — but it is a
third of the suite, and the largest single file in the whole suite by declarations is
`deployment.test.ts` (34 declarations, 48 runs, 90 assertions) pinning eight PowerShell scripts
for a **retired** deployment model. Source-text assertions are the right tool where the subject is
genuinely textual (`role-model.test.ts`, `order-status.test.ts`, `plan-freshness.test.ts`) and a
poor substitute where a request could be driven instead.

### The three areas with the least real coverage, weighted by cost if wrong

**1. `scripts/` — sixteen operator scripts, zero tests.** `bun test src` globs `src/` only, so not
one line of any script is executed by the suite; no test even reads one as text (four test files
mention `scripts/` — all four in comments). This includes the two irreversible ones:
`pre-golive-reset.ts` (R6.1 — empties the fiscal journal, runs once, never after a genuine sale)
and `delete-product.ts` (hard-deletes from the live catalogue; has run four times). It includes
`apply-migration.ts`, which exists *because* the bare command was misread twice and which is now
the only sanctioned path to a production schema change. And it includes `init-fiscal-counter.ts`,
whose sole safety guard is uncovered (**L-101**). The project already found the right shape once —
lift the rule into `src/lib/services/` and test it there, as L-38 did — and applied it to exactly
one rule. **Cost if wrong: an irreversible loss of the fiscal journal or a catalogue row, on the
operator's machine, recoverable only from the restore point the script itself takes.**

**2. The switches Phase 6 turns, and the credentials the first install gets.**
`PUT /api/settings` is invoked by no test in either suite — and it is how R6.3 turns FACTICE off
and how R6.4 sets the printer queue. Its schema disagrees with the read-side defaults on both of
those exact keys (**L-89**). `POST /api/seed` is invoked by one test file, for its failure-reporting
branch only, and installs the two published default PINs (**L-94**). `POST /api/users` is invoked
by nothing. **Cost if wrong: a till that believes it is live when it is not, or is live when
nobody said go; or a France install whose SUPER_ADMIN PIN is in this repository.**

**3. The journal-before-paper path.** `orders/[id]/reprint` and `orders/[id]/print` are invoked by
nothing; `fiscal/drawer` only for its chain-key refusal. The ordering invariant is asserted for
neither route, and the two tests that name those routes re-implement them (**L-95**). The printer
transport layer beneath is genuinely well tested — it is the three lines of ordering above it that
are not. **Cost if wrong: a réimpression or an ouverture de tiroir that leaves no journal entry —
precisely the traçabilité the attestation claims, failing silently, on the one path where the paper
and the record can diverge.**

---

## 7. Proposed rows for the plan's § 7

Not placed — the operator places them. Adding all fourteen moves `plan-freshness.test.ts`'s
`openFindings(src).size` from 9 to 23; that pin must be edited in the same commit, with a dated
line in its comment block, or the suite fails.

| ID | Severity | Finding | Owner |
|---|---|---|---|
| **L-89** | High | `settingsSchema` materialises `factice: false` and `printerConnection: "network"` where `DEFAULT_SETTINGS` answers `true` and `"usb"`, and `PUT /api/settings` persists the schema's answer. A settings save that omits `factice` performs R6.3 silently. Both defaults are pinned separately (`validation.test.ts:55`, `fresh-install-defaults.test.ts:79`); nothing asserts they agree. Latent today — the only client posts the whole DTO. | none |
| **L-90** | High | `orders/route.ts:390` refuses a payment total that does not equal the order total. No test and no e2e spec exercises it; « Paiement incorrect » appears in no test file. | none |
| **L-91** | High | `db-pragmas.test.ts:112` executes zero assertions: `applyStartupPragmas` returns at its WAL early exit before the cloud-sync branch, so `result.skipped` is always undefined and every `expect` is inside `if (result.skipped)`. The guard keeping WAL off the OneDrive-hosted database has no executed cover. | none |
| **L-92** | High | `log-retention.test.ts:122` (« NEVER prunes the fiscal journal ») writes a fresh event and calls `pruneLogs()` on the real clock, so any cutoff-based prune of `FiscalEvent` passes it. `pruneLogs` already takes `now`; passing a future date makes the test real. | none |
| **L-93** | Medium | `reports.test.ts:97` asserts `CLOTURE_Z.factice === false` without ever setting `factice`, and its wipe does not clear `Setting`. It fails when the file runs alone (3 pass / 1 fail) and passes in the suite only on a leftover row. The one live order dependency of 114 files. | none |
| **L-94** | Medium | `isPublishedDefaultPin` is tested (3 tests) and called only by `scripts/seed-users.ts`. `POST /api/seed`, reachable unauthenticated on a fresh install and wired to a login-screen button, creates the first SUPER_ADMIN with `123456` and the MANAGER with `111111` without consulting it. | none |
| **L-95** | Medium | The « journalled before the paper is attempted » ordering is asserted for neither `fiscal/drawer` nor `orders/[id]/reprint`; `fiscal-surface.test.ts:65,85` re-implement both route bodies inline, and the reprint route is invoked by no test in either suite. | none |
| **L-96** | Medium | `restore-swap.test.ts:202` fails and `pos-resilience.test.ts:104` goes vacuous on any fresh checkout: `core.autocrlf=true` with no `.gitattributes`, verified by reproducing the checkout. One `.gitattributes` line fixes both. | none |
| **L-97** | Low | Three exported symbols used only by tests, none on docs/INVARIANTS.md's *Deliberately retained* list: `CASH_MOVEMENT_CATEGORIES` (DD-12's list exists in three hand-copied places; the dialog uses a local map, not this), `TX_CATALOG`, `columnsForPaperMm`. | none |
| **L-98** | Low | `z-close.test.ts:30-33` asserts the C-02 defect's own output — a restatement of `formatEuro`'s contract that cannot fail. The defect's site (`shifts-view.tsx`) is read by no test. | none |
| **L-99** | Cosmetic | `receipt.test.ts:378`'s `LIVE_ADDRESS` (56 chars, duplicated postcode) is no longer the live `Setting.restaurantAddress` (50 chars). The assertion still works; the comment claiming it was measured from production is stale. | none |
| **L-100** | Low | `readme-counts.test.ts:157` checks that an expansion's *file* contains some loop, not that the named loop exists. Two entries name `deployment.test.ts`; deleting one of its two loops leaves the check green and the README total wrong by 7. | none |
| **L-101** | Medium | `scripts/init-fiscal-counter.ts:81` carries its own `populated > 0` refusal — the create-path half of L-38 — and nothing tests it. `fiscal-counter-floor.test.ts:126` is captioned as if it did; that script never calls `counterRegressions`. `bun test src` cannot reach `scripts/` at all. | none |
| **L-102** | Low | `aggregate.test.ts:20-55`'s four `apportion` tests are all satisfied by an implementation that gives the whole target to the first weight; proportionality is pinned only transitively through `combo-allocation.test.ts`. `:47` compares `apportion` with itself. | none |

---

## 8. What Tauri needs to know from this pass

1. **Fix `.gitattributes` before anything is cloned.** `core.autocrlf=true` with no attributes file
   means the first checkout on a build machine breaks `restore-swap.test.ts` outright and silently
   disarms `pos-resilience.test.ts:104` (**L-96**). Reproduced, not predicted. One line, and it
   should land before the packaging work starts, not after someone spends an afternoon on a red
   suite that is green here.

2. **`bun run test` is not the whole suite, and the packaging phase will need it to be.**
   `bun run test:e2e` is the *only* thing that invokes the Z close (`shifts/[id]/close`),
   `auth/login`, `auth/step-up`, `fiscal/verify` and `fiscal/grand-total` — and it is not in § 2's
   three-command loop, had not been run for five days, and re-ran green today in **10.4 s**. It is
   cheap. Whatever CI Tauri gets should run all four commands, and § 2 step 2 should say so.

3. **Two default tables, and packaging will multiply them.** `DEFAULT_SETTINGS` and
   `settingsSchema` disagree on `factice` and `printerConnection` (**L-89**) — the two switches
   R6.3 and R6.4 turn. A Tauri build that grows a native settings pane, or ships a first-run
   wizard that PATCHes a subset, will hit this directly. Reconcile the tables and pin the
   reconciliation before that pane exists.

4. **The first-run credential path is the France install's path.** `POST /api/seed` installs
   `123456` / `111111` and the denylist that names them is called only from a script nobody runs
   (**L-94**). PREP-2 and PREP-3 built catalogue transfer and secret generation for exactly this
   moment; the PIN is the piece that was left to the operator's memory. Tauri owns first-run.

5. **`scripts/` is sixteen untested operator tools and the packaging decision will change how they
   are invoked.** Today they are `bun scripts/x.ts --apply` from a repository checkout. A Tauri
   app has no repository, no `bun`, and no `--apply`. Either the safe ones become in-app actions
   with real tests, or the packaged build ships with a documented way to run them; deciding that
   late means deciding it the day the operator needs `apply-migration.ts` on a machine in France.
   The half that is already testable is the pattern to follow — lift the rule into `src/lib/`
   (L-38's shape), leave the I/O in the script.

6. **`deployment.test.ts` is the largest file in the suite and pins a retired model.** 34
   declarations, 48 runs, 90 assertions over eight `.ps1` files. CLAUDE.md is explicit that the
   files stay and that `print-raw.ps1` is live for R6.4 — so **do not delete them to tidy up**.
   But the Tauri plan should say which of those eight survive packaging, because when they go the
   test goes with them and the README count moves by 48. Knowing that before the count moves is
   cheaper than discovering it in a failing `readme-counts.test.ts`.

7. **Two guards you will be tempted to trust are not currently proving anything.** The
   cloud-sync/WAL refusal (**L-91**) and the fiscal-journal prune refusal (**L-92**) both matter
   more under Tauri than here: Tauri decides where the data lives (DD-02 is explicitly deferred to
   it), which is exactly the decision the WAL guard exists to backstop. Make both tests real before
   the data directory moves, so that the move is verified by something.

8. **One durable shape worth adopting.** The suite's best tests share it: assert what was
   *booked* or *sealed*, through the thing that actually runs, and say in the file what the test
   does **not** prove (`zreport-given-away.test.ts:325`, `api-authorization.test.ts:16-23`,
   `readme-counts.test.ts:16-21`). Its worst share the opposite: re-implement the caller inline and
   name the test after the caller. Both patterns are in this codebase today; the second one is what
   produced L-91, L-92, L-95 and L-101.
