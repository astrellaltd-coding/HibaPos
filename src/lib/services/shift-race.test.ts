import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import {
  generateZReport,
  ZReportError,
  Z_ALREADY_GENERATED_MESSAGE,
  SHIFT_ALREADY_CLOSED_MESSAGE,
} from "@/lib/services/reports";
import {
  createOrderInTransaction,
  CheckoutError,
  SHIFT_CLOSED_DURING_CHECKOUT_MESSAGE,
  type CheckoutInput,
} from "@/lib/services/checkout";
import { processRefund, RefundError, SHIFT_CLOSED_DURING_REFUND_MESSAGE } from "@/lib/services/refund";
import { getSettings } from "@/lib/services/settings";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import type { SettingsDto } from "@/types/api";

// C-15, shift-race half (Batch 4.7) — shift state was read outside the
// transaction, at three sites.
//
// `POST /api/orders` looked up the open shift at the top of the handler and
// only opened its transaction hundreds of lines later; `generateZReport`
// totalled the shift and only then opened the transaction that closed it; and
// the refund route read `order.shift.status` before calling `processRefund`.
// A sale or a refund that lost either race was attached to a shift whose Z
// report had already been sealed — the money was taken, the VENTE event was
// chained, and the immutable Z did not include it. Permanently.
//
// WHAT MAKES THESE TESTS DECISIVE, AND WHAT THEY CANNOT DO. Prisma's
// interactive transactions on SQLite do not overlap: the second one's body
// does not begin until the first has committed. That was measured for this
// batch on a scratch database in both journal modes — `delete`, which is what
// production runs, and `wal`, which is what a scratch copy runs. Two
// consequences follow, and both are load-bearing here:
//
//   1. A read INSIDE a transaction sees everything committed before that
//      transaction's body started, so re-asserting the status is decisive.
//   2. `Promise.all([checkout, close])` therefore cannot interleave the two
//      bodies. What it does exercise is the real defect — the STALE state each
//      operation carried in from before its transaction — which is why every
//      test below captures the shift as OPEN first and only then races.
//
// So these are not thread-interleaving tests; SQLite has nothing to interleave.
// They are tests that the decision is taken from data read under the lock
// rather than from data read before it.

let userId: string;
let shiftId: string;
let settings: SettingsDto;

/** Every table this file writes, in dependency order. Run at the END as well
 *  as before each test: the whole run shares one database (test-setup.ts), and
 *  a ZReport row left behind here makes another file's `shift.deleteMany()`
 *  fail on a foreign key — which is how this file first broke
 *  `vat-inheritance.test.ts`, a file it has nothing to do with. */
async function clearAll() {
  await db.fiscalEvent.deleteMany();
  await db.grandTotal.deleteMany();
  await db.zReport.deleteMany();
  await db.receipt.deleteMany();
  await db.refund.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.auditLog.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
}

async function reset(openingFloat = 10000) {
  await clearAll();
  await ensureFiscalCounter();

  const user = await db.user.create({
    data: { username: `c15-${Date.now()}`, name: "Caissier", role: "MANAGER", pinHash: "x:y" },
  });
  const shift = await db.shift.create({
    data: { number: 1, openedById: user.id, openingFloat, status: "OPEN" },
  });
  userId = user.id;
  shiftId = shift.id;
  settings = (await getSettings()) as unknown as SettingsDto;
}

/** The input `POST /api/orders` builds once its own validation has passed —
 *  a single cash line, priced server-side, on the shift captured at reset. */
afterAll(clearAll);

function checkoutInput(totalCents: number, overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    shiftId,
    cashierId: userId,
    customerId: null,
    orderType: "TAKEAWAY",
    tableLabel: null,
    notes: null,
    subtotal: totalCents,
    discountTotal: 0,
    totalAfterDiscount: totalCents,
    discountApprovedById: null,
    itemCount: 1,
    items: [
      {
        productId: null,
        productName: "Sandwich",
        unitPrice: totalCents,
        quantity: 1,
        lineTotal: totalCents,
        vatRate: 10,
        optionsJson: null,
        addOnsJson: null,
        notes: null,
      },
    ],
    payments: [{ method: "CASH", amount: totalCents }],
    settings,
    ...overrides,
  };
}

