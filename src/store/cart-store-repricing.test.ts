import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  toCartOptions,
  recalculateUnitPrice,
  productUnitPrice,
  CART_PERSIST_VERSION,
  vetPersistedCart,
  type CartItem,
} from "@/store/cart-store";
import { computeLinePricing, type ProductWithRelations } from "@/lib/services/pricing";
import { MAX_ITEM_QUANTITY } from "@/lib/order-limits";
import type { ProductDto } from "@/types/api";

// M-19, M-15, M-16 (2026-09-05), Batch 5.7c.
//
// M-19's FINDING. Order-type-specific option modifiers were stored in the
// generic `priceModifier` slot: `product-options-dialog-v2.tsx` resolved the
// modifier for the CURRENT order type and wrote it there, while
// `recalculateUnitPrice` read that same field back as though it were the
// DINE_IN one. Add a line under TAKEAWAY, switch to DINE_IN, and the line
// reprices with the takeaway figure — the client total then disagrees with the
// server's and the checkout is refused « Paiement incorrect ».
//
// WHY IT SURVIVED, AND WHAT THAT DICTATES ABOUT THIS FILE. The existing cart
// tests build a `CartItem` by hand, with `priceModifier: 0 // dine-in` — the
// IDEAL shape, which the dialog never produced. They passed throughout. The
// batch's criterion is therefore a test "built through the options dialog's own
// mapping, not a hand-built `CartItem`", so the mapping was extracted from the
// component into `toCartOptions` and every M-19 case below goes through it.

/** A choice priced differently per order type — the shape that breaks. */
const SIZE_GROUP = {
  name: "Taille",
  choices: [
    {
      id: "c1",
      name: "Senior",
      priceModifier: 300, // dine-in: +3,00 €
      pickupPriceModifier: 100, // takeaway: +1,00 €
      deliveryPriceModifier: 500, // delivery: +5,00 €
    },
  ],
};

const PRODUCT: ProductDto = {
  id: "p1",
  name: "Pizza",
  description: null,
  price: 1000,
  pickupPrice: 900,
  deliveryPrice: 1100,
  vatRate: 10,
  image: null,
  categoryId: "cat",
  active: true,
  available: true,
  sortOrder: 0,
  options: [],
  addOns: [],
} as unknown as ProductDto;

function itemAddedUnder(orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON"): CartItem {
  const options = toCartOptions([SIZE_GROUP], { Taille: ["Senior"] }, orderType);
  return {
    uid: "u1",
    productId: "p1",
    productName: "Pizza",
    basePrice: 1000,
    pickupPrice: 900,
    deliveryPrice: 1100,
    unitPrice: productUnitPrice(PRODUCT, options, orderType),
    quantity: 1,
    options,
    addOns: [],
    vatRate: 10,
    notes: null,
  } as unknown as CartItem;
}

describe("M-19 — a line keeps its dine-in modifier, whatever it was added under", () => {
  it("prices correctly at the moment it is added", () => {
    // CONTROL. The dialog was never wrong about the price it showed — only
    // about what it stored — so this must hold before and after the fix.
    expect(itemAddedUnder("DINE_IN").unitPrice).toBe(1000 + 300);
    expect(itemAddedUnder("TAKEAWAY").unitPrice).toBe(900 + 100);
    expect(itemAddedUnder("LIVRAISON").unitPrice).toBe(1100 + 500);
  });

  it("stores the resolved modifier AND the dine-in one, separately", () => {
    const takeaway = toCartOptions([SIZE_GROUP], { Taille: ["Senior"] }, "TAKEAWAY")[0];
    expect(takeaway.priceModifier).toBe(100); // what this line is priced at
    expect(takeaway.dineInPriceModifier).toBe(300); // what DINE_IN would cost
    // Before M-19 there was one field holding the first value, and the
    // repricing below read it as though it were the second.
  });

  it("THE DEFECT: added under TAKEAWAY, switched to DINE_IN, priced right", () => {
    const item = itemAddedUnder("TAKEAWAY");
    // Old behaviour: base 1000 + priceModifier 100 (the TAKEAWAY figure) = 1100.
    // Correct: base 1000 + dine-in modifier 300 = 1300.
    expect(recalculateUnitPrice(item, "DINE_IN")).toBe(1300);
  });

  it("THE DEFECT: added under LIVRAISON, switched to DINE_IN, priced right", () => {
    expect(recalculateUnitPrice(itemAddedUnder("LIVRAISON"), "DINE_IN")).toBe(1300);
  });

  it("round-trips through every order type from every starting point", () => {
    // The property that matters: what a line costs depends on the order type
    // it is being priced FOR, never on the one it happened to be added under.
    const expected = { DINE_IN: 1300, TAKEAWAY: 1000, LIVRAISON: 1600 } as const;
    for (const addedUnder of ["DINE_IN", "TAKEAWAY", "LIVRAISON"] as const) {
      const item = itemAddedUnder(addedUnder);
      for (const pricedFor of ["DINE_IN", "TAKEAWAY", "LIVRAISON"] as const) {
        expect(recalculateUnitPrice(item, pricedFor)).toBe(expected[pricedFor]);
      }
    }
  });

  it("agrees with what the SERVER would charge for the same switch", () => {
    // M-19's visible symptom was « Paiement incorrect »: the server recomputes
    // authoritatively and refused the client's total. This is the two sides
    // meeting — the server's own `computeLinePricing` against the client's
    // repriced line, for a switch back to DINE_IN.
    const serverProduct: ProductWithRelations = {
      id: "p1",
      name: "Pizza",
      price: 1000,
      pickupPrice: 900,
      deliveryPrice: 1100,
      vatRate: 10,
      category: { parent: null, optionGroups: [], addOns: [] },
      options: [
        {
          id: "g1",
          name: "Taille",
          required: false,
          multiple: false,
          choices: [
            { id: "c1", name: "Senior", priceModifier: 300, pickupPriceModifier: 100, deliveryPriceModifier: 500 },
          ],
        },
      ],
      inheritCategoryGlobals: true,
    } as unknown as ProductWithRelations;

    const item = itemAddedUnder("TAKEAWAY");
    const client = recalculateUnitPrice(item, "DINE_IN");
    const server = computeLinePricing(
      { productId: "p1", quantity: 1, optionIds: ["c1"], addons: [] },
      serverProduct,
      "DINE_IN",
    );
    expect("error" in server).toBe(false);
    if (!("error" in server)) expect(server.unitPrice).toBe(client);
  });

  it("bumps the persisted version, so a version-1 cart is discarded not half-read", () => {
    // A version-1 line has no `dineInPriceModifier`, so its DINE_IN price would
    // fall back to whatever it was added under — M-19 exactly. The guard's own
    // comment says to bump when the persisted SHAPE changes.
    expect(CART_PERSIST_VERSION).toBe(2);
    const v1 = { items: [{ uid: "x" }], heldOrders: [], schema: 1 };
    expect(vetPersistedCart(v1).items).toEqual([]);
    const v2 = { items: [], heldOrders: [], schema: 2 };
    expect(vetPersistedCart(v2).schema).toBe(2);
  });
});

