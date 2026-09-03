// The ONE period aggregation (C-10, C-11, M-14 — Batch 3.2).
//
// The audit found the same period revenue computed four different ways, in
// four modules, with four different answers:
//
//   reports.ts computeShiftReport   nets refunds off each payment method
//   fiscal.ts  aggregatePeriod      summed payments GROSS — C-10
//   reports/vat/route.ts            round2() on cent values — C-11
//   reports/sales/route.ts          COMPLETED only, refunds ignored — C-11
//   shifts/summary/route.ts         face-value COMPLETED totals — M-14
//
// The consequence that made this critical: a sealed MonthlyClose could not
// equal the sum of its own period's ZReport rows as soon as a single refund
// existed, and being sealed it could never be corrected. An inspector
// reconciling the two chains would find a discrepancy the system could not
// explain.
//
// Everything here is INTEGER CENTS. This module is pure — it takes orders that
// the caller has already fetched and returns figures. No database, no dates,
// no HTTP: whoever wants a period decides what "the period" means, and gets
// the same arithmetic as everybody else.

import { addToVatBreakdown, apportion, sum2, type VatBreakdown } from "@/lib/money";

export type AggregatableItem = {
  productName: string;
  quantity: number;
  lineTotal: number;
  vatRate: number | null;
};

export type AggregatablePayment = { method: string | null; amount: number };
export type AggregatableRefund = { method: string | null; amount: number };

export type AggregatableOrder = {
  status: string;
  subtotal: number;
  discountTotal: number | null;
  total: number;
  itemCount: number;
  items: AggregatableItem[];
  payments: AggregatablePayment[];
  refunds: AggregatableRefund[];
};

export type PeriodAggregate = {
  /** Net of refunds — what the customers actually paid, in cents. */
  salesTotal: number;
  /** Orders that contributed to salesTotal (fully refunded ones excluded). */
  salesCount: number;
  /** Items on those orders. */
  itemsCount: number;
  vatTotal: number;
  /** Payments taken, before refunds. */
  grossCashTotal: number;
  grossCardTotal: number;
  grossVoucherTotal: number;
  /** Refunds paid back, by the method they went out on. */
  cashRefundsTotal: number;
  cardRefundsTotal: number;
  voucherRefundsTotal: number;
  /** Gross minus refunds — the figure a report or a close should show. */
  cashTotal: number;
  cardTotal: number;
  voucherTotal: number;
  discountsTotal: number;
  totalRefunded: number;
  vatBreakdown: VatBreakdown;
  topProducts: { name: string; quantity: number; total: number }[];
  /** Per-day sales, net of refunds, keyed YYYY-MM-DD in local time. */
  byDay: { date: string; sales: number; orders: number; items: number }[];
};

/**
 * Does this order contribute to sales?
 *
 * A fully refunded order does not. The two conditions are belt and braces on
 * purpose: `status === "REFUNDED"` is the intent, `refunds >= total` is the
 * arithmetic, and before this batch the shift report checked both while the
 * period aggregation checked only the second. Unified to the stricter of the
 * two so a period and its shifts can never disagree about which orders count.
 */
function isFullyRefunded(order: AggregatableOrder, refundsTotal: number): boolean {
  return order.status === "REFUNDED" || refundsTotal >= order.total;
}