describe("C-15 — a checkout racing a Z close", () => {
  beforeEach(async () => {
    await reset();
  });

  it("rejects with 409 a checkout whose shift was closed between lookup and transaction", async () => {
    // The route's own lookup: taken while the shift is OPEN, exactly as
    // `POST /api/orders` does, hundreds of lines before it writes anything.
    const captured = await db.shift.findFirstOrThrow({ where: { status: "OPEN" } });
    expect(captured.status).toBe("OPEN");

    // The manager closes the till in the meantime.
    await generateZReport(shiftId, 10000, userId);

    // The sale now runs on state that was true when it was read and is not now.
    await expect(createOrderInTransaction(checkoutInput(1500))).rejects.toBeInstanceOf(
      CheckoutError,
    );
    await expect(createOrderInTransaction(checkoutInput(1500))).rejects.toThrow(
      SHIFT_CLOSED_DURING_CHECKOUT_MESSAGE,
    );
  });

  it("carries 409 on the error, so the route answers a conflict and not a crash", async () => {
    await generateZReport(shiftId, 10000, userId);
    const err = await createOrderInTransaction(checkoutInput(1500)).catch((e) => e);
    expect(err).toBeInstanceOf(CheckoutError);
    expect((err as CheckoutError).status).toBe(409);
  });

  it("writes NOTHING when it refuses — no order, no receipt, no VENTE, no counter burn", async () => {
    await generateZReport(shiftId, 10000, userId);
    const counterBefore = await db.fiscalCounter.findUniqueOrThrow({ where: { id: "singleton" } });
    const eventsBefore = await db.fiscalEvent.count();

    await expect(createOrderInTransaction(checkoutInput(1500))).rejects.toBeInstanceOf(
      CheckoutError,
    );

    expect(await db.order.count()).toBe(0);
    expect(await db.receipt.count()).toBe(0);
    expect(await db.fiscalEvent.count()).toBe(eventsBefore);
    const counterAfter = await db.fiscalCounter.findUniqueOrThrow({ where: { id: "singleton" } });
    // A refused sale consumes no receipt number — a gap in the receipt
    // sequence is a fiscal defect in its own right. What makes this hold is
    // the ROLLBACK, not the statement order: moving the assertion after
    // `nextReceiptNumber` was tried as a revert and changed nothing, because
    // the increment is rolled back with everything else. The assertion is kept
    // as a regression pin against a future change that draws the number
    // outside the transaction; the order of the two statements inside it is a
    // clarity choice and no test distinguishes the two.
    expect(counterAfter.lastReceiptNumber).toBe(counterBefore.lastReceiptNumber);
    expect(counterAfter.lastFiscalEventSequence).toBe(counterBefore.lastFiscalEventSequence);
  });

  it("racing a checkout and a close: the sale either lands and is in the Z, or is refused", async () => {
    // Both operations start from the same stale reading of an OPEN shift.
    const captured = await db.shift.findFirstOrThrow({ where: { status: "OPEN" } });
    expect(captured.status).toBe("OPEN");

    const results = await Promise.allSettled([
      createOrderInTransaction(checkoutInput(2500)),
      generateZReport(shiftId, 12500, userId),
    ]);
    const [sale, close] = results;

    // The close must always succeed: it started against an open shift and
    // nothing may prevent a manager from closing the till.
    expect(close.status).toBe("fulfilled");
    const z = await db.zReport.findUniqueOrThrow({ where: { shiftId } });

    const orders = await db.order.findMany({ where: { shiftId } });
    if (sale.status === "fulfilled") {
      // Landed. Then it must be IN the Z — this is the fiscal criterion.
      expect(orders).toHaveLength(1);
      expect(z.salesCount).toBe(1);
      expect(z.salesTotal).toBe(2500);
    } else {
      // Refused. Then nothing of it exists at all.
      expect(sale.reason).toBeInstanceOf(CheckoutError);
      expect((sale.reason as CheckoutError).status).toBe(409);
      expect(orders).toHaveLength(0);
      expect(z.salesCount).toBe(0);
      expect(z.salesTotal).toBe(0);
    }
    // The outcome the batch exists to make impossible: a committed order in a
    // closed shift that the sealed Z does not count.
    expect(z.salesCount).toBe(orders.length);
  });

  it("ten sales racing one close: every order in the closed shift is in its Z totals", async () => {
    // The Validation Required's fiscal criterion, at a size where an ordering
    // bug has room to show. Each sale carries its own stale OPEN reading.
    await db.shift.findFirstOrThrow({ where: { status: "OPEN" } });

    const sales = Array.from({ length: 10 }, (_, i) =>
      createOrderInTransaction(checkoutInput(1000 + i * 100)),
    );
    const results = await Promise.allSettled([
      ...sales,
      generateZReport(shiftId, 20000, userId),
    ]);

    const z = await db.zReport.findUniqueOrThrow({ where: { shiftId } });
    const orders = await db.order.findMany({ where: { shiftId } });

    expect(z.salesCount).toBe(orders.length);
    expect(z.salesTotal).toBe(orders.reduce((acc, o) => acc + o.total, 0));

    // Every refusal is a CheckoutError the route can answer, not an unhandled
    // crash. Two are legitimate here: 409 when the shift was already closed,
    // and 503 when the sale could not get through at all. The second is not
    // hypothetical — it is what ten sales against one close actually produce
    // on this machine, as a Prisma P1008, and it is why `isTransactionBusyError`
    // exists.
    for (const r of results.slice(0, 10)) {
      if (r.status === "rejected") {
        expect(r.reason).toBeInstanceOf(CheckoutError);
        expect([409, 503]).toContain((r.reason as CheckoutError).status);
      }
    }
    // And no sale was written into the shift after it was sealed: the receipt
    // numbers that exist are exactly the ones the Z counted.
    expect(await db.order.count()).toBe(z.salesCount);
  });

  it("a sale that commits before the close is counted by it — the close does not total early", async () => {
    // REGRESSION ASSERTION, not a discriminating test: it is sequenced rather
    // than raced, so it passes against the pre-batch code too (the sales are
    // already committed before the report is computed, wherever that happens).
    // It pins the arithmetic of an ordinary close — the totals and the
    // expected cash — so that moving the computation inside the transaction is
    // shown not to have changed it.
    await createOrderInTransaction(checkoutInput(3000));
    await createOrderInTransaction(checkoutInput(4500));

    const { z } = await generateZReport(shiftId, 17500, userId);
    expect(z.salesCount).toBe(2);
    expect(z.salesTotal).toBe(7500);
    expect(z.expectedCash).toBe(10000 + 7500);
  });
});

