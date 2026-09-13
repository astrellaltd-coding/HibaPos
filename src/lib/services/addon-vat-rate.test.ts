import { describe, it, expect } from "vitest";
import { resolveAddOnVatRate, resolveChoiceModifier, resolveBasePrice } from "@/lib/services/pricing";
import { allocateCombo } from "@/lib/services/combo";

// R8.5 — L-94, L-136 and L-134's answer, as rules.
//
// The routes are driven in `addon-vat-line.test.ts`; this file is the
// arithmetic, where a wrong answer is legible.

describe("L-94 — a supplement's own VAT rate", () => {
  it("falls back to the restaurant's food rate, NOT to the host's", () => {
    // The whole correction. `docs/politique-ventilation-tva.md` § 6: « Un
    // supplément … relève de son propre taux — 10 % pour un supplément
    // alimentaire. » Inheriting the host is exactly what was wrong: a food
    // supplement on a takeaway canette booked at 5,5 %.
    expect(resolveAddOnVatRate({}, "DINE_IN", 10)).toBe(10);
    expect(resolveAddOnVatRate({}, "TAKEAWAY", 10)).toBe(10);
    expect(resolveAddOnVatRate({}, "LIVRAISON", 10)).toBe(10);
    // …and it follows the SETTING, so a restaurant whose food rate is not 10
    // is not silently taxed at 10.
    expect(resolveAddOnVatRate({}, "TAKEAWAY", 5.5)).toBe(5.5);
  });

  it("uses its own rate when it has one", () => {
    expect(resolveAddOnVatRate({ vatRate: 20 }, "DINE_IN", 10)).toBe(20);
    expect(resolveAddOnVatRate({ vatRate: 20 }, "TAKEAWAY", 10)).toBe(20);
  });

  it("takes both rates from the same level, like resolveVatRate (L-68)", () => {
    // A supplement that sets the sur-place rate and not the takeaway one uses
    // its own for both. The alternative — falling back to the default for the
    // takeaway half — would let one sale be taxed from two different places,
    // which is the thing L-68's comment says must never happen.
    expect(resolveAddOnVatRate({ vatRate: 20 }, "TAKEAWAY", 10)).toBe(20);
    expect(resolveAddOnVatRate({ vatRate: 20, vatRateTakeaway: 5.5 }, "TAKEAWAY", 10)).toBe(5.5);
    expect(resolveAddOnVatRate({ vatRate: 20, vatRateTakeaway: 5.5 }, "DINE_IN", 10)).toBe(20);
  });

  it("ignores a takeaway rate set without a sur-place one", () => {
    // `vatRate == null` means « no rate of its own », and a lone takeaway
    // figure must not turn that into a half-configured supplement.
    expect(resolveAddOnVatRate({ vatRateTakeaway: 5.5 }, "TAKEAWAY", 10)).toBe(10);
  });
});

describe("L-136 — a negative supplement cannot price an allocated line below zero", () => {
  const component = (referencePrice: number, supplements: number) => ({
    slotId: "s1",
    slotName: "Pizza 1",
    productId: "p1",
    productName: "Pizza",
    referencePrice,
    supplements,
    vatRate: 10,
    optionsJson: null,
    addOnsJson: null,
    notes: null,
  });

  it("refuses, naming the component and the menu", () => {
    // M-15's guard runs on `unitPrice` BEFORE add-ons and on the ordinary path
    // only; here the unit price is `share + supplements` and could go below
    // zero past it, putting a negative line into a sealed document.
    const r = allocateCombo({
      menuProductId: "m",
      menuName: "Menu XXL",
      forfait: 1000,
      menuVatRate: 10,
      components: [component(1000, -2000)],
    });
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error).toContain("Pizza");
      expect(r.error).toContain("Menu XXL");
    }
  });

  it("allows a negative supplement that does not take the line below zero", () => {
    // Refusing every negative supplement would be a different rule, and a
    // wrong one: a negative modifier is normal on this catalogue.
    const r = allocateCombo({
      menuProductId: "m",
      menuName: "Menu XXL",
      forfait: 1000,
      menuVatRate: 10,
      components: [component(1000, -300)],
    });
    expect("error" in r).toBe(false);
    if (!("error" in r)) expect(r.lines[0].unitPrice).toBe(700);
  });

  it("allows exactly zero", () => {
    const r = allocateCombo({
      menuProductId: "m",
      menuName: "Menu",
      forfait: 1000,
      menuVatRate: 10,
      components: [component(1000, -1000)],
    });
    expect("error" in r).toBe(false);
    if (!("error" in r)) expect(r.lines[0].unitPrice).toBe(0);
  });
});

describe("L-134 — a size supplies the price, sur place and à emporter alike", () => {
  // THE OPERATOR'S ANSWER, 2026-09-13: eat in and take away cost the same, so
  // this is intended behaviour and not a schema gap.
  //
  // Measured before asking: sur place equals à emporter for ALL 84 products
  // (0 differ), while livraison is higher for 43 of them. The `Taille` choices
  // carry exactly that shape — one absolute for sur place + à emporter
  // (`pickupPrice`), one for livraison (`deliveryPrice`).
  //
  // The consequence, and the reason this test exists: `Product.price` CANCELS
  // for a sized product. `unitPrice = base + (absolu − base) = absolu`. So
  // raising a pizza's price changes nothing at the till while `Taille` is
  // required — which reads as a bug until someone writes down that it is not.

  const TAILLE = { id: "c", name: "Senior", priceModifier: 0, pickupPrice: 1190, deliveryPrice: 1350 };
  const PIZZA = { price: 890, pickupPrice: 890, deliveryPrice: 990 };

  const unitPriceFor = (orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON", product: typeof PIZZA) => {
    const base = resolveBasePrice(product, orderType);
    return base + resolveChoiceModifier(TAILLE, orderType, base, product.price);
  };

  it("charges the size's absolute in every mode", () => {
    expect(unitPriceFor("DINE_IN", PIZZA)).toBe(1190);
    expect(unitPriceFor("TAKEAWAY", PIZZA)).toBe(1190);
    expect(unitPriceFor("LIVRAISON", PIZZA)).toBe(1350);
  });

  it("is unaffected by Product.price — which is the point", () => {
    // Raise the pizza's sur-place price by a euro. Nothing moves. If this ever
    // starts failing, somebody has given a size its own sur-place price and
    // the invariant needs re-deciding, not re-typing.
    const dearer = { ...PIZZA, price: 990 };
    expect(unitPriceFor("DINE_IN", dearer)).toBe(1190);
    expect(unitPriceFor("TAKEAWAY", dearer)).toBe(1190);
    expect(unitPriceFor("LIVRAISON", dearer)).toBe(1350);
  });

  it("still uses Product.price when the size carries no absolute", () => {
    // The fallback the operator's answer relies on: a product sold WITHOUT a
    // size is priced by `Product.price` as it always was.
    const relative = { id: "c", name: "Nature", priceModifier: 0, pickupPrice: null, deliveryPrice: null };
    const base = resolveBasePrice(PIZZA, "DINE_IN");
    expect(base + resolveChoiceModifier(relative, "DINE_IN", base, PIZZA.price)).toBe(890);
  });
});
