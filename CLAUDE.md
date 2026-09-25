# HibaPOS France — read this first

A point-of-sale system for a French restaurant, under fiscal record-keeping obligations.
Next.js 16 + React 19 + Prisma/SQLite. **It has never traded. Nothing has shipped.**

## How to work here

1. **Open `REMEDIATION_PLAN.md` and read all of it, then `docs/audit/FINDINGS.md`.** The
   plan holds the current task, the working loop, the methods and the five findings that
   predate the audit. **FINDINGS.md holds the other 94 and is where the remaining work comes
   from** — the plan does not repeat them and cannot, under its 40 960-byte ceiling. The
   invariants are in `docs/INVARIANTS.md`. Finished work is in `REMEDIATION_DONE.md`: read
   it to learn *how* something was done, never to find out what to do next.

2. **Do one item.** Only what is in that item — whether it is a plan row or a FINDINGS.md
   id. Anything else you notice goes into FINDINGS.md's own tables with a new `L-` id
   continuing the same sequence — the audit ended at **L-182** and the highest today is
   **L-228**, in the *Found after the audit* section. The plan's § 7 is closed to new rows
   until the operator reopens it. You do not fix it now.

3. **Then, in this order:** `bun run test` · `bun run typecheck` · `bun run lint` — all three
   green. Commit. Push. Move the item's row into `REMEDIATION_DONE.md` with its commit sha
   and how you verified it. Update *Current task* at the top of the plan. Stop and report.

## The five things you must not do

- **Never write to `db/custom.db` or to real menu data.** Work on a scratch copy with
  **both** `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden, and prove which database the
  server has open before the first write (plan § 2, *Scratch copy*).
- **Never run `bunx vitest`, `npx vitest`, or `git clean`.** `bun run test` is the runner.
- **Never delete or weaken a test to make something pass.** If a pinned number fails, the
  number is what to check.
- **Never claim French fiscal or legal compliance.** Not from a passing test, not anywhere.
- **Never edit this file without asking the operator first.** It changes whenever the
  project needs it to, but the operator decides what it says. Bring the exact text and wait.

## Two things only the operator does

Applying a migration to production, and edits to the live catalogue. Prepare the change,
rehearse it on a copy, verify it, then hand over the exact command — which is **`bun
scripts/apply-migration.ts --apply --expect <path to the rehearsal's fingerprint JSON>`**,
**not** `bunx prisma migrate deploy`. The bare command prints the same green banner whichever
migration it ran, and was misread as applied twice when it was not.

**`--expect` takes a PATH**, e.g. `../db-snapshots/r31-acceptance/fp-r31-after.json` — never a
migration name. Since R10.2 a path the script cannot read **fails** the run, instead of
printing « skipped » under a tick (L-166).

Since 2026-09-11 the **application** also applies pending migrations itself at startup,
behind a backup it creates and then re-opens to verify (PREP-4). That is the app on its own
machine; the rule above is about you.

## Where things stand

The software is essentially complete. **It was installed on the restaurant's production
till in France on 2026-09-16 and confirmed working on 2026-09-17** — `C:\HibaPOS-app`, run
from source, printer `SUNSO WTP-801` on `USB001` with two test tickets seen on paper, first
backup taken to `D:` and verified by decryption. **The till now starts itself**: two
Scheduled Tasks as `hibafood`, the server at boot and Brave in `--kiosk` at log on. It has
still **never traded a genuine sale**: FACTICE is on and the chain key is not armed. Its
journal was reset to `0/0/0/0` on 2026-09-20 and **the owner has been testing since, so it
holds factice events again — how many is not measured**, and R6.1 is the step that clears
them. **Tauri v2 remains the shipping form** and that migration still has no plan — what
runs in France is the development build, not a package.

**THAT TILL IS CURRENT SINCE 2026-09-20.** `C:\HibaPOS-app` is a git clone at `81eb2f3`: **20
migrations**, **86 products with the Tacos**, fiscal slate reset to **0/0/0/0** the same
evening, and it boots itself fullscreen. Its fingerprint is **`a38c95977b5e1122`** and this
machine's is still `b6a76daf0befc587`: the Tacos photograph is attached there and not here
(**L-232**), and three edits here close the gap. **The blocker was never there** — git was
already installed and the repository is **public**, so the token nobody had was never needed.
Every measured step is in `REMEDIATION_DONE.md`. **L-203 is dormant, not fixed**: the launcher
still refuses to boot on a pending migration, and its refusal is the one that points at
`update.ps1 -Apply`, which carries L-206 and L-207. **L-234 was closed on 2026-09-25 as NOT a
defect**: the fix was written, measured before committing, and reverted — `apply-migration.ts`
refuses on the existence of a `-wal`, which looks wrong and is right, because `state()` closes
above it and SQLite clears the file first.

