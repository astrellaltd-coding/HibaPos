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
  /** Inclusive start, at 00:00 local. */
  fromStart: Date;
  /** Exclusive end, at 00:00 local of the day after `to`. */
  toEnd: Date;
  days: number;
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
  now: Date = new Date(),
  maxDays: number = MAX_REPORT_RANGE_DAYS,
): ParsedRange {
  const to = toStr ? new Date(toStr) : now;
  const from = fromStr
    ? new Date(fromStr)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new ReportRangeError("Dates invalides.");
  }

  const fromStart = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);

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

  return { fromStart, toEnd, days };
}
