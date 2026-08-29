import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  nextReceiptNumber,
  nextShiftNumber,
  nextZReportNumber,
  nextFiscalEventSequence,
  ensureFiscalCounter,
} from "@/lib/services/sequence";

// Concurrency tests for the atomic fiscal counter (Phase 8d).
// The counter uses Prisma's `increment: 1` inside a $transaction,
// so two concurrent transactions cannot both receive the same number.
// SQLite's single-writer lock serializes the increments.

async function concurrentIncrement(fn: () => Promise<number>, n: number): Promise<number[]> {
  const promises = Array.from({ length: n }, () => fn());
  return Promise.all(promises);
}

describe("fiscal counter concurrency", () => {
  beforeEach(async () => {
    await db.fiscalEvent.deleteMany();
    await db.grandTotal.deleteMany();
    await db.zReport.deleteMany();
    await db.order.deleteMany();
    await db.shift.deleteMany();
    await db.user.deleteMany();
    await db.fiscalCounter.deleteMany();
    await ensureFiscalCounter();
  });

  it("nextReceiptNumber: no duplicates under concurrent increments", async () => {
    const numbers = await concurrentIncrement(() => nextReceiptNumber(db), 20);
    const unique = new Set(numbers);
    expect(unique.size).toBe(numbers.length); // all unique
    expect(Math.max(...numbers)).toBe(20);
    expect(Math.min(...numbers)).toBe(1);
  });

  it("nextShiftNumber: no duplicates under concurrent increments", async () => {
    const numbers = await concurrentIncrement(() => nextShiftNumber(db), 15);
    const unique = new Set(numbers);
    expect(unique.size).toBe(numbers.length);
    expect(Math.max(...numbers)).toBe(15);
  });

  it("nextZReportNumber: no duplicates under concurrent increments", async () => {
    const numbers = await concurrentIncrement(() => nextZReportNumber(db), 10);
    const unique = new Set(numbers);
    expect(unique.size).toBe(numbers.length);
  });

  it("nextFiscalEventSequence: no duplicates under concurrent increments", async () => {
    const numbers = await concurrentIncrement(() => nextFiscalEventSequence(db), 25);
    const unique = new Set(numbers);
    expect(unique.size).toBe(numbers.length);
    expect(Math.max(...numbers)).toBe(25);
  });
});
