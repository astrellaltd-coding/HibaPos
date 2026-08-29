import { describe, it, expect } from "vitest";
import { computeLineTotal, computeCartTotals, productUnitPrice, type CartItem } from "@/store/cart-store";
import type { ProductDto } from "@/types/api";
import type { CartOption } from "@/store/cart-store";

// All prices are in INTEGER CENTS (e.g. 1000 = 10.00 €).

const baseProduct: ProductDto = {
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
  sortOrder: 0,
  options: [],
  addOns: [],
};

describe("cart-store calculations", () => {
  it("computes line total with addons", () => {
    const item = {
      uid: "1",
      productId: "p1",
      productName: "Burger",
      basePrice: 1000,
      pickupPrice: 900,
      deliveryPrice: 1100,
      unitPrice: 1000,
      quantity: 2,
      options: [],
      addOns: [{ id: "a1", name: "Bacon", price: 150 }], // 1.50 €
      vatRate: 10,
    };
    // (1000 + 150) * 2 = 2300 cents
    expect(computeLineTotal(item)).toBe(2300);
  });

  it("computes cart totals with discount", () => {
    const items: CartItem[] = [
      { uid: "1", productId: "p1", productName: "Burger", basePrice: 1000, pickupPrice: 900, deliveryPrice: 1100, unitPrice: 1000, quantity: 1, options: [], addOns: [], vatRate: 10 },
    ];
    const { subtotal, total } = computeCartTotals(items, 200); // 2.00 € discount
    expect(subtotal).toBe(1000);
    expect(total).toBe(800);
  });

  it("uses pickupPrice for TAKEAWAY", () => {
    const price = productUnitPrice(baseProduct, [], "TAKEAWAY");
    expect(price).toBe(900);
  });

  it("uses deliveryPrice for LIVRAISON", () => {
    const price = productUnitPrice(baseProduct, [], "LIVRAISON");
    expect(price).toBe(1100);
  });

  it("applies option modifiers", () => {
    const opts: CartOption[] = [{ group: "Sauce", choice: "Algérienne", choiceId: "c1", priceModifier: 50 }];
    const price = productUnitPrice(baseProduct, opts, "DINE_IN");
    expect(price).toBe(1050);
  });
});
