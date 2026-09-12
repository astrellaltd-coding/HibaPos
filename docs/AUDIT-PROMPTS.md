# HibaPOS France — the six audit prompts

**A whole-project read-only audit.** Written 2026-09-12 on the operator's instruction, after
Phases 0–5 and 7 closed and the four prep items landed.

> **Correction, same day, after the six passes ran.** The preamble and all six pass bodies
> below call this "the last look before Tauri v2 planning", because that was the premise when
> they were written and all six files were produced under it. **It is not what happens next.**
> The app is fixed and finished first; Tauri planning starts against a complete app. The pass
> bodies are left exactly as they were run — they are the instructions six finished files were
> written to, and rewriting them now would misdescribe how those files came about. The
> **CONSOLIDATION** section at the end is written to the corrected premise and is where the
> reframing is done.

## How to use this file

**Six separate sessions.** In each one, paste the **PREAMBLE** below, then **one** pass body
underneath it. Nothing else. A fresh session per pass, so each gets whole attention.

Order is free — the passes are independent. Highest value first is **1 → 2 → 4**, then 3, 5, 6;
that ranking is by what a defect in each area would cost, not by how interesting it is.

Each pass writes exactly one file into `docs/audit/` and commits nothing. `docs/audit/README.md`
explains what happens to them afterwards.

**Then a seventh session** — the **CONSOLIDATION** prompt at the end of this file, which is
pasted on its own without the preamble. It reads all six and writes `docs/audit/FINDINGS.md`:
the de-duplicated, re-numbered list, grouped both by severity and by the file the work lands
in, and split into *fix first: money and the fiscal record* · *fix before the app is called
complete* · *fix with the batch that owns the file* · *record and leave*.

**The six passes were written under a premise that no longer holds,** and the consolidation
prompt is where that gets corrected. They were told Tauri v2 planning came next, and each
closes with *"What Tauri needs to know from this pass."* The operator's decision since:
**the app is fixed and finished first**, and packaging is planned against a complete app. So
`FINDINGS.md` is a work list, not an input to a packaging plan — and any defect a pass parked
because "Tauri will change it anyway" is re-judged on its merits.

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

---

## CONSOLIDATION — the seventh session, after the six

HibaPOS France. The six read-only audit passes are done and their files are sitting
**uncommitted** in `docs/audit/`. Your job is to turn them into **one** file that can be worked
from: `docs/audit/FINDINGS.md`.

**Read this first, because the six files are framed wrongly and you are the correction.**
Every pass was told it was "the last look before Tauri v2 planning", and each one closes with a
section called *"What Tauri needs to know from this pass."* **That is not what happens next.**
The operator's decision, made after the passes were written: **the app gets fixed and finished
first.** Tauri planning starts only once there is a complete app to package. So your file is
not an input to a packaging plan — it is **the work list for finishing the software**, ordered
so the operator can start at the top and go down.

This matters beyond wording. Watch for any pass that **deferred a real defect** because it
assumed packaging would deal with it — "Tauri will change this anyway", "leave it to the
bundle". Those decisions were made under the wrong premise. Re-judge each one on its merits: if
it is broken now, it is on the list now.

**But Tauri is still coming, and it constrains every fix you propose.** It gets no group of its
own and no phase in your list — it is what the app is being finished *for*. The app will be
packaged as a **Windows native application**, which changes where files live, how the process
starts, what is bundled and what can be shelled out to. So wherever a finding has **more than
one reasonable fix, prefer the one that still holds after packaging**, and say in one line why
you chose it. A fix that has to be undone at packaging time is worse than the defect it
removed. Do not plan the packaging — just do not fix anything into a corner.

**Read, in this order:** `docs/audit/README.md`, `docs/INVARIANTS.md` in full, `CLAUDE.md`,
then `REMEDIATION_PLAN.md` § 1, § 4 and § 7. Then all six pass files, whole, before you write a
line of your own. They total about 1,700 lines; read them completely — a consolidation built
from the summary sections of six documents is a summary of summaries and is worth nothing.

**YOU CHANGE NOTHING EXCEPT ONE FILE.** You may create exactly `docs/audit/FINDINGS.md`. Not
the six pass files — they are evidence and stay exactly as written, wrong framing and all. No
source, test, script, plan, `CLAUDE.md` or `docs/INVARIANTS.md`. **No commits.** No `--apply`
on any script, no migration, no `db:*`, and never `bun run dev` or `bun run start` from the
repository — both open the live database. **Never `bunx vitest`, `npx vitest`, or `git clean`.**
`bun run test`, `bun run typecheck` and `bun run lint` are safe; run them once as your own
baseline.

### 1. Check you have all six

