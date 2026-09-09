import { describe, it, expect } from "vitest";
import {
  builderSeats,
  seatLabel,
  slotProducts,
  slotCategoryIds,
  askedGroups,
  pinnedChoiceIds,
  componentReferencePrice,
  buildComponent,
  menuForfait,
  fixedFiller,
  fillerSurcharge,
} from "@/lib/combo-builder";
import type { CategoryDto, ComboSlotDto, ProductDto } from "@/types/api";

// Batch 5.9c — the slot-by-slot flow, decided here rather than in the dialog.
//
// WHY IT IS NOT IN THE COMPONENT. M-19 (Batch 5.7c) was a mapping that lived
// inside `product-options-dialog-v2.tsx` and could not be exercised: the
// store's tests built a `CartItem` by hand and missed the defect precisely
// because they bypassed the component. The batch's own criterion was a test
// "built through the options dialog's own mapping". Same treatment here.

const cat = (id: string, name: string, parentId: string | null = null): CategoryDto =>
  ({ id, name, color: "#fff", sortOrder: 0, active: true, parentId, children: [] }) as unknown as CategoryDto;

const CATEGORIES = [
  cat("pizzas", "Pizzas"),
  cat("sauce-tomate", "Sauce Tomate", "pizzas"),
  cat("menu", "Menu", "pizzas"),
  cat("burgers", "Burgers"),
  cat("croustillants", "Croustillants"),
  cat("canette", "Canette"),
];

const TAILLE = {
  id: "g-taille",
  name: "Taille",
  required: true,
  multiple: false,
  sortOrder: 0,
  inherited: true,
  choices: [
    { id: "c-junior", name: "Junior", priceModifier: 0, pickupPriceModifier: 0, deliveryPriceModifier: 0, pickupPrice: 890, deliveryPrice: 990, image: null, sortOrder: 0 },
    { id: "c-senior", name: "Senior", priceModifier: 300, pickupPriceModifier: 300, deliveryPriceModifier: 360, pickupPrice: 1190, deliveryPrice: 1350, image: null, sortOrder: 1 },
  ],
};
const CRUDITES = {
  id: "g-crudites",
  name: "Crudités",
  required: true,
  multiple: true,
  sortOrder: 1,
  inherited: true,
  choices: [
    { id: "c-salade", name: "Salade", priceModifier: 0, pickupPriceModifier: null, deliveryPriceModifier: null, pickupPrice: null, deliveryPrice: null, image: null, sortOrder: 0 },
    { id: "c-sans", name: "Sans Crudités", priceModifier: 0, pickupPriceModifier: null, deliveryPriceModifier: null, pickupPrice: null, deliveryPrice: null, image: null, sortOrder: 1 },
  ],
};
const FRITE_GROUP = {
  id: "g-frite",
  name: "Frite",
  required: true,
  multiple: false,
  sortOrder: 2,
  inherited: true,
  choices: [
    { id: "c-frite", name: "Frite", priceModifier: 0, pickupPriceModifier: null, deliveryPriceModifier: null, pickupPrice: null, deliveryPrice: null, image: null, sortOrder: 0 },
    { id: "c-cheddar", name: "Frite Cheddar", priceModifier: 150, pickupPriceModifier: null, deliveryPriceModifier: null, pickupPrice: null, deliveryPrice: null, image: null, sortOrder: 1 },
  ],
};

const product = (over: Partial<ProductDto>): ProductDto =>
  ({
    id: "p",
    name: "P",
    description: null,
    price: 890,
    pickupPrice: 890,
    deliveryPrice: 990,
    vatRate: 10,
    categoryId: "sauce-tomate",
    image: null,
    active: true,
    available: true,
    inheritCategoryGlobals: true,
    inheritCategoryVat: true,
    effectiveVatRate: 10,
    sortOrder: 0,
    options: [],
    addOns: [],
    isCombo: false,
    comboSlots: [],
    ...over,
  }) as ProductDto;

const PRODUCTS: ProductDto[] = [
  product({ id: "regina", name: "Regina", options: [TAILLE], sortOrder: 1 }),
  product({ id: "margarita", name: "Margarita", options: [TAILLE], sortOrder: 0 }),
  product({ id: "cheeseburger", name: "Cheeseburger", categoryId: "burgers", price: 690, pickupPrice: 690, deliveryPrice: 790, options: [CRUDITES, FRITE_GROUP] }),
  product({ id: "frite", name: "Frite", categoryId: "croustillants", price: 350, pickupPrice: 350, deliveryPrice: 350 }),
  product({ id: "cheddar", name: "Frite Cheddar", categoryId: "croustillants", price: 490, pickupPrice: 490, deliveryPrice: 490 }),
  product({ id: "coca", name: "Coca", categoryId: "canette", price: 150, pickupPrice: 150, deliveryPrice: 150 }),
  // The menu itself, sitting under `Menu`, a child of `Pizzas`.
  product({ id: "menu-eco", name: "Menu Eco", categoryId: "menu", price: 2490, isCombo: true }),
  product({ id: "inactif", name: "Retiré", categoryId: "croustillants", active: false }),
  product({ id: "epuise", name: "Épuisé", categoryId: "croustillants", available: false }),
];

