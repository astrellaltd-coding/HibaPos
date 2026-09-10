# HibaPOS France — Remediation Plan

**This is the only plan. Read it top to bottom before touching anything.**

It replaced `REMEDIATION_PLAN.md` (2 173 lines) and `REMEDIATION_RECORD.md` (5 595 lines) on
2026-09-10, at the operator's instruction. Everything load-bearing from those two files —
the nine methods, the hard invariants, the open findings, the answered decisions — was
carried across into this document. The originals are recoverable in full from git
(`git show HEAD~1:REMEDIATION_RECORD.md`); nothing was lost, only retired.

Completed work lives in **`REMEDIATION_DONE.md`**. This file only ever shows outstanding work.

---

## 1. CURRENT STATUS

**Overall:** NOT READY FOR PRODUCTION. The software is essentially complete; what remains is
a short list of real defects, a documentation reconciliation, and hardware.

**Current phase:** **Phase 0 — make the data survivable.** Nothing has started.

**Current task:** **R0.1** — the operator takes a backup from the Sauvegardes screen; Claude
verifies it read-only afterwards. Claude works Phase 1 onward in the meantime.

**Blocked:** R0.2, R0.3 and R0.4 wait on R0.1 — nothing is deleted until a restorable copy
exists. Everything from Phase 1 down can start immediately.

**Awaiting the operator:** a verified backup (R0.1), and the accountant's written line on
the VAT allocation method (§ 8).

**Deployment is deferred.** The app will ship as a **Tauri v2 native application**, and that
migration has its own plan which does not exist yet. Everything about installing on a
Windows till — the commissioning session, the kiosk launcher, the pre-built tree, the
32-bit hardware problem — was retired on 2026-09-10. What remains before the restaurant's
first real sale is **fiscal, not technical**, and it is § 6's last section.

**Last updated:** 2026-09-10, after a full read-only audit of the codebase and database.

### What changed on 2026-09-10, and why this file exists

1. **The client trial is dropped.** No copy goes to the restaurant until the final version.
   The app is in build phase; nothing has shipped; resets on this machine are free and
   unlimited. `HibaPOS-copie-essai/` is deleted — it was verified to hold nothing that
   existed only there.
2. **§ 6 of `docs/mise-en-service.md` runs ONCE**, not twice. The second run existed only
   because a FACTICE-off trial would have sealed phantom sales into the journal. The
   operator initiates it before the final copy ships.
3. **The developer machine was reset on 2026-09-10.** All trading tables are at zero. The
   catalogue survived intact and verified.
4. **The till deployment model is withdrawn.** The app ships as a Tauri v2 native
   application later, so `docs/mise-en-service.md` and `.zscripts/README-windows.md` are
   retired. The PowerShell scripts stay: `print-raw.ps1` is live code that
   `printer-transport.ts` calls, and the rest are covered by `deployment.test.ts`.

---

## 2. HOW TO WORK HERE

### The loop — every item, without exception

1. Do the work in the item. **Only** what is in the item.
2. `bun run test` · `bun run typecheck` · `bun run lint` — all three, all green.
3. Prove the fix actually applies. A unit test on an extracted rule proves the rule, **not
   that anything calls it** — this project has shipped that gap three times. Test what is
   *booked* and test what the client *sends*.
4. Confirm nothing else broke: the test count should move only by tests you added.
5. Commit. One item, one commit (or a small reversible series).
6. **Push.** The operator has standing authorisation for this — it is part of the loop.
7. Move the item's row from this file to `REMEDIATION_DONE.md` with its commit sha and how
   it was verified. Update *Current task* above.
8. Stop. Do not roll into the next item without the operator's go-ahead.

**And stop again at every phase boundary.** Finishing the last item of a phase is **not**
licence to open the next one. Report what the phase did, what it cost and what it left
behind, and wait for the operator to say start. *(Added 2026-09-10, after Phase 1 completed
and Phase 2 was opened in the same breath. Step 8 already forbade it item-by-item; a phase
boundary is where that reads as merely bureaucratic and is not, because a phase is where the
work changes character — Phase 1 was documentation, Phase 2 changes what gets sealed into a
fiscal document.)*

