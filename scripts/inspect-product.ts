#!/usr/bin/env bun
/**
 * Read-only: print one product's full graph (options, add-ons, category).
 *
 * Writes nothing. See inspect-db.ts for why the `require()` calls became
 * imports in Batch 4.5.
 *
 *   bun scripts/inspect-product.ts "Chicken Club"
 *
 * The product name used to be hardcoded to "Chicken Club" — a demo product
 * the real 78-product catalogue replaced, so the script printed nothing
 * useful and then crashed dereferencing a null. It now takes the name as an
 * argument and says so when there is no match.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('\n  Usage : bun scripts/inspect-product.ts "<nom du produit>"\n');
    process.exitCode = 1;
    return;
  }

  const product = await db.product.findFirst({
    where: { name },
    include: {
      category: { include: { optionGroups: { include: { choices: true } }, addOns: true } },
      options: { include: { choices: true } },
      productAddons: { include: { addon: true } },
    },
  });

  if (!product) {
    console.error(`\n  Aucun produit « ${name} ».\n`);
    process.exitCode = 1;
    return;
  }

  console.log("Product:", product.name);
  console.log("Category options:", product.category?.optionGroups.length ?? 0);
  console.log("Category add-ons:", product.category?.addOns.length ?? 0);
  console.log("Product-specific options:", product.options.length);
  console.log("Product-specific add-ons:", product.productAddons.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
