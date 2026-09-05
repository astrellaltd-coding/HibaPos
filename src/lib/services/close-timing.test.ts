import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { closeMonth, closeYear, verifyMonthlyCloses, verifyAnnualCloses } from "@/lib/services/fiscal";
import { verifyCloses } from "@/lib/fiscal";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import {
  monthBounds,
  yearBounds,
  hasPeriodEnded,
  lastCompletedMonth,
  lastCompletedYear,
  monthlyPeriod,
  localDay,
} from "@/lib/period";

// Batch 3.6b — L-25 (close timing) and L-26 (the refunds columns).
//
// L-25: Batch 3.6's `assertNextPeriod` enforces ORDER but not TIME. Sealing
// the current month succeeded on any day of it and sealed a partial month as
// the whole; `period` is `@unique`, so the rest of that month could never be
// sealed and would never appear in any close. A second gap in the same place:
// a period could be sealed while a caisse inside it was still OPEN, so the
// sealed period existed before its own last Z report did.
//
// DD-18 (operator, 2026-09-04): refuse both, server-side, with no override.
// So these tests assert REFUSALS — and, as in Batch 3.6, that a refusal
// writes nothing at all.
//
// L-26: `aggregatePeriod` has always returned the period's refunds; the close
// hashed them inside `dataJson` and had nowhere to put them, so no query,
// report or screen could read them back.

async function reset() {
  await db.fiscalEvent.deleteMany();
  await db.monthlyClose.deleteMany();
  await db.annualClose.deleteMany();
  await db.refund.deleteMany();
  await db.payment.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
  await ensureFiscalCounter();
  const user = await db.user.create({
    data: { username: `l25-${Date.now()}-${Math.random()}`, name: "Resp", role: "SUPER_ADMIN", pinHash: "x:y" },
  });
  return user.id;
}

/** A closed caisse, so the open-caisse guard is not what a test is measuring. */
async function closedShift(userId: string, number: number, openedAt: Date) {
  return db.shift.create({
    data: {
      number,
      openedById: userId,
      openedAt,
      status: "CLOSED",
      closedById: userId,
      closedAt: new Date(openedAt.getTime() + 3_600_000),
      openingFloat: 5000,
    },
  });
}

// --------------------------------------------------------------- pure part --

describe("period boundaries (L-25)", () => {
  it("uses the same half-open local-time bounds as aggregatePeriod", () => {
    const { from, to } = monthBounds(2026, 9);
    expect(from).toEqual(new Date(2026, 8, 1));
    expect(to).toEqual(new Date(2026, 9, 1));
    expect(yearBounds(2026)).toEqual({ from: new Date(2026, 0, 1), to: new Date(2027, 0, 1) });
    expect(monthlyPeriod(2026, 9)).toBe("2026-09");
  });

  it("treats a period as ended only once its exclusive bound is reached", () => {
    const sept = monthBounds(2026, 9);
    // 23:30 on the last day is still inside the period — DD-18 accepts this.
    expect(hasPeriodEnded(sept, new Date(2026, 8, 30, 23, 30))).toBe(false);
    expect(hasPeriodEnded(sept, new Date(2026, 8, 30, 23, 59, 59, 999))).toBe(false);
    expect(hasPeriodEnded(sept, new Date(2026, 9, 1, 0, 0, 0, 0))).toBe(true);
  });

  it("proposes the last completed month and exercice, never the current one", () => {
    // The defect L-25 names: the screen defaulted to the month in progress.
    expect(lastCompletedMonth(new Date(2026, 8, 4))).toEqual({ year: 2026, month: 8 });
    expect(lastCompletedMonth(new Date(2026, 8, 30, 23, 59))).toEqual({ year: 2026, month: 8 });
    expect(lastCompletedMonth(new Date(2026, 9, 1))).toEqual({ year: 2026, month: 9 });
    // January rolls back to the previous December.
    expect(lastCompletedMonth(new Date(2027, 0, 1))).toEqual({ year: 2026, month: 12 });
    expect(lastCompletedYear(new Date(2026, 8, 4))).toBe(2025);
    expect(lastCompletedYear(new Date(2027, 0, 1))).toBe(2026);
  });

  it("names the day a period becomes sealable in local time", () => {
    // Not toISOString(): east of UTC that prints the day before.
    expect(localDay(new Date(2026, 9, 1))).toBe("2026-10-01");
    expect(localDay(new Date(2027, 0, 1))).toBe("2027-01-01");
  });

  it("the default the screen used to propose is one the server now refuses", () => {
    // `fiscal-view.tsx` seeded its two fields with `now.getFullYear()` and
    // `now.getMonth() + 1` — the month IN PROGRESS. That is the defect half
    // of L-25 that no server guard can fix: the wrong period was the one on
    // offer, on a control whose result is irreversible.
    const now = new Date(2026, 8, 4);
    const oldDefault = { year: now.getFullYear(), month: now.getMonth() + 1 };
    expect(hasPeriodEnded(monthBounds(oldDefault.year, oldDefault.month), now)).toBe(false);

    const newDefault = lastCompletedMonth(now);
    expect(newDefault).not.toEqual(oldDefault);
    expect(hasPeriodEnded(monthBounds(newDefault.year, newDefault.month), now)).toBe(true);
  });

  it("proposes a period the server would accept", () => {
    // The screen's default and the server's guard must not disagree — that
    // disagreement is precisely what L-25 was.
    for (const now of [new Date(2026, 8, 4), new Date(2027, 0, 1), new Date(2026, 11, 31, 23, 59)]) {
      const { year, month } = lastCompletedMonth(now);
      expect(hasPeriodEnded(monthBounds(year, month), now)).toBe(true);
      expect(hasPeriodEnded(yearBounds(lastCompletedYear(now)), now)).toBe(true);
    }
  });
});

