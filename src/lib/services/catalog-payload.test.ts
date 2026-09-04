import { describe, it, expect } from "vitest";
import {
  checkOptionGroups,
  checkAddOns,
  checkCategoryCollections,
} from "@/lib/services/catalog-payload";

// C-24, Batch 4.6 — category updates deleted option groups wholesale and
// skipped invalid entries silently.
//
// Before this batch `PUT /api/catalog/categories/[id]` ran
// `categoryOptionGroup.deleteMany({ categoryId })` and THEN validated each
// entry inside the recreate loop, with `if (!parsed.success) continue`. One
// malformed group in an otherwise-valid save therefore destroyed the
// category's existing configuration and answered 200. The add-ons had the
// same shape.
//
// These tests assert the property that closes it: a payload with any invalid
// entry is refused as a whole, and the refusal is produced BEFORE anything
// could be deleted — which is what makes it a pure function over the body
// rather than a check inside the transaction.
//
// What they do not assert: the HTTP status, or that the route actually calls
// this before opening its transaction. `withAuth` → `getSession()` →
// `cookies()` throws outside a request scope, so that needs the request
// harness Batch 6.1 owns. The route wiring is verified manually in this
// batch's status record.

const validGroup = {
  name: "Sauces",
  choices: [{ name: "Algérienne", priceModifier: 0 }],
};
const validAddOn = { name: "Cheddar", price: 100 };

describe("checkOptionGroups", () => {
  it("accepts a well-formed list", () => {
    const result = checkOptionGroups([validGroup]);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].name).toBe("Sauces");
      expect(result.entries[0].choices[0].name).toBe("Algérienne");
    }
  });

  it("refuses the whole list when ONE group is malformed", () => {
    // The C-24 scenario exactly: a valid group beside a nameless one. The old
    // code deleted both and recreated only the first.
    const result = checkOptionGroups([validGroup, { name: "", choices: [{ name: "x" }] }]);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.error).toContain("n°2");
      expect(result.error).toContain("Aucune modification");
    }
  });

  it("names the position of the offending entry, 1-based", () => {
    const result = checkOptionGroups([validGroup, validGroup, { name: "", choices: [{ name: "x" }] }]);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.error).toContain("n°3");
  });

  it("refuses a group with no choices", () => {
    // categoryOptionGroupSchema requires at least one choice; an empty group
    // is meaningless in the POS picker.
    const result = checkOptionGroups([{ name: "Sauces", choices: [] }]);
    expect(result.kind).toBe("invalid");
  });

  it("distinguishes absent from empty", () => {
    // The heart of the finding's product-side half, and the reason this is
    // a three-way result rather than a boolean: absent must leave the
    // existing rows alone, `[]` must clear them.
    expect(checkOptionGroups(undefined).kind).toBe("absent");
    expect(checkOptionGroups(null).kind).toBe("absent");
    const empty = checkOptionGroups([]);
    expect(empty.kind).toBe("ok");
    if (empty.kind === "ok") expect(empty.entries).toEqual([]);
  });

  it("refuses a present value that is not a list", () => {
    // This used to fall through `Array.isArray` and be ignored, so a caller
    // sending the wrong type got 200 and no change.
    const result = checkOptionGroups("Sauces");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.error).toContain("liste");
  });
});

describe("checkAddOns", () => {
  it("accepts a well-formed list", () => {
    const result = checkAddOns([validAddOn]);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.entries[0].price).toBe(100);
  });

  it("refuses the whole list when one add-on is malformed", () => {
    const result = checkAddOns([validAddOn, { name: "Bacon", price: -5 }]);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.error).toContain("n°2");
  });

  it("refuses a negative price", () => {
    expect(checkAddOns([{ name: "X", price: -1 }]).kind).toBe("invalid");
  });

  it("distinguishes absent from empty", () => {
    expect(checkAddOns(undefined).kind).toBe("absent");
    expect(checkAddOns([]).kind).toBe("ok");
  });
});

describe("checkCategoryCollections", () => {
  it("passes both collections through when both are good", () => {
    const result = checkCategoryCollections({
      optionGroups: [validGroup],
      addOns: [validAddOn],
    });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.optionGroups.kind).toBe("ok");
      expect(result.addOns.kind).toBe("ok");
    }
  });

  it("refuses when only the add-ons are malformed, protecting the option groups", () => {
    // The compound case that matters most. The route replaces both in ONE
    // transaction, so a valid `optionGroups` beside a broken `addOns` must
    // not cause the option groups to be deleted either.
    const result = checkCategoryCollections({
      optionGroups: [validGroup],
      addOns: [{ name: "Bacon", price: -5 }],
    });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("Supplément");
  });

  it("refuses when only the option groups are malformed", () => {
    const result = checkCategoryCollections({
      optionGroups: [{ name: "", choices: [{ name: "x" }] }],
      addOns: [validAddOn],
    });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("Groupe d'options");
  });

  it("treats a body carrying neither field as two absences", () => {
    // A PUT that only renames the category must not touch either collection.
    const result = checkCategoryCollections({});
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.optionGroups.kind).toBe("absent");
      expect(result.addOns.kind).toBe("absent");
    }
  });
});
