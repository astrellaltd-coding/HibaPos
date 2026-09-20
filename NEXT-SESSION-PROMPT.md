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

**ASKED AND STILL BLOCKED, 2026-09-20: neither exists yet.** Nothing about the till changed that
day. What did change is that its proof step now names a script and a number that can be reproduced
— see the fingerprint note below — and that the same `customer_city` migration turned out to be
pending on THIS machine as well (L-231).

**WHAT THE OPERATOR HAS TO DO ON THE TILL BEFORE ANY SESSION CAN HELP.** Both are theirs to do —
Claude does not type credentials.

1. **Install Git for Windows** from `https://git-scm.com/download/win` (64-bit standalone
   installer), accepting the defaults. The only thing that matters is that `git.exe` lands on
   `PATH`. Check it in PowerShell: `git --version` should answer. If it does not, the installer's
   « Adjusting your PATH » page was set to the most restrictive option — re-run it and choose
   « Git from the command line and also from 3rd-party software ».
2. **Create a fine-grained GitHub token**, on github.com → Settings → Developer settings →
   Personal access tokens → **Fine-grained tokens** → Generate new token. **Repository access:
   Only select repositories → the HibaPOS repo. Permissions: Repository permissions → Contents →
   Read-only.** Nothing else — this token only ever needs to pull. Give it a short expiry; it is
   for one update, not for living on a till. Copy it once; GitHub will not show it again.

Neither step touches the database, and both are reversible: uninstall git, revoke the token.
**Do not reboot the till while doing this** — its two migrations are still pending and the
launcher refuses to start on a pending migration (L-203).

**BOTH ALTERNATIVES WERE PUT TO THE OPERATOR ON 2026-09-20 AND BOTH WERE DECLINED**, so a later
session need not re-open them. A GitHub ZIP downloaded in Brave, and a USB copy from the
development machine, each avoid installing git — and each makes the NEXT update this same
conversation again. Git is the route.

**The owner has never traded on that till and does not mind it being reinstalled**, which was new
information the same day. It was tempting, and the answer was still to **update in place**: the
till's *data* is disposable but its *configuration* is not. The printer queue — `SUNSO WTP-801` on
`USB001` — lives in the `Setting` table, took two days and somebody looking at paper to confirm
(R6.4), and a wholesale database copy would overwrite it with this machine's dev settings, which
point at a `COM1:` queue that **prints nothing and reports success**. The Scheduled Tasks and the
`.env` holding the backup key for the files already on `D:` are in the same category. What the
disposable data *does* buy is nerve: if the update goes wrong, wiping and starting again costs
nothing but time.

**Then, and every step has a check in the done entry:** stop both Scheduled Tasks **by their French
names** (`HibaPOS Serveur`, `HibaPOS Caisse` — `update.ps1` looks for the English ones, which is
L-207) · back up and confirm it landed on `D:` · `git init` + remote + fetch + **`git reset`
without `--hard` first, and read `git status` together before overwriting** · `bun install`,
`db:generate`, `build` · `bun scripts/apply-migration.ts` dry run, expect **two** pending ·
`--apply` · **`bun scripts/catalogue-fingerprint.ts` — expect `a6fa4bbcb699afdf` and 83 products** ·
`bun scripts/add-tacos.ts --apply` then `bun scripts/set-option-quotas.ts --apply` · restart ·
`bun scripts/catalogue-fingerprint.ts` again and **expect `b6a76daf0befc587` and 86 products**,
which is the proof it worked.

**THE FIRST FINGERPRINT IS THE ONE THAT CAN STILL SAVE YOU, and it goes AFTER the migrations, not
before.** Before them the till has no `ProductOptionQuota` table at all, so the script says TABLE
ABSENT and warns the number is not comparable — correct, and useless as a check. **After** the two
migrations and **before** the two scripts, the till should be in exactly the shape the rehearsal
reconstructed: 83 products, 8 category option groups, 39 choices, an empty quota table,
`a6fa4bbcb699afdf`.

**If that number is not `a6fa4bbcb699afdf`, STOP and do not run the two scripts.** It would mean the
France catalogue is not the one every plan since 2026-09-19 assumes it is — and that assumption has
only ever been checked against a RECONSTRUCTION built here, never measured on the till itself under
this digest. The section digests printed above the total say which part differs; the row counts
beside them usually say why. Nothing is lost by stopping there: no migration is undone and no
catalogue row has been written yet.

**`2d62a6b83ba006bf` IS RETIRED — do not look for it** (L-229). It came from a throwaway that no
longer exists, and being id-inclusive it could never have matched: `add-tacos.ts` creates its rows
with fresh `cuid()`s, so France's Tacos rows will never carry this machine's ids. The replacement
script ignores ids, covers the option ceilings, and prints `a6fa4bbcb699afdf` on a database still in
the till's shape — so a wrong number tells you *which* section differs instead of only that one does.

**THE THREE TACOS HAVE NO PICTURE, ON EITHER MACHINE** (L-232), and the operator chose on
2026-09-20 to attach it **by hand** rather than by script. 80 of 86 products carry an image; the
six that do not are the three Tacos and the three « sans boisson » boxes — and the boxes are
`showOnPos = 0`, so **the tacos are the only tile a cashier sees with no photograph**.
`Tacos.webp` arrives with the code and appears in the médiathèque by itself; nothing points a row
at it.

**Do it in this order, and it is six edits, not three:**

1. Finish the France update and **both** fingerprint checks first, while the photo is absent on
   both machines and the two numbers are known to agree.
2. Then attach it to `Tacos M`, `L` and `XL` **on both installs** — in France only after
   `add-tacos.ts` has run, because until then the rows do not exist.
3. Then run `bun scripts/catalogue-fingerprint.ts` on both and confirm they **still** match.

Step 3 is not ceremony. `image` is one of the columns the fingerprint compares, so attaching the
photo **changes the number** — `b6a76daf0befc587` stops being the expected value the moment the
first machine is edited. Doing both and re-measuring turns that into a verified change; doing one
and stopping leaves the two catalogues genuinely different with nothing recording it.

**Do not use `update.ps1 -Apply`** — L-206 (it applies migrations with the bare command `CLAUDE.md`
forbids) and L-207. **Do not reboot before the migrations are applied**: the launcher refuses to
start on a pending migration (L-203, measured: `migrate status` exits 1) and the refusal points at
the script you must not use.

**The cut-off is still 5 and the operator chose 0.** It is a setting in Réglages, on each install.
Do it while nothing real is sealed: **raising it after a seal is one of the two things that arm
L-228.** **Sign in as Administrateur** — DD-26 refuses this field to a Gérant, and the Gérant is the
account the till is normally used with (L-230). In France it needs no update and can be done today;
**here it waits on the pending migration below**, so that apply is deliberate rather than a side
effect of opening Réglages.

**ONE MIGRATION IS PENDING ON THIS MACHINE TOO** — `20260918200000_customer_city`, rehearsed
2026-09-20, three expected differences and no others. § 1 said none was waiting until that day
(L-231). The operator applies it:
`bun scripts/apply-migration.ts --apply --expect ../db-snapshots/r221-city-rehearsal/fp-after.json`

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