// ------------------------------------------------------------ monthly part --

describe("a month cannot be sealed before it has ended (L-25)", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await reset();
  });

  it("REFUSES the current month and writes nothing", async () => {
    const now = new Date(2026, 8, 4, 14, 0); // 4 September 2026
    await expect(closeMonth(2026, 9, userId, false, now)).rejects.toThrow(/prématurée/);
    await expect(closeMonth(2026, 9, userId, false, now)).rejects.toThrow(/2026-10-01/);

    // No row, no CLOTURE_M, no consumed sequence number — the guard runs
    // before the aggregation for exactly this reason.
    expect(await db.monthlyClose.count()).toBe(0);
    expect(await db.fiscalEvent.count()).toBe(0);
    const counter = await db.fiscalCounter.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(counter.lastFiscalEventSequence).toBe(0);
  });

  it("REFUSES on the last day and ACCEPTS on the first day of the next month", async () => {
    // The boundary, both directions.
    await expect(
      closeMonth(2026, 9, userId, false, new Date(2026, 8, 30, 23, 59, 59)),
    ).rejects.toThrow(/prématurée/);
    expect(await db.monthlyClose.count()).toBe(0);

    const close = await closeMonth(2026, 9, userId, false, new Date(2026, 9, 1, 0, 0, 0));
    expect(close.period).toBe("2026-09");
    expect((await verifyMonthlyCloses()).ok).toBe(true);
  });

  it("accepts a month that ended long ago", async () => {
    const close = await closeMonth(2026, 4, userId, false, new Date(2026, 8, 4));
    expect(close.period).toBe("2026-04");
  });

  it("has no override — FACTICE mode does not unlock a premature close", async () => {
    // DD-18: refused server-side, without an override. `factice` marks the
    // journal entry as simulated; it is not a licence to seal a live period.
    await expect(closeMonth(2026, 9, userId, true, new Date(2026, 8, 4))).rejects.toThrow(
      /prématurée/,
    );
    expect(await db.monthlyClose.count()).toBe(0);
  });
});

describe("a month cannot be sealed while one of its caisses is open (L-25)", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await reset();
  });

  it("REFUSES while a caisse opened inside the period is still OPEN, and writes nothing", async () => {
    const shift = await db.shift.create({
      data: { number: 7, openedById: userId, openedAt: new Date(2026, 8, 20, 11, 0), status: "OPEN", openingFloat: 5000 },
    });

    const now = new Date(2026, 9, 3);
    await expect(closeMonth(2026, 9, userId, false, now)).rejects.toThrow(/n° 7/);
    await expect(closeMonth(2026, 9, userId, false, now)).rejects.toThrow(/n'est pas clôturée/);
    expect(await db.monthlyClose.count()).toBe(0);
    expect(await db.fiscalEvent.count()).toBe(0);

    // Closing the caisse is all it takes.
    await db.shift.update({
      where: { id: shift.id },
      data: { status: "CLOSED", closedById: userId, closedAt: new Date(2026, 8, 20, 23, 0) },
    });
    const close = await closeMonth(2026, 9, userId, false, now);
    expect(close.period).toBe("2026-09");
    expect((await verifyMonthlyCloses()).ok).toBe(true);
  });

  // INVERTED for L-27 (Batch 3.6c), not deleted. It read:
  //
  //   it("ignores an open caisse that belongs to another period", ...)
  //     "The rule DD-18 set is scoped to the period being sealed: a caisse
  //      opened in October must not block September's close."
  //     -> expect(close.period).toBe("2026-09")
  //
  // That was a faithful test of the scope DD-18 asked for, and the scope was
  // the defect. The operator widened the rule on 2026-09-05: ANY open caisse
  // refuses. The fixture is unchanged — a caisse opened in October, September
  // being sealed — and only the expectation is turned round, so the two
  // behaviours can be read against each other.
  it("REFUSES because of an open caisse that belongs to another period", async () => {
    await db.shift.create({
      data: { number: 8, openedById: userId, openedAt: new Date(2026, 9, 2, 9, 0), status: "OPEN", openingFloat: 5000 },
    });
    await expect(closeMonth(2026, 9, userId, false, new Date(2026, 9, 3))).rejects.toThrow(/n° 8/);
    await expect(closeMonth(2026, 9, userId, false, new Date(2026, 9, 3))).rejects.toThrow(
      /n'est pas clôturée/,
    );
    expect(await db.monthlyClose.count()).toBe(0);
    expect(await db.fiscalEvent.count()).toBe(0);
  });
});

