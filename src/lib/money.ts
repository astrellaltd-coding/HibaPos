// Money & VAT utilities for HibaPOS France.
// All amounts are stored and computed as INTEGER CENTS (e.g. 1250 = 12.50 €).
// The API DTO transports cents; the frontend converts to euros for display
// via formatEuro(). Integer-cent arithmetic eliminates float drift in
// fiscal calculations (ISCA / TVA reconciliation).

/** Convert a euro decimal amount (e.g. 12.50) to integer cents (e.g. 1250). */
export function toCents(euros: number): number {
  return Math.round((euros + Number.EPSILON) * 100);
}

/** Convert integer cents (e.g. 1250) to a euro decimal amount (e.g. 12.50). */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Round to 2 decimals (half-up). Used at the euros display boundary only. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Split a TTC amount (in CENTS) into HT (base) and VAT, given a VAT rate (%).
 *   baseCents = round(ttcCents / (1 + rate/100))
 *   vatCents  = ttcCents - baseCents
 * All values are integer cents — no float drift.
 */
export function splitVat(ttcCents: number, vatRate: number): { ht: number; vat: number; ttc: number } {
  const base = Math.round(ttcCents / (1 + vatRate / 100));
  const vat = ttcCents - base;
  return { ht: base, vat, ttc: ttcCents };
}

/** Build a VAT breakdown map keyed by rate. All amounts in cents. */
export type VatBreakdown = Record<number, { ht: number; vat: number; ttc: number }>;

export function addToVatBreakdown(
  breakdown: VatBreakdown,
  ttcCents: number,
  vatRate: number,
): VatBreakdown {
  const key = Math.round(vatRate);
  const existing = breakdown[key] ?? { ht: 0, vat: 0, ttc: 0 };
  const { ht, vat } = splitVat(ttcCents, vatRate);
  breakdown[key] = {
    ht: existing.ht + ht,
    vat: existing.vat + vat,
    ttc: existing.ttc + ttcCents,
  };
  return breakdown;
}

/** Sum an array of integer cents. No rounding needed (integers are exact). */
export function sum2(nums: number[]): number {
  return nums.reduce((acc, n) => acc + n, 0);
}

/**
 * Parse an operator-typed euro amount into integer CENTS.
 *
 * This is the euros→cents boundary for money *inputs* (the mirror of
 * formatEuro(), which is the cents→euros boundary for money *output*).
 * Accepts the French decimal comma as well as a dot, and tolerates
 * surrounding / grouping whitespace (including NBSP and narrow NBSP, which
 * fr-FR number formatting emits as the thousands separator).
 *
 * Returns `null` when the text is not a usable number at all (empty,
 * garbage, more than one separator). A parsed `0` is returned as `0` — the
 * caller decides whether zero is legal for its field (it is for an opening
 * float, it is not for a refund).
 *
 * More than two decimals are rounded to the nearest cent, matching toCents().
 */
export function parseEuroInput(raw: string): number | null {
  const cleaned = raw.replace(/[\s\u00A0\u202F]/g, "").replace(",", ".");
  if (!cleaned) return null;
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;
  const euros = Number(cleaned);
  if (!Number.isFinite(euros)) return null;
  return toCents(euros);
}
