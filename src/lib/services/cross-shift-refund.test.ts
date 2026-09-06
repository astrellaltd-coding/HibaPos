import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import {
  processRefund,
  RefundError,
  NO_OPEN_SHIFT_FOR_REFUND_MESSAGE,
} from "@/lib/services/refund";
import { computeShiftReport, generateZReport } from "@/lib/services/reports";
import { closeMonth, verifyFiscalChain } from "@/lib/services/fiscal";
import { aggregateOrders, AGGREGATE_INCLUDE, periodOrdersWhere, periodAggregateOptions } from "@/lib/services/aggregate";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { splitVat } from "@/lib/money";

// C-14 / DD-10 (Batch 5.3) — a refund for a previous day's sale.
//
// THE FINDING. The refund route refused any order whose shift was `CLOSED`, so
// a customer returning the next day could not be refunded through the POS at
// all. The workaround an operator reaches for — cash out of the drawer with no
// record — is precisely the untraced correction the fiscal journal exists to
// prevent. Since Batch 4.7 the refusal lived in two places, and the decisive
// one was inside the refund transaction.
//
// THE ANSWER (operator, 2026-09-05). Allow it, attributed to the CURRENT open
// till: the money comes out of today's drawer and lands in today's expected
// cash, and the original shift's sealed Z report is never touched.
//
// WHY LIFTING THE TWO REFUSALS WOULD HAVE LOST MONEY SILENTLY. `aggregate.ts`
// built a period's refunds as `orders.flatMap((o) => o.refunds)` while
// `computeShiftReport` selected orders by `shiftId` — so a refund was counted
// by the shift that owned the refunded ORDER, never by the shift that paid the
// cash out. Yesterday's shift is sealed and cannot absorb it; today's report
// never selected that order; so the drawer was down with no report accounting
// for it, which is C-02's cash-variance figure made untrustworthy again. The
// tests below therefore pin the REPORTING as hard as the refusal.
//
// WHAT MAKES THE ARITHMETIC RECONCILE. A period books the sales of its own
// orders and the corrections it issued. An order refunded by a LATER period
// contributes to that period the DIFFERENCE between its state before and
// after, so the periods telescope and a month still equals the sum of the Z
// reports inside it. Two traps live in that difference and both are tested:
// the VAT of a correction is the difference of the splits and not the split of
// the difference (they disagree by a cent), and `Order.status` is current
// state and cannot be asked what a past period looked like.

const APRIL = (day: number, hour = 12) => new Date(2026, 3, day, hour, 0, 0);
const MAY = (day: number, hour = 12) => new Date(2026, 4, day, hour, 0, 0);

let userId: string;

/** Every table this file writes, in dependency order. Run before each test AND
 *  at the end: the whole run shares one database (test-setup.ts), so a row left
 *  behind here fails another file for reasons that have nothing to do with it
 *  (L-40). */
async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.monthlyClose.deleteMany();
  await db.annualClose.deleteMany();
  await db.zReport.deleteMany();
  await db.refund.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
}

