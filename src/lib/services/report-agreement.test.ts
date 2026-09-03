import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { aggregateOrders, orderNet, AGGREGATE_INCLUDE } from "@/lib/services/aggregate";
import { computeShiftReport } from "@/lib/services/reports";
import { sum2 } from "@/lib/money";
import { ensureFiscalCounter } from "@/lib/services/sequence";

// L-23 (Batch 3.2b) — the reports the audit did not count.
//
// Batch 3.2 unified the five aggregations that feed fiscal documents. Chasing
// `round2` out of those routes turned up three more, each with its own
// arithmetic:
//
//   dashboard/route.ts        COMPLETED at face value + round2 on a ratio
//   reports/cashiers/route.ts payments summed GROSS, refunds never netted
//   reports/products/route.ts round2 on a ratio, per line, independently
//   customers/[id]/detail     face-value totals, fractional-cent average
//
// None feeds a sealed document, so none of them could corrupt the fiscal
// chain — but a manager comparing the dashboard to a Z report saw two
// different numbers for the same day, which is its own kind of wrong.
//
// These tests exercise the composition each route now performs, and contrast
// it with the arithmetic each used to do.

async function wipe() {
  await db.refund.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
  await ensureFiscalCounter();
}

/** One shift, two cashiers, a partial refund and a full refund. */
async function seed() {
  const alice = await db.user.create({
    data: { username: "alice", name: "Alice", role: "CASHIER", pinHash: "x:y" },
  });
  const bob = await db.user.create({
    data: { username: "bob", name: "Bob", role: "CASHIER", pinHash: "x:y" },
  });
  const shift = await db.shift.create({
    data: { number: 400, openedById: alice.id, openingFloat: 0, status: "OPEN" },
  });

  // Alice: a clean 2000 sale, and a 1500 sale with 500 refunded on card.
  await db.order.create({
    data: {
      number: 4000, shiftId: shift.id, cashierId: alice.id, status: "COMPLETED",
      subtotal: 2000, discountTotal: 0, total: 2000, vatTotal: 0, itemCount: 2,
      completedAt: new Date(),
      items: { create: [
        { productName: "Tacos", quantity: 1, lineTotal: 1200, vatRate: 10, unitPrice: 1200 },
        { productName: "Coca", quantity: 1, lineTotal: 800, vatRate: 5.5, unitPrice: 800 },
      ] },
      payments: { create: [{ method: "CASH", amount: 2000, cashierId: alice.id }] },
    },
  });
  const partial = await db.order.create({
    data: {
      number: 4001, shiftId: shift.id, cashierId: alice.id, status: "COMPLETED",
      subtotal: 1500, discountTotal: 0, total: 1500, vatTotal: 0, itemCount: 1,
      completedAt: new Date(),
      items: { create: [{ productName: "Menu", quantity: 1, lineTotal: 1500, vatRate: 10, unitPrice: 1500 }] },
      payments: { create: [{ method: "CARD", amount: 1500, cashierId: alice.id }] },
    },
  });
  await db.refund.create({
    data: { orderId: partial.id, amount: 500, method: "CARD", reason: "partiel", cashierId: alice.id },
  });

  // Bob: a 900 sale, fully refunded.
  const full = await db.order.create({
    data: {
      number: 4002, shiftId: shift.id, cashierId: bob.id, status: "REFUNDED",
      subtotal: 900, discountTotal: 0, total: 900, vatTotal: 0, itemCount: 1,
      completedAt: new Date(),
      items: { create: [{ productName: "Frite", quantity: 1, lineTotal: 900, vatRate: 10, unitPrice: 900 }] },
      payments: { create: [{ method: "CASH", amount: 900, cashierId: bob.id }] },
    },
  });
  await db.refund.create({
    data: { orderId: full.id, amount: 900, method: "CASH", reason: "annulation", cashierId: bob.id },
  });

  return { alice, bob, shift };
}