### Safety rules

1. Never fix unrelated findings inside an item. Record them in § 7 instead.
2. Never delete or weaken a test to obtain a green result.
3. Never modify fiscal or data-integrity behaviour without targeted tests.
4. Never mark an item done without recording how it was validated.
5. Preserve audit IDs. They are stable labels, never renamed.
6. If a fix would change business behaviour, stop and ask. Do not guess.
7. **Never assume documentation is more authoritative than the implementation.**
8. **Never claim French fiscal or legal compliance on the basis of automated testing.**
9. **Ask the operator before editing `CLAUDE.md`.** It may change whenever the project needs
   it to, but the operator decides what it says — bring a concrete proposal and wait.

### The nine methods — learned the hard way, still current

- **Scratch copy, proved before any write.** Copy `db/custom.db` to the scratchpad, start the
  app with **both** `DATABASE_URL` and `HIBAPOS_DATA_DIR` pointing at the copy, and prove
  which database the server has open by reading a marker back from the pre-auth
  `GET /api/auth/profiles` **before the first write**. Afterwards confirm the production
  file's sha256 and mtime are unchanged and no `-wal`/`-shm` appeared beside it. A scratch
  copy runs in WAL even though production does not, so **restoring one means stopping the
  server and deleting `-wal` and `-shm` with the `.db`**. Two harness traps: Git Bash
  rewrites a leading-slash argument into a Windows path (`MSYS_NO_PATHCONV=1`), and
  round-tripping JSON through a shell pipeline corrupts UTF-8 — build request bodies in a
  file and send with `--data-binary @file`.
- **Migration rehearsal with a fingerprint diff.** Never apply a migration to production
  first. Snapshot to **`../db-snapshots/`, a SIBLING of the repo** — creating it inside puts a
  production database in the working tree. Apply to a copy, then diff a fingerprint of every
  fiscal table before and after: row counts, `FiscalCounter`, `GrandTotal`, every event hash,
  sealed rows, order lines, `integrity_check`, FK errors, column order. Only the intended
  columns and the `_prisma_migrations` row may differ. Then hand the operator the exact
  `bunx prisma migrate deploy` command.
- **Prove the test fails on the old code.** Temporarily revert the fix, re-run, confirm the
  new tests fail, restore from a copy taken **before** the revert (`git checkout` on
  uncommitted work throws the change away). Revert **one property at a time**, in **both
  directions**, never two together — they mask each other. Expect to need many. A revert that
  everything survives is a question, not a verdict: either the revert is a no-op, or the test
  proves less than it claims. **Say which tests pass under no revert, and why.**
- **Is it a race? Measure, do not assume.** Prisma's interactive transactions on SQLite **do
  not overlap** — the second body does not begin until the first commits, in both journal
  modes — while a read *outside* a transaction does not wait at all. The only question is
  whether the read sits inside the transaction that depends on it.
- **Read-only inspection of live data.** `bun:sqlite` with `readonly: true`. Never load Prisma
  or the WAL startup hook against the production file.
- **Manual validation against the production build.** `bun run build` then `bunx next start`
  on the scratch copy. `next dev` is blocked here — it loads the real `.env`. **Check
  `.next/BUILD_ID` against your source mtimes**: a worked example once ran against a stale
  build and returned a plausible wrong number.
- **A scratch copy can carry a PIN Claude knows.** Claude cannot type a *production* PIN — the
  live values were never seen and are recorded nowhere. On a copy, write a known PIN with the
  app's own `hashPin` before starting the server, and the whole walkthrough runs unattended.
  Guard the script on the target path so it can never address the live file.
- **Browser driving is unreliable here.** When synthetic clicks do not land, dispatch through
  the DOM and say so. A `keydown` probe reading `e.defaultPrevented` reports false for a
  handler that *did* fire if the app re-registered its listener after the probe went on —
  install the probe last, or observe the effect instead of the flag. If the pane fails
  entirely, drive the built server over HTTP and **do not claim a walkthrough you did not
  run**.
