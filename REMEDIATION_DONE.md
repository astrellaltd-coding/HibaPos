# HibaPOS France — Completed Work

Companion to `REMEDIATION_PLAN.md`. **The plan holds outstanding work; this file holds
finished work.** When an item is done, verified, committed and pushed, its row moves here.

**Append only. Never rewrite an entry.** A correction is a new, dated line pointing at the
old one — the same rule the retired record kept, and for the same reason: an entry that can
be edited is not evidence of anything.

---

## Format for a new entry

```
### <ID> — <one line, what it fixed>
**Done:** YYYY-MM-DD · **Commit:** `sha` · **Finding:** L-nn (if any)
**What changed:** files touched and the substance of the change.
**How it was verified:** the tests, the revert, the measurement. Not "tests pass" —
which tests, and what would have failed without the fix.
**Left behind:** any constraint this creates. If it is one nobody may break, copy it into
`docs/INVARIANTS.md` — NOT into the plan, which retires when Phase 6 closes.
```

---

## Index

*Built from the `###` headings below. `plan-freshness.test.ts` pins it against the real
headings, so it cannot go stale silently: append an entry and you must add its line here, or
that test fails. Headings inside the fenced template above are deliberately excluded.*
**Completed in this cycle**

- R0.1 — the first restorable backup this installation has ever had
- PHASE 1 — the documents tell the truth again
- CONSOLIDATION — one plan, one done file, and a simplified CLAUDE.md
- Deployment withdrawn — the app will ship as Tauri v2
- R2.1 — a product aggregates under its identity, not under its label
- PHASE 2 MIGRATION — `OrderItem.comboProductId` and `OrderItem.referencePrice`
- R2.2 + R2.3 — menus are countable, and their VAT split is justifiable
- PHASE 2 MIGRATION — APPLIED to production, and verified
- R3.1 + R3.2 — « Use it on POS »: hidden from one grid, withdrawn from nothing
- VERIFICATION — the Phase 3 migration was NOT applied, and two documents were wrong
- VERIFICATION (2nd) — still not applied, and a script so it cannot happen a third time
- PHASE 3 MIGRATION — APPLIED to production, and verified
- R4.1 + R4.2 + R4.3 — small correctness, and three findings they turned up
- R4.5 + R4.6 + R4.7 — the three findings Phase 4 turned up, fixed
- R4.4 + R3.3 — the two operator items, applied to production
- PHASE 5 — Cleanup: four strays, 27 interface files, 29 dependencies
- PHASE 0 — R0.2, R0.3, R0.4: the dead data is gone, the unique data is not
- R7.1 — the give-away figures are sealed into the Z report, and sent
- R7.1 MIGRATION — APPLIED to production, and verified
- R7.2 — no two products in this catalogue share a name — **PHASE 7 COMPLETE**
- L-81 — `5 nuggets test`: prepared and rehearsed, the operator's to run
- SECURITY — `SESSION_SECRET` rotated after it leaked into a session transcript
- CORRECTION to the L-81 entry above — `scripts/delete-product.ts` already existed
- CORRECTION — `scripts/rotate-secrets.ts` exists, and its docblock argued for data loss
- PHASE 6 OPENED — the five preconditions, measured read-only
- R6.5 (half) — the catalogue is on the Desktop, and why that is not yet enough
- PREP-1 — `next dev` binds loopback, and a fresh install starts safe
- PREP-2 — a catalogue can leave one install and enter another
- PREP-3 — an install makes its own secrets, and shows the two that must leave the machine
- PREP-4 — migrations apply themselves at startup, behind a backup that has been opened
- R8.0 — a fresh clone of this repository no longer starts red
- R9.6 — the authorization map means what it says, and a refusal leaves a trace
- R8.1 — the settings defaults agree, and the operator can save them
- R9.2 — the startup migration gate stops reporting failure as success
- R8.2 — one tap, one sale, and the OFFERT tender stops crashing the till
- R8.3 — a category save stops destroying the menu rules that depend on it
- R8.4 — a report measures the same period the sealed close measured
- R8.5 — a supplement carries its own VAT rate

**Carried forward — the 2026-09-03 → 2026-09-09 remediation**

- Closed without a batch

**Retired from the plan's § 6 on 2026-09-11**

- Phase 0 — Make the data survivable — **COMPLETE 2026-09-11**
- Phase 3 — « Use it on POS » — **COMPLETE 2026-09-11**
- Phase 4 — Small correctness — **COMPLETE 2026-09-11**
- Phase 5 — Cleanup — **COMPLETE 2026-09-11**

---

## Completed in this cycle

### R0.1 — the first restorable backup this installation has ever had
**Done:** 2026-09-10 · **Commit:** *(this commit)* · **Finding:** L-46 (High half closed)

**What changed:** no code. The **operator** created the backup from the Sauvegardes screen —
`createBackup()` writes a `Backup` row, which is a production write Claude does not make.

**How it was verified**, read-only and in this order:
1. The `Backup` row exists: `hibapos-backup-2026-09-10T20-42-30-159Z.dbenc`, 733 228 bytes,
   `encrypted=1`, with `imagesPath` pointing at `hibapos-media-4b5ed80dca201113.enc`.
2. Both files are on disk — the database and **49 MB of catalogue images**.
3. **It decrypts under the current key**, via `scripts/decrypt-backup.ts` into the session
   scratchpad. Its sha256 came back
   `1b49743e6ef9e1c2647caf81e9d8d40234d3086b4890b35d045f67f237188ed4` — **identical to the
   checksum recorded in the row**. AES-GCM authenticates, so this cannot be a false positive.
4. The decrypted file is valid SQLite: `integrity_check` ok, **0** foreign-key errors.
5. Its contents are complete: 81 products, 14 categories, 6 menus composés with 19 slots /
   6 whitelist rows / 7 option rules, 10 option groups, 49 choices, 21 add-ons, 2 users,
   18 settings, 12 migrations.
6. The decrypted plaintext copy was **deleted** — an unencrypted production database is not
   left lying in a temp directory.

**Why it mattered:** every one of the nine older files in `db/backups/` predates the
2026-09-07 secret rotation and no longer decrypts, and the `Backup` table was empty, so the
application listed none of them. Until this ran, the catalogue — which `CLAUDE.md` calls
irreplaceable — existed only as `db/custom.db`, its OneDrive history, and seven plaintext
snapshots.

**Left behind:** **a backup nobody has opened is a hope, not a copy** — verify by decrypting,
never by seeing a file appear. And the operator still has to get a copy of this one **off
this machine**: a backup on the same disk as the database survives neither a disk failure nor
a ransomware event.

*Measured in passing: `Product` moved 80 → 81. The operator created `5 nuggets test`
(Croustillants, 5,00 €, `active=0`, `available=0`) while testing. It is invisible on the till
and harmless — recorded as **L-81** rather than deleted, because the catalogue is the
operator's and safety rule 1 says record, do not fix.*

### PHASE 1 — the documents tell the truth again
**Done:** 2026-09-10 · **Commits:** `cb8534a`, `54eb3d4`, `aaf885a`, `7a25ca7` · **Findings:** none

**R1.1 — retired `docs/mise-en-service.md` (717 lines) and `.zscripts/README-windows.md`
(206).** Both describe the withdrawn Windows-till deployment. Nothing was extracted: the one
thing they carried that is *not* a deployment step — emptying the fiscal journal before the
first genuine sale — was already in the plan as *Before the first real sale*. Every pointer
to them was redirected, including two refusal messages inside `hibapos-server.ps1` and the
two `deployment.test.ts` assertions that pin them. **The assertions were redirected, not
dropped:** what they guard is that a refusal names somewhere to go.

**R1.2 — corrected `docs/CHANGES-LOG.md`'s header**, which was stale in two directions at
once: it said the trial was cancelled (true, then false, now true again for a different
reason) and pointed at the runbook R1.1 deleted. Retired verbatim per that file's own
append-never-rewrite rule.

**R1.3 — retired `NEXT-SESSION.md`.** Its own header instructed it.

**R1.4 — `docs/politique-ventilation-tva.md` § 2 and § 8.** § 2 now states *why* the
allocation weights are TTC: BOFiP's market-value method is a split « à proportion de la
valeur de marché, **pour le consommateur** », and a consumer's value is the TTC price they
would pay for the item alone. § 8 records the HT alternative with its provenance, the
measured gap, and three reasons it is not adopted.

**R1.5 — three corrections in `README.md`:** the deployment section replaced, uploads
corrected to 47,0 Mo, and `/api/reports/products` added to the no-interface list.

**How it was verified:** `bun run test` 1248 pass / 0 fail before the commits; 48
deployment tests pass after the pointer redirect; `.zscripts/hibapos-server.ps1` re-checked
for its two enforced invariants (UTF-8 BOM present, body pure ASCII) after editing.

**Left behind:** **the fiscal reset is not a deployment step.** It survived the retirement
of the document that described it and must survive the Tauri migration too.

### CONSOLIDATION — one plan, one done file, and a simplified CLAUDE.md
**Done:** 2026-09-10 · **Commit:** *(this commit)* · **Finding:** none — operator instruction

**What changed:** `REMEDIATION_PLAN.md` rewritten from 2 173 lines to ~34 KB, holding only
outstanding work; this file created for finished work; `REMEDIATION_RECORD.md` (5 595 lines)
deleted from the tree and left in git. `CLAUDE.md` rewritten short and operational at the
operator's instruction — how to work here, five prohibitions, two operator-only actions, and
where things stand. `src/lib/plan-freshness.test.ts` rewritten to guard the new structure
instead of the old. `README.md` test count 1247 → 1248.

**How it was verified:** `bun run test` 1248 pass / 0 fail, `typecheck` clean, `lint` clean.
The rewritten guard was proved non-vacuous by pinning both counts (27 tasks, 15 findings)
rather than asserting `> 0` — the mistake its predecessor made. **Its parser was then found
narrower than its data twice over**: once on trailing pipes, once on the carriage return git
leaves on every row of a CRLF checkout, which made `"none"` not equal `"none"`. Both fixed in
the parser, not in the data. That is the third time a version of this file has had that exact
bug, which is recorded here so the fourth author checks for it first.

**Left behind:** the plan must stay under 40 960 bytes and the two pinned counts must be
updated deliberately when a row is genuinely added or retired — never to make a run go green.

### Deployment withdrawn — the app will ship as Tauri v2
**Done:** 2026-09-10 · **Commit:** *(this commit)* · **Finding:** L-75 deferred

**What changed:** the operator decided the app ships as a **Tauri v2 native application**, so
the entire Windows-till deployment model left the plan: the commissioning session, the kiosk
launcher, the pre-built tree, the update path and the 32-bit hardware blocker. Phase 6 was
replaced by *Before the first real sale* — four fiscal steps that hold whatever the app is
packaged as. **L-75 moved from an open High finding to deferred**, carried to the Tauri phase.

**Left behind:** the fiscal reset is **not** a deployment step and must survive the Tauri
migration intact: `scripts/pre-golive-reset.ts` runs once, after testing, before the first
genuine sale, and arming `FISCAL_CHAIN_KEY` comes after it and never before.

### R2.1 — a product aggregates under its identity, not under its label
**Done:** 2026-09-10 · **Commit:** `c9b9d23` · **Finding:** L-76 (closed)

**What changed:** `src/lib/services/aggregate.ts`. `aggregateOrders` keyed `productAgg` by
`item.productName`. That label is a snapshot taken at sale time and has never been unique:
the live catalogue carries three pairs sharing a name at different prices — **Coca, Fanta
and Orangina each exist as a 1,50 € canette and a 3,50 € bouteille**, all six `active` and
`available`, all six ringable today (verified read-only against `db/custom.db`). Selling one
of each produced a single row reading « Coca ×2 5,00 € » — a figure no product ever charged —
and that row is sealed into `ZReport.topProductsJson` and into every close payload.

All **four** per-product accumulator sites now key through one `productKey(item)` helper:
the sale branch, the correction branch, and `givenAwayAgg`, which had the identical defect
and is sealed beside `topProducts` in the close payload. The plan's row named the first two;
the third is the same six lines of code and was not left half-fixed.

**The row now carries `productId`** — a shape change, made deliberately and while it is free
to make. Once the aggregation keys by identity, a period that sold both Cocas produces two
rows both labelled « Coca », and a sealed document stating two different figures under one
label with nothing to tell them apart is its own kind of unreadable. Zero closes exist, so
the shape freezes at the restaurant's first real close and not before. It is the same shape
`reports/products/route.ts` already returns, so the two reports now agree on what a product
row *is* as well as on how it is counted. Propagated through `reports.ts`, `fiscal.ts`,
`types/api.ts` and the two views. Identity is also the sorts' final tiebreak, so two equal
rows sharing a name seal in a defined order instead of the order the query happened to
return them in.

**How it was verified:** a new `src/lib/services/product-identity.test.ts`, 9 tests, 1248 →
1257 — the count moved only by tests added, and `README.md`'s pinned figure with it.

Driven through **`POST /api/orders`** and **`generateZReport`**, not over hand-built
fixtures, because of the failure this project has shipped three times: a correct extracted
function nothing calls. The first test asserts the thing that makes the fix anything other
than a no-op in production — that the route resolves a product intent to a real
`OrderItem.productId` (`orders/route.ts:312`, server-side, never trusted from the client).
Then: the aggregation splits, the **sealed** `topProductsJson` carries two rows, and
`aggregateOrders` and `/api/reports/products` return the same per-product figures for the
same day — the disagreement L-76 named.

**The revert, five properties, each alone and in both directions:** sale-branch keying
(4 tests fail), correction-branch keying (1), give-away keying (1), the tiebreak (1), and
the row carrying `productId` (7). Every property is caught by at least one test.

**Two tests pass under every revert, deliberately.** *«the route records an identity»* tests
the route, not the aggregation — it is the precondition, and it fails only if
`orders/route.ts` stops storing `productId`, which is exactly the change that would make
this batch silently inert. *«falls back to the name when productId is null»* passes because
with a null id the key **is** the name either way; it guards the `onDelete: SetNull` branch
against throwing, not the keying.

**One correction worth recording.** The correction-branch test's first version **survived
its revert** — it aggregated a single order, so there was one bucket and keying by name was
right by accident. The plan's rule («a revert that everything survives is a question, not a
verdict») caught it. Rewritten to refund *both* Cocas across the period boundary, it fails
under the revert as it should. Separately, an `as never` cast in the give-away test was
masking an `orderNumber` field `CheckoutInput` does not have; both casts were removed and
`tsc` is clean without them.

**Left behind:**
- **`topProducts` and `givenAwayProducts` rows carry `productId`, and that shape is sealed.**
  It is still free to change **only until the restaurant's first real close**.
- **The two readers of a sealed `topProductsJson`** — `reports/z/route.ts:55` and
  `shifts/[id]/close/route.ts:96` — parse it untyped and the UI reads `name`/`quantity`/
  `total` only, so both vintages render. Nothing needed changing; recorded so nobody
  "tidies" that into a typed parse that would reject one of them.
- **A new finding, L-82**, raised and not fixed (safety rule 1): the product list renders the
  name alone, so two identity-keyed rows now read as two identical labels on screen and in
  the CSV. The figures are right and the label is the remaining half.

### PHASE 2 MIGRATION — `OrderItem.comboProductId` and `OrderItem.referencePrice`
**Done:** 2026-09-10 · **Commit:** `b50f97c` · **Findings:** carries R2.2's and R2.3's columns

ONE migration for the whole phase, so the operator runs `prisma migrate deploy` against
production **once**. Both columns nullable, neither with a `DEFAULT`, because null is
meaningful in both — `comboProductId` null means « not part of a menu », `referencePrice`
null means « no prorata happened here ». A `DEFAULT 0` on the second would assert a
catalogue price of nothing; same argument and same treatment as `perpetualSalesTotal`.

Hand-written. `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel
prisma/schema.prisma` reports **no difference detected**.

**How it was verified — the rehearsal.** Applied to a copy, never to production. The copy was
taken with `VACUUM INTO` through a **read-only** connection rather than by copying bytes,
because a dev server was writing to the live file at the time and a byte copy can catch a
torn page. Fingerprint diff over every table before and after — row counts, column order,
indexes, `FiscalCounter`, `GrandTotal`, every fiscal event hash, every sealed row, every
order line, the catalogue, `integrity_check`, FK errors — reports **exactly three
differences, all intended**:

| | before | after |
|---|---|---|
| `OrderItem` columns | 16 | 18 — **appended**, every existing column unchanged *in place* |
| `_prisma_migrations` rows | 12 | 13 |

`integrity_check` ok and 0 FK errors on both sides. Production re-read afterwards and
**untouched**: still 16 `OrderItem` columns, still 12 migrations, no `-wal`/`-shm` beside it.

**Left behind:** **the operator must stop the app before running this.** A running
`next dev` / `next start` holds an open handle on the SQLite file and on
`query_engine-windows.dll.node` — it is what made `bunx prisma generate` fail `EPERM`
throughout this session.

### R2.2 + R2.3 — menus are countable, and their VAT split is justifiable
**Done:** 2026-09-10 · **Commit:** `4d504be` · **Findings:** L-77, L-78 (both closed)

One commit for both: they share `b50f97c`'s migration, they touch the same five lines of the
combo checkout path, and one test file covers both.

**What changed — R2.2 / L-77.** A menu is sold at one forfait and booked as one line per
component, because `OrderItem.vatRate` is the only place a rate lives. `comboGroupId` /
`comboName` / `comboPrice` tie those lines back together and **the receipt renderer was
their only reader**, so « how many Menu Chill did I sell? » had no answer anywhere.
`comboProductId` is the menu's identity — counting by `comboName` would have reproduced
L-76 one level up. `aggregateOrders` gains `topMenus`, grouped by `comboGroupId` and counted
in both the sale branch and the correction branch, with `topProducts`' rule: a refund moves
the money and never the count.

**`itemsCount` and `topProducts` are unchanged, and that is the resolution rather than a gap
in it.** The plan named their disagreement — one counts a menu as one article, the other its
three components. Neither is wrong; they answer different questions, and the third question
had no answer at all. Pinned in a test so a later batch that "fixes the disagreement" has to
do it deliberately.

**What changed — R2.3 / L-78.** `referencePrice` stores each component's standalone
catalogue price for the order type: the *weight* the forfait was divided in proportion to,
beside the share the division produced. Null where no division happened.

**The operator's decision, 2026-09-10 — where menus are sealed.** Presented as three options
with the permanence of each stated. Chosen: **the day / month / year close payload, beside
the give-away figures, plus the reports and shift screens. The per-shift `CLOTURE_Z` journal
payload is deliberately NOT grown a fourth time** — a menu count carries no tax (a menu's VAT
lives on its component lines, its justification now in `referencePrice`), and no order is
ever deleted, so the count stays recomputable. `close-timing.test.ts`'s pinned key list was
amended deliberately in the same commit, with both zero-row preconditions **re-verified, not
assumed**. The absence from `CLOTURE_Z` is pinned too.

**How it was verified:** `src/lib/services/menu-reporting.test.ts`, 16 tests, 1257 → 1273 —
the count moved only by tests added, and `README.md`'s pinned figure with it. Driven through
`POST /api/orders`, `closeDay` and `computeShiftReport`, never over the pure allocator:
`combo-allocation.test.ts` would go on passing if nothing stored the result, which is the
defect Batch 5.8 shipped and 3.12 shipped again.

**The revert — ten properties, each alone and in both directions. All ten are caught.** Two
survived the first pass and were **real gaps, not no-ops**:

1. **Grouping by `comboGroupId` vs by the menu product** is distinguishable *only* when two
   of the same menu sit on ONE ticket — on separate orders the two groupings agree, and
   every test sold one menu per order. Added that case; the reverted code reports **one**
   Menu Chill for two.
2. **The correction branch was never exercised** — no test had a refund at all. Added a
   cross-period refund on a menu. Same class of gap as R2.1's, found the same way.

**Left behind:**
- **`topMenus` is in the sealed close payload and NOT in `CLOTURE_Z`.** Both halves are
  decisions, both are pinned, and both freeze at the first real close.
- **A menu's identity must be on *every* line of its group**, the fallback's single line
  included, or a menu that could not be divided stops being countable as a menu.
- **`referencePrice` is null where no prorata happened.** Null is the statement. Do not
  backfill it and do not default it to 0.
- **A new finding, L-83**, raised and not fixed (safety rule 1): `/api/reports/z` never sends
  `givenAwayCount`, `givenAwayItemsCount` or `givenAwayProducts`, yet `ZReportDto` declares
  all three and the Z detail panel renders them — so they are `undefined` at runtime today.
  Found while deciding where to put `topMenus`; `topMenus` was deliberately kept out of that
  DTO rather than becoming a fourth instance of the same defect.

### PHASE 2 MIGRATION — APPLIED to production, and verified
**Done:** 2026-09-10 · **Commit:** *(no code change — this records an operator action)*
**Amends:** the *PHASE 2 MIGRATION* entry above, which recorded it as prepared and **not**
applied. That entry stands as written; this is the dated line that supersedes its status,
per this file's append-never-rewrite rule.

**What happened.** The operator stopped the app and ran `bunx prisma migrate deploy` against
production on 2026-09-10 at **23:22:11**, confirmed by them the same evening.
`_prisma_migrations` records `20260910210000_order_item_combo_identity_and_reference_price`
as one step, `rolled_back_at` null.

**How it was verified — not assumed.** Claude did not run the deployment and did not take the
operator's word for its outcome. Production was fingerprinted afterwards and diffed against
the **pre-migration fingerprint of production itself**, taken earlier the same session with
`VACUUM INTO` through a read-only connection. **Five differences, every one accounted for:**

| | before | after |
|---|---|---|
| `OrderItem` columns | 16 | 18 — appended, existing columns unchanged **in place** |
| `_prisma_migrations` | 12 | 13 |
| `Session` | 1 | 0 — the operator's session ended with the app |
| `AuditLog` | 595 | 596 — the row that logged it |

Identical on both sides: `FiscalCounter`, `GrandTotal`, every fiscal event hash, every sealed
table, every order line, all 81 products, every index and every other table's column order.
`integrity_check` ok, 0 FK errors. `comboProductId TEXT` and `referencePrice INTEGER`, both
nullable, neither with a default — **exactly what the rehearsal on the copy predicted**, and
no table rebuild.

**Production, app stopped, migration in:** sha256
`47b33148dcbe081609ec24728662a32285e2252e3ed5f02dbde9c81178775c94`, 884 736 bytes, no
`-wal`/`-shm`. `bunx prisma generate` then completed cleanly and the full suite was re-run
against the freshly generated client: **1273 pass / 0 fail**, typecheck and lint clean.

**Left behind:**
- **Stop the app before any `prisma` command that writes.** A live `next dev` / `next start`
  holds an open handle on the SQLite file *and* on `query_engine-windows.dll.node`. That is
  what made `bunx prisma generate` fail `EPERM` for the whole of 2026-09-10 until the app was
  stopped, and it is the same open-handle problem that once broke a restore.
- **A sha256 of the production database is only a baseline while nothing is running.** A
  signed-in session writes `Session.lastActivityAt` on every request, so the file's hash
  moves without a single fiscal row changing. Compare *structure* — migrations, column
  counts, row counts, hashes of sealed rows — unless the app is stopped.
