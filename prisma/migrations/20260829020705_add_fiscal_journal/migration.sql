-- AlterTable
ALTER TABLE "Order" ADD COLUMN "fiscalEventId" TEXT;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN "fiscalEventId" TEXT;

-- AlterTable
ALTER TABLE "ZReport" ADD COLUMN "fiscalEventId" TEXT;

-- CreateTable
CREATE TABLE "FiscalEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "orderId" TEXT,
    "refundId" TEXT,
    "zReportId" TEXT,
    "shiftId" TEXT,
    "closeId" TEXT,
    "archiveId" TEXT,
    "userId" TEXT,
    "factice" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataJson" TEXT NOT NULL,
    "previousHash" TEXT,
    "hash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "GrandTotal" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "totalSales" REAL NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "totalVat" REAL NOT NULL DEFAULT 0,
    "totalCash" REAL NOT NULL DEFAULT 0,
    "totalCard" REAL NOT NULL DEFAULT 0,
    "totalVoucher" REAL NOT NULL DEFAULT 0,
    "totalRefunded" REAL NOT NULL DEFAULT 0,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MonthlyClose" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "period" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "salesTotal" REAL NOT NULL,
    "salesCount" INTEGER NOT NULL,
    "vatTotal" REAL NOT NULL,
    "cashTotal" REAL NOT NULL,
    "cardTotal" REAL NOT NULL,
    "voucherTotal" REAL NOT NULL,
    "discountsTotal" REAL NOT NULL,
    "vatBreakdownJson" TEXT NOT NULL,
    "topProductsJson" TEXT NOT NULL,
    "sealedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sealedById" TEXT NOT NULL,
    "previousHash" TEXT,
    "hash" TEXT NOT NULL,
    "fiscalEventId" TEXT
);

-- CreateTable
CREATE TABLE "AnnualClose" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "period" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "salesTotal" REAL NOT NULL,
    "salesCount" INTEGER NOT NULL,
    "vatTotal" REAL NOT NULL,
    "cashTotal" REAL NOT NULL,
    "cardTotal" REAL NOT NULL,
    "voucherTotal" REAL NOT NULL,
    "discountsTotal" REAL NOT NULL,
    "vatBreakdownJson" TEXT NOT NULL,
    "topProductsJson" TEXT NOT NULL,
    "sealedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sealedById" TEXT NOT NULL,
    "previousHash" TEXT,
    "hash" TEXT NOT NULL,
    "fiscalEventId" TEXT
);

-- CreateTable
CREATE TABLE "FiscalArchive" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT NOT NULL,
    "fiscalEventId" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#f59e0b',
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "parentId" TEXT,
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("active", "color", "createdAt", "icon", "id", "name", "parentId", "sortOrder", "updatedAt") SELECT "active", "color", "createdAt", "icon", "id", "name", "parentId", "sortOrder", "updatedAt" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
CREATE INDEX "Category_name_idx" ON "Category"("name");
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");
CREATE TABLE "new_FiscalCounter" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "lastReceiptNumber" INTEGER NOT NULL DEFAULT 0,
    "lastShiftNumber" INTEGER NOT NULL DEFAULT 0,
    "lastZReportNumber" INTEGER NOT NULL DEFAULT 0,
    "lastFiscalEventSequence" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_FiscalCounter" ("id", "lastReceiptNumber", "lastShiftNumber", "lastZReportNumber") SELECT "id", "lastReceiptNumber", "lastShiftNumber", "lastZReportNumber" FROM "FiscalCounter";
DROP TABLE "FiscalCounter";
ALTER TABLE "new_FiscalCounter" RENAME TO "FiscalCounter";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "FiscalEvent_sequence_key" ON "FiscalEvent"("sequence");

-- CreateIndex
CREATE INDEX "FiscalEvent_timestamp_idx" ON "FiscalEvent"("timestamp");

-- CreateIndex
CREATE INDEX "FiscalEvent_type_idx" ON "FiscalEvent"("type");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyClose_period_key" ON "MonthlyClose"("period");

-- CreateIndex
CREATE INDEX "MonthlyClose_year_idx" ON "MonthlyClose"("year");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualClose_period_key" ON "AnnualClose"("period");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalArchive_year_key" ON "FiscalArchive"("year");
