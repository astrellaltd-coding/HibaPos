# HibaPOS France — read this first

A point-of-sale system for a French restaurant, under fiscal record-keeping obligations.
Next.js 16 + React 19 + Prisma/SQLite. **It has never traded. Nothing has shipped.**

## How to work here

1. **Open `REMEDIATION_PLAN.md` and read all of it, then `docs/audit/FINDINGS.md`.** The
   plan holds the current task, the working loop, the methods and the nine findings that
   predate the audit. **FINDINGS.md holds the other 94 and is where the remaining work comes
   from** — the plan does not repeat them and cannot, under its 40 960-byte ceiling. The
   invariants are in `docs/INVARIANTS.md`. Finished work is in `REMEDIATION_DONE.md`: read
   it to learn *how* something was done, never to find out what to do next.

2. **Do one item.** Only what is in that item — whether it is a plan row or a FINDINGS.md
   id. Anything else you notice goes into FINDINGS.md's own tables with a new `L-` id
   continuing from **L-182**; the plan's § 7 is closed to new rows until the operator
   reopens it. You do not fix it now.

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
scripts/apply-migration.ts --apply --expect <name>`**, **not** `bunx prisma migrate deploy`.
The bare command prints the same green banner whichever migration it ran, and was misread as
applied twice when it was not.

Since 2026-09-11 the **application** also applies pending migrations itself at startup,
behind a backup it creates and then re-opens to verify (PREP-4). That is the app on its own
machine; the rule above is about you.

## Where things stand

The software is essentially complete and has never been deployed. **Deployment is deferred:
the app will ship as a Tauri v2 native application, and that migration has its own plan
which does not exist yet.** Anything about installing on a Windows till, kiosk launchers or
commissioning sessions was retired on 2026-09-10 — if you find some, it is stale.

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

**The model is retired; the files are not.** `.zscripts/` still holds eight tracked `.ps1`
files that `deployment.test.ts` pins, and `print-raw.ps1` is live — R6.4 needs it. Do not
delete them to make this prose true.

What still has to happen before the restaurant's first real sale is **fiscal first** —
R6.1, R6.2 and R6.3, in that order — but **R6.4 (the printer) and R6.5 (a backup volume) are
technical**, not fiscal. It is in the plan under *Before the first real sale*. **Since the
audit, R6.3 and R6.4 are blocked by software, not hardware**: both are `PUT /api/settings`,
which refuses the MANAGER — the only account that will be at the till — a 403 while the screen
offers an enabled save button (**L-101**). Fix that before either row is attempted.

`scripts/pre-golive-reset.ts` empties the fiscal journal; it runs **once**, after testing and
before the first genuine sale, and the operator runs it. **It already ran on 2026-09-10**, so
R6.1's target is an empty database today — every trading table is at zero and the counters
are 0/0/0/0. Whether it needs to run again is a decision, not a step.

`bun run test:e2e` is safe — it builds its own disposable database under the OS temp
directory and refuses to start otherwise. The plan's § 5 says what makes it safe and what
would make it dangerous again.
