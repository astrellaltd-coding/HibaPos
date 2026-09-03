import { describe, it, expect } from "vitest";
import { round2, addToVatBreakdown, splitVat, sum2, toCents, fromCents, parseEuroInput, vatRateKey, type VatBreakdown } from "./money";

describe("toCents and fromCents", () => {
  it("converts euro decimals to exact cents", () => {
    expect(toCents(12.5)).toBe(1250);
    expect(toCents(0.99)).toBe(99);
    expect(toCents(10)).toBe(1000);
    expect(toCents(0)).toBe(0);
  });

  it("converts cents back to euro decimals", () => {
    expect(fromCents(1250)).toBe(12.5);
    expect(fromCents(99)).toBe(0.99);
    expect(fromCents(1000)).toBe(10);
    expect(fromCents(0)).toBe(0);
  });

  it("round-trips without drift for typical POS amounts", () => {
    for (const euros of [9.9, 7.5, 11.5, 0.5, 1.8, 2.2, 250.0]) {
      expect(fromCents(toCents(euros))).toBeCloseTo(euros, 10);
    }
  });
});

describe("round2", () => {
  it("rounds to 2 decimals (half-up)", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(1.004)).toBe(1.0);
    expect(round2(10.999)).toBe(11.0);
    expect(round2(2.675)).toBe(2.68);
  });
});

describe("splitVat (cents)", () => {
  it("splits 10% VAT correctly (1100 cents = 11.00 € TTC)", () => {
    const result = splitVat(1100, 10);
    expect(result.ht).toBe(1000);
    expect(result.vat).toBe(100);
    expect(result.ttc).toBe(1100);
  });

  it("splits 20% VAT correctly (1200 cents = 12.00 € TTC)", () => {
    const result = splitVat(1200, 20);
    expect(result.ht).toBe(1000);
    expect(result.vat).toBe(200);
    expect(result.ttc).toBe(1200);
  });

  it("splits 5.5% VAT correctly (550 cents = 5.50 € TTC)", () => {
    const result = splitVat(550, 5.5);
    expect(result.ttc).toBe(550);
    expect(result.ht + result.vat).toBe(550);
  });
});

describe("addToVatBreakdown (cents)", () => {
  it("accumulates VAT by rate in cents", () => {
    const map: VatBreakdown = {};
    addToVatBreakdown(map, 1000, 10); // 10% VAT on 1000 cents TTC
    expect(map[10]).toBeDefined();
    expect(map[10].vat).toBeGreaterThan(0);
    addToVatBreakdown(map, 500, 20); // 20% VAT on 500 cents TTC
    expect(map[20]).toBeDefined();
  });

  it("sums to correct totals for mixed rates (cents)", () => {
    const map: VatBreakdown = {};
    addToVatBreakdown(map, 1100, 10); // 1000¢ HT + 100¢ VAT
    addToVatBreakdown(map, 1200, 20); // 1000¢ HT + 200¢ VAT
    expect(sum2([map[10].ht, map[20].ht])).toBe(2000);
    expect(sum2([map[10].vat, map[20].vat])).toBe(300);
  });
});

// C-12 (Batch 3.1) — the breakdown key was `Math.round(vatRate)`, so 5,5 %
// was filed under a "6 %" heading, a rate that does not exist in France.
// The amounts were never wrong; only the label was. These tests fail on the
// pre-fix code.
describe("addToVatBreakdown — rate keying (C-12)", () => {
  it("keys 5,5 % as \"5.5\", not \"6\"", () => {
    const map: VatBreakdown = {};
    addToVatBreakdown(map, 550, 5.5);
    expect(Object.keys(map)).toEqual(["5.5"]);
    expect(map["6"]).toBeUndefined();
  });

  it("keeps 5,5 % and 6 % as two separate entries instead of merging them", () => {
    const map: VatBreakdown = {};
    addToVatBreakdown(map, 550, 5.5);
    addToVatBreakdown(map, 530, 6);
    expect(Object.keys(map).sort()).toEqual(["5.5", "6"]);
    // Pre-fix, both landed on "6" and the 5,5 % base was reported at 6 %.
    expect(map["5.5"].ttc).toBe(550);
    expect(map["6"].ttc).toBe(530);
  });

  it("keys 20 %, 10 % and 2,1 % correctly", () => {
    const map: VatBreakdown = {};
    addToVatBreakdown(map, 1200, 20);
    addToVatBreakdown(map, 1100, 10);
    addToVatBreakdown(map, 1021, 2.1);
    expect(Object.keys(map).sort()).toEqual(["10", "2.1", "20"]);
    // 2,1 % collapsed to "2" before the fix.
    expect(map["2"]).toBeUndefined();
  });

  it("does not change any amount — only the key moves", () => {
    const map: VatBreakdown = {};
    addToVatBreakdown(map, 550, 5.5);
    // splitVat is untouched by this batch and always used the true rate, so
    // the entry must equal exactly what it returns.
    const direct = splitVat(550, 5.5);
    expect(map["5.5"]).toEqual({ ht: direct.ht, vat: direct.vat, ttc: 550 });
    expect(map["5.5"]).toEqual({ ht: 521, vat: 29, ttc: 550 });
    expect(map["5.5"].ht + map["5.5"].vat).toBe(550);
  });

  it("accumulates repeated lines at the same rate under one key", () => {
    const map: VatBreakdown = {};
    addToVatBreakdown(map, 550, 5.5);
    addToVatBreakdown(map, 550, 5.5);
    expect(Object.keys(map)).toEqual(["5.5"]);
    expect(map["5.5"].ttc).toBe(1100);
    expect(map["5.5"].ht + map["5.5"].vat).toBe(1100);
  });
});

