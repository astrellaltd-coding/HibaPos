# PASS 1 — Money and the fiscal record

**Read-only audit, 2026-09-12.** One of six focused passes; the last look before Tauri v2
planning. Nothing was changed, nothing was committed, no script was run with `--apply`.

**Nothing in this file is evidence of French fiscal or legal compliance**, and nothing in it
may be read as such. The attestation regime is the operator's.

New ids start at **L-89**, continuing from L-88. They are **proposed § 7 rows, not placed** —
consolidation will renumber them, because all six passes were told to start from L-89.

---

## 1. Baseline — re-measured, not trusted

Every figure § 4 records was re-measured. All held.

| Thing | § 4 says | Measured 2026-09-12 | |
|---|---|---|---|
| Tests | 1382 pass / 0 fail / 114 files | **1382 / 0 / 114** (244.75 s) | ok |
| `expect()` calls | 4467 observed | **4469** | see below |
| `prisma:error` blocks in a clean run | zero | **zero** | ok |
| `typecheck` · `lint` | clean | **both clean** | ok |
| Production DB sha256 | `0d304ee7…9083cdb`, 884 736 B | **identical**, mtime still 2026-09-11 16:33:12 | ok |
| Migrations | 15 applied, none pending | **15, every `finished_at` set, none pending** | ok |
| Trading tables | all fifteen zero | **all fifteen zero** | ok |
| Fiscal counters | 0 / 0 / 0 / 0 | **0 / 0 / 0 / 0**, journal empty | ok |
| Catalogue | 84 products, 14 categories | **84, 14** | ok |
| Menus | 9 composés · 25 slots · 9 whitelist · 7 option rules | **9 · 25 · 9 · 7** | ok |
| Till grid | 80 products | **80** (`active=1 AND showOnPos=1`) | ok |
| Shared names | none | **none** (`GROUP BY name HAVING COUNT(*)>1` returns nothing) | ok |
| `5 nuggets test` | present, `active=0` | **still present, `active=0`, `available=0`** | already L-81 |

**The one drift is not a finding.** `expect()` came back 4469 against § 4's 4467. § 4's own row
says "the `expect()` total drifts a little between runs too", so the row already predicts this.
The pinned figures — 1382 tests, 0 failures — did not move.

### How the app was run

On a **proved scratch copy**, per plan § 2. `db/custom.db` copied to the session scratchpad
(sha verified identical), a marker user `audit-pass1-marker` written onto the **copy** with the
app's own `hashPin` and a PIN chosen for this session, then `bunx next start -p 3191
-H 127.0.0.1` with `DATABASE_URL`, `HIBAPOS_DATA_DIR`, `BACKUP_LOCATION`, `SESSION_SECRET` and
`BACKUP_ENCRYPTION_KEY` all overridden so the real `.env` was fully shadowed. `.next/BUILD_ID`
(2026-09-12 11:53) was newer than every file under `src/` and `prisma/`.

`GET /api/auth/profiles` returned the marker before any write. Server stopped with `taskkill
//PID … //T //F`; the copy deleted; `db/custom.db` re-hashed afterwards and **byte-identical**,
with no stray `-wal`/`-shm`/`-journal` beside it.

> **Worth carrying to the other passes.** The first attempt used port **3090** and failed
> `EADDRINUSE` — another audit pass was already serving there. `GET /api/auth/profiles` on 3090
> returned `PASS4 SCRATCH MARKER`, not mine. **The marker proof is what caught it.** Had the
> proof been skipped, this pass would have written test sales into another pass's database.
> `docs/INVARIANTS.md`'s spoken-for port list does not yet include the audit ports.

---

## 2. What was traced, and what held

A sale was rung end to end through the real HTTP routes against the **real catalogue**:
`POST /api/orders` → `pricing.ts` → `combo-checkout.ts`/`combo.ts` → `checkout.ts` →
`aggregate.ts` → `reports.ts` → a sealed `ZReport` row and a `CLOTURE_Z` journal event. Then a
refund, then an OFFERT give-away, then the Z, then a sealed `MonthlyClose`.

**These held, measured on real data — they are not open questions:**

