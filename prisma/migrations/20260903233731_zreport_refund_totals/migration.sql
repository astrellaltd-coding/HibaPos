-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "openingFloat" INTEGER NOT NULL,
    "expectedCash" INTEGER NOT NULL,
    "closingFloat" INTEGER NOT NULL,
    "cashVariance" INTEGER NOT NULL,
    "topProductsJson" TEXT,
    "vatBreakdownJson" TEXT,
    "fiscalEventId" TEXT,
    CONSTRAINT "ZReport_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ZReport" ("cardTotal", "cashTotal", "cashVariance", "closingFloat", "discountsTotal", "expectedCash", "fiscalEventId", "generatedAt", "id", "number", "openingFloat", "salesCount", "salesTotal", "shiftId", "topProductsJson", "vatBreakdownJson", "vatTotal", "voucherTotal") SELECT "cardTotal", "cashTotal", "cashVariance", "closingFloat", "discountsTotal", "expectedCash", "fiscalEventId", "generatedAt", "id", "number", "openingFloat", "salesCount", "salesTotal", "shiftId", "topProductsJson", "vatBreakdownJson", "vatTotal", "voucherTotal" FROM "ZReport";
DROP TABLE "ZReport";
ALTER TABLE "new_ZReport" RENAME TO "ZReport";
CREATE UNIQUE INDEX "ZReport_shiftId_key" ON "ZReport"("shiftId");
CREATE UNIQUE INDEX "ZReport_number_key" ON "ZReport"("number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
