// Fiscal period boundaries — pure, no database, no Node built-ins, so the POS
// screen and the close service can derive a period the same way.
//
// L-25 (Batch 3.6b): the close guard has to know when a period ENDS, and the
// fiscal screen has to know which period is the last completed one. Both must
// agree with the boundaries `closeMonth` / `closeYear` already hand to
// `aggregatePeriod` — local-time midnight, half-open `[from, to)` — so those
// boundaries are derived here and nowhere else. DD-18 asked for exactly that:
// reuse the existing convention rather than invent a second one.
//
// DD-23 / DD-24 (Batch 3.8) moved every boundary in this module onto the
// TRADING-DAY clock. A trading day runs from `cutoffHour` to `cutoffHour`, so
// a service that ends at 01:30 belongs to the day it started; and because the
// operator chose that the month and the exercice run on the same clock, June
// ends at the cut-off on 1 July rather than at midnight. The whole point is
// that a sale belongs to exactly one trading day, one month and one exercice,
// and no two sealed documents can disagree about it.
//
// **`cutoffHour` is a REQUIRED argument everywhere, deliberately.** A default
// would let a caller silently get midnight boundaries while the closes around
// it use the cut-off, which is precisely the disagreement DD-24 was answered
// to prevent. Making it required means the compiler finds every caller.

export type PeriodBounds = { from: Date; to: Date };

/** `YYYY-MM`, the key `MonthlyClose.period` is stored under. */
export function monthlyPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** `YYYY-MM-DD` in local time — the key `DailyClose.period` is stored under,
 *  and what tells the operator the first day a period becomes sealable.
 *  Deliberately not `toISOString()`, which would shift the day for any
 *  timezone east of UTC. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * A period boundary as the operator has to read it: `"2026-10-01"` at midnight,
 * `"2026-10-01 à 05:00"` once a cut-off has moved it.
 *
 * DD-24 (Batch 3.8) made this necessary and the tests found it. September now
 * ends at 05:00 on 1 October, so the refusal that said « à partir du
 * 2026-10-01 » was telling an operator to come back at a time that would
 * itself be refused for another five hours. Naming the day and not the hour
 * was correct only while every boundary was midnight.
 */
export function localBoundary(d: Date): string {
  const day = localDay(d);
  if (d.getHours() === 0 && d.getMinutes() === 0) return day;
  return `${day} à ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * DD-23 (Batch 3.8) — the trading day an instant belongs to.
 *
 * Before the cut-off hour, an instant belongs to the previous calendar day:
 * with `cutoffHour` 5, a ticket rung at 01:30 on Saturday belongs to Friday.
 * This is the one function that defines what "the day" means, and everything
 * else in this module is derived from it.
 */
export function businessDayOf(instant: Date, cutoffHour: number): string {
  const d = new Date(instant.getTime());
  if (d.getHours() < cutoffHour) d.setDate(d.getDate() - 1);
  return localDay(d);
}

/**
 * Half-open `[from, to)` for one trading day, as `aggregatePeriod` expects.
 *
 * `new Date` normalises an overflowing day-of-month, so the last day of a
 * month runs into the first of the next without a special case.
 */
export function businessDayBounds(day: string, cutoffHour: number): PeriodBounds {
  const [y, m, d] = day.split("-").map(Number);
  return {
    from: new Date(y, m - 1, d, cutoffHour),
    to: new Date(y, m - 1, d + 1, cutoffHour),
  };
}

/** Half-open `[from, to)` in local time, on the trading-day clock (DD-24). */
export function monthBounds(year: number, month: number, cutoffHour: number): PeriodBounds {
  return {
    from: new Date(year, month - 1, 1, cutoffHour),
    to: new Date(year, month, 1, cutoffHour),
  };
}

/** Half-open `[from, to)` in local time, on the trading-day clock (DD-24). */
export function yearBounds(year: number, cutoffHour: number): PeriodBounds {
  return {
    from: new Date(year, 0, 1, cutoffHour),
    to: new Date(year + 1, 0, 1, cutoffHour),
  };
}

/** True once `now` has reached the period's exclusive upper bound. At 23:30 on
 *  the last day of the period this is still false, which DD-18 accepts. */
export function hasPeriodEnded(bounds: PeriodBounds, now: Date): boolean {
  return now.getTime() >= bounds.to.getTime();
}

/**
 * The trading day that has most recently finished at `now` — what the close
 * screen proposes. Derived from `businessDayOf` rather than from the calendar,
 * so at 03:00 on Saturday with a 05:00 cut-off the day on offer is Thursday:
 * Friday is still running.
 */
export function lastCompletedBusinessDay(now: Date, cutoffHour: number): string {
  const current = businessDayBounds(businessDayOf(now, cutoffHour), cutoffHour);
  const previous = new Date(current.from.getTime());
  previous.setDate(previous.getDate() - 1);
  return localDay(previous);
}

/**
 * The month that has most recently finished at `now`, on the trading-day clock.
 *
 * DD-24 (Batch 3.8) rewrote this. It used to read `now.getMonth()` directly,
 * which is wrong the moment the month ends at the cut-off rather than at
 * midnight: at 03:00 on 1 July with a 05:00 cut-off, June has NOT ended, so the
 * month on offer must still be May. Taking the month of the current TRADING day
 * gets that right for free.
 */
export function lastCompletedMonth(now: Date, cutoffHour: number): { year: number; month: number } {
  const [year, month] = businessDayOf(now, cutoffHour).split("-").map(Number);
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** The exercice that has most recently finished at `now`, on the same clock and
 *  for the same reason as `lastCompletedMonth`. */
export function lastCompletedYear(now: Date, cutoffHour: number): number {
  return Number(businessDayOf(now, cutoffHour).split("-")[0]) - 1;
}

/**
 * L-54 (Batch 3.7, moved onto the trading-day clock by Batch 3.8) — has the
 * till been open since an EARLIER trading day?
 *
 * The Z seals a shift, and a shift is opened and closed by the operator. BOFiP
 * (BOI-TVA-DECLA-30-10-30 § 170) requires the software to « prévoir
 * obligatoirement une clôture journalière » — to *provide* one, which the
 * research of 2026-09-06 found means provide rather than force. Batch 3.8
 * provides it as a real sealed document; this function is what warns the
 * operator that the till in front of them has outlived a trading day.
 *
 * **Batch 3.8 changed the clock, and that is the whole of the change.** On
 * calendar days this fired on every service that ran past midnight, which is a
 * normal night in a restaurant and exactly the case DD-24's cut-off exists to
 * treat as one day. It now fires only when a genuine trading day has been
 * crossed. `now` earlier than `openedAt`, a clock moved back, answers false
 * rather than warning about the future.
 */
export function openedOnEarlierBusinessDay(
  openedAt: Date,
  now: Date,
  cutoffHour: number,
): boolean {
  if (now.getTime() < openedAt.getTime()) return false;
  return businessDayOf(openedAt, cutoffHour) !== businessDayOf(now, cutoffHour);
}
