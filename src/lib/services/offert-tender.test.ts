import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import {
  checkTenderComposition,
  TENDER_METHODS,
  OFFERT,
  OFFERT_LABEL,
  isOffertTender,
  OFFERT_AMOUNT_MUST_BE_ZERO_MESSAGE,
  OFFERT_MUST_BE_SOLE_TENDER_MESSAGE,
  OFFERT_NEEDS_ZERO_TOTAL_MESSAGE,
  PAID_TENDER_NEEDS_AMOUNT_MESSAGE,
} from "@/lib/tender-policy";
import { createOrderInTransaction } from "@/lib/services/checkout";
import { computeShiftReport, generateZReport } from "@/lib/services/reports";
import { closeMonth } from "@/lib/services/fiscal";
import { aggregateOrders, AGGREGATE_INCLUDE } from "@/lib/services/aggregate";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { refundSchema } from "@/lib/validation";
import { discountNeedsStepUp } from "@/lib/discount-policy";
import { renderReceipt } from "@/lib/services/receipt";
import { DEFAULT_SETTINGS } from "@/lib/services/settings";
import type { OrderDto, SettingsDto } from "@/types/api";

// M-11 / DD-14 (2026-09-05), Batch 5.7b — « Offert / repas personnel ».
//
// THE FINDING. A 100 % discount could not be checked out. The total becomes 0,
// but every payment line required `amount ≥ 1` and the server demands the
// payments sum EXACTLY to the total — so a staff meal or a comp had no way
// through the till at all.
//
// THE ANSWER (operator, 2026-09-05). It is a legitimate sale under its OWN
// tender rather than an ordinary 0,00 € cash sale, "because a dedicated tender
// keeps what was given away separable from what was sold", journalled like any
// other sale with VAT at zero.
//
// ── THE HALF THAT MATTERS ────────────────────────────────────────────────────
// The batch's criterion is that an « offert » line must **not inflate revenue**
// — in Batch 3.2's aggregation and in a SEALED period total, not merely in the
// Z. Three rules make that structural rather than conventional: an OFFERT line
// carries 0, it must be the only line, and it requires a zero total. Take any
// one away and the tender becomes a way to book revenue nobody collected. The
// reverts exercise them one at a time, and the integration tests below check
// the consequence rather than the rule.

const APRIL = (day: number, hour = 12) => new Date(2026, 3, day, hour, 0, 0);
const SETTINGS = { ...DEFAULT_SETTINGS, factice: false } as unknown as SettingsDto;

let userId: string;

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.monthlyClose.deleteMany();
  await db.annualClose.deleteMany();
  await db.zReport.deleteMany();
  await db.cashMovement.deleteMany();
  await db.refund.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
}

async function reset() {
  await wipe();
  await ensureFiscalCounter();
  const user = await db.user.create({
    data: { username: `m11-${Date.now()}-${Math.random()}`, name: "Resp", role: "MANAGER", pinHash: "x:y" },
  });
  userId = user.id;
}

async function openShift(number: number, openedAt: Date, openingFloat = 10000) {
  return db.shift.create({
    data: { number, openedById: userId, openedAt, openingFloat, status: "OPEN" },
  });
}

/** One line, one tender — through the REAL checkout service, so the journal,
 *  the grand total and the reports are all exercised rather than simulated. */
async function checkout(
  shiftId: string,
  lineTotal: number,
  discountTotal: number,
  payments: { method: string; amount: number }[],
  at?: Date,
): Promise<OrderDto> {
  const totalAfterDiscount = lineTotal - discountTotal;
  const order = await createOrderInTransaction({
    shiftId,
    cashierId: userId,
    customerId: null,
    orderType: "DINE_IN",
    tableLabel: null,
    notes: null,
    subtotal: lineTotal,
    discountTotal,
    totalAfterDiscount,
    discountApprovedById: discountTotal > 0 ? userId : null,
    itemCount: 1,
    items: [
      {
        productId: null,
        productName: "Tacos",
        unitPrice: lineTotal,
        quantity: 1,
        lineTotal,
        vatRate: 10,
        optionsJson: null,
        addOnsJson: null,
        notes: null,
      },
    ],
    payments: payments as never,
    settings: SETTINGS,
  });
  // The service stamps `createdAt` with the real clock, and every period
  // aggregation keys on that column — so a test about a period has to move the
  // order into it, exactly as `cash-movement.test.ts` moves a movement.
  if (at) await db.order.update({ where: { id: order.id }, data: { createdAt: at, completedAt: at } });
  return order;
}