- **Integer cents end to end.** No float and no independent division anywhere on the money
  path. `round2` is retained but unused by it (invariants' *Deliberately retained*); every
  other `/100` outside `money.ts` is display-side or a percentage.
- **`Σ (lineNetTotal − lineHt) = Order.vatTotal`** on all four orders, and **`Σ lineNetTotal =
  Order.total`** on all four. Discount apportionment exact: 1340 − 134 gave 1071 + 135 = 1206.
- **`apportion` is never handed a zero total weight.** `checkout.ts:194` cannot be — the
  weights *are* the subtotal. `combo.ts:206,213` guards `totalWeight <= 0` into the § 4
  fallback. A negative target is safe too: `target − Σfloor` is always at least 0, so the
  remainder loop terminates correctly.
- **The forfait always sums to its parts.** All **nine** live menus across **three** order
  types, computed through the real `allocateCombo`: every one `Σ shares === forfait`, no
  fallback triggered, no menu mis-weighted.
- **`OrderItem.vatRate` is a snapshot** and a later catalogue edit cannot restate it.
  `orders/route.ts:329` is the only place that decides it; the client's `vatRate` is ignored.
- **The hash chain's inputs are the stored ones.** `appendFiscalEvent` hashes
  `canonicalize(data)` and stores that exact string; `verifyEventsChunk` recomputes from the
  stored `dataJson`. **No sealed payload is re-serialised anywhere**, `buildAnnualArchive`
  included — it carries `dataJson`, `previousHash` and `hash` verbatim, so a close stays
  re-verifiable from the archive alone. A reprint reads `Receipt.content` and appends `[COPIE]`
  only to the printed copy (`reprint/route.ts:64`); the stored document is untouched.
- **The three counts each still answer their own question**, measured on one Menu Chill:
  `itemCount = 1` (one article), `topProducts` = Regina ×2 + Coca 1.5L ×1 (its components),
  `topMenus` = 1 × Menu Chill at 2490. None reconciled to another.
- **The give-away is separable and cannot inflate revenue.** `total = 0`, `vatTotal = 0`, line
  nets 0, OFFERT the sole tender, excluded from `salesCount` / `topProducts` / the VAT
  breakdown, and counted in `givenAwayCount` / `givenAwayItemsCount` /
  `givenAwayProductsJson` (sealed, R7.1). `aggregate.ts:326`'s claim that a zero-total order
  *without* OFFERT is unreachable **is correct**: `checkTenderComposition` refuses any paid
  tender below one cent and the payments array requires at least one line, so OFFERT is the
  only way to settle a zero total.
- **The Z is computed inside the transaction that seals it** (C-15), so no sale can commit
  between the total and the seal.

### The VAT allocation against `docs/politique-ventilation-tva.md`

**The code matches the documented method.** That is a different question from whether the
method is right — VAT-METHOD (§ 8) is still open and the accountant has not answered in
writing.

All **nine** rows of the policy's § 5 tables were recomputed through the real functions against
the real catalogue and **every one reproduces exactly**, to the cent, in both the TTC bases and
the line-by-line HT:

| | sur place | à emporter | livraison |
|---|---|---|---|
| Menu Eco 24,90 | HT 22,63 · TVA **2,27** | 22,02 / 2,88 → HT 20,01 / 2,73 · TVA **2,16** | 22,28 / 2,62 → 20,25 / 2,48 · **2,17** |
| Menu Chill | HT 22,63 · **2,27** | 21,71 / 3,19 → 19,73 / 3,02 · **2,15** | 25,58 / 3,32 → 23,26 / 3,15 · **2,49** |
| Menu XXL | HT 30,81 · **3,09** | 30,54 / 3,36 → 27,76 / 3,18 · **2,96** | 33,77 / 3,13 → 30,70 / 2,97 · **3,23** |

The § 5 illustration was also reproduced through the live HTTP checkout, not only by
computation: Menu Chill à emporter booked three lines at **1086 + 1085 + 319 = 2490**, with
`referencePrice` 1190 / 1190 / 350 on the rows and `lineHt` 987 + 986 at 10 % and 302 at
5,5 % — the document's "10,86 + 10,85 + 3,19" and "9,87 + 9,86 … 3,02" exactly.

Point by point: § 2's weights are TTC catalogue prices for the order type (`resolveBasePrice`
plus pinned choice modifiers) — matches. § 2 distributes the forfait pro-rata via `apportion` —
matches. § 2 taxes each part at its component's rate — matches. § 4 falls back to
`Math.max(10, …)` on the four stated triggers — matches. § 6 keeps supplements outside the
allocation — matches, **but books them at the wrong rate in a case that is latent today, which
is L-95 below.**

