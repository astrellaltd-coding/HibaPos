# HibaPOS France — Remediation Plan

**This is the only plan. Read it top to bottom before touching anything.**

Completed work lives in **`REMEDIATION_DONE.md`**. This file only ever shows outstanding work.

---

## 1. CURRENT STATUS

**Overall:** NOT READY FOR PRODUCTION, and **not trading** — the fiscal journal is empty and
every trading table is at zero.

> ### ▶ CURRENT TASK — **R8.1**, then **R9.2**
>
> **§ 6 opens with the execution order. Follow that, not the order the tables print in.**
>
> **R8.0** (2026-09-12, `f68dcf6`) and **R9.6** (2026-09-13, `f918578`) are done. The map
> R8.1 is about to move now says what is true: `settings:PUT` is **`INLINE_SA`**, not the
> undifferentiated `INLINE` that also covered seven guards refusing nobody, and the counts at
> `api-authorization.test.ts:407` are **INLINE_SA 6 · INLINE_ANY 7 · INLINE_SELF 1**.
> **Reclassifying `settings:PUT` moves those, and that edit is R8.1's, in R8.1's commit.**
>
> **R8.1 is the first real fix and it unblocks R6.3 and R6.4**: **L-93** — two default tables
> disagree on `factice`, so a settings save that merely *omits* the key turns the fiscal
> simulation stamp off by accident — then **L-101** — the MANAGER, the only account that will
> be at the till in France, is refused a 403 by `PUT /api/settings` while the screen shows an
> enabled save button. **In that order.**
>
> **L-101's role gate is settled and is not the session's to reopen — DD-26** (the route
> splits by field: operational fields MANAGER-writable, identity and fiscal-policy fields
> SUPER_ADMIN) **and DD-27** (FACTICE one-way once the journal holds a non-factice event,
> SUPER_ADMIN excepted), both in `docs/DECISIONS.md`. **Do not fix it by hiding the screen** —
> that leaves R6.3 and R6.4 unreachable without the developer's account.
> `NEXT-SESSION-PROMPT.md`'s **SESSION 1** is the prompt for this session.

**Phases 0-5 and 7 are COMPLETE**, with all four operator items and all three migrations
applied. What each did, how it was verified and what it cost is in `REMEDIATION_DONE.md`;
**nothing from them is outstanding**, and this file does not repeat them.

**Four phases are open, and they are not independent.**

- **Phase 6** — the fiscal go-live, five `OPERATOR` rows. **R6.3 and R6.4 are blocked on
  R8.1**, so this phase cannot close first. Row-by-row status below.
- **Phase 8** — money and the fiscal record. Six batches (group A).
- **Phase 9** — fix before the app is called complete. Nine batches (group B).
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
- **R6.3** FACTICE off (§ 6f) — `factice=true`. Last of the three. **BLOCKED BY R8.1**, which
  carries both halves: L-101 (the MANAGER cannot save) and L-93 (a save that omits the key
  performs this row by accident).
- **R6.4** printer (§ 4a, then § 4) — **the printer is in France; not doable from here.** This
  machine's `SUNSO WTP-800` queue sits on `COM1:`, `Error`, with no `USBPRINT` device: a
  developer artefact. § 4a — a `COM1:` queue « prints nothing and reports success ».
  **Also BLOCKED BY L-101**, and **L-96 is the same sentence reached another way**: the USB
  helper is resolved from `process.cwd()` and `powershell.exe -File <missing>` exits 0, so a
  helper that never runs is written to the database as `PRINTED`. Choosing the queue is not
  enough on its own.
- **R6.5** — the restaurant's `BACKUP_LOCATION` belongs to its install; **this** machine's is
  set (`docs/BASELINES.md`). See its backup-gap row for what is still outstanding.

### Awaiting the operator

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

