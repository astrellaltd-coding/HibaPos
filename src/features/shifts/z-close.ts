// Pure display maths for the Z-close (shift-closing) dialog.
//
// Every amount here is INTEGER CENTS. `Money` and `formatEuro` perform the
// single cents→euros display division (src/lib/format.ts), so no caller may
// divide by 100 as well. Doing exactly that was C-02: a 200,00 € opening
// float rendered as "2,00 €" and a 5,00 € shortage as "0,05 €" — on the one
// screen whose purpose is catching missing cash.


/** Counted cash minus expected cash, in CENTS. Negative = cash missing. */
export function cashVarianceCents(
  countedCents: number,
  expectedCashCents: number,
): number {
  return countedCents - expectedCashCents;
}

// L-08 (Batch 7.2): `formatVariance` moved to `src/lib/format.ts`, beside the
// `formatEuro` it wraps. It was defined here, used ONCE, and hand-copied at
// four other places — on the screens whose purpose is catching missing cash.
// `cashVarianceCents` stays: that is shift arithmetic, not display.
