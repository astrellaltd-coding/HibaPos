-- AlterTable
ALTER TABLE "FiscalEvent" ADD COLUMN "cashMovementId" TEXT;

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "approvedById" TEXT,
    "fiscalEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CashMovement_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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
    "cashInTotal" INTEGER NOT NULL DEFAULT 0,
    "cashOutTotal" INTEGER NOT NULL DEFAULT 0,
    "cashMovementsCount" INTEGER NOT NULL DEFAULT 0,
    "vatBreakdownJson" TEXT NOT NULL,
    "topProductsJson" TEXT NOT NULL,
    "dataJson" TEXT NOT NULL,
    "sealedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sealedById" TEXT NOT NULL,
    "previousHash" TEXT,
    "hash" TEXT NOT NULL,
    "fiscalEventId" TEXT
);
INSERT INTO "new_AnnualClose" ("cardTotal", "cashTotal", "dataJson", "discountsTotal", "fiscalEventId", "hash", "id", "period", "previousHash", "refundsCount", "refundsTotal", "salesCount", "salesTotal", "sealedAt", "sealedById", "topProductsJson", "vatBreakdownJson", "vatTotal", "voucherTotal", "year") SELECT "cardTotal", "cashTotal", "dataJson", "discountsTotal", "fiscalEventId", "hash", "id", "period", "previousHash", "refundsCount", "refundsTotal", "salesCount", "salesTotal", "sealedAt", "sealedById", "topProductsJson", "vatBreakdownJson", "vatTotal", "voucherTotal", "year" FROM "AnnualClose";
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
    "cashInTotal" INTEGER NOT NULL DEFAULT 0,
    "cashOutTotal" INTEGER NOT NULL DEFAULT 0,
    "cashMovementsCount" INTEGER NOT NULL DEFAULT 0,
    "vatBreakdownJson" TEXT NOT NULL,
    "topProductsJson" TEXT NOT NULL,
    "dataJson" TEXT NOT NULL,
    "sealedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sealedById" TEXT NOT NULL,
    "previousHash" TEXT,
    "hash" TEXT NOT NULL,
    "fiscalEventId" TEXT
);
INSERT INTO "new_MonthlyClose" ("cardTotal", "cashTotal", "dataJson", "discountsTotal", "fiscalEventId", "hash", "id", "month", "period", "previousHash", "refundsCount", "refundsTotal", "salesCount", "salesTotal", "sealedAt", "sealedById", "topProductsJson", "vatBreakdownJson", "vatTotal", "voucherTotal", "year") SELECT "cardTotal", "cashTotal", "dataJson", "discountsTotal", "fiscalEventId", "hash", "id", "month", "period", "previousHash", "refundsCount", "refundsTotal", "salesCount", "salesTotal", "sealedAt", "sealedById", "topProductsJson", "vatBreakdownJson", "vatTotal", "voucherTotal", "year" FROM "MonthlyClose";
DROP TABLE "MonthlyClose";
ALTER TABLE "new_MonthlyClose" RENAME TO "MonthlyClose";
CREATE UNIQUE INDEX "MonthlyClose_period_key" ON "MonthlyClose"("period");
CREATE INDEX "MonthlyClose_year_idx" ON "MonthlyClose"("year");
CREATE TABLE "new_ZReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "salesTotal" INTEGER NOT NULL,
    "salesCount" INTEGER NOT NULL,
    "vatTotal" INTEGER NOT NULL,
    "cashTotal" INTEGER NOT NULL,
    "cardTotal" INTEGER NOT NULL,
    "voucherTotal" INTEGER NOT NULL,
    "discountsTotal" INTEGER NOT NULL,
    "refundsTotal" INTEGER NOT NULL DEFAULT 0,
    "refundsCount" INTEGER NOT NULL DEFAULT 0,
    "cashInTotal" INTEGER NOT NULL DEFAULT 0,
    "cashOutTotal" INTEGER NOT NULL DEFAULT 0,
    "cashMovementsCount" INTEGER NOT NULL DEFAULT 0,
    "openingFloat" INTEGER NOT NULL,
    "expectedCash" INTEGER NOT NULL,
    "closingFloat" INTEGER NOT NULL,
    "cashVariance" INTEGER NOT NULL,
    "topProductsJson" TEXT,
    "vatBreakdownJson" TEXT,
    "fiscalEventId" TEXT,
    CONSTRAINT "ZReport_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ZReport" ("cardTotal", "cashTotal", "cashVariance", "closingFloat", "discountsTotal", "expectedCash", "fiscalEventId", "generatedAt", "id", "number", "openingFloat", "refundsCount", "refundsTotal", "salesCount", "salesTotal", "shiftId", "topProductsJson", "vatBreakdownJson", "vatTotal", "voucherTotal") SELECT "cardTotal", "cashTotal", "cashVariance", "closingFloat", "discountsTotal", "expectedCash", "fiscalEventId", "generatedAt", "id", "number", "openingFloat", "refundsCount", "refundsTotal", "salesCount", "salesTotal", "shiftId", "topProductsJson", "vatBreakdownJson", "vatTotal", "voucherTotal" FROM "ZReport";
DROP TABLE "ZReport";
ALTER TABLE "new_ZReport" RENAME TO "ZReport";
CREATE UNIQUE INDEX "ZReport_shiftId_key" ON "ZReport"("shiftId");
CREATE UNIQUE INDEX "ZReport_number_key" ON "ZReport"("number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CashMovement_shiftId_idx" ON "CashMovement"("shiftId");

-- CreateIndex
CREATE INDEX "CashMovement_createdAt_idx" ON "CashMovement"("createdAt");

-- CreateIndex
CREATE INDEX "CashMovement_category_idx" ON "CashMovement"("category");

