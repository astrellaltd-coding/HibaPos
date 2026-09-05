import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import { round2 } from "@/lib/money";
import {
  aggregateOrders,
  orderNet,
  AGGREGATE_INCLUDE,
  periodOrdersWhere,
  periodAggregateOptions,
} from "@/lib/services/aggregate";

// Sales KPIs, payment breakdowns and week-over-week comparisons are
// manager-level data (nav-config restricts the dashboard view to
// MANAGER+). Server-side gate enforces it regardless of UI state.
export const GET = withAuth(
  async () => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  // DD-21 / L-44 (Batch 7.4a). The scope is now the FISCAL one: today's own
  // orders, plus any order today issued a refund against. Before this, a
  // refund paid today for yesterday's sale reduced YESTERDAY here and TODAY in
  // `/api/reports/sales` — two figures for the same day, on the two screens a
  // manager compares first.
  const todayOrders = await db.order.findMany({
    where: periodOrdersWhere(startOfDay, endOfDay),
    include: AGGREGATE_INCLUDE,
  });

  // L-23 (Batch 3.2b). The dashboard was a sixth aggregation semantic: it
  // filtered to COMPLETED and summed `o.total` at face value, so a partial
  // refund was invisible, and it computed
  // `round2(lineTotal × (1 − discountRatio))` per line — the C-11 half-cent,
  // again. It now shares the one aggregation, so the KPI a manager glances at
  // agrees with the Z report for the same day.
  const today = aggregateOrders(todayOrders, {
    topProductsLimit: 6,
    ...periodAggregateOptions(startOfDay, endOfDay),
  });

  const todaySales = today.salesTotal;
  const todayOrdersCount = today.salesCount;
  const todayItems = today.itemsCount;
  // Integer cents — a fractional average is what made this disagree with
  // every other report.
  const avgTicket = todayOrdersCount > 0 ? Math.round(todaySales / todayOrdersCount) : 0;

  const payments = todayOrders.flatMap((o) => o.payments);
  const cashSales = today.cashTotal;
  const cardSales = today.cardTotal;

  // Hourly distribution, net of refunds like everything else.
  const hourly: { hour: number; sales: number; orders: number }[] = [];
  for (let h = 0; h < 24; h++) hourly.push({ hour: h, sales: 0, orders: 0 });
  for (const o of todayOrders) {
    // DD-21: an order that is here only to carry a correction has no sale to
    // place on today's clock — its sale happened on another day, and its hour
    // belongs to that day's chart. Skipped rather than counted at its original
    // hour, which would put a sale into today's hourly total that today's
    // `salesTotal` does not contain.
    if (o.createdAt < startOfDay || o.createdAt >= endOfDay) continue;
    const { counted, netTotal } = orderNet(o);
    if (!counted) continue;
    const h = new Date(o.createdAt).getHours();
    hourly[h].sales += netTotal;
    hourly[h].orders += 1;
  }

  const topProducts = today.topProducts;

  // Top categories today (by revenue) — batch-fetch products to avoid N+1
  const categoryAgg: Record<string, { name: string; color: string; revenue: number; quantity: number }> = {};
  const productIds = Array.from(new Set(todayOrders.flatMap((o) => o.items.map((i) => i.productId).filter(Boolean))));
  const productsMap = new Map(
    productIds.length > 0
      ? (await db.product.findMany({
          where: { id: { in: productIds as string[] } },
          select: { id: true, categoryId: true, category: { select: { name: true, color: true } } },
        })).map((p) => [p.id, p])
      : []
  );
  for (const o of todayOrders) {
    const { counted, lineNets } = orderNet(o);
    if (!counted) continue;
    o.items.forEach((item, idx) => {
      if (!item.productId) return;
      const product = productsMap.get(item.productId);
      if (!product?.category) return;
      const key = product.categoryId;
      categoryAgg[key] ??= { name: product.category.name, color: product.category.color, revenue: 0, quantity: 0 };
      // Net of discount and refund, like every other revenue figure — this
      // used to add the raw lineTotal, which double-counted a discount away.
      categoryAgg[key].revenue += lineNets[idx];
      categoryAgg[key].quantity += item.quantity;
    });
  }
  const topCategories = Object.values(categoryAgg)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  // Payment breakdown
  const methodAgg: Record<string, { amount: number; count: number }> = {};
  for (const p of payments) {
    methodAgg[p.method] ??= { amount: 0, count: 0 };
    methodAgg[p.method].amount += p.amount;
    methodAgg[p.method].count += 1;
  }
  const paymentBreakdown = Object.entries(methodAgg).map(([method, v]) => ({ method, ...v }));

  const currentShift = await db.shift.findFirst({
    where: { status: "OPEN" },
    orderBy: { openedAt: "desc" },
    include: {
      openedBy: { select: { name: true, username: true } },
      closedBy: { select: { name: true, username: true } },
    },
  });

  const recentOrders = await db.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: {
      items: true,
      payments: true,
      cashier: { select: { name: true, username: true } },
      customer: { select: { name: true } },
      shift: { select: { number: true } },
    },
  });

  // Comparison: today vs same day last week
  const startOfLastWeekDay = new Date(startOfDay);
  startOfLastWeekDay.setDate(startOfLastWeekDay.getDate() - 7);
  const endOfLastWeekDay = new Date(endOfDay);
  endOfLastWeekDay.setDate(endOfLastWeekDay.getDate() - 7);

  // Comparison periods use the same aggregation as today's figures, or the
  // percentages compare a refund-netted number against a gross one (L-23).
  const lastWeekDayOrders = await db.order.findMany({
    where: {
      ...periodOrdersWhere(startOfLastWeekDay, endOfLastWeekDay),
      status: { in: ["COMPLETED", "REFUNDED"] },
    },
    include: AGGREGATE_INCLUDE,
  });
  const lastWeekDayAgg = aggregateOrders(
    lastWeekDayOrders,
    periodAggregateOptions(startOfLastWeekDay, endOfLastWeekDay),
  );
  const lastWeekDaySales = lastWeekDayAgg.salesTotal;
  const lastWeekDayCount = lastWeekDayAgg.salesCount;

  // This week vs last week
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday as start of week
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfLastWeek = new Date(startOfWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
  const endOfLastWeek = new Date(startOfWeek);

  const [thisWeekOrders, lastWeekOrdersArr] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: startOfWeek }, status: { in: ["COMPLETED", "REFUNDED"] } },
      include: AGGREGATE_INCLUDE,
    }),
    db.order.findMany({
      where: { createdAt: { gte: startOfLastWeek, lt: endOfLastWeek }, status: { in: ["COMPLETED", "REFUNDED"] } },
      include: AGGREGATE_INCLUDE,
    }),
  ]);
  const thisWeekSales = aggregateOrders(thisWeekOrders).salesTotal;
  const lastWeekSales = aggregateOrders(lastWeekOrdersArr).salesTotal;

  return NextResponse.json({
    todaySales,
    todayOrders: todayOrdersCount,
    todayItems,
    avgTicket,
    cashSales,
    cardSales,
    currentShift,
    hourly,
    topProducts,
    topCategories,
    paymentBreakdown,
    recentOrders,
    comparison: {
      lastWeekDaySales,
      lastWeekDayCount,
      todayVsLastWeekDayPct: lastWeekDaySales > 0 ? round2(((todaySales - lastWeekDaySales) / lastWeekDaySales) * 100) : null,
      thisWeekSales,
      lastWeekSales,
      thisWeekOrdersCount: thisWeekOrders.length,
      lastWeekOrdersCount: lastWeekOrdersArr.length,
      weekVsLastWeekPct: lastWeekSales > 0 ? round2(((thisWeekSales - lastWeekSales) / lastWeekSales) * 100) : null,
    },
  });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
