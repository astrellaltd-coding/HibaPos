import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { posGridProducts, sellableAlone } from "@/lib/pos-grid";
import { slotProducts } from "@/lib/combo-builder";
import { aggregateOrders, AGGREGATE_INCLUDE } from "@/lib/services/aggregate";
import { computeShiftReport } from "@/lib/services/reports";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { hashPin } from "@/lib/auth";
import { saveSettings } from "@/lib/services/settings";
import { grantStepUp } from "@/lib/services/step-up";
import type { CategoryDto, ProductDto } from "@/types/api";

// R3.1 / R3.2 — « Use it on POS », and the promise that it hides a product from
// ONE grid rather than withdrawing it from the catalogue.
//
// ── WHY THE SWITCH EXISTS ────────────────────────────────────────────────────
// A menu component must be `active`, and until this batch every active product
// appeared on the till's grid. That is what blocked L-69: Box 15, Box 35 and
// the Tenders box each bundle a sealed drink into one price taxed wholly at
// 10 %, and turning them into real menus needs a food-only product to weigh the
// drink against — which, created today, would sit on the till for a customer to
// order by itself.
//
// ── WHAT R3.2 IS ─────────────────────────────────────────────────────────────
// R3.1 is four lines of filter. R3.2 is the claim that those four lines cost
// nothing anywhere else, and it is the larger half. A `showOnPos: false`
// product must still be: offerable as a menu component, sellable, refundable,
// reprintable, present in past orders, and present in every report. Each of
// those is asserted below against the real thing rather than against a mock.
//
// The one thing that cannot be asserted here is the React grid itself — this
// project renders no components in tests. So the filter was lifted OUT of
// `pos-view.tsx` into `@/lib/pos-grid`, which is exercised directly, and the
// last test in this file checks that `pos-view.tsx` kept no product filter of
// its own. That is as close to "what the screen does" as this codebase gets,
// and it is stated rather than glossed.

