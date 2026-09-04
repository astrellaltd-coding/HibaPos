// Fiscal period boundaries — pure, no database, no Node built-ins, so the POS
// screen and the close service can derive a period the same way.
//
// L-25 (Batch 3.6b): the close guard has to know when a period ENDS, and the
// fiscal screen has to know which period is the last completed one. Both must
// agree with the boundaries `closeMonth` / `closeYear` already hand to
// `aggregatePeriod` — local-time midnight, half-open `[from, to)` — so those
// boundaries are derived here and nowhere else. DD-18 asked for exactly that:
// reuse the existing convention rather than invent a second one.

export type PeriodBounds = { from: Date; to: Date };

/** `YYYY-MM`, the key `MonthlyClose.period` is stored under. */
export function monthlyPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Half-open `[from, to)` in local time, as `aggregatePeriod` expects. */
export function monthBounds(year: number, month: number): PeriodBounds {
  return { from: new Date(year, month - 1, 1), to: new Date(year, month, 1) };
}

/** Half-open `[from, to)` in local time, as `aggregatePeriod` expects. */
export function yearBounds(year: number): PeriodBounds {
  return { from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1) };
}

/** True once `now` has reached the period's exclusive upper bound. At 23:30 on
 *  the last day of the period this is still false, which DD-18 accepts. */
export function hasPeriodEnded(bounds: PeriodBounds, now: Date): boolean {
  return now.getTime() >= bounds.to.getTime();
}

/** The month that has most recently finished at `now` — what the close screen
 *  proposes. `getMonth()` is 0-based, so it is already the 1-based number of
 *  the month before this one; January rolls back to the previous December. */
export function lastCompletedMonth(now: Date): { year: number; month: number } {
  const month = now.getMonth();
  return month === 0
    ? { year: now.getFullYear() - 1, month: 12 }
    : { year: now.getFullYear(), month };
}

/** The exercice that has most recently finished at `now`. The current year
 *  cannot have ended, so this is always the one before it. */
export function lastCompletedYear(now: Date): number {
  return now.getFullYear() - 1;
}

/** `YYYY-MM-DD` in local time — used to tell the operator the first day a
 *  period becomes sealable. Deliberately not `toISOString()`, which would
 *  shift the day for any timezone east of UTC. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
