import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import { aggregateOrders, AGGREGATE_INCLUDE } from "@/lib/services/aggregate";
import { parseReportRange, ReportRangeError } from "@/lib/report-range";

// Sales report over a date range, grouped by day.
export const GET = withAuth(
  async (req) => {
  const url = new URL(req.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  // M-31 (Batch 2.4): bounded. These queries pull orders with their items and
  // payments; an unbounded range on a till is a memory stall mid-service.
  let fromStart: Date;
  let toEnd: Date;
  try {
    ({ fromStart, toEnd } = parseReportRange(fromStr, toStr));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ReportRangeError ? e.message : "Période invalide." },
      { status: 400 },
    );
  }

  const orders = await db.order.findMany({
    where: { createdAt: { gte: fromStart, lt: toEnd }, status: { in: ["COMPLETED", "REFUNDED"] } },
    include: AGGREGATE_INCLUDE,
  });

  // C-11 (Batch 3.2). This route used to filter to `status === "COMPLETED"`
  // and sum `o.total` at face value, so a PARTIAL refund was invisible and the
  // report overstated revenue — while the Z report for the same days netted it
  // off. It also ran cent values through `round2()`. Both gone: one shared
  // aggregation, integer cents, refunds netted.
  const agg = aggregateOrders(orders, { topProductsLimit: 15, createdAtOf: (o) => o.createdAt });

  return NextResponse.json({
    from: fromStart.toISOString(),
    to: toEnd.toISOString(),
    totalSales: agg.salesTotal,
    totalOrders: agg.salesCount,
    totalItems: agg.itemsCount,
    // Integer cents: an average is a display figure, and a fractional cent
    // here is what made this report disagree with every other one.
    avgTicket: agg.salesCount ? Math.round(agg.salesTotal / agg.salesCount) : 0,
    cashTotal: agg.cashTotal,
    cardTotal: agg.cardTotal,
    voucherTotal: agg.voucherTotal,
    totalRefunded: agg.totalRefunded,
    days: agg.byDay,
    topProducts: agg.topProducts,
  });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
