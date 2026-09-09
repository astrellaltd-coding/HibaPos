import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import {
  comboSlotsForPayload,
  emptySlot,
  governableGroups,
  slotsFromProduct,
  withRule,
  type SlotForm,
} from "@/lib/combo-slot-form";
import type { ProductDto } from "@/types/api";

// Batch 5.10 — what the EDITOR produces is what the server STORES.
//
// WHY THIS FILE EXISTS. `combo-slot-form.test.ts` proves the mapping and
// `products-combo-validation.test.ts` proves the route; neither proves they
// agree. That gap is precisely where Batch 5.9's defect lived — a correct route
// the client fed nothing — and a source-level guard can only assert that a
// function is CALLED, not that what it returns is accepted.
//
// So every test below builds a `SlotForm` exactly as the editor's state would
// hold it, runs it through the same `comboSlotsForPayload` the form calls, and
// POSTs the result to the real route. What comes back out of the database is
// the assertion.
//
// WHAT IT STILL DOES NOT PROVE: that the screen renders and its controls work.
// The browser pane would not dispatch events to React in this session, so the
// editor was not driven by hand. That stays an [OWNER] check, the same
// treatment Batch 5.8 gave L-67d.

const PIN = "771155";
let ids: {
  pizzas: string;
  sauceTomate: string;
  menuCat: string;
  bouteilles: string;
  taille: string;
  senior: string;
  regina: string;
  coca: string;
};

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.zReport.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.cashMovement.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.customer.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.comboSlotOptionRule.deleteMany();
  await db.comboSlotChoice.deleteMany();
  await db.comboSlot.deleteMany();
  await db.product.deleteMany();
  await db.categoryOptionChoice.deleteMany();
  await db.categoryOptionGroup.deleteMany();
  await db.categoryAddOn.deleteMany();
  await db.category.deleteMany();
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  const u = await db.user.create({
    data: { username: `b510-${Date.now()}-${Math.random()}`, name: "Resp", role: "MANAGER", pinHash: await hashPin(PIN) },
  });

  const pizzas = await db.category.create({ data: { name: "Pizzas", color: "#f00", sortOrder: 1 } });
  const sauceTomate = await db.category.create({
    data: { name: "Sauce Tomate", color: "#f00", sortOrder: 2, parentId: pizzas.id },
  });
  const menuCat = await db.category.create({
    data: { name: "Menu", color: "#f00", sortOrder: 3, parentId: pizzas.id },
  });
  const bouteilles = await db.category.create({ data: { name: "Bouteilles", color: "#00f", sortOrder: 4 } });

  const taille = await db.categoryOptionGroup.create({
    data: { categoryId: pizzas.id, name: "Taille", required: true, multiple: false, sortOrder: 0 },
  });
  const senior = await db.categoryOptionChoice.create({
    data: { groupId: taille.id, name: "Senior", pickupPrice: 1190, deliveryPrice: 1350, sortOrder: 0 },
  });

  const regina = await db.product.create({
    data: { name: "Regina", categoryId: sauceTomate.id, price: 890, pickupPrice: 890, deliveryPrice: 990,
            vatRate: 10, inheritCategoryVat: true, active: true, available: true },
  });
  const coca = await db.product.create({
    data: { name: "Coca", categoryId: bouteilles.id, price: 350, pickupPrice: 350, deliveryPrice: 350,
            vatRate: 10, inheritCategoryVat: true, active: true, available: true },
  });

  await signInAs({ id: u.id, username: u.username, role: "MANAGER" });
  ids = { pizzas: pizzas.id, sauceTomate: sauceTomate.id, menuCat: menuCat.id, bouteilles: bouteilles.id,
          taille: taille.id, senior: senior.id, regina: regina.id, coca: coca.id };
});

afterAll(wipe);

