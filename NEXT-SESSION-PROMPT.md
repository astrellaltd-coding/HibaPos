# The next sessions — Phase 7, then Phase 6

Two prompts. **Phase 7 runs first**, and it is its own session: the plan's rule is that a
phase boundary stops the work. Paste the block between the rules.

---

## SESSION 1 — Phase 7

HibaPOS France. Read `CLAUDE.md`, then `REMEDIATION_PLAN.md` in full — all of it, top to
bottom, before touching anything.

**Your job this session is Phase 7, and only Phase 7.** It is two rows, R7.1 and R7.2, in
§ 6. Phases 0 through 5 are complete and recorded in `REMEDIATION_DONE.md`. **Do not open
Phase 6** — it needs its own go-ahead.

**Why a phase numbered 7 runs before one numbered 6.** R7.1 changes what a Z report *seals*.
Zero closes exist today — `ZReport`, `DailyClose`, `MonthlyClose` and `AnnualClose` are all
at zero — so the sealed shape is still free to change. It freezes permanently at the
restaurant's first real close, and Phase 6 ends in real trading. Phase 7 has to land first.

**Four things you will not get from the files.**

1. **The decision in R7.1 is already made — do not re-open it.** The operator ruled on
   2026-09-11 that the give-away figures are to be **sealed** into the Z report, mirroring
   `topProductsJson`, rather than recomputed live or dropped. The reasoning is recorded in
   the row. Your job is to build it, not to relitigate which option was right.

2. **The migration is yours to prepare and rehearse, and the operator's to apply.** Snapshot
   to `../db-snapshots/`, apply to the copy, diff a fiscal fingerprint before and after, then
   hand over `bun scripts/apply-migration.ts --apply --expect <name>`. Not a bare `bunx prisma
   migrate deploy` — that prints the same green banner whichever migration it ran, and was
   twice misread as applied when it was not.

3. **Test what the ROUTE SENDS and what a Z report READS BACK out of the database.** A unit
   test on the aggregator proves the aggregator, not that a sealed Z report carries the
   figures. This has been the standing instruction all through the plan. The specific trap
   here: `GivenAway` in `reports-view.tsx` opens `if (!count) return null`, and `undefined` is
   falsy — which is exactly why this defect was invisible rather than loud. A test that
   asserts "the section is absent" would have passed against the bug. And **keep the X report
   working**: it computes give-aways live and is correct today.

4. **R7.2 is mine, not yours.** I am renaming the two products named `Coca` (1,50 € in
   *Canette*, 3,50 € in *Bouteilles*) to distinct names in the catalogue. Tell me when you
   want it done and what you need the names to satisfy; do not edit the live catalogue.

**Re-measure before you start.** § 4's figures were taken 2026-09-11 13:55, and I change the
catalogue between sessions.

**Stop at the end of Phase 7 and report.** Do not open Phase 6.

---

## SESSION 2 — Phase 6 (only after Phase 7 closes)

HibaPOS France. Read `CLAUDE.md`, then `REMEDIATION_PLAN.md` in full.

**Your job this session is Phase 6, and Phase 6 is the last one.** Five `OPERATOR` rows,
R6.1 to R6.5.

**Read `../HibaPOS-docs-archive/README.md` before the runbook beside it.** About two thirds
of `runbook-complet.md` is the Windows-till install withdrawn on 2026-09-10, and its
§§ 0/0a/0b/1/2/5 still give instructions that are wrong to follow. That README maps the
document section by section. The plan's § 1 carries the corrected R6.1–R6.5 → section table;
it was wrong until 2026-09-11, when it pointed R6.3 at the section that turns FACTICE *on*.

**Six things you will not get from the files.**

1. **Every row is the operator's to perform, and I am the operator.** Your job is to make
   each one safe to run: verify the precondition read-only, tell me exactly what to do, tell
   me what I should see if it worked, then verify it from the data — not from my report. I
   have twice believed a migration was applied when it was not.

2. **R6.1 is the irreversible one, and the database it empties is already empty.** All twelve
   trading tables are at zero and the counters are 0/0/0/0, because `pre-golive-reset.ts`
   already ran on 2026-09-10. The question is not « how do we run it » but **« does it still
   need to run, and what would it destroy if it did »**. It keeps the catalogue, the users,
   the settings and the audit log — verify that against the script rather than assuming it.
   Decide it with me before it runs.

3. **The order among R6.1, R6.2 and R6.3 is not a preference.** Arming `FISCAL_CHAIN_KEY`
   onto a journal holding unkeyed events is refused by design, so R6.2 follows R6.1. **R6.4
   and R6.5 are technical, not fiscal**, and can happen any time before the first sale —
   doing R6.4 before R6.3 is probably right, since nothing should be rung up for real before
   the printer works. Say so if you agree, and say why if you do not.

4. **I have no second volume attached yet (R6.5), and no backup off this machine.** Both
   verified backups sit on the same disk as the database they protect. Ask me for what you
   need — a path, a drive letter, a USB stick. Do not design around my absence.

5. **Test what is BOOKED and what the client SENDS.** If you assert the chain is keyed after
   R6.2, prove it from a fiscal event written *after* the arming and read back out of the
   database — not from the environment variable being set.

6. **Nothing you produce is evidence of French fiscal or legal compliance.** Not a passing
   test, not a verified chain, not a clean Z report. Do not write that it is, anywhere.

**Stop and report at the end.** If a row needs a decision from me rather than a command, stop
there and ask in plain language, with the trade-off — not a menu of options.

---

## Open behind both phases

`CLAUDE.md` is current as of 2026-09-11: it names `bun scripts/apply-migration.ts` as the
handover command, says the retired Windows-till *model* did not delete the `.zscripts/` files
`deployment.test.ts` pins, and records that `pre-golive-reset.ts` already ran.

**Eight findings will still be open after Phase 7**, none blocking a first sale:
L-84 · L-81 · L-75 · L-05 · L-11 · L-47 · L-51 · L-52. **None has an owner**, and once Phase 6
closes no item in the plan can pick one up. L-81 (`5 nuggets test`, a test product sitting in
the live catalogue) is a two-minute operator decision. L-52 is waiting on the French
administration to publish an archive format and cannot be started.

**Two items awaiting the operator**, in § 1: a backup off this machine, and the accountant's
written line on the VAT allocation method.

**The plan is 40 797 bytes against its 40 960-byte ceiling — 163 to spare.** Retire something
into `REMEDIATION_DONE.md` before adding anything. Do not raise the ceiling; it is what forced
this file to stay readable. Note that `wc -c` over-reads it on Windows because git checks the
file out with CRLF — the test normalises first, so measure with the normalised byte count.
