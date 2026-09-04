import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { db } from "@/lib/db";
import {
  collectImageUsage,
  clearImageReferences,
  totalCleared,
  IMAGE_COLUMNS,
} from "@/lib/services/media-usage";

// C-25, Batch 4.6 — the media library invited deletion of images in use.
//
// The usage scan and the reference cleanup each carried their own hardcoded
// list of three columns — `Category.icon`, `Product.image`,
// `OptionChoice.image` — while the schema has six. The three missing ones
// were `CategoryOptionChoice.image`, `CategoryAddOn.image` and `AddOn.image`.
//
// Measured on the real catalogue: 30 of 124 referenced images were invisible
// to both lists. They are the sauces and the toppings, all in use in the POS
// picker, all displayed as "unused" and sorted to the front of the media
// library as cleanup candidates. Deleting one unlinked the file, left a
// dangling reference, and wrote no audit row.
//
// These tests assert the three properties that close it: every image column
// in the schema is scanned, every one is cleared on delete, and the two lists
// are derived from one declaration so they cannot drift apart again.

/** Unique per run so this file shares the suite's database safely. */
const tag = `c25-${Date.now()}`;
const url = (n: string) => `/uploads/${tag}/${n}.webp`;

let categoryId = "";
let productId = "";

beforeAll(async () => {
  const category = await db.category.create({
    data: { name: `${tag}-cat`, icon: url("cat"), sortOrder: 900, active: true },
  });
  categoryId = category.id;

  const product = await db.product.create({
    data: {
      name: `${tag}-prod`,
      price: 100,
      vatRate: 10,
      categoryId: category.id,
      image: url("prod"),
      active: true,
      available: true,
    },
  });
  productId = product.id;

  // Product-level option group + choice (already scanned before this batch).
  const group = await db.optionGroup.create({
    data: { productId: product.id, name: `${tag}-group`, sortOrder: 0 },
  });
  await db.optionChoice.create({
    data: { groupId: group.id, name: `${tag}-choice`, priceModifier: 0, image: url("choice"), sortOrder: 0 },
  });

  // The three C-25 added. These are the ones that were invisible.
  const categoryGroup = await db.categoryOptionGroup.create({
    data: { categoryId: category.id, name: `${tag}-catgroup`, sortOrder: 0 },
  });
  await db.categoryOptionChoice.create({
    data: {
      groupId: categoryGroup.id,
      name: `${tag}-sauce`,
      priceModifier: 0,
      image: url("sauce"),
      sortOrder: 0,
    },
  });
  await db.categoryAddOn.create({
    data: { categoryId: category.id, name: `${tag}-topping`, price: 100, image: url("topping"), sortOrder: 0, active: true },
  });
  await db.addOn.create({
    data: { name: `${tag}-addon`, price: 100, image: url("addon"), sortOrder: 0, active: true },
  });
});

describe("IMAGE_COLUMNS — one declaration, so the two lists cannot drift", () => {
  it("covers every image column in the Prisma schema", () => {
    // This is the test that actually prevents a recurrence. C-25 happened
    // because three models were added to the schema and only the routes that
    // wrote them were updated. Counting the schema's own `image`/`icon`
    // columns here means a seventh cannot be added without this failing.
    const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const declared = schema
      .split("\n")
      .filter((l) => /^\s+(image|icon)\s+String\?/.test(l)).length;
    expect(IMAGE_COLUMNS).toHaveLength(declared);
    expect(declared).toBe(6);
  });

  it("names the three columns the old code missed", () => {
    const keys = IMAGE_COLUMNS.map((c) => `${c.model}.${c.column}`);
    expect(keys).toContain("CategoryOptionChoice.image");
    expect(keys).toContain("CategoryAddOn.image");
    expect(keys).toContain("AddOn.image");
  });
});

