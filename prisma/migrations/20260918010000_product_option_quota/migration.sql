-- L-217 — how many of a category option group a product's price includes.
--
-- ADDITIVE AND INERT. One new table, no column added to an existing one, no
-- data touched. Until a row is written every product behaves exactly as it did
-- before: `quotaFor` answers null and nothing is enforced.
--
-- WHY A TABLE AND NOT A COLUMN. The tacos are three PRODUCTS — M, L, XL —
-- sharing ONE category group, `Viande`. A `maxSelect` on the group cannot be 1,
-- 2 and 3 at once, so the number belongs to the (product, group) pair.
CREATE TABLE "ProductOptionQuota" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "included" INTEGER NOT NULL,
    CONSTRAINT "ProductOptionQuota_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductOptionQuota_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CategoryOptionGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- One ceiling per (product, group): a second row for the same pair would make
-- `quotaFor` depend on row order, which is not a thing a price may depend on.
CREATE UNIQUE INDEX "ProductOptionQuota_productId_groupId_key" ON "ProductOptionQuota"("productId", "groupId");
CREATE INDEX "ProductOptionQuota_productId_idx" ON "ProductOptionQuota"("productId");
CREATE INDEX "ProductOptionQuota_groupId_idx" ON "ProductOptionQuota"("groupId");
