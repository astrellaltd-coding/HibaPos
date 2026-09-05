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
//
// C-14 / DD-10 (Batch 5.3) added the one thing "the period" had never had to
// say: which REFUNDS are its own. Until then a refund could not outlive the
// shift that took the sale, so `orders.flatMap(o => o.refunds)` was both the
// order's refunds and the period's. DD-10 allows a refund for a previous day's
// sale out of today's till, and the two sets come apart. The rule now is:
//
//   a period books the SALES of its own orders, and the CORRECTIONS it issued.
//
// An order refunded by a later period contributes, to that later period, the
// DIFFERENCE between its state before and after — so the periods telescope and
// a month still equals the sum of the Z reports inside it, whichever till paid.

import { addVatMoveToBreakdown, apportion, sum2, type VatBreakdown } from "@/lib/money";
// Type-only: names the two statuses Prisma expects in a `where`. No runtime
// import, so this module still pulls in no database client.
import type { OrderStatus } from "@prisma/client";
// DD-20 (Batch 7.4a): the give-away tender's spelling, from the module that
// owns it. `tender-policy.ts` imports nothing, so this adds no weight.
import { OFFERT } from "@/lib/tender-policy";

export type AggregatableItem = {
  productName: string;
  quantity: number;
  lineTotal: number;
  vatRate: number | null;
};

export type AggregatablePayment = { method: string | null; amount: number };
export type AggregatableRefund = {
  method: string | null;
  amount: number;
  /** When the money went back. Optional only so a hand-built fixture need not
   *  supply one; every Prisma row has it (`@default(now())`). Used to date a
   *  correction that belongs to a different period from the sale it corrects. */
  createdAt?: Date;
  /** The till that PAID this refund out (Batch 5.3) — not the till that took
   *  the sale. `processRefund` writes the shift that was open at the time. */
  shiftId?: string | null;
  /** DD-21 / L-44 (Batch 7.4a): who ISSUED the refund. The cashier report
   *  books a correction to the person who handed the money back. */
  cashierId?: string | null;
};

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
  /** M-07 (Batch 3.6): how many refunds, not just how much. A day with one
   *  40 € refund and a day with eight 5 € refunds are different days. */
  refundsCount: number;
  vatBreakdown: VatBreakdown;
  topProducts: { name: string; quantity: number; total: number }[];
  /** Per-day sales, net of refunds, keyed YYYY-MM-DD in local time. */
  byDay: { date: string; sales: number; orders: number; items: number }[];

  // ── DD-20 / L-50 (Batch 7.4a): given-away orders, counted BESIDE the sales
  //    figures and never inside them. ──────────────────────────────────────
  //
  // A give-away is a 100 % discount settled with the OFFERT tender — which
  // exists because M-11 made a zero-total order unpayable at all. Until this
  // batch such an order was **invisible**: `isFullyRefunded` opens
  // `refundsTotal >= order.total`, and for a zero total that is `0 >= 0`, so
  // the order was classified as fully refunded and dropped from every count.
  // The branch was unreachable before Batch 5.7b, so its meaning had never
  // been tested against this case, and "given away" is not "refunded".
  //
  // The operator chose (DD-20) to keep it out of `salesCount` and
  // `topProducts` — so *average spend per meal* stays truthful and "top
  // products" keeps meaning what SOLD — and to show it separately instead.
  // Nothing above this comment changed: a give-away still contributes 0 to
  // every money figure, because it is zero.
  /** Orders given away: total 0, settled with the OFFERT tender. */
  givenAwayCount: number;
  /** Items on those orders. */
  givenAwayItemsCount: number;
  /** What was given away, most-given first — the "which dishes" half of DD-20. */
  givenAwayProducts: { name: string; quantity: number }[];
};

/**
 * Does this order contribute to sales?
 *
 * A fully refunded order does not. The two conditions are belt and braces on
 * purpose: `status === "REFUNDED"` is the intent, `refunds >= total` is the
 * arithmetic, and before Batch 3.2 the shift report checked both while the
 * period aggregation checked only the second. Unified to the stricter of the
 * two so a period and its shifts can never disagree about which orders count.
 *
 * `ignoreStatus` (C-14 / DD-10, Batch 5.3) drops the status arm, and it is not
 * a weakening. `Order.status` is CURRENT state, so it cannot answer a question
 * about a past period: once a cross-shift refund flips an order to `REFUNDED`,
 * the status arm would retroactively drop that sale out of the shift that made
 * it — and that shift's Z report is sealed and says otherwise. A period-scoped
 * caller therefore asks the arithmetic only, evaluated on the refunds that had
 * happened by the end of the period it is asking about. Nothing diverges for
 * data this application wrote: `refund.ts` sets `REFUNDED` exactly when
 * `totalRefunded >= total`, so the two arms agree row for row.
 */