---

## 3. CONFIRMED findings

Ranked by what could lose money or corrupt the fiscal record, not by count.

| id | sev | file:line | what is wrong | how established | cost to fix |
|---|---|---|---|---|---|
| **L-89** | **High** | `src/lib/report-range.ts:56-57` | **The report routes use calendar-midnight period bounds while every sealed fiscal document uses the trading-day cut-off**, so the VAT figure a manager files can differ from the sealed close for the same month — in both directions, silently. `parseReportRange` takes no `cutoffHour` and cannot; `period.ts:19-22` made that argument required *precisely* so "the compiler finds every caller", but `report-range.ts` is a separate module the compiler never saw. Callers: `reports/vat/route.ts:23`, `reports/sales/route.ts:23`, `reports/cashiers/route.ts:23`. | Measured end to end on the scratch copy with production's `businessDayCutoffHour = 5`. One ticket at 02:30 on 1 Sep: `businessDayOf` gives trading day 2026-08-31, inside `monthBounds(2026,8,5)` and outside `monthBounds(2026,9,5)` — but inside `parseReportRange("2026-09-01","2026-09-30")` and outside the August one. Then through the real routes: sealed **`MonthlyClose 2026-08` vatTotal 104** (10 % → 97, 5,5 % → 7) against **`GET /api/reports/vat?from=2026-08-01&to=2026-08-31` → `totalVat 0, rows []`**. The same ticket turns up in the September report instead. | Add `cutoffHour` to `parseReportRange` and pass it at three call sites (each route can already `await getSettings()`), or derive bounds from `monthBounds` / `businessDayBounds`. Small code, but it carries a **decision**: should a free `Du`/`Au` range snap to trading-day edges, and what does the screen then tell the operator it just showed them? One batch. |
| **L-90** | **Medium** | `src/lib/services/fiscal.ts:594-605` | **`assertDaySequence` does not count a refund as trading**, so a day whose only event was a refund can be skipped — and once a later day is sealed, `:585-590` refuses it **permanently**. The daily-close chain then carries a hole for a day on which cash left the drawer. The function's own docstring (`:576-578`) states the criterion it fails: *"'Traded' is deliberately orders **or** cash movements … a day whose only event was a payout from the drawer still has something the close would have recorded."* A refund **is** a payout from the drawer, and `periodOrdersWhere` (`aggregate.ts:815-817`) selects an order for a period *because* it was refunded there — so that day's `DailyClose` would have recorded it. | Read. The `Promise.all` queries `db.order` and `db.cashMovement` and no third table. Reachable without contrivance: open a till, pay out a refund against an older order, sell nothing, run the Z, go home; next trading day, sell and seal. `daily-close.test.ts:232` pins the cash-movement half ("refuses to skip a day whose only event was a cash movement"); **nothing pins the refund half**. The money is not lost — the monthly close still counts it by `Refund.createdAt`. | One more `findFirst` inside the existing `Promise.all`, one entry in the `earliest` array, and the missing test beside `daily-close.test.ts:232`. Genuinely small. |
| **L-91** | **Medium** | `src/lib/services/fiscal.ts:518-519` | **"A period close equals the sum of its Z reports" is false for a shift that straddles the cut-off**, and the claim is load-bearing prose in three places — `fiscal.ts:518-519`, `aggregate.ts:29-32`, and `reports.ts`'s C-10 note — with **no test asserting it**. A Z's scope is `shiftId`; a month's is `Order.createdAt` inside `monthBounds(…, cutoffHour)`. Nothing stops one shift holding orders from two trading months. `assertNoOpenShift` forces the Z to *exist* first; it does not make the shift's orders land in one month. | Computed with the real `aggregateOrders` and the real scope options. One shift opened 31 Aug 20:00, orders at 22:00 (1000) and 05:30 on 1 Sep (2000), closed 06:00: **Z = 3000**, `MonthlyClose 2026-08` = **1000**, `2026-09` = **2000**. Reconciliation fails in **both** directions — August has a close and no Z at all. **The money is right**: 1000 + 2000 = 3000, counted exactly once, and the VAT telescopes (91 + 182 = 273). What fails is the first check an inspector would perform, with no document explaining it. Mitigation already present: `openedOnEarlierBusinessDay` warns on the shifts screen, and DD-23 left "may a till stay open into the next day" as a business decision. | Two routes, and the choice is the operator's. **Cheap:** correct the prose and add the reconciliation test *with* its straddling-shift caveat. **Expensive, and a behaviour change:** refuse a checkout into a shift whose trading day has moved on. Recommend the cheap one plus a § 8 line, because the guard is DD-23 territory. |
| **L-95** | **Medium** | `src/lib/services/combo.ts:271` · `src/lib/services/pricing.ts:306` | **A supplement is booked at its host component's VAT rate, not its own.** Policy § 6 says *"il relève de **son propre taux** — 10 % pour un supplément alimentaire"*. `combo.ts:271` puts `shares[i] + c.supplements` on a line carrying `c.vatRate`; on the ordinary path `pricing.ts:306` folds `addonsTotal` into `lineTotal` at the product's rate. Attach one add-on to a drink category and a 10 % food supplement on a takeaway canette books at **5,5 %** — under-declared, and invisible. | Measured: `CategoryAddOn` exists on exactly two categories — `Pizzas` (14 rows, 150 c) and `Sandwichs` (7 rows, 70–100 c) — both resolving to 10 % in all three modes, so **not reachable today**. `Canette` and `Bouteilles` carry none. Verified through the live route: a Viande Hachee on a Senior Regina booked the whole 1340 c line at 10 %, which is correct because the pizza is 10 %. The defect is one catalogue edit away, and the catalogue is edited between sessions. | A rate (or an inherit flag) on `CategoryAddOn` plus one line in the allocation — **a migration**. Or a catalogue rule that drink categories carry no add-ons, which is free but unenforced. **Cheaper before the first sale than after**, which is why it is ranked here and not with the Lows. |
| **L-92** | Low | `src/lib/services/pricing.ts:284-285` · `src/app/api/orders/route.ts:48,67` | **An add-on quantity is charged but not snapshotted, and is unbounded.** `:284` charges `addon.price * aIntent.quantity`; `:285` snapshots `{id, name, price}` and drops the quantity — so `OrderItem.addOnsJson`, which is what the ticket and the archive read, cannot reproduce the line whenever the quantity exceeds 1. And the schema bounds it at `min(1)` with **no max**, where `MAX_ITEM_QUANTITY = 99` bounds the line for exactly the reason M-16 gives: "a crafted request could ask for any quantity a 32-bit integer holds. The server would price it, apportion VAT across it and write it into the journal." The identical hole sits one field over. | Both halves measured through the live route. **3 × Viande Hachee** on a Senior Regina: the **sealed `Receipt.content`** prints `1× Regina  16,40 €` with a single `+ Viande Hachee (1,50 €)` — 4,50 € of the customer's only piece of paper unexplained, in a document that is never re-rendered. **Quantity 100 000**: the route accepted it and booked a **150 011,90 €** line with `vatTotal 1 363 745` into the journal. Not reachable from the till — `checkout-intent.ts:45,56` always sends `quantity: 1`. API surface only, L-84's shape. | `.max(MAX_ADDON_QUANTITY)` in two places is one line each. Carrying the quantity into `chosenAddons` and into `receipt.ts`'s `  + nom (prix)` line touches receipt rendering, so it wants its own batch and a `receipt.test.ts` snapshot. |
| **L-93** | Low | `src/app/api/orders/route.ts:116` · `src/lib/services/checkout.ts:267` | **`tendered` below `amount` is accepted and prints a negative change onto the sealed ticket.** The schema relates the two in no way; `checkout.ts:267` computes `change: p.tendered ? p.tendered - p.amount : null`. Separately, `tendered: 0` is falsy, so `change` becomes `null` rather than `0`. | Measured: amount 1190, tendered 500 gave `Payment.change = -690` and a sealed receipt reading **`Reçu 5,00 € — Rendu -6,90 €`**. No money effect: `amount` is what books, and `paidTotal === totalAfterDiscount` is still enforced. Not reachable from the dialog — `payment-dialog.tsx:113-115` sets `tendered` only on an overpayment. API surface. | One `.refine()` on the payment object, or `Math.max(0, …)` at `checkout.ts:267`. Trivial — but it lands on an immutable document, so pick the refusal over the clamp. |
| **L-94** | Low | `docs/politique-ventilation-tva.md` § 5, § 8 | **The allocation policy's worked examples cover 3 of the 9 live menus, and 3 of the 9 rest on a reference price for a product the till cannot sell.** Not tabulated: Duo Cheese / Chicken / Giant Royal, Box 15, Box 35, Tenders box. `Box 15 (sans boisson)` (2640), `Box 35 (sans boisson)` (2640) and `Tenders box (sans boisson)` (840) are **exactly the three `showOnPos = 0` products** — they carry the entire food-side weight of their menus and are deliberately not sold à la carte (R3.3). That is precisely the case § 8.4 flags as losing the § 2 justification, "prix pratiqués séparément lorsque les produits sont aussi vendus à la carte". § 8's comparison table also carries one row that does not reproduce. | Measured. The three `showOnPos=0` products are those three, by name. The nine § 5 rows reproduce exactly (§ 2 above). § 8's three pizza rows reproduce — 2,15/2,13 · 2,96/2,94 · 2,16/2,14 — but **Duo Cheese measures TVA 1,13 € and +6 c where § 8 states 1,12 € and +5 c**, and § 7 of the same document says the Duo components did not exist when § 8 was written, so it was tabulated on notional prices. Menu Eco's "base déplacée +11 c" measures **+12 c**. | Documentation only, and it is **input to VAT-METHOD**: extend § 5 to the six untabulated menus from the software's own output, and answer § 8.4 for the three box components. Belongs in the same envelope as the accountant's letter, not in a code batch. |
| **L-96** | Cosmetic | `src/app/api/catalog/products/route.ts:65-67` · `src/app/api/catalog/products/[id]/route.ts:63-65` | A euros idiom on cent values: `parseFloat((absPickup - basePrice).toFixed(2))`. A no-op on integers, but the invariant is that euros exist only at `formatEuro` and `parseEuroInput`. Were a cent value ever non-integer it would round to hundredths of a cent instead of to a cent. | Read; the columns are `Int`, so it cannot misbehave today. Server and client agree — the serializer and `resolveChoiceModifier` relativize identically — which is the property that matters and is preserved. | Delete the wrapper: `absPickup - basePrice`. Six lines. Verify `catalog-payload.test.ts` and the till grid afterwards. |

