// Atomic sequence numbering via FiscalCounter singleton table.
// Numeric counters use Prisma's atomic `increment: 1` so two concurrent
// transactions cannot both receive the same number — the unique constraint
// would otherwise throw P2002 on the second writer.
import { db } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";

type Tx = PrismaClient | Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

// Ensure the FiscalCounter row exists. Call once at app startup / seed, and
// defensively self-healed by the next* helpers below (an API-seeded DB that
// never ran this no longer bricks order creation).
export async function ensureFiscalCounter(): Promise<void> {
  await db.fiscalCounter.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      lastReceiptNumber: 0,
      lastShiftNumber: 0,
      lastZReportNumber: 0,
    },
    update: {},
  });
}

/** Next receipt number — atomic increment inside a Prisma transaction. */
export async function nextReceiptNumber(tx: Tx): Promise<number> {
  // Upsert is self-healing: if the singleton row is missing (e.g. a DB
  // seeded via POST /api/seed on an older build), it is created with
  // lastReceiptNumber = 1 instead of throwing P2025.
  const updated = await tx.fiscalCounter.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      lastReceiptNumber: 1,
      lastShiftNumber: 0,
      lastZReportNumber: 0,
    },
    update: { lastReceiptNumber: { increment: 1 } },
  });
  return updated.lastReceiptNumber;
}

/** Next shift number — atomic increment inside a Prisma transaction. */
export async function nextShiftNumber(tx: Tx): Promise<number> {
  const updated = await tx.fiscalCounter.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      lastReceiptNumber: 0,
      lastShiftNumber: 1,
      lastZReportNumber: 0,
    },
    update: { lastShiftNumber: { increment: 1 } },
  });
  return updated.lastShiftNumber;
}

/** Next Z report number — atomic increment inside a Prisma transaction. */
export async function nextZReportNumber(tx: Tx): Promise<number> {
  const updated = await tx.fiscalCounter.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      lastReceiptNumber: 0,
      lastShiftNumber: 0,
      lastZReportNumber: 1,
    },
    update: { lastZReportNumber: { increment: 1 } },
  });
  return updated.lastZReportNumber;
}

/** Next FiscalEvent journal sequence — atomic gapless increment inside a
 *  Prisma transaction. Used by appendFiscalEvent to order the hash chain. */
export async function nextFiscalEventSequence(tx: Tx): Promise<number> {
  const updated = await tx.fiscalCounter.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      lastReceiptNumber: 0,
      lastShiftNumber: 0,
      lastZReportNumber: 0,
      lastFiscalEventSequence: 1,
    },
    update: { lastFiscalEventSequence: { increment: 1 } },
  });
  return updated.lastFiscalEventSequence;
}