describe("DD-14 — the tender rules, as pure logic", () => {
  it("names exactly the four tenders the checkout accepts", () => {
    expect([...TENDER_METHODS]).toEqual(["CASH", "CARD", "VOUCHER", "OFFERT"]);
    expect(isOffertTender(OFFERT)).toBe(true);
    expect(isOffertTender("CASH")).toBe(false);
    expect(OFFERT_LABEL).toBe("Offert / repas personnel");
  });

  it("accepts an ordinary paid sale unchanged", () => {
    // CONTROL. The rules this batch adds must not disturb the 99 % case.
    expect(checkTenderComposition([{ method: "CASH", amount: 2550 }], 2550)).toEqual({ ok: true });
    expect(
      checkTenderComposition(
        [{ method: "CASH", amount: 1000 }, { method: "CARD", amount: 1550 }],
        2550,
      ),
    ).toEqual({ ok: true });
  });

  it("accepts one OFFERT line of nothing against a total of nothing", () => {
    expect(checkTenderComposition([{ method: OFFERT, amount: 0 }], 0)).toEqual({ ok: true });
  });

  it("refuses an OFFERT line that carries a real amount", () => {
    // Otherwise the give-away tender becomes a way to book money as received.
    const r = checkTenderComposition([{ method: OFFERT, amount: 500 }], 500);
    expect(r).toEqual({ ok: false, message: OFFERT_AMOUNT_MUST_BE_ZERO_MESSAGE });
  });

  it("refuses OFFERT mixed with a paid tender", () => {
    // THE REVENUE HOLE this rule closes: 5,00 € cash against a 10,00 € bill
    // with the rest "given away" would book 10,00 € of revenue for 5,00 €
    // collected. The order total is what revenue counts, so the only safe
    // shape is an offert sale that is offert all the way through.
    const r = checkTenderComposition(
      [{ method: "CASH", amount: 500 }, { method: OFFERT, amount: 0 }],
      1000,
    );
    expect(r).toEqual({ ok: false, message: OFFERT_MUST_BE_SOLE_TENDER_MESSAGE });
  });

  it("refuses OFFERT against a total that is not nil", () => {
    const r = checkTenderComposition([{ method: OFFERT, amount: 0 }], 1000);
    expect(r).toEqual({ ok: false, message: OFFERT_NEEDS_ZERO_TOTAL_MESSAGE });
  });

  it("still requires a paid tender to carry an amount", () => {
    // The guarantee `amount: z.number().int().min(1)` used to give. It moved
    // here when the schema had to relax to admit a zero-amount OFFERT line —
    // relaxing the schema without this would let a 0,00 € CASH line through.
    const r = checkTenderComposition([{ method: "CASH", amount: 0 }], 0);
    expect(r).toEqual({ ok: false, message: PAID_TENDER_NEEDS_AMOUNT_MESSAGE });
  });
});

