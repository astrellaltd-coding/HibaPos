# scripts/ — Operator one-off scripts

These scripts are NOT invoked by the app at runtime; they're operator one-shots
used during dev / DB repair. Safe to delete after running.

## Scripts

| Script | Purpose | How to run |
|---|---|---|
| `init-fiscal-counter.ts` | Upserts the `FiscalCounter` singleton row (lastReceiptNumber / lastShiftNumber / lastZReportNumber = 0). The `prisma db seed` orchestrator already does this; this script is for recovering from a manually dropped table. | `bunx tsx scripts/init-fiscal-counter.ts` |
| `seed-users.ts` | Standalone user seeding (alternative to `prisma db seed` for ad-hoc repair). **Logs PINs to stdout — rotate immediately after running.** | `bunx tsx scripts/seed-users.ts` |
| `seed-category-options.ts` | Adds option groups + choices to products matching hardcoded French category names (`Sandwichs`, `Pizzas`). Used once to retroactively attach options. | `bunx tsx scripts/seed-category-options.ts` |
| `inspect-db.ts` | Prints table counts and recent rows — debugging utility for the operator. | `bunx tsx scripts/inspect-db.ts` |
| `inspect-options.ts` | Prints each product's option groups + choices in a tabular view. | `bunx tsx scripts/inspect-options.ts` |
| `inspect-product.ts` | Prints a single product's full graph (options, add-ons, category). | `bunx tsx scripts/inspect-product.ts <product-id>` |
| `fix-duplicate-product-options.ts` | Deletes product-level option groups that duplicate inherited category globals (has `--dry` mode). | `bunx tsx scripts/fix-duplicate-product-options.ts` |
| `fix-fiscal-counter.ts` | Syncs `FiscalCounter` to actual `max(number)` of orders/shifts/zReports (fiscal-integrity repair). | `bunx tsx scripts/fix-fiscal-counter.ts` |

## Notes

- These scripts import `@prisma/client` directly (not `src/lib/db`) so they
  don't pull Next.js server-only modules into a CLI context.
- They're ignored by eslint (`eslint.config.mjs` → `ignores: ["scripts/**"]`).
- The replacement seed orchestrator is `prisma/seed.ts` invoked via
  `bun run db:seed` (Prisma `db seed` command) — prefer that over
  `scripts/seed-users.ts` for first-boot or DB reset.
