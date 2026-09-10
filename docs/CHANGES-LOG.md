# Change log — final tweaks, and everything after go-live

**Where we are — rewritten 2026-09-10. The paragraph this replaces is kept
below, because two of its statements are now wrong in different ways.**

The application is **not installed**, the fiscal reset has **not** run, and
**nothing has traded**. What changed on 2026-09-10:

- **The client trial is dropped**, for the second and final time. No copy goes
  to the restaurant before the final version. *(The paragraph below said the
  trial was "cancelled on 2026-09-09" — which was true when written, then
  false when it was reinstated later that same day, and is true again now for
  an unrelated reason. It is retired rather than edited.)*
- **The Windows-till deployment model is withdrawn.** The app will ship as a
  **Tauri v2 native application**. `docs/mise-en-service.md` — the
  commissioning runbook the paragraph below points at — was retired that day
  and no longer exists. What still has to happen before the first real sale is
  fiscal, not technical, and it lives in `REMEDIATION_PLAN.md`.
- **`REMEDIATION_PLAN.md` and `REMEDIATION_RECORD.md` were consolidated** into
  `REMEDIATION_PLAN.md` (outstanding work) and `REMEDIATION_DONE.md` (finished
  work).

Retired verbatim, 2026-09-10:

> **Where we are — rewritten 2026-09-09, because the original framing went stale.**
> The application is **not installed**, **§ 6 has not run**, and **nothing has
> traded**. Delivery did not happen on the evening of 2026-09-08 as the first
> version of this paragraph said. **The plan is to finish the work here, then
> install the finished application over an AnyDesk session and run
> `docs/mise-en-service.md` — § 6 included — at that point.** No copy goes to the
> restaurant before then. *(A three-day parallel trial on the owner's existing till
> was considered on 2026-09-08 and **cancelled on 2026-09-09**.)*

This file carries on either side of that, because the reason for keeping it is
the same: if a screen misbehaves in the restaurant, there should be one short
list of what moved, not a `git log` to reverse-engineer under pressure.

**This is NOT the remediation record.** `REMEDIATION_PLAN.md` and
`REMEDIATION_RECORD.md` govern fiscal and data-integrity work and keep their own
protocol. This file is for the smaller, later work: UI tweaks, labels, spacing, a
small feature. **If a change touches money, VAT, the fiscal journal, the hash
chains, closes, archives, backups or authentication, it does not belong here — it
is a batch, and it goes through the plan.**

---

## THE BASELINE

**This block is a snapshot of 2026-09-08, not a current reading.** It is the
mark the rows below are measured from and it is deliberately not updated; for
where things stand now, read `REMEDIATION_PLAN.md`'s front matter. Two figures
have since moved and are named here so nobody mistakes them for current: the
suite is **1044** tests, and **11** migrations are applied — the eleventh is
Batch 3.12's `vatRateTakeaway`.

| | |
|---|---|
| Commit | **`ec162b4`** — the tip of `main` when this file was added. Anything after it is a change and needs a row below. |
| Tests | **1217 pass, 0 fail** · e2e **13 passed** — unit figure re-measured 2026-09-09 after Batch 5.10 and the three tweaks below |
| Production database | `b21104b5d2d4aaa109414ec633ee822dd7e81ebebafb0e23330a7678dee3f8b7`, 876 544 bytes (2026-09-09 19:18, after the operator built the six menus). **This hash moves on its own while the operator's app is open** — a session touch rewrites pages without changing a single fiscal row. The invariant to assert is the fiscal fingerprint, not the sha: record → *Batch 5.9*, note 9 |
| Migrations | **12 applied, none pending.** Batch 5.9's `20260909143000_combo_menus` was applied by the operator 2026-09-09 and verified read-only (21 checks; the fingerprint diff is 16 lines, all of them the intended schema change) |
| Fiscal counters | **41 / 5 / 4 / 30**, measured 2026-09-09 19:18 — **#40 is the first menu composé ever sold**, a Menu Chill sur place at 29,40 — all of it **development** trading data (plan warning 4), which **§ 6's reset deletes** |
| Fiscal chains | all four `ok` at `lastSequence: 30`, and **unkeyed** — `FISCAL_CHAIN_KEY` is armed in § 6e and on no machine before it |

