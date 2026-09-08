import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { PUT } from "./products/[id]/route";

// L-67 (Batch 5.8) — the guard in `PUT /api/catalog/products/[id]`, driven over
// HTTP rather than asserted about.
//
// WHY THIS FILE EXISTS, AND IT IS THE POINT OF THE BATCH. `product-options.ts`
// has 14 unit tests and every one of them passed while the route ignored the
// module entirely: reverting the route's single `splitOwnFromInherited` call
// left 1025/1025 green. *Methods → Prove the test fails on the old code* names
// that exact outcome — "the test proves less than it claims" — so the rule being
// correct and the route consulting it are two different claims, and only the
// second one is the finding.
//
// THE FINDING. `GET` returns the category's option groups merged with the
// product's own and marked as neither, the admin editor round-trips that merged
// list, and `PUT` used to persist all of it with `productId` set. Every save of
// a product therefore copied its category's groups onto it while the category
// kept its own, and the POS rendered each one twice. Twelve products on
// production were in that state — every Croustillant, all edited the same
// afternoon — and because the category's « Sauces » group is `required`, a sauce
// had to be chosen twice before the product could go in the basket.

const MANAGER = { id: "u-l67", username: "l67-manager", role: "MANAGER" as const };

// ONLY the rows this file creates. A blanket `deleteMany` over User, Product
// and Category — which is what this started as — fails in the full suite: the
// runner shares one temp database across every file, and other files leave rows
// referencing User, so `db.user.deleteMany()` hits a foreign-key constraint.
// Six tests passed alone and failed together, which is the only symptom that
// distinguishes an isolation fault from a real one.
const created: { categories: string[]; products: string[] } = { categories: [], products: [] };

async function cleanup() {
  if (created.products.length) {
    await db.optionGroup.deleteMany({ where: { productId: { in: created.products } } });
    await db.product.deleteMany({ where: { id: { in: created.products } } });
  }
  if (created.categories.length) {
    // Category groups are a SEPARATE model: `OptionGroup` carries only
    // `productId`. Deleting the wrong one is how this cleanup first failed.
    await db.categoryOptionGroup.deleteMany({ where: { categoryId: { in: created.categories } } });
    await db.category.deleteMany({ where: { id: { in: created.categories } } });
  }
  created.products.length = 0;
  created.categories.length = 0;
}

/** A category that provides « Sauces », and a product filed under it. */
async function seed(opts: { inheritCategoryGlobals?: boolean; parentOwnsGroups?: boolean } = {}) {
  const inherit = opts.inheritCategoryGlobals ?? true;

  const parent = opts.parentOwnsGroups
    ? await db.category.create({
        data: { name: "Parent", optionGroups: { create: { name: "Sauces", required: true, multiple: true, sortOrder: 0 } } },
      })
    : null;

  const category = await db.category.create({
    data: {
      name: opts.parentOwnsGroups ? "Sous-categorie" : "Croustillants",
      parentId: parent?.id ?? null,
      ...(opts.parentOwnsGroups
        ? {}
        : { optionGroups: { create: { name: "Sauces", required: true, multiple: true, sortOrder: 0 } } }),
    },
  });

  const product = await db.product.create({
    data: { name: "5 Nuggets", price: 550, categoryId: category.id, inheritCategoryGlobals: inherit },
  });

  created.categories.push(category.id);
  if (parent) created.categories.push(parent.id);
  created.products.push(product.id);
  return { category, product };
}

/** The body the admin editor sends: whatever the GET handed it, back again. */
function putBody(categoryId: string, groupNames: string[], inheritCategoryGlobals = true) {
  return {
    name: "5 Nuggets",
    price: 550,
    categoryId,
    inheritCategoryGlobals,
    options: groupNames.map((name) => ({
      name,
      required: true,
      multiple: true,
      choices: [{ name: "Mayonnaise", priceModifier: 0 }],
    })),
  };
}

