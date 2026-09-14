# HibaPOS France — Remediation Plan

**This is the only plan. Read it top to bottom before touching anything.**

Completed work lives in **`REMEDIATION_DONE.md`**. This file only ever shows outstanding work.

---

## 1. CURRENT STATUS

**Overall:** NOT READY FOR PRODUCTION, and **not trading** — the fiscal journal is empty and
every trading table is at zero.

> ### ▶ CURRENT TASK — **none of § 6 is mine any more**
>
> **§ 6 opens with the execution order. Follow that, not the order the tables print in.**
>
> **The execution order is finished** and Phase 8 is running in its own order. R8.0
> (`f68dcf6`), R9.6 (`f918578`), R8.1 (`622411c`), R9.2 (`1d010b8`) and R8.2 (`67d0347`) are
> done.
>
> **R8.2's MIGRATION IS APPLIED** — `Order.idempotencyKey`. This block said « rehearsed and not
> applied » until 2026-09-14, when it was measured read-only against a copy of the live
> database: `_prisma_migrations` holds it, finished **2026-09-13**. Recorded as **L-195**,
> because § 1 had been telling every session otherwise.
>
> **PHASE 8 IS COMPLETE** (2026-09-13) — seven batches, R8.0 through R8.6, and every
> group-A finding the audit raised. **PHASE 9 IS OPEN** on the operator's word. **R9.1 is
> done** (`d634faf`): the printer refuses to call a print a print when the helper was never
> there, the customer's paper IS the sealed `Receipt.content`, and the day's closing slip
> both prints and carries what was given away — **R6.4's software blocker is cleared.**
> **R9.3 is done** (`a08afbe`): no failure leaves a readable copy of the database behind,
> the retention prune journals before it deletes, a missing media directory is no longer
> reported as « no images », and a backup missing a unique index is refused. **R9.4 is done**
> (2026-09-13): a malformed secret says so in French instead of answering an empty 500,
> `approvals.ts` no longer throws at import on an install with no `.env`, and a deleted
> secret store cannot silently orphan the backups. **L-115 is closed, so R6.2 is unblocked.**
> **R9.5 is done** (2026-09-14): a locked-out operator can get back in, the published PINs are
> refused where a PIN is set, and the login screen says why it will not open. **The operator
> settled the bootstrap on 2026-09-13** — admin stays `123456`, the manager's is chosen or
> generated and shown once. **R9.7 is done** (2026-09-14): eleven findings, and the three
> High ones were all « a test that cannot fail against the bug it names ». The fiscal-journal
> guard, the WAL guard and the payment check now all go red when broken. **R9.8 is done**
> (2026-09-14): a null `OrderItem.vatRate` is no longer silently 10 % — the aggregation
> refuses it and the ticket says the rate is unknown — and every FK-less id column explains
> itself. **L-185 closed with it**: the four CRLF files were re-checked out. **R9.9 is done**
> (2026-09-14): the catalogue import refuses a file exported under an older schema instead of
> filling the new columns with defaults — the mechanism that carries this catalogue to France.
> **R9.10 is done** (2026-09-14) and **PHASE 9 IS COMPLETE** — all eight batches, and every
> group-B finding the audit raised. The three touch targets under 44 px are fixed and the guard
> that could not see them is widened, the step-up PIN has a keypad, the topbar's stopwatch
> measures the caisse instead of nothing, and zod stops printing TypeScript at the operator.
> **L-132 was settled by the operator on 2026-09-14**: the Z-close cash field starts empty and
> the seal waits for a figure.
>
> **`docs/INVARIANTS.md` gained two paragraphs** on the operator's instruction the same day —
> L-134's pricing rule and L-129's null-`vatRate` rule. Both had been drafted and held since
> R8.5 and R9.8, because that file is theirs.
>
> **R10.1 is done** (2026-09-14). The client bundle no longer carries Prisma — largest chunk
> **501.7 KB → 376 KB**, total client JS **2.68 MB → 2.3 MB**, measured in the built artifact —
> `bun run build` runs in the fast CI job, two dead devDependencies are gone, and `db.ts` stops
> claiming the `DATABASE_URL` query string sets its pragmas.
>
> **R10.2 is done** (2026-09-14), and with it **every row in § 6 that was a session's to do**.
> The index names all fifteen scripts, `apply-migration.ts` **fails** a run whose `--expect`
> fingerprint it cannot read instead of printing « skipped » under a tick, the README's
> first-boot note no longer collides with § 5's safety register, and `pre-golive-reset.ts`
> states a true reason for the one ordering it can never take back. **Both operator files were
> brought and approved the same day** — `CLAUDE.md`'s hand-over command now reads `--expect
> <path to the rehearsal's fingerprint JSON>`, and `docs/INVARIANTS.md` names the three
> `/api/tables` routes a cleanup would otherwise have deleted out from under a test.
>
> **WHAT IS LEFT IN § 6 IS ALL `OPERATOR`** — R6.1 … R6.5 before the first real sale, and
> R10.3, which belongs in the accountant's envelope. **That is not the same as finished.**
> R10.2 opened **L-191** (Medium, `prisma/seed.ts:19`): the CLI seed path still falls back to
> `111111`, the PIN `POST /api/seed` has refused since R9.5, and `scripts/README.md` is what
> points a first boot at it. **L-191 IS FIXED** (2026-09-14, its own item — no row to attach it
> to): that PIN is now generated, re-checked and shown once, and a published default in
> `SEED_MANAGER_PIN` is refused before a row is written. It opened **L-192** (Low), which needs
> the operator's word first. **§ 7 stays closed** — their call, the plan being near its ceiling.
>
> **Two things are waiting, and neither is a batch.**
>
> 1. **One paragraph for `docs/INVARIANTS.md`**, drafted verbatim in R8.5's done entry and
>    held because that file is the operator's. It records L-134's answer: a size supplies the
>    price sur place and à emporter alike.
> 2. **Room in this file**, eventually. Applying the migrations retired their operator item and
>    took it back to 39 033 of 40 960 — comfortable for a batch or two, not for a phase. §§ 3
>    and 4 went to `docs/` for this reason and the easy trims here are now spent.
>
> *(**The two migrations were APPLIED on 2026-09-13** — by the session, at the operator's
> explicit instruction, they being away from the machine. Verified against the rehearsal and
> recorded in `REMEDIATION_DONE.md`. `CLAUDE.md`'s rule that this is the operator's action is
> unchanged; that was a one-off, not a standing waiver.)*
>
> **R6.3 and R6.4 are both unblocked now** — R8.1 cleared the settings 403 and R9.1 cleared
> the printer. They are `OPERATOR` rows and neither has been done; being reachable is not
> being finished.