**Last updated:** 2026-09-13 — **R9.6 done** (`f918578`): the authorization map distinguishes
a guard from a no-op, and a 403 is journalled. Twenty-four task rows became twenty-three.
**Two findings recorded, not fixed — L-183 and L-184**, in a new *Found after the audit*
section of `docs/audit/FINDINGS.md` that keeps the audit's 94 (L-89 … L-182) a closed set.
2026-09-12: **R8.0 done** (`f68dcf6`), the audit landed and was phased into Phases 8-10, the
baselines moved to `docs/BASELINES.md`, and R6.3/R6.4 were re-marked as blocked by software
rather than hardware. § 7 unchanged at nine.

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

> **Four phases are open, and they are not independent.** Phase 6 is the fiscal go-live.
> **Phases 8, 9 and 10 are the 2026-09 audit, phased 2026-09-12** from
> `docs/audit/FINDINGS.md`'s *View B — by area*, because the file a fix lands in is what a
> batch is here. Every row below names its `L-` ids and nothing else: **the detail is in
> FINDINGS.md and is not repeated here**, which is what keeps this file inside its ceiling.
> Groups D and E got no rows.

**EXECUTION ORDER — not the order the tables are printed in.** The tables group by subject;
this is the sequence, and each step is here because of a dependency, not a preference.

1. **R8.1** — **unblocks R6.3 and R6.4.**
2. **R9.2** — the migration gate, *before* R8.2 and R8.5 add two migrations for it to apply.
   A fresh install in France runs every migration through this gate at first boot.
3. **The rest of Phase 8** (R8.2 … R8.6), then **Phase 9**, then **Phase 10**.
4. **Phase 6** — once R8.1 has landed and R6.4's other blocker (R9.1) has too.

*(Steps 1 and 2 are done and are in `REMEDIATION_DONE.md`: **R8.0** 2026-09-12 `f68dcf6`,
**R9.6** 2026-09-13 `f918578`.)*

### Phase 6 — Before the first real sale

*Not deployment — deployment is the Tauri phase and has its own plan. **These five** apply
whatever the app is packaged as. **R6.1, R6.2 and R6.3 are fiscal and their order is not a
preference** — arming the chain key before the reset makes the reset refuse. **R6.4 (printer)
and R6.5 (a second volume for backups) are technical, not fiscal**, and can be done at any
point before the first sale. **R6.3 and R6.4 wait on R8.1.***

| ID | Status | Task |
|---|---|---|
| **R6.1** | `OPERATOR` | **Run `scripts/pre-golive-reset.ts --apply` — once.** *(Step-by-step in `../HibaPOS-docs-archive/runbook-complet.md` **§ 6d**; §§ 6a-6c are its prerequisites, and § 6b is R6.5.)* It empties the fiscal journal, deletes every order, receipt, shift, Z report, close and archive, and resets the counters to zero. It **keeps** the catalogue, the users, the settings and the audit log. Everything rung up before it is deleted by it — that is why testing comes first. **This runs once, and never after a genuine sale**: from that point the journal is append-only and clearing it is precisely the deletion `docs/attestation-conformite.md` states is impossible. |
| **R6.2** | `OPERATOR` | **Arm `FISCAL_CHAIN_KEY` — after R6.1, never before.** Every fiscal fingerprint becomes HMAC-SHA-256 instead of plain SHA-256. Arming onto a journal that already holds unkeyed events is refused by design, because a half-keyed chain verifies under neither mode. **Lose this key and the journal cannot be verified at all** — back it up with the same care as `BACKUP_ENCRYPTION_KEY`, and not only on the machine that holds it. |
| **R6.3** | `OPERATOR` | **Turn FACTICE off.** `factice` is `true` today, which stamps every ticket *SIMULATION* and flags the journal row. Off is the point every rule tightens: from then on every sale is real. |
| **R6.4** | `OPERATOR` | **Configure the printer — INSTALL-DAY, IN FRANCE.** Since 2026-09-11 `printerConnection` defaults to **`usb`**, so the only settings work left is **picking the queue** from the list in Réglages; `printerEnabled` is already `true` in production and was never off. **The procedure is `../HibaPOS-docs-archive/runbook-complet.md` § 4a** — the `pnputil` export/install commands and the hardware id `USBPRINT\SUNSOWTP-800036C` from `sunso.inf`, the only place the steps are written down. Read that archive's `README.md` first. **A queue whose `PortName` is not `USB00x` prints nothing and reports success** — check it before trusting it. |
| **R6.5** | `OPERATOR` | **Point `BACKUP_LOCATION` at a second volume.** Unset, backups land beside the database on the same disk, so one failure takes the data and every copy of it together. |

