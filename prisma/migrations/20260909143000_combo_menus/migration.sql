-- Batch 5.9 — menus composés (combos).
--
-- HAND-WRITTEN, and deliberately not what `prisma migrate diff` generated.
-- The generator emits a RedefineTables block for `Product`: CREATE new_Product,
-- copy every row, DROP TABLE "Product", rename. Batch 3.1c did exactly that on
-- this production database and it was clean — but `OrderItem.productId` and,
-- from this migration onward, `ComboSlotChoice.productId` both point at that
-- table, and a nullable-free `ADD COLUMN` with a constant DEFAULT is the same
-- change in one statement that SQLite performs in place.
--
-- `prisma migrate diff --from-migrations prisma/migrations
--  --to-schema-datamodel prisma/schema.prisma` reports NO drift after this
-- file, which is the check that it really is the same change.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "isCombo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ComboSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceCategoryId" TEXT NOT NULL,
    CONSTRAINT "ComboSlot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComboSlot_sourceCategoryId_fkey" FOREIGN KEY ("sourceCategoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComboSlotChoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slotId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "surcharge" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ComboSlotChoice_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ComboSlot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComboSlotChoice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComboSlotOptionRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slotId" TEXT NOT NULL,
    "categoryOptionGroupId" TEXT NOT NULL,
    "categoryOptionChoiceId" TEXT,
    CONSTRAINT "ComboSlotOptionRule_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ComboSlot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComboSlotOptionRule_categoryOptionGroupId_fkey" FOREIGN KEY ("categoryOptionGroupId") REFERENCES "CategoryOptionGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComboSlotOptionRule_categoryOptionChoiceId_fkey" FOREIGN KEY ("categoryOptionChoiceId") REFERENCES "CategoryOptionChoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ComboSlot_productId_idx" ON "ComboSlot"("productId");

-- CreateIndex
CREATE INDEX "ComboSlot_sourceCategoryId_idx" ON "ComboSlot"("sourceCategoryId");

-- CreateIndex
CREATE INDEX "ComboSlotChoice_slotId_idx" ON "ComboSlotChoice"("slotId");

-- CreateIndex
CREATE INDEX "ComboSlotChoice_productId_idx" ON "ComboSlotChoice"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ComboSlotChoice_slotId_productId_key" ON "ComboSlotChoice"("slotId", "productId");

-- CreateIndex
CREATE INDEX "ComboSlotOptionRule_slotId_idx" ON "ComboSlotOptionRule"("slotId");

-- CreateIndex
CREATE INDEX "ComboSlotOptionRule_categoryOptionGroupId_idx" ON "ComboSlotOptionRule"("categoryOptionGroupId");

-- CreateIndex
CREATE INDEX "ComboSlotOptionRule_categoryOptionChoiceId_idx" ON "ComboSlotOptionRule"("categoryOptionChoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ComboSlotOptionRule_slotId_categoryOptionGroupId_key" ON "ComboSlotOptionRule"("slotId", "categoryOptionGroupId");

-- AlterTable — the three columns that tie a menu's exploded lines together.
-- NULLABLE and NOT backfilled: null means "not part of a menu", which is what
-- every row written before this batch is. Three in-place ADD COLUMNs; the
-- `OrderItem` table is never rebuilt, and no existing row is rewritten.
ALTER TABLE "OrderItem" ADD COLUMN "comboGroupId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "comboName" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "comboPrice" INTEGER;

-- CreateIndex
CREATE INDEX "OrderItem_comboGroupId_idx" ON "OrderItem"("comboGroupId");