### Two observations, deliberately not findings

- **A partial refund is apportioned across the lines by TTC weight, not against the item
  returned.** Measured: refunding 500 c of a 1640 c order (1340 at 10 % plus 300 at 5,5 %)
  moved the 5,5 % bucket from 300 to 209 — 91 c of VAT credited at 5,5 % although the stated
  reason was "Pizza renvoyée". This follows directly from the invariant that `apportion` is the
  only splitter, and `addVatMoveToBreakdown` makes the periods telescope, which is worth more
  than line-level attribution. There is no line-level refund and no column recording which item
  came back — only `Refund.reason`, free text. **Recorded here because an inspector could ask
  and the software cannot answer**, not because the arithmetic is wrong.
- **`GrandTotal.totalOrders` counts a give-away; the Z's `salesCount` does not.** Measured 4
  against 3. Both are defensible — the perpetual counts tickets issued, the Z counts sales that
  contributed — but nothing documents the difference, and they sit in the same sealed
  `perpetualTotalsJson`.

### Known findings rediscovered

- **already L-84** — `orders/route.ts:258` still checks only `active` / `available`, so a
  request naming a `showOnPos = 0` product is booked. Confirmed still true; not re-reported.
- **already L-81** — `5 nuggets test` still in the catalogue, `active=0`.