function isFullyRefunded(
  order: AggregatableOrder,
  refundsTotal: number,
  ignoreStatus = false,
): boolean {
  if (refundsTotal >= order.total) return true;
  return !ignoreStatus && order.status === "REFUNDED";
}

/**
 * Was this order GIVEN AWAY rather than refunded? — DD-20 / L-50 (Batch 7.4a).
 *
 * Keyed on the TENDER, not on the total. A zero total is what makes the order
 * fall out of `isFullyRefunded`, but it is a symptom: an `OFFERT` payment line
 * is the operator's statement of intent, and `tender-policy.ts` already
 * guarantees such a line carries 0, is the only line, and is accepted only
 * when the total is 0. Both conditions are asserted here anyway, because this
 * function decides what a report says and should not inherit its correctness
 * from another module's invariants.
 *
 * A zero-total order with no OFFERT line therefore stays uncounted, exactly as
 * before — the conservative reading, and unreachable for data this application
 * writes.
 */
function isGiveaway(order: AggregatableOrder): boolean {
  return order.total === 0 && order.payments.some((p) => p.method === OFFERT);
}

/** An order's aggregated state once `refundedSoFar` cents have been given back. */
type OrderState = { counted: boolean; netTotal: number; lineNets: number[] };

/**
 * The order's state at a point in its refund history — the one place that
 * decides whether an order counts and how its net splits across its lines.
 *
 * `apportion` is never handed a negative target from here: `netTotal` is zero
 * once the order is fully refunded and `total - refundedSoFar` otherwise. The
 * negatives a correction produces are DIFFERENCES between two of these states,
 * which is what makes the periods telescope.
 */
function orderStateAt(
  order: AggregatableOrder,
  refundedSoFar: number,
  ignoreStatus: boolean,
): OrderState {
  if (isFullyRefunded(order, refundedSoFar, ignoreStatus)) {
    return { counted: false, netTotal: 0, lineNets: order.items.map(() => 0) };
  }
  const netTotal = order.total - refundedSoFar;
  return {
    counted: true,
    netTotal,
    lineNets: apportion(order.items.map((i) => i.lineTotal), netTotal),
  };
}

