import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  NO_QUOTA,
  checkGroupSelection,
  countChoices,
  quotaFor,
  quotaGroupsFor,
  quotaPayload,
  withPinnedChoices,
} from "@/lib/option-quota";

// L-217 — HOW MANY VIANDES A SIZE INCLUDES.
//
// THE HOLE. The operator entered the tacos with `Viande` as a category group,
// required and multi-select. The server enforced « at least one » and « at most
// one for a single-select group », and nothing anywhere enforced a ceiling — so
// a Tacos M at 6,90 € took all six viandes for 6,90 €.
//
// THE RULES, settled by the operator 2026-09-18: M=1, L=2, XL=3, as a CEILING
// and not a requirement; the same viande may be taken twice; and beyond the
// count is REFUSED rather than charged.

describe("L-217 — a repeat is a quantity", () => {
  it("counts the same choice twice instead of collapsing it", () => {
    // THE DEFECT, exactly: the `Set` this replaces made « 2 × viande hachée »
    // into one viande. The second was ordered, prepared, and never priced or
    // printed.
    const counts = countChoices(["hachee", "hachee"]);
    expect(counts.get("hachee")).toBe(2);
  });

  it("counts distinct choices separately", () => {
    const counts = countChoices(["hachee", "merguez", "hachee"]);
    expect(counts.get("hachee")).toBe(2);
    expect(counts.get("merguez")).toBe(1);
    expect(counts.size).toBe(2);
  });

  it("is empty for an empty selection", () => {
    expect(countChoices([]).size).toBe(0);
  });

  it("does NOT double a menu's pinned choice the cashier also tapped", () => {
    // Batch 5.9 pins the choices a menu governs, and they used to join the
    // cashier's through a union of SETS — so an id in both counted once.
    // Adding them to a multiset would charge a menu's size twice over.
    const counts = withPinnedChoices(countChoices(["senior"]), ["senior"]);
    expect(counts.get("senior")).toBe(1);
  });

  it("still adds a pinned choice the cashier did not tap", () => {
    const counts = withPinnedChoices(countChoices([]), ["senior"]);
    expect(counts.get("senior")).toBe(1);
  });

  it("leaves a genuine repeat alone while pinning", () => {
    const counts = withPinnedChoices(countChoices(["hachee", "hachee"]), ["senior"]);
    expect(counts.get("hachee")).toBe(2);
    expect(counts.get("senior")).toBe(1);
  });
});

describe("L-217 — the ceiling a size includes", () => {
  const viande = (quota: number | null, productName = "Tacos L") => ({
    groupName: "Viande",
    productName,
    required: true,
    multiple: true,
    quota,
  });

  it("REFUSES a third viande on a Tacos L", () => {
    expect(checkGroupSelection(viande(2), 3)).toBe("« Viande » : 2 au maximum pour Tacos L.");
  });

  it("REFUSES the six-viande Tacos M that started this", () => {
    // 6,90 € for five free meats, accepted by the server until now.
    expect(checkGroupSelection(viande(1, "Tacos M"), 6)).toBe(
      "« Viande » : 1 au maximum pour Tacos M.",
    );
  });

  it("ACCEPTS the count the size includes", () => {
    expect(checkGroupSelection(viande(1, "Tacos M"), 1)).toBeNull();
    expect(checkGroupSelection(viande(2), 2)).toBeNull();
    expect(checkGroupSelection(viande(3, "Tacos XL"), 3)).toBeNull();
  });

  it("IS A CEILING, NOT A REQUIREMENT — one viande on an L is fine", () => {
    // The operator's decision: a customer who wants one meat on an L pays the
    // L price and is served. `required` supplies the floor, so an L is 1 or 2.
    expect(checkGroupSelection(viande(2), 1)).toBeNull();
  });

  it("still refuses NOTHING at all, because the group is required", () => {
    expect(checkGroupSelection(viande(2), 0)).toBe("Option obligatoire manquante : Viande");
  });

  it("reports the floor BEFORE the ceiling", () => {
    // A cashier who has chosen nothing is told to choose, not told about a
    // maximum they are nowhere near.
    expect(checkGroupSelection({ ...viande(2), required: true }, 0)).toContain("obligatoire");
  });

  it("CHANGES NOTHING for a group with no quota — every other group in the catalogue", () => {
    // Sauces, Crudités, Type de pain, Taille… none has a quota row, and each
    // must behave exactly as it did before this existed.
    const sauces = { groupName: "Sauces", productName: "Le Kebab", required: false, multiple: true, quota: NO_QUOTA };
    expect(checkGroupSelection(sauces, 0)).toBeNull();
    expect(checkGroupSelection(sauces, 9)).toBeNull();
  });

  it("keeps the single-select rule, which is a different rule", () => {
    const taille = { groupName: "Taille", productName: "Margarita", required: true, multiple: false, quota: NO_QUOTA };
    expect(checkGroupSelection(taille, 2)).toBe("Une seule sélection autorisée pour : Taille");
    expect(checkGroupSelection(taille, 1)).toBeNull();
  });

  it("does not ask a group the MENU governs for something it never showed", () => {
    const governed = { groupName: "Taille", productName: "Margarita", required: true, multiple: false, quota: NO_QUOTA, governed: true };
    expect(checkGroupSelection(governed, 0)).toBeNull();
  });
});