async function reset() {
  await wipe();
  await ensureFiscalCounter();
  const user = await db.user.create({
    data: {
      username: `c14-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: "x:y",
    },
  });
  userId = user.id;
}

async function openShift(number: number, openedAt: Date, openingFloat = 10000) {
  return db.shift.create({
    data: { number, openedById: userId, openedAt, openingFloat, status: "OPEN" },
  });
}

/** One completed cash sale, one line, 10 % VAT. */
async function sell(
  shiftId: string,
  number: number,
  total: number,
  when: Date,
  method: "CASH" | "CARD" = "CASH",
) {
  return db.order.create({
    data: {
      number,
      shiftId,
      cashierId: userId,
      status: "COMPLETED",
      subtotal: total,
      discountTotal: 0,
      total,
      vatTotal: 0,
      itemCount: 1,
      createdAt: when,
      completedAt: when,
      items: {
        create: [{ productName: "Tacos", quantity: 1, lineTotal: total, vatRate: 10, unitPrice: total }],
      },
      payments: { create: [{ method, amount: total, cashierId: userId }] },
    },
  });
}

/** The shape the route hands `processRefund`, built from the stored order. */
async function refundInput(orderId: string) {
  const o = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { refunds: true },
  });
  return {
    id: o.id,
    number: o.number,
    total: o.total,
    status: o.status as "COMPLETED" | "REFUNDED",
    orderType: o.orderType as "DINE_IN" | "TAKEAWAY" | "LIVRAISON",
    tableLabel: o.tableLabel,
    refunds: o.refunds.map((r) => ({ amount: r.amount })),
  };
}

/**
 * A refund through the real service, optionally dated.
 *
 * `at` backdates the stored row, and it is a faithfulness fix rather than a
 * convenience: these fixtures put their shifts and orders on a April/May
 * timeline while `Refund.createdAt` defaults to the wall clock, and a refund
 * that the application recorded months before the till that paid it opened is
 * not a state it can produce. Supply it wherever a test asks a DATE-scoped
 * question, or asks a shift to place a refund an earlier shift issued.
 */
async function refund(
  orderId: string,
  amount: number,
  opts: { method?: "CASH" | "CARD"; at?: Date } = {},
) {
  const result = await processRefund(
    {
      orderId,
      amount,
      reason: "Client revenu le lendemain",
      method: opts.method ?? "CASH",
      approverId: userId,
      cashierId: userId,
      factice: false,
    },
    await refundInput(orderId),
  );
  if (opts.at) {
    await db.refund.update({ where: { id: result.refundId }, data: { createdAt: opts.at } });
  }
  return result;
}

/** Yesterday's shift, sealed; today's shift, open. Returns both and the sale. */
async function yesterdaySealedTodayOpen(saleTotal = 5000) {
  const yesterday = await openShift(1, APRIL(4, 9));
  const sale = await sell(yesterday.id, 1001, saleTotal, APRIL(4, 12));
  const { z } = await generateZReport(yesterday.id, 10000 + saleTotal, userId);
  const today = await openShift(2, APRIL(5, 9));
  return { yesterday, today, sale, z };
}

describe("C-14 — yesterday's order can be refunded, out of today's till", () => {
  beforeEach(reset);
  afterAll(wipe);

  it("accepts a refund for an order whose shift is CLOSED", async () => {
    const { sale } = await yesterdaySealedTodayOpen();
    const result = await refund(sale.id, 2000);
    expect(result.totalRefunded).toBe(2000);
    expect(result.fullyRefunded).toBe(false);
  });

  it("attributes the refund to the till that is open, not the till that sold", async () => {
    // `Refund.shiftId` is the column the whole reporting change turns on, and
    // it used to be written with `order.shift?.id`. Settled here.
    const { yesterday, today, sale } = await yesterdaySealedTodayOpen();
    const result = await refund(sale.id, 2000);

    const row = await db.refund.findUniqueOrThrow({ where: { id: result.refundId } });
    expect(row.shiftId).toBe(today.id);
    expect(row.shiftId).not.toBe(yesterday.id);
  });

  it("refuses when no caisse is open — the cash would have nowhere to land", async () => {
    const yesterday = await openShift(1, APRIL(4, 9));
    const sale = await sell(yesterday.id, 1001, 5000, APRIL(4, 12));
    await generateZReport(yesterday.id, 15000, userId);
    // No second shift opened: the whole point of the refusal that replaced the
    // old one. Allowing this would put cash out of a drawer no report owns.
    const err = await refund(sale.id, 2000).catch((e) => e);

    expect(err).toBeInstanceOf(RefundError);
    expect((err as RefundError).status).toBe(409);
    expect((err as Error).message).toBe(NO_OPEN_SHIFT_FOR_REFUND_MESSAGE);
    expect(await db.refund.count()).toBe(0);
    expect(await db.fiscalEvent.count({ where: { type: "REMBOURSEMENT" } })).toBe(0);
  });

  it("still names the paying till when the refund is same-shift, as it always was", async () => {
    // The common case must not have moved. Here the two answers coincide, and
    // that is exactly why the old code looked correct for two years.
    const shift = await openShift(1, APRIL(4, 9));
    const sale = await sell(shift.id, 1001, 4000, APRIL(4, 12));
    const result = await refund(sale.id, 1000);
    const row = await db.refund.findUniqueOrThrow({ where: { id: result.refundId } });
    expect(row.shiftId).toBe(shift.id);
  });

  it("chains the REMBOURSEMENT event and carries yesterday's ticket number", async () => {
    const { sale } = await yesterdaySealedTodayOpen();
    await refund(sale.id, 2000);

    const chain = await verifyFiscalChain();
    expect(chain.ok).toBe(true);

    const ev = await db.fiscalEvent.findFirstOrThrow({
      where: { type: "REMBOURSEMENT", orderId: sale.id },
    });
    expect(JSON.parse(ev.dataJson).orderNumber).toBe(sale.number);
  });
});

describe("C-14 — the cash lands in the drawer that paid it", () => {
  beforeEach(reset);
  afterAll(wipe);

  it("takes the refund out of TODAY's expected cash", async () => {
    const { today, sale } = await yesterdaySealedTodayOpen(5000);
    await sell(today.id, 1002, 3000, APRIL(5, 12));
    await refund(sale.id, 2000);

    const report = await computeShiftReport(today.id);
    // Float 10000, took 3000 today, handed 2000 back over the counter.
    expect(report.expectedCash).toBe(10000 + 3000 - 2000);
    expect(report.refundsTotal).toBe(2000);
    expect(report.refundsCount).toBe(1);
    // Net cash and net sales agree: today sold 3000 and gave 2000 back.
    expect(report.cashTotal).toBe(1000);
    expect(report.salesTotal).toBe(1000);
  });

  it("leaves YESTERDAY's expected cash exactly where the seal left it", async () => {
    const { yesterday, today, sale, z } = await yesterdaySealedTodayOpen(5000);
    await sell(today.id, 1002, 3000, APRIL(5, 12));
    await refund(sale.id, 2000);

    const report = await computeShiftReport(yesterday.id);
    expect(report.expectedCash).toBe(z.expectedCash);
    expect(report.refundsTotal).toBe(0);
    expect(report.refundsCount).toBe(0);
  });

  it("puts the money in exactly one drawer, never both and never neither", async () => {
    const { yesterday, today, sale } = await yesterdaySealedTodayOpen(5000);
    await sell(today.id, 1002, 3000, APRIL(5, 12));
    await refund(sale.id, 2000);

    const a = await computeShiftReport(yesterday.id);
    const b = await computeShiftReport(today.id);
    expect(a.refundsTotal + b.refundsTotal).toBe(2000);
    expect(a.refundsCount + b.refundsCount).toBe(1);
  });

  it("does not let the refunded order's payment leak into today's takings", async () => {
    // Today's report must now SELECT yesterday's order to see the refund. If it
    // aggregated that order whole, yesterday's 5000 would be counted twice.
    const { today, sale } = await yesterdaySealedTodayOpen(5000);
    await sell(today.id, 1002, 3000, APRIL(5, 12));
    await refund(sale.id, 2000);

    const report = await computeShiftReport(today.id);
    expect(report.salesCount).toBe(1); // today sold one ticket, not two
    expect(report.expectedCash).toBe(11000);
  });
});

describe("C-14 — the sealed Z report is never touched", () => {
  beforeEach(reset);
  afterAll(wipe);

  it("leaves every stored column of the sealed Z as it was", async () => {
    const { sale, z } = await yesterdaySealedTodayOpen(5000);
    // Read the STORED row, not the one `generateZReport` returned: the seal is
    // finished a statement later, when the CLOTURE_Z event id is written back
    // onto it, so the returned object still carries `fiscalEventId: null`.
    const before = await db.zReport.findUniqueOrThrow({ where: { id: z.id } });
    await refund(sale.id, 2000);
    const after = await db.zReport.findUniqueOrThrow({ where: { id: z.id } });
    expect(after).toEqual(before);
  });

  it("recomputes the closed shift to the same figures after a FULL cross-shift refund", async () => {
    // The harder half, and the one a naive implementation fails. A full refund
    // flips `Order.status` to `REFUNDED`; asking a CURRENT status field what a
    // PAST period looked like drops yesterday's sale out of yesterday's report
    // — which then contradicts the immutable document beside it.
    const { yesterday, sale, z } = await yesterdaySealedTodayOpen(5000);
    await refund(sale.id, 5000);

    expect(
      (await db.order.findUniqueOrThrow({ where: { id: sale.id } })).status,
    ).toBe("REFUNDED");

    const report = await computeShiftReport(yesterday.id);
    expect(report.salesTotal).toBe(z.salesTotal);
    expect(report.salesCount).toBe(z.salesCount);
    expect(report.vatTotal).toBe(z.vatTotal);
    expect(report.cashTotal).toBe(z.cashTotal);
    expect(report.expectedCash).toBe(z.expectedCash);
    expect(report.refundsTotal).toBe(0);
    expect(JSON.stringify(report.vatBreakdown)).toBe(z.vatBreakdownJson);
  });

  it("books the whole of a full cross-shift refund against today", async () => {
    const { today, sale } = await yesterdaySealedTodayOpen(5000);
    await sell(today.id, 1002, 8000, APRIL(5, 12));
    await refund(sale.id, 5000);

    const report = await computeShiftReport(today.id);
    expect(report.salesTotal).toBe(8000 - 5000);
    // One sale today, and one earlier sale undone: the count is net.
    expect(report.salesCount).toBe(0);
    expect(report.expectedCash).toBe(10000 + 8000 - 5000);
  });
});

describe("C-14 — a month still equals the sum of its Z reports (Batch 3.2)", () => {
  beforeEach(reset);
  afterAll(wipe);

  /** April: a sale in shift 1, a sale in shift 2, and shift 2 refunds shift 1. */
  async function aprilWithACrossShiftRefund() {
    const one = await openShift(1, APRIL(4, 9));
    const saleOne = await sell(one.id, 1001, 2000, APRIL(4, 12));
    await generateZReport(one.id, 12000, userId);

    const two = await openShift(2, APRIL(5, 9));
    await sell(two.id, 1002, 3500, APRIL(5, 12), "CARD");
    await refund(saleOne.id, 500, { at: APRIL(5, 14) });
    await generateZReport(two.id, 10000 - 500, userId);

    return { one, two, saleOne };
  }

  it("reconciles field by field with a refund that crossed a shift boundary", async () => {
    await aprilWithACrossShiftRefund();
    const zs = await db.zReport.findMany({ orderBy: { number: "asc" } });
    expect(zs).toHaveLength(2);

    const close = await closeMonth(2026, 4, userId, false, MAY(1));
    const zSum = (pick: (z: (typeof zs)[number]) => number) =>
      zs.reduce((acc, z) => acc + pick(z), 0);

    expect(close.salesTotal).toBe(zSum((z) => z.salesTotal));
    expect(close.salesCount).toBe(zSum((z) => z.salesCount));
    expect(close.vatTotal).toBe(zSum((z) => z.vatTotal));
    expect(close.cashTotal).toBe(zSum((z) => z.cashTotal));
    expect(close.cardTotal).toBe(zSum((z) => z.cardTotal));
    expect(close.voucherTotal).toBe(zSum((z) => z.voucherTotal));
    expect(close.discountsTotal).toBe(zSum((z) => z.discountsTotal));
    expect(close.refundsTotal).toBe(zSum((z) => z.refundsTotal));
    expect(close.refundsCount).toBe(zSum((z) => z.refundsCount));

    // And the figures by hand: 2000 sold, 3500 sold, 500 given back.
    expect(close.salesTotal).toBe(5000);
    expect(close.cashTotal).toBe(2000 - 500);
    expect(close.cardTotal).toBe(3500);
  });

  it("reconciles the VAT rate by rate, to the cent", async () => {
    // THE ONE-CENT TRAP. `splitVat(1500) - splitVat(2000)` is `(-454, -46)`
    // while `splitVat(-500)` is `(-455, -45)`: the split of a difference is not
    // the difference of the splits. Booking the correction the second way puts
    // the month a cent away from the sum of the very Z reports it contains — a
    // sealed document that cannot be corrected, which is C-10 in a new place.
    await aprilWithACrossShiftRefund();
    const zs = await db.zReport.findMany({ orderBy: { number: "asc" } });
    const close = await closeMonth(2026, 4, userId, false, MAY(1));

    const zTtc: Record<string, number> = {};
    const zVat: Record<string, number> = {};
    for (const z of zs) {
      for (const [rate, v] of Object.entries(
        JSON.parse(z.vatBreakdownJson ?? "{}") as Record<string, { vat: number; ttc: number }>,
      )) {
        zTtc[rate] = (zTtc[rate] ?? 0) + v.ttc;
        zVat[rate] = (zVat[rate] ?? 0) + v.vat;
      }
    }
    const closeBreakdown = JSON.parse(close.vatBreakdownJson) as Record<
      string,
      { vat: number; ttc: number }
    >;
    for (const [rate, v] of Object.entries(closeBreakdown)) {
      expect(v.ttc).toBe(zTtc[rate]);
      expect(v.vat).toBe(zVat[rate]);
    }

    // Stated as figures too, so the trap is documented and not merely avoided:
    // the correcting Z carries -46 of VAT, the amount that makes the two sides
    // meet, and NOT the -45 that splitting the difference would have given.
    expect(zs[1].vatTotal).toBe(
      splitVat(3500, 10).vat + (splitVat(1500, 10).vat - splitVat(2000, 10).vat),
    );
    expect(splitVat(1500, 10).vat - splitVat(2000, 10).vat).toBe(-46);
    expect(splitVat(-500, 10).vat).toBe(-45);
  });

  it("does not reopen a month that has already been sealed", async () => {
    // April sold it, May gives it back. April's close is computed AFTER the
    // refund exists and must not see it; May's carries the correction. Before
    // this batch the close keyed refunds on the SALE's date, so April would
    // have absorbed a refund it never paid — in a document already sealed on
    // any real timeline.
    const april = await openShift(1, APRIL(4, 9));
    const saleOne = await sell(april.id, 1001, 2000, APRIL(4, 12));
    const { z: aprilZ } = await generateZReport(april.id, 12000, userId);

    const may = await openShift(2, MAY(2, 9));
    await sell(may.id, 1002, 3000, MAY(2, 12));
    await refund(saleOne.id, 800, { at: MAY(2, 14) });
    const { z: mayZ } = await generateZReport(may.id, 10000 + 3000 - 800, userId);

    const aprilClose = await closeMonth(2026, 4, userId, false, MAY(1));
    // AMENDED 2026-09-06 (Batch 3.8, DD-24): the month now ends at the
    // trading-day cut-off, so midnight on the 1st is five hours early.
    const mayClose = await closeMonth(2026, 5, userId, false, new Date(2026, 5, 1, 6, 0));

    // April is exactly its own Z: untouched by a correction it never issued.
    expect(aprilClose.salesTotal).toBe(aprilZ.salesTotal);
    expect(aprilClose.salesTotal).toBe(2000);
    expect(aprilClose.refundsTotal).toBe(0);
    expect(aprilClose.cashTotal).toBe(2000);

    // May carries it, and equals its own Z.
    expect(mayClose.salesTotal).toBe(mayZ.salesTotal);
    expect(mayClose.salesTotal).toBe(3000 - 800);
    expect(mayClose.refundsTotal).toBe(800);
    expect(mayClose.refundsCount).toBe(1);
    expect(mayClose.cashTotal).toBe(3000 - 800);
  });

  it("keeps the VAT report on the same period scope as the close", async () => {
    // C-11's rule: the figure a manager files the TVA declaration from must not
    // disagree with the sealed close for the same period.
    await aprilWithACrossShiftRefund();
    const from = APRIL(1, 0);
    const to = MAY(1, 0);
    const orders = await db.order.findMany({
      where: periodOrdersWhere(from, to),
      include: AGGREGATE_INCLUDE,
    });
    const vatRoute = aggregateOrders(orders, periodAggregateOptions(from, to));
    const close = await closeMonth(2026, 4, userId, false, MAY(1));

    expect(vatRoute.vatTotal).toBe(close.vatTotal);
    expect(vatRoute.salesTotal).toBe(close.salesTotal);
    expect(JSON.stringify(vatRoute.vatBreakdown)).toBe(close.vatBreakdownJson);
  });
});

describe("C-14 — what the aggregation does with the awkward cases", () => {
  beforeEach(reset);
  afterAll(wipe);

  it("attributes a refund carrying no shift to NO shift, rather than to the order's", async () => {
    // The deliberate non-fallback. `processRefund` cannot write one — the test
    // above proves it refuses without an open caisse — so this pins the rule a
    // future change could quietly undo: a shift-less refund must not drift back
    // to the till that took the sale, which is the attribution C-14 removed. It
    // stays visible instead, in the reconciliation between a Z and its close.
    const shift = await openShift(1, APRIL(4, 9));
    const sale = await sell(shift.id, 1001, 2000, APRIL(4, 12));
    await db.refund.create({
      data: {
        orderId: sale.id,
        amount: 700,
        reason: "ligne sans caisse",
        cashierId: userId,
        method: "CASH",
        shiftId: null,
        createdAt: APRIL(4, 13),
      },
    });

    const report = await computeShiftReport(shift.id);
    expect(report.refundsTotal).toBe(0);
    expect(report.salesTotal).toBe(2000);

    // The date-scoped period does see it — which is what makes the gap loud.
    const from = APRIL(1, 0);
    const to = MAY(1, 0);
    const orders = await db.order.findMany({
      where: periodOrdersWhere(from, to),
      include: AGGREGATE_INCLUDE,
    });
    expect(aggregateOrders(orders, periodAggregateOptions(from, to)).totalRefunded).toBe(700);
  });

  it("moves a product's revenue on a correction but never its quantity", async () => {
    const { today, sale } = await yesterdaySealedTodayOpen(5000);
    await sell(today.id, 1002, 3000, APRIL(5, 12));
    await refund(sale.id, 2000);

    const report = await computeShiftReport(today.id);
    const tacos = report.topProducts.find((p) => p.name === "Tacos");
    expect(tacos).toBeDefined();
    // One sold today; yesterday's ticket was corrected, not un-sold.
    expect(tacos!.quantity).toBe(1);
    expect(tacos!.total).toBe(3000 - 2000);
  });

  it("nets two corrections issued by two different later shifts", async () => {
    // Three periods touching one order, so the telescoping is exercised rather
    // than assumed: the third shift's baseline is the second shift's result.
    const one = await openShift(1, APRIL(4, 9));
    const sale = await sell(one.id, 1001, 6000, APRIL(4, 12));
    await generateZReport(one.id, 16000, userId);

    const two = await openShift(2, APRIL(5, 9));
    await refund(sale.id, 1000, { at: APRIL(5, 14) });
    await generateZReport(two.id, 10000 - 1000, userId);

    const three = await openShift(3, APRIL(6, 9));
    await refund(sale.id, 5000, { at: APRIL(6, 14) }); // now fully refunded
    await generateZReport(three.id, 10000 - 5000, userId);

    const zs = await db.zReport.findMany({ orderBy: { number: "asc" } });
    expect(zs.map((z) => z.salesTotal)).toEqual([6000, -1000, -5000]);
    expect(zs.map((z) => z.salesCount)).toEqual([1, 0, -1]);
    expect(zs.map((z) => z.refundsTotal)).toEqual([0, 1000, 5000]);

    const close = await closeMonth(2026, 4, userId, false, MAY(1));
    expect(close.salesTotal).toBe(0);
    expect(close.salesCount).toBe(0);
    expect(close.vatTotal).toBe(zs.reduce((a, z) => a + z.vatTotal, 0));
    expect(close.vatTotal).toBe(0);
    expect(close.refundsTotal).toBe(6000);
    expect(close.refundsCount).toBe(2);
  });
});
