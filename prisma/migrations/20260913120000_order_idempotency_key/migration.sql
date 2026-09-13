-- L-89 / L-90 (R8.2) — one checkout attempt, one order.
--
-- A double-tap on « Valider » booked the sale twice: two orders, two sealed
-- VENTE events, and `GrandTotal` moved twice. `GrandTotal` is NEVER decremented
-- (schema.prisma), so that inflation is permanent — a refund corrects the money
-- and nothing removes the phantom sale. The same permanent consequence arrives
-- a second way when a committed sale's HTTP response is lost and the operator
-- rings it again.
--
-- NULLABLE because every order that already exists has no key, and a client
-- that sends none still checks out. UNIQUE is the part that works: the second
-- insert loses at the database rather than at a read-then-write that two
-- concurrent requests can both pass. SQLite treats NULLs as distinct in a
-- unique index, so any number of keyless orders coexist.
--
-- `ALTER TABLE ... ADD COLUMN` does not rewrite the table in SQLite, so no
-- existing row is touched and no sealed payload is re-serialised.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");