**Not here, deliberately:** the till hardware, the Windows install, the kiosk launcher, the
pre-built tree, the update path. All of it belongs to the Tauri v2 migration.

### Phase 8 — Money and the fiscal record

*The audit's group A, plus the two rows that block Phase 6. Detail for every id is in
`docs/audit/FINDINGS.md`; these rows say what a session does, not what is wrong.*
**R8.1 runs first and is not the worst finding — it is the one that unblocks R6.3 and R6.4.**

| ID | Status | Task |
|---|---|---|
| **R8.1** | `TODO` | **The settings defaults agree, and the operator can save them.** L-93 · L-101. `validation.ts` · `settings.ts` · `settings/route.ts` · `nav-config.ts`. Reconcile the two default tables and pin the reconciliation FIRST — opening the write before they agree hands a till operator a route that flips `factice` by omission. **The role gate is already decided: DD-26** (split by field — operational fields MANAGER-writable, identity and fiscal-policy fields SUPER_ADMIN) **and DD-27** (FACTICE one-way once the journal holds a non-factice event, SUPER_ADMIN excepted). Implement those; do not re-open them. **Unblocks R6.3 and R6.4.** **R9.6 is done (2026-09-13), so the map is ready**: `settings:PUT` is pinned `INLINE_SA` and the counts at `api-authorization.test.ts:407` are `INLINE_SA 6 · INLINE_ANY 7 · INLINE_SELF 1`. Splitting this route by field reclassifies it and moves those numbers — **edit them in this row's commit, with a dated line, the way every other count in that file is moved.** |
| **R8.2** | `TODO` | **The checkout is idempotent.** L-89 · L-90 · L-100. `payment-dialog.tsx` · `checkout.ts`. A submit latch and the OFFERT lookup are trivial; the durable fix is a client-generated key, unique-indexed — **a migration**, cheaper now than after trading. L-100 rides along: same file, and it makes DD-14's tender usable at all. **R9.2 lands before this** — see the execution order. |
| **R8.3** | `TODO` | **A category save stops destroying menu option rules.** L-91 (+L-135, L-145 ride along). `catalog/categories/[id]/route.ts`. Match groups by id instead of replacing wholesale, or refuse a delete a `ComboSlotOptionRule` depends on. It moves the weight the VAT allocation divides by, so it is group A, not a catalogue nicety. |
| **R8.4** | `TODO` | **Report periods use the trading-day cut-off.** L-92. `report-range.ts` + the three report routes. Carries a decision: does a free `Du`/`Au` range snap to trading-day edges, and what does the screen then say it showed? |
| **R8.5** | `TODO` | **A supplement carries its own VAT rate.** L-94 · L-127 · L-128 · L-136, and the question L-134. `combo.ts` · `pricing.ts` · `checkout.ts` · `orders/route.ts`. **A migration** — `CategoryAddOn` has no rate. Settle its shape before the small guards. Answer L-134 (is `Product.price` meant to be inert for sized products?) in the same session. |
| **R8.6** | `TODO` | **A refund-only day cannot be skipped.** L-95 · L-99 · L-130. `fiscal.ts`. L-95 first: its absence becomes **permanent** the moment a day is sealed past the hole. L-99 is prose plus the missing reconciliation test; L-130 is one ungrammatical string — check `close-timing.test.ts` pins it first. |

### Phase 9 — Before the app is called complete

*The audit's group B, by the file the work lands in, with the group C rows that own no batch of
their own riding along. Order inside the phase is not fixed except where a row says so.*