describe("M-15 — a line total can never go negative", () => {
  const product = (choicePriceModifier: number): ProductWithRelations =>
    ({
      id: "p1",
      name: "Salade",
      price: 500,
      pickupPrice: null,
      deliveryPrice: null,
      vatRate: 10,
      category: { parent: null, optionGroups: [], addOns: [] },
      options: [
        {
          id: "g1",
          name: "Retrait",
          required: false,
          multiple: false,
          choices: [{ id: "c1", name: "Sans", priceModifier: choicePriceModifier }],
        },
      ],
      inheritCategoryGlobals: true,
    }) as unknown as ProductWithRelations;

  const intent = { productId: "p1", quantity: 2, optionIds: ["c1"], addons: [] };

  it("allows a negative MODIFIER, which is normal", () => {
    // CONTROL, and it is the reason this is a refusal and not a blanket ban:
    // an absolute category price below the base produces a negative modifier
    // by design. Measured on this catalogue before choosing — the three
    // absolute-priced choices resolve to 0, +300 and +700.
    const r = computeLinePricing(intent, product(-200), "DINE_IN");
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.unitPrice).toBe(300);
      expect(r.lineTotal).toBe(600);
    }
  });

  it("allows a line that comes out exactly free", () => {
    const r = computeLinePricing(intent, product(-500), "DINE_IN");
    expect("error" in r).toBe(false);
    if (!("error" in r)) expect(r.unitPrice).toBe(0);
  });

  it("REFUSES a unit price below zero, naming the product", () => {
    // Refused rather than clamped: clamping sells the item free and silently,
    // and nobody would ever see it. A negative line total would also reduce
    // the order subtotal and corrupt the VAT apportionment on the way into a
    // sealed fiscal document.
    const r = computeLinePricing(intent, product(-501), "DINE_IN");
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error).toContain("négatif");
      expect(r.error).toContain("Salade");
    }
  });
});

describe("M-16 — item quantity has an upper bound", () => {
  it("pins the bound, and it is far above real use", () => {
    // 99 is a till bound, not a business rule. The largest quantity ever sold
    // on this install is 2, and 81 of 82 order lines are 1 — measured before
    // choosing, so the number is grounded rather than picked.
    expect(MAX_ITEM_QUANTITY).toBe(99);
  });

  it("is the number the route's schema enforces", () => {
    // Source, because the checkout schema is declared inline in the route and
    // is module-private — the same boundary `order-status.test.ts` names. What
    // this proves is that the route reads the shared constant rather than a
    // second literal that could drift from it.
    const route = readFileSync("src/app/api/orders/route.ts", "utf8");
    expect(route).toContain(".max(MAX_ITEM_QUANTITY, `Quantité maximale");
    // …and the refusal is FRENCH. L-22 is that zod's own English text reaches
    // the operator untranslated; that finding is Batch 7.1's, but a bound
    // added here must not enlarge it.
    expect(route).toContain('from "@/lib/order-limits"');
  });
});
