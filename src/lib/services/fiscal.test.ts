import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { appendFiscalEvent, verifyFiscalChain, incrementGrandTotal, closeMonth } from "@/lib/services/fiscal";
import { ensureFiscalCounter, nextReceiptNumber } from "@/lib/services/sequence";
import type { Prisma } from "@prisma/client";

// Service-layer integration tests for the fiscal journal (JFP).
// Uses the throwaway test DB, set up in `test-setup.ts` (preloaded by
// `bunfig.toml`) via `prisma db push`. That file was called `vitest.setup.ts`
// until commit `c1cbe03`; this comment still named the old one. Since batch
// 6.3 the database lives in a per-run directory under the system temp dir,
// and the run ABORTS if it would resolve anywhere else.

async function seedMinimal() {
  // Wipe all data so each test starts clean.
  await db.fiscalEvent.deleteMany();
  await db.grandTotal.deleteMany();
  await db.monthlyClose.deleteMany();
  await db.annualClose.deleteMany();
  await db.order.deleteMany();
  await db.refund.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.shift.deleteMany();
  await db.zReport.deleteMany();
  await db.table.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
  await db.setting.deleteMany();
  await db.auditLog.deleteMany();

  await ensureFiscalCounter();

  // Seed a user + category + product + shift for order creation.
  const user = await db.user.create({
    data: { username: "test", name: "Test", role: "MANAGER", pinHash: "x:y" },
  });
  const cat = await db.category.create({ data: { name: "Test" } });
  const prod = await db.product.create({
    data: { name: "Burger", price: 10, vatRate: 10, categoryId: cat.id },
  });
  const shift = await db.shift.create({
    data: { number: 1, openedById: user.id, openingFloat: 100, status: "OPEN" },
  });
  return { user, cat, prod, shift };
}

async function createOrder(tx: Prisma.TransactionClient, opts: { userId: string; shiftId: string; total: number; vatTotal: number; cash: number; card: number; voucher: number }) {
  const number = await nextReceiptNumber(tx);
  const order = await tx.order.create({
    data: {
      number,
      shiftId: opts.shiftId,
      cashierId: opts.userId,
      status: "COMPLETED",
      subtotal: opts.total,
      vatTotal: opts.vatTotal,
      total: opts.total,
      itemCount: 1,
      completedAt: new Date(),
    },
  });
  await tx.payment.create({
    data: {
      orderId: order.id,
      method: "CASH",
      amount: opts.cash,
      cashierId: opts.userId,
    },
  });
  if (opts.card > 0) {
    await tx.payment.create({
      data: { orderId: order.id, method: "CARD", amount: opts.card, cashierId: opts.userId },
    });
  }
  return order;
}

