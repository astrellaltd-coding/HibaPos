import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  closeDay,
  closeMonth,
  verifyDailyCloses,
  perpetualSnapshot,
} from "@/lib/services/fiscal";
import { generateZReport } from "@/lib/services/reports";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { businessDayOf } from "@/lib/period";
import { renderDayCloseTicket, formatIntegrityCode } from "@/lib/services/day-close-ticket";
import type { FiscalEventType } from "@/lib/fiscal";

// DD-23 / DD-24 / L-57 (Batch 3.8) — the sealed trading day.
//
// Before this batch HibaPOS had no daily close. `generateZReport` sealed a
// CAISSE and a comment called it the « clôture journalière »; on the production
// test data Z #2 covered five calendar days. BOFiP § 170 requires a daily, a
// monthly and an annual close and calls the three « cumulatives et
// impératives », and requires that each of them record the perpetual total —
// which none of them did (L-57).
//
// The pure clock is `period-daily-close.test.ts`. This file is the sealed
// document: what lands in it, what is refused, and what is recorded.

const CUTOFF = 5;

async function reset(cutoffHour = CUTOFF) {
  await db.fiscalEvent.deleteMany();
  await db.dailyClose.deleteMany();
  await db.monthlyClose.deleteMany();
  await db.annualClose.deleteMany();
  await db.cashMovement.deleteMany();
  await db.refund.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  // Before the shifts: `ZReport.shift` is `onDelete: Restrict`, so a leftover Z
  // makes every later `shift.deleteMany()` fail. Found when the Z-report case
  // below was added and seven unrelated tests went red behind it.
  await db.zReport.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.setting.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
  await ensureFiscalCounter();
  await db.setting.create({
    data: { key: "businessDayCutoffHour", value: JSON.stringify(cutoffHour) },
  });
  const user = await db.user.create({
    data: {
      username: `dd23-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "SUPER_ADMIN",
      pinHash: "x:y",
    },
  });
  return user.id;
}

/** A closed caisse, so the open-caisse guard is never what a test is measuring. */
async function closedShift(userId: string, number: number, openedAt: Date) {
  return db.shift.create({
    data: {
      number,
      openedById: userId,
      openedAt,
      status: "CLOSED",
      closedById: userId,
      closedAt: new Date(openedAt.getTime() + 3_600_000),
      openingFloat: 5000,
    },
  });
}

let seq = 9000;
/** One completed cash sale at `when`, 20,00 € with 10 % VAT. */
async function sale(userId: string, shiftId: string, when: Date, total = 2000) {
  const number = ++seq;
  return db.order.create({
    data: {
      number,
      shiftId,
      cashierId: userId,
      status: "COMPLETED",
      subtotal: total,
      discountTotal: 0,
      total,
      vatTotal: Math.round((total * 10) / 110),
      itemCount: 1,
      createdAt: when,
      completedAt: when,
      items: {
        create: [
          { productName: "Burger", quantity: 1, lineTotal: total, vatRate: 10, unitPrice: total },
        ],
      },
      payments: { create: [{ method: "CASH", amount: total, cashierId: userId }] },
    },
  });
}

describe("what a trading day seals (DD-23 / DD-24)", () => {
  it("puts a ticket rung after midnight into the day the service started", async () => {
    const userId = await reset();
    const shift = await closedShift(userId, 1, new Date(2026, 5, 12, 18, 0));
    await sale(userId, shift.id, new Date(2026, 5, 12, 20, 0), 2000); // Friday evening
    await sale(userId, shift.id, new Date(2026, 5, 13, 1, 30), 3000); // 01:30 Saturday

    const close = await closeDay("2026-06-12", userId, false, new Date(2026, 5, 13, 6, 0));

    // BOTH sales are Friday's. Under calendar days the second would be Saturday's.
    expect(close.salesCount).toBe(2);
    expect(close.salesTotal).toBe(5000);
    expect(close.cutoffHour).toBe(CUTOFF);
    // And the 01:30 ticket is not left over for the next day.
    const saturday = await closeDay("2026-06-13", userId, false, new Date(2026, 5, 14, 6, 0));
    expect(saturday.salesCount).toBe(0);
    expect(saturday.salesTotal).toBe(0);
  });

  it("THE WORKED EXAMPLE the operator chose: 1 July 01:00 is sealed into 30 June AND into June", async () => {
    const userId = await reset();
    const shift = await closedShift(userId, 1, new Date(2026, 5, 30, 18, 0));
    await sale(userId, shift.id, new Date(2026, 5, 30, 22, 0), 4000);
    await sale(userId, shift.id, new Date(2026, 6, 1, 1, 0), 1000); // 01:00 on 1 July

    const day = await closeDay("2026-06-30", userId, false, new Date(2026, 6, 1, 6, 0));
    expect(day.salesTotal).toBe(5000);

    const june = await closeMonth(2026, 6, userId, false, new Date(2026, 6, 2));
    // DD-24: the month runs on the same clock, so it agrees with the day.
    expect(june.salesTotal).toBe(5000);
    expect(june.cutoffHour).toBe(CUTOFF);
    // The ticket's calendar date is July; its trading day is June.
    expect(businessDayOf(new Date(2026, 6, 1, 1, 0), CUTOFF)).toBe("2026-06-30");
  });

  it("a month equals the sum of its trading days (Batch 3.2's rule, one level down)", async () => {
    const userId = await reset();
    const shift = await closedShift(userId, 1, new Date(2026, 3, 1, 10, 0));
    // Three trading days in April, one of them running past midnight.
    await sale(userId, shift.id, new Date(2026, 3, 6, 12, 0), 1000);
    await sale(userId, shift.id, new Date(2026, 3, 6, 20, 0), 2000);
    await sale(userId, shift.id, new Date(2026, 3, 7, 2, 0), 3000); // still the 6th
    await sale(userId, shift.id, new Date(2026, 3, 8, 12, 0), 4000);
    await sale(userId, shift.id, new Date(2026, 3, 9, 12, 0), 5000);

    const d6 = await closeDay("2026-04-06", userId, false, new Date(2026, 4, 2));
    const d8 = await closeDay("2026-04-08", userId, false, new Date(2026, 4, 2));
    const d9 = await closeDay("2026-04-09", userId, false, new Date(2026, 4, 2));
    const april = await closeMonth(2026, 4, userId, false, new Date(2026, 4, 2));

    expect(d6.salesTotal).toBe(6000); // 1000 + 2000 + 3000, the 02:00 one included
    expect(d8.salesTotal).toBe(4000);
    expect(d9.salesTotal).toBe(5000);
    expect(d6.salesTotal + d8.salesTotal + d9.salesTotal).toBe(april.salesTotal);
    expect(d6.salesCount + d8.salesCount + d9.salesCount).toBe(april.salesCount);
    expect(d6.vatTotal + d8.vatTotal + d9.vatTotal).toBe(april.vatTotal);
  });
});

describe("the guards (DD-23)", () => {
  it("refuses a day that is already sealed", async () => {
    const userId = await reset();
    await closeDay("2026-06-12", userId, false, new Date(2026, 5, 14));
    await expect(closeDay("2026-06-12", userId, false, new Date(2026, 5, 14))).rejects.toThrow(
      /déjà effectuée/i,
    );
    expect(await db.dailyClose.count()).toBe(1);
  });

  it("refuses a day that has not ended, and writes nothing", async () => {
    const userId = await reset();
    // 03:00 on the 13th: the trading day of the 12th runs until 05:00.
    await expect(closeDay("2026-06-12", userId, false, new Date(2026, 5, 13, 3, 0))).rejects.toThrow(
      /prématurée/i,
    );
    expect(await db.dailyClose.count()).toBe(0);
    expect(await db.fiscalEvent.count()).toBe(0);
  });

  it("refuses while a caisse is still open (L-27's unconditional rule)", async () => {
    const userId = await reset();
    await db.shift.create({
      data: { number: 1, openedById: userId, openedAt: new Date(2026, 5, 12, 18, 0), status: "OPEN", openingFloat: 0 },
    });
    await expect(closeDay("2026-06-12", userId, false, new Date(2026, 5, 14))).rejects.toThrow(
      /n'est pas clôturée/i,
    );
    expect(await db.dailyClose.count()).toBe(0);
  });

  it("refuses a day earlier than one already sealed", async () => {
    const userId = await reset();
    await closeDay("2026-06-12", userId, false, new Date(2026, 5, 20));
    await expect(closeDay("2026-06-11", userId, false, new Date(2026, 5, 20))).rejects.toThrow(
      /hors séquence/i,
    );
  });

  it("refuses to skip a day that actually traded", async () => {
    const userId = await reset();
    const shift = await closedShift(userId, 1, new Date(2026, 5, 12, 18, 0));
    await sale(userId, shift.id, new Date(2026, 5, 12, 20, 0));
    await sale(userId, shift.id, new Date(2026, 5, 14, 20, 0));

    await expect(closeDay("2026-06-14", userId, false, new Date(2026, 5, 20))).rejects.toThrow(
      /2026-06-12/,
    );
    expect(await db.dailyClose.count()).toBe(0);
  });

  it("ALLOWS skipping a day with no trading — the restaurant closed on Mondays", async () => {
    // This is the case that makes the day rule different from the monthly one.
    // `assertNextPeriod` would refuse Tuesday for the life of the business.
    const userId = await reset();
    const shift = await closedShift(userId, 1, new Date(2026, 5, 12, 18, 0));
    await sale(userId, shift.id, new Date(2026, 5, 12, 20, 0)); // Friday
    await sale(userId, shift.id, new Date(2026, 5, 16, 20, 0)); // Tuesday

    await closeDay("2026-06-12", userId, false, new Date(2026, 5, 20));
    const tuesday = await closeDay("2026-06-16", userId, false, new Date(2026, 5, 20));
    expect(tuesday.salesCount).toBe(1);
    expect(await db.dailyClose.count()).toBe(2);
  });

  it("refuses to skip a day whose only event was a cash movement", async () => {
    // "Traded" is orders OR cash movements: a payout from the drawer is
    // something the close would have recorded.
    const userId = await reset();
    const shift = await closedShift(userId, 1, new Date(2026, 5, 12, 18, 0));
    await db.cashMovement.create({
      data: {
        shiftId: shift.id,
        category: "DEPENSE",
        amount: -2000,
        reason: "Fournisseur",
        cashierId: userId,
        createdAt: new Date(2026, 5, 12, 19, 0),
      },
    });
    await expect(closeDay("2026-06-14", userId, false, new Date(2026, 5, 20))).rejects.toThrow(
      /2026-06-12/,
    );
  });
});

describe("L-57 — every close records the perpetual total", () => {
  it("seals the figure GrandTotal held at the moment of sealing", async () => {
    const userId = await reset();
    const shift = await closedShift(userId, 1, new Date(2026, 5, 12, 10, 0));
    await sale(userId, shift.id, new Date(2026, 5, 12, 12, 0), 2500);
    // The perpetual total is maintained by checkout, not by a seeded row, so it
    // is set here explicitly: this test is about what the CLOSE records, not
    // about how the total is accumulated.
    await db.grandTotal.create({
      data: {
        id: "singleton",
        totalSales: 123_456,
        totalOrders: 42,
        totalVat: 11_223,
        totalCash: 100_000,
        totalCard: 20_000,
        totalVoucher: 3_456,
        totalRefunded: 999,
      },
    });

    const day = await closeDay("2026-06-12", userId, false, new Date(2026, 5, 14));
    expect(day.perpetualSalesTotal).toBe(123_456);
    expect(JSON.parse(day.perpetualTotalsJson!)).toEqual({
      totalSales: 123_456,
      totalOrders: 42,
      totalVat: 11_223,
      totalCash: 100_000,
      totalCard: 20_000,
      totalVoucher: 3_456,
      totalRefunded: 999,
    });
    // And it is the PERPETUAL total, not the period's own — the distinction
    // BOFiP § 170 draws and the whole of the finding.
    expect(day.salesTotal).toBe(2500);
    expect(day.perpetualSalesTotal).not.toBe(day.salesTotal);

    // The sealed payload carries it too, so the chain covers it.
    expect(JSON.parse(day.dataJson).perpetual.totalSales).toBe(123_456);

    // The month records it on the same terms.
    const june = await closeMonth(2026, 6, userId, false, new Date(2026, 6, 2));
    expect(june.perpetualSalesTotal).toBe(123_456);
  });

  it("records a measured zero when nothing has ever been sold, never a null", async () => {
    // The GrandTotal row is created by the first sale. Its absence means zero
    // is the truth; null is reserved for rows sealed before Batch 3.8.
    const userId = await reset();
    expect(await db.grandTotal.count()).toBe(0);
    const day = await closeDay("2026-06-12", userId, false, new Date(2026, 5, 14));
    expect(day.perpetualSalesTotal).toBe(0);
    expect(day.perpetualTotalsJson).not.toBeNull();
  });

  it("the Z REPORT records it too — every close means every close", async () => {
    // ADDED after the revert protocol found this uncovered: removing the
    // perpetual total from `generateZReport` broke nothing, so L-57 was only
    // three-quarters asserted. BOFiP § 170 says « pour chaque clôture », and
    // the Z is one of the four.
    const userId = await reset();
    const shift = await db.shift.create({
      data: {
        number: 1,
        openedById: userId,
        openedAt: new Date(2026, 5, 12, 10, 0),
        status: "OPEN",
        openingFloat: 5000,
      },
    });
    await sale(userId, shift.id, new Date(2026, 5, 12, 12, 0), 2000);
    await db.grandTotal.create({
      data: { id: "singleton", totalSales: 654_321, totalOrders: 99, totalVat: 59_483 },
    });

    const { z } = await generateZReport(shift.id, 7000, userId);
    expect(z.perpetualSalesTotal).toBe(654_321);
    expect(JSON.parse(z.perpetualTotalsJson!).totalOrders).toBe(99);
    // Perpetual, not the shift's own takings — the distinction is the finding.
    expect(z.salesTotal).toBe(2000);
    // And it travels in the sealed journal entry, so the chain covers it.
    const ev = await db.fiscalEvent.findFirstOrThrow({ where: { type: "CLOTURE_Z" } });
    expect(JSON.parse(ev.dataJson).perpetualSalesTotal).toBe(654_321);
  });

  it("perpetualSnapshot reads what GrandTotal holds", async () => {
    await reset();
    await db.grandTotal.create({ data: { id: "singleton", totalSales: 777, totalOrders: 3 } });
    const snap = await perpetualSnapshot(db);
    expect(snap.totalSales).toBe(777);
    expect(snap.totalOrders).toBe(3);
  });
});

describe("the sealed day is a chained fiscal document", () => {
  it("chains, verifies, and journals a CLOTURE_J", async () => {
    const userId = await reset();
    const shift = await closedShift(userId, 1, new Date(2026, 5, 12, 10, 0));
    await sale(userId, shift.id, new Date(2026, 5, 12, 12, 0));
    await sale(userId, shift.id, new Date(2026, 5, 13, 12, 0));

    const d1 = await closeDay("2026-06-12", userId, false, new Date(2026, 5, 20));
    const d2 = await closeDay("2026-06-13", userId, false, new Date(2026, 5, 20));

    expect(d1.previousHash).toBeNull();
    expect(d2.previousHash).toBe(d1.hash);
    expect((await verifyDailyCloses()).ok).toBe(true);
    expect((await verifyDailyCloses()).eventsChecked).toBe(2);

    const events = await db.fiscalEvent.findMany({ orderBy: { sequence: "asc" } });
    expect(events.map((e) => e.type)).toEqual(["CLOTURE_J", "CLOTURE_J"]);
    expect(events[0].closeId).toBe(d1.id);
    expect(d1.fiscalEventId).toBe(events[0].id);
    expect(JSON.parse(events[0].dataJson).perpetualSalesTotal).toBe(0);
  });

  it("detects a rewritten day close", async () => {
    const userId = await reset();
    const d = await closeDay("2026-06-12", userId, false, new Date(2026, 5, 20));
    expect((await verifyDailyCloses()).ok).toBe(true);
    await db.dailyClose.update({ where: { id: d.id }, data: { salesTotal: 999_999 } });
    // The row moved but `dataJson` did not, so the hash still recomputes: this
    // is the honest limit of a chain over a payload, and it is why the ticket's
    // printed code exists (DD-25). What a changed PAYLOAD does is the next case.
    expect((await verifyDailyCloses()).ok).toBe(true);
    await db.dailyClose.update({
      where: { id: d.id },
      data: { dataJson: JSON.stringify({ tampered: true }) },
    });
    const after = await verifyDailyCloses();
    expect(after.ok).toBe(false);
    expect(after.firstBreakAt).toBe(1);
  });

  it("keeps the cut-off it was sealed under when the setting later changes", async () => {
    const userId = await reset(5);
    const day = await closeDay("2026-06-12", userId, false, new Date(2026, 5, 20));
    expect(day.cutoffHour).toBe(5);

    await db.setting.update({
      where: { key: "businessDayCutoffHour" },
      data: { value: JSON.stringify(2) },
    });
    const reread = await db.dailyClose.findUniqueOrThrow({ where: { id: day.id } });
    expect(reread.cutoffHour).toBe(5);
    expect(reread.hash).toBe(day.hash);
    expect(JSON.parse(reread.dataJson).cutoffHour).toBe(5);
    expect((await verifyDailyCloses()).ok).toBe(true);
  });

  it("declares CLOTURE_J in BOTH event enumerations", async () => {
    // Batch 5.5 added `MOUVEMENT_CAISSE` to the server's union only, and
    // nothing caught it because nothing consumes the client one. *Open Threads
    // → D* records that a reader which ENUMERATES types is not complete.
    const server: FiscalEventType = "CLOTURE_J";
    expect(server).toBe("CLOTURE_J");
    const { readFileSync } = await import("fs");
    const path = await import("path");
    const client = readFileSync(path.join(process.cwd(), "src/types/api.ts"), "utf8");
    expect(client).toContain(`| "CLOTURE_J"`);
  });
});

describe("the closing slip (DD-25's paper half)", () => {
  it("prints the day, the takings, the perpetual total and an integrity code", async () => {
    const userId = await reset();
    const shift = await closedShift(userId, 1, new Date(2026, 5, 12, 10, 0));
    await sale(userId, shift.id, new Date(2026, 5, 12, 12, 0), 2000);
    const day = await closeDay("2026-06-12", userId, false, new Date(2026, 5, 20));

    const text = renderDayCloseTicket(day, { restaurantName: "HIBA FOOD", receiptWidth: 42 });
    expect(text).toContain("HIBA FOOD");
    expect(text).toContain("CLÔTURE DU JOUR");
    expect(text).toContain("Journée du 12/06/2026");
    expect(text).toContain("(05:00 → 05:00 le lendemain)");
    expect(text).toContain("Total perpétuel");
    expect(text).toContain("Code d'intégrité");
    expect(text).toContain("À conserver avec la comptabilité");
    // The code on the paper is the fingerprint of the sealed row — that
    // correspondence is the whole mechanism.
    expect(text).toContain(formatIntegrityCode(day.hash));
    expect(formatIntegrityCode(day.hash)).toBe(
      day.hash.slice(0, 16).toUpperCase().match(/.{1,4}/g)!.join("-"),
    );
    // Last line names the software and version (L-53).
    expect(text.split("\n").at(-1)!.trim()).toMatch(/^HibaPOS France v\d+\.\d+\.\d+$/);
  });

  it("stamps a simulated close so it cannot be mistaken for a real one", async () => {
    const userId = await reset();
    const day = await closeDay("2026-06-12", userId, true, new Date(2026, 5, 20));
    const text = renderDayCloseTicket(day, { restaurantName: "HIBA FOOD", factice: true });
    expect(text.split("\n")[0]).toContain("FACTICE");
    expect(text).toContain("DOCUMENT NON VALABLE");
  });

  it("says so rather than printing a zero when the perpetual total was never taken", async () => {
    // A close sealed before Batch 3.8 carries null. The slip must not invent 0.
    const userId = await reset();
    const day = await closeDay("2026-06-12", userId, false, new Date(2026, 5, 20));
    const text = renderDayCloseTicket({ ...day, perpetualSalesTotal: null });
    expect(text).toContain("non enregistré");
  });
});