describe("C-15 — two closes racing each other", () => {
  beforeEach(async () => {
    await reset();
  });

  it("seals exactly one Z, and the loser is a 409 with the French message", async () => {
    await createOrderInTransaction(checkoutInput(2000));

    const results = await Promise.allSettled([
      generateZReport(shiftId, 12000, userId),
      generateZReport(shiftId, 12000, userId),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    const reason = (failed[0] as PromiseRejectedResult).reason;
    // Before this batch the guard was read outside the transaction, so the
    // second close reached `ZReport.shiftId`'s unique constraint and surfaced
    // a raw Prisma P2002 — a 500 through `POST /api/reports/z`.
    expect(reason).toBeInstanceOf(ZReportError);
    expect((reason as ZReportError).status).toBe(409);
    expect((reason as Error).message).toBe(Z_ALREADY_GENERATED_MESSAGE);

    expect(await db.zReport.count()).toBe(1);
    // One Z means one CLOTURE_Z. A second sealed close in the same chain would
    // be unrepairable.
    expect(await db.fiscalEvent.count({ where: { type: "CLOTURE_Z" } })).toBe(1);
  });

  it("refuses a shift that is CLOSED but carries no Z, and names the shift", async () => {
    // The status assertion in its own right, reachable only when the two
    // disagree. The app cannot produce that state — a shift is closed BY its Z
    // — which is exactly why the assertion has to be defensive: it is the one
    // that answers if a future path ever closes a shift some other way.
    await db.shift.update({ where: { id: shiftId }, data: { status: "CLOSED" } });
    const err = await generateZReport(shiftId, 10000, userId).catch((e) => e);
    expect(err).toBeInstanceOf(ZReportError);
    expect((err as ZReportError).status).toBe(409);
    expect((err as Error).message).toBe(SHIFT_ALREADY_CLOSED_MESSAGE);
    expect(await db.zReport.count()).toBe(0);
  });

  // REGRESSION ASSERTION: it holds on the pre-batch code as well, because the
  // losing close's counter increment is rolled back with its transaction. It
  // is kept because a burnt Z number is a gap in a fiscal sequence.
  it("does not burn a Z report number on the close it refuses", async () => {
    await createOrderInTransaction(checkoutInput(2000));
    await Promise.allSettled([
      generateZReport(shiftId, 12000, userId),
      generateZReport(shiftId, 12000, userId),
    ]);
    const counter = await db.fiscalCounter.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(counter.lastZReportNumber).toBe(1);
  });
});

describe("C-15 — a refund racing a Z close", () => {
  beforeEach(async () => {
    await reset();
  });

  /** The order shape the refund route hands to `processRefund`. */
  async function orderForRefund(orderId: string) {
    const o = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { refunds: true, shift: { select: { id: true, status: true } } },
    });
    return {
      id: o.id,
      number: o.number,
      total: o.total,
      status: o.status as "COMPLETED" | "REFUNDED",
      orderType: o.orderType as "DINE_IN" | "TAKEAWAY" | "LIVRAISON",
      tableLabel: o.tableLabel,
      shift: o.shift,
      refunds: o.refunds.map((r) => ({ amount: r.amount })),
    };
  }

  it("rejects with 409 a refund whose shift closed between the route's check and the write", async () => {
    const order = await createOrderInTransaction(checkoutInput(5000));
    // The route's pre-check: read while the shift is still OPEN.
    const captured = await orderForRefund(order.id);
    expect(captured.shift?.status).toBe("OPEN");

    await generateZReport(shiftId, 15000, userId);

    const err = await processRefund(
      {
        orderId: order.id,
        amount: 1000,
        reason: "Article manquant",
        method: "CASH",
        approverId: userId,
        cashierId: userId,
        factice: false,
      },
      captured,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(RefundError);
    expect((err as RefundError).status).toBe(409);
    expect((err as Error).message).toBe(SHIFT_CLOSED_DURING_REFUND_MESSAGE);
    expect(await db.refund.count()).toBe(0);
  });

  it("racing a refund and a close: the refund either lands and is in the Z total, or is refused", async () => {
    const order = await createOrderInTransaction(checkoutInput(5000));
    const captured = await orderForRefund(order.id);
    expect(captured.shift?.status).toBe("OPEN");

    const results = await Promise.allSettled([
      processRefund(
        {
          orderId: order.id,
          amount: 1200,
          reason: "Geste commercial",
          method: "CASH",
          approverId: userId,
          cashierId: userId,
          factice: false,
        },
        captured,
      ),
      generateZReport(shiftId, 13800, userId),
    ]);

    expect(results[1].status).toBe("fulfilled");
    const z = await db.zReport.findUniqueOrThrow({ where: { shiftId } });
    const refunds = await db.refund.findMany({ where: { shiftId } });

    // Whatever the ordering, the sealed Z agrees with the refunds that exist.
    expect(z.refundsCount).toBe(refunds.length);
    expect(z.refundsTotal).toBe(refunds.reduce((acc, r) => acc + r.amount, 0));
    if (results[0].status === "rejected") {
      expect(results[0].reason).toBeInstanceOf(RefundError);
      expect((results[0].reason as RefundError).status).toBe(409);
    }
  });

  // CONTROL, by design: it must pass with and without the new guard. Its job
  // is to show the guard does not over-refuse — a guard that rejected every
  // refund would satisfy every other test in this block.
  it("still refunds normally on an open shift — the guard refuses only closed ones", async () => {
    const order = await createOrderInTransaction(checkoutInput(5000));
    const captured = await orderForRefund(order.id);
    const result = await processRefund(
      {
        orderId: order.id,
        amount: 1500,
        reason: "Article manquant",
        method: "CASH",
        approverId: userId,
        cashierId: userId,
        factice: false,
      },
      captured,
    );
    expect(result.totalRefunded).toBe(1500);
    expect(result.fullyRefunded).toBe(false);

    const { z } = await generateZReport(shiftId, 13500, userId);
    expect(z.refundsTotal).toBe(1500);
    expect(z.refundsCount).toBe(1);
    // Cash out of the drawer, so the expected cash is down by the refund.
    expect(z.expectedCash).toBe(10000 + 5000 - 1500);
  });
});
