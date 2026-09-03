-- AlterTable
ALTER TABLE "Category" ADD COLUMN "vatRate" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "pickupPrice" INTEGER,
    "deliveryPrice" INTEGER,
    "vatRate" REAL NOT NULL DEFAULT 20.0,
    "categoryId" TEXT NOT NULL,
    "image" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "inheritCategoryGlobals" BOOLEAN NOT NULL DEFAULT true,
    "inheritCategoryVat" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("active", "available", "categoryId", "createdAt", "deliveryPrice", "description", "id", "image", "inheritCategoryGlobals", "name", "pickupPrice", "price", "sortOrder", "updatedAt", "vatRate") SELECT "active", "available", "categoryId", "createdAt", "deliveryPrice", "description", "id", "image", "inheritCategoryGlobals", "name", "pickupPrice", "price", "sortOrder", "updatedAt", "vatRate" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX "Product_name_idx" ON "Product"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
