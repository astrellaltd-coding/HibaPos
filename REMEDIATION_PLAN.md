# HibaPOS France — Remediation Plan

**This is the only plan. Read it top to bottom before touching anything.**

Completed work lives in **`REMEDIATION_DONE.md`**. This file only ever shows outstanding work.

---

## 1. CURRENT STATUS

**Overall:** NOT READY FOR PRODUCTION. Every code defect that ever had a **task row** in
this plan is fixed. What stands between here and ready is **fiscal first** — R6.1, R6.2 and
R6.3 — but not *only* fiscal: R6.4 (printer driver and queue) and R6.5 (a backup on a second
volume) are technical, and § 7's nine findings are open, five of them code-level. None of the
nine blocks a first sale.

**Phases 0, 1, 2, 3, 4, 5 and 7 are COMPLETE and applied**, including all four operator
items (R3.3, R4.4, R7.2, and R7.1's migration — all 2026-09-11) and all three migrations.

**PHASE 7 IS COMPLETE (2026-09-11) and Phase 6 is the only one left.** R7.1 sealed the
give-away figures into the Z report and its migration is applied and verified; R7.2 renamed
the colliding products, and **no two products in the catalogue share a name any more**. Both
landed before the first close, which is the whole reason the phase ran first: a product's
name is sealed into `topProductsJson` and into `givenAwayProductsJson`, and a sealed document
cannot be corrected afterwards.

**Phase 6 (five rows, all the operator's) ends in real trading.** Its order is not a
preference — arming the chain key before the reset makes the reset refuse.

**Current task: PHASE 6, opened by the operator 2026-09-11.** R6.1 is a decision and not a
step — it would delete nothing today. R6.4 and R6.5 are blocked on hardware. Measurements
below.

### Phase 6 — where each row stands, 2026-09-11

*Measurements and the runbook mapping are in `REMEDIATION_DONE.md` under « PHASE 6 OPENED ».
`../HibaPOS-docs-archive/README.md` maps `runbook-complet.md`; **its § 6a/6b/6c are stale**
(scheduled tasks, `C:\HibaPOS-secrets-backup\`, and a claim the backups are unrestorable).*

- **R6.1** reset (§ 6d) — **would delete 0 rows**: all sixteen tables on the script's
  `DELETION_ORDER` are empty and the counter is already `0/0/0/0`. **A decision, not a step.**
  Irreversible; runs once, never after a genuine sale.
- **R6.2** arm the key (§ 6e) — `FISCAL_CHAIN_KEY` absent, so the reset's guard 1 passes.
  An empty journal is armable at any time, so arming EARLY buys nothing and creates a secret
  to transport. Follows R6.1. **A BUTTON since 2026-09-11**, not a `.env` edit
  (`POST /api/setup/chain-key`): counts `FiscalEvent` rows, refuses if any, shows the key once.
- **R6.3** FACTICE off (§ 6f — ~~§ 3~~ turns it **on**) — `factice=true`. Last of the three.
- **R6.4** printer (§ 4a, then § 4) — **the printer is in France; not doable from here.** This
  machine's `SUNSO WTP-800` queue sits on `COM1:`, `Error`, with no `USBPRINT` device: a
  developer artefact. § 4a — a `COM1:` queue « prints nothing and reports success ».
- **R6.5** — the restaurant's `BACKUP_LOCATION` belongs to its install; **this** machine's is
  set (§ 4). See the backup-gap row for what is still outstanding.

### Awaiting the operator

- **Delete `5 nuggets test` (L-81), prepared and rehearsed.** With the app stopped:
  `bun scripts/delete-product.ts --id cmtvwzr050004n368crvp0mw3 --apply`. Dry run without
  `--apply`. Rehearsed on a copy 2026-09-11: 84 → 83 products, 0 FK errors, `integrity_check`
  ok, and a fingerprint diff over every table showing that one row and nothing else.
- **A FRESH verified backup, off this machine.** The oldest open item in the plan and the
  only one about losing data rather than getting something wrong. § 4's two backup rows say
  exactly where it stands and what is left.
- **The accountant's written line on the VAT allocation method** (§ 8, `VAT-METHOD`). The
  rates are settled and live; the division of a menu's forfait between them is the open claim.

### Deployment is deferred

Tauri v2, and that migration's plan does not exist yet. The Windows-till install was retired
2026-09-10 — **the model is retired, the files are not**: `.zscripts/`'s eight `.ps1` files
are pinned by `deployment.test.ts`, and `print-raw.ps1` is live for R6.4. Phase 6 is fiscal
whatever the packaging, and the operator settled **where** on 2026-09-11: **a FRESH install in
France, retaining this catalogue** — the éditeur is in Tunisia (V-10), the restaurant and its
printer are in France. So R6.1-R6.3 belong to that install, not to this machine, and
**nothing in the app exports or imports a catalogue today** — carrying it is unsolved.
`FISCAL_CHAIN_KEY` is in `.env`, `factice` is in the database: they do not travel together.

**Last updated:** 2026-09-11, after Phases 0 and 5 closed and a staleness sweep of every
governing document. § 4's numbers were re-measured at 13:55 that day, not carried forward.

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
  columns and the `_prisma_migrations` row may differ. Then hand over **`bun
  scripts/apply-migration.ts --apply --expect <migration_name>`** — not a bare `bunx prisma
  migrate deploy`. *(Phase 2's went out as the bare command and was reported applied twice
  when it was not, because `migrate deploy` prints the same green banner whichever
  migration it ran. The script names what it applied and verifies it; § 5 says why.)*
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
  on the scratch copy. **`next dev` is NOT blocked — nothing guards it, and that is the hazard.**
  It loads the real `.env`, which points at the live database. `.zscripts/dev.ps1` is worse:
  it runs `db:deploy` and `db:seed` first if `db/custom.db` is missing. Use `bunx next
  start` on the scratch copy. *(This line used to say it was blocked. Nothing blocks it.)* **Check
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
- **A thing is counted under its IDENTITY, never under its label** (R2.1/R2.2). Products by
  `productId`, menus by `comboProductId`; the name is the fallback only when the identity is
  gone. Names are not unique — three live pairs share one.
- **`itemsCount` counts a menu as ONE article, `topProducts` counts its components**, and
  `topMenus` is the third answer beside them. All three are right; none may be "reconciled".
- **`referencePrice` is null where no prorata happened.** Null is the statement. Never
  backfill it, never default it to 0.
- **`topMenus` is in the sealed close payload and NOT in `CLOTURE_Z`** — both halves are
  operator decisions, both pinned, both freeze at the first real close.
- **The client's `vatRate` is ignored.** `orders/route.ts` is the only place that decides what
  is booked. A tampered basket cannot choose its own tax.
- **Nothing may claim fiscal compliance.** Not this file, not a test result, not a document.

### Database and process

- **`src/lib/db.ts` must cache the Prisma client on `globalThis` UNCONDITIONALLY.** The
  dev-only guard is what broke the restore: two clients meant two handles on the SQLite file,
  and Windows refuses to rename over an open handle.
- **Nothing in `scripts/` may open a database path not derived from `DATABASE_URL` or
  `HIBAPOS_DATA_DIR`.** `git grep "new Database("` was the check; today it returns exactly
  one hit and that hit is a *comment* (`scripts/apply-migration.ts:48`). No script uses
  `bun:sqlite` at all — all sixteen go through `PrismaClient`, so **`git grep "new
  PrismaClient("` is the check that matches the current risk surface.** Run both.
- **Every script in `scripts/` is a dry run unless given `--apply`.** Read the header first.
- **Never run `bunx vitest` or `npx vitest`.** `vitest.config.ts` throws at import, on purpose:
  vitest never loads `test-setup.ts`, which is the only thing pointing `DATABASE_URL` at a
  throwaway database. **`bun run test` is the runner.**
- **Never run `git clean`.**
- **Never write to `db/custom.db` or to real menu data.** Scratch copy, both env vars
  overridden, marker proved first.
- **Applying a migration to production and editing the live catalogue are the operator's
  actions.** Prepare, rehearse, verify, hand over the exact command. **The command is `bun
  scripts/apply-migration.ts --apply --expect <name>`**, not `bunx prisma migrate deploy` —
  see § 5. The rule is unchanged; only the command is, and `CLAUDE.md` says
  the same since 2026-09-11.
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
- **`.env` carried to the till must be the one rotated 2026-09-11.** `SESSION_SECRET` was rotated that day (it had leaked into a session transcript); `DATABASE_URL` and `BACKUP_ENCRYPTION_KEY` were proved byte-identical across the rewrite, so **the two verified backups still decrypt**. The pre-rotation file is beside it as `.env.bak-before-session-rotation-2026-09-11`.
- **Arm `FISCAL_CHAIN_KEY` only on an empty journal**, after the reset and before the first
  real sale. Arming onto a journal holding unkeyed events is refused by design.

### Deliberately retained — do not "clean up"

- **`src/features/tables/tables-view.tsx`** is unreachable by design (DD-09 withdrew table
  service). `table-withdrawal.test.ts` asserts the file exists *and* is not wired.
- **The table auto-link/auto-free branches** in `src/lib/services/checkout.ts:281-285` and
  `src/lib/services/refund.ts:167-168` are unreachable
  today and stay. Do not delete them without reopening DD-09.
- **`round2` in `money.ts`** is retained though the fiscal path no longer uses it.
- **`tw-animate-css` is the animation plugin, NOT `tailwindcss-animate`.** The names differ
  by a hyphen; the app imports the first at `globals.css:2`. Removing the wrong one breaks
  every dialog and dropdown animation **silently** — Tailwind stops generating the classes
  with no build error. Check CSS, not just TypeScript. *(Left by Phase 5.)*
- **`tar` stays.** `backup.ts` loads it through a dynamic `import()`, so static analysis
  cannot see the use. The same trap pointing the other way. *(Left by Phase 5.)*
- **A media failure is journalled and never silent** (R4.1). `null` from `ensureMediaArchive`
  means « nothing to archive »; `{ unavailable }` means « could not archive ». Never conflate.
- **`CartAddOn.id` is `string`** (R4.2) — the checkout schema requires it. An id-less add-on
  is legal only in a *snapshot*; `cartAddOnsFromSnapshot` is the one boundary into the cart.
- **The session activity touch uses `updateMany`, never `update`** (R4.3): `update` throws on
  no-match and Prisma logs before the `.catch()` runs. And it writes **at most once a minute**
  (R4.6) — the value has no reader, and a write per request contends for SQLite's single
  write lock. A clean suite run now has **zero** `prisma:error` blocks, down from twelve.
- **A media failure never costs the database backup** (R4.5). Building the archive is guarded
  as well as loading `tar`, and **both** the plaintext `.tar.gz` and the incomplete `.enc`
  are unlinked (`backup.ts:356-357`). The reuse check is `existsSync(encPath)` on the
  **`.enc`** (`:326`), so it is the `.enc` unlink that defends it; the `.tar.gz` unlink is
  hygiene.
- **A reordered line carries REAL catalogue choice ids** (R4.7), resolved by name against the
  catalogue. `choiceId: ""` matches nothing in `pricing.ts` and silently drops the option.
- **`sellableAlone` and `slotProducts` are a PAIR, and the asymmetry is deliberate.**
  `pos-grid.ts` consults `showOnPos`; `combo-builder.ts` **does not**. That is what lets a
  food-only menu component exist without appearing on the till to be sold alone. Unifying
  them makes L-69's three boxes inexpressible again. Both files say so, pointing at each
  other, and `hidden-product.test.ts` asserts both halves in one test.
- **`/api/reports/vat`, `/api/reports/cashiers`, `/api/reports/products`** have no interface
  and are correct, tested and gated. They are the back-ends the reporting work will use.

---

## 4. CURRENT BASELINES — re-measure before trusting any of these

*Re-measured on **2026-09-11 at 15:50**; every figure below was confirmed unchanged from the
13:55 reading except the test counts, which R7.1 moved. **The e2e row carries its own older
date.** Each row is responsible for saying when it was taken; where one does, believe the
row, not this line.*

| Thing | Value |
|---|---|
| Tests | **1348 pass, 0 fail**, 112 files. **Wall time varies by 4x on the same tree — 135 s to 510 s observed**; not a regression signal, do not chase it. The `expect()` total drifts a little between runs too (**4296** observed). `typecheck` and `lint` clean. **Zero `prisma:error` blocks** in a clean run, down from twelve (R4.3 + R4.6). **Nothing pins this table** — `readme-counts.test.ts` reads `README.md` and only `README.md`, so it pins the same 1348 *there*; the 112 is pinned nowhere. If these drift, no test fails. Re-measure. |
| e2e | **13 passed** (measured 2026-09-07, not re-run since). `bun run test:e2e` is **safe** — see § 5. |
| Production DB | sha256 `0d304ee79ad3b06adb0b89542a8906bf706f85868ae56035b8c600e3f9083cdb`, 884 736 bytes, app stopped — **re-measured 16:33 on 2026-09-11**, after R7.1's migration AND R7.2's renames. `integrity_check` ok, 0 FK errors, **15 migrations, none pending**, **18 `Product`, 18 `OrderItem` and 28 `ZReport` columns**, `schema_version` 171. *(It moved twice on 2026-09-11: `c265e6ff…` → `51552364…` at the migration, → this at the renames. The SIZE never moved through either. Expect it to move again — the operator edits the catalogue between sessions.)* |
| How to check it | **A sha is only a baseline while nothing is running** — a signed-in session still writes `Session.lastActivityAt`, at most once a minute since R4.6. If the app may be up, check *structure*, not the hash. **File SIZE is not evidence**: an `ADD COLUMN` leaves it unchanged, measured. The sha256, the mtime and `PRAGMA schema_version` are what move. |
| Trading tables | **All zero.** Order, OrderItem, Payment, Receipt, Refund, Shift, ZReport, FiscalEvent, GrandTotal, DailyClose, MonthlyClose, AnnualClose, CashMovement, Customer, Table. |
| Fiscal counters | `0 / 0 / 0 / 0` (receipt / shift / Z / event). Journal **empty**. |
| Fiscal chain | **Empty and UNKEYED**, which is correct here. Arming is R6.2, after R6.1's reset and never before. |
| Catalogue | **84 products in 14 categories.** **9 menus composés · 25 slots · 9 whitelist rows · 7 option rules.** 17 active drinks in `Canette`/`Bouteilles`, all resolving to 5,5 % à emporter and 10 % sur place. **NO two products share a name** since R7.2 (2026-09-11) — the three pairs became `Coca`/`Coca 1.5L`, `Fanta`/`Fanta 1.5L`, `Orangina`/`Orangina 1.5L`. **Longest name 26 characters**, against the 36 at which a ticket line would wrap. **80 products on the till grid**: 84 less the 3 hidden components R3.3 created (`showOnPos = 0`) and `5 nuggets test`, which is still `active = 0` (L-81). **0 names carry stray whitespace** since R4.4. |
| Accounts | Two: `manager` (MANAGER) and `admin` (SUPER_ADMIN, the developer's). `CASHIER` was removed from the product. Both must re-enter their own PIN for a discount above 20 % and for **every** refund. |
| Journal mode | `delete`, not WAL — the guard refuses WAL on this OneDrive path, deliberately. It will switch to WAL the first time the database sits under a non-synced root. |
| Settings | `factice=true`, `printerEnabled=true`, `printerHost=""`, `businessDayCutoffHour=5`. **`printerConnection` and `printerQueue` are both absent**, so BOTH come from `DEFAULT_SETTINGS` — and since 2026-09-11 that means **`usb`**, not `network`. So production's effective connection is already USB and a print attempt now answers *« Choisissez l'imprimante Windows »* instead of *« Renseignez l'adresse IP »*, which was never an answer available to this restaurant. **Only the queue is left**, and that is R6.4. |
| Backups | **TWO verified restorable backups** (3 files, 49 MB): 2026-09-10 20:42 and 2026-09-11 12:40 UTC, sharing one media archive; **both decrypted to verify**, not assumed. R0.2 deleted the nine pre-rotation files. **`BACKUP_LOCATION` set 2026-09-11** to `~/OneDrive/Desktop/HibaPOS-Sauvegardes`; both were copied there sha-verified and the copy **decrypts** — which also proves `BACKUP_ENCRYPTION_KEY` survived that day's `SESSION_SECRET` rotation, by use and not by argument. |
| ⚠ Backup gap | **Still open, now for two reasons.** The Desktop is inside OneDrive so it does sync off the machine — but **OneDrive was not running** when this was set. And **both copies predate the R7.1 migration and the R7.2 renames** (14 migrations, 25 `ZReport` columns, `Coca`/`Fanta`/`Orangina` still doubled), so they hold the superseded catalogue. **A FRESH backup is the outstanding action**, and it is the operator's — `createBackup` is a production write. |
| Other copies | `../db-snapshots/` holds **15 plaintext databases**, 12 MB: 14 loose snapshots plus `real-data.db` in `real-data-backup.pre-cents-port.2026-09-01T17-13-56Z/`, which still carries a `-wal`/`-shm` pair. Also `r31-acceptance/`'s fingerprints. *(This row inventories every unencrypted copy of real catalogue data on this disk; it said 13 until 2026-09-11.)* The newest, `custom.db.before-20260911160000_zreport_given_away-2026-09-11`, is R7.1's restore point — sha256 `c265e6ff…25ea28`, the last pre-migration state. **Keep it.** `r71-acceptance/` holds only fingerprints; its rehearsal copy was deleted. `../HibaPOS-docs-archive/` holds **three** files: the two R0.3 would have destroyed, plus a `README.md` mapping which runbook sections are live. **Read it before Phase 6, not the runbook cold** (§ 1). |

---

## 5. WHAT IS SAFE TO RUN

| Command | Safe? |
|---|---|
| `bun run test` | ✅ Unit + integration, Bun runner, temp DB. Carries its own `--timeout 30000`. |
| `bun run typecheck` | ✅ `tsc --noEmit`, covers `scripts/`. |
| `bun run lint` | ✅ `eslint .`, covers `scripts/`. |
| `bun run build` | ✅ Requires `SESSION_SECRET` in env or it throws at import. |
| `bun run test:e2e` | ✅ **Safe, and verify it stays so.** Three properties make it safe: `tests/e2e/env.ts` refuses a database path outside the OS temp directory *before* anything is created; `playwright.config.ts` passes `next start` an explicit env, so the real `.env` never loads; and `00-disposable-database.spec.ts` runs first and fails the suite if a production operator answers `GET /api/auth/profiles`. **If any of the three is gone this suite is dangerous again** — it used to write orders and sealed Z reports into the production chain. |
| `bunx vitest` / `npx vitest` | ❌ Refuses to run, by design (`vitest.config.ts` throws at import — this one already defends itself). |
| `git clean` | ❌ Never. |
| `bun run db:reset` · `db:push-force` · `db:push` · `db:seed` · `db:migrate` · `db:deploy` | ❌ **Never, from this directory.** They read `.env`, whose `DATABASE_URL` is an absolute path to `db/custom.db` — **the live catalogue**. `db:reset` drops and re-seeds; `db:push-force` is `--accept-data-loss`. **Nothing guards any of them.** Schema changes go through `scripts/apply-migration.ts`. Fine on a scratch copy with **both** env vars overridden. |
| `bun run dev` · `.zscripts/dev.ps1` · `bun run start` | ❌ **Never, from this directory** — same reason. `dev.ps1` also runs `db:deploy` and `db:seed` when `db/custom.db` is absent. Use `bunx next start` on the scratch copy (§ 2). |

*Added 2026-09-11: until then this register listed no refusal for any command that could
actually destroy the catalogue.*

**The operator scripts. Every one is a DRY RUN unless given `--apply`, takes its own
sha-verified restore point into `../db-snapshots/`, and verifies itself afterwards instead
of trusting an exit code.**

> **✅ here means « fit for purpose », not « harmless ».** They derive their target from
> `DATABASE_URL` — the live database — and with `--apply` they write to it. The operator's
> to run. A different ✅ from `bun run test`.

| Script | What it is for |
|---|---|
| `scripts/apply-migration.ts` | ✅ **How a migration is applied here from now on.** Refuses if any node/bun process is running or a `-wal`/`-shm`/`-journal` sits beside the database; **names the migration it actually applied**; ends `✅ APPLIED AND VERIFIED` or `❌`. It exists because `prisma migrate deploy` prints the same green banner whichever migration it ran, and that was misread twice. `--expect <fingerprint.json>` diffs the result against a rehearsal. |
| `scripts/trim-catalogue-names.ts` · `scripts/build-box-menus.ts` | ✅ **Both applied** (R4.4, R3.3) and idempotent — re-running prints `NOTHING TO TRIM` / « déjà un menu composé ». `REMEDIATION_DONE.md` has what each checks first. |
| `scripts/delete-product.ts` | ✅ **Hard-deletes ONE product row.** Exists since 2026-09-09 and **has run four times** (four `PRODUCT_HARD_DELETED` rows in the live audit log); 2026-09-11 added `--id` and three refusals. Refuses unless the product is uniquely identified, already inactive, has **no** FK reference (`OrderItem` is `SET NULL`, `ComboSlot` `CASCADE` — SQLite would have allowed the damage), is in **no sealed payload** — the guard no schema can express — and the restore point verifies. Each refusal exercised on a copy. |
| `scripts/pre-golive-reset.ts` | ⚠ **R6.1. Runs ONCE, and never after a genuine sale.** The operator's, not Claude's. |

---

## 6. THE WORK

Status values: `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED` · `OPERATOR` · `ASK FIRST`.
A `DONE` row leaves this file for `REMEDIATION_DONE.md`.

*Phases 0-5 and 7 are complete; their records are in `REMEDIATION_DONE.md`. Nothing from
them is outstanding except the three items under § 1 « Awaiting the operator ». Their five
blocks were moved out on 2026-09-11 — **Phase 6 is the only work that remains.***

### Phase 6 — Before the first real sale

*Not deployment — deployment is the Tauri phase and has its own plan. **These five** apply
whatever the app is packaged as. **R6.1, R6.2 and R6.3 are fiscal and their order is not a
preference** — arming the chain key before the reset makes the reset refuse. **R6.4 (printer)
and R6.5 (a second volume for backups) are technical, not fiscal**, and can be done at any
point before the first sale. (This line said « these four are fiscal » from when the phase
held four rows.)*

| ID | Status | Task |
|---|---|---|
| **R6.1** | `OPERATOR` | **Run `scripts/pre-golive-reset.ts --apply` — once.** *(Step-by-step in `../HibaPOS-docs-archive/runbook-complet.md` **§ 6d**; §§ 6a-6c are its prerequisites, and § 6b is R6.5.)* It empties the fiscal journal, deletes every order, receipt, shift, Z report, close and archive, and resets the counters to zero. It **keeps** the catalogue, the users, the settings and the audit log. Everything rung up before it is deleted by it — that is why testing comes first. **This runs once, and never after a genuine sale**: from that point the journal is append-only and clearing it is precisely the deletion `docs/attestation-conformite.md` states is impossible. |
| **R6.2** | `OPERATOR` | **Arm `FISCAL_CHAIN_KEY` — after R6.1, never before.** Every fiscal fingerprint becomes HMAC-SHA-256 instead of plain SHA-256. Arming onto a journal that already holds unkeyed events is refused by design, because a half-keyed chain verifies under neither mode. **Lose this key and the journal cannot be verified at all** — back it up with the same care as `BACKUP_ENCRYPTION_KEY`, and not only on the machine that holds it. |
| **R6.3** | `OPERATOR` | **Turn FACTICE off.** `factice` is `true` today, which stamps every ticket *SIMULATION* and flags the journal row. Off is the point every rule tightens: from then on every sale is real. |
| **R6.4** | `OPERATOR` | **Configure the printer — INSTALL-DAY, IN FRANCE.** Since 2026-09-11 `printerConnection` defaults to **`usb`**, so the only settings work left is **picking the queue** from the list in Réglages; `printerEnabled` is already `true` in production and was never off. **The procedure is `../HibaPOS-docs-archive/runbook-complet.md` § 4a** — the `pnputil` export/install commands and the hardware id `USBPRINT\SUNSOWTP-800036C` from `sunso.inf`, the only place the steps are written down. Read that archive's `README.md` first. **A queue whose `PortName` is not `USB00x` prints nothing and reports success** — check it before trusting it. |
| **R6.5** | `OPERATOR` | **Point `BACKUP_LOCATION` at a second volume.** Unset, backups land beside the database on the same disk, so one failure takes the data and every copy of it together. |

**Not here, deliberately:** the till hardware, the Windows install, the kiosk launcher, the
pre-built tree, the update path. All of it belongs to the Tauri v2 migration.

## 7. OPEN FINDINGS

Anything found outside the current item goes here with an ID, not fixed in place (safety
rule 1). Audit IDs are never renamed.

| ID | Severity | Finding | Owner |
|---|---|---|---|
| **L-88** | Low | The day's paper slip does not print what was given away. `DailyClose` SEALS `givenAwayCount` and `givenAwayProducts` (`fiscal.ts:357`); `day-close-ticket.ts` has no line for either, though it prints refunds and cash movements under `if (count > 0)` — the same « no permanent zero » rule a give-away line would follow. The sealed record carries the figure; the document the operator files does not. Found during R7.1; omission or decision is written down nowhere. | none |
| **L-84** | Low | `showOnPos` is a display rule, not a guard: `orders/route.ts` checks only `active`/`available`, so a request naming a hidden product directly is still booked. Not a fraud vector (the till is the only client, at the real catalogue price), but « cannot be sold alone » is true of the interface, not the API. Pinned by `hidden-product.test.ts`, so closing it is a decision. | none |
| **L-81** | Cosmetic | A test product, `5 nuggets test` (Croustillants, 5,00 €), was created in the live catalogue on 2026-09-10 and left `active=0` / `available=0`. Invisible on the till and harmless, but the catalogue is meant to be real work only — and it is now inside the verified backup. Delete it with the operator, or keep it deliberately. | none |
| **L-75** | Deferred | The app cannot run on a 32-bit Windows: both Prisma engines are `machine 0x8664` and Bun is x64/ARM64 only. **Carried to the Tauri v2 phase**, where the runtime and the packaging are both decided. No software fix at this layer. | none |
| **L-05** | Deferred | `output: "standalone"` was dropped; whether to reinstate it deliberately is open. Still true — no `output` key — but deferred to nothing. **Carried to the Tauri v2 phase**, like L-75: its premise (a Windows-till Node install) is retired and packaging is decided there. | none |
| **L-11** | Deferred | Two payment tolerances disagree (`paid < total - 1` vs `- 0.01`, both on integer cents); dialog resets run on uncleaned timers. `src/components/pos/payment-dialog.tsx` — timer `:93`, `- 1` at `:152`, `- 0.01` at `:451`. | none |
| **L-47** | Open | The app renders its login screen even with a valid session **in the in-app browser pane**, so no browser walkthrough reaches an authenticated view. Four data points; never reproduced outside that pane. | none |
| **L-51** | Low | `backup.ts` reads the whole uploads archive into memory to encrypt it — **49 293 837 bytes across 147 files**, measured 2026-09-11, not the "few MiB" its comment once claimed. The figure grows with the catalogue; `backup.ts:14-27` carries its own dated measurement and drifts the same way. | none |
| **L-52** | **External** | `LOI n° 2026-534 du 25 juin 2026, art. 87` requires archived data restituted in a format set by the administration, in force 27 June 2026. **No format has been published.** Nothing to build until one exists. | none |

---

## 8. EXTERNAL — not ours to close

**This table is a summary, not the register.** The numbered register of open questions is
`docs/conformite-isca-map.md` § 9, which carries ids this table does not — **V-08** (the
status flag on a refunded order, and the perpetual total) and **V-10** (a third-country
éditeur: the text permits it, the practice is unknown) among them. When the two disagree, the
map is the one that is maintained.

**Nothing in this project, and no test result it produces, is evidence of French fiscal
compliance.** The attestation regime is the operator's, and `docs/attestation-conformite.md`
cites art. 441-1 of the code pénal: a false attestation is a criminal offence.

| ID | Question |
|---|---|
| **V-01 / C-22** | Does an unsigned hash chain suffice for the *inaltérabilité* condition, or is an electronic signature required? |
| **V-02** | Is the annual archive's format acceptable? See also L-52 — a format may now be prescribed. |
| **V-03** | Is anything further required on a ticket — a per-ticket hash or signature, as NF525-certified software prints? The law names none. |
| **V-13** | Must the automatic cash-drawer opening be journalled? *(This question was filed under V-03 here until 2026-09-11; `docs/conformite-isca-map.md` § 9 has always had it as V-13.)* |
| **VAT-METHOD** | **How a fixed menu price is divided between 10 % and 5,5 %.** The rates themselves are settled and live; the division is the open claim. The software apportions by **TTC** standalone catalogue price — defensible, supported by BOFiP's « valeur de marché, **pour le consommateur** », and it errs by over-declaring (measured: 2,16 € vs 2,14 € on Menu Eco à emporter). An HT-weighted alternative is recorded in § 8 of the policy document. **The operator's accountant should confirm the basis in writing.** |
| **V-07** | A full day of trading on the real hardware. **Not external and not un-ownable** — R6.1's row makes it a prerequisite, and `../HibaPOS-docs-archive/runbook-complet.md` § 7 is its written procedure. It sits here because only the restaurant can perform it, not because nobody owns it. |

---

## 9. ANSWERED DECISIONS — do not re-open these

Kept as one-liners so nobody re-litigates them. Full rationale is in git history
(`git show HEAD~1:REMEDIATION_RECORD.md` → *Answered design decisions*).

| ID | Decision |
|---|---|
| DD-01 | ESC/POS over raw TCP:9100 as primary, behind a transport interface; USB RAW added later. |
| DD-02 | ~~Data lives at `C:\HibaPOS\data`.~~ **Never implemented, moot.** `HIBAPOS_DATA_DIR` unset, so `paths.ts` returns the working directory; `:31` keeps that path only as `RECOMMENDED_DATA_DIR`. Where data lives is the Tauri phase's decision. |
| DD-03 | No sealed row carried the wrong VAT key — the premise was an audit assumption. |
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
| DD-19 | Step up with the operator's **own** PIN — above the discount threshold, and on every refund. |
| DD-20 | A given-away order is reported **separately**, never as a sale. |
| DD-21 | The four non-fiscal reports adopt the fiscal rule: a period books the corrections it issued. |
| DD-22 | `GET /api/users` and `GET /api/backups` are SUPER_ADMIN only. |
| DD-23/24 | The trading day (`clôture du jour`) exists, with a configurable cut-off defaulting to **05:00**. |
| DD-25 | The fiscal chain may be keyed (HMAC-SHA-256) off a secret held outside the database. Armed only on an empty journal. |
| **2026-09-10** | **The client trial is dropped.** No copy ships before the final version; § 6 runs once. |
| **2026-09-10** | **VAT allocation stays TTC-weighted**, documented as a market-value method, pending the accountant. |
| **2026-09-10** | **The app ships as a Tauri v2 native application.** Deployment is therefore out of this plan entirely: `docs/mise-en-service.md` and `.zscripts/README-windows.md` are retired, and the till, the kiosk launcher and the 32-bit hardware problem go with them. Tauri gets its own plan when this one is closed. |