// ------------------------------------------------ L-27, Batch 3.6c ----------

describe("no period is sealed while ANY caisse is open (L-27)", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await reset();
  });

  it("REFUSES because of a caisse opened BEFORE the period and never closed", async () => {
    // The case the old guard could not see, and the reason the finding's own
    // row understated it. `openedAt` was matched against the period window, so
    // a caisse whose opening predates the earliest period being sealed matched
    // NO window and blocked NO close — not merely the first one. DD-05's
    // sequencing does not catch it either: the same caisse failed to block the
    // previous period on the same reasoning.
    await db.shift.create({
      data: { number: 3, openedById: userId, openedAt: new Date(2026, 7, 28, 2, 24), status: "OPEN", openingFloat: 10000 },
    });
    await expect(closeMonth(2026, 9, userId, false, new Date(2026, 9, 3))).rejects.toThrow(/n° 3/);
    expect(await db.monthlyClose.count()).toBe(0);
    expect(await db.fiscalEvent.count()).toBe(0);
  });

  it("REFUSES the production shape this was found on", async () => {
    // Measured on `db/custom.db`, 2026-09-05: caisse n° 3 opened 2026-08-28
    // 02:24 and still OPEN, holding orders created 2026-09-01. Sealing
    // September passed the old guard while September's takings sat in a caisse
    // that had never produced a Z report — so the close could not be checked
    // against the sum of its Z reports, which is what Batch 3.2 established
    // and what a sealed document can never be corrected to satisfy later.
    const shift = await db.shift.create({
      data: { number: 3, openedById: userId, openedAt: new Date(2026, 7, 28, 2, 24), status: "OPEN", openingFloat: 10000 },
    });
    await db.order.create({
      data: {
        number: 9001, shiftId: shift.id, cashierId: userId, status: "COMPLETED",
        subtotal: 2850, discountTotal: 0, total: 2850, vatTotal: 259, itemCount: 1,
        createdAt: new Date(2026, 8, 1, 22, 28), completedAt: new Date(2026, 8, 1, 22, 28),
      },
    });
    await expect(closeMonth(2026, 9, userId, false, new Date(2026, 9, 3))).rejects.toThrow(/n° 3/);
    expect(await db.monthlyClose.count()).toBe(0);
  });

  it("still seals when every caisse is closed, including one that spans the period boundary", async () => {
    // THE OVER-REFUSAL CONTROL, and the reason it is here: a guard that
    // refused every close would satisfy all three tests above. A caisse opened
    // in August and closed in September is the ordinary long-running case, and
    // it must not block anything once its Z exists.
    await closedShift(userId, 3, new Date(2026, 7, 28, 2, 24));
    await closedShift(userId, 4, new Date(2026, 8, 15, 9, 0));
    const close = await closeMonth(2026, 9, userId, false, new Date(2026, 9, 3));
    expect(close.period).toBe("2026-09");
    expect((await verifyMonthlyCloses()).ok).toBe(true);
  });

  it("REFUSES an exercice for a caisse opened before the year, and seals once it is closed", async () => {
    // The annual half. `closeYear` calls the same guard, so this pins that the
    // widening reached both callers rather than only the monthly one.
    const shift = await db.shift.create({
      data: { number: 5, openedById: userId, openedAt: new Date(2025, 10, 4, 9, 0), status: "OPEN", openingFloat: 5000 },
    });
    await expect(closeYear(2026, userId, false, new Date(2027, 0, 2))).rejects.toThrow(/n° 5/);
    expect(await db.annualClose.count()).toBe(0);

    await db.shift.update({
      where: { id: shift.id },
      data: { status: "CLOSED", closedById: userId, closedAt: new Date(2025, 10, 4, 23, 0) },
    });
    const close = await closeYear(2026, userId, false, new Date(2027, 0, 2));
    expect(close.period).toBe("2026");
    expect((await verifyAnnualCloses()).ok).toBe(true);
  });

  it("names the lowest-numbered open caisse when several are open", async () => {
    // Deterministic on purpose: `orderBy: { number: "asc" }` survived the
    // widening, so the operator is always pointed at the oldest unclosed till
    // rather than at whichever row the database happened to return.
    for (const n of [11, 9, 14]) {
      await db.shift.create({
        data: { number: n, openedById: userId, openedAt: new Date(2026, 8, n, 9, 0), status: "OPEN", openingFloat: 0 },
      });
    }
    await expect(closeMonth(2026, 9, userId, false, new Date(2026, 9, 3))).rejects.toThrow(/n° 9/);
  });

  it("no longer claims the caisse was opened during the period", async () => {
    // The message had to change with the rule: it said « la caisse n° N,
    // ouverte pendant 2026-09, n'est pas clôturée », which is now false for
    // exactly the case this batch exists to catch. Asserting the absence keeps
    // a future edit from reinstating a sentence that would be a lie.
    await db.shift.create({
      data: { number: 6, openedById: userId, openedAt: new Date(2026, 7, 1, 9, 0), status: "OPEN", openingFloat: 0 },
    });
    const err: unknown = await closeMonth(2026, 9, userId, false, new Date(2026, 9, 3)).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toContain("n° 6");
    expect(message).toContain("Clôturez-la (rapport Z)");
    expect(message).not.toContain("ouverte pendant");
  });
});

