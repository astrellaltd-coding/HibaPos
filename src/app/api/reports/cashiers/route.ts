import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import { sum2 } from "@/lib/money";
import { aggregateOrders, AGGREGATE_INCLUDE } from "@/lib/services/aggregate";
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
    where: {
      createdAt: { gte: fromStart, lt: toEnd },
      status: { in: ["COMPLETED", "REFUNDED"] },
    },
    include: { ...AGGREGATE_INCLUDE, cashier: { select: { id: true, name: true, username: true } } },
  });

  // L-23 (Batch 3.2b). This report summed payments GROSS and never netted
  // refunds off them — the same shape as C-10, in a management report — and
  // ran cent values through round2(). Group the orders by cashier and hand
  // each group to the one aggregation, so a cashier's line here uses exactly
  // the arithmetic the Z report uses.
  const byCashier = new Map<string, typeof orders>();
  for (const order of orders) {
    if (!order.cashier) continue;
    const bucket = byCashier.get(order.cashier.id) ?? [];
    bucket.push(order);
    byCashier.set(order.cashier.id, bucket);
  }

  const rows = Array.from(byCashier.values())
    .map((group) => {
      const c = group[0].cashier!;
      const agg = aggregateOrders(group);
      return {
        cashierId: c.id,
        name: c.name,
        username: c.username,
        orders: agg.salesCount,
        items: agg.itemsCount,
        salesTotal: agg.salesTotal,
        cashTotal: agg.cashTotal,
        cardTotal: agg.cardTotal,
        voucherTotal: agg.voucherTotal,
        refundsTotal: agg.totalRefunded,
      };
    })
    .sort((a, b) => b.salesTotal - a.salesTotal);

  return NextResponse.json({
    from: fromStart.toISOString(),
    to: toEnd.toISOString(),
    totalCashiers: rows.length,
    totalSales: sum2(rows.map((r) => r.salesTotal)),
    totalOrders: sum2(rows.map((r) => r.orders)),
    totalItems: sum2(rows.map((r) => r.items)),
    rows,
  });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