describe("what the give-away tender must never become", () => {
  it("is not a refund channel", () => {
    // `PaymentMethod` is shared with `Refund.method`, so adding OFFERT to the
    // Prisma enum made it structurally possible to refund TO the give-away
    // tender — which is meaningless: nothing was taken. `refundSchema` is the
    // wall, and this is executed against the real schema, not read.
    expect(refundSchema.safeParse({ amount: 100, reason: "x", method: "CASH" }).success).toBe(true);
    expect(refundSchema.safeParse({ amount: 100, reason: "x", method: OFFERT }).success).toBe(false);
  });

  it("exists in the Prisma enum, or nothing can be stored under it", () => {
    // The storage layer. Added after a revert of `schema.prisma` alone failed
    // NOTHING — because reverting the schema does not regenerate the client,
    // so the run still had a `PaymentMethod` that knew OFFERT. That made the
    // revert a no-op rather than the test weak (Batch 5.5's R4 shape), and
    // this assertion is what makes the source-level removal visible.
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const block = /enum PaymentMethod \{([^}]*)\}/.exec(schema);
    expect(block).not.toBeNull();
    const values = block![1]
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("//"));
    expect(values).toEqual(["CASH", "CARD", "VOUCHER", "OFFERT"]);
  });

  it("keeps the wall M-11 was about DOWN, in the schema the route actually runs", () => {
    // M-11 was that `amount: z.number().int().min(1)` made a zero-total
    // checkout impossible. Reinstating it is the whole finding coming back,
    // and until this assertion existed no test noticed — the route declares
    // its schema inline and module-private, so there is nothing to execute.
    //
    // WHAT THIS PROVES: that the route's own literal still reads `min(0)` and
    // still names the give-away tender. It does NOT prove the route returns
    // 201 for an offert sale — driving it needs a request scope, which stays
    // with Batch 6.1. The pure rules above and the service-level sales below
    // are what carry the behaviour.
    const route = readFileSync("src/app/api/orders/route.ts", "utf8");
    expect(route).toContain("method: z.enum(TENDER_METHODS)");
    expect(route).toContain("amount: z.number().int().min(0)");
    expect(route).not.toContain("amount: z.number().int().min(1), // cents (min 1 cent)");
    // …and the ARRAY-level wall stays up: an offert sale sends one line, so a
    // checkout with no payments at all must still be refused.
    expect(route).toContain('.min(1, "Au moins un paiement")');
  });

  it("is decided before the step-up token is spent", () => {
    // L-41's shape, and the defect Batch 5.5 note 4 found in its own code: a
    // checkout refused for a malformed tender must not cost the operator a
    // single-use PIN. Source order, because driving the route needs a request
    // scope (Batch 6.1) — what it proves is the ORDERING, nothing more.
    const route = readFileSync("src/app/api/orders/route.ts", "utf8");
    const check = route.indexOf("checkTenderComposition(payments");
    const consume = route.indexOf("await consumeStepUpToken(");
    expect(check).toBeGreaterThan(-1);
    expect(consume).toBeGreaterThan(-1);
    expect(check).toBeLessThan(consume);
  });

  it("is already PIN-gated, because it is a 100 % discount", () => {
    // No new gate was built and none is needed: DD-19 (Batch 4.4c) demands the
    // caller's own PIN above the threshold, and a give-away is a 100 %
    // discount. Asserted so that lowering the gate elsewhere shows up here.
    expect(discountNeedsStepUp(2550, 2550, 20)).toBe(true);
    expect(discountNeedsStepUp(2550, 2550, 99)).toBe(true);
  });
});

