import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  candidateProducts,
  categoryTreeIds,
  comboSlotsForPayload,
  emptySlot,
  governableGroups,
  ruleModeFor,
  slotFormErrors,
  slotsFromProduct,
  slotsToPayload,
  withRule,
  type SlotForm,
} from "@/lib/combo-slot-form";
import type { CategoryDto, ProductDto } from "@/types/api";

// Batch 5.10 — editing a menu's composition in the catalogue screen.
//
// WHY THIS FILE IS BIGGER THAN THE COMPONENT IT SERVES. Batch 5.7c's M-19 hid
// in a mapping inside `product-options-dialog-v2.tsx`; Batch 5.9's worked
// example found the same shape again in `payment-dialog.tsx`, where the till
// silently stopped sending a menu's composition and 1165 passing tests could
// not see it. Twice is a rule. Every decision this editor makes is here, and
// the last test in this file asserts the component still calls it.

const cat = (id: string, name: string, parentId: string | null = null): CategoryDto =>
  ({ id, name, color: "#fff", icon: null, sortOrder: 0, active: true, parentId, vatRate: null }) as CategoryDto;

const CATEGORIES = [
  cat("pizzas", "Pizzas"),
  cat("sauce-tomate", "Sauce Tomate", "pizzas"),
  cat("menu", "Menu", "pizzas"),
  cat("bouteilles", "Bouteilles"),
];

const TAILLE = {
  id: "g-taille",
  name: "Taille",
  required: true,
  multiple: false,
  sortOrder: 0,
  inherited: true,
  choices: [
    { id: "c-junior", name: "Junior", priceModifier: 0, sortOrder: 0 },
    { id: "c-senior", name: "Senior", priceModifier: 300, sortOrder: 1 },
  ],
};
/** A group belonging to ONE product, not inherited — a slot cannot govern it. */
const OWN_GROUP = { ...TAILLE, id: "g-own", name: "Cuisson", inherited: false };

const product = (over: Partial<ProductDto>): ProductDto =>
  ({
    id: "p", name: "P", description: null, price: 890, pickupPrice: 890, deliveryPrice: 990,
    vatRate: 10, categoryId: "sauce-tomate", image: null, active: true, available: true,
    inheritCategoryGlobals: true, inheritCategoryVat: true, effectiveVatRate: 10, sortOrder: 0,
    options: [], addOns: [], isCombo: false, comboSlots: [], ...over,
  }) as ProductDto;

const PRODUCTS: ProductDto[] = [
  product({ id: "regina", name: "Regina", options: [TAILLE], sortOrder: 1 }),
  product({ id: "margarita", name: "Margarita", options: [TAILLE, OWN_GROUP], sortOrder: 0 }),
  product({ id: "coca", name: "Coca", categoryId: "bouteilles", price: 350 }),
  product({ id: "menu-eco", name: "Menu Eco", categoryId: "menu", price: 2490, isCombo: true }),
  product({ id: "retire", name: "Retiré", categoryId: "sauce-tomate", active: false }),
];

const slot = (over: Partial<SlotForm> = {}): SlotForm => ({ ...emptySlot("pizzas"), name: "Pizza", ...over });

describe("what a slot may be filled with", () => {
  it("walks the category and its children", () => {
    expect(categoryTreeIds("pizzas", CATEGORIES).sort()).toEqual(["menu", "pizzas", "sauce-tomate"]);
  });

  it("NEVER OFFERS A MENU, though Menu Eco is in the Pizzas tree", () => {
    // Offering one would let the operator build a menu the checkout then
    // refuses: accepted in the editor, broken in service.
    const offered = candidateProducts("pizzas", PRODUCTS, CATEGORIES);
    expect(offered.map((p) => p.id)).not.toContain("menu-eco");
    expect(offered.map((p) => p.name)).toEqual(["Margarita", "Regina"]);
  });

  it("hides a deactivated product", () => {
    expect(candidateProducts("pizzas", PRODUCTS, CATEGORIES).map((p) => p.id)).not.toContain("retire");
  });

  it("offers nothing until a category is chosen", () => {
    expect(candidateProducts("", PRODUCTS, CATEGORIES)).toEqual([]);
  });
});

describe("which option groups a menu can govern", () => {
  it("offers the groups the fillers INHERIT, once each", () => {
    const groups = governableGroups("pizzas", PRODUCTS, CATEGORIES);
    expect(groups.map((g) => g.id)).toEqual(["g-taille"]);
    expect(groups[0].choices.map((c) => c.name)).toEqual(["Junior", "Senior"]);
  });

  it("does NOT offer a product's own group", () => {
    // A slot spans a category; a product's own group belongs to that one
    // product, and `ComboSlotOptionRule`'s foreign key points at
    // `CategoryOptionGroup`, which would refuse the id anyway.
    expect(governableGroups("pizzas", PRODUCTS, CATEGORIES).map((g) => g.id)).not.toContain("g-own");
  });

  it("offers nothing for a category whose products inherit nothing", () => {
    expect(governableGroups("bouteilles", PRODUCTS, CATEGORIES)).toEqual([]);
  });
});

