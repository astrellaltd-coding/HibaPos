#!/usr/bin/env bun
/**
 * R3.3 / L-69 — turn Box 15, Box 35 and the Tenders box into real menus
 * composés, so the sealed drink they bundle is taxed at 5,5 % à emporter
 * instead of the whole price sitting at 10 %.
 *
 * ── IT IS A DRY RUN UNLESS GIVEN `--apply` ──────────────────────────────────
 *   bun scripts/build-box-menus.ts            # show the plan, change nothing
 *   bun scripts/build-box-menus.ts --apply    # restore point, build, verify
 *
 * ── WHAT IT BUILDS, PER BOX ─────────────────────────────────────────────────
 *   1. a HIDDEN food-only component — same category, `showOnPos = false`, so it
 *      is a legal menu filler and never appears on the till grid (R3.1);
 *   2. the existing product becomes the MENU — same name, same price, same
 *      category, so the till button does not move; its price IS the forfait;
 *   3. slot 1, the food, with EXACTLY ONE choice (the hidden half), so the
 *      cashier is never asked for it;
 *   4. slot 2, the drink, sourced from the whole drink category.
 *
 * ── THE PRICES ARE THE OPERATOR'S, NOT MINE ─────────────────────────────────
 * The food component's standalone price is the ALLOCATION WEIGHT — the number
 * the forfait is divided in proportion to, and the figure `OrderItem
 * .referencePrice` stores as the division's justification (R2.3). The operator
 * chose « forfait minus the drink » on 2026-09-10, and named the drinks:
 * a 3,50 € bouteille for the two Boxes, a 1,50 € canette for the Tenders box.
 *
 * That rule has a property worth naming: the two weights sum EXACTLY to the
 * forfait, so `apportion` returns them unchanged and the drink's share is its
 * own shelf price to the cent — no rounding artefact to explain.
 *
 * ── IT VALIDATES BEFORE WRITING AND PRICES AFTER ────────────────────────────
 * `validateComboShape` and `validateComboAgainstCatalogue` are the checks the
 * catalogue editor runs, and they exist to refuse a menu that would sell wrong.
 * Raw SQL bypasses both, which is why this is a script and not fourteen
 * statements. Afterwards it prices each menu through the REAL `priceComboItem`,
 * à emporter and sur place, and refuses to call the job done unless the booked
 * VAT matches the figures handed over.
 */

import { PrismaClient } from "@prisma/client";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { createHash } from "crypto";
import { validateComboShape } from "@/lib/validation";
import { validateComboAgainstCatalogue } from "@/lib/services/combo-admin";
import { priceComboItem, type MenuWithSlots } from "@/lib/services/combo-checkout";

const APPLY = process.argv.includes("--apply");
const db = new PrismaClient();

/** One box, and everything the rebuild needs to know about it. */
type Plan = {
  /** The existing product, by name. */
  menuName: string;
  /** The drink category the slot draws from. */
  drinkCategory: string;
  /** Expected VAT, in cents, per unit — the handover's figures. */
  expect: { takeaway: number; dineIn: number };
};

const PLANS: Plan[] = [
  { menuName: "Box 15", drinkCategory: "Bouteilles", expect: { takeaway: 258, dineIn: 272 } },
  { menuName: "Box 35", drinkCategory: "Bouteilles", expect: { takeaway: 258, dineIn: 272 } },
  { menuName: "Tenders box", drinkCategory: "Canette", expect: { takeaway: 84, dineIn: 90 } },
];

const euro = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " €";

function databasePath(): string {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) {
    console.error("DATABASE_URL must be a file: URL. Run from the project root.");
    process.exit(1);
  }
  return resolve(url.slice("file:".length).split("?")[0]);
}
const sha256 = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");

/** The cheapest active product in a category — the drink whose price is the weight. */
async function cheapestIn(categoryName: string) {
  const cat = await db.category.findFirst({ where: { name: categoryName } });
  if (!cat) return null;
  const product = await db.product.findFirst({
    where: { categoryId: cat.id, active: true, available: true, isCombo: false },
    orderBy: { price: "asc" },
  });
  return product ? { category: cat, product } : null;
}

type Resolved = {
  plan: Plan;
  menu: { id: string; name: string; price: number; categoryId: string };
  drinkCategoryId: string;
  drinkPrice: number;
  foodName: string;
  foodPrice: number;
};

