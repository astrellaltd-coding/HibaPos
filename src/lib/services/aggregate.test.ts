import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { aggregateOrders, AGGREGATE_INCLUDE, type AggregatableOrder } from "@/lib/services/aggregate";
import { apportion, sum2 } from "@/lib/money";
import { computeShiftReport, generateZReport } from "@/lib/services/reports";
import { closeMonth } from "@/lib/services/fiscal";
import { ensureFiscalCounter } from "@/lib/services/sequence";

// Batch 3.2 — one period aggregation (C-10, C-11, M-13, M-14).
//
// The reconciliation test at the bottom is the point of the batch: a sealed
// MonthlyClose must equal the sum of its own period's ZReport rows. Before
// this batch it could not, because aggregatePeriod summed payments gross while
// computeShiftReport netted refunds off each method — so one refund anywhere in
// the month put the two chains permanently out of step, in a document that by
// design cannot be corrected.

// --------------------------------------------------------------- apportion --

describe("apportion — the parts sum to the whole (M-13)", () => {
  it("distributes a discount across lines with no cent lost or invented", () => {
    // 3 lines, a 10 % discount: independent rounding gives 300+300+300 = 900,
    // one cent short of the 901 the customer was actually charged.
    const lines = [1000, 1000, 1002];
    const target = Math.round((1000 + 1000 + 1002) * 0.9); // 2702
    const parts = apportion(lines, target);
    expect(sum2(parts)).toBe(target);
  });

  it("always sums to the target, for a range of awkward ratios", () => {
    const cases: [number[], number][] = [
      [[333, 333, 334], 999],
      [[100, 100, 100], 99],
      [[1, 1, 1], 2],
      [[590, 150, 350], 1000],
      [[1250], 1063],
      [[700, 300], 1],
      [[1000, 1000], 0],
    ];
    for (const [weights, target] of cases) {
      expect(sum2(apportion(weights, target))).toBe(target);
    }
  });

  it("is deterministic — the same order always splits the same way", () => {
    const weights = [333, 333, 334];
    expect(apportion(weights, 500)).toEqual(apportion(weights, 500));
    // Ties break toward the earlier line.
    expect(apportion([100, 100], 1)).toEqual([1, 0]);
  });

  it("returns zeros when there is nothing to distribute across", () => {
    expect(apportion([], 100)).toEqual([]);
    expect(apportion([0, 0], 100)).toEqual([0, 0]);
  });
});

// ------------------------------------------------------- pure aggregation --

function order(over: Partial<AggregatableOrder> = {}): AggregatableOrder {
  return {
    status: "COMPLETED",
    subtotal: 1000,
    discountTotal: 0,
    total: 1000,
    itemCount: 1,
    items: [{ productName: "Burger", quantity: 1, lineTotal: 1000, vatRate: 10 }],
    payments: [{ method: "CASH", amount: 1000 }],
    refunds: [],
    ...over,
  };
}

describe("aggregateOrders — refunds (C-10)", () => {
  it("nets a partial refund off both sales and the payment method", () => {
    const agg = aggregateOrders([
      order({ refunds: [{ method: "CASH", amount: 300 }] }),
    ]);
    expect(agg.salesTotal).toBe(700);
    expect(agg.salesCount).toBe(1);
    expect(agg.grossCashTotal).toBe(1000);
    expect(agg.cashRefundsTotal).toBe(300);
    expect(agg.cashTotal).toBe(700);
    expect(agg.totalRefunded).toBe(300);
  });

  it("drops a fully refunded order from sales but keeps its payment AND its refund", () => {
    // This is the C-10 defect in miniature: dropping the order while keeping
    // the payment left the money in cashTotal with nothing to cancel it.
    const agg = aggregateOrders([
      order({ status: "REFUNDED", refunds: [{ method: "CASH", amount: 1000 }] }),
    ]);
    expect(agg.salesTotal).toBe(0);
    expect(agg.salesCount).toBe(0);
    expect(agg.cashTotal).toBe(0); // 1000 taken, 1000 given back
    expect(agg.totalRefunded).toBe(1000);
  });

  it("refunds each method against its own takings", () => {
    const agg = aggregateOrders([
      order({
        payments: [{ method: "CARD", amount: 1000 }],
        refunds: [{ method: "CARD", amount: 400 }],
      }),
    ]);
    expect(agg.cardTotal).toBe(600);
    expect(agg.cashTotal).toBe(0);
  });

  it("treats a refund with no method as cash, as it was before the column existed", () => {
    const agg = aggregateOrders([
      order({ refunds: [{ method: null, amount: 250 }] }),
    ]);
    expect(agg.cashRefundsTotal).toBe(250);
    expect(agg.cashTotal).toBe(750);
  });
});

