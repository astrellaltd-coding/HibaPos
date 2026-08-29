import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import { round2, sum2 } from "@/lib/money";

// Sales KPIs, payment breakdowns and week-over-week comparisons are
// manager-level data (nav-config restricts the dashboard view to
// MANAGER+). Server-side gate enforces it regardless of UI state.
export const GET = withAuth(
  async () => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const todayOrders = await db.order.findMany({
    where: {
      createdAt: { gte: startOfDay, lt: endOfDay },
      status: { in: ["COMPLETED", "REFUNDED"] },
    },
    include: { items: true, payments: true },
  });

  const completed = todayOrders.filter((o) => o.status === "COMPLETED");
  const todaySales = round2(sum2(completed.map((o) => o.total)));
  const todayOrdersCount = completed.length;
  const todayItems = completed.reduce((acc, o) => acc + o.itemCount, 0);
  const avgTicket = todayOrdersCount > 0 ? round2(todaySales / todayOrdersCount) : 0;

  const payments = completed.flatMap((o) => o.payments);
  const cashSales = round2(sum2(payments.filter((p) => p.method === "CASH").map((p) => p.amount)));
  const cardSales = round2(sum2(payments.filter((p) => p.method === "CARD").map((p) => p.amount)));

  // Hourly distribution
  const hourly: { hour: number; sales: number; orders: number }[] = [];
  for (let h = 0; h < 24; h++) hourly.push({ hour: h, sales: 0, orders: 0 });
  for (const o of completed) {
    const h = new Date(o.createdAt).getHours();
    hourly[h].sales = round2(hourly[h].sales + o.total);
    hourly[h].orders += 1;
  }

  // Top products today (net of discount per order)
  const productAgg: Record<string, { name: string; quantity: number; total: number }> = {};
  for (const o of completed) {
    const discountRatio = o.subtotal > 0 ? (o.discountTotal ?? 0) / o.subtotal : 0;
    for (const item of o.items) {
      const netLineTotal = round2(item.lineTotal * (1 - discountRatio));
      productAgg[item.productName] ??= { name: item.productName, quantity: 0, total: 0 };
      productAgg[item.productName].quantity += item.quantity;
      productAgg[item.productName].total = round2(productAgg[item.productName].total + netLineTotal);
    }
  }
  const topProducts = Object.values(productAgg)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 6);

  // Top categories today (by revenue) — batch-fetch products to avoid N+1
  const categoryAgg: Record<string, { name: string; color: string; revenue: number; quantity: number }> = {};
  const productIds = Array.from(new Set(completed.flatMap((o) => o.items.map((i) => i.productId).filter(Boolean))));
  const productsMap = new Map(
    productIds.length > 0
      ? (await db.product.findMany({
          where: { id: { in: productIds as string[] } },
          select: { id: true, categoryId: true, category: { select: { name: true, color: true } } },
        })).map((p) => [p.id, p])
      : []
  );
  for (const o of completed) {
    for (const item of o.items) {
      if (!item.productId) continue;
      const product = productsMap.get(item.productId);
      if (!product?.category) continue;
      const key = product.categoryId;
      categoryAgg[key] ??= { name: product.category.name, color: product.category.color, revenue: 0, quantity: 0 };
      categoryAgg[key].revenue = round2(categoryAgg[key].revenue + item.lineTotal);
      categoryAgg[key].quantity += item.quantity;
    }
  }
  const topCategories = Object.values(categoryAgg)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  // Payment breakdown
  const methodAgg: Record<string, { amount: number; count: number }> = {};
  for (const p of payments) {
    methodAgg[p.method] ??= { amount: 0, count: 0 };
    methodAgg[p.method].amount = round2(methodAgg[p.method].amount + p.amount);
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

  const lastWeekDayOrders = await db.order.findMany({
    where: {
      createdAt: { gte: startOfLastWeekDay, lt: endOfLastWeekDay },
      status: "COMPLETED",
    },
  });
  const lastWeekDaySales = round2(sum2(lastWeekDayOrders.map((o) => o.total)));
  const lastWeekDayCount = lastWeekDayOrders.length;

  // This week vs last week
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday as start of week
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfLastWeek = new Date(startOfWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
  const endOfLastWeek = new Date(startOfWeek);

  const [thisWeekOrders, lastWeekOrdersArr] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: startOfWeek }, status: "COMPLETED" },
    }),
    db.order.findMany({
      where: { createdAt: { gte: startOfLastWeek, lt: endOfLastWeek }, status: "COMPLETED" },
    }),
  ]);
  const thisWeekSales = round2(sum2(thisWeekOrders.map((o) => o.total)));
  const lastWeekSales = round2(sum2(lastWeekOrdersArr.map((o) => o.total)));

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
