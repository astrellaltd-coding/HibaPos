# The next session

**Rewritten 2026-09-20, after the France till was brought current.** The previous version was one
long Session A for that update. It is done; its record is in `REMEDIATION_DONE.md` under « THE
FRANCE TILL IS CURRENT ». The old prompt is in git history.

One prompt per session. Paste the block between the rules, and nothing else.

---

## WHAT CHANGED WHILE YOU WERE AWAY, IN ONE PARAGRAPH

**The France till is current.** On 2026-09-20 it went from code dated 2026-09-16 to `81eb2f3`: 20
migrations, **86 products with the Tacos**, catalogue fingerprint **`b6a76daf0befc587`** identical
to the development machine's, trading-day cut-off **0**, server answering. It gained the on-screen
keyboard, the `city` column and the bon de livraison, the option ceilings, the trading-day guards
and the auto-seal — about fifty commits. **The blocker that held it up for four days did not
exist**: git was already installed on that machine and the repository is public, so the token
nobody had was never needed. One defect was found on the till and fixed mid-operation (**L-233**),
and four more were opened (**L-234, L-235, L-236, L-237**).

---

## SESSION A — L-234, and it should come before the next update

HibaPOS France. Read `CLAUDE.md`, then `REMEDIATION_PLAN.md` § 1 and § 2, then **L-233 and L-234**
in `docs/audit/FINDINGS.md` and the commit `81eb2f3`.

`apply-migration.ts` refuses a `-wal` on its **existence** rather than its content. A **read-only**
connection cannot clean up on close, so every run of `catalogue-fingerprint.ts` leaves
`custom.db-wal` at exactly **0 bytes** — a log with no pages, beside a database that is therefore
whole. The 2026-09-20 update survived only because the commands happened to run in the order
apply-then-fingerprint; the other way round, which is what a session wanting to know what it is
about to change would naturally do, it refuses. **And its refusal text points the operator at
`update.ps1 -Apply`**, the command `CLAUDE.md` forbids (L-206) — so a spurious refusal actively
recommends the forbidden path.

`81eb2f3` is the same fix, one file over, already reviewed: check before the first query, refuse a
`-wal` only when `size > 0` naming the bytes, keep `-journal` on existence, checkpoint before the
restore-point copy. **Do not simply delete the check** — it is what stands between a restore point
and half a database.

**REHEARSE IT ON A WAL DATABASE.** This machine cannot produce one: the development database lives
inside OneDrive, so `pragmaDecision` returns `CLOUD_SYNC` and WAL is never enabled. That is exactly
why L-233 passed every rehearsal here and failed on the first run in France. Force a scratch copy
into WAL mode and test there — `PRAGMA journal_mode = WAL`, then a write, then close.

---

## SESSION B — the three Tacos have no photograph (L-232)

HibaPOS France. Read **L-232** in `docs/audit/FINDINGS.md`.

80 of 86 products carry an image. The six that do not are the three Tacos and the three « sans
boisson » box variants — and the boxes are `showOnPos = 0`, so **the Tacos are the only tile a
cashier sees with no photograph**, on both installs. `Tacos.webp` is in version control and reaches
every install with the code; the médiathèque finds it by walking the uploads directory. Nothing
points a row at it.

**It is six operator edits, three per install, and the ORDER matters.** `image` is one of the
columns `catalogue-fingerprint.ts` compares, so attaching the photo **changes the number** —
`b6a76daf0befc587` stops being the expected value the moment the first machine is edited. Do both,
then re-run the fingerprint on both and confirm they still agree. Doing one and stopping leaves the
two catalogues genuinely different with nothing recording it.

---

## SESSION C — the catalogue transfer, half-built

HibaPOS France. Read **L-225, L-226** in `docs/audit/FINDINGS.md`.

`catalogue-transfer.ts` exists and is the right way to carry a menu. It cannot be used: the option
**ceilings do not travel** (`CATALOGUE_TABLES` omits `ProductOptionQuota`, and the test pins the
list at ten so a missing TABLE is invisible), and the import **refuses unless the catalogue is
empty** with nothing able to empty one. Fixing both turns « a script per change » into « export
here, import there » for ever after — which is what the 2026-09-20 update had to do by hand.

---

## SESSION D — `.zscripts/`, and it has three open items

HibaPOS France. Read **L-203, L-206, L-207, L-236, L-237** in `docs/audit/FINDINGS.md`.

**L-203** the launcher refuses to boot on a pending migration, for a reason the app stopped
believing when PREP-4 made it apply them itself. Dormant on the till today — `migrate status` exits
0 — and live again the moment a migration is prepared and not applied. **It needs a decision before
code**: should the launcher stop refusing and let the app apply, or keep refusing with advice that
does not point at a broken script? Bring both shapes. **L-206** `update.ps1` applies migrations with
the bare `bunx prisma migrate deploy`. **L-207** the task names are a contract nothing states.

**L-237 is cheap and wants the owner's eyes, not code.** The till ran the pre-decision kiosk
launcher for four days and the operator reports it worked — which contradicts the measurement in
`c9e3ffd`'s own comment. `--kiosk` went on with the update; the previous file is at
`%TEMP%\hibapos-kiosk.ps1.till-version`. **Look at the physical screen**, not RDP, where the session
resolution is not the panel's (L-211). Whichever wins, correct the losing comment.

**L-236** is two orphaned files on the till: `hibapos-server.ps1.ps1`, which nothing executes, and
`secrets.json.1192.tmp` from commissioning evening, which may hold partial secret material.

---

## What is NOT next, and why

- **Phase 6** — R6.1 reset, R6.2 arm the chain key, R6.3 FACTICE off. All `OPERATOR`, in that
  order. **R6.1 may no longer have a subject**: the till's trading tables were never reset, but the
  owner has only ever tested under FACTICE. Measure before assuming it must run.
- **The repository is PUBLIC**, measured 2026-09-20. `.env` is untracked, no database, **no SIRET**
  — but the audit documents list open unfixed findings for a live POS. The documents call it
  private. Whether it should be is the operator's decision, not a defect to fix.
- **The untested branch in the close route.** Its `try/catch` around the day seal fires only if the
  walk throws. The print routes solved the identical problem for L-186 by accepting an injected
  printer; the close route can accept the sealing step the same way.
- **Tauri v2** — still the shipping form, still without a plan.

## Three habits that paid for themselves this week

**A number handed forward as proof is a claim.** `2d62a6b83ba006bf` went into a hand-over as « the
proof it worked » and could not be reproduced at all — the script was a scratch file, and being
id-inclusive it could never have matched rows `add-tacos.ts` creates with fresh `cuid()`s. Anything
that will be re-run on another machine belongs in `scripts/`, with its method in the header.

**Rehearse on the conditions the target has, not the ones you have.** L-233 passed every rehearsal
here and failed on the first run in France, because this machine cannot make a WAL database and
that till always has one.

**The shell corrupts edits silently here.** Backticks inside a double-quoted bash string are command
substitution; `\\` in a quoted heredoc collapses to `\`; and `cmd | tail && echo "clean"` tests
`tail`. Write the script with the Write tool and run it by path. **And never put a `<PLACEHOLDER>`
in a command somebody is going to paste** — one was, and it was pasted verbatim into `Copy-Item`.