`pass-1-money.md` · `pass-2-security.md` · `pass-3-data-model.md` · `pass-4-till-in-use.md` ·
`pass-5-build-ops.md` · `pass-6-test-quality.md`.

All six exist and are between 219 and 357 lines. If one is missing or truncated, **stop and say
so.** Consolidating five and calling it six produces a document that reads complete and is not.
Do not reconstruct a missing pass from what the others happened to mention.

### 2. The numbering has already collided, and here is the map

Every pass was told to continue the `L-` series from **L-88**, and six sessions sharing no
context all did exactly that. **The ids in the pass files are drafts, not identities.** Measured
before you started:

| Pass | New ids it claims |
|---|---|
| pass-1 money | L-89 … L-96 |
| pass-2 security | L-89 … L-100 |
| pass-3 data model | L-89, L-100 … L-111 |
| pass-4 till in use | L-89, L-111 … L-129 |
| pass-5 build/ops | L-89 … L-110 |
| pass-6 test quality | L-89 … L-102 |

**Five files claim L-89. Four claim L-100. Six overlap across L-89–L-96.** Roughly 90 claimed
slots describing far fewer real defects.

**L-88 is the true high-water mark** — confirmed against `REMEDIATION_PLAN.md` and
`REMEDIATION_DONE.md`. Assign every final number yourself, in one sweep, continuing from L-89
in your final grouped order, each used exactly once. Then publish a **mapping table** —
`pass-3 L-91 → L-97` — because without it every id in all six files points at the wrong row the
moment your file exists.

### 3. Merge, and account for every finding

Every finding in the six files ends up somewhere in yours. **Nothing is silently dropped.**
Five outcomes:

- **Merged** — two or more passes found the same defect from different angles. One row. Take
  the **highest** severity offered, never the average, and cite every pass that saw it: that a
  defect was visible from two directions is evidence about the defect, so keep it.
- **Kept** — one pass found it, it stands as written.
- **Already known** — nine are open in § 7: L-84, L-82, L-81, L-75, L-05, L-11, L-47, L-51,
  L-52. One line each in a short list, out of the main tables. **But the passes also cite
  closed findings** — L-10, L-22, L-38, L-40, L-41, L-62, L-64, L-67, L-79 all appear. A
  reference to a closed finding is context, not a new finding. **Unless a pass says it has come
  back** — a regression of something already fixed is a new finding and a serious one, because
  it means the fix did not hold. Flag any of those loudly.
- **New facet of a known finding** — a worse consequence, a second call site, a case the
  original row does not cover. That part is new and gets its own number, cross-referenced to
  the parent.
- **Set aside** — you checked and it does not hold. Keep it, with your reason, in its own
  section. A rejected finding is worth nearly as much as a kept one to whoever would otherwise
  spend a session rediscovering it.

Close with a reconciliation: N raw findings in across six files, N accounted for. If those two
numbers disagree, the document is wrong and you should say which way.

### 4. Where two passes disagree, settle it

Six fresh sessions will contradict each other somewhere. **Do not average them and do not
report both** — averaging two verdicts produces a third that is wrong. Go to the code and
settle it, then say in one line what you read and what it decided. If it cannot be settled
without writing something, say *that* rather than picking a side, and mark it as a question the
operator has to resolve.

### 5. Verify before you promote

Every row in the top two groups is a session the operator will spend. Before a finding lands
there, **go to its `file:line` and confirm the code says what the pass says it says.**
Read-only is enough to read code; it is not enough to run a revert, so a claim that would need
one stays **SUSPECTED**, and says why.

Carry each finding's own CONFIRMED/SUSPECTED mark through, and add your own — **VERIFIED
HERE** — where you went and looked. The operator needs to know which rows had two sets of eyes.

### 6. Two views, because they answer different questions

A single ranked list is not enough to work from. Give both, with the same findings:

**View A — by severity.** What is worst. Ordered by what could **lose or invent money or
corrupt the fiscal journal**, then by what a customer or an inspector could discover, then
everything else. This decides what gets done first.

**View B — by area.** What gets fixed **together**. Group by the file or module the work lands
in — `checkout.ts`, `reports.ts`, the auth layer, the scripts directory, the test suite — with
each group's findings listed under it. Findings in one file are one session's work, not five,
and this view is what turns the list into a schedule. Note where a group has an obvious natural
order (fix the schema before the code that reads it).

### 7. The groups

Every finding gets exactly one. Three of them are work; two are not.

- **A — Fix first: money and the fiscal record.** It can lose or invent money, or write a
  fiscal document the software cannot stand behind. Nothing else outranks this and there is no
  argument for deferring one.