| ID | Status | Task |
|---|---|---|
| **R9.1** | `TODO` | **The printer tells the truth.** L-96 · L-97 · L-98 · L-143 · L-144. L-96 first — it writes `PRINTED` for a helper that never ran. Resolve the helper from a real app root, not `process.cwd()`, and stop treating exit 0 with a start-up failure on stderr as success. **L-98 is a question that gates L-88.** |
| **R9.2** | `TODO` | **The startup migration gate.** L-110 · L-111 · L-112 · L-113 · L-114 · L-137 · L-138 · L-139. **L-110 is load-bearing** — it is the only one that also breaks the NEXT boot. L-112 lands in the same session or none of the others leaves a trace. L-114 and L-137 are both « resolve from a real app root ». |
| **R9.3** | `TODO` | **Backup and restore leave no plaintext.** L-104 · L-105 · L-107 · L-108 · L-140 · L-141 · L-142. `backup.ts`, one file. L-104 and L-105 are the same `try`/`finally` shape and land together. L-140's schema check composes with L-110, so R9.2 first or accept the coupling. |
| **R9.4** | `TODO` | **Secrets resolve on an install with no `.env`.** L-106 · L-115 · L-116 · L-117 · L-119 · L-152. **L-115 before R6.2** — R6.2 is the row that arms the chain key, and a short one answers every fiscal write with an empty 500 while reporting itself armed. |
| **R9.5** | `TODO` | **The front door.** L-102 · L-103 · L-118 · L-147. `auth.ts` · `login/route.ts` · `login-screen.tsx`. L-118 is the one that reaches the France install — the published-PIN denylist is enforced in a script and nowhere in the app. L-102 and L-103 are both « the till will not open ». |
| **R9.7** | `TODO` | **The guards that are not guarding.** L-121 · L-122 · L-123 · L-125 · L-126 · L-153 · L-154 · L-155 · L-156 · L-157 · L-158 · L-159. *(L-124 left this batch for **R8.0** — it is one line and it gates every clone.)* Start with L-121 and L-158, one to three lines each, both guarding an invariant. L-154's shared wipe helper is the largest piece and subsumes L-153. |
| **R9.8** | `TODO` | **The data model says what null means.** L-129 · L-145. Settle what a null `OrderItem.vatRate` means — and write it into `docs/INVARIANTS.md` — before anything reads it differently. **Read D's L-175 and L-177 while you are in this file**; they are recorded, not scheduled, and L-177 is the same question about `ZReport`'s two nullable JSON columns. |
| **R9.9** | `TODO` | **The catalogue transfer checks its own stamp.** L-109. It is the mechanism that carries this catalogue to France; an older export into a newer install currently succeeds with new columns silently at their defaults. |
| **R9.10** | `TODO` | **Touch targets and French.** L-131 · L-132 · L-133 · L-148 · L-149 · L-150. L-131's durable form is widening `touch-and-labels.test.ts` past `<Button>`, which makes it a test-suite item as much as a UI one. |

### Phase 10 — The batches that own the leftovers

*Group C rows that no Phase 8 or 9 session opens. Cheap, and none of them is urgent.*

| ID | Status | Task |
|---|---|---|
| **R10.1** | `TODO` | **Build, dependencies, CI.** L-160 · L-161 · L-162 · L-163 · L-164 · L-178. Adding `bun run build` to the fast CI job is trivial and worth doing first; a `windows-latest` leg belongs with whatever CI the packaging gets. |
| **R10.2** | `TODO` | **Documentation and the operator scripts.** L-146 · L-165 · L-166 · L-167 · L-168 · L-169. **`CLAUDE.md` (L-166) and `docs/INVARIANTS.md` (L-167) are the operator's files — bring the exact text and wait.** |
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

## 9. ANSWERED DECISIONS — moved to `docs/DECISIONS.md`

**They still bind.** Every `DD-` decision — no cashiers, no table service, no LAN, « offert »
as a real tender, the trading day and its cut-off, the keyed fiscal chain, Tauri v2 as the
packaging — is in `docs/DECISIONS.md`, with the same one-line form and the same rule: **do
not re-open them.** `DD-` ids are referenced from source comments and are never renamed.

*Moved 2026-09-12, for the reasons § 3 and § 4 moved: it is not outstanding work, and the
plan had 37 bytes of headroom left after the audit's twenty batches.*
