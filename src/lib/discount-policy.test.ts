import { describe, it, expect } from "vitest";
import { discountNeedsStepUp } from "@/lib/discount-policy";
import { toCents } from "@/lib/money";

// DD-19 / L-34, Batch 4.4c — the rule that decides whether the operator is
// asked for their PIN, and the arithmetic the operator reads to predict it.
//
// Before this batch the rule was written twice and the display was written a
// third way. `orders/route.ts` used `(discountTotal / subtotal) * 100 >
// threshold` on cents; `payment-dialog.tsx` used the same on cents but with a
// `+ 0.01` fudge, behind a `false` constant that made the disagreement
// invisible; and `discount-dialog.tsx:35` divided EUROS by CENTS, so a 40 %
// discount was shown as 0.4 %. One function now serves all three.

describe("discountNeedsStepUp — the gate", () => {
  it("does not prompt below the threshold", () => {
    // 2,00 € off a 20,00 € subtotal = 10 %.
    expect(discountNeedsStepUp(200, 2000, 20)).toBe(false);
  });

  it("does not prompt at exactly the threshold", () => {
    // 4,00 € off 20,00 € = 20 %. Strictly greater than, as the route always
    // was — changing this would silently start prompting on a round number.
    expect(discountNeedsStepUp(400, 2000, 20)).toBe(false);
  });

  it("prompts one cent above the threshold", () => {
    expect(discountNeedsStepUp(401, 2000, 20)).toBe(true);
  });

  it("has no tolerance band above the threshold", () => {
    // `payment-dialog.tsx` used to compare against `threshold + 0.01`, so a
    // discount between 20 % and 20.01 % prompted on the server's rule and not
    // on the client's. 20,01 € off 100,00 € is exactly 20.01 % — above the
    // threshold, and inside the old fudge. It must prompt.
    expect(discountNeedsStepUp(2001, 10000, 20)).toBe(true);
  });

  it("prompts on a full comp", () => {
    // The case DD-19 names: a 100 % discount at an unattended till.
    expect(discountNeedsStepUp(2000, 2000, 20)).toBe(true);
  });

  it("never prompts with no discount, and never divides by zero", () => {
    expect(discountNeedsStepUp(0, 2000, 20)).toBe(false);
    expect(discountNeedsStepUp(500, 0, 20)).toBe(false);
    expect(discountNeedsStepUp(0, 0, 20)).toBe(false);
    expect(discountNeedsStepUp(-100, 2000, 20)).toBe(false);
  });

  it("reads the threshold as a percentage, not a fraction", () => {
    // 50 % off, threshold 20 → prompt. If the threshold were ever read as
    // 0.20 this would be false and the prompt would never fire.
    expect(discountNeedsStepUp(1000, 2000, 20)).toBe(true);
    expect(discountNeedsStepUp(1000, 2000, 60)).toBe(false);
  });
});

describe("L-34 — the percentage the discount dialog shows", () => {
  // The dialog holds the typed amount in EUROS and the cart subtotal in
  // CENTS. The defective line was:
  //     Math.round((value / subtotal) * 1000) / 10   // euros ÷ cents
  // The fix converts first. Both forms are computed here so the regression is
  // pinned by the difference, not by a comment.
  const shown = (valueEuros: number, subtotalCents: number) =>
    subtotalCents > 0 ? Math.round((toCents(valueEuros) / subtotalCents) * 1000) / 10 : 0;
  const defective = (valueEuros: number, subtotalCents: number) =>
    subtotalCents > 0 ? Math.round((valueEuros / subtotalCents) * 1000) / 10 : 0;

  it("shows 40% for the case measured in Batch 4.4b's walkthrough", () => {
    // 1,20 € off a 3,00 € subtotal, observed displaying as « 0.4% ».
    expect(shown(1.2, 300)).toBe(40);
    expect(defective(1.2, 300)).toBe(0.4);
  });

  it("shows 100% for a full comp", () => {
    expect(shown(20, 2000)).toBe(100);
  });

  it("agrees with the gate at the boundary", () => {
    // The figure the operator reads and the rule that prompts must not
    // disagree: at 20,01 % one says "above the threshold" and the other must
    // not still be printing 20 %.
    const subtotal = 2000;
    expect(shown(4.0, subtotal)).toBe(20);
    expect(discountNeedsStepUp(toCents(4.0), subtotal, 20)).toBe(false);
    expect(shown(4.01, subtotal)).toBe(20.1);
    expect(discountNeedsStepUp(toCents(4.01), subtotal, 20)).toBe(true);
  });
});
