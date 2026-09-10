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