describe("aggregateOrders — integer cents everywhere (C-11)", () => {
  it("keeps a pro-rated line an integer, where round2 left a half-cent", () => {
    // The audit's example: round2(1250 × 0.85) = 1062.5.
    const agg = aggregateOrders([
      order({
        subtotal: 1250,
        total: 1250,
        items: [{ productName: "X", quantity: 1, lineTotal: 1250, vatRate: 10 }],
        payments: [{ method: "CASH", amount: 1250 }],
        refunds: [{ method: "CASH", amount: 187 }],
      }),
    ]);
    for (const v of Object.values(agg.vatBreakdown)) {
      expect(Number.isInteger(v.ht)).toBe(true);
      expect(Number.isInteger(v.vat)).toBe(true);
      expect(Number.isInteger(v.ttc)).toBe(true);
    }
    expect(Number.isInteger(agg.salesTotal)).toBe(true);
    expect(Number.isInteger(agg.vatTotal)).toBe(true);
  });

  it("makes the VAT breakdown add up to salesTotal exactly", () => {
    const agg = aggregateOrders([
      order({
        subtotal: 1090,
        total: 1000,
        discountTotal: 90,
        itemCount: 3,
        items: [
          { productName: "A", quantity: 1, lineTotal: 333, vatRate: 10 },
          { productName: "B", quantity: 1, lineTotal: 333, vatRate: 5.5 },
          { productName: "C", quantity: 1, lineTotal: 424, vatRate: 20 },
        ],
        payments: [{ method: "CASH", amount: 1000 }],
      }),
    ]);
    const breakdownTtc = sum2(Object.values(agg.vatBreakdown).map((v) => v.ttc));
    expect(breakdownTtc).toBe(agg.salesTotal);
    expect(agg.salesTotal).toBe(1000);
  });
});

// ------------------------------------------------------------ reconciliation

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.monthlyClose.deleteMany();
  await db.zReport.deleteMany();
  await db.refund.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.user.deleteMany();
  await db.setting.deleteMany();
  await db.fiscalCounter.deleteMany();
  await ensureFiscalCounter();
}

