import { describe, it, expect } from "vitest";
import {
  computeLineTotal,
  computeCartTotals,
  productUnitPrice,
  recalculateUnitPrice,
  type CartItem,
  type CartOption,
} from "@/store/cart-store";
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

// T-09 (Batch 6.2). `cart-store.test.ts` held five cases, four of which
// asserted values already asserted in this file — the same 2300 line total,
// the same 900 / 1100 order-type prices, the same 1050 option modifier. It was
// removed. `computeCartTotals` was its ONE unique case and had no other cover
// anywhere, so it moves here rather than going with it.
describe("computeCartTotals — subtotal and discount (moved from cart-store.test.ts, T-09)", () => {
  const oneLine = (): CartItem[] => [
    {
      uid: "1",
      productId: "p1",
      productName: "Burger",
      basePrice: 1000,
      pickupPrice: 900,
      deliveryPrice: 1100,
      unitPrice: 1000,
      quantity: 1,
      options: [],
      addOns: [],
      vatRate: 10,
    } as unknown as CartItem,
  ];

  it("subtracts the discount from the subtotal", () => {
    const { subtotal, total } = computeCartTotals(oneLine(), 200);
    expect(subtotal).toBe(1000);
    expect(total).toBe(800);
  });

  it("never returns a negative total, however large the discount", () => {
    // Added at the move. `computeCartTotals` clamps with `Math.max(0, …)` and
    // nothing asserted it — a cart showing a negative total would be the
    // client-side twin of M-15.
    expect(computeCartTotals(oneLine(), 5000).total).toBe(0);
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
      { group: "Sauce", choice: "Algérienne", choiceId: "c1", priceModifier: 50, dineInPriceModifier: 50 }, // 0.50 €
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
        // M-19 (Batch 5.7c). These two are equal here, which is why this file
        // passed throughout and never saw the defect: it hand-builds the IDEAL
        // shape, where `priceModifier` really is the dine-in figure. The
        // dialog did not produce that shape — it stored the RESOLVED modifier
        // in `priceModifier` — so the line came back mispriced on a switch
        // back to DINE_IN. `dineInPriceModifier` is what makes the two
        // distinguishable; `offert`-style hand fixtures cannot catch it, and
        // `cart-store-repricing.test.ts` goes through `toCartOptions` instead.
        priceModifier: 0, // dine-in
        dineInPriceModifier: 0,
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
