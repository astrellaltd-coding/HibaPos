import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { createOrderInTransaction } from "@/lib/services/checkout";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { splitVat, apportion, sum2 } from "@/lib/money";
import { DEFAULT_SETTINGS } from "@/lib/services/settings";
import type { SettingsDto } from "@/types/api";

// L-58 (Batch 3.11) — the per-line HT, stored rather than recomputed.
//
// BOFiP § 50 lists « total HT de la ligne » among the data in scope for the
// fonctionnalité de caisse. `OrderItem` stored `unitPrice` and `lineTotal`,
// both TTC, and `vatRate` — and the HT nowhere.
//
// WHY "DERIVABLE" WAS A WEAKER CLAIM THAN IT SOUNDED, and what these tests
// therefore have to prove. The HT is taken on the line's net AFTER the order's
// discount has been apportioned across the lines by largest remainder, so
// dividing `lineTotal` by `1 + rate/100` does NOT give the figure the till
// used. `lineNetTotal` is stored beside `lineHt` so the row is self-verifying
// by division — no reader has to re-implement `apportion`.
//
// The assertion that matters most is the agreement one: `Σ (lineNetTotal −
// lineHt)` must equal the `vatTotal` sealed on the same order. That is what
// catches a second implementation of the split, which is how this class of
// change goes wrong.

const SETTINGS = { ...DEFAULT_SETTINGS, factice: false } as unknown as SettingsDto;
let userId: string;
let shiftId: string;

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
}

beforeEach(async () => {
  await wipe();
  await ensureFiscalCounter();
  const u = await db.user.create({
    data: { username: `l58-${Date.now()}-${Math.random()}`, name: "Resp", role: "MANAGER", pinHash: "x:y" },
  });
  userId = u.id;
  const s = await db.shift.create({
    data: { number: 1, openedById: userId, openedAt: new Date(), openingFloat: 10000, status: "OPEN" },
  });
  shiftId = s.id;
});

afterAll(wipe);

type Line = { name: string; lineTotal: number; vatRate: number };

/** A sale through the REAL checkout transaction, as `checkout-money.test.ts`
 *  does — the stored columns are only meaningful if the thing that writes them
 *  is the thing that runs on the till. */
async function sell(lines: Line[], discountTotal = 0) {
  const subtotal = sum2(lines.map((l) => l.lineTotal));
  return createOrderInTransaction({
    shiftId,
    cashierId: userId,
    customerId: null,
    orderType: "DINE_IN",
    tableLabel: null,
    notes: null,
    subtotal,
    discountTotal,
    totalAfterDiscount: subtotal - discountTotal,
    discountApprovedById: discountTotal > 0 ? userId : null,
    itemCount: lines.length,
    items: lines.map((l) => ({
      productId: null,
      productName: l.name,
      unitPrice: l.lineTotal,
      quantity: 1,
      lineTotal: l.lineTotal,
      vatRate: l.vatRate,
      optionsJson: null,
      addOnsJson: null,
      notes: null,
    })),
    payments: [{ method: "CASH", amount: subtotal - discountTotal }] as never,
    settings: SETTINGS,
  });
}

const linesOf = (orderId: string) =>
  db.orderItem.findMany({ where: { orderId }, orderBy: { productName: "asc" } });

