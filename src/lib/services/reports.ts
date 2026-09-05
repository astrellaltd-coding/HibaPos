// Reports service — X report (mid-shift) and Z report (close-shift, immutable).
// All money values are INTEGER CENTS (DB stores cents; DTO transports cents).
import { db } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";
import { splitVat, type VatBreakdown } from "@/lib/money";
import {
  aggregateOrders,
  aggregateCashMovements,
  AGGREGATE_INCLUDE,
  shiftOrdersWhere,
  shiftAggregateOptions,
  shiftCashMovementsWhere,
} from "@/lib/services/aggregate";
import { nextZReportNumber } from "@/lib/services/sequence";
import { appendFiscalEvent } from "@/lib/services/fiscal";
import { getSettings } from "@/lib/services/settings";
import { TX_Z_CLOSE } from "@/lib/tx-options";

/** A Prisma client or an interactive-transaction client. Same shape as the
 *  `Tx` in services/sequence.ts — the Z report is computed with the second so
 *  it cannot drift from the shift it seals (C-15, Batch 4.7). */
type Db = PrismaClient | Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** A refusal raised inside `generateZReport`, carrying the status its callers
 *  must return. Before Batch 4.7 these were bare `Error`s decided outside the
 *  transaction: `POST /api/shifts/[id]/close` mapped every one of them to 400
 *  and `POST /api/reports/z` mapped none of them at all, so a duplicate close
 *  through the second route answered 500. */
export class ZReportError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ZReportError";
    this.status = status;
  }
}

export const SHIFT_ALREADY_CLOSED_MESSAGE = "Cette caisse est déjà clôturée";
export const Z_ALREADY_GENERATED_MESSAGE = "Clôture déjà effectuée pour cette caisse";

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
  // M-05 (Batch 5.5): the drawer's other movements, both as positive figures.
  // `expectedCash` below nets them; these say what made it up.
  cashInTotal: number; // cents
  cashOutTotal: number; // cents
  cashMovementsCount: number;
  /** Per category, signed. DD-12 chose a fixed list so this could exist. */
  cashByCategory: Record<string, number>;
  openingFloat: number; // cents
  expectedCash: number; // cents
  vatBreakdown: VatBreakdown;
  topProducts: { name: string; quantity: number; total: number }[]; // total in cents
};

/**
 * Aggregate a shift. `client` defaults to the global Prisma client for the X
 * report and for callers that only read; `generateZReport` passes its own
 * transaction so that the figures it seals and the shift it closes are decided
 * in the same atomic step (C-15, Batch 4.7).
 */
export async function computeShiftReport(shiftId: string, client: Db = db): Promise<SalesReport> {
  const shift = await client.shift.findUniqueOrThrow({ where: { id: shiftId } });
  // C-14 / DD-10 (Batch 5.3). This used to select `{ shiftId }` alone, and that
  // one clause was where the money went. A refund for a previous day's sale is
  // paid out of the till that is open NOW, so today's report has to see an
  // order it does not own — otherwise `expectedCash` below is short by exactly
  // the cash handed over the counter, and the drawer is down with no report
  // saying why. `shiftOrdersWhere` adds that arm; `shiftAggregateOptions` then
  // says what each order contributes, so the fetch and the filter cannot drift.
  const orders = await client.order.findMany({
    where: shiftOrdersWhere(shiftId),
    include: AGGREGATE_INCLUDE,
  });

  // One aggregation for the whole application (Batch 3.2). What used to live
  // here — refund netting per payment method, per-line discount pro-rating,
  // the VAT breakdown — is now `aggregateOrders`, so a Z report and the
  // monthly close that contains it cannot drift apart.
  const agg = aggregateOrders(orders, {
    topProductsLimit: 10,
    ...shiftAggregateOptions(shiftId, shift.openedAt),
  });

  // M-05 (Batch 5.5). Scoped to the till the money moved through, which is the
  // same rule the refunds above follow since Batch 5.3: a period books what IT
  // did. A movement recorded while this shift was open belongs to this shift
  // even if it corrects something older, because the cash left THIS drawer.
  const movements = await client.cashMovement.findMany({
    where: shiftCashMovementsWhere(shiftId),
    select: { category: true, amount: true },
  });
  const cash = aggregateCashMovements(movements);

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
    cashInTotal: cash.cashIn,
    cashOutTotal: cash.cashOut,
    cashMovementsCount: cash.count,
    cashByCategory: cash.byCategory,
    openingFloat: shift.openingFloat,
    // Cash the drawer should hold: what it opened with, plus cash taken,
    // less cash handed back, plus or minus every other movement of cash.
    // Card and voucher refunds never touch it.
    //
    // Since Batch 5.3 "handed back" means the refunds THIS till paid out,
    // whichever shift sold the order — which is DD-10's whole point. M-05
    // (Batch 5.5) adds `cash.net`: before it, a 200 € supplier payment showed up
    // as a 200 € shortfall at the close with nothing to explain it, every time,
    // which is how staff learn to ignore the variance figure.
    expectedCash:
      shift.openingFloat + agg.grossCashTotal - agg.cashRefundsTotal + cash.net,
    vatBreakdown: agg.vatBreakdown,
    topProducts: agg.topProducts,
  };
}

