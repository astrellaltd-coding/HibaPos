import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import {
  aggregateOrders,
  aggregateCashMovements,
  AGGREGATE_INCLUDE,
  shiftOrdersWhere,
  shiftAggregateOptions,
  shiftCashMovementsWhere,
} from "@/lib/services/aggregate";

export const GET = withAuth(async () => {
  // The business invariant is ONE open shift at a time (see POST /api/shifts'
  // 409 guard). Query the open shift itself rather than filtering by the
  // caller — previously any cashier other than the shift opener got a 404
  // on a shared till.
  const shift = await db.shift.findFirst({
    where: { status: "OPEN" },
    orderBy: { openedAt: "desc" },
    include: { openedBy: { select: { name: true } } },
  });

  if (!shift) {
    return NextResponse.json({ error: "Aucune caisse ouverte." }, { status: 404 });
  }

  // C-14 / DD-10 (Batch 5.3). Two sets, deliberately. `orders` is this shift's
  // own — the counts below describe the till's own trading and must not grow
  // because it refunded somebody else's ticket. `aggregationInput` adds the
  // orders this shift refunded, so the money figures match the X report for the
  // same shift; the panel disagreeing with the X report is M-14 all over again.
  const aggregationInput = await db.order.findMany({
    where: shiftOrdersWhere(shift.id),
    include: AGGREGATE_INCLUDE,
  });
  const orders = aggregationInput.filter((o) => o.shiftId === shift.id);

  // M-14 (Batch 3.2). This panel was a fourth aggregation semantic: it counted
  // only `status === "COMPLETED"` orders at face value, so it disagreed with
  // both the X and the Z report for the very same shift — the one place an
  // operator would notice mid-service. It now shares the aggregation those
  // reports use.
  const agg = aggregateOrders(aggregationInput, {
    topProductsLimit: 10,
    ...shiftAggregateOptions(shift.id, shift.openedAt),
  });

  // L-48 (Batch 7.4a). This panel computed `expectedCash` WITHOUT the
  // cash-movement term, so it and `GET /api/reports/x` answered differently for
  // the same till the moment one movement existed — measured on a copy of
  // production during Batch 5.6's walkthrough at **21 580 versus 26 580** after
  // a single +50,00 € approvisionnement.
  //
  // That is M-14's "fourth aggregation semantic" reopening at the very endpoint
  // M-14 was about. Batch 5.5 moved five aggregation callers onto `cash.net`
  // and its record names all five; this was the one it did not carry across.
  //
  // Same scoping as `reports.ts`: the till the money physically moved through.
  const movements = await db.cashMovement.findMany({
    where: shiftCashMovementsWhere(shift.id),
    select: { category: true, amount: true },
  });
  const cash = aggregateCashMovements(movements);

  const summary = {
    shiftId: shift.id,
    shiftNumber: shift.number,
    openedAt: shift.openedAt,
    openedBy: shift.openedBy?.name ?? null,
    openingFloat: shift.openingFloat,
    totalOrders: orders.length,
    completedOrders: agg.salesCount,
    refundedOrders: orders.filter((o) => o.status === "REFUNDED").length,
    // M-08 / DD-13 (Batch 5.6): `cancelledOrders` was here, filtering for a
    // status nothing ever wrote. One producer, zero consumers — it reported 0
    // forever, which is worse than absent: a zero reads as "none today".
    subtotal: orders
      .filter((o) => o.status === "COMPLETED")
      .reduce((s, o) => s + o.subtotal, 0),
    discountTotal: agg.discountsTotal,
    vatTotal: agg.vatTotal,
    total: agg.salesTotal,
    payments: {
      CASH: agg.cashTotal,
      CARD: agg.cardTotal,
      VOUCHER: agg.voucherTotal,
    },
    refundedTotal: agg.totalRefunded,
    // The same expression as `computeShiftReport`, term for term. If these two
    // ever diverge again, `report-agreement.test.ts` fails — that is the point
    // of writing the assertion rather than measuring it once by hand.
    expectedCash:
      shift.openingFloat + agg.grossCashTotal - agg.cashRefundsTotal + cash.net,
  };

  return NextResponse.json(summary);
});
