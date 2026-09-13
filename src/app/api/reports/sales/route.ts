import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import {
  aggregateOrders,
  AGGREGATE_INCLUDE,
  periodOrdersWhere,
  periodAggregateOptions,
} from "@/lib/services/aggregate";
import { parseReportRange, ReportRangeError } from "@/lib/report-range";
import { getSettings } from "@/lib/services/settings";

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
  let cutoffHour: number;
  // L-92 (R8.4): the trading-day cut-off, so this period is the same period
  // the sealed close used. Read here rather than defaulted, because a default
  // is exactly how this route and the closes came to disagree.
  const reportSettings = await getSettings();
  try {
    ({ fromStart, toEnd, cutoffHour } = parseReportRange(
      fromStr,
      toStr,
      reportSettings.businessDayCutoffHour,
    ));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ReportRangeError ? e.message : "Période invalide." },
      { status: 400 },
    );
  }

  const orders = await db.order.findMany({
    where: periodOrdersWhere(fromStart, toEnd),
    include: AGGREGATE_INCLUDE,
  });

  // C-11 (Batch 3.2). This route used to filter to `status === "COMPLETED"`
  // and sum `o.total` at face value, so a PARTIAL refund was invisible and the
  // report overstated revenue — while the Z report for the same days netted it
  // off. It also ran cent values through `round2()`. Both gone: one shared
  // aggregation, integer cents, refunds netted.
  const agg = aggregateOrders(orders, {
    topProductsLimit: 15,
    createdAtOf: (o) => o.createdAt,
    // Batch 5.3: the same period scope as the Z report and the sealed close.
    ...periodAggregateOptions(fromStart, toEnd),
  });

  return NextResponse.json({
    from: fromStart.toISOString(),
    to: toEnd.toISOString(),
    // L-92: the screen states the REAL boundaries, so « 1 août → 31 août »
    // never stands in for « 1 août 05:00 → 1 sept 05:00 ». The operator's
    // decision on 2026-09-13 was snap AND say so.
    cutoffHour,
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
    // DD-20 / L-50 (Batch 7.4a). Beside the sales, never inside them:
    // `avgTicket` above divides by `salesCount`, and the operator chose this
    // shape precisely so that figure stays truthful.
    givenAwayCount: agg.givenAwayCount,
    givenAwayItemsCount: agg.givenAwayItemsCount,
    givenAwayProducts: agg.givenAwayProducts,
    // L-77 (R2.2): « how many Menu Chill did I sell? ». Beside `topProducts`,
    // never instead of it — that list is what left the kitchen, this one is
    // what the customer ordered.
    topMenus: agg.topMenus,
  });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
