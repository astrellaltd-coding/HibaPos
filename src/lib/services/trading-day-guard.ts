/**
 * L-99 / L-228 — what the trading day is allowed to permit, in one place.
 *
 * ── WHAT PUT THIS HERE ──────────────────────────────────────────────────────
 * On 2026-09-19 the operator found the France caisse had been **open for about
 * 48 hours**: the owner shut the restaurant and did not close the till. Two
 * consequences, and the second is the one nobody had noticed.
 *
 *   1. Its Z would have covered two trading days, so « a period close equals
 *      the sum of its Z reports » fails in both directions — L-99, measured.
 *   2. **No day could be sealed at all meanwhile.** `assertNoOpenShift` refuses
 *      the daily, monthly and annual close while any caisse is OPEN, so a till
 *      left open does not merely mis-scope one Z — it stops the fiscal record
 *      advancing until somebody notices.
 *
 * The software did warn, on the Fiscal screen, which is not where a cashier is.
 *
 * ── THE THREE RULES ─────────────────────────────────────────────────────────
 * The operator's decision, 2026-09-20, after the two shapes were put in
 * writing. A cashier cannot be relied on to remember, so the till refuses:
 *
 *   A. `sealedDayRefusal`  — no sale into a trading day that is already SEALED.
 *   B. `staleShiftRefusal` — no sale through a caisse whose trading day is over.
 *   C. `unsealedDayRefusal`— no OPENING a caisse while an ended day that
 *                            recorded operations is still unsealed.
 *
 * **A EXISTS BEFORE ANY OF THIS IS AUTOMATED, AND THAT ORDER IS THE POINT.**
 * L-228: nothing has ever refused a sale into a sealed day, and the only reason
 * it has never happened is arithmetic — to book into sealed day `D` you need
 * `businessDayOf(now) == D`, so `now < end(D)`; but `D` was sealed only after
 * `assertPeriodEnded` passed, so `now >= end(D)`. Both cannot hold. **Relaxing
 * that guard — which the auto-seal design asks for next — is what arms it**, and
 * so is raising `businessDayCutoffHour` after a day has been sealed, which is
 * one number in Réglages and no code at all. A is the guard that makes « cannot
 * happen » into « is not allowed to happen », and only the second survives a
 * settings change.
 *
 * ── ONE MODULE, EVERY CALLER ASKS IT ────────────────────────────────────────
 * The shape L-214 established and this project keeps returning to: the rule
 * lives here, `POST /api/orders` and `POST /api/shifts` ask it, and neither
 * spells it out for itself. Two sides writing the same rule in their own words
 * is precisely how the delivery rule drifted, and a rule inside a route handler
 * is a rule no test can call.
 *
 * Every refusal is in French, names the day it is about, and says what to do.
 */

import { businessDayOf, businessDayBounds } from "@/lib/period";
import type { PrismaClient } from "@prisma/client";

/** Accepts the client or a transaction, like the rest of `services/`. */
type Tx = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** `"YYYY-MM-DD"`, as the sealed `DailyClose.period` spells it. */
export type TradingDay = string;

/**
 * A — is the trading day `now` falls in already sealed?
 *
 * Returns the sealed day, or `null`. The caller refuses on a day; it does not
 * decide which day that is.
 */
export async function sealedDayForNow(
  now: Date,
  cutoffHour: number,
  client: Tx,
): Promise<TradingDay | null> {
  const day = businessDayOf(now, cutoffHour);
  const close = await client.dailyClose.findUnique({ where: { period: day }, select: { period: true } });
  return close ? close.period : null;
}

export const sealedDayRefusal = (day: TradingDay) =>
  `La journée ${day} est déjà clôturée et scellée : aucune vente ne peut plus y être enregistrée. ` +
  `Ouvrez la journée suivante.`;

/**
 * B — has the open caisse's trading day ended?
 *
 * Compared on the CUT-OFF CLOCK and not the calendar, so a service running from
 * 22:00 to 01:00 under a 2 a.m. cut-off is one day and does not trip this. With
 * the cut-off at 0 — the France till's setting from 2026-09-20 — the two agree.
 *
 * Pure: it takes the two instants and the hour, so a test drives it with fixed
 * dates and no database.
 */
