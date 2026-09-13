// Report range bounds (M-31, Batch 2.4).
//
// The report routes took `from` and `to` straight from the query string and
// ran `findMany` with full relation includes over whatever came back — no
// limit, no aggregation. An operator picking "2020 → today" pulls every
// order, item and payment into memory on a till that also has to take the
// next customer's money. Nothing stopped it, and nothing told them why the
// POS had stopped responding.
//
// Bounding the range is the honest fix: refuse the query with a message
// naming the limit, rather than silently returning a truncated report that
// looks complete. A restaurant that genuinely needs a multi-year total is
// asking for an accounting export, not a POS screen.
//
// ── L-92 (R8.4): THE TRADING-DAY CLOCK ──────────────────────────────────────
//
// This module measured periods by calendar midnight while every sealed fiscal
// document uses the cut-off (DD-23 / DD-24). So the VAT figure a manager files
// could differ from the sealed close for the same month, **in both directions,
// silently**: measured, `MonthlyClose 2026-08` sealed `vatTotal 104` while
// `GET /api/reports/vat?from=2026-08-01&to=2026-08-31` answered `totalVat 0`.
//
// With a 05:00 cut-off, « Du 2026-08-01 Au 2026-08-31 » asked for
// `01/08 00:00 → 01/09 00:00` where the close sealed `01/08 05:00 → 01/09
// 05:00`. Both ends out by five hours: a ticket at 02:30 on 1 August belongs
// to trading day 07-31, so it was sealed into July and reported in August.
//
// `period.ts` had this right and said why: **`cutoffHour` is a REQUIRED
// argument everywhere, deliberately, so the compiler finds every caller.**
// This module was a separate one the compiler never saw. It is required here
// now for exactly the same reason — a default would let a caller silently get
// midnight boundaries while the closes around it use the cut-off, which is the
// disagreement DD-24 was answered to prevent.
//
// **The operator's decision, 2026-09-13: snap, and say so on screen.** The
// range moves to the trading-day clock so a filed figure reconciles with the
// sealed record, and the screen states the real boundaries — « 1 août 05:00 →
// 1 sept 05:00 (journée commerciale) » — rather than a period that is not what
// was measured. `cutoffHour` is returned alongside the bounds so the screen can
// say it without re-deriving anything.

/** One year plus a few days, so "the last 12 months" always fits. */
export const MAX_REPORT_RANGE_DAYS = 370;

const DAY_MS = 24 * 60 * 60 * 1000;

export class ReportRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportRangeError";
  }
}

export type ParsedRange = {
  /** Inclusive start, at `cutoffHour` local on the `from` day. */
  fromStart: Date;
  /** Exclusive end, at `cutoffHour` local on the day after `to`. */
  toEnd: Date;
  days: number;
  /** The cut-off these bounds were built on, so a caller can SAY so. */
  cutoffHour: number;
};

/**
 * Parse and bound a report's date range.
 *
 * Defaults to the last 7 days when nothing is supplied, matching the
 * behaviour the report routes already had.
 */
export function parseReportRange(
  fromStr: string | null,
  toStr: string | null,
  cutoffHour: number,
  now: Date = new Date(),
  maxDays: number = MAX_REPORT_RANGE_DAYS,
): ParsedRange {
  if (!Number.isInteger(cutoffHour) || cutoffHour < 0 || cutoffHour > 23) {
    throw new ReportRangeError("Heure de clôture invalide.");
  }
  const to = toStr ? new Date(toStr) : now;
  const from = fromStr
    ? new Date(fromStr)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new ReportRangeError("Dates invalides.");
  }

  // The trading-day clock. `businessDayBounds` in `period.ts` builds a single
  // day the same way — `new Date` normalises an overflowing day-of-month, so
  // the last day of a month runs into the first of the next without a case.
  const fromStart = new Date(from.getFullYear(), from.getMonth(), from.getDate(), cutoffHour);
  const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1, cutoffHour);

  if (toEnd <= fromStart) {
    throw new ReportRangeError("La date de fin doit être postérieure à la date de début.");
  }

  const days = Math.round((toEnd.getTime() - fromStart.getTime()) / DAY_MS);
  if (days > maxDays) {
    throw new ReportRangeError(
      `Période trop longue : ${days} jours demandés, maximum ${maxDays}. ` +
        "Affinez la période ou utilisez une clôture mensuelle/annuelle.",
    );
  }

  return { fromStart, toEnd, days, cutoffHour };
}
