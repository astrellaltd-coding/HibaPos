import { describe, it, expect } from "vitest";
import { round2, addToVatBreakdown, splitVat, sum2, toCents, fromCents, type VatBreakdown } from "./money";

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

describe("sum2 (cents)", () => {
  it("sums integer cents exactly", () => {
    expect(sum2([111, 222])).toBe(333);
    expect(sum2([100, 200, 350])).toBe(650);
  });
});
