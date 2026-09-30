# HibaPOS France — read this first

A point-of-sale system for a French restaurant, under fiscal record-keeping obligations.
Next.js 16 + React 19 + Prisma/SQLite, running on one till in Ferrières-en-Gâtinais.

**This file has two halves and they age differently.** *The rules* below were each bought with
an incident and do not expire. *Where things stand* is a snapshot with a date on it, and it rots
— **when it disagrees with `REMEDIATION_PLAN.md` § 1, the plan wins and this file is what needs
correcting.** That precedence exists because four contradictions between these two files were
found in one week, and a reader had no way to know which side to believe.

---

# PART ONE — THE RULES

## How to work here

1. **Open `REMEDIATION_PLAN.md` and read all of it, then `docs/audit/FINDINGS.md`.** The plan
   holds the current task, the working loop, the methods and the five findings that predate the
   audit. **FINDINGS.md holds the audit's 94 and everything found since** — but **the 94 are done
   save L-170**, and its View A still reads as open defects because it is the audit's own
   document, left as written. **The live work is its *Found after the audit* section**; check
   `REMEDIATION_DONE.md` before taking any View A row as a task. The invariants are in
   `docs/INVARIANTS.md`. Finished work is in `REMEDIATION_DONE.md`: read it to learn *how*
   something was done, never to find out what to do next.

2. **Do one item.** Only what is in that item. Anything else you notice goes into FINDINGS.md's
   own tables with a new `L-` id continuing the same sequence — the audit ended at **L-182** and
   the highest today is **L-247**. The plan's § 7 is closed to new rows until the operator
   reopens it. You do not fix it now.

3. **Then, in this order:** `bun run test` · `bun run typecheck` · `bun run lint` — all three
   green. Commit. Push. Move the item's row into `REMEDIATION_DONE.md` with its commit sha and
   how you verified it. Update *Current task* at the top of the plan. Stop and report.

4. **Prove the new test fails against the old code.** Revert the fix, one property at a time, in
   both directions, and say in the commit what went red. A revert that everything survives is a
   question, not a verdict — and when a revert proves nothing, **say so instead of counting it.**

5. **Measure before changing a guard.** L-234's fix was written, measured and reverted because
   the defect did not exist. L-247's was designed and never written for the same reason. A
   plausible mechanism that fits the symptom is not a diagnosis.

## The things you must not do

- **Never write to `db/custom.db` or to real menu data.** Work on a scratch copy with **both**
  `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden, and prove which database the server has open
  before the first write (plan § 2, *Scratch copy*). **From the first real sale this file is an
  append-only fiscal record and the rule hardens rather than relaxes.**
- **Never run `bunx vitest`, `npx vitest`, or `git clean`.** `bun run test` is the runner.
- **Never delete or weaken a test to make something pass.** If a pinned number fails, the number
  is what to check.
- **Never claim French fiscal or legal compliance.** Not from a passing test, not anywhere. The
  attestation regime is the operator's and `docs/attestation-conformite.md` cites art. 441-1 of
  the code pénal.
- **Never change a RULE in this file without asking.** *(Relaxed 2026-09-30: you may correct
  **Part Two** — dates, numbers, state — without asking, because that is where staleness lives
  and the asking was costing more than it protected. **Part One is still the operator's**: bring
  the exact text and wait.)*

## Two things only the operator does

**Applying a migration to production, and edits to the live catalogue.** Prepare the change,
rehearse it on a copy, verify it, then hand over the exact command — which is **`bun
scripts/apply-migration.ts --apply --expect <path to the rehearsal's fingerprint JSON>`**, **not**
`bunx prisma migrate deploy`. The bare command prints the same green banner whichever migration it
ran, and was misread as applied twice when it was not. **`--expect` takes a PATH**, never a
migration name; since R10.2 a path the script cannot read **fails** the run instead of printing
« skipped » under a tick (L-166).

Since 2026-09-11 the **application** also applies pending migrations at startup, behind a backup
it creates and re-opens to verify (PREP-4). That is the app on its own machine; the rule above is
about you.

## Updating the France till

Learned by getting it wrong, 2026-09-27/28. In this order, and the first step is not optional:

```
Stop-ScheduledTask -TaskName 'HibaPOS Server'
cd C:\HibaPOS-app; git pull; bun install; bun run db:generate; bun run build
Start-ScheduledTask -TaskName 'HibaPOS Server'
```

