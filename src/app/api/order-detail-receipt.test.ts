import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { ensureFiscalCounter } from "@/lib/services/sequence";

// L-259 — the order's detail window shows the ticket AS ISSUED.
//
// Reported from the till on 2026-10-06: « Commandes » → an order showed the
// pre-L-249 layout. The window rebuilt a ticket of its own from the order's
// fields; `GET /api/orders/[id]` never sent `Receipt.content`, so the window
// had nothing else to show. « Imprimer » already reprinted the sealed text,
// so the screen and the paper disagreed about the same sale.
//
// The window's wiring (sealed text when present, the rebuilt view otherwise)
// has no DOM test here — the runner has none — and was walked in the browser
// on a scratch copy. What is pinned is the route: without the field, the
// window falls back to the rebuilt ticket every time, which is the defect.

const PIN = "424242";
let manager: { id: string; username: string; role: "MANAGER" };

async function detailRoute() {
  return import("@/app/api/orders/[id]/route");
}

const SEALED = "+------------------------------------------------+\n|              H I B A   F O O D                 |\n+------------------------------------------------+\nTOTAL A PAYER                              9,90 €\n";

async function order(number: number, withReceipt: boolean): Promise<string> {
  const shift = await db.shift.create({
    data: { number, openedById: manager.id, status: "OPEN", openingFloat: 0 },
  });
  const o = await db.order.create({
    data: {
      number,
      shiftId: shift.id,
      cashierId: manager.id,
      status: "COMPLETED",
      subtotal: 990,
      discountTotal: 0,
      total: 990,
      vatTotal: 90,
      itemCount: 1,
      items: { create: [{ productName: "Giant Bacon", quantity: 1, lineTotal: 990, vatRate: 10, unitPrice: 990 }] },
      payments: { create: [{ method: "CARD", amount: 990, cashierId: manager.id }] },
    },
  });
  if (withReceipt) {
    await db.receipt.create({ data: { orderId: o.id, receiptNumber: number, content: SEALED } });
  }
  return o.id;
}

async function wipe(): Promise<void> {
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.fiscalEvent.deleteMany();
  await db.receipt.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.refund.deleteMany();
  await db.order.deleteMany();
  await db.zReport.deleteMany();
  await db.shift.deleteMany();
  await db.setting.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  await ensureFiscalCounter();
  const m = await db.user.create({
    data: { username: `l259-${Date.now()}`, name: "Gérant", role: "MANAGER", pinHash: await hashPin(PIN) },
  });
  manager = { id: m.id, username: m.username, role: "MANAGER" };
  await signInAs(manager);
});

afterAll(async () => {
  await wipe();
});

describe("GET /api/orders/[id] — the sealed ticket (L-259)", () => {
  it("returns Receipt.content byte for byte, so the window can show the ticket as issued", async () => {
    const id = await order(8, true);
    const { GET } = await detailRoute();
    const res = await callJson<{ receipt?: { content: string } | null }>(GET, { params: { id } });
    expect(res.status).toBe(200);
    expect(res.body.receipt?.content).toBe(SEALED);
  });

  it("answers receipt null for an order with no sealed ticket, which is the window's fallback", async () => {
    const id = await order(9, false);
    const { GET } = await detailRoute();
    const res = await callJson<{ receipt?: { content: string } | null }>(GET, { params: { id } });
    expect(res.status).toBe(200);
    expect(res.body.receipt ?? null).toBeNull();
  });
});
