import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { hashPin } from "@/lib/auth";
import { saveSettings } from "@/lib/services/settings";

// L-68 (Batch 3.12) — the rate that is BOOKED follows the order type.
//
// WHY THIS FILE EXISTS SEPARATELY FROM THE UNIT TESTS, and it is the batch's
// central lesson repeated on purpose. `vat-inheritance.test.ts` proves
// `resolveVatRate` obeys the operator's ruling. It proved that before this file
// existed, and it would have gone on passing if `orders/route.ts` had never
// passed an order type at all — which is precisely the shape of defect Batch
// 5.8 shipped and had to be caught by a revert. A rule can be correct while
// nothing consults it. `OrderItem.vatRate` is what every fiscal report reads,
// so the only claim that matters is what this route WRITES.
//
// THE RULING (operator, 2026-09-09): a sealed bottle or can is 10 % sur place
// and 5,5 % à emporter et en livraison. Everything else stays 10 % under every
// order type. Before this batch a can booked 5,5 % whatever the order type —
// an under-declaration on every dine-in drink.

const PIN = "441122";
let can: { id: string };
let pizza: { id: string };
let customer: { id: string };

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.zReport.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.customer.deleteMany();
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
  await saveSettings({ discountApprovalThreshold: 20, factice: false });

  const u = await db.user.create({
    data: {
      username: `l68-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin(PIN),
    },
  });

  // The container category carries BOTH rates — this is the shape the operator
  // will configure on Canette and Bouteilles.
  const drinks = await db.category.create({
    data: { name: "Canette", color: "#fff", sortOrder: 1, vatRate: 10, vatRateTakeaway: 5.5 },
  });
  const food = await db.category.create({
    data: { name: "Pizzas", color: "#fff", sortOrder: 2, vatRate: 10 },
  });

  const c = await db.product.create({
    data: { name: "Coca", price: 200, vatRate: 10, inheritCategoryVat: true, categoryId: drinks.id, active: true, available: true },
  });
  const p = await db.product.create({
    data: { name: "Margarita", price: 900, vatRate: 10, inheritCategoryVat: true, categoryId: food.id, active: true, available: true },
  });
  // LIVRAISON is refused outright without a customer carrying name, phone and
  // address — `orders/route.ts` enforces it — so the delivery arm of the
  // operator's ruling cannot be tested without one.
  const cust = await db.customer.create({
    data: { name: "Client Test", phone: "0600000000", address: "1 rue du Test" },
  });
  customer = { id: cust.id };

  can = { id: c.id };
  pizza = { id: p.id };

  await db.shift.create({
    data: { number: 1, openedById: u.id, openedAt: new Date(), openingFloat: 0, status: "OPEN" },
  });
  await signInAs({ id: u.id, username: u.username, role: "MANAGER" });
});

afterAll(wipe);

async function sell(productId: string, price: number, orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON") {
  const mod = await import("@/app/api/orders/route");
  const res = await callJson<{ error?: string; id?: string }>(mod.POST, {
    method: "POST",
    url: "http://localhost/api/orders",
    body: {
      orderType,
      items: [{ productId, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: price }],
      ...(orderType === "LIVRAISON" ? { customerId: customer.id } : {}),
    },
  });
  return res;
}

/** The rate actually written to the fiscal record for the most recent sale. */
async function bookedRate(): Promise<number | null> {
  const line = await db.orderItem.findFirst({ orderBy: { id: "desc" } });
  return line?.vatRate ?? null;
}

describe("POST /api/orders — the booked VAT rate follows the order type (L-68)", () => {
  it("books a can at 10 % SUR PLACE", async () => {
    // The defect, stated positively: this used to book 5,5 %.
    const res = await sell(can.id, 200, "DINE_IN");
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await bookedRate()).toBe(10);
  });

  it("books the same can at 5,5 % À EMPORTER", async () => {
    const res = await sell(can.id, 200, "TAKEAWAY");
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await bookedRate()).toBe(5.5);
  });

  it("books the same can at 5,5 % EN LIVRAISON", async () => {
    // Livraison follows takeaway, on the operator's ruling of 2026-09-09.
    const res = await sell(can.id, 200, "LIVRAISON");
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await bookedRate()).toBe(5.5);
  });

  it("books a pizza at 10 % under every order type", async () => {
    // The safety property: a category with no à-emporter rate is unaffected,
    // which is every category in the catalogue until the operator sets one.
    for (const t of ["DINE_IN", "TAKEAWAY", "LIVRAISON"] as const) {
      const res = await sell(pizza.id, 900, t);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(await bookedRate()).toBe(10);
    }
  });

  it("ignores a vatRate sent by the client", async () => {
    // Regression assertion, not this batch's coverage: the route rebuilds the
    // rate from the product (L-16/L-17) so a tampered basket cannot choose its
    // own tax. It passes under every revert below and is named as such.
    const mod = await import("@/app/api/orders/route");
    const res = await callJson<{ error?: string }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/orders",
      body: {
        orderType: "DINE_IN",
        items: [{ productId: can.id, quantity: 1, optionIds: [], addons: [], vatRate: 5.5 }],
        payments: [{ method: "CASH", amount: 200 }],
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await bookedRate()).toBe(10);
  });
});