**Phases 0-5 and 7 are COMPLETE**, with all four operator items and all three migrations
applied. What each did, how it was verified and what it cost is in `REMEDIATION_DONE.md`;
**nothing from them is outstanding**, and this file does not repeat them.

**Three phases are open.** Phase 8 closed on 2026-09-13.

- **Phase 6** — the fiscal go-live, five `OPERATOR` rows. **R8.1 unblocked R6.3** (2026-09-13,
  `622411c`) and **R9.1 unblocked R6.4** (2026-09-13). Row-by-row status below.
- **Phase 8** — money and the fiscal record. **COMPLETE 2026-09-13**, all seven batches.
- **Phase 9** — fix before the app is called complete. **COMPLETE 2026-09-14**, all eight batches.
- **Phase 10** — the leftovers no other batch owns. Three rows (group C).

**Phases 8-10 come from the audit.** Six read-only passes and a seventh that consolidated
them, 2026-09-12: **`docs/audit/FINDINGS.md` holds 94 findings, L-89 … L-182**, in two views —
by severity, and by the file the work lands in. Groups **A** (7) · **B** (39) · **C** (36) ·
**D** record and leave (9) · **E** undecidable until packaging (3). § 6 carries the ids;
**the detail is in FINDINGS.md and is not repeated here.** § 7 is unchanged at the nine
findings that predate the audit. Nothing found stops a sale being *rung*: every money path the
audit exercised produced screen figures matching the database to the cent.

### Phase 6 — where each row stands