describe("the per-line HT is stored, not recomputed (L-58)", () => {
  it("stores a net and an HT on every line of an undiscounted sale", async () => {
    const o = await sell([{ name: "Menu", lineTotal: 2000, vatRate: 10 }]);
    const lines = await linesOf(o.id);
    expect(lines).toHaveLength(1);
    // Not null — null is reserved for rows written before this batch.
    expect(lines[0].lineNetTotal).toBe(2000);
    expect(lines[0].lineHt).toBe(splitVat(2000, 10).ht);
    expect(lines[0].lineHt).toBe(1818);
  });

  it("the stored nets sum to the order's total, exactly", async () => {
    // The apportionment property, now observable in the database rather than
    // only inside the VAT block. Three equal lines and a discount that does not
    // divide by three is where a per-line rounding would show.
    const o = await sell(
      [
        { name: "A", lineTotal: 333, vatRate: 10 },
        { name: "B", lineTotal: 333, vatRate: 10 },
        { name: "C", lineTotal: 333, vatRate: 10 },
      ],
      100,
    );
    const lines = await linesOf(o.id);
    expect(lines).toHaveLength(3);
    expect(lines.reduce((n, l) => n + (l.lineNetTotal ?? 0), 0)).toBe(o.total);
    expect(o.total).toBe(899);
  });

  it("Σ (net − HT) equals the vatTotal sealed on the same order — single rate", async () => {
    const o = await sell([
      { name: "Menu", lineTotal: 1980, vatRate: 10 },
      { name: "Side", lineTotal: 270, vatRate: 10 },
    ]);
    const lines = await linesOf(o.id);
    const vat = lines.reduce((n, l) => n + ((l.lineNetTotal ?? 0) - (l.lineHt ?? 0)), 0);
    expect(vat).toBe(o.vatTotal);
  });

  it("Σ (net − HT) equals the vatTotal — MIXED rates, where a second implementation would show", async () => {
    // The restaurant's real shape: food at 10 %, a sealed can at 5,5 %.
    const o = await sell([
      { name: "Burger", lineTotal: 1980, vatRate: 10 },
      { name: "Canette", lineTotal: 270, vatRate: 5.5 },
    ]);
    const lines = await linesOf(o.id);
    const vat = lines.reduce((n, l) => n + ((l.lineNetTotal ?? 0) - (l.lineHt ?? 0)), 0);
    expect(vat).toBe(o.vatTotal);
    // Not vacuous: the two rates really did produce different splits.
    expect(new Set(lines.map((l) => l.vatRate))).toEqual(new Set([10, 5.5]));
  });

  it("stores the APPORTIONED net on a discounted sale, not the gross line total", async () => {
    const o = await sell(
      [
        { name: "A", lineTotal: 1000, vatRate: 10 },
        { name: "B", lineTotal: 1000, vatRate: 10 },
      ],
      500,
    );
    const lines = await linesOf(o.id);
    for (const l of lines) {
      // The finding in one assertion: the stored net is NOT the gross.
      expect(l.lineTotal).toBe(1000);
      expect(l.lineNetTotal).toBe(750);
      expect(l.lineHt).toBe(splitVat(750, 10).ht);
    }
    // …and it is the apportionment's own answer, not a per-line ratio.
    expect(lines.map((l) => l.lineNetTotal)).toEqual(apportion([1000, 1000], 1500));
  });

  it("the row is self-verifying by division, which is why the net is stored too", async () => {
    // A reader with the row and a calculator can check the HT. Before this
    // batch they would have had to re-implement `apportion` to get there.
    const o = await sell(
      [
        { name: "A", lineTotal: 2331, vatRate: 10 },
        { name: "B", lineTotal: 666, vatRate: 5.5 },
      ],
      137,
    );
    for (const l of await linesOf(o.id)) {
      expect(l.lineHt).toBe(Math.round((l.lineNetTotal ?? 0) / (1 + (l.vatRate ?? 0) / 100)));
    }
  });

  it("a zero-total sale stores 0, not null, and divides by nothing", async () => {
    // « Offert / repas personnel » (DD-14, Batch 5.7b). Zero is a recorded
    // figure; null would say the till never took one.
    const o = await sell([{ name: "Offert", lineTotal: 1000, vatRate: 10 }], 1000);
    expect(o.total).toBe(0);
    const lines = await linesOf(o.id);
    expect(lines[0].lineNetTotal).toBe(0);
    expect(lines[0].lineHt).toBe(0);
    expect(lines[0].lineNetTotal).not.toBeNull();
    expect(lines[0].lineHt).not.toBeNull();
  });

  it("a row written before this batch keeps null, and null is not zero", async () => {
    // The 20 rows on production predate the columns and are NOT backfilled:
    // computing figures for completed sales and writing them into the fiscal
    // record would be inventing fiscal data. Batch 8.0 deletes them anyway.
    const o = await sell([{ name: "Legacy", lineTotal: 1000, vatRate: 10 }]);
    await db.orderItem.updateMany({
      where: { orderId: o.id },
      data: { lineNetTotal: null, lineHt: null },
    });
    const lines = await linesOf(o.id);
    expect(lines[0].lineNetTotal).toBeNull();
    expect(lines[0].lineHt).toBeNull();
    expect(lines[0].lineNetTotal).not.toBe(0);
  });
});