async function resolvePlans(): Promise<{ ready: Resolved[]; problems: string[] }> {
  const ready: Resolved[] = [];
  const problems: string[] = [];

  for (const plan of PLANS) {
    const menu = await db.product.findFirst({ where: { name: plan.menuName } });
    if (!menu) {
      problems.push(`« ${plan.menuName} » : produit introuvable.`);
      continue;
    }
    if (menu.isCombo) {
      problems.push(`« ${plan.menuName} » : déjà un menu composé — rien à faire.`);
      continue;
    }
    const drink = await cheapestIn(plan.drinkCategory);
    if (!drink) {
      problems.push(`« ${plan.menuName} » : aucune boisson dans « ${plan.drinkCategory} ».`);
      continue;
    }
    const foodName = `${menu.name} (sans boisson)`;
    if (await db.product.findFirst({ where: { name: foodName } })) {
      problems.push(`« ${foodName} » existe déjà — le script a-t-il déjà tourné ?`);
      continue;
    }
    // The operator's rule: forfait minus the drink.
    const foodPrice = menu.price - drink.product.price;
    if (foodPrice <= 0) {
      problems.push(`« ${plan.menuName} » : forfait ${euro(menu.price)} <= boisson ${euro(drink.product.price)}.`);
      continue;
    }
    ready.push({
      plan,
      menu: { id: menu.id, name: menu.name, price: menu.price, categoryId: menu.categoryId },
      drinkCategoryId: drink.category.id,
      drinkPrice: drink.product.price,
      foodName,
      foodPrice,
    });
  }
  return { ready, problems };
}

/** Build one box. Returns the ids it created, for the verification pass. */
async function build(r: Resolved) {
  const food = await db.product.create({
    data: {
      name: r.foodName,
      categoryId: r.menu.categoryId,
      price: r.foodPrice,
      pickupPrice: r.foodPrice,
      deliveryPrice: r.foodPrice,
      vatRate: 10,
      inheritCategoryVat: true,
      active: true,
      available: true,
      // R3.1 — the whole reason this batch was possible.
      showOnPos: false,
      sortOrder: 999,
    },
  });

  // `optionRules: []` — this menu governs no option group. The six existing
  // menus pin the pizza « Taille »; a box has no such group to answer for.
  const slots = [
    {
      name: r.menu.name,
      quantity: 1,
      sortOrder: 0,
      sourceCategoryId: r.menu.categoryId,
      choices: [{ productId: food.id, surcharge: 0, sortOrder: 0 }],
      optionRules: [],
    },
    {
      name: "Boisson",
      quantity: 1,
      sortOrder: 1,
      sourceCategoryId: r.drinkCategoryId,
      choices: [] as { productId: string; surcharge: number; sortOrder: number }[],
      optionRules: [],
    },
  ];

  // THE CHECKS THE EDITOR RUNS. Refuse before writing, not after.
  const shape = validateComboShape({ isCombo: true, price: r.menu.price, comboSlots: slots });
  if (shape.length) throw new Error(`${r.menu.name} : ${shape[0]}`);
  const cat = await validateComboAgainstCatalogue(slots, r.menu.id);
  if (cat.length) throw new Error(`${r.menu.name} : ${cat[0]}`);

  await db.product.update({ where: { id: r.menu.id }, data: { isCombo: true, inheritCategoryVat: false } });
  for (const s of slots) {
    const slot = await db.comboSlot.create({
      data: {
        productId: r.menu.id,
        name: s.name,
        quantity: s.quantity,
        sortOrder: s.sortOrder,
        sourceCategoryId: s.sourceCategoryId,
      },
    });
    for (const [i, c] of s.choices.entries()) {
      await db.comboSlotChoice.create({
        data: { slotId: slot.id, productId: c.productId, surcharge: 0, sortOrder: i },
      });
    }
  }
  return { foodId: food.id };
}

