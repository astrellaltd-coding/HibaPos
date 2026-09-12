# The next sessions — Phase 8, and Phase 6 behind it

**Rewritten 2026-09-12.** This file held prompts for *Phase 7, then Phase 6*. **Phase 7 closed
on 2026-09-11**, and Phase 6 is no longer "the last one" — the 2026-09 audit added Phases 8, 9
and 10, nineteen batches, and **R8.1 blocks two of Phase 6's five rows**. The old prompts are
in git history if anyone wants them; keeping them here would have pointed the next session at
finished work.

One prompt per session. Paste the block between the rules, and nothing else.

---

## SESSION 1 — R8.1, the row that unblocks Phase 6

HibaPOS France. Read `CLAUDE.md`, then `REMEDIATION_PLAN.md` in full — all of it, top to
bottom — then `docs/audit/FINDINGS.md`, at least its verdict, View A group A and View B.

**Your job this session is R8.1 and only R8.1.** Two findings, one area:

- **L-93** — `settingsSchema` materialises `factice: false` and `printerConnection: "network"`
  where `DEFAULT_SETTINGS` answers `true` and `"usb"`, and `saveSettings` merges present keys
  over stored ones. A settings save that merely *omits* `factice` therefore performs R6.3 —
  turns the fiscal simulation stamp off — silently. Both defaults are pinned separately and
  **nothing asserts they agree**.
- **L-101** — `nav-config.ts:60` gives MANAGER the Réglages screen with an enabled save button;
  `settings/route.ts:25` refuses every non-SUPER_ADMIN a 403. The MANAGER is the only account
  that will be at the till in France.

**Do them in that order.** Reconciling the defaults first is not a preference: opening the
write to MANAGER before the two tables agree hands a till operator a route that can flip
`factice` by omission.

**L-101 carries a decision that is the operator's, not yours.** Either open the write to
MANAGER (matching the nav comment and DD-07), or split it so the printer and FACTICE fields
are MANAGER-writable and the identity fields are not. **Do not fix it by hiding the screen** —
that leaves R6.3 and R6.4 unreachable without the developer's account. Bring the choice and
wait.

**What "done" looks like.** A test that parses an empty settings input and asserts every
materialised key equals `DEFAULT_SETTINGS`; the role decision implemented; and a test that
drives `PUT /api/settings` as a MANAGER and asserts the agreed outcome. `PUT /api/settings` is
invoked by **no test in either suite** today, which is half of why this got here.

**Re-measure before you start.** The baselines are in `docs/BASELINES.md` now, not in the
plan's § 4 — the section moved 2026-09-12. They were last taken that day and the operator
changes the catalogue between sessions.

**Stop at the end of R8.1 and report.** Do not roll into R8.2.

---

## SESSION 2 — Phase 6, once R8.1 has landed

HibaPOS France. Read `CLAUDE.md`, then `REMEDIATION_PLAN.md` in full.

**Phase 6 is the fiscal go-live: five `OPERATOR` rows, R6.1 to R6.5.** They are the operator's
to run, not yours — your job is to prepare, rehearse, verify and hand over exact commands.

**Check the blockers are actually gone before anything else.** R6.3 and R6.4 were blocked on
**L-101** (fixed in session 1) and R6.4 additionally on **L-96** — the USB print helper is
resolved from `process.cwd()` and `powershell.exe -File <missing>` exits 0, so a helper that
never runs is written to the database as `PRINTED`. **If L-96 is still open, R6.4 cannot be
trusted even once the queue is chosen**, and choosing it proves nothing.

Order is not a preference: **R6.1 → R6.2 → R6.3.** Arming the chain key before the reset makes
the reset refuse. R6.4 and R6.5 are technical and can happen at any point before the first
sale.

**Re-measure before you start** — `docs/BASELINES.md`.

---

## Behind both

- **R6.1 would delete 0 rows today.** Every trading table is at zero and the counters are
  0/0/0/0. Whether it needs to run again is a decision, not a step.
- **§ 7's nine findings are unchanged** and none of them blocks a first sale. The audit's 94
  are in `docs/audit/FINDINGS.md` and are **not** in § 7 — § 6 carries their ids and nothing
  else.
- **Group A is the rest of Phase 8**, and R8.2 and R8.5 are both migrations. A migration on a
  database that has never traded is far cheaper than one on a database that has.
- **The loop is `REMEDIATION_PLAN.md` § 2**, unchanged: one item, three gates, commit, push,
  move the row into `REMEDIATION_DONE.md`, update *Current task*, stop.
