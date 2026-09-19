#!/usr/bin/env bun
/**
 * Create the Tacos on an installation that does not have them.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The France till and this machine ran the same catalogue until 2026-09-18,
 * when the operator entered the tacos HERE — three products, three category
 * option groups and twenty-two choices. The restaurant's till never got them.
 *
 * MEASURED, NOT ASSUMED, on 2026-09-19. A digest of every travelling catalogue
 * table was taken on both machines and compared section by section: categories,
 * products, product option groups, category add-ons, combo slots and combo slot
 * choices are BYTE-IDENTICAL. The only two that differ are the category option
 * groups (11 here against 8 there) and their choices (61 against 39) — and
 * excluding the `Tacos` category's three groups from this machine's digest
 * reproduces the till's two hashes exactly, `266847aff89bd501` and
 * `80065ca7a07fb47e`. **The difference between the two catalogues is the tacos
 * and nothing else.** That is what this script is allowed to assume, and it
 * re-checks the parts of it that matter before writing anything.
 *
 * ── WHY NOT THE CATALOGUE TRANSFER ──────────────────────────────────────────
 * `catalogue-transfer.ts` exists and is the right long-term answer. It cannot
 * be used for this: `CATALOGUE_TABLES` does not list `ProductOptionQuota`, so
 * the ceilings would not travel — the tacos would arrive in France taking six
 * viandes for 6,90 €, which is L-217 re-opened — and `importCatalogue` refuses
 * unless the destination catalogue is empty, with nothing in the application
 * able to empty it. Both are recorded as findings.
 *
 * ── WHY NOT BY HAND ─────────────────────────────────────────────────────────
 * Thirty-one rows, of which twenty-two carry a price. Typed at a caisse, one
 * wrong figure is a wrong ticket, and the original L-217 came out of exactly
 * that kind of entry.
 *
 * ── IT IS A DRY RUN UNLESS GIVEN `--apply` ──────────────────────────────────
 *
 *   bun scripts/add-tacos.ts             # report only, changes nothing
 *   bun scripts/add-tacos.ts --apply     # restore point, create, verify
 *
 * ── IT DOES NOT SET THE CEILINGS ────────────────────────────────────────────
 * `scripts/set-option-quotas.ts` does, it already exists, it is idempotent and
 * it has its own refusals. Run it AFTER this one:
 *
 *   bun scripts/set-option-quotas.ts --apply
 *
 * Two scripts rather than one because that one is already written and tested,
 * and a second copy of a rule is how two halves come to disagree (L-214).
 *
 * ── IT DOES NOT SET THE PHOTO ───────────────────────────────────────────────
 * `Product.image` stays null on all three, which is what it is on this machine.
 * `Tacos.webp` travels with the code into `public/uploads/Produits/`, the
 * média­thèque walks that directory rather than reading a table, so the file
 * appears there by itself and the operator points the products at it when they
 * choose. A script that guessed would be writing a decision nobody took.
 */

import { PrismaClient } from "@prisma/client";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { createHash } from "crypto";

const APPLY = process.argv.includes("--apply");
const db = new PrismaClient();

const CATEGORY = "Tacos";

/** A choice, in the shape the catalogue stores it. `priceModifier` is cents. */
type Choice = { name: string; priceModifier: number; image: string | null };
type Group = { name: string; required: boolean; multiple: boolean; choices: Choice[] };

/**
 * THE THREE GROUPS, read out of this machine's live catalogue on 2026-09-19
 * rather than retyped. `required` is the floor and `multiple` lets a size take
 * more than one; the CEILING is `set-option-quotas.ts`'s and is not here.
 *
 * Every sauce is free. Every extra is +1,00 €. In `Viande`, only `Tenders`
 * carries a supplement — the other five are included, and how many are included
 * is the quota.
 */
