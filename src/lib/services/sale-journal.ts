// Sale journal payloads — what a completed sale writes into the fiscal journal
// and into the audit log (C-13, Batch 3.5).
//
// These two payloads were built inline inside the checkout transaction
// (`orders/route.ts`), which is HTTP-bound and therefore untestable without a
// session. Extracting them is deliberately the SMALLEST move that lets a test
// exercise the same code the route runs, rather than a copy of it. The
// checkout transaction itself stays in the route — extracting it is T-02 /
// T-05 / T-06 in Batch 6.1, not this batch.
//
// Why the approver belongs in BOTH: an above-threshold discount is the most
// audited operation in a restaurant. The journal answers "was this sale
// authorised", the audit log answers "which discounts did this manager
// authorise" — the second is the question C-13 says cannot be asked today, and
// it is an AuditLog query, not a journal one.

import type { OrderType, PaymentMethod } from "@prisma/client";

export type SaleJournalInput = {
  /** The printed receipt number — NOT the cuid. See M-04 for what goes wrong. */
  orderNumber: number;
  /** Cents, net of discount (what the customer actually paid). */
  total: number;
  /** Cents, gross of discount. */
  subtotal: number;
  vatTotal: number;
  discountTotal: number;
  /**
   * C-13: the manager who authorised an above-threshold discount, or null.
   *
   * Always present, even as null, rather than omitted when absent: a payload
   * that carries the key with a null value says "this sale recorded no
   * approver"; one that omits it says nothing at all, and is indistinguishable
   * from an event written by a version that could not record one. Events
   * written before this batch omit the key, and must — their hashes are sealed.
   */
  discountApprovedById: string | null;
  itemCount: number;
  orderType: OrderType;
  payments: { method: PaymentMethod; amount: number }[];
  cashierId: string;
};

/**
 * The `data` payload of the VENTE fiscal event.
 *
 * ⚠ Changing this shape changes the hash of every event written afterwards.
 * That is safe — the chain links each event to its predecessor's hash, not to
 * a payload schema — but it means existing rows must never be re-serialised
 * and re-hashed to "match". They are sealed as written.
 */
export function buildVentePayload(sale: SaleJournalInput): Record<string, unknown> {
  return {
    orderNumber: sale.orderNumber,
    total: sale.total,
    subtotal: sale.subtotal,
    vatTotal: sale.vatTotal,
    discountTotal: sale.discountTotal,
    discountApprovedById: sale.discountApprovedById,
    itemCount: sale.itemCount,
    orderType: sale.orderType,
    payments: sale.payments.map((p) => ({ method: p.method, amount: p.amount })),
    cashierId: sale.cashierId,
  };
}

/**
 * The `details` payload of the ORDER_CREATED audit entry.
 *
 * `discountTotal` travels with the approver on purpose: an audit row naming an
 * approver but not the amount they approved cannot answer C-13's question
 * without joining back to the order it already points at.
 */
export function buildOrderAuditDetails(sale: SaleJournalInput): Record<string, unknown> {
  return {
    number: sale.orderNumber,
    total: sale.total,
    items: sale.itemCount,
    payments: sale.payments.length,
    discountTotal: sale.discountTotal,
    discountApprovedById: sale.discountApprovedById,
  };
}
