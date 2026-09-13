import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { hashPin } from "@/lib/auth";
import { saveSettings } from "@/lib/services/settings";
import { splitVat, sum2 } from "@/lib/money";

// Batch 5.9d — what a menu composé actually BOOKS.
//
// WHY THIS FILE EXISTS SEPARATELY FROM `combo-allocation.test.ts`, and it is
// this project's most expensively learned lesson, repeated on purpose. That
// file proves `allocateCombo` divides a forfait correctly. It would go on
// passing if `orders/route.ts` never called it, or called it with the wrong
// order type, or threw the result away — which is exactly the defect Batch 5.8
// shipped and Batch 3.12 shipped again, both caught only by reverting the
// WIRING rather than the logic.
//
// `OrderItem.vatRate`, `OrderItem.lineTotal` and the `Order.vatTotal` sealed
// beside them are what every fiscal report reads. The only claim that matters
// is what this route WRITES, so everything below is asserted from the database
// after a real POST.
//
// THE CATALOGUE HERE MIRRORS THE REAL ONE, measured read-only 2026-09-09:
// pizza sizes are CATEGORY option choices carrying ABSOLUTE prices, drinks
// carry 10 % / 5,5 % on their container category (L-68, Batch 3.12), and the
// menu is a product under a child of Pizzas — which is why « a combo may never
// fill a slot » is not hypothetical.

const PIN = "551133";

