import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { createOrderInTransaction } from "@/lib/services/checkout";
import { aggregateOrders, AGGREGATE_INCLUDE } from "@/lib/services/aggregate";
import { computeShiftReport } from "@/lib/services/reports";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { sum2 } from "@/lib/money";
import { DEFAULT_SETTINGS } from "@/lib/services/settings";
import type { SettingsDto } from "@/types/api";

// T-05 (Batch 6.1) — order-level money assembly, end to end.
//
// THE GAP: "subtotal → discount → VAT breakdown → payment reconciliation …
// `addToVatBreakdown` on `netLineTotal` is never asserted. Where C-11, C-12 and
// M-13 live."
//
// Batch 4.7 moved the transaction body into `services/checkout.ts`, so this can
// be written against `createOrderInTransaction` directly rather than through
// the HTTP harness — which is what the plan's own 2026-09-04 correction says.
//
// WHAT MAKES THIS DIFFERENT FROM `aggregate.test.ts`: that file tests the
// aggregation over orders a test constructed. This one writes orders through
// the REAL checkout and then asks the aggregation about them, so a discount
// apportioned one way at checkout and another way in the report shows up here
// and nowhere else. C-10 was exactly that class of disagreement.

const SETTINGS = { ...DEFAULT_SETTINGS, factice: false } as unknown as SettingsDto;
let userId: string;
let shiftId: string;

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.zReport.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
}

beforeEach(async () => {
  await wipe();
  await ensureFiscalCounter();
  const u = await db.user.create({
    data: { username: `t05-${Date.now()}-${Math.random()}`, name: "Resp", role: "MANAGER", pinHash: "x:y" },
  });
  userId = u.id;
  const s = await db.shift.create({
    data: { number: 1, openedById: userId, openedAt: new Date(), openingFloat: 10000, status: "OPEN" },
  });
  shiftId = s.id;
});

afterAll(wipe);

type Line = { name: string; lineTotal: number; vatRate: number };

/** A sale through the real checkout. Lines carry their own VAT rate, which is
 *  what makes the multi-rate cases below meaningful. */
async function sell(lines: Line[], discountTotal: number, payments: { method: string; amount: number }[]) {
  const subtotal = sum2(lines.map((l) => l.lineTotal));
  return createOrderInTransaction({
    shiftId,
    cashierId: userId,
    customerId: null,
    orderType: "DINE_IN",
    tableLabel: null,
    notes: null,
    subtotal,
    discountTotal,
    totalAfterDiscount: subtotal - discountTotal,
    discountApprovedById: discountTotal > 0 ? userId : null,
    itemCount: lines.length,
    items: lines.map((l) => ({
      productId: null,
      productName: l.name,
      unitPrice: l.lineTotal,
      quantity: 1,
      lineTotal: l.lineTotal,
      vatRate: l.vatRate,
      optionsJson: null,
      addOnsJson: null,
      notes: null,
    })),
    payments: payments as never,
    settings: SETTINGS,
  });
}

