import { describe, it, expect } from "vitest";
import { wrapToWidth, centred, leftRight, marked } from "@/lib/services/ticket-layout";

// The column layout of a printed ticket.
//
// L-21 (Batch 1.3b) — `center()` padded a string towards the middle of the
// paper and returned it untouched when it was already wider, so the
// restaurant's 56-character address went onto 48-column paper whole.
//
// L-63 (Batch 1.3c) — `leftRight()` overflowed by a different mechanism: it
// clamped the GAP to one space, so an over-wide pair was emitted as
// `left + " " + right`, with the amount past the edge. The option and add-on
// sub-lines were not laid out at all. And the same three-line `center()` was
// copied into `day-close-ticket.ts` and `printer.ts`, defect included — which
// is why these primitives now live in one module.
//
// The property that runs through all of it: **a line that already fits is
// returned byte-identical.** That is what makes the receipt snapshots the
// proof that a change here cannot alter a ticket that was already correct.

/** The live `restaurantAddress`, read from the production `Setting` row. */
const LIVE_ADDRESS = "23 Grande Rue 45210, 45210 Ferrières-en-Gâtinais, France";

describe("wrapToWidth (L-21)", () => {
  it("returns a string that already fits byte-identical", () => {
    // Includes the boundary: exactly `width` characters is a fit, not an
    // overflow.
    for (const s of ["", "x", "12 Rue Test, 75001 Paris", "a".repeat(48)]) {
      expect(wrapToWidth(s, 48)).toEqual([s]);
    }
  });

  it("breaks an over-long line on spaces, never mid-word", () => {
    expect(LIVE_ADDRESS.length).toBe(56);
    const parts = wrapToWidth(LIVE_ADDRESS, 48);
    expect(parts).toEqual(["23 Grande Rue 45210, 45210", "Ferrières-en-Gâtinais, France"]);
    // Nothing lost and nothing invented — the address reads back whole.
    expect(parts.join(" ")).toBe(LIVE_ADDRESS);
    expect(parts.every((p) => p.length <= 48)).toBe(true);
  });

  it("hard-breaks a single token wider than the paper", () => {
    // Word-wrapping alone cannot place a token longer than the line. Emitting
    // it whole would reinstate the defect for the one input that provokes it.
    expect(wrapToWidth("A".repeat(60), 48)).toEqual(["A".repeat(48), "A".repeat(12)]);
    expect(wrapToWidth("A".repeat(100), 48).every((p) => p.length <= 48)).toBe(true);
    // The token's neighbours keep their own lines rather than being absorbed.
    expect(wrapToWidth(`ab ${"C".repeat(10)} de`, 6)).toEqual(["ab", "CCCCCC", "CCCC", "de"]);
  });

  it("terminates on whitespace-only input without dropping or inventing a line", () => {
    expect(wrapToWidth(" ".repeat(60), 48)).toEqual([""]);
    expect(wrapToWidth("", 48)).toEqual([""]);
  });

  it("never breaks at a NON-breaking space, and never replaces one (L-63)", () => {
    // `formatEuro` goes through Intl fr-FR, which puts U+00A0 before the euro
    // sign and U+202F between the thousands. Those characters exist to forbid
    // exactly the break this function would otherwise take. The first
    // rendering of a wrapped add-on line read `+ Supplement ... (1,50` / `EUR)`
    // — an amount torn in half on a fiscal document.
    // Written as ESCAPES, never as the characters themselves: a literal
    // NBSP in a source file is one careless editor away from becoming a
    // plain space, which would make this test pass while asserting nothing.
    const nbsp = "\u00a0";
    const narrow = "\u202f";
    const line = `Supplement galette de pomme de terre (1,50${nbsp}EUR)`;
    const out = wrapToWidth(line, 40);
    expect(out.length).toBeGreaterThan(1);
    // The amount survives whole, on one line, with its NBSP intact.
    expect(out.some((l) => l.includes(`1,50${nbsp}EUR`))).toBe(true);
    expect(out.some((l) => l.includes("1,50 EUR"))).toBe(false);
    // And a narrow no-break space is not a break opportunity either.
    expect(wrapToWidth(`aaaa 1${narrow}234,56${nbsp}EUR`, 16))
      .toEqual(["aaaa", `1${narrow}234,56${nbsp}EUR`]);
    // Ordinary whitespace still breaks, and tabs still count as breaking.
    expect(wrapToWidth("aaaa\tbbbb cccc", 9)).toEqual(["aaaa bbbb", "cccc"]);
  });

  it("does not loop or slice to nothing on a non-positive width", () => {
    // `leftRight` computes a budget and could hand one over. `token.slice(0, 0)`
    // would never shorten the token, so the hard-break loop would never end.
    expect(wrapToWidth("abc", 0)).toEqual(["abc"]);
    expect(wrapToWidth("abc", -5)).toEqual(["abc"]);
  });
});

