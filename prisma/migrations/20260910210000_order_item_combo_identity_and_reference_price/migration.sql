-- Phase 2 (R2.2 + R2.3) — two nullable columns on OrderItem, in ONE migration.
--
-- They travel together deliberately: both are Phase 2's, both are additive, and
-- the operator runs `prisma migrate deploy` against production ONCE for the
-- whole phase rather than twice.
--
-- HAND-WRITTEN, and it is the same change `prisma migrate diff` generates for
-- this case: two nullable ADD COLUMNs, no DEFAULT, no RedefineTables block.
-- SQLite performs a nullable ADD COLUMN in place, rewriting no rows, so
-- nothing that exists is touched and nothing is backfilled.
--
-- NULL is meaningful in both, and is why neither carries a DEFAULT:
--   comboProductId  null = this line is not part of a menu.
--   referencePrice  null = this line is not a prorata share of a forfait —
--                   an ordinary sale, or a menu that took the policy's § 4
--                   fallback, where the forfait was not divided at all.
-- A DEFAULT 0 on `referencePrice` would assert a catalogue price of nothing,
-- which is a figure nobody ever computed. Same argument as `perpetualSalesTotal`
-- in the 2026-09-06 migration.
--
-- Rehearsed on a copy of the production database before being handed over, with
-- a fingerprint diff over every fiscal table (row counts, FiscalCounter,
-- GrandTotal, every event hash, sealed rows, order lines, integrity_check, FK
-- errors, column order). See REMEDIATION_DONE.md for the measured result.

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "comboProductId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "referencePrice" INTEGER;