export function staleShiftDay(openedAt: Date, now: Date, cutoffHour: number): TradingDay | null {
  // A clock moved backwards answers null rather than refusing a sale: the same
  // choice `openedOnEarlierBusinessDay` makes, and for the same reason — an
  // operator must never be locked out by a timezone or a DST correction.
  if (now.getTime() < openedAt.getTime()) return null;
  const opened = businessDayOf(openedAt, cutoffHour);
  return opened === businessDayOf(now, cutoffHour) ? null : opened;
}

/**
 * IT RETURNS THE DAY AND NOT A BOOLEAN, and that is not a style choice.
 *
 * The first version answered `boolean` and the caller then computed the day
 * itself, to name it in the refusal — `businessDayOf(shift.openedAt, …)` inside
 * the route. This file's own anti-drift test caught it: a route that computes a
 * trading day is a route that can come to disagree with this module about what
 * one is. One call, one answer, and the route formats nothing.
 */

export const staleShiftRefusal = (shiftNumber: number, openedDay: TradingDay) =>
  `La caisse n° ${shiftNumber} a été ouverte le ${openedDay} et cette journée est terminée. ` +
  `Clôturez-la (rapport Z) avant d'encaisser à nouveau.`;

/**
 * C — an ended trading day that recorded operations and is not sealed.
 *
 * Returns the EARLIEST such day, or `null`. Earliest rather than latest because
 * `assertDaySequence` seals in order: telling the operator about the most
 * recent one would send them to a close the software would then refuse.
 *
 * **A QUIET DAY IS NOT ONE OF THESE.** The search is for an order, a cash
 * movement or a refund — the same three `assertDaySequence` looks for, for the
 * same reason. A Monday the restaurant was closed has nothing to seal and does
 * not block anything, so a holiday piles up no debt. Measured 2026-09-20
 * against the sequence guard rather than assumed.
 *
 * `Refund.createdAt` and not the sale's date: L-95 settled that the day with
 * something to seal is the day the money left the drawer.
 */
export async function earliestUnsealedDayWithActivity(
  now: Date,
  cutoffHour: number,
  client: Tx,
): Promise<TradingDay | null> {
  const today = businessDayBounds(businessDayOf(now, cutoffHour), cutoffHour);

  const latest = await client.dailyClose.findFirst({
    orderBy: { period: "desc" },
    select: { period: true },
  });
  const from = latest ? businessDayBounds(latest.period, cutoffHour).to : new Date(0);

  // Anything at or after `today.from` belongs to the day in progress, which is
  // not ended and is not this rule's business.
  const where = { createdAt: { gte: from, lt: today.from } } as const;
  const [order, movement, refund] = await Promise.all([
    client.order.findFirst({ where, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    client.cashMovement.findFirst({ where, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    client.refund.findFirst({ where, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);

  const earliest = [order?.createdAt, movement?.createdAt, refund?.createdAt]
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return earliest ? businessDayOf(earliest, cutoffHour) : null;
}

export const unsealedDayRefusal = (day: TradingDay) =>
  `La journée ${day} a enregistré des opérations et n'est pas clôturée. ` +
  `Scellez la clôture du jour ${day} avant d'ouvrir une nouvelle caisse.`;

/**
 * The override, and why it exists at all.
 *
 * B and C can stop a restaurant selling. If the seal itself fails — an
 * out-of-sequence day, a crash between the Z and the close — the alternative to
 * an escape is a till that takes no order at 11:30 on a Saturday until somebody
 * reaches a developer. **The operator chose the escape on 2026-09-20**, with two
 * conditions that are the whole of its safety: only a SUPER_ADMIN may take it,
 * and taking it is written into the fiscal journal.
 *
 * It does NOT override A. A protects a document that is already sealed, and
 * nothing operational is worth writing a sale into one — if today is sealed,
 * the answer is the next day, not a force.
 */
export const FORCE_OPEN_EVENT = "OUVERTURE_FORCEE";

export const forceNotPermittedRefusal =
  `Seul un super administrateur peut forcer l'ouverture d'une caisse ` +
  `alors qu'une journée n'est pas scellée.`;