---

## 4. SUSPECTED — could not be settled read-only

| id | file:line | the suspicion | what is measured | what settling it needs |
|---|---|---|---|---|
| **S-1** | `src/lib/services/pricing.ts:149-157` | **`Product.price` is inert for every pizza.** The DINE_IN branch returns `absPickup - dineInBase`, so `unitPrice = price + (absPickup − price) = absPickup`: `price` cancels exactly and a sized product sells **sur place at its à-emporter absolute**. `Taille` is `required` on `Pizzas`, so every pizza sale must pick a size — no pizza ever sells at `Product.price`. An operator raising the dine-in price of pizzas would see no change at the till and no error. | All 26 pizzas have `price == pickupPrice == 890`, so nothing is visible today; the three `Taille` choices resolve to **0 / +300 / +700**, exactly as `pricing.ts:298-300` records. Client and server agree — the same relativisation is in the serializer — so this is not a client/server split. | **A decision, not a measurement.** `CategoryOptionChoice` has `pickupPrice` and `deliveryPrice` and **no** `price`, which reads as a schema omission; the serializer's comment describes the mechanism without saying the result is intended. Nothing in `docs/INVARIANTS.md`, the plan or § 9 records it either way. Ask the operator whether a sized product should be able to carry a dine-in price. |
| **S-2** | `src/lib/services/combo.ts:271` · `src/lib/services/combo-checkout.ts:280` | **A negative supplement could put a negative unit price on a menu line, past M-15's guard.** M-15 (`pricing.ts:302-304`) refuses a negative `unitPrice` on the component's own pricing but not on the allocated line. `supplements` can go negative when a cashier taps a choice with a negative modifier, and `shares[i]` can be 0 when a component's `referencePrice` is 0 — so a negative line could reach a sealed document, which is the exact outcome M-15 exists to prevent. | **Not reachable on this catalogue**: zero negative `priceModifier`, `pickupPriceModifier` or `deliveryPriceModifier` in `CategoryOptionChoice` **or** `OptionChoice`, and zero products with `price <= 0`. | A fixture with a negative modifier, which is writing a test — outside this pass. If it reproduces, the fix is the same refusal M-15 already has, moved to the allocated line. |

