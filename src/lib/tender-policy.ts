// DD-14 (2026-09-05), Batch 5.7b — « Offert / repas personnel », the give-away
// tender, and the rules that keep it from inflating revenue.
//
// This lives on its own, with no imports, because BOTH sides need it: the
// checkout route refuses a malformed tender set, and `payment-dialog.tsx`
// decides what the operator may build. Same reasoning as `discount-policy.ts`,
// and the same constraint — it cannot import Prisma or the auth stack, because
// a "use client" component must not pull those into the bundle.
//
// ── WHY THE RULES ARE SHAPED THIS WAY ────────────────────────────────────────
// M-11 was that a 100 % discount cannot be checked out: the total becomes 0,
// but every payment line needed `amount ≥ 1` and the server demands that the
// payments sum EXACTLY to the total. DD-14 answered that such a sale is
// legitimate under its own tender rather than as an ordinary 0,00 € cash sale,
// "because a dedicated tender keeps what was *given away* separable from what
// was *sold*".
//
// The batch's criterion is that an « offert » line **must not inflate
// revenue**. That is guaranteed structurally rather than by convention:
//
//   * an OFFERT line carries amount 0, so it adds nothing to any payment total
//     (`aggregate.ts` sums by method, and OFFERT matches none of the three
//     money methods);
//   * OFFERT may be the ONLY line, so nobody can settle half of a 10,00 €
//     bill with cash and "give away" the other half while the order still
//     books 10,00 € of revenue;
//   * OFFERT requires the order total to be 0, so the order contributes 0 to
//     `salesTotal` and to every sealed period total.
//
// Take any one of those away and the tender becomes a way to record revenue
// that was never collected. That is why all three are here and why the tests
// revert them one at a time.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────────
// It does not add an "offert total" to `PeriodAgg`. That would change the
// shape of the sealed close `dataJson` (*Open Threads → D*; `close-timing.
// test.ts` pins the key list), and DD-14 asked for a tender, not a report. The
// give-away is recoverable — `Payment.method = 'OFFERT'`, and the order's own
// `discountTotal` is what was forgone — so a report over it is a later
// decision, not a thing to smuggle in here.

/** The give-away tender's enum value. One spelling, exported, so nothing has
 *  to repeat the string literal. */
export const OFFERT = "OFFERT";

/** What the operator sees. The enum value is not shown anywhere. */
export const OFFERT_LABEL = "Offert / repas personnel";

/** The tenders that move money. An OFFERT line is not one of them, which is
 *  the whole point: reports sum these and see nothing. */
export const PAID_TENDERS = ["CASH", "CARD", "VOUCHER"] as const;

export type PaidTender = (typeof PAID_TENDERS)[number];
export type TenderMethod = PaidTender | typeof OFFERT;

/** Every tender the checkout accepts, in the order the till shows them.
 *  A readonly tuple of literals, not `TenderMethod[]`, so `z.enum()` can infer
 *  the union from it — passed as `string[]` the parsed `method` widens to
 *  `string` and stops matching Prisma's `PaymentMethod`. */
export const TENDER_METHODS = [...PAID_TENDERS, OFFERT] as const;

export function isOffertTender(method: string): boolean {
  return method === OFFERT;
}

// Refusal messages. Pinned by tests, because a caller that changed one would
// otherwise be telling the operator something different from what the server
// decided — the disagreement `discount-policy.ts` exists to prevent.
export const OFFERT_AMOUNT_MUST_BE_ZERO_MESSAGE =
  "Un paiement « Offert » ne peut porter aucun montant.";
export const OFFERT_MUST_BE_SOLE_TENDER_MESSAGE =
  "« Offert » ne peut pas être combiné avec un autre moyen de paiement.";
export const OFFERT_NEEDS_ZERO_TOTAL_MESSAGE =
  "« Offert » ne s'applique qu'à une commande dont le total est nul.";
export const PAID_TENDER_NEEDS_AMOUNT_MESSAGE =
  "Un paiement doit porter un montant.";

export type TenderLine = { method: string; amount: number };
export type TenderCheck = { ok: true } | { ok: false; message: string };

/**
 * Is this set of payment lines a legitimate way to settle `totalAfterDiscount`?
 *
 * Pure, and deliberately says nothing about whether the lines SUM to the
 * total — the route's own equality check owns that, and has since long before
 * this batch. This function owns only the rules the give-away tender adds.
 *
 * @param payments           the lines as sent, amounts in cents
 * @param totalAfterDiscount cents, the order's total once the discount lands
 */
export function checkTenderComposition(
  payments: TenderLine[],
  totalAfterDiscount: number,
): TenderCheck {
  const offert = payments.filter((p) => isOffertTender(p.method));

  // A paid tender still needs a real amount. This is the guarantee the old
  // `amount: z.number().int().min(1)` gave, kept here rather than lost when
  // the schema had to relax to admit a zero-amount OFFERT line.
  for (const p of payments) {
    if (!isOffertTender(p.method) && p.amount < 1) {
      return { ok: false, message: PAID_TENDER_NEEDS_AMOUNT_MESSAGE };
    }
  }

  if (offert.length === 0) return { ok: true };

  if (offert.some((p) => p.amount !== 0)) {
    return { ok: false, message: OFFERT_AMOUNT_MUST_BE_ZERO_MESSAGE };
  }
  if (payments.length !== 1) {
    return { ok: false, message: OFFERT_MUST_BE_SOLE_TENDER_MESSAGE };
  }
  if (totalAfterDiscount !== 0) {
    return { ok: false, message: OFFERT_NEEDS_ZERO_TOTAL_MESSAGE };
  }
  return { ok: true };
}
