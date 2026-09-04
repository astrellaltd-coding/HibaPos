// Validate a category's option groups and add-ons BEFORE anything is deleted
// — C-24, Batch 4.6.
//
// THE PROBLEM THIS SOLVES
// -----------------------
// `PUT /api/catalog/categories/[id]` replaced option groups and add-ons
// wholesale, and it validated each entry *inside* the loop that recreated
// them — after the `deleteMany` had already run:
//
//     await tx.categoryOptionGroup.deleteMany({ where: { categoryId } });
//     for (const g of optionGroups) {
//       const parsed = categoryOptionGroupSchema.safeParse(g);
//       if (!parsed.success) continue;        // <- old gone, new not created
//       ...
//     }
//
// So one malformed group in an otherwise-valid save silently destroyed the
// category's existing configuration and answered **200**. Nothing told the
// operator, and the only record of what had been there was the response they
// had already navigated away from. The same shape applied to add-ons.
//
// A category's option groups are the sauces, breads and toppings this
// restaurant sells; they are real work, not seed data (warning 4 in the
// plan). Losing them silently is the worst available outcome, which is why
// this is a HIGH-severity data-loss finding rather than a validation nit.
//
// THE RULE
// --------
// Parse every entry first. If any entry fails, refuse the whole request with
// a 400 that names which one — and delete nothing. Only once the entire
// payload is known good may the replace proceed.
//
// WHY A MODULE AND NOT AN `if` IN THE ROUTE
// -----------------------------------------
// `withAuth` → `getSession()` → `cookies()` throws outside a request scope,
// so a rule written inline in a route handler cannot be tested at all until
// Batch 6.1 builds a request harness (see `api-authorization.test.ts`'s own
// note). A pure function over plain input can be asserted directly, which is
// what this batch's validation criteria ask for. Same reasoning as
// `account-policy.ts` (Batch 4.3) and `fiscal-counter-floor.ts` (Batch 4.5).

import { categoryOptionGroupSchema, categoryAddOnSchema } from "@/lib/validation";
import type { z } from "zod";

export type CategoryOptionGroupInput = z.infer<typeof categoryOptionGroupSchema>;
export type CategoryAddOnInput = z.infer<typeof categoryAddOnSchema>;

/**
 * The outcome of checking one replaceable collection.
 *
 * `absent` is distinct from an empty `entries` list on purpose: absent means
 * *leave the existing rows alone*, an empty list means *delete them all*.
 * Collapsing the two is the product-side half of C-24.
 */
export type PayloadCheck<T> =
  | { kind: "absent" }
  | { kind: "ok"; entries: T[] }
  | { kind: "invalid"; error: string };

/** Where a refusal happened, in words an operator can act on. */
function describeIssue(collection: string, index: number, message: string): string {
  return `${collection} n°${index + 1} invalide : ${message}. Aucune modification n'a été enregistrée.`;
}

/**
 * Check a whole collection up front.
 *
 * Returns on the FIRST invalid entry, naming its 1-based position — the
 * operator is looking at a numbered list in a form, so an index is more use
 * to them than a field path. Nothing here writes or deletes; the caller
 * decides what to do with the verdict, and must not begin a replace until it
 * is `ok`.
 */
function checkCollection<S extends z.ZodType>(
  raw: unknown,
  schema: S,
  collectionLabel: string,
): PayloadCheck<z.infer<S>> {
  if (raw === undefined || raw === null) return { kind: "absent" };

  // A present-but-not-array value used to fall through `Array.isArray` and be
  // ignored, so `{"addOns": "none"}` answered 200 having changed nothing. A
  // caller that sends the wrong type deserves to be told.
  if (!Array.isArray(raw)) {
    return {
      kind: "invalid",
      error: `${collectionLabel} doit être une liste. Aucune modification n'a été enregistrée.`,
    };
  }

  const entries: z.infer<S>[] = [];
  for (let i = 0; i < raw.length; i++) {
    const parsed = schema.safeParse(raw[i]);
    if (!parsed.success) {
      return {
        kind: "invalid",
        error: describeIssue(collectionLabel, i, parsed.error.issues[0]?.message ?? "données invalides"),
      };
    }
    entries.push(parsed.data);
  }
  return { kind: "ok", entries };
}

/** Check the `optionGroups` field of a category PUT body. */
export function checkOptionGroups(raw: unknown): PayloadCheck<CategoryOptionGroupInput> {
  return checkCollection(raw, categoryOptionGroupSchema, "Groupe d'options");
}

/** Check the `addOns` field of a category PUT body. */
export function checkAddOns(raw: unknown): PayloadCheck<CategoryAddOnInput> {
  return checkCollection(raw, categoryAddOnSchema, "Supplément");
}

/**
 * Check both collections of a category PUT body together.
 *
 * Both are checked before either is applied, because the route replaces them
 * in one transaction: a valid `optionGroups` beside a malformed `addOns` must
 * not delete the option groups either.
 */
export function checkCategoryCollections(body: {
  optionGroups?: unknown;
  addOns?: unknown;
}): { error: string } | {
  optionGroups: PayloadCheck<CategoryOptionGroupInput>;
  addOns: PayloadCheck<CategoryAddOnInput>;
} {
  const optionGroups = checkOptionGroups(body.optionGroups);
  if (optionGroups.kind === "invalid") return { error: optionGroups.error };

  const addOns = checkAddOns(body.addOns);
  if (addOns.kind === "invalid") return { error: addOns.error };

  return { optionGroups, addOns };
}
