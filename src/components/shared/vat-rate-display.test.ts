import { describe, it, expect } from "vitest";
import { formatVatRate } from "@/components/shared/report-widgets";
import { vatRateKey } from "@/lib/money";

// L-19 (Batch 7.4c) — a VAT rate on a fiscal report must be shown exactly.
//
// THE FINDING. `report-widgets.tsx` rendered `Number(r).toFixed(1) + " %"`, so
// a Corsican or overseas rate of **1,05 % displayed as "1.1 %"** — a WRONG
// RATE on a fiscal report, not merely an ugly one — and 10 % displayed as
// "10.0 %". Pre-existing, and *improved* by Batch 3.1: before that, 1,05 % was
// keyed "1" and lost entirely.
//
// WHAT THE ROW INSISTED ON, and this file pins both halves: **the display
// layer is what needed fixing, not the key.** `vatRateKey` decides how a rate
// is stored and grouped and Batch 3.1 settled it; changing it here would
// regroup figures that are already sealed.
//
// Unreachable today — every product is at 10 % or 5,5 % — and asserted anyway
// so a later batch does not quietly restore the defect.

describe("L-19 — VAT rates display exactly", () => {
  it("shows the two rates this restaurant actually uses", () => {
    expect(formatVatRate(10)).toBe("10");
    expect(formatVatRate(5.5)).toBe("5,5");
    // French decimal comma, like every money figure on the same ticket.
    expect(formatVatRate(5.5)).not.toContain(".");
  });

  it("shows a two-decimal rate exactly, which is the defect", () => {
    // The Corsican / overseas case the row names. `toFixed(1)` gave "1.1".
    expect(formatVatRate(1.05)).toBe("1,05");
    expect(formatVatRate(2.1)).toBe("2,1");
    expect(formatVatRate(8.5)).toBe("8,5");
    expect(formatVatRate(0.9)).toBe("0,9");
  });

  it("does not print a trailing zero on a whole rate", () => {
    // "10.0 %" was the cosmetic half of the same defect.
    expect(formatVatRate(20)).toBe("20");
    expect(formatVatRate("10")).toBe("10");
  });

  it("survives a key it cannot parse rather than rendering NaN", () => {
    // The breakdown is keyed by string, and a report renders whatever the key
    // says. Showing the raw key beats showing "NaN %" on a fiscal document.
    expect(formatVatRate("abc")).toBe("abc");
  });

  it("leaves the KEY alone — the row's other half", () => {
    // `vatRateKey` is how a rate is stored and grouped. It is unchanged, and
    // it is what Batch 3.1 fixed so 1,05 % stopped being keyed "1".
    expect(vatRateKey(1.05)).not.toBe("1");
    // …and the display of that key round-trips to the rate itself.
    expect(formatVatRate(vatRateKey(1.05))).toBe("1,05");
    expect(formatVatRate(vatRateKey(5.5))).toBe("5,5");
    expect(formatVatRate(vatRateKey(10))).toBe("10");
  });
});