- **The rehearsal was worth its cost.** It predicted the production result exactly, down to
  the column order and the absence of a table rebuild, which is what made verifying the live
  deployment a five-minute diff rather than an act of faith.

### R3.1 + R3.2 — « Use it on POS »: hidden from one grid, withdrawn from nothing
**Done:** 2026-09-10 · **Commit:** `16e3415` · **Findings:** L-84 opened; L-69 **still open**
(it closes when the operator applies R3.3)

**What changed.** `Product.showOnPos`, one boolean defaulting ON, plus the migration
`20260910233000_product_show_on_pos` — **prepared and rehearsed, NOT applied.** A product with
it off is hidden from the till's product grid and from nothing else.

**Why it exists.** A menu component must be `active`, and until now every active product
appeared on the grid. That is what blocked L-69: making Box 15 a real menu needs a food-only
product to weigh its drink against, and creating one would have put a product on the till for
a customer to order by itself.

**The pair, and it must stay a pair.** `pos-grid.ts`'s `sellableAlone` consults `showOnPos`;
`combo-builder.ts`'s `slotProducts` **deliberately does not**. Both files now carry a comment
pointing at the other, and one test asserts both halves together so neither can move alone.

**The grid filter was LIFTED OUT of `pos-view.tsx`, not edited in place.** This project
renders no components in tests, so an inline `useMemo` could not be proved. Extracting it to
`src/lib/pos-grid.ts` makes the shipped filter testable, and a test checks that `pos-view.tsx`
kept no product filter of its own — the extraction had to be a *move*, not a copy. That
substitute is stated in the test file rather than glossed: it is what this codebase allows,
and it is weaker than rendering the grid would be.

**Default TRUE, NOT NULL** — the opposite of the Phase 2 columns and for the opposite reason:
here `true` **is** the true value for every existing row. Rehearsed against a copy of the live
catalogue: **all 81 products come out `showOnPos = 1`**, so the migration changes no behaviour
on its own. Fingerprint diff: exactly three differences — `Product` columns 17 → 18
(appended, existing columns unchanged *in place*, no table rebuild) and the migration's own
row. All 81 products byte-identical, indexes identical, `integrity_check` ok, 0 FK errors.
Production re-read afterwards and untouched (17 columns, 13 migrations).

**How it was verified:** `src/lib/services/hidden-product.test.ts`, 15 tests, 1273 → 1288 —
the count moved only by tests added. The `for (const c of CASES)` loop is registered in
`readme-counts.test.ts`'s `EXPANSIONS`, which is what that registry is for: the count was
1287 declarations against 1288 runs, and the honest fix was to record the expansion rather
than bump the number.

**The revert — six properties, each alone and in both directions. Five are caught.** The
sixth — moving the visibility filter to run *after* the search filter instead of before —
correctly changed **nothing**, because filtering before or after search gives the same set.
An earlier draft of the comment in `pos-grid.ts` claimed that ordering was load-bearing. **It
was wrong, and the comment was corrected rather than propped up with a test** that would have
asserted the same list twice. This is the other branch of the plan's revert rule — not « the
test proves less than it claims » but « the revert is a genuine no-op », and the prose was
what needed fixing.

**L-69's figures were proved, not computed on the side.** The same test file builds the exact
shape R3.3 hands over and *sells it through `POST /api/orders`*, asserting the booked
`vatTotal`, both rates, both `referencePrice` values and the unchanged total — for Box 15 and
Tenders box, à emporter and sur place.

**Left behind:**
- **`sellableAlone` and `slotProducts` are a pair.** Unifying them makes L-69 inexpressible
  again and puts Box 15's food half back on the till.
- **L-84**: `showOnPos` is a display rule, not a guard. `orders/route.ts` still checks only
  `active` and `available`, so a request naming a hidden product directly is still booked.
  Deliberately not changed — R3.1's scope is « filter the grid, extend the DTO, add the
  switch », and a server refusal is a business-behaviour change beyond the item (safety
  rule 6). A test pins today's behaviour so closing it later is a decision.
- **The R3.1 migration is not applied.** Stop the app first; a live `next dev` holds the
  SQLite file and the Prisma query engine open.

### VERIFICATION — the Phase 3 migration was NOT applied, and two documents were wrong
**Done:** 2026-09-11 · **Commit:** *(doc-only; records a verification and two corrections)*
**Finding:** none new — but see the two document defects below, both ours

**What was asked:** the operator said they had run the Phase 3 migration and asked for it to
be verified. **It had not been applied**, and saying so required being sure.

