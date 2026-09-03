import { describe, it, expect } from "vitest";
import { computeLineTotal, productUnitPrice, recalculateUnitPrice, type CartItem, type CartOption } from "@/store/cart-store";
import type { ProductDto } from "@/types/api";

// All prices are in INTEGER CENTS (e.g. 1000 = 10.00 €).
// Regression guards for the Batch A fixes:
//   - A5 (false positive): addon price is multiplied by item.quantity ONCE.
//   - A7 (real fix): option modifier per orderType — the server route in
//     orders/route.ts picks up pickupPriceModifier/deliveryPriceModifier/
//     absolute pickupPrice/deliveryPrice for the chosen orderType. The
//     cart-store's recalculateUnitPrice mirrors this on the client.

const baseItem: CartItem = {
  uid: "1",
  productId: "p1",
  productName: "Burger",
  basePrice: 1000, // 10.00 €
  pickupPrice: 900,  // 9.00 €
  deliveryPrice: 1100, // 11.00 €
  unitPrice: 1000,
  quantity: 2,
  options: [],
  addOns: [],
  vatRate: 10,
};

describe("computeLineTotal — addon pricing regression (A5)", () => {
  it("charges addon price per item quantity (NOT double-counted)", () => {
    const item: CartItem = {
      ...baseItem,
      addOns: [{ id: "bacon", name: "Bacon", price: 150 }], // 1.50 €
    };
    // (unitPrice + addonsTotal) * qty = (1000 + 150) * 2 = 2300 cents
    expect(computeLineTotal(item)).toBe(2300);
  });

  it("sums multiple addons before applying quantity", () => {
    const item: CartItem = {
      ...baseItem,
      quantity: 3,
      addOns: [
        { id: "bacon", name: "Bacon", price: 150 }, // 1.50 €
        { id: "sauce", name: "Sauce", price: 80 },  // 0.80 €
      ],
    };
    // (1000 + 150 + 80) * 3 = 3690 cents
    expect(computeLineTotal(item)).toBe(3690);
  });
});

describe("productUnitPrice — base price per orderType on the product", () => {
  const product: ProductDto = {
    id: "p1",
    name: "Burger",
    description: null,
    price: 1000, // 10.00 €
    pickupPrice: 900,  // 9.00 €
    deliveryPrice: 1100, // 11.00 €
    vatRate: 10,
    categoryId: "c1",
    image: null,
    active: true,
    available: true,
    inheritCategoryGlobals: true,
    inheritCategoryVat: false,
    effectiveVatRate: 10,
    sortOrder: 0,
    options: [],
    addOns: [],
  };

  it("uses price (1000) for DINE_IN", () => {
    expect(productUnitPrice(product, [], "DINE_IN")).toBe(1000);
  });
  it("uses pickupPrice (900) for TAKEAWAY", () => {
    expect(productUnitPrice(product, [], "TAKEAWAY")).toBe(900);
  });
  it("uses deliveryPrice (1100) for LIVRAISON", () => {
    expect(productUnitPrice(product, [], "LIVRAISON")).toBe(1100);
  });
  it("applies priceModifier for DINE_IN option", () => {
    const opts: CartOption[] = [
      { group: "Sauce", choice: "Algérienne", choiceId: "c1", priceModifier: 50 }, // 0.50 €
    ];
    expect(productUnitPrice(product, opts, "DINE_IN")).toBe(1050);
  });
});

describe("recalculateUnitPrice — full client-side mirror of A7", () => {
  // Item base prices (cents): basePrice=1000, pickupPrice=900, deliveryPrice=1100.
  // Option has priceModifier=0, pickupPriceModifier=100, deliveryPriceModifier=200.
  // recalculateUnitPrice: base = item.{basePrice|pickupPrice|deliveryPrice}
  //                       + sum(option.{priceModifier|pickupPriceModifier|deliveryPriceModifier})
  const item: CartItem = {
    ...baseItem,
    options: [
      {
        group: "Taille",
        choice: "Moyenne",
        choiceId: "c1",
        priceModifier: 0, // dine-in
        pickupPriceModifier: 100, // takeaway override (1.00 €)
        deliveryPriceModifier: 200, // delivery override (2.00 €)
      },
    ],
  };

  it("DINE_IN → base 1000 + priceModifier 0 = 1000", () => {
    expect(recalculateUnitPrice(item, "DINE_IN")).toBe(1000);
  });

  it("TAKEAWAY → base 900 (item.pickupPrice) + pickupMod 100 = 1000", () => {
    expect(recalculateUnitPrice(item, "TAKEAWAY")).toBe(1000);
  });

  it("LIVRAISON → base 1100 (item.deliveryPrice) + deliveryMod 200 = 1300", () => {
    expect(recalculateUnitPrice(item, "LIVRAISON")).toBe(1300);
  });
});