const GROUPS: Group[] = [
  {
    name: "Sauces",
    required: false,
    multiple: true,
    choices: [
      { name: "Mayonnaise", priceModifier: 0, image: "/uploads/Options/saucce-blanche.webp" },
      { name: "Ketchup", priceModifier: 0, image: "/uploads/Options/sauce-ketchup.webp" },
      { name: "Barbecue", priceModifier: 0, image: "/uploads/Options/sauce-barbecue.webp" },
      { name: "Algérienne", priceModifier: 0, image: "/uploads/Options/sauce-algerienne.webp" },
      { name: "Samouraï", priceModifier: 0, image: "/uploads/Options/sauce-samourai.webp" },
      { name: "Harissa", priceModifier: 0, image: "/uploads/Options/sauce-harrisa.webp" },
      { name: "Biggy", priceModifier: 0, image: "/uploads/Options/sauce-biggy.webp" },
      { name: "Blanche", priceModifier: 0, image: "/uploads/Options/saucce-blanche.webp" },
      { name: "Curry", priceModifier: 0, image: "/uploads/Options/sauce-curry.webp" },
    ],
  },
  {
    name: "Viande",
    required: true,
    multiple: true,
    choices: [
      { name: "Poulet curry", priceModifier: 0, image: "/uploads/Options/add_pouletcurry.webp" },
      { name: "Nuggets", priceModifier: 0, image: "/uploads/Options/add_nuggets_poulet.webp" },
      { name: "Viande hachée", priceModifier: 0, image: "/uploads/Options/add_viande_hache.webp" },
      { name: "Cordon bleu", priceModifier: 0, image: "/uploads/Options/add_cordonbleu.webp" },
      { name: "Merguez", priceModifier: 0, image: "/uploads/Options/add_mergeuz.webp" },
      { name: "Tenders", priceModifier: 100, image: "/uploads/Options/add_tender_poulet.webp" },
    ],
  },
  {
    name: "Extras",
    required: false,
    multiple: true,
    choices: [
      { name: "Chèvre", priceModifier: 100, image: "/uploads/Options/addchevre.webp" },
      { name: "Boursin", priceModifier: 100, image: "/uploads/Options/add_boursin.webp" },
      { name: "Mozzarella", priceModifier: 100, image: "/uploads/Options/add_mozzarela.webp" },
      { name: "Cheddar", priceModifier: 100, image: "/uploads/Options/add_cheddar.webp" },
      { name: "Reblochon", priceModifier: 100, image: null },
      { name: "Oeuf", priceModifier: 100, image: "/uploads/Options/add_oeuf.webp" },
      { name: "Bacon", priceModifier: 100, image: null },
    ],
  },
];

/**
 * THE THREE SIZES.
 *
 * `price` and `pickupPrice` are equal and `deliveryPrice` is exactly 100 cents
 * more — the rule this whole catalogue keeps for a hot savoury item, and
 * DD-?/L-134's answer that sur place and à emporter cost the same. `vatRate` 10
 * with `inheritCategoryVat` false is what the other hot dishes carry.
 */
