import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import { round2, addToVatBreakdown, type VatBreakdown } from "@/lib/money";

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
    include: { items: true, refunds: true },
  });

  const vatBreakdown: VatBreakdown = {};
  let totalTtc = 0;
  let totalHt = 0;
  let totalVat = 0;

  for (const order of orders) {
    const orderRefundsTotal = order.refunds.reduce((acc, r) => acc + r.amount, 0);
    if (orderRefundsTotal >= order.total - 0.001) continue; // skip fully refunded

    // Net of BOTH discount and partial refund, matching computeShiftReport
    // semantics (reports.ts) so the VAT report reconciles with the Z report
    // for the same period (post-audit: previously only discount was netted,
    // overstating VAT on partially refunded orders).
    const refundRatio = order.total > 0 ? Math.min(1, orderRefundsTotal / order.total) : 0;
    const discountRatio = order.subtotal > 0 ? (order.discountTotal ?? 0) / order.subtotal : 0;
    for (const item of order.items) {
      const netLineTotal = round2(item.lineTotal * (1 - discountRatio) * (1 - refundRatio));
      addToVatBreakdown(vatBreakdown, netLineTotal, item.vatRate ?? 10);
    }
  }

  const rows = Object.entries(vatBreakdown)
    .map(([rateStr, vals]) => {
      const rate = Number(rateStr);
      return {
        rate,
        ht: vals.ht,
        vat: vals.vat,
        ttc: vals.ttc,
      };
    })
    .sort((a, b) => a.rate - b.rate);

  totalHt = round2(rows.reduce((s, r) => s + r.ht, 0));
  totalVat = round2(rows.reduce((s, r) => s + r.vat, 0));
  totalTtc = round2(rows.reduce((s, r) => s + r.ttc, 0));

  return NextResponse.json({
    from: fromStart.toISOString(),
    to: toEnd.toISOString(),
    totalHt,
    totalVat,
    totalTtc,
    rows,
  });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