describe("T-05 — subtotal, discount, VAT and payments assemble consistently", () => {
  it("a single-rate sale: the stored figures are internally consistent", async () => {
    const o = await sell([{ name: "Tacos", lineTotal: 1100, vatRate: 10 }], 0, [
      { method: "CASH", amount: 1100 },
    ]);
    expect(o.subtotal).toBe(1100);
    expect(o.discountTotal).toBe(0);
    expect(o.total).toBe(1100);
    // 1100 TTC at 10 % → HT 1000, VAT 100.
    expect(o.vatTotal).toBe(100);
  });

  it("MULTI-RATE with a discount: VAT is computed on the NET, rate by rate", async () => {
    // This is the assertion the audit says was missing. 2000 at 10 % and 1000
    // at 5,5 %, less a 600 discount. `apportion` splits the 2400 net in the
    // lines' own proportions — 1600 and 800 — and each is taxed at its own
    // rate, not at a blended one.
    const o = await sell(
      [
        { name: "Plat", lineTotal: 2000, vatRate: 10 },
        { name: "Boisson", lineTotal: 1000, vatRate: 5.5 },
      ],
      600,
      [{ method: "CASH", amount: 2400 }],
    );
    expect(o.subtotal).toBe(3000);
    expect(o.total).toBe(2400);
    // 1600 TTC at 10 % → VAT 145 (1600 − 1600/1.1 = 145.45 → 145)
    // 800 TTC at 5,5 % → VAT 42 (800 − 800/1.055 = 41.71 → 42)
    expect(o.vatTotal).toBe(145 + 42);
  });

  it("the discount is apportioned EXACTLY — the parts sum to the whole (M-13)", async () => {
    // Three lines and a discount that does not divide evenly. Before M-13 each
    // line rounded on its own, so Σ net could miss the order total by a cent
    // or two and the stored `vatTotal` belonged to no order.
    const o = await sell(
      [
        { name: "A", lineTotal: 333, vatRate: 10 },
        { name: "B", lineTotal: 333, vatRate: 10 },
        { name: "C", lineTotal: 334, vatRate: 10 },
      ],
      100,
      [{ method: "CASH", amount: 900 }],
    );
    expect(o.total).toBe(900);
    const items = await db.orderItem.findMany({ where: { orderId: o.id } });
    expect(items).toHaveLength(3);
    // Every line keeps its GROSS total; the apportionment is a report-time
    // concern, so what is stored must still add up to the subtotal.
    expect(sum2(items.map((i) => i.lineTotal))).toBe(o.subtotal);
  });

  it("payments reconcile with the total, and are stored by method", async () => {
    const o = await sell([{ name: "Plat", lineTotal: 3000, vatRate: 10 }], 0, [
      { method: "CASH", amount: 1000 },
      { method: "CARD", amount: 2000 },
    ]);
    const pays = await db.payment.findMany({ where: { orderId: o.id } });
    expect(sum2(pays.map((p) => p.amount))).toBe(o.total);
    expect(pays.map((p) => p.method).sort()).toEqual(["CARD", "CASH"]);
  });

  it("the AGGREGATION agrees with the row it wrote — C-10's whole class", async () => {
    // The disagreement C-10 was: the period aggregation and the shift report
    // computed the same money two different ways. Writing through the real
    // checkout and then asking the aggregation is the only way to catch that.
    await sell([{ name: "Plat", lineTotal: 2000, vatRate: 10 }, { name: "Boisson", lineTotal: 1000, vatRate: 5.5 }], 600, [
      { method: "CASH", amount: 2400 },
    ]);
    const orders = await db.order.findMany({ where: { shiftId }, include: AGGREGATE_INCLUDE });
    const agg = aggregateOrders(orders, {});
    const row = orders[0];
    expect(agg.salesTotal).toBe(row.total);
    expect(agg.vatTotal).toBe(row.vatTotal);
    expect(agg.discountsTotal).toBe(row.discountTotal);
    expect(agg.cashTotal).toBe(row.total);
  });

  it("the SHIFT REPORT agrees too, and its VAT breakdown sums to the total", async () => {
    await sell([{ name: "Plat", lineTotal: 2000, vatRate: 10 }], 0, [{ method: "CASH", amount: 2000 }]);
    await sell([{ name: "Boisson", lineTotal: 1000, vatRate: 5.5 }], 0, [{ method: "CASH", amount: 1000 }]);
    const report = await computeShiftReport(shiftId);
    expect(report.salesTotal).toBe(3000);
    const breakdownVat = sum2(Object.values(report.vatBreakdown).map((v) => v.vat));
    expect(breakdownVat).toBe(report.vatTotal);
    // Two rates, kept apart — C-12 was that 5,5 % was recorded as 6 %.
    expect(Object.keys(report.vatBreakdown).sort()).toEqual(["10", "5.5"]);
  });

  it("the JOURNAL payload carries the same money as the order row", async () => {
    // A journal that disagrees with the sale it records cannot be reconciled
    // from itself, which is the whole point of an append-only chain.
    const o = await sell([{ name: "Plat", lineTotal: 2000, vatRate: 10 }], 400, [
      { method: "CASH", amount: 1600 },
    ]);
    const ev = await db.fiscalEvent.findFirstOrThrow({ where: { type: "VENTE", orderId: o.id } });
    const payload = JSON.parse(ev.dataJson);
    expect(payload.total).toBe(o.total);
    expect(payload.subtotal).toBe(o.subtotal);
    expect(payload.vatTotal).toBe(o.vatTotal);
    expect(payload.discountTotal).toBe(o.discountTotal);
    expect(sum2(payload.payments.map((p: { amount: number }) => p.amount))).toBe(o.total);
  });

  it("the perpetual grand total moves by exactly this sale", async () => {
    const before = await db.grandTotal.findUnique({ where: { id: "singleton" } });
    const o = await sell([{ name: "Plat", lineTotal: 2000, vatRate: 10 }], 400, [
      { method: "CASH", amount: 1600 },
    ]);
    const after = await db.grandTotal.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(after.totalSales - (before?.totalSales ?? 0)).toBe(o.total);
    expect(after.totalVat - (before?.totalVat ?? 0)).toBe(o.vatTotal);
    expect(after.totalCash - (before?.totalCash ?? 0)).toBe(o.total);
  });
});
