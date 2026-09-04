#!/usr/bin/env bun
/**
 * Read-only: print the categories and products in the database.
 *
 * Writes nothing. Batch 4.5 converted the `require()` calls to imports so
 * this file is a module rather than a global script — with `require`, the
 * three inspect-*.ts files declared `db` and `main` in the same global scope
 * and collided the moment `scripts/` came under `tsc` (DD-08 part 5).
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const products = await db.product.findMany({
    select: { id: true, name: true, categoryId: true },
  });
  const categories = await db.category.findMany({ select: { id: true, name: true } });

  console.log("Categories:", categories.length);
  for (const c of categories) console.log("  -", c.name, `(${c.id})`);

  console.log("Products:", products.length);
  for (const p of products) console.log("  -", p.name, `(${p.id})`, "cat:", p.categoryId);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