**Every entry below must be reversible on its own.** One change, one commit, one
row here. That is the whole point: a row you can revert without unpicking four
others.

---

## THE LINE THAT CHANGES EVERYTHING: § 6f

The rules below are stricter after one moment, and it is worth being explicit
about which side of it you are on.

**Before § 6f** — where we are now. The trading data in the database is the
developer's own test data and § 6 deletes all of it. A mistake here costs test
data, which is why exercising the fiscal flows was safe enough to do repeatedly
during remediation. **It does not license careless writes to the live database:**
the *catalogue* in that same file is real, irreplaceable work, and every batch in
Stage 3 worked on a scratch copy for that reason.

**After § 6f** — FACTICE goes off and every sale is real. The journal is
append-only, the chain is keyed, and clearing it is precisely the deletion
`docs/attestation-conformite.md` states is impossible. From that moment a change
to any fiscal path is a batch with the plan's full revert protocol, and nothing
here.

---

## HOW TO ADD A ROW

Append to the table. Do not rewrite earlier rows — if something later turns out
to be wrong, add a new row saying so and pointing at the old one. Same rule as
the record: **corrections are appended, never edits.**

Fields, and none is optional:

- **Date** — ISO.
- **What** — one sentence a non-programmer would understand.
- **Why** — who asked, and for what. "Looked nicer" is a legitimate why; write it.
- **Files** — every file touched.
- **Commit** — the sha. Fill it in *after* committing; do not leave `(pending)`.
- **Tests** — the count after the change, and whether any test was added.
- **Revert** — how to undo just this, in one line. If you cannot write that
  line, the change is too big for this file and wants a batch.
- **Risk** — what it could break that a test would not catch. Say **none** only
  when you have thought about it, not as a default.

---

## CHANGES

