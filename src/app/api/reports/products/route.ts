import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import { sum2 } from "@/lib/money";
import { orderNet, AGGREGATE_INCLUDE } from "@/lib/services/aggregate";
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

  // L-23 (Batch 3.2b). This route used to read OrderItem rows directly and
  // compute `round2(lineTotal × (1 − discountRatio) × (1 − refundRatio))` per
  // line — a ratio product through a euros helper, so the half-cent survived
  // exactly as C-11 described, and each line rounded independently so the
  // parts did not sum to the whole. It now reads orders and uses `orderNet`,
  // the same primitive the Z report and the closes use, then groups by
  // product id — a grouping the shared aggregate does not produce, which is
  // why the primitive is used rather than aggregateOrders().
  //
  // Note this route keeps its own UTC `completedAt` bounds, unlike the
  // createdAt/local-day ranges elsewhere. That difference is pre-existing.
  const orders = await db.order.findMany({
    where: {
      status: { in: ["COMPLETED", "REFUNDED"] },
      completedAt: { gte: fromDate, lte: toDate },
    },
    include: AGGREGATE_INCLUDE,
  });

  const map = new Map<
    string,
    { productId: string | null; productName: string; quantity: number; revenue: number; vatRate: number }
  >();

  for (const order of orders) {
    const { counted, lineNets } = orderNet(order);
    if (!counted) continue;
    order.items.forEach((it, idx) => {
      const key = it.productId ?? it.productName;
      const existing = map.get(key);
      if (existing) {
        existing.quantity += it.quantity;
        existing.revenue += lineNets[idx];
      } else {
        map.set(key, {
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          revenue: lineNets[idx],
          vatRate: it.vatRate ?? 0,
        });
      }
    });
  }

  const rows = Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
  const totalQuantity = rows.reduce((s, r) => s + r.quantity, 0);
  const totalRevenue = sum2(rows.map((r) => r.revenue));

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
