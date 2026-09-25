# The next session

**Rewritten 2026-09-25, second time that day.** The go-live is **postponed** — the owner is still
testing and the operator is waiting for his feedback — so the queue that led with R6.1 is not what
comes next. The old prompts are in git history.

One prompt per session. Paste the block between the rules, and nothing else.

---

## WHERE THINGS STAND

**The France till is current and confirmed working**, running `81eb2f3`: 20 migrations, 86 products
with the Tacos, catalogue fingerprint **`a38c95977b5e1122`**, cut-off 0, boots itself fullscreen.
The owner confirmed the menu, the Tacos configuration and **printing** by telephone on 2026-09-25.
**Nothing is pending on either machine** — no migration, no code, no catalogue difference. Both
installs print the same fingerprint.

**The audit queue is down to decisions.** Closed 2026-09-25: L-225, L-226, L-232, L-206, L-237 and
L-207's cheap half; **L-234 closed as not a defect**. What remains is L-203 (a decision with a trap
in it), L-236 (two orphaned files on the till), and L-207's other half.

**THE GO-LIVE IS NOT NEXT.** R6.1 → R6.2 → R6.3 wait on the owner's feedback. Do not start them, do
not arm the chain key, do not turn FACTICE off. When it does happen the order is a rule, not a
preference: arming the key before the reset makes the reset refuse.

---

## SESSION A — the clear-out, and it needs measuring before it needs deleting

HibaPOS France. Read `CLAUDE.md`, then `REMEDIATION_PLAN.md` § 1 and § 2.

**The operator's instruction, 2026-09-25:** a great deal has been fixed, and the documents and
scripts describing those fixes are now clutter. Find what is genuinely dead and remove it.

**THE TENSION IS REAL AND MUST BE NAMED BEFORE ANYTHING IS DELETED.** This repository's own rules
push the other way, and they were written for reasons that are recorded:

- `CLAUDE.md` says the six audit pass files **are evidence** and « are left as written ».
- `scripts/README.md` opens by recording that its old header said « Safe to delete after running »,
  that **this was not true**, and that the sentence is gone — `seed-users.ts` is the only way back
  into a till whose PIN is lost, `decrypt-backup.ts` the only way into a backup when the app will
  not start.
- The operator « cares about not losing evidence more than about tidiness », and the plan's method
  is « moved text kept verbatim with provenance ».

So the shape of this session is **measure → propose → delete what the operator approves**, not
delete-then-report. **Bring a list with sizes and reasons and wait.** Where something is dead,
prefer RETIRING it into `REMEDIATION_DONE.md` with provenance over deleting it outright, which is
what §§ 3, 4 and 9 of the plan already did.

### Measured on 2026-09-25, so the session does not start from zero

**Four documents no test reads**, which is the cheapest signal that nothing depends on them:

| file | bytes | referenced by |
|---|---|---|
| `IMPLEMENTATION_PLAN.md` | 33 147 | `FINDINGS.md`, and a **code comment** in `maintenance.ts:11` citing `:15` |
| `docs/CHANGES-LOG.md` | 36 378 | `README.md`, `REMEDIATION_DONE.md`, `delete-product.ts` |
| `docs/AUDIT-PROMPTS.md` | 29 007 | `README.md`, `docs/audit/README.md` |
| `docs/verification-8.1-2026-09-06.txt` | small | `README.md` |

`IMPLEMENTATION_PLAN.md` is the strongest candidate and says so itself: its own header reads « a
**historical record of what was believed on 2026-08-29** » under « ⚠ READ APPENDIX D BEFORE
TRUSTING ANY LINE IN THIS FILE ». **A document that warns you not to trust it is not a plan.** The
only thing standing in the way is a citation in `maintenance.ts`, which needs replacing with the
fact rather than the pointer.