**THE OWNER CONFIRMED THE TILL BY TELEPHONE ON 2026-09-25** — the whole menu present, **the
Tacos with the right configuration**, and **printing working**. That closes the three checks
that needed a person in the restaurant. The Tacos half carries weight because **he is the one
who reported L-217** — a `Tacos M` taking all six viandes — so he knows what wrong looked
like. The printing half is the same standard R6.4 was held to: a person, in the restaurant,
seeing paper. **It is a verbal report, not a measurement**, and it is recorded as such.

**THE TRADING DAY IS A RULE THE TILL ENFORCES, since 2026-09-20.** It refuses a sale into a
sealed day, refuses a sale through a caisse whose trading day has ended, and refuses to open
a caisse while an ended day with operations is unsealed — a SUPER_ADMIN may force that last
one and it is journalled as `OUVERTURE_FORCEE`. **Closing the caisse seals the day**, which
needed a narrow flagged bypass of the premature-close guard at one call site rather than
relaxing it. It came out of a caisse found open for 48 hours in France, during which no day
could be sealed at all. **The cut-off hour is 0 on both installs since 2026-09-20**, set with
`scripts/set-business-day-cutoff.ts`, which refuses to RAISE it after a day has been sealed —
that being one of the two things that arm L-228.

**A catalogue CAN be exported and imported** (`lib/services/catalogue-transfer.ts`, since
R9.9) — but the option ceilings do not travel with it (L-225) and the import refuses unless
the destination catalogue is empty, which nothing can make it (L-226). Until both are fixed,
carrying a menu is `scripts/add-tacos.ts`-shaped work: a script per change.

**The audit is DONE, and it is the work list.** On 2026-09-12 six read-only passes swept the
whole project — money · security · data model · the till in use · build and ops · test
quality — and a seventh consolidated them into **`docs/audit/FINDINGS.md`: 94 findings,
L-89 … L-182**, in two views — by severity (what to do first) and by file (what to do
together). Groups **A** money and the fiscal record (7) · **B** fix before the app is called
complete (39) · **C** fix with the batch that owns the file (36) · **D** record and leave (9) ·
**E** undecidable until packaging (3). **None of it is phased into the plan's § 6 or placed in
its § 7** — that is the operator's decision, and it is the next one to make. The order is:
finish and fix the app, *then* plan the packaging against a complete app. The six pass files
were written believing packaging came next and say so throughout — they are left as written
because they are evidence, with one PIN caviardé and flagged. **Tauri still shapes the work**:
where a fix has two reasonable forms, the one that survives becoming a Windows native app is
the one to choose. It is a constraint on how things are fixed, not a phase in the list.

**The model was retired; the files are not, and three of them are now live.** `.zscripts/`
holds eight tracked `.ps1` files that `deployment.test.ts` pins. `print-raw.ps1` drives the
printer, and since 2026-09-17 `hibapos-server.ps1` and `hibapos-kiosk.ps1` run the France
till as two Scheduled Tasks — the server at boot, Brave in `--kiosk` at log on. **They had
never been executed before that day and four things in them were wrong** (L-203, L-204,
L-205, and a `--start-fullscreen` that does nothing in `--app` mode); two are fixed and two
are open decisions. Treat a comment in that directory as an intention, not as evidence.

What still has to happen before the restaurant's first real sale is **fiscal**: R6.1, R6.2
and R6.3, in that order, and the order is not a preference — arming the chain key before the
reset makes the reset refuse. **R6.4 (the printer) and R6.5 (a backup volume) were the
technical two and both are done** — 2026-09-16, R6.4 confirmed on paper on 2026-09-17, both
now in `REMEDIATION_DONE.md`. The software that had blocked them was fixed first: R8.1
closed **L-101** on 2026-09-13, so the MANAGER — the only account at the till — can write
`factice` and the printer queue without touching the SIRET, and R9.1 cleared R6.4's other
half the same week.

`scripts/pre-golive-reset.ts` empties the fiscal journal; it runs **once**, after testing and
before the first genuine sale, and the operator runs it. **It already ran on 2026-09-10**, so
R6.1's target is an empty database today — every trading table is at zero and the counters
are 0/0/0/0. Whether it needs to run again is a decision, not a step.

`bun run test:e2e` is safe — it builds its own disposable database under the OS temp
directory and refuses to start otherwise. The plan's § 5 says what makes it safe and what
would make it dangerous again.
