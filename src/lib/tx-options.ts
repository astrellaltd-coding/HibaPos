// Transaction budgets (C-15 timeout half, Batch 2.3).
//
// No `$transaction` call in the project passed a `timeout`, so every one of
// them ran on Prisma's 5 s default. That default is fine for a two-write
// update and dangerous for the transactions that seal money: the checkout
// performs 8+ sequential writes and, before WAL, did so on a database where
// a single reader could block it. Exceeding the budget rolls the whole thing
// back — which means the order fails AFTER the customer has paid.
//
// These are generous on purpose. A transaction that takes 12 seconds is a
// problem worth investigating, but aborting it is worse than finishing it:
// the alternative to a slow sale is a customer who has paid for nothing.
//
// `maxWait` is how long Prisma waits for a free connection before it even
// starts; `timeout` is how long the body may then run.

/** Checkout: order + items + payments + receipt + fiscal event + counters. */
export const TX_CHECKOUT: { maxWait: number; timeout: number } = {
  maxWait: 10_000,
  timeout: 30_000,
};

/**
 * Z close: aggregates the shift, seals the Z report and appends to the
 * journal. Slower than a checkout and even less acceptable to lose — a
 * failed close leaves a shift that cannot be closed.
 */
export const TX_Z_CLOSE: { maxWait: number; timeout: number } = {
  maxWait: 10_000,
  timeout: 60_000,
};

/** Refunds, shift open, fiscal closes: money or journal, but shorter. */
export const TX_FISCAL: { maxWait: number; timeout: number } = {
  maxWait: 10_000,
  timeout: 20_000,
};

/** Catalogue writes: no money involved, but they rewrite whole option trees. */
export const TX_CATALOG: { maxWait: number; timeout: number } = {
  maxWait: 5_000,
  timeout: 15_000,
};