describe("a sealed MonthlyClose equals the sum of its ZReports (C-10)", () => {
  beforeEach(wipe);

  it("reconciles field by field across a month containing a full and a partial refund", async () => {
    const user = await db.user.create({
      data: { username: "recon", name: "Recon", role: "MANAGER", pinHash: "x:y" },
    });

    // Two shifts inside one month, each closed with a Z report.
    const when = (day: number) => new Date(2026, 3, day, 12, 0, 0); // April 2026
    const shiftIds: string[] = [];

    for (const [idx, day] of [4, 11].entries()) {
      const shift = await db.shift.create({
        data: {
          number: 100 + idx,
          openedById: user.id,
          openingFloat: 5000,
          status: "OPEN",
          openedAt: when(day),
        },
      });
      shiftIds.push(shift.id);

      // A plain sale.
      await db.order.create({
        data: {
          number: 1000 + idx * 10, shiftId: shift.id, cashierId: user.id, status: "COMPLETED",
          subtotal: 2000, discountTotal: 0, total: 2000, vatTotal: 182, itemCount: 2,
          createdAt: when(day), completedAt: when(day),
          items: { create: [
            { productName: "Burger", quantity: 1, lineTotal: 1200, vatRate: 10, unitPrice: 1200 },
            { productName: "Coca", quantity: 1, lineTotal: 800, vatRate: 5.5, unitPrice: 800 },
          ] },
          payments: { create: [{ method: "CASH", amount: 2000, cashierId: user.id }] },
        },
      });

      // A PARTIALLY refunded sale — the case that used to break the close.
      const partial = await db.order.create({
        data: {
          number: 1001 + idx * 10, shiftId: shift.id, cashierId: user.id, status: "COMPLETED",
          subtotal: 1500, discountTotal: 0, total: 1500, vatTotal: 136, itemCount: 1,
          createdAt: when(day), completedAt: when(day),
          items: { create: [{ productName: "Tacos", quantity: 1, lineTotal: 1500, vatRate: 10, unitPrice: 1500 }] },
          payments: { create: [{ method: "CARD", amount: 1500, cashierId: user.id }] },
        },
      });
      await db.refund.create({
        data: { orderId: partial.id, amount: 500, method: "CARD", reason: "partiel", cashierId: user.id, createdAt: when(day) },
      });

      // A FULLY refunded sale — payment and refund must cancel, not linger.
      const full = await db.order.create({
        data: {
          number: 1002 + idx * 10, shiftId: shift.id, cashierId: user.id, status: "REFUNDED",
          subtotal: 900, discountTotal: 0, total: 900, vatTotal: 82, itemCount: 1,
          createdAt: when(day), completedAt: when(day),
          items: { create: [{ productName: "Frite", quantity: 1, lineTotal: 900, vatRate: 10, unitPrice: 900 }] },
          payments: { create: [{ method: "CASH", amount: 900, cashierId: user.id }] },
        },
      });
      await db.refund.create({
        data: { orderId: full.id, amount: 900, method: "CASH", reason: "annulation", cashierId: user.id, createdAt: when(day) },
      });

      await generateZReport(shift.id, 5000, user.id);
    }

    const zReports = await db.zReport.findMany({ orderBy: { number: "asc" } });
    expect(zReports).toHaveLength(2);

    // L-25 (Batch 3.6b): a month is only sealable once it has ended, so the
    // clock is pinned just past April rather than left to the real one.
    const close = await closeMonth(2026, 4, user.id, false, new Date(2026, 4, 1));

    // The whole point: field by field, the close equals the sum of its Zs.
    const zSum = (pick: (z: (typeof zReports)[number]) => number) =>
      zReports.reduce((acc, z) => acc + pick(z), 0);

    expect(close.salesTotal).toBe(zSum((z) => z.salesTotal));
    expect(close.salesCount).toBe(zSum((z) => z.salesCount));
    expect(close.vatTotal).toBe(zSum((z) => z.vatTotal));
    expect(close.cashTotal).toBe(zSum((z) => z.cashTotal));
    expect(close.cardTotal).toBe(zSum((z) => z.cardTotal));
    expect(close.voucherTotal).toBe(zSum((z) => z.voucherTotal));
    expect(close.discountsTotal).toBe(zSum((z) => z.discountsTotal));

    // And the figures are the ones we can compute by hand:
    //   per shift: 2000 sale + 1000 net of the partial (1500 − 500) = 3000
    //   cash: 2000 + 900 taken − 900 refunded = 2000
    //   card: 1500 taken − 500 refunded = 1000
    expect(close.salesTotal).toBe(6000);
    expect(close.cashTotal).toBe(4000);
    expect(close.cardTotal).toBe(2000);
    expect(close.salesCount).toBe(4); // 2 per shift; the full refund does not count

    // The VAT breakdown must reconcile too, rate by rate.
    const closeBreakdown = JSON.parse(close.vatBreakdownJson) as Record<string, { ttc: number }>;
    const zBreakdownTtc: Record<string, number> = {};
    for (const z of zReports) {
      for (const [rate, v] of Object.entries(JSON.parse(z.vatBreakdownJson ?? "{}") as Record<string, { ttc: number }>)) {
        zBreakdownTtc[rate] = (zBreakdownTtc[rate] ?? 0) + v.ttc;
      }
    }
    for (const [rate, v] of Object.entries(closeBreakdown)) {
      expect(v.ttc).toBe(zBreakdownTtc[rate]);
    }
    expect(Object.keys(closeBreakdown).sort()).toEqual(["10", "5.5"]);
  });
});

describe("the shift report and the raw aggregation agree (M-14)", () => {
  beforeEach(wipe);

  it("gives the same figures through computeShiftReport and aggregateOrders", async () => {
    const user = await db.user.create({
      data: { username: "m14", name: "M14", role: "CASHIER", pinHash: "x:y" },
    });
    const shift = await db.shift.create({
      data: { number: 200, openedById: user.id, openingFloat: 1000, status: "OPEN" },
    });
    const o = await db.order.create({
      data: {
        number: 2000, shiftId: shift.id, cashierId: user.id, status: "COMPLETED",
        subtotal: 1000, discountTotal: 0, total: 1000, vatTotal: 91, itemCount: 1,
        completedAt: new Date(),
        items: { create: [{ productName: "Burger", quantity: 1, lineTotal: 1000, vatRate: 10, unitPrice: 1000 }] },
        payments: { create: [{ method: "CASH", amount: 1000, cashierId: user.id }] },
      },
    });
    await db.refund.create({
      data: { orderId: o.id, amount: 200, method: "CASH", reason: "geste", cashierId: user.id },
    });

    const report = await computeShiftReport(shift.id);
    const raw = await db.order.findMany({ where: { shiftId: shift.id }, include: AGGREGATE_INCLUDE });
    const agg = aggregateOrders(raw);

    expect(report.salesTotal).toBe(agg.salesTotal);
    expect(report.cashTotal).toBe(agg.cashTotal);
    expect(report.vatTotal).toBe(agg.vatTotal);
    // The drawer holds the float plus cash taken less cash handed back.
    expect(report.expectedCash).toBe(1000 + 1000 - 200);
  });
});

