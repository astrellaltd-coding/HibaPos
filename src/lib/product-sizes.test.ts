import { describe, it, expect } from "vitest";
import { ownSizeGroup, categoryProvidesSizes } from "@/lib/product-sizes";

// L-251 — the product editor's « Tailles multiples » switch. Shapes are the
// till's export of 2026-10-01: `Pizzas` provides Junior · Senior · Mega, and
// « Chicago » had a `Taille` of its own beside it.

const inheritedTaille = {
  name: "Taille",
  inherited: true,
  choices: [{ name: "Junior" }, { name: "Senior" }, { name: "Mega" }],
};
const chicagoOwnTaille = {
  name: "Taille",
  inherited: false,
  choices: [{ name: "Petite" }, { name: "Moyenne" }, { name: "Grande" }],
};

describe("ownSizeGroup", () => {
  it("does not take an INHERITED Taille for the product's own (the switch that would not stay off)", () => {
    // Algérienne, and Chicago after its re-save: only the category's sizes.
    expect(ownSizeGroup([inheritedTaille])).toBeNull();
  });

  it("finds the product's own Taille behind an inherited one", () => {
    // Chicago as exported. GET lists category groups FIRST, so a reader taking
    // the first `Taille` found the inherited one.
    expect(ownSizeGroup([inheritedTaille, chicagoOwnTaille])).toBe(chicagoOwnTaille);
  });

  it("needs two sizes to be sizes", () => {
    expect(ownSizeGroup([{ ...chicagoOwnTaille, choices: [{ name: "Unique" }] }])).toBeNull();
  });

  it("matches the name as the inheritance rule does, across case and whitespace", () => {
    expect(ownSizeGroup([{ ...chicagoOwnTaille, name: " taille " }])).not.toBeNull();
  });
});

describe("categoryProvidesSizes", () => {
  it("is true for a product inheriting from a category with a Taille", () => {
    expect(categoryProvidesSizes(true, [{ name: "Taille" }])).toBe(true);
  });

  it("is false when the product opts out of inheritance — the override path keeps its own sizes", () => {
    expect(categoryProvidesSizes(false, [{ name: "Taille" }])).toBe(false);
  });

  it("is false for a category without sizes, and while the category is still loading", () => {
    expect(categoryProvidesSizes(true, [{ name: "Sauces" }])).toBe(false);
    expect(categoryProvidesSizes(true, undefined)).toBe(false);
  });
});