describe("the three ways a menu can treat an inherited group", () => {
  it("defaults to asking the cashier", () => {
    expect(ruleModeFor(slot(), "g-taille")).toEqual({ mode: "ask", choiceId: null });
  });

  it("« imposé » stores the choice — the pizza size", () => {
    const s = withRule(slot(), "g-taille", "fixed", "c-senior");
    expect(s.optionRules).toEqual([{ categoryOptionGroupId: "g-taille", categoryOptionChoiceId: "c-senior" }]);
    expect(ruleModeFor(s, "g-taille")).toEqual({ mode: "fixed", choiceId: "c-senior" });
  });

  it("« ne pas demander » stores a rule with NO choice — the Duo's frite", () => {
    // Every burger inherits a required « Frite » group; a Duo asks for a frite
    // once, in its own slot, so the burger slot silences it. A null choice is
    // what says « governed, and not asked » rather than « not governed ».
    //
    // A STALE CHOICE IS PASSED IN ON PURPOSE. This test called `withRule(...,
    // "silent", null)` at first and went on passing when the guard that nulls
    // the choice was reverted away — it was proving the argument, not the
    // function. Switching from « imposé » back to « ne pas demander » is
    // exactly how a stale id arrives, and if it were kept the menu would
    // silently impose a size nobody chose.
    const s = withRule(slot(), "g-taille", "silent", "c-senior");
    expect(s.optionRules).toEqual([{ categoryOptionGroupId: "g-taille", categoryOptionChoiceId: null }]);
    expect(ruleModeFor(s, "g-taille")).toEqual({ mode: "silent", choiceId: null });
  });

  it("going back to « demander » removes the rule rather than blanking it", () => {
    const s = withRule(withRule(slot(), "g-taille", "fixed", "c-senior"), "g-taille", "ask", null);
    expect(s.optionRules).toEqual([]);
  });

  it("never stores two rules for one group", () => {
    let s = withRule(slot(), "g-taille", "fixed", "c-junior");
    s = withRule(s, "g-taille", "fixed", "c-senior");
    expect(s.optionRules).toHaveLength(1);
    expect(s.optionRules[0].categoryOptionChoiceId).toBe("c-senior");
  });
});

describe("form ↔ payload", () => {
  it("round-trips a stored menu, cents to euros and back", () => {
    const stored = product({
      isCombo: true,
      comboSlots: [
        { id: "s2", name: "Boisson", quantity: 1, sortOrder: 1, sourceCategoryId: "bouteilles", choices: [], optionRules: [] },
        { id: "s1", name: "Pizza", quantity: 2, sortOrder: 0, sourceCategoryId: "pizzas",
          choices: [{ productId: "cheddar", surcharge: 150, sortOrder: 0 }],
          optionRules: [{ categoryOptionGroupId: "g-taille", categoryOptionChoiceId: "c-senior" }] },
      ],
    });
    const form = slotsFromProduct(stored);
    // sorted by sortOrder, not by the order the API happened to return
    expect(form.map((s) => s.name)).toEqual(["Pizza", "Boisson"]);
    expect(form[0].choices[0].surcharge).toBe(1.5); // euros in the form
    const payload = slotsToPayload(form);
    expect(payload[0].choices[0].surcharge).toBe(150); // cents on the wire
    expect(payload.map((s) => s.sortOrder)).toEqual([0, 1]);
  });

  it("drops the blank row the form always carries", () => {
    // The editor keeps an empty slot for the operator to type into; sending it
    // would be refused for a missing name — an error about a row they had not
    // filled in yet.
    expect(slotsToPayload([slot(), emptySlot()])).toHaveLength(1);
  });

  it("renumbers sortOrder from the position, so reordering is moving a row", () => {
    const payload = slotsToPayload([slot({ name: "B" }), slot({ name: "A" })]);
    expect(payload.map((s) => [s.name, s.sortOrder])).toEqual([["B", 0], ["A", 1]]);
  });

  it("never sends a quantity below 1", () => {
    expect(slotsToPayload([slot({ quantity: 0 })])[0].quantity).toBe(1);
    expect(slotsToPayload([slot({ quantity: Number.NaN })])[0].quantity).toBe(1);
  });
});

