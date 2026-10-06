# HibaPOS France — Remediation Plan

**This is the only plan. Read it top to bottom before touching anything.**

Completed work lives in **`REMEDIATION_DONE.md`**. This file only ever shows outstanding work.

---

## 1. CURRENT STATUS

**Overall: THE FRANCE TILL IS TRADING, since 2026-10-03.** R6.1 (reset), R6.2 (chain key armed,
saved off the till) and R6.3 (FACTICE off) were done that day, in that order, each step's raw
output read — the detail is at the top of `CLAUDE.md` Part Two. **Its database is now an
append-only fiscal record.** **THIS machine** has never traded: its journal is empty and every
trading table is at zero, re-measured 2026-09-27. What is still open is § 8's `VAT-METHOD`, for
the accountant, and the findings below — none of which stops trading.

> ### ▶ CURRENT TASK — **L-257: the till's task limit read back as `PT0S`, and the task restarted once.**
> Windows' 72-hour task limit killed the till's server on 2026-10-06; restarted the same day, it
> dies again about 2026-10-09 14:10 without the operator's fix. Then: the first genuine ticket is
> **#1** with no FACTICE stamp and the Fiscal screen verifies the chain as keyed; then item 0 —
> export from the till, import here, never the reverse.
>
> **Every batch of Phases 8, 9 and 10 is finished** — read them in `REMEDIATION_DONE.md`, not
> from a second copy here. The only § 6 row that is not the operator's is R10.3. The work now
> comes from the owner, through the operator, and **2026-09-27/28 was four days' worth of it in
> two**: the state audit, the ticket, and three defects that had been on the till since it was
> commissioned. All of it is in `REMEDIATION_DONE.md` under its own entries.

