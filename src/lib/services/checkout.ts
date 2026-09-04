// Checkout service — the transaction body of POST /api/orders, extracted so
// the shift-state race can be tested without an HTTP harness (C-15, Batch 4.7).
//
// This follows the shape `processRefund` already established: the route keeps
// request parsing, server-authoritative pricing, payment validation and the
// step-up token; this module owns everything that must be atomic — numbering,
// the order, its lines, its payments, the receipt snapshot, the VENTE journal
// entry, the grand total and the audit row. It throws CheckoutError for the
// one refusal that can only be decided inside the transaction.
//
// WHY THE SHIFT IS RE-READ HERE. The route looks up the open shift before it
// does any of its work; that read is not in a transaction, and a read outside
// a transaction does not wait for one — measured in Batch 4.7, it returns
// `OPEN` while a Z close is mid-flight. Prisma's interactive transactions on
// SQLite, by contrast, do not overlap at all: the second one's body does not
// begin until the first has committed (measured in both `delete` and `wal`
// journal modes). So re-asserting the status as the FIRST statement in here is
// exactly what closes C-15's window: a checkout that starts after the close
// committed sees CLOSED and is refused, and one that commits before it starts
// is counted by a Z report that now computes inside its own transaction.
import { db } from "@/lib/db";
import { nextReceiptNumber } from "@/lib/services/sequence";
import { renderReceipt } from "@/lib/services/receipt";
import { appendFiscalEvent, incrementGrandTotal } from "@/lib/services/fiscal";
import { sum2, addToVatBreakdown, apportion, type VatBreakdown } from "@/lib/money";
import { buildVentePayload, buildOrderAuditDetails } from "@/lib/services/sale-journal";
import { TX_CHECKOUT, isTransactionBusyError } from "@/lib/tx-options";
import type { OrderDto, SettingsDto } from "@/types/api";
import type { PaymentMethod } from "@prisma/client";

/** In-transaction checkout failure with the HTTP status the route must return. */
export class CheckoutError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CheckoutError";
    this.status = status;
  }
}

/** Shown when the till was closed between the route's lookup and the sale
 *  being written. The cart is kept client-side, so the cashier opens a new
 *  till and rings the sale again — into the shift it actually belongs to. */
export const SHIFT_CLOSED_DURING_CHECKOUT_MESSAGE =
  "La caisse a été clôturée pendant l'encaissement. Ouvrez une caisse et recommencez la commande.";

/** Shown when the sale could not obtain a transaction inside its budget —
 *  in practice, a Z close holding the database longer than TX_CHECKOUT's
 *  `maxWait`. Nothing was written; retrying is safe. */
export const CHECKOUT_BUSY_MESSAGE =
  "La caisse est occupée (clôture en cours). Réessayez dans quelques secondes.";

export type CheckoutItem = {
  productId: string | null;
  productName: string;
  unitPrice: number; // cents
  quantity: number;
  lineTotal: number; // cents
  vatRate: number;
  optionsJson: string | null;
  addOnsJson: string | null;
  notes: string | null;
};

export type CheckoutPayment = {
  method: PaymentMethod;
  amount: number; // cents
  tendered?: number | null; // cents
};

export type CheckoutInput = {
  shiftId: string;
  cashierId: string;
  customerId: string | null;
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON";
  tableLabel: string | null;
  notes: string | null;
  subtotal: number; // cents
  discountTotal: number; // cents
  totalAfterDiscount: number; // cents
  /** DD-19 / C-13: who authorised the discount, or null. */
  discountApprovedById: string | null;
  itemCount: number;
  items: CheckoutItem[];
  payments: CheckoutPayment[];
  settings: SettingsDto;
};

/**
 * Write a sale atomically. Refuses with 409 if the shift closed underneath it.
 *
 * The caller MUST have validated everything that does not depend on the state
 * of the database at commit time: prices, payment coverage, livraison fields
 * and the step-up token.
 */