- **Journal payload vintages.** Anything reading `FiscalEvent.dataJson` must tolerate the
  pre-3.5 and post-3.5 shapes. Sealed rows are **never** re-serialised — their hashes cover
  the old bytes.

---

## 3. HARD INVARIANTS — never break these

Distilled from the constraints every completed batch left behind. Each one was learned by
something going wrong.

### Money and fiscal

- **All money is integer cents, end to end.** Storage, DTO, arithmetic. Euros exist only at the
  display boundary (`formatEuro`) and the input boundary (`parseEuroInput`).
- **`FiscalEvent` is never pruned, by any retention setting.** The audit log has a retention
  knob; the fiscal journal does not.
- **Sealed rows are immutable.** Never re-serialise a sealed payload to match a newer shape.
- **An archived `Receipt.content` is never re-rendered.** It is the document that was issued.
- **`apportion` is the only splitter.** Largest-remainder, so parts always sum to the whole.
  Never round per-line independently — that is how an order's VAT stops matching its total.
- **`OrderItem.vatRate` is a snapshot** taken at sale time from `resolveVatRate(product,
  orderType)`. A later catalogue edit must never restate a sale already made.
- **The client's `vatRate` is ignored.** `orders/route.ts` is the only place that decides what
  is booked. A tampered basket cannot choose its own tax.
- **Nothing may claim fiscal compliance.** Not this file, not a test result, not a document.

### Database and process

- **`src/lib/db.ts` must cache the Prisma client on `globalThis` UNCONDITIONALLY.** The
  dev-only guard is what broke the restore: two clients meant two handles on the SQLite file,
  and Windows refuses to rename over an open handle.
- **Nothing in `scripts/` may open a database path not derived from `DATABASE_URL` or
  `HIBAPOS_DATA_DIR`.** `git grep "new Database("` is how to check.
- **Every script in `scripts/` is a dry run unless given `--apply`.** Read the header first.
- **Never run `bunx vitest` or `npx vitest`.** `vitest.config.ts` throws at import, on purpose:
  vitest never loads `test-setup.ts`, which is the only thing pointing `DATABASE_URL` at a
  throwaway database. **`bun run test` is the runner.**
- **Never run `git clean`.**
- **Never write to `db/custom.db` or to real menu data.** Scratch copy, both env vars
  overridden, marker proved first.
- **`prisma migrate deploy` against production and edits to the live catalogue are the
  operator's actions.** Prepare, rehearse, verify, hand over the exact command.
- Stop any server you started with `taskkill //PID <pid> //T //F`. A leftover `next start`
  holds `query_engine-windows.dll.node` and makes `bunx prisma generate` fail `EPERM`.
  Ports 3021–3026, 3033/3034, 3040–3043, 3050–3052, 3060–3065 and 3070–3083 are spoken for.

### Printing and interface

- **No line any ticket renderer emits may exceed the paper.** `services/ticket-layout.ts` is
  shared by all three renderers — change it there or not at all. **Nothing is ever truncated**
  (BOFiP § 50); it wraps.
- **Touch targets are 44 px minimum**, enforced by `touch-and-labels.test.ts`.
- **Printing must never lose a sale.** The order, its payments and its fiscal event commit
  before anything reaches the printer. Every printer function returns an outcome instead of
  throwing.
- **A `REIMPRESSION` or `OUVERTURE_TIROIR` is journalled before the paper is attempted**, and
  whether or not it succeeds.

### Secrets

- **No PIN or secret value has ever been seen by Claude, and none is recorded anywhere.** Do
  not ask for one and do not write one down. `PUBLISHED_DEFAULT_PINS` in `src/lib/auth.ts`
  refuses the two values this repository publishes about itself.
- **`.env` carried to the till must be the one rotated 2026-09-07.**
- **Arm `FISCAL_CHAIN_KEY` only on an empty journal**, after the reset and before the first
  real sale. Arming onto a journal holding unkeyed events is refused by design.

### Deliberately retained — do not "clean up"

- **`src/features/tables/tables-view.tsx`** is unreachable by design (DD-09 withdrew table
  service). `table-withdrawal.test.ts` asserts the file exists *and* is not wired.
