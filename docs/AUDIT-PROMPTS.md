# HibaPOS France — the six audit prompts

**The last read-only look at the project before Tauri v2 planning.** Written 2026-09-12 on
the operator's instruction, after Phases 0–5 and 7 closed and the four prep items landed.

## How to use this file

**Six separate sessions.** In each one, paste the **PREAMBLE** below, then **one** pass body
underneath it. Nothing else. A fresh session per pass, so each gets whole attention.

Order is free — the passes are independent. Highest value first is **1 → 2 → 4**, then 3, 5, 6;
that ranking is by what a defect in each area would cost, not by how interesting it is.

Each pass writes exactly one file into `docs/audit/` and commits nothing. `docs/audit/README.md`
explains what happens to them afterwards.

**Expect overlap between passes.** Six fresh sessions share no context, so two of them landing
on the same defect from different directions is the system working, not a fault. It is resolved
at consolidation.

---

## PREAMBLE — paste this at the top of every pass

HibaPOS France. This is a **read-only audit**, one of six focused passes, and it is the last
look at the project before Tauri v2 planning begins. The app is complete, has **never been
deployed and has never traded**.

Read **`docs/INVARIANTS.md` first, in full** — it is the permanent rules file and it is
required reading before you form any opinion. Then `CLAUDE.md`, then `REMEDIATION_PLAN.md`
§ 1, § 4, § 5 and § 7. `REMEDIATION_DONE.md` has an index at the top; read the entries
relevant to your pass rather than all 35.

**YOU CHANGE NOTHING EXCEPT ONE FILE.** You may create exactly `docs/audit/pass-N-<name>.md`
— the name is given at the end of your pass — and write your findings there. Nothing else: no
edits to any source file, test, script, plan, `CLAUDE.md` or `docs/INVARIANTS.md`; **no
commits**; no `--apply` on any script; no migration; no `db:reset` / `db:push` / `db:seed` /
`db:deploy`; and never `bun run dev` or `bun run start` from the repository — both open the
live database. **Never `bunx vitest`, `npx vitest`, or `git clean`.** `bun run test`,
`bun run typecheck`, `bun run lint` and `bun run build` are safe; run the first three to
establish your own baseline.

**You MAY run the app, and for some passes you should.** The operator has authorised it, on a
**proved scratch copy only**: copy `db/custom.db` into your scratchpad, start with **both**
`DATABASE_URL` and `HIBAPOS_DATA_DIR` pointing at the copy, and **prove which database the
server has open before any write** by writing a marker user into the copy and reading it back
from the pre-auth `GET /api/auth/profiles`. Write a PIN you choose onto the copy with the
app's own `hashPin` — never a production PIN, which was never seen and is recorded nowhere.
Use `bunx next start -p 3090 -H 127.0.0.1`, check `.next/BUILD_ID` is newer than your sources,
stop the server with `taskkill //PID <pid> //T //F`, and delete the copy when you finish. Read
live data with `bun:sqlite` and `readonly: true` — never Prisma against `db/custom.db`.

**Before you call anything dead, unused or removable, check `docs/INVARIANTS.md`'s
*Deliberately retained* list.** This codebase keeps things on purpose: `tables-view.tsx` is
unreachable by design and a test asserts it stays unwired; `tw-animate-css` is the animation
plugin and **not** `tailwindcss-animate` — removing the wrong one breaks every dialog
silently with no build error; `tar` is loaded through a dynamic `import()` that static
analysis cannot see; `.zscripts/`'s eight `.ps1` files are pinned by a test; three report
routes have no interface and are correct, tested and gated. **For every removal candidate,
state whether it is on that list.**

**Do not re-report known findings.** § 7 holds nine: L-84, L-82, L-81, L-75, L-05, L-11,
L-47, L-51, L-52. If you rediscover one, write "already L-nn" and move on. New findings get
new `L-` numbers continuing that series.

