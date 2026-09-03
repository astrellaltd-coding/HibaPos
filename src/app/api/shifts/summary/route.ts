import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import { aggregateOrders, AGGREGATE_INCLUDE } from "@/lib/services/aggregate";

export const GET = withAuth(async () => {
  // The business invariant is ONE open shift at a time (see POST /api/shifts'
  // 409 guard). Query the open shift itself rather than filtering by the
  // caller — previously any cashier other than the shift opener got a 404
  // on a shared till.
  const shift = await db.shift.findFirst({
    where: { status: "OPEN" },
    orderBy: { openedAt: "desc" },
    include: {
      openedBy: { select: { name: true } },
      orders: {
        include: AGGREGATE_INCLUDE,
      },
    },
  });

  if (!shift) {
    return NextResponse.json({ error: "Aucune caisse ouverte." }, { status: 404 });
  }

  const orders = shift.orders;

  // M-14 (Batch 3.2). This panel was a fourth aggregation semantic: it counted
  // only `status === "COMPLETED"` orders at face value, so it disagreed with
  // both the X and the Z report for the very same shift — the one place an
  // operator would notice mid-service. It now shares the aggregation those
  // reports use.
  const agg = aggregateOrders(orders, { topProductsLimit: 10 });

  const summary = {
    shiftId: shift.id,
    shiftNumber: shift.number,
    openedAt: shift.openedAt,
    openedBy: shift.openedBy?.name ?? null,
    openingFloat: shift.openingFloat,
    totalOrders: orders.length,
    completedOrders: agg.salesCount,
    refundedOrders: orders.filter((o) => o.status === "REFUNDED").length,
    cancelledOrders: orders.filter((o) => o.status === "CANCELLED").length,
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
    expectedCash: shift.openingFloat + agg.grossCashTotal - agg.cashRefundsTotal,
  };

  return NextResponse.json(summary);
});
