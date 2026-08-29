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
});

describe("round2", () => {
  it("rounds to 2 decimals (banker half-up)", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(1.004)).toBe(1.0);
    expect(round2(10.999)).toBe(11.0);
    expect(round2(2.675)).toBe(2.68);
  });
});

describe("splitVat", () => {
  it("splits 10% VAT correctly", () => {
    const result = splitVat(11, 10);
    expect(result.ht).toBe(10);
    expect(result.vat).toBe(1);
    expect(result.ttc).toBe(11);
  });

  it("splits 20% VAT correctly", () => {
    const result = splitVat(12, 20);
    expect(result.ht).toBe(10);
    expect(result.vat).toBe(2);
    expect(result.ttc).toBe(12);
  });
});

describe("addToVatBreakdown", () => {
  it("accumulates VAT by rate", () => {
    const map: VatBreakdown = {};
    addToVatBreakdown(map, 10, 10); // 10% VAT on 10€ TTC
    expect(map[10]).toBeDefined();
    expect(map[10].vat).toBeGreaterThan(0);
    addToVatBreakdown(map, 5, 20); // 20% VAT on 5€ TTC
    expect(map[20]).toBeDefined();
  });

  it("sums to correct totals for mixed rates", () => {
    const map: VatBreakdown = {};
    addToVatBreakdown(map, 11, 10); // 10€ HT + 1€ VAT
    addToVatBreakdown(map, 12, 20); // 10€ HT + 2€ VAT
    expect(round2(map[10].ht + map[20].ht)).toBe(20);
    expect(round2(map[10].vat + map[20].vat)).toBe(3);
  });
});

describe("sum2", () => {
  it("sums with rounding", () => {
    expect(sum2([1.111, 2.222])).toBe(3.33);
  });
});
