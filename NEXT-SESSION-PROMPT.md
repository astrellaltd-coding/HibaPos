# The next session

**Rewritten 2026-09-26.** The go-live is **postponed** — the owner is still testing. **The work
follows his feedback from here**, starting with the printed paper. Before that, one session to
check where the plan actually stands. The old prompts are in git history.

One prompt per session. Paste the block between the rules, and nothing else.

---

## WHERE THINGS STAND

**The France till is current and confirmed working**, running `81eb2f3`: 20 migrations, 86 products
with the Tacos, catalogue fingerprint **`a38c95977b5e1122`**, cut-off 0, boots itself fullscreen.
The owner confirmed the menu, the Tacos configuration and **printing** by telephone on 2026-09-25.
**Nothing is pending on either machine.** Both installs print the same fingerprint.

**The audit queue is down to decisions.** Closed 2026-09-25: L-225, L-226, L-232, L-206, L-237 and
L-207's cheap half; **L-234 closed as not a defect**. What remains is L-203 (a decision with a trap
in it), L-236, and L-207's other half.

**THE GO-LIVE IS NOT NEXT.** R6.1 → R6.2 → R6.3 wait on the owner's feedback. Do not start them, do
not arm the chain key, do not turn FACTICE off.

---

## SESSION A — where are we, and is anything stale

HibaPOS France. Read `CLAUDE.md`, then `REMEDIATION_PLAN.md` top to bottom, then
`docs/audit/FINDINGS.md`.

**A state audit, and nothing else.** The project has moved fast for a week and the documents have
been corrected four times in it — L-227, L-231, L-234 and two more on 2026-09-26 — each time
because a sentence outlived what it described. **Read the plan and the findings against the code
and the database, and report what no longer matches.** Do not fix what you find in the same
session unless it is a one-line correction; record it and bring it.

**What to check, and the method is `CLAUDE.md`'s: verify against the CODE, never the prose.**

- **§ 1's status claims.** Every one that names a number, a state or a machine. The plan has twice
  asserted both halves of a contradiction — a paragraph held for `docs/INVARIANTS.md` that had
  already landed, and « no migration is waiting » while one was.
- **Finding statuses.** Every row marked FIXED, and every row NOT marked fixed. L-234 was closed
  as *not a defect* after its fix was written and measured; that shape can happen again.
- **The two machines.** `bun scripts/catalogue-fingerprint.ts` here should print
  **`a38c95977b5e1122` / 86 products**; `db/custom.db` should be at `0/0/0/0` with FACTICE on and
  the cut-off at 0. **The till is the operator's to measure** — ask, do not assume. The owner has
  been testing, so its journal holds factice events and **how many is not known**.
- **The byte ceiling.** `plan-freshness.test.ts` enforces 40 960 and has failed three commits this
  week. If the plan is near it, retire history into `REMEDIATION_DONE.md` **verbatim with
  provenance** — never summarise it away.
- **The three gates**, and read the exit codes rather than the tail: `bun run test` ·
  `bun run typecheck` · `bun run lint`. Expect **2101 pass / 0 fail / 161 files**.

**Then stop and report.** The next work comes from the owner, not from this list.

---

## SESSION B — the printed paper, on the owner's asks

HibaPOS France. Read `docs/INVARIANTS.md` § *Printing and interface*, then
`src/lib/services/receipt.ts` and `ticket-layout.ts`.

**This is the first thing the operator wants tweaked once the owner reports back**, and it is the
most fiscally sensitive surface in the application. **Wait for the actual asks** — do not redesign
the ticket on a guess.

**THREE THINGS TO KNOW BEFORE CHANGING A SINGLE LINE OF IT:**

1. **The paper IS the document.** `Receipt.content` is sealed — nothing in the application
   rewrites it, and `buildAnnualArchive` copies it verbatim into the archive for the exercice.
   `docs/INVARIANTS.md`: « **An archived `Receipt.content` is never re-rendered.** It is the
   document that was issued. » So a layout change applies to **future** tickets only, and past
   ones keep the shape they were issued in. That is correct and must not be "fixed".
