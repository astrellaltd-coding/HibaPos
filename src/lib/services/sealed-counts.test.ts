import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { signInAs, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { createOrderInTransaction } from "@/lib/services/checkout";
import { generateZReport } from "@/lib/services/reports";
import { closeDay } from "@/lib/services/fiscal";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { saveSettings, DEFAULT_SETTINGS } from "@/lib/services/settings";
import { OFFERT } from "@/lib/tender-policy";
import { hashPin } from "@/lib/auth";
import type { SettingsDto } from "@/types/api";

// L-172 and L-177 — two numbers in one sealed document, and two columns whose
// null means nothing in particular. Both were Group D, « record and leave »,
// and the operator reopened them on 2026-09-14.
//
// ── L-172: THE SAME DAY, COUNTED TWICE, DIFFERENTLY ─────────────────────────
// `DailyClose` seals BOTH `salesCount` and `perpetualTotalsJson`, and the
// `totalOrders` inside that payload is a DIFFERENT number:
//
//   salesCount   excludes give-aways. DD-20's choice, so that « average spend
//                per meal » stays truthful and « top products » keeps meaning
//                what SOLD. `aggregate.ts` does not fall through into the sales
//                arithmetic for an OFFERT order.
//   totalOrders  counts them. `incrementGrandTotal` runs unconditionally in the
//                checkout transaction — one ticket issued, one increment —
//                because the perpetual total is a count of TICKETS, which is
//                what BOFiP § 170 asks a « total perpétuel » to be.
//
// **Both are defensible and nothing wrote down the difference.** An inspector
// comparing two figures inside one sealed document gets no answer from the
// software. That is the whole finding: not an arithmetic error, an undocumented
// disagreement — and the document is sealed, so it cannot be annotated later.
//
// This file makes the difference OBSERVABLE and pins its size, so the two can
// neither silently converge nor drift further apart.
//
// ── L-177: WHAT NULL MEANS ON THE Z REPORT'S TWO JSON COLUMNS ───────────────
// `ZReport.topProductsJson` and `vatBreakdownJson` are nullable, while the same
// two columns on `DailyClose`, `MonthlyClose` and `AnnualClose` are NOT NULL.
// Readers papered over it with `?? "{}"` / `?? "[]"`, so a Z with a null
// breakdown would print an EMPTY VAT TABLE rather than refuse — the same shape
// as L-129, whose null silently became 10 %.
//
// The fix is a stated meaning, not a migration: making them NOT NULL is a
// schema change on a fiscal table for zero rows, which this project has
// correctly declined before. What is asserted here is the claim the comment
// rests on — **`generateZReport` always writes both** — because a comment
// saying « not reachable today » is worth exactly as much as the check behind
// it.

const PIN = "636363";
const SETTINGS = { ...DEFAULT_SETTINGS, factice: false } as SettingsDto;
let manager: { id: string; username: string };
let shiftId: string;
let product: { id: string; price: number };

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.dailyClose.deleteMany();
  await db.zReport.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.refund.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.fiscalCounter.deleteMany();
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  await ensureFiscalCounter();
  await saveSettings({ factice: false, businessDayCutoffHour: 5 });

  const u = await db.user.create({
    data: {
      username: `l172-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin(PIN),
    },
  });
  manager = { id: u.id, username: u.username };

  const cat = await db.category.create({
    data: { name: "Tacos", color: "#111", sortOrder: 1, vatRate: 10 },
  });
  const p = await db.product.create({
    data: {
      name: "Tacos M",
      price: 800,
      vatRate: 10,
      categoryId: cat.id,
      active: true,
      available: true,
    },
  });
  product = { id: p.id, price: p.price };

  const s = await db.shift.create({
    data: { number: 1, openedById: u.id, openedAt: new Date(), openingFloat: 0, status: "OPEN" },
  });
  shiftId = s.id;

  await signInAs({ id: u.id, username: u.username, role: "MANAGER" });
});

afterAll(async () => {
  clearCookies();
  await wipe();
});

/** One ticket through the REAL checkout, sold or given away (DD-14's shape). */
async function ring(offert: boolean) {
  const subtotal = product.price;
  return createOrderInTransaction({
    shiftId,
    cashierId: manager.id,
    customerId: null,
    orderType: "TAKEAWAY",
    tableLabel: null,
    notes: null,
    subtotal,
    discountTotal: offert ? subtotal : 0,
    totalAfterDiscount: offert ? 0 : subtotal,
    discountApprovedById: offert ? manager.id : null,
    itemCount: 1,
    items: [
      {
        productId: product.id,
        productName: "Tacos M",
        unitPrice: product.price,
        quantity: 1,
        lineTotal: subtotal,
        vatRate: 10,
        optionsJson: null,
        addOnsJson: null,
        notes: null,
      },
    ],
    payments: (offert
      ? [{ method: OFFERT, amount: 0 }]
      : [{ method: "CASH", amount: subtotal }]) as never,
    settings: SETTINGS,
  });
}

describe("L-172 — the two counts disagree, and by exactly the give-aways", () => {
  it("counts tickets in the perpetual total and sales in the Z", async () => {
    // Three sold, one given away. A non-zero give-away on purpose: with none,
    // the two numbers agree and every assertion here would pass against the
    // bug in both states — the shape L-83 was caught by.
    await ring(false);
    await ring(false);
    await ring(false);
    await ring(true);

    const { z } = await generateZReport(shiftId, 0, manager.id);
    const gt = await db.grandTotal.findUniqueOrThrow({ where: { id: "singleton" } });

    expect(z.salesCount, "the Z counts what was sold").toBe(3);
    expect(z.givenAwayCount, "the give-away is reported beside the sales, DD-20").toBe(1);
    expect(gt.totalOrders, "the perpetual total counts tickets issued").toBe(4);

    // The property, stated as the relationship rather than as two magic
    // numbers: whatever the fixture, the gap IS the give-aways.
    expect(
      gt.totalOrders - z.salesCount,
      "the perpetual total and the Z now differ by something other than the give-aways",
    ).toBe(z.givenAwayCount);
  });

  it("seals both numbers into the SAME daily close", async () => {
    // This is what makes it a finding rather than a curiosity. The two figures
    // are not in two documents a reader might never compare — `DailyClose`
    // carries `salesCount` as a column and `totalOrders` inside
    // `perpetualTotalsJson`, sealed together, and a sealed document cannot be
    // annotated afterwards.
    await ring(false);
    await ring(true);

    // BACKDATED AFTER RINGING, and the order matters. The tickets have to go
    // through the real checkout, because `incrementGrandTotal` runs inside that
    // transaction and is the thing under test — but a day cannot be closed
    // until it has ended (`assertPeriodEnded`), and today has not. So the rows
    // are moved into a finished trading day afterwards. The perpetual total is
    // period-independent by definition, so moving them cannot disturb it; only
    // `salesCount`, which is computed from the period, is affected — and that
    // is the number this test needs to come from the close.
    const PERIOD = "2026-06-12";
    const when = new Date(2026, 5, 12, 12, 0);
    await db.order.updateMany({ data: { createdAt: when, completedAt: when } });
    await db.shift.updateMany({
      data: { openedAt: new Date(2026, 5, 12, 10, 0), closedAt: new Date(2026, 5, 12, 23, 0), status: "CLOSED" },
    });

    const close = await closeDay(PERIOD, manager.id, false, new Date(2026, 5, 20));
    const sealed = await db.dailyClose.findUniqueOrThrow({ where: { id: close.id } });

    expect(sealed.perpetualTotalsJson, "the perpetual snapshot was not sealed").toBeTruthy();
    const perpetual = JSON.parse(sealed.perpetualTotalsJson ?? "{}") as { totalOrders?: number };
    expect(sealed.salesCount, "the close counts what was sold").toBe(1);
    expect(perpetual.totalOrders, "the same document counts tickets issued").toBe(2);
    expect(
      perpetual.totalOrders! > sealed.salesCount,
      "one sealed document, two counts, and they no longer disagree — if this is " +
        "deliberate, the paragraph in docs/INVARIANTS.md has to change with it",
    ).toBe(true);
  });

  it("is not an arithmetic error — the money figures agree", async () => {
    // Worth separating, because « two counts disagree » reads like a bug until
    // you check that nothing about the MONEY does. A give-away contributes zero
    // to every money figure, so the totals are identical on both sides and only
    // the counts differ. That is what makes the difference a definition rather
    // than a defect.
    await ring(false);
    await ring(true);

    const { z } = await generateZReport(shiftId, 0, manager.id);
    const gt = await db.grandTotal.findUniqueOrThrow({ where: { id: "singleton" } });

    expect(z.salesTotal, "the sold ticket is 800 c").toBe(800);
    expect(gt.totalSales, "and the perpetual total agrees to the cent").toBe(800);
    expect(gt.totalVat).toBe(z.vatTotal);
  });
});

describe("L-177 — the Z report's nullable JSON columns", () => {
  it("always writes both, which is what the schema comment claims", async () => {
    // The comment says null is « never computed » and « not reachable today ».
    // That second half is a claim about the code, and this is the check behind
    // it: if `generateZReport` ever stops writing one, the comment becomes a
    // lie at the same moment, and here rather than in production.
    await ring(false);
    const { z } = await generateZReport(shiftId, 0, manager.id);
    const row = await db.zReport.findUniqueOrThrow({ where: { id: z.id } });

    expect(row.vatBreakdownJson, "a Z was sealed with no VAT breakdown").not.toBeNull();
    expect(row.topProductsJson, "a Z was sealed with no top-products snapshot").not.toBeNull();
    // …and they are parseable, not the empty string a `?? "{}"` reader would
    // also accept.
    expect(Object.keys(JSON.parse(row.vatBreakdownJson!)).length).toBeGreaterThan(0);
    expect(Array.isArray(JSON.parse(row.topProductsJson!))).toBe(true);
  });

  it("writes them even for a shift that only gave things away", async () => {
    // The case most likely to produce an empty breakdown, and therefore the one
    // that would make a null look reasonable. It must still be a written,
    // parseable document — « no VAT was charged » is a measured zero and has to
    // be distinguishable from « nobody computed it », which is the whole of
    // L-177 and of L-129 before it.
    await ring(true);
    const { z } = await generateZReport(shiftId, 0, manager.id);
    const row = await db.zReport.findUniqueOrThrow({ where: { id: z.id } });
    expect(row.vatBreakdownJson).not.toBeNull();
    expect(row.topProductsJson).not.toBeNull();
  });

  it("says in the schema what a null would mean", async () => {
    // A stated meaning is the fix; the migration was declined deliberately. If
    // someone later makes the columns NOT NULL, this comment should go with
    // them — and this assertion is what will point that out.
    const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const start = schema.indexOf("model ZReport {");
    const end = schema.indexOf("\nmodel ", start + 1);
    const model = schema.slice(start, end > start ? end : undefined);

    expect(model, "the ZReport model moved or was renamed").toContain("topProductsJson");
    expect(model, "null has no stated meaning again — L-177").toMatch(/null = never computed/);
    expect(model).toContain("L-177");
    // The asymmetry the comment explains has to still be real, or the
    // explanation is stale.
    const daily = schema.slice(schema.indexOf("model DailyClose {"));
    expect(daily, "DailyClose's columns are nullable now, so the comment is wrong").toMatch(
      /vatBreakdownJson\s+String\n/,
    );
  });
});
