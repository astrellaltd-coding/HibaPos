import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { buildCheckoutItems } from "@/lib/checkout-intent";
import type { CartComponent, CartItem } from "@/store/cart-store";

// Batch 5.9 — what the till actually SENDS.
//
// THIS FILE EXISTS BECAUSE OF A DEFECT NOTHING ELSE COULD SEE, and it is the
// third time this project has met the same shape. The route was complete, the
// allocation was right, the cart held a Menu Chill's three components — and the
// checkout answered 400 at the counter, because `payment-dialog.tsx` built the
// items array inline and nobody had taught it about `components`.
//
// Every test passed. `orders-combo.test.ts` drives the real route, which is
// what Batches 5.8 and 3.12 learned to do — but it constructs its own request
// body, so it cannot see what the CLIENT sends. `combo-builder.test.ts` proves
// the cart line is assembled correctly, and it was. The gap between the two was
// one mapping in a component, which is exactly where M-19 hid in Batch 5.7c.
//
// Found by the worked example: ringing the menu through the real UI on a
// scratch copy, which is validation criterion 6 and the only step that looks at
// the seam between the two halves.

const option = (choiceId: string) => ({
  group: "G",
  choice: "C",
  choiceId,
  priceModifier: 0,
  dineInPriceModifier: 0,
  pickupPriceModifier: null,
  deliveryPriceModifier: null,
});

const component = (over: Partial<CartComponent> = {}): CartComponent => ({
  slotId: "slot-pizza",
  slotName: "Pizza",
  productId: "regina",
  productName: "Regina",
  options: [],
  addOns: [],
  surcharge: 0,
  referencePrice: 1190,
  ...over,
});

const line = (over: Partial<CartItem> = {}): CartItem => ({
  uid: "u",
  productId: "p",
  productName: "Coca",
  basePrice: 150,
  pickupPrice: null,
  deliveryPrice: null,
  unitPrice: 150,
  quantity: 1,
  options: [],
  addOns: [],
  notes: null,
  vatRate: 10,
  ...over,
});

describe("an ordinary line is sent exactly as it always was", () => {
  it("carries the product, quantity, notes, options and add-ons", () => {
    const [sent] = buildCheckoutItems([
      line({
        quantity: 2,
        notes: "sans oignon",
        options: [option("c1"), option("c2")],
        addOns: [{ id: "a1", name: "Oeuf", price: 150 }],
      }),
    ]);
    expect(sent).toEqual({
      productId: "p",
      quantity: 2,
      notes: "sans oignon",
      optionIds: ["c1", "c2"],
      addons: [{ addonId: "a1", quantity: 1 }],
    });
  });

  it("OMITS `components` entirely rather than sending an empty array", () => {
    // The route refuses a composition attached to a product that is not a menu,
    // so an empty array would turn every ordinary sale into a 400.
    const [sent] = buildCheckoutItems([line()]);
    expect("components" in sent).toBe(false);
    expect(buildCheckoutItems([line({ components: [] })])[0]).not.toHaveProperty("components");
  });
});

describe("a menu sends its composition — the defect this file was written for", () => {
  const menu = () =>
    line({
      productId: "menu-chill",
      productName: "Menu Chill",
      unitPrice: 2490,
      components: [
        component({ productId: "regina", productName: "Regina" }),
        component({ productId: "calzone", productName: "Calzone" }),
        component({ slotId: "slot-drink", slotName: "Boisson", productId: "coca", productName: "Coca" }),
      ],
    });

  it("sends one entry per component, in slot order", () => {
    const [sent] = buildCheckoutItems([menu()]);
    expect(sent.components).toHaveLength(3);
    expect(sent.components!.map((c) => c.productId)).toEqual(["regina", "calzone", "coca"]);
    expect(sent.components!.map((c) => c.slotId)).toEqual(["slot-pizza", "slot-pizza", "slot-drink"]);
  });

  it("sends each component's OWN options — the two burgers, separately", () => {
    const [sent] = buildCheckoutItems([
      line({
        productId: "duo",
        components: [
          component({ productId: "burger", options: [option("salade")] }),
          component({ productId: "burger", options: [option("sans")] }),
        ],
      }),
    ]);
    expect(sent.components![0].optionIds).toEqual(["salade"]);
    expect(sent.components![1].optionIds).toEqual(["sans"]);
  });

  it("sends a component's add-ons", () => {
    const [sent] = buildCheckoutItems([
      line({
        productId: "menu",
        components: [component({ addOns: [{ id: "oeuf", name: "Oeuf", price: 150 }] })],
      }),
    ]);
    expect(sent.components![0].addons).toEqual([{ addonId: "oeuf", quantity: 1 }]);
  });

  it("sends NO price and NO rate — the server recomputes both", () => {
    // A basket may not choose what a component is worth any more than it may
    // choose its own tax. `referencePrice` and `surcharge` are carried in the
    // cart for the running total and must not leave the browser.
    const [sent] = buildCheckoutItems([menu()]);
    const keys = Object.keys(sent.components![0]).sort();
    expect(keys).toEqual(["addons", "optionIds", "productId", "slotId"]);
  });
});

describe("the dialog uses this and does not keep its own copy", () => {
  it("payment-dialog.tsx calls buildCheckoutItems and maps no items array itself", () => {
    // The guard that makes the extraction stick. Re-inlining the mapping would
    // reopen exactly the gap this file was written for: a client that a test
    // can no longer see.
    const src = readFileSync(
      path.join(process.cwd(), "src/components/pos/payment-dialog.tsx"),
      "utf8",
    );
    expect(src).toContain("buildCheckoutItems(items)");
    expect(src, "the items mapping is inline again").not.toMatch(/items:\s*items\.map\(/);
  });
});
