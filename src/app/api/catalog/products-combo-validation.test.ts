import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { validateComboShape } from "@/lib/validation";

// Batch 5.9e — the admin refuses to SAVE a menu that could not be sold right.
//
// `docs/politique-ventilation-tva.md` § 4: « Ce repli est conçu pour ne jamais
// se déclencher en service : la configuration d'un menu incomplet doit être
// refusée à l'enregistrement, là où il y a le temps de la corriger. Le repli
// est la ceinture, la validation est les bretelles. »
//
// The fallback is tested in `orders-combo.test.ts` and works. This file is the
// bretelles: everything below is a menu the catalogue editor must not accept,
// because accepting it would put a sale under the fallback in service — where
// the price is right, the VAT is over-declared, and nothing on screen says so.

const PIN = "661144";
let ids: {
  pizzas: string;
  sauceTomate: string;
  empty: string;
  taille: string;
  autreGroupe: string;
  senior: string;
  autreChoix: string;
  regina: string;
  menuChill: string;
};

async function wipe() {
  // Ordered so no foreign key is left dangling. The trading rows are here even
  // though this file rings nothing: `bun test src` runs every file into ONE
  // database, so a `user.deleteMany()` that ignores the shifts and orders an
  // earlier file left behind passes alone and fails in the suite — which is
  // exactly how this list came to be written.
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
    data: {
      username: `b59e-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin(PIN),
    },
  });

  const pizzas = await db.category.create({ data: { name: "Pizzas", color: "#f00", sortOrder: 1 } });
  const sauceTomate = await db.category.create({
    data: { name: "Sauce Tomate", color: "#f00", sortOrder: 2, parentId: pizzas.id },
  });
  const empty = await db.category.create({ data: { name: "Desserts", color: "#0f0", sortOrder: 3 } });

  const taille = await db.categoryOptionGroup.create({
    data: { categoryId: pizzas.id, name: "Taille", required: true, multiple: false, sortOrder: 0 },
  });
  const senior = await db.categoryOptionChoice.create({
    data: { groupId: taille.id, name: "Senior", pickupPrice: 1190, deliveryPrice: 1350, sortOrder: 0 },
  });
  const autreGroupe = await db.categoryOptionGroup.create({
    data: { categoryId: pizzas.id, name: "Cuisson", required: false, multiple: false, sortOrder: 1 },
  });
  const autreChoix = await db.categoryOptionChoice.create({
    data: { groupId: autreGroupe.id, name: "Bien cuite", sortOrder: 0 },
  });

  const regina = await db.product.create({
    data: {
      name: "Regina",
      categoryId: sauceTomate.id,
      price: 890,
      vatRate: 10,
      active: true,
      available: true,
    },
  });
  const menuChill = await db.product.create({
    data: {
      name: "Menu Chill",
      categoryId: sauceTomate.id,
      price: 2490,
      vatRate: 10,
      isCombo: true,
      active: true,
      available: true,
    },
  });

  await signInAs({ id: u.id, username: u.username, role: "MANAGER" });
  ids = {
    pizzas: pizzas.id,
    sauceTomate: sauceTomate.id,
    empty: empty.id,
    taille: taille.id,
    autreGroupe: autreGroupe.id,
    senior: senior.id,
    autreChoix: autreChoix.id,
    regina: regina.id,
    menuChill: menuChill.id,
  };
});

afterAll(wipe);

function menuBody(over: Record<string, unknown> = {}) {
  return {
    name: "Menu Test",
    price: 2490,
    vatRate: 10,
    categoryId: ids.sauceTomate,
    isCombo: true,
    comboSlots: [
      {
        name: "Pizza",
        quantity: 2,
        sortOrder: 0,
        sourceCategoryId: ids.pizzas,
        choices: [],
        optionRules: [{ categoryOptionGroupId: ids.taille, categoryOptionChoiceId: ids.senior }],
      },
    ],
    ...over,
  };
}

async function createProduct(body: Record<string, unknown>) {
  const mod = await import("@/app/api/catalog/products/route");
  return callJson<{ error?: string; errors?: string[]; id?: string; isCombo?: boolean; comboSlots?: unknown[] }>(
    mod.POST,
    { method: "POST", url: "http://localhost/api/catalog/products", body },
  );
}

describe("validateComboShape — the half that needs no catalogue", () => {
  it("passes an ordinary product straight through", () => {
    expect(validateComboShape({ isCombo: false, price: 890 })).toEqual([]);
  });

  it("refuses slots on something that is not a menu", () => {
    const e = validateComboShape({
      isCombo: false,
      price: 890,
      comboSlots: [{ name: "Pizza", quantity: 1, sourceCategoryId: "c" }],
    });
    expect(e[0]).toContain("n'est pas un menu composé");
  });

  it("refuses a menu with no components at all", () => {
    const e = validateComboShape({ isCombo: true, price: 2490, comboSlots: [] });
    expect(e[0]).toContain("au moins un composant");
  });

  it("refuses a menu with no price — the forfait IS what gets ventilated", () => {
    const e = validateComboShape({
      isCombo: true,
      price: 0,
      comboSlots: [{ name: "Pizza", quantity: 1, sourceCategoryId: "c" }],
    });
    expect(e.some((m) => m.includes("doit avoir un prix"))).toBe(true);
  });

  it("refuses a nameless component — the name is the question the cashier is asked", () => {
    const e = validateComboShape({
      isCombo: true,
      price: 2490,
      comboSlots: [{ name: "  ", quantity: 1, sourceCategoryId: "c" }],
    });
    expect(e.some((m) => m.includes("doit être nommé"))).toBe(true);
  });

  it("refuses a quantity below 1", () => {
    const e = validateComboShape({
      isCombo: true,
      price: 2490,
      comboSlots: [{ name: "Pizza", quantity: 0, sourceCategoryId: "c" }],
    });
    expect(e.some((m) => m.includes("au moins 1"))).toBe(true);
  });

  it("refuses the same filler listed twice", () => {
    const e = validateComboShape({
      isCombo: true,
      price: 2490,
      comboSlots: [
        { name: "Frite", quantity: 1, sourceCategoryId: "c", choices: [{ productId: "p" }, { productId: "p" }] },
      ],
    });
    expect(e.some((m) => m.includes("deux fois"))).toBe(true);
  });

  it("names the offending component, so the operator knows where to look", () => {
    const e = validateComboShape({
      isCombo: true,
      price: 2490,
      comboSlots: [
        { name: "Pizza", quantity: 1, sourceCategoryId: "c" },
        { name: "Boisson", quantity: 0, sourceCategoryId: "c" },
      ],
    });
    expect(e[0]).toContain("« Boisson »");
  });
});

describe("POST /api/catalog/products — a menu is saved, or refused with a reason", () => {
  it("saves a well-formed menu, slots and all", async () => {
    const res = await createProduct(menuBody());
    expect(res.status, res.body.error).toBe(201);
    expect(res.body.isCombo).toBe(true);
    expect(res.body.comboSlots).toHaveLength(1);

    const stored = await db.comboSlot.findFirst({ include: { optionRules: true, choices: true } });
    expect(stored!.name).toBe("Pizza");
    expect(stored!.quantity).toBe(2);
    expect(stored!.optionRules[0].categoryOptionChoiceId).toBe(ids.senior);
  });

  it("REFUSES a menu whose component is itself a menu", async () => {
    const res = await createProduct(
      menuBody({
        comboSlots: [
          {
            name: "Pizza",
            quantity: 1,
            sortOrder: 0,
            sourceCategoryId: ids.sauceTomate,
            choices: [{ productId: ids.menuChill, surcharge: 0, sortOrder: 0 }],
            optionRules: [],
          },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("est un menu composé et ne peut pas être un composant");
    expect(await db.product.count({ where: { name: "Menu Test" } })).toBe(0);
  });

  it("refuses a component drawn from a category that holds nothing sellable", async () => {
    const res = await createProduct(
      menuBody({
        comboSlots: [
          { name: "Dessert", quantity: 1, sortOrder: 0, sourceCategoryId: ids.empty, choices: [], optionRules: [] },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("aucun produit disponible");
  });

  it("refuses a filler that is not in the component's own category", async () => {
    const res = await createProduct(
      menuBody({
        comboSlots: [
          {
            name: "Dessert",
            quantity: 1,
            sortOrder: 0,
            sourceCategoryId: ids.empty,
            choices: [{ productId: ids.regina, surcharge: 0, sortOrder: 0 }],
            optionRules: [],
          },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("n'est pas dans");
  });

  it("refuses a pinned choice that belongs to another group", async () => {
    // The pin would then apply to nothing, the component would silently be
    // worth its base price, and the allocation would be wrong with nobody told.
    const res = await createProduct(
      menuBody({
        comboSlots: [
          {
            name: "Pizza",
            quantity: 1,
            sortOrder: 0,
            sourceCategoryId: ids.pizzas,
            choices: [],
            optionRules: [{ categoryOptionGroupId: ids.taille, categoryOptionChoiceId: ids.autreChoix }],
          },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("n'appartient pas à");
  });

  it("accepts a rule with NO pinned choice — « governed, and not asked »", async () => {
    const res = await createProduct(
      menuBody({
        comboSlots: [
          {
            name: "Pizza",
            quantity: 1,
            sortOrder: 0,
            sourceCategoryId: ids.pizzas,
            choices: [],
            optionRules: [{ categoryOptionGroupId: ids.taille, categoryOptionChoiceId: null }],
          },
        ],
      }),
    );
    expect(res.status, res.body.error).toBe(201);
  });

  it("refuses a menu with no components, and writes nothing", async () => {
    const res = await createProduct(menuBody({ comboSlots: [] }));
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("au moins un composant");
    expect(await db.product.count({ where: { name: "Menu Test" } })).toBe(0);
  });

  it("still saves an ordinary product, with no slots and isCombo false", async () => {
    const res = await createProduct({
      name: "Tiramisu",
      price: 350,
      vatRate: 10,
      categoryId: ids.sauceTomate,
    });
    expect(res.status, res.body.error).toBe(201);
    expect(res.body.isCombo).toBe(false);
    expect(res.body.comboSlots).toEqual([]);
  });
});

describe("PUT /api/catalog/products/[id] — an absent field leaves the slots alone (C-24's rule)", () => {
  async function put(id: string, body: Record<string, unknown>) {
    const mod = await import("@/app/api/catalog/products/[id]/route");
    // The harness passes `params` itself — no wrapper, so the test drives the
    // exported handler exactly as Next would.
    return callJson<{ error?: string }>(mod.PUT, {
      method: "PUT",
      url: `http://localhost/api/catalog/products/${id}`,
      params: { id },
      body,
    });
  }

  it("does NOT wipe a menu's slots when the update omits them", async () => {
    const created = await createProduct(menuBody());
    expect(created.status, created.body.error).toBe(201);
    const id = created.body.id!;
    expect(await db.comboSlot.count({ where: { productId: id } })).toBe(1);

    // A partial update — a price change, no `comboSlots` field.
    const res = await put(id, {
      name: "Menu Test",
      price: 2590,
      vatRate: 10,
      categoryId: ids.sauceTomate,
      isCombo: true,
    });
    expect(res.status, res.body.error).toBe(200);
    // THE POINT. A wiped menu keeps selling — at its forfait, under the
    // higher-rate fallback — and nothing on screen says so.
    expect(await db.comboSlot.count({ where: { productId: id } })).toBe(1);
    expect((await db.product.findUnique({ where: { id } }))!.price).toBe(2590);
  });

  it("replaces them wholesale when the update DOES send them", async () => {
    const created = await createProduct(menuBody());
    const id = created.body.id!;
    const res = await put(id, {
      ...menuBody(),
      comboSlots: [
        { name: "Pizza", quantity: 3, sortOrder: 0, sourceCategoryId: ids.pizzas, choices: [], optionRules: [] },
      ],
    });
    expect(res.status, res.body.error).toBe(200);
    const slots = await db.comboSlot.findMany({ where: { productId: id } });
    expect(slots).toHaveLength(1);
    expect(slots[0].quantity).toBe(3);
  });

  it("refuses to turn a product into a menu with no components", async () => {
    const res = await put(ids.regina, {
      name: "Regina",
      price: 890,
      vatRate: 10,
      categoryId: ids.sauceTomate,
      isCombo: true,
      comboSlots: [],
    });
    expect(res.status).toBe(400);
    expect((await db.product.findUnique({ where: { id: ids.regina } }))!.isCombo).toBe(false);
  });
});
