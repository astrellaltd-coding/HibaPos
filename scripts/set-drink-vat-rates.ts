/**
 * Batch 3.1c — set the sealed-container drink categories to 5,5 % VAT (L-16).
 *
 * Operator determination of 2026-09-03: 10 % on everything sold for
 * consumption, 5,5 % on a drink in a sealed can or bottle. The criterion is
 * the CONTAINER, not the drink — so the rate goes on `Canette` and
 * `Bouteilles`, and NOT on their parent `Boissons`, which stays unset (and
 * therefore on the 10 % default). Putting it on the parent would record "all
 * drinks are 5,5 %", which is false: a cup or fountain drink added under
 * `Boissons` later must inherit 10 %.
 *
 * Whether 5,5 % is the correct classification is the operator's call (V-14),
 * not this script's.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 *   bun run scripts/set-drink-vat-rates.ts            # report only
 *   bun run scripts/set-drink-vat-rates.ts --apply    # write
 *
 * Idempotent: running it twice changes nothing the second time.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const TARGET_CATEGORIES = ["Canette", "Bouteilles"] as const;
const EXPECTED_PARENT = "Boissons";
const RATE = 5.5;

function euros(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY RUN (pass --apply to write) ===");

  const categories = await db.category.findMany({
    where: { name: { in: [...TARGET_CATEGORIES] } },
    include: { parent: { select: { name: true } }, products: { select: { id: true, name: true, price: true, vatRate: true, inheritCategoryVat: true } } },
  });

  if (categories.length !== TARGET_CATEGORIES.length) {
    const found = categories.map((c) => c.name);
    throw new Error(
      `Expected categories ${TARGET_CATEGORIES.join(", ")}; found ${found.join(", ") || "none"}. Refusing to guess.`,
    );
  }

  // Guard: only touch the drink categories that actually sit under Boissons.
  for (const c of categories) {
    if (c.parent?.name !== EXPECTED_PARENT) {
      throw new Error(
        `Category "${c.name}" has parent "${c.parent?.name ?? "(none)"}", expected "${EXPECTED_PARENT}". Refusing — the tree is not what this script was written for.`,
      );
    }
  }

  let productCount = 0;
  for (const c of categories) {
    console.log(`\n${EXPECTED_PARENT} > ${c.name}`);
    console.log(`  category vatRate : ${c.vatRate ?? "(non défini)"} -> ${RATE}`);
    for (const p of c.products) {
      productCount++;
      const before = p.inheritCategoryVat ? "hérite" : `${p.vatRate} %`;
      console.log(`  - ${p.name.padEnd(24)} ${euros(p.price).padStart(9)}  ${before} -> hérite (${RATE} %)`);
    }
  }

  const untouched = await db.product.count({
    where: { categoryId: { notIn: categories.map((c) => c.id) } },
  });
  console.log(`\n${productCount} products move to inheritance; ${untouched} others are not touched.`);

  if (!APPLY) {
    console.log("\nNothing written. Re-run with --apply.");
    return;
  }

  await db.$transaction(async (tx) => {
    for (const c of categories) {
      await tx.category.update({ where: { id: c.id }, data: { vatRate: RATE } });
      await tx.product.updateMany({
        where: { categoryId: c.id },
        data: { inheritCategoryVat: true },
      });
    }
  });

  // --- verify ---------------------------------------------------------------
  const after = await db.product.findMany({
    where: { categoryId: { in: categories.map((c) => c.id) } },
    include: { category: { include: { parent: true } } },
  });
  const wrong = after.filter((p) => {
    const effective = p.inheritCategoryVat
      ? (p.category?.vatRate ?? p.category?.parent?.vatRate ?? p.vatRate)
      : p.vatRate;
    return effective !== RATE;
  });
  const boissons = await db.category.findFirst({ where: { name: EXPECTED_PARENT } });
  const others = await db.product.findMany({
    where: { categoryId: { notIn: categories.map((c) => c.id) } },
    select: { vatRate: true, inheritCategoryVat: true },
  });

  console.log("\n=== verification ===");
  console.log(`drinks at ${RATE} %        : ${after.length - wrong.length}/${after.length}`);
  console.log(`parent "${EXPECTED_PARENT}" vatRate : ${boissons?.vatRate ?? "(non défini — correct)"}`);
  console.log(`other products unchanged : ${others.every((p) => p.vatRate === 10 && !p.inheritCategoryVat)} (${others.length} rows, all 10 %, none inheriting)`);
  if (wrong.length) throw new Error(`${wrong.length} product(s) did not resolve to ${RATE} %`);
  if (boissons?.vatRate != null) throw new Error(`"${EXPECTED_PARENT}" must stay unset — the criterion is the container, not the drink.`);
  console.log("OK");
}

main()
  .catch((e) => {
    console.error("\nFAILED:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