export async function createOrderInTransaction(input: CheckoutInput): Promise<OrderDto> {
  const {
    shiftId,
    cashierId,
    customerId,
    orderType,
    tableLabel,
    notes,
    subtotal,
    discountTotal,
    totalAfterDiscount,
    discountApprovedById,
    itemCount,
    items,
    payments,
    settings,
  } = input;

  try {
    // C-15 (Batch 2.3): an explicit budget. Prisma's default is 5 s and this
    // body performs 8+ sequential writes — exceeding it rolls back the sale
    // AFTER the customer has paid, which is the worst moment to fail.
    return await db.$transaction(async (tx) => {
      // C-15 (Batch 4.7): the first statement, before a number is drawn or a
      // row is written. The route's lookup was outside any transaction and can
      // be stale by the time this body runs.
      const shift = await tx.shift.findUnique({
        where: { id: shiftId },
        select: { status: true },
      });
      if (!shift) {
        throw new CheckoutError("Caisse introuvable", 409);
      }
      if (shift.status !== "OPEN") {
        throw new CheckoutError(SHIFT_CLOSED_DURING_CHECKOUT_MESSAGE, 409);
      }

      const number = await nextReceiptNumber(tx);

      // VAT on net-of-discount amounts, with the discount distributed across the
      // lines EXACTLY (M-13, Batch 3.2). Each line used to round on its own —
      // `Math.round(lineTotal × (1 − discountRatio))` — so `Σ netLineTotal` need
      // not equal `total − discount`, and the stored `vatTotal` could sit a cent
      // or two off the order it belongs to. `apportion` gives every line its
      // floor and hands the leftover cents to the largest remainders, so the
      // parts always sum to the whole and the split is deterministic.
      const vatBreakdown: VatBreakdown = {};
      const lineNets = apportion(items.map((i) => i.lineTotal), totalAfterDiscount);
      items.forEach((item, idx) => {
        addToVatBreakdown(vatBreakdown, lineNets[idx], item.vatRate);
      });
      const vatTotal = sum2(Object.values(vatBreakdown).map((v) => v.vat));

      const created = await tx.order.create({
        data: {
          number,
          shiftId,
          cashierId,
          customerId: customerId ?? null,
          status: "COMPLETED",
          orderType,
          tableLabel: tableLabel ?? null,
          subtotal,
          vatTotal,
          discountTotal,
          // C-13 (Batch 3.5): the approval was verified above and then thrown
          // away. Persisted here so a manager can be shown which discounts they
          // authorised, and a dispute can be settled from the data.
          discountApprovedById,
          total: totalAfterDiscount,
          notes: notes ?? null,
          itemCount,
          completedAt: new Date(),
        },
      });

      for (const item of items) {
        await tx.orderItem.create({
          data: {
            orderId: created.id,
            productId: item.productId,
            productName: item.productName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
            vatRate: item.vatRate,
            optionsJson: item.optionsJson,
            addOnsJson: item.addOnsJson,
            notes: item.notes,
          },
        });
      }

      for (const p of payments) {
        await tx.payment.create({
          data: {
            orderId: created.id,
            method: p.method,
            amount: p.amount,
            tendered: p.tendered ?? null,
            change: p.tendered ? p.tendered - p.amount : null,
            cashierId,
          },
        });
      }

      // Auto-link table: if dine-in with a tableLabel matching a Table, set it OCCUPIED.
      if (orderType === "DINE_IN" && tableLabel) {
        const table = await tx.table.findUnique({ where: { label: tableLabel } });
        if (table) {
          await tx.table.update({
            where: { id: table.id },
            data: { status: "OCCUPIED", currentOrderId: created.id },
          });
        }
      }

      const orderWithRelations = await tx.order.findUnique({
        where: { id: created.id },
        include: {
          items: true,
          payments: true,
          cashier: { select: { name: true, username: true } },
          customer: { select: { name: true } },
          shift: { select: { number: true } },
        },
      });

      // Persist receipt snapshot for fiscal immutability (inside the same transaction)
      const receiptText = renderReceipt(orderWithRelations as unknown as OrderDto, settings);
      await tx.receipt.create({
        data: {
          orderId: created.id,
          content: receiptText,
          receiptNumber: number,
          printStatus: "PENDING",
          reprintCount: 0,
        },
      });

      // --- Fiscal journal (JFP) — ISCA sécurisation/inaltérabilité ---
      // Append a hash-chained VENTE event + update the perpetual grand total,
      // atomically with the order so the journal can never desync from sales.
      const payCash = sum2(payments.filter((p) => p.method === "CASH").map((p) => p.amount));
      const payCard = sum2(payments.filter((p) => p.method === "CARD").map((p) => p.amount));
      const payVoucher = sum2(payments.filter((p) => p.method === "VOUCHER").map((p) => p.amount));
      // C-13 (Batch 3.5): both payloads are built by the shared helpers in
      // services/sale-journal.ts, so the tests exercise this code rather than a
      // reimplementation of it.
      const saleJournal = {
        orderNumber: number,
        total: totalAfterDiscount,
        subtotal,
        vatTotal,
        discountTotal,
        discountApprovedById,
        itemCount,
        orderType,
        payments: payments.map((p) => ({ method: p.method, amount: p.amount })),
        cashierId,
      };
      const ev = await appendFiscalEvent(tx, {
        type: "VENTE",
        userId: cashierId,
        factice: settings.factice ?? false,
        orderId: created.id,
        shiftId,
        data: buildVentePayload(saleJournal),
      });
      await tx.order.update({ where: { id: created.id }, data: { fiscalEventId: ev.id } });
      await incrementGrandTotal(tx, {
        total: totalAfterDiscount,
        vatTotal,
        cash: payCash,
        card: payCard,
        voucher: payVoucher,
      });

      // Audit inside transaction
      await tx.auditLog.create({
        data: {
          userId: cashierId,
          action: "ORDER_CREATED",
          entity: "Order",
          entityId: created.id,
          details: JSON.stringify(buildOrderAuditDetails(saleJournal)),
        },
      });

      return orderWithRelations as unknown as OrderDto;
    }, TX_CHECKOUT);
  } catch (e) {
    // A close that holds the database longer than this sale can wait must not
    // reach the cashier as a Prisma stack trace. Nothing was written.
    if (isTransactionBusyError(e)) {
      throw new CheckoutError(CHECKOUT_BUSY_MESSAGE, 503);
    }
    throw e;
  }
}
