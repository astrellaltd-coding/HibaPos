// Reports service — X report (mid-shift) and Z report (close-shift, immutable).
// All money values are INTEGER CENTS (DB stores cents; DTO transports cents).
import { db } from "@/lib/db";
import { addToVatBreakdown, sum2, splitVat, type VatBreakdown } from "@/lib/money";
import { nextZReportNumber } from "@/lib/services/sequence";
import { appendFiscalEvent } from "@/lib/services/fiscal";
import { getSettings } from "@/lib/services/settings";

export type SalesReport = {
  salesTotal: number; // cents
  salesCount: number;
  vatTotal: number; // cents
  cashTotal: number; // cents
  cardTotal: number; // cents
  voucherTotal: number; // cents
  discountsTotal: number; // cents
  openingFloat: number; // cents
  expectedCash: number; // cents
  vatBreakdown: VatBreakdown;
  topProducts: { name: string; quantity: number; total: number }[]; // total in cents
};

export async function computeShiftReport(shiftId: string): Promise<SalesReport> {
  const shift = await db.shift.findUniqueOrThrow({ where: { id: shiftId } });
  const orders = await db.order.findMany({
    where: { shiftId, status: { in: ["COMPLETED", "REFUNDED"] } },
    include: { items: true, payments: true, refunds: true },
  });

  let salesTotal = 0;
  let discountsTotal = 0;
  let salesCount = 0;
  const vatBreakdown: VatBreakdown = {};
  const productAgg: Record<string, { name: string; quantity: number; total: number }> = {};

  for (const order of orders) {
    if (order.status === "REFUNDED") continue; // fully refunded orders excluded from sales totals
    // Skip orders that have refunds totaling the full amount.
    const orderRefundsTotal = order.refunds.reduce((acc, r) => acc + r.amount, 0);
    if (orderRefundsTotal >= order.total) continue; // exact integer compare (cents)

    // This order counts toward salesCount (it's not fully refunded).
    salesCount += 1;

    // Per-line scaling for partial refunds (cash/drawer reconciliation is
    // handled separately below via method-filtered refund sums; product/VAT
    // aggregation scales the line net of both discount and refund proportion).
    const refundRatio = order.total > 0
      ? Math.min(1, orderRefundsTotal / order.total)
      : 0;
    // netTotal = actual amount the customer was charged (post-refund), in cents.
    const netTotal = order.total - orderRefundsTotal;
    salesTotal = salesTotal + netTotal;
    discountsTotal = discountsTotal + order.discountTotal;

    // Net-of-discount VAT: distribute order-level discount pro-rata per line.
    const discountRatio = order.subtotal > 0 ? order.discountTotal / order.subtotal : 0;

    for (const item of order.items) {
      // Net of both discount AND partial refund (pro-rata per line).
      // All values are cents; the product may produce a fractional cent due
      // to the ratio multiplication — round to the nearest integer cent.
      const netLineTotal = Math.round(
        item.lineTotal * (1 - discountRatio) * (1 - refundRatio)
      );
      const vatRate = item.vatRate ?? 10;
      addToVatBreakdown(vatBreakdown, netLineTotal, vatRate);
      const key = item.productName;
      productAgg[key] ??= { name: item.productName, quantity: 0, total: 0 };
      // Quantity is gross units sold (informational); total is revenue net of
      // discount+refund. sum(productAgg.total) ≈ salesTotal.
      productAgg[key].quantity += item.quantity;
      productAgg[key].total = productAgg[key].total + netLineTotal;
    }
  }

  // Payments — gross by method (cents).
  const payments = orders.flatMap((o) => o.payments);
  const cashTotal = sum2(payments.filter((p) => p.method === "CASH").map((p) => p.amount));
  const cardTotal = sum2(payments.filter((p) => p.method === "CARD").map((p) => p.amount));
  const voucherTotal = sum2(payments.filter((p) => p.method === "VOUCHER").map((p) => p.amount));

  // Refunds by method — net each total so the report ties out cleanly.
  // Legacy rows with `method === null` are treated as CASH (preserves prior
  // behaviour for refunds issued before the method column existed).
  const refunds = orders.flatMap((o) => o.refunds);
  const cashRefundsTotal = sum2(
    refunds.filter((r) => r.method === "CASH" || r.method === null).map((r) => r.amount),
  );
  const cardRefundsTotal = sum2(refunds.filter((r) => r.method === "CARD").map((r) => r.amount));
  const voucherRefundsTotal = sum2(refunds.filter((r) => r.method === "VOUCHER").map((r) => r.amount));

  const vatTotal = sum2(Object.values(vatBreakdown).map((v) => v.vat));
  const expectedCash = shift.openingFloat + cashTotal - cashRefundsTotal;
  const topProducts = Object.values(productAgg)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  return {
    salesTotal,
    salesCount,
    vatTotal,
    // Net each payment method by its own refunds so the report ties out.
    cashTotal: cashTotal - cashRefundsTotal,
    cardTotal: cardTotal - cardRefundsTotal,
    voucherTotal: voucherTotal - voucherRefundsTotal,
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
  const cashVariance = closingFloat - report.expectedCash;
  const settings = await getSettings();

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

    // --- Fiscal journal (JFP) — clôture journalière scellée (ISCA conservation) ---
    const ev = await appendFiscalEvent(tx, {
      type: "CLOTURE_Z",
      userId: closedById,
      factice: settings.factice ?? false,
      zReportId: zReport.id,
      shiftId,
      data: {
        zReportNumber: number,
        shiftId,
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
      },
    });
    await tx.zReport.update({ where: { id: zReport.id }, data: { fiscalEventId: ev.id } });

    return zReport;
  });

  return { z, report, cashVariance };
}

export { splitVat };