**How it was established** — three independent measurements, then an adversarial pass:
production's sha256 and mtime unchanged from before the claim; `PRAGMA table_info("Product")`
= 17 columns, no `showOnPos`; `_prisma_migrations` = 13 rows; and `bunx prisma migrate status`
(read-only, through the same `.env` the operator's command uses) naming
`20260910233000_product_show_on_pos` as pending.

**The decisive fact came from the adversarial pass, not from the first look.** Three agents
were asked to *refute* the conclusion from different angles — direct evidence, an
alternative target database, and Prisma semantics. All three failed to break it at high
confidence, and two independently found the same clincher: **production's last write was
23:22:11 and the R3.1 migration's SQL file was not created until 23:35:33** — thirteen
minutes later. No run could have applied a file that did not exist.

**Why the operator's belief was reasonable, and this matters.** They *did* run
`bunx prisma migrate deploy`, it *did* succeed, and it *did* print « All migrations have been
successfully applied » — at 23:22, applying **Phase 2's** migration. Every console run shows
`13 migrations found`; a run after 23:35 shows **14**. That count is the only thing
distinguishing them, and it is small print above a large green banner.

**TWO DOCUMENT DEFECTS, BOTH OURS, both corrected:**

1. **`REMEDIATION_PLAN.md`'s header contradicted itself.** It said « Its migration is
   PREPARED, NOT APPLIED » about Phase 3 and, twenty lines below, **« The migration is
   APPLIED. »** in bold about Phase 2 — without naming which migration either sentence meant.
   `Current task` still read « none — PHASE 2 IS COMPLETE » although HEAD was the Phase 3
   bookkeeping commit. Introduced in `906a86e`, which replaced the *Current phase* line and
   left *Current task* stale. **This is at least half of why the operator believed the
   migration was applied.** Both migrations are now named in full everywhere in that block.
2. **The plan asserted a file was deleted that still exists.** « `HibaPOS-copie-essai/` is
   deleted » — measured 2026-09-11: **492 files, 58 MB, still there**, exactly as R0.3 (still
   `TODO`) describes. The section was retired; the claim was false from the day it was
   written. `plan-freshness.test.ts` could not catch it — it checks task/finding consistency,
   not claims about the filesystem.

**A third finding, operational and worth keeping:** between Claude regenerating the Prisma
client for a prepared migration and the operator applying it, **the app cannot read the
table that migration touches.** Measured on a copy, never on production: `product.findMany()`
against production-as-is fails with « The column `main.Product.showOnPos` does not exist »;
against a migrated copy it returns all 81 products. So a prepared-but-unapplied migration is
not a dormant state — it is a broken one, and the handover must say so.

**What the adversarial pass added to the handover** that the first draft lacked:
- **No restore point existed** for production's current bytes. The newest encrypted backup
  predates the Phase 2 apply, so restoring it would undo Phase 2 as well. A plain file copy
  to `../db-snapshots/` is now step 1 and marked not optional.
- **Three destructive npm scripts sit beside `db:deploy`** in `package.json` — `db:migrate`,
  `db:reset`, `db:push-force`. Named, with a warning.
- **A `SELECT` gives a FALSE PASS on SQLite.** `SELECT "showOnPos" FROM "Product"` returns
  the *string* `showOnPos` with no error, before or after the migration, because SQLite reads
  an unresolvable double-quoted identifier as a string literal. The handover now says to
  verify with `PRAGMA table_info`, never a `SELECT`.
- **File SIZE is not evidence.** Measured on a copy: the `ADD COLUMN` leaves the file at
  exactly 884 736 bytes. An earlier report of this verification cited the unchanged size as
  part of the proof; it was not proof. The sha256, the mtime and `PRAGMA schema_version` are.
- **A real acceptance test**, stronger than counting columns: the rehearsal began from a copy
  fingerprint-identical to production's current content, so production fingerprinted *after*
  should equal the rehearsed after-state with zero differences. Script and both fingerprints
  are now kept in `../db-snapshots/r31-acceptance/`, out of the session temp directory that
  cleanup would eventually delete.

**Left behind:**
- **Name the migration, every time.** Two migrations a fortnight apart is enough for « the
  migration » to become ambiguous, and it already cost a round trip.
- **A prepared migration leaves the app broken until it is applied.** Say it in the handover.
- **`plan-freshness.test.ts` does not check claims about the filesystem.** Statements like
  « X is deleted » can rot silently.
- **The plan is at its 40 960-byte ceiling.** Retiring Phase 2's section and the 2026-09-10
  history brought it back under; the next addition needs a matching retirement.

### VERIFICATION (2nd) — still not applied, and a script so it cannot happen a third time
**Done:** 2026-09-11 · **Commit:** *(adds `scripts/apply-migration.ts`)*
**Amends:** the verification entry above, which corrected the first attempt.

**Measured again, and unchanged in every respect:** production sha256 `47b33148…`, mtime
still **2026-09-10 23:22:11.277**, 17 `Product` columns, 13 migration rows,
`PRAGMA schema_version` still **167** — the pre-`ALTER` value. The file has not been written
since the Phase 2 migration.

**Two new lines of evidence, neither available the first time:**
1. **PSReadLine's history file has not been written since 23:22 on the 10th**, and its last
   entry is the old `bunx prisma migrate deploy`. No command has been typed in a ConsoleHost
   PowerShell since. *(It records only ConsoleHost sessions, so this corroborates rather than
   proves.)*
2. **Every SQLite database on the machine was enumerated** — all roots under `Work`,
   `Desktop`, `Documents`, `C:\HibaPOS`, `C:\HibaPOS-transfer`, excluding `node_modules`.
   **Not one has `showOnPos`; not one has 14 migrations.** The migration has not been applied
   anywhere, to any copy. That closes the « it landed somewhere else » hypothesis for good.

**What was done about it.** Reporting « still not applied » a second time would have been
true and useless. The failure is not in the command, it is in the loop around it:
`prisma migrate deploy` prints the same large green banner whichever migration it applied,
and the only thing distinguishing them is the small `N migrations found` line above it.

`scripts/apply-migration.ts` makes the operation one step with an unmissable verdict. Dry run
unless `--apply`, per this directory's convention. It refuses if any node/bun process runs or
a `-wal`/`-shm`/`-journal` sits beside the database; takes and sha-verifies a restore point
into `../db-snapshots/` and will not continue without one; runs `prisma migrate deploy`; then
**names the migration actually applied** and ends in `✅ APPLIED AND VERIFIED` or
`❌ NOT WHAT WAS EXPECTED`. With `--expect` it diffs the result against the rehearsal's
fingerprint and demands zero material differences.

**Rehearsed end to end on a scratch copy of production**: applied `20260910233000_product_show_on_pos`,
17 → 18 `Product` columns, 13 → 14 migrations, and *« Fingerprint: IDENTICAL to the rehearsed
post-migration state »*. Both refusal paths exercised (a `-wal` present; already-up-to-date).
Production re-read afterwards and untouched.

**One implementation note worth keeping.** The script reads through Prisma's
`$queryRawUnsafe`, not `bun:sqlite`. Importing `bun:sqlite` needs Bun's types, and pulling
those in project-wide collides with Node's `ReadableStream` in `app/uploads/[...path]/route.ts`
— `tsc` went green→red→green establishing that. Reading through Prisma also means the file
cannot address a path of its own even by accident. **It uses only raw queries and never a
Prisma model**, deliberately: between preparing a migration and applying it the generated
client expects a column the database lacks, so `product.findMany()` would fail there for that
reason alone.

**Left behind:**
- **`scripts/apply-migration.ts` is the way to apply a migration here.** It is general, not
  R3.1-specific.
- **A green « successfully applied » banner is not evidence of applying the migration you
  meant.** `N migrations found` is the tell, and it is easy to miss.
- **The plan is at its 40 960-byte ceiling again.** Every addition now needs a retirement.

### PHASE 3 MIGRATION — APPLIED to production, and verified
**Done:** 2026-09-11 · **Commit:** *(records the application)*
**Supersedes:** the two verification entries above, which found it NOT applied.

**Applied 2026-09-11 at 02:13** with `bun scripts/apply-migration.ts --apply --expect …`,
**run by Claude at the operator's explicit instruction.** `CLAUDE.md` assigns
`prisma migrate deploy` against production to the operator; that default was overridden by a
direct request after two of their own attempts had not reached production. The rule exists to
stop Claude doing it unilaterally, not to stop the operator delegating it — recorded here so
the exception is visible rather than implied.

**The run, in full:** restore point taken and sha-verified first
(`../db-snapshots/custom.db.before-20260910233000_product_show_on_pos-2026-09-10`, sha256
`47b31348…` — the exact pre-migration bytes); then `14 migrations found` and
`Applying migration 20260910233000_product_show_on_pos`. **That `14` is the line that read
`13` on both failed attempts.**

**Verified independently afterwards, not by trusting the script's own verdict:**

| | before | after |
|---|---|---|
| `Product` columns | 17 | **18**, `showOnPos` at cid 17 |
| live DDL | — | `"showOnPos" BOOLEAN NOT NULL DEFAULT true` |
| `_prisma_migrations` | 13 | **14** |
| `PRAGMA schema_version` | 167 | **168** |
| sha256 | `47b33148…` | `15be251d…` |

`integrity_check` ok, 0 FK errors, no `-wal`/`-shm`. **All 81 products came out
`showOnPos = 1`**, so the migration changed no behaviour — exactly what the rehearsal
predicted. Every fiscal and trading table still at zero; catalogue still 81 products / 14
categories. **The fingerprint is IDENTICAL to the rehearsed post-migration state.**

**The app reads its catalogue again.** `product.count()` against production returns 81 where
it previously failed with « The column `main.Product.showOnPos` does not exist ». That broken
window — open from the moment the client was regenerated until the migration landed — lasted
about two and a half hours across three sessions.

**Why it took three attempts, and what actually fixed it.** Not the command, which was always
right. `prisma migrate deploy` prints the same large green « All migrations have been
successfully applied » whichever migration it applied, and the only thing distinguishing them
is a small `N migrations found` line above it. Twice that banner was read as success for the
*previous* migration. `scripts/apply-migration.ts` exists so the verdict cannot be misread:
it names the migration actually applied and ends in `✅` or `❌`.

**Left behind:**
- **`scripts/apply-migration.ts` is how a migration is applied here.** It is general, not
  R3.1-specific, and the next migration should use it.
- **A green banner is not evidence of applying the migration you meant.**
- **R3.3 is unblocked** — it needed this column.
- **The restore point stays** until the operator is satisfied; it is the only copy of the
  pre-migration state.

### R4.1 + R4.2 + R4.3 — small correctness, and three findings they turned up
**Done:** 2026-09-11 · **Findings:** L-79, L-80, L-71 closed; **L-85, L-86, L-87 opened**

Investigated with four parallel agents, one per item, then implemented and revert-verified
by hand. Every claim an agent made was re-checked against the code before it was acted on;
two were wrong and are recorded below.

**R4.1 / L-79 — the silent image-less backup.** `ensureMediaArchive` caught a failed
`tar` import with `console.warn` — the only `console.*` in a 1054-line file where every other
soft failure goes to `logTechnical` — and returned `null`, which is *also* what it returns for
« there is nothing to archive ». The two were indistinguishable in the `Backup` row, the audit
entry and the API response. Now: `{ unavailable: reason }` with a `WARN` technical-log row
naming the consequence (« UNIQUEMENT la base de données »), a `mediaUnavailable` key on the
audit entry and on the return. **No migration.** The pattern was copied, not invented —
`restoreUploadsArchive` already answers the identical failure with `{ failed }`.

*Plan correction:* the plan said « no record ». There **is** a record — `audit
("BACKUP_CREATED", …)` writes `mediaIncluded: false`. The accurate statement is that the
record could not distinguish a broken archiver from an empty media directory and carried no
reason. That is why one of the five tests pins the *negative* case, or the fix would
degenerate into warning on every backup.

*Also learned:* `mediaSources` puts `db/fiscal-archives/` in the same archive, so a failed
`tar` silently dropped the **annual fiscal archive** from the backup set too.

**R4.2 / L-80 — the cart add-on identifier.** `CartAddOn.id` was `string | null`,
`checkout-intent` propagated it, and the checkout schema requires `z.string()` — types that
described a request the server refuses. Narrowed to `string`, with the drop at the single
boundary where snapshot data becomes cart content (`orders-view.tsx`'s reorder path, via the
new `cartAddOnsFromSnapshot`). **Not** filtered at the intent boundary: the line would still
display and still be folded into `computeCartTotals`, so the client would tender a total the
server does not compute — trading a zod 400 for « Paiement incorrect », which is worse.
`combo-checkout.ts` still writes `{ id: null }` into `addOnsJson` deliberately, so a ticket
can name a surcharge; that is a snapshot, not cart content, and a test pins it.

**R4.3 / L-71 — the session tracker's false error.** `db.session.update(…).catch(() => {})`
throws on no-match (P2025) and **Prisma logs from its engine before the promise rejects**, so
the `.catch()` swallowed a rejection whose log was already written. `updateMany` matches zero
rows and resolves — no throw, therefore no log. Proved side by side on a scratch copy before
being written. `destroySession` eight lines below already used `deleteMany` for this reason.

*Measured at suite level, which is the honest evidence:* « No record was found for an update »
went **4 → 0**, which is the half this fix owns. Total `prisma:error` went **12 → 7-8** — the
remainder are socket timeouts from the *same* line contending for SQLite's single write lock,
and they vary run to run because they depend on contention. That half is **L-86**.

**What the tests can and cannot prove, stated rather than glossed.** Prisma's engine writes
past both `console.error` and `process.stderr.write`, so **no test in this process can assert
the absence of the log**. The file says so and asserts the mechanism instead.

**Three test-design problems, all found by running the revert:**

1. **A vacuous source assertion.** The first R4.3 check sliced `auth.ts` from « Touch
   lastActivityAt » to the first `"catch"` — which lands inside the *comment*, not the code.
   It asserted prose, passed against the reverted code, and was caught only by the revert.
   Source assertions now strip comments first.
2. **`mock.module` is process-wide.** The first R4.1 test mocked `tar`; `bun run test` runs
   every file in one process, so it **broke three real tests in `backup-restore.test.ts`**. A
   test that breaks other tests is not a test. Replaced with an injected `TarLoader`
   defaulting to the real import — the convention this file already uses for `BackupPaths`.
   (Also measured: a *synchronous* throwing factory does not make a dynamic import reject;
   only an `async` one does. Neither is usable here.)
3. **`mediaSources` counts a directory that merely EXISTS**, so « nothing to archive » needs
   the directories absent, not empty.

**The revert — thirteen properties across the three items, each alone and in both directions.
All thirteen are caught** (R4.1: 4, R4.2: 4, R4.3: 1, plus the four re-run after the vacuous
assertion was fixed).

**R4.4 prepared** — `scripts/trim-catalogue-names.ts`, dry-run by default. Measured
independently of the plan and it agrees exactly: fourteen rows, all single ASCII spaces, one
trailing and thirteen leading. Refuses if trimming would collide two siblings (none), takes a
sha-verified restore point, addresses rows by **id**, verifies after. Rehearsed on a copy: 14
trimmed, 0 left, every row count unchanged, idempotent on re-run.

**Left behind — three new findings, none of them fixed (safety rule 1):**
- **L-85**: `tar.c`/`encryptFile`/`fs.stat` are in no try/catch, so a media-archiving failure
  fails the *whole* backup including the database half that already succeeded. R4.1 fixed the
  silent half; this one is loud and fatal, and guarding it changes behaviour.
- **L-86**: `Session.lastActivityAt` is written every authenticated request and read by
  nothing. Removing the touch would take the remaining Prisma noise to zero and remove a
  write from a single-writer SQLite till — but it deletes a feature.
- **L-87**: reordering is broken for any product with a required option group, and the code
  comment asserts the opposite of what the server does.

**A cost measured and then RETRACTED.** An intermediate run took 806 s and was written up as
a regression from R4.1's real-scrypt backup tests. It was not: that run was contended by
other `bun test` processes started alongside it. Measured clean, the suite is **181 s for
1303 tests**, against ~160 s for 1288 before — about +20 s for 15 tests, five of which do real
scrypt and a `VACUUM INTO`. The lesson is the measurement discipline, not the number: do not
time a suite while running anything else against the same database.

### R4.5 + R4.6 + R4.7 — the three findings Phase 4 turned up, fixed
**Done:** 2026-09-11 · **Findings:** L-85, L-86, L-87 closed

Opened by R4.1-R4.3 and fixed on the operator's instruction the same day.

**R4.5 / L-85 — a media failure may not cost the database backup.** `tar.c`,
`encryptFile` and `fs.stat` sat outside any `try`, so a full disk or a permission error
propagated out of `createBackup` and failed the **whole** backup — including the database
half already snapshotted and encrypted. That is the wrong trade in every case: the database
is the part that cannot be reconstructed. Now guarded, reporting through the same
`{ unavailable }` channel R4.1 added, and **unlinking the partial `.tar.gz` and `.enc`** —
otherwise the next backup's `existsSync(encPath)` reuse check would take a half-written
archive for a good one.

**R4.6 / L-86 — the activity tracker writes at most once a minute.** The finding recorded
two options: delete the write, or keep it. A third was better and was taken: `getSession`
**already fetches the session row**, so adding `lastActivityAt` to that existing `select`
makes the staleness check free. The feature survives — `lastActivityAt` is the only record of
when a till was last used, which an idle-timeout policy would need — and the write happens
once a minute instead of once per request.

*The result is better than the finding predicted.* SQLite takes one write lock for the whole
database, so a fire-and-forget UPDATE on every authenticated request contended with the
request's own work. **A clean suite run now produces ZERO `prisma:error` blocks, down from
twelve** — the 4 P2025s went with R4.3 and all 7-8 socket timeouts went with this. The
remaining noise was not a separate defect; it was the same line.

**R4.7 / L-87 — a reordered line carries real choice ids.** `optionsJson` snapshots option
NAMES; the reorder path put them in the cart as `choiceId: ""` under a comment claiming the
server recomputed them. It does not — `pricing.ts` filters by `selectedOptionIds.has(c.id)`,
so every reordered option was silently dropped, and a product with a REQUIRED group had the
whole line refused. `resolveSnapshotOptions` matches the snapshot's names against the
catalogue and returns real ids, **plus the names it could not resolve**, so the cashier is
told rather than discovering it at payment.

*The match is trimmed and case-folded, and that is load-bearing:* the live catalogue holds
fourteen names with stray spaces (L-39), and R4.4 trims them. Without folding, fixing L-39
would silently break reordering for **every order already taken**. Tested in both directions.

**The revert — six properties, each alone and in both directions. All six are caught.** One
survived the first pass and was a real gap: the leftover-cleanup check was vacuous, because
the mock's `c()` threw *before* writing anything, so there was nothing to clean up. The mock
now writes its file and then fails, which is what a real mid-archive failure looks like.

**Left behind:**
- **`getSession` selects `lastActivityAt`** so the throttle stays free. Removing it from that
  `select` would reintroduce a query, not just a write.
- **The reorder match must stay trim/case-insensitive** across the L-39 cleanup.
- **A partial media archive must be unlinked**, or the next backup reuses it.

### R4.4 + R3.3 — the two operator items, applied to production
**Done:** 2026-09-11 · **Commit:** `b81f948` (the scripts) · **Findings:** L-39, L-69 closed

Both run by Claude against the live catalogue **at the operator's explicit instruction**
(« proceed to complete, launch the script if you need to »). `CLAUDE.md` assigns catalogue
edits to the operator; that default was delegated, and the exception is recorded here rather
than implied — the same way the Phase 3 migration was.

**R4.4 / L-39 — fourteen catalogue names trimmed.** `scripts/trim-catalogue-names.ts --apply`.
Restore point `custom.db.before-trim-names-2026-09-11`, taken and sha-verified first.
Result: 14 trimmed, 0 remaining, and independently re-read afterwards — **zero** names with
leading or trailing whitespace across all eight named tables, 81 products / 14 categories /
39 choices / 21 add-ons unchanged, `integrity_check` ok, 0 FK errors, every fiscal table
still at zero.

**R3.3 / L-69 — the three boxes are real menus.** `scripts/build-box-menus.ts --apply`.
Restore point `custom.db.before-box-menus-2026-09-11`. Each box keeps its name, price and
category — the till button does not move — and gains two slots: the food, fixed to a new
HIDDEN component (`showOnPos = false`, R3.1's switch), and the drink, from the whole
category.

| | forfait | food component | à emporter | sur place |
|---|---|---|---|---|
| Box 15 | 29,90 € | « Box 15 (sans boisson) » 26,40 € | **2,58 €** (10 % + 5,5 %) | 2,72 € |
| Box 35 | 29,90 € | « Box 35 (sans boisson) » 26,40 € | **2,58 €** (10 % + 5,5 %) | 2,72 € |
| Tenders box | 9,90 € | « Tenders box (sans boisson) » 8,40 € | **0,84 €** (10 % + 5,5 %) | 0,90 € |

**Every total equals the forfait** — the customer pays exactly what they paid before; only
the VAT split moves, and only à emporter. The weights sum exactly to the forfait, so
`apportion` returns them unchanged and the drink's share is its shelf price to the cent.

**The script validates before writing and prices after.** `validateComboShape` and
`validateComboAgainstCatalogue` — the checks the catalogue editor runs, which raw SQL
bypasses — gate every write; then each finished menu is priced through the REAL
`priceComboItem`, both order types, and the script refuses to report success unless the
booked VAT matches. The figures above are that verification's own output.

**The rehearsal earned its keep.** The first run on a scratch copy refused all six pricings
with « Option obligatoire manquante : Sauces ». That was the pricing being RIGHT: the
`Croustillants` category carries a required « Sauces » group which the hidden component
inherits, and the rehearsal passed no options. **Had this gone straight to production it
would have created three menus that could not be sold.** The menu governs no group, so
`askedGroups` still shows the sauce to the cashier — and every sauce is `priceModifier = 0`
(measured), so answering adds nothing to the forfait.

**Production after both:** 84 products (81 + 3 hidden), 9 menus composés (6 + 3), **80 on the
till grid** — the three components hidden, and `5 nuggets test` still inactive (L-81).
`integrity_check` ok, 0 FK errors, every fiscal and trading table still at zero.

**Left behind:**
- **The till flow for these three has changed**: pressing Box 15 now asks for the sauce *and*
  the drink. That is the point — the drink must be chosen for its rate to apply.
- **The hidden components must stay hidden.** They are priced as allocation weights, not as
  things to sell alone; `showOnPos = false` is what keeps them off the grid.
- **L-81 is still open**: `5 nuggets test` remains in the live catalogue, inactive.

### PHASE 5 — Cleanup: four strays, 27 interface files, 29 dependencies
**Done:** 2026-09-11 · **Findings:** none opened, none closed

**R5.1 — four strays deleted.** `db/test.db` (0 bytes), `upload/` (empty), `test-results/`
(one 45-byte Playwright `.last-run.json`) and `tsconfig.tsbuildinfo` (348 KB, regenerated by
`tsc`). All four untracked and gitignored, so the repo is unchanged by their going. The only
`test.db` references in code are **comments** about a different path under the OS temp
directory. **`db/custom.db`'s sha256 was recorded before and after and is identical** — the
one thing that had to be true when deleting inside `db/`.

**R5.2 — `src/components/ui/` went from 45 files to 18.** The plan's count of 27 orphans was
reproduced independently before anything was deleted: a regex over every `.ts/.tsx/.mjs/.js`
under `src/` and `scripts/` for an import specifier ending in `ui/<base>`. 45 files, 18 with
importers outside the folder, 27 without.

**Then the 27 were adversarially verified**, five at a time, each agent asked to *prove* its
batch reachable rather than confirm it orphaned — because a static import regex is blind to
dynamic `import()`, a re-export barrel, a string-keyed registry, a wildcard import, and files
outside the walked tree. **All 27 came back orphan at high confidence; none was refuted.**
Three escape hatches were closed structurally rather than by absence: there is **no
`index.ts` anywhere under `src/`**, so no barrel can exist; the intra-`ui/` import graph is six
edges, all pointing at `button`/`dialog`/`label` (kept) or `toggle` (an orphan whose only
importer, `toggle-group`, is also an orphan); and no filename appears as a string.

**R5.3 — 29 dependencies dropped, not the seven the item named.** The plan's seven were what
was unused *before* R5.2. Deleting the 27 components orphaned **22 more** — sixteen
`@radix-ui/*` plus `cmdk`, `input-otp`, `react-day-picker`, `react-hook-form`,
`react-resizable-panels`, `vaul`. Put to the operator with the costs measured; they asked for
a recommendation and took it.

*What keeping them would have cost, measured:* nothing at runtime — nothing imports them, so
nothing bundles them, and the built app is identical either way. The real costs were 47 MB of
`node_modules` (35 MB of it `date-fns`), install time, **audit noise** — a CVE against any of
the 29 would flag a project that never calls them — and a dependency list that lied about
what the app uses.

**THE TRAP THIS PHASE NEARLY WALKED INTO, and the reason to grep CSS and not only
TypeScript.** `tailwindcss-animate` and `tw-animate-css` differ by a hyphen. The app imports
**`tw-animate-css`** at `globals.css:2`; `tailwindcss-animate` was declared and used by
nothing — it appears only in `package.json`, `bun.lock` and the plan. The remaining components
use `animate-in` 44 times, `fade-in-0` 34 times, `zoom-in-95` 26 times, and those classes come
from the one that was KEPT. **Removing the wrong one produces no build error at all** —
Tailwind simply stops generating the classes and every dialog and dropdown animation dies
silently. There is no `tailwind.config.*` (Tailwind v4, CSS-configured), which is exactly why
a TypeScript-only search would have missed where the plugin is wired.

**How it was verified:** `typecheck`, `lint`, **`bun run build`** and the full suite, in that
order. The build is the one that matters: it compiles every route and would fail loudly if any
deleted file or dropped package were reachable. **1312 pass / 0 fail**, unchanged — no test was
deleted or weakened. `touch-and-labels.test.ts` scans that tree and asserts `>100` Buttons; the
total fell 151 → 150, measured before deleting.

**Left behind:**
- **`tw-animate-css` is the animation plugin. `tailwindcss-animate` was not.** Recorded in the
  plan's § 6 as well, because the names invite exactly the wrong deletion.
- **`tar` stays** — dynamically imported in `backup.ts`, invisible to static analysis. The same
  trap in the other direction, and the plan already warned about it.
- **`bun install` updated the lockfile but left the 29 directories on disk.** `bun.lock` and
  `package.json` are clean (140 lines removed) and a fresh install will not recreate them, so
  the 47 MB is saved on the next clean install and in whatever gets packaged — **not** in this
  working tree. Worth knowing before anyone re-measures `node_modules` and concludes nothing
  happened.
- **There is no barrel under `src/`.** That is what made the orphan analysis decidable, and it
  is worth keeping true.
- **`tw-animate-css` is in `devDependencies`** and is now the sole source of every animation
  class the app renders. Correct for Next.js — CSS is processed at build time — but it means a
  production-visible dependency lives in the dev block. Verified from the ARTIFACT, not
  inferred: the post-deletion stylesheet `.next/static/chunks/161110f86bb488b2.css` contains
  `animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-top-2`, `animate-pulse`, `--tw-enter`.
- **`tsconfig.tsbuildinfo` comes back.** R5.1 deleted it; every `bun run typecheck` regenerates
  it. It is gitignored, so its deletion was cosmetic and is not a state anyone should expect to
  persist.

**AMENDED 2026-09-11, after an adversarial pass reported.** Two things the batch's own gates
could not see:

1. **`touch-and-labels.test.ts` carried a whole-file exemption for a file R5.2 deleted.** Line
   161 was `if (rel(file).endsWith("ui/calendar.tsx")) continue;`, exempting that file's
   icon-only day button from the accessible-name assertion. **Nothing asserted the skip was
   still needed**, so the suite stayed green with the file gone and all four gates passed over
   a dead branch plus a comment describing a module that no longer existed. Removed, and the
   test still passes — which proves no surviving file needed the exemption. *`calendar.tsx:189`
   held the only `<Button` in all 45 original ui/ files, which is why the total fell 151 → 150.*
2. **The plan's R5.3 row stated a coupling that did not exist.** « Strictly after R5.2 or the
   remaining files stop typechecking » — but none of the 27 deleted files imported any of the
   seven. Their third-party imports were `recharts`, `react-day-picker`, `cmdk`, `vaul`,
   `react-hook-form`, `input-otp`, `react-resizable-panels` and sixteen `@radix-ui` packages.
   The real coupling runs the other way: R5.2 is what *created* the 22 extra orphans. The order
   was still right, for the opposite reason.

**Four keep-traps, all avoided** — each a package shared between a deleted file and a kept one:
`recharts` (deleted `chart.tsx`, but `dashboard-view.tsx:41` and `reports-view.tsx:43` import it
directly), `@radix-ui/react-dialog` (deleted `sheet.tsx`, kept `dialog.tsx`),
`@radix-ui/react-label` (deleted `form.tsx`, kept `label.tsx` with 15 importers) and
`@radix-ui/react-slot` (deleted `breadcrumb.tsx`/`form.tsx`, kept `badge.tsx`/`button.tsx`).

**CI's install step was the failure mode the project's own loop cannot see**, and it is closed:
both jobs run `bun install --frozen-lockfile`, which fails if `package.json` and the lockfile
disagree. `bun.lock` was genuinely regenerated — 41 package entries removed, none added, and a
closure check over every surviving entry reported 0 unresolved dependencies.

### PHASE 0 — R0.2, R0.3, R0.4: the dead data is gone, the unique data is not
**Done:** 2026-09-11 · **Findings:** L-46 closed

**A fresh backup was taken FIRST**, at the operator's instruction, because R0.2 would
otherwise have left exactly one restorable copy and it was a day stale — it predated both
migrations, R3.3, R4.4 and all of Phase 5. Created through the real `createBackup` service
rather than by starting the app against production:
`hibapos-backup-2026-09-11T12-40-36-138Z.dbenc`, 737 324 bytes, checksum `2e864d28…`.

**Verified by decrypting it**, not by trusting the exit code: valid SQLite, `integrity_check`
ok, 0 FK errors, and every table equal to production — 84 products, 14 categories, 39 choices,
21 add-ons, 25 combo slots, 2 users, 18 settings, **14 migrations, 18 `Product` columns,
3 hidden components, 9 menus, 0 dirty names**. It captures everything through Phase 5. The
media archive was REUSED (`reused=true`) because the image fingerprint had not changed, so one
49 MB file now backs both surviving backups.

**R0.2 — nine dead files deleted, 174 MB → 49 MB.** Verified individually before anything went:

- The three August `.dbenc` **fail AES-GCM authentication** under the current key — decryption
  was attempted on each, all three refused. Unrecoverable, exactly as the plan said.
- **Correction to the plan's wording:** the three July `.json` files are *not* encrypted at
  all, so "does not decrypt" never applied to them. They are plaintext and readable. **Checked
  for credential material and there is none** — the `users` rows carry id, username, name,
  role, active and timestamps, no `pinHash`. They held a July snapshot (37 products) and July
  development trading the pre-golive reset was always going to delete.
- Two guards ran before the deletion: no filename appeared on both the keep and delete lists,
  and the `Backup` table referenced none of the nine. Both surviving rows point at the two
  kept `.dbenc` files and the shared media archive.

**R0.4 — MOVED, not deleted. The plan's own warning was right.**
`db/custom.db.before-dupfix-2026-09-08` (sha `0db1c015…`) matched **no** snapshot in
`../db-snapshots/`; it really was the only copy of that state — 78 products, 21 orders,
3 Z reports, 4 fiscal events. The stated concern was *a second plaintext production database
sitting in `db/` beside the live one*, and moving it out answers that without destroying a
unique state. Operator's decision. sha256 identical after the move.

**R0.3 — the four pre-positioned settings, recorded as the item requires**, read from the
trial copy's own database before it was deleted:

| setting | value |
|---|---|
| `factice` | `false` |
| `printerEnabled` | `false` |
| `printerConnection` | `"usb"` |
| `printerQueue` | `""` |

**AND A CORRECTION THAT MATTERS MORE THAN THE DELETION.** R0.3 said the directory was
"verified 2026-09-10 to hold nothing unique". That was true of its `app/` copy and its
database — but **`LISEZ-MOI.md` (4,4 KB) and `runbook-complet.md` (38,5 KB) are in neither the
repository's working tree nor its git history.** Deleting the directory as written would have
destroyed the only copy of both.

`runbook-complet.md` is 673 lines and **roughly 240 of them are still live**, all of them
Phase 6's:

- **§ 4a — the printer.** The only written procedure for **R6.4**: `pnputil /export-driver`
  and `/add-driver`, and the hardware id `USBPRINT\SUNSOWTP-800036C` from `sunso.inf`,
  confirmed with the owner 2026-09-09. The plan's R6.4 row names the task; this is the only
  place the steps exist.
- **§ 6 — the point of no return**: R6.1's pre-golive reset. **§ 3**: R6.3's FACTICE.
  **§ 7**: V-07's first trading day.

Both moved to **`../HibaPOS-docs-archive/`**, outside the repository, with a `README.md`
saying what is live and what is withdrawn. Outside deliberately: Phase 1 retired
`docs/mise-en-service.md` and `.zscripts/README-windows.md` because they describe the
Windows-till deployment withdrawn in favour of Tauri v2, and most of this runbook describes
that same world — putting it into `docs/` would reverse that decision. sha256 identical on
both after the move. Then the 57 MB `app/` copy and the trial database were deleted.

**Left behind:**
- **`../HibaPOS-docs-archive/runbook-complet.md` is required reading before Phase 6.** R6.4 in
  particular cannot be done from the plan's one-line row alone.
- **Still awaiting the operator: a copy of a verified backup off this machine.** Both backups
  sit on the same disk as the database they protect.
- **"Verified to hold nothing unique" deserves the question "unique how?"** The 2026-09-10
  check was about data; it did not cover documents. That is how a 38 KB runbook came within
  one command of being deleted.

### R7.1 — the give-away figures are sealed into the Z report, and sent
**Done:** 2026-09-11 · **Commit:** `7843ad8` · **Finding:** L-83 closed · **Migration:**
`20260911160000_zreport_given_away` — **prepared and rehearsed, NOT applied**

**What changed.** Three nullable columns on `ZReport` — `givenAwayCount`,
`givenAwayItemsCount`, `givenAwayProductsJson` — written by `generateZReport` beside
`topProductsJson` and in the same transaction, and sent by the GET in `api/reports/z`. One
new test file, `src/lib/services/zreport-given-away.test.ts` (8 tests). `README.md` 1312 →
1320.

**The defect, and why it was silent rather than loud.** `ZReportDto` has declared all three
since Batch 7.4a and `reports-view.tsx:445` renders them. Nothing underneath existed: no
column, no write, no mapping in the route. So `report.givenAwayCount` was `undefined` on the
client — and `GivenAway` opens `if (!count) return null`, which `undefined` satisfies exactly
as `0` does. The « Offerts » block was **absent** from every Z report, which is
indistinguishable from a shift where nothing was given away. Nothing threw and nothing
logged. **A test asserting « the section is absent » would have passed against the bug**,
which is why every assertion in the new file is made with a non-zero give-away and checks
that the property is PRESENT and carries the figure.

**Sealed, not recomputed** — the operator's decision of 2026-09-11, mirroring
`topProductsJson`. A sealed figure stays what it was at the close; a recomputed one follows
whatever the aggregator says on the day it is read. The two are indistinguishable on the day
of the close and diverge afterwards, so one test makes them disagree on purpose: it
overwrites the sealed columns with figures the orders do not support and checks that the
route answers the columns (41 / 42 / « Sentinelle ») while `computeShiftReport` still answers
2 / 3. That is the only assertion that can tell which of the two options was built.

**The `CLOTURE_Z` payload was deliberately NOT grown.** `topProductsJson` is a column and is
not in that payload either, so mirroring it means the column and only the column — and the
per-shift entry of the fiscal chain does not take a fourth permanent growth for a figure
that carries no tax. Pinned, the same way `menu-reporting.test.ts` pins `topMenus`. The
stale half-sentence in `reports.ts` that said a Z report treats `givenAwayProducts` « the
same way: computed and shown, never sealed into a column » was corrected rather than left,
and `topMenus` now stands on `fiscal.ts`'s argument alone.

**How it was verified.**
- **Eight new tests**, in three groups: what is SEALED — read back out of the database with a
  fresh `findUniqueOrThrow`, never from the object `generateZReport` returned; what
  `GET /api/reports/z` SENDS — driven through `route-harness`, because the finding is about a
  DTO a client reads; and that the X report still computes them LIVE and still MOVES as more
  are given away, which is the half that was already correct.
- **Eight one-property reverts, every one caught.** A1/A2/A3 drop one column from the write,
  B1/B2/B3 drop one field from the route's map. Each failed 3-4 tests and no two failed the
  same set, so each property is independently load-bearing. **Two tests survived all six**,
  and neither was left at that: revert D **grows** the `CLOTURE_Z` payload and the pin catches
  it; revert C makes `computeShiftReport` answer 0 / 0 and the X-report control catches it.
- **Identity, not label.** The tests ring two products both named « Coca » at 1,50 € and
  3,50 € — the live collision, which is still live — and assert the sealed JSON carries two
  rows keyed by `productId`. Sealed under a name, a Z report here would record a give-away of
  « Coca ×3 » that no product ever had, in a document that cannot be corrected.
- **The zero case, explicitly.** A shift with no give-aways seals `0 / 0 / "[]"`, not null,
  and the route sends all three keys. That is the case every ordinary day produces and the
  one the defect looked exactly like; it cannot be checked by looking at the screen, only at
  the payload.
- **`bun run test` 1320 pass / 0 fail, 110 files, 150 s** — up from 1312 by exactly the eight
  tests added, zero `prisma:error` blocks · `typecheck` clean · `lint` clean.

**The migration, rehearsed.** `prisma migrate diff --from-migrations → --to-schema-datamodel`
returns « This is an empty migration », so the hand-written SQL is exactly what Prisma would
generate for this datamodel. Production was then copied to
`../db-snapshots/r71-acceptance/rehearsal.db` (sha256 verified against the original),
fingerprinted, and **the operator's own command** — `bun scripts/apply-migration.ts --apply`
with `DATABASE_URL` pointed at the copy — was run against it: `14 → 15`, `Newly applied
20260911160000_zreport_given_away`, `schema_version 168 → 171`, `✅ APPLIED AND VERIFIED`.

**The fingerprint diff is three lines and one row**, over every table, index, column order,
sealed row, event hash, `integrity_check` and FK check:

```
ZReport columns      25:givenAwayCount:INTEGER:notnull=0:default=null
                     26:givenAwayItemsCount:INTEGER:notnull=0:default=null
                     27:givenAwayProductsJson:TEXT:notnull=0:default=null
_prisma_migrations   14 → 15 rows, the one new row
```

cids 0-24 are unchanged, so SQLite added the columns **in place** and did not rebuild the
table — which was the point of hand-writing three `ADD COLUMN`s instead of taking the
generator's RedefineTables block for a fiscal table. Production's sha256
(`c265e6ff…25ea28`) and mtime (2026-09-11 13:40:36) are unchanged and no `-wal`/`-shm`
appeared beside it.

**The env override was proved, not assumed, before production was near it.**
`apply-migration.ts` spawns `prisma migrate deploy` without an explicit env, and Prisma loads
`.env` — whose `DATABASE_URL` is the live catalogue. Rather than believe that the process env
wins, an **empty** `probe.db` under the scratchpad was handed to the read-only `prisma migrate
status`: it reported **0 applied, 15 pending**, which production is not, and named `probe.db`
as the datasource. Only then was the rehearsal run.

**Left behind:**
- **The migration is NOT applied to production.** The command and its caveat are in the
  plan's § 1.
- **`--expect ../db-snapshots/r71-acceptance/fp-r71-after.json` is a snapshot of the data as
  it stood on 2026-09-11 at 16:00.** The fingerprint covers the catalogue, so a product
  edited between now and the operator's run shows up as a difference — a real one, but theirs
  and not the migration's. `apply-migration.ts` filters `Session`/`AuditLog`/`TechnicalLog`
  and nothing else. If it reports differences under `products` or `rowCounts`, read them
  before assuming the migration misbehaved.
- **Two rehearsal artefacts were deleted deliberately**, both byte-identical to a production
  database that is intact and covered by two verified backups: `r71-acceptance/rehearsal.db`,
  and — this one matters — the restore point `apply-migration.ts` took of the copy at
  `../db-snapshots/custom.db.before-20260911160000_zreport_given_away-2026-09-11`. **The
  script refuses to run if that path already exists**, so leaving it would have blocked the
  operator's real application with a message about overwriting a restore point.
- **L-82 is untouched, and it is not only the two Cocas.** Measured 2026-09-11 16:00 on
  production: `Coca`, `Fanta` **and** `Orangina` each exist twice, 1,50 € in *Canette* and
  3,50 € in *Bouteilles*, all six `active` and on the till grid. R7.2's row names only the
  Cocas. Nothing in `src/` or `scripts/` references any of the six by name, so a rename
  breaks nothing — `seed.ts` mentions « Fanta 33cl », and `db:seed` is forbidden here anyway.

### R7.1 MIGRATION — APPLIED to production, and verified
**Done:** 2026-09-11 · **Commit:** *(records a verification; no behaviour change)*
**Finding:** none

**What the operator did.** Ran `bun scripts/apply-migration.ts --apply` against production at
**16:19:06** on 2026-09-11 and reported it a success. **Verified from the data, not from the
report** — this installation has twice believed a migration was applied when it was not, and
both times the belief was reasonable.

**It was genuinely applied, on five independent readings:**

| Check | Before | After |
|---|---|---|
| sha256 | `c265e6ff…25ea28` | **`51552364…c15b72b`** |
| mtime | 2026-09-11 13:40:36 | **16:19:06** |
| size | 884 736 bytes | 884 736 — **unchanged, as predicted** |
| `_prisma_migrations` | 14 rows | **15**, last `20260911160000_zreport_given_away`, 0 rolled back |
| `ZReport` columns | 25 | **28** — cids 25/26/27, all `notnull=0 default=null` |
| `schema_version` | 168 | **171** — the number the rehearsal predicted |

`finished_at` = 1789139946111 ms, which is 16:19:06 local — the same instant as the file's
mtime, so the write that moved the file is the migration and not something else.

**The size not moving is the point, not a worry.** § 4 has said since Phase 3 that file size
is not evidence: an `ADD COLUMN` leaves it alone, measured. The sha256, the mtime and
`PRAGMA schema_version` are what move, and all three did.

**The decisive check: production's fingerprint is IDENTICAL to the rehearsal's.** The same
`fingerprint.ts` was run against the live file, read-only, and diffed against
`fp-r71-after.json` — every table, every index, every column order, every sealed row, every
fiscal event hash, `integrity_check`, `foreign_key_check`, the catalogue by id and price, and
`_prisma_migrations`. **Zero differences.** Production is in exactly the state the rehearsal
on a copy produced, which is the strongest form this check takes: it says both that the
migration ran and that nothing else did.

**And nothing else moved.** All fifteen trading tables still zero, counters still `0/0/0/0`,
84 products in 14 categories with 80 on the grid, two users, `integrity_check` ok, 0 FK
errors, journal mode still `delete`.

**Left behind:**
- **`../db-snapshots/custom.db.before-20260911160000_zreport_given_away-2026-09-11` is the
  restore point and its sha256 is `c265e6ff…25ea28`** — verified as the exact pre-migration
  state. It is now the only copy of production before R7.1. **Keep it.** It takes the
  loose-snapshot count in § 4 from 13 to 14.
- **`r71-acceptance/` keeps its two fingerprints and `fingerprint.ts`, and nothing else.**
  They are what made this verification a diff rather than an argument, and they are what a
  future migration should copy.
- **Three sealed columns exist that no Z report has ever written**, because zero Z reports
  exist. The first real close is what fills them, and the shape is frozen from that moment.

### R7.2 — no two products in this catalogue share a name — **PHASE 7 COMPLETE**
**Done:** 2026-09-11 · **Commit:** *(records an operator edit and its verification)*
**Finding:** L-82 closed · **Opened:** L-88

**What the operator did.** Renamed the three colliding pairs in the live catalogue, adding
`1.5L` to the *Bouteilles* row of each: `Coca`/**`Coca 1.5L`**, `Fanta`/**`Fanta 1.5L`**,
`Orangina`/**`Orangina 1.5L`**. Three pairs, not the one L-82's row named — the other two
were found while measuring for R7.1 and reported before the edit.

**Verified read-only against the live database, not against the report:**

- **Zero duplicate names in the whole catalogue**, not merely among the six. `SELECT name,
  COUNT(*) … HAVING COUNT(*)>1` returns nothing. That is the condition L-82 was about, and it
  is now true of all 84 products rather than of three pairs.
- **No case-insensitive near-collision either** — checked separately, because a report labels
  by name and `Coca` beside `coca` would read as two rows that look like one mistake.
- **Longest name in the catalogue: 26 characters** (`Tenders box (sans boisson)`), against
  the **36** at which a ticket article line would begin to wrap. The three new names are 9,
  10 and 13 characters. Nothing wraps.
- **Zero names carry stray whitespace**, so R4.4's result survives the edit.
- 84 products in 14 categories with 80 on the grid — **unchanged**, so this was a rename and
  not a create-and-delete. Trading tables still all zero; counters still `0/0/0/0`.

**Why the timing was the whole point.** A product's NAME is snapshotted into
`OrderItem.productName` at sale time and sealed into `topProductsJson` — and, since R7.1
earlier the same day, into `givenAwayProductsJson`. Had a single real close happened first,
the old ambiguous labels would be in an immutable document for good. Zero closes existed, so
nothing was restated. **This is the last moment that was true.**

**What R7.2 did NOT fix, and it is still true.** Reports label by name
(`report-widgets.tsx:141`, `csv-export.ts:54`). The figures were never at risk — R2.1 keys by
`productId` — but if two products are ever given the same name again, they will read as one
row again. The residual was recorded when L-82 was opened and it survives L-82's closure.

**Left behind:**
- **`Ice Tea` is the only *Bouteilles* row without a `1.5L` suffix**, beside `Ice-Tea Peche`
  in *Canette*. They do not collide, so nothing is wrong — but the four siblings are no
  longer consistent with each other. Cosmetic, not recorded as a finding.
- **L-88 opened** (below), found during R7.1 and recorded on the operator's instruction.

### L-81 — `5 nuggets test`: prepared and rehearsed, the operator's to run
**Done:** 2026-09-11 · **Commit:** *(adds `scripts/delete-product.ts`)* · **Finding:** L-81,
still OPEN until it is run

**Why a script existed for none of this.** `DELETE /api/catalog/products/[id]` is a **soft**
delete — `active: false` and nothing else, deliberately, « to preserve order history
integrity ». That is the right default, and it is why the app cannot serve this case at all:
`5 nuggets test` is *already* `active = 0`, so pressing the app's delete button on it changes
nothing. A row typed into the live catalogue by mistake is the one thing the soft delete
cannot remove.

**`scripts/delete-product.ts`**, following this directory's conventions: dry run unless
`--apply`, derives its path only from `DATABASE_URL`, takes a sha-verified restore point,
and verifies itself afterwards instead of trusting an exit code.

**Five refusals, and each one was exercised on a copy rather than reasoned about:**

| # | Refuses when | Proved by |
|---|---|---|
| 1 | the id names no product | `--id notarealid` → refused |
| 2 | the product is still `active` | a live `Coca` → refused |
| 3 | anything references it | a product in `ComboSlotChoice`, deactivated first → refused, naming 2 rows |
| 4 | a **sealed document** names it | a fabricated `DailyClose` carrying the id in `topProductsJson` → refused |
| 5 | the restore point does not match | sha check, same shape as `apply-migration.ts` |

**Refusal 4 is the one that matters and the one no schema can express.** `topProductsJson`,
`givenAwayProductsJson` and `dataJson` hold product ids as plain JSON with no foreign key, so
nothing in the database defends them. Refusal 3 matters for the opposite reason: SQLite would
have *allowed* most of it — `OrderItem.productId` is `ON DELETE SET NULL`, so past sales
would quietly lose the identity R2.1 counts them under, and `ComboSlot` is `ON DELETE
CASCADE`, so deleting a menu product would take its slots with it.

**Rehearsed on a fresh copy of production**: `84 → 83` products, row gone, 0 FK errors,
`integrity_check` ok, `✅ DELETED AND VERIFIED`. A fingerprint diff over every table, index,
column order and sealed row shows **exactly one Product row removed and the count 84 → 83, and
nothing else** — nothing cascaded. Production untouched: sha256 unchanged across the rehearsal.

**Nothing references it today** — 0 rows across `OrderItem.productId`,
`OrderItem.comboProductId`, `ComboSlot.productId`, `ComboSlotChoice.productId`,
`OptionGroup.productId`, and 0 of 8 sealed payloads, all of which are empty tables.

**Left behind:**
- **The command is in the plan's § 1.** The operator runs it.
- **This is only safe before trading.** Refusals 3 and 4 make it *refuse* afterwards rather
  than damage anything — but the window in which this row can simply be deleted is open now
  and closes at the first sale.

### SECURITY — `SESSION_SECRET` rotated after it leaked into a session transcript
**Done:** 2026-09-11 · **Commit:** *(no tracked file changed — `.env` is gitignored)*
**Finding:** none recorded; the leak was this session's own

**What happened.** While re-measuring baselines, `.env` was printed through a filter that
redacted values matching `SECRET` on the **value** side and not on the key side. The
`DATABASE_URL` line was the target; `SESSION_SECRET` went past the filter in plaintext and is
in the session transcript. `BACKUP_ENCRYPTION_KEY` was excluded by a second filter and did
**not** leak. The operator was told in the same report and chose to rotate.

**What it protects.** `SESSION_SECRET` keys the HMAC-SHA-256 that signs session cookies
(`auth.ts:170`). Holding it lets someone forge a session cookie for any user — but only
against a server they can reach, and this one binds `127.0.0.1` (DD-06) and has never been
deployed. The exposure was real and its reachable blast radius was nil.

**How it was rotated, without Claude seeing the new value.** A script generated 32 random
bytes as hex — the shape `auth.ts`'s own error message recommends — and wrote it in place.
It never printed either value. The evidence it changed is an 8-character sha256 prefix of
each: `ffcdc855…` → `9920c879…`.

**The real hazard was never `SESSION_SECRET`.** `BACKUP_ENCRYPTION_KEY` lives in the same
279-byte file, and damaging that line would make both verified backups permanently
undecryptable — the worst outcome available in this repository. So the rotation backed the
file up and verified the copy byte-for-byte *before* writing, rewrote exactly one line, and
then asserted that **every other line was byte-identical**: `lines changed: [1]`, which is a
complete proof that `DATABASE_URL` and `BACKUP_ENCRYPTION_KEY` are untouched. No backup
decryption was needed to establish that, and none was run.

**Verified afterwards at the runtime**, not just in the file: the process reads
`SESSION_SECRET` as 64 characters matching `/^[0-9a-f]{64}$/`, with no stray quotes, passing
`auth.ts`'s ≥32 guard, and `createHmac("sha256", …)` signs with it. `DATABASE_URL` still
parses as a `file:` URL and `BACKUP_ENCRYPTION_KEY` is still 64 characters.

**Left behind:**
- **One `Session` row is now unverifiable** and its holder must sign in again. The row was
  not deleted — the cookie simply fails its HMAC check, which is what rotation means.
- **`.env.bak-before-session-rotation-2026-09-11` sits beside `.env`**, gitignored by the
  `.env*` rule. It holds the OLD session secret — already public in the transcript — and the
  *same* backup key `.env` holds, so it is a recovery path rather than a new exposure. Delete
  it once a sign-in has been confirmed.
- **The plan's § 3 invariant now reads « rotated 2026-09-11 »**, not 2026-09-07.
- **Redacting by value is not redacting.** The filter matched `.*SECRET.*` against the whole
  line's right-hand side and let a line through whose KEY was the secret's name. Match on the
  key, or print `grep -oE '^[A-Z_]+='` and nothing else — which is how `.env` was inspected
  for the rest of this session.

### CORRECTION to the L-81 entry above — `scripts/delete-product.ts` already existed
**Done:** 2026-09-11 · **Commit:** *(corrects `fcf5b93`)* · **Finding:** none new

**Append-only, so the entry above stands and this points at it.** The L-81 entry says
« adds `scripts/delete-product.ts` » and describes five refusals as though the script were
new. **It was not.** A `scripts/delete-product.ts` had existed since 2026-09-09 (`d09c93a`,
« add a guarded product hard-delete »), it is documented in `scripts/README.md`, and it is
named in `docs/CHANGES-LOG.md`. It was overwritten without being read. `git status` showed
it as ` M` rather than `??`, which is how it was caught — after the commit, not before.

**It had really run, four times.** The live audit log holds four `PRODUCT_HARD_DELETED` rows
written by it: *Menu Eco*, *Duo Chickenroyale*, *Duo Cheeseroyale*, *Duo Geant Royale*. This
was not a draft nobody used.

**What the overwrite destroyed, and what was restored.** The two versions are now merged.

| The 2026-09-09 script had | Status |
|---|---|
| an `AuditLog` `PRODUCT_HARD_DELETED` write, `userId: null`, in a transaction with the delete | **RESTORED.** It is the lasting record — the audit log survives § 6's reset. Four real rows already depend on the pattern. |
| French operator-facing console text | **RESTORED.** This is a script an operator reads at a till. |
| the exact-one-match refusal on an ambiguous name | **RESTORED**, and the name form still works |
| `OptionGroup`/`OptionChoice` cascading with the product, deliberately | **RESTORED.** The rewrite had turned it into a refusal, which would have blocked legitimate deletions; the schema's `onDelete: Cascade` is the intent. |
| the pointer to `docs/CHANGES-LOG.md` | **RESTORED** |

| The 2026-09-11 rewrite added | Status |
|---|---|
| `--id` addressing | **KEPT**, and now preferred — a name can be renamed afterwards, an id cannot, and R7.2 renamed three pairs the same day |
| refusals on `OrderItem.comboProductId`, `ComboSlot.productId`, `ComboSlotChoice.productId` | **KEPT.** Menus composés did not exist when the original was written. |
| the **sealed-payload** refusal | **KEPT**, and it is the one no schema can express |
| a sha-verified restore point, and post-delete verification | **KEPT.** The original said « take a backup first » in prose. |

**Re-rehearsed after the merge**, on fresh copies of production: every refusal fired — no
argument, unknown id, still-active, referenced by `ComboSlotChoice`, named by a fabricated
sealed `DailyClose` — and the happy path gave `84 → 83`, 0 FK errors, `integrity_check` ok,
**and the `PRODUCT_HARD_DELETED` audit row**, which the rewrite would not have written.
Production untouched throughout.

**Two documents the overwrite had made wrong, both fixed:**
- **`scripts/README.md`** described three refusals and a name-only interface. Now six and both
  interfaces.
- **The plan's § 5 row** said the script was added 2026-09-11. It says « exists since
  2026-09-09 and has run four times » instead.

**The lesson, and it is the second time in one session.** Neither `scripts/` nor
`scripts/README.md` was read before writing a script into that directory. The same omission
produced a second near-miss in the same hour — see the rotation entry below.

### CORRECTION — `scripts/rotate-secrets.ts` exists, and its docblock argued for data loss
**Done:** 2026-09-11 · **Commit:** *(corrects a stale claim; no behaviour change)*
**Finding:** none recorded — corrected in place

**The near-miss.** `SESSION_SECRET` was rotated by an ad-hoc script written for the purpose,
without noticing that **`scripts/rotate-secrets.ts` already exists** (SEC-ROT / Batch 7.3) and
does exactly this, on the operator's machine, never printing the values. It was found while
fixing the `delete-product.ts` overwrite.

**Using it would have been WRONG for what was asked, which is luck and not judgement.** It
rotates **both** `SESSION_SECRET` *and* `BACKUP_ENCRYPTION_KEY`, by design and in one step.
The operator asked for the session secret alone. Rotating the backup key would have made
**both verified restorable backups permanently unreadable** — the outcome this plan worries
about more than any other. The ad-hoc rotation rewrote one line and asserted every other line
byte-identical, so `BACKUP_ENCRYPTION_KEY` and `DATABASE_URL` are provably untouched.

**And its docblock was stale in the dangerous direction.** It read:

> « DD-04 accepted that: Batch 8.2 established the three on this install are not restorable
> anyway — they predate seven fiscal tables and `assertCompatibleSchema` refuses them. »

Measured 2026-09-11: **those three were deleted by R0.2.** `db/backups/` holds **two backups
that ARE restorable, both verified by decryption** (2026-09-10 20:42 UTC, 2026-09-11
12:40 UTC, sharing one 49 MB media archive), and the `Backup` table names exactly those two.
So the paragraph told a reader that rotating `BACKUP_ENCRYPTION_KEY` discards three useless
files, when today it destroys both good ones. **Corrected in the file, dated, with the old
text quoted** so the correction is auditable — and with a line saying that rotating only
`SESSION_SECRET` needs a different instrument.

**Left behind:**
- **Read `scripts/README.md` before adding anything to `scripts/`.** It is a table of all
  sixteen with what each one writes. Both of this session's near-misses would have been
  caught by opening it.
- **The plan is at 40 957 of its 40 960 bytes — three to spare.** Nothing further can be
  recorded in it without retiring something first.

### PHASE 6 OPENED — the five preconditions, measured read-only
**Done:** 2026-09-11 · **Commit:** *(records measurements; no behaviour change)*
**Finding:** none recorded — two hardware blockers and one stale runbook section, all below

**What this is.** Phase 6's five rows are all the operator's to perform. This entry records
the read-only state each one was in when the phase opened, so that afterwards there is
something to verify the operator's report against rather than taking it on trust.

**The archive README was read first, then `runbook-complet.md` § 4a, § 6 and § 7** — the
sections its map calls live.

#### R6.1 — the reset would delete NOTHING today

Measured with `bun:sqlite` read-only, against the **script's own `DELETION_ORDER` and
`PRESERVED` lists** copied out of `scripts/pre-golive-reset.ts` rather than from the plan's
prose:

```
WOULD DELETE   Receipt 0 · OrderItem 0 · Payment 0 · Refund 0 · Order 0 · Customer 0
               ZReport 0 · CashMovement 0 · Shift 0 · FiscalEvent 0 · DailyClose 0
               MonthlyClose 0 · AnnualClose 0 · FiscalArchive 0 · GrandTotal 0 · Table 0
               TOTAL 0
WOULD KEEP     User 2 · Category 14 · Product 84 · OptionGroup 10 · OptionChoice 49
               CategoryOptionGroup 8 · CategoryOptionChoice 39 · CategoryAddOn 21
               ComboSlot 25 · ComboSlotChoice 9 · ComboSlotOptionRule 7 · Setting 18
               AuditLog 601 · TechnicalLog 9 · Session 1 · Backup 2      TOTAL 899
FiscalCounter  0 / 0 / 0 / 0 — already the value the reset would write
```

The fiscal-archives directory **does not exist**, so there are no archive files to delete
either. **The plan's claim that the reset keeps the catalogue, the users, the settings and the
audit log is confirmed against the script**: `AuditLog`, `TechnicalLog`, `Session` and
`Backup` are on the `PRESERVED` list by name, and the script's own header explains why —
« deleting an audit trail is the exact thing this application forbids everywhere else ».

**So the question the plan poses — « does it still need to run, and what would it destroy » —
has a measured answer: it would destroy nothing, and it is therefore not needed *now*.** It
becomes necessary only if trading is rung between now and the first real sale, which is what
proving the printer (R6.4) and V-07 both require. Put to the operator as a decision.

**Its three guards were checked, not assumed:** `FISCAL_CHAIN_KEY` is absent so guard 1
passes; the app was not answering on 3000/3001 at the time of the final check so guard 2
passes; guard 3 is the typed `EFFACER` and the backup question, which only the operator can
answer.

#### R6.4 — blocked on hardware, in the exact way § 4a warns about

`Get-Printer` on this machine:

```
SUNSO WTP-800   driver SUNSO WTP-800   PortName COM1:   PrinterStatus Error
```

And `Get-PnpDevice`: **no `USBPRINT` device at all**, no device of any class matching
`SUNSOWTP`; the only match is the `PrintQueue` object itself. `Get-PrinterPort` lists
`COM1:`–`COM5:` and **no `USB00x` port**.

So the driver is installed and the queue exists, but **the printer is not plugged in** —
Windows never created the USB port. § 4a names this state and why it is the dangerous one:

> Its `PortName` starts with **`USB`** … If it says `COM1:` the driver installed **without**
> the device attached: replug the cable and re-check. **A queue on `COM1:` prints nothing and
> reports success.**

A silent failure, not a loud one. Nothing in the app can detect it: the spooler accepts the
job either way, which is § 4a.3's own limit — « the spooler accepting a job means the bytes
reached the queue, not that the printer printed ».

#### R6.5 — blocked on hardware

`Get-Volume`: **one volume, `C:`**, 237,1 GB with 81 GB free. No second drive and no
removable media attached. `BACKUP_LOCATION` is absent from `.env`, so `paths.ts:64` falls
through to the default beside the database. Both verified backups are therefore on the same
disk as the database they protect — the plan's oldest open item, unchanged.

#### R6.2 and R6.3 — nothing to measure beyond their preconditions

`FISCAL_CHAIN_KEY` absent; `factice=true`. Both are single operator actions whose order is
fixed by R6.1.

#### Two things found while measuring, neither part of any row

**1. The app was running against the LIVE database, bound to `0.0.0.0`.** Port 3000 answered
`{"status":"ok","service":"hibapos"}` and `GET /api/auth/profiles` returned the real `admin`
and `manager` rows with production ids — so the server had `db/custom.db` open. `netstat`
showed `0.0.0.0:3000 LISTENING`. It had stopped by the next check, a minute later.

**`bun run start` passes `-H 127.0.0.1`; `bun run dev` does not** (`package.json:7,9`). So
**DD-06 — « No LAN access. The server binds `127.0.0.1` » — is true of the production path
and NOT of `dev`**, and `next.config.ts:27` justifies having no HSTS on the strength of that
binding. § 5 already forbids `bun run dev` from this directory because it loads the real
`.env`; what is new here is that it is also reachable from the network while it runs. A
one-word change to `package.json` would make DD-06 true of both paths; not made, because it
is outside Phase 6's rows (safety rule 1) and is the operator's call.

**2. The database did not move while the app was up.** sha256 `0d304ee7…` and mtime
16:33:12 were identical before and after, so the § 4 baseline holds. The single `Session`
row's `lastActivityAt` is 16:32:32 — already inside that sha. That row belongs to `admin`
and its cookie was signed with the **pre-rotation** `SESSION_SECRET`, so it stops verifying
at the next restart; the row was not deleted, because failing the HMAC check is what
rotation means.

**Left behind:**
- **R6.1 needs a decision before it needs a command.** Its dry run is safe and prints the
  same tables as above; the runbook asks for them to be recorded, and they are, here.
- **R6.4 needs the USB type-B cable plugged in**, then `Get-Printer` must show a `USB00x`
  PortName before anything in Réglages is worth setting. Until then the queue is a trap.
- **R6.5 needs a volume.** A drive letter or a USB stick; nothing else is blocking it.
- **Nothing in this entry is evidence of French fiscal or legal compliance.**

### R6.5 (half) — the catalogue is on the Desktop, and why that is not yet enough
**Done:** 2026-09-11 · **Commit:** *(the config edit changed no tracked file — `.env` is gitignored)*
**Finding:** none recorded — one gap reported to the operator, below

**The operator's instruction:** « back up the catalogue on the desktop for the moment, and
then I will take it to a disk drive. »

**What was done.** `BACKUP_LOCATION` was added to `.env` pointing at
`C:/Users/einer/OneDrive/Desktop/HibaPOS-Sauvegardes`, and the three existing backup files —
two `.dbenc` and the shared 49 MB media archive — were copied there. **Each copy's sha256
matches the original**, and the 2026-09-11 one was **decrypted from the new location** and
reported « Format SQLite valide ».

**That decrypt is also the direct proof the rotation was safe.** Earlier the same day
`SESSION_SECRET` was rotated in the same file, and the argument that `BACKUP_ENCRYPTION_KEY`
survived was byte-identity of its line. This opens a real backup under the current key — by
use rather than by argument.

**The `.env` edit was made with the rotation's rigour**, because the hazard in that file is
unchanged: back up first and verify the copy, add one line, then assert every pre-existing
line is byte-identical and that exactly one line was added. It was: 3 lines to 4, the three
original lines unchanged, `BACKUP_ENCRYPTION_KEY` and `DATABASE_URL` among them.

**WHY THIS IS ONLY HALF, and both halves matter:**

1. **The Desktop is inside OneDrive** — `[Environment]::GetFolderPath('Desktop')` resolves
   under `$env:OneDrive` — so a file there does sync off the machine, which is what the plan's
   oldest open item asks for. But the **OneDrive process was NOT running** when this was set,
   so nothing has synced yet. Until it does, all three copies are still on `C:` beside the
   database they protect, which is the same failure mode as before, in a new folder.
2. **The copied backups are SUPERSEDED.** Measured by decrypting the newest one rather than
   assumed: it carries **14 migrations** (last `product_show_on_pos`), **25 `ZReport`
   columns**, and `Coca` / `Fanta` / `Orangina` **still doubled**. Production now has 15
   migrations, 28 columns and no duplicate name. So the newest backup predates both R7.1's
   migration (16:19) and R7.2's renames (16:33) — it holds the very catalogue the renames
   replaced, which is the opposite of « retain the catalogue because it is the correct one ».

**So the outstanding action is a FRESH backup**, and it is the operator's: `createBackup()`
writes a `Backup` row, which is a production write. It will land in the Desktop folder by
itself now. Verifying it afterwards is read-only and is this session's to do.

#### Reported, not recorded as a plan item: nothing exports or imports a catalogue

The operator settled the install question on 2026-09-11: **a fresh install in France,
retaining this catalogue.** Checked against the code rather than assumed — **there is no
mechanism for that today.** None of the sixteen scripts exports or imports catalogue data;
`src/lib/csv-export.ts` exports the dashboard only; and `/api/seed` seeds
`services/seed.ts`'s DEMO catalogue (« Fanta 33cl » at 20 % VAT), not this restaurant's.
DD-16 records that the catalogue IMAGES are tracked in git and that this is « currently their
only versioned copy » — the catalogue DATA has no versioned copy at all, only `db/custom.db`
and the encrypted backups.

So « fresh install, keep the catalogue » has no path today except carrying `db/custom.db`
itself, which is not a fresh install. **Deliberately NOT added to this plan**: the operator's
instruction of 2026-09-11 is that the Tauri v2 conversion stays out of `REMEDIATION_PLAN.md`,
and this gap exists only to serve it. Written down here so it exists somewhere, and reported
to the operator in the same breath rather than left as a surprise for install day.

### PREP-1 — `next dev` binds loopback, and a fresh install starts safe
**Done:** 2026-09-11 · **Commit:** *(this commit)* · **Finding:** none new
**Authorised by:** the operator's « yes to all, start with the dev fix and defaults », after a
brainstorm on what a push-button Tauri install needs. **Not** a Phase 6 row — Phase 6 is five
operator actions and this is code.

**Three one-line changes, and the reason each one is not cosmetic.**

#### 1. `package.json` — `"dev": "next dev -p 3000 -H 127.0.0.1"`

DD-06 says « No LAN access. The server binds `127.0.0.1` ». `start` carried `-H 127.0.0.1`;
**`dev` did not**, so Next bound `0.0.0.0`. Found by looking at a running server rather than
at the file: `netstat` reported `0.0.0.0:3000 LISTENING` while the operator had `bun run dev`
up against the live database, and `GET /api/auth/profiles` — which needs no PIN and returns
every username — answered from it. `next.config.ts:27` also declines to set HSTS *because* of
the loopback binding, so the decision was load-bearing twice over.

`account-policy.test.ts` already pinned DD-06 — **and only for `start`**. That is the shape of
gap this project keeps finding: a decision tested at one of its two sites. The test now covers
both.

#### 2. `DEFAULT_SETTINGS.factice`: `false` → **`true`**

A brand-new database treated its **first ticket as a real fiscal document** — before a printer
was configured, before anything was checked, with nobody having said « go live ». The stamp is
now the default and removing it is the deliberate act, which is what R6.3 has always been.

Changes nothing for the only existing install, which stores `factice=true` as a real row. It
changes what a FRESH database means — and on 2026-09-11 the operator settled that the
restaurant gets a fresh install with this catalogue carried into it, which is what made the
default reachable rather than theoretical.

#### 3. `DEFAULT_SETTINGS.printerConnection`: `"network"` → **`"usb"`**

This **reverses Batch 1.3d**, which chose `network` because it was « what every existing
install already means, so an upgrade changes nothing until the operator switches it ». That
argument was about protecting installs on upgrade. There is one install, it has never traded,
and `printerConnection` is **absent from its `Setting` table** — so the default WAS its
effective value, and the value it defaulted to was wrong: the Sunso WTP-801 has always been on
a USB type-B cable (confirmed with the owner 2026-09-09), and every print attempt therefore
answered *« Renseignez l'adresse IP »*, an answer that was never available.

**A consequence worth noting: this does half of R6.4.** Production's effective connection is
now USB without a row being written, so R6.4 reduces to picking the queue.

**`printerEnabled` stays `false` and `printerQueue` stays `""`** — deliberately. An
uncommissioned install should not be attempting to print, and printing never loses a sale, so
leaving it off costs nothing and removes failures nobody can act on yet. The queue cannot be
guessed; it is chosen from the list Windows reports.

**How it was verified.**

- **`fresh-install-defaults.test.ts`, 5 new tests**, and they start from a genuinely EMPTY
  `Setting` table — `expect(await db.setting.count()).toBe(0)` before every assertion, so each
  one is about a DEFAULT and not about a saved value. They assert **consequences**, because a
  pin on a constant proves a constant: a ticket rendered through the real checkout and the real
  renderer carries `FACTICE` and `TICKET NON VALABLE`; a fiscal event written under fresh
  settings comes back `factice: true`; and `resolvePrinter()` with printing enabled answers
  *« Choisissez l'imprimante Windows »* and **not** *« adresse IP »*.
- **Three one-property reverts, each caught, none masking another**: `factice` back to `false`
  failed 4; `printerConnection` back to `"network"` failed 4; dropping `-H 127.0.0.1` from
  `dev` failed **exactly 1** — the new DD-06 assertion.
- **`bun run test` 1326 pass / 0 fail, 111 files**, zero `prisma:error` blocks; `typecheck` and
  `lint` clean. `README.md` 1320 → 1326.

**Two existing tests failed, and neither was weakened.**

1. **`settings-factice.test.ts` — « leaves the journal entry unmarked when the setting is
   off »** never turned the setting off. It read `getSettings()` against an empty table and
   leaned on the default being `false`, so it passed for a reason unrelated to its subject and
   broke the moment the default moved while the behaviour it names was untouched. It now calls
   `saveSettings({ factice: false })`, which is what its name always claimed.
2. **`printer-connection.test.ts` — « an install that predates this batch still resolves to
   TCP »** was Batch 1.3d's upgrade shim: no `printerConnection` row plus a stored host meant
   network. Re-pinned to USB, with the irony recorded — **the shim asserts exactly the
   inference L-70 existed to abolish** (« which transport, decided by an explicit setting
   rather than by which field happens to be filled »). A stored host implying network IS that
   inference. Production's `printerHost` is the empty string, so the scenario it protected does
   not exist.

Both keep exact assertions; only the decisions they record changed, and both say so with a
date and the superseded text.

**A verification flaw found in passing, and worth writing down.** `bun run typecheck 2>&1 |
tail -3; echo $?` reports **`tail`'s** exit status, not `tsc`'s. Six TS2339 errors were
reported as clean by that pattern before being caught in the same run's output. Redirect to a
file and read `$?` from the command itself. (The earlier runs this session were genuinely
clean — `tsc` prints its errors to stdout and none appeared — but the check could not have
told the difference.)

**Left behind:**
- **The plan's § 4 Settings row said print attempts answer « Renseignez l'adresse IP ».**
  Corrected: they now answer « Choisissez l'imprimante Windows », and only the queue is left.
- **Next, on the operator's agreed order:** catalogue export/import, then first-run key
  generation with a screen for the two recordable keys, then auto-migrate-with-backup.
- **Still unanswered:** whether the restaurant's machine gives remote Windows admin rights,
  which decides whether the installer can do the driver unattended.

### PREP-2 — a catalogue can leave one install and enter another
**Done:** 2026-09-11 · **Commit:** *(this commit)* · **Finding:** none new
**Authorised by:** the operator's « go ahead with export/import », on the design agreed in the
same exchange: ten tables, images excluded, `Setting` excluded, ids preserved, replace into an
empty catalogue only.

**What it is for.** The restaurant gets a **fresh install** in France keeping this catalogue.
Nothing could carry it: no script exported catalogue data, `csv-export.ts` covers the
dashboard, `/api/seed` seeds a DEMO catalogue. The only route was to carry `db/custom.db`
itself, which is not a fresh install.

**What shipped.** `src/lib/services/catalogue-transfer.ts`, two routes
(`GET /api/catalog/export`, `POST /api/catalog/import`, both SUPER_ADMIN), and a card in
Réglages so install day runs **no commands** — the whole point of the exercise.

| Decision | What was built |
|---|---|
| ten tables, dependency order | `CATALOGUE_TABLES`, 266 rows on the live catalogue |
| images excluded | every image column holds a PATH, and those 147 files are tracked in git (DD-16), so they arrive with the app. The export **reports** any referenced file missing from disk, at export time |
| `Setting` excluded | the printer queue and `factice` belong to an install, not a catalogue; carrying them is how a fresh install arrives live and pointed at the wrong printer |
| ids preserved | R2.1 counts everything under identity; a regenerated id is a catalogue no past sale can be matched against |
| replace-into-empty only | refuses unless **all ten** tables are empty. One stray `Category` collides on its unique name and takes the import down halfway |

**Two things the design gained while being built.**

1. **A pre-flight reference check.** `CATALOGUE_REFERENCES` names all fourteen foreign keys of
   the ten tables, and a file whose references do not resolve *within itself* is refused in
   French, naming the reference, **before a database round trip**. It replaced a test that
   broke a foreign key and asserted the transaction rolled back — see below.
2. **Categories are inserted in two passes.** `Category.parentId` points at Category, so every
   row goes in without its parent and a second pass sets it. That makes the import independent
   of the order categories happen to sit in the file, at any depth. A topological sort would
   work and would fail on a cycle this cannot even notice.

**How it was verified.**

- **22 tests**, driven over the two routes through `route-harness` and read back **out of the
  database**, because what a fresh install ends up holding is the claim. The fixture is
  structurally complete: a nested category, per-product options, category globals, an add-on,
  and a menu composé with a slot, a filler and an option rule.
- **A drift guard on the travelling columns.** Each table's field list is compared against the
  database's own `PRAGMA table_info`; a column added to `Product` and not added to the list
  would silently not travel, and the fresh install would be quietly missing a field. It fails
  instead. `updatedAt` is the only exclusion, and it is excluded everywhere.
- **Six one-property reverts.** No two-pass → nesting breaks. Emptiness check narrowed to
  `Product` → the stray-category refusal breaks. Ids regenerated → 7 tests break. No
  pre-flight → both dangling-reference refusals break. No audit call → the audit test breaks.
- **`bun run test` 1348 pass / 0 fail, 112 files**, zero `prisma:error`; `typecheck` and `lint`
  clean. `README.md` 1326 → 1348.

**AND IT WAS RUN FOR REAL, on a production build against a copy of the live catalogue.**
Tests over a harness are not a feature working. `bun run build` (BUILD_ID newer than every
source, and the build listing names both new routes), then `bunx next start -p 3090 -H
127.0.0.1` with `DATABASE_URL` and `HIBAPOS_DATA_DIR` on a scratch copy:

- **Which database it had open was PROVED before any write.** A marker user
  `MARQUEUR-COPIE-JETABLE` was written into the copy and came back from the pre-auth
  `GET /api/auth/profiles`. The copy also carried a PIN chosen for it — never a production
  one — so the whole walkthrough ran unattended.
- **Export:** HTTP 200, `content-disposition: attachment`, `cache-control: no-store`,
  **103 722 bytes**, `migration: 20260911160000_zreport_given_away`, **266 rows** across the
  ten tables, and **`missingImages: 0`** — every one of the 80 referenced images is on disk.
- **Refusal:** importing into the populated catalogue answered **409** naming all ten tables,
  and left 84 products / 14 categories untouched.
- **Round trip:** the catalogue was emptied, then the file imported — **HTTP 200, 266 rows**.
  Products, categories, combo slots and option rules all came back **byte-identical** to a
  fingerprint taken before the wipe, `integrity_check` ok, 0 FK errors, **80 products on the
  POS grid**, the six nested categories with their parents, **zero duplicate names**, and
  `Coca 1.5L` at 350 — R7.2's renames intact through the round trip.
- Production's sha256 and mtime unchanged throughout; the server stopped with `taskkill`, port
  free, no node/bun left running, and every scratch copy deleted.

**A test that proved less than its name, and what replaced it.** The first version of « rolls
the WHOLE import back » broke a foreign key and asserted the rollback. It passed — but it was
testing that `db.$transaction` works, which is Prisma's claim and not this module's, and it
cost a `prisma:error` block on every suite run (« Foreign key constraint violated on the
foreign key » — no table, no row, no id). A clean run has **zero** of those and that number is
worth more. So the module now refuses first, with a message naming the reference, and the
transaction stays as defence in depth, deliberately not asserted.

**A second one, found by a revert surviving.** « two exports of one catalogue are
byte-identical » was green with `ORDER BY id` removed: SQLite returns rows in rowid order
consistently for an unchanged table, so two consecutive exports match either way. The plan's
method calls that a question, not a verdict — and the answer was that the test was weaker than
its name. It now inserts a category whose id sorts FIRST, writes it LAST, and asserts every
table comes out in id order. The revert fails against it.

**The authorization matrix took four edits, and every one of them is the point.**
`api-authorization.test.ts` requires that every authenticated handler be named in `GATES`
exactly, so two new routes are two visible security decisions: `EXPECTED_ROLES` (both
SUPER_ADMIN), `DESTRUCTIVE` (`catalog/import:POST` — it writes every row of the catalogue),
`GATES`, and the gate-count assertion **SUPER_ADMIN 7 → 9 with BOTH, ANY and INLINE
unmoved** — which is that assertion's whole purpose: the proof that routes were added and no
existing gate was widened to make room. The « only the restore button is narrower than the
whole role model » list is now two, and the pairing is right: both replace a whole body of
data rather than editing a row of it.

**Left behind:**
- **Import is replace-into-empty and stays that way** unless the operator asks otherwise.
  Merging means deciding what to do about two products with one name, and L-82 is what that
  decision looks like when it is made by accident.
- **The export does not carry images and must not start to.** 48 MB in a JSON file, to move
  files that ship in git anyway.
- **Next, on the agreed order:** first-run key generation with a screen for the two recordable
  keys, then auto-migrate-with-backup.
- **Still unanswered:** whether the restaurant's machine gives remote Windows admin rights.

### PREP-3 — an install makes its own secrets, and shows the two that must leave the machine
**Done:** 2026-09-11 · **Commit:** *(this commit)* · **Finding:** none new
**Authorised by:** the operator's « go ahead with the first-run screen ».

**The problem.** `auth.ts` read `process.env.SESSION_SECRET` and **threw at import** if it was
absent — « No fallback — the app refuses to start without it ». That was right for a
hand-deployed install, where a missing secret meant somebody had skipped a step. The app now
ships as a Tauri installer, and there it means nobody has run yet: **refusing to start is
refusing to be installed.** A `.env` cannot be shipped in the bundle either — the secret would
be identical on every install and readable by anyone who opened it.

**What shipped.** `src/lib/services/secret-store.ts`, three routes under `/api/setup/`, and a
card that renders itself away when there is nothing outstanding.

#### The property the whole change rests on: THE ENVIRONMENT ALWAYS WINS

If a variable is set, it is used and **nothing is written**. That is what makes this invisible
to the existing install, which holds every secret in `.env`, and it keeps
`scripts/rotate-secrets.ts` the way secrets are rotated rather than creating a second
competing source. It is the **first** thing the test file asserts, and for a concrete reason:
`test-setup.ts` sets these variables for the suite, so if the property broke, the suite itself
would start writing a `secrets.json` — and the change would have leaked into a live install
through the test runner. Asserted: `existsSync(secretStorePath())` is **false** after a
resolve. (`db/secrets.json` is also gitignored by the existing `/db/` rule, so one could never
be committed.)

#### `FISCAL_CHAIN_KEY` is NOT generated by booting, and that is the careful part

`SESSION_SECRET` and `BACKUP_ENCRYPTION_KEY` are made on demand. The chain key is not.
DD-25: it is armed **once, on an empty journal**, because a journal holding unkeyed events
that then acquires a key verifies under neither mode — `fiscal.ts:111` throws
`ChainKeyMisconfiguredError` at the next fiscal write, correctly and far too late, since the
till would stop taking money. A key armed as a side effect of starting is a key armed at a
moment nobody chose.

So it is armed through `POST /api/setup/chain-key`, which **counts `FiscalEvent` rows and
refuses if any exist**. Worth recording: `fiscal-key.ts`'s header names an
`assertChainKeyArmable` guard that **does not exist** — the only enforcement is at write time.
The check had to be written here.

`bootstrapSecrets` does put an **already armed** key back into `process.env`, or an install
would forget it had been armed the moment it restarted — and every hash written before the
restart would stop verifying, which looks exactly like tampering.

#### Where the values live, and why `process.env` is written deliberately

`<dataDir>/db/secrets.json`, mode 0o600 (a correct request, not a guarantee — Windows ACLs do
not map onto the POSIX mode). The store writes to a temporary file and renames, then
**re-reads and returns what is on disk**: two workers booting together would otherwise each
keep their own secret in memory, and sessions signed by one would be rejected by the other,
intermittently — the worst shape a bug can have.

`bootstrapSecrets` sets `process.env`, which is what keeps the change small: `auth.ts`,
`backup.ts` and `fiscal-key.ts` go on reading the environment exactly as before, and
`fiscalChainKey()` in particular reads it on **every** call by design, so a value parked there
is seen without touching that function at all.

**`auth.ts` resolves through the store rather than through `instrumentation.ts`'s
`register()`.** That hook is async and `SESSION_SECRET` is a module-level constant, so a route
module imported during startup could reach the line first. The file's own zod-locale comment
records that exact ordering problem. **Both guards survive**: the app still cannot run without
a usable secret, and still refuses one under 32 characters.

#### A corrupt store is a refusal, not a fresh start

The worst outcome available here is replacing a `BACKUP_ENCRYPTION_KEY` and making every
existing backup permanently unreadable. So an unparseable `secrets.json` throws, naming the
file and not its contents, and does not overwrite it.

#### The screen, and one honest limit

The card shows each pending key with its consequence in French — « Sans elle, aucune sauvegarde
ne peut être restaurée. Jamais. » — a copy button, a download, and a confirmation checkbox.
After acknowledgement the route returns nothing and the card disappears.

**« Shown once » is a prompt, not a security property**, and the route says so in its own
comment: the keys are still in `secrets.json`, because the application has to read them. The
exposure is bounded instead — SUPER_ADMIN only, `cache-control: no-store`, only keys still
awaiting a record, and an audit row that names the keys and never their values. Claiming
otherwise in a place like this would be a lie that costs something.

**How it was verified.**
- **18 tests.** The env-wins property first; generation shape (64 hex, and the two secrets are
  **not** the same value — one source reused for both would mean a stolen session key also
  opens every backup); idempotence across a simulated restart; the chain key absent after a
  boot and restored after an arm; the corrupt-store refusal; acknowledgement surviving a
  restart; and the three routes over `route-harness`.
- Every test runs in **its own `HIBAPOS_DATA_DIR` under the OS temp directory**, asserted
  before use, so nothing here can reach the install's own store. No assertion prints a secret:
  values are compared by length, by shape and against each other.
- **Six one-property reverts, each caught.** Env not winning → 3 fail. Auto-arming the chain
  key at boot → **11 fail**, the broadest signal in the set, which is right for the most
  dangerous mistake available here. Corrupt store silently replaced → 1. Chain-key route not
  checking the journal → 1. Acknowledgement not persisting → 3. `armChainKey` making a new key
  each call → 2.
- **`bun run test` 1366 pass / 0 fail, 113 files**, zero `prisma:error`; `typecheck` and `lint`
  clean. `README.md` 1348 → 1366.

**Two mistakes of mine, both caught before the commit.**

1. **The card derived « is the chain key armed » from the pending list.** `!pending.some(...)`
   is true in **two opposite states** — never armed, and armed then acknowledged — so the card
   would have offered to arm a key already protecting a journal. The server now reports
   `chainArmed` as a fact, `chainKeyArmed()` explains why it cannot be inferred, and a test
   pins the distinction. The arming block was also rendering on the inverted condition.
2. **The suite failed 5 tests that passed in isolation.** My `beforeEach` deleted `User`
   without first clearing the rows that reference it — `Order.cashierId`, `Shift.openedById`.
   Harmless alone, a foreign-key violation after an earlier file had left orders behind. That
   is **L-40 exactly**, which `test-setup.ts` documents: files clean up before each test and
   not after, so what is already in the database depends on what ran first. The wipe is now
   the full FK-safe order.

**Left behind:**
- **Nothing here has been run against a real fresh install.** The tests and the reverts cover
  it; a Tauri bundle does not exist to try it in. The nearest real check available — that the
  existing install is untouched — is what the env-wins assertions are.
- **`fiscal-key.ts` names a guard that does not exist** (`assertChainKeyArmable`). Not fixed:
  a comment, outside this item. The real enforcement is `fiscal.ts:111` plus the new route.
- **Next, on the agreed order:** auto-migrate-with-backup at startup.

### PREP-4 — migrations apply themselves at startup, behind a backup that has been opened
**Done:** 2026-09-11 · **Commit:** *(this commit)* · **Finding:** none new
**Authorised by:** the operator's « yes to all » on the brainstorm's question — backup first,
then migrate, hard-stop if the backup fails — and « go ahead with the auto-migrate ».

**This reverses one of the plan's oldest rules, deliberately.** « Applying a migration to
production is the operator's action » was written because *this project* twice believed a
migration was applied when it was not, and because `migrate deploy` prints the same green
banner whichever migration it ran. An installer has nobody to run that command, so a v1.1 over
a v1.0 either refuses to work or needs a shell — and « no manual commands » is the whole point
of the Tauri move. The rule's *reason* is kept by making the gate take its verdict from the
database and never from an exit code.

**The order is the design: backup → verify → migrate → verify.**

#### The backup is the gate, not a courtesy

Nothing is migrated until a backup exists **and has been opened again**. Not « written » —
written is what a corrupt file also is. `createBackup` snapshots with `VACUUM INTO` and records
a sha256 of the plaintext; the gate decrypts the encrypted result, checks that sha back, **and
checks the bytes start `SQLite format 3`**. Both halves are needed: a checksum proves the bytes
survived, not that they are a database. Any failure and the migration does not run, with the
reason recorded in French.

A backup taken *afterwards* would be a backup of the thing that went wrong, which is why one
of the reverts moves it after the deploy and two tests fail.

#### The verdict comes from the database

`migrate deploy` claiming success proves nothing — that is the entire reason
`scripts/apply-migration.ts` exists. So after applying, the gate re-reads pending migrations,
`integrity_check` and `foreign_key_check`, and reports `FAILED_AFTER_MIGRATE` naming the backup
to restore if any of the three disagrees. One test makes `deploy` **lie successfully** — return
`ok: true` and change nothing — and the gate catches it.

#### What it refuses to touch

A database with **no `_prisma_migrations` table** was built by `prisma db push` — every test
database here, and any install bootstrapped that way. `migrate deploy` against one would try to
apply the whole history over an existing schema. Skipped, loudly, and **without taking a
backup or deploying** (asserted: the injected deps record zero calls).

#### One process only

Two workers booting together would both migrate. A lock file created with `wx` gives one the
job and the other skips. A lock left by a crashed process would otherwise block every future
start invisibly, so one older than ten minutes is reclaimed.

#### It does NOT block startup, and that is a judgement

A refusal logs `ERROR` and leaves the schema untouched; the app still starts. `instrumentation.ts`
already argues this for the pragmas — « a till that will not open is worse » — and the fiscal
code argues the other half: « a till that stops taking money without saying why is the worst
version of this. » So it opens and says loudly what it did not do. The protection is that
nothing was changed, not that nothing was served.

**How it was verified.**
- **15 tests.** Every dependency that touches the world is injected — taking the backup,
  opening it, running the deploy — which is `createBackup`'s own `tarLoader` pattern:
  « injected only so a test can make the import fail. The default is the real dynamic import,
  so production is unchanged. » **Nothing in the suite runs `migrate deploy` or writes a real
  backup.** The `_prisma_migrations` table is created and dropped around the tests that need
  it, and each test gets its own `HIBAPOS_DATA_DIR` under the OS temp directory for the lock.
- **Six one-property reverts, each caught.** No backup at all → **8 fail**, the broadest, right
  for the most dangerous mistake available. Backup never opened → 6. Trust the exit code → 2.
  No lock → 1. Do not skip a `db push` database → 1. Backup after the deploy → 2.
- **`bun run test` 1381 pass / 0 fail, 114 files**, zero `prisma:error`; `typecheck` and `lint`
  clean. `README.md` 1366 → 1381.

**Also wired: the secret bootstrap.** `instrumentation.ts` now calls `bootstrapSecrets()` before
the migration gate, so PREP-3's generated values reach `process.env` for the readers that
expect them there, and logs a `WARN` naming any that were newly made.

**Left behind, and both matter:**
- **Whether `bunx prisma migrate deploy` is reachable inside a Tauri bundle is unknown, and it
  is a packaging question, not this item's.** The gate calls it through an injected dependency
  precisely so the answer can change without touching the logic. If the CLI is not in the
  bundle, `deploy` fails, the verdict comes back `FAILED_AFTER_MIGRATE` and the schema is
  untouched behind a verified backup — which is the correct outcome, not a silent one.
- **Nothing here has run against a real pending migration.** There is none: production is at 15
  of 15. The tests cover the logic and the reverts cover the gate; the first real exercise will
  be the first Tauri update, and it should be watched.
- **The auto-migrate reverses a plan rule.** § 3's « applying a migration to production is the
  operator's action » still governs **Claude**, and this does not change that: it is the
  application migrating its own database on its own machine.

---

### R8.0 — a fresh clone of this repository no longer starts red
**Done:** 2026-09-12 · **Commit:** `f68dcf6` · **Finding:** L-124 (audit pass 6)

**What changed:** one new file, `.gitattributes`, one line: `* text=auto eol=lf`. Nothing
else in that commit — `git status` was clean after `git add`, because every tracked text file
was **already** LF in the index (423 `i/lf`, 208 `i/-text`), so there was nothing to
renormalise. The bookkeeping is a second commit.

**Why it was a bug at all.** `core.autocrlf=true` comes from Git for Windows' *system*
gitconfig — `C:/Program Files/Git/etc/gitconfig`, not this repo and not a user file, which is
why nobody set it and nobody could see it in `git config --local --list`. Index LF + autocrlf
and no attributes file = every clone writes CRLF. Two tests read their own subject as source
text and neither survives that:

- `restore-swap.test.ts:202` looks for `"} finally {
    // L-62"` in `backup.ts` and gets
  `-1`. It **FAILS** — a false failure, on a clean tree, before any work starts.
- `pos-resilience.test.ts:104` is `.not.toContain` on a needle a CRLF file can never hold. It
  **passes vacuously** and can no longer see M-21 return.

**How it was verified.** Both directions, with the real runner on real trees — not with
`checkout-index` alone, and not by reasoning about it.

- **Red, from an actual `git clone`** of HEAD (`2905897`) into the scratchpad. Byte-counted,
  because `grep -c $''` lies here (see *Left behind*): 1 142 CRLF pairs in `backup.ts`,
  202 in `app-store.ts`, 211 and 238 in the two test files. `bun run test` there:
  **1 381 pass, 1 fail** — and the one fail is `restore-swap.test.ts:202`,
  `Expected: > 0 / Received: -1`.
- **Green, from a `git clone` of `f68dcf6`.** 0 CR bytes in all four files;
  `git ls-files --eol` reads `i/lf w/lf attr/text=auto eol=lf`. `bun run test` there:
  **1 382 pass, 0 fail, 114 files** — the same numbers as this machine.
- **The full-suite run answered a question L-124 left open.** Exactly one test fails on a
  CRLF clone, so the audit's inventory of CRLF-sensitive *failures* was complete — no third
  test was quietly broken. (A vacuous pass cannot show up in that count by construction,
  which is why the next bullet exists.)
- **The vacuity half, which no passing test can demonstrate on its own.** Line 104 passes in
  both worlds, so its pass proves nothing either way. So: inject M-21's old shape
  (`} catch {` / `next = null;`) into `app-store.ts` **in memory** and ask line 104 four
  times. LF + fixed → green. LF + regressed → **RED**, the guard working. CRLF + fixed →
  green. CRLF + **regressed → still green**. The guard was disarmed by the line endings, not
  merely lucky, and it is armed again now.
- On this machine, unchanged: `bun run test` **1 382 pass / 0 fail / 114 files**, matching
  `docs/BASELINES.md` exactly; `typecheck` clean; `lint` clean.

**Nothing binary was put at risk, checked rather than assumed.** `text=auto` defers to git's
own binary detection, so all 208 `-text` blobs still classify `-text` with the attribute in
force — the count did not move. `db/custom.db` is **untracked**, so git cannot reach it under
any attribute; its sha256 was `0d304ee7…` before and after. The eight `.zscripts/*.ps1` are LF
in the index and LF in this working tree today, and `print-raw.ps1` is live for R6.4:
`eol=lf` only stops a *clone* from getting CRLF, which is what a clone gets today. There are
no tracked `.bat` or `.cmd` files, which are the file types that genuinely need CRLF.

**Left behind:**

- **A harness trap, and it is the reason this entry counts bytes instead of lines.** A literal
  CR inside a Bash tool command string is **stripped before the shell sees it**, so
  `grep -c $'' <file>` silently becomes `grep -c ''`, which matches every line and returns
  the **line count**. On an LF file that is indistinguishable from a correct CRLF count — it
  reported 1 142/202/211/238 for a tree that was pure LF, i.e. it produced a plausible wrong
  answer in the direction that would have been believed. Count bytes with a script, or use
  `git ls-files --eol`. This belongs beside the plan's two existing traps
  (`MSYS_NO_PATHCONV`, JSON through a shell pipeline); it is recorded here rather than added
  to § 2 because § 2 is not this item's to edit.
- **`git checkout-index -a --prefix=` does honour the attributes file**, and reproduces a
  clone faithfully. The one run that appeared to say otherwise was the grep trap above, not
  git. A real `git clone` is still the better instrument and costs seconds.
- **This does not change any file already on disk here**, and it was never going to: the
  working tree was already LF. It changes what *other machines* get — a build box, CI, and
  the France install — which is the whole of its value and also why it cannot be verified by
  running the suite in place.

---

### R9.6 — the authorization map means what it says, and a refusal leaves a trace
**Done:** 2026-09-13 · **Commit:** `f918578` · **Findings:** L-120 (High) · L-151 (Low)

**What changed:** `lib/api-handler.ts` · `lib/api-authorization.test.ts` ·
`api/setup/secrets/route.ts` · `README.md` · new `api/authorization-audit.test.ts`.
**No route's gate changed.** What changed is that the map stopped mis-describing seven of
them, and that a refusal is now recorded.

**L-120 — the detector could not tell a guard from a no-op.** `guardsInline` was one regex
against handler source text — `user\.role\s*!==\s*"SUPER_ADMIN"` — which matches both of
these equally well:

    if (user.role !== "SUPER_ADMIN") return 403                            // refuses MANAGER
    if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") return 403 // refuses NOBODY

DD-07 left exactly two roles, so the second names them all, the condition is unsatisfiable,
and the guard is dead code. **Measured across the 14 handlers the map called `INLINE`: six
are real, seven are no-ops, and one is a third shape nobody had named** — `users/[id]:PUT` is
`SUPER_ADMIN` **or self** (`user.role !== "SUPER_ADMIN" && user.id !== params.id`). Two
buckets could not have described that honestly, which is why there are three.

The replacement parses instead of grepping: it extracts the whole `if (…)` condition **by
balancing parentheses** (so a condition spanning lines, or containing its own parens, is not
truncated into something that looks narrow), refuses a `||` chain because `||` inverts the
meaning, splits the `&&` chain into clauses, and derives *who is refused* as
`ROLES` minus the roles named — from the `ROLES` list, not hard-coded, so adding a third role
reclassifies everything automatically.

**And it fails loudly on anything it cannot read.** That is the actual lesson of L-120 and it
is the part worth keeping: a detector whose unknown case is `false` reports « no guard here »
for a guard it merely could not parse, which is the same silence it exists to break. Both
unknown shapes throw with the offending text quoted.

**L-151 — the refusal and the disclosure.** `withAuth` and `withAuthParams` each returned
403 with no audit row (`audit` appeared **0** times in `api-handler.ts`) while
`LOGIN_FAILED`, `USER_SWITCH_FAILED` and `MANAGER_APPROVAL_FAILED` are all journalled. Both
now route through one `denyByRole`, writing `ACCESS_DENIED` with the path, the method, the
role held and the roles required. **The 401 is deliberately not logged**: there is no user to
attribute it to, and every unauthenticated `/api/auth/me` poll would write a row. And
`GET /api/setup/secrets` — the one route in this application that returns a secret value —
logged the harmless acknowledgement and not the disclosure. It now writes `SECRETS_VIEWED`,
**names only**, and only when something was actually shown, so opening the settings screen
does not fill the log.

**How it was verified.** Six new tests, all **driven through `route-harness.ts`** — a real
session minted by the application's own `createSession`, a real `Request`, the real wrapper,
and the row read back out of the database. Not source text: this same audit found four tests
that prove nothing because they read source (L-121 … L-126) and one that passed vacuously for
a year (L-124), so « the call appears in the file » was not going to be the evidence here.

Then reverted, **one property at a time, in both directions**, restored by sha after each:

| revert | result |
|---|---|
| `withAuth`'s 403 unlogged again | **2 fail** — the direct test *and* the secrets-403 test, because both go through `withAuth`. That is exactly why the next line exists |
| `withAuthParams`' 403 unlogged | **1 fail**, the dynamic-route test — so the two wrappers are independently covered |
| the secrets read unlogged | **1 fail** |
| the secrets read logged even when empty | **1 fail** — the other direction |
| the detector blind again (`INLINE_ANY` reads as `INLINE_SA`) | **2 fail**: the map, *and* the new contradiction check. The blindness has two consequences, not one |
| `tables/seed`'s inline guard deleted | **1 fail** — the pinned exception notices its own cause is gone, so it cannot outlive it |
| a **second** contradiction introduced | **1 fail** |
| a guard joined with a logical OR | **throws**, naming the condition |
| a clause the parser has never seen | **throws**, naming the clause |

**A seventh test was written, measured and removed.** It proved the refusal survives a
*failing* audit write by renaming `AuditLog` out from under it. It passed — and it cost one
new `prisma:error` block in the suite output, against a `docs/BASELINES.md` line pinning
**zero** in a clean run, down from twelve that R4.3 and R4.6 spent a batch each removing. The
property is `audit()`'s contract rather than L-151's, and the baseline is worth more than the
assertion. The reason is written into `authorization-audit.test.ts` where the test was, so the
next session reads a decision rather than rediscovering a gap.

**Counts.** `api-authorization.test.ts:407` re-pinned: `INLINE` 14 → `INLINE_SA` 6 +
`INLINE_ANY` 7 + `INLINE_SELF` 1. **`BOTH` 31, `ANY` 26 and `SUPER_ADMIN` 12 are all
unmoved** — which is that assertion doing the job it was written for: it is the proof that
the classification changed and no gate did. `README.md`'s pinned suite count 1382 → 1389
(+7, all added here), files 114 → 115. `bun run test` **1389 pass / 0 fail / 115 files, zero
`prisma:error` blocks**; `typecheck` and `lint` clean; live database untouched (sha256
`0d304ee7…`, no `-wal`/`-shm`).

**Left behind:**

- **Two findings recorded and NOT fixed** — **L-183** (the seven guards that refuse nobody:
  six catalogue writes and `media:DELETE` are open to any authenticated caller, and whether
  they should be is a decision, not a sweep) and **L-184** (`tables/seed:POST` declares
  `["SUPER_ADMIN","MANAGER"]` and answers a MANAGER 403 — unreachable today because DD-09
  removed the tables screen and nothing calls the endpoint).
- **They went into a NEW section of `docs/audit/FINDINGS.md`, « Found after the audit, while
  doing the work », rather than into its severity groups.** The reason is that
  « the audit's 94, L-89 … L-182 » is a phrase in `CLAUDE.md`, in the plan and throughout the
  six pass files. Adding rows to the audit's own tables would falsify all of them at once and
  would have required editing `CLAUDE.md`, which is the operator's. A separate dated section
  keeps the audit a closed set, keeps the id sequence single and project-wide, and needs no
  count edited anywhere. **Later sessions should add to that section, not to the groups.**
- **R8.1 inherits a moved pin, deliberately.** Splitting `settings:PUT` by field (DD-26)
  reclassifies it out of `INLINE_SA` and moves the counts at `:407`. That edit belongs in
  R8.1's commit with its own dated line — the same design as the plan-freshness pin — and
  R8.1's row now says so instead of pointing at R9.6 as unfinished.
- **The contradiction check has one pinned exception and that is on purpose.** Green with the
  exception written down beats green with it invisible, and a *second* contradiction fails.

---

### R8.1 — the settings defaults agree, and the operator can save them
**Done:** 2026-09-13 · **Commit:** `622411c` · **Findings:** L-93 (High) · L-101 (High) ·
**Decisions implemented:** DD-26, DD-27 · **Unblocks:** R6.3 (and half of R6.4)

**What changed:** `lib/validation.ts` · `app/api/settings/route.ts` · new
`lib/services/settings-authz.ts` · `lib/api-authorization.test.ts` · `lib/validation.test.ts` ·
`README.md` · three new test files.

**L-93 — two default tables, and the write side won.** `settingsSchema` answered
`factice: false` and `printerConnection: "network"` for an absent key; `DEFAULT_SETTINGS`
answered `true` and `"usb"`. The route parsed with the schema and handed the **parsed** object
to `saveSettings`, which does `{ ...current, ...input }` — and zod's `.default()` does not
leave an absent key absent, it **materialises** it. So a save that merely omitted `factice`
performed **R6.3** — the act that makes every subsequent sale a real fiscal document — by
accident, and one that omitted `printerConnection` undid the 2026-09-11 USB decision R6.4
rests on. Both defaults were pinned, separately, by two green tests. **Nothing asserted they
agree**, which is how the product held two answers with a clean suite.

Both halves fixed. The schema now follows `DEFAULT_SETTINGS` — that is the table carrying the
dated operator reasoning — and the agreement is pinned **key by key**, with the set of
defaulted keys pinned too, so a field that loses its `.default()` cannot drop out of the
comparison silently.

**Measured, and it changed the fix: `.partial()` does NOT stop zod 4 materialising defaults.**
A partial parse of `{ printerQueue: "…" }` still produced ten of them, `factice` among them.
So the route now keeps only the keys the **raw body** actually carried and writes only those.
A key that was not sent is not written, whatever the schema would have supplied.

**L-101 — the operator could not save anything.** The whole route was SUPER_ADMIN while
`nav-config.ts:60` gives the MANAGER the Réglages screen — with a comment saying it was opened
*because* that is where the printer is configured — and an enabled « Enregistrer ». R6.3 and
R6.4 are both this route, and the MANAGER is the only account that will be at the till in
France; the one account that could is the developer's, in Tunisia (V-10). DD-26 splits by
field, DD-27 makes FACTICE one-way once the journal holds a non-factice event.

**Authorisation is on CHANGED keys, not SENT keys, and that is the load-bearing detail.**
`settings-view.tsx:121` posts the whole DTO on every save. Authorising on sent keys would
refuse a MANAGER adjusting the printer because the SIRET rode along unchanged — L-101 again
wearing a different hat, and it would have passed a hand-built minimal-body test. Changing an
identity field still makes it changed, so nothing is smuggled.

**Why the rule is a module and not three lines in the route.** Two reasons. It is a rule about
data, so it can be tested as one — every field, both roles, without a request. And an inline
`if (user.role !== …)` would make the route classify as `INLINE_SA` in the detector R9.6 had
just built, because a field-level split is not a blanket refusal. The route declares
`["SUPER_ADMIN", "MANAGER"]` at the wrapper, which is true: both roles may call it, and what
differs is what they may change. **R9.6's new contradiction check stayed green throughout**,
which is the first time one of these batches has been kept honest by the previous one.

**How it was verified.** Thirty-seven new tests. The pure rule has its own file; the route is
**driven** through `route-harness.ts` as both roles, because a unit test on an extracted rule
proves the rule and not that anything calls it — this project has shipped that gap three
times. Then reverted, one property at a time, restored by sha:

| revert | result |
|---|---|
| write the whole parsed object (L-93's mechanism) | **2 fail** |
| …and the old schema default too — the original bug, whole | **2 fail**, including « FACTICE off by omission » |
| schema `factice` default back to `false` | **3 fail** |
| schema `printerConnection` back to `"network"` | **2 fail** |
| authorise on SENT keys instead of CHANGED | **4 fail**, including the whole-DTO save |
| no field split — L-101 restored | **7 fail**, including R6.3 and R6.4 |
| DD-27's guard removed | **3 fail** |
| DD-27 blocking BOTH directions — the mirror mistake | **1 fail**: « R6.3 must never be blocked » |
| `factice` moved to the SUPER_ADMIN list | **7 fail** |

**THE FIRST REVERT SURVIVED, and that was the useful part of this batch.** « Write the whole
parsed object » — L-93's exact mechanism — ran green, 62 pass 0 fail. The cause was that
reconciling the defaults in this same commit had **masked the bug in my own tests**: they
stored the value the schema default already said, so writing the default over it changed
nothing and the assertions were asserting a no-op. **L-93 needs two things at once** — a key
absent from the body, AND a stored value the default would overwrite. The tests now store the
*opposite* of the default; the revert goes red; and a second revert reproducing the original
bug whole (old default + write-everything) fails precisely the « FACTICE off by omission »
case the audit described. The reasoning is written into the test file, because it is the thing
the next person to touch these will get wrong.

**One pinned number moved deliberately.** `validation.test.ts` said *« defaults factice to
FALSE when omitted »* — green, and pinning half of the contradiction. It now says `true`, with
a dated block saying what moved it and why that is not the same as retyping a number to obtain
a green run. `api-authorization.test.ts`: `settings:PUT` `INLINE_SA` → `BOTH`, counts
`BOTH` 31 → 32 and `INLINE_SA` 6 → 5; **`ANY`, `INLINE_ANY` and `SUPER_ADMIN` unmoved**, which
is the proof that opening the settings write did not widen anything else on the way past.
`README.md` 1389 → 1426, files 115 → 118.

`bun run test` **1426 pass / 0 fail / 118 files, zero `prisma:error`, exit 0**; `typecheck`
and `lint` clean; live database untouched (sha256 `0d304ee7…`, no `-wal`/`-shm`).

**Left behind:**

- **R6.3 is reachable from the till now**, and it is still the operator's action and still
  last of the three fiscal rows. **DD-27 applies from the moment it is done**: once the
  journal holds a non-factice event, only a SUPER_ADMIN can turn the stamp back on. There is
  an escape hatch and it is deliberate.
- **R6.4 is half-unblocked.** The MANAGER can pick the queue now; **L-96 is still open and
  R9.1 owns it** — the USB helper is resolved from `process.cwd()` and
  `powershell.exe -File <missing>` exits 0, so a helper that never runs is written to the
  database as `PRINTED`. Choosing the queue is not enough on its own.
- **`DEFAULT_SETTINGS` is the authority when the two tables disagree**, and the test says so
  in its failure message. Reconciling them the other way — moving `DEFAULT_SETTINGS` to the
  schema's old answers — fails a separate assertion on purpose: both values carry dated
  operator decisions from 2026-09-11.
- **Adding a setting now requires classifying it.** `settings-defaults-agree.test.ts` asserts
  the two DD-26 lists partition `settingsSchema` exactly, so a new field that nobody has
  decided about fails rather than defaulting silently to one side — either of which would be
  wrong in a different direction.
- **The client was not changed and did not need to be.** `settings-view.tsx` still posts the
  whole DTO. That is why the authorisation is on changed keys, and it is worth keeping in mind
  for the Tauri settings pane: any client that sends a subset is now safe too, which was not
  true before this.

---

### R9.2 — the startup migration gate stops reporting failure as success
**Done:** 2026-09-13 · **Commit:** `1d010b8` · **Findings:** L-110 (High) · L-111 · L-112 ·
L-113 · L-114 (Medium) · L-137 · L-138 · L-139 (Low)

**What changed:** `lib/services/startup-migration.ts` · `src/instrumentation.ts` ·
`lib/paths.ts` · `lib/db-pragmas.ts` · new `lib/services/startup-migration-refusals.test.ts`.
Eight findings, one file and its caller. Every one was a case where the gate answered wrongly
or said nothing at all.

**L-110 — a migration that failed was counted as applied, and the measurement decided the
remedy.** `appliedMigrations()` filtered on `rolled_back_at IS NULL` and never on
`finished_at IS NOT NULL`. Prisma writes the `_prisma_migrations` row **before** running the
SQL and stamps `finished_at` only on success, so a power cut, a killed process or a `deploy`
that errored left a row this query read as applied. Next boot: `UP_TO_DATE`, nothing logged
— it is the one status `instrumentation.ts` had no branch for — and the app serving a
half-applied schema. Same run: `stillPending` used the same query, so it was empty even when
the deploy failed, and the gate returned **`APPLIED`**. The exact failure it was built to
prevent, reported as success.

The audit left the remedy open: retry the migration, or refuse and name the row, « the
operator's call ». **Measured instead**, in a clean-room clone with no `.env`, against a real
fifteen-migration database with the last row's `finished_at` set to NULL:

    bunx prisma migrate deploy  →  exit 1, P3009, nothing changed

*« migrate found failed migrations in the target database, new migrations will not be
applied. »* **So retrying is not a thing that exists.** Prisma refuses a failed migration by
design and requires a person with `prisma migrate resolve`. Retrying would take a ≈49 MB
backup (L-179), be refused, and report `FAILED_AFTER_MIGRATE` telling the operator to restore
a backup for damage that never happened — on every boot. The gate refuses, names the row, and
spends nothing. The measurement is in the code comment and in the test, because it is what
makes the choice non-arbitrary rather than a preference.

**The other seven.**

| finding | what it did | what it does |
|---|---|---|
| **L-111** | `deploy()` reporting failure was never a condition — read only to decide whether to append process output to a message | a deploy that says it failed is a failure |
| **L-112** | the verification queries had **no `catch`**, only a `finally` releasing the lock; a throw escaped and `lastMigrationGateResult()` kept its PREVIOUS value | `FAILED_VERIFICATION_ERROR`, recorded like any other verdict |
| **L-112** | every *thrown* startup failure wrote to `console.error` and nothing else — pass 5 measured one stdout line and **zero** `TechnicalLog` rows | a row beside each, **added not swapped**: `logTechnical` writes to the database, which is the thing that may be failing |
| **L-113** | « could not create the lock » was reported as « un autre processus applique déjà les migrations », sending the operator after something that does not exist, every start | two branches, two sentences |
| **L-114** | a missing `prisma/migrations` was `[]` → `UP_TO_DATE`, resolved against `process.cwd()` | `SKIPPED_NO_MIGRATIONS_DIR`, resolved from a real app root |
| **L-137** | the lock was `dataDir()/db/migrate.lock` while the database is wherever `DATABASE_URL` points — two installs sharing one database took two locks and both migrated it | the lock sits beside the database |
| **L-138** | « Restaurez la sauvegarde » was said even when nothing had been changed | said only when something was; the backup is still *named* when it was not |
| **L-139** | the comment claimed « deliberately after the pragmas ». Migrations run **before** them | corrected to describe what happens |

**`instrumentation.ts`'s reporting is now an exhaustive `Record<GateStatus, …>`**, so a status
added later without a reporting decision is a **type error** rather than another silence.
`UP_TO_DATE` stays unlogged deliberately: a row per boot would bury the ones that matter, and
`pruneLogs()` only runs at shift close (L-176).

**New in `paths.ts`: `appRoot()`, `migrationsDir()`, `resolvedDatabasePath()`.** `dataDir()`
answers « where is the restaurant's data »; these answer « where are the application's own
files » and « which database file is Prisma actually on ». All three coincide today **only by
accident** — a packaged build separates them. `connectedDatabasePath()` moved here from
`db-pragmas.ts`, where it was private, so the lock shares it instead of keeping a second copy
of a path rule.

**How it was verified.** Fifteen new tests, in their own file — and the file is separate for a
reason worth recording: **all three insert sites in `startup-migration.test.ts` use
`finished_at = current_timestamp`, so no test there has ever built the state L-110 is
about.** Putting it in a helper the other tests share would have changed what they mean. Then
reverted, one property at a time, restored by sha:

| revert | result |
|---|---|
| applied ignores `finished_at` (L-110's query) | **1 fail** |
| the query fixed but the refusal removed | **1 fail** |
| a missing directory reads as an empty list | **1 fail** |
| migrations directory resolved from the cwd | **2 fail** |
| deploy failure not a condition (L-111) | **1 fail** |
| always say « restore the backup » (L-138) | **2 fail** |
| the lock back on the data dir (L-137) | **4 fail** |
| every lock failure is contention (L-113) | **1 fail** |
| the verification throw escapes (L-112) | **1 fail** |
| instrumentation logs only to console (L-112) | **1 fail** |

**ONE SURVIVED, and it was the same shape as the finding.** « The verification throw escapes »
ran green — 27 pass, 0 fail — because nothing could reach the branch, which is exactly why
L-112 existed. The fix was a test that makes a verification query throw with the
**filesystem** rather than with Prisma: point `HIBAPOS_APP_DIR` at a tree whose
`prisma/migrations` is a regular file, so `existsSync` passes and `readdirSync` throws
`ENOTDIR` inside the verification. A Prisma-level failure would work too and would cost a
`prisma:error` block, which `docs/BASELINES.md` pins at zero. *(The first attempt at that test
did exactly that and was rewritten — see the L-138 inconsistency test, which builds a genuine
partial application instead of forcing a foreign-key violation.)*

`README.md` 1426 → 1441 (+15), files 118 → 119. `bun run test` **1441 pass / 0 fail / 119
files, zero `prisma:error`, exit 0**; `typecheck` and `lint` clean; live database untouched
(sha256 `0d304ee7…`, no `-wal`/`-shm`).

**Left behind:**

- **A packaged build must set `HIBAPOS_APP_DIR`.** Unset, `appRoot()` walks up from the
  working directory looking for `prisma/migrations`, which finds the repository from anywhere
  inside it and will **not** work inside a bundle. That is the Tauri-shaped half of L-114 and
  the reason the knob exists rather than a cleverer search: a bundle should be told, not
  guessed at. If it is wrong, the gate now says so instead of reporting `UP_TO_DATE`.
- **An unfinished migration now blocks the boot loudly.** A botched rehearsal on a machine
  leaves the gate refusing, by name, until a person runs `prisma migrate resolve`. That is the
  intended behaviour and it is a change in what a broken install *does*: it used to serve.
- **The lock moved, and test isolation moved with it.** It is beside the database now, which
  is outside the per-test sandbox — one test's lock survived into the next and made it look as
  though the gate had not released it. Both test files clean it explicitly. `releaseLock()`
  deliberately does not fire when the lock was never taken: a process does not delete somebody
  else's lock.
- **Whether the pragmas should run BEFORE the migrations is a real question and is not
  answered here.** L-139 was a comment claiming an ordering that does not exist; correcting
  the comment is not the same as deciding the ordering. Migrating in rollback-journal mode is
  slower and less crash-safe than in WAL. Written into `instrumentation.ts` where the decision
  would be made.

---

### R8.2 — one tap, one sale, and the OFFERT tender stops crashing the till
**Done:** 2026-09-13 · **Commit:** `67d0347` · **Findings:** L-89 (High) · L-90 (High) ·
L-100 (High) · **Migration:** `20260913120000_order_idempotency_key` — **REHEARSED, NOT
APPLIED**

**What changed:** `prisma/schema.prisma` + a migration · `lib/services/checkout.ts` ·
`api/orders/route.ts` · `components/pos/payment-dialog.tsx` · new `lib/checkout-key.ts` ·
new `components/pos/payment-line.tsx` · two new test files · `README.md`.

**L-89 — a double-tap booked the sale twice.** Reproduced by audit pass 4: orders #9 and #10,
28 ms apart, `FiscalEvent` 15 → 16, the button still enabled at 60 ms. `setLoading(true)` is
React state and does not disable the button before a second click **in the same task** reaches
the handler, and nothing behind it was idempotent. `GrandTotal` moved twice — and it is
**never decremented**, so the inflation is permanent. A refund corrects the money; nothing
removes the phantom sale.

**L-90 is the same permanent consequence reached another way**: the sale commits, the HTTP
response is lost, `api-client.ts` has no timeout and no retry, the cart is still on screen,
and the operator rings it again. Closed by the same key, which is why the audit said to scope
it once for both.

**THREE LAYERS, AND THE MEASUREMENT OF WHAT EACH ONE BUYS.** This is the part of the batch
worth reading. Replaying the same key, counting `prisma:error` blocks in the suite output:

| state | blocks | what it means |
|---|---|---|
| both reads present | **0** | shipped |
| outer read removed | **0** | the in-transaction read alone suffices |
| in-transaction read removed | **1** | the concurrent case falls through to the index |
| both reads removed | **5** | every replay falls through to the index |

So **correctness comes from the UNIQUE INDEX in all four cases**; the reads decide how much
noise and wasted work there is. That is why reverting a read does not turn the suite red — a
lower layer catches it — and it is recorded here rather than papered over, because « the
revert survived » is otherwise the shape of a test that proves nothing.

The in-transaction read is the one that does the work in practice, and the reason is § 2's
own measured note: **Prisma's interactive transactions on SQLite do not overlap.** The loser's
read runs after the winner has committed, so the index is never asked to refuse and Prisma
writes nothing. That is not tidiness — a till whose log fills with P2002 on every double-tap
teaches its operator to ignore the log.

**L-100 — « Offert / repas personnel » crashed the POS.** `METHODS.find(x => x.method ===
l.method)!` then `m.icon`; `OFFERT` is deliberately not in `METHODS` (DD-14), so the render
threw `Cannot read properties of undefined` and took everything into the error boundary.
**DD-14's tender was unusable from the till** — the only way to settle a 100 %-discounted
order — while the API accepted the identical sale.

The audit's actual point was that *nothing would have caught it*: no test rendered that
component. There is no React test renderer here and no DOM, and adding either is a dependency
decision rather than a batch's. So the row moved into its own module and is rendered with
**`react-dom/server`, which is already a dependency** — for every member of the
`PaymentMethod` enum, read from `schema.prisma`, so a tender added later is covered without
anybody remembering to come back.

**Reverted**, restored by sha each time: key not persisted → 5 fail · route drops the key →
5 fail · route rejects the key → 6 fail · OFFERT crashes again → 5 fail · the key generator
repeats → 2 fail · the backstop matches any P2002 → 1 fail. The three layering reverts are in
the table above.

**THE MIGRATION — rehearsed, and the operator's to apply.**

    ALTER TABLE "Order" ADD COLUMN "idempotencyKey" TEXT;
    CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

SQLite's `ADD COLUMN` **does not rewrite the table**, so no existing row is touched and no
sealed payload is re-serialised — the property that matters most on a fiscal database.
Nullable because every order already written has no key and a client that sends none must
still check out; NULLs are distinct in a SQLite unique index, so any number of keyless orders
coexist.

Applied to a copy of production and fingerprinted with
`../db-snapshots/r71-acceptance/fingerprint.ts` **verbatim** — the established tool, not a new
one. **Four differences and nothing else:** `Order` gains one column at position 19 (appended,
so no reordering), one index appears, one `_prisma_migrations` row, and its count goes 15 →
16. Every event hash, `FiscalCounter`, `GrandTotal`, sealed row, `integrity_check`,
`foreign_key_check`, journal mode and `user_version` identical. Fingerprints kept in
`../db-snapshots/r82-acceptance/`.

`README.md` 1441 → 1458 (+17), files 119 → 121. `bun run test` **1458 pass / 0 fail / 121
files, zero `prisma:error`, exit 0**; `typecheck` and `lint` clean. Live database untouched
throughout — sha256 `0d304ee7…`, no `-wal`/`-shm`, verified after the rehearsal as well as
after the suite.

**Left behind:**

- **The migration is not in production**, and nothing is blocked by that: the column is
  absent, so the till simply has no idempotency yet. Two routes, both the operator's —
  `bun scripts/apply-migration.ts --apply --expect ../db-snapshots/r82-acceptance/fp-r82-after.json`,
  or letting PREP-4's startup gate apply it behind its own verified backup. **`--expect` takes
  a fingerprint FILE, not a migration name**; `CLAUDE.md` says `--expect <name>`, which is
  loose, and that file is the operator's.
- **The submit latch is not driven by a test.** It is a `useRef` in `payment-dialog.tsx` and
  there is no React test renderer. It is also the cheap half — a latch cannot survive a lost
  response, a reload, or a second till, and the key can. Said plainly at the top of
  `checkout-idempotency.test.ts` rather than left as an assumed gap.
- **The backstop's `catch` is not driven end to end**, for the third time in three batches:
  provoking a real P2002 writes a `prisma:error` block against a baseline pinned at zero.
  `isUniqueViolation` is exported and tested directly instead, because the failure that
  matters is the predicate silently never matching.
- **L-185 recorded** — five tracked files sit CRLF in this working tree while the index is LF.
  **R8.0 fixed what a clone receives and did not touch what was already on disk.** It cost two
  failed edits here before the cause was found. `orders/route.ts` was normalised in passing
  (zero git diff, the index being LF already); the other four were left rather than swept.
- **L-154 has bitten.** It was « a standing wipe-order hazard that has not yet bitten ». This
  batch's new test file is the first to leave orders, payments and shifts behind, and
  `fiscal-verify-software.test.ts` then failed on `db.user.deleteMany()` with a foreign-key
  violation three tests away and no way to explain itself. Patched at the source with
  `afterAll(wipe)`; **the durable shared wipe helper is still R9.7's, and this raises its
  priority** — sixteen hand-maintained lists that already disagree is no longer latent.

---

### R8.3 — a category save stops destroying the menu rules that depend on it
**Done:** 2026-09-13 · **Commit:** `6a580dd` · **Findings:** L-91 (High) · L-135 (Cosmetic) ·
L-145 (Low)

**What changed:** new `lib/services/category-option-groups.ts` ·
`api/catalog/categories/[id]/route.ts` · `features/catalog/categories-view.tsx` ·
`api/catalog/products/route.ts` and `[id]/route.ts` · `prisma/schema.prisma` (comments only) ·
new `api/category-option-rules.test.ts` · `README.md`.

**L-91 — the defect.** The PUT replaced option groups wholesale:
`categoryOptionGroup.deleteMany({ categoryId })`, then re-`create` with fresh cuids. And
`ComboSlotOptionRule.categoryOptionGroupId` is `onDelete: Cascade`, so **every menu rule
hanging off the category went with them** — no error, no warning, `CATEGORY_UPDATED` recording
the category name and nothing else. The trigger is an ordinary admin save *with no edits*,
because the client sends `optionGroups` unconditionally.

**Why it is group A.** A `ComboSlotOptionRule` fixes a menu component's option *without asking
the cashier*. All seven live rows hang off one group, `Pizzas → Taille`. Losing them lets a
Junior be rung inside an XXL — and `componentReferencePrice` loses its pinned choice. The three
`Taille` choices carry absolute prices (Junior 8,90 / Senior 11,90 / Mega 15,90 à emporter), so
**the weight `apportion` is handed really does move, and that weight is what divides the
forfait between 10 % and 5,5 %.**

**MEASURED, AND IT CHANGED THE FIX.** The audit's remedy is « match incoming groups by id and
update in place ». Necessary — and **not sufficient, because the client sent no ids at all.**
`categories-view.tsx` loads them into its form and then drops them when building the payload,
and the save handler *rebuilds* the `Taille` group from scratch rather than passing through
the one it fetched. Every group therefore arrived looking new, and match-by-id alone would
have deleted and recreated all of them exactly as before. Finding that is why this batch has a
client change in it.

**Both halves, and neither works alone:**

| | what it does |
|---|---|
| `category-option-groups.ts` | reconciles by id — matched groups updated in place, new ones created, and a group the payload drops is deleted **only** if no rule depends on it |
| choices, also by id | a rule pins a **choice**, and `categoryOptionChoiceId` is `onDelete: Restrict` — a preserved group whose choices were replaced would have failed with a raw Prisma foreign-key error rather than a sentence |
| the refusal | **409, in French, naming the menu and the slot.** The cascade told the operator nothing; this tells them which menu and what to do |
| the client | sends the ids it already holds. Two new pieces of state, loaded in `openEdit` and cleared by all three reset paths |

**How it was verified.** Eight tests, driven over the real route against a miniature of the
live shape — a Pizzas category, a `Taille` group whose choices carry absolute prices, and a
menu slot pinning Mega. Then reverted, restored by sha:

| revert | result |
|---|---|
| replace wholesale again (L-91 itself) | **6 fail** |
| no group refusal | **1 fail** |
| no choice refusal | **1 fail** |
| ignore the payload for matched groups | **1 fail** |
| matched choices never updated | **1 fail** |
| the refusal becomes a 500 | **2 fail** |
| an unknown id treated as new | **3 fail** |

The fourth is the one worth naming: **« preserve the rules by ignoring the payload » is the
obvious wrong fix**, and it passes every assertion about rules surviving. « Still applies the
edits — this is not a no-op » is the test that refuses it, and it checks the renamed choice
and the changed price, not just the group's flags.

**L-135** — six sites of `parseFloat((x - y).toFixed(2))` on integer cents in the two product
routes. A no-op on integers, but `toFixed(2)` is the **euros** idiom and the invariant is that
euros exist only at `formatEuro` / `parseEuroInput`; were a cent value ever non-integer it
would round to hundredths of a cent and look deliberate. Plain integer subtraction now, with
the reason at the site.

**L-145** — four id columns carried no foreign key and, alone in this schema, did not say so:
`sealedById` on `DailyClose`, `MonthlyClose` and `AnnualClose`, and `OrderItem.comboProductId`.
**Comments only** — 38 additions, 0 deletions, `prisma validate` clean, no migration.

`README.md` 1458 → 1466 (+8), files 121 → 122. `bun run test` **1466 pass / 0 fail / 122
files, zero `prisma:error`, exit 0**; `typecheck` and `lint` clean. Live database untouched:
sha256 `0d304ee7…`.

**Left behind:**

- **An open question, written into `schema.prisma` and not answered:** should
  `OrderItem.comboProductId` become a real `SET NULL` foreign key? The audit found the
  behavioural edge and this entry records it — `productId` is `SET NULL`, so a deleted product
  makes the identity genuinely *gone* and the `productName` fallback fires as the invariant
  describes, while **`comboProductId` dangles** and `aggregate.ts` groups under an id that
  resolves to nothing. Not reachable today: `scripts/delete-product.ts` guards the only
  deletion path and refuses a product in any sealed payload. It matters because **the
  catalogue transfer moves product ids between installs**, and that makes it R9.8's, where the
  data model is the subject.
- **Add-ons are still replaced wholesale**, deliberately. `CategoryAddOn` has no
  `ComboSlotOptionRule` and nothing else references it by id, so the cascade L-91 is about
  cannot happen there. Reconciling them too would be a change with a real risk (a live cart
  holds `addonId`s) and no finding behind it.
- **The refusal is reachable from an old client.** Anything still sending groups without ids —
  a stale browser tab, a future client written from the GET shape — now gets a 409 naming the
  menu instead of silently destroying the rules. That is the intended trade: a save that
  fails loudly beats one that succeeds and takes the fiscal weight with it.

---

### R8.4 — a report measures the same period the sealed close measured
**Done:** 2026-09-13 · **Commit:** `31ebd9d` · **Finding:** L-92 (High) · **Decision taken by
the operator on the day**

**What changed:** `lib/report-range.ts` · the three report routes ·
`features/reports/reports-view.tsx` · `lib/services/log-retention.test.ts` · two new test
files · `README.md`.

**The defect.** Three report routes measured a period by calendar midnight while **every
sealed fiscal document runs on the trading-day cut-off** (DD-23 / DD-24). So the VAT figure a
manager files could differ from the sealed close for the same month — *in both directions,
silently*. Audit pass 1 measured it with a single 02:30 ticket: `MonthlyClose 2026-08` sealed
`vatTotal 104` while `GET /api/reports/vat?from=2026-08-01&to=2026-08-31` answered
`totalVat 0, rows []`.

**Why the module escaped.** `period.ts` had already learned this and wrote the reason down:
*« `cutoffHour` is a REQUIRED argument everywhere, deliberately … Making it required means the
compiler finds every caller. »* `report-range.ts` was a **separate module the compiler never
saw**. That is the whole mechanism of the finding — and making the argument required here
found all nine call sites at once, which is the mechanism used as its own fix.

**THE DECISION, and it was the operator's.** With a 05:00 cut-off, « Du 2026-08-01 Au
2026-08-31 » asked for `01/08 00:00 → 01/09 00:00` where the close sealed
`01/08 05:00 → 01/09 05:00`. Both ends out by five hours; a 02:30 ticket on 1 August belongs
to trading day 07-31, so it was sealed into July and reported in August. Put to the operator
with that arithmetic and three options — and taken, 2026-09-13:

> **Snap, and say so on screen.**

The two rejected options are worth keeping written down. *Snap silently* reconciles the
figures but leaves a label reading « 1 août → 31 août » over numbers measured from 05:00 to
05:00 — a claim the screen cannot support. *Stay on calendar days with a warning* is honest
and leaves the manager holding a VAT figure they cannot file against the sealed record, which
is the harm L-92 describes.

**What that produced:**

| | |
|---|---|
| the clock | `parseReportRange` takes `cutoffHour` and builds **both** bounds on it |
| required, not defaulted | for `period.ts`'s stated reason. A default is exactly how this module and the closes came to measure different periods |
| the label | the response carries `cutoffHour` beside `from`/`to`, and the screen states **the server's own boundaries** — « Période mesurée : 01/08/2026 05:00 → 01/09/2026 05:00 (journée commerciale, clôture à 05:00) » |
| read, never re-derived | a screen computing the boundaries itself would be a second implementation of the rule, and the two would drift |

The old conditional hint was also corrected in passing: it printed « Période affichée : … »
**only while the inputs differed from the computed range**, which is an unsaved-changes
indicator wearing the wrong words. It now says that in those words, and the period line is
always present.

**How it was verified.** Twenty tests — the rule in `report-range.test.ts`, and the routes
**driven** in `reports-trading-day.test.ts` with the audit's own 02:30 ticket, because a unit
test on an extracted rule proves the rule and not that anything calls it. Both ends are
asserted: a 02:30 ticket on 1 August must land in **July**, and one on 1 September must land
in **August**. Then reverted, restored by sha:

| revert | result |
|---|---|
| midnight bounds again (L-92 itself) | **6 fail** |
| only the START snapped | **6 fail** — the half-fix that survives a spot check on one date |
| the route hard-codes 5 | **2 fail** |
| the response omits `cutoffHour` | **4 fail** — and this is the half the operator's decision was *about* |
| no validation of the cut-off | **1 fail** |
| the sales route left on the old clock | **1 fail** — three routes shared the module and all three had it |

`README.md` 1466 → 1486 (+20), files 122 → 124. `bun run test` **1486 pass / 0 fail / 124
files, zero `prisma:error`, exit 0**; `typecheck` and `lint` clean. Live database untouched:
sha256 `0d304ee7…`.

**Left behind:**

- **Cut-off `0` still means calendar days**, and is asserted. It is a supported setting and
  not a disabled feature (`validation.ts` says so), so the previous behaviour stays reachable
  **by the operator saying so** rather than by the code omitting an argument.
- **`/api/reports/vat` and `/api/reports/cashiers` have no client in `src/` at all.** Noted,
  not changed — they are API-only, so the « say so » half of the decision lands on the Sales
  tab, the one screen that reads a range. Both routes report `cutoffHour` regardless, so
  whatever reads them can say it too. Whether an API-only route should exist is not this
  batch's question.
- **Nothing was migrated and nothing was re-sealed.** The change is to how a period is
  *measured*, not to any stored figure: no sealed document moves, and the closes were already
  right — they are what the reports now agree with.
- **`businessDayCutoffHour` is SUPER_ADMIN-only** (DD-26, R8.1). Moving it moves the edges of
  every sealed document *and* now every report at once, which is the coupling that made it
  one of the four fields DD-26 kept back from the MANAGER.

---

### R8.5 — a supplement carries its own VAT rate
**Done:** 2026-09-13 · **Commit:** `6ccc13f` · **Findings:** L-94 (High) · L-127 · L-128 ·
L-136 (Low) · **L-134 answered** · **Migration:** `20260913140000_addon_vat_rate` —
**REHEARSED, NOT APPLIED**

**L-94 — the defect.** A supplement was folded into its host's line and therefore booked at
the **host's** rate. `docs/politique-ventilation-tva.md` § 6: *« Un supplément … relève de son
propre taux — 10 % pour un supplément alimentaire. »* A food supplement on a takeaway canette
would have booked at **5,5 %** — under-declared, and invisible on every document.

**The operator's decision, 2026-09-13.** Put to them with the measurement: all 21 add-ons sit
on Pizzas (14) and Sandwichs (7), all resolving to 10, which is also `defaultVatRate` — so
nothing changes today whichever way it goes. Chosen: **a supplement stays folded while the
rates agree, and becomes its own `OrderItem` when they differ.** The alternatives were
*always split* (changes every supplement ticket now, for no fiscal benefit today) and *refuse
the sale* (blocks a counter for a catalogue problem the cashier cannot fix — a shape this
project has rejected before).

`OrderItem` carries exactly **one** rate, so a supplement can only have its own by having its
own line. That is the same argument that made a menu explode into one line per component
(Batch 5.9), reached again from a different direction.

**NULL means `defaultVatRate`, not the host's rate — and that is the correction**, not an
implementation detail. Inheriting the host is precisely what was wrong; *« son propre taux »*
is the restaurant's food rate. Making null mean « inherit » would have left the column free
and unenforced, which the audit explicitly rejected as the do-nothing option. The pair mirrors
`Category.vatRate` / `vatRateTakeaway` so L-68's same-level rule applies unchanged, and a
future takeaway split needs no second migration on a trading database.

The separate line carries **`productId: null`** — pointing at the host product would make
`topProducts` count a supplement as a sale of the dish.

**The three that rode along.**

| | |
|---|---|
| **L-127** | the add-on quantity is snapshotted into `addOnsJson` — it was charged and dropped, so 3 × Viande Hachee printed as one line and left 4,50 € unexplained on a document that is never re-rendered — and bounded by `MAX_ITEM_QUANTITY`, which the item quantity a few fields up has carried since M-16. Measured: 100 000 booked a **150 011,90 €** line into the journal |
| **L-128** | `tendered` below `amount` is **refused**, not clamped, because it lands on an immutable document. Measured: amount 1190, tendered 500 → `Payment.change = -690`, sealed receipt « Reçu 5,00 € — Rendu -6,90 € » |
| **L-136** | M-15's negative-price guard, on the allocated menu line it was missing from. Refused rather than clamped, for M-15's own stated reason: clamping sells the component free and silently |

**L-134 — answered, and it needed the measurement to be answerable.** The audit said it
*« cannot be settled by reading »*. What settled it:

- **Sur place equals à emporter for ALL 84 products** — 0 differ.
- **Livraison is higher for 43 of them**, by about a euro.
- The `Taille` choices carry exactly that shape: `pickupPrice` (sur place **and** à emporter)
  and `deliveryPrice`.

So the question was simply *« will you ever charge more for eating in than for taking away? »*
**Answer: no.** A sized product's `Product.price` cancelling out is therefore **intended**, not
a schema gap. Pinned by three tests, including one that raises the price and asserts nothing
moves — so if a size ever gains its own sur-place price, the invariant is re-decided rather
than re-typed.

**ONE EDIT DELIBERATELY NOT MADE.** L-134's answer calls for a paragraph in
`docs/INVARIANTS.md`. **That file is the operator's** — the plan's R10.2 says *bring the exact
text and wait* — so it is drafted here and held:

> **A size supplies the price, sur place and à emporter alike.** A
> `CategoryOptionChoice` carrying an absolute `pickupPrice` sets the line's price outright in
> both modes; `Product.price` cancels out of the arithmetic and is the fallback for a product
> sold *without* a size. Livraison is the one mode a size prices separately
> (`deliveryPrice`). Confirmed by the operator 2026-09-13 after measuring that sur place
> equals à emporter for all 84 products. **Consequence to know before editing a price:** while
> a size group is `required`, raising `Product.price` changes nothing at the till and raises no
> error — pinned by `addon-vat-rate.test.ts`.

**How it was verified.** Twenty-three tests — the arithmetic in `addon-vat-rate.test.ts`, the
routes **driven** in `addon-vat-line.test.ts` with the audit's own case (a food supplement on a
takeaway drink). Then reverted, restored by sha:

| revert | result |
|---|---|
| the supplement always rides the host (L-94) | **4 fail** |
| null inherits the host — the inert version the audit rejected | **5 fail** |
| the route drops the separate lines | **4 fail** |
| the quantity not multiplied by the host line's | **1 fail** |
| the takeaway rate ignored | **1 fail** |
| the quantity not snapshotted (L-127) | **1 fail** |
| the add-on quantity unbounded (L-127) | **1 fail** |
| a short tendered accepted (L-128) | **1 fail** |
| a negative allocated line (L-136) | **1 fail** |
| the supplement attributed to the host product | **1 fail** |

**TWO THINGS THE EXISTING SUITE CAUGHT that I had not thought of**, and both mattered:

1. **`catalogue-transfer.test.ts` refused the stale column list.** Without it a supplement's
   rate would **not have travelled to the France install** — and that transfer is the
   mechanism that carries this catalogue there. Both columns now travel. This is the test
   R9.9 is about, working before R9.9 runs.
2. **`orders-combo.test.ts`'s add-on snapshot gained `quantity`**, because menu components
   take the same pricing path. Updated with a dated note rather than loosened.

**THE MIGRATION — rehearsed, and the command CHANGED.** Two `ADD COLUMN`s, no table rewrite,
both nullable so nothing needs backfilling. **Rehearsed on a copy of production together with
R8.2's still-unapplied one**, because that is the order the gate will apply them in. Five
differences and nothing else: `Order` gains one column at 19, `CategoryAddOn` gains two at 7
and 8, one unique index, two `_prisma_migrations` rows, count 15 → 17. Every event hash,
`FiscalCounter`, `GrandTotal`, sealed row, `integrity_check`, FK check, journal mode and
`user_version` identical. Fingerprints in `../db-snapshots/r85-acceptance/`.

`README.md` 1486 → 1509 (+23), files 124 → 126. `bun run test` **1509 pass / 0 fail / 126
files, zero `prisma:error`, exit 0**; `typecheck` and `lint` clean. Live database untouched:
sha256 `0d304ee7…`.

**Left behind:**

- **`r82-acceptance/fp-r82-after.json` is superseded.** It describes a database with only
  R8.2's migration applied, and both are pending now, so `--expect` against it would report a
  difference. The plan's operator item was rewritten rather than appended to, and
  `r85-acceptance` is the current pair. The old files are kept — they are the record of that
  rehearsal.
- **The combo path does not split supplements.** `computeLinePricing` is passed no `vat`
  context from `combo-checkout.ts`, so a menu component's supplement still rides its
  component's line. Deliberate and bounded: a component's rate IS the rate of the food it is,
  and `policy § 6`'s « en sus du prix du menu » is already satisfied — the supplement sits
  outside the allocation either way. Worth revisiting only if a supplement is ever attached to
  a drink slot.
- **`docs/INVARIANTS.md` is unedited**, by the rule above. A session that finds L-134 pinned by
  tests and absent from the invariants is looking at a held edit, not an oversight.
- **The plan is 40 403 bytes against a 40 960 ceiling** — 557 to spare. The next batch will not
  fit. §§ 3 and 4 were moved out for exactly this; something has to follow them, and choosing
  what is the operator's.

---

## Carried forward — the 2026-09-03 → 2026-09-09 remediation

Fifty-two batches ran between the read-only audit of 2026-09-03 (repo at `5ef7dc4`) and
2026-09-09. Their full specifications, validation criteria and evidence lived in
`REMEDIATION_RECORD.md`, retired 2026-09-10 and recoverable in full with
`git show HEAD~1:REMEDIATION_RECORD.md`.

**What survived the retirement, and where it went:** the nine methods → plan § 2; the hard
invariants those batches left behind → plan § 3; the open findings → plan § 7; the answered
design decisions → plan § 9. Nothing load-bearing was dropped.

The completion history, one line each, newest first:

| Batch | Date | Commit | What it did |
|---|---|---|---|
| **1.3d** | 2026-09-09 | `e1bc65f` | **L-70** — direct USB printing. The only transport was TCP and the Sunso is on a USB type-B cable; adds the Windows RAW spooler transport behind the same interface. `IMPLEMENTED — TESTING REQUIRED`: the real print is 1.3's `[HW]` criterion. |
| **5.10** | 2026-09-09 | see record | **There was no way to enter a menu.** 5.9 built the model, allocation, fallback, ticket and validation; nothing let a cashier ring one. The slot-by-slot builder and the slot editor. |
| **5.9** | 2026-09-09 | `0e80c73`…`2725cef` | **Menus composés.** `CartItem` held one set of options, so a Duo's two burgers could not be configured separately. Data model, VAT allocation per `docs/politique-ventilation-tva.md`, higher-rate fallback, composition on the ticket. |
| **3.12** | 2026-09-09 | `004c112` | **L-68** — VAT did not vary by order type, so all 17 drinks booked 5,5 % including sur place. The rate now resolves per order type. |
| **5.8** | 2026-09-08 | `6994e5f` | **L-67** — the catalogue editor wrote every inherited option group back onto the product on each save, so the POS showed each one twice. |
| **1.4c** | 2026-09-08 | `1dcbe79` | **L-66, DOC-17** — how the app gets onto the till, and the refusal that was missing for it. |
| **1.4b** | 2026-09-07 | `ce27fa4` | **L-65, DOC-16** — the launcher's one silent refusal, and the corruption in the runbook it caused. |
| **7.7** | 2026-09-07 | `1379e93` | **L-64** — every `Button` size variant was under 44 px, and 103 of 144 buttons take those heights. |
| **7.6** | 2026-09-07 | `1439628` | **L-09, L-10** — eleven undersized controls raised to 44 px; eight found by the guard once it existed. L-10's premise was substantially wrong; the real gap was label association. |
| **3.11** | 2026-09-07 | `0996622` | **L-58's open half** — `OrderItem` gains `lineNetTotal` and `lineHt`, so the line's HT is stored rather than only reproducible. |
| **1.3c** | 2026-09-07 | `e2b14ed` | **L-63** — the receipt's other overflows, and the two renderers carrying a copy of the first. All three now share `services/ticket-layout.ts`. |
| **1.3b** | 2026-09-07 | `57f109e` | **L-21** — `renderReceipt()` centred and never wrapped, so the restaurant's 56-character address ran off 48-column paper. |
| **7.5** | 2026-09-07 | — | **L-22, L-36/DOC-13, DOC-14** — English zod messages in a French UI, fixed as a class via zod 4's French locale. |
| **7.3** | 2026-09-07 | `d937ef2` | Secret rotation, prepared and handed over. The operator ran it; verified by the pre-rotation backups no longer decrypting. |
| **2.5** | 2026-09-06 | `52c66c0` | **L-61 (HIGH), L-62** — the restore could not complete on Windows. Root cause was two Prisma clients; the first diagnosis was wrong and measurement corrected it. |
| **8.1** | 2026-09-06 | `ce500ac` | **V-04, V-05** — the live database verified read-only, 27 checks, four chains recomputed. |
| **3.10** | 2026-09-06 | `28e1fc2` | **L-55, L-56, L-58's label half** — the three the ISCA map turned up that no batch owned. |
| **3.9** | 2026-09-06 | — | **DD-25** — the fiscal chain can be keyed (HMAC-SHA-256), with the arming guard. Unkeyed stays byte-identical. |
| **3.8** | 2026-09-06 | — | **DD-23, DD-24, L-57** — the trading day (`clôture du jour`) on a configurable cut-off, and the perpetual total sealed into every close. |
| **3.7** | 2026-09-06 | `203848e`, `c3ce9e9` | **L-53, L-54**; L-52 searched and left open. The software now states its version on every fiscal surface. |
| **6.3** | 2026-09-05 | `71324f2` | **T-10…T-12, L-06, L-40, L-43** — e2e and CI safety. `test-setup.ts` aborts unless the database is under temp; `vitest.config.ts` throws at import. |
| **6.2** | 2026-09-05 | `6201e4d` | **T-08, T-09, L-02** — misleading tests re-pointed at the live route rather than deleted. |
| **6.1** | 2026-09-05 | `a8734f4` | **T-01…T-07** — tests for the things that can lose money, plus the request harness six earlier batches had been waiting for. |
| **7.4a/b/c** | 2026-09-05 | `807e0c5`, `215d9fd`, `9e8e4e7` | Reports that disagree (L-48, L-44, L-50); authorization and the login queue (L-33, L-30); small correctness (L-45, L-31, L-19, L-24, L-32). |
| **7.2** | 2026-09-05 | `97c74fb` | **L-01, L-03, L-07, L-08, L-12, L-29** — dead code and dependency removal, −428 lines. Two of L-07's ten entries were wrong. |
| **7.1** | 2026-09-05 | `b2262bf` | **DOC-01…DOC-12** — documentation corrections. Two of the four code comments it was told to fix needed none. |
| **5.7a–d** | 2026-09-05 | `982168c`, `5ccc964`, `9304d58`, `d922ce0` | The dead add-on surface; « Offert » the zero-total tender; pricing and validation defects (M-19 survived because the tests built a shape the dialog never produced); POS resilience. **End of Stage 5.** |
| **5.6** | 2026-09-05 | `1bb8a48` | **M-08** — no pre-payment state; the dead `CANCELLED`/`PENDING` enum values removed. |
| **5.5** | 2026-09-05 | `51af203` | **M-05** — cash movements, four fixed categories, because prose reasons cannot be totalled. |
| **5.4** | 2026-09-05 | `4bb7cda` | **C-23** — held orders and cart lifecycle, shrunk to two halves by DD-11. |
| **3.6c** | 2026-09-05 | `bd08823` | **L-27** — the close guard matched only shifts whose *opening* fell inside the period. |
| **5.3** | 2026-09-05 | `3917f3a` | **C-14** — cross-shift refunds. Yesterday's sale is refundable today, out of today's till. |
| **5.2** | 2026-09-05 | `1abde1f` | **C-21** — table selection, closed by *withdrawal* rather than wiring (DD-09). |
| **5.1** | 2026-09-05 | `8a4429a` | **C-20** — keyboard shortcuts. |
| **4.7** | 2026-09-04 | `951e14c` | **C-15's shift-race half.** Shift state was read outside the transaction at three sites, not the audit's two. |
| **4.6** | 2026-09-04 | `974372e` | **C-24, C-25** — catalogue data loss. One malformed option group used to destroy a category's entire option set. |
| **4.5** | 2026-09-04 | `1a0836b` | **DD-08, C-17, L-37, L-38, DOC-09** — deleted `port-real-data.ts`, which wiped production by a hardcoded path; every remaining script is a dry run without `--apply`. |
| **4.4c** | 2026-09-04 | `d9b1b08` | **DD-19, L-34, L-35, M-17, M-18** — step-up PIN for large discounts and every refund. |
| **4.4b** | 2026-09-04 | `45a6fb8` | **M-19s** — `CASHIER` removed from the product, on DD-07's final answer. |
| **4.4** | 2026-09-04 | `36a9cd9` | **C-16, M-24…M-26** — role gating was client-side only and lived in one place. |
| **4.3** | 2026-09-04 | `aac03f6` | **C-18, M-23, M-27, M-28** — credentials, sessions, and binding to `127.0.0.1` (DD-06). |
| **4.2** | 2026-09-04 | `4022c9c` | **C-09, T-04** — PIN derivation was `scryptSync` on the request thread, ~390 ms of frozen event loop per call. |
| **4.1** | 2026-09-04 | `f14a50c` | **C-08** — manager-approval brute force. `clientIp` believed `X-Real-IP` on the strength of nothing. |
| **3.6/3.6b** | 2026-09-04 | `042bcbc`, `545b255` | **M-01, M-06, M-07, L-25, L-26** — close chain ordering and timing. Sealing March then January chained them wrongly and broke verification permanently. |
| **3.5** | 2026-09-04 | `83c3cfa` | **C-13, M-04** — the approving manager is recorded; `REMBOURSEMENT` carries the ticket number, not a cuid. |
| **3.1–3.4, 2.1–2.4, 1.1–1.2, 0.1–0.2** | 2026-09-03 | various | VAT rate keying (C-12); FACTICE (L-18); the settings screen unblocked (L-20); category VAT (L-16/L-17, DD-17); five aggregations collapsed into one (C-10, C-11, M-13, M-14); archive integrity (C-04, M-02); the fiscal operator screen (C-27); backup restore (C-05); backup location and retention (C-06, M-03); WAL (C-19); resource bounds (M-29…M-31); refund and Z-close unit corrections (C-01, C-02); source-control recovery (C-26). |

### Closed without a batch

- **L-14** and **L-60** — **dissolved 2026-09-10** by the operator's reset. Both depended on
  rows that no longer exist (`Receipt` and `Order` are at zero), and neither can recur:
  every order written from now on is journalled.
- **L-72, L-73, L-74** — closed by the reset script's own rework, 2026-09-09: the six menus
  are now verified through the wipe rather than unmentioned by it, clients are deleted at
  the operator's request, and the "app must not be running" guard stopped refusing on a
  server holding a different database.
- **DOC-15**, **L-04**, **SEC-ROT** — operator actions, completed.


---

## Retired from the plan's § 6 on 2026-09-11

*These four blocks described **completed** phases and were sitting in `REMEDIATION_PLAN.md`
§ 6 THE WORK, which is the section a session reads to find out what remains. The plan's own
rule — « A `DONE` row leaves this file for `REMEDIATION_DONE.md` » — is three lines above
where they sat. Phases 1 and 2 had already left; these had not. Moved verbatim. The two
warnings Phase 5 left behind (`tw-animate-css` and `tar`) were promoted into the plan's § 3
invariants at the same time, because they are standing traps rather than a record.*

### Phase 0 — Make the data survivable — **COMPLETE 2026-09-11**

*R0.1 (the first restorable backup) 2026-09-10; R0.2 / R0.3 / R0.4 on 2026-09-11. Record in
`REMEDIATION_DONE.md`. **L-46 closes with them.***

**Two restorable backups now exist**, both verified to decrypt: 2026-09-10 21:42 and
2026-09-11 12:40. The second was taken before R0.2 deleted anything, and matches production
table for table. `db/backups/` went 174 MB → 49 MB, and `db/` now holds the live database and
nothing else.

**Still awaiting the operator: a copy of a verified backup OFF THIS MACHINE.** Both live on
the same disk as the database they protect, so one failure still takes all three.

**`../HibaPOS-docs-archive/` was created** to hold two documents R0.3 would otherwise have
destroyed — see its `README.md`. **`runbook-complet.md` holds the only written procedure for
R6.4's printer commissioning** (the `pnputil` commands and the Sunso hardware id) and for
R6.1's reset. Read it before starting Phase 6.

### Phase 3 — « Use it on POS » — **COMPLETE 2026-09-11**

*`16e3415` (R3.1/R3.2), migration `20260910233000_product_show_on_pos` applied 02:13, and
R3.3 built 2026-09-11. Records in `REMEDIATION_DONE.md`.*

**Box 15, Box 35 and the Tenders box are real menus composés.** Each has a hidden food-only
component (`showOnPos = false`) and a drink slot, so the drink is taxed at **5,5 % à
emporter** instead of the whole price sitting at 10 %. The customer pays the same forfait.

### Phase 4 — Small correctness — **COMPLETE 2026-09-11**

*Records in `REMEDIATION_DONE.md`; what they established is in § 3 with the other invariants.*

| ID | Status | Task |
|---|---|---|

### Phase 5 — Cleanup — **COMPLETE 2026-09-11**

*Record in `REMEDIATION_DONE.md`. Four strays deleted, 45 interface files down to 18, and
**29** dependencies dropped — not the seven the item named, because deleting the components
orphaned 22 more. Operator's call, 2026-09-11.*

**What it left behind:**

- **`tw-animate-css` is the animation plugin, NOT `tailwindcss-animate`.** The names differ by
  a hyphen and the app imports the first at `globals.css:2`; the second was declared and used
  by nothing. The 44 `animate-in` / 34 `fade-in-0` / 26 `zoom-in-95` classes in the remaining
  components come from `tw-animate-css`. **Removing the wrong one breaks every dialog and
  dropdown animation silently** — Tailwind simply stops generating the classes, with no build
  error. Verified by grepping CSS, not just TypeScript.
- **`tar` stays.** It is loaded by a dynamic `import()` in `backup.ts`, so static analysis
  cannot see the use. The same trap, pointing the other way.
- **18 files in `src/components/ui/`, and there is no barrel.** No `index.ts` anywhere under
  `src/`, so a component's only reachable path is a direct import — which is what made the
  orphan analysis decidable.

---

## Retired from the plan's § 7 on 2026-09-11 — closed findings

*§ 7 is the register of what is OPEN. These two were closed and were still sitting in it.*

**Dissolved by the reset of 2026-09-10, and closed:** **L-14** (receipts archived at 80
columns — `Receipt` now holds zero rows) and **L-60** (eighteen orders carrying no
`fiscalEventId` — `Order` now holds zero rows). Neither can recur: both depended on rows the
reset deleted, and every order written from now on is journalled.

**Closed by R7.2 on 2026-09-11:** **L-82** — the three pairs sharing a name were renamed in the catalogue, and no two products share a name any more. Its residual (reports label by name) survives the closure and is recorded in the R7.2 entry.

**Opened by R7.1 on 2026-09-11:** **L-88** — the day-close paper slip prints no give-away line though `DailyClose` seals one. Recorded on the operator's instruction, not fixed.

**Closed by R7.1 on 2026-09-11:** **L-83** — `/api/reports/z` sent none of the three
give-away fields `ZReportDto` declares, and `ZReport` had no column for them. Both halves are
fixed and the migration is prepared; see the R7.1 entry above. **L-82 stays open** and keeps
its owner R7.2.


---

## Retired from the plan's § 5 on 2026-09-11 — two applied scripts

*Both had run and are idempotent; § 5 keeps a one-line pointer. What they check before
writing is worth keeping, so it is kept here.*

| `scripts/trim-catalogue-names.ts` | ✅ R4.4's trim. **Refuses** if trimming would make two siblings share a name. Addresses rows by **id**, never by name. Already applied; re-running prints `NOTHING TO TRIM`. |
| `scripts/build-box-menus.ts` | ✅ R3.3's rebuild. Runs `validateComboShape` and `validateComboAgainstCatalogue` — the checks the catalogue editor runs and raw SQL bypasses — **before** writing, then prices each finished menu through the real `priceComboItem` and refuses to report success unless the booked VAT matches. Already applied; re-running reports « déjà un menu composé ». |

---

## Retired from the plan's front matter on 2026-09-11

*How this plan came to exist — a past action, and the plan is for outstanding work.*

It replaced `REMEDIATION_PLAN.md` (2 173 lines) and `REMEDIATION_RECORD.md` (5 595 lines) on
2026-09-10, at the operator's instruction. Everything load-bearing from those two files —
the nine methods, the hard invariants, the open findings, the answered decisions — was
carried across into this document. The originals are recoverable in full from git
(`git show HEAD~1:REMEDIATION_RECORD.md`); nothing was lost, only retired.