/** Local-date key, matching what the sales report has always grouped by. */
function dayKey(when: Date): string {
  const d = new Date(when);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type AggregateOptions<T> = {
  /** How many products to return. Z reports have always shown 10, closes 20. */
  topProductsLimit?: number;
  /** Supply to build the per-day series; omit when the caller does not need it. */
  createdAtOf?: (order: T) => Date;
};

// Generic over the caller's own row type so `createdAtOf` can reach fields
// this module does not care about (createdAt, ids) without widening the
// contract for everyone else.
export function aggregateOrders<T extends AggregatableOrder>(
  orders: T[],
  opts: AggregateOptions<T> = {},
): PeriodAggregate {
  const topProductsLimit = opts.topProductsLimit ?? 10;

  let salesTotal = 0;
  let salesCount = 0;
  let itemsCount = 0;
  let discountsTotal = 0;
  let totalRefunded = 0;
  const vatBreakdown: VatBreakdown = {};
  const productAgg: Record<string, { name: string; quantity: number; total: number }> = {};
  const days: Record<string, { date: string; sales: number; orders: number; items: number }> = {};

  for (const order of orders) {
    const refundsTotal = sum2(order.refunds.map((r) => r.amount));
    totalRefunded += refundsTotal;

    if (isFullyRefunded(order, refundsTotal)) continue;

    // What the customer actually paid for this order.
    const netTotal = order.total - refundsTotal;
    salesTotal += netTotal;
    salesCount += 1;
    itemsCount += order.itemCount;
    discountsTotal += order.discountTotal ?? 0;

    // Split that net across the lines EXACTLY (M-13). Each line used to round
    // on its own — `round(lineTotal × (1 − discountRatio) × (1 − refundRatio))`
    // — so the parts could sum to a cent or two either side of the whole, and
    // the VAT breakdown would then disagree with the order total it came from.
    const lineNets = apportion(order.items.map((i) => i.lineTotal), netTotal);

    order.items.forEach((item, idx) => {
      const netLineTotal = lineNets[idx];
      addToVatBreakdown(vatBreakdown, netLineTotal, item.vatRate ?? 10);
      productAgg[item.productName] ??= { name: item.productName, quantity: 0, total: 0 };
      productAgg[item.productName].quantity += item.quantity;
      productAgg[item.productName].total += netLineTotal;
    });

    if (opts.createdAtOf) {
      const key = dayKey(opts.createdAtOf(order));
      days[key] ??= { date: key, sales: 0, orders: 0, items: 0 };
      days[key].sales += netTotal;
      days[key].orders += 1;
      days[key].items += order.itemCount;
    }
  }

  // Payments and refunds are taken across EVERY order in the period, including
  // fully refunded ones: their payment and their refund cancel out. Dropping
  // the order but keeping its payment is exactly the C-10 defect.
  const payments = orders.flatMap((o) => o.payments);
  const refunds = orders.flatMap((o) => o.refunds);
  const byMethod = (rows: { method: string | null; amount: number }[], method: string, nullIs?: string) =>
    sum2(rows.filter((r) => r.method === method || (nullIs === method && r.method === null)).map((r) => r.amount));

  const grossCashTotal = byMethod(payments, "CASH");
  const grossCardTotal = byMethod(payments, "CARD");
  const grossVoucherTotal = byMethod(payments, "VOUCHER");

  // A refund with no method predates the column; it was cash at the time.
  const cashRefundsTotal = byMethod(refunds, "CASH", "CASH");
  const cardRefundsTotal = byMethod(refunds, "CARD");
  const voucherRefundsTotal = byMethod(refunds, "VOUCHER");

  return {
    salesTotal,
    salesCount,
    itemsCount,
    vatTotal: sum2(Object.values(vatBreakdown).map((v) => v.vat)),
    grossCashTotal,
    grossCardTotal,
    grossVoucherTotal,
    cashRefundsTotal,
    cardRefundsTotal,
    voucherRefundsTotal,
    cashTotal: grossCashTotal - cashRefundsTotal,
    cardTotal: grossCardTotal - cardRefundsTotal,
    voucherTotal: grossVoucherTotal - voucherRefundsTotal,
    discountsTotal,
    totalRefunded,
    vatBreakdown,
    topProducts: Object.values(productAgg)
      .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
      .slice(0, topProductsLimit),
    byDay: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** The Prisma `include` every caller needs to produce an AggregatableOrder. */
export const AGGREGATE_INCLUDE = { items: true, payments: true, refunds: true } as const;
