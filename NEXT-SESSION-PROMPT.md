# The next session

**Rewritten 2026-09-25.** The previous version queued four sessions against the audit; all but one
are closed. The old prompts are in git history.

One prompt per session. Paste the block between the rules, and nothing else.

---

## WHERE THINGS ACTUALLY STAND

**The France till is current and confirmed working.** It runs `81eb2f3`: 20 migrations, 86 products
with the Tacos, catalogue fingerprint **`a38c95977b5e1122`**, cut-off 0, and it boots itself
fullscreen. The owner confirmed by telephone on 2026-09-25 — the whole menu, the Tacos
configuration, and **printing**. That last one could never have been settled remotely, and it was
the same standard R6.4 was closed on: a person, in the restaurant, seeing paper.

**Both installs print the same fingerprint.** `a38c95977b5e1122` at 86 products is the expected
value; `b6a76daf0befc587` was this machine's before the Tacos photograph and is retired.

**The audit queue is down to decisions.** Closed on 2026-09-25: **L-225** (the option ceilings
travel), **L-226** (a catalogue can be emptied, so it can be imported), **L-232** (the photograph),
**L-206** (nothing recommends the forbidden command any more), **L-237** (marked disputed in the
file), and L-207's cheap half. **L-234 was closed as NOT a defect** after its fix was written,
measured and reverted.

**Nothing on the till is pending.** No migration, no code, no catalogue difference.

---

## SESSION A — the go-live, and it is the next real thing

HibaPOS France. Read `CLAUDE.md`, then `REMEDIATION_PLAN.md` § 1 and § 2, then the Phase 6 rows.

**This is the operator's sequence, not a session's**, and it runs on the FRANCE TILL. A session
prepares each step, verifies it afterwards, and records it. **The order is not a preference** —
arming the chain key before the reset makes the reset refuse.

1. **R6.1 — `pre-golive-reset.ts --apply` on the till.** It has a subject again: the till was reset
   to `0/0/0/0` on 2026-09-20 and the owner has been testing since, so his test sales are what must
   go for the first genuine receipt to be **#1**. Take a fresh backup to `D:` first and verify it
   with `decrypt-backup.ts`. Both Scheduled Tasks stopped.
2. **R6.2 — arm the chain key.** A button since 2026-09-11 (`POST /api/setup/chain-key`), not a
   `.env` edit. It refuses unless the journal is empty, and **shows the key once**. **Save it
   somewhere other than that machine** — lost, the journal can never be verified again.
3. **R6.3 — FACTICE off**, in Réglages. A MANAGER may do this one (DD-26 keeps it out of the
   SUPER_ADMIN-only list). **DD-27 applies from here**: once the journal holds a non-factice event,
   only a SUPER_ADMIN can turn the stamp back on.

**Also open before trading for real, and neither is code**: **`VAT-METHOD`** (§ 8 — the
accountant's written line on how a menu's forfait divides between rates) and **a fresh verified
backup off this machine**, which is the oldest open item in the plan.

**Do not claim fiscal compliance from any of it.** Not from a passing test, not anywhere.

---

## SESSION B — L-203, and the obvious fix has a trap in it

HibaPOS France. Read **L-203** in `docs/audit/FINDINGS.md`, then `src/instrumentation.ts:68-120`.

The launcher refuses to boot on a pending migration; PREP-4 would have applied it behind a backup
it verifies. Two parts of the system hold two positions, written eleven weeks apart, and nothing
reads both. **Since 2026-09-25 neither recommends a forbidden command** — that was L-206 — but the
disagreement itself is untouched.

**`DROP REFUSAL 2` IS NOT SUFFICIENT ON ITS OWN, and that is the whole difficulty.**
`instrumentation.ts` deliberately lets the application start when the gate REFUSES for want of a
verified backup — « a till that will not open tells the operator nothing ». So removing the
launcher's check leaves a till that boots and serves **new code against an old schema**, which is
the mid-sale failure refusal 2 exists to prevent. Closing this properly means deciding whether the
app should refuse to **serve**, not merely to migrate — a fiscal-behaviour change, so bring the
shapes and wait.

---

## SESSION C — the leftovers, none of them urgent

- **L-236** — two orphaned files on the till: `hibapos-server.ps1.ps1`, which nothing executes
  (both tasks were confirmed pointing at the proper paths), and `secrets.json.1192.tmp` from
  commissioning evening, 202 bytes against the real file's 275. **Read that one before deleting
  it** — it may hold partial secret material, and it is evidence a secret-store write failed that
  night.
- **L-207's other half** — the Scheduled Task names live in four places and no document states
  them. They are `HibaPOS Server` and `HibaPOS Kiosk`, measured on the till 2026-09-20.
- **The untested branch in the close route** — its `try/catch` around the day seal fires only if
  the walk throws. The print routes solved the identical problem for L-186 by accepting an injected
  printer; the close route can accept the sealing step the same way.

---

## What is NOT next, and why

- **The catalogue transfer has never been used against the France till.** It works — proved end to
  end on scratch copies, `a38c95977b5e1122` out the far side — but the first real menu change is
  its first real test and should be treated as one, not assumed.
- **`update.ps1` has never been run with `-Apply`.** Its dry run is rehearsed; its real path is
  not, and it now calls a script that refuses while any node or bun process is alive. Expect that
  refusal and know it is correct.
- **The repository is PUBLIC**, measured 2026-09-20. `.env` is untracked, no database, **no SIRET**
  — but the audit documents list open findings for a live POS. Whether it should be public is the
  operator's decision, not a defect.
- **Tauri v2** — still the shipping form, still without a plan.

## Four habits that paid for themselves, keep all of them

**A number handed forward as proof is a claim.** `2d62a6b83ba006bf` went into a hand-over as « the
proof it worked » and could not be reproduced at all. Anything that will be re-run on another
machine belongs in `scripts/`, with its method in the header.

**Rehearse on the conditions the TARGET has.** L-233 passed every rehearsal here and failed on its
first run in France, because this machine cannot make a WAL database — its data lives in OneDrive,
so `pragmaDecision` returns `CLOUD_SYNC` — and that till always has one.

**Measure before changing a guard.** L-234's fix was written, then measured, then reverted: the
defect did not exist and the change would have weakened a working check. The same discipline that
forbids a test which cannot fail forbids a fix which cannot be demonstrated.

**Strip the prose before asserting.** Six times now an assertion has matched a comment explaining
the bug, or a message forbidding a command, rather than the thing itself — L-146, L-191, L-213,
L-221, and twice on 2026-09-25. Pin the expression that decides, never a name or a sentence.
