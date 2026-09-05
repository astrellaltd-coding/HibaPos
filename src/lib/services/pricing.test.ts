import { describe, it, expect } from "vitest";
import { computeLinePricing, type ProductWithRelations, type ItemIntent } from "@/lib/services/pricing";

// Unit tests for the server-authoritative line pricing (Phase 8a).
// All amounts in CENTS. Pure — no DB, no HTTP.

function makeProduct(overrides: Partial<ProductWithRelations> = {}): ProductWithRelations {
  return {
    id: "p1",
    name: "Burger",
    price: 1000, // 10.00 €
    pickupPrice: 900,  // 9.00 €
    deliveryPrice: 1100, // 11.00 €
    vatRate: 10,
    category: {
      parent: null,
      optionGroups: [],
      addOns: [],
    },
    options: [],
    inheritCategoryGlobals: true,
    ...overrides,
  };
}

const baseIntent: ItemIntent = {
  productId: "p1",
  quantity: 2,
  optionIds: [],
  addons: [],
};

describe("computeLinePricing — base price per orderType", () => {
  it("DINE_IN uses price (1000¢)", () => {
    const r = computeLinePricing(baseIntent, makeProduct(), "DINE_IN");
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.unitPrice).toBe(1000);
      expect(r.lineTotal).toBe(2000);
    }
  });

  it("TAKEAWAY uses pickupPrice (900¢)", () => {
    const r = computeLinePricing(baseIntent, makeProduct(), "TAKEAWAY");
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.unitPrice).toBe(900);
      expect(r.lineTotal).toBe(1800);
    }
  });

  it("LIVRAISON uses deliveryPrice (1100¢)", () => {
    const r = computeLinePricing(baseIntent, makeProduct(), "LIVRAISON");
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.unitPrice).toBe(1100);
      expect(r.lineTotal).toBe(2200);
    }
  });

  it("falls back to dine-in price when pickupPrice/deliveryPrice are null", () => {
    const product = makeProduct({ pickupPrice: null, deliveryPrice: null });
    const r = computeLinePricing(baseIntent, product, "TAKEAWAY");
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.unitPrice).toBe(1000); // falls back to price
    }
  });
});

describe("computeLinePricing — options", () => {
  const product = makeProduct({
    options: [
      {
        id: "g1",
        name: "Cuisson",
        required: true,
        multiple: false,
        choices: [
          { id: "c1", name: "À point", priceModifier: 0 },
          { id: "c2", name: "Bien cuit", priceModifier: 0 },
        ],
      },
      {
        id: "g2",
        name: "Suppléments",
        required: false,
        multiple: true,
        choices: [
          { id: "c3", name: "Cheddar", priceModifier: 100 }, // +1.00 €
          { id: "c4", name: "Bacon", priceModifier: 150 },   // +1.50 €
        ],
      },
    ],
  });

  it("applies priceModifier for a single option", () => {
    const r = computeLinePricing(
      { ...baseIntent, optionIds: ["c1"] },
      product,
      "DINE_IN",
    );
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.unitPrice).toBe(1000); // 1000 + 0
      expect(r.lineTotal).toBe(2000);
    }
  });

  it("sums multiple option modifiers", () => {
    const r = computeLinePricing(
      { ...baseIntent, optionIds: ["c1", "c3", "c4"] }, // c1 = Cuisson (required), c3/c4 = Suppléments
      product,
      "DINE_IN",
    );
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.unitPrice).toBe(1250); // 1000 + 100 + 150
      expect(r.lineTotal).toBe(2500);
    }
  });

  it("returns error when a required option is missing", () => {
    const r = computeLinePricing(
      { ...baseIntent, optionIds: [] }, // no Cuisson
      product,
      "DINE_IN",
    );
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error).toContain("Cuisson");
    }
  });

  it("returns error when multiple selected in a single-choice group", () => {
    const r = computeLinePricing(
      { ...baseIntent, optionIds: ["c1", "c2"] }, // two in Cuisson (single)
      product,
      "DINE_IN",
    );
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error).toContain("Une seule sélection");
    }
  });
});

