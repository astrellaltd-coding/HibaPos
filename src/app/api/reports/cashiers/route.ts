import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import { round2, sum2 } from "@/lib/money";

export const GET = withAuth(
  async (req) => {
  const url = new URL(req.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  const now = new Date();
  const to = toStr ? new Date(toStr) : now;
  const from = fromStr ? new Date(fromStr) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const fromStart = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);

  const orders = await db.order.findMany({
    where: {
      createdAt: { gte: fromStart, lt: toEnd },
      status: { in: ["COMPLETED", "REFUNDED"] },
    },
    include: { payments: true, refunds: true, cashier: { select: { id: true, name: true, username: true } } },
  });

  const cashierMap: Record<
    string,
    {
      cashierId: string;
      name: string;
      username: string;
      orders: number;
      items: number;
      salesTotal: number;
      cashTotal: number;
      cardTotal: number;
      voucherTotal: number;
      refundsTotal: number;
    }
  > = {};

  for (const order of orders) {
    const c = order.cashier;
    if (!c) continue;
    const key = c.id;
    cashierMap[key] ??= {
      cashierId: c.id,
      name: c.name,
      username: c.username,
      orders: 0,
      items: 0,
      salesTotal: 0,
      cashTotal: 0,
      cardTotal: 0,
      voucherTotal: 0,
      refundsTotal: 0,
    };

    const orderRefundsTotal = order.refunds.reduce((acc, r) => acc + r.amount, 0);
    const isFullyRefunded = orderRefundsTotal >= order.total - 0.01;

    if (!isFullyRefunded) {
      const netTotal = round2(order.total - orderRefundsTotal);
      cashierMap[key].orders += 1;
      cashierMap[key].items += order.itemCount;
      cashierMap[key].salesTotal = round2(cashierMap[key].salesTotal + netTotal);
    }

    for (const p of order.payments) {
      if (p.method === "CASH") cashierMap[key].cashTotal = round2(cashierMap[key].cashTotal + p.amount);
      if (p.method === "CARD") cashierMap[key].cardTotal = round2(cashierMap[key].cardTotal + p.amount);
      if (p.method === "VOUCHER") cashierMap[key].voucherTotal = round2(cashierMap[key].voucherTotal + p.amount);
    }

    cashierMap[key].refundsTotal = round2(cashierMap[key].refundsTotal + orderRefundsTotal);
  }

  const rows = Object.values(cashierMap).sort((a, b) => b.salesTotal - a.salesTotal);

  return NextResponse.json({
    from: fromStart.toISOString(),
    to: toEnd.toISOString(),
    totalCashiers: rows.length,
    totalSales: round2(sum2(rows.map((r) => r.salesTotal))),
    totalOrders: sum2(rows.map((r) => r.orders)),
    totalItems: sum2(rows.map((r) => r.items)),
    rows,
  });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