const slot = (over: Partial<ComboSlotDto>): ComboSlotDto => ({
  id: "s",
  name: "Composant",
  quantity: 1,
  sortOrder: 0,
  sourceCategoryId: "pizzas",
  choices: [],
  optionRules: [],
  ...over,
});

describe("seats — one question per component", () => {
  it("turns a quantity-2 slot into two seats and labels them apart", () => {
    const seats = builderSeats([slot({ id: "burger", name: "Burger", quantity: 2 })]);
    expect(seats).toHaveLength(2);
    expect(seats.map(seatLabel)).toEqual(["Burger 1 / 2", "Burger 2 / 2"]);
  });

  it("does not number a slot that takes one", () => {
    expect(seatLabel(builderSeats([slot({ name: "Boisson" })])[0])).toBe("Boisson");
  });

  it("asks the slots in their configured order", () => {
    const seats = builderSeats([
      slot({ id: "c", name: "Boisson", sortOrder: 2 }),
      slot({ id: "a", name: "Burger", quantity: 2, sortOrder: 0 }),
      slot({ id: "b", name: "Frite", sortOrder: 1 }),
    ]);
    expect(seats.map((s) => s.slot.name)).toEqual(["Burger", "Burger", "Frite", "Boisson"]);
  });
});

describe("what a slot offers", () => {
  it("offers the whole source tree when there is no whitelist", () => {
    const offered = slotProducts(slot({ sourceCategoryId: "pizzas" }), PRODUCTS, CATEGORIES);
    expect(offered.map((p) => p.name)).toEqual(["Margarita", "Regina"]); // sortOrder, then name
  });

  it("NEVER OFFERS A MENU, even though Menu Eco is in the Pizzas tree", () => {
    // `Menu` is a child of `Pizzas`, so an « any pizza » slot reaches it. The
    // server refuses it too; this is what stops the cashier being shown a
    // choice that cannot be rung.
    expect(slotCategoryIds(slot({ sourceCategoryId: "pizzas" }), CATEGORIES).has("menu")).toBe(true);
    const offered = slotProducts(slot({ sourceCategoryId: "pizzas" }), PRODUCTS, CATEGORIES);
    expect(offered.map((p) => p.id)).not.toContain("menu-eco");
  });

  it("hides a product that is inactive or 86'd", () => {
    const offered = slotProducts(slot({ sourceCategoryId: "croustillants" }), PRODUCTS, CATEGORIES);
    expect(offered.map((p) => p.name)).toEqual(["Frite", "Frite Cheddar"]);
  });

  it("uses the whitelist when there is one, in the operator's order", () => {
    const s = slot({
      sourceCategoryId: "croustillants",
      choices: [
        { productId: "cheddar", surcharge: 150, sortOrder: 0 },
        { productId: "frite", surcharge: 0, sortOrder: 1 },
      ],
    });
    expect(slotProducts(s, PRODUCTS, CATEGORIES).map((p) => p.name)).toEqual(["Frite Cheddar", "Frite"]);
    expect(fillerSurcharge(s, "cheddar")).toBe(150);
    expect(fillerSurcharge(s, "frite")).toBe(0);
  });

  it("a whitelist of ONE is not a question — the Duo's « 2 Burgers Cheese Royal »", () => {
    const s = slot({
      name: "Burger",
      quantity: 2,
      sourceCategoryId: "burgers",
      choices: [{ productId: "cheeseburger", surcharge: 0, sortOrder: 0 }],
    });
    const seats = builderSeats([s]);
    expect(fixedFiller(seats[0], PRODUCTS, CATEGORIES)?.name).toBe("Cheeseburger");
    // …and both seats resolve to it, so each is configured separately.
    expect(fixedFiller(seats[1], PRODUCTS, CATEGORIES)?.name).toBe("Cheeseburger");
  });

  it("a slot with several fillers IS a question", () => {
    const seats = builderSeats([slot({ sourceCategoryId: "croustillants" })]);
    expect(fixedFiller(seats[0], PRODUCTS, CATEGORIES)).toBeNull();
  });
});

describe("what the cashier is asked about a component", () => {
  const regina = PRODUCTS.find((p) => p.id === "regina")!;
  const burger = PRODUCTS.find((p) => p.id === "cheeseburger")!;

  it("does NOT ask the size the menu fixes", () => {
    const s = slot({ optionRules: [{ categoryOptionGroupId: "g-taille", categoryOptionChoiceId: "c-senior" }] });
    expect(askedGroups(s, regina)).toEqual([]);
    expect(pinnedChoiceIds(s)).toEqual(["c-senior"]);
  });

  it("asks it when the menu does not fix it", () => {
    expect(askedGroups(slot({}), regina).map((g) => g.name)).toEqual(["Taille"]);
  });

  it("silences a required group the menu covers with another slot, and asks the rest", () => {
    // The Duo: every burger inherits a REQUIRED « Frite » group from `Burgers`,
    // and the menu has its own frite slot. Without this the cashier is asked
    // for a frite three times and the customer gets three portions.
    const s = slot({
      name: "Burger",
      sourceCategoryId: "burgers",
      optionRules: [{ categoryOptionGroupId: "g-frite", categoryOptionChoiceId: null }],
    });
    expect(askedGroups(s, burger).map((g) => g.name)).toEqual(["Crudités"]);
    expect(pinnedChoiceIds(s)).toEqual([]);
  });
});

