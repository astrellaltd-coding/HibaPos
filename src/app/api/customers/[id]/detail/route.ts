import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams } from "@/lib/api-handler";
import { round2, sum2 } from "@/lib/money";

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
      items: true,
      payments: true,
      cashier: { select: { name: true } },
      shift: { select: { number: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const completed = orders.filter((o) => o.status === "COMPLETED");
  const totalSpent = round2(sum2(completed.map((o) => o.total)));
  const totalOrders = completed.length;
  const totalItems = completed.reduce((acc, o) => acc + o.itemCount, 0);
  const avgTicket = totalOrders > 0 ? round2(totalSpent / totalOrders) : 0;
  const lastVisit = completed[0]?.createdAt ?? null;
  const firstVisit = completed[completed.length - 1]?.createdAt ?? null;

  // Favorite products (by quantity)
  const productAgg: Record<string, { name: string; quantity: number; total: number }> = {};
  for (const o of completed) {
    for (const item of o.items) {
      productAgg[item.productName] ??= { name: item.productName, quantity: 0, total: 0 };
      productAgg[item.productName].quantity += item.quantity;
      productAgg[item.productName].total = round2(productAgg[item.productName].total + item.lineTotal);
    }
  }
  const favoriteProducts = Object.values(productAgg).sort((a, b) => b.quantity - a.quantity).slice(0, 5);

  // Payment method breakdown
  const methodAgg: Record<string, { amount: number; count: number }> = {};
  for (const o of completed) {
    for (const p of o.payments) {
      methodAgg[p.method] ??= { amount: 0, count: 0 };
      methodAgg[p.method].amount = round2(methodAgg[p.method].amount + p.amount);
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
