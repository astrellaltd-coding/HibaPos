// Pure display maths for the Z-close (shift-closing) dialog.
//
// Every amount here is INTEGER CENTS. `Money` and `formatEuro` perform the
// single cents→euros display division (src/lib/format.ts), so no caller may
// divide by 100 as well. Doing exactly that was C-02: a 200,00 € opening
// float rendered as "2,00 €" and a 5,00 € shortage as "0,05 €" — on the one
// screen whose purpose is catching missing cash.

import { formatEuro } from "@/lib/format";

/** Counted cash minus expected cash, in CENTS. Negative = cash missing. */
export function cashVarianceCents(
  countedCents: number,
  expectedCashCents: number,
): number {
  return countedCents - expectedCashCents;
}

/**
 * The variance as the operator reads it: an explicit "+" for a surplus, the
 * formatter's own "-" for a shortage, no sign for an exact count.
 */
export function formatVariance(varianceCents: number): string {
  return `${varianceCents > 0 ? "+" : ""}${formatEuro(varianceCents)}`;
}
