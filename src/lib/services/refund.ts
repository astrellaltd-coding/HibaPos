// Refund service — extracted from orders/[id]/refund/route.ts
// (Phase 8b — makes the refund transaction logic testable without HTTP).
//
// The route keeps: order fetch, shift-status check, method-match validation,
// approval-token verification (HTTP-bound), and HTTP response mapping.
// This service does the transaction body: re-read inside tx,
// validate amount, create refund, update order status, free table, audit,
// fiscal event. Throws RefundError on in-tx validation failures.

import { db } from "@/lib/db";
import { appendFiscalEvent, addRefundToGrandTotal } from "@/lib/services/fiscal";
import type { PaymentMethod } from "@prisma/client";
import { TX_FISCAL } from "@/lib/tx-options";

/** In-transaction validation failure with an HTTP status. */
export class RefundError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RefundError";
    this.status = status;
  }
}

export type RefundInput = {
  orderId: string;
  amount: number; // cents
  reason: string;
  method: PaymentMethod | null;
  approverId: string | null;
  cashierId: string;
  factice: boolean;
};

export type RefundResult = {
  refundId: string;
  totalRefunded: number; // cents
  fullyRefunded: boolean;
  fiscalEventId: string;
};

type OrderForRefund = {
  id: string;
  total: number; // cents
  status: "PENDING" | "COMPLETED" | "REFUNDED" | "CANCELLED";
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON";
  tableLabel: string | null;
  shift: { id: string; status: "OPEN" | "CLOSED" } | null;
  refunds: { amount: number }[];
};

/** Process a refund inside a transaction. Re-reads refunds + order
 *  inside the tx (serializes concurrent refund POSTs — post-audit N8 fix).
 *  Caller MUST pre-validate: shift not CLOSED, method match, approval token. */
export async function processRefund(input: RefundInput, order: OrderForRefund): Promise<RefundResult> {
  return db.$transaction(async (tx) => {
    const freshRefunds = await tx.refund.findMany({ where: { orderId: order.id } });
    const freshRefunded = freshRefunds.reduce((acc, r) => acc + r.amount, 0);
    const freshOrder = await tx.order.findUnique({
      where: { id: order.id },
      select: { total: true, status: true },
    });
    if (!freshOrder) throw new RefundError("Commande introuvable", 404);
    if (freshOrder.status !== "COMPLETED" && freshOrder.status !== "REFUNDED") {
      throw new RefundError(
        "Seules les commandes terminées peuvent être remboursées",
        409,
      );
    }
    if (freshRefunded >= freshOrder.total) {
      throw new RefundError("Cette commande a déjà été entièrement remboursée", 400);
    }
    if (input.amount > freshOrder.total - freshRefunded) {
      throw new RefundError("Montant de remboursement supérieur au solde", 400);
    }

    const r = await tx.refund.create({
      data: {
        orderId: order.id,
        amount: input.amount,
        reason: input.reason,
        cashierId: input.cashierId,
        approvedById: input.approverId,
        shiftId: order.shift?.id ?? null,
        method: input.method,
      },
    });

    const totalRefunded = freshRefunded + input.amount;
    const fullyRefunded = totalRefunded >= freshOrder.total;

    if (fullyRefunded) {
      await tx.order.update({
        where: { id: order.id },
        data: { status: "REFUNDED", refundedAt: new Date() },
      });
    }

    // Auto-free the table linked to this order (if dine-in with a table label).
    if (fullyRefunded && order.orderType === "DINE_IN" && order.tableLabel) {
      await tx.table.updateMany({
        where: { currentOrderId: order.id, status: "OCCUPIED" },
        data: { status: "FREE", currentOrderId: null },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: input.cashierId,
        action: "ORDER_REFUNDED",
        entity: "Order",
        entityId: order.id,
        details: JSON.stringify({
          amount: input.amount,
          reason: input.reason,
          method: input.method,
          approvedById: input.approverId,
          totalRefunded,
          fullyRefunded,
        }),
      },
    });

    // --- Fiscal journal (JFP) — correction tracée (ISCA inaltérabilité) ---
    const ev = await appendFiscalEvent(tx, {
      type: fullyRefunded ? "ANNULATION" : "REMBOURSEMENT",
      userId: input.cashierId,
      factice: input.factice,
      orderId: order.id,
      data: {
        orderNumber: order.id,
        refundId: r.id,
        amount: input.amount,
        reason: input.reason,
        method: input.method,
        cashierId: input.cashierId,
        approverId: input.approverId,
        totalRefunded,
        fullyRefunded,
      },
    });
    await tx.refund.update({ where: { id: r.id }, data: { fiscalEventId: ev.id } });
    await addRefundToGrandTotal(tx, input.amount);

    return {
      refundId: r.id,
      totalRefunded,
      fullyRefunded,
      fiscalEventId: ev.id,
    };
  }, TX_FISCAL);
}
