# The next session

**Rewritten 2026-09-20.** The previous version held prompts for L-218 and L-221 + L-222. **Both
closed on 2026-09-19**, along with L-223, L-224 and L-228 — that session ran long and did six items.
The old prompts are in git history.

One prompt per session. Paste the block between the rules, and nothing else.

---

## WHAT CHANGED WHILE YOU WERE AWAY, IN ONE PARAGRAPH

The restaurant's till was found **open for 48 hours** on 2026-09-19. The half nobody had noticed is
that **no fiscal day could be sealed at all** meanwhile. So the trading day is now a rule the till
enforces — it refuses a sale into a sealed day, refuses a sale through a caisse whose day has ended,
and refuses to open a caisse while an ended day is unsealed — and **closing the caisse now seals the
day**, which needed a narrow, flagged bypass of the premature-close guard rather than relaxing it.
Separately, a client gained a `city` column and a delivery now prints a **non-fiscal bon de
livraison** so the sealed ticket need not carry a home address. **Nothing has reached France.**

---

## SESSION A — the France till update, and it is the one that matters

HibaPOS France. Read `CLAUDE.md`, then `REMEDIATION_PLAN.md` § 1 and § 2, then the two entries
**« The Tacos, carried to France »** and **« L-99 / L-228 »** in `REMEDIATION_DONE.md`.

**The restaurant is running code from 2026-09-16 and is four days behind.** Measured, not assumed:
18 migrations, no `city`, no `ProductOptionQuota`, no on-screen keyboard, no delivery rule, **83
products and no Tacos at all**. Everything it needs is pushed.

**THE BLOCKER IS NOT CODE.** `C:\HibaPOS-app` **is not a git clone** and **no `git.exe` exists** on
that machine. The operator has to install git and get a GitHub token with read access to the private
repo before anything can happen. **Ask whether that is done before writing any procedure.**

**Then, and every step has a check in the done entry:** stop both Scheduled Tasks **by their French
names** (`HibaPOS Serveur`, `HibaPOS Caisse` — `update.ps1` looks for the English ones, which is
L-207) · back up and confirm it landed on `D:` · `git init` + remote + fetch + **`git reset`
without `--hard` first, and read `git status` together before overwriting** · `bun install`,
`db:generate`, `build` · `bun scripts/apply-migration.ts` dry run, expect **two** pending ·
`--apply` · `bun scripts/add-tacos.ts --apply` then `bun scripts/set-option-quotas.ts --apply` ·
restart · re-run the catalogue fingerprint and **expect `2d62a6b83ba006bf` and 86 products**, which
is the proof it worked.

**Do not use `update.ps1 -Apply`** — L-206 (it applies migrations with the bare command `CLAUDE.md`
forbids) and L-207. **Do not reboot before the migrations are applied**: the launcher refuses to
start on a pending migration (L-203, measured: `migrate status` exits 1) and the refusal points at
the script you must not use.

**The cut-off is still 5 and the operator chose 0.** It is a setting in Réglages, on each install.
Do it while nothing real is sealed: **raising it after a seal is one of the two things that arm
L-228.**

---

## SESSION B — L-203, L-206, L-207: the launcher and the update script

HibaPOS France. Read `CLAUDE.md`, then `REMEDIATION_PLAN.md`, then **L-203, L-206, L-207** in
`docs/audit/FINDINGS.md`.

Three defects in `.zscripts/`, all measured on the France till, all worked around by hand today.
**L-203** the launcher refuses to boot on a pending migration, for a reason the app stopped
believing when PREP-4 made it apply them itself — so an update produces a till that will not start.
**L-206** `update.ps1` applies migrations with `bunx prisma migrate deploy`, the one command
`CLAUDE.md` forbids and for the reason it gives. **L-207** the Scheduled Task names are a contract
four references depend on and no document states — the France till's are French and nothing matches.

**L-203 NEEDS A DECISION BEFORE CODE**: should the launcher stop refusing and let the app apply
(PREP-4's position), or keep refusing with advice that does not point at a broken script? Bring both
shapes. **And rehearse whatever you write** — these files had never been executed before 2026-09-17
and four things in them were wrong the first time they ran.

---

## SESSION C — the catalogue transfer, half-built

HibaPOS France. Read **L-225, L-226, L-227** in `docs/audit/FINDINGS.md`.

`catalogue-transfer.ts` exists and is the right way to carry a menu. It cannot be used: the option
**ceilings do not travel** (`CATALOGUE_TABLES` omits `ProductOptionQuota`, and the test pins the
list at ten so a missing TABLE is invisible), and the import **refuses unless the catalogue is
empty** with nothing able to empty one. Fixing both turns Session A's two scripts into « export
here, import there » for ever after.

**L-227 is the operator's file and needs text brought, not edited.** Both `CLAUDE.md` and the plan's
§ 6 say « nothing in the app exports or imports a catalogue today ». The replacement must say what
is true AND what is missing, because the reason the wrong sentence survived is that the feature is
half-built.

---

## What is NOT next, and why

- **Phase 6** — R6.1 reset, R6.2 arm the chain key, R6.3 FACTICE off. All `OPERATOR`, in that order.
- **The untested branch in the close route.** Its `try/catch` around the day seal fires only if the
  walk throws — a database error. **The next step is known**: the print routes solved the identical
  problem for L-186 by accepting an injected printer; the close route can accept the sealing step
  the same way. Half an hour, one route, a pattern this codebase already trusts.
- **Tauri v2** — still the shipping form, still without a plan. Where a fix has two reasonable
  forms, take the one that survives becoming a Windows native app.

## Two habits this week paid for, keep both

**Reverts find bad tests, not just bad code.** Five reverts proved nothing this week and **four were
the assertion's fault** — a substring anchor a rename satisfied, a needle matched by the wrong
occurrence in the same file, a widened flag letting a future day be sealed, a banner suppressed
while its wording stayed. Pin the **expression that decides**, never a name, a label or a sentence.

**The shell corrupts edits silently here.** Backticks inside a double-quoted bash string are command
substitution; `\\` in a quoted heredoc collapses to `\`; and `cmd | tail && echo "clean"` tests
`tail`, which reported a FAILING typecheck as passing for a full round trip. Write the script with
the Write tool and run it by path.
