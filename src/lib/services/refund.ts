// Refund service — extracted from orders/[id]/refund/route.ts
// (Phase 8b — makes the refund transaction logic testable without HTTP).
//
// The route keeps: order fetch, open-till pre-check, method-match validation,
// step-up token verification (HTTP-bound), and HTTP response mapping.
// This service does the transaction body: resolve the till that will pay,
// re-read inside tx, validate amount, create refund, update order status,
// free table, audit, fiscal event. Throws RefundError on in-tx failures.
//
// C-14 / DD-10 (Batch 5.3) changed what a refund is attached to. It used to be
// refused outright when the order's own shift was closed, which made a
// customer returning the next day unrefundable through the POS — and the
// workaround an operator reaches for, cash out of the drawer with no record,
// is the untraced correction the fiscal journal exists to prevent. A refund is
// now allowed against any completed order and is attributed to the till that
// is OPEN when it is issued, which is the till the cash actually leaves.

import { db } from "@/lib/db";
import { appendFiscalEvent, addRefundToGrandTotal } from "@/lib/services/fiscal";
import type { PaymentMethod } from "@prisma/client";
import { TX_FISCAL, isTransactionBusyError } from "@/lib/tx-options";

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
  /** M-04 (Batch 3.5): the PRINTED receipt number. Required, not optional —
   *  the defect was that the journal recorded `order.id` under a key named
   *  `orderNumber`, so making this field easy to omit would reopen it. */
  number: number;
  total: number; // cents
  /** DD-13 (Batch 5.6): two values, because `enum OrderStatus` has two. */
  status: "COMPLETED" | "REFUNDED";
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON";
  tableLabel: string | null;
  refunds: { amount: number }[];
  /** C-14 / DD-10 (Batch 5.3): the order's own shift is deliberately NOT a
   *  field here any more. Nothing in a refund depends on it — the refund is
   *  attributed to the till that is open when it is issued, resolved inside the
   *  transaction below. Carrying it would invite the old question back. */
};

/** Shown when there is no open till to pay the refund out of. Same wording as
 *  the route's own pre-check, because it is the same refusal — only decided one
 *  step later, after a till was closed underneath the request.
 *
 *  C-14 / DD-10 (Batch 5.3) replaced `SHIFT_CLOSED_DURING_REFUND_MESSAGE`, which
 *  refused because the ORDER's till was closed. That refusal is gone: yesterday's
 *  sale is refundable today. What must still be refused is a refund with no till
 *  to charge it to — the cash would leave the drawer and appear in no report,
 *  which is the outcome this batch exists to prevent. */
export const NO_OPEN_SHIFT_FOR_REFUND_MESSAGE =
  "Aucune caisse ouverte. Ouvrez une caisse avant d'enregistrer un remboursement.";

/** Shown when the refund could not get through — in practice a Z close
 *  holding the database. Nothing was written; retrying is safe. */
export const REFUND_BUSY_MESSAGE =
  "La caisse est occupée (clôture en cours). Réessayez dans quelques secondes.";

/** Process a refund inside a transaction. Re-reads the shift, the refunds and
 *  the order inside the tx (serializes concurrent refund POSTs — post-audit N8
 *  fix). Caller MUST pre-validate: method match, approval token. */
export async function processRefund(input: RefundInput, order: OrderForRefund): Promise<RefundResult> {
  return db.$transaction(async (tx) => {
    // C-15 (Batch 4.7) put a shift read in here, and C-14 (Batch 5.3) changed
    // which shift it reads. The race is the same one and the reason is
    // unchanged: a read OUTSIDE a transaction does not wait for one, so the
    // route's pre-check can be overtaken by a Z close committing beside it. A
    // refund that lost that race landed in a shift whose Z had already been
    // sealed, and since a Z is immutable its `refundsTotal` was permanently
    // short of the money handed back. Interactive transactions do not overlap,
    // so deciding here is decisive.
    //
    // What changed: the question is no longer "is the ORDER's till still open"
    // — DD-10 says a sale from a sealed shift is refundable — but "which till
    // is open NOW, to pay this out of". `orderBy` matches `/api/shifts/summary`
    // and `GET /api/reports/x`, so all three name the same till; the product
    // allows only one open at a time (`POST /api/shifts` refuses a second).
    const payingShift = await tx.shift.findFirst({
      where: { status: "OPEN" },
      orderBy: { openedAt: "desc" },
      select: { id: true },
    });
    if (!payingShift) {
      throw new RefundError(NO_OPEN_SHIFT_FOR_REFUND_MESSAGE, 409);
    }
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
        // C-14 / DD-10 (Batch 5.3): the till that PAYS, not the till that sold.
        // This wrote `order.shift?.id` — the order's shift — while the schema
        // comment described the column as the shift that issued the refund, and
        // the two were only ever the same because a cross-shift refund was
        // refused. The whole reporting change turns on this line: the
        // aggregation now sources a period's refunds from this column, so the
        // cash lands in the drawer that handed it over.
        shiftId: payingShift.id,
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
    //
    // C-21 / DD-09 (Batch 5.2): RETAINED DELIBERATELY, and unreachable today —
    // no order has ever carried a table label, so nothing has ever been linked
    // for this to free. It is the other half of `checkout.ts`'s auto-link and
    // stays for the same reason.
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
        // M-04 (Batch 3.5): the ticket number, not the cuid. A REMBOURSEMENT
        // event could not be tied to a printed receipt without a join, which
        // is exactly what a paper-trail check has to do.
        //
        // This changes the payload of NEW events only. Existing rows keep the
        // cuid they were sealed with and must not be rewritten — their hashes
        // cover it.
        orderNumber: order.number,
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
  }, TX_FISCAL).catch((e) => {
    // C-15 (Batch 4.7): a close holding the database longer than this refund
    // can wait must not reach the operator as a Prisma stack trace. The
    // transaction is rolled back, so nothing was written.
    if (isTransactionBusyError(e)) throw new RefundError(REFUND_BUSY_MESSAGE, 503);
    throw e;
  });
}