const PIN = "336699";
let ids: {
  user: string;
  shift: string;
  menu: string;
  pizzaSlot: string;
  drinkSlot: string;
  /** The food-only component: active, available, and NOT on the grid. */
  boxFood: string;
  coca: string;
  visible: string;
  pizzaCat: string;
  drinkCat: string;
};

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.zReport.deleteMany();
  await db.refund.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.comboSlotOptionRule.deleteMany();
  await db.comboSlotChoice.deleteMany();
  await db.comboSlot.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.fiscalCounter.deleteMany();
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  await ensureFiscalCounter();
  await saveSettings({ factice: false });

  const u = await db.user.create({
    data: {
      username: `r31-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin(PIN),
    },
  });

  const food = await db.category.create({ data: { name: "Box", color: "#f00", sortOrder: 1 } });
  const boissons = await db.category.create({ data: { name: "Boissons", color: "#00f", sortOrder: 2 } });
  const canettes = await db.category.create({
    data: { name: "Canette", color: "#00f", sortOrder: 3, parentId: boissons.id,
      vatRate: 10, vatRateTakeaway: 5.5 },
  });

  // THE POINT OF THE WHOLE BATCH: active and available, so it is a legal menu
  // component — and off the grid, so nobody rings it up alone.
  const boxFood = await db.product.create({
    data: { name: "Box 15 (sans boisson)", categoryId: food.id, price: 1200, pickupPrice: 1200,
      deliveryPrice: 1200, vatRate: 10, inheritCategoryVat: true, active: true, available: true,
      showOnPos: false },
  });
  const coca = await db.product.create({
    data: { name: "Coca", categoryId: canettes.id, price: 150, pickupPrice: 150,
      deliveryPrice: 150, vatRate: 10, inheritCategoryVat: true, active: true, available: true },
  });
  const visible = await db.product.create({
    data: { name: "Box Bowl", categoryId: food.id, price: 900, pickupPrice: 900,
      deliveryPrice: 900, vatRate: 10, inheritCategoryVat: true, active: true, available: true },
  });

  const menu = await db.product.create({
    data: { name: "Box 15", categoryId: food.id, price: 1500, pickupPrice: 1500,
      deliveryPrice: 1500, vatRate: 10, inheritCategoryVat: false, isCombo: true,
      active: true, available: true },
  });
  const pizzaSlot = await db.comboSlot.create({
    data: { productId: menu.id, name: "Box", quantity: 1, sortOrder: 0, sourceCategoryId: food.id },
  });
  const drinkSlot = await db.comboSlot.create({
    data: { productId: menu.id, name: "Boisson", quantity: 1, sortOrder: 1, sourceCategoryId: canettes.id },
  });

  const s = await db.shift.create({
    data: { number: 1, openedById: u.id, openedAt: new Date(), openingFloat: 0, status: "OPEN" },
  });
  await signInAs({ id: u.id, username: u.username, role: "MANAGER" });

  ids = {
    user: u.id, shift: s.id, menu: menu.id, pizzaSlot: pizzaSlot.id, drinkSlot: drinkSlot.id,
    boxFood: boxFood.id, coca: coca.id, visible: visible.id,
    pizzaCat: food.id, drinkCat: canettes.id,
  };
});

afterAll(wipe);

async function productsDto(): Promise<ProductDto[]> {
  const mod = await import("@/app/api/catalog/products/route");
  const { status, body } = await callJson<ProductDto[]>(mod.GET, {
    url: "http://localhost/api/catalog/products?all=1",
  });
  expect(status).toBe(200);
  return body;
}

async function categoriesDto(): Promise<CategoryDto[]> {
  const mod = await import("@/app/api/catalog/categories/route");
  const { body } = await callJson<CategoryDto[]>(mod.GET, {
    url: "http://localhost/api/catalog/categories",
  });
  return body;
}

const GRID = { categoryId: "all", subCategoryId: null, search: "" };

// ------------------------------------------------------ hidden from ONE grid --

describe("R3.1 — the product is off the till grid", () => {
  it("is absent from the grid while an ordinary product is present", async () => {
    const products = await productsDto();
    const grid = posGridProducts(products, await categoriesDto(), GRID);

    expect(grid.map((p) => p.id)).toContain(ids.visible);
    expect(grid.map((p) => p.id)).not.toContain(ids.boxFood);
    // …and it is not `active`/`available` doing it. Those are untouched.
    const stored = await db.product.findUniqueOrThrow({ where: { id: ids.boxFood } });
    expect(stored.active).toBe(true);
    expect(stored.available).toBe(true);
    expect(stored.showOnPos).toBe(false);
  });

  it("does not surface through SEARCH either", async () => {
    // The filter runs before the search filter on purpose. Typing the name of a
    // food-only component must not hand the cashier something to sell alone.
    const products = await productsDto();
    const cats = await categoriesDto();
    expect(posGridProducts(products, cats, { ...GRID, search: "Box 15" }).map((p) => p.id))
      .not.toContain(ids.boxFood);
    // CONTROL: the search itself works — the menu of the same name is found.
    expect(posGridProducts(products, cats, { ...GRID, search: "Box 15" }).map((p) => p.id))
      .toContain(ids.menu);
  });

  it("does not surface by picking its category either", async () => {
    const products = await productsDto();
    const cats = await categoriesDto();
    const inCat = posGridProducts(products, cats, { ...GRID, categoryId: ids.pizzaCat });
    expect(inCat.map((p) => p.id)).toContain(ids.visible);
    expect(inCat.map((p) => p.id)).not.toContain(ids.boxFood);
  });

  it("leaves every existing product on the grid, because the default is ON", async () => {
    // What makes the migration inert. A product created without mentioning the
    // column appears on the grid, exactly as all 81 live products do.
    const p = await db.product.create({
      data: { name: "Sans mention", categoryId: ids.pizzaCat, price: 500, vatRate: 10,
        active: true, available: true },
    });
    expect(p.showOnPos).toBe(true);
    expect(sellableAlone({ ...(await productsDto()).find((x) => x.id === p.id)! })).toBe(true);
  });
});

// ------------------------------------------- and from NOTHING else (R3.2) --

describe("R3.2 — a hidden product is still a menu component", () => {
  it("is offered for a slot it may fill, which the grid refuses to show", async () => {
    // THE LOAD-BEARING PAIR. `slotProducts` and `posGridProducts` are the two
    // halves of R3.1: one deliberately consults `showOnPos` and one deliberately
    // does not. Asserted together, in one test, so nobody can unify them
    // without this failing.
    const products = await productsDto();
    const cats = await categoriesDto();
    const menu = products.find((p) => p.id === ids.menu)!;
    const slot = menu.comboSlots.find((sl) => sl.id === ids.pizzaSlot)!;

    expect(slotProducts(slot, products, cats).map((p) => p.id)).toContain(ids.boxFood);
    expect(posGridProducts(products, cats, GRID).map((p) => p.id)).not.toContain(ids.boxFood);
  });

  it("sells inside a menu, through the real checkout, at its own VAT rate", async () => {
    const mod = await import("@/app/api/orders/route");
    const res = await callJson<{ error?: string }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/orders",
      body: {
        orderType: "TAKEAWAY",
        items: [{
          productId: ids.menu, quantity: 1, optionIds: [], addons: [],
          components: [
            { slotId: ids.pizzaSlot, productId: ids.boxFood, optionIds: [], addons: [] },
            { slotId: ids.drinkSlot, productId: ids.coca, optionIds: [], addons: [] },
          ],
        }],
        payments: [{ method: "CASH", amount: 1500 }],
      },
    });
    expect(res.status, res.body.error).toBe(201);

    const lines = await db.orderItem.findMany({ orderBy: { lineTotal: "desc" } });
    expect(lines).toHaveLength(2);
    const food = lines.find((l) => l.productId === ids.boxFood)!;
    expect(food).toBeTruthy();
    // L-69's whole purpose: the drink is 5,5 % à emporter instead of the entire
    // price sitting at 10 %. The hidden component is what made that expressible.
    expect(food.vatRate).toBe(10);
    expect(lines.find((l) => l.productId === ids.coca)!.vatRate).toBe(5.5);
    // And the split used the hidden product's catalogue price as its weight.
    expect(food.referencePrice).toBe(1200);
  });

  it("is still ACCEPTED by the server as an ordinary line — a display rule, not a guard", async () => {
    // MEASURED, and pinned as the deliberate limit of R3.1 rather than left
    // unstated. `showOnPos` filters ONE grid; `orders/route.ts` still checks
    // only `active` and `available`, so a request that names the hidden product
    // directly is booked.
    //
    // NOT changed here. The plan's R3.1 is « filter the POS grid, extend the
    // DTO, add the switch » — a server refusal is a business-behaviour change
    // beyond the item, and safety rule 6 says ask rather than guess. It is also
    // not a fraud vector: the till is the only client, the grid is the only way
    // in, and the price booked would be the component's real catalogue price.
    // Recorded as **L-84** so the operator decides whether to close it.
    //
    // The day someone does close it, this test is the one that has to change,
    // and changing it will be a decision rather than an accident.
    const mod = await import("@/app/api/orders/route");
    const res = await callJson<{ error?: string }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/orders",
      body: {
        orderType: "TAKEAWAY",
        items: [{ productId: ids.boxFood, quantity: 1, optionIds: [], addons: [] }],
        payments: [{ method: "CASH", amount: 1200 }],
      },
    });
    expect(res.status, res.body.error).toBe(201);
    // And what it booked is an ordinary, correct sale — not a broken one.
    const line = await db.orderItem.findFirstOrThrow();
    expect(line.productId).toBe(ids.boxFood);
    expect(line.lineTotal).toBe(1200);
    expect(line.comboGroupId).toBeNull();
  });
});

describe("R3.2 — and it behaves normally everywhere after the sale", () => {
  async function sellTheMenu() {
    const mod = await import("@/app/api/orders/route");
    const res = await callJson<{ id?: string; error?: string }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/orders",
      body: {
        orderType: "TAKEAWAY",
        items: [{
          productId: ids.menu, quantity: 1, optionIds: [], addons: [],
          components: [
            { slotId: ids.pizzaSlot, productId: ids.boxFood, optionIds: [], addons: [] },
            { slotId: ids.drinkSlot, productId: ids.coca, optionIds: [], addons: [] },
          ],
        }],
        payments: [{ method: "CASH", amount: 1500 }],
      },
    });
    expect(res.status, res.body.error).toBe(201);
    return db.order.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  }

  it("appears in past orders and in the reports", async () => {
    await sellTheMenu();

    const orders = await db.order.findMany({ where: { shiftId: ids.shift }, include: AGGREGATE_INCLUDE });
    const agg = aggregateOrders(orders);
    // Hidden from a grid is not hidden from the books.
    expect(agg.topProducts.map((p) => p.productId)).toContain(ids.boxFood);
    expect(agg.topMenus.map((m) => m.comboProductId)).toEqual([ids.menu]);

    const report = await computeShiftReport(ids.shift);
    expect(report.topProducts.map((p) => p.productId)).toContain(ids.boxFood);
    expect(report.salesTotal).toBe(1500);
  });

  it("is refundable", async () => {
    const order = await sellTheMenu();
    // DD-19: EVERY refund needs the caller's own PIN, carried as a step-up
    // token. Obtained through the real grant, so this test cannot pass against
    // a token shape the application would reject.
    const grant = await grantStepUp({
      callerId: ids.user,
      pin: PIN,
      action: "REFUND",
      amount: 1500,
    });
    expect(grant.ok).toBe(true);

    const mod = await import("@/app/api/orders/[id]/refund/route");
    const res = await callJson<{ error?: string }>(mod.POST, {
      method: "POST",
      url: `http://localhost/api/orders/${order.id}/refund`,
      params: { id: order.id },
      body: {
        amount: 1500,
        reason: "test",
        method: "CASH",
        stepUpToken: (grant as { token: string }).token,
      },
    });
    expect([200, 201], res.body.error).toContain(res.status);
    expect(await db.refund.count()).toBe(1);
    // The hidden product's line is what was given back.
    const refunded = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, refunds: true },
    });
    expect(refunded.status).toBe("REFUNDED");
    expect(refunded.items.some((i) => i.productId === ids.boxFood)).toBe(true);
  });

  it("is still in the catalogue the editor lists", async () => {
    // « Hidden from one grid, not withdrawn from the catalogue » — the products
    // API the catalogue screen reads still returns it.
    const products = await productsDto();
    const row = products.find((p) => p.id === ids.boxFood);
    expect(row).toBeTruthy();
    expect(row!.showOnPos).toBe(false);
    expect(row!.active).toBe(true);
  });
});