/** Price the finished menu through the real checkout pricing, both order types. */
async function verify(r: Resolved, foodId: string): Promise<string[]> {
  const errors: string[] = [];
  const menu = (await db.product.findUnique({
    where: { id: r.menu.id },
    include: {
      category: { include: { parent: true, optionGroups: { include: { choices: true } } } },
      comboSlots: { include: { choices: true, optionRules: true } },
    },
  })) as unknown as MenuWithSlots | null;
  if (!menu) return [`${r.menu.name} : introuvable après construction.`];

  const slots = await db.comboSlot.findMany({ where: { productId: r.menu.id }, orderBy: { sortOrder: "asc" } });
  const drink = await db.product.findFirstOrThrow({
    where: { categoryId: r.drinkCategoryId, active: true, available: true },
    orderBy: { price: "asc" },
  });

  // ANSWER THE REQUIRED OPTION GROUPS, as a cashier does.
  //
  // `Croustillants` carries a REQUIRED « Sauces » group, which the hidden food
  // component inherits — so the till asks for a sauce inside the menu, exactly
  // as it asks today when Box 15 is rung up as an ordinary product. A first
  // rehearsal passed no options and was refused « Option obligatoire manquante :
  // Sauces », which was the pricing being right and the rehearsal being
  // unrealistic. The menu governs no group (`optionRules: []`), so
  // `askedGroups` still shows every one of them to the cashier.
  //
  // Every sauce is `priceModifier = 0` (measured), so answering adds nothing:
  // the customer still pays exactly the forfait, which the totals below assert.
  const foodProduct = await db.product.findUniqueOrThrow({
    where: { id: foodId },
    select: { categoryId: true, inheritCategoryGlobals: true },
  });
  const requiredGroups = await db.categoryOptionGroup.findMany({
    where: { categoryId: foodProduct.categoryId, required: true },
    include: { choices: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });
  const foodOptionIds = requiredGroups.flatMap((g) => g.choices.map((c) => c.id));

  for (const orderType of ["TAKEAWAY", "DINE_IN"] as const) {
    const priced = await priceComboItem({
      menu,
      components: [
        { slotId: slots[0].id, productId: foodId, optionIds: foodOptionIds, addons: [] },
        { slotId: slots[1].id, productId: drink.id, optionIds: [], addons: [] },
      ],
      quantity: 1,
      orderType,
      groupId: "verify",
    });
    if ("error" in priced) {
      errors.push(`${r.menu.name} (${orderType}) : ${priced.error}`);
      continue;
    }
    const total = priced.lines.reduce((n, l) => n + l.lineTotal, 0);
    const vat = priced.lines.reduce(
      (n, l) => n + (l.lineTotal - Math.round(l.lineTotal / (1 + l.vatRate / 100))),
      0,
    );
    const want = orderType === "TAKEAWAY" ? r.plan.expect.takeaway : r.plan.expect.dineIn;
    const label = orderType === "TAKEAWAY" ? "à emporter" : "sur place";
    console.log(
      `     ${label.padEnd(12)} ${priced.lines.length} lignes, total ${euro(total)}, TVA ${euro(vat)}` +
        `   ${priced.lines.map((l) => `${l.vatRate}%`).join(" + ")}`,
    );
    if (total !== r.menu.price) errors.push(`${r.menu.name} (${label}) : total ${euro(total)} ≠ forfait ${euro(r.menu.price)}`);
    if (vat !== want) errors.push(`${r.menu.name} (${label}) : TVA ${euro(vat)} ≠ attendu ${euro(want)}`);
  }
  return errors;
}

async function main(): Promise<number> {
  const dbPath = databasePath();
  console.log("");
  console.log("  Database : " + dbPath);
  console.log("  sha256   : " + sha256(dbPath));
  console.log("");

  const { ready, problems } = await resolvePlans();
  for (const p of problems) console.log("  ⚠ " + p);
  if (problems.length) console.log("");

  if (ready.length === 0) {
    console.log("  NOTHING TO BUILD.");
    console.log("");
    return problems.length ? 1 : 0;
  }

  console.log("  PLAN:");
  for (const r of ready) {
    console.log("");
    console.log(`  ${r.menu.name} — forfait ${euro(r.menu.price)}`);
    console.log(`     hidden component : « ${r.foodName} »  ${euro(r.foodPrice)}  (« Vendre en caisse » OFF)`);
    console.log(`     drink slot       : toute la catégorie « ${r.plan.drinkCategory} », boisson ${euro(r.drinkPrice)}`);
    console.log(`     weights          : ${r.foodPrice} : ${r.drinkPrice}  (somme ${r.foodPrice + r.drinkPrice} = forfait ${r.menu.price})`);
    console.log(`     expected TVA     : ${euro(r.plan.expect.takeaway)} à emporter · ${euro(r.plan.expect.dineIn)} sur place`);
  }
  console.log("");

  if (!APPLY) {
    console.log("  DRY RUN. Nothing was changed.");
    console.log("     bun scripts/build-box-menus.ts --apply");
    console.log("");
    return 0;
  }

  // A restore point. This edits the live catalogue.
  const stamp = new Date(statSync(dbPath).mtime).toISOString().slice(0, 10);
  const snapDir = resolve(dirname(dbPath), "..", "..", "db-snapshots");
  mkdirSync(snapDir, { recursive: true });
  const snap = join(snapDir, `custom.db.before-box-menus-${stamp}`);
  if (existsSync(snap)) {
    console.error(`  REFUSED: ${snap} already exists. Move it aside first.`);
    return 1;
  }
  copyFileSync(dbPath, snap);
  if (sha256(snap) !== sha256(dbPath)) {
    console.error("  REFUSED: the restore point does not match the original.");
    return 1;
  }
  console.log("  Restore point: " + snap);
  console.log("");

  const errors: string[] = [];
  for (const r of ready) {
    console.log(`  ${r.menu.name}:`);
    let foodId: string;
    try {
      ({ foodId } = await build(r));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      console.log("     REFUSED by validation — " + (e instanceof Error ? e.message : String(e)));
      continue;
    }
    errors.push(...(await verify(r, foodId)));
  }

  console.log("");
  console.log("  ── RESULT ──────────────────────────────────────────────────");
  console.log(`  sha256 : ${sha256(dbPath)}`);
  if (errors.length) {
    console.log("");
    for (const e of errors) console.log("  ❌ " + e);
    console.log("");
    console.log("  The restore point is at:");
    console.log("     " + snap);
    return 1;
  }
  console.log("");
  console.log("  ✅ BUILT AND PRICED — every menu books its forfait and the expected TVA.");
  console.log("");
  return 0;
}

main()
  .then(async (code) => {
    await db.$disconnect();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