const productGroupNames = (productId: string) =>
  db.optionGroup.findMany({ where: { productId }, select: { name: true } }).then((r) => r.map((x) => x.name));

beforeEach(async () => {
  clearCookies();
  await cleanup();
  await db.user.upsert({
    where: { id: MANAGER.id },
    update: {},
    create: { ...MANAGER, name: "L67", pinHash: await hashPin("424242"), active: true },
  });
  await signInAs(MANAGER);
});

afterAll(async () => {
  await cleanup();
  await db.session.deleteMany({ where: { userId: MANAGER.id } });
  await db.user.deleteMany({ where: { id: MANAGER.id } });
});

describe("PUT /api/catalog/products/[id] — inherited option groups (L-67)", () => {
  it("does not store a group the product already inherits from its category", async () => {
    // THE REPORTED BUG. Before the guard this created a product-level « Sauces »
    // beside the category's, and the POS then asked for a sauce twice.
    const { category, product } = await seed();

    const res = await callJson(PUT, {
      method: "PUT",
      params: { id: product.id },
      body: putBody(category.id, ["Sauces"]),
    });

    expect(res.status).toBe(200);
    expect(await productGroupNames(product.id)).toEqual([]);
  });

  it("still stores a group the category does not provide", async () => {
    // The guard removes duplicates, not product-level groups. Losing this would
    // be a worse defect than the one being fixed.
    const { category, product } = await seed();

    await callJson(PUT, {
      method: "PUT",
      params: { id: product.id },
      body: putBody(category.id, ["Sauces", "Cuisson"]),
    });

    expect(await productGroupNames(product.id)).toEqual(["Cuisson"]);
  });

  it("matches the inherited name across case and whitespace", async () => {
    // The names travel through a hand-typed admin form and back. Comparing them
    // raw would let « sauces » through and re-create the duplicate.
    const { category, product } = await seed();

    await callJson(PUT, {
      method: "PUT",
      params: { id: product.id },
      body: putBody(category.id, ["  sauces "]),
    });

    expect(await productGroupNames(product.id)).toEqual([]);
  });

  it("stores the group when the product opts out of inheritance", async () => {
    // `inheritCategoryGlobals: false` is the override path: the category
    // contributes nothing, so an identically-named group IS the product's own
    // and must survive. If this ever fails, the override has been eaten.
    const { category, product } = await seed({ inheritCategoryGlobals: false });

    await callJson(PUT, {
      method: "PUT",
      params: { id: product.id },
      body: putBody(category.id, ["Sauces"], false),
    });

    expect(await productGroupNames(product.id)).toEqual(["Sauces"]);
  });

  it("resolves inheritance through the parent for a product in a sub-category", async () => {
    // Sub-categories are folders; the product inherits the PARENT's groups.
    // Reading the sub-category instead would miss the duplicate entirely.
    const { category, product } = await seed({ parentOwnsGroups: true });

    await callJson(PUT, {
      method: "PUT",
      params: { id: product.id },
      body: putBody(category.id, ["Sauces"]),
    });

    expect(await productGroupNames(product.id)).toEqual([]);
  });

  it("leaves existing groups untouched when the caller omits `options` (C-24)", async () => {
    // Regression assertion, not coverage for this batch: Batch 4.6 made
    // `options` optional so a partial PUT stops destroying the configuration.
    // The guard runs inside that same `if`, so it is worth pinning that adding
    // it did not move the branch. This test passes under every revert below.
    const { category, product } = await seed();
    await db.optionGroup.create({
      data: { productId: product.id, name: "Cuisson", required: false, multiple: false, sortOrder: 0 },
    });

    const body = putBody(category.id, []) as Record<string, unknown>;
    delete body.options;
    await callJson(PUT, { method: "PUT", params: { id: product.id }, body });

    expect(await productGroupNames(product.id)).toEqual(["Cuisson"]);
  });
});