describe("fiscal journal (JFP) integration", () => {
  beforeAll(async () => {
    // Verify the test DB schema is ready. If db push failed in setup, skip
    // the integration tests by making the first query throw.
    try {
      await db.$queryRaw`SELECT 1`;
      await db.fiscalEvent.count();
    } catch {
      console.warn("[fiscal-test] test DB not available — integration tests will fail");
    }
  });

  beforeEach(async () => {
    await seedMinimal();
  });

  it("appends a VENTE event with a valid hash chain", async () => {
    const { user, shift } = await seedMinimal();
    const ev = await db.$transaction(async (tx) => {
      const order = await createOrder(tx, {
        userId: user.id,
        shiftId: shift.id,
        total: 1000,
        vatTotal: 91,
        cash: 1000,
        card: 0,
        voucher: 0,
      });
      return appendFiscalEvent(tx, {
        type: "VENTE",
        userId: user.id,
        orderId: order.id,
        shiftId: shift.id,
        data: { orderNumber: order.number, total: 1000 },
      });
    });

    expect(ev.sequence).toBe(1);
    expect(ev.previousHash).toBeNull();
    expect(ev.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(ev.type).toBe("VENTE");
  });

  it("chains events: second event's previousHash = first event's hash", async () => {
    const { user, shift } = await seedMinimal();

    const ev1 = await db.$transaction(async (tx) => {
      const order = await createOrder(tx, {
        userId: user.id, shiftId: shift.id, total: 1000, vatTotal: 91, cash: 1000, card: 0, voucher: 0,
      });
      return appendFiscalEvent(tx, {
        type: "VENTE", userId: user.id, orderId: order.id, shiftId: shift.id,
        data: { orderNumber: order.number, total: 1000 },
      });
    });

    const ev2 = await db.$transaction(async (tx) => {
      const order = await createOrder(tx, {
        userId: user.id, shiftId: shift.id, total: 2000, vatTotal: 182, cash: 2000, card: 0, voucher: 0,
      });
      return appendFiscalEvent(tx, {
        type: "VENTE", userId: user.id, orderId: order.id, shiftId: shift.id,
        data: { orderNumber: order.number, total: 2000 },
      });
    });

    expect(ev2.sequence).toBe(2);
    expect(ev2.previousHash).toBe(ev1.hash);
    expect(ev2.hash).not.toBe(ev1.hash);
  });

  it("verifyFiscalChain reports OK on a valid chain", async () => {
    const { user, shift } = await seedMinimal();

    for (let i = 0; i < 3; i++) {
      await db.$transaction(async (tx) => {
        const order = await createOrder(tx, {
          userId: user.id, shiftId: shift.id, total: 1000 + i * 500, vatTotal: 91, cash: 1000 + i * 500, card: 0, voucher: 0,
        });
        await appendFiscalEvent(tx, {
          type: "VENTE", userId: user.id, orderId: order.id, shiftId: shift.id,
          data: { orderNumber: order.number, total: 1000 + i * 500 },
        });
      });
    }

    const result = await verifyFiscalChain();
    expect(result.ok).toBe(true);
    expect(result.eventsChecked).toBe(3);
    expect(result.firstBreakAt).toBeNull();
  });

  it("verifyFiscalChain detects tampering", async () => {
    const { user, shift } = await seedMinimal();

    const ev = await db.$transaction(async (tx) => {
      const order = await createOrder(tx, {
        userId: user.id, shiftId: shift.id, total: 1000, vatTotal: 91, cash: 1000, card: 0, voucher: 0,
      });
      return appendFiscalEvent(tx, {
        type: "VENTE", userId: user.id, orderId: order.id, shiftId: shift.id,
        data: { orderNumber: order.number, total: 1000 },
      });
    });

    // Tamper: modify the dataJson without updating the hash.
    await db.fiscalEvent.update({
      where: { id: ev.id },
      data: { dataJson: '{"orderNumber":1,"total":99999}' },
    });

    const result = await verifyFiscalChain();
    expect(result.ok).toBe(false);
    expect(result.firstBreakAt).toBe(ev.sequence);
  });

  it("incrementGrandTotal accumulates and never resets", async () => {
    await seedMinimal();

    for (let i = 0; i < 3; i++) {
      await db.$transaction(async (tx) => {
        await incrementGrandTotal(tx, { total: 1000, vatTotal: 91, cash: 1000, card: 0, voucher: 0 });
      });
    }

    const gt = await db.grandTotal.findUnique({ where: { id: "singleton" } });
    expect(gt).toBeDefined();
    expect(gt!.totalSales).toBe(3000);
    expect(gt!.totalOrders).toBe(3);
    expect(gt!.totalCash).toBe(3000);
  });

  it("closeMonth seals a monthly clôture and rejects duplicates", async () => {
    // Seed OUTSIDE the transaction (seedMinimal uses the global db, not tx).
    const { user, shift } = await seedMinimal();

    // Create an order in the current month.
    await db.$transaction(async (tx) => {
      const order = await createOrder(tx, {
        userId: user.id, shiftId: shift.id, total: 1500, vatTotal: 136, cash: 1500, card: 0, voucher: 0,
      });
      return appendFiscalEvent(tx, {
        type: "VENTE", userId: user.id, orderId: order.id, shiftId: shift.id,
        data: { orderNumber: order.number, total: 1500 },
      });
    });

    // L-25 (Batch 3.6b): the month can only be sealed once it has ended and
    // its caisses are closed. This test seals the month the order is in, so it
    // runs on a clock at the first instant of the NEXT month — the earliest
    // legal moment — with the seeded caisse closed first.
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    await db.shift.update({
      where: { id: shift.id },
      data: { status: "CLOSED", closedById: user.id, closedAt: new Date() },
    });
    // AMENDED 2026-09-06 (Batch 3.8, DD-24): the month now ends at the
    // trading-day cut-off, so midnight on the 1st is five hours early.
    const afterMonthEnd = new Date(year, month, 1, 6, 0);

    const close = await closeMonth(year, month, user.id, false, afterMonthEnd);
    expect(close.salesTotal).toBe(1500);
    expect(close.salesCount).toBe(1);
    expect(close.hash).toMatch(/^[0-9a-f]{64}$/);

    // Duplicate close rejected.
    await expect(closeMonth(year, month, user.id, false, afterMonthEnd)).rejects.toThrow();
  });
});
