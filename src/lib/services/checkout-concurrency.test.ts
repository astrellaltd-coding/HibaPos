import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { createOrderInTransaction } from "@/lib/services/checkout";
import { processRefund } from "@/lib/services/refund";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { sum2 } from "@/lib/money";
import { DEFAULT_SETTINGS } from "@/lib/services/settings";
import type { SettingsDto } from "@/types/api";

// T-07 (Batch 6.1), the half Batch 4.7 left open.
//
// 4.7 covered a double Z close, and a checkout and a refund each racing a Z
// close. Its plan row names what remained: **two simultaneous checkouts, and
// concurrent refunds on one order.**
//
// ── WHAT A "SIMULTANEOUS" TEST CAN AND CANNOT ASSERT HERE ────────────────────
// Read Batch 4.7's record note 1 first, because it changes what these tests
// mean. Prisma's interactive transactions on SQLite **do not overlap**: the
// second body does not begin until the first has committed, in both journal
// modes, measured. So nothing below proves interleaving is handled — there is
// no interleaving to handle. What they prove is the thing that actually breaks
// in production: that operations which are *issued* together **serialise
// correctly**, and that neither carries stale state across the boundary.
//
// For a checkout that means gapless, non-duplicated receipt numbers. For a
// refund it means the second one sees the first one's money.

const SETTINGS = { ...DEFAULT_SETTINGS, factice: false } as unknown as SettingsDto;
let userId: string;
let shiftId: string;

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.zReport.deleteMany();
  await db.refund.deleteMany();
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
    data: { username: `t07-${Date.now()}-${Math.random()}`, name: "Resp", role: "MANAGER", pinHash: "x:y" },
  });
  userId = u.id;
  const s = await db.shift.create({
    data: { number: 1, openedById: userId, openedAt: new Date(), openingFloat: 10000, status: "OPEN" },
  });
  shiftId = s.id;
});

afterAll(wipe);

function saleInput(total: number) {
  return {
    shiftId,
    cashierId: userId,
    customerId: null,
    orderType: "DINE_IN" as const,
    tableLabel: null,
    notes: null,
    subtotal: total,
    discountTotal: 0,
    totalAfterDiscount: total,
    discountApprovedById: null,
    itemCount: 1,
    items: [
      {
        productId: null,
        productName: "Tacos",
        unitPrice: total,
        quantity: 1,
        lineTotal: total,
        vatRate: 10,
        optionsJson: null,
        addOnsJson: null,
        notes: null,
      },
    ],
    payments: [{ method: "CASH", amount: total }] as never,
    settings: SETTINGS,
  };
}

describe("T-07 — two simultaneous checkouts", () => {
  it("issues every receipt number exactly once, with no gap", async () => {
    // The property gapless numbering depends on. Two duplicate numbers is a
    // fiscal defect that cannot be repaired after the fact.
    const results = await Promise.all([
      createOrderInTransaction(saleInput(1000)),
      createOrderInTransaction(saleInput(2000)),
    ]);
    const numbers = results.map((r) => r.number).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2]);

    const stored = (await db.order.findMany({ select: { number: true }, orderBy: { number: "asc" } }))
      .map((o) => o.number);
    expect(stored).toEqual([1, 2]);
    const counter = await db.fiscalCounter.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(counter.lastReceiptNumber).toBe(2);
  });

  it("holds at ten — and the refusals are tolerated, not asserted away", async () => {
    // Two can collide by luck; ten makes a real ordering defect visible.
    //
    // **Ten do not all succeed on this machine, and that is not a defect.**
    // The first run of this test failed on a 503 `CHECKOUT_BUSY_MESSAGE`:
    // interactive transactions on SQLite serialise, so ten issued at once
    // exhaust the transaction budget and the loser is refused — exactly the
    // P1008 → 503 refusal Batch 4.7's record note 6 describes, and the same
    // shape as L-43, where a test asserted an outcome the contention does not
    // guarantee. So this tolerates the refusal and asserts the property that
    // must hold regardless: **every number that WAS issued is unique and the
    // set is gapless from 1.**
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => createOrderInTransaction(saleInput(100 * (i + 1)))),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok.length).toBeGreaterThan(0);

    const numbers = (await db.order.findMany({ select: { number: true }, orderBy: { number: "asc" } }))
      .map((o) => o.number);
    expect(numbers).toHaveLength(ok.length);
    expect(new Set(numbers).size).toBe(numbers.length); // no duplicate
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1)); // no gap
    const counter = await db.fiscalCounter.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(counter.lastReceiptNumber).toBe(numbers.length);
  });

  it("gives each sale its own receipt and its own journal entry", async () => {
    await Promise.all([
      createOrderInTransaction(saleInput(1000)),
      createOrderInTransaction(saleInput(2000)),
    ]);
    expect(await db.receipt.count()).toBe(2);
    expect(await db.fiscalEvent.count({ where: { type: "VENTE" } })).toBe(2);
    // The chain is sequential and unbroken — two events, sequences 1 and 2.
    const seqs = (await db.fiscalEvent.findMany({ select: { sequence: true }, orderBy: { sequence: "asc" } }))
      .map((e) => e.sequence);
    expect(seqs).toEqual([1, 2]);
  });

  it("counts every sale once in the perpetual grand total", async () => {
    // A lost update here would under-report takings permanently.
    await Promise.all([
      createOrderInTransaction(saleInput(1000)),
      createOrderInTransaction(saleInput(2000)),
      createOrderInTransaction(saleInput(3000)),
    ]);
    const gt = await db.grandTotal.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(gt.totalSales).toBe(6000);
    expect(gt.totalOrders).toBe(3);
    expect(gt.totalCash).toBe(6000);
  });
});

