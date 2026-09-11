-- R7.1 / L-83 — seal the give-away figures into the Z report.
--
-- DD-20 (Batch 7.4a) reports what was GIVEN AWAY beside what was sold, and
-- `ZReportDto` has declared `givenAwayCount`, `givenAwayItemsCount` and
-- `givenAwayProducts` ever since. The sealed `ZReport` row had no column for
-- any of them and `GET /api/reports/z` sent none, so the « Offerts » block was
-- absent from every Z report — silently, because the component that renders it
-- opens `if (!count) return null` and `undefined` is falsy.
--
-- SEALED rather than recomputed at read time (operator, 2026-09-11), mirroring
-- `topProductsJson`: a sealed figure stays what it was at the close.
--
-- NULLABLE, with no DEFAULT and nothing to backfill. There are ZERO `ZReport`
-- rows in production, so no row is being given a value it never measured —
-- which is the argument `perpetualSalesTotal` made in the 2026-09-06 migration
-- and NOT the `NOT NULL DEFAULT 0` the refund columns used, where 0 was the
-- true value for the rows that already existed. Here there are no such rows,
-- and after this migration `generateZReport` writes all three every time, so
-- null can never appear.
--
-- HAND-WRITTEN, and identical to what `prisma migrate diff` generates for this
-- case: three ADD COLUMNs with no default, which SQLite performs in place.
-- Deliberately NOT a RedefineTables block — that rebuilds `ZReport`, and
-- rebuilding a fiscal table to add three nullable columns is work with a
-- failure mode and no benefit. Same argument as the 2026-09-10
-- `product_show_on_pos` migration.
--
-- Rehearsed on a copy of the production database before being handed over,
-- with a fingerprint diff over every fiscal table. See REMEDIATION_DONE.md.

-- AlterTable
ALTER TABLE "ZReport" ADD COLUMN "givenAwayCount" INTEGER;
ALTER TABLE "ZReport" ADD COLUMN "givenAwayItemsCount" INTEGER;
ALTER TABLE "ZReport" ADD COLUMN "givenAwayProductsJson" TEXT;
