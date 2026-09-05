import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { hashPin } from "@/lib/auth";
import { GET as dashboard } from "@/app/api/dashboard/route";
import { GET as salesReport } from "@/app/api/reports/sales/route";
import { GET as cashiersReport } from "@/app/api/reports/cashiers/route";

// DD-21 / L-44 (Batch 7.4a) — a period books the corrections it ISSUED.
//
// THE FINDING. Batch 5.3 moved the five aggregation callers that feed a fiscal
// document onto that rule and deliberately left four management reports on the
// older one, "a refund reduces the period that SOLD the order", because the
// right attribution there was a decision nobody had been asked. **DD-21
// answered it**: one rule everywhere.
//
// THE CONSEQUENCE THIS PINS. Once a refund is paid on a different day from its
// sale, the dashboard's "today" and `/api/reports/sales` for the same day gave
// two different figures — on the two screens a manager compares first. These
// tests fail if they ever disagree again.
//
// Driven over HTTP, because the claim is about what the ENDPOINTS answer.
// Nothing sealed is affected: no fiscal document reads these four.

const PIN = "616161";
let alice: { id: string };
let bob: { id: string };
let product: { id: string; price: number; name: string };
let shiftId: string;

const DAY = 86_400_000;

async function wipe() {
  await db.cashMovement.deleteMany();
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.zReport.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.refund.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
  await ensureFiscalCounter();
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  alice = await db.user.create({
    data: { username: "alice-l44", name: "Alice", role: "MANAGER", pinHash: await hashPin(PIN) },
  });
  bob = await db.user.create({
    data: { username: "bob-l44", name: "Bob", role: "MANAGER", pinHash: await hashPin(PIN) },
  });
  const category = await db.category.create({ data: { name: "Plats", vatRate: 10 } });
  product = await db.product.create({
    data: { name: "Burger", price: 1000, categoryId: category.id, vatRate: 10 },
  });
  // `Order.shift` is required. These reports scope by DATE, not by till, so
  // one shift carries every order in the file.
  const shift = await db.shift.create({
    data: {
      number: 1,
      status: "OPEN",
      openingFloat: 0,
      openedById: alice.id,
      openedAt: new Date(Date.now() - 3 * DAY),
    },
  });
  shiftId = shift.id;
  await signInAs({ id: alice.id, username: "alice-l44", role: "MANAGER" });
});

afterAll(clearCookies);

let nextNumber = 7400;

/** A completed order, sold `daysAgo` days ago by `cashierId`. */
async function sale(cashierId: string, daysAgo: number, total = 1000) {
  const when = new Date(Date.now() - daysAgo * DAY);
  return db.order.create({
    data: {
      number: nextNumber++,
      status: "COMPLETED",
      subtotal: total,
      discountTotal: 0,
      vatTotal: Math.round((total * 10) / 110),
      total,
      itemCount: 1,
      cashierId,
      shiftId,
      createdAt: when,
      completedAt: when,
      items: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            unitPrice: total,
            quantity: 1,
            lineTotal: total,
            vatRate: 10,
          },
        ],
      },
      payments: { create: [{ method: "CASH", amount: total, cashierId }] },
    },
    include: { items: true },
  });
}

/** A refund issued TODAY by `cashierId` against `orderId`. */
async function refundToday(orderId: string, cashierId: string, amount: number) {
  await db.refund.create({
    data: { orderId, amount, reason: "Client insatisfait", cashierId, method: "CASH" },
  });
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { refunds: true } });
  const given = order.refunds.reduce((s, r) => s + r.amount, 0);
  if (given >= order.total) {
    await db.order.update({ where: { id: orderId }, data: { status: "REFUNDED" } });
  }
}

