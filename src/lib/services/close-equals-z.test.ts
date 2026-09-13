import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { aggregateOrders, AGGREGATE_INCLUDE, periodOrdersWhere, periodAggregateOptions } from "@/lib/services/aggregate";
import { monthBounds } from "@/lib/period";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { saveSettings } from "@/lib/services/settings";
import { hashPin } from "@/lib/auth";

// L-99 (R8.6) — « a period close equals the sum of its Z reports », ASSERTED,
// with the caveat that makes it true.
//
// THE FINDING. That sentence was load-bearing prose in three places —
// `fiscal.ts`'s `assertNoOpenShift`, `aggregate.ts`'s header, and the
// `cashInTotal` note — **with no test asserting it**. And it is false for a
// shift that straddles the cut-off: a Z's scope is `shiftId`, a month's is
// `Order.createdAt` inside `monthBounds(…, cutoffHour)`, and nothing stops one
// shift holding orders from two trading months.
//
// THE MONEY IS RIGHT either way — the two months sum to the Z, counted once,
// and the VAT telescopes. What fails is the arithmetic an inspector performs
// first, which is why the prose was corrected rather than the behaviour.
// Refusing a checkout into a shift whose trading day has moved on is DD-23
// territory and a behaviour change; it is recorded for the accountant in
// `docs/politique-ventilation-tva.md` § 8 instead.
//
// This file is the test that was missing, in both directions: the claim holds
// when no shift straddles, and the exact way it fails when one does.

const CUTOFF = 5;
let userId: string;

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.dailyClose.deleteMany();
  await db.zReport.deleteMany();
  await db.refund.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.cashMovement.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
  await db.setting.deleteMany();
}

