// When a discount needs the operator to re-enter their PIN — DD-19, Batch 4.4c.
//
// This lives on its own, with no imports, because BOTH sides need it: the
// checkout route decides whether to demand a step-up token and whether to
// record an approver, and `payment-dialog.tsx` decides whether to ask for the
// PIN before submitting. Before this batch the two rules were written twice —
// `orders/route.ts` used `discountPercent > threshold`, the dialog used
// `discountPercent > threshold + 0.01` — and only the dead `false` constant in
// front of the client's copy hid the disagreement.
//
// It cannot live in `services/step-up.ts`: that module imports Prisma and the
// auth stack, which a "use client" component must not pull into the bundle.

/**
 * Does this discount need the caller to re-enter their PIN?
 *
 * Extracted verbatim from `orders/route.ts`, where it was
 * `discountPercent > threshold` with `discountPercent = subtotal > 0 ?
 * (discountTotal / subtotal) * 100 : 0`. Strictly greater than, as it always
 * was: a discount of exactly the threshold does not prompt.
 *
 * @param discountTotal cents
 * @param subtotal      cents, gross of the discount
 * @param thresholdPercent `Setting.discountApprovalThreshold` — a percentage
 *        (20 on this install), NOT a fraction and NOT cents.
 */
export function discountNeedsStepUp(
  discountTotal: number,
  subtotal: number,
  thresholdPercent: number,
): boolean {
  if (discountTotal <= 0 || subtotal <= 0) return false;
  return (discountTotal / subtotal) * 100 > thresholdPercent;
}