describe("centred (L-21)", () => {
  it("is the old centre-and-push, exactly, for a line that fits", () => {
    expect(centred("HIBA FOOD", 48)).toEqual([" ".repeat(19) + "HIBA FOOD"]);
    // An empty string centres to half a line of padding — which looks odd and
    // is EXACTLY what the three inlined `center()` helpers already did. A
    // blank `footerNote` is the one way to reach it. Byte-identical means
    // byte-identical, including the parts nobody would have designed.
    expect(centred("", 48)).toEqual([" ".repeat(24)]);
  });

  it("centres each line of something that had to be wrapped", () => {
    const out = centred(LIVE_ADDRESS, 48);
    expect(out).toHaveLength(2);
    expect(out.every((l) => l.length <= 48)).toBe(true);
    expect(out.map((l) => l.trim()).join(" ")).toBe(LIVE_ADDRESS);
    // Centred, not left-flushed: both lines carry leading padding.
    expect(out.every((l) => l.startsWith(" "))).toBe(true);
  });
});

// L-63 (Batch 1.3c) — the second overflow.
//
// Measured 2026-09-07 from the schema's own maxima: the cashier line reached
// 62 columns (`userSchema.name` allows 60) and the item line 69
// (`productSchema.name` allows 80), against 48 columns of paper.
describe("leftRight (L-63)", () => {
  it("returns ONE byte-identical line whenever the pair fits", () => {
    // The fitting condition and the no-wrap condition are the same inequality,
    // so this is a property of the arithmetic and not a special case. The last
    // case is the exact boundary: 40 + 1 + 7 === 48.
    const cases: [string, string, number][] = [
      ["Sous-total", "22,50 €", 48],
      ["Caissier : Admin", "Service 7", 32],
      ["x".repeat(40), "1234567", 48],
    ];
    for (const [l, r, w] of cases) {
      const out = leftRight(l, r, w);
      expect(out).toHaveLength(1);
      expect(out[0]).toBe(l + " ".repeat(w - l.length - r.length) + r);
      expect(out[0].length).toBe(w);
    }
  });

  it("keeps at least one space between the two halves at the boundary", () => {
    // 41 + 7 === 48 exactly: there is no room for a separator, so this must
    // wrap rather than run the amount into the label.
    const out = leftRight("x".repeat(41), "1234567", 48);
    expect(out).toHaveLength(2);
    expect(out.every((l) => l.length <= 48)).toBe(true);
  });

  it("wraps the label and right-aligns the amount on the LAST line", () => {
    const label = "2× Menu Maxi Best Of Double Cheeseburger Bacon Frites Boisson";
    const out = leftRight(label, "24,00 €", 48);
    expect(out.every((l) => l.length <= 48)).toBe(true);
    // Exactly one amount, and it is on the final line — which is what keeps a
    // wrapped label distinguishable from the start of a new article.
    expect(out.filter((l) => l.includes("24,00 €"))).toHaveLength(1);
    expect(out[out.length - 1].endsWith("24,00 €")).toBe(true);
    expect(out[out.length - 1].length).toBe(48);
    // Nothing of the label is lost — no ellipsis, no truncation. BOFiP § 50
    // lists the article's libellé among the data in scope.
    expect(out.join(" ").replace("24,00 €", "").split(/\s+/).filter(Boolean).join(" "))
      .toBe(label);
  });

  it("never truncates, at any width, for any label", () => {
    const label = "Caissier : Jean-Baptiste de la Tour du Pin Verclause";
    for (let w = 32; w <= 48; w++) {
      const out = leftRight(label, "Service 3", w);
      expect({ w, over: out.filter((l) => l.length > w) }).toEqual({ w, over: [] });
      const back = out.join(" ").replace("Service 3", "").split(/\s+/).filter(Boolean).join(" ");
      expect({ w, back }).toEqual({ w, back: label });
    }
  });

  it("survives an amount as wide as the paper", () => {
    // A guard, not an expected path: the budget would go non-positive and the
    // label would have nowhere to go. Unreachable with real money at 32+.
    const out = leftRight("Total", "9".repeat(48), 48);
    expect(out.every((l) => l.length <= 48)).toBe(true);
    expect(out.some((l) => l.includes("Total"))).toBe(true);
    expect(out.some((l) => l.includes("9".repeat(48)))).toBe(true);
  });
});

describe("marked (L-63)", () => {
  it("is the old raw push, exactly, for a sub-line that fits", () => {
    expect(marked("  · ", "Mayonnaise", 48)).toEqual(["  · Mayonnaise"]);
    expect(marked("  + ", "Bacon (1,50 €)", 48)).toEqual(["  + Bacon (1,50 €)"]);
  });

  it("indents continuations past the marker, so they cannot read as a new choice", () => {
    const out = marked("  · ", "Sauce blanche maison à l'ail et aux fines herbes", 48);
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((l) => l.length <= 48)).toBe(true);
    expect(out[0].startsWith("  · ")).toBe(true);
    // Every continuation is four spaces — aligned under the text, and NOT
    // starting a marker of its own.
    for (const l of out.slice(1)) {
      expect(l.startsWith("    ")).toBe(true);
      expect(l.trimStart().startsWith("· ")).toBe(false);
      expect(l.trimStart().startsWith("+ ")).toBe(false);
    }
    expect(out.map((l) => l.trim()).join(" ")).toBe("· Sauce blanche maison à l'ail et aux fines herbes");
  });

  it("holds at every supported width", () => {
    const text = "Supplément galette de pomme de terre (1,50 €)";
    for (let w = 32; w <= 48; w++) {
      const out = marked("  + ", text, w);
      expect({ w, over: out.filter((l) => l.length > w) }).toEqual({ w, over: [] });
    }
  });
});