- **B — Fix before the app is called complete.** Really broken, and a user, the operator or an
  inspector would hit it. Wrong French, a crash path, a missing guard, a report that disagrees
  with the database.
- **C — Fix with the batch that owns the file.** Real, cheap, and not worth its own session.
  This project already works this way: an undeployed app can let a small defect wait for the
  change that opens that file anyway. Say which batch, so it is not forgotten.
- **D — Record and leave.** Real, and the cost of fixing exceeds the risk. **Say the risk out
  loud** rather than implying it is zero, and say what would move it into a fix group.
- **E — Genuinely undecidable until packaging.** A short holding pen, not a tier. Only for
  findings whose *correct fix depends on a decision that has not been made* — where the data
  directory lives on a real Windows install, whether the Prisma CLI is reachable from a bundle,
  how an updater behaves mid-shift. **The bar is high.** "Tauri might change this file" is not
  a reason to park a defect; "there is no right answer until someone chooses the install
  layout" is. Anything fixable now goes in A, B or C instead. **Expect E to be very small** —
  most of what looks like it belongs here is really a group C fix with a packaging note
  attached. If E is longer than a handful of lines, you are using it as a dumping ground.

"Needs more thought" is not a group. If you genuinely cannot place a finding, put it in **B**
and say it is there because it is unresolved, not because it is urgent.

**Each group A/B/C row carries a fix direction**, not a fix: a sentence on what the repair
looks like, and where two repairs are possible, which one survives packaging and why. The
operator is not going to implement from this document alone, but every row should make it
obvious what the session that fixes it would be doing.

### 8. What to do with the six Tauri sections

Each pass closes with one, written under the old framing. They are real observations and you
should not discard them — but they are no longer the headline. Read all six, then:

- anything that is a **defect today** goes into A, B or C like any other finding;
- anything that is a **genuine packaging unknown** goes into group E;
- the rest — general notes about how packaging will work — go into **one short closing
  section**, three or four lines, titled *"Noted for whenever Tauri planning starts."* It is a
  place to not lose things, not a plan. The packaging plan does not exist and will be written
  against a finished app, not against this document.

### 9. Shape of the file

Built to be worked from, not admired. **And it has to stand alone.** The operator will read it
without the six files open beside it, and will plan the remaining work from it — so a finding
that only makes sense next to its pass file is not finished. Carry enough of the evidence
across that the row can be acted on by someone who never opens `pass-4`.

1. **What this is and is not** — four lines, including that it is not evidence of compliance,
   and that the six pass files it came from are framed around a Tauri-next assumption that is
   no longer true.
2. **The verdict** — one short paragraph read before deciding to open the rest: how many real
   findings, how many per group, and **whether anything here would stop a first real sale**.
3. **View A — by severity**, groups A through D each a table: final `L-` id · severity ·
   `file:line` · what is wrong in one sentence · cost to fix · which passes saw it · CONFIRMED /
   SUSPECTED / VERIFIED HERE.
4. **View B — by area**, the same findings grouped by where the work lands, ids only plus a few
   words. A schedule, not a re-listing.
5. **Detail** — only where one sentence is not enough to act on. Not every row needs a
   paragraph, and padding the ones that do not is how a document stops being read.
6. **Already known** — the nine open ones rediscovered, one line each; then any closed finding
   a pass says has regressed, which is not a one-liner.
7. **Looked at and set aside** — with reasons.
8. **Where the passes disagreed** — and what settled it.
9. **Group E** — undecidable until packaging, with what decision each one waits on.
10. **Proposed § 7 rows** — in the plan's own format, ready to paste. Propose; do not place.
    The operator decides which become real.
11. **Noted for whenever Tauri planning starts** — three or four lines.
12. **The id mapping table.**
13. **Reconciliation** — the counts.

### 10. Two things only you can check

The passes were each told to expect **1382 tests / 0 fail / 114 files**, 15 migrations, all
fifteen trading tables at zero, counters `0/0/0/0`, **84 products / 14 categories / 80 on the
grid**. Six sessions ran at different times against a catalogue the operator edits between
them. **If the six report different baselines, that difference is itself worth a line.**
Re-measure once yourself and state what you measured.

And read the six as documents, not only as inputs. **If a pass looks like it did not do what it
was asked** — no evidence of having run anything, findings that read as plausible rather than
checked, a "walkthrough" with no data read back out of the database — say so plainly in the
verdict. Which of the six to trust is a judgement only available to whoever is holding all six,
and it is worth more than any single row in your tables.

**Fix nothing. Commit nothing.** Leave `FINDINGS.md` uncommitted alongside the six; the
operator reads it, and then decides what gets committed and what becomes a plan row.

**Nothing you produce is evidence of French fiscal or legal compliance.** Do not write that it
is, anywhere.