let ids: {
  pizzas: string;
  sauceTomate: string;
  bouteilles: string;
  menuCat: string;
  tailleGroup: string;
  junior: string;
  senior: string;
  mega: string;
  regina: string;
  margarita: string;
  coca: string;
  orangina: string;
  oeuf: string;
  menuChill: string;
  pizzaSlot: string;
  drinkSlot: string;
  customer: string;
};

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
  await db.comboSlotOptionRule.deleteMany();
  await db.comboSlotChoice.deleteMany();
  await db.comboSlot.deleteMany();
  await db.product.deleteMany();
  await db.categoryOptionChoice.deleteMany();
  await db.categoryOptionGroup.deleteMany();
  await db.categoryAddOn.deleteMany();
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
      username: `b59-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin(PIN),
    },
  });

  const pizzas = await db.category.create({ data: { name: "Pizzas", color: "#f00", sortOrder: 1 } });
  const sauceTomate = await db.category.create({
    data: { name: "Sauce Tomate", color: "#f00", sortOrder: 2, parentId: pizzas.id },
  });
  const menuCat = await db.category.create({
    data: { name: "Menu", color: "#f00", sortOrder: 3, parentId: pizzas.id },
  });
  const boissons = await db.category.create({ data: { name: "Boissons", color: "#00f", sortOrder: 4 } });
  const bouteilles = await db.category.create({
    data: {
      name: "Bouteilles",
      color: "#00f",
      sortOrder: 5,
      parentId: boissons.id,
      vatRate: 10,
      vatRateTakeaway: 5.5,
    },
  });

  // « Taille » — a REQUIRED category group with absolute prices, exactly as on
  // production. Junior 8,90 / Senior 11,90 / Mega 15,90 à emporter; 9,90 /
  // 13,50 / 18,90 en livraison.
  const taille = await db.categoryOptionGroup.create({
    data: { categoryId: pizzas.id, name: "Taille", required: true, multiple: false, sortOrder: 0 },
  });
  const junior = await db.categoryOptionChoice.create({
    data: { groupId: taille.id, name: "Junior", pickupPrice: 890, deliveryPrice: 990, sortOrder: 0 },
  });
  const senior = await db.categoryOptionChoice.create({
    data: { groupId: taille.id, name: "Senior", pickupPrice: 1190, deliveryPrice: 1350, sortOrder: 1 },
  });
  const mega = await db.categoryOptionChoice.create({
    data: { groupId: taille.id, name: "Mega", pickupPrice: 1590, deliveryPrice: 1890, sortOrder: 2 },
  });
  const oeuf = await db.categoryAddOn.create({
    data: { categoryId: pizzas.id, name: "Oeuf", price: 150, active: true },
  });

  const product = (name: string, categoryId: string, price: number, delivery: number, over = {}) =>
    db.product.create({
      data: {
        name,
        categoryId,
        price,
        pickupPrice: price,
        deliveryPrice: delivery,
        vatRate: 10,
        inheritCategoryVat: true,
        active: true,
        available: true,
        ...over,
      },
    });

  const regina = await product("Regina", sauceTomate.id, 890, 990);
  const margarita = await product("Margarita", sauceTomate.id, 890, 990);
  const coca = await product("Coca", bouteilles.id, 350, 350);
  const orangina = await product("Orangina", bouteilles.id, 350, 350);

  // The menu itself: a product under `Menu`, a child of `Pizzas`. 24,90 sur
  // place and à emporter, 28,90 en livraison.
  const menuChill = await db.product.create({
    data: {
      name: "Menu Chill",
      categoryId: menuCat.id,
      price: 2490,
      pickupPrice: 2490,
      deliveryPrice: 2890,
      vatRate: 10,
      inheritCategoryVat: false,
      isCombo: true,
      active: true,
      available: true,
    },
  });

  const pizzaSlot = await db.comboSlot.create({
    data: { productId: menuChill.id, name: "Pizza", quantity: 2, sortOrder: 0, sourceCategoryId: pizzas.id },
  });
  // The menu answers « Taille » itself — the cashier picks only WHICH pizza.
  await db.comboSlotOptionRule.create({
    data: { slotId: pizzaSlot.id, categoryOptionGroupId: taille.id, categoryOptionChoiceId: senior.id },
  });
  const drinkSlot = await db.comboSlot.create({
    data: { productId: menuChill.id, name: "Boisson", quantity: 1, sortOrder: 1, sourceCategoryId: bouteilles.id },
  });

  const cust = await db.customer.create({
    data: { name: "Client Test", phone: "0600000000", address: "1 rue du Test" },
  });

  await db.shift.create({
    data: { number: 1, openedById: u.id, openedAt: new Date(), openingFloat: 0, status: "OPEN" },
  });
  await signInAs({ id: u.id, username: u.username, role: "MANAGER" });

  ids = {
    pizzas: pizzas.id,
    sauceTomate: sauceTomate.id,
    bouteilles: bouteilles.id,
    menuCat: menuCat.id,
    tailleGroup: taille.id,
    junior: junior.id,
    senior: senior.id,
    mega: mega.id,
    regina: regina.id,
    margarita: margarita.id,
    coca: coca.id,
    orangina: orangina.id,
    oeuf: oeuf.id,
    menuChill: menuChill.id,
    pizzaSlot: pizzaSlot.id,
    drinkSlot: drinkSlot.id,
    customer: cust.id,
  };
});

afterAll(wipe);

type Body = Record<string, unknown>;
async function post(body: Body) {
  const mod = await import("@/app/api/orders/route");
  return callJson<{ error?: string; id?: string; number?: number }>(mod.POST, {
    method: "POST",
    url: "http://localhost/api/orders",
    body,
  });
}

/** Ring one Menu Chill, with the two pizzas and the bottle. */
function menuIntent(over: Partial<Record<string, unknown>> = {}) {
  return {
    productId: ids.menuChill,
    quantity: 1,
    optionIds: [],
    addons: [],
    components: [
      { slotId: ids.pizzaSlot, productId: ids.regina, optionIds: [], addons: [] },
      { slotId: ids.pizzaSlot, productId: ids.margarita, optionIds: [], addons: [] },
      { slotId: ids.drinkSlot, productId: ids.coca, optionIds: [], addons: [] },
    ],
    ...over,
  };
}

async function sellMenu(
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON",
  amount: number,
  item: Record<string, unknown> = menuIntent(),
) {
  return post({
    orderType,
    items: [item],
    payments: [{ method: "CASH", amount }],
    ...(orderType === "LIVRAISON" ? { customerId: ids.customer } : {}),
  });
}

/** Every line of the most recent order, in insertion order. */
async function booked() {
  const order = await db.order.findFirst({ orderBy: { createdAt: "desc" }, include: { items: true } });
  return { order: order!, lines: order!.items };
}

describe("POST /api/orders — a menu books one line per component", () => {
  it("SUR PLACE: three lines, all 10 %, summing to 24,90", async () => {
    const res = await sellMenu("DINE_IN", 2490);
    expect(res.status, res.body.error).toBe(201);

    const { order, lines } = await booked();
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.productName)).toEqual(["Regina", "Margarita", "Coca"]);
    expect(lines.map((l) => l.vatRate)).toEqual([10, 10, 10]);
    // apportion([1190, 1190, 350], 2490) — the Seniors are 11,90 because the
    // MENU pinned the size; the cashier was never asked.
    expect(lines.map((l) => l.unitPrice)).toEqual([1086, 1085, 319]);
    expect(sum2(lines.map((l) => l.lineTotal))).toBe(2490);
    expect(order.total).toBe(2490);
    // § 5 of the policy, sur place: one bucket, HT 22,63, TVA 2,27.
    expect(order.vatTotal).toBe(227);
    expect(sum2(lines.map((l) => l.lineHt ?? 0))).toBe(2263);
  });

  it("À EMPORTER: the drink drops to 5,5 % and nothing else moves", async () => {
    const res = await sellMenu("TAKEAWAY", 2490);
    expect(res.status, res.body.error).toBe(201);

    const { order, lines } = await booked();
    expect(lines.map((l) => l.vatRate)).toEqual([10, 10, 5.5]);
    expect(lines.map((l) => l.unitPrice)).toEqual([1086, 1085, 319]);
    // Policy § 5: base 10 % = 21,71 (HT 19,73), base 5,5 % = 3,19 (HT 3,02).
    expect(lines[0].lineTotal + lines[1].lineTotal).toBe(2171);
    expect(lines[2].lineTotal).toBe(319);
    expect(splitVat(319, 5.5).ht).toBe(302);
    expect(order.vatTotal).toBe(215);
  });

  it("EN LIVRAISON: the forfait is 28,90 and the weights are the delivery prices", async () => {
    const res = await sellMenu("LIVRAISON", 2890);
    expect(res.status, res.body.error).toBe(201);

    const { order, lines } = await booked();
    // Reference 13,50 + 13,50 + 3,50 = 30,50 → apportion against 28,90.
    expect(lines.map((l) => l.unitPrice)).toEqual([1279, 1279, 332]);
    expect(lines.map((l) => l.vatRate)).toEqual([10, 10, 5.5]);
    expect(sum2(lines.map((l) => l.lineTotal))).toBe(2890);
    expect(order.vatTotal).toBe(249);
  });

  it("ties the lines together — group id, menu name and forfait on every one", async () => {
    await sellMenu("TAKEAWAY", 2490);
    const { lines } = await booked();
    const groups = new Set(lines.map((l) => l.comboGroupId));
    expect(groups.size).toBe(1);
    expect([...groups][0]).toBeTruthy();
    expect(lines.map((l) => l.comboName)).toEqual(["Menu Chill", "Menu Chill", "Menu Chill"]);
    expect(lines.map((l) => l.comboPrice)).toEqual([2490, 2490, 2490]);
  });

  it("keeps Batch 3.11's invariant: Σ (lineNetTotal − lineHt) === order.vatTotal", async () => {
    await sellMenu("TAKEAWAY", 2490);
    const { order, lines } = await booked();
    for (const l of lines) {
      expect(l.lineHt).toBe(Math.round((l.lineNetTotal ?? 0) / (1 + (l.vatRate ?? 0) / 100)));
    }
    expect(sum2(lines.map((l) => (l.lineNetTotal ?? 0) - (l.lineHt ?? 0)))).toBe(order.vatTotal);
    expect(sum2(lines.map((l) => l.lineNetTotal ?? 0))).toBe(order.total);
  });

  it("counts the menu as ONE article, not as its components", async () => {
    await sellMenu("DINE_IN", 2490);
    const { order } = await booked();
    expect(order.itemCount).toBe(1);
  });

  it("multiplies by the quantity without re-allocating", async () => {
    const res = await sellMenu("DINE_IN", 4980, menuIntent({ quantity: 2 }));
    expect(res.status, res.body.error).toBe(201);
    const { order, lines } = await booked();
    expect(lines.map((l) => l.quantity)).toEqual([2, 2, 2]);
    // The shares are the same integers as for one menu — allocated per UNIT.
    expect(lines.map((l) => l.unitPrice)).toEqual([1086, 1085, 319]);
    expect(lines.map((l) => l.lineTotal)).toEqual([2172, 2170, 638]);
    expect(order.total).toBe(4980);
    expect(order.itemCount).toBe(2);
  });

  it("records each component's own configuration, so the kitchen learns what to make", async () => {
    // The gap the batch opened on: « tapping one drops a single line in the
    // basket and asks nothing, so the kitchen never learns which pizzas were
    // ordered ». Two DIFFERENT pizzas, two rows, both named.
    await sellMenu("DINE_IN", 2490);
    const { lines } = await booked();
    expect(lines[0].productId).toBe(ids.regina);
    expect(lines[1].productId).toBe(ids.margarita);
    const opts = JSON.parse(lines[0].optionsJson!) as { group: string; choice: string }[];
    expect(opts).toEqual([{ group: "Taille", choice: "Senior", priceModifier: 300 }]);
  });
});

describe("POST /api/orders — supplements ride on top of the forfait (policy § 6)", () => {
  it("charges an add-on above the menu price, at its component's rate, outside the allocation", async () => {
    const withEgg = menuIntent();
    (withEgg.components as Record<string, unknown>[])[0].addons = [{ addonId: ids.oeuf, quantity: 1 }];
    const res = await sellMenu("TAKEAWAY", 2490 + 150, withEgg);
    expect(res.status, res.body.error).toBe(201);

    const { order, lines } = await booked();
    expect(order.total).toBe(2640);
    // The shares are UNCHANGED — the allocation base is the menu price alone.
    expect(lines[1].unitPrice).toBe(1085);
    expect(lines[2].unitPrice).toBe(319);
    // …and the 1,50 € sits on the pizza that carries it, at 10 %.
    expect(lines[0].unitPrice).toBe(1086 + 150);
    expect(lines[0].vatRate).toBe(10);
    // CHANGED 2026-09-13 (R8.5, L-127): the snapshot carries the QUANTITY now.
    // It was charged and dropped, so `addOnsJson` — what the ticket and the
    // archive read — could not reproduce a line whose quantity exceeded 1.
    // Menu components take the same pricing path, so they gain it too.
    expect(JSON.parse(lines[0].addOnsJson!)).toEqual([
      { id: ids.oeuf, name: "Oeuf", price: 150, quantity: 1 },
    ]);
    // Σ shares is still exactly the forfait.
    expect(sum2(lines.map((l) => l.unitPrice)) - 150).toBe(2490);
  });

  it("charges a slot surcharge — the operator's +1,50 € Frite Cheddar shape", async () => {
    // The Duo's frite slot in miniature: a whitelist where one filler costs
    // more than the other. Both fillers here cost 3,50 at catalogue, so the
    // ALLOCATION is identical either way and the only difference in the booked
    // rows is the 1,50 € — which is what isolates the surcharge.
    //
    // The figure is the operator's ruling of 2026-09-09 and could not be
    // derived: standalone, Frite is 3,50 and Frite Cheddar 4,90, a difference
    // of 1,40, and the ruling is 1,50.
    await db.comboSlotChoice.createMany({
      data: [
        { slotId: ids.drinkSlot, productId: ids.coca, surcharge: 0, sortOrder: 0 },
        { slotId: ids.drinkSlot, productId: ids.orangina, surcharge: 150, sortOrder: 1 },
      ],
    });
    const intent = menuIntent();
    (intent.components as Record<string, unknown>[])[2].productId = ids.orangina;
    const res = await sellMenu("TAKEAWAY", 2490 + 150, intent);
    expect(res.status, res.body.error).toBe(201);

    const { order, lines } = await booked();
    expect(order.total).toBe(2640);
    expect(lines[2].productName).toBe("Orangina");
    // The shares are the SAME as the plain Coca menu — a surcharge is outside
    // the allocation (§ 6), so it cannot move the forfait around.
    expect(lines.map((l) => l.unitPrice)).toEqual([1086, 1085, 319 + 150]);
    expect(sum2(lines.map((l) => l.unitPrice)) - 150).toBe(2490);
    // …and it takes its own component's rate, which à emporter is 5,5 %.
    expect(lines[2].vatRate).toBe(5.5);
  });

  it("refuses a filler outside the whitelist once one exists", async () => {
    await db.comboSlotChoice.create({
      data: { slotId: ids.drinkSlot, productId: ids.coca, surcharge: 0, sortOrder: 0 },
    });
    const intent = menuIntent();
    (intent.components as Record<string, unknown>[])[2].productId = ids.orangina;
    const res = await sellMenu("TAKEAWAY", 2490, intent);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("n'est pas proposé pour");
  });
});

describe("POST /api/orders — what a menu refuses", () => {
  it("refuses a composition with the wrong number of choices", async () => {
    const short = menuIntent();
    (short.components as unknown[]).pop();
    const res = await sellMenu("DINE_IN", 2490, short);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("3 choix attendus, 2 reçus");
    expect(await db.order.count()).toBe(0);
  });

  it("refuses a composition whose choices answer the wrong slots", async () => {
    const shuffled = menuIntent();
    const comps = shuffled.components as Record<string, unknown>[];
    [comps[0], comps[2]] = [comps[2], comps[0]];
    const res = await sellMenu("DINE_IN", 2490, shuffled);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("ne correspond pas");
    expect(await db.order.count()).toBe(0);
  });

  it("refuses a product the slot does not draw from", async () => {
    const wrong = menuIntent();
    (wrong.components as Record<string, unknown>[])[0].productId = ids.coca;
    const res = await sellMenu("DINE_IN", 2490, wrong);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("n'est pas proposé pour");
  });

  it("REFUSES A COMBO INSIDE A COMBO, even though the menu sits in the slot's own tree", async () => {
    // `Menu Chill` is in `Menu`, a child of `Pizzas`, and the pizza slot draws
    // from the whole `Pizzas` tree — so nothing but `isCombo` stops the menu
    // offering itself. This is the operator's ruling, and it is why the check
    // is on the product rather than on the category.
    const nested = menuIntent();
    (nested.components as Record<string, unknown>[])[0].productId = ids.menuChill;
    const res = await sellMenu("DINE_IN", 2490, nested);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("n'est pas proposé pour");
    expect(await db.order.count()).toBe(0);
  });

  it("refuses a composition attached to a product that is not a menu", async () => {
    const res = await sellMenu("DINE_IN", 890, {
      productId: ids.regina,
      quantity: 1,
      optionIds: [ids.junior],
      addons: [],
      components: [{ slotId: ids.pizzaSlot, productId: ids.coca, optionIds: [], addons: [] }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("n'est pas un menu composé");
  });

  it("refuses a menu sent with no composition at all", async () => {
    const res = await sellMenu("DINE_IN", 2490, {
      productId: ids.menuChill,
      quantity: 1,
      optionIds: [],
      addons: [],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("3 choix attendus, 0 reçus");
  });

  it("refuses a component that is 86'd, exactly as an ordinary line is", async () => {
    await db.product.update({ where: { id: ids.coca }, data: { available: false } });
    const res = await sellMenu("DINE_IN", 2490);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("introuvable ou indisponible");
  });
});

describe("POST /api/orders — the higher-rate fallback (policy § 4)", () => {
  it("books the WHOLE forfait at 10 % when no component has a reference price", async () => {
    await db.product.updateMany({
      where: { id: { in: [ids.regina, ids.margarita, ids.coca] } },
      data: { price: 0, pickupPrice: 0, deliveryPrice: 0 },
    });
    // The size pin has to go too, or the Seniors would still be worth 11,90 and
    // the menu would allocate normally. The RULE stays, with a null choice:
    // « governed, and not asked ». Deleting it outright would hand the
    // cashier's own required `Taille` group back and the sale would be refused
    // for a missing option — which is correct, and is not what this is testing.
    await db.comboSlotOptionRule.updateMany({
      where: { slotId: ids.pizzaSlot },
      data: { categoryOptionChoiceId: null },
    });

    const res = await sellMenu("TAKEAWAY", 2490);
    expect(res.status, res.body.error).toBe(201);

    const { order, lines } = await booked();
    expect(lines).toHaveLength(1);
    expect(lines[0].productName).toBe("Menu Chill");
    expect(lines[0].vatRate).toBe(10);
    expect(lines[0].lineTotal).toBe(2490);
    expect(order.vatTotal).toBe(splitVat(2490, 10).vat);
    // MAJORER, JAMAIS MINORER: à emporter the drink would have been 5,5 %.
    // The fallback taxes the lot at 10 % instead, which is the higher rate.
    expect(lines[0].vatRate).toBeGreaterThan(5.5);
  });

  it("keeps the composition on the fallback line, so the ticket still names it", async () => {
    await db.product.updateMany({
      where: { id: { in: [ids.regina, ids.margarita, ids.coca] } },
      data: { price: 0, pickupPrice: 0, deliveryPrice: 0 },
    });
    await db.comboSlotOptionRule.updateMany({
      where: { slotId: ids.pizzaSlot },
      data: { categoryOptionChoiceId: null },
    });
    await sellMenu("DINE_IN", 2490);
    const { lines } = await booked();
    const parsed = JSON.parse(lines[0].optionsJson!) as { group: string; choice: string }[];
    expect(parsed.map((p) => p.choice)).toEqual(["Regina", "Margarita", "Coca"]);
    expect(lines[0].comboName).toBe("Menu Chill");
    expect(lines[0].comboPrice).toBe(2490);
  });

  it("sells a menu with NO slots at its forfait rather than refusing the sale", async () => {
    // Policy § 4 lists « composition incomplète » as a fallback trigger, not as
    // a refusal. A catalogue mistake must not stop the till trading.
    await db.comboSlot.deleteMany({ where: { productId: ids.menuChill } });
    const res = await sellMenu("TAKEAWAY", 2490, {
      productId: ids.menuChill,
      quantity: 1,
      optionIds: [],
      addons: [],
    });
    expect(res.status, res.body.error).toBe(201);
    const { lines } = await booked();
    expect(lines).toHaveLength(1);
    expect(lines[0].vatRate).toBe(10);
    expect(lines[0].lineTotal).toBe(2490);
  });
});

describe("POST /api/orders — a governed group is not asked, an ungoverned one still is", () => {
  it("does not ask the size the menu pins, and prices it at the pinned size", async () => {
    await sellMenu("TAKEAWAY", 2490);
    const { lines } = await booked();
    // No `optionIds` were sent for either pizza, and both are Seniors.
    expect(JSON.parse(lines[0].optionsJson!)).toEqual([
      { group: "Taille", choice: "Senior", priceModifier: 300 },
    ]);
    expect(lines[0].unitPrice + lines[1].unitPrice).toBe(2171); // the 11,90 weights
  });

  it("governs the size WITHOUT pinning it — asked by nobody, worth the base price", async () => {
    // The shape the Duo needs: every burger inherits a REQUIRED `Frite` group
    // from `Burgers`, and a Duo answers it once with its own frite slot rather
    // than twice through its two burgers. A rule with a null choice is that
    // « do not ask this » — and the component is then worth its plain
    // catalogue price.
    await db.comboSlotOptionRule.updateMany({
      where: { slotId: ids.pizzaSlot },
      data: { categoryOptionChoiceId: null },
    });
    const res = await sellMenu("TAKEAWAY", 2490);
    expect(res.status, res.body.error).toBe(201);
    const { lines } = await booked();
    expect(lines[0].optionsJson).toBeNull();
    // Reference is now 8,90 + 8,90 + 3,50 = 21,30 rather than 27,30, so the
    // drink's share GROWS — the weights really are what drives the split.
    expect(lines[2].unitPrice).toBeGreaterThan(319);
    expect(sum2(lines.map((l) => l.unitPrice))).toBe(2490);
  });

  it("still refuses a component whose required group the menu does NOT govern", async () => {
    // A slot that governs nothing leaves the component's own required groups
    // in force. This is the refusal that caught a contrived fixture while this
    // file was being written, and it is the correct answer: a pizza with no
    // size is not sellable inside a menu either.
    const bare = await db.comboSlot.create({
      data: { productId: ids.menuChill, name: "Extra", quantity: 1, sortOrder: 2, sourceCategoryId: ids.pizzas },
    });
    const intent = menuIntent();
    (intent.components as Record<string, unknown>[]).push({
      slotId: bare.id,
      productId: ids.regina,
      optionIds: [],
      addons: [],
    });
    const res = await sellMenu("DINE_IN", 2490, intent);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Option obligatoire manquante : Taille");
  });
});

describe("POST /api/orders — an ordinary sale is untouched by any of this", () => {
  it("still books a single line at the product's own resolved rate", async () => {
    const res = await sellMenu("TAKEAWAY", 350, {
      productId: ids.coca,
      quantity: 1,
      optionIds: [],
      addons: [],
    });
    expect(res.status, res.body.error).toBe(201);
    const { lines } = await booked();
    expect(lines).toHaveLength(1);
    expect(lines[0].vatRate).toBe(5.5); // L-68 — still true
    expect(lines[0].comboGroupId).toBeNull();
    expect(lines[0].comboName).toBeNull();
    expect(lines[0].comboPrice).toBeNull();
  });

  it("still refuses a pizza with no size — a REQUIRED group outside a menu", async () => {
    const res = await sellMenu("TAKEAWAY", 890, {
      productId: ids.regina,
      quantity: 1,
      optionIds: [],
      addons: [],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Option obligatoire manquante");
  });
});