describe("every report agrees for the same period (C-11)", () => {
  beforeEach(wipe);

  it("the VAT report, the Z report and the close see one set of figures", async () => {
    const user = await db.user.create({
      data: { username: "c11", name: "C11", role: "MANAGER", pinHash: "x:y" },
    });
    const shift = await db.shift.create({
      data: { number: 300, openedById: user.id, openingFloat: 0, status: "OPEN" },
    });
    // A partially refunded, multi-rate order — the case where the old routes
    // each produced a different answer.
    const o = await db.order.create({
      data: {
        number: 3000, shiftId: shift.id, cashierId: user.id, status: "COMPLETED",
        subtotal: 1250, discountTotal: 0, total: 1250, vatTotal: 0, itemCount: 2,
        completedAt: new Date(),
        items: { create: [
          { productName: "Tacos", quantity: 1, lineTotal: 900, vatRate: 10, unitPrice: 900 },
          { productName: "Coca", quantity: 1, lineTotal: 350, vatRate: 5.5, unitPrice: 350 },
        ] },
        payments: { create: [{ method: "CASH", amount: 1250, cashierId: user.id }] },
      },
    });
    await db.refund.create({
      data: { orderId: o.id, amount: 187, method: "CASH", reason: "partiel", cashierId: user.id },
    });

    const orders = await db.order.findMany({ where: { shiftId: shift.id }, include: AGGREGATE_INCLUDE });
    // What /api/reports/vat now computes.
    const vatRouteAgg = aggregateOrders(orders);
    // What the Z report computes.
    const zReport = await computeShiftReport(shift.id);

    expect(zReport.vatBreakdown).toEqual(vatRouteAgg.vatBreakdown);
    expect(zReport.vatTotal).toBe(vatRouteAgg.vatTotal);
    expect(zReport.salesTotal).toBe(vatRouteAgg.salesTotal);

    // Integer cents throughout — round2() used to leave a half-cent here.
    for (const v of Object.values(zReport.vatBreakdown)) {
      expect(Number.isInteger(v.ht) && Number.isInteger(v.vat) && Number.isInteger(v.ttc)).toBe(true);
    }
    // And the breakdown ties back to the money actually taken.
    expect(sum2(Object.values(zReport.vatBreakdown).map((v) => v.ttc))).toBe(1250 - 187);
  });

  it("the sales report nets a partial refund instead of overstating revenue", async () => {
    const user = await db.user.create({
      data: { username: "sales", name: "Sales", role: "MANAGER", pinHash: "x:y" },
    });
    const shift = await db.shift.create({
      data: { number: 301, openedById: user.id, openingFloat: 0, status: "OPEN" },
    });
    const o = await db.order.create({
      data: {
        number: 3001, shiftId: shift.id, cashierId: user.id, status: "COMPLETED",
        subtotal: 2000, discountTotal: 0, total: 2000, vatTotal: 0, itemCount: 1,
        completedAt: new Date(),
        items: { create: [{ productName: "Menu", quantity: 1, lineTotal: 2000, vatRate: 10, unitPrice: 2000 }] },
        payments: { create: [{ method: "CASH", amount: 2000, cashierId: user.id }] },
      },
    });
    await db.refund.create({
      data: { orderId: o.id, amount: 750, method: "CASH", reason: "partiel", cashierId: user.id },
    });

    const orders = await db.order.findMany({ where: { shiftId: shift.id }, include: AGGREGATE_INCLUDE });
    const agg = aggregateOrders(orders, { topProductsLimit: 15, createdAtOf: (x) => x.createdAt });

    // The old route filtered to COMPLETED and summed o.total at face value:
    // it would have reported 2000 where the customer kept only 1250 of goods.
    expect(agg.salesTotal).toBe(1250);
    expect(agg.cashTotal).toBe(1250);
    expect(agg.totalRefunded).toBe(750);
    expect(agg.byDay).toHaveLength(1);
    expect(agg.byDay[0].sales).toBe(1250);
  });
});

describe("M-13 — a multi-line order with an awkward discount", () => {
  it("splits the discount so the lines sum to total minus discount", () => {
    // 7 % off three uneven lines: independent rounding drifts, apportion does not.
    const lines = [333, 333, 334];
    const subtotal = sum2(lines);
    const discount = Math.round(subtotal * 0.07);
    const target = subtotal - discount;
    const parts = apportion(lines, target);
    expect(sum2(parts)).toBe(target);
    // The old approach, for contrast — it need not land on the target.
    const oldWay = lines.map((l) => Math.round(l * (1 - discount / subtotal)));
    expect(sum2(parts)).toBe(target);
    expect(Math.abs(sum2(oldWay) - target)).toBeLessThanOrEqual(2);
  });
});