beforeEach(async () => {
  await wipe();
  await ensureFiscalCounter();
  await saveSettings({ businessDayCutoffHour: CUTOFF, factice: false });
  const u = await db.user.create({
    data: {
      username: `l99-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin("424242"),
    },
  });
  userId = u.id;
});

afterAll(wipe);

async function shift(openedAt: Date, closedAt: Date) {
  return db.shift.create({
    data: {
      number: Math.floor(Math.random() * 1_000_000),
      openedById: userId,
      openedAt,
      closedAt,
      openingFloat: 0,
      status: "CLOSED",
    },
  });
}

async function orderIn(shiftId: string, at: Date, total: number) {
  const order = await db.order.create({
    data: {
      number: Math.floor(Math.random() * 1_000_000),
      shiftId,
      cashierId: userId,
      status: "COMPLETED",
      orderType: "DINE_IN",
      subtotal: total,
      vatTotal: total - Math.round(total / 1.1),
      total,
      itemCount: 1,
      createdAt: at,
      completedAt: at,
    },
  });
  await db.orderItem.create({
    data: { orderId: order.id, productName: "Pizza", unitPrice: total, quantity: 1, lineTotal: total, vatRate: 10 },
  });
  await db.payment.create({ data: { orderId: order.id, cashierId: userId, method: "CASH", amount: total } });
  return order;
}

/** What a Z report totals: every order of ONE shift. */
async function zTotalFor(shiftId: string) {
  const orders = await db.order.findMany({ where: { shiftId }, include: AGGREGATE_INCLUDE });
  return aggregateOrders(orders, {}).salesTotal;
}

/** What a monthly close totals: every order inside the month's trading bounds. */
async function monthTotalFor(year: number, month: number) {
  const { from, to } = monthBounds(year, month, CUTOFF);
  const orders = await db.order.findMany({
    where: periodOrdersWhere(from, to),
    include: AGGREGATE_INCLUDE,
  });
  return aggregateOrders(orders, periodAggregateOptions(from, to)).salesTotal;
}

describe("L-99 — the claim holds when no shift straddles a period boundary", () => {
  it("a month equals the sum of the Z reports whose orders fall inside it", async () => {
    // The normal case, and every shift on this install so far. Two shifts,
    // both wholly inside September.
    const a = await shift(new Date(2026, 8, 3, 18), new Date(2026, 8, 4, 1));
    await orderIn(a.id, new Date(2026, 8, 3, 20), 1000);
    await orderIn(a.id, new Date(2026, 8, 3, 21), 500);

    const b = await shift(new Date(2026, 8, 4, 18), new Date(2026, 8, 5, 1));
    await orderIn(b.id, new Date(2026, 8, 4, 20), 2000);

    const zSum = (await zTotalFor(a.id)) + (await zTotalFor(b.id));
    expect(zSum).toBe(3500);
    expect(await monthTotalFor(2026, 9), "the close does not equal the sum of its Zs").toBe(zSum);
  });

  it("holds for a shift that runs past midnight but not past the cut-off", async () => {
    // 20:00 → 02:00 is one trading day and one month. The cut-off exists so
    // this case is NOT a straddle, and it is the ordinary shape of a service.
    const s = await shift(new Date(2026, 8, 3, 20), new Date(2026, 8, 4, 3));
    await orderIn(s.id, new Date(2026, 8, 3, 22), 1000);
    await orderIn(s.id, new Date(2026, 8, 4, 2), 2000);

    expect(await zTotalFor(s.id)).toBe(3000);
    expect(await monthTotalFor(2026, 9)).toBe(3000);
  });
});

describe("L-99 — and the exact way it fails when one does", () => {
  it("reproduces the audit's measurement: Z 3000, August 1000, September 2000", async () => {
    // THE CAVEAT, pinned. One shift opened 31 Aug 20:00, an order at 22:00 and
    // another at 05:30 on 1 Sep — past the cut-off, so a different trading
    // month — closed 06:00.
    const s = await shift(new Date(2026, 7, 31, 20), new Date(2026, 8, 1, 6));
    await orderIn(s.id, new Date(2026, 7, 31, 22), 1000);
    await orderIn(s.id, new Date(2026, 8, 1, 5, 30), 2000);

    expect(await zTotalFor(s.id), "the Z totals the whole shift").toBe(3000);
    expect(await monthTotalFor(2026, 8), "August takes only the orders inside it").toBe(1000);
    expect(await monthTotalFor(2026, 9), "September takes the rest").toBe(2000);
  });

  it("counts the money exactly once, which is why this is prose and not a bug", async () => {
    // The half that decides the remedy. If the money were double-counted or
    // lost, the fix would have to be behavioural. It is neither.
    const s = await shift(new Date(2026, 7, 31, 20), new Date(2026, 8, 1, 6));
    await orderIn(s.id, new Date(2026, 7, 31, 22), 1000);
    await orderIn(s.id, new Date(2026, 8, 1, 5, 30), 2000);

    const august = await monthTotalFor(2026, 8);
    const september = await monthTotalFor(2026, 9);
    expect(august + september, "money was lost or double-counted").toBe(await zTotalFor(s.id));
  });

  it("leaves August with a close and no Z of its own", async () => {
    // The consequence an inspector meets: the month has a sealed close and
    // there is no Z report whose scope is that month. Stated as its own
    // assertion because it is the observation, not an implication of the sums.
    const s = await shift(new Date(2026, 7, 31, 20), new Date(2026, 8, 1, 6));
    await orderIn(s.id, new Date(2026, 7, 31, 22), 1000);
    await orderIn(s.id, new Date(2026, 8, 1, 5, 30), 2000);

    const { from, to } = monthBounds(2026, 8, CUTOFF);
    const shiftsWhollyInAugust = await db.shift.findMany({
      where: { openedAt: { gte: from, lt: to }, closedAt: { lt: to } },
    });
    expect(await monthTotalFor(2026, 8)).toBeGreaterThan(0);
    expect(shiftsWhollyInAugust.length, "August has a Z of its own after all").toBe(0);
  });

  it("has not happened on this install", async () => {
    // The mitigation the audit noted, as a fact rather than a hope: zero shifts
    // straddle a month boundary today. If this ever fails, the § 8 question
    // stops being hypothetical and the operator should be told.
    const straddling = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM "Shift" WHERE closedAt IS NOT NULL
         AND strftime('%Y-%m', datetime(openedAt / 1000, 'unixepoch'))
           != strftime('%Y-%m', datetime(closedAt / 1000, 'unixepoch'))`,
    );
    expect(Number(straddling[0].n)).toBe(0);
  });
});