- **The table auto-link/auto-free branches** in `checkout.ts` and `refund.ts` are unreachable
  today and stay. Do not delete them without reopening DD-09.
- **`round2` in `money.ts`** is retained though the fiscal path no longer uses it.
- **`/api/reports/vat`, `/api/reports/cashiers`, `/api/reports/products`** have no interface
  and are correct, tested and gated. They are the back-ends the reporting work will use.

---

## 4. CURRENT BASELINES — re-measure before trusting any of these

| Thing | Value, measured 2026-09-10 |
|---|---|
| Tests | **1248 pass, 0 fail**, 102 files, ~130 s. `typecheck` and `lint` both clean. Pinned by `readme-counts.test.ts`, which counts declarations plus declared expansions. |
| e2e | **13 passed** (measured 2026-09-07). `bun run test:e2e` is **safe** — see § 5. |
| Production DB | sha256 `c67b4b0b2e1c61e68b6461a4fa11f5344b48631c06a4071c4d2256cf89d30426`, 884 736 bytes. `integrity_check` ok, 0 FK errors, 12 migrations, none pending. **The file did not shrink after the reset** — SQLite frees pages for reuse, so size cannot distinguish a wiped database from a full one. Only the hash can. |
| Trading tables | **All zero.** Order, OrderItem, Payment, Receipt, Refund, Shift, ZReport, FiscalEvent, GrandTotal, DailyClose, MonthlyClose, AnnualClose, CashMovement, Customer, Table. |
| Fiscal counters | `0 / 0 / 0 / 0` (receipt / shift / Z / event). Journal **empty**. |
| Fiscal chain | **Empty and UNKEYED**, which is correct here. Arming is the restaurant machine's step, after its own reset. |
| Catalogue | **80 products in 14 categories**, verified intact through the reset. **6 menus composés · 19 slots · 6 whitelist rows · 7 option rules.** All 17 drinks in `Canette`/`Bouteilles` correctly resolve to 5,5 % à emporter and 10 % sur place. |
| Accounts | Two: `manager` (MANAGER) and `admin` (SUPER_ADMIN, the developer's). `CASHIER` was removed from the product. Both must re-enter their own PIN for a discount above 20 % and for **every** refund. |
| Journal mode | `delete`, not WAL — the guard refuses WAL on this OneDrive path, deliberately. It will switch to WAL the first time the database sits under a non-synced root. |
| Settings | `factice=true`, `printerEnabled=true`, `printerHost=""`, `printerConnection` **absent** (defaults to `network`). So every print attempt today answers *« Renseignez l'adresse IP »*, and an IP was never the answer — the Sunso WTP-801 is on USB type-B. Setting `printerConnection=usb` and picking the queue is R6.4. |
| Backups | **`Backup` table empty. Nine files (~126 MB) on disk, all pre-rotation, none decrypts.** There is no restorable copy of this database. See R0.1. |

---

## 5. WHAT IS SAFE TO RUN

| Command | Safe? |
|---|---|
| `bun run test` | ✅ Unit + integration, Bun runner, temp DB. Carries its own `--timeout 30000`. |
| `bun run typecheck` | ✅ `tsc --noEmit`, covers `scripts/`. |
| `bun run lint` | ✅ `eslint .`, covers `scripts/`. |
| `bun run build` | ✅ Requires `SESSION_SECRET` in env or it throws at import. |
| `bun run test:e2e` | ✅ **Safe, and verify it stays so.** Three properties make it safe: `tests/e2e/env.ts` refuses any database path outside the OS temp directory *before* anything is created; `playwright.config.ts` runs `next start` with an env it passes explicitly, so the real `.env` is never loaded; and `tests/e2e/00-disposable-database.spec.ts` runs first and fails the suite if a production operator answers `GET /api/auth/profiles`. **If any of those three is gone, this suite is dangerous again** — it used to write orders and sealed Z reports into the production hash chain. |
| `bunx vitest` / `npx vitest` | ❌ Refuses to run, by design. |
| `git clean` | ❌ Never. |

---

## 6. THE WORK

Status values: `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED` · `OPERATOR` · `ASK FIRST`.
A `DONE` row leaves this file for `REMEDIATION_DONE.md`.

### Phase 0 — Make the data survivable

*There is no restorable backup of this database. Everything else waits behind this.*

| ID | Status | Task |
|---|---|---|
| **R0.1** | `OPERATOR` | **Take a backup under the current keys and prove it opens.** The **operator** creates it from the Sauvegardes screen — `createBackup()` writes a `Backup` row, which is a production write Claude does not make. Claude then verifies read-only: the row exists, the file is on disk, and it decrypts with `scripts/decrypt-backup.ts` against its recorded checksum. Then get it off this machine. **A backup nobody has opened is a hope, not a copy.** |
| **R0.2** | `TODO` | **Delete the nine dead backup files** in `db/backups/` (~126 MB). Three legacy `.json` and three `.dbenc`/`.uploads.enc` pairs, all pre-rotation. **Strictly after R0.1.** |
| **R0.3** | `TODO` | **Delete `HibaPOS-copie-essai/`** (492 files, 58 MB), after recording its four pre-positioned settings in `REMEDIATION_DONE.md`: `factice=false`, `printerEnabled=false`, `printerConnection="usb"`, `printerQueue=""`. Verified 2026-09-10 to hold nothing unique. |
| **R0.4** | `TODO` | **Remove `db/custom.db.before-dupfix-2026-09-08`** — a second plaintext production database on a OneDrive-synced path. Check it against `../db-snapshots/` first; it may be the only copy of that state. |

### Phase 2 — The reporting batch — **the only item with a real deadline**

*Both change what is sealed into Z reports and closes. Zero closes exist, so the shape is
still free; it freezes permanently at the restaurant's first real close.*

| ID | Status | Task |
|---|---|---|
| **R2.1** | `TODO` | **L-76 — key product aggregation by identity, not by name.** `aggregate.ts:344,396` keys `productAgg` by `item.productName`, so *Coca* the 1,50 € can merges with *Coca* the 3,50 € bottle — and the merged row is sealed into an immutable Z report. Three collisions exist live: Coca, Fanta, Orangina. `reports/products/route.ts:105` already keys by `productId ?? productName`; the two reports disagree today. |
| **R2.2** | `TODO` | **L-77 — make menus visible in reports.** `comboGroupId` / `comboName` / `comboPrice` are written at checkout and read by the receipt renderer alone, so « how many Menu Chill did I sell? » cannot be answered. Within one report `itemsCount` counts a menu as one article while `topProducts` counts its three components — the two figures disagree for every combo order. **Needs a new column, `OrderItem.comboProductId`** (operator-approved 2026-09-10): a menu is recorded only as `comboName`, a *string*, so counting menus by name would reproduce R2.1's exact bug one level up. Grouping is by `comboGroupId`, which the fallback path also sets, so a menu that fell back to a single line still counts as one menu. |
| **R2.3** | `TODO` | **L-78 — store the allocation evidence.** `OrderItem` records the *result* of a menu's VAT split but not `referencePrice`, the standalone catalogue value each share was computed from. That figure is the *justification* for the split; without it, a catalogue price change makes an old sale's division unreconstructable. French doctrine requires the allocation be justifiable on request. **One migration carries R2.2's and R2.3's columns together** — `comboProductId` and `referencePrice`, both `Int?`/`String?` nullable, both harmless to existing rows (of which there are zero) — so the operator runs `prisma migrate deploy` **once** for Phase 2. Rehearse it on a scratch copy with a fingerprint diff first (§ 2, *Migration rehearsal*). |

### Phase 3 — « Use it on POS » and the three boxes it unblocks

*Today a menu component must be `active`, and every active product appears on the till grid.
That is why Box 15 cannot become a menu: it needs a food-only product to weigh the drink
against, and creating one would put a product on the till nobody should ring up alone.*

| ID | Status | Task |
|---|---|---|
| **R3.1** | `TODO` | **Add the toggle.** One boolean on `Product`, defaulting **on** so nothing changes for the 80 existing products, plus a migration. Filter the POS grid (`pos-view.tsx:83`), extend the products DTO, add the switch to the catalogue editor. |
| **R3.2** | `TODO` | **Prove a hidden product still behaves everywhere else** — sellable as a menu component, refundable, reprintable, present in past orders and reports. Hidden means hidden from one grid, not withdrawn from the catalogue. |
| **R3.3** | `OPERATOR` | **Restructure Box 15, Box 35 and Tenders box into real menus** (L-69). Each becomes a menu with a hidden food-only component and a drink slot, so the drink gets 5,5 % à emporter instead of the whole price sitting at 10 %. **The operator sets each food component's standalone price** — that number is the allocation weight, so it is a commercial decision. TEX-MEX, 5 Nuggets and Box Bowl need nothing: frites are 10 % either way. Claude prepares, the operator applies. |

### Phase 4 — Small correctness

| ID | Status | Task |
|---|---|---|
| **R4.1** | `TODO` | **L-79 — journal the silent image-less backup.** `backup.ts:270-275` catches a failed `tar` import with a bare `console.warn` and completes the backup with no images and no record, in a file where every other failure is journalled. It matters more now the till carries a *copied* `node_modules`. |
| **R4.2** | `TODO` | **L-80 — tighten the cart add-on identifier.** `cart-store.ts:25` types `id` as `string \| null`, `checkout-intent.ts` propagates it, and the checkout schema requires a string — so the types permit a request the server refuses. No live path produces one, but the compiler cannot see it and the failure mode is a 400 on a real customer's checkout. |
| **R4.3** | `TODO` | **L-71 — silence the session tracker's false error.** `auth.ts:279` fires a fire-and-forget `session.update` and swallows the rejection, but Prisma logs it first. It appears three times in a clean test run and lands in the log file the runbook tells an operator to read first. |
| **R4.4** | `OPERATOR` | **L-39 — trim the fourteen catalogue names carrying stray whitespace.** Ten `CategoryOptionChoice` and three `CategoryAddOn` with a leading space, plus the group `"Sauces "` with a trailing one. They render as indented labels on the till. *(The old plan said thirteen and missed the trailing one.)* Claude prepares the exact statements; the operator applies them. |

### Phase 5 — Cleanup

*Deliberately last, so the diff reaching the till is correctness and not tidying.*

| ID | Status | Task |
|---|---|---|
| **R5.1** | `TODO` | **Delete four strays:** `db/test.db` (0 bytes), `upload/` (empty; `.gitignore` calls it stray), `test-results/`, `tsconfig.tsbuildinfo`. |
| **R5.2** | `TODO` | **Remove the 27 orphaned interface components.** Verified: exactly 27 of 45 files in `src/components/ui/` have no importer outside that folder. Template residue. Re-run `touch-and-labels.test.ts` afterwards — it scans that tree. |
| **R5.3** | `TODO` | **Drop seven unused dependencies:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@hookform/resolvers`, `@tanstack/react-table`, `date-fns`, `tailwindcss-animate`. **Strictly after R5.2** or the remaining files stop typechecking. **Keep `tar`** — it looks unused but is loaded dynamically at `backup.ts:272`. |

### Phase 6 — Before the first real sale

*Not deployment — deployment is the Tauri phase and has its own plan. These four are
**fiscal**, they apply whatever the app is packaged as, and the order is not a preference:
arming the chain key before the reset makes the reset refuse.*

| ID | Status | Task |
|---|---|---|
| **R6.1** | `OPERATOR` | **Run `scripts/pre-golive-reset.ts --apply` — once.** It empties the fiscal journal, deletes every order, receipt, shift, Z report, close and archive, and resets the counters to zero. It **keeps** the catalogue, the users, the settings and the audit log. Everything rung up before it is deleted by it — that is why testing comes first. **This runs once, and never after a genuine sale**: from that point the journal is append-only and clearing it is precisely the deletion `docs/attestation-conformite.md` states is impossible. |
| **R6.2** | `OPERATOR` | **Arm `FISCAL_CHAIN_KEY` — after R6.1, never before.** Every fiscal fingerprint becomes HMAC-SHA-256 instead of plain SHA-256. Arming onto a journal that already holds unkeyed events is refused by design, because a half-keyed chain verifies under neither mode. **Lose this key and the journal cannot be verified at all** — back it up with the same care as `BACKUP_ENCRYPTION_KEY`, and not only on the machine that holds it. |
| **R6.3** | `OPERATOR` | **Turn FACTICE off.** `factice` is `true` today, which stamps every ticket *SIMULATION* and flags the journal row. Off is the point every rule tightens: from then on every sale is real. |
| **R6.4** | `OPERATOR` | **Configure the printer:** install the driver, set `printerConnection=usb`, pick the queue from the list in Réglages, then re-enable `printerEnabled`. Today it is enabled with an empty host, so every print answers *« Renseignez l'adresse IP »* — and an IP was never the answer. |
| **R6.5** | `OPERATOR` | **Point `BACKUP_LOCATION` at a second volume.** Unset, backups land beside the database on the same disk, so one failure takes the data and every copy of it together. |

**What is NOT here, deliberately:** the till hardware, the Windows install, the kiosk
launcher, the pre-built tree and the update path. All of that belongs to the Tauri v2
migration and none of it is this plan's business.

## 7. OPEN FINDINGS

Anything found outside the current item goes here with an ID, not fixed in place (safety
rule 1). Audit IDs are never renamed.

| ID | Severity | Finding | Owner |
|---|---|---|---|
| **L-76** | Medium | `topProducts` merges distinct products sharing a name, and the merged row is sealed into Z reports. | R2.1 |
| **L-77** | Medium | Menus composés appear in no report; `itemsCount` and `topProducts` disagree for every combo order. | R2.2 |
| **L-78** | Medium | The menu allocation's reference prices are not stored, so a split cannot be justified after a catalogue price change. | R2.3 |
| **L-79** | Low | A failed `tar` import silently produces an image-less backup with no journal entry. | R4.1 |
| **L-80** | Low | `CartAddOn.id` is nullable but the checkout schema requires a string. Latent, not live. | R4.2 |
| **L-71** | Low | The sliding session tracker logs a Prisma error for a write it deliberately ignores. | R4.3 |
| **L-39** | Cosmetic | Fourteen catalogue names carry stray whitespace and render indented on the till. | R4.4 |
| **L-69** | Medium | Three products bundle a sealed drink into one fixed price taxed wholly at 10 %, the opposite treatment from the six menus. Over-declares, so it errs safe. | R3.3 |
| **L-46** | **High** | `Backup` holds zero rows while nine files sit on disk — and since the 2026-09-07 rotation none of them decrypts. **There is no restorable backup.** | R0.1, R0.2 |
| **L-75** | Deferred | The app cannot run on a 32-bit Windows: both Prisma engines are `machine 0x8664` and Bun is x64/ARM64 only. **Carried to the Tauri v2 phase**, where the runtime and the packaging are both decided. No software fix at this layer. | none |
| **L-05** | Deferred | `output: "standalone"` was dropped; whether to reinstate it deliberately is open. | none |
| **L-11** | Deferred | Two payment tolerances disagree (`paid < total - 1` vs `- 0.01`, both on integer cents); dialog resets run on uncleaned timers. `payment-dialog.tsx:86,128,377`. | none |
| **L-47** | Open | The app renders its login screen even with a valid session **in the in-app browser pane**, so no browser walkthrough reaches an authenticated view. Four data points; never reproduced outside that pane. | none |
| **L-51** | Low | `backup.ts` reads the whole uploads archive into memory to encrypt it — 47 MB, not the "few MiB" its comment once claimed. | none |
| **L-52** | **External** | `LOI n° 2026-534 du 25 juin 2026, art. 87` requires archived data restituted in a format set by the administration, in force 27 June 2026. **No format has been published.** Nothing to build until one exists. | none |

**Dissolved by the reset of 2026-09-10, and closed:** **L-14** (receipts archived at 80
columns — `Receipt` now holds zero rows) and **L-60** (eighteen orders carrying no
`fiscalEventId` — `Order` now holds zero rows). Neither can recur: both depended on rows the
reset deleted, and every order written from now on is journalled.

---

## 8. EXTERNAL — not ours to close

**Nothing in this project, and no test result it produces, is evidence of French fiscal
compliance.** The attestation regime is the operator's, and `docs/attestation-conformite.md`
cites art. 441-1 of the code pénal: a false attestation is a criminal offence.

| ID | Question |
|---|---|
| **V-01 / C-22** | Does an unsigned hash chain suffice for the *inaltérabilité* condition, or is an electronic signature required? |
| **V-02** | Is the annual archive's format acceptable? See also L-52 — a format may now be prescribed. |
| **V-03** | Must the automatic cash-drawer opening be journalled? |
| **VAT-METHOD** | **How a fixed menu price is divided between 10 % and 5,5 %.** The rates themselves are settled and live; the division is the open claim. The software apportions by **TTC** standalone catalogue price — defensible, supported by BOFiP's « valeur de marché, **pour le consommateur** », and it errs by over-declaring (measured: 2,16 € vs 2,14 € on Menu Eco à emporter). An HT-weighted alternative is recorded in § 8 of the policy document. **The operator's accountant should confirm the basis in writing.** |
| **V-07** | A full day of trading on the real hardware. |

---

## 9. ANSWERED DECISIONS — do not re-open these

Kept as one-liners so nobody re-litigates them. Full rationale is in git history
(`git show HEAD~1:REMEDIATION_RECORD.md` → *Answered design decisions*).

| ID | Decision |
|---|---|
| DD-01 | ESC/POS over raw TCP:9100 as primary, behind a transport interface. USB RAW spooler added later as the second implementation. |
| DD-02 | Application data lives at `C:\HibaPOS\data`. |
| DD-03 | No sealed row ever carried the wrong VAT key — the premise was an audit assumption. |
| DD-05 | Out-of-order period closes are **refused**. A close must follow the last sealed one. |
| DD-06 | No LAN access. The server binds `127.0.0.1`. |
| DD-07 | **There are no cashiers.** MANAGER is the till's only operational role; SUPER_ADMIN is the developer's. `CASHIER` was removed from the product. |
| DD-09 | **This restaurant does not serve at tables.** The feature is withdrawn, the code deliberately retained. |
| DD-10 | Cross-shift refunds are **allowed**, attributed to the till open when issued. |
| DD-11 | Held orders stay device-local. One till. |
| DD-12 | Cash movements exist, with a fixed category list. |
| DD-13 | No pre-payment order state. The dead `CANCELLED` enum values were removed. |
| DD-14 | « Offert » is a real tender. An offert sale is not counted as revenue. |
| DD-16 | Catalogue images stay tracked in git. It is currently their only versioned copy. |
| DD-17 | A product's VAT rate comes from its category, inherited nearest-wins, with a per-product override. |
| DD-18 | A premature month/year close is **refused**, with no override. |
| DD-19 | Step up with the operator's **own** PIN — above the discount threshold, and on **every** refund. |
| DD-20 | A given-away order is reported **separately**, never as a sale. |
| DD-21 | The four non-fiscal reports adopt the fiscal rule: a period books the corrections it issued. |
| DD-22 | `GET /api/users` and `GET /api/backups` are SUPER_ADMIN only. |
| DD-23/24 | The trading day (`clôture du jour`) exists, with a configurable cut-off defaulting to **05:00**. |
| DD-25 | The fiscal chain may be keyed (HMAC-SHA-256) off a secret held outside the database. Armed only on an empty journal. |
| **2026-09-10** | **The client trial is dropped.** No copy ships before the final version; § 6 runs once. |
| **2026-09-10** | **VAT allocation stays TTC-weighted**, documented as a market-value method, pending the accountant. |
| **2026-09-10** | **The app ships as a Tauri v2 native application.** Deployment is therefore out of this plan entirely: `docs/mise-en-service.md` and `.zscripts/README-windows.md` are retired, and the till, the kiosk launcher and the 32-bit hardware problem go with them. Tauri gets its own plan when this one is closed. |