> *(**The two migrations were APPLIED on 2026-09-13** — by the session, at the operator's
> explicit instruction, they being away from the machine. Verified against the rehearsal and
> recorded in `REMEDIATION_DONE.md`. `CLAUDE.md`'s rule that this is the operator's action is
> unchanged; that was a one-off, not a standing waiver.)*
>
>
> ### ▶ WHAT IS WAITING — FOUR ITEMS FOR THE OPERATOR, AND EIGHT OPEN FINDINGS
>
> 0. **THE CATALOGUES HAVE DIVERGED, DELIBERATELY. THE EXPORT IS THE NEXT ACTION.** The owner's
>    menu was finished ON THE TILL, 2026-09-28: Kebab on the Tacos `Viande` group, the **Panini**
>    category with options and products, a saumon fume add-on, two creme fraiche pizzas **with no
>    photographs yet**. The till therefore holds more than 86 products and **no longer prints
>    `a38c95977b5e1122`**; this machine still does, re-measured 2026-10-01. **Export from the
>    till, import here**: the only direction that works, this machine never having traded and the
>    till holding factice events. *(`CLAUDE.md` was corrected on 2026-09-30.)*
> 1. **NOBODY HAS SEEN THE NEW TICKET ON PAPER.** The owner saw the 2026-09-27 ticket and asked
>    for it to be redesigned; **L-249 rebuilt it on 2026-09-30** — framed sections, the client
>    block high on the ticket, the long date, unit prices, `TOTAL À PAYER`, the website in the
>    footer — and **L-248 took every piece of customer data out of the sealed text** with it.
>    Verified end to end through the real renderers, which proves the BYTES AND NOT THE INK.
>    **R6.4's standard is a person in the restaurant looking at paper**, and that has not
>    happened for this layout. **One factice delivery was printed on the till on 2026-10-01; the owner
>    looks at it at 17:00.**
>    **`restaurantWebsite` is set on the till since 2026-10-01**, through the Réglages field L-252
>    added that morning; empty, the footer prints the thank-you and no URL.
> 2. **THE GO-LIVE IS DONE — 2026-10-03.** Steps 1–3 on 2026-10-01 (pull to `03ed85a`, version
>    1.0.0, the four settings, the owner approved the paper); on 2026-10-03 the backup copied off
>    the till, R6.1 (1353 rows, customers kept — L-254 — and the audit log emptied — L-255),
>    R6.2 (key saved on the operator's PC) and R6.3. **What follows is kept as the record of the
>    order it was done in.**
>    **The sequence, in this order, and the order is a rule** (written out in full in `CLAUDE.md`
>    Part Two): **(1)** pull and rebuild — stop the task, `bun run db:generate`, `bun run
>    build` — first, because `restaurantWebsite` only exists on the till once `847fb95` is in;
>    **(2)** the four settings as SUPER_ADMIN — SIRET `93789365900014`, phone `0238874409`,
>    `restaurantTva` **cleared**, `restaurantWebsite` set; **(3)** print one factice delivery
>    and look at the paper — the last free look; **(4)** a backup, **copied off the till** —
>    `pre-golive-reset.ts` asks whether one exists and trusts the answer; **(5)** R6.1, dry run
>    first; **(6)** R6.2, the key leaving the till before that screen closes; **(7)** R6.3,
>    FACTICE off, last. Steps 1–3 precede the reset because the reset erases the evidence.
>    R6.1 → R6.2 → R6.3 cannot be reordered: `POST /api/setup/chain-key` answers 409 while any
>    `FiscalEvent` exists, and `pre-golive-reset.ts` refuses once the key is armed, so FACTICE
>    off before the reset shuts both doors permanently. Also open before trading for real:
>    **`VAT-METHOD`** (§ 8).
> 3. **L-203'S DISAGREEMENT IS UNRESOLVED, AND THE OBVIOUS FIX HAS A TRAP IN IT.** The launcher
>    still refuses to boot what PREP-4 would have applied. « Drop refusal 2 » is **not sufficient
>    on its own**: `instrumentation.ts` deliberately lets the app start when the gate REFUSES for
>    want of a verified backup, so the till would boot and serve new code against an old schema —
>    the mid-sale failure refusal 2 exists to prevent. Closing it properly means deciding whether
>    the app should refuse to **serve**, which is a fiscal-behaviour change and wants its own item.
> 4. **TWO ORPHANED FILES ON THE TILL** (**L-236**), needing nobody's decision:
>    `hibapos-server.ps1.ps1`, which nothing executes, and `secrets.json.1192.tmp` from
>    commissioning evening — **read it before deleting**, it may hold partial secret material.
>    Also open: **L-207's other half**, the task names hard-coded in **five** files and stated in
>    neither this file nor `CLAUDE.md`. *(The row said « four places ». Measured 2026-09-27 with
>    `git grep -c`: `HibaPOS Server` appears **six times in five operational files** — two of them
>    `scripts/pre-golive-reset.ts` and `scripts/rotate-secrets.ts`, outside `.zscripts/` — plus a
>    pin in `deployment.test.ts`. `HibaPOS Kiosk` appears once, in `install-windows.ps1`.
>    Corrected in FINDINGS.md.)*

**EIGHT THAT ARE NOT DECISIONS**, each confirmed open against the code on 2026-09-27:
**L-244** (Medium — a second log-on launches a second kiosk that silently loses `--kiosk`, so
anyone who remote-accesses the till leaves a window over it that is not fullscreen; confirmed on
the till 2026-09-27 and **left unfixed deliberately**, it wants a decision between refusing the
second launch and giving the kiosk its own `--user-data-dir`),
**L-211** (High — the category strip scrolls sideways with
nothing to show it does), **L-204** (High — the launcher's third refusal never reads
`secrets.json`), **L-208 · L-209 · L-210** (Medium — a stale baselines file, a build script that
never checks an exit code, and `dev.ps1`'s uncovered seed path), **L-223** (Low-Med) and
**L-239** (Medium — the e2e server takes every key `e2eServerEnv()` omits from the real `.env`,
`BACKUP_LOCATION` among them). **None of them is phased**, which is the operator's decision and
the same one § 7 is waiting on. Their detail is in `docs/audit/FINDINGS.md` and is not repeated
here. *(**L-238** and **L-243** were both taken on 2026-09-27 and are in `REMEDIATION_DONE.md`;
L-244 arrived the same evening, so the count is where it started. L-243 is the one worth knowing
about: **the till could not boot without the Internet**, and had not been able to since it was
commissioned.)*


**Phases 0-5 and 7 are COMPLETE**, with all four operator items and all three migrations
applied. What each did, how it was verified and what it cost is in `REMEDIATION_DONE.md`;
**nothing from them is outstanding**, and this file does not repeat them.

**Two phases are open** — 6 and 10, and neither has a row that is a session's. Phase 8 closed on
2026-09-13 and Phase 9 on 2026-09-14. *(This said « three » until 2026-09-27, while the list
directly beneath it marked two of the four COMPLETE.)*

- **Phase 6** — the fiscal go-live, **three** `OPERATOR` rows: R6.1, R6.2, R6.3. **R8.1 unblocked
  R6.3** (2026-09-13, `622411c`) and **R9.1 unblocked R6.4** (2026-09-13). R6.4 and R6.5 are done
  and have left this file. Row-by-row status below. *(This said « five » until 2026-09-27.)*
- **Phase 8** — money and the fiscal record. **COMPLETE 2026-09-13**, all seven batches.
- **Phase 9** — fix before the app is called complete. **COMPLETE 2026-09-14**, all eight batches.
- **Phase 10** — the leftovers no other batch owns. Three rows (group C), **of which R10.1 and
  R10.2 are done** (both 2026-09-14) and have left this file. **R10.3 is the one that is left**,
  and it is `OPERATOR`.

**Phases 8-10 come from the audit.** Six read-only passes and a seventh that consolidated
them, 2026-09-12: **`docs/audit/FINDINGS.md` holds 94 findings, L-89 … L-182**, in two views —
by severity, and by the file the work lands in. Groups **A** (7) · **B** (39) · **C** (36) ·
**D** record and leave (9) · **E** undecidable until packaging (3). § 6 carries the ids;
**the detail is in FINDINGS.md and is not repeated here.** § 7 stands at the **five** findings
that predate the audit and outlived it. Nothing found stops a sale being *rung*: every money path
the audit exercised produced screen figures matching the database to the cent.

**EVERY GROUP A, B AND C FINDING IS CLOSED EXCEPT L-170** (= R10.3) — verified 2026-09-27
against `REMEDIATION_DONE.md` and spot-checked in the code. **But FINDINGS.md's View A still
reads as open defects**, present tense, no row marked fixed, because it is the audit's own
document and is left as written. **Do not take a View A row as work without checking
`REMEDIATION_DONE.md` first.** What is open there is the *Found after the audit* section.

### Phase 6 — where each row stands

*Measurements and the runbook mapping are in `REMEDIATION_DONE.md` under « PHASE 6 OPENED ».
`../HibaPOS-docs-archive/README.md` maps `runbook-complet.md`; **its § 6a/6b/6c are stale**
(scheduled tasks, `C:\HibaPOS-secrets-backup\`, and a claim the backups are unrestorable).*

- **R6.1** reset (§ 6d) — **ON THIS MACHINE it would delete 0 rows**: all sixteen tables on the
  script's `DELETION_ORDER` empty, counter `0/0/0/0`, re-measured 2026-09-27. **THAT IS NOT THE
  MACHINE THE ROW IS ABOUT.** R6.1 runs on the FRANCE TILL, whose journal has held factice events
  since the owner began testing after its 2026-09-20 reset — **nobody has counted them**. So the
  zero says nothing about the run that matters. **A decision, not a step.** Irreversible; runs
  once, never after a genuine sale. *(Asserted the zero without naming a machine until
  2026-09-27.)*
- **R6.2** arm the key (§ 6e) — `FISCAL_CHAIN_KEY` absent, so the reset's guard 1 passes.
  An empty journal is armable at any time, so arming EARLY buys nothing and creates a secret
  to transport. Follows R6.1. **A BUTTON since 2026-09-11** (`POST /api/setup/chain-key`), not
  a `.env` edit: it refuses unless the journal is empty, and shows the key once.
- **R6.3** FACTICE off (§ 6f) — `factice=true`. Last of the three. **UNBLOCKED 2026-09-13 by
  R8.1** (`622411c`), which carried both halves: the MANAGER can now save it (DD-26), and a
  save that omits the key no longer performs this row by accident (L-93). **DD-27 applies from
  here on**: once the journal holds a non-factice event, only a SUPER_ADMIN can turn the stamp
  back on. Still the operator's action, and still last of the three.
- **R6.4** printer and **R6.5** backup volume — **both DONE on the till 2026-09-16**, R6.4
  confirmed on paper 2026-09-17, both recorded in full in `REMEDIATION_DONE.md`. Kept here as
  one line because the phase is read as a whole: **this** machine's `SUNSO WTP-800` queue
  still sits on `COM1:`, `Error`, which is a developer artefact and the reason a `COM1:` queue
  « prints nothing and reports success » is worth remembering.

### Awaiting the operator


- **No migration is pending on the FRANCE TILL either** — `20260918010000_product_option_quota`
  (L-217) and `20260918200000_customer_city` (L-221) were applied there on 2026-09-20, 18 → 20,
  both named by the script, `schema_version 176 → 181`, restore point verified before a byte moved.
  **L-203 is dormant on that machine, not fixed**: `migrate status` exits 0 so the launcher starts,
  and it goes live again the moment a migration is prepared and not applied. **Its refusal no
  longer recommends the forbidden `update.ps1 -Apply`** — that was **L-206**, closed 2026-09-25;
  both it and `update.ps1` now name `apply-migration.ts`.
- **No migration is waiting on THIS machine** — `20260918200000_customer_city` (L-221) was applied
  by the operator on 2026-09-20 with
  `bun scripts/apply-migration.ts --apply --expect ../db-snapshots/r221-city-rehearsal/fp-after.json`
  and **verified**: zero differences from the rehearsal's post-migration fingerprint, `city`
  appended as the last column with the first nine byte-identical, catalogue still
  `b6a76daf0befc587` / 86 products — **that fingerprint is retired**; it became
  `a38c95977b5e1122` when the Tacos photograph was attached here on 2026-09-25 (L-232), and that
  is the expected value now — every trading table at zero, `migrate status` exit 0. Both
  restore points in `../db-snapshots/` hold the pre-migration file. *(This bullet asserted the same
  sentence throughout 2026-09-19/20 while the migration was in fact pending — **L-231**. It is true
  again because it was counted, not because it was left alone.)*
- **A FRESH verified backup, off this machine.** The oldest open item in the plan and the
  only one about losing data rather than getting something wrong. The two backup rows in
  `docs/BASELINES.md` say exactly where it stands and what is left.
- **The accountant's written line on the VAT allocation method** (§ 8, `VAT-METHOD`). The
  rates are settled and live; the division of a menu's forfait between them is the open claim.

### Deployment is deferred

Tauri v2, and that migration's plan does not exist yet. *(It was the next direction for part of
2026-09-26 and the operator withdrew it the same day — the work follows the owner's feedback
instead, starting with the printed paper. The survey taken while it was open is in
`REMEDIATION_DONE.md`, including the finding that **this is not a static site a shell can wrap**.)*
The Windows-till install was retired
2026-09-10 — **the model is retired, the files are not**: `.zscripts/`'s eight `.ps1` files
are pinned by `deployment.test.ts`, and `print-raw.ps1` is live for R6.4. Phase 6 is fiscal
whatever the packaging, and the operator settled **where** on 2026-09-11: **a FRESH install in
France, retaining this catalogue** — the éditeur is in Tunisia (V-10), the restaurant and its
printer are in France. So R6.1-R6.3 belong to that install, not to this machine, and
**a catalogue CAN be carried, and since 2026-09-25 the mechanism works** — `catalogue-transfer.ts`,
`/api/catalog/export`, `/api/catalog/import`, plus `scripts/empty-catalogue.ts` for the empty
destination the import insists on. **L-225 and L-226 are both closed**; the ceilings travel and a
catalogue can be emptied on an install that has not traded. Untested against the France till.
*(This said « nothing in the app exports or imports a catalogue today » until 2026-09-20. It was
false from R9.9 and it nearly produced a whole-database copy onto the restaurant's till.)*
`FISCAL_CHAIN_KEY` is in `.env`, `factice` is in the database: they do not travel together.

**Last updated:** 2026-10-01. **THE GO-LIVE WAS DUE OVERNIGHT AND THIS FILE DOES NOT KNOW WHETHER IT HAPPENED** — ask, and read the till. Closed 2026-09-27/30: the state audit · **L-238** the reset verifies content not row counts · **L-240** the till is current in code · **L-243 the till could not boot without the Internet**, true since commissioning · **L-246 an uploaded image was served by nobody**, also true since commissioning · **L-248** no customer data in the sealed record · **L-249** the owner's ticket rebuilt. Opened: **L-239**, **L-244**, **L-245**, **L-247**. **The queue is NOT down to decisions**, and `VAT-METHOD` stops being theoretical at the first real sale.

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
  production database in the working tree. **Give `DATABASE_URL` a WINDOWS-form path —
  `file:C:/…`, never Git Bash's `file:/c/…`** (L-218): Prisma resolves the second to
  `C:\c\…`, CREATES an empty database there, applies every migration to THAT and prints
  « All migrations have been successfully applied », leaving the copy you aimed at
  untouched and the fingerprint diff EMPTY. Apply to a copy, then diff a fingerprint of every
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
| `scripts/delete-product.ts` | ✅ **Hard-deletes ONE product row.** Exists since 2026-09-09 and **has run five times** (five `PRODUCT_HARD_DELETED` rows in the live audit log, counted read-only 2026-09-27 — the fifth was `5 nuggets test` on 2026-09-16, which closed L-81; this said « four » until then); 2026-09-11 added `--id` and three refusals. Refuses unless the product is uniquely identified, already inactive, has **no** FK reference (`OrderItem` is `SET NULL`, `ComboSlot` `CASCADE` — SQLite would have allowed the damage), is in **no sealed payload** — the guard no schema can express — and the restore point verifies. Each refusal exercised on a copy. |
| `scripts/pre-golive-reset.ts` | ⚠ **R6.1. Runs ONCE, and never after a genuine sale.** The operator's, not Claude's. |

---

## 6. THE WORK

Status values: `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED` · `OPERATOR` · `ASK FIRST`.
A `DONE` row leaves this file for `REMEDIATION_DONE.md`.

*Phases 0-5 and 7 are complete; their records are in `REMEDIATION_DONE.md`. Nothing from
them is outstanding except the **four** items under § 1 « Awaiting the operator ».*

> **Two phases are open.** Phase 6 is the fiscal go-live.
> **Phase 10 is what is left of the 2026-09 audit, phased 2026-09-12** from
> `docs/audit/FINDINGS.md`'s *View B — by area*, because the file a fix lands in is what a
> batch is here. Every row below names its `L-` ids and nothing else: **the detail is in
> FINDINGS.md and is not repeated here**, which is what keeps this file inside its ceiling.
> Groups D and E got no rows.

**ORDER.** Every dependency that reordered this list is discharged — the four steps and why
each existed are recorded in `REMEDIATION_DONE.md`. **Nothing here is ordered against anything
else any more**: Phase 9 completed on 2026-09-14 and its table below is empty, Phase 10 is down
to R10.3, and Phase 6 is three fiscal rows whose own order is fixed — R6.1 → R6.2 → R6.3.
**R6.3 is reachable** since R8.1, and **R6.4 and R6.5 are both done** — 2026-09-16, with R6.4
confirmed on paper on 2026-09-17. *(This said « Phase 9, then Phase 10 » until 2026-09-27.)*

### Phase 6 — Before the first real sale

*Not deployment — deployment is the Tauri phase, and **that plan does not exist yet**; the
heading above § 2 says so and this line claimed the opposite until 2026-09-27. These apply whatever
the app is packaged as. **R6.1, R6.2 and R6.3 are fiscal and their order is not a
preference** — arming the chain key before the reset makes the reset refuse. **R6.4 and R6.5
were the two technical ones and both are done**: carried out on the till on 2026-09-16, R6.4
confirmed on paper on 2026-09-17, and both now in `REMEDIATION_DONE.md`. **What is left in
this phase is fiscal, in order, and all of it the operator's.***

| ID | Status | Task |
|---|---|---|
| **R6.1** | `OPERATOR` | **Run `scripts/pre-golive-reset.ts --apply` — once.** *(Step-by-step in `../HibaPOS-docs-archive/runbook-complet.md` **§ 6d**; §§ 6a-6c are its prerequisites, and § 6b is R6.5.)* It empties the fiscal journal, deletes every order, receipt, shift, Z report, close and archive, and resets the counters to zero. It **keeps** the catalogue, the users, the settings and the audit log. Everything rung up before it is deleted by it — that is why testing comes first. **This runs once, and never after a genuine sale**: from that point the journal is append-only and clearing it is precisely the deletion `docs/attestation-conformite.md` states is impossible. |
| **R6.2** | `OPERATOR` | **Arm `FISCAL_CHAIN_KEY` — after R6.1, never before.** Every fiscal fingerprint becomes HMAC-SHA-256 instead of plain SHA-256. Arming onto a journal that already holds unkeyed events is refused by design, because a half-keyed chain verifies under neither mode. **Lose this key and the journal cannot be verified at all** — back it up with the same care as `BACKUP_ENCRYPTION_KEY`, and not only on the machine that holds it. |
| **R6.3** | `OPERATOR` | **Turn FACTICE off.** `factice` is `true` today, which stamps every ticket *SIMULATION* and flags the journal row. Off is the point every rule tightens: from then on every sale is real. **Reachable from the till since R8.1** (2026-09-13): the MANAGER may write this field. **One-way after the first real sale** — DD-27 refuses turning it back on once the journal holds a non-factice event, SUPER_ADMIN excepted. |

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

**These five are what is left of the register as it stood before the audit, and the audit did
not close any of them.** *(This said « these nine » until 2026-09-27; the table has held five
rows since Phase 8, and `plan-freshness.test.ts` pins five.)* The 2026-09 audit's own 94 findings
(**L-89 … L-182**) are in `docs/audit/FINDINGS.md` and are deliberately **not** listed here:
ninety-four rows at this table's density is roughly 37 KB, against a **40 960-byte ceiling this
file spent the week within a kilobyte of** — it stood at 40 249 on 2026-09-27, before the Phase
8/9/10 history came out of § 1. Placing them would break the thing the ceiling protects.
FINDINGS.md proposes **seven** rows — its group A — plus one pointer row, ready to paste.
**Placing any of them means editing `plan-freshness.test.ts`'s pinned count of five in the same
commit**, which is the design.
Of the **nine** this register held when the audit ran, five were rediscovered by it and four
gained a new facet, each with its own new id; FINDINGS.md's « Already known » section maps them.
**Four have closed since, leaving the five below**: L-88 (R9.1, 2026-09-13), L-84 and L-11
(2026-09-15), and L-81 (2026-09-16, the operator running `delete-product.ts`).

| ID | Severity | Finding | Owner |
|---|---|---|---|
| **L-75** | Deferred | The app cannot run on a 32-bit Windows: both Prisma engines are `machine 0x8664` and Bun is x64/ARM64 only. **Carried to the Tauri v2 phase**, where the runtime and the packaging are both decided. No software fix at this layer. | none |
| **L-05** | Deferred | `output: "standalone"` was dropped; whether to reinstate it deliberately is open. Still true — no `output` key — but deferred to nothing. **Carried to the Tauri v2 phase**, like L-75: its premise (a Windows-till Node install) is retired and packaging is decided there. | none |
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
