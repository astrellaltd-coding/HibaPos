import { describe, it, expect, beforeEach } from "vitest";
import {
  useCartStore,
  computeLineTotal,
  computeCartTotals,
  recalculateUnitPrice,
  componentExtras,
  isComboLine,
  type CartComponent,
  type CartItem,
} from "@/store/cart-store";

// Batch 5.9b — the basket can hold a line whose components are configured
// INDEPENDENTLY.
//
// THE STRUCTURAL FACT THIS FILE IS ABOUT. Before this batch `CartItem` held one
// `options` array and one `addOns` array. A Duo contains two burgers, and the
// customer asks for the first with salade and the second without — two
// different configurations of the same product, on one line, at one forfait.
// There was no shape in the store that could hold that: adding the product
// twice gives two lines at two prices, and configuring it once gives both
// burgers the same crudités.
//
// So the tests below are mostly about the two burgers being *different*, and
// about the line still costing the forfait when they are.

const burger = (name: string, crudite: string): CartComponent => ({
  slotId: "burger",
  slotName: "Burger",
  productId: "b1",
  productName: name,
  options: [
    {
      group: "Crudités",
      choice: crudite,
      choiceId: `c-${crudite}`,
      priceModifier: 0,
      dineInPriceModifier: 0,
      pickupPriceModifier: null,
      deliveryPriceModifier: null,
    },
  ],
  addOns: [],
  surcharge: 0,
  referencePrice: 690,
});

const frite = (over: Partial<CartComponent> = {}): CartComponent => ({
  slotId: "frite",
  slotName: "Frite",
  productId: "f1",
  productName: "Frite",
  options: [],
  addOns: [],
  surcharge: 0,
  referencePrice: 350,
  ...over,
});

const canette = (): CartComponent => ({
  slotId: "drink",
  slotName: "Boisson",
  productId: "d1",
  productName: "Coca",
  options: [],
  addOns: [],
  surcharge: 0,
  referencePrice: 150,
});

/** A Duo at 11,90 sur place / à emporter, 13,90 en livraison. */
const duo = (components: CartComponent[], over: Partial<CartItem> = {}): CartItem => ({
  uid: crypto.randomUUID(),
  productId: "duo-cheese",
  productName: "Duo Cheese Royal",
  basePrice: 1190,
  pickupPrice: 1190,
  deliveryPrice: 1390,
  unitPrice: 1190,
  quantity: 1,
  options: [],
  addOns: [],
  components,
  notes: null,
  vatRate: 10,
  ...over,
});

beforeEach(() => {
  useCartStore.setState({ items: [], orderType: "DINE_IN", discountTotal: 0, heldOrders: [] });
});

