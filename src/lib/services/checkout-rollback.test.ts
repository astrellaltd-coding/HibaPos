import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mock } from "bun:test";
import { db } from "@/lib/db";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { DEFAULT_SETTINGS } from "@/lib/services/settings";
import type { SettingsDto } from "@/types/api";

const BOOM = "T-06: injected failure after the sale was written";

// The real module, captured BEFORE the stub replaces it — and note the
// FUNCTION VALUE is captured, not the namespace. `mock.module` mutates the
// live namespace object, so holding `realFiscal` and calling
// `realFiscal.appendFiscalEvent` inside the stub is infinite recursion: the
// property now points at the stub itself. That is a real trap and it cost a
// run here; binding the function is what breaks the cycle.
const realFiscal = await import("@/lib/services/fiscal");
const realAppendFiscalEvent = realFiscal.appendFiscalEvent;
let failAppend = false;

// One stub, installed once, reading a flag. Swapping the module back in and
// out does NOT work — `checkout.ts` binds `appendFiscalEvent` at its own
// import time and never re-reads it, so a later restore is invisible to it.
mock.module("@/lib/services/fiscal", () => ({
  ...realFiscal,
  appendFiscalEvent: async (...args: Parameters<typeof realAppendFiscalEvent>) => {
    if (failAppend) throw new Error(BOOM);
    return realAppendFiscalEvent(...args);
  },
}));

// T-06 (Batch 6.1) — the rollback test.
//
// THE GAP: "Nothing proves a mid-checkout failure leaves no orphaned order,
// payment, sequence gap or fiscal event. The failure mode most likely to break
// gapless numbering in production."
//
// ── WHY THE FAILURE IS INJECTED LATE, AND WHY THAT MATTERS ───────────────────
// A checkout that fails on its FIRST statement proves almost nothing — no rows
// were written, so there is nothing to roll back. What has to be proved is
// that a failure AFTER the order, its lines, its payments and its receipt have
// been written still leaves the database exactly as it was. So this file mocks
// `appendFiscalEvent` to throw: it is called near the end of the transaction,
// after `nextReceiptNumber` has already incremented the fiscal counter.
//
// That counter is the interesting one. Receipt numbers must be GAPLESS — a
// missing number in a fiscal journal is the thing an inspection asks about —
// and `nextReceiptNumber` increments inside the transaction, so a rollback has
// to take the increment with it. This file is what proves it does.
//
// The mock lives in its own file on purpose: `mock.module` is global to the
// file that calls it, and a fiscal module stubbed to throw is not something to
// leave lying around beside other tests.

let userId: string;
let shiftId: string;
const SETTINGS = { ...DEFAULT_SETTINGS, factice: false } as unknown as SettingsDto;


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
    data: { username: `t06-${Date.now()}-${Math.random()}`, name: "Resp", role: "MANAGER", pinHash: "x:y" },
  });
  userId = u.id;
  const s = await db.shift.create({
    data: { number: 1, openedById: userId, openedAt: new Date(), openingFloat: 0, status: "OPEN" },
  });
  shiftId = s.id;
});

afterAll(wipe);

function input() {
  return {
    shiftId,
    cashierId: userId,
    customerId: null,
    orderType: "DINE_IN" as const,
    tableLabel: null,
    notes: null,
    subtotal: 2000,
    discountTotal: 0,
    totalAfterDiscount: 2000,
    discountApprovedById: null,
    itemCount: 1,
    items: [
      {
        productId: null,
        productName: "Tacos",
        unitPrice: 2000,
        quantity: 1,
        lineTotal: 2000,
        vatRate: 10,
        optionsJson: null,
        addOnsJson: null,
        notes: null,
      },
    ],
    payments: [{ method: "CASH", amount: 2000 }] as never,
    settings: SETTINGS,
  };
}

/** Counts of everything a checkout writes, plus the counter it advances. */
async function snapshot() {
  const counter = await db.fiscalCounter.findUnique({ where: { id: "singleton" } });
  return {
    orders: await db.order.count(),
    items: await db.orderItem.count(),
    payments: await db.payment.count(),
    receipts: await db.receipt.count(),
    events: await db.fiscalEvent.count(),
    audit: await db.auditLog.count(),
    grandTotals: await db.grandTotal.count(),
    lastReceiptNumber: counter?.lastReceiptNumber ?? null,
    lastEventSequence: counter?.lastFiscalEventSequence ?? null,
  };
}

describe("T-06 — a mid-checkout failure leaves nothing behind", () => {
  it("CONTROL: an unmocked checkout writes everything and advances the counter", async () => {
    // Without this, "nothing was written" would be satisfied by a checkout
    // that never writes anything at all.
    const { createOrderInTransaction } = await import("@/lib/services/checkout");
    const before = await snapshot();
    await createOrderInTransaction(input());
    const after = await snapshot();

    expect(after.orders).toBe(before.orders + 1);
    expect(after.items).toBe(before.items + 1);
    expect(after.payments).toBe(before.payments + 1);
    expect(after.receipts).toBe(before.receipts + 1);
    expect(after.events).toBe(before.events + 1);
    expect(after.lastReceiptNumber).toBe((before.lastReceiptNumber ?? 0) + 1);
  });

  it("rolls the WHOLE sale back, including the receipt number", async () => {
    const before = await snapshot();

    // Fail after the order, its lines, its payments and its receipt exist.
    const { createOrderInTransaction } = await import("@/lib/services/checkout");
    failAppend = true;
    await expect(createOrderInTransaction(input())).rejects.toThrow(BOOM);
    failAppend = false;

    const after = await snapshot();
    expect(after.orders).toBe(before.orders);
    expect(after.items).toBe(before.items);
    expect(after.payments).toBe(before.payments);
    expect(after.receipts).toBe(before.receipts);
    expect(after.events).toBe(before.events);
    expect(after.audit).toBe(before.audit);

    // THE ONE THAT MATTERS. A rolled-back sale must not consume a receipt
    // number: a gap in the sequence is what an inspection asks about, and it
    // cannot be repaired afterwards without rewriting a sealed journal.
    expect(after.lastReceiptNumber).toBe(before.lastReceiptNumber);
    expect(after.lastEventSequence).toBe(before.lastEventSequence);

  });

  it("the NEXT sale takes the number the failed one did not", async () => {
    // The consequence of the assertion above, stated as behaviour: if the
    // rollback had leaked the increment, this sale would be #2 with no #1.
    const { createOrderInTransaction } = await import("@/lib/services/checkout");
    failAppend = true;
    await expect(createOrderInTransaction(input())).rejects.toThrow(BOOM);
    failAppend = false;

    const ok = await createOrderInTransaction(input());
    expect(ok.number).toBe(1);

    const numbers = (await db.order.findMany({ select: { number: true } })).map((o) => o.number);
    expect(numbers).toEqual([1]);
  });
});