describe("T-07 — concurrent refunds on one order", () => {
  /** The narrow shape `processRefund` takes, built from a real order row. */
  async function forRefund(orderId: string) {
    const o = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { refunds: { select: { amount: true } } },
    });
    return {
      id: o.id,
      number: o.number,
      total: o.total,
      status: o.status as "COMPLETED" | "REFUNDED",
      orderType: o.orderType as "DINE_IN" | "TAKEAWAY" | "LIVRAISON",
      tableLabel: o.tableLabel,
      refunds: o.refunds,
    };
  }

  function refundInput(amount: number, orderId: string) {
    return {
      orderId,
      amount,
      reason: "T-07",
      method: "CASH" as const,
      approverId: userId,
      cashierId: userId,
      factice: false,
    };
  }

  it("NEVER refunds more than the order was worth", async () => {
    // THE MONEY PROPERTY. Two refunds of 600 issued together against a 1000
    // order: if the second read the balance before the first committed, the
    // till would hand back 1200 for a 1000 sale. Both are given the SAME stale
    // view deliberately — that is what a real double-submit looks like.
    const order = await createOrderInTransaction(saleInput(1000));
    const stale = await forRefund(order.id);

    const results = await Promise.allSettled([
      processRefund(refundInput(600, order.id), stale),
      processRefund(refundInput(600, order.id), stale),
    ]);

    const refunded = sum2((await db.refund.findMany()).map((r) => r.amount));
    expect(refunded).toBeLessThanOrEqual(1000);
    // Exactly one can succeed: 600 + 600 > 1000.
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(refunded).toBe(600);
  });

  it("lets two refunds that FIT both through, and totals them correctly", async () => {
    // CONTROL. Refusing the second one always would satisfy the case above.
    const order = await createOrderInTransaction(saleInput(1000));
    const stale = await forRefund(order.id);

    const results = await Promise.allSettled([
      processRefund(refundInput(400, order.id), stale),
      processRefund(refundInput(400, order.id), stale),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(sum2((await db.refund.findMany()).map((r) => r.amount))).toBe(800);

    const row = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe("COMPLETED"); // 800 of 1000 — not fully refunded
  });

  it("marks the order REFUNDED exactly once when the refunds add up to it", async () => {
    const order = await createOrderInTransaction(saleInput(1000));
    const stale = await forRefund(order.id);

    await Promise.allSettled([
      processRefund(refundInput(500, order.id), stale),
      processRefund(refundInput(500, order.id), stale),
    ]);
    const row = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(sum2((await db.refund.findMany()).map((r) => r.amount))).toBe(1000);
    expect(row.status).toBe("REFUNDED");

    // THE JOURNAL DISTINGUISHES THEM, and nothing else tested that.
    // `refund.ts:193` is `type: fullyRefunded ? "ANNULATION" : "REMBOURSEMENT"`
    // — so the refund that merely gives money back is a REMBOURSEMENT, and the
    // one that completes the reversal is an ANNULATION. Two 500s against a
    // 1000 sale therefore produce one of each, not two of the same. (This
    // ANNULATION means "the sale was fully reversed"; it is unrelated to the
    // order status DD-13 removed in Batch 5.6.)
    expect(await db.fiscalEvent.count({ where: { type: "REMBOURSEMENT" } })).toBe(1);
    expect(await db.fiscalEvent.count({ where: { type: "ANNULATION" } })).toBe(1);
  });

  it("keeps the grand total's refund figure equal to what was handed back", async () => {
    const order = await createOrderInTransaction(saleInput(1000));
    const stale = await forRefund(order.id);
    await Promise.allSettled([
      processRefund(refundInput(700, order.id), stale),
      processRefund(refundInput(700, order.id), stale),
    ]);
    const gt = await db.grandTotal.findUniqueOrThrow({ where: { id: "singleton" } });
    const refunded = sum2((await db.refund.findMany()).map((r) => r.amount));
    expect(gt.totalRefunded).toBe(refunded);
    expect(refunded).toBe(700);
  });
});
