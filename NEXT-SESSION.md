# Prompt for the next session

*Written 2026-09-09 at the end of session 22. Paste the block below as the first
message. Delete this file once the work it describes is done — it is a handover,
not a document.*

---

HibaPOS France. Read CLAUDE.md, then REMEDIATION_PLAN.md above its first stage
heading, then REMEDIATION_RECORD.md -> "Methods established by earlier batches".
Those three are required reading before any code.

Your job this session is **small work: tweaks and features on the menus composés
that are now live**. Not a stage, not a batch unless the work earns one.

## Where things actually stand

Batches 5.9 and 5.10 shipped on 2026-09-09 and Stage 5 is CLOSED. Menus composés
exist end to end: a data model of slots, a basket that holds independently
configured components, a slot-by-slot till flow, VAT allocation per
`docs/politique-ventilation-tva.md`, a higher-rate fallback, admin validation,
the composition on the ticket, and a slot editor in the catalogue screen.

**The operator has built all six menus and sold one.** Ticket #40 on production
is a Menu Chill sur place at 29,40: the 24,90 forfait apportioned 10,86 + 10,85
+ 3,19, three supplements outside it, `Σ lineNetTotal = total` and
`Σ (net − HT) = vatTotal`. That is criterion 6 met on the real database, by the
operator. Do not re-do it; read it in the record if you need the figures.

Baselines, all measured 2026-09-09 19:18 — **re-measure before trusting any of
them**, because they moved four times in one session:

- tests **1217 pass, 0 fail**; e2e 13
- production `0ad41ae70803bae0f3ee6cc249be7f2615e12523f034250afa27676ded997f67`,
  876 544 bytes, 80 products, 6 menus, counters 41/5/4/30, 12 migrations, none
  pending, `integrity_check` ok
- **the production file's hash moves on its own while the operator's app is
  open** — a session touch rewrites pages without changing a fiscal row. Assert
  the fiscal fingerprint, never the sha.

## One thing waiting on the operator, not on you

**The accountant has not confirmed the VAT allocation METHOD.** The rates are
settled and live; how a forfait is divided between them is the open claim.
`docs/politique-ventilation-tva.md` § 8 lists four points. **Never describe any
of this as compliant.**

*(A second item — `Menu XXL`'s second pizza imposed as Senior rather than Mega —
was raised and fixed by the operator the same evening. The catalogue now matches
the specification for all six menus. Recorded because it is what a composition
mistake costs: 43 cents of base onto the reduced-rate share, 2,94 of VAT where
2,96 was due.)*

## Rulings already made — do not re-open them

- **The Duo's frite stays as it is.** Each burger brings its own, so a Duo yields
  two, and a customer may pick Frite Cheddar on both for +3,00. That is the
  operator's commercial decision, made on 2026-09-09 after using the menus.
  Record → *Batch 5.9 → Appended 2026-09-09*.
- **Per-component amounts are never printed and never shown.** Not on the
  ticket, not in the cart. They are shares of the forfait, not prices anyone
  pays. Tests fail if they appear.
- **The policy document's figures were corrected to the software**, not the
  reverse — six of nine rows, § 9 records why.
- The edit pencil is deliberately hidden on a menu line: it opens the ordinary
  options dialog, which is the wrong screen. Changing a menu means re-ringing
  it. **A builder in edit mode is a batch, not a tweak** — say so if asked.

## How to work here

Small work goes in `docs/CHANGES-LOG.md`: one row, one commit, each revertable
on its own. **Anything touching money, VAT, the fiscal journal, the chains,
closes, archives, backups or authentication is a batch** and goes through the
plan. A menu's composition decides how a forfait is split between rates, so
slot-editing behaviour is batch work; a colour, a label or a layout is a row.

Four things this project has paid for, in order of how much they cost:

1. **A unit test on an extracted rule proves the rule, not that anything calls
   it.** Batches 5.8 and 3.12 each shipped that gap. 5.9 shipped a worse one — a
   correct route the client never fed, invisible to 1165 passing tests, found
   only by ringing a menu through the real UI. **Test what is BOOKED, and test
   what the client SENDS.**
2. **Run the thing, and check the arithmetic against the answer.** 3.12's worked
   example ran against a stale build and returned a plausible wrong number.
   `bun run build` before any manual validation, and compare `.next/BUILD_ID`
   against your source mtimes.
3. **Revert one property at a time, both directions.** A revert nothing catches
   is a question, not a verdict: twice this session a test proved its own
   argument rather than the function. **Restore from a copy taken before the
   revert** — `git checkout` on uncommitted work throws the change away, which
   cost a repair mid-run.
4. **The browser pane is unreliable.** It rendered and dispatched for the first
   half of session 22 and then stopped entirely — synthetic clicks, DOM events
   and React's own `onClick` all fired without advancing a hydrated page with an
   empty console. If it fails, say so and drive the built server over HTTP
   instead; do not claim a walkthrough you did not run. L-47 carries three data
   points now.

## Rules that are not negotiable

- Never write to `db/custom.db` or to real menu data. Scratch copy, with **both**
  `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden, and prove which database the
  server has open by reading a marker back from the pre-auth
  `GET /api/auth/profiles` before the first write.
- `prisma migrate deploy` against production and edits to the live catalogue are
  the operator's actions: prepare, rehearse, verify, hand over the exact command.
- Touch targets are 44 px minimum and a guard enforces it.
- `readme-counts.test.ts`, `plan-freshness.test.ts` and `touch-and-labels.test.ts`
  pin numbers that move when you work. **When one fails, the number is what to
  check, not the assertion.** The plan's front matter has a ~40 KB ceiling and it
  is nearly full at 40 821 — retire something into the record rather than
  trimming a measurement.
- The server on port 3000 is the operator's. Use a spare port and stop anything
  you start with `taskkill //PID <pid> //T //F`. Ports 3021–3026, 3033/3034,
  3040–3043, 3050–3052, 3060–3065 and 3070–3083 are spoken for.
- `bun run test`, `typecheck` and `lint` before every commit. **Do not push
  unless asked** — but it is a normal request, not a forbidden one.

## Where to start

Ask what the operator wants tweaked. Then measure the thing they describe before
proposing a fix: three of the last four defects were wider than reported, and one
of them — the missing pictures — was three times wider.