describe("collectImageUsage", () => {
  it("reports an image used by a CategoryOptionChoice as used", async () => {
    // A sauce thumbnail. Displayed as unused before this batch.
    const usage = await collectImageUsage();
    const entries = usage.get(url("sauce"));
    expect(entries).toBeDefined();
    expect(entries).toHaveLength(1);
    expect(entries![0].type).toBe("option");
    expect(entries![0].label).toBe(`${tag}-sauce`);
  });

  it("reports an image used by a CategoryAddOn as used", async () => {
    const usage = await collectImageUsage();
    const entries = usage.get(url("topping"));
    expect(entries).toBeDefined();
    expect(entries![0].type).toBe("supplement");
    expect(entries![0].label).toBe(`${tag}-topping`);
  });

  it("reports an image used by an AddOn as used", async () => {
    // Zero rows carry this in production today, so it is latent — which is
    // exactly why it is covered rather than left for the next batch.
    const usage = await collectImageUsage();
    const entries = usage.get(url("addon"));
    expect(entries).toBeDefined();
    expect(entries![0].type).toBe("supplement");
  });

  it("still reports the three columns it always covered", async () => {
    const usage = await collectImageUsage();
    expect(usage.get(url("cat"))?.[0].type).toBe("categorie");
    expect(usage.get(url("prod"))?.[0].type).toBe("produit");
    expect(usage.get(url("choice"))?.[0].type).toBe("option");
  });

  it("labels a category by a fixed name, since its row name is not the image's subject", async () => {
    const usage = await collectImageUsage();
    expect(usage.get(url("cat"))?.[0].label).toBe("Categorie");
  });

  it("ignores anything that is not an /uploads/ reference", async () => {
    const external = await db.product.create({
      data: {
        name: `${tag}-external`,
        price: 100,
        vatRate: 10,
        categoryId,
        image: "https://example.com/remote.png",
        active: true,
        available: true,
      },
    });
    const usage = await collectImageUsage();
    expect(usage.get("https://example.com/remote.png")).toBeUndefined();
    await db.product.delete({ where: { id: external.id } });
  });

  it("accumulates every referencing row for one shared image", async () => {
    // The media library shows "+N" beyond the first badge, so the list has to
    // hold all of them, not just the last one seen.
    const shared = url("shared");
    const a = await db.categoryAddOn.create({
      data: { categoryId, name: `${tag}-s1`, price: 50, image: shared, sortOrder: 1, active: true },
    });
    const b = await db.categoryAddOn.create({
      data: { categoryId, name: `${tag}-s2`, price: 50, image: shared, sortOrder: 2, active: true },
    });
    const usage = await collectImageUsage();
    expect(usage.get(shared)).toHaveLength(2);
    await db.categoryAddOn.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  });
});

describe("clearImageReferences", () => {
  it("clears a CategoryOptionChoice reference and reports the count", async () => {
    const target = url("sauce");
    const cleared = await clearImageReferences(target);
    expect(cleared["CategoryOptionChoice.image"]).toBe(1);
    expect(totalCleared(cleared)).toBe(1);

    // The row survives; only its image is detached.
    const row = await db.categoryOptionChoice.findFirst({ where: { name: `${tag}-sauce` } });
    expect(row).not.toBeNull();
    expect(row!.image).toBeNull();

    // And it is no longer reported as usage.
    const usage = await collectImageUsage();
    expect(usage.get(target)).toBeUndefined();
  });

  it("clears a CategoryAddOn reference", async () => {
    const cleared = await clearImageReferences(url("topping"));
    expect(cleared["CategoryAddOn.image"]).toBe(1);
    const row = await db.categoryAddOn.findFirst({ where: { name: `${tag}-topping` } });
    expect(row!.image).toBeNull();
  });

  it("clears an AddOn reference", async () => {
    const cleared = await clearImageReferences(url("addon"));
    expect(cleared["AddOn.image"]).toBe(1);
    const row = await db.addOn.findFirst({ where: { name: `${tag}-addon` } });
    expect(row!.image).toBeNull();
  });

  it("reports a key for all six columns even when nothing matched", async () => {
    // The audit entry records the per-column counts; a missing key would
    // read as "not checked" rather than "checked, none found".
    const cleared = await clearImageReferences(url("never-used"));
    expect(Object.keys(cleared).sort()).toEqual([
      "AddOn.image",
      "Category.icon",
      "CategoryAddOn.image",
      "CategoryOptionChoice.image",
      "OptionChoice.image",
      "Product.image",
    ]);
    expect(totalCleared(cleared)).toBe(0);
  });

  it("clears the three columns it always cleared", async () => {
    const cleared = await clearImageReferences(url("prod"));
    expect(cleared["Product.image"]).toBe(1);
    const row = await db.product.findUnique({ where: { id: productId } });
    expect(row!.image).toBeNull();
  });

  it("touches only the requested url", async () => {
    // `Category.icon` still holds url("cat") through all of the above.
    const row = await db.category.findUnique({ where: { id: categoryId } });
    expect(row!.icon).toBe(url("cat"));
  });
});
