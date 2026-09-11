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
**Left behind:** any constraint this creates. Copy it into the plan's § 3 if it is one
nobody may break.
```

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

