// Reports service — X report (mid-shift) and Z report (close-shift, immutable).
import { db } from "@/lib/db";
import { round2, splitVat, addToVatBreakdown, sum2, type VatBreakdown } from "@/lib/money";
import { nextZReportNumber } from "@/lib/services/sequence";

export type SalesReport = {
  salesTotal: number;
  salesCount: number;
  vatTotal: number;
  cashTotal: number;
  cardTotal: number;
  voucherTotal: number;
  discountsTotal: number;
  openingFloat: number;
  expectedCash: number;
  vatBreakdown: VatBreakdown;
  topProducts: { name: string; quantity: number; total: number }[];
};

export async function computeShiftReport(shiftId: string): Promise<SalesReport> {
  const shift = await db.shift.findUniqueOrThrow({ where: { id: shiftId } });
  const orders = await db.order.findMany({
    where: { shiftId, status: { in: ["COMPLETED", "REFUNDED"] } },
    include: { items: true, payments: true, refunds: true },
  });

  let salesTotal = 0;
  let discountsTotal = 0;
  const vatBreakdown: VatBreakdown = {};
  const productAgg: Record<string, { name: string; quantity: number; total: number }> = {};

  for (const order of orders) {
    if (order.status === "REFUNDED") continue; // fully refunded orders excluded from sales totals
    // Skip orders that have refunds totaling the full amount.
    const orderRefundsTotal = order.refunds.reduce((acc, r) => acc + r.amount, 0);
    if (orderRefundsTotal >= order.total - 0.001) continue;

    // Per-line scaling for partial refunds (cash/drawer reconciliation is
    // handled separately below via method-filtered refund sums; product/VAT
    // aggregation scales the line net of both discount and refund proportion).
    const refundRatio = order.total > 0
      ? Math.min(1, orderRefundsTotal / order.total)
      : 0;
    // netTotal = actual amount the customer was charged for this order (post-refund).
    const netTotal = round2(order.total - orderRefundsTotal);
    salesTotal = round2(salesTotal + netTotal);
    discountsTotal = round2(discountsTotal + order.discountTotal);

    // Net-of-discount VAT: distribute order-level discount pro-rata per line.
    const discountRatio = order.subtotal > 0 ? (order.discountTotal ?? 0) / order.subtotal : 0;

    for (const item of order.items) {
      // Net of both discount AND partial refund (pro-rata per line):
      //   item.lineTotal * (1 - discountRatio) * (1 - refundRatio)
      const netLineTotal = round2(
        item.lineTotal * (1 - discountRatio) * (1 - refundRatio)
      );
      const vatRate = item.vatRate ?? 10;
      addToVatBreakdown(vatBreakdown, netLineTotal, vatRate);
      const key = item.productName;
      productAgg[key] ??= { name: item.productName, quantity: 0, total: 0 };
      // Quantity is gross units sold (informational); total is revenue net of
      // discount+refund. sum(productAgg.total) ≈ salesTotal.
      productAgg[key].quantity += item.quantity;
      productAgg[key].total = round2(productAgg[key].total + netLineTotal);
    }
  }

  // Payments
  const payments = orders.flatMap((o) => o.payments);
  const cashTotal = sum2(payments.filter((p) => p.method === "CASH").map((p) => p.amount));
  const cardTotal = sum2(payments.filter((p) => p.method === "CARD").map((p) => p.amount));
  const voucherTotal = sum2(payments.filter((p) => p.method === "VOUCHER").map((p) => p.amount));

  // Cash drawer reconciliation: only CASH refunds reduce expected cash.
  // Legacy rows with `method === null` are treated as CASH (preserves prior
  // behaviour for refunds issued before the method column existed).
  const refunds = orders.flatMap((o) => o.refunds);
  const cashRefundsTotal = sum2(
    refunds
      .filter((r) => r.method === "CASH" || r.method === null)
      .map((r) => r.amount),
  );
  const _refundsTotal = sum2(refunds.map((r) => r.amount)); // total refunded across methods

  const vatTotal = round2(Object.values(vatBreakdown).reduce((acc, v) => acc + v.vat, 0));
  const salesCount = orders.filter((o) => o.status === "COMPLETED").length;
  const expectedCash = round2(shift.openingFloat + cashTotal - cashRefundsTotal);
  const topProducts = Object.values(productAgg)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  return {
    // salesTotal already reflects net-of-refund above; do not subtract again.
    salesTotal,
    salesCount,
    vatTotal,
    cashTotal,
    cardTotal,
    voucherTotal,
    discountsTotal,
    openingFloat: shift.openingFloat,
    expectedCash,
    vatBreakdown,
    topProducts,
  };
}

export async function generateZReport(shiftId: string, closingFloat: number, closedById: string) {
  // Duplicate Z guard: one Z per shift only.
  const existingZForShift = await db.zReport.findUnique({
    where: { shiftId },
  });
  if (existingZForShift) {
    throw new Error("Clôture déjà effectuée pour cette caisse");
  }

  const report = await computeShiftReport(shiftId);
  const cashVariance = round2(closingFloat - report.expectedCash);

  const z = await db.$transaction(async (tx) => {
    const number = await nextZReportNumber(tx);
    const zReport = await tx.zReport.create({
      data: {
        shiftId,
        number,
        salesTotal: report.salesTotal,
        salesCount: report.salesCount,
        vatTotal: report.vatTotal,
        cashTotal: report.cashTotal,
        cardTotal: report.cardTotal,
        voucherTotal: report.voucherTotal,
        discountsTotal: report.discountsTotal,
        openingFloat: report.openingFloat,
        expectedCash: report.expectedCash,
        closingFloat,
        cashVariance,
        topProductsJson: JSON.stringify(report.topProducts),
        vatBreakdownJson: JSON.stringify(report.vatBreakdown),
      },
    });
    await tx.shift.update({
      where: { id: shiftId },
      data: {
        status: "CLOSED",
        closedById,
        closedAt: new Date(),
        closingFloat,
        expectedCash: report.expectedCash,
        cashVariance,
        salesTotal: report.salesTotal,
        salesCount: report.salesCount,
      },
    });
    return zReport;
  });

  return { z, report, cashVariance };
}

export { splitVat };