describe("the reference price — the allocation weight", () => {
  const regina = PRODUCTS.find((p) => p.id === "regina")!;
  const senior = slot({ optionRules: [{ categoryOptionGroupId: "g-taille", categoryOptionChoiceId: "c-senior" }] });

  it("is the catalogue price at the size the menu fixes, per order type", () => {
    expect(componentReferencePrice(senior, regina, "DINE_IN")).toBe(1190);
    expect(componentReferencePrice(senior, regina, "TAKEAWAY")).toBe(1190);
    expect(componentReferencePrice(senior, regina, "LIVRAISON")).toBe(1350);
  });

  it("is the plain catalogue price when the menu pins nothing", () => {
    expect(componentReferencePrice(slot({}), regina, "TAKEAWAY")).toBe(890);
    expect(componentReferencePrice(slot({}), regina, "LIVRAISON")).toBe(990);
  });

  it("ignores a pin naming a choice this product does not have", () => {
    const stray = slot({ optionRules: [{ categoryOptionGroupId: "g-taille", categoryOptionChoiceId: "c-inconnu" }] });
    expect(componentReferencePrice(stray, regina, "TAKEAWAY")).toBe(890);
  });
});

describe("building a component", () => {
  const burger = PRODUCTS.find((p) => p.id === "cheeseburger")!;
  const s = slot({ id: "burger", name: "Burger", quantity: 2, sourceCategoryId: "burgers" });

  it("carries the slot, the product, its own configuration and its weight", () => {
    const seat = builderSeats([s])[0];
    const c = buildComponent({
      seat,
      product: burger,
      options: [
        { group: "Crudités", choice: "Salade", choiceId: "c-salade", priceModifier: 0, dineInPriceModifier: 0, pickupPriceModifier: null, deliveryPriceModifier: null },
      ],
      addOns: [],
      orderType: "TAKEAWAY",
    });
    expect(c).toMatchObject({
      slotId: "burger",
      slotName: "Burger",
      productId: "cheeseburger",
      productName: "Cheeseburger",
      surcharge: 0,
      referencePrice: 690,
    });
    expect(c.options[0].choice).toBe("Salade");
  });

  it("builds the two seats of one slot independently", () => {
    const [first, second] = builderSeats([s]);
    const withSalad = buildComponent({
      seat: first,
      product: burger,
      options: [
        { group: "Crudités", choice: "Salade", choiceId: "c-salade", priceModifier: 0, dineInPriceModifier: 0, pickupPriceModifier: null, deliveryPriceModifier: null },
      ],
      addOns: [],
      orderType: "DINE_IN",
    });
    const without = buildComponent({
      seat: second,
      product: burger,
      options: [
        { group: "Crudités", choice: "Sans Crudités", choiceId: "c-sans", priceModifier: 0, dineInPriceModifier: 0, pickupPriceModifier: null, deliveryPriceModifier: null },
      ],
      addOns: [],
      orderType: "DINE_IN",
    });
    // THE CASE THE WHOLE BATCH EXISTS FOR.
    expect(withSalad.productId).toBe(without.productId);
    expect(withSalad.options[0].choice).not.toBe(without.options[0].choice);
  });

  it("carries the slot surcharge onto the component", () => {
    const withSurcharge = slot({
      name: "Frite",
      sourceCategoryId: "croustillants",
      choices: [
        { productId: "frite", surcharge: 0, sortOrder: 0 },
        { productId: "cheddar", surcharge: 150, sortOrder: 1 },
      ],
    });
    const seat = builderSeats([withSurcharge])[0];
    const c = buildComponent({
      seat,
      product: PRODUCTS.find((p) => p.id === "cheddar")!,
      options: [],
      addOns: [],
      orderType: "TAKEAWAY",
    });
    expect(c.surcharge).toBe(150);
    // The weight is the CATALOGUE price — § 2 says « les prix à l'unité … tels
    // qu'ils figurent au catalogue » — and the surcharge is separate money.
    expect(c.referencePrice).toBe(490);
  });
});

describe("the forfait", () => {
  const menu = product({ id: "m", name: "Menu Chill", price: 2490, pickupPrice: 2490, deliveryPrice: 2890, isCombo: true });

  it("is the menu's own price for the order type", () => {
    expect(menuForfait(menu, "DINE_IN")).toBe(2490);
    expect(menuForfait(menu, "TAKEAWAY")).toBe(2490);
    expect(menuForfait(menu, "LIVRAISON")).toBe(2890);
  });

  it("falls back to the dine-in price when a mode has none", () => {
    const m = product({ ...menu, pickupPrice: null, deliveryPrice: null });
    expect(menuForfait(m, "LIVRAISON")).toBe(2490);
  });
});
