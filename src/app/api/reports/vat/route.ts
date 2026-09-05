import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import { sum2 } from "@/lib/money";
import {
  aggregateOrders,
  AGGREGATE_INCLUDE,
  periodOrdersWhere,
  periodAggregateOptions,
} from "@/lib/services/aggregate";
import { parseReportRange, ReportRangeError } from "@/lib/report-range";

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
    where: periodOrdersWhere(fromStart, toEnd),
    include: AGGREGATE_INCLUDE,
  });

  // C-11 (Batch 3.2). This route used to run its own aggregation and pass
  // CENT values through `round2()` — a euros helper — so a pro-rated line kept
  // a half-cent (round2(1250 × 0.85) = 1062.5) where the Z report produced
  // 1063. This is the figure a manager reads to file the TVA declaration, so
  // it disagreeing with the Z report and the sealed close for the same period
  // meant three official-looking numbers, all different. It now shares the one
  // aggregation, in integer cents throughout.
  // Batch 5.3: the same period scope the sealed close uses, so a refund paid in
  // one month against another month's sale reduces the VAT of the month that
  // paid it — the month whose close and Z reports already say so.
  const agg = aggregateOrders(orders, periodAggregateOptions(fromStart, toEnd));

  const rows = Object.entries(agg.vatBreakdown)
    .map(([rateStr, v]) => ({ rate: Number(rateStr), ht: v.ht, vat: v.vat, ttc: v.ttc }))
    .sort((a, b) => a.rate - b.rate);

  return NextResponse.json({
    from: fromStart.toISOString(),
    to: toEnd.toISOString(),
    totalHt: sum2(rows.map((r) => r.ht)),
    totalVat: sum2(rows.map((r) => r.vat)),
    totalTtc: sum2(rows.map((r) => r.ttc)),
    rows,
  });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
