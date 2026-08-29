import { describe, it, expect } from "vitest";
import { computeLineTotal, computeCartTotals, productUnitPrice, type CartItem } from "@/store/cart-store";
import type { ProductDto } from "@/types/api";
import type { CartOption } from "@/store/cart-store";

const baseProduct: ProductDto = {
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

describe("cart-store calculations", () => {
  it("computes line total with addons", () => {
    const item = {
      uid: "1",
      productId: "p1",
      productName: "Burger",
      basePrice: 10,
      pickupPrice: 9,
      deliveryPrice: 11,
      unitPrice: 10,
      quantity: 2,
      options: [],
      addOns: [{ id: "a1", name: "Bacon", price: 1.5 }],
      vatRate: 10,
    };
    expect(computeLineTotal(item)).toBe(23);
  });

  it("computes cart totals with discount", () => {
    const items: CartItem[] = [
      { uid: "1", productId: "p1", productName: "Burger", basePrice: 10, pickupPrice: 9, deliveryPrice: 11, unitPrice: 10, quantity: 1, options: [], addOns: [], vatRate: 10 },
    ];
    const { subtotal, total } = computeCartTotals(items, 2);
    expect(subtotal).toBe(10);
    expect(total).toBe(8);
  });

  it("uses pickupPrice for TAKEAWAY", () => {
    const price = productUnitPrice(baseProduct, [], "TAKEAWAY");
    expect(price).toBe(9);
  });

  it("uses deliveryPrice for LIVRAISON", () => {
    const price = productUnitPrice(baseProduct, [], "LIVRAISON");
    expect(price).toBe(11);
  });

  it("applies option modifiers", () => {
    const opts: CartOption[] = [{ group: "Sauce", choice: "Algérienne", choiceId: "c1", priceModifier: 0.5 }];
    const price = productUnitPrice(baseProduct, opts, "DINE_IN");
    expect(price).toBe(10.5);
  });
});
