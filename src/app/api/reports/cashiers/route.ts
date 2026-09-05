import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import { sum2 } from "@/lib/money";
import {
  aggregateOrders,
  AGGREGATE_INCLUDE,
  periodOrdersWhere,
  cashierAggregateOptions,
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

  // DD-21 / L-44 (Batch 7.4a): the fiscal scope, so an order refunded in this
  // range is present even when it was sold before it.
  const orders = await db.order.findMany({
    where: periodOrdersWhere(fromStart, toEnd),
    include: { ...AGGREGATE_INCLUDE, cashier: { select: { id: true, name: true, username: true } } },
  });

  // L-23 (Batch 3.2b). This report summed payments GROSS and never netted
  // refunds off them — the same shape as C-10, in a management report — and
  // ran cent values through round2(). Group the orders by cashier and hand
  // each group to the one aggregation, so a cashier's line here uses exactly
  // the arithmetic the Z report uses.
  // DD-21 / L-44 (Batch 7.4a). An order lands in a cashier's bucket if they
  // SOLD it **or** if they issued one of its refunds — the second is new, and
  // it is what lets a correction be booked to the person who handed the money
  // back. `cashierAggregateOptions` then decides, per bucket, which of the two
  // the order is doing there.
  const names = new Map<string, { id: string; name: string; username: string }>();
  const byCashier = new Map<string, typeof orders>();
  const bucket = (id: string) => {
    const b = byCashier.get(id) ?? [];
    byCashier.set(id, b);
    return b;
  };
  for (const order of orders) {
    if (order.cashier) {
      names.set(order.cashier.id, order.cashier);
      bucket(order.cashier.id).push(order);
    }
    for (const r of order.refunds) {
      if (!r.cashierId || r.cashierId === order.cashier?.id) continue;
      bucket(r.cashierId).push(order);
    }
  }

  // A refunding cashier who sold nothing in the range still needs a name.
  const missing = Array.from(byCashier.keys()).filter((id) => !names.has(id));
  if (missing.length) {
    for (const u of await db.user.findMany({
      where: { id: { in: missing } },
      select: { id: true, name: true, username: true },
    })) {
      names.set(u.id, u);
    }
  }

  const rows = Array.from(byCashier.entries())
    .map(([cashierId, group]) => {
      const c = names.get(cashierId) ?? { id: cashierId, name: "—", username: "—" };
      const agg = aggregateOrders(group, cashierAggregateOptions(cashierId, fromStart, toEnd));
      return {
        cashierId,
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