const PRODUCTS = [
  { name: "Tacos M", price: 690, deliveryPrice: 790 },
  { name: "Tacos L", price: 890, deliveryPrice: 990 },
  { name: "Tacos XL", price: 1190, deliveryPrice: 1290 },
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

async function main(): Promise<number> {
  const dbPath = databasePath();
  if (!existsSync(dbPath)) {
    console.error(`No database at ${dbPath}`);
    return 1;
  }

  console.log("");
  console.log("  Database : " + dbPath);
  console.log("  sha256   : " + sha256(dbPath));
  console.log("");

  // ── refusal 1: the category must already be there ─────────────────────────
  // It is, on both machines: the `Tacos` category has been in this catalogue
  // since it was built and was the empty tile L-215 was about. Creating one
  // here would mean writing a category row whose colour, icon and sort order
  // nobody chose — and the icon is what the POS strip shows.
  const category = await db.category.findFirst({ where: { name: CATEGORY } });
  if (!category) {
    console.error(`  REFUSED: no category named « ${CATEGORY} ».`);
    console.error("  This script fills a category in; it does not invent one.");
    return 1;
  }

  // ── refusal 2: nothing may already be there ───────────────────────────────
  // Both halves, because either one alone would produce a half-built menu: a
  // second « Viande » group beside the first, or three more products under the
  // same names. `startsWith` rather than `contains`, so a product called
  // « Sauce tacos » somewhere else in the catalogue does not block this.
  const existingProducts = await db.product.findMany({
    where: { name: { startsWith: "Tacos" } },
    select: { name: true, categoryId: true },
  });
  const existingGroups = await db.categoryOptionGroup.findMany({
    where: { categoryId: category.id },
    select: { name: true },
  });
  if (existingProducts.length > 0 || existingGroups.length > 0) {
    console.error("  REFUSED: this installation already has tacos.");
    if (existingProducts.length) {
      console.error("     products : " + existingProducts.map((p) => p.name).join(", "));
    }
    if (existingGroups.length) {
      console.error("     groups   : " + existingGroups.map((g) => g.name).join(", "));
    }
    console.error("  Nothing was changed. This script creates; it never merges or overwrites.");
    return 1;
  }

  // ── refusal 3: the ceilings must be applicable afterwards ─────────────────
  // `ProductOptionQuota` arrives with `20260918010000_product_option_quota`. If
  // the migration has not been applied, this script would succeed and
  // `set-option-quotas.ts` would then fail — leaving three sizes on the grid
  // taking every viande for the price of one, which is the exact defect L-217
  // was raised about. Better to refuse before writing than to leave that.
  const quotaTable = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ProductOptionQuota'`,
  );
  if (quotaTable.length === 0) {
    console.error("  REFUSED: the ProductOptionQuota table does not exist here.");
    console.error("  Apply the migrations first:");
    console.error("     bun scripts/apply-migration.ts --apply");
    console.error("  Without it the sizes would be created and the ceilings could not be set,");
    console.error("  which is a taco taking six viandes for 6,90 € — L-217, again.");
    return 1;
  }

  // ── what it would do ──────────────────────────────────────────────────────
  console.log(`  Category « ${category.name} » found, and it is empty.`);
  console.log("");
  console.log("  WOULD CREATE:");
  console.log("");
  for (const g of GROUPS) {
    const flags = [g.required ? "obligatoire" : "facultatif", g.multiple ? "multiple" : "simple"];
    console.log(`     groupe « ${g.name} »  (${flags.join(", ")})  — ${g.choices.length} choix`);
    for (const c of g.choices) {
      const price = c.priceModifier === 0 ? "inclus" : "+" + euro(c.priceModifier);
      console.log(`        ${c.name.padEnd(16)} ${price}`);
    }
  }
  console.log("");
  for (const p of PRODUCTS) {
    console.log(
      `     ${p.name.padEnd(10)} ${euro(p.price)} sur place et à emporter · ${euro(p.deliveryPrice)} en livraison`,
    );
  }
  console.log("");
  console.log(
    `     ${GROUPS.length} groupes · ${GROUPS.reduce((n, g) => n + g.choices.length, 0)} choix · ${PRODUCTS.length} produits`,
  );
  console.log("");
  console.log("  NOT set by this script: the ceilings, and the photo.");
  console.log("     bun scripts/set-option-quotas.ts --apply     (M 1 · L 2 · XL 3)");
  console.log("");

  if (!APPLY) {
    console.log("  DRY RUN. Nothing was changed.");
    console.log("     bun scripts/add-tacos.ts --apply");
    console.log("");
    return 0;
  }

  // ── the restore point, and it is not optional ─────────────────────────────
  const stamp = new Date(statSync(dbPath).mtime).toISOString().slice(0, 10);
  const snapDir = resolve(dirname(dbPath), "..", "..", "db-snapshots");
  mkdirSync(snapDir, { recursive: true });
  const snap = join(snapDir, `custom.db.before-add-tacos-${stamp}`);
  if (existsSync(snap)) {
    console.error(`  REFUSED: ${snap} already exists. Move it aside first —`);
    console.error("  overwriting a restore point is the one thing worse than not having one.");
    return 1;
  }
  copyFileSync(dbPath, snap);
  if (sha256(snap) !== sha256(dbPath)) {
    console.error("  REFUSED: the restore point does not match the original. Nothing was written.");
    return 1;
  }
  console.log("  Restore point: " + snap);
  console.log("");

  // ── the write, all of it or none of it ────────────────────────────────────
  // One transaction: a catalogue with the groups and no products, or products
  // and half the choices, is worse than one with neither — the first is what a
  // cashier would meet mid-service.
  await db.$transaction(async (tx) => {
    for (const [gi, g] of GROUPS.entries()) {
      const group = await tx.categoryOptionGroup.create({
        data: {
          categoryId: category.id,
          name: g.name,
          required: g.required,
          multiple: g.multiple,
          sortOrder: gi,
        },
      });
      for (const [ci, c] of g.choices.entries()) {
        await tx.categoryOptionChoice.create({
          data: {
            groupId: group.id,
            name: c.name,
            priceModifier: c.priceModifier,
            image: c.image,
            sortOrder: ci,
          },
        });
      }
    }
    for (const p of PRODUCTS) {
      await tx.product.create({
        data: {
          name: p.name,
          categoryId: category.id,
          price: p.price,
          pickupPrice: p.price,
          deliveryPrice: p.deliveryPrice,
          vatRate: 10,
          active: true,
          available: true,
          inheritCategoryGlobals: true,
          inheritCategoryVat: false,
          isCombo: false,
          showOnPos: true,
          sortOrder: 0,
        },
      });
    }
  });

  // ── read it back, rather than trusting the writes ─────────────────────────
  const groupsAfter = await db.categoryOptionGroup.findMany({
    where: { categoryId: category.id },
    include: { choices: true },
    orderBy: { sortOrder: "asc" },
  });
  const productsAfter = await db.product.findMany({
    where: { categoryId: category.id },
    orderBy: { price: "asc" },
  });

  const problems: string[] = [];
  if (groupsAfter.length !== GROUPS.length) {
    problems.push(`${groupsAfter.length} groups, expected ${GROUPS.length}`);
  }
  for (const g of GROUPS) {
    const found = groupsAfter.find((x) => x.name === g.name);
    if (!found) problems.push(`group « ${g.name} » is missing`);
    else if (found.choices.length !== g.choices.length) {
      problems.push(`« ${g.name} » has ${found.choices.length} choices, expected ${g.choices.length}`);
    } else if (found.required !== g.required || found.multiple !== g.multiple) {
      problems.push(`« ${g.name} » did not keep its required/multiple flags`);
    }
  }
  for (const p of PRODUCTS) {
    const found = productsAfter.find((x) => x.name === p.name);
    if (!found) problems.push(`${p.name} is missing`);
    else if (found.price !== p.price || found.deliveryPrice !== p.deliveryPrice) {
      problems.push(`${p.name} has the wrong price`);
    }
  }

  console.log("  ── RESULT ──────────────────────────────────────────────────────");
  for (const g of groupsAfter) {
    console.log(`  groupe « ${g.name} » : ${g.choices.length} choix`);
  }
  for (const p of productsAfter) {
    console.log(`  ${p.name.padEnd(10)} ${euro(p.price)} · ${euro(p.deliveryPrice ?? 0)} en livraison`);
  }
  console.log("  sha256 : " + sha256(dbPath));
  console.log("");

  if (problems.length > 0) {
    console.error("  ❌ NOT WHAT WAS EXPECTED:");
    for (const p of problems) console.error("     - " + p);
    console.error("");
    console.error("  The restore point is at:");
    console.error("     " + snap);
    return 1;
  }

  console.log("  ✅ CREATED AND VERIFIED.");
  console.log("");
  console.log("  NEXT, and the sizes are wrong without it:");
  console.log("     bun scripts/set-option-quotas.ts --apply");
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