*Measurements and the runbook mapping are in `REMEDIATION_DONE.md` under « PHASE 6 OPENED ».
`../HibaPOS-docs-archive/README.md` maps `runbook-complet.md`; **its § 6a/6b/6c are stale**
(scheduled tasks, `C:\HibaPOS-secrets-backup\`, and a claim the backups are unrestorable).*

- **R6.1** reset (§ 6d) — **would delete 0 rows**: all sixteen tables on the script's
  `DELETION_ORDER` are empty and the counter is already `0/0/0/0`. **A decision, not a step.**
  Irreversible; runs once, never after a genuine sale.
- **R6.2** arm the key (§ 6e) — `FISCAL_CHAIN_KEY` absent, so the reset's guard 1 passes.
  An empty journal is armable at any time, so arming EARLY buys nothing and creates a secret
  to transport. Follows R6.1. **A BUTTON since 2026-09-11** (`POST /api/setup/chain-key`), not
  a `.env` edit: it refuses unless the journal is empty, and shows the key once.
- **R6.3** FACTICE off (§ 6f) — `factice=true`. Last of the three. **UNBLOCKED 2026-09-13 by
  R8.1** (`622411c`), which carried both halves: the MANAGER can now save it (DD-26), and a
  save that omits the key no longer performs this row by accident (L-93). **DD-27 applies from
  here on**: once the journal holds a non-factice event, only a SUPER_ADMIN can turn the stamp
  back on. Still the operator's action, and still last of the three.
- **R6.4** printer (§ 4a, then § 4) — **the printer is in France; not doable from here.** This
  machine's `SUNSO WTP-800` queue sits on `COM1:`, `Error`, with no `USBPRINT` device: a
  developer artefact. § 4a — a `COM1:` queue « prints nothing and reports success ».
  **L-101 is fixed** (R8.1, 2026-09-13) so the MANAGER can now pick the queue, but **L-96 is
  the same sentence reached another way — **fixed by R9.1 on 2026-09-13**: the helper is
  resolved from `appRoot()`, a missing one is refused by name, and exit 0 with anything on
  stderr is a failure. Nothing is written as `PRINTED` that was not printed. **Choosing the
  queue is now the whole of what is left**, and it is the operator's.
- **R6.5** — the restaurant's `BACKUP_LOCATION` belongs to its install; **this** machine's is
  set (`docs/BASELINES.md`). See its backup-gap row for what is still outstanding.

### Awaiting the operator


- **L-171's migration, rehearsed 2026-09-14 and NOT applied** — `Refund.itemsJson`, one
  nullable column recording WHICH ITEMS a refund was for. With the app stopped:
  `bun scripts/apply-migration.ts --apply --expect ../db-snapshots/r171-acceptance/fp-r171-after.json`.
  Dry run without `--apply`. **`--expect` takes that PATH, not a migration name**, and since
  R10.2 a path it cannot read **fails** the run instead of printing « skipped » under a tick.
  **Rehearsed on a copy and diffed**: `Refund` gains one column at the end, `_prisma_migrations`
  17 → 18, `integrity_check` ok, **zero FK errors and nothing else moved**. Nothing is blocked
  by the wait. *(R8.2's was the previous entry here and is **applied** — § 1 and L-195.)*
- **Delete `5 nuggets test` (L-81), prepared and rehearsed.** With the app stopped:
  `bun scripts/delete-product.ts --id cmtvwzr050004n368crvp0mw3 --apply`. Dry run without
  `--apply`. Rehearsed on a copy 2026-09-11: 84 → 83 products, 0 FK errors, `integrity_check`
  ok, and a fingerprint diff over every table showing that one row and nothing else.
- **A FRESH verified backup, off this machine.** The oldest open item in the plan and the
  only one about losing data rather than getting something wrong. The two backup rows in
  `docs/BASELINES.md` say exactly where it stands and what is left.
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

**Last updated:** 2026-09-13 — **PHASE 8 IS COMPLETE.** **R8.6 done** (`88ea4c3`): a day whose only event was a refund can no longer be skipped — its absence became permanent once a later day was sealed — the premature-close refusal agrees with its own noun, and « a close equals the sum of its Z reports » is narrowed to the true statement and finally has a test, with the straddling-shift caveat written up for the accountant. **L-153 closed early** out of R9.7, because R8.6 made it fail. Seventeen task rows became sixteen and Phase 8's section left the file. Earlier the same day — **R8.5** (`6ccc13f`): a supplement carries its own VAT
rate and gets its own line when that rate differs from the one it is added to; the add-on
quantity is snapshotted and bounded; a short `tendered` is refused rather than sealing a
negative change; and **L-134 is answered — sur place and à emporter cost the same, so a sized
product's `Product.price` cancelling is intended**, pinned by tests, with the
`docs/INVARIANTS.md` paragraph drafted and HELD for the operator. Eighteen task rows became
seventeen. **A SECOND MIGRATION IS PENDING** and the apply command changed — see *Awaiting the
operator*. Earlier the same day — **R8.4** (`31ebd9d`): report periods sit on the
trading-day cut-off, so a filed VAT figure measures the same window the sealed close measured;
**the operator decided to snap AND say so**, and the screen states the boundaries the server
returned rather than the dates typed into the boxes. Nineteen task rows became eighteen.
Earlier the same day — **R8.3** (`6a580dd`): a category save reconciles its
option groups by id instead of replacing them, so the seven menu rules that pin `Pizzas →
Taille` survive it, and a save that would remove one is refused in French naming the menu.
**The client had to be fixed in the same commit** — it sent no ids at all, so match-by-id
alone would have changed nothing. Twenty task rows became nineteen. Earlier the same day —
**R8.2** (`67d0347`): a double-tap no longer books the
sale twice, a lost response no longer re-rings it, and the OFFERT tender stops crashing the
POS. **Its migration is rehearsed and awaits the operator** (see above). Twenty-one task rows
became twenty. **L-185 recorded, and L-154 escalated from « has not yet bitten » to bitten.**
Earlier the same day — **R9.2** (`1d010b8`), and with it **the whole execution
order**: the startup migration gate no longer reports a half-applied schema as `UP_TO_DATE`,
a deploy that says it failed is a failure, and every startup failure leaves a row rather than
a stdout line. Twenty-two task rows became twenty-one. Earlier the same day: **R8.1**
(`622411c`) — the settings defaults agree and the write splits by field, so **R6.3 is
reachable from the till** — and **R9.6** (`f918578`) —
the authorization map distinguishes a guard from a no-op — which recorded **L-183 and L-184**
in a new *Found after the audit* section of `docs/audit/FINDINGS.md` that keeps the audit's 94
(L-89 … L-182) a closed set. 2026-09-12: **R8.0** (`f68dcf6`), and the audit was phased into
Phases 8-10. § 7 unchanged at nine.

## 2. HOW TO WORK HERE

### The loop — every item, without exception

1. Do the work in the item. **Only** what is in the item.
2. `bun run test` · `bun run typecheck` · `bun run lint` — all three, all green.
3. **Prove the new test FAILS against the old code, before you commit anything.** Revert the
   fix — one property at a time, in both directions, never two together — re-run, confirm the
   new test goes red, then restore from a copy taken **before** the revert. A test that stays
   green under the revert is proving nothing: either the revert was a no-op or the test does
   not assert what it is named for. **This is not optional and it is not the same as step 2.**
   *(Made a numbered step 2026-09-12. It was already in « the nine methods » below, and the
   audit still found four tests that cannot fail against the bug they are named for — L-121,
   L-122, L-123, L-126. Green is not evidence; red-then-green is.)*
4. Prove the fix actually applies. A unit test on an extracted rule proves the rule, **not
   that anything calls it** — this project has shipped that gap three times. Test what is
   *booked* and test what the client *sends*.
5. Confirm nothing else broke: the test count should move only by tests you added, and
   `bun run test` must report **0 fail** with no new `prisma:error` block.
6. **Say, in the commit message, what you reverted and what went red.** One line. It is the
   difference between « the tests pass » and « the tests would have caught this ».
7. Commit. One item, one commit (or a small reversible series).
8. **Push.** The operator has standing authorisation for this — it is part of the loop.
9. Move the item's row from this file to `REMEDIATION_DONE.md` with its commit sha and how
   it was verified. Update *Current task* above.
10. Stop. Do not roll into the next item without the operator's go-ahead.

**And stop again at every phase boundary.** Finishing the last item of a phase is **not**
licence to open the next one. Report what the phase did, what it cost and what it left
behind, and wait for the operator to say start. *(Added 2026-09-10, after Phase 1 completed
and Phase 2 was opened in the same breath. Step 10 already forbade it item-by-item; a phase
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
  scripts/apply-migration.ts --apply --expect <path to the fingerprint the rehearsal wrote>`**
  — **a PATH, never a migration name** (L-166) — not a bare `bunx prisma migrate deploy`. *(Phase 2's went out as the bare command and was reported applied twice
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

## 3. HARD INVARIANTS — moved to `docs/INVARIANTS.md`

**They did not go away. `docs/INVARIANTS.md` is now the file, and it is required reading
before you change anything.** It holds all of it: money in integer cents end to end, sealed
rows never re-serialised, `apportion` as the only splitter, identity over label, the database
and process rules, the printing and interface rules, the secrets rules, and — the half a
dead-code sweep gets wrong — **everything deliberately retained that looks unused.**

*Moved 2026-09-11, on the operator's instruction. It was the only part of this plan that was
not outstanding work, it is the part that must outlive the plan, and it was 8 442 of the
40 960 bytes a session is asked to read before starting.*

## 4. CURRENT BASELINES — moved to `docs/BASELINES.md`

**The numbers did not go away.** `docs/BASELINES.md` is now the file: tests, e2e, the
production database and how to check it, the trading tables, the fiscal counters and chain,
the catalogue, accounts, journal mode, settings, backups, the backup gap, and the inventory of
every unencrypted copy of real catalogue data on this disk. **Re-measure before trusting any
of it** — that instruction moved with the table and is the first line of the file.

*Moved 2026-09-12, on the operator's instruction, for the two reasons § 3 moved on 2026-09-11:
it is not outstanding work, and at 5 997 bytes it was crowding the 40 960 a session is asked to
read before starting. The immediate cause was § 6's twenty audit batches, which did not fit
otherwise.*

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
them is outstanding except the three items under § 1 « Awaiting the operator ».*

> **Three phases are open**, and they are not independent. Phase 6 is the fiscal go-live.
> **Phases 9 and 10 are what is left of the 2026-09 audit, phased 2026-09-12** from
> `docs/audit/FINDINGS.md`'s *View B — by area*, because the file a fix lands in is what a
> batch is here. Every row below names its `L-` ids and nothing else: **the detail is in
> FINDINGS.md and is not repeated here**, which is what keeps this file inside its ceiling.
> Groups D and E got no rows.

**ORDER.** Every dependency that reordered this list is discharged — the four steps and why
each existed are recorded in `REMEDIATION_DONE.md`. What is left is **Phase 9, then Phase 10,
in the order the tables print**, and **Phase 6** alongside them: **R6.3 and R6.4 are both
reachable** since R8.1 and R9.1.

### Phase 6 — Before the first real sale

*Not deployment — deployment is the Tauri phase and has its own plan. **These five** apply
whatever the app is packaged as. **R6.1, R6.2 and R6.3 are fiscal and their order is not a
preference** — arming the chain key before the reset makes the reset refuse. **R6.4 (printer)
and R6.5 (a second volume for backups) are technical, not fiscal**, and can be done at any
point before the first sale. **R8.1 and R9.1 both landed 2026-09-13, so R6.3 and R6.4 are
each reachable — unblocked, not done.***

| ID | Status | Task |
|---|---|---|
| **R6.1** | `OPERATOR` | **Run `scripts/pre-golive-reset.ts --apply` — once.** *(Step-by-step in `../HibaPOS-docs-archive/runbook-complet.md` **§ 6d**; §§ 6a-6c are its prerequisites, and § 6b is R6.5.)* It empties the fiscal journal, deletes every order, receipt, shift, Z report, close and archive, and resets the counters to zero. It **keeps** the catalogue, the users, the settings and the audit log. Everything rung up before it is deleted by it — that is why testing comes first. **This runs once, and never after a genuine sale**: from that point the journal is append-only and clearing it is precisely the deletion `docs/attestation-conformite.md` states is impossible. |
| **R6.2** | `OPERATOR` | **Arm `FISCAL_CHAIN_KEY` — after R6.1, never before.** Every fiscal fingerprint becomes HMAC-SHA-256 instead of plain SHA-256. Arming onto a journal that already holds unkeyed events is refused by design, because a half-keyed chain verifies under neither mode. **Lose this key and the journal cannot be verified at all** — back it up with the same care as `BACKUP_ENCRYPTION_KEY`, and not only on the machine that holds it. |
| **R6.3** | `OPERATOR` | **Turn FACTICE off.** `factice` is `true` today, which stamps every ticket *SIMULATION* and flags the journal row. Off is the point every rule tightens: from then on every sale is real. **Reachable from the till since R8.1** (2026-09-13): the MANAGER may write this field. **One-way after the first real sale** — DD-27 refuses turning it back on once the journal holds a non-factice event, SUPER_ADMIN excepted. |
| **R6.4** | `OPERATOR` | **Configure the printer — INSTALL-DAY, IN FRANCE.** Since 2026-09-11 `printerConnection` defaults to **`usb`**, so the only settings work left is **picking the queue** from the list in Réglages; `printerEnabled` is already `true` in production and was never off. **The procedure is `../HibaPOS-docs-archive/runbook-complet.md` § 4a** — the `pnputil` export/install commands and the hardware id `USBPRINT\SUNSOWTP-800036C` from `sunso.inf`, the only place the steps are written down. Read that archive's `README.md` first. **A queue whose `PortName` is not `USB00x` prints nothing and reports success** — check it before trusting it. |
| **R6.5** | `OPERATOR` | **Point `BACKUP_LOCATION` at a second volume.** Unset, backups land beside the database on the same disk, so one failure takes the data and every copy of it together. |

**Not here, deliberately:** the till hardware, the Windows install, the kiosk launcher, the
pre-built tree, the update path. All of it belongs to the Tauri v2 migration.

### Phase 9 — Before the app is called complete

*The audit's group B, by the file the work lands in, with the group C rows that own no batch of
their own riding along. Order inside the phase is not fixed except where a row says so.*

| ID | Status | Task |
|---|---|---|

### Phase 10 — The batches that own the leftovers

*Group C rows that no Phase 8 or 9 session opens. Cheap, and none of them is urgent.*

| ID | Status | Task |
|---|---|---|
| **R10.3** | `OPERATOR` | **The VAT policy's untabulated menus.** L-170. Not a code batch: extend § 5 of `docs/politique-ventilation-tva.md` to the six menus it does not tabulate, and answer § 8.4 for the three `showOnPos = 0` box components. Belongs in the accountant's envelope beside VAT-METHOD (§ 8). |

**Not phased, deliberately.** Group D (L-171 … L-179, record and leave) and group E (L-180 …
L-182, undecidable until packaging) get no rows. They stay in `docs/audit/FINDINGS.md`, which
says for each what would move it into a fix group.

## 7. OPEN FINDINGS

Anything found outside the current item goes here with an ID, not fixed in place (safety
rule 1). Audit IDs are never renamed.

**These nine are the register as it stood before the audit, and the audit did not close any of
them.** The 2026-09 audit's own 94 findings (**L-89 … L-182**) are in `docs/audit/FINDINGS.md`
and are deliberately **not** listed here: ninety-four rows at this table's density is roughly
37 KB against the 7 KB this file has left under its 40 960-byte ceiling, so placing them all
would break the thing the ceiling protects. FINDINGS.md proposes **seven** rows — its group A —
plus one pointer row, ready to paste. **Placing any of them means editing
`plan-freshness.test.ts`'s pinned count of nine in the same commit**, which is the design.
Five of the nine below were rediscovered by the audit and four gained a new facet, each with
its own new id; FINDINGS.md's « Already known » section maps them.

| ID | Severity | Finding | Owner |
|---|---|---|---|
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

## 9. ANSWERED DECISIONS — moved to `docs/DECISIONS.md`

**They still bind.** Every `DD-` decision — no cashiers, no table service, no LAN, « offert »
as a real tender, the trading day and its cut-off, the keyed fiscal chain, Tauri v2 as the
packaging — is in `docs/DECISIONS.md`, with the same one-line form and the same rule: **do
not re-open them.** `DD-` ids are referenced from source comments and are never renamed.

*Moved 2026-09-12, for the reasons § 3 and § 4 moved: it is not outstanding work, and the
plan had 37 bytes of headroom left after the audit's twenty batches.*
