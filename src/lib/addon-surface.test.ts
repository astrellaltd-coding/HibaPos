import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import path from "path";
import { IMAGE_COLUMNS } from "@/lib/services/media-usage";
import { computeLinePricing, type ProductWithRelations } from "@/lib/services/pricing";
import { NAV_ITEMS } from "@/components/shared/nav-config";

// DD-15 (2026-09-05), Batch 5.7a — M-09 and M-10.
//
// `AddOn` and the `ProductAddon` join were a product-level add-on design that
// `CategoryAddOn` superseded. Measured read-only on production before the
// removal: `AddOn` 0 rows, `ProductAddon` 0 rows, `CategoryAddOn` **21**.
// `ProductAddon` had no writer anywhere, so a product-specific add-on could
// never be attached — which made the navigable « Suppléments » editor a screen
// that accepted work it could not deliver, C-21's shape at a second site.
// `Customer.postalCode` went with them: zero references in `src/`, and 0 of
// the 2 customers had one.
//
// ── THE TRAP THIS FILE EXISTS TO HOLD ────────────────────────────────────────
// `addon` named TWO things, and only one was dying:
//
//   1. `AddOn` + `ProductAddon`  — removed here. 0 rows, no writer.
//   2. `CategoryAddOn`           — 21 live rows, its own editor inside
//                                  `categories-view.tsx`, and the thing the
//                                  POS actually shows.
//
// They met in one `addonMap`, one `availableAddonIds`, one `addons` request
// field, one `ProductDto.addOns`, and two consecutive lines of
// `IMAGE_COLUMNS`. So this file asserts the removal in BOTH directions: no
// `AddOn` / `ProductAddon` may come back, and every surviving `CategoryAddOn`
// path must still work.
//
// That second direction is not hypothetical. Writing this batch, the
// `for (const a of categoryAddOns) add(...)` scan in `media-usage.ts` was
// deleted along with the `AddOn` scan one line below it — reintroducing C-25,
// the exact finding that scan exists to close. `eslint`'s unused-variable
// warning caught it. The assertions below are what would have caught it next.

const REPO_ROOT = process.cwd();
const SRC = path.join(REPO_ROOT, "src");
const SCHEMA = path.join(REPO_ROOT, "prisma", "schema.prisma");

/** Tokens that must not survive, and the token that must. */
const REMOVED = ["ProductAddon", "productAddons", "postalCode"];
const SURVIVOR = "CategoryAddOn";

/** Files allowed to mention a removed token, and why. Anything else is a
 *  reference that should have gone. Shrinking this list is fine; growing it
 *  means the removal was not finished. */
