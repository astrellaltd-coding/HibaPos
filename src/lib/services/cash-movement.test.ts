import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import {
  recordCashMovement,
  requiresStepUp,
  CashMovementError,
  NO_OPEN_SHIFT_FOR_MOVEMENT_MESSAGE,
  CASH_MOVEMENT_CATEGORIES,
  categorySignRefusal,
} from "@/lib/services/cash-movement";
import { computeShiftReport, generateZReport } from "@/lib/services/reports";
import { closeMonth, verifyFiscalChain } from "@/lib/services/fiscal";
import { aggregateCashMovements } from "@/lib/services/aggregate";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { readFileSync } from "node:fs";

/** The route source with line comments removed (Batch 5.2, note 2). */
function readRoute(): string {
  return readFileSync("src/app/api/cash-movements/route.ts", "utf8")
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

// M-05 / DD-12 (Batch 5.5) — entrée / sortie de caisse.
//
// THE FINDING. `expectedCash` was `openingFloat + cash − cashRefunds` and there
// was no model of any kind for cash moving for any other reason. A 200 €
// supplier payment therefore produced a phantom 200 € shortfall at every close
// — which trains staff to ignore the variance figure and defeats C-02's
// correction. On this till it is not a corner case: every payment ever taken is
// cash.
//
// THE ANSWER (operator, 2026-09-05). Four fixed categories, because prose
// reasons cannot be totalled. A step-up PIN for money LEAVING the drawer only,
// judged on the DIRECTION of the money rather than the category name — so a
// negative *erreur de caisse* is gated and a positive one is not.

const APRIL = (day: number, hour = 12) => new Date(2026, 3, day, hour, 0, 0);
const MAY = (day: number, hour = 12) => new Date(2026, 4, day, hour, 0, 0);

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
    data: {
      username: `m05-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: "x:y",
    },
  });
  userId = user.id;
}

async function openShift(number: number, openedAt: Date, openingFloat = 10000) {
  return db.shift.create({
    data: { number, openedById: userId, openedAt, openingFloat, status: "OPEN" },
  });
}

/** A completed cash sale. */
async function sell(shiftId: string, number: number, total: number, when: Date) {
  return db.order.create({
    data: {
      number,
      shiftId,
      cashierId: userId,
      status: "COMPLETED",
      subtotal: total,
      discountTotal: 0,
      total,
      vatTotal: 0,
      itemCount: 1,
      createdAt: when,
      completedAt: when,
      items: {
        create: [{ productName: "Tacos", quantity: 1, lineTotal: total, vatRate: 10, unitPrice: total }],
      },
      payments: { create: [{ method: "CASH", amount: total, cashierId: userId }] },
    },
  });
}

type Category = (typeof CASH_MOVEMENT_CATEGORIES)[number];

async function move(category: Category, amount: number, at?: Date) {
  const r = await recordCashMovement({
    category,
    amount,
    reason: "Test",
    cashierId: userId,
    approverId: amount < 0 ? userId : null,
    factice: false,
  });
  if (at) await db.cashMovement.update({ where: { id: r.id }, data: { createdAt: at } });
  return r;
}

describe("M-05 — which movements are allowed, and in which direction", () => {
  beforeEach(reset);
  afterAll(wipe);

  it("accepts the four categories the operator chose, and only those", () => {
    // DD-12 chose a FIXED list because prose reasons cannot be totalled. The
    // enum is the list; this pins it so a fifth cannot arrive unnoticed.
    expect([...CASH_MOVEMENT_CATEGORIES]).toEqual([
      "APPROVISIONNEMENT",
      "PRELEVEMENT",
      "DEPENSE",
      "ERREUR_DE_CAISSE",
    ]);
  });

  it("refuses a sign the category cannot have", async () => {
    await openShift(1, APRIL(4, 9));
    // A row that disagreed with its own category would make every per-category
    // total meaningless — the one thing a fixed list exists to protect.
    await expect(move("APPROVISIONNEMENT", -500)).rejects.toThrow(/positif/);
    await expect(move("PRELEVEMENT", 500)).rejects.toThrow(/négatif/);
    await expect(move("DEPENSE", 500)).rejects.toThrow(/négatif/);
    expect(await db.cashMovement.count()).toBe(0);
  });

  it("lets an erreur de caisse go BOTH ways, because a count can be either", async () => {
    await openShift(1, APRIL(4, 9));
    await move("ERREUR_DE_CAISSE", 250);
    await move("ERREUR_DE_CAISSE", -250);
    expect(await db.cashMovement.count()).toBe(2);
  });

  it("refuses a zero movement", async () => {
    await openShift(1, APRIL(4, 9));
    await expect(move("ERREUR_DE_CAISSE", 0)).rejects.toThrow(/différent de zéro/);
    expect(await db.cashMovement.count()).toBe(0);
  });

  it("refuses when no caisse is open, and writes nothing at all", async () => {
    // The same refusal Batch 5.3 gave refunds, for the same reason: cash that
    // leaves a drawer no report owns is the untraced correction the journal
    // exists to prevent.
    const err = await move("DEPENSE", -2000).catch((e) => e);
    expect(err).toBeInstanceOf(CashMovementError);
    expect((err as CashMovementError).status).toBe(409);
    expect((err as Error).message).toBe(NO_OPEN_SHIFT_FOR_MOVEMENT_MESSAGE);
    expect(await db.cashMovement.count()).toBe(0);
    expect(await db.fiscalEvent.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("attributes the movement to the till that is open", async () => {
    await openShift(1, APRIL(4, 9));
    const two = await openShift(2, APRIL(5, 9)); // the later one is "current"
    const r = await move("DEPENSE", -2000);
    expect(r.shiftId).toBe(two.id);
  });
});

describe("M-05 — the PIN gate is the direction of the money, not the category", () => {
  it("requires a PIN for every movement that takes cash OUT", () => {
    expect(requiresStepUp(-1)).toBe(true);
    expect(requiresStepUp(-2000)).toBe(true);
  });

  it("requires none for a movement that only adds cash", () => {
    // THE OVER-GATING CONTROL: a rule that demanded a PIN for everything would
    // satisfy the case above. A float top-up is the frequent, harmless
    // direction and was deliberately left frictionless.
    expect(requiresStepUp(1)).toBe(false);
    expect(requiresStepUp(20000)).toBe(false);
  });

  it("judges a correction by its sign, which is the whole of the rule", () => {
    // The case that makes "direction, not category name" load-bearing: the same
    // category is gated one way and free the other.
    expect(requiresStepUp(-250)).toBe(true);
    expect(requiresStepUp(250)).toBe(false);
  });
});

describe("M-05 — the drawer", () => {
  beforeEach(reset);
  afterAll(wipe);

  it("adds a float top-up to expected cash", async () => {
    const s = await openShift(1, APRIL(4, 9));
    await sell(s.id, 1001, 5000, APRIL(4, 12));
    await move("APPROVISIONNEMENT", 3000);

    const report = await computeShiftReport(s.id);
    expect(report.expectedCash).toBe(10000 + 5000 + 3000);
    expect(report.cashInTotal).toBe(3000);
    expect(report.cashOutTotal).toBe(0);
    expect(report.cashMovementsCount).toBe(1);
  });

  it("takes a payout out of expected cash — the finding, in one figure", async () => {
    // Before this batch a 200 € supplier payment left `expectedCash` claiming
    // the money was still in the drawer, so the close showed a 200 € shortfall
    // with nothing to explain it.
    const s = await openShift(1, APRIL(4, 9));
    await sell(s.id, 1001, 30000, APRIL(4, 12));
    await move("DEPENSE", -20000);

    const report = await computeShiftReport(s.id);
    expect(report.expectedCash).toBe(10000 + 30000 - 20000);
    expect(report.cashOutTotal).toBe(20000);
  });

  it("reconciles a real count to ZERO variance after a known drop", async () => {
    // The Validation Required's manual criterion, automated: count the drawer
    // after a prélèvement and the variance is nil.
    const s = await openShift(1, APRIL(4, 9));
    await sell(s.id, 1001, 12000, APRIL(4, 12));
    await move("PRELEVEMENT", -15000);

    const counted = 10000 + 12000 - 15000; // what is physically in the till
    const { z } = await generateZReport(s.id, counted, userId);
    expect(z.expectedCash).toBe(counted);
    expect(z.cashVariance).toBe(0);
  });

  it("nets movements against each other and against refunds", async () => {
    const s = await openShift(1, APRIL(4, 9));
    await sell(s.id, 1001, 20000, APRIL(4, 12));
    await move("APPROVISIONNEMENT", 5000);
    await move("PRELEVEMENT", -8000);
    await move("ERREUR_DE_CAISSE", -150);

    const report = await computeShiftReport(s.id);
    expect(report.cashInTotal).toBe(5000);
    expect(report.cashOutTotal).toBe(8150);
    expect(report.cashMovementsCount).toBe(3);
    expect(report.expectedCash).toBe(10000 + 20000 + 5000 - 8000 - 150);
  });

  it("totals by category, which is why the list is fixed", async () => {
    const s = await openShift(1, APRIL(4, 9));
    await move("DEPENSE", -4000);
    await move("DEPENSE", -1500);
    await move("APPROVISIONNEMENT", 2000);

    const report = await computeShiftReport(s.id);
    // "How much went to suppliers?" — answerable, which free text is not.
    expect(report.cashByCategory.DEPENSE).toBe(-5500);
    expect(report.cashByCategory.APPROVISIONNEMENT).toBe(2000);
    expect(report.cashByCategory.PRELEVEMENT).toBeUndefined();
  });

  it("leaves a shift with no movements exactly where it was", async () => {
    // THE OVER-COUNTING CONTROL: arithmetic that added something on an empty
    // set would satisfy none of the figures above but every direction test.
    const s = await openShift(1, APRIL(4, 9));
    await sell(s.id, 1001, 7000, APRIL(4, 12));
    const report = await computeShiftReport(s.id);
    expect(report.cashInTotal).toBe(0);
    expect(report.cashOutTotal).toBe(0);
    expect(report.cashMovementsCount).toBe(0);
    expect(report.expectedCash).toBe(10000 + 7000);
  });
});

describe("M-05 — the journal and the sealed documents", () => {
  beforeEach(reset);
  afterAll(wipe);

  it("journals each movement and keeps the chain verifiable", async () => {
    const s = await openShift(1, APRIL(4, 9));
    await move("DEPENSE", -2000);
    await move("APPROVISIONNEMENT", 500);

    const events = await db.fiscalEvent.findMany({ where: { type: "MOUVEMENT_CAISSE" } });
    expect(events).toHaveLength(2);
    expect((await verifyFiscalChain()).ok).toBe(true);

    const payload = JSON.parse(events[0].dataJson);
    expect(payload.category).toBe("DEPENSE");
    expect(payload.amount).toBe(-2000);
    expect(payload.shiftId).toBe(s.id);

    // The event names the row, and the row names the event.
    const movement = await db.cashMovement.findFirstOrThrow({ where: { category: "DEPENSE" } });
    expect(movement.fiscalEventId).toBe(events[0].id);
    expect(events[0].cashMovementId).toBe(movement.id);
  });

  it("does NOT touch the perpetual grand total", async () => {
    // A movement is not a sale: no revenue, no VAT, and nothing that belongs in
    // a figure whose whole contract is that it only ever counts takings.
    const s = await openShift(1, APRIL(4, 9));
    await sell(s.id, 1001, 5000, APRIL(4, 12));
    const before = await db.grandTotal.findUnique({ where: { id: "singleton" } });
    await move("APPROVISIONNEMENT", 9000);
    const after = await db.grandTotal.findUnique({ where: { id: "singleton" } });
    expect(after?.totalCash ?? 0).toBe(before?.totalCash ?? 0);
    expect(after?.totalSales ?? 0).toBe(before?.totalSales ?? 0);
  });

  it("seals the three figures into the Z report and its journal entry", async () => {
    const s = await openShift(1, APRIL(4, 9));
    await sell(s.id, 1001, 9000, APRIL(4, 12));
    await move("PRELEVEMENT", -4000);
    await move("APPROVISIONNEMENT", 1000);

    const { z } = await generateZReport(s.id, 10000 + 9000 - 4000 + 1000, userId);
    expect(z.cashInTotal).toBe(1000);
    expect(z.cashOutTotal).toBe(4000);
    expect(z.cashMovementsCount).toBe(2);

    const ev = await db.fiscalEvent.findFirstOrThrow({
      where: { type: "CLOTURE_Z", zReportId: z.id },
    });
    const payload = JSON.parse(ev.dataJson);
    expect(payload.cashInTotal).toBe(1000);
    expect(payload.cashOutTotal).toBe(4000);
    expect(payload.cashMovementsCount).toBe(2);
    // A CLOTURE_Z whose expectedCash accounts for a payout it does not name
    // could not be reconciled from the journal alone.
    expect(payload.expectedCash).toBe(z.expectedCash);
  });

  it("does not count sales as movements, nor movements as sales", async () => {
    const s = await openShift(1, APRIL(4, 9));
    await sell(s.id, 1001, 6000, APRIL(4, 12));
    await move("APPROVISIONNEMENT", 6000);
    const report = await computeShiftReport(s.id);
    expect(report.salesTotal).toBe(6000); // the top-up is not revenue
    expect(report.cashTotal).toBe(6000); // nor a takings figure
    expect(report.cashInTotal).toBe(6000);
  });
});

describe("M-05 — a month equals the sum of its Z reports (Batch 3.2)", () => {
  beforeEach(reset);
  afterAll(wipe);

  it("reconciles the cash-movement columns field by field", async () => {
    const one = await openShift(1, APRIL(4, 9));
    await sell(one.id, 1001, 5000, APRIL(4, 12));
    await move("DEPENSE", -2000, APRIL(4, 14));
    await generateZReport(one.id, 10000 + 5000 - 2000, userId);

    const two = await openShift(2, APRIL(5, 9));
    await sell(two.id, 1002, 3000, APRIL(5, 12));
    await move("APPROVISIONNEMENT", 1500, APRIL(5, 14));
    await generateZReport(two.id, 10000 + 3000 + 1500, userId);

    const zs = await db.zReport.findMany({ orderBy: { number: "asc" } });
    const close = await closeMonth(2026, 4, userId, false, MAY(1));

    const zSum = (pick: (z: (typeof zs)[number]) => number) =>
      zs.reduce((acc, z) => acc + pick(z), 0);
    expect(close.cashInTotal).toBe(zSum((z) => z.cashInTotal));
    expect(close.cashOutTotal).toBe(zSum((z) => z.cashOutTotal));
    expect(close.cashMovementsCount).toBe(zSum((z) => z.cashMovementsCount));
    expect(close.cashInTotal).toBe(1500);
    expect(close.cashOutTotal).toBe(2000);
    expect(close.cashMovementsCount).toBe(2);
  });

  it("does not reopen a sealed month with a later movement", async () => {
    // The rule Batch 5.3 established for refunds, applied to movements: a
    // period books what IT did. April's close is computed AFTER May's payout
    // exists and must not see it.
    const april = await openShift(1, APRIL(4, 9));
    await sell(april.id, 1001, 5000, APRIL(4, 12));
    await generateZReport(april.id, 15000, userId);

    const may = await openShift(2, MAY(2, 9));
    await move("DEPENSE", -3000, MAY(2, 14));
    await generateZReport(may.id, 10000 - 3000, userId);

    const aprilClose = await closeMonth(2026, 4, userId, false, MAY(1));
    const mayClose = await closeMonth(2026, 5, userId, false, new Date(2026, 5, 1));

    expect(aprilClose.cashOutTotal).toBe(0);
    expect(aprilClose.cashMovementsCount).toBe(0);
    expect(mayClose.cashOutTotal).toBe(3000);
    expect(mayClose.cashMovementsCount).toBe(1);
  });
});

describe("M-05 — the route wires the PIN gate to the direction (source-level)", () => {
  // The route layer has no test harness in this project: every other test here
  // calls the service directly. So the one thing only the route does — asking
  // for a PIN when, and only when, the money is leaving — is pinned at source
  // and then proved end to end through the real HTTP API in the batch's
  // walkthrough. Line comments are stripped first, because Batch 5.2 note 2
  // found an assertion satisfied by the COMMENT naming the thing it looked for.
  const source = readRoute();

  it("gates on requiresStepUp and asks for CASH_OUT, not for everything", () => {
    expect(source).toContain("requiresStepUp(amount)");
    expect(source).toContain('action: "CASH_OUT"');
    // Bound to the magnitude: `verifyApprovalToken` compares amounts, and a
    // token minted for one payout must not authorise a larger one.
    expect(source).toContain("Math.abs(amount)");
  });

  it("refuses an impossible sign BEFORE consuming the token", () => {
    // Found in this batch's walkthrough, not by reading: a negative
    // APPROVISIONNEMENT is negative, so the direction rule demands a PIN — and
    // the service then refuses it whatever the PIN says. The caller was told
    // « Confirmation par code PIN requise » for a request whose real problem
    // was the sign, and would have spent a single-use token learning that.
    expect(categorySignRefusal("APPROVISIONNEMENT", -1000)).toMatch(/positif/);
    expect(categorySignRefusal("PRELEVEMENT", 1000)).toMatch(/négatif/);
    expect(categorySignRefusal("DEPENSE", 1000)).toMatch(/négatif/);
    expect(categorySignRefusal("ERREUR_DE_CAISSE", -1000)).toBeNull();
    expect(categorySignRefusal("ERREUR_DE_CAISSE", 1000)).toBeNull();
    expect(categorySignRefusal("DEPENSE", 0)).toMatch(/différent de zéro/);

    const post = source.slice(source.indexOf("export const POST"));
    const sign = post.indexOf("categorySignRefusal(");
    const consume = post.indexOf("consumeStepUpToken(");
    expect(sign).toBeGreaterThan(-1);
    expect(sign).toBeLessThan(consume);
  });

  it("checks for an open caisse BEFORE consuming the token", () => {
    // L-41's shape: a refusal after the token is spent costs the operator a
    // second PIN entry for a request that was never going to succeed.
    //
    // Scoped to the POST handler on purpose. Searching the whole file found
    // `consumeStepUpToken` in the IMPORT at the top and reported it as the
    // first use, which would have made this assertion pass or fail on where
    // the imports sit rather than on the order of the checks.
    const post = source.slice(source.indexOf("export const POST"));
    expect(post.length).toBeGreaterThan(0);
    const shiftCheck = post.indexOf('status: "OPEN"');
    const consume = post.indexOf("consumeStepUpToken(");
    expect(shiftCheck).toBeGreaterThan(-1);
    expect(consume).toBeGreaterThan(-1);
    expect(shiftCheck).toBeLessThan(consume);
  });
});

describe("M-05 — the aggregate helper on its own", () => {
  it("splits in and out, and nets them", () => {
    const agg = aggregateCashMovements([
      { category: "APPROVISIONNEMENT", amount: 5000 },
      { category: "DEPENSE", amount: -1200 },
      { category: "PRELEVEMENT", amount: -800 },
    ]);
    expect(agg.cashIn).toBe(5000);
    expect(agg.cashOut).toBe(2000);
    expect(agg.net).toBe(3000);
    expect(agg.count).toBe(3);
    expect(agg.byCategory).toEqual({
      APPROVISIONNEMENT: 5000,
      DEPENSE: -1200,
      PRELEVEMENT: -800,
    });
  });

  it("returns zeros for an empty period rather than nothing", () => {
    const agg = aggregateCashMovements([]);
    expect(agg).toEqual({ cashIn: 0, cashOut: 0, net: 0, count: 0, byCategory: {} });
  });
});
