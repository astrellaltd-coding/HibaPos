// M-16 (Batch 5.7c) — the bounds a checkout line must respect.
//
// Its own module, with no imports, so the server schema and any client that
// wants to stop the operator before the round trip read the same number. Same
// reasoning as `discount-policy.ts` and `tender-policy.ts`.

/**
 * The most of one product a single line may carry.
 *
 * `orders/route.ts` had `quantity: z.number().int().min(1)` and no upper
 * bound at all, so a crafted request could ask for any quantity a 32-bit
 * integer holds. The server would price it, apportion VAT across it and write
 * it into the journal.
 *
 * 99 is a TILL bound, not a business rule, and it is deliberately far above
 * real use rather than tuned to it: measured on this install before choosing,
 * the largest quantity ever sold is **2**, and 81 of 82 order lines are 1. A
 * genuine bulk order rings as several lines.
 */
export const MAX_ITEM_QUANTITY = 99;
