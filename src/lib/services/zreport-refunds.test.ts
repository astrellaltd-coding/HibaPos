import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { generateZReport, computeShiftReport } from "@/lib/services/reports";
import { processRefund } from "@/lib/services/refund";
import { ensureFiscalCounter, nextReceiptNumber } from "@/lib/services/sequence";

// M-07 (Batch 3.6) — the Z report did not itemise the period's corrections.
//
// `ZReport` had no refund column and `computeShiftReport` did not return one,
// so a day with 40 € of refunds and a day with none produced identical
// documents. The sealed CLOTURE_Z journal entry omitted it too, which is the
// half the plan text did not mention: the daily close recorded its takings and
// not what it gave back.
//
// The figures come from `aggregateOrders`, the single aggregation Batch 3.2
// established — so a Z report and the monthly close containing it cannot
// disagree about refunds any more than they can about sales.

let userId: string;
let shiftId: string;

async function reset(openingFloat = 10000) {
  await db.fiscalEvent.deleteMany();
  await db.zReport.deleteMany();
  await db.refund.deleteMany();
  await db.payment.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
  await ensureFiscalCounter();

  const user = await db.user.create({
    data: { username: `m07-${Date.now()}`, name: "Caissier", role: "MANAGER", pinHash: "x:y" },
  });
  const shift = await db.shift.create({
    data: { number: 1, openedById: user.id, openingFloat, status: "OPEN" },
  });
  userId = user.id;
  shiftId = shift.id;
}

/** A completed cash sale on the open shift. */
async function sell(totalCents: number) {
  return db.$transaction(async (tx) => {
    const number = await nextReceiptNumber(tx);
    const order = await tx.order.create({
      data: {
        number,
        shiftId,
        cashierId: userId,
        status: "COMPLETED",
        subtotal: totalCents,
        vatTotal: 0,
        total: totalCents,
        itemCount: 1,
        completedAt: new Date(),
      },
    });
    await tx.orderItem.create({
      data: {
        orderId: order.id,
        productName: "Plat",
        unitPrice: totalCents,
        quantity: 1,
        lineTotal: totalCents,
        vatRate: 10,
      },
    });
    await tx.payment.create({
      data: { orderId: order.id, method: "CASH", amount: totalCents, cashierId: userId },
    });
    return order;
  });
}

async function refund(orderId: string, amount: number) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { refunds: true, payments: true, shift: { select: { id: true, status: true } } },
  });
  return processRefund(
    {
      orderId,
      amount,
      reason: "Test",
      method: "CASH",
      approverId: userId,
      cashierId: userId,
      factice: false,
    },
    order as unknown as Parameters<typeof processRefund>[1],
  );
}

describe("Z report refund totals (M-07)", () => {
  beforeEach(async () => {
    await reset();
  });

  it("reports zero — not null — on a day with no refunds", async () => {
    // The zero case matters most: it is what every normal day produces, and a
    // column that is null on a sealed fiscal document is not a figure.
    await sell(2000);
    const { z } = await generateZReport(shiftId, 12000, userId);
    expect(z.refundsTotal).toBe(0);
    expect(z.refundsCount).toBe(0);
  });

  it("matches the period's refunds in both amount and count", async () => {
    const a = await sell(2000);
    const b = await sell(3000);
    await refund(a.id, 500);
    await refund(b.id, 1200);
    await refund(b.id, 300);

    const report = await computeShiftReport(shiftId);
    expect(report.refundsTotal).toBe(2000);
    expect(report.refundsCount).toBe(3);

    const { z } = await generateZReport(shiftId, 10000, userId);
    expect(z.refundsTotal).toBe(2000);
    expect(z.refundsCount).toBe(3);
  });

  it("distinguishes one large refund from several small ones", async () => {
    // The reason a count is stored and not only a total: these two days have
    // identical money and very different stories.
    const a = await sell(4000);
    await refund(a.id, 4000);
    const { z } = await generateZReport(shiftId, 10000, userId);
    expect(z.refundsTotal).toBe(4000);
    expect(z.refundsCount).toBe(1);
  });

  it("seals the figures into the CLOTURE_Z journal entry", async () => {
    const a = await sell(2500);
    await refund(a.id, 1000);
    const { z } = await generateZReport(shiftId, 10000, userId);

    const ev = await db.fiscalEvent.findFirstOrThrow({
      where: { type: "CLOTURE_Z", zReportId: z.id },
    });
    const payload = JSON.parse(ev.dataJson);
    expect(payload.refundsTotal).toBe(1000);
    expect(payload.refundsCount).toBe(1);
    // And the rest of the payload is untouched.
    expect(payload.zReportNumber).toBe(z.number);
    expect(payload.salesTotal).toBe(z.salesTotal);
  });

  it("counts a fully refunded order's refund even though the sale drops out", async () => {
    // A fully refunded order contributes nothing to salesTotal (C-10), but the
    // money still left the drawer and the correction still happened.
    await sell(2000); // stays a sale
    const b = await sell(1500);
    await refund(b.id, 1500); // b is now fully refunded

    const { z } = await generateZReport(shiftId, 10000, userId);
    expect(z.salesTotal).toBe(2000); // only a
    expect(z.salesCount).toBe(1);
    expect(z.refundsTotal).toBe(1500); // but the refund is still reported
    expect(z.refundsCount).toBe(1);
  });

  it("keeps the drawer arithmetic consistent with the refunds it reports", async () => {
    // Cash refunds physically leave the till, so expectedCash must already
    // net them off. This pins the two figures against each other.
    const a = await sell(5000);
    await refund(a.id, 2000);
    const { z } = await generateZReport(shiftId, 13000, userId);
    expect(z.expectedCash).toBe(10000 + 5000 - 2000);
    expect(z.refundsTotal).toBe(2000);
    expect(z.cashVariance).toBe(0);
  });
});