**Re-measure; do not trust § 4.** Measured 2026-09-12 — expect and verify: **1382 tests /
0 fail / 114 files**, typecheck and lint clean, **zero `prisma:error` blocks** in a clean run,
**15 migrations applied and none pending**, all fifteen trading tables at zero, fiscal counters
`0/0/0/0`, **84 products in 14 categories with 80 on the till grid**, and **no two products
sharing a name**. Any drift is itself a finding — the operator edits the catalogue between
sessions.

**Deliver** into your one file: a findings table — id (new `L-` number), severity,
`file:line`, what is wrong, how you established it, and what it would cost to fix. Separate
**CONFIRMED** from **SUSPECTED**, and name anything you could not settle without writing
something. Rank by what could **lose money or corrupt the fiscal journal**, not by how many
you found. Close with a section **"What Tauri needs to know from this pass"** — the packaging
phase is next and this is its input.

**Fix nothing, and do not commit.** Leave your file uncommitted for the operator to read. Do
not edit the plan — propose § 7 rows in your file and let the operator place them. Expect some
overlap with the other five passes; that is deliberate and is resolved when they are
consolidated.

**Nothing you produce is evidence of French fiscal or legal compliance.** Do not write that it
is, anywhere.

---

## PASS 1 — Money and the fiscal record

The highest-stakes surface. **All money is integer cents end to end**; euros exist only at
`formatEuro` and `parseEuroInput`. `apportion` is the only splitter (largest-remainder, so
parts always sum to the whole).

Trace, do not skim: a sale from `POST /api/orders` through `checkout.ts`, `pricing.ts`,
`aggregate.ts`, `reports.ts`, `fiscal.ts`, to a sealed `ZReport` row and a `CLOTURE_Z` journal
event — then the same for a refund, and for an `OFFERT` give-away.

Look for: any place a float or a division could round independently; VAT that can stop
matching an order's total; a menu's forfait apportioned so the parts do not sum to it;
`OrderItem.vatRate` being restated by a later catalogue edit; the hash chain's inputs and
whether a sealed payload could ever be re-serialised; whether the three counts (`itemsCount`
counts a menu as one article, `topProducts` counts its components, `topMenus` is the third
answer) still each answer their own question; and whether a period close and the shifts inside
it can disagree.

Verify the **VAT allocation** against `docs/politique-ventilation-tva.md`. The method is
TTC-weighted and **the accountant has not confirmed it in writing** (§ 8, `VAT-METHOD`) — say
whether the code matches the documented method, which is a different question from whether the
method is right.

**Write to `docs/audit/pass-1-money.md`.**

---

## PASS 2 — Auth, access control and secrets

Two roles (`MANAGER`, `SUPER_ADMIN`); `CASHIER` was removed from the product.

`src/lib/api-authorization.test.ts` walks every route and pins a declared gate for each in a
`GATES` table. **Read that test first, then audit whether each declared gate is the RIGHT
one** — which the test explicitly says it does not check.

