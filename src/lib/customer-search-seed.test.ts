import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { looksLikePhone, seedFromSearch } from "@/lib/customer-search-seed";

// L-224 — THE NUMBER IS TYPED ONCE.
//
// WHAT THE OWNER REPORTED, 2026-09-19, at the caisse on a livraison: you type
// the customer's telephone number into the picker's search, find nothing
// because they are new, click « Créer un nouveau client » — and the form opens
// EMPTY. You type the same number again, with a queue waiting.
//
// Two groups, and the second is the one that would have caught the shape of
// this project's recurring mistake: a rule that is only ever spelled inside a
// component's `onClick` is a rule no test can call. L-214 found exactly that
// with `customerFormBlocked`, whose revert stayed green because the only
// assertion covering it was that the OLD text had gone.

describe("L-224 — which box the search text lands in", () => {
  it("PUTS A TELEPHONE NUMBER IN THE TELEPHONE BOX — the case that was asked for", () => {
    expect(seedFromSearch("0612131415")).toEqual({ name: "", phone: "0612131415" });
  });

  it("KEEPS IT EXACTLY AS TYPED, spaces and all", () => {
    // Never reformatted. This restaurant writes « 06 12 13 14 15 » and that is
    // what is stored; a normaliser here would put a second spelling of every
    // number into the customer file, and the list searches with `contains`, so
    // the two spellings would stop finding each other.
    for (const typed of ["06 12 13 14 15", "06.12.13.14.15", "+33 6 12 13 14 15", "06-12-13-14-15"]) {
      expect(seedFromSearch(typed), `« ${typed} » was reformatted or misrouted`).toEqual({
        name: "",
        phone: typed,
      });
    }
  });

  it("puts anything else in the NAME box", () => {
    expect(seedFromSearch("Dupont")).toEqual({ name: "Dupont", phone: "" });
    expect(seedFromSearch("Jean Dupont")).toEqual({ name: "Jean Dupont", phone: "" });
  });

  it("ONE LETTER DISQUALIFIES THE WHOLE STRING, which is what keeps an address out", () => {
    // « 12 rue des Lilas » is mostly not digits, but the guard that matters is
    // the letter, not the ratio: a ratio rule would route « 75001 Paris » to
    // the telephone box.
    expect(seedFromSearch("12 rue des Lilas")).toEqual({ name: "12 rue des Lilas", phone: "" });
    expect(seedFromSearch("75001 Paris")).toEqual({ name: "75001 Paris", phone: "" });
    expect(looksLikePhone("0612131415x")).toBe(false);
  });

  it("does not call one, two or three digits a telephone number", () => {
    // A cashier starting to type a house number, or a name with a digit in it.
    // « 3 » sitting in the telephone box is noise somebody has to clear.
    expect(looksLikePhone("3")).toBe(false);
    expect(looksLikePhone("12")).toBe(false);
    expect(looksLikePhone("123")).toBe(false);
    expect(seedFromSearch("123")).toEqual({ name: "123", phone: "" });
    // Four is the threshold, and a half-typed number still counts.
    expect(looksLikePhone("0612")).toBe(true);
    expect(seedFromSearch("0612")).toEqual({ name: "", phone: "0612" });
  });

  it("trims, so a trailing space does not become part of a name", () => {
    expect(seedFromSearch("  Dupont  ")).toEqual({ name: "Dupont", phone: "" });
    expect(seedFromSearch("  0612131415 ")).toEqual({ name: "", phone: "0612131415" });
  });

  it("GIVES BACK THE EMPTY FORM for an empty search, so the caller has no special case", () => {
    expect(seedFromSearch("")).toEqual({ name: "", phone: "" });
    expect(seedFromSearch("   ")).toEqual({ name: "", phone: "" });
    expect(looksLikePhone("")).toBe(false);
    expect(looksLikePhone("   ")).toBe(false);
  });

  it("never fills BOTH boxes, whatever it is given", () => {
    // The property, rather than another example. Two seeded boxes would mean a
    // cashier clearing one every time instead of typing into an empty one.
    for (const q of ["0612131415", "Dupont", "12 rue des Lilas", "", "   ", "+33612131415", "3"]) {
      const seed = seedFromSearch(q);
      expect(Boolean(seed.name) && Boolean(seed.phone), `both boxes filled for « ${q} »`).toBe(false);
    }
  });
});

describe("L-224 — and the picker actually calls it", () => {
  // A unit test on an extracted rule proves the rule, NOT that anything calls
  // it. This project has shipped that gap three times, which is why the plan's
  // loop makes it step 4. Asserted against the code with its comments stripped:
  // the file's own comments quote the behaviour, and an assertion that matches
  // the prose written to explain it is the trap L-213 and L-214 both hit.
  const code = (rel: string) =>
    readFileSync(path.join(process.cwd(), "src", ...rel.split("/")), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("seeds the create form from the search box", () => {
    const picker = code("components/pos/customer-picker-dialog.tsx");
    expect(picker, "the picker does not import the rule").toContain("customer-search-seed");
    expect(picker, "the Créer button does not seed from the search").toContain("seedFromSearch(search)");
  });

  it("DOES NOT SPELL THE RULE OUT FOR ITSELF", () => {
    // The drift shape. If the picker grows its own digit test, the rule and the
    // component can disagree and only one of them has tests.
    const picker = code("components/pos/customer-picker-dialog.tsx");
    for (const inlined of ["replace(/\\D/g", "/^\\+?[\\d", "looksLikePhone("]) {
      expect(picker, `the picker is deciding for itself: « ${inlined} »`).not.toContain(inlined);
    }
  });

  it("still opens the ADDRESS and VILLE boxes empty", () => {
    // L-221's two boxes are not seeded from anything. The search matches a town
    // since L-221, so « Villeurbanne » typed into it would otherwise have a
    // claim on the Ville box — and a town guessed from a search is a town
    // nobody chose, on a field a delivery is refused without.
    const picker = code("components/pos/customer-picker-dialog.tsx");
    expect(picker).toContain('address: "", city: ""');
  });
});
