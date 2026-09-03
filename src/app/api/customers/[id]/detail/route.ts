import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams } from "@/lib/api-handler";
import { aggregateOrders, orderNet, AGGREGATE_INCLUDE } from "@/lib/services/aggregate";

// Returns a customer's profile + order history + aggregated stats.
export const GET = withAuthParams(async (_req, { params }) => {
  const customer = await db.customer.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      notes: true,
      createdAt: true,
    },
  });
  if (!customer) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

  const orders = await db.order.findMany({
    where: { customerId: params.id, status: { in: ["COMPLETED", "REFUNDED"] } },
    include: {
      ...AGGREGATE_INCLUDE,
      cashier: { select: { name: true } },
      shift: { select: { number: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // L-23 (Batch 3.2b): the customer panel shares the one aggregation too, so
  // "spent" here means what every other report means by it — net of refunds,
  // in integer cents. It used to sum `o.total` at face value and divide for a
  // fractional-cent average.
  const agg = aggregateOrders(orders, { topProductsLimit: 5 });
  const completed = orders.filter((o) => o.status === "COMPLETED");
  const totalSpent = agg.salesTotal;
  const totalOrders = agg.salesCount;
  const totalItems = agg.itemsCount;
  const avgTicket = totalOrders > 0 ? Math.round(totalSpent / totalOrders) : 0;
  const lastVisit = completed[0]?.createdAt ?? null;
  const firstVisit = completed[completed.length - 1]?.createdAt ?? null;

  const favoriteProducts = agg.topProducts;

  // Payment method breakdown
  const methodAgg: Record<string, { amount: number; count: number }> = {};
  for (const o of orders) {
    if (!orderNet(o).counted) continue;
    for (const p of o.payments) {
      methodAgg[p.method] ??= { amount: 0, count: 0 };
      methodAgg[p.method].amount += p.amount;
      methodAgg[p.method].count += 1;
    }
  }
  const paymentBreakdown = Object.entries(methodAgg).map(([method, v]) => ({ method, ...v }));

  return NextResponse.json({
    ...customer,
    stats: {
      totalSpent,
      totalOrders,
      totalItems,
      avgTicket,
      lastVisit,
      firstVisit,
    },
    favoriteProducts,
    paymentBreakdown,
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      orderType: o.orderType,
      tableLabel: o.tableLabel,
      total: o.total,
      itemCount: o.itemCount,
      createdAt: o.createdAt,
      cashierName: o.cashier?.name ?? "—",
      shiftNumber: o.shift?.number ?? null,
      items: o.items.map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
      })),
      payments: o.payments.map((p) => ({ method: p.method, amount: p.amount })),
    })),
  });
});