2. **One layout module, three renderers.** « **No line any ticket renderer emits may exceed the
   paper.** `services/ticket-layout.ts` is shared by all three — change it there or not at all.
   **Nothing is ever truncated**; it wraps. » A change made in one renderer and not the module is
   the bug that invariant exists to prevent.
3. **It is heavily pinned, and that is a feature.** ~156 tests across `ticket-layout.test.ts` (18),
   `receipt.test.ts` (61), `receipt-combo.test.ts` (14), `escpos.test.ts` (24),
   `receipt-printable.test.tsx` (12), `day-close-print.test.ts` (12), `delivery-note.test.ts` (15),
   **plus a snapshot** at `src/lib/services/__snapshots__/receipt.test.ts.snap`. **The snapshot is
   the record of what the paper looked like** — when it changes, read the diff line by line and say
   in the commit what moved and why. Never accept it blind.

**And what already went on the paper, so an ask is not re-litigated:** the delivery address and
telephone are **deliberately not** on the sealed ticket — they go on the non-fiscal **bon de
livraison** (`delivery-note.ts`), printed for the driver and never stored. That was the operator's
decision and `receipt.ts:185` records the reasoning.

**Do not claim fiscal or legal compliance for any layout**, whatever a test says. If an ask touches
a legally required mention, that is a question for the accountant, alongside the open
**`VAT-METHOD`** line in § 8.

---

## SESSION C — the small leftovers, if the owner is quiet

- **L-236** — `hibapos-server.ps1.ps1` on the till, which nothing executes, and
  `secrets.json.1192.tmp` from commissioning evening (202 bytes against the real file's 275).
  **Read the second before deleting it** — it may hold partial secret material.
- **L-207's other half** — the Scheduled Task names live in four places and no document states
  them: `HibaPOS Server` and `HibaPOS Kiosk`, measured on the till 2026-09-20.
- **L-203** — the launcher refuses to boot on a pending migration; PREP-4 would have applied it.
  **`DROP REFUSAL 2` IS NOT SUFFICIENT ON ITS OWN**: `instrumentation.ts` deliberately lets the app
  start when the gate REFUSES for want of a verified backup, so removing the check leaves a till
  serving **new code against an old schema** — the mid-sale failure refusal 2 exists to prevent.
  Closing it means deciding whether the app should refuse to **serve**. Bring both shapes and wait.
- **The untested branch in the close route** — its `try/catch` around the day seal fires only if
  the walk throws. The print routes solved it for L-186 with an injected printer.

---

## What is NOT next, and why

- **The go-live.** Postponed — the owner is still testing.
- **The catalogue transfer has never been used against the France till.** It works, proved end to
  end on scratch copies, but the first real menu change is its first real test.
- **`update.ps1` has never been run with `-Apply`.**
- **The repository is PUBLIC**, measured 2026-09-20. No `.env`, no database, **no SIRET** — but the
  audit documents list open findings for a live POS. The operator's decision, not a defect.

## Four habits that paid for themselves, keep all of them

**A number handed forward as proof is a claim.** `2d62a6b83ba006bf` went into a hand-over as « the
proof it worked » and could not be reproduced at all. Anything re-run on another machine belongs in
`scripts/`, with its method in the header.

**Rehearse on the conditions the TARGET has.** L-233 passed every rehearsal here and failed on its
first run in France, because this machine cannot make a WAL database and that till always has one.

**Measure before changing a guard.** L-234's fix was written, measured, and reverted: the defect
did not exist and the change would have weakened a working check.

**Strip the prose before asserting.** Six times an assertion has matched a comment explaining the
bug, or a message forbidding a command, rather than the thing itself. Pin the expression that
decides, never a name or a sentence.