/** Local-date key, matching what the sales report has always grouped by. */
function dayKey(when: Date): string {
  const d = new Date(when);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The per-order primitive: does this order count, what did the customer
 * actually pay, and how does that net split across its lines?
 *
 * Exposed (Batch 3.2b) because some reports must group by something
 * `aggregateOrders` does not return — by cashier, by hour, by product id.
 * They group the orders themselves and use this, so there is still exactly
 * one set of rules for what counts and one apportionment, rather than each
 * report inventing its own arithmetic. `aggregateOrders` below is built on it.
 */
export function orderNet(
  order: AggregatableOrder,
  refunds: AggregatableRefund[] = order.refunds,
): {
  counted: boolean;
  refundsTotal: number;
  netTotal: number;
  lineNets: number[];
} {
  const refundsTotal = sum2(refunds.map((r) => r.amount));
  const state = orderStateAt(order, refundsTotal, false);
  return { counted: state.counted, refundsTotal, netTotal: state.netTotal, lineNets: state.lineNets };
}

/** Where a refund sits relative to the period being aggregated (Batch 5.3). */
export type RefundPosition = "before" | "in" | "after";

export type AggregateOptions<T> = {
  /** How many products to return. Z reports have always shown 10, closes 20. */
  topProductsLimit?: number;
  /** Supply to build the per-day series; omit when the caller does not need it. */
  createdAtOf?: (order: T) => Date;
  /**
   * C-14 / DD-10 (Batch 5.3) — where each refund sits relative to this period.
   *
   * Until this batch a refund could not outlive its order's shift, so "the
   * order's refunds" and "the period's refunds" were the same set and this
   * module simply used `order.refunds`. DD-10 allows a refund for a previous
   * day's sale, paid out of TODAY's till, which separates them: the money left
   * the drawer that is open now, while the order belongs to a shift whose Z is
   * sealed. Sourcing refunds from the refunded ORDER would have left today's
   * `expectedCash` short by the amount handed over, with no report accounting
   * for the shortfall.
   *
   * The rule this option expresses: **a period books the sales of its own
   * orders and the corrections it itself issued.** Defaults to `"in"` for every
   * refund, which is the pre-5.3 behaviour and stays correct for any caller
   * whose scope is not a period — grouping by cashier, by product, by customer.
   */
  refundPosition?: (refund: AggregatableRefund) => RefundPosition;
  /**
   * C-14 / DD-10 (Batch 5.3) — whether this order's SALE belongs to the period.
   *
   * An order that fails this test is present only because the period issued a
   * refund against it. Its sale was counted where it was made and must not be
   * counted again; its payments belong to that period's drawer, not this one.
   * What it contributes here is the CHANGE its corrections made — which is why
   * the sums telescope, and why every granularity (shift, month, year) can be
   * added up from the ones below it. Defaults to `true` for every order.
   */
  saleInPeriod?: (order: T) => boolean;
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
  // DD-20: kept in their own accumulators, never mixed into the ones above.
  let givenAwayCount = 0;
  let givenAwayItemsCount = 0;
  const givenAwayAgg: Record<string, { name: string; quantity: number }> = {};

  // Payments and refunds are taken across EVERY order whose sale is in the
  // period, including fully refunded ones: their payment and their refund
  // cancel out. Dropping the order but keeping its payment is the C-10 defect.
  // An order that is here only to carry one of the period's corrections
  // contributes its refunds and NOT its payments — those were taken by another
  // drawer (Batch 5.3).
  const payments: AggregatablePayment[] = [];
  const refunds: AggregatableRefund[] = [];

  // Batch 5.3. Every caller that scopes by a period supplies both options, so
  // the period-scoped `counted` rule and the period-scoped refund set arrive
  // together and cannot drift apart. A caller that groups by something else —
  // cashier, product, customer — supplies neither and keeps 3.2's semantics.
  const periodScoped = Boolean(opts.refundPosition || opts.saleInPeriod);
  const positionOf = opts.refundPosition ?? (() => "in" as const);

  for (const order of orders) {
    const here: AggregatableRefund[] = [];
    let refundedBefore = 0;
    for (const r of order.refunds) {
      const where = positionOf(r);
      if (where === "in") here.push(r);
      else if (where === "before") refundedBefore += r.amount;
    }
    const refundedHere = sum2(here.map((r) => r.amount));
    totalRefunded += refundedHere;
    refunds.push(...here);

    const before = orderStateAt(order, refundedBefore, periodScoped);
    const after = orderStateAt(order, refundedBefore + refundedHere, periodScoped);

    if (!(opts.saleInPeriod?.(order) ?? true)) {
      // A correction to a sale some other period booked. Contribute the CHANGE
      // only: the difference between the order's state at the start of this
      // period and at its end. Summed across periods these differences
      // telescope, so the sealed Z reports of a month still add up to the
      // month's own close — which is what Batch 3.2 exists to guarantee.
      if (refundedHere === 0) continue;
      salesTotal += after.netTotal - before.netTotal;
      salesCount += (after.counted ? 1 : 0) - (before.counted ? 1 : 0);
      itemsCount += (after.counted ? order.itemCount : 0) - (before.counted ? order.itemCount : 0);
      discountsTotal +=
        ((after.counted ? 1 : 0) - (before.counted ? 1 : 0)) * (order.discountTotal ?? 0);

      order.items.forEach((item, idx) => {
        addVatMoveToBreakdown(vatBreakdown, before.lineNets[idx], after.lineNets[idx], item.vatRate ?? 10);
        productAgg[item.productName] ??= { name: item.productName, quantity: 0, total: 0 };
        // Revenue moves, quantity does not: nothing was sold or un-sold here,
        // so a correction must not change how many of a product went out.
        productAgg[item.productName].total += after.lineNets[idx] - before.lineNets[idx];
      });

      if (opts.createdAtOf) {
        // Dated by the last of this period's refunds on the order — the moment
        // the order's net reached the value this period is reporting. Falls
        // back to the order's own date only for a fixture whose refunds carry
        // none; without it `Σ byDay.sales` would stop equalling `salesTotal`.
        const when = here.reduce<Date | null>(
          (acc, r) => (r.createdAt && (!acc || r.createdAt > acc) ? r.createdAt : acc),
          null,
        );
        const key = dayKey(when ?? opts.createdAtOf(order));
        days[key] ??= { date: key, sales: 0, orders: 0, items: 0 };
        days[key].sales += after.netTotal - before.netTotal;
        days[key].orders += (after.counted ? 1 : 0) - (before.counted ? 1 : 0);
        days[key].items += (after.counted ? order.itemCount : 0) - (before.counted ? order.itemCount : 0);
      }
      continue;
    }

    payments.push(...order.payments);

    // The order's sale belongs here, so `refundedBefore` is zero — nothing can
    // be given back before the sale that earned it — and `after` is the whole
    // of this order's contribution rather than a difference.
    if (!after.counted) {
      // DD-20 / L-50. An order arrives here for one of two reasons, and until
      // this batch they were indistinguishable: it was fully refunded, or it
      // was given away. `isGiveaway` separates them on the tender, not on the
      // total — a zero total is a symptom, an OFFERT line is the intent, and
      // DD-14 created that tender precisely so the two stay separable.
      //
      // Deliberately NOT `continue`-ing into the sales arithmetic: a give-away
      // adds nothing to salesTotal, salesCount, itemsCount, topProducts, the
      // VAT breakdown or byDay. That is the whole of the operator's choice.
      if (isGiveaway(order)) {
        givenAwayCount += 1;
        givenAwayItemsCount += order.itemCount;
        for (const item of order.items) {
          givenAwayAgg[item.productName] ??= { name: item.productName, quantity: 0 };
          givenAwayAgg[item.productName].quantity += item.quantity;
        }
      }
      continue;
    }

    salesTotal += after.netTotal;
    salesCount += 1;
    itemsCount += order.itemCount;
    discountsTotal += order.discountTotal ?? 0;

    order.items.forEach((item, idx) => {
      const netLineTotal = after.lineNets[idx];
      addVatMoveToBreakdown(vatBreakdown, 0, netLineTotal, item.vatRate ?? 10);
      productAgg[item.productName] ??= { name: item.productName, quantity: 0, total: 0 };
      productAgg[item.productName].quantity += item.quantity;
      productAgg[item.productName].total += netLineTotal;
    });

    if (opts.createdAtOf) {
      const key = dayKey(opts.createdAtOf(order));
      days[key] ??= { date: key, sales: 0, orders: 0, items: 0 };
      days[key].sales += after.netTotal;
      days[key].orders += 1;
      days[key].items += order.itemCount;
    }
  }

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
    refundsCount: refunds.length,
    vatBreakdown,
    topProducts: Object.values(productAgg)
      .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
      .slice(0, topProductsLimit),
    byDay: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)),
    givenAwayCount,
    givenAwayItemsCount,
    givenAwayProducts: Object.values(givenAwayAgg)
      .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
      .slice(0, topProductsLimit),
  };
}

