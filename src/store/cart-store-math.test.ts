import { describe, it, expect } from "vitest";
import { computeLineTotal, productUnitPrice, recalculateUnitPrice, type CartItem, type CartOption } from "@/store/cart-store";
import type { ProductDto } from "@/types/api";

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
  basePrice: 10,
  pickupPrice: 9,
  deliveryPrice: 11,
  unitPrice: 10,
  quantity: 2,
  options: [],
  addOns: [],
  vatRate: 10,
};

describe("computeLineTotal — addon pricing regression (A5)", () => {
  it("charges addon price per item quantity (NOT double-counted)", () => {
    const item: CartItem = {
      ...baseItem,
      addOns: [{ id: "bacon", name: "Bacon", price: 1.5 }],
    };
    // (unitPrice + addonsTotal) * qty = (10 + 1.5) * 2 = 23
    expect(computeLineTotal(item)).toBe(23);
  });

  it("sums multiple addons before applying quantity", () => {
    const item: CartItem = {
      ...baseItem,
      quantity: 3,
      addOns: [
        { id: "bacon", name: "Bacon", price: 1.5 },
        { id: "sauce", name: "Sauce", price: 0.8 },
      ],
    };
    // (10 + 1.5 + 0.8) * 3 = 36.9
    expect(computeLineTotal(item)).toBe(36.9);
  });
});

describe("productUnitPrice — base price per orderType on the product", () => {
  const product: ProductDto = {
    id: "p1",
    name: "Burger",
    description: null,
    price: 10,
    pickupPrice: 9,
    deliveryPrice: 11,
    vatRate: 10,
    categoryId: "c1",
    image: null,
    active: true,
    available: true,
    inheritCategoryGlobals: true,
    sortOrder: 0,
    options: [],
    addOns: [],
  };

  it("uses price (10) for DINE_IN", () => {
    expect(productUnitPrice(product, [], "DINE_IN")).toBe(10);
  });
  it("uses pickupPrice (9) for TAKEAWAY", () => {
    expect(productUnitPrice(product, [], "TAKEAWAY")).toBe(9);
  });
  it("uses deliveryPrice (11) for LIVRAISON", () => {
    expect(productUnitPrice(product, [], "LIVRAISON")).toBe(11);
  });
  it("applies priceModifier for DINE_IN option", () => {
    const opts: CartOption[] = [
      { group: "Sauce", choice: "Algérienne", choiceId: "c1", priceModifier: 0.5 },
    ];
    expect(productUnitPrice(product, opts, "DINE_IN")).toBe(10.5);
  });
});

describe("recalculateUnitPrice — full client-side mirror of A7", () => {
  // Item base prices: basePrice=10, pickupPrice=9, deliveryPrice=11.
  // Option has priceModifier=0, pickupPriceModifier=1, deliveryPriceModifier=2.
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
        pickupPriceModifier: 1, // takeaway override
        deliveryPriceModifier: 2, // delivery override
      },
    ],
  };

  it("DINE_IN → base 10 + priceModifier 0 = 10", () => {
    expect(recalculateUnitPrice(item, "DINE_IN")).toBe(10);
  });

  it("TAKEAWAY → base 9 (item.pickupPrice) + pickupMod 1 = 10", () => {
    expect(recalculateUnitPrice(item, "TAKEAWAY")).toBe(10);
  });

  it("LIVRAISON → base 11 (item.deliveryPrice) + deliveryMod 2 = 13", () => {
    expect(recalculateUnitPrice(item, "LIVRAISON")).toBe(13);
  });
});