// -------------------------------------------------- the editor round-trip --

describe("R3.1 — the catalogue editor can actually set it", () => {
  it("persists showOnPos on CREATE, and defaults it on when omitted", async () => {
    // The create handler enumerates its fields rather than spreading them, so a
    // column added to the schema and not added there is silently dropped on
    // every write and the switch does nothing. That is the failure this pins.
    const mod = await import("@/app/api/catalog/products/route");
    const mk = (name: string, body: Record<string, unknown>) =>
      callJson<{ id?: string; showOnPos?: boolean; error?: string }>(mod.POST, {
        method: "POST",
        url: "http://localhost/api/catalog/products",
        body: { name, price: 500, categoryId: ids.pizzaCat, vatRate: 10, ...body },
      });

    const hidden = await mk("Composant caché", { showOnPos: false });
    expect(hidden.status, hidden.body.error).toBe(201);
    expect(hidden.body.showOnPos).toBe(false);
    expect((await db.product.findUniqueOrThrow({ where: { id: hidden.body.id! } })).showOnPos).toBe(false);

    const omitted = await mk("Sans le champ", {});
    expect(omitted.status, omitted.body.error).toBe(201);
    expect(omitted.body.showOnPos).toBe(true);
  });

  it("persists showOnPos on UPDATE, in both directions", async () => {
    const mod = await import("@/app/api/catalog/products/[id]/route");
    const put = (id: string, showOnPos: boolean) =>
      callJson<{ showOnPos?: boolean; error?: string }>(mod.PUT, {
        method: "PUT",
        url: `http://localhost/api/catalog/products/${id}`,
        params: { id },
        body: {
          name: "Box 15 (sans boisson)", price: 1200, categoryId: ids.pizzaCat,
          vatRate: 10, inheritCategoryVat: true, showOnPos,
        },
      });

    const on = await put(ids.boxFood, true);
    expect(on.status, on.body.error).toBe(200);
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.boxFood } })).showOnPos).toBe(true);

    const off = await put(ids.boxFood, false);
    expect(off.status, off.body.error).toBe(200);
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.boxFood } })).showOnPos).toBe(false);
  });
});

// ------------------------------------------------------- the wiring itself --

describe("R3.1 — the grid the cashier sees is the one tested above", () => {
  it("leaves no product filter behind in pos-view.tsx", async () => {
    // This project's own repeated lesson: an extracted rule proves the rule,
    // not that anything calls it. `pos-view.tsx` renders no test-visible DOM
    // here, so the honest substitute is to check that the filter was MOVED and
    // not COPIED — a leftover `products.filter(...)` would be a second grid
    // rule, silently diverging from the one every test above exercises.
    const src = readFileSync(
      path.join(process.cwd(), "src/features/catalog/pos-view.tsx"),
      "utf-8",
    );
    expect(src).toContain("posGridProducts(");
    expect(src).not.toMatch(/products\s*(\?\?\s*\[\])?\s*\.filter\(/);
  });
});
