import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  closeMonth,
  closeYear,
  verifyMonthlyCloses,
  verifyAnnualCloses,
  nextMonthlyPeriod,
} from "@/lib/services/fiscal";
import { ensureFiscalCounter } from "@/lib/services/sequence";

// M-01 (Batch 3.6) — period closes must be sealed in order, with no gaps.
//
// The defect: `closeMonth` chained each close to the one with the highest
// PERIOD, while `verifyCloses` walks the rows sorted by period. Sealing
// 2026-03 and then 2026-01 gave January a `previousHash` pointing at March,
// and verification then reported a break at the first row — permanently,
// because a sealed close can be neither edited nor deleted.
//
// Reproduced against a copy of the production database before the guard was
// written: `{ok:false, firstBreakAt:1}` out of order, `{ok:true}` in order.
//
// DD-05 (operator, 2026-09-04): refuse the out-of-order close rather than
// chain by insertion order. So the tests below assert a REFUSAL — and, just
// as importantly, that a refusal writes nothing.

async function reset() {
  await db.fiscalEvent.deleteMany();
  await db.monthlyClose.deleteMany();
  await db.annualClose.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
  await ensureFiscalCounter();
  const user = await db.user.create({
    data: { username: `m01-${Date.now()}`, name: "Resp", role: "SUPER_ADMIN", pinHash: "x:y" },
  });
  return user.id;
}

describe("nextMonthlyPeriod", () => {
  it("advances within a year", () => {
    expect(nextMonthlyPeriod("2026-01")).toBe("2026-02");
    expect(nextMonthlyPeriod("2026-09")).toBe("2026-10");
  });

  it("rolls over December into the next January, zero-padded", () => {
    expect(nextMonthlyPeriod("2026-12")).toBe("2027-01");
  });
});

describe("monthly close sequence (M-01)", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await reset();
  });

  it("accepts any month as the very first close", async () => {
    // A restaurant adopting the feature in September must not be made to seal
    // eight earlier months first.
    const close = await closeMonth(2026, 9, userId);
    expect(close.period).toBe("2026-09");
    expect(close.previousHash).toBeNull();
    expect((await verifyMonthlyCloses()).ok).toBe(true);
  });

  it("accepts consecutive months and keeps the chain verifiable", async () => {
    await closeMonth(2026, 1, userId);
    await closeMonth(2026, 2, userId);
    await closeMonth(2026, 3, userId);

    const rows = await db.monthlyClose.findMany({ orderBy: { period: "asc" } });
    expect(rows.map((r) => r.period)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(rows[0].previousHash).toBeNull();
    expect(rows[1].previousHash).toBe(rows[0].hash);
    expect(rows[2].previousHash).toBe(rows[1].hash);

    const chain = await verifyMonthlyCloses();
    expect(chain.ok).toBe(true);
    expect(chain.eventsChecked).toBe(3);
  });

  it("REFUSES an earlier month after a later one — the exact M-01 case", async () => {
    await closeMonth(2026, 3, userId);
    await expect(closeMonth(2026, 1, userId)).rejects.toThrow(/hors séquence/);
    await expect(closeMonth(2026, 1, userId)).rejects.toThrow(/2026-04/);
  });

  it("REFUSES a skipped month, which would strand the one in between", async () => {
    // "Later than the last close" would let this through and leave 2026-02
    // permanently unsealable — the same hole in a smaller shape.
    await closeMonth(2026, 1, userId);
    await expect(closeMonth(2026, 3, userId)).rejects.toThrow(/hors séquence/);
    await closeMonth(2026, 2, userId); // the month it actually wants
    await closeMonth(2026, 3, userId); // now allowed
    expect((await verifyMonthlyCloses()).ok).toBe(true);
  });

  it("writes NOTHING when it refuses", async () => {
    await closeMonth(2026, 3, userId);
    const eventsBefore = await db.fiscalEvent.count();
    const closesBefore = await db.monthlyClose.count();

    await expect(closeMonth(2026, 1, userId)).rejects.toThrow();

    // A rejected close must not leave a half-sealed row, a stray CLOTURE_M
    // event, or a consumed sequence number. The guard runs before the
    // aggregation for exactly this reason.
    expect(await db.fiscalEvent.count()).toBe(eventsBefore);
    expect(await db.monthlyClose.count()).toBe(closesBefore);
    expect(await db.monthlyClose.findUnique({ where: { period: "2026-01" } })).toBeNull();
    expect((await verifyMonthlyCloses()).ok).toBe(true);
  });

  it("rolls over the year boundary", async () => {
    await closeMonth(2026, 12, userId);
    await expect(closeMonth(2027, 2, userId)).rejects.toThrow(/2027-01/);
    await closeMonth(2027, 1, userId);
    expect((await verifyMonthlyCloses()).ok).toBe(true);
  });

  it("still refuses a duplicate period, with the original message", async () => {
    await closeMonth(2026, 5, userId);
    await expect(closeMonth(2026, 5, userId)).rejects.toThrow(/déjà effectuée/);
  });

  it("still detects a genuine tamper on a sealed row", async () => {
    // The guard must not be mistaken for the integrity check. Alter a sealed
    // close's payload and verification has to fail.
    await closeMonth(2026, 1, userId);
    await closeMonth(2026, 2, userId);
    expect((await verifyMonthlyCloses()).ok).toBe(true);

    const second = await db.monthlyClose.findUniqueOrThrow({ where: { period: "2026-02" } });
    await db.monthlyClose.update({
      where: { id: second.id },
      data: { dataJson: second.dataJson.replace('"salesTotal":0', '"salesTotal":999999') },
    });

    const chain = await verifyMonthlyCloses();
    expect(chain.ok).toBe(false);
    expect(chain.firstBreakAt).toBe(2);
  });
});

describe("annual close sequence (M-01)", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await reset();
  });

  it("accepts any year first, then only the next one", async () => {
    await closeYear(2026, userId);
    await expect(closeYear(2028, userId)).rejects.toThrow(/hors séquence/);
    await expect(closeYear(2025, userId)).rejects.toThrow(/2027/);
    await closeYear(2027, userId);

    const rows = await db.annualClose.findMany({ orderBy: { period: "asc" } });
    expect(rows.map((r) => r.period)).toEqual(["2026", "2027"]);
    expect(rows[1].previousHash).toBe(rows[0].hash);
    expect((await verifyAnnualCloses()).ok).toBe(true);
  });

  it("names the exercice, not the month, in its refusal", async () => {
    await closeYear(2026, userId);
    await expect(closeYear(2030, userId)).rejects.toThrow(/exercice/);
  });
});
