import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import { round2, sum2 } from "@/lib/money";
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
    include: { items: true, payments: true },
  });
  const completed = orders.filter((o) => o.status === "COMPLETED");

  // Group by day
  const days: Record<string, { date: string; sales: number; orders: number; items: number }> = {};
  const productAgg: Record<string, { name: string; quantity: number; total: number }> = {};
  for (const o of completed) {
    const discountRatio = o.subtotal > 0 ? (o.discountTotal ?? 0) / o.subtotal : 0;
    const d = new Date(o.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days[key] ??= { date: key, sales: 0, orders: 0, items: 0 };
    days[key].sales = round2(days[key].sales + o.total);
    days[key].orders += 1;
    days[key].items += o.itemCount;
    for (const item of o.items) {
      const netLineTotal = round2(item.lineTotal * (1 - discountRatio));
      productAgg[item.productName] ??= { name: item.productName, quantity: 0, total: 0 };
      productAgg[item.productName].quantity += item.quantity;
      productAgg[item.productName].total = round2(productAgg[item.productName].total + netLineTotal);
    }
  }

  const payments = completed.flatMap((o) => o.payments);
  const totalSales = round2(sum2(completed.map((o) => o.total)));
  const cashTotal = round2(sum2(payments.filter((p) => p.method === "CASH").map((p) => p.amount)));
  const cardTotal = round2(sum2(payments.filter((p) => p.method === "CARD").map((p) => p.amount)));
  const voucherTotal = round2(sum2(payments.filter((p) => p.method === "VOUCHER").map((p) => p.amount)));

  return NextResponse.json({
    from: fromStart.toISOString(),
    to: toEnd.toISOString(),
    totalSales,
    totalOrders: completed.length,
    totalItems: completed.reduce((acc, o) => acc + o.itemCount, 0),
    avgTicket: completed.length ? round2(totalSales / completed.length) : 0,
    cashTotal,
    cardTotal,
    voucherTotal,
    days: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)),
    topProducts: Object.values(productAgg).sort((a, b) => b.quantity - a.quantity).slice(0, 15),
  });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
