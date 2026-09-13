import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { closeDay } from "@/lib/services/fiscal";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { saveSettings } from "@/lib/services/settings";
import { hashPin } from "@/lib/auth";

// R8.6 — L-95, L-130 and L-99, in `fiscal.ts`.
//
// L-95 IS THE ONE THAT BECOMES PERMANENT. `assertDaySequence` counted a day as
// having traded if it held an order or a cash movement, and not if its only
// event was a REFUND. So a refund-only day could be skipped — and once a later
// day is sealed, the out-of-sequence guard refuses it **for ever**. The
// daily-close chain then carries a hole for a day on which cash left the
// drawer, and nothing can fill it.
//
// The function's own docstring already stated the criterion it failed:
// « "Traded" is deliberately orders **or** cash movements … a day whose only
// event was a payout from the drawer still has something the close would have
// recorded. » A refund is a payout from the drawer.
//
// Reachable without contrivance: pay out a refund against an older order, sell
// nothing, run the Z, go home; next day, sell and seal.

const CUTOFF = 5;
let userId: string;

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.dailyClose.deleteMany();
  await db.zReport.deleteMany();
  await db.refund.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.cashMovement.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
  await db.setting.deleteMany();
}

beforeEach(async () => {
  await wipe();
  await ensureFiscalCounter();
  await saveSettings({ businessDayCutoffHour: CUTOFF, factice: false });
  const u = await db.user.create({
    data: {
      username: `r86-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin("424242"),
    },
  });
  userId = u.id;
});

afterAll(wipe);

/** A closed shift, so `assertNoOpenShift` does not mask what is under test. */
async function closedShiftAt(when: Date) {
  return db.shift.create({
    data: {
      number: Math.floor(Math.random() * 1_000_000),
      openedById: userId,
      openedAt: when,
      closedAt: when,
      openingFloat: 0,
      status: "CLOSED",
    },
  });
}

async function orderAt(when: Date, total = 1000) {
  return db.order.create({
    data: {
      number: Math.floor(Math.random() * 1_000_000),
      shiftId: (await closedShiftAt(when)).id,
      cashierId: userId,
      status: "COMPLETED",
      orderType: "DINE_IN",
      subtotal: total,
      vatTotal: Math.round(total - total / 1.1),
      total,
      itemCount: 1,
      createdAt: when,
      completedAt: when,
    },
  });
}

/**
 * The audit's scenario, built exactly: a sale on an EARLIER day that is already
 * SEALED, then a refund paid out later against it, and nothing else that day.
 *
 * Sealing the sale's day first is not decoration. Without it the sale's own day
 * is the earliest untraded one and the refusal names THAT — which is correct
 * behaviour and tells us nothing about L-95. The finding is specifically about
 * a day whose only event is the refund.
 */
async function saleSealedThenRefundOn(refundDay: Date, saleDay: Date, amount = 500) {
  const order = await orderAt(saleDay, 1000);
  await closeDay(businessDay(saleDay), userId, false, new Date(2026, 8, 12, 6));
  await db.refund.create({
    data: { orderId: order.id, amount, reason: "Pizza renvoyée", createdAt: refundDay, cashierId: userId },
  });
  return order;
}

/** `YYYY-MM-DD` of the trading day an instant belongs to, at CUTOFF. */
function businessDay(d: Date): string {
  const x = new Date(d.getTime());
  if (x.getHours() < CUTOFF) x.setDate(x.getDate() - 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

const day = (d: number, h = 12) => new Date(2026, 8, d, h);

describe("L-95 — a day whose only event was a refund has traded", () => {
  it("refuses to seal a later day while the refund-only day is open", async () => {
    // THE FINDING, and the audit's own words: pay out a refund against an older
    // order, sell nothing, run the Z, go home; next day, sell and seal.
    await saleSealedThenRefundOn(day(10), day(1));
    await orderAt(day(11));

    await expect(
      closeDay("2026-09-11", userId, false, new Date(2026, 8, 12, 6)),
    ).rejects.toThrow(/2026-09-10/);
  });

  it("says it is out of sequence, so the operator knows what to do", async () => {
    await saleSealedThenRefundOn(day(10), day(1));
    await orderAt(day(11));
    await expect(
      closeDay("2026-09-11", userId, false, new Date(2026, 8, 12, 6)),
    ).rejects.toThrow(/hors séquence/);
  });

  it("seals the refund-only day itself, and then the next one", async () => {
    // The other half: the day must be CLOSABLE, or the refusal above would be a
    // dead end rather than a redirection — and the hole would still be there.
    await saleSealedThenRefundOn(day(10), day(1));
    await orderAt(day(11));

    await closeDay("2026-09-10", userId, false, new Date(2026, 8, 12, 6));
    await closeDay("2026-09-11", userId, false, new Date(2026, 8, 12, 6));

    const closes = await db.dailyClose.findMany({ orderBy: { period: "asc" } });
    expect(closes.map((c) => c.period)).toEqual(["2026-09-01", "2026-09-10", "2026-09-11"]);
  });

  it("still lets a genuinely empty day be skipped", async () => {
    // The rule is « a day that TRADED », not « every calendar day ». A day with
    // no sale, no cash movement and no refund has nothing to seal, and
    // requiring a close for it would make the chain unusable.
    await orderAt(day(11));
    await expect(
      closeDay("2026-09-11", userId, false, new Date(2026, 8, 12, 6)),
    ).resolves.toBeTruthy();
  });

  it("places the refund on the day the MONEY LEFT, not the day of the sale", async () => {
    // `Refund.createdAt` is when the drawer opened. The sale may be months
    // earlier and already sealed — DD-10 allows exactly that, and keying on the
    // sale's date would demand the re-sealing of a sealed day.
    await saleSealedThenRefundOn(day(10), new Date(2026, 8, 2));
    await orderAt(day(11));

    await expect(
      closeDay("2026-09-11", userId, false, new Date(2026, 8, 12, 6)),
    ).rejects.toThrow(/2026-09-10/);
  });

  it("respects the trading-day cut-off for a refund at 02:30", async () => {
    // A refund paid out at 02:30 on the 11th belongs to trading day the 10th.
    // Naming the 11th would send the operator to close a day that has not ended
    // — a refusal pointing at a second refusal.
    await saleSealedThenRefundOn(new Date(2026, 8, 11, 2, 30), day(1));
    await orderAt(day(11));
    await expect(
      closeDay("2026-09-11", userId, false, new Date(2026, 8, 12, 6)),
    ).rejects.toThrow(/2026-09-10/);
  });
});

describe("L-130 — the premature-close refusal agrees with its own noun", () => {
  it("says « terminée · Elle · clôturée » for la journée", async () => {
    // One template served three labels of different gender and hard-coded the
    // masculine. The operator read « la journée … n'est pas terminé. Il ne
    // pourra être clôturé ». This is the most likely fiscal refusal a tired
    // person meets at 23:00.
    await orderAt(day(11));
    const tooEarly = new Date(2026, 8, 11, 23, 30);

    await expect(closeDay("2026-09-11", userId, false, tooEarly)).rejects.toThrow(
      /la journée 2026-09-11 n'est pas terminée/,
    );
    await expect(closeDay("2026-09-11", userId, false, tooEarly)).rejects.toThrow(
      /Elle ne pourra être clôturée/,
    );
  });

  it("does not say the masculine forms anywhere in that message", async () => {
    // Asserted as an absence too: a fix that added the feminine while leaving
    // the masculine behind would pass the test above.
    await orderAt(day(11));
    try {
      await closeDay("2026-09-11", userId, false, new Date(2026, 8, 11, 23, 30));
      throw new Error("expected a refusal");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("prématurée");
      expect(msg).not.toContain("n'est pas terminé.");
      expect(msg).not.toContain("Il ne pourra");
      expect(msg).not.toContain("être clôturé ");
    }
  });

  it("still names the hour the day may be sealed", async () => {
    // DD-24 made the boundary 05:00 on the following day, and the message has
    // to name it or it sends the operator back at a time that is still refused.
    await orderAt(day(11));
    await expect(
      closeDay("2026-09-11", userId, false, new Date(2026, 8, 11, 23, 30)),
    ).rejects.toThrow(/2026-09-12 à 05:00/);
  });
});
