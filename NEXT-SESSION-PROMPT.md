# The next sessions — R8.0, R9.6 + R8.1, then Phase 6

**Rewritten 2026-09-12.** This file held prompts for *Phase 7, then Phase 6*. **Phase 7 closed
on 2026-09-11**, and Phase 6 is no longer "the last one" — the 2026-09 audit added Phases 8, 9
and 10, twenty batches, and **R8.1 blocks two of Phase 6's five rows**. The old prompts are
in git history if anyone wants them; keeping them here would have pointed the next session at
finished work.

One prompt per session. Paste the block between the rules, and nothing else.

---

## SESSION 0 — R8.0, five minutes, its own commit

HibaPOS France. Read `CLAUDE.md`, then `REMEDIATION_PLAN.md` § 1 and § 2.

**Add `.gitattributes` at the repository root containing `* text=auto eol=lf`, and commit
nothing else.** `core.autocrlf=true` is set and there is no attributes file, so a fresh
checkout writes CRLF — which makes `restore-swap.test.ts` fail outright and
`pos-resilience.test.ts:104` pass vacuously. **Any clone of this repository currently starts
red.** That is L-124, reproduced by the audit, not predicted.

Verify by reproducing a checkout into a scratch directory (`git checkout-index --prefix=…`)
and confirming the file lands LF. Then the three gates, then commit, then stop.

---

## SESSION 1 — R9.6, then R8.1

HibaPOS France. Read `CLAUDE.md`, then `REMEDIATION_PLAN.md` in full — all of it, top to
bottom — then `docs/audit/FINDINGS.md`, at least its verdict, View A group A and View B.

**Do R9.6 first.** `api-authorization.test.ts`'s inline-guard detector is
`/user\.role\s*!==\s*"SUPER_ADMIN"/`, which matches a **widened** guard
(`… && user.role !== "MANAGER"`) exactly as well as a narrow one — so a route can be opened to
every role with the suite green. Classify the two forms separately and re-pin the counts at
`:407`. **This must precede R8.1**, because R8.1 changes `settings:PUT`'s guard and moves that
very count (L-120, L-151).

**Then R8.1, and only R8.1.** Two findings, one area:

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

**L-101's decision is already made — DD-26 and DD-27 in `docs/DECISIONS.md`. Implement them;
do not re-open them.**

- **DD-26 — split `PUT /api/settings` by FIELD, not by role.** MANAGER may write the
  operational fields: `printerName`, `printerConnection`, `printerQueue`, `printerHost`,
  `printerPort`, `printerEnabled`, `openDrawerOnCash`, `receiptWidth`, `autoPrint`, `factice`.
  SUPER_ADMIN only for identity and fiscal policy: `restaurantName`, `restaurantAddress`,
  `restaurantPhone`, `restaurantSiret`, `restaurantTva`, `footerNote`, `currency`,
  `defaultVatRate`, `discountApprovalThreshold`, `businessDayCutoffHour`.
- **DD-27 — FACTICE is one-way once anything real has been sold.** MANAGER may turn it off
  (that is R6.3). Turning it back **on** is refused once the journal holds a non-factice
  event; **SUPER_ADMIN is excepted**. Before the first real sale it toggles freely, which is
  what this machine needs during testing. No such guard exists today.

**Do not fix L-101 by hiding the screen** — that leaves R6.3 and R6.4 unreachable without the
developer's account.

**What "done" looks like.** A test that parses an empty settings input and asserts every
materialised key equals `DEFAULT_SETTINGS`; DD-26's field split and DD-27's one-way guard
implemented; a test driving `PUT /api/settings` as a MANAGER that asserts an operational field
is written and an identity field is refused; and a test that a MANAGER cannot re-enable
`factice` against a journal holding a real event, while a SUPER_ADMIN can.
`PUT /api/settings` is invoked by **no test in either suite** today, which is half of why this
got here.

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
- **Group A is the rest of Phase 8**, and R8.2 and R8.5 are both migrations. **R9.2 — the
  startup migration gate — lands before them**: a fresh install applies every migration through
  a gate that currently reports a failed one as applied. A migration on a database that has
  never traded is far cheaper than one on a database that has.
- **The loop is `REMEDIATION_PLAN.md` § 2, and it grew a step on 2026-09-12.** Step 3 is now
  « prove the new test FAILS against the old code before you commit » — revert one property at
  a time, watch it go red, restore, and say in the commit message what you reverted. The audit
  found four tests that cannot fail against the bug they are named for; green is not evidence.
