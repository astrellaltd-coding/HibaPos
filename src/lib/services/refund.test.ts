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

  // M-04 (Batch 3.5) — the journal recorded `order.id` under a key called
  // `orderNumber`, so a REMBOURSEMENT entry could not be tied to the ticket
  // the customer was holding without a join back into the orders table.
  it("records the printed ticket number in the fiscal payload, not the cuid", async () => {
    const { user, order } = await seedOrder(2000, 2000);
    await processRefund(
      {
        orderId: order.id,
        amount: 500,
        reason: "Plat renvoyé",
        method: "CASH",
        approverId: null,
        cashierId: user.id,
        factice: false,
      },
      order,
    );
    const ev = await db.fiscalEvent.findFirstOrThrow({
      where: { type: "REMBOURSEMENT", orderId: order.id },
    });
    const payload = JSON.parse(ev.dataJson);
    expect(payload.orderNumber).toBe(order.number);
    expect(typeof payload.orderNumber).toBe("number");
    // The exact defect: the cuid must not be what sits under that key.
    expect(payload.orderNumber).not.toBe(order.id);
  });

  it("records the ticket number on a full ANNULATION too", async () => {
    const { user, order } = await seedOrder(1500, 1500);
    await processRefund(
      {
        orderId: order.id,
        amount: 1500,
        reason: "Commande annulée",
        method: "CASH",
        approverId: null,
        cashierId: user.id,
        factice: false,
      },
      order,
    );
    const ev = await db.fiscalEvent.findFirstOrThrow({
      where: { type: "ANNULATION", orderId: order.id },
    });
    expect(JSON.parse(ev.dataJson).orderNumber).toBe(order.number);
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
