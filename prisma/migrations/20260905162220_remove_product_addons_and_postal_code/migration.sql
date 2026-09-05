-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AddOn";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ProductAddon";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Customer" ("active", "address", "createdAt", "email", "id", "name", "notes", "phone", "updatedAt") SELECT "active", "address", "createdAt", "email", "id", "name", "notes", "phone", "updatedAt" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");
CREATE INDEX "Customer_name_idx" ON "Customer"("name");
CREATE INDEX "Customer_active_idx" ON "Customer"("active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

