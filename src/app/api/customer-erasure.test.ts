import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { ensureFiscalCounter } from "@/lib/services/sequence";

// L-260 — deleting a client ERASES them, the operator's decision of 2026-10-06.
//
// The DELETE route was a « soft-delete » — `active: false`, which no list
// reads — and refused anyone who had ever ordered. So the client stayed on
// both screens with every detail stored, and L-248's « a deletion request
// genuinely erases someone » was true only on paper.
//
// Measured before deciding: nothing fiscal depends on the row. The sealed
// receipt holds no client data (L-248), the VENTE payload never did, and the
// order keeps only `customerId`, which no seal or hash covers. These drive the
// real route and read the database back.

const PIN = "424242";
let manager: { id: string; username: string; role: "MANAGER" };

async function route() {
  return import("@/app/api/customers/[id]/route");
}

async function clientWithOrder(): Promise<{ customerId: string; orderId: string }> {
  const c = await db.customer.create({
    data: { name: "Mme Exemple", phone: "0600000000", address: "1 rue Test", city: "Ferrieres" },
  });
  await db.auditLog.create({
    data: { action: "CUSTOMER_CREATED", entity: "Customer", entityId: c.id, details: JSON.stringify({ name: c.name }) },
  });
  const shift = await db.shift.create({ data: { number: 1, openedById: manager.id, status: "OPEN", openingFloat: 0 } });
  const o = await db.order.create({
    data: {
      number: 1,
      shiftId: shift.id,
      cashierId: manager.id,
      customerId: c.id,
      orderType: "LIVRAISON",
      status: "COMPLETED",
      subtotal: 990,
      discountTotal: 0,
      total: 990,
      vatTotal: 90,
      itemCount: 1,
      items: { create: [{ productName: "Chicago", quantity: 1, lineTotal: 990, vatRate: 10, unitPrice: 990 }] },
      payments: { create: [{ method: "CARD", amount: 990, cashierId: manager.id }] },
    },
  });
  return { customerId: c.id, orderId: o.id };
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
  await db.customer.deleteMany();
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
    data: { username: `l260-${Date.now()}`, name: "Gérant", role: "MANAGER", pinHash: await hashPin(PIN) },
  });
  manager = { id: m.id, username: m.username, role: "MANAGER" };
  await signInAs(manager);
});

afterAll(async () => {
  await wipe();
});

describe("DELETE /api/customers/[id] — erasure (L-260)", () => {
  it("erases a client who has ordered — the row is gone, not hidden", async () => {
    const { customerId } = await clientWithOrder();
    const { DELETE } = await route();
    const res = await callJson<{ ok?: boolean; ordersUnlinked?: number; error?: string }>(DELETE, {
      method: "DELETE",
      params: { id: customerId },
    });
    expect(res.status, res.body.error).toBe(200);
    expect(res.body.ordersUnlinked).toBe(1);
    expect(await db.customer.findUnique({ where: { id: customerId } })).toBeNull();
  });

  it("keeps the order — amounts and lines intact — and only empties its link", async () => {
    const { customerId, orderId } = await clientWithOrder();
    const { DELETE } = await route();
    await callJson(DELETE, { method: "DELETE", params: { id: customerId } });
    const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, payments: true } });
    expect(order).not.toBeNull();
    expect(order!.customerId).toBeNull();
    expect(order!.total).toBe(990);
    expect(order!.vatTotal).toBe(90);
    expect(order!.items).toHaveLength(1);
    expect(order!.payments).toHaveLength(1);
  });

  it("scrubs the name from the audit log, and logs the erasure without it", async () => {
    const { customerId } = await clientWithOrder();
    const { DELETE } = await route();
    await callJson(DELETE, { method: "DELETE", params: { id: customerId } });
    const rows = await db.auditLog.findMany({ where: { entity: "Customer", entityId: customerId } });
    expect(rows.map((r) => r.action).sort()).toEqual(["CUSTOMER_CREATED", "CUSTOMER_ERASED"]);
    for (const r of rows) expect(r.details ?? "").not.toContain("Exemple");
  });

  it("answers 404 for a client that does not exist", async () => {
    const { DELETE } = await route();
    const res = await callJson(DELETE, { method: "DELETE", params: { id: "nope" } });
    expect(res.status).toBe(404);
  });
});
