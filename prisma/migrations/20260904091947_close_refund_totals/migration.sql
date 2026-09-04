-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AnnualClose" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "period" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "salesTotal" INTEGER NOT NULL,
    "salesCount" INTEGER NOT NULL,
    "vatTotal" INTEGER NOT NULL,
    "cashTotal" INTEGER NOT NULL,
    "cardTotal" INTEGER NOT NULL,
    "voucherTotal" INTEGER NOT NULL,
    "discountsTotal" INTEGER NOT NULL,
    "refundsTotal" INTEGER NOT NULL DEFAULT 0,
    "refundsCount" INTEGER NOT NULL DEFAULT 0,
    "vatBreakdownJson" TEXT NOT NULL,
    "topProductsJson" TEXT NOT NULL,
    "dataJson" TEXT NOT NULL,
    "sealedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sealedById" TEXT NOT NULL,
    "previousHash" TEXT,
    "hash" TEXT NOT NULL,
    "fiscalEventId" TEXT
);
INSERT INTO "new_AnnualClose" ("cardTotal", "cashTotal", "dataJson", "discountsTotal", "fiscalEventId", "hash", "id", "period", "previousHash", "salesCount", "salesTotal", "sealedAt", "sealedById", "topProductsJson", "vatBreakdownJson", "vatTotal", "voucherTotal", "year") SELECT "cardTotal", "cashTotal", "dataJson", "discountsTotal", "fiscalEventId", "hash", "id", "period", "previousHash", "salesCount", "salesTotal", "sealedAt", "sealedById", "topProductsJson", "vatBreakdownJson", "vatTotal", "voucherTotal", "year" FROM "AnnualClose";
DROP TABLE "AnnualClose";
ALTER TABLE "new_AnnualClose" RENAME TO "AnnualClose";
CREATE UNIQUE INDEX "AnnualClose_period_key" ON "AnnualClose"("period");
CREATE TABLE "new_MonthlyClose" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "period" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "salesTotal" INTEGER NOT NULL,
    "salesCount" INTEGER NOT NULL,
    "vatTotal" INTEGER NOT NULL,
    "cashTotal" INTEGER NOT NULL,
    "cardTotal" INTEGER NOT NULL,
    "voucherTotal" INTEGER NOT NULL,
    "discountsTotal" INTEGER NOT NULL,
    "refundsTotal" INTEGER NOT NULL DEFAULT 0,
    "refundsCount" INTEGER NOT NULL DEFAULT 0,
    "vatBreakdownJson" TEXT NOT NULL,
    "topProductsJson" TEXT NOT NULL,
    "dataJson" TEXT NOT NULL,
    "sealedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sealedById" TEXT NOT NULL,
    "previousHash" TEXT,
    "hash" TEXT NOT NULL,
    "fiscalEventId" TEXT
);
INSERT INTO "new_MonthlyClose" ("cardTotal", "cashTotal", "dataJson", "discountsTotal", "fiscalEventId", "hash", "id", "month", "period", "previousHash", "salesCount", "salesTotal", "sealedAt", "sealedById", "topProductsJson", "vatBreakdownJson", "vatTotal", "voucherTotal", "year") SELECT "cardTotal", "cashTotal", "dataJson", "discountsTotal", "fiscalEventId", "hash", "id", "month", "period", "previousHash", "salesCount", "salesTotal", "sealedAt", "sealedById", "topProductsJson", "vatBreakdownJson", "vatTotal", "voucherTotal", "year" FROM "MonthlyClose";
DROP TABLE "MonthlyClose";
ALTER TABLE "new_MonthlyClose" RENAME TO "MonthlyClose";
CREATE UNIQUE INDEX "MonthlyClose_period_key" ON "MonthlyClose"("period");
CREATE INDEX "MonthlyClose_year_idx" ON "MonthlyClose"("year");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