describe("vatRateKey", () => {
  it("renders rates in minimal form — no trailing zeros", () => {
    expect(vatRateKey(20)).toBe("20");
    expect(vatRateKey(10)).toBe("10");
    expect(vatRateKey(5.5)).toBe("5.5");
    expect(vatRateKey(2.1)).toBe("2.1");
    expect(vatRateKey(0)).toBe("0");
  });

  it("carries the Corsican / overseas two-decimal rates", () => {
    expect(vatRateKey(0.9)).toBe("0.9");
    expect(vatRateKey(1.05)).toBe("1.05");
    expect(vatRateKey(1.75)).toBe("1.75");
    expect(vatRateKey(8.5)).toBe("8.5");
  });

  it("folds float noise into one key so a rate cannot split in two", () => {
    expect(vatRateKey(5.500000000000001)).toBe("5.5");
    expect(vatRateKey(5.5)).toBe(vatRateKey(5.500000000000001));
    expect(vatRateKey(10.000000000000002)).toBe("10");
  });
});

describe("sum2 (cents)", () => {
  it("sums integer cents exactly", () => {
    expect(sum2([111, 222])).toBe(333);
    expect(sum2([100, 200, 350])).toBe(650);
  });
});

// C-01 (Batch 1.1) — the refund dialog is a EUROS input whose value reaches
// the API, the Refund row and the REMBOURSEMENT fiscal event as integer
// CENTS. Before the fix, "5" typed into that field refunded 0,05 € and
// "5,50" was rejected by the server as a non-integer. These tests pin the
// euros→cents boundary the dialog now goes through.
describe("parseEuroInput (euros → cents input boundary)", () => {
  it("reads whole euros as cents, not as cents-as-typed", () => {
    expect(parseEuroInput("5")).toBe(500);
    expect(parseEuroInput("12")).toBe(1200);
    expect(parseEuroInput("200")).toBe(20000);
  });

  it("accepts the French decimal comma", () => {
    expect(parseEuroInput("5,50")).toBe(550);
    expect(parseEuroInput("12,50")).toBe(1250);
    expect(parseEuroInput("0,05")).toBe(5);
    expect(parseEuroInput("0,01")).toBe(1);
  });

  it("accepts a dot decimal separator identically", () => {
    expect(parseEuroInput("5.50")).toBe(550);
    expect(parseEuroInput("12.50")).toBe(1250);
    expect(parseEuroInput("0.05")).toBe(5);
  });

  it("tolerates surrounding and fr-FR grouping whitespace", () => {
    expect(parseEuroInput("  5,50  ")).toBe(550);
    expect(parseEuroInput("1 250,50")).toBe(125050);
    expect(parseEuroInput("1 250,50")).toBe(125050);
    expect(parseEuroInput("1 250,50")).toBe(125050);
  });

  it("returns exact cents for amounts that float arithmetic would drift on", () => {
    expect(parseEuroInput("0,29")).toBe(29);
    expect(parseEuroInput("1,15")).toBe(115);
    expect(parseEuroInput("8,35")).toBe(835);
    expect(parseEuroInput("11,45")).toBe(1145);
    expect(parseEuroInput("1234,56")).toBe(123456);
  });

  it("rounds beyond two decimals to the nearest cent", () => {
    expect(parseEuroInput("5,555")).toBe(556);
    expect(parseEuroInput("5,554")).toBe(555);
  });

  it("returns null for input that is not a usable number", () => {
    expect(parseEuroInput("")).toBeNull();
    expect(parseEuroInput("   ")).toBeNull();
    expect(parseEuroInput("abc")).toBeNull();
    expect(parseEuroInput("5€")).toBeNull();
    expect(parseEuroInput("5,5,5")).toBeNull();
    expect(parseEuroInput("5.5.5")).toBeNull();
    expect(parseEuroInput("-5")).toBeNull();
    expect(parseEuroInput(".")).toBeNull();
  });

  it("parses zero as 0 and leaves the zero policy to the caller", () => {
    // A refund of 0 is rejected by its caller; an opening float of 0 is legal.
    expect(parseEuroInput("0")).toBe(0);
    expect(parseEuroInput("0,00")).toBe(0);
  });

  it("round-trips a pre-filled full refund back to the exact maximum", () => {
    // openRefund() pre-fills fromCents(maxRefund).toFixed(2); confirming
    // without editing must reproduce maxRefund to the cent, or the refund is
    // rejected as exceeding the maximum (or silently under-refunds).
    for (const maxRefundCents of [1, 5, 99, 100, 550, 1250, 4999, 10000, 123456]) {
      const prefilled = fromCents(maxRefundCents).toFixed(2);
      expect(parseEuroInput(prefilled)).toBe(maxRefundCents);
    }
  });
});
