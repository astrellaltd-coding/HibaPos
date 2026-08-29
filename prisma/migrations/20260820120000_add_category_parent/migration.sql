-- AlterTable
ALTER TABLE "Category" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");