describe("computeLinePricing — absolute option prices (size group)", () => {
  // A category-level option group with absolute pickupPrice/deliveryPrice (e.g. Taille).
  const product = makeProduct({
    category: {
      parent: null,
      optionGroups: [
        {
          id: "cg1",
          name: "Taille",
          required: true,
          multiple: false,
          choices: [
            { id: "s1", name: "Moyenne", priceModifier: 0, pickupPrice: 900, deliveryPrice: 1000 },
            { id: "s2", name: "Large", priceModifier: 0, pickupPrice: 1100, deliveryPrice: 1200 },
          ],
        },
      ],
      addOns: [],
    },
  });

  it("TAKEAWAY: absolute pickupPrice replaces base, modifier = absolute - basePrice", () => {
    const r = computeLinePricing(
      { ...baseIntent, optionIds: ["s1"] },
      product,
      "TAKEAWAY",
    );
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      // base = pickupPrice (900), absolute = 900, modifier = 900 - 900 = 0
      expect(r.unitPrice).toBe(900);
      expect(r.lineTotal).toBe(1800);
    }
  });

  it("LIVRAISON: absolute deliveryPrice replaces base, modifier = absolute - basePrice", () => {
    const r = computeLinePricing(
      { ...baseIntent, optionIds: ["s1"] },
      product,
      "LIVRAISON",
    );
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      // base = deliveryPrice (1100), absolute delivery = 1000, modifier = 1000 - 1100 = -100
      expect(r.unitPrice).toBe(1000); // 1100 + (-100)
      expect(r.lineTotal).toBe(2000);
    }
  });

  it("DINE_IN: absolute relativizes against the dine-in base (product.price)", () => {
    const r = computeLinePricing(
      { ...baseIntent, optionIds: ["s1"] },
      product,
      "DINE_IN",
    );
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      // base = price (1000), absolute pickup = 900, modifier = 900 - 1000 = -100
      expect(r.unitPrice).toBe(900); // 1000 + (-100)
      expect(r.lineTotal).toBe(1800);
    }
  });

  it("DINE_IN with Large size: modifier = 1100 - 1000 = +100", () => {
    const r = computeLinePricing(
      { ...baseIntent, optionIds: ["s2"] },
      product,
      "DINE_IN",
    );
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.unitPrice).toBe(1100); // 1000 + 100
      expect(r.lineTotal).toBe(2200);
    }
  });
});

// DD-15 (Batch 5.7a). These four cases were fixtured on `productAddons` — the
// `ProductAddon` join, which had 0 rows and no writer anywhere, so they were
// exercising a path no production data could reach. They are RE-FIXTURED onto
// `CategoryAddOn`, the surviving namespace with 21 live rows, rather than
// deleted (safety rule 2): the four behaviours below are unchanged and are now
// asserted through the path the POS actually uses.
describe("computeLinePricing — addons", () => {
  const product = makeProduct({
    category: {
      parent: null,
      optionGroups: [],
      addOns: [
        { id: "a1", name: "Bacon", price: 150, active: true },
        { id: "a2", name: "Sauce", price: 50, active: true },
      ],
    },
  });

  it("charges addon price per item quantity", () => {
    const r = computeLinePricing(
      { ...baseIntent, addons: [{ addonId: "a1", quantity: 1 }] },
      product,
      "DINE_IN",
    );
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      // (unitPrice + addonsTotal) * qty = (1000 + 150) * 2 = 2300
      expect(r.lineTotal).toBe(2300);
    }
  });

  it("sums multiple addons before applying quantity", () => {
    const r = computeLinePricing(
      { ...baseIntent, quantity: 3, addons: [
        { addonId: "a1", quantity: 1 },
        { addonId: "a2", quantity: 1 },
      ] },
      product,
      "DINE_IN",
    );
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      // (1000 + 150 + 50) * 3 = 3600
      expect(r.lineTotal).toBe(3600);
    }
  });

  it("returns error when the addon is not available for the product", () => {
    const r = computeLinePricing(
      { ...baseIntent, addons: [{ addonId: "aX", quantity: 1 }] },
      product,
      "DINE_IN",
    );
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error).toContain("non disponible");
    }
  });

  it("returns error when the addon is inactive", () => {
    const product = makeProduct({
      category: {
        parent: null,
        optionGroups: [],
        addOns: [{ id: "a1", name: "Bacon", price: 150, active: false }],
      },
    });
    const r = computeLinePricing(
      { ...baseIntent, addons: [{ addonId: "a1", quantity: 1 }] },
      product,
      "DINE_IN",
    );
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error).toContain("inactif");
    }
  });
});

describe("computeLinePricing — category-level addons + options (inheritGlobals)", () => {
  const product = makeProduct({
    category: {
      parent: null,
      optionGroups: [
        {
          id: "cg1",
          name: "Cuisson",
          required: true,
          multiple: false,
          choices: [
            { id: "cc1", name: "À point", priceModifier: 0 },
          ],
        },
      ],
      addOns: [{ id: "ca1", name: "Sauce", price: 50, active: true }],
    },
  });

  it("inherits category-level options + addons when inheritCategoryGlobals=true", () => {
    const r = computeLinePricing(
      { ...baseIntent, optionIds: ["cc1"], addons: [{ addonId: "ca1", quantity: 1 }] },
      product,
      "DINE_IN",
    );
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      // (1000 + 0 + 50) * 2 = 2100
      expect(r.lineTotal).toBe(2100);
    }
  });

  it("skips category-level options + addons when inheritCategoryGlobals=false", () => {
    const product = makeProduct({
      inheritCategoryGlobals: false,
      category: {
        parent: null,
        optionGroups: [
          { id: "cg1", name: "Cuisson", required: true, multiple: false, choices: [{ id: "cc1", name: "À point", priceModifier: 0 }] },
        ],
        addOns: [{ id: "ca1", name: "Sauce", price: 50, active: true }],
      },
    });
    // cc1 is a category-level option id — not in the product's own options,
    // so with inheritCategoryGlobals=false it's unavailable → error.
    const r = computeLinePricing(
      { ...baseIntent, optionIds: ["cc1"], addons: [{ addonId: "ca1", quantity: 1 }] },
      product,
      "DINE_IN",
    );
    expect("error" in r).toBe(true);
  });
});
