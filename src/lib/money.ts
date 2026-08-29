// Money & VAT utilities for HibaPOS France.
// All amounts are manipulated cleanly in Euros or exact integer cents.
// Calculations round cleanly to avoid floating point drift.

/** Convert a euro decimal amount (e.g. 12.50) to integer cents (e.g. 1250). */
export function toCents(euros: number): number {
  return Math.round((euros + Number.EPSILON) * 100);
}

/** Convert integer cents (e.g. 1250) to a euro decimal amount (e.g. 12.50). */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Round to 2 decimals (banker-style half-up). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Split a TTC amount into HT (base) and VAT, given a VAT rate (%).
 * base = ttc / (1 + rate/100)
 * vat  = ttc - base
 */
export function splitVat(ttc: number, vatRate: number): { ht: number; vat: number; ttc: number } {
  const base = round2(ttc / (1 + vatRate / 100));
  const vat = round2(ttc - base);
  return { ht: base, vat, ttc: round2(ttc) };
}

/** Build a VAT breakdown map keyed by rate. */
export type VatBreakdown = Record<number, { ht: number; vat: number; ttc: number }>;

export function addToVatBreakdown(
  breakdown: VatBreakdown,
  ttc: number,
  vatRate: number,
): VatBreakdown {
  const key = round2(vatRate);
  const existing = breakdown[key] ?? { ht: 0, vat: 0, ttc: 0 };
  const { ht, vat } = splitVat(ttc, vatRate);
  breakdown[key] = {
    ht: round2(existing.ht + ht),
    vat: round2(existing.vat + vat),
    ttc: round2(existing.ttc + ttc),
  };
  return breakdown;
}

/** Sum an array of numbers with rounding. */
export function sum2(nums: number[]): number {
  return round2(nums.reduce((acc, n) => acc + n, 0));
}
