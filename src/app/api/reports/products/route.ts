import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import { round2 } from "@/lib/money";
import { MAX_REPORT_RANGE_DAYS } from "@/lib/report-range";

export const GET = withAuth(
  async (req) => {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "Paramètres 'from' et 'to' requis (YYYY-MM-DD)." }, { status: 400 });
  }

  const fromDate = new Date(from + "T00:00:00.000Z");
  const toDate = new Date(to + "T23:59:59.999Z");

  // M-31 (Batch 2.4): bound the span. This route uses explicit UTC bounds
  // rather than local-day boundaries, so it keeps its own dates and only
  // borrows the limit.
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "Dates invalides." }, { status: 400 });
  }
  const spanDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
  if (spanDays > MAX_REPORT_RANGE_DAYS) {
    return NextResponse.json(
      {
        error: `Période trop longue : ${spanDays} jours demandés, maximum ${MAX_REPORT_RANGE_DAYS}. Affinez la période ou utilisez une clôture mensuelle/annuelle.`,
      },
      { status: 400 },
    );
  }

  const items = await db.orderItem.findMany({
    where: {
      order: {
        status: { in: ["COMPLETED", "REFUNDED"] },
        completedAt: { gte: fromDate, lte: toDate },
      },
    },
    select: {
      productId: true,
      productName: true,
      quantity: true,
      lineTotal: true,
      vatRate: true,
      order: { select: { discountTotal: true, subtotal: true, total: true, status: true, refunds: { select: { amount: true } } } },
    },
  });

  const map = new Map<
    string,
    { productId: string | null; productName: string; quantity: number; revenue: number; vatRate: number }
  >();

  // Aggregate net-of-discount + net-of-refund per product line, aligned with
  // computeShiftReport semantics (reports.ts): order-level refund ratio on
  // order.total, per-line net = lineTotal × (1 − discountRatio) × (1 − refundRatio).
  // The previous line-level check (`orderRefundsTotal >= it.lineTotal`)
  // wrongly dropped BOTH lines of a 2-line order on a 1-line-value refund.
  for (const it of items) {
    const o = it.order;
    if (o.status === "REFUNDED") continue; // fully refunded orders excluded
    const orderRefundsTotal = (o.refunds ?? []).reduce((s, r) => s + r.amount, 0);
    if (orderRefundsTotal >= o.total - 0.001) continue; // fully refunded by amount
    const refundRatio = o.total > 0 ? Math.min(1, orderRefundsTotal / o.total) : 0;
    const discountRatio = o.subtotal > 0 ? (o.discountTotal ?? 0) / o.subtotal : 0;
    const netRevenue = round2(it.lineTotal * (1 - discountRatio) * (1 - refundRatio));
    const key = it.productId ?? it.productName;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += it.quantity;
      existing.revenue = round2(existing.revenue + netRevenue);
    } else {
      map.set(key, {
        productId: it.productId,
        productName: it.productName,
        quantity: it.quantity,
        revenue: netRevenue,
        vatRate: it.vatRate ?? 0,
      });
    }
  }

  const rows = Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
  const totalQuantity = rows.reduce((s, r) => s + r.quantity, 0);
  const totalRevenue = round2(rows.reduce((s, r) => s + r.revenue, 0));

  return NextResponse.json({
    from,
    to,
    totalProducts: rows.length,
    totalQuantity,
    totalRevenue,
    rows,
  });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
