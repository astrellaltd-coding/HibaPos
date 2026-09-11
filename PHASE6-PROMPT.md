# Phase 6 — the prompt for the new session

Paste everything between the rules into a fresh session.

---

HibaPOS France. Read `CLAUDE.md`, then `REMEDIATION_PLAN.md` in full — all of it, top to
bottom, before touching anything.

**Your job this session is Phase 6, and Phase 6 is the last one.** Phases 0 through 5 are
complete, applied and recorded in `REMEDIATION_DONE.md`. § 6 of the plan now holds nothing
but five `OPERATOR` rows, R6.1 to R6.5.

**Read `../HibaPOS-docs-archive/README.md` before you read the runbook beside it.** About two
thirds of `runbook-complet.md` is the Windows-till install that was withdrawn on 2026-09-10,
and its §§ 0/0a/0b/1/2/5 still give instructions that are actively wrong to follow. That
README maps the document section by section, live against withdrawn. The plan's § 1 carries
the corrected R6.1–R6.5 → runbook-section table; it was wrong until 2026-09-11, when it sent
R6.3 to the section that turns FACTICE *on*.

**Six things you will not get from the files.**

1. **Every one of the five rows is the operator's to perform, and I am the operator.** Your
   job is not to run them. It is to make each one safe to run: verify the precondition
   against the live database read-only, tell me exactly what to click or type, tell me what I
   should see if it worked, and verify it afterwards from the data rather than from my
   report. I have twice believed a migration was applied when it was not, which is why
   `scripts/apply-migration.ts` exists.

2. **R6.1 is the irreversible one, and the database it empties is already empty.** All twelve
   trading tables are at zero and the counters are 0/0/0/0, because `pre-golive-reset.ts`
   already ran on 2026-09-10. So the question for this session is not « how do we run it » but
   **« does it still need to run at all, and what would it destroy if it did »** — the
   catalogue, the users, the settings and the audit log are the things it keeps, and I want
   that verified against the script rather than assumed. Decide it with me before it runs. If
   we do run it, it runs once and never after a genuine sale.

3. **The order among R6.1, R6.2 and R6.3 is not a preference.** Arming `FISCAL_CHAIN_KEY`
   onto a journal that already holds unkeyed events is refused by design, so R6.2 must follow
   R6.1. R6.3 — FACTICE off — is the point every rule tightens, and nothing should be rung up
   for real before the printer works. **R6.4 and R6.5 are technical, not fiscal**, and can be
   done at any point before the first sale. Doing R6.4 *before* R6.3 is probably right; say so
   if you agree, and say why if you do not.

4. **I have no second volume attached yet (R6.5), and no copy of a backup off this machine.**
   Both verified backups sit on the same disk as the database they protect. This is the oldest
   open item in the plan and the only one that is about *losing* data rather than getting
   something wrong. Ask me for what you need — a path, a drive letter, a USB stick. Do not
   design around my absence.

5. **Test what is BOOKED and what the client SENDS.** A unit test on a rule proves the rule,
   not that anything invokes it. This has been the standing instruction all through the plan
   and it does not relax because the phase is operational: if you assert that the chain is
   keyed after R6.2, prove it from a fiscal event written *after* the arming, read back out of
   the database — not from the fact that the environment variable is set.

6. **Nothing you produce is evidence of French fiscal or legal compliance.** Not a passing
   test, not a verified chain, not a clean Z report. Do not write that it is, anywhere.

**Before you start, re-measure.** The plan's § 4 says to, and it is right: I work in parallel
and change the catalogue between sessions. The last measurement was 2026-09-11 13:55.

**Stop and report at the end of Phase 6.** If a row turns out to need a decision from me
rather than a command, stop at that row and ask — in plain language, with the trade-off, not
a menu of options.

---

## Open at handover — not part of Phase 6, but do not lose them

**Three claims in `CLAUDE.md` are stale, and that file needs the operator's approval to
change.** The exact replacement text is prepared in this session's final report. The most
important is line 34: it still names `bunx prisma migrate deploy` as the handover command,
which is the command this project deliberately stopped using.

**Ten open findings**, none blocking a first sale, in the plan's § 7:
L-82 · L-83 · L-84 · L-81 · L-75 · L-05 · L-11 · L-47 · L-51 · L-52.
**No owner names any of them**, and when Phase 6 closes there will be no item left in the
plan that could pick one up. That is worth deciding rather than inheriting.

**Two items awaiting the operator**, both in § 1: a copy of a verified backup off this
machine, and the accountant's written line on the VAT allocation method (`VAT-METHOD`).

**The plan is 40 589 bytes against its 40 960-byte ceiling** — 371 to spare. The next
session to add anything substantial to it must retire something into `REMEDIATION_DONE.md`
first. That is what the ceiling is for; do not raise it.
