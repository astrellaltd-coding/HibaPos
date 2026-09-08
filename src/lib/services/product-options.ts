/**
 * The option-group inheritance rule, in one place — Batch 5.8 (L-67).
 *
 * WHY THIS FILE EXISTS. A product's options are the union of two sources: the
 * groups its category provides, and the groups it owns itself. That union was
 * computed independently in `api/catalog/products/route.ts` and
 * `api/catalog/products/[id]/route.ts`, and the rule for telling the two apart
 * existed only in `scripts/fix-duplicate-product-options.ts` — a repair script.
 * So the read merged them, the DTO said nothing about which was which, the admin
 * editor round-tripped the merged list, and `PUT` persisted all of it as
 * product-level groups. Every save of a product copied its category's groups
 * onto it, and the POS then showed each one twice. Twelve products on production
 * were in that state, all of them edited the same afternoon.
 *
 * This is the treatment `services/ticket-layout.ts` has: the rule lives here or
 * it does not exist. The repair script's rule is reproduced EXACTLY —
 * `inheritCategoryGlobals` must be true, the category is `parent ?? category`,
 * and names are compared trimmed and lower-cased — so the guard and the repair
 * agree by construction rather than by coincidence.
 *
 * Nothing here touches Prisma or a request: the structural types are the least
 * each function needs, which is what makes them testable without a database.
 */

/** How the inheritance rule compares two group names.
 *
 *  Trimmed and lower-cased, from `fix-duplicate-product-options.ts`. Catalogue
 *  names are typed by hand in the admin screen, so "Sauces", "sauces" and
 *  "Sauces " are the same group to a human and must be the same group here. */
export function normalizeGroupName(name: string): string {
  return name.trim().toLowerCase();
}

/** The least a category has to look like for the rule to read it.
 *
 *  Deliberately structural and NOT generic. An earlier signature was
 *  `<C extends { parent?: C | null }>`, which makes the parent share the child's
 *  exact type — no Prisma `include` shape satisfies that, because the parent is
 *  loaded without a parent of its own, and `tsc` rejected every call site. */
export type CategoryWithGroups = {
  optionGroups?: readonly { name: string }[] | null;
  parent?: { optionGroups?: readonly { name: string }[] | null } | null;
};

/** The option groups a product inherits from its category.
 *
 *  Sub-categories are folders: a product filed under one inherits the PARENT's
 *  groups, not the sub-category's. Both serialisers already resolved it that way
 *  (`p.category?.parent ?? p.category`); doing it here is what stops the write
 *  path from disagreeing with the read path about which category is in force. */
export function inheritedCategoryGroups(
  category: CategoryWithGroups | null | undefined,
): readonly { name: string }[] {
  const effective = category?.parent ?? category;
  return effective?.optionGroups ?? [];
}

/** The normalised names a product inherits.
 *
 *  Empty when the product opts out with `inheritCategoryGlobals === false` —
 *  and that is the whole of the override story. A product that needs its own
 *  version of a group its category provides turns inheritance off and defines
 *  the group itself; with inheritance on, a same-named group is the corruption
 *  this batch removes, not an override. */
export function inheritedGroupNames(
  inheritCategoryGlobals: boolean,
  category: CategoryWithGroups | null | undefined,
): Set<string> {
  if (!inheritCategoryGlobals) return new Set();
  return new Set(inheritedCategoryGroups(category).map((g) => normalizeGroupName(g.name)));
}

/**
 * Split a product's own groups into the ones that are genuinely its own and the
 * ones that merely repeat something it already inherits.
 *
 * The read path uses this to avoid rendering a group twice; the write path uses
 * it to refuse to store the repeats in the first place. Both must reach the
 * same verdict, which is why there is one function rather than two rules.
 */
export function splitOwnFromInherited<G extends { name: string }>(
  groups: readonly G[],
  inherited: ReadonlySet<string>,
): { own: G[]; duplicatesOfInherited: G[] } {
  const own: G[] = [];
  const duplicatesOfInherited: G[] = [];
  for (const g of groups) {
    if (inherited.has(normalizeGroupName(g.name))) duplicatesOfInherited.push(g);
    else own.push(g);
  }
  return { own, duplicatesOfInherited };
}