describe("L-217 — reading a product's quota", () => {
  const quotas = [
    { groupId: "g-viande", included: 2 },
    { groupId: "g-sauce", included: 5 },
  ];

  it("finds the group's own number", () => {
    expect(quotaFor(quotas, "g-viande")).toBe(2);
    expect(quotaFor(quotas, "g-sauce")).toBe(5);
  });

  it("answers NO_QUOTA for a group with no row, and for a product with none", () => {
    expect(quotaFor(quotas, "g-crudites")).toBe(NO_QUOTA);
    expect(quotaFor([], "g-viande")).toBe(NO_QUOTA);
    expect(quotaFor(null, "g-viande")).toBe(NO_QUOTA);
    expect(quotaFor(undefined, "g-viande")).toBe(NO_QUOTA);
  });

  it("treats a quota of ZERO as a real ceiling, not as absent", () => {
    // `included: 0` would mean « this size includes none of that group ». It
    // must not read as « no quota », which a truthiness test would do.
    expect(quotaFor([{ groupId: "g", included: 0 }], "g")).toBe(0);
    expect(checkGroupSelection(
      { groupName: "Viande", productName: "Salade Verte", required: false, multiple: true, quota: 0 },
      1,
    )).toContain("0 au maximum");
  });
});

describe("L-217 — the rule is CONSULTED, not merely written", () => {
  // Method 4 of the plan: a unit test on an extracted rule proves the rule, not
  // that anything calls it. A quota nothing fetches is a quota that does not
  // exist, and the till would go on selling six-viande M's.

  const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

  it("the checkout PRICES with it", () => {
    const pricing = read("src/lib/services/pricing.ts");
    expect(pricing).toContain('from "@/lib/option-quota"');
    expect(pricing).toContain("checkGroupSelection(");
    expect(pricing, "the quota is not read from the product").toContain(
      "quotaFor(product.optionQuotas, group.id)",
    );
  });

  it("the checkout FETCHES it — the route and the menu path both", () => {
    for (const f of ["src/app/api/orders/route.ts", "src/lib/services/combo-checkout.ts"]) {
      expect(read(f), `${f} does not fetch optionQuotas, so the rule can never fire`).toContain(
        "optionQuotas: { select: { groupId: true, included: true } }",
      );
    }
  });

  it("the Set that swallowed a repeat is GONE from the pricing path", () => {
    const code = read("src/lib/services/pricing.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code, "the union-of-sets is back and a repeat is collapsed again").not.toContain(
      "new Set([...itemIntent.optionIds",
    );
    expect(code).toContain("countChoices(itemIntent.optionIds)");
  });

  it("the price counts every occurrence", () => {
    const code = read("src/lib/services/pricing.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code, "a repeated PAID choice is charged once").toContain("modifier * quantity");
  });
});

describe("L-220 — which groups the product form offers a count for", () => {
  // THE DEFECT. The gate read `product.options` for its inherited groups, and a
  // product BEING CREATED has none — so the field was invisible on the create
  // screen and the operator had to save, reopen, and come back to say how many
  // viandes a size included. The groups belong to the CATEGORY, which the form
  // has known since its first render.
  const tacos = {
    optionGroups: [
      { id: "g-viande", name: "Viande", multiple: true },
      { id: "g-sauces", name: "Sauces", multiple: true },
      { id: "g-taille", name: "Taille", multiple: false },
    ],
  };

  it("offers the category's MULTI-SELECT groups, with no saved product at all", () => {
    // The create screen: there is no product, and this must still answer.
    expect(quotaGroupsFor(tacos, true).map((g) => g.id)).toEqual(["g-viande", "g-sauces"]);
  });

  it("LEAVES SINGLE-SELECT GROUPS OUT", () => {
    // `Taille`, `Type de pain`, `Frite`, `Type de frite`. `!multiple` already
    // caps them at one, so a count could never be reached and the box would be
    // asking a question with no answer.
    expect(quotaGroupsFor(tacos, true).some((g) => g.id === "g-taille")).toBe(false);
  });

  it("offers NOTHING when the product does not inherit the category's globals", () => {
    // It never sees those groups, so a ceiling on one would be inert.
    expect(quotaGroupsFor(tacos, false)).toEqual([]);
  });

  it("offers nothing for a category with no groups, or none loaded yet", () => {
    expect(quotaGroupsFor({ optionGroups: [] }, true)).toEqual([]);
    expect(quotaGroupsFor(undefined, true)).toEqual([]);
    expect(quotaGroupsFor(null, true)).toEqual([]);
  });
});

describe("L-220 — what the form sends", () => {
  const groups = [{ id: "g-viande" }, { id: "g-sauces" }];

  it("sends the numbers that were typed", () => {
    expect(quotaPayload(groups, { "g-viande": "2", "g-sauces": "3" })).toEqual([
      { groupId: "g-viande", included: 2 },
      { groupId: "g-sauces", included: 3 },
    ]);
  });

  it("drops an EMPTY box — that is « no ceiling », not zero", () => {
    expect(quotaPayload(groups, { "g-viande": "2", "g-sauces": "" })).toEqual([
      { groupId: "g-viande", included: 2 },
    ]);
    expect(quotaPayload(groups, { "g-viande": "  " })).toEqual([]);
  });

  it("KEEPS A ZERO, because « this size includes none of that group » is an answer", () => {
    expect(quotaPayload(groups, { "g-viande": "0" })).toEqual([{ groupId: "g-viande", included: 0 }]);
  });

  it("DROPS A NUMBER LEFT OVER FROM ANOTHER CATEGORY", () => {
    // Changing a product's category leaves the previous category's numbers in
    // the form's state. Sending those would write a ceiling against a group the
    // product cannot see — inert, invisible, and baffling to whoever next reads
    // the table and finds a Tacos rule attached to a burger.
    expect(quotaPayload(groups, { "g-viande": "2", "g-crudites-from-burgers": "1" })).toEqual([
      { groupId: "g-viande", included: 2 },
    ]);
  });

  it("refuses rubbish rather than sending it", () => {
    expect(quotaPayload(groups, { "g-viande": "deux" })).toEqual([]);
    expect(quotaPayload(groups, { "g-viande": "-1" })).toEqual([]);
    expect(quotaPayload(groups, { "g-viande": "1.5" })).toEqual([]);
  });

  it("sends an EMPTY ARRAY when nothing is set, which is how a ceiling is cleared", () => {
    // Not `undefined`: the schema treats absent as « leave the stored ones
    // alone », so the form must always say what it means.
    expect(quotaPayload(groups, {})).toEqual([]);
    expect(quotaPayload([], { "g-viande": "2" })).toEqual([]);
  });
});

describe("L-220 — and the form actually uses them", () => {
  const src = readFileSync(path.join(process.cwd(), "src/features/catalog/products-view.tsx"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("derives the boxes from the CATEGORY, not from the saved product", () => {
    expect(code).toContain("quotaGroupsFor(globalsCategoryDetail, inheritCategoryGlobals)");
    expect(code, "the create screen reads the product's groups again").not.toContain(
      "(product?.options ?? []).some((g) => g.inherited && g.multiple)",
    );
  });

  it("builds the payload from the boxes ON SCREEN", () => {
    expect(code).toContain("quotaPayload(quotaGroups, quotas)");
  });

  it("fetches that category, AND ACTUALLY RUNS THE QUERY", () => {
    // The URL alone was asserted first, and that survived its own revert:
    // `enabled: false` leaves the fetch written and never run, so the boxes are
    // always empty and the assertion goes on passing. Same lesson as the other
    // source assertions in this project — name the thing, not a substring of it.
    expect(code).toContain("/api/catalog/categories/${globalsCategory!.id}");
    expect(code, "the category query is never enabled, so nothing is fetched").toContain(
      "enabled: !!globalsCategory?.id",
    );
  });
});