---

## 5. What Tauri needs to know from this pass

1. **The money path is sound; the *reporting* boundary is not.** Nothing found can lose or
   invent a cent inside a sale, a refund, a give-away or a close — the integer-cent discipline,
   `apportion`, the snapshotted rate and the hash chain all hold under real data. The one
   **High** is one layer out: three report routes measure a period by a different clock from
   every sealed document (**L-89**). Packaging does not change that, and it does not fix it.

2. **L-89 should be fixed before the interface that exposes it is built.** The invariants list
   `/api/reports/vat`, `/api/reports/cashiers` and `/api/reports/products` as *"the back-ends
   the reporting work will use"*. Two of the three carry the wrong boundary. Building their
   screens first ships the discrepancy into the operator's hands with an official-looking total
   on it. **`/api/reports/sales` already has a screen** (`reports-view.tsx:511-565`, free `Du`
   and `Au` pickers), so the drift is reachable today, before Tauri.

3. **Two things are cheaper before the first sale than after, and both are fiscal.** **L-95** is
   a migration — `CategoryAddOn` has no rate. **L-90** is a guard whose absence becomes
   permanent the moment a day is skipped, because a sealed close can never be corrected.
   Neither is about packaging; both are about the order the remaining work happens in. They
   belong beside R6.1–R6.3, not after them.

4. **Three findings are API-surface only, and Tauri changes their shape.** L-92, L-93 and the
   standing L-84 are all "the till is the only client, and the till does not do this". A Tauri
   build with a localhost HTTP server keeps that property only if the server is not reachable
   from outside the app. If the packaging exposes the port — or if a second client is ever
   contemplated — these three stop being cosmetic together. **Decide the port-exposure question
   in the Tauri plan, and re-rank these three against the answer.**

5. **`businessDayCutoffHour` is the most load-bearing setting in the app, and it lives in the
   database while `FISCAL_CHAIN_KEY` lives in `.env`.** § 1 already flags that `factice` and the
   chain key "do not travel together". The cut-off hour is a third thing that does not travel,
   and every sealed document's edges depend on it — `DailyClose.cutoffHour` is stored on the row
   for exactly that reason. **A fresh install in France that starts at the default 5 when the
   restaurant trades to 02:00 will seal its first documents on a boundary nobody chose.** Put it
   in the commissioning checklist, not in Réglages alone.

6. **Reserve the audit ports.** `docs/INVARIANTS.md` lists ports 3021–3026, 3033/3034,
   3040–3043, 3050–3052, 3060–3065 and 3070–3083 as spoken for. The audit passes are using 3090
   and up and are not on that list; this pass collided with pass 4 on 3090 and only the marker
   proof caught it. Whatever the Tauri plan does about a bundled server port, that list is the
   register it has to update.

7. **What this pass leaves settled, so no later session re-derives it.** The nine § 5 rows of
   `docs/politique-ventilation-tva.md` reproduce exactly against the shipped code and the live
   catalogue; the forfait sums to its parts for all nine menus in all three modes; the three
   counts each answer their own question; and no sealed payload is re-serialised anywhere, the
   archive included. **The code matches the documented method.** Whether the method is right is
   VAT-METHOD, and it is still the accountant's to answer in writing — **L-94** adds two
   concrete things to that letter.
