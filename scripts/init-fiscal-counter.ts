import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  await db.fiscalCounter.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", lastReceiptNumber: 0, lastShiftNumber: 0, lastZReportNumber: 0 },
    update: {},
  });
  console.log("FiscalCounter ready");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