async function createProduct(body: Record<string, unknown>) {
  const mod = await import("@/app/api/catalog/products/route");
  return callJson<ProductDto & { error?: string }>(mod.POST, {
    method: "POST", url: "http://localhost/api/catalog/products", body,
  });
}
async function updateProduct(id: string, body: Record<string, unknown>) {
  const mod = await import("@/app/api/catalog/products/[id]/route");
  return callJson<ProductDto & { error?: string }>(mod.PUT, {
    method: "PUT", url: `http://localhost/api/catalog/products/${id}`, params: { id }, body,
  });
}
async function listProducts(): Promise<ProductDto[]> {
  const mod = await import("@/app/api/catalog/products/route");
  const res = await callJson<ProductDto[]>(mod.GET, { url: "http://localhost/api/catalog/products?all=1" });
  return res.body;
}

/** The body the product form builds, with the editor's slots in it. */
function formBody(slots: SlotForm[], over: Record<string, unknown> = {}) {
  return {
    name: "Menu Chill",
    description: null,
    price: 2490,
    pickupPrice: 2490,
    deliveryPrice: 2890,
    vatRate: 10,
    categoryId: ids.menuCat,
    image: null,
    active: true,
    available: true,
    inheritCategoryGlobals: false,
    inheritCategoryVat: false,
    sortOrder: 0,
    options: [],
    isCombo: true,
    comboSlots: comboSlotsForPayload({ isCombo: true, wasCombo: false, slots }),
    ...over,
  };
}

/** Menu Chill as the operator would fill it in: 2 Seniors + a bottle. */
function menuChillSlots(): SlotForm[] {
  const pizza = withRule(
    { ...emptySlot(ids.pizzas), name: "Pizza", quantity: 2 },
    ids.taille,
    "fixed",
    ids.senior,
  );
  return [pizza, { ...emptySlot(ids.bouteilles), name: "Boisson", quantity: 1 }];
}

describe("a menu built in the editor is stored as the editor described it", () => {
  it("creates the slots, the quantity, the source category and the pinned size", async () => {
    const res = await createProduct(formBody(menuChillSlots()));
    expect(res.status, res.body.error).toBe(201);
    expect(res.body.isCombo).toBe(true);

    const stored = await db.comboSlot.findMany({
      where: { productId: res.body.id },
      include: { choices: true, optionRules: true },
      orderBy: { sortOrder: "asc" },
    });
    expect(stored.map((s) => s.name)).toEqual(["Pizza", "Boisson"]);
    expect(stored[0].quantity).toBe(2);
    expect(stored[0].sourceCategoryId).toBe(ids.pizzas);
    expect(stored[0].optionRules).toHaveLength(1);
    expect(stored[0].optionRules[0].categoryOptionChoiceId).toBe(ids.senior);
    expect(stored[1].sourceCategoryId).toBe(ids.bouteilles);
    expect(stored[1].optionRules).toHaveLength(0);
  });

  it("converts a surcharge from euros to CENTS on the way in", async () => {
    // The operator types 1,50 into the editor; the database must hold 150. A
    // missing ×100 here would book a 1,50 € extra as one cent.
    const slots = menuChillSlots();
    slots[1] = { ...slots[1], choices: [{ productId: ids.coca, surcharge: 1.5 }] };
    const res = await createProduct(formBody(slots));
    expect(res.status, res.body.error).toBe(201);

    const choice = await db.comboSlotChoice.findFirst({ where: { productId: ids.coca } });
    expect(choice!.surcharge).toBe(150);
  });

  it("round-trips: what the GET returns reloads into the same form state", async () => {
    // The editor seeds itself from `slotsFromProduct`, so a menu opened for
    // editing and saved again unchanged must survive byte for byte. This is
    // what stops an edit to the PRICE quietly rewriting the composition.
    const created = await createProduct(formBody(menuChillSlots()));
    const fetched = (await listProducts()).find((p) => p.id === created.body.id)!;
    const reloaded = slotsFromProduct(fetched);

    expect(reloaded.map((s) => s.name)).toEqual(["Pizza", "Boisson"]);
    expect(reloaded[0].quantity).toBe(2);
    expect(reloaded[0].optionRules).toEqual([
      { categoryOptionGroupId: ids.taille, categoryOptionChoiceId: ids.senior },
    ]);

    const again = await updateProduct(created.body.id, formBody(reloaded, { name: "Menu Chill" }));
    expect(again.status, again.body.error).toBe(200);
    const stored = await db.comboSlot.findMany({
      where: { productId: created.body.id }, include: { optionRules: true }, orderBy: { sortOrder: "asc" },
    });
    expect(stored.map((s) => s.name)).toEqual(["Pizza", "Boisson"]);
    expect(stored[0].optionRules[0].categoryOptionChoiceId).toBe(ids.senior);
  });

  it("stores « ne pas demander » as a rule with a NULL choice", async () => {
    const slots = menuChillSlots();
    slots[0] = withRule(slots[0], ids.taille, "silent", null);
    const res = await createProduct(formBody(slots));
    expect(res.status, res.body.error).toBe(201);
    const rule = await db.comboSlotOptionRule.findFirst({ where: { categoryOptionGroupId: ids.taille } });
    expect(rule).not.toBeNull();
    expect(rule!.categoryOptionChoiceId).toBeNull();
  });

  it("the groups the editor offers are the ones the server accepts", async () => {
    // `governableGroups` reads the FILLERS' inherited groups. If it ever offered
    // a group the fillers do not inherit, the save would be refused by
    // `combo-admin.ts` — so the two are checked against each other here.
    const products = await listProducts();
    const categories = [
      { id: ids.pizzas, parentId: null }, { id: ids.sauceTomate, parentId: ids.pizzas },
      { id: ids.menuCat, parentId: ids.pizzas }, { id: ids.bouteilles, parentId: null },
    ] as never;
    const offered = governableGroups(ids.pizzas, products, categories);
    expect(offered.map((g) => g.id)).toEqual([ids.taille]);

    const slots = menuChillSlots();
    slots[0] = withRule(slots[0], offered[0].id, "fixed", offered[0].choices[0].id);
    const res = await createProduct(formBody(slots));
    expect(res.status, res.body.error).toBe(201);
  });
});