| Date | What | Why | Files | Commit | Tests | Revert | Risk |
|---|---|---|---|---|---|---|---|
| 2026-09-09 | **The menu builder`s choice and supplement tiles can no longer squash their picture.** The card was a fixed 100 px high with a picture that was allowed to shrink; it is now a MINIMUM of 100 px with the picture pinned, so a name that needs two lines makes the card taller instead of making the photograph smaller. **Nothing moves on the current catalogue** — no name in it wraps. | The operator, after the fit check: the tiles were measured at nine widths from 600 to 1920 px and every one fits, but the margin is thin and depends on the letters rather than the count. « Fanta Fruit de Dragon » (21 characters) stays on one line where a different 21-character name wraps. This is insurance for the names that get added later, asked for once that was explained. | `src/components/pos/combo-builder-dialog.tsx` | `5cb5f49` | 1247 pass, 0 fail · no test added — this repo has no component-test tooling, and the guarantee is a CSS one | `git revert` — one file, two class strings changed in each of two card bodies (`h-[100px]` -> `min-h-[100px]`, `shrink-0` added to the image box). No handler, price, payload or stored value is in the diff. | **None to money.** `toCartOptions`, `buildComponent`, `effectiveChoiceModifier` and the running total are byte-identical. **Measured, not assumed**: at the tightest real column (131,2 px) a two-line name today shrinks the picture from 44 px to 34,3 px; after this it stays 44 px and the card grows to 109,7 px, with zero overflow and nothing clipped. **A row of the grid stretches to its tallest card**, so one long name makes its whole row taller — the same behaviour the product picker above it has always had with its `min-h-[96px]`. Touch targets unaffected; the guard passes. |
| 2026-09-09 | **Not a row — a batch.** Direct USB printing went through `REMEDIATION_PLAN.md` as **Batch 1.3d** (L-70), not through this file. Recorded here only so that somebody reading this table after a printer problem is not misled by its absence. | The printer is a transport for a fiscal document and Batch 1.3 is still open, so `CLAUDE.md`’s rule applies: it is a batch. | see the batch | `e1bc65f` | 1247 pass, 0 fail · 30 added | Per the batch, not per this row. | See the batch’s status record. |
| 2026-09-09 | **A choice in the menu builder shows what it adds** — `+1,50 €`, or « Inclus » when it adds nothing. | The operator, ringing a Duo: « Frite Cheddar » showed no price in the modal and +1,50 € in the cart. The Duos ask for a frite through the burgers' own required `Frite` group, whose cheddar carries a 150 modifier, and **the builder's choice cards drew no price at all** — so the cashier read one number on screen and the customer was charged another. | `src/components/pos/combo-builder-dialog.tsx`, `src/store/cart-store.ts`, `src/store/cart-combo.test.ts` | `f41ee13` | 1217 pass, 0 fail · 5 added | `git revert` — one card body, one extracted function and its tests; no route, no payload and no stored value is in the diff. | **The fix is not a label, it is that ONE function now answers both questions.** `effectiveChoiceModifier` was extracted from `toCartOptions`, so what the modal displays and what `componentExtras` charges are the same number by construction rather than by agreement — a second copy in the dialog is precisely how the two came to disagree, and a test refuses one. Four reverts, both directions, all caught. **No absolute-price branch, deliberately**: a category choice arrives already relativised by the products serialiser, and inside a menu the delta is the right figure anyway, because the customer pays the forfait and only what a choice adds to it is chargeable. |
| 2026-09-09 | **The menu builder shows the catalogue's pictures** — on the supplements and on the option choices, as the ordinary product dialog already did. | The operator, after ringing a Menu Eco: the supplements had no images. **It was wider than reported** — the builder drew no catalogue image anywhere except the product picker, which on this catalogue is 19 of 21 supplements, 36 of 39 category choices and all 49 product choices. A cashier who knows the ordinary screen by its pictures met a wall of text, and would have hit the choices next. | `src/components/pos/combo-builder-dialog.tsx` | `188f587` | 1209 pass, 0 fail · no test added — nothing here is testable by them | `git revert 188f587` — one file, two card bodies and two grid class strings; no handler, no price and no payload is in the diff. | **None to money.** `toCartOptions`, `buildComponent` and the running total are byte-identical; only classes and an `<img>` moved. The cards are the same ones `product-options-dialog-v2.tsx` draws, so the two screens cannot drift into looking like different applications. **[OWNER] check**: confirm on the till that the tiles fit — the grids widened from 4 to 5 columns because the cards are now square rather than a line of text, and the browser pane would not dispatch events to React in this session, so nobody has seen it render. |
| 2026-09-09 | **A menu line in the cart lists what is in it** — one `· ` line per component, with its own options and supplements, and a `+ €` only where the customer is actually charged extra. | The operator, same session: the cart showed « Menu Eco » and a total and nothing else. A menu line's `options` and `addOns` are both empty — the components live in `components` — and the panel rendered only the first two, so **the cashier had no way to check what they had just built before charging for it**. | `src/components/pos/cart-panel.tsx`, `src/store/cart-combo.test.ts` | `9e63bf2` | 1212 pass, 0 fail · 3 added | `git revert` — one file, one block inside the existing detail list, plus its three guards; the totals row and every handler are untouched. | **None to money, and the important part is what is NOT shown.** No per-component amount appears, and there is none to show: the forfait is not divided until the server allocates it, and those shares are artefacts of that division rather than prices anyone pays — the same rule the printed ticket follows. What does carry a price is a component's own extras, and that figure comes from `componentExtras`, the same function `computeLineTotal` uses, so what is shown and what is charged cannot disagree. **The edit pencil is deliberately still hidden on a menu line**: it opens the ordinary options dialog, which is the wrong screen for a menu. Re-ringing is the way to change one, and a builder in edit mode is a batch, not a row. |
| 2026-09-08 | The − and + buttons on each cart line are drawn smaller: a 32 px box centred inside the same 44 px touch area. | Operator, reviewing the cart on localhost the afternoon before delivery: they looked too big beside the line text. | `src/components/pos/cart-panel.tsx` | `9700d6f` | 1007 pass, 0 fail · no test added | `git revert 9700d6f` — one file, two className strings and a wrapping `<span>`; nothing depends on it. | None to money: `onClick` and `aria-label` are byte-identical, so quantities and totals cannot move. The tap area is unchanged at 44 px, but the *visible* box is now 12 px smaller than the area that responds — it looks smaller than it is, which is worth one [OWNER] look on the real till screen. |
| 2026-09-08 | « Sur place / À emporter / Livraison » are now three separate pills instead of one joined strip, and the selected one fills with the brand orange instead of green. | Operator, same localhost review: wanted them read as three distinct choices, in the app's own colour. | `src/components/pos/cart-panel.tsx` | `a6204e2` | 1007 pass, 0 fail · no test added | `git revert a6204e2` — one file, one wrapper `<div>` class and three className strings; no handler or label is in the diff. | **This control picks a value that changes the price** — `services/pricing.ts` reads `orderType` for `pickupPrice`, `deliveryPrice` and the per-choice modifiers, and it is written into the sale journal. Nothing behavioural was touched: the three `onClick` handlers, their values, their order and their labels are byte-identical, and the diff shows only classes. The residual risk is human, not code — orange is also this app's accent colour, so **an [OWNER] look on the till should confirm the selected pill still reads as obviously selected** across all three. |
| 2026-09-08 | Each cart line is now two rows — picture, name and the edit/delete buttons on top; the − 1 + stepper and the line total underneath — instead of one crowded row. Supplement prices sit on the same baseline as the supplement they belong to. | Operator, on localhost: the card's rounded corner showed on the left but was cut off on the right, the total needed room, the stepper did not fit, and a supplement's price was not aligned with its name. All four are the same cause. | `src/components/pos/cart-panel.tsx` | `6bc929e` | 1007 pass, 0 fail · no test added | `git revert 6bc929e` — one file, one card body; nothing outside `cart-panel.tsx` refers to its layout. | **The cut-off corner was an overflow, not a radius.** The row carried about 356 px of unshrinkable content before the product name got a pixel, and Radix's scroll viewport (`min-width:100%; display:table`) grows to its content, so the card's right edge sat outside the visible panel. Two real costs. **(1)** Each card is roughly 48 px taller, so fewer lines fit before scrolling — worth an [OWNER] look with a full order on the till screen, not a laptop. **(2)** A long supplement name now truncates on screen instead of wrapping; **the printed ticket is unaffected**, `services/ticket-layout.ts` owns that and was not touched. No money path moved: every handler, every `aria-label` and the `Money` / `computeLineTotal` call were relocated verbatim, only their container changed. All four touch targets are still 44 px. |
| 2026-09-08 | The cart line goes back to one row: the − 1 + stepper returns to its old place between the description and the edit/delete buttons, and the line total is tucked directly under those two buttons instead of sitting at the bottom of the card. Adjusts the row added by `6bc929e`. | Operator, on localhost, looking at `6bc929e`: the stepper belonged where it was before, and the total sat too low. | `src/components/pos/cart-panel.tsx` | `798cd08` | 1007 pass, 0 fail · no test added | `git revert 798cd08` — one file, one card body; it restores `6bc929e`'s layout, which is itself revertable after it. | **Width is the thing to watch, and it is the same trap `6bc929e` fixed.** Putting the stepper back on the row raises the card's unshrinkable content from ~184 px to ~304 px. The desktop panel is 360 px (400 px at `xl`), so the product name gets ~56 px before it truncates — it fits, but there is little margin. **The mobile drawer is `w-[340px] max-w-[85vw]`, so on a screen under ~358 px wide it falls below 304 px and the right corner clips again.** The till runs the desktop path, so this is safe for tonight; a phone-width drawer is not. Card height drops back by ~48 px, undoing that cost of `6bc929e`. No money path touched: handlers, `aria-label`s and the `Money` / `computeLineTotal` call moved verbatim; all four touch targets are still 44 px. |
| 2026-09-08 | Every cart line now has the same two zones: a fixed 44 px header (picture, name, − 1 + stepper, edit and delete), a divider, then everything variable as one column — options, supplements, note, and the line total last and right-aligned. Supplement prices are right-aligned into a single column instead of sitting beside their names. Replaces the arrangement in `798cd08`. | Operator, on localhost, after seeing a pizza with eight supplements: the right-hand edge was ragged where the left was a clean column, the stepper drifted down on tall cards, and the total needed to be bottom-right on every card regardless of size. The two-zone shape was the operator's own suggestion. | `src/components/pos/cart-panel.tsx` | `60ad5f4` | 1007 pass, 0 fail · no test added | `git revert 60ad5f4` — one file, one card body; it restores `798cd08`'s arrangement, which is revertable after it. | **The overflow that clipped the right corner is now measured, not estimated.** The card was rendered at all three real panel widths — 340, 360 and 400 px — and `scrollWidth === clientWidth` in every one, so the corner cannot clip at any of them. Header fixed content is ~298 px, which leaves the product name about 70 px at 360 px, 110 px at 400 px and 50 px in the mobile drawer; **a long name truncates, and at 360 px it truncates early** — worth an [OWNER] look at the real catalogue's longest names. Supplement names truncate rather than wrap; the printed ticket is unaffected, `services/ticket-layout.ts` owns that and was not touched. No money path moved: handlers, `aria-label`s and the `Money` / `computeLineTotal` call were relocated verbatim, and all four touch targets are still 44 px. |
| 2026-09-08 | A cart line's detail column now opens with the product's own price — the size line, so « Senior » carries its 11,90 € — above the supplements. Before this, a pizza with four supplements showed 1,50 € four times and no sign of where the rest of the total came from. | Operator, on localhost, looking at a Charcutière Senior with four supplements: the base price was missing. | `src/components/pos/cart-panel.tsx` | `bf187f2` | 1007 pass, 0 fail · no test added | `git revert bf187f2` — one file, one conditional block in the detail column. | **It displays an existing field and computes nothing.** `CartItem.unitPrice` is TTC-including-options and is maintained by `recalculateUnitPrice` in `store/cart-store.ts`; this only formats it. No arithmetic was added to the component, which is why this is a label and not a batch. One thing to be aware of on the till: like the supplement prices beside it, **this figure is PER UNIT**, while the bold total below is the line total — so at quantity 2 the small numbers will not visibly sum to the big one. That convention already applied to the supplement prices before this change; it is now more noticeable. The printed ticket is unaffected. |
| 2026-09-08 | **Bug fix.** The supplements editor now shows the line's real supplements every time it opens. Before this it was one open behind: the first open after adding a product showed nothing ticked, and the first open after confirming an edit showed the supplements as they were *before* that edit. The dialog was built once and reused for the whole session, and re-seeded itself on a 200 ms timer after closing, which read the line as it had been at closing time. It is now rebuilt on each open. | Operator found it on localhost: remove a supplement, confirm, press edit again, and the supplement is still ticked. Closing and reopening showed the truth. | `src/components/pos/product-options-dialog-v2.tsx`, `src/features/catalog/pos-view.tsx`, `src/lib/options-dialog-reseed.test.ts` (new), `README.md` (pinned count) | `dbb28e7` | 1011 pass, 0 fail · **4 tests added**, README count re-pinned 1007 → 1011 | `git revert dbb28e7` — restores the reused dialog and its close-timer, and takes the guard test with it. | **I flagged this as batch territory and the operator judged it display-side; recording that here because the reasoning matters if it ever has to be revisited.** The stale view was never a wrong *store* — but the editor's displayed selection IS the payload `updateItem` writes, so confirming from a stale view wrote the stale supplements onto the line and moved its price, in either direction. The fix itself touches no pricing arithmetic, no store and no fiscal path: it changes only when React rebuilds the dialog. **Behaviour change worth knowing:** the dialog now discards its state on every close, so nothing can be carried between opens by design. **The guard is source-level** — this repo has no component-test tooling, so it cannot prove runtime behaviour; it fails if the timer returns or the key is dropped, and 3 of its 4 assertions were confirmed to fail against the pre-fix files. **The runtime check is an [OWNER] one:** add a pizza with two supplements, edit it, untick one, confirm, then press edit again — the remaining supplement should be the only one ticked, first time, with no closing and reopening. |
| 2026-09-08 | New photographs for the Croustillants: 7 old files removed, 12 new `cros_*.webp` added, so five items that had no picture now have one. README's uploads count re-pinned 139 → 144 files (49 Mo unchanged). | Operator replaced the pictures on localhost and re-pointed every Croustillants product at the new files. | `public/uploads/Produits/` (7 deleted, 12 added), `README.md` | `c394533` | 1011 pass, 0 fail · no test added | `git revert c394533` — restores the 7 old files and removes the 12 new ones. | **Only half of this change is in git, and that is the thing to remember.** The image FILES are versioned; the product-to-image LINKS are rows in `db/custom.db`, which is untracked and exists only on this machine. So a fresh clone gets the new pictures with nothing pointing at them unless it also carries this database. Two consequences. **(1)** Any product still referencing one of the 7 deleted files would render a broken image — the operator re-pointed them, but it is a two-minute [OWNER] check in the Croustillants category. **(2)** For the client's trial machine, the pictures travel by git and the catalogue edits travel only with the database file; do not assume a `git pull` moves both. |
| 2026-09-09 | The « Hériter des options & suppléments globaux » toggle in the product editor now names the category the settings actually come from. For a product in a sub-category that is the PARENT, and the line says so — « Pizzas », catégorie parente de « Menu ». | Found while rehearsing the combo fix: « Menu Eco » said it applied the settings of « Menu », which has no options at all. It was really applying the Pizzas size group and 14 pizza supplements — and that sentence is what the operator reads while deciding whether to switch the toggle off. | `src/features/catalog/products-view.tsx` | `4b7d095` | 1031 pass, 0 fail · no test added | `git revert 4b7d095` — one file, one derived value and one label. | Display only: the toggle's behaviour is unchanged, and the resolution mirrors the server's `inheritedCategoryGroups` (`parent ?? category`) so the sentence cannot describe something different from what happens. **The risk is that it now tells the truth about an arrangement the operator may not expect** — a product in a sub-category inherits from the parent, not from its own category — so the first reading may look wrong when it is right. Nothing else in the form changed. |
| 2026-09-09 | Three photographs added for the menus: `menu_eco.webp`, `menu_chill.webp`, `menu_xxl.webp`. README's uploads count re-pinned 144 → 147 files (49 Mo unchanged). | Operator added them while preparing the combo menus. | `public/uploads/Produits/` (3 added), `README.md` | `39a47be` | 1044 pass, 0 fail · no test added | `git revert 39a47be` — removes the three files and restores the count. | **Two of the three have no product yet.** Only *Menu Eco* exists in the catalogue; *Menu Chill* and *Menu XXL* were described but never created, so `menu_chill.webp` and `menu_xxl.webp` are currently unreferenced files. That is harmless — nothing renders them — but it means the count in the README is the only thing pointing at them until the combo feature creates the products. Same split as the Croustillants row: the files are in git, the product-to-image links live in `db/custom.db`, which is not. |

---

## OPERATOR CATALOGUE CHANGES

**Why this section exists.** The table above needs a commit sha in every row, and
a catalogue edit has none — the menu lives in `db/custom.db`, which is not in
git. Several such edits were made during 2026-09-08 and 2026-09-09 and were
recorded **nowhere**, which is exactly the gap this file was created to close.
They are listed here instead, newest last. **Claude cannot make these edits**
(`CLAUDE.md` rule 3); each was prepared and handed over, and the operator ran it.

| Date | What | Why | How to undo |
|---|---|---|---|
| 2026-09-08 | Repaired 12 products carrying a duplicate « Sauces » group — every Croustillant — with `bun scripts/fix-duplicate-product-options.ts --apply`, after backing the database up to `db/custom.db.before-dupfix-2026-09-08`. | The catalogue editor was re-creating them on every save (L-67). Batch 5.8 removed the cause; this cleared what it had already produced. | Restore that backup. The dry run now reports 0. |
| 2026-09-08 | New photographs for the Croustillants, and the products re-pointed at them. | Operator. | Files are in git (`882409b`); the product-to-image links are not. |
| 2026-09-09 | Applied migration `20260909101500_category_vat_rate_takeaway` to production. | Batch 3.12 (L-68). Rehearsed on a copy with a fingerprint diff first. | Prisma migrations are not reversed in place; restore a backup. |
| 2026-09-09 | *Bouteilles* and *Canette* set to **`vatRate` 10 / `vatRateTakeaway` 5,5**. | Batch 3.12's L-68f, on the operator's ruling. **A swap, not an addition** — the old 5,5 was in the column that now means sur place. | Set both back to `vatRate` 5,5 and clear the takeaway rate. |
| 2026-09-09 | The three *Duo* meals: « Hériter des options & suppléments globaux » turned **off**. | They sit under *Burgers* and were inheriting its *Crudités* and *Frite* groups, asking once for two burgers. | Turn the toggle back on. |
| 2026-09-09 | Three menu photographs added (`menu_eco`, `menu_chill`, `menu_xxl`). | Preparing the combos. Two of the three have no product yet. | Files are in git (`39a47be`). |
| 2026-09-09 | *Menu Eco* deactivated. Its price had been overwritten 24,90 → 8,90 by a save while it inherited the Pizzas *Taille* group. Done in the right order, so no phantom size group was created. | The operator is removing it and will create all three menus with Batch 5.9. | Turn *Actif* back on. |
| **PENDING** | **Deactivate, then hard-delete, the three *Duo* meals** — `Duo Cheeseroyale`, `Duo Chickenroyale`, `Duo Geant Royale`. Turn *Actif* off in each product's editor (no sizes trap — *Burgers* has no size group), then `bun scripts/delete-product.ts "<nom>" --apply` for each. All three have **zero order lines**, so the script permits it. | Operator's decision, 2026-09-09 — they will be recreated as composed products with Batch 5.9, which is the shape they always needed. | **Not undoable from here.** Take a backup first. |
| **PENDING** | **Hard-delete the *Menu Eco* row** with `bun scripts/delete-product.ts "Menu Eco" --apply`. Rehearsed on a copy 2026-09-09: the row goes, the *Menu* category survives, an `AuditLog` `PRODUCT_HARD_DELETED` is written, 78 → 77 products, integrity ok. | Operator's decision, 2026-09-09 — a deactivated row would otherwise survive § 6 and appear in every listing for the life of the installation. | **Not undoable from here.** Take a backup first; the row can only be recreated by hand. |

---

## RULES FOR THIS PHASE, AND THEY ARE NOT NEGOTIABLE

1. **Delivery is tonight, so the cost of a broken screen is a bad first
   impression in front of the owner.** That is a real cost even before the
   journal goes live. Small, reversible, tested.
2. **Never write to `db/custom.db`.** Validate on a scratch copy with **both**
   `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden, and prove which database the
   server has open by reading a marker back from the pre-auth
   `GET /api/auth/profiles` before the first write. The catalogue in that file is
   real work and exists nowhere else.
