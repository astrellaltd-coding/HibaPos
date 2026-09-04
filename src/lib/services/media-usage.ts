// Which catalogue rows reference an uploaded image — C-25, Batch 4.6.
//
// THE PROBLEM THIS SOLVES
// -----------------------
// The media library decides whether an image is "used" so it can warn before
// deleting it, and `DELETE /api/media` clears the references before unlinking
// the file. Both scanned the same three columns:
//
//     Category.icon        Product.image        OptionChoice.image
//
// The schema has SIX image columns. The three missing ones were
// `CategoryOptionChoice.image`, `CategoryAddOn.image` and `AddOn.image` —
// counted neither as usage nor cleared on delete.
//
// Measured against the real catalogue on 2026-09-04: **30 of the 124
// referenced images were visible to neither list**. They are the sauces and
// the toppings — `sauce-algerienne.webp`, `add_mozzarela.webp`,
// `add_viande_hache.webp` — every one of them in use in the POS picker, every
// one displayed in the media library as *unused* and sorted to the front as a
// cleanup candidate. Deleting one removed the file, left a dangling
// `/uploads/…` reference, and produced a broken image in the POS with no
// audit record, because the DELETE handler wrote none.
//
// WHY THE TWO LISTS ARE NOW ONE
// -----------------------------
// The scan and the cleanup each hardcoded their own copy of the column list,
// which is *why* they drifted: three models were added to the schema and only
// the routes that created them were updated. `IMAGE_COLUMNS` below is the
// single declaration both derive from, so adding a seventh image column is
// one edit, and `media-usage.test.ts` asserts the count against the schema
// so a new column cannot be added without this file being considered.

import { db } from "@/lib/db";

/** Usage badge shown in the media library. `type` selects icon and colour. */
export type UsageEntry = { type: string; label: string };

/**
 * Every column in the schema that can hold an `/uploads/…` reference.
 *
 * `label` is what the operator reads in the delete warning. `type` drives the
 * badge: `categorie`, `produit` and `option` already existed; `supplement`
 * was added for the two add-on models, because calling an add-on an "Option"
 * in a deletion warning would misdescribe what is about to break.
 */
export const IMAGE_COLUMNS = [
  { model: "Category", column: "icon", type: "categorie", usesRowName: false },
  { model: "Product", column: "image", type: "produit", usesRowName: true },
  { model: "OptionChoice", column: "image", type: "option", usesRowName: true },
  { model: "CategoryOptionChoice", column: "image", type: "option", usesRowName: true },
  { model: "CategoryAddOn", column: "image", type: "supplement", usesRowName: true },
  { model: "AddOn", column: "image", type: "supplement", usesRowName: true },
] as const;

/** Fixed labels for the rows that have no useful name of their own. */
const FALLBACK_LABEL: Record<string, string> = {
  categorie: "Categorie",
  produit: "Produit",
  option: "Option",
  supplement: "Supplément",
};

const UPLOAD_PREFIX = "/uploads/";

/**
 * Every uploaded image referenced anywhere, mapped to what references it.
 *
 * One query per column rather than a join: these are small tables, the shapes
 * differ, and a row's own `name` is what the operator needs to see.
 */
export async function collectImageUsage(): Promise<Map<string, UsageEntry[]>> {
  const [categories, products, choices, categoryChoices, categoryAddOns, addOns] =
    await Promise.all([
      db.category.findMany({ select: { icon: true } }),
      db.product.findMany({ select: { name: true, image: true } }),
      db.optionChoice.findMany({ select: { name: true, image: true } }),
      db.categoryOptionChoice.findMany({ select: { name: true, image: true } }),
      db.categoryAddOn.findMany({ select: { name: true, image: true } }),
      db.addOn.findMany({ select: { name: true, image: true } }),
    ]);

  const usage = new Map<string, UsageEntry[]>();

  const add = (url: string | null, type: string, name?: string | null) => {
    if (!url || !url.startsWith(UPLOAD_PREFIX)) return;
    const entries = usage.get(url) ?? [];
    entries.push({ type, label: name || FALLBACK_LABEL[type] || type });
    usage.set(url, entries);
  };

  for (const c of categories) add(c.icon, "categorie");
  for (const p of products) add(p.image, "produit", p.name);
  for (const ch of choices) add(ch.image, "option", ch.name);
  // The three C-25 added. Everything above this line was already scanned.
  for (const ch of categoryChoices) add(ch.image, "option", ch.name);
  for (const a of categoryAddOns) add(a.image, "supplement", a.name);
  for (const a of addOns) add(a.image, "supplement", a.name);

  return usage;
}

/** How many rows a deletion detached, per column. */
export type ClearedReferences = Record<string, number>;

/**
 * Clear every reference to `url` across all six columns.
 *
 * Returns the per-column counts so the caller can put them in the audit
 * entry: "deleted an unused file" and "detached this image from nine
 * toppings" are different events, and before this batch neither was recorded
 * at all.
 */
export async function clearImageReferences(url: string): Promise<ClearedReferences> {
  const [category, product, optionChoice, categoryOptionChoice, categoryAddOn, addOn] =
    await Promise.all([
      db.category.updateMany({ where: { icon: url }, data: { icon: null } }),
      db.product.updateMany({ where: { image: url }, data: { image: null } }),
      db.optionChoice.updateMany({ where: { image: url }, data: { image: null } }),
      db.categoryOptionChoice.updateMany({ where: { image: url }, data: { image: null } }),
      db.categoryAddOn.updateMany({ where: { image: url }, data: { image: null } }),
      db.addOn.updateMany({ where: { image: url }, data: { image: null } }),
    ]);

  return {
    "Category.icon": category.count,
    "Product.image": product.count,
    "OptionChoice.image": optionChoice.count,
    "CategoryOptionChoice.image": categoryOptionChoice.count,
    "CategoryAddOn.image": categoryAddOn.count,
    "AddOn.image": addOn.count,
  };
}

/** Total rows detached, for the audit summary. */
export function totalCleared(cleared: ClearedReferences): number {
  return Object.values(cleared).reduce((sum, n) => sum + n, 0);
}