// ---------------------------------------------------------------------------
// Cash movements (M-05 / DD-12, Batch 5.5)
// ---------------------------------------------------------------------------
//
// Kept OUT of `aggregateOrders`, deliberately. A movement is not an order and
// has no lines, no VAT and no tender — folding it in would mean widening the
// order contract for something that shares none of it. What it shares is the
// drawer, so it is summed here and added where `expectedCash` is computed. Both
// period scopes call this one function, for the reason Batch 3.2 exists: a Z
// report and the close containing it must not do their own arithmetic.

export type AggregatableCashMovement = {
  category: string;
  /** SIGNED cents: positive into the drawer, negative out of it. */
  amount: number;
};

export type CashMovementAggregate = {
  /** Money that went IN, as a positive number. */
  cashIn: number;
  /** Money that went OUT, also as a positive number — a sealed document should
   *  state what went in and what went out, not their difference. */
  cashOut: number;
  /** `cashIn - cashOut`: what the drawer is up by. This is the figure
   *  `expectedCash` adds, and the only one that carries a sign. */
  net: number;
  count: number;
  /** Per category, signed, so "how much went to suppliers" is answerable —
   *  which is the whole reason DD-12 chose a fixed list over free text. */
  byCategory: Record<string, number>;
};

export function aggregateCashMovements(
  movements: AggregatableCashMovement[],
): CashMovementAggregate {
  let cashIn = 0;
  let cashOut = 0;
  const byCategory: Record<string, number> = {};
  for (const m of movements) {
    if (m.amount >= 0) cashIn += m.amount;
    else cashOut += -m.amount;
    byCategory[m.category] = (byCategory[m.category] ?? 0) + m.amount;
  }
  return { cashIn, cashOut, net: cashIn - cashOut, count: movements.length, byCategory };
}

/**
 * DD-21 / L-44 (Batch 7.4a) — one cashier's slice of a period.
 *
 * The cashier report groups the period's orders itself and hands each bucket
 * here. Two dimensions have to be answered at once, and until this batch only
 * the second was:
 *
 *   * **the sale** belongs to the cashier who took it, inside the range;
 *   * **the refund** belongs to the cashier who ISSUED it — `Refund.cashierId`
 *     — not to the one who made the sale it corrects.
 *
 * A refund somebody else issued is positioned `"after"` rather than `"before"`:
 * `"before"` would fold it into this cashier's baseline and quietly net it off
 * their takings, which is the behaviour DD-21 replaced. `"after"` leaves their
 * line showing the sale they made, and the correction shows on the line of the
 * person who handed the money back — which is also what their drawer did.
 */
