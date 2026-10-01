/**
 * L-251 — whose « Taille » the product editor is looking at.
 *
 * THE DEFECT. The editor's « Tailles multiples » switch was set from the first
 * group named `Taille` in the product's MERGED option list, and the merged list
 * includes the groups the product inherits. Every pizza inherits `Pizzas`'
 * Junior · Senior · Mega, so every pizza opened with the switch ON as if the
 * sizes were its own: the price fields went grey, and a save priced the product
 * from those sizes. On a NEW pizza the switch was offered as well, and turning
 * it on is how « Chicago » got a second `Taille` of its own on 2026-09-28 — the
 * one the POS hid and the server refused the sale over.
 *
 * THE RULE. A product has sizes of its own only if it owns a `Taille` group.
 * When its category already provides one and the product inherits, the sizes
 * are the category's, edited on the category, and the switch is not offered.
 *
 * Pure and structural, like `services/product-options.ts`, so the test runner
 * can hold it without a DOM.
 */
import { normalizeGroupName } from "@/lib/services/product-options";

export const SIZE_GROUP_NAME = "Taille";

const isSizeGroup = (name: string) => normalizeGroupName(name) === normalizeGroupName(SIZE_GROUP_NAME);

/** The product's OWN size group with at least two sizes, or null. Inherited groups never count. */
export function ownSizeGroup<G extends { name: string; inherited?: boolean; choices: readonly unknown[] }>(
  options: readonly G[] | null | undefined,
): G | null {
  const found = (options ?? []).find((g) => !g.inherited && isSizeGroup(g.name));
  return found && found.choices.length >= 2 ? found : null;
}

/**
 * Whether the category the product inherits from already provides sizes.
 *
 * `categoryGroups` is the GLOBALS category's — `parent ?? category`, which the
 * editor already resolves for L-220. A product that does not inherit is
 * offered its own sizes whatever its category has, which is the override path.
 */
export function categoryProvidesSizes(
  inherits: boolean,
  categoryGroups: readonly { name: string }[] | null | undefined,
): boolean {
  if (!inherits) return false;
  return (categoryGroups ?? []).some((g) => isSizeGroup(g.name));
}
