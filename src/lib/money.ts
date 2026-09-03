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

/**
 * The breakdown key for a VAT rate: the rate itself, as a string.
 *
 * C-12 (Batch 3.1): this used to be `Math.round(vatRate)`, which filed 5,5 %
 * under a "6 %" heading — a rate that does not exist in France — and would
 * have collapsed 2,1 % to "2" and merged a co-existing 5,5 % and 6 %. The
 * *amounts* were always right; only the label was wrong.
 *
 * The rate is rounded to the nearest hundredth of a percent before rendering,
 * so float noise (5.500000000000001) cannot split one rate across two keys,
 * and trailing zeros are not emitted: 5.5 -> "5.5", 10 -> "10", 2.1 -> "2.1",
 * 0.9 -> "0.9". Two decimals rather than one because the Corsican and
 * overseas rates include 0,90 %, 1,05 % and 1,75 %.
 *
 * Minimal form ("10", not "10.0") is deliberate: it is what every breakdown
 * already written to a ZReport uses, so the fix introduces no second spelling
 * of a rate that is already correct.
 */
export function vatRateKey(vatRate: number): string {
  return String(Math.round(vatRate * 100) / 100);
}

/** Build a VAT breakdown map keyed by rate (see vatRateKey). Amounts in cents. */
export type VatBreakdown = Record<string, { ht: number; vat: number; ttc: number }>;

export function addToVatBreakdown(
  breakdown: VatBreakdown,
  ttcCents: number,
  vatRate: number,
): VatBreakdown {
  const key = vatRateKey(vatRate);
  const existing = breakdown[key] ?? { ht: 0, vat: 0, ttc: 0 };
  const { ht, vat } = splitVat(ttcCents, vatRate);
  breakdown[key] = {
    ht: existing.ht + ht,
    vat: existing.vat + vat,
    ttc: existing.ttc + ttcCents,
  };
  return breakdown;
}

/**
 * Split `target` cents across `weights`, exactly (M-13, Batch 3.2).
 *
 * Largest-remainder apportionment: give every part its floor, then hand the
 * leftover cents to the parts with the biggest fractional remainders. The
 * result **always sums to `target`**, which independent per-line rounding
 * cannot guarantee — `Math.round(line * ratio)` per line lets the parts drift
 * from the whole by a cent or two, so an order's VAT breakdown could disagree
 * with the order total it was derived from.
 *
 * Ties break toward the earlier line, so the split is deterministic: the same
 * order always apportions the same way, which matters because these numbers
 * end up in sealed documents.
 *
 * A zero or negative total weight yields all zeros — the caller has nothing to
 * distribute across.
 */
export function apportion(weights: number[], target: number): number[] {
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  if (totalWeight <= 0 || weights.length === 0) return weights.map(() => 0);

  const exact = weights.map((w) => (w * target) / totalWeight);
  const out = exact.map((v) => Math.floor(v));
  let remainder = target - out.reduce((acc, v) => acc + v, 0);

  const byRemainder = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; remainder > 0 && k < byRemainder.length; k++) {
    out[byRemainder[k].i] += 1;
    remainder -= 1;
  }
  return out;
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