- **Stop the task first** or `prisma generate` fails `EPERM` — the running server holds
  `query_engine-windows.dll.node`.
- **`bun run build` is required after a pull.** `bun run start` is `next start`, which serves the
  COMPILED output; refusal 5 only checks that `.next/BUILD_ID` exists, so a till that pulled and
  did not rebuild comes up green serving the old code.
- **`bun run db:generate`, never `bunx prisma generate`.** They are not equivalent: the first
  resolves from `node_modules`, the second from npm. That distinction cost ten minutes of hang
  and was the shape of L-243.
- Then read `C:\HibaPOS-app\logs\server.log`. It timestamps every step and every refusal.

## When something looks like it worked

Three times in one evening a command printed enough success to look finished while doing nothing:
a `git pull` that fetched and merged nothing because the clone tracked no branch, a build that ran
happily on the old code behind it, and a 9-second boot that was fast only because a 698-second run
had just warmed a cache by hand. **Ask for raw output rather than a summary, and read the whole of
it.** Every one of those was caught that way and none would have been caught otherwise.

---

# PART TWO — WHERE THINGS STAND

*Snapshot: **2026-09-30**. Perishable. If this disagrees with `REMEDIATION_PLAN.md` § 1, believe
the plan.*

## THE GO-LIVE IS IMMINENT, AND ITS ORDER IS NOT A PREFERENCE

**The restaurant's owner intends to begin real trading on 2026-10-01** and has said he will turn
FACTICE off himself. **He must not.** The order is **R6.1 reset → R6.2 arm the chain key → R6.3
FACTICE off**, and both halves were verified in the code on 2026-09-30:

- `POST /api/setup/chain-key` counts `FiscalEvent` rows and answers **409** if there are any. The
  till's journal holds his test sales, so **arming the key is impossible until the reset clears
  them** — not difficult, impossible.
- `scripts/pre-golive-reset.ts` refuses while `FISCAL_CHAIN_KEY` is armed (guard 1), and must
  never run after a genuine sale.

So FACTICE off first, followed by one real sale, leaves the restaurant permanently trading on a
journal containing test events, with an **unkeyed** chain and receipt numbers continuing from the
factice ones instead of starting at #1. Neither door reopens.

**`FISCAL_CHAIN_KEY` must be copied off the till the moment it is armed.** Lose it and the journal
can never be verified again. The same is true of `BACKUP_ENCRYPTION_KEY`, which is what makes the
backups readable.

## THE SIRET AND TVA ON THE TICKET ARE PLACEHOLDERS

Measured 2026-09-30: `restaurantSiret` is `812 345 678 00021` and `restaurantTva` is
`FR 12 345678901` — the sequential dummies — and the owner's printed ticket shows the till carries
the same. **They are fiscal identifiers on a customer document and must be the restaurant's real
ones before the first real sale.** Both are `SUPER_ADMIN`-only (`settings-authz.ts`), and the
till's only operational account is MANAGER, so the owner cannot correct them himself.

## The two installs

**The till is current in code and data.** `C:\HibaPOS-app`, 20 migrations, boots itself fullscreen,
tracks `origin/main`. It has **never traded a genuine sale**: FACTICE is on, the chain key is not
armed, and its journal holds an unmeasured number of factice events from the owner's testing since
the 2026-09-20 reset. `bun scripts/pre-golive-reset.ts` **without** `--apply` is a dry run and
prints exactly how many.

**The catalogues diverged on 2026-09-28, deliberately.** The owner's menu was completed ON THE TILL
— Kebab on the Tacos « Viande » group, the **Panini** category with its options and products, a
saumon fumé add-on, two crème fraîche pizzas still without photographs. The till therefore holds
more than 86 products and a fingerprint nobody has measured. **This machine is still
`a38c95977b5e1122` at 86 products.** They are reconciled by **exporting from the till and importing
here** — the only direction that works, this machine having never traded (so `empty-catalogue.ts`
will run on it) and the till holding factice events (so it cannot receive an import).
`scripts/catalogue-fingerprint.ts` is read-only and is how the two are compared.

## The printed paper

**The owner confirmed on 2026-09-30 that the ticket prints correctly and that he wants it
changed**, and is sending the ticket his website produces as the model. Two things to know before
touching it: a sealed `Receipt.content` is **never re-rendered** — `buildAnnualArchive` copies it
verbatim — so a layout change applies to future tickets only and the first real ones should
already be right. And `services/ticket-layout.ts` is shared by all three renderers; change it
there or not at all.