describe("every report sees the same period the same way (L-23)", () => {
  beforeEach(wipe);

  it("the dashboard total equals the Z report total for the same orders", async () => {
    const { shift } = await seed();
    const orders = await db.order.findMany({ where: { shiftId: shift.id }, include: AGGREGATE_INCLUDE });

    const dashboard = aggregateOrders(orders, { topProductsLimit: 6 });
    const z = await computeShiftReport(shift.id);

    expect(dashboard.salesTotal).toBe(z.salesTotal);
    expect(dashboard.cashTotal).toBe(z.cashTotal);
    expect(dashboard.cardTotal).toBe(z.cardTotal);
    expect(dashboard.vatTotal).toBe(z.vatTotal);

    // 2000 + (1500 − 500) = 3000; the fully refunded 900 does not count.
    expect(dashboard.salesTotal).toBe(3000);

    // What the dashboard used to report: COMPLETED only, at face value.
    const oldWay = sum2(orders.filter((o) => o.status === "COMPLETED").map((o) => o.total));
    expect(oldWay).toBe(3500);
    expect(oldWay).not.toBe(dashboard.salesTotal);
  });

  it("an integer average ticket, not a fractional cent", async () => {
    const { shift } = await seed();
    const orders = await db.order.findMany({ where: { shiftId: shift.id }, include: AGGREGATE_INCLUDE });
    const agg = aggregateOrders(orders);
    const avgTicket = agg.salesCount > 0 ? Math.round(agg.salesTotal / agg.salesCount) : 0;
    expect(Number.isInteger(avgTicket)).toBe(true);
    expect(avgTicket).toBe(1500); // 3000 / 2
  });

  it("the cashier report nets refunds off each method instead of summing gross", async () => {
    const { alice, bob, shift } = await seed();
    const orders = await db.order.findMany({
      where: { shiftId: shift.id },
      include: { ...AGGREGATE_INCLUDE, cashier: { select: { id: true, name: true, username: true } } },
    });

    // The grouping the route now performs.
    const byCashier = new Map<string, typeof orders>();
    for (const o of orders) {
      if (!o.cashier) continue;
      byCashier.set(o.cashier.id, [...(byCashier.get(o.cashier.id) ?? []), o]);
    }

    const aliceAgg = aggregateOrders(byCashier.get(alice.id)!);
    expect(aliceAgg.salesTotal).toBe(3000);
    expect(aliceAgg.cashTotal).toBe(2000);
    expect(aliceAgg.cardTotal).toBe(1000); // 1500 taken − 500 refunded
    expect(aliceAgg.totalRefunded).toBe(500);

    const bobAgg = aggregateOrders(byCashier.get(bob.id)!);
    expect(bobAgg.salesTotal).toBe(0);
    expect(bobAgg.salesCount).toBe(0);
    expect(bobAgg.cashTotal).toBe(0); // 900 taken, 900 returned — not 900

    // What the route used to report for Bob: gross payments, never netted.
    const oldBobCash = sum2(
      byCashier.get(bob.id)!.flatMap((o) => o.payments).filter((p) => p.method === "CASH").map((p) => p.amount),
    );
    expect(oldBobCash).toBe(900);
    expect(oldBobCash).not.toBe(bobAgg.cashTotal);

    // And the report's own total ties back to the period's.
    const all = aggregateOrders(orders);
    expect(aliceAgg.salesTotal + bobAgg.salesTotal).toBe(all.salesTotal);
  });

  it("the product report's revenue is integer cents and sums to the period total", async () => {
    const { shift } = await seed();
    const orders = await db.order.findMany({ where: { shiftId: shift.id }, include: AGGREGATE_INCLUDE });

    // The grouping the route now performs: by product id / name, using the
    // same per-line nets the Z report uses.
    const map = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const order of orders) {
      const { counted, lineNets } = orderNet(order);
      if (!counted) continue;
      order.items.forEach((it, idx) => {
        const key = it.productId ?? it.productName;
        const row = map.get(key) ?? { name: it.productName, quantity: 0, revenue: 0 };
        row.quantity += it.quantity;
        row.revenue += lineNets[idx];
        map.set(key, row);
      });
    }
    const rows = Array.from(map.values());

    for (const r of rows) expect(Number.isInteger(r.revenue)).toBe(true);

    // Every cent of the period's sales is attributed to some product, and no
    // cent is invented. Independent per-line rounding could not promise this.
    const agg = aggregateOrders(orders);
    expect(sum2(rows.map((r) => r.revenue))).toBe(agg.salesTotal);

    // The fully refunded order contributes nothing.
    expect(rows.find((r) => r.name === "Frite")).toBeUndefined();
  });

  it("the customer panel reports what the customer actually spent", async () => {
    const { shift } = await seed();
    const orders = await db.order.findMany({ where: { shiftId: shift.id }, include: AGGREGATE_INCLUDE });
    const agg = aggregateOrders(orders, { topProductsLimit: 5 });

    // Net of the partial refund, and excluding the fully refunded order.
    expect(agg.salesTotal).toBe(3000);
    expect(agg.salesCount).toBe(2);
    expect(agg.topProducts.every((p) => Number.isInteger(p.total))).toBe(true);
  });
});