Look for: a handler that declares roles and then ignores them internally (the test states it
cannot catch this); the ~20 routes that guard inline with `if (user.role !== "SUPER_ADMIN")`
rather than declaratively (L-32's territory); every entry in the unauthenticated list and
whether it is still justified; PIN handling and the scrypt parameters; session TTL, cookie
flags, rotation, and the once-a-minute activity touch; the step-up flow for discounts and
refunds (DD-19); rate limiting on login and its two separate budgets.

Two newer things deserve adversarial attention. **`GET /api/setup/secrets` deliberately
returns a secret value** — read its own comment arguing why, then judge whether the bounds it
claims are sufficient. And **`GET /api/auth/profiles` needs no PIN and lists every username**;
say plainly whether that is acceptable for a product about to be installed in a restaurant.

**Write to `docs/audit/pass-2-security.md`.**

---

## PASS 3 — Data model, migrations and integrity

Read `prisma/schema.prisma` against the 15 migrations and against the code that uses it.

Look for: nullable columns whose null means something undocumented; `onDelete` behaviour that
would silently lose data (`OrderItem.productId` is `SetNull`, `ComboSlot` is `Cascade` — is
every one of them deliberate?); indexes missing on columns the reports filter by, and indexes
that exist for nothing; a column the code writes that no migration created, or the reverse;
`_prisma_migrations` checksums; and whether `restoreBackup`'s table-and-column compatibility
check can be defeated.

Then audit the **startup migration gate** (`src/lib/services/startup-migration.ts`) as an
adversary: what happens if the deploy half-applies; if the process dies mid-migration; if the
lock file is on a network path or a synced folder; if two installs share one database; if the
backup succeeds but the disk fills during the migrate. **It has never run against a real
pending migration** — production is at 15 of 15.

**Write to `docs/audit/pass-3-data-model.md`.**

---

## PASS 4 — The till, actually used

**Run it** on a proved scratch copy and use it the way a restaurant would.

Open a shift. Ring a plain sale; one with options; one with add-ons; a menu composé; a
discount below and above the 20 % threshold; an `OFFERT`; a refund, full and partial; a
reprint; a cash movement in and out. Take an X report, close a Z, then run a daily close.

At every step ask two questions: does the screen tell the truth, and does the money on it match
the money in the database? Read it back with `bun:sqlite` rather than believing the UI.

Look for: any path where a sale could be lost or double-counted; what happens when the printer
is unreachable — it will be, since `printerConnection` now defaults to `usb` with no queue —
and whether the sale still completes and says something useful; touch targets under 44 px;
French text that is wrong, missing, or untranslated (zod's English messages reaching the
operator is L-22's territory); and anything a tired person at a till at 23:00 could do by
accident that the software would simply accept.

**L-47 says the login screen may not clear inside an in-app browser pane.** If you hit that,
drive the built server over HTTP instead and **say so** — do not claim a walkthrough you did
not run.

**Write to `docs/audit/pass-4-till-in-use.md`.**

---

## PASS 5 — Build, dependencies and operations

What actually ships, and what happens while it runs.

Audit `package.json` against what is really imported: unused dependencies, and used-but-
undeclared ones. Check `next.config.ts` — it declines HSTS on the strength of the loopback
binding — the headers it sets, the absent `output` key (already L-05), what lands in the
bundle and how large it is, and whether any server-only module can reach the client.

Then operations: `instrumentation.ts`'s startup sequence and each of its failure modes; the
WAL pragma and the cloud-sync refusal; `technical-logger`; the audit log's retention versus
the fiscal journal's deliberate lack of one; backup creation, pruning, restore, and the 49 MB
media archive read wholly into memory (already L-51). Then ask what the app does when the disk
is full, when SQLite is locked, when a secret is malformed, when the data directory is
read-only.

Finally read all 15 scripts in `scripts/` **and `scripts/README.md`**, and say for each whether
it is still needed, still correct, and still described accurately.

**Write to `docs/audit/pass-5-build-ops.md`.**

---

## PASS 6 — Is the test suite load-bearing?

1382 tests is not the same as 1382 useful tests. This project has already found hollow ones: a
test named *"leaves the journal unmarked when the setting is off"* that **never turned the
setting off**, and an export-stability test that **stayed green with the `ORDER BY` removed**.

Hunt for more of exactly that: assertions that would pass against the bug they name; tests that
assert a constant rather than a consequence; tests whose subject is a rule nothing calls.

**Method that works:** take the twenty most load-bearing assertions in the suite and for each
ask *what single change to the source would make this fail?* If the answer is "nothing
plausible", that is a finding. Where you can, verify by reverting one property at a time — but
you may not edit source, so reason it through and mark it SUSPECTED rather than CONFIRMED.

Also look for order-dependence: `test-setup.ts` documents L-40 — files clean up before each
test and not after — and for a file that wipes a table without first clearing what references
it (that has bitten twice). Check the pinned numbers (`readme-counts`, `plan-freshness`,
`touch-and-labels`) still pin something real.

Close by naming the **three areas with the least real coverage**, weighted by what they would
cost if wrong rather than by line count.

**Write to `docs/audit/pass-6-test-quality.md`.**
