import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { generateZReport, computeShiftReport } from "@/lib/services/reports";
import { nextReceiptNumber, nextShiftNumber, ensureFiscalCounter } from "@/lib/services/sequence";
import { appendFiscalEvent, incrementGrandTotal } from "@/lib/services/fiscal";

// Integration tests for Z report generation (Phase 8c) + grand total.
// All amounts in CENTS.

async function seedShiftWithOrders() {
  await ensureFiscalCounter();
  const user = await db.user.create({
    data: { username: "z-test", name: "Test", role: "MANAGER", pinHash: "x:y" },
  });
  const shift = await db.$transaction(async (tx) => {
    const number = await nextShiftNumber(tx);
    return tx.shift.create({
      data: { number, openedById: user.id, openingFloat: 10000, status: "OPEN" },
    });
  });

  // Create 3 orders in the shift
  for (let i = 0; i < 3; i++) {
    await db.$transaction(async (tx) => {
      const num = await nextReceiptNumber(tx);
      const total = 1000 + i * 500;
      const o = await tx.order.create({
        data: {
          number: num,
          shiftId: shift.id,
          cashierId: user.id,
          status: "COMPLETED",
          subtotal: total,
          vatTotal: Math.round(total * 0.1),
          total,
          itemCount: 1,
          completedAt: new Date(),
        },
      });
      await tx.payment.create({
        data: { orderId: o.id, method: "CASH", amount: total, cashierId: user.id },
      });
      await appendFiscalEvent(tx, {
        type: "VENTE", userId: user.id, orderId: o.id, shiftId: shift.id,
        data: { orderNumber: num, total },
      });
      await incrementGrandTotal(tx, {
        total, vatTotal: Math.round(total * 0.1), cash: total, card: 0, voucher: 0,
      });
    });
  }
  return { user, shift };
}

describe("generateZReport integration", () => {
  beforeEach(async () => {
    await db.refund.deleteMany();
    await db.order.deleteMany();
    await db.payment.deleteMany();
    await db.fiscalEvent.deleteMany();
    await db.grandTotal.deleteMany();
    await db.zReport.deleteMany();
    await db.shift.deleteMany();
    await db.user.deleteMany();
    await db.fiscalCounter.deleteMany();
  });

  it("generates a Z report with the correct totals + seals it immutably", async () => {
    const { user, shift } = await seedShiftWithOrders();

    const { z } = await generateZReport(shift.id, 12500, user.id);

    expect(z.number).toBeGreaterThan(0);
    expect(z.salesTotal).toBe(4500); // 1000 + 1500 + 2000
    expect(z.salesCount).toBe(3);
    expect(z.cashTotal).toBe(4500);
    expect(z.openingFloat).toBe(10000);
    expect(z.expectedCash).toBe(14500); // 10000 + 4500
    expect(z.closingFloat).toBe(12500);
    expect(z.cashVariance).toBe(-2000); // 12500 - 14500
  });

  it("rejects a duplicate Z for the same shift", async () => {
    const { user, shift } = await seedShiftWithOrders();
    await generateZReport(shift.id, 12500, user.id);
    await expect(generateZReport(shift.id, 13000, user.id)).rejects.toThrow("Clôture déjà effectuée");
  });

  it("appends a CLOTURE_Z fiscal event + links it to the Z report", async () => {
    const { user, shift } = await seedShiftWithOrders();
    const { z } = await generateZReport(shift.id, 12500, user.id);

    const events = await db.fiscalEvent.findMany({
      where: { type: "CLOTURE_Z", zReportId: z.id },
    });
    expect(events.length).toBe(1);
    expect(events[0].factice).toBe(false);

    const refreshed = await db.zReport.findUniqueOrThrow({
      where: { id: z.id },
      select: { fiscalEventId: true },
    });
    expect(refreshed.fiscalEventId).toBe(events[0].id);
  });

  it("computeShiftReport nets payment totals by refund method", async () => {
    const { user, shift } = await seedShiftWithOrders();
    // Create a partial refund on one order
    const order = await db.order.findFirstOrThrow({
      where: { shiftId: shift.id },
      include: { refunds: true, payments: true },
    });
    await db.$transaction(async (tx) => {
      await tx.refund.create({
        data: {
          orderId: order.id,
          amount: 300,
          reason: "Test",
          cashierId: user.id,
          method: "CASH",
        },
      });
    });

    const report = await computeShiftReport(shift.id);
    // cashTotal = shift-wide cash (4500) net of the 300 cash refund = 4200
    expect(report.cashTotal).toBe(4500 - 300);
    // salesTotal = gross (4500) net of the 300 refund = 4200
    expect(report.salesTotal).toBe(4500 - 300);
    expect(report.salesCount).toBe(3); // still 3 orders (none fully refunded)
  });
});
