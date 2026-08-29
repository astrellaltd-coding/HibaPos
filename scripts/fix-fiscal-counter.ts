// One-shot script to sync FiscalCounter with actual table max values.
// Run with: npx tsx scripts/fix-fiscal-counter.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const [orderMax, shiftMax, zMax] = await Promise.all([
    db.order.aggregate({ _max: { number: true } }).then((r) => r._max.number ?? 0),
    db.shift.aggregate({ _max: { number: true } }).then((r) => r._max.number ?? 0),
    db.zReport.aggregate({ _max: { number: true } }).then((r) => r._max.number ?? 0),
  ]);

  console.log("Current max values:", { orderMax, shiftMax, zMax });

  const counter = await db.fiscalCounter.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      lastReceiptNumber: orderMax,
      lastShiftNumber: shiftMax,
      lastZReportNumber: zMax,
    },
    update: {
      lastReceiptNumber: orderMax,
      lastShiftNumber: shiftMax,
      lastZReportNumber: zMax,
    },
  });

  console.log("FiscalCounter synced:", counter);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