Since 2026-09-27 a delivery prints as **one slip**: the ticket, a rule, then `LIVRAISON` with the
name, telephone and address (L-241). The address is appended at PRINT time and **never enters
`Receipt.content`**, so no customer's home reaches the annual archive — the operator's decision of
2026-09-18, reaffirmed on 2026-09-27 when the alternative was on the table. The software version
line was removed from the customer's ticket (L-242); the Z slip, the annual archive and
`/api/fiscal/verify` still state it.

## Operations

**Backups are automatic on every caisse close**, plus manual from Réglages and one before any
startup migration. They go to `D:\HibaPOS-Sauvegardes` on the till — a second volume, but the same
machine, so an off-site copy is worth having now that real money is involved.

**The trading day is a rule the till enforces** since 2026-09-20: it refuses a sale into a sealed
day, refuses a sale through a caisse whose day has ended, and refuses to open a caisse while an
ended day with operations is unsealed — a SUPER_ADMIN may force that last one, journalled as
`OUVERTURE_FORCEE`. **Closing the caisse seals the day.** The cut-off hour is **0** on both
installs, set with `scripts/set-business-day-cutoff.ts`, which refuses to RAISE it after a day has
been sealed.

**`.zscripts/` holds eight tracked `.ps1` files** that `deployment.test.ts` pins. `print-raw.ps1`
drives the printer; `hibapos-server.ps1` and `hibapos-kiosk.ps1` run the till as two Scheduled
Tasks — `HibaPOS Server` at boot, `HibaPOS Kiosk` at log on. **They had never been executed before
2026-09-17 and six things in them were wrong**: L-203, L-204, L-205, a `--start-fullscreen` that
does nothing in `--app` mode, L-243 and L-244. **L-243 is the one to know**: the boot ran
`bunx prisma migrate status`, and `bunx` resolves from npm — 698 s and still downloading when it
was interrupted, against 5.1 s for the prisma installed in the tree. **The till could not boot
without the Internet**, and had not been able to since commissioning; fixed and verified on the
till at seven seconds. **Treat a comment in that directory as an intention, not as evidence.**

**`pre-golive-reset.ts`** empties the fiscal journal, keeps the catalogue, users, settings and
audit log, and runs **once**. It has already run twice — here 2026-09-10, on the till 2026-09-20 —
and neither makes R6.1's target empty today, because the till has been tested on since. Since
2026-09-27 it proves what it kept **by content**, not by row count: it digests every table the
schema has except the ones it empties, and ends « 17 tables, contenu inchange, empreinte … ».
Seventeen because the list is derived from the schema, and `ProductOptionQuota` was in neither of
its two hand-written lists (L-238).

**`bun run test:e2e` is safe for the database** — it builds its own under the OS temp directory and
refuses to start otherwise. **It is not hermetic** (L-239): `next start` fills every key
`e2eServerEnv()` leaves unset from the real `.env`, so the suite has been writing backups into the
operator's real `BACKUP_LOCATION`. **Not the real secrets** — a key it sets keeps its test
fallback; only omitted keys come from `.env`.

## The audit, and what is open

On 2026-09-12 six read-only passes swept the project and a seventh consolidated them into
`docs/audit/FINDINGS.md`: **94 findings, L-89 … L-182**, groups A (7) · B (39) · C (36) · D record
and leave (9) · E undecidable until packaging (3). **All of A, B and C are closed except L-170**,
which is R10.3 and belongs in the accountant's envelope. The six pass files are left as written
because they are evidence, with one PIN caviardé and flagged.

Open today, none of it phased: **L-211** (High — the category strip scrolls with nothing to show
it does, and the owner meets it daily) · **L-204** (High — the launcher's third refusal never reads
`secrets.json`) · **L-203** (the launcher refuses a pending migration where PREP-4 would apply it;
« drop refusal 2 » is **not** sufficient on its own) · L-208 · L-209 · L-210 · L-223 · L-236 ·
L-239 · L-244 · L-245 · L-247 · and L-207's other half.

**`VAT-METHOD` is the one that matters from the first real sale** (§ 8 of the plan): how a fixed
menu price divides between 10 % and 5,5 %. The rates are settled; the division is the open claim,
and the accountant should confirm the basis in writing.

**Tauri v2 remains the shipping form** and that migration has no plan — what runs in France is the
development build, not a package. Where a fix has two reasonable forms, prefer the one that
survives becoming a Windows native app. It is a constraint on how things are fixed, not a phase.