describe("a menu line holds independently configured components", () => {
  it("carries two burgers configured differently — the case that motivated the batch", () => {
    const line = duo([burger("Cheeseburger", "Salade"), burger("Cheeseburger", "Sans Crudités"), frite(), canette()]);
    useCartStore.getState().addItem(line);

    const stored = useCartStore.getState().items[0];
    expect(stored.components).toHaveLength(4);
    expect(stored.components![0].options[0].choice).toBe("Salade");
    expect(stored.components![1].options[0].choice).toBe("Sans Crudités");
    // Same product, same slot, two configurations. This is the assertion the
    // pre-5.9 shape could not satisfy at all.
    expect(stored.components![0].productId).toBe(stored.components![1].productId);
    expect(stored.components![0].options).not.toEqual(stored.components![1].options);
  });

  it("does NOT merge two menus whose components differ", () => {
    const a = duo([burger("Cheeseburger", "Salade"), burger("Cheeseburger", "Salade"), frite(), canette()]);
    const b = duo([burger("Cheeseburger", "Salade"), burger("Cheeseburger", "Sans Crudités"), frite(), canette()]);
    useCartStore.getState().addItem(a);
    useCartStore.getState().addItem(b);
    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it("DOES merge two identical menus, so the quantity still works", () => {
    const comps = () => [burger("Cheeseburger", "Salade"), burger("Cheeseburger", "Salade"), frite(), canette()];
    useCartStore.getState().addItem(duo(comps()));
    useCartStore.getState().addItem(duo(comps()));
    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  it("distinguishes a menu line from an ordinary one, and an empty array is not a menu", () => {
    expect(isComboLine({ components: [canette()] })).toBe(true);
    expect(isComboLine({ components: [] })).toBe(false);
    expect(isComboLine({ components: undefined })).toBe(false);
  });
});

describe("a menu line costs the forfait, and supplements ride on top", () => {
  it("costs exactly the forfait when nothing is added", () => {
    const line = duo([burger("Cheeseburger", "Salade"), burger("Cheeseburger", "Salade"), frite(), canette()]);
    expect(computeLineTotal(line)).toBe(1190);
  });

  it("adds a slot surcharge — the operator's +1,50 € for a Frite Cheddar", () => {
    const line = duo([
      burger("Cheeseburger", "Salade"),
      burger("Cheeseburger", "Salade"),
      frite({ productName: "Frite Cheddar", productId: "f3", surcharge: 150, referencePrice: 490 }),
      canette(),
    ]);
    expect(computeLineTotal(line)).toBe(1190 + 150);
  });

  it("adds a component's own add-on, and multiplies the lot by the quantity", () => {
    const withEgg = burger("Cheeseburger", "Salade");
    withEgg.addOns = [{ id: "a1", name: "Oeuf", price: 70 }];
    const line = duo([withEgg, burger("Cheeseburger", "Salade"), frite(), canette()], { quantity: 3 });
    expect(computeLineTotal(line)).toBe((1190 + 70) * 3);
  });

  it("counts a component's paid option choice as a supplement too", () => {
    const c = frite();
    c.options = [
      {
        group: "Type de frite",
        choice: "Frite Cheddar",
        choiceId: "x",
        priceModifier: 150,
        dineInPriceModifier: 150,
        pickupPriceModifier: null,
        deliveryPriceModifier: null,
      },
    ];
    expect(componentExtras(c)).toBe(150);
    expect(computeLineTotal(duo([c]))).toBe(1190 + 150);
  });

  it("an ordinary line is untouched by any of this", () => {
    const plain: CartItem = {
      uid: "u",
      productId: "p",
      productName: "Coca",
      basePrice: 150,
      pickupPrice: null,
      deliveryPrice: null,
      unitPrice: 150,
      quantity: 2,
      options: [],
      addOns: [{ id: "a", name: "X", price: 50 }],
      notes: null,
      vatRate: 10,
    };
    expect(plain.components).toBeUndefined();
    expect(computeLineTotal(plain)).toBe((150 + 50) * 2);
  });

  it("a cart mixing a menu and an ordinary line totals both", () => {
    const line = duo([burger("Cheeseburger", "Salade"), frite(), canette()]);
    const plain: CartItem = { ...line, uid: "p", productId: "coca", productName: "Coca", components: undefined, unitPrice: 150, basePrice: 150 };
    expect(computeCartTotals([line, plain], 0)).toEqual({ subtotal: 1190 + 150, total: 1340 });
  });
});

describe("repricing a menu when the order type changes", () => {
  const line = () =>
    duo([
      burger("Cheeseburger", "Salade"),
      burger("Cheeseburger", "Sans Crudités"),
      frite({ surcharge: 150 }),
      canette(),
    ]);

  it("takes the menu's OWN price for the order type, not the components'", () => {
    expect(recalculateUnitPrice(line(), "DINE_IN")).toBe(1190);
    expect(recalculateUnitPrice(line(), "TAKEAWAY")).toBe(1190);
    expect(recalculateUnitPrice(line(), "LIVRAISON")).toBe(1390);
  });

  it("does NOT fold the components' modifiers into the unit price", () => {
    // The trap: falling through to the ordinary path would price the menu at
    // the forfait PLUS the components' option modifiers, the client total would
    // stop matching the server's, and the checkout would answer « Paiement
    // incorrect » — M-19's shape, one level up.
    const c = frite();
    c.options = [
      {
        group: "Type de frite",
        choice: "Frite Cheddar",
        choiceId: "x",
        priceModifier: 150,
        dineInPriceModifier: 150,
        pickupPriceModifier: null,
        deliveryPriceModifier: null,
      },
    ];
    const l = duo([c]);
    expect(recalculateUnitPrice(l, "DINE_IN")).toBe(1190);
    // …and the 1,50 € is still charged, once, by computeLineTotal.
    expect(computeLineTotal({ ...l, unitPrice: recalculateUnitPrice(l, "DINE_IN") })).toBe(1340);
  });

  it("reprices through the store when the operator switches order type", () => {
    useCartStore.getState().addItem(line());
    useCartStore.getState().setOrderType("LIVRAISON");
    const stored = useCartStore.getState().items[0];
    expect(stored.unitPrice).toBe(1390);
    expect(computeLineTotal(stored)).toBe(1390 + 150);
    // The components survive the reprice — a switch must not flatten the line.
    expect(stored.components).toHaveLength(4);
    expect(stored.components![1].options[0].choice).toBe("Sans Crudités");
  });

  it("falls back to the dine-in forfait when the menu has no price for that mode", () => {
    const l = duo([canette()], { pickupPrice: null, deliveryPrice: null });
    expect(recalculateUnitPrice(l, "TAKEAWAY")).toBe(1190);
    expect(recalculateUnitPrice(l, "LIVRAISON")).toBe(1190);
  });
});

describe("held tickets carry menus whole", () => {
  it("parks and recalls a menu with both configurations intact", () => {
    useCartStore.getState().addItem(
      duo([burger("Cheeseburger", "Salade"), burger("Cheeseburger", "Sans Crudités"), frite(), canette()]),
    );
    useCartStore.getState().holdCurrent("Table 4");
    expect(useCartStore.getState().items).toHaveLength(0);

    const held = useCartStore.getState().heldOrders[0];
    useCartStore.getState().recallOrder(held.id);
    const back = useCartStore.getState().items[0];
    expect(back.components).toHaveLength(4);
    expect(back.components!.map((c) => c.options[0]?.choice ?? null)).toEqual([
      "Salade",
      "Sans Crudités",
      null,
      null,
    ]);
    expect(back.unitPrice).toBe(1190);
  });
});
