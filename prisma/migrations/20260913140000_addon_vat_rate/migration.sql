-- L-94 (R8.5) — a supplement carries its own VAT rate.
--
-- `docs/politique-ventilation-tva.md` § 6: « Un supplément … relève de son
-- propre taux — 10 % pour un supplément alimentaire. » It did not. A supplement
-- was folded into its host line and therefore booked at the HOST's rate, so a
-- food supplement on a takeaway canette would have booked at 5,5 % —
-- under-declared, and invisible on every document.
--
-- NULL means the restaurant's `defaultVatRate`, NOT the host's rate. That is
-- the correction: « son propre taux » is the food rate, and inheriting the host
-- is what was wrong. Measured before choosing: all 21 add-ons on this catalogue
-- sit on Pizzas (14) and Sandwichs (7), both resolving to 10, which is also
-- `defaultVatRate` — so no existing supplement changes rate, and no existing
-- row needs backfilling.
--
-- The pair mirrors `Category.vatRate` / `vatRateTakeaway` so the same
-- same-level resolution rule (L-68) applies, and a future takeaway split needs
-- no second migration on a trading database.
--
-- `ALTER TABLE ... ADD COLUMN` does not rewrite the table in SQLite: no
-- existing row is touched and no sealed payload is re-serialised.

-- AlterTable
ALTER TABLE "CategoryAddOn" ADD COLUMN "vatRate" REAL;
ALTER TABLE "CategoryAddOn" ADD COLUMN "vatRateTakeaway" REAL;
