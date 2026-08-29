import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { processRefund } from "@/lib/services/refund";
import { appendFiscalEvent } from "@/lib/services/fiscal";
import { nextReceiptNumber, ensureFiscalCounter } from "@/lib/services/sequence";

// Integration tests for the refund service (Phase 8b).
// Uses the throwaway test DB (vitest.setup.ts via prisma db push).
// All amounts in CENTS.

async function seedOrder(totalCents: number, cashCents: number, cardCents = 0) {
  await ensureFiscalCounter();
  const user = await db.user.create({
    data: { username: "refund-test", name: "Test", role: "CASHIER", pinHash: "x:y" },
  });
  const shift = await db.shift.create({
    data: { number: 1, openedById: user.id, openingFloat: 10000, status: "OPEN" },
  });
  const order = await db.$transaction(async (tx) => {
    const number = await nextReceiptNumber(tx);
    const o = await tx.order.create({
      data: {
        number,
        shiftId: shift.id,
        cashierId: user.id,
        status: "COMPLETED",
        subtotal: totalCents,
        vatTotal: Math.round(totalCents * 0.1),
        total: totalCents,
        itemCount: 1,
        completedAt: new Date(),
      },
    });
    await tx.payment.create({
      data: { orderId: o.id, method: "CASH", amount: cashCents, cashierId: user.id },
    });
    if (cardCents > 0) {
      await tx.payment.create({
        data: { orderId: o.id, method: "CARD", amount: cardCents, cashierId: user.id },
      });
    }
    await appendFiscalEvent(tx, {
      type: "VENTE", userId: user.id, orderId: o.id, shiftId: shift.id,
      data: { orderNumber: number, total: totalCents },
    });
    return tx.order.findUniqueOrThrow({
      where: { id: o.id },
      include: { refunds: true, payments: true, shift: { select: { id: true, status: true } } },
    });
  });
  return { user, shift, order };
}

describe("processRefund integration", () => {
  beforeEach(async () => {
    await db.refund.deleteMany();
    await db.order.deleteMany();
    await db.payment.deleteMany();
    await db.fiscalEvent.deleteMany();
    await db.grandTotal.deleteMany();
    await db.shift.deleteMany();
    await db.user.deleteMany();
    await db.fiscalCounter.deleteMany();
  });

  it("processes a full refund (ANNULATION) + frees the table", async () => {
    const { user, order } = await seedOrder(2000, 2000);
    const result = await processRefund(
      {
        orderId: order.id,
        amount: 2000,
        reason: "Client insatisfait",
        method: "CASH",
        approverId: null,
        cashierId: user.id,
        factice: false,
      },
      order,
    );
    expect(result.fullyRefunded).toBe(true);
    expect(result.totalRefunded).toBe(2000);

    // Order status flipped to REFUNDED
    const refreshed = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, fiscalEventId: true },
    });
    expect(refreshed.status).toBe("REFUNDED");

    // A fiscal event (ANNULATION) was appended
    const events = await db.fiscalEvent.findMany({
      where: { type: "ANNULATION", orderId: order.id },
    });
    expect(events.length).toBe(1);
    expect(events[0].factice).toBe(false);
    // The refund row carries the fiscalEventId
    const refund = await db.refund.findUniqueOrThrow({
      where: { id: result.refundId },
      select: { fiscalEventId: true },
    });
    expect(refund.fiscalEventId).toBe(events[0].id);
  });

  it("processes a partial refund (REMBOURSEMENT) without flipping order status", async () => {
    const { user, order } = await seedOrder(3000, 2000, 1000);
    const result = await processRefund(
      {
        orderId: order.id,
        amount: 500,
        reason: "Demi-portion",
        method: "CASH",
        approverId: null,
        cashierId: user.id,
        factice: false,
      },
      order,
    );
    expect(result.fullyRefunded).toBe(false);
    expect(result.totalRefunded).toBe(500);

    const refreshed = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true },
    });
    expect(refreshed.status).toBe("COMPLETED"); // still completed

    const events = await db.fiscalEvent.findMany({
      where: { type: "REMBOURSEMENT", orderId: order.id },
    });
    expect(events.length).toBe(1);
  });

  it("rejects a refund exceeding the remaining balance", async () => {
    const { user, order } = await seedOrder(1000, 1000);
    await expect(
      processRefund(
        {
          orderId: order.id,
          amount: 1500, // > 1000 remaining
          reason: "Trop",
          method: "CASH",
          approverId: null,
          cashierId: user.id,
          factice: false,
        },
        order,
      ),
    ).rejects.toThrow("supérieur au solde");
  });

  it("rejects a refund on an already-fully-refunded order", async () => {
    const { user, order } = await seedOrder(1000, 1000);
    // First refund: full
    await processRefund(
      {
        orderId: order.id,
        amount: 1000,
        reason: "Remboursement total",
        method: "CASH",
        approverId: null,
        cashierId: user.id,
        factice: false,
      },
      order,
    );
    // Second refund: should fail (already fully refunded)
    await expect(
      processRefund(
        {
          orderId: order.id,
          amount: 100,
          reason: "Deuxième",
          method: "CASH",
          approverId: null,
          cashierId: user.id,
          factice: false,
        },
        order,
      ),
    ).rejects.toThrow("déjà été entièrement remboursée");
  });

  it("tags the fiscal event with factice=true when settings.factice", async () => {
    const { user, order } = await seedOrder(1000, 1000);
    await processRefund(
      {
        orderId: order.id,
        amount: 1000,
        reason: "Test",
        method: "CASH",
        approverId: null,
        cashierId: user.id,
        factice: true, // FACTICE mode
      },
      order,
    );
    const events = await db.fiscalEvent.findMany({
      where: { type: "ANNULATION", orderId: order.id },
    });
    expect(events.length).toBe(1);
    expect(events[0].factice).toBe(true);
  });
});
