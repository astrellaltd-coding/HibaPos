#!/usr/bin/env bun
/**
 * Read-only: print each category's option groups, choices and add-ons.
 *
 * Writes nothing. See inspect-db.ts for why the `require()` calls became
 * imports in Batch 4.5.
 *
 * NOTE ON THE FIGURES: `priceModifier` and `price` are integer CENTS, and
 * this script prints them raw. It used to append "€" to them, which read as
 * euros and was wrong by a factor of 100 — the euros→cents conversion
 * happened after this script was written.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const cents = (v: number) => (v / 100).toFixed(2).replace(".", ",") + " €";

async function main() {
  const cats = await db.category.findMany({
    include: {
      optionGroups: { include: { choices: true } },
      addOns: true,
    },
  });

  for (const c of cats) {
    console.log("\nCategory:", c.name);
    console.log("  Options:", c.optionGroups.length);
    for (const g of c.optionGroups) {
      console.log("    -", g.name, "(required:", g.required, ", multiple:", g.multiple, ")");
      for (const ch of g.choices) {
        console.log("      ·", ch.name, ch.priceModifier > 0 ? `(+${cents(ch.priceModifier)})` : "");
      }
    }
    console.log("  Add-ons:", c.addOns.length);
    for (const a of c.addOns) {
      console.log("    -", a.name, `(${cents(a.price)})`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