function isoDay(daysAgo = 0): string {
  const d = new Date(Date.now() - daysAgo * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function todayFigures() {
  const dash = await callJson<{ todaySales: number; todayOrders: number }>(dashboard, {
    url: "http://localhost/api/dashboard",
  });
  const sales = await callJson<{ totalSales: number; totalOrders: number }>(salesReport, {
    url: `http://localhost/api/reports/sales?from=${isoDay(0)}&to=${isoDay(0)}`,
  });
  expect(dash.status).toBe(200);
  expect(sales.status).toBe(200);
  return {
    dashSales: dash.body.todaySales,
    dashOrders: dash.body.todayOrders,
    reportSales: sales.body.totalSales,
    reportOrders: sales.body.totalOrders,
  };
}

describe("DD-21 — the dashboard and the sales report agree for the same day", () => {
  it("agree when nothing was refunded", async () => {
    // The control. This passed before DD-21 as well — the disagreement needs a
    // refund that crosses a day boundary, which is why it went unnoticed.
    await sale(alice.id, 0, 1000);
    await sale(alice.id, 0, 2000);
    const f = await todayFigures();
    expect(f.dashSales).toBe(3000);
    expect(f.dashSales).toBe(f.reportSales);
    expect(f.dashOrders).toBe(f.reportOrders);
  });

  it("agree when TODAY refunds YESTERDAY's sale — the case that used to disagree", async () => {
    const yesterday = await sale(alice.id, 1, 1000);
    await sale(alice.id, 0, 2000); // and one of today's own
    await refundToday(yesterday.id, alice.id, 1000);

    const f = await todayFigures();
    // Today sold 2000 and handed back 1000 for a sale it did not make, so it
    // books the correction: 2000 − 1000 = 1000.
    expect(f.dashSales).toBe(1000);
    expect(f.dashSales).toBe(f.reportSales);
    expect(f.dashOrders).toBe(f.reportOrders);

    // THE COUNT IS ZERO, AND THAT IS THE RULE RATHER THAN A BUG.
    // My first version of this test asserted 1 — "today made one sale" — and
    // was wrong about the code. Under "a period books the corrections it
    // issued", an order that stops counting because THIS period refunded it
    // contributes −1: +1 for today's own sale, −1 for yesterday's, net 0. That
    // is what makes the parts of a year add up to the year, and it is the same
    // shape `cross-shift-refund.test.ts` already pins for shifts, where the
    // sequence of Z reports reads [1, 0, −1]. Stated here so nobody "fixes" it
    // back into a naive count.
    expect(f.dashOrders).toBe(0);
  });

  it("agree on a partial refund of a previous day's sale", async () => {
    const yesterday = await sale(alice.id, 1, 5000);
    await refundToday(yesterday.id, alice.id, 1500);

    const f = await todayFigures();
    expect(f.dashSales).toBe(-1500); // today sold nothing and handed back 1500
    expect(f.dashSales).toBe(f.reportSales);
    expect(f.dashOrders).toBe(f.reportOrders);
  });

  it("a refund issued TOMORROW does not reach back into today", async () => {
    // The other direction of the same rule, and the one that makes a sealed
    // period safe: a correction issued later belongs to later.
    const today = await sale(alice.id, 0, 4000);
    await db.refund.create({
      data: {
        orderId: today.id,
        amount: 4000,
        reason: "Later",
        cashierId: alice.id,
        method: "CASH",
        createdAt: new Date(Date.now() + DAY),
      },
    });
    await db.order.update({ where: { id: today.id }, data: { status: "REFUNDED" } });

    const f = await todayFigures();
    expect(f.dashSales).toBe(4000);
    expect(f.dashSales).toBe(f.reportSales);
  });
});

describe("DD-21 — a refund is booked to the cashier who ISSUED it", () => {
  it("Bob's refund of Alice's sale reduces BOB, not Alice", async () => {
    // The management question DD-21 answered: a cross-period refund plainly
    // comes out of the refunding till's drawer, so it comes off the refunding
    // cashier's line. Alice keeps the sale she made.
    const aliceSale = await sale(alice.id, 1, 3000);
    await refundToday(aliceSale.id, bob.id, 3000);

    const res = await callJson<{
      rows: {
        cashierId: string;
        name: string;
        orders: number;
        salesTotal: number;
        refundsTotal: number;
      }[];
    }>(cashiersReport, {
      url: `http://localhost/api/reports/cashiers?from=${isoDay(2)}&to=${isoDay(0)}`,
    });
    expect(res.status).toBe(200);

    const byId = Object.fromEntries(res.body.rows.map((r) => [r.cashierId, r]));

    // Alice keeps the sale she made, with nothing netted off it. Before DD-21
    // this line read 0 — her own sale cancelled by a refund she did not issue.
    expect(byId[alice.id]?.salesTotal).toBe(3000);
    expect(byId[alice.id]?.refundsTotal ?? 0).toBe(0);

    // Bob sold nothing and handed back 3000. He gets a line at all, which he
    // did not before — the report only ever bucketed by the SELLING cashier.
    expect(byId[bob.id]).toBeDefined();
    expect(byId[bob.id]?.refundsTotal).toBe(3000);
    // …and his contribution is NEGATIVE, which is the fiscal rule and not a
    // defect: a period (or a person) that only issues corrections contributes
    // the change it made. `cross-shift-refund.test.ts` pins the same shape for
    // shifts. My first version of this test expected 0 and was wrong about the
    // code.
    expect(byId[bob.id]?.salesTotal).toBe(-3000);
    expect(byId[bob.id]?.orders).toBe(-1);
  });

  it("a cashier who refunds their OWN sale nets it, as before", async () => {
    // The unchanged case, asserted so the new bucketing cannot have broken it.
    const aliceSale = await sale(alice.id, 0, 3000);
    await refundToday(aliceSale.id, alice.id, 1000);

    const res = await callJson<{
      rows: { cashierId: string; salesTotal: number; refundsTotal: number }[];
    }>(cashiersReport, {
      url: `http://localhost/api/reports/cashiers?from=${isoDay(1)}&to=${isoDay(0)}`,
    });
    const row = res.body.rows.find((r) => r.cashierId === alice.id);
    expect(row?.salesTotal).toBe(2000);
    expect(row?.refundsTotal).toBe(1000);
    expect(res.body.rows.some((r) => r.cashierId === bob.id)).toBe(false);
  });
});