const EXPLAINS_THE_REMOVAL: Record<string, string> = {
  "src/lib/addon-surface.test.ts": "this file names the tokens in constants",
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...sourceFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/** Non-comment lines mentioning `token`. Same blunt comment test as
 *  `role-model.test.ts` and `order-status.test.ts`: a line survives only if it
 *  opens with `//`, `*` or `/*`. It errs toward reporting. */
function codeLinesMentioning(source: string, token: string): string[] {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return withoutBlocks
    .split(/\r?\n/)
    .filter((line) => line.includes(token))
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .map((line) => line.trim());
}

const rel = (f: string) => path.relative(REPO_ROOT, f).split(path.sep).join("/");

describe("DD-15 — the dead add-on surface is gone", () => {
  it("finds the source tree", () => {
    // CONTROL — a walk that silently returned nothing would make the sweeps
    // below pass vacuously. This cannot fail under any revert of this batch
    // and is not coverage.
    expect(sourceFiles(SRC).length).toBeGreaterThan(100);
  });

  it("leaves no reference to the removed models under src/, outside a comment", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      if (rel(file) in EXPLAINS_THE_REMOVAL) continue;
      const source = readFileSync(file, "utf8");
      for (const token of REMOVED) {
        for (const line of codeLinesMentioning(source, token)) {
          offenders.push(`${rel(file)} [${token}]: ${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("leaves no model, relation or column in the Prisma schema", () => {
    const schema = readFileSync(SCHEMA, "utf8");
    expect(codeLinesMentioning(schema, "model AddOn")).toEqual([]);
    expect(codeLinesMentioning(schema, "ProductAddon")).toEqual([]);
    expect(codeLinesMentioning(schema, "postalCode")).toEqual([]);
    // …and the survivor is still declared, so a removal that took the wrong
    // model with it fails here rather than passing quietly.
    expect(codeLinesMentioning(schema, `model ${SURVIVOR}`)).toHaveLength(1);
  });

  it("removes the « Suppléments » screen, its route and its nav entry", () => {
    // M-09's row called this a dead model. It was a 446-line navigable CRUD
    // view that accepted work it could never deliver — C-21's shape, and it
    // takes C-21's remedy: withdraw the screen, not just the table.
    for (const p of [
      "src/features/catalog/addons-view.tsx",
      "src/app/api/catalog/addons/route.ts",
      "src/app/api/catalog/addons/[id]/route.ts",
    ]) {
      expect(existsSync(path.join(REPO_ROOT, p))).toBe(false);
    }
    expect(NAV_ITEMS.map((i) => i.view)).not.toContain("addons");
    // The rest of the catalogue group is untouched.
    for (const view of ["categories", "products", "media", "customers"]) {
      expect(NAV_ITEMS.map((i) => i.view)).toContain(view);
    }
  });
});

describe("the CategoryAddOn namespace, which shares the word", () => {
  /** A product whose only add-ons come from its category — the live shape. */
  const product = (): ProductWithRelations => ({
    id: "p1",
    name: "Burger",
    price: 1000,
    pickupPrice: null,
    deliveryPrice: null,
    vatRate: 10,
    category: {
      parent: null,
      optionGroups: [],
      addOns: [{ id: "ca1", name: "Cheddar", price: 150, active: true }],
    },
    options: [],
    inheritCategoryGlobals: true,
  });

  it("still prices a category add-on onto a line", () => {
    // THE TRAP, second direction, and the one that matters: the 21 live rows
    // must still reach a price. Executed, not read.
    const r = computeLinePricing(
      { productId: "p1", quantity: 2, optionIds: [], addons: [{ addonId: "ca1", quantity: 1 }] },
      product(),
      "DINE_IN",
    );
    expect("error" in r).toBe(false);
    if (!("error" in r)) expect(r.lineTotal).toBe((1000 + 150) * 2);
  });

  it("still refuses an add-on the category does not offer", () => {
    // The refusal came from `availableAddonIds`, which used to be a union of
    // two sets. Collapsing it to one must not collapse the check.
    const r = computeLinePricing(
      { productId: "p1", quantity: 1, optionIds: [], addons: [{ addonId: "nope", quantity: 1 }] },
      product(),
      "DINE_IN",
    );
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error).toContain("non disponible");
  });

  it("still scans CategoryAddOn.image in the media library", () => {
    // C-25's whole point. This is the assertion that catches the mistake made
    // while writing this batch: deleting the surviving scan beside the dying
    // one would make the media library offer to delete images in use.
    const keys = IMAGE_COLUMNS.map((c) => `${c.model}.${c.column}`);
    expect(keys).toContain("CategoryAddOn.image");
    expect(keys).not.toContain("AddOn.image");
  });

  it("keeps the request field and the DTO field both add-on kinds shared", () => {
    // `orders/route.ts`'s `addons: [{ addonId, quantity }]` intent and
    // `ProductDto.addOns` were never product-specific — they carried the
    // union, whose product half was always empty. Removing that half must
    // leave both in place, or the POS cannot order a category add-on at all.
    const orders = readFileSync(path.join(SRC, "app", "api", "orders", "route.ts"), "utf8");
    expect(orders).toContain("addonId: z.string()");
    for (const f of ["route.ts", path.join("[id]", "route.ts")]) {
      const src = readFileSync(path.join(SRC, "app", "api", "catalog", "products", f), "utf8");
      expect(src).toContain("addOns: categoryAddOns,");
    }
  });
});

describe("what the removal must NOT have changed", () => {
  it("leaves the customer schema and DTO exactly as they were", () => {
    // M-10 is a schema-only removal: `postalCode` had zero references in
    // `src/`, so `customerSchema` and `CustomerDto` should not move at all.
    // Asserted because a removal that "tidied" them would be a behaviour
    // change smuggled in under a dead-column deletion.
    //
    // `city` JOINED THE LIST ON 2026-09-18 — L-221, on the operator's explicit
    // decision, and this is the one edit this assertion is meant to survive.
    // The owner, creating a client for a livraison at the caisse, found that a
    // town had nowhere to go: the whole location was one free-text `address`.
    //
    // **THIS TEST IS NOT WEAKENED BY THE EDIT, AND THAT IS THE POINT.** It
    // exists so that `customerSchema` cannot move by accident, and the list is
    // still exact — it went from five names to six, once, in a commit that also
    // carried the migration, `CustomerDto`, both customer forms, the picker's
    // list row, the detail dialog, the three `/api/customers` routes,
    // `DeliveryCandidate` and the bon de livraison that prints it. That is
    // precisely what DD-15's tombstone twelve lines above `city` in
    // `schema.prisma` asks for: a location column arrives with its readers or
    // it does not arrive.
    const validation = readFileSync(path.join(SRC, "lib", "validation.ts"), "utf8");
    const customer = /export const customerSchema = z\.object\(\{([\s\S]*?)\}\);/.exec(validation);
    expect(customer).not.toBeNull();
    const fields = [...customer![1].matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
    expect(fields).toEqual(["name", "phone", "email", "address", "city", "notes"]);
  });

  it("L-221 — and `city` did NOT arrive alone, which is DD-15's whole lesson", () => {
    // The assertion the one above cannot make. A field list that simply gained
    // a name would be satisfied by the dead `postalCode` column DD-15 deleted
    // « with a comment calling it a French delivery requirement and ZERO
    // references in `src/` ». So this names the readers, and it fails if a
    // later tidy-up removes any of them while leaving the column in place.
    //
    // EVERY NEEDLE IS AN EXPRESSION, NEVER AN id OR A LABEL, and the file is
    // read with its COMMENTS STRIPPED. Both rules were bought with a failed
    // revert: the first draft asserted `"customer-picker-ville"`, the revert
    // renamed that id to `customer-picker-ville-REMOVED` — taking the box out
    // of the form — and the assertion SURVIVED, because the old id is a
    // substring of the new one. An id is a name somebody can change; a binding
    // is what actually puts the town on the screen. Same lesson as L-213's
    // `data-osk="off"` and L-214's `c.address`, for the third time.
    const reads = (rel: string, needle: string) => {
      const src = readFileSync(path.join(SRC, ...rel.split("/")), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(src, `${rel} no longer reads the town`).toContain(needle);
    };
    reads("types/api.ts", "city: string | null;");
    reads("lib/delivery-customer.ts", '"address", "city"');
    reads("app/api/customers/route.ts", "city: c.city,");
    reads("app/api/customers/[id]/detail/route.ts", "city: true,");
    // The two forms: the BINDING, which is what fills the box and sends it.
    reads("components/pos/customer-picker-dialog.tsx", "value={form.city}");
    reads("components/pos/customer-picker-dialog.tsx", "city: form.city.trim() || null");
    reads("features/catalog/customers-view.tsx", "value={form.city}");
    reads("features/catalog/customers-view.tsx", "city: form.city.trim()");
    // The JOIN, not the bare `detail.city`: taking the town out of the line the
    // card prints left that needle satisfied by the `!detail.city` guard lower
    // down the same file, and the revert stayed green. Second hole the reverts
    // found in this one assertion.
    reads("components/pos/customer-detail-dialog.tsx", "[detail.address, detail.city]");
    reads("lib/services/delivery-note.ts", "customer.city");
    // And both order routes select it, or nothing can print it.
    reads("app/api/orders/route.ts", "city: true");
    reads("app/api/orders/[id]/route.ts", "city: true");
    reads("lib/services/checkout.ts", "city: true");
  });

  it("keeps categoryAddOnSchema, which is not the schema that was deleted", () => {
    const validation = readFileSync(path.join(SRC, "lib", "validation.ts"), "utf8");
    expect(codeLinesMentioning(validation, "categoryAddOnSchema").length).toBeGreaterThan(0);
    // `addOnSchema` served only the two deleted routes and went with them.
    // Anchored so `categoryAddOnSchema` does not satisfy it as a substring.
    expect(codeLinesMentioning(validation, "const addOnSchema")).toEqual([]);
  });
});