// ------------------------------------------------------------- annual part --

describe("an exercice obeys both timing rules (L-25)", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await reset();
  });

  it("REFUSES the current exercice, naming the first day it can be sealed", async () => {
    const now = new Date(2026, 8, 4);
    await expect(closeYear(2026, userId, false, now)).rejects.toThrow(/prématurée/);
    await expect(closeYear(2026, userId, false, now)).rejects.toThrow(/exercice 2026/);
    await expect(closeYear(2026, userId, false, now)).rejects.toThrow(/2027-01-01/);
    expect(await db.annualClose.count()).toBe(0);
    expect(await db.fiscalEvent.count()).toBe(0);
  });

  it("REFUSES on 31 December and ACCEPTS on 1 January", async () => {
    await expect(closeYear(2026, userId, false, new Date(2026, 11, 31, 23, 59))).rejects.toThrow(
      /prématurée/,
    );
    const close = await closeYear(2026, userId, false, new Date(2027, 0, 1));
    expect(close.period).toBe("2026");
    expect((await verifyAnnualCloses()).ok).toBe(true);
  });

  it("REFUSES while a caisse opened inside the year is still OPEN", async () => {
    await db.shift.create({
      data: { number: 9, openedById: userId, openedAt: new Date(2026, 5, 5, 10, 0), status: "OPEN", openingFloat: 5000 },
    });
    await expect(closeYear(2026, userId, false, new Date(2027, 0, 2))).rejects.toThrow(/n° 9/);
    expect(await db.annualClose.count()).toBe(0);
  });

  it("still requires nothing of the year's monthly closes", async () => {
    // Recorded, not changed: the screen's hint says « Clôturez les douze mois
    // avant l'exercice » and the code has never enforced it. Adding that
    // requirement is a decision nobody has taken (Batch 3.6b, L-25).
    const close = await closeYear(2026, userId, false, new Date(2027, 0, 2));
    expect(close.period).toBe("2026");
    expect(await db.monthlyClose.count()).toBe(0);
  });
});

describe("the sequence guard still runs first (M-01 + L-25)", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await reset();
  });

  it("reports the out-of-sequence period, not the timing, when both are wrong", async () => {
    await closeMonth(2026, 4, userId, false, new Date(2026, 8, 4));
    // 2026-09 is both out of sequence (2026-05 is next) and not yet over.
    await expect(closeMonth(2026, 9, userId, false, new Date(2026, 8, 4))).rejects.toThrow(
      /hors séquence/,
    );
    expect(await db.monthlyClose.count()).toBe(1);
  });
});

// --------------------------------------------------------- refunds columns --