describe("C-24's rule — an absent field is not an empty one", () => {
  const slots = [slot()];

  it("a menu sends its slots", () => {
    expect(comboSlotsForPayload({ isCombo: true, wasCombo: true, slots })).toHaveLength(1);
  });

  it("a product that was never a menu sends NOTHING — « leave them alone »", () => {
    expect(comboSlotsForPayload({ isCombo: false, wasCombo: false, slots })).toBeUndefined();
  });

  it("turning the switch OFF sends an empty array — a deliberate clear", () => {
    expect(comboSlotsForPayload({ isCombo: false, wasCombo: true, slots })).toEqual([]);
  });

  it("THE HAZARD, stated as a test: a non-menu never sends [] by accident", () => {
    // Batch 5.9 note 6. A form that always sent the array would wipe a menu's
    // composition the moment anything else on the screen went wrong, and the
    // menu would go on selling at its forfait under the higher-rate fallback —
    // over-taxing every sale with nothing on screen to say so.
    for (const wasCombo of [false]) {
      expect(comboSlotsForPayload({ isCombo: false, wasCombo, slots: [] })).toBeUndefined();
    }
  });
});

describe("the form refuses what the server would refuse", () => {
  const ok = [slot({ sourceCategoryId: "pizzas" })];

  it("says nothing about an ordinary product", () => {
    expect(slotFormErrors({ isCombo: false, priceCents: 890, slots: [] })).toEqual([]);
  });

  it("accepts a well-formed menu", () => {
    expect(slotFormErrors({ isCombo: true, priceCents: 2490, slots: ok })).toEqual([]);
  });

  it("refuses a menu with no components", () => {
    expect(slotFormErrors({ isCombo: true, priceCents: 2490, slots: [] })[0]).toContain("au moins un composant");
  });

  it("refuses a menu with no price — the forfait IS what gets ventilated", () => {
    const e = slotFormErrors({ isCombo: true, priceCents: 0, slots: ok });
    expect(e.some((m) => m.includes("doit avoir un prix"))).toBe(true);
  });

  it("refuses a component with no category to draw from", () => {
    const e = slotFormErrors({ isCombo: true, priceCents: 2490, slots: [slot({ sourceCategoryId: "" })] });
    expect(e.some((m) => m.includes("catégorie"))).toBe(true);
  });

  it("uses the SERVER's own validator, so the two cannot drift", () => {
    // Not a paraphrase of the rules: `slotFormErrors` builds the payload and
    // hands it to `validateComboShape`, which is what the routes run. If that
    // ever stops being true, the operator can be shown « saved » for a menu the
    // API is about to refuse.
    const src = readFileSync(path.join(process.cwd(), "src/lib/combo-slot-form.ts"), "utf8");
    expect(src).toContain('from "@/lib/validation"');
    expect(src).toContain("validateComboShape({");
  });
});

describe("the catalogue screen uses this and keeps no copy", () => {
  it("products-view.tsx calls the extracted mapping", () => {
    // The guard that makes the extraction stick — Batch 5.9's own lesson, which
    // cost a defect no test could see.
    const src = readFileSync(path.join(process.cwd(), "src/features/catalog/products-view.tsx"), "utf8");
    expect(src).toContain("comboSlotsForPayload({");
    expect(src).toContain("slotFormErrors({");
    expect(src).toContain("slotsFromProduct(product)");
  });

  it("the payload actually carries isCombo and comboSlots", () => {
    // 5.9 shipped a route the client never fed. This asserts the field is in
    // the body, not merely computed into a variable.
    const src = readFileSync(path.join(process.cwd(), "src/features/catalog/products-view.tsx"), "utf8");
    const payload = src.slice(src.indexOf("const payload = {"), src.indexOf("setSaving(true)"));
    expect(payload).toContain("isCombo,");
    expect(payload).toContain("comboSlots: comboSlotsForPayload(");
  });

  it("the save is BLOCKED when the menu is invalid, not merely coloured red", () => {
    // A SOURCE assertion, and named as one — `handleSave` lives inside the
    // component and there is no harness that can call it. Removing the early
    // return was survived by every other test in this file: the operator would
    // be told « enregistré » and the API would answer 400, which is the same
    // class of gap Batch 5.9 shipped. `checkout-guards.test.ts` and
    // `order-status.test.ts` assert route source for the same reason.
    const src = readFileSync(path.join(process.cwd(), "src/features/catalog/products-view.tsx"), "utf8");
    const save = src.slice(src.indexOf("const handleSave"), src.indexOf("const payload = {"));
    expect(save, "handleSave no longer refuses an invalid menu").toContain("comboErrors.length > 0");
    expect(save).toContain("return;");
  });

  it("the editor renders what this module decides, and decides nothing itself", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/catalog/combo-slots-editor.tsx"),
      "utf8",
    );
    expect(src).toContain('from "@/lib/combo-slot-form"');
    // No filtering of its own: the « never offer a menu » rule must live in one
    // place, and that place is `candidateProducts`.
    expect(src).not.toMatch(/\.filter\([^)]*isCombo/);
  });
});
