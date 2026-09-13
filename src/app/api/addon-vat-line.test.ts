import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { saveSettings } from "@/lib/services/settings";
import { MAX_ITEM_QUANTITY } from "@/lib/order-limits";
import type { OrderDto } from "@/types/api";

// R8.5 driven — L-94, L-127 and L-128 over the real checkout.
//
// L-94: a supplement was folded into its host's line and therefore booked at
// the HOST's rate. `docs/politique-ventilation-tva.md` § 6 says « il relève de
// son propre taux ». A food supplement on a takeaway canette booked at 5,5 % —
// under-declared, and invisible on every document.
//
// THE OPERATOR'S DECISION, 2026-09-13: a supplement stays folded while its rate
// matches the line it is on, and becomes its OWN `OrderItem` when it does not.
// So every sale this catalogue can currently make is unchanged — all 21 add-ons
// sit on Pizzas and Sandwichs at 10, which is also `defaultVatRate` — and the
// split appears only where it is needed.

const PIN = "424242";
let manager: { id: string; username: string; role: "MANAGER" };
let pizza: { id: string };
let canette: { id: string };
let pizzaAddon: { id: string };
let canetteAddon: { id: string };

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.categoryAddOn.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.fiscalCounter.deleteMany();
  await db.setting.deleteMany();
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  await ensureFiscalCounter();
  await saveSettings({ factice: false, defaultVatRate: 10 });

  const u = await db.user.create({
    data: {
      username: `r85-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin(PIN),
    },
  });
  manager = { id: u.id, username: u.username, role: "MANAGER" };

  // Food: 10 % in every mode, like Pizzas on the live catalogue.
  const food = await db.category.create({ data: { name: `Pizzas ${Date.now()}`, vatRate: 10 } });
  pizza = await db.product.create({
    data: { name: "Pizza R85", price: 1000, categoryId: food.id, active: true, available: true, vatRate: 10 },
  });
  pizzaAddon = await db.categoryAddOn.create({
    data: { categoryId: food.id, name: "Viande Hachee", price: 150, active: true },
  });

  // Drink: 10 % sur place, 5,5 % à emporter — the live Canette shape (L-68).
  const drink = await db.category.create({
    data: { name: `Canette ${Date.now()}`, vatRate: 10, vatRateTakeaway: 5.5 },
  });
  canette = await db.product.create({
    data: {
      name: "Coca R85",
      price: 200,
      categoryId: drink.id,
      active: true,
      available: true,
      vatRate: 10,
      // `inheritCategoryVat` defaults to FALSE (L-16/L-17), so without this the
      // product keeps its own 10 % in both modes and the split never happens.
      // The live Canette products set it; a fixture that did not would be
      // testing a shape the catalogue does not have.
      inheritCategoryVat: true,
    },
  });
  // A FOOD supplement attached to a drink category — the audit's exact case.
  canetteAddon = await db.categoryAddOn.create({
    data: { categoryId: drink.id, name: "Supplément Oeuf", price: 150, active: true },
  });

  await db.shift.create({
    data: { number: 1, openedById: u.id, openedAt: new Date(), openingFloat: 0, status: "OPEN" },
  });
  await signInAs(manager);
});

afterAll(wipe);

const POST = async () => (await import("@/app/api/orders/route")).POST;

async function checkout(body: Record<string, unknown>) {
  return callJson<OrderDto & { error?: string }>(await POST(), {
    method: "POST",
    url: "http://localhost/api/orders",
    body,
  });
}

function sale(orderType: string, items: unknown[], total: number, extra: Record<string, unknown> = {}) {
  return {
    orderType,
    tableLabel: null,
    customerId: null,
    notes: null,
    items,
    payments: [{ method: "CASH", amount: total }],
    ...extra,
  };
}

const line = (productId: string, addons: { addonId: string; quantity: number }[] = [], quantity = 1) => ({
  productId,
  quantity,
  notes: null,
  optionIds: [],
  addons,
});

describe("L-94 — a supplement whose rate matches stays on its host's line", () => {
  it("books ONE OrderItem for a pizza plus a topping", async () => {
    // Both 10 %. Nothing about this ticket changes, which is the operator's
    // decision working: every sale this catalogue makes today looks the same.
    const r = await checkout(sale("DINE_IN", [line(pizza.id, [{ addonId: pizzaAddon.id, quantity: 1 }])], 1150));
    expect(r.status, r.body.error).toBe(201);

    const items = await db.orderItem.findMany();
    expect(items.length, "the supplement was split off when it did not need to be").toBe(1);
    expect(items[0].lineTotal).toBe(1150);
    expect(items[0].vatRate).toBe(10);
    expect(items[0].addOnsJson).toContain("Viande Hachee");
  });

  it("books ONE OrderItem à emporter too, because food is 10 % in both modes", async () => {
    const r = await checkout(sale("TAKEAWAY", [line(pizza.id, [{ addonId: pizzaAddon.id, quantity: 1 }])], 1150));
    expect(r.status, r.body.error).toBe(201);
    expect((await db.orderItem.findMany()).length).toBe(1);
  });
});

describe("L-94 — a supplement whose rate differs gets its own line", () => {
  it("splits a 10 % topping off a 5,5 % takeaway drink", async () => {
    // THE AUDIT'S CASE. Sur place both are 10 % and nothing splits; à emporter
    // the drink drops to 5,5 % and the food supplement must not follow it.
    const r = await checkout(sale("TAKEAWAY", [line(canette.id, [{ addonId: canetteAddon.id, quantity: 1 }])], 350));
    expect(r.status, r.body.error).toBe(201);

    const items = await db.orderItem.findMany({ orderBy: { vatRate: "asc" } });
    expect(items.length, "the supplement rode along at the drink's rate — this is L-94").toBe(2);

    const drinkLine = items.find((i) => i.vatRate === 5.5);
    const addonLine = items.find((i) => i.vatRate === 10);
    expect(drinkLine?.lineTotal).toBe(200);
    expect(addonLine?.productName).toBe("Supplément Oeuf");
    expect(addonLine?.lineTotal, "the supplement is under-declared at 5,5 %").toBe(150);

    // The order still adds up to what the customer paid.
    expect(items.reduce((n, i) => n + i.lineTotal, 0)).toBe(350);
    expect((await db.order.findFirst())?.total).toBe(350);
  });

  it("does NOT split the same pair sur place, where both are 10 %", async () => {
    // The other direction: the split follows the RATE, not the category. Sur
    // place the drink is 10 % and the supplement rides along as before.
    const r = await checkout(sale("DINE_IN", [line(canette.id, [{ addonId: canetteAddon.id, quantity: 1 }])], 350));
    expect(r.status, r.body.error).toBe(201);
    expect((await db.orderItem.findMany()).length).toBe(1);
  });

  it("carries the supplement line at its own rate, not the product's", async () => {
    // A supplement can also name a rate of its own; the column is what makes
    // the fix reachable from the catalogue rather than only from the default.
    await db.categoryAddOn.update({ where: { id: pizzaAddon.id }, data: { vatRate: 20 } });
    const r = await checkout(sale("DINE_IN", [line(pizza.id, [{ addonId: pizzaAddon.id, quantity: 1 }])], 1150));
    expect(r.status, r.body.error).toBe(201);

    const items = await db.orderItem.findMany({ orderBy: { vatRate: "asc" } });
    expect(items.length).toBe(2);
    expect(items.find((i) => i.vatRate === 20)?.lineTotal).toBe(150);
  });

  it("multiplies the supplement line by the host line's quantity", async () => {
    // 2 drinks × 1 supplement each = 2 supplements. Getting this wrong
    // under-declares by exactly the factor nobody would notice.
    const r = await checkout(
      sale("TAKEAWAY", [line(canette.id, [{ addonId: canetteAddon.id, quantity: 1 }], 2)], 700),
    );
    expect(r.status, r.body.error).toBe(201);
    const addonLine = (await db.orderItem.findMany()).find((i) => i.vatRate === 10);
    expect(addonLine?.quantity).toBe(2);
    expect(addonLine?.lineTotal).toBe(300);
  });

  it("does not attribute the supplement to the host product", async () => {
    // `productId` null on purpose: pointing at the host would make
    // `topProducts` count the supplement as a sale of the dish.
    await checkout(sale("TAKEAWAY", [line(canette.id, [{ addonId: canetteAddon.id, quantity: 1 }])], 350));
    const addonLine = (await db.orderItem.findMany()).find((i) => i.vatRate === 10);
    expect(addonLine?.productId).toBeNull();
    expect(addonLine?.notes).toContain("Coca R85");
  });
});

describe("L-127 — an add-on quantity is snapshotted and bounded", () => {
  it("records the quantity, so the ticket can be reproduced", async () => {
    // Measured by the audit: 3 × Viande Hachee printed as one
    // « + Viande Hachee (1,50 €) », 4,50 € unexplained on a document that is
    // never re-rendered.
    const r = await checkout(sale("DINE_IN", [line(pizza.id, [{ addonId: pizzaAddon.id, quantity: 3 }])], 1450));
    expect(r.status, r.body.error).toBe(201);

    const item = (await db.orderItem.findMany())[0];
    expect(item.lineTotal).toBe(1450);
    const adds = JSON.parse(item.addOnsJson ?? "[]") as { name: string; quantity?: number }[];
    expect(adds[0].quantity, "the quantity is charged but not recorded").toBe(3);
  });

  it("refuses a quantity past the item bound", async () => {
    // The item quantity a few fields up has carried `.max(MAX_ITEM_QUANTITY)`
    // since M-16; this had no maximum at all. Measured: 100 000 booked a
    // 150 011,90 € line into the fiscal journal.
    const r = await checkout(
      sale("DINE_IN", [line(pizza.id, [{ addonId: pizzaAddon.id, quantity: 100_000 }])], 1000),
    );
    expect(r.status).toBe(400);
    expect(r.body.error).toContain(String(MAX_ITEM_QUANTITY));
    expect(await db.order.count()).toBe(0);
  });

  it("still accepts a quantity at the bound", async () => {
    const total = 1000 + 150 * MAX_ITEM_QUANTITY;
    const r = await checkout(
      sale("DINE_IN", [line(pizza.id, [{ addonId: pizzaAddon.id, quantity: MAX_ITEM_QUANTITY }])], total),
    );
    expect(r.status, r.body.error).toBe(201);
  });
});

describe("L-128 — a tendered below the amount is refused", () => {
  it("refuses, rather than sealing a negative change onto the ticket", async () => {
    // Measured: amount 1190, tendered 500 → `Payment.change = -690`, and the
    // sealed receipt read « Reçu 5,00 € — Rendu -6,90 € ». Refused rather than
    // clamped because it lands on an immutable document.
    const r = await checkout(
      sale("DINE_IN", [line(pizza.id)], 1000, {
        payments: [{ method: "CASH", amount: 1000, tendered: 500 }],
      }),
    );
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("inférieur");
    expect(await db.order.count(), "a negative change reached the journal").toBe(0);
  });

  it("still accepts an exact tender and an overpayment", async () => {
    const exact = await checkout(
      sale("DINE_IN", [line(pizza.id)], 1000, {
        payments: [{ method: "CASH", amount: 1000, tendered: 1000 }],
      }),
    );
    expect(exact.status, exact.body.error).toBe(201);
    expect((await db.payment.findFirst())?.change).toBe(0);

    await db.payment.deleteMany();
    await db.orderItem.deleteMany();
    await db.receipt.deleteMany();
    await db.order.deleteMany();

    const over = await checkout(
      sale("DINE_IN", [line(pizza.id)], 1000, {
        payments: [{ method: "CASH", amount: 1000, tendered: 2000 }],
      }),
    );
    expect(over.status, over.body.error).toBe(201);
    expect((await db.payment.findFirst())?.change).toBe(1000);
  });

  it("still accepts a payment with no tendered at all", async () => {
    // Card and voucher never carry one, and an exact cash payment omits it.
    const r = await checkout(
      sale("DINE_IN", [line(pizza.id)], 1000, { payments: [{ method: "CARD", amount: 1000 }] }),
    );
    expect(r.status, r.body.error).toBe(201);
  });
});