describe("period closes carry their refunds (L-26)", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await reset();
  });

  async function seedApril(userId: string) {
    const shift = await closedShift(userId, 20, new Date(2026, 3, 4, 10, 0));
    const when = new Date(2026, 3, 4, 12, 0);

    // A plain sale.
    await db.order.create({
      data: {
        number: 3001, shiftId: shift.id, cashierId: userId, status: "COMPLETED",
        subtotal: 2000, discountTotal: 0, total: 2000, vatTotal: 182, itemCount: 1,
        createdAt: when, completedAt: when,
        items: { create: [{ productName: "Burger", quantity: 1, lineTotal: 2000, vatRate: 10, unitPrice: 2000 }] },
        payments: { create: [{ method: "CASH", amount: 2000, cashierId: userId }] },
      },
    });
    // Two refunds, on two different orders, so count and total differ.
    for (const [n, total, refund] of [[3002, 1500, 500], [3003, 900, 400]] as const) {
      const o = await db.order.create({
        data: {
          number: n, shiftId: shift.id, cashierId: userId, status: "COMPLETED",
          subtotal: total, discountTotal: 0, total, vatTotal: 0, itemCount: 1,
          createdAt: when, completedAt: when,
          items: { create: [{ productName: "Tacos", quantity: 1, lineTotal: total, vatRate: 10, unitPrice: total }] },
          payments: { create: [{ method: "CARD", amount: total, cashierId: userId }] },
        },
      });
      await db.refund.create({
        data: { orderId: o.id, amount: refund, method: "CARD", reason: "partiel", cashierId: userId, shiftId: shift.id, createdAt: when },
      });
    }
  }

  it("writes refundsTotal and refundsCount on the monthly close", async () => {
    await seedApril(userId);
    const close = await closeMonth(2026, 4, userId, false, new Date(2026, 4, 2));

    expect(close.refundsTotal).toBe(900); // 500 + 400
    expect(close.refundsCount).toBe(2);
    // The columns must equal what the sealed payload hashed, not a second
    // derivation of it.
    const payload = JSON.parse(close.dataJson);
    expect(payload.totalRefunded).toBe(close.refundsTotal);
    expect(payload.refundsCount).toBe(close.refundsCount);
    expect((await verifyMonthlyCloses()).ok).toBe(true);
  });

  it("writes them on the annual close too, and the CLOTURE_A payload still verifies", async () => {
    await seedApril(userId);
    const close = await closeYear(2026, userId, false, new Date(2027, 0, 2));

    expect(close.refundsTotal).toBe(900);
    expect(close.refundsCount).toBe(2);
    expect((await verifyAnnualCloses()).ok).toBe(true);

    const ev = await db.fiscalEvent.findFirstOrThrow({ where: { type: "CLOTURE_A" } });
    expect(JSON.parse(ev.dataJson).period).toBe("2026");
  });

  it("records a period with no refunds as 0 / 0, not null", async () => {
    // A close always has a refunds figure; 0 is the answer, not "unknown".
    // Same reasoning as M-07's on ZReport.
    const close = await closeMonth(2026, 4, userId, false, new Date(2026, 4, 2));
    expect(close.refundsTotal).toBe(0);
    expect(close.refundsCount).toBe(0);
  });

  it("changes the hashed payload's shape — provable only because no close exists", async () => {
    // The payload gains `refundsCount`, so a close sealed before this batch
    // would hash differently from one sealed after. That is safe here and
    // nowhere else: verified read-only on the production database on
    // 2026-09-04, MonthlyClose and AnnualClose both held ZERO rows, so there
    // is no earlier close whose hash could move. This test states the premise
    // rather than assuming it — if it ever fails, the premise is gone.
    expect(await db.monthlyClose.count()).toBe(0);
    expect(await db.annualClose.count()).toBe(0);

    await seedApril(userId);
    const close = await closeMonth(2026, 4, userId, false, new Date(2026, 4, 2));
    const payload = JSON.parse(close.dataJson);
    expect(Object.keys(payload).sort()).toEqual([
      "cardTotal", "cashTotal", "discountsTotal", "month", "period", "refundsCount",
      "salesCount", "salesTotal", "topProducts", "totalRefunded", "vatBreakdown",
      "vatTotal", "voucherTotal", "year",
    ]);

    // And the chain over the row as sealed still recomputes.
    const rows = await db.monthlyClose.findMany({ orderBy: { period: "asc" } });
    expect(
      verifyCloses(
        rows.map((r) => ({
          period: r.period,
          timestamp: r.sealedAt,
          dataJson: r.dataJson,
          previousHash: r.previousHash,
          hash: r.hash,
        })),
      ).ok,
    ).toBe(true);
  });
});