3. **`bun run test` before every commit.** 1007 is the number to beat; if it
   drops, the change is wrong or a test needs writing, and neither is fixed by
   deleting an assertion.
4. **Three tests pin numbers that move when you work** — `readme-counts.test.ts`
   (the README's counts, and it counts loop-generated tests as declared
   *expansions*, so a new `it()` inside a `for` must be declared there),
   `plan-freshness.test.ts` and `touch-and-labels.test.ts`. When one fails, **the
   number is the thing to check, not the assertion.**
5. **Touch targets are 44 px minimum** (Batches 7.6 and 7.7). A standing guard
   enforces it at the call sites; do not lower a height to make something fit.
6. **No line any ticket renderer emits may exceed the paper** (1.3b, 1.3c, and
   BOFiP § 50 forbids truncation). `services/ticket-layout.ts` is shared by all
   three renderers — change it there or not at all.
7. **`.zscripts/*.ps1` must stay pure ASCII with a UTF-8 BOM, and carry no
   backtick inside an expanding `@"…"@` here-string.** All three are
   test-enforced, and all three were learned by a script failing at the far end
   of a wire.
8. **A deploy needs `bun run build`.** The launcher refuses without
   `.next/BUILD_ID` (refusal 5) — louder than it used to be, but still a stopped
   till. Once the till is installed, update it with
   `.zscripts\update.ps1 -Apply`, which backs up, migrates, builds and restarts
   in that order.
9. **Anything changed after the till is installed has to reach the till.** A
   commit on this machine changes nothing in the restaurant. Either it lands
   before § 0b's clone, or it goes through `update.ps1` afterwards.

---

## IF SOMETHING BREAKS

1. **`C:\HibaPOS\data\logs\server.log`, last line.** The launcher's five
   refusals all name themselves there. On this machine, the same information is
   in the terminal running the dev server.
2. **This file's table, newest row first.** That is what it is for.
3. `git log --oneline ec162b4..HEAD` — the same list, unsummarised.
4. **Reverting:** each row's *Revert* column, one at a time, newest first.
5. **The fiscal state is not part of this.** `GET /api/fiscal/verify` must answer
   all four chains `ok` before and after any revert. If it does not, stop and
   read the plan — that is not a UI problem.