export const cashierAggregateOptions = <T extends { cashierId: string | null; createdAt: Date }>(
  cashierId: string,
  from: Date,
  to: Date,
): AggregateOptions<T> => ({
  saleInPeriod: (o) => o.cashierId === cashierId && o.createdAt >= from && o.createdAt < to,
  refundPosition: (r) => {
    if (r.cashierId !== cashierId) return "after";
    if (!r.createdAt) return "in";
    if (r.createdAt < from) return "before";
    return r.createdAt < to ? "in" : "after";
  },
});

/** A shift's own movements: the till the money physically moved through. */
export const shiftCashMovementsWhere = (shiftId: string) => ({ shiftId });

/** A date range's movements, by when the money moved — the same rule Batch 5.3
 *  established for refunds, so a period books the movements IT made. */
export const periodCashMovementsWhere = (from: Date, to: Date) => ({
  createdAt: { gte: from, lt: to },
});

/** The Prisma `include` every caller needs to produce an AggregatableOrder.
 *  `refunds: true` brings ALL of an order's refunds, not just this period's —
 *  `refundPosition` needs the ones an earlier period already booked in order
 *  to know what this period actually changed (Batch 5.3). */
export const AGGREGATE_INCLUDE = { items: true, payments: true, refunds: true } as const;

// ---------------------------------------------------------------------------
// Period scopes (C-14 / DD-10, Batch 5.3)
// ---------------------------------------------------------------------------
//
// The `where` and the options below are stated together because they have to
// agree: the query decides which orders reach the aggregation and the options
// decide what each of them contributes, and a period that fetched one set while
// filtering by another would lose money silently. Both are plain values — this
// module still holds no database, no dates of its own and no HTTP.
//
// Each `where` reads: the period's own orders, PLUS any order the period issued
// a refund against. The second arm is the whole of C-14 — without it today's
// report never selects yesterday's order and today's `expectedCash` is short by
// the cash handed over the counter.

/** A fresh array each call: Prisma's `in` filter is not readonly. */
const saleable = (): { in: OrderStatus[] } => ({ in: ["COMPLETED", "REFUNDED"] });

/** Orders a shift must aggregate: its own, plus any it refunded. */
export const shiftOrdersWhere = (shiftId: string) => ({
  status: saleable(),
  OR: [{ shiftId }, { refunds: { some: { shiftId } } }],
});

/**
 * How a shift positions a refund.
 *
 * A refund carrying no `shiftId` is attributed to no shift at all — it is not
 * quietly handed to the shift that owns the order, which is the very
 * attribution this batch removed. Nothing can write one: `processRefund`
 * refuses when no till is open. `openedAt` orders the rest, so a refund issued
 * before this shift opened is part of the baseline it measures change against.
 */
export const shiftAggregateOptions = <T extends { shiftId: string | null }>(
  shiftId: string,
  openedAt: Date,
): AggregateOptions<T> => ({
  saleInPeriod: (o) => o.shiftId === shiftId,
  refundPosition: (r) => {
    if (r.shiftId === shiftId) return "in";
    return r.createdAt && r.createdAt < openedAt ? "before" : "after";
  },
});

/** Orders a date range must aggregate: its own, plus any it refunded. */
export const periodOrdersWhere = (from: Date, to: Date) => ({
  status: saleable(),
  OR: [
    { createdAt: { gte: from, lt: to } },
    { refunds: { some: { createdAt: { gte: from, lt: to } } } },
  ],
});

/** How a half-open `[from, to)` range positions an order and a refund. */
export const periodAggregateOptions = <T extends { createdAt: Date }>(
  from: Date,
  to: Date,
): AggregateOptions<T> => ({
  saleInPeriod: (o) => o.createdAt >= from && o.createdAt < to,
  // A refund with no date cannot be placed on a timeline, so it is treated as
  // this period's — the module's own default, and the choice that reports the
  // money somewhere rather than dropping it. Unreachable from stored data:
  // `Refund.createdAt` is `@default(now())`.
  refundPosition: (r) => {
    if (!r.createdAt) return "in";
    if (r.createdAt < from) return "before";
    return r.createdAt < to ? "in" : "after";
  },
});
