// Reports service — X report (mid-shift) and Z report (close-shift, immutable).
// All money values are INTEGER CENTS (DB stores cents; DTO transports cents).
import { db } from "@/lib/db";
import { splitVat, type VatBreakdown } from "@/lib/money";
import { aggregateOrders, AGGREGATE_INCLUDE } from "@/lib/services/aggregate";
import { nextZReportNumber } from "@/lib/services/sequence";
import { appendFiscalEvent } from "@/lib/services/fiscal";
import { getSettings } from "@/lib/services/settings";
import { TX_Z_CLOSE } from "@/lib/tx-options";

export type SalesReport = {
  salesTotal: number; // cents
  salesCount: number;
  vatTotal: number; // cents
  cashTotal: number; // cents
  cardTotal: number; // cents
  voucherTotal: number; // cents
  discountsTotal: number; // cents
  // M-07 (Batch 3.6): the period's corrections. A Z report that itemises
  // sales, VAT and discounts but not refunds does not show what was given
  // back, and the sealed CLOTURE_Z entry did not record it either.
  refundsTotal: number; // cents
  refundsCount: number;
  openingFloat: number; // cents
  expectedCash: number; // cents
  vatBreakdown: VatBreakdown;
  topProducts: { name: string; quantity: number; total: number }[]; // total in cents
};

export async function computeShiftReport(shiftId: string): Promise<SalesReport> {
  const shift = await db.shift.findUniqueOrThrow({ where: { id: shiftId } });
  const orders = await db.order.findMany({
    where: { shiftId, status: { in: ["COMPLETED", "REFUNDED"] } },
    include: AGGREGATE_INCLUDE,
  });

  // One aggregation for the whole application (Batch 3.2). What used to live
  // here — refund netting per payment method, per-line discount pro-rating,
  // the VAT breakdown — is now `aggregateOrders`, so a Z report and the
  // monthly close that contains it cannot drift apart.
  const agg = aggregateOrders(orders, { topProductsLimit: 10 });

  return {
    salesTotal: agg.salesTotal,
    salesCount: agg.salesCount,
    vatTotal: agg.vatTotal,
    cashTotal: agg.cashTotal,
    cardTotal: agg.cardTotal,
    voucherTotal: agg.voucherTotal,
    discountsTotal: agg.discountsTotal,
    refundsTotal: agg.totalRefunded,
    refundsCount: agg.refundsCount,
    openingFloat: shift.openingFloat,
    // Cash the drawer should hold: what it opened with, plus cash taken,
    // less cash handed back. Card and voucher refunds never touch it.
    expectedCash: shift.openingFloat + agg.grossCashTotal - agg.cashRefundsTotal,
    vatBreakdown: agg.vatBreakdown,
    topProducts: agg.topProducts,
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
        refundsTotal: report.refundsTotal,
        refundsCount: report.refundsCount,
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
        // M-07: sealed with the rest of the close, so the journal entry shows
        // the day's corrections and not only its takings.
        refundsTotal: report.refundsTotal,
        refundsCount: report.refundsCount,
        openingFloat: report.openingFloat,
        expectedCash: report.expectedCash,
        closingFloat,
        cashVariance,
      },
    });
    await tx.zReport.update({ where: { id: zReport.id }, data: { fiscalEventId: ev.id } });

    return zReport;
  }, TX_Z_CLOSE);

  return { z, report, cashVariance };
}

export { splitVat };

