/**
 * L-228 — seal the trading day when the caisse is closed.
 *
 * ── WHAT THE OPERATOR ASKED FOR, 2026-09-20 ─────────────────────────────────
 * « Once he closed the till, the day is auto closed. » He shuts the restaurant
 * at 23:00, closes the caisse at 23:30, and the day should be sealed — because
 * a cashier cannot be relied on to remember a second action on a second screen,
 * and the France caisse had by then been left open for 48 hours, during which
 * no day could be sealed at all.
 *
 * ── IT IS NOT ONE DAY, IT IS EVERY DAY THAT IS OWED ─────────────────────────
 * `assertDaySequence` seals in order and refuses to skip a day that recorded
 * operations. So if the caisse was left open across a night — or the auto-seal
 * failed once — there may be several days owed, and sealing only the newest
 * would be refused. This walks them earliest first, exactly as the sequence
 * guard requires, and stops at the first failure rather than pressing on.
 *
 * ── TODAY IS SEALED ONLY IF SOMETHING WAS RUNG, AND ONLY ON REQUEST ─────────
 * Two conditions, and both exist to protect an evening's trade.
 *
 * **TODAY IS SEALED UNCONDITIONALLY, and that is the operator's decision.**
 * For one evening this was a pre-checked switch, so that a caisse closed at
 * 15:00 by mistake could not seal the day and refuse every sale until midnight.
 * Shown that case on 2026-09-20 the operator answered that it is not a case:
 * « if he close the tail, that's mean that day is finished ». One session a
 * day, closed when the restaurant closes. So the switch is gone and closing the
 * till closes the day, every time.
 *
 * ONE CONDITION SURVIVES: **something must have been rung**. An empty day has
 * nothing to seal, and sealing it would lock the till out of a day that never
 * traded — a caisse opened by mistake and closed again must not cost the
 * evening, and that is the only version of the accident left.
 *
 * ── IT NEVER FAILS THE Z ────────────────────────────────────────────────────
 * The Z is a sealed fiscal document and it has already succeeded by the time
 * this runs. A day that cannot be sealed is reported to the operator and caught
 * by guard C the next morning, which is precisely why guard C exists. Same
 * shape the automatic backup already uses after a Z, and for the same reason.
 */

import { db } from "@/lib/db";
import { closeDay } from "@/lib/services/fiscal";
import { businessDayOf, businessDayBounds } from "@/lib/period";
import {
  earliestUnsealedDayWithActivity,
  type TradingDay,
} from "@/lib/services/trading-day-guard";

export type AutoSealResult = {
  /** Days sealed by this call, earliest first. Empty is the ordinary answer on
   *  a second close in one day, and is not a failure. */
  sealed: TradingDay[];
  /** The day that could not be sealed and why, or null. Walking stops here. */
  failed: { day: TradingDay; message: string } | null;
};

/**
 * A day nobody traded in has nothing to seal.
 *
 * The same three tables `assertDaySequence` and guard C look at, for the same
 * reason — and `Refund.createdAt` rather than the sale's date, because L-95
 * settled that the day with something to seal is the day the money moved.
 */
export async function dayHasActivity(day: TradingDay, cutoffHour: number): Promise<boolean> {
  const { from, to } = businessDayBounds(day, cutoffHour);
  const where = { createdAt: { gte: from, lt: to } } as const;
  const [order, movement, refund] = await Promise.all([
    db.order.count({ where }),
    db.cashMovement.count({ where }),
    db.refund.count({ where }),
  ]);
  return order + movement + refund > 0;
}

/**
 * **A CEILING ON THE WALK, and it is not defensive programming.**
 *
 * `closeDay` refuses a day it has already sealed, so a day cannot be walked
 * twice and the loop terminates on any correct implementation. The bound is
 * here for the incorrect one: a bug that sealed nothing while reporting success
 * would spin against the database forever inside a request that has already
 * taken a Z report and a backup. Sixty-two days is two months of arrears, far
 * past the point where somebody should have been told instead.
 */
const MAX_DAYS = 62;

export async function sealDaysAfterShiftClose(opts: {
  now: Date;
  cutoffHour: number;
  userId: string;
  factice: boolean;
}): Promise<AutoSealResult> {
  const { now, cutoffHour, userId, factice } = opts;
  const sealed: TradingDay[] = [];

  // ── the days that have ENDED and are owed ────────────────────────────────
  for (let i = 0; i < MAX_DAYS; i++) {
    const day = await earliestUnsealedDayWithActivity(now, cutoffHour, db);
    if (!day) break;
    try {
      await closeDay(day, userId, factice, now);
      sealed.push(day);
    } catch (e) {
      return { sealed, failed: { day, message: e instanceof Error ? e.message : String(e) } };
    }
  }

  // ── and the day in progress, which is the one the operator asked for ─────
  const today = businessDayOf(now, cutoffHour);
  const already = await db.dailyClose.findUnique({ where: { period: today }, select: { period: true } });
  if (already) return { sealed, failed: null };
  if (!(await dayHasActivity(today, cutoffHour))) return { sealed, failed: null };

  try {
    // The ONE call in this project that passes `sealTheDayInProgress`. Its own
    // safety is `assertNoOpenShift`, which still runs inside `closeDay` — and
    // the caisse has just been closed, which is what makes this reachable at
    // all.
    await closeDay(today, userId, factice, now, { sealTheDayInProgress: true });
    sealed.push(today);
  } catch (e) {
    return { sealed, failed: { day: today, message: e instanceof Error ? e.message : String(e) } };
  }

  return { sealed, failed: null };
}
