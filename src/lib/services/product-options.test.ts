import { describe, it, expect } from "vitest";
import {
  normalizeGroupName,
  inheritedCategoryGroups,
  inheritedGroupNames,
  splitOwnFromInherited,
} from "./product-options";

// Batch 5.8 (L-67). The rule that decides whether a product-level option group
// is the product's own or a copy of one it already inherits.
//
// The case that produced the finding is the "L-67 case" below: twelve
// Croustillants each carried a "Sauces" group identical to the one their
// category provides, so the POS presented two REQUIRED sauce groups and a sauce
// had to be chosen twice before the product could be added to a basket.

const g = (name: string) => ({ name });

describe("normalizeGroupName", () => {
  it("ignores case and surrounding whitespace", () => {
    // Catalogue names are typed by hand in the admin screen. "Sauces",
    // "sauces" and "Sauces  " are one group to a human and must be one here, or
    // the guard passes a duplicate that the repair script would delete.
    expect(normalizeGroupName("Sauces")).toBe("sauces");
    expect(normalizeGroupName("  SAUCES  ")).toBe("sauces");
    expect(normalizeGroupName("sauces")).toBe("sauces");
  });

  it("does not otherwise rewrite the name", () => {
    // Accents and spacing INSIDE the name are part of it. Folding either would
    // merge two groups the operator deliberately kept apart.
    expect(normalizeGroupName("Choisir la taille")).toBe("choisir la taille");
    expect(normalizeGroupName("Sauce piquanté")).toBe("sauce piquanté");
  });
});

describe("inheritedCategoryGroups", () => {
  it("takes the parent's groups when the product is filed under a sub-category", () => {
    // Sub-categories are folders: a product in one inherits the PARENT's
    // options. Getting this wrong would make the write path disagree with the
    // read path about what is inherited, which is how the duplicates began.
    const category = {
      optionGroups: [g("Ignoré")],
      parent: { optionGroups: [g("Sauces")] },
    };
    expect(inheritedCategoryGroups(category).map((x) => x.name)).toEqual(["Sauces"]);
  });

  it("takes the category's own groups when it has no parent", () => {
    expect(inheritedCategoryGroups({ optionGroups: [g("Sauces")], parent: null }).map((x) => x.name))
      .toEqual(["Sauces"]);
  });

  it("is empty for a product with no category, or a category with no groups", () => {
    expect(inheritedCategoryGroups(null)).toEqual([]);
    expect(inheritedCategoryGroups(undefined)).toEqual([]);
    expect(inheritedCategoryGroups({})).toEqual([]);
    expect(inheritedCategoryGroups({ optionGroups: null })).toEqual([]);
  });
});

describe("inheritedGroupNames", () => {
  it("is empty when the product opts out of inheritance", () => {
    // `inheritCategoryGlobals === false` means the category contributes
    // nothing, so nothing the product owns can be a duplicate. This is the
    // escape hatch for a product that needs its own version of a group.
    expect(inheritedGroupNames(false, { optionGroups: [g("Sauces"), g("Taille")] }).size).toBe(0);
  });

  it("is the category's group names, normalised, when it inherits", () => {
    expect([...inheritedGroupNames(true, { optionGroups: [g("Sauces"), g(" TAILLE ")] })])
      .toEqual(["sauces", "taille"]);
  });

  it("is empty when the category provides no groups", () => {
    expect(inheritedGroupNames(true, { optionGroups: [] }).size).toBe(0);
  });
});

describe("splitOwnFromInherited", () => {
  it("separates a product group that repeats an inherited one — the L-67 case", () => {
    const inherited = inheritedGroupNames(true, { optionGroups: [g("Sauces")] });
    const { own, duplicatesOfInherited } = splitOwnFromInherited([g("Sauces")], inherited);
    expect(duplicatesOfInherited.map((x) => x.name)).toEqual(["Sauces"]);
    expect(own).toEqual([]);
  });

  it("matches across case and whitespace, as the repair script does", () => {
    const inherited = inheritedGroupNames(true, { optionGroups: [g("Sauces")] });
    const { own, duplicatesOfInherited } = splitOwnFromInherited(
      [g("  sauces "), g("SAUCES")],
      inherited,
    );
    expect(duplicatesOfInherited).toHaveLength(2);
    expect(own).toEqual([]);
  });

  it("keeps a product group the category does not provide", () => {
    // The guard removes duplicates, not product-level groups. A product may
    // legitimately add a group of its own alongside the inherited ones.
    const inherited = inheritedGroupNames(true, { optionGroups: [g("Sauces")] });
    const { own, duplicatesOfInherited } = splitOwnFromInherited(
      [g("Cuisson"), g("Sauces")],
      inherited,
    );
    expect(own.map((x) => x.name)).toEqual(["Cuisson"]);
    expect(duplicatesOfInherited.map((x) => x.name)).toEqual(["Sauces"]);
  });

  it("keeps everything when the product inherits nothing", () => {
    // With inheritance off, an identically-named group IS the product's own —
    // this is what makes the override path work rather than be silently eaten.
    const inherited = inheritedGroupNames(false, { optionGroups: [g("Sauces")] });
    const { own, duplicatesOfInherited } = splitOwnFromInherited([g("Sauces")], inherited);
    expect(own.map((x) => x.name)).toEqual(["Sauces"]);
    expect(duplicatesOfInherited).toEqual([]);
  });

  it("inherits through the parent for a product in a sub-category", () => {
    const category = {
      optionGroups: [g("Autre chose")],
      parent: { optionGroups: [g("Sauces")] },
    };
    const inherited = inheritedGroupNames(true, category);
    const { own, duplicatesOfInherited } = splitOwnFromInherited(
      [g("Sauces"), g("Autre chose")],
      inherited,
    );
    // "Autre chose" belongs to the SUB-category, which a product under it does
    // not inherit — so a product group of that name survives. "Sauces", from the
    // parent, is the one that duplicates.
    expect(duplicatesOfInherited.map((x) => x.name)).toEqual(["Sauces"]);
    expect(own.map((x) => x.name)).toEqual(["Autre chose"]);
  });

  it("preserves the order and identity of the groups it keeps", () => {
    // `sortOrder` is assigned from array position by the writer, so reordering
    // here would silently reorder the option groups on the till.
    const inherited = inheritedGroupNames(true, { optionGroups: [g("Sauces")] });
    const a = { name: "Cuisson" };
    const b = { name: "Accompagnement" };
    const { own } = splitOwnFromInherited([a, g("Sauces"), b], inherited);
    expect(own[0]).toBe(a);
    expect(own[1]).toBe(b);
  });
});