**Seven one-off scripts, all already applied on both machines** (192 KB across `scripts/` in
total): `add-tacos.ts` (17 751), `build-box-menus.ts` (15 079), `trim-catalogue-names.ts` (8 213),
`set-tacos-image.ts` (9 130), `set-option-quotas.ts` (7 858), `set-drink-vat-rates.ts` (4 897),
`fix-duplicate-product-options.ts` (2 693). **These are a different class from the standing tools**
— they were each written to make one change once, and since 2026-09-25 the catalogue transfer does
that job generically. **But `scripts-docs.test.ts` pins the index**, so each removal is also a
README row, and each one is a record of a catalogue decision somebody took.

**Three `.zscripts` files that nothing runs**, and one of them is a hazard:

- `dev.ps1` — **runs `db:deploy` and `db:seed` when `db/custom.db` is absent**, which the plan's
  § 5 marks « ❌ Never, from this directory ». It is a loaded gun in a tracked folder.
- `start.ps1` — superseded by `hibapos-server.ps1`.
- `build.ps1` — L-209: announces a success it never checks.
- (`install-windows.ps1` is a separate question: France was registered by hand, L-207.)

`deployment.test.ts` pins all eight `.ps1` files, so removing any means the test changes with it.

### What is NOT a candidate, and why

`REMEDIATION_DONE.md` (469 KB) and `docs/audit/FINDINGS.md` (262 KB) are the two largest files and
the two that must stay. FINDINGS **is the work list** — `CLAUDE.md` says so in its second
instruction — and DONE is the audit trail this project is built on. The six `docs/audit/pass-*.md`
files are evidence, one with a PIN caviardé. `docs/conformite-*` and `attestation-conformite.md`
touch fiscal claims and are not a session's to judge.

**If either of the big two is genuinely to be trimmed, that is its own decision and its own
session**, with a proposal in front of the operator first.

---

## SESSION B — L-203, and the obvious fix has a trap in it

HibaPOS France. Read **L-203** in `docs/audit/FINDINGS.md`, then `src/instrumentation.ts:68-120`.

The launcher refuses to boot on a pending migration; PREP-4 would have applied it behind a backup
it verifies. Two positions, written eleven weeks apart, and nothing reads both. Since 2026-09-25
neither recommends a forbidden command — that was L-206 — but the disagreement is untouched.

**`DROP REFUSAL 2` IS NOT SUFFICIENT ON ITS OWN.** `instrumentation.ts` deliberately lets the
application start when the gate REFUSES for want of a verified backup — « a till that will not open
tells the operator nothing ». So removing the launcher's check leaves a till that boots and serves
**new code against an old schema**, the mid-sale failure refusal 2 exists to prevent. Closing this
means deciding whether the app should refuse to **serve**, not merely to migrate — a
fiscal-behaviour change, so bring both shapes and wait.

---

## SESSION C — the small leftovers

- **L-236** — `hibapos-server.ps1.ps1` on the till, which nothing executes, and
  `secrets.json.1192.tmp` from commissioning evening (202 bytes against the real file's 275).
  **Read the second before deleting it**: it may hold partial secret material, and it is evidence
  that a secret-store write failed that night.
- **L-207's other half** — the Scheduled Task names live in four places and no document states
  them. They are `HibaPOS Server` and `HibaPOS Kiosk`, measured on the till 2026-09-20.
- **The untested branch in the close route** — its `try/catch` around the day seal fires only if
  the walk throws. The print routes solved the identical problem for L-186 with an injected
  printer; the close route can take the sealing step the same way.

---

## What is NOT next, and why

- **The go-live.** Postponed on the operator's word — the owner is still testing.
- **The catalogue transfer has never been used against the France till.** It works, proved end to
  end on scratch copies, but the first real menu change is its first real test.
- **`update.ps1` has never been run with `-Apply`.** Its dry run is rehearsed; its real path is
  not, and it now calls a script that refuses while any node or bun process is alive.
- **The repository is PUBLIC**, measured 2026-09-20. No `.env`, no database, **no SIRET** — but the
  audit documents list open findings for a live POS. The operator's decision, not a defect.
- **Tauri v2** — still the shipping form, still without a plan.

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