describe("the editor cannot build a menu the till would refuse", () => {
  it("a menu whose component is itself a menu is refused", async () => {
    const first = await createProduct(formBody(menuChillSlots()));
    expect(first.status).toBe(201);
    // `candidateProducts` never offers a menu, so this cannot be reached
    // through the screen — but the server refuses it regardless, which is what
    // makes the editor's filter a convenience rather than the only guard.
    const slots = menuChillSlots();
    slots[0] = { ...slots[0], choices: [{ productId: first.body.id, surcharge: 0 }] };
    const res = await createProduct(formBody(slots, { name: "Menu Récursif" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("menu composé et ne peut pas être un composant");
  });

  it("turning the switch OFF clears the slots, and only then", async () => {
    const created = await createProduct(formBody(menuChillSlots()));
    expect(await db.comboSlot.count({ where: { productId: created.body.id } })).toBe(2);

    // An unrelated edit — the form sends `undefined` for a non-menu it never
    // knew as one, so nothing is touched.
    const untouched = await updateProduct(created.body.id, {
      ...formBody([], { name: "Menu Chill", price: 2590 }),
      isCombo: true,
      comboSlots: comboSlotsForPayload({ isCombo: false, wasCombo: false, slots: [] }),
    });
    expect(untouched.status, untouched.body.error).toBe(200);
    expect(await db.comboSlot.count({ where: { productId: created.body.id } })).toBe(2);

    // Now the operator turns the switch off: an explicit clear.
    const cleared = await updateProduct(created.body.id, {
      ...formBody([], { name: "Menu Chill", price: 2590 }),
      isCombo: false,
      comboSlots: comboSlotsForPayload({ isCombo: false, wasCombo: true, slots: [] }),
    });
    expect(cleared.status, cleared.body.error).toBe(200);
    expect(await db.comboSlot.count({ where: { productId: created.body.id } })).toBe(0);
    expect((await db.product.findUnique({ where: { id: created.body.id } }))!.isCombo).toBe(false);
  });
});