export async function generateZReport(shiftId: string, closingFloat: number, closedById: string) {
  // Settings are read outside: they take no part in the race and re-reading
  // them under the lock would only lengthen it.
  const settings = await getSettings();

  // C-15 (Batch 4.7). Everything below used to sit OUT here: the duplicate-Z
  // guard, and — the finding itself — `computeShiftReport`, which totalled the
  // shift and only then opened the transaction that closed it. A sale
  // committing in between belonged to the shift and was absent from its Z, and
  // because a Z is immutable that discrepancy was permanent. Prisma's
  // interactive transactions on SQLite do not overlap (measured in Batch 4.7,
  // in both journal modes), so computing in here means no sale can commit
  // between the total and the seal: a checkout either finished before this
  // transaction began — and is counted — or begins after it and is refused by
  // the status assertion in services/checkout.ts.
  const { z, report, cashVariance } = await db.$transaction(async (tx) => {
    const shift = await tx.shift.findUnique({
      where: { id: shiftId },
      select: { status: true },
    });
    if (!shift) throw new ZReportError("Caisse introuvable", 404);
    // Duplicate Z guard: one Z per shift only. Inside the transaction, a
    // second close racing the first meets this message rather than the raw
    // P2002 from `ZReport.shiftId`'s unique constraint. Checked BEFORE the
    // status: a shift that is closed is almost always closed because its Z
    // exists, and naming the Z is the more useful of the two true answers.
    const existingZForShift = await tx.zReport.findUnique({ where: { shiftId } });
    if (existingZForShift) {
      throw new ZReportError(Z_ALREADY_GENERATED_MESSAGE, 409);
    }
    if (shift.status !== "OPEN") {
      throw new ZReportError(SHIFT_ALREADY_CLOSED_MESSAGE, 409);
    }

    const report = await computeShiftReport(shiftId, tx);
    const cashVariance = closingFloat - report.expectedCash;

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
        cashInTotal: report.cashInTotal,
        cashOutTotal: report.cashOutTotal,
        cashMovementsCount: report.cashMovementsCount,
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
        // M-05 (Batch 5.5), the same argument at the same place: a CLOTURE_Z
        // whose `expectedCash` accounts for a payout it does not name cannot be
        // reconciled from the journal alone.
        cashInTotal: report.cashInTotal,
        cashOutTotal: report.cashOutTotal,
        cashMovementsCount: report.cashMovementsCount,
        openingFloat: report.openingFloat,
        expectedCash: report.expectedCash,
        closingFloat,
        cashVariance,
      },
    });
    await tx.zReport.update({ where: { id: zReport.id }, data: { fiscalEventId: ev.id } });

    return { z: zReport, report, cashVariance };
  }, TX_Z_CLOSE);

  return { z, report, cashVariance };
}

export { splitVat };