describe("an offert sale, through the real checkout — and what it must not move", () => {
  beforeEach(reset);
  afterAll(wipe);

  it("completes, and is journalled as a sale with VAT and total at zero", async () => {
    const s = await openShift(1, APRIL(4, 9));
    const order = await checkout(s.id, 2550, 2550, [{ method: OFFERT, amount: 0 }]);

    expect(order.total).toBe(0);
    expect(order.vatTotal).toBe(0);
    expect(order.subtotal).toBe(2550);
    expect(order.discountTotal).toBe(2550);

    // Journalled like any other sale — DD-14's words.
    const ev = await db.fiscalEvent.findFirstOrThrow({ where: { type: "VENTE", orderId: order.id } });
    const payload = JSON.parse(ev.dataJson);
    expect(payload.total).toBe(0);
    expect(payload.vatTotal).toBe(0);
    expect(payload.payments).toEqual([{ method: OFFERT, amount: 0 }]);
  });

  it("does NOT inflate revenue in the Batch 3.2 aggregation", async () => {
    // THE CRITERION. One paid sale and one give-away: the aggregation must see
    // the paid one only, in money terms.
    const s = await openShift(1, APRIL(4, 9));
    await checkout(s.id, 3000, 0, [{ method: "CASH", amount: 3000 }]);
    await checkout(s.id, 2550, 2550, [{ method: OFFERT, amount: 0 }]);

    const orders = await db.order.findMany({ where: { shiftId: s.id }, include: AGGREGATE_INCLUDE });
    const agg = aggregateOrders(orders, {});
    expect(agg.salesTotal).toBe(3000);
    expect(agg.cashTotal).toBe(3000);
    expect(agg.vatTotal).toBe(273); // 3000 TTC at 10 % — the paid sale alone

    // …and `salesCount` is ONE.
    //
    // ── L-50 WAS ANSWERED ON 2026-09-05, AND THIS IS THE DELIBERATE EDIT ────
    // Batch 5.7b left this note saying the give-away was dropped from every
    // count because `isFullyRefunded` opens `refundsTotal >= order.total` and
    // for a zero total that is `0 >= 0`; it recorded the semantics as wrong
    // ("given away" is not "refunded"), refused to change a fiscal core for a
    // reporting question nobody had been asked, and ended: *"Pinned here so
    // the day someone changes it, they do it deliberately."*
    //
    // The question was asked. **DD-20: show it separately.** So the four
    // assertions below are UNCHANGED and now mean something stronger — the
    // operator chose that a give-away must NOT become a sale, so `salesCount`
    // staying at 1 is the decision, not the defect — and four more are added
    // for the half that was missing. What was wrong was never that the order
    // was excluded; it was that it was invisible.
    expect(agg.salesCount).toBe(1);
    expect(agg.itemsCount).toBe(1);
    expect(agg.topProducts.every((p) => p.quantity === 1)).toBe(true);
    // `topProducts` still means what SOLD: one line, from the paid order.
    expect(agg.topProducts).toHaveLength(1);

    // …and the give-away is now VISIBLE, beside the sales rather than in them.
    expect(agg.givenAwayCount).toBe(1);
    expect(agg.givenAwayItemsCount).toBe(1);
    expect(agg.givenAwayProducts.map((p) => p.quantity)).toEqual([1]);
    // The dish that was given away is named — DD-20's "which dishes" half —
    // and it is NOT the same list as topProducts.
    expect(agg.givenAwayProducts).toHaveLength(1);
  });

  it("counts a give-away separately and NEVER as a sale, however many there are", async () => {
    // DD-20 / L-50 (Batch 7.4a). The operator's framing: 40 sold and 3 given
    // away reads as 40 sold, with the 3 shown beside it. Average spend per
    // meal therefore stays truthful, which is why they chose this option.
    const s = await openShift(1, APRIL(4, 9), 10000);
    await checkout(s.id, 3000, 0, [{ method: "CASH", amount: 3000 }]);
    await checkout(s.id, 2550, 2550, [{ method: OFFERT, amount: 0 }]);
    await checkout(s.id, 2550, 2550, [{ method: OFFERT, amount: 0 }]);
    await checkout(s.id, 2550, 2550, [{ method: OFFERT, amount: 0 }]);

    const orders = await db.order.findMany({ where: { shiftId: s.id }, include: AGGREGATE_INCLUDE });
    const agg = aggregateOrders(orders, {});

    expect(agg.salesCount).toBe(1);
    expect(agg.givenAwayCount).toBe(3);
    // Every money figure is untouched by the three give-aways, which is the
    // criterion Batch 5.7b set and this batch must not weaken.
    expect(agg.salesTotal).toBe(3000);
    expect(agg.cashTotal).toBe(3000);
    expect(agg.vatTotal).toBe(273);
    // The same dish three times aggregates, rather than listing three rows.
    expect(agg.givenAwayProducts.map((p) => p.quantity)).toEqual([3]);
  });

  it("a REFUNDED order is not a give-away, which is the distinction the tender exists for", async () => {
    // The predicate keys on the OFFERT tender, not on a zero total. A fully
    // refunded order also reaches the `!counted` branch — it must not be
    // counted as given away, or every refund would read as a comp.
    const s = await openShift(1, APRIL(4, 9), 10000);
    const paid = await checkout(s.id, 3000, 0, [{ method: "CASH", amount: 3000 }]);
    await db.refund.create({
      data: { orderId: paid.id, amount: 3000, reason: "Client insatisfait", cashierId: userId, method: "CASH" },
    });
    await db.order.update({ where: { id: paid.id }, data: { status: "REFUNDED" } });

    const orders = await db.order.findMany({ where: { shiftId: s.id }, include: AGGREGATE_INCLUDE });
    const agg = aggregateOrders(orders, {});

    expect(agg.salesCount).toBe(0);
    expect(agg.givenAwayCount).toBe(0); // refunded, not given away
    expect(agg.refundsCount).toBe(1);
  });

  it("does NOT inflate the Z report or the cash it says to expect", async () => {
    const s = await openShift(1, APRIL(4, 9), 10000);
    await checkout(s.id, 3000, 0, [{ method: "CASH", amount: 3000 }]);
    await checkout(s.id, 2550, 2550, [{ method: OFFERT, amount: 0 }]);

    const report = await computeShiftReport(s.id);
    expect(report.salesTotal).toBe(3000);
    expect(report.expectedCash).toBe(10000 + 3000);

    const { z } = await generateZReport(s.id, 13000, userId);
    expect(z.salesTotal).toBe(3000);
    expect(z.cashVariance).toBe(0);
  });

  it("does NOT inflate a SEALED monthly close", async () => {
    // The half the batch's criterion insists on: "not merely in the Z". A
    // sealed close is immutable, so a give-away counted here could never be
    // corrected.
    const s = await openShift(1, APRIL(4, 9));
    await checkout(s.id, 3000, 0, [{ method: "CASH", amount: 3000 }], APRIL(4, 12));
    await checkout(s.id, 2550, 2550, [{ method: OFFERT, amount: 0 }], APRIL(4, 13));
    await generateZReport(s.id, 13000, userId);

    const close = await closeMonth(2026, 4, userId, false, new Date(2026, 4, 2, 12));
    expect(close.salesTotal).toBe(3000);
    const payload = JSON.parse(close.dataJson);
    expect(payload.salesTotal).toBe(3000);
    expect(payload.cashTotal).toBe(3000);
  });

  it("does NOT move the perpetual grand total's money columns", async () => {
    const s = await openShift(1, APRIL(4, 9));
    await checkout(s.id, 3000, 0, [{ method: "CASH", amount: 3000 }]);
    const before = await db.grandTotal.findUniqueOrThrow({ where: { id: "singleton" } });
    await checkout(s.id, 2550, 2550, [{ method: OFFERT, amount: 0 }]);
    const after = await db.grandTotal.findUniqueOrThrow({ where: { id: "singleton" } });

    expect(after.totalSales).toBe(before.totalSales);
    expect(after.totalCash).toBe(before.totalCash);
    expect(after.totalVat).toBe(before.totalVat);
    // …but the ticket happened, and the perpetual counter of tickets says so.
    expect(after.totalOrders).toBe(before.totalOrders + 1);
  });

  it("CONTROL: the same basket at full price moves every one of those", async () => {
    // Without this, each assertion above is satisfied by arithmetic that
    // counts nothing at all. This is what makes them mean "the give-away is
    // excluded" rather than "the aggregation is broken".
    const s = await openShift(1, APRIL(4, 9), 10000);
    await checkout(s.id, 3000, 0, [{ method: "CASH", amount: 3000 }]);
    await checkout(s.id, 2550, 0, [{ method: "CASH", amount: 2550 }]);

    const orders = await db.order.findMany({ where: { shiftId: s.id }, include: AGGREGATE_INCLUDE });
    const agg = aggregateOrders(orders, {});
    expect(agg.salesTotal).toBe(5550);
    expect(agg.cashTotal).toBe(5550);
    expect(agg.salesCount).toBe(2);

    const report = await computeShiftReport(s.id);
    expect(report.expectedCash).toBe(10000 + 5550);
  });

  it("shows WHY mixing is refused: the hole it would open, measured", async () => {
    // The sole-tender rule is asserted as pure logic above. This is the
    // consequence it prevents, demonstrated by going AROUND the rule — the
    // service does not re-check tender composition, the route does — and then
    // asking the aggregation what it booked.
    //
    // A 10,00 € bill settled 5,00 € cash + 5,00 € "offert" books the ORDER's
    // total as revenue, because that is what revenue counts. So the till would
    // report 10,00 € of sales against 5,00 € of cash: a 5,00 € shortfall at
    // every close, permanently, with nothing on the ticket to explain it.
    const s = await openShift(1, APRIL(4, 9), 10000);
    await checkout(s.id, 1000, 0, [
      { method: "CASH", amount: 500 },
      { method: OFFERT, amount: 500 },
    ]);

    const orders = await db.order.findMany({ where: { shiftId: s.id }, include: AGGREGATE_INCLUDE });
    const agg = aggregateOrders(orders, {});
    expect(agg.salesTotal).toBe(1000); // booked
    expect(agg.cashTotal).toBe(500); // collected
    expect(agg.salesTotal - agg.cashTotal).toBe(500); // the hole

    // …and the rule that stops the route ever writing this row.
    expect(
      checkTenderComposition(
        [{ method: "CASH", amount: 500 }, { method: OFFERT, amount: 500 }],
        1000,
      ).ok,
    ).toBe(false);
  });

  it("prints the tender under its own name on the receipt", async () => {
    // The receipt is an immutable fiscal snapshot. Its label was a two-branch
    // ternary whose else-arm meant "Bon / Ticket", so before this batch an
    // offert sale would have been sealed under the wrong tender's name.
    const s = await openShift(1, APRIL(4, 9));
    const order = await checkout(s.id, 2550, 2550, [{ method: OFFERT, amount: 0 }]);
    const full = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, payments: true },
    });
    const text = renderReceipt(full as unknown as OrderDto, SETTINGS);
    expect(text).toContain(OFFERT_LABEL);
    expect(text).not.toContain("Bon / Ticket");
  });
});
