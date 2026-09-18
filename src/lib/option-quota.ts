/**
 * L-217 — how many of an option a size includes, and what a repeat means.
 *
 * THE HOLE THIS CLOSES. The operator entered the tacos on 2026-09-17/18 with
 * `Viande` as a category option group, `required` and `multiple`. The server
 * enforced « at least one » (because required) and « at most one » (only for a
 * single-select group), and **nothing anywhere enforced a ceiling** — so a
 * Tacos M at 6,90 € took all six viandes for 6,90 €. The three sizes are
 * 6,90 · 8,90 · 11,90 and their names were the only thing saying how much meat
 * each is: a convention in the operator's head, not a rule the till held.
 *
 * THE RULES, settled by the operator 2026-09-18:
 *   · M includes 1 viande, L 2, XL 3 — **a ceiling, not a requirement**. A
 *     customer who wants one meat on an L pays the L price and is served.
 *     `required` still supplies the floor of one, so an L is 1 or 2.
 *   · **The same viande may be taken twice.** « 2 × viande hachée » on an L is
 *     an ordinary order and the till could not express it.
 *   · **Beyond the size's count is REFUSED**, not charged. A size costs the
 *     size's price; somebody who wants more meat rings the bigger size.
 *
 * THE COUNT LIVES ON THE PRODUCT, NOT THE GROUP, and that is forced by the
 * catalogue: M, L and XL are three PRODUCTS sharing one CATEGORY group, so a
 * single `maxSelect` on `Viande` cannot say 1, 2 and 3 at once. The category
 * says WHICH viandes exist; the product says HOW MANY are included.
 *
 * A REPEAT IN `optionIds` IS THE QUANTITY, which is why no new field crosses
 * the wire. The list was already a list — `toCartOptions` pushes one entry per
 * pick and `buildCheckoutItems` maps each to its id — so two picks of the same
 * viande arrive as the same id twice. Until now the server put that list
 * through a `Set` and the second one vanished. **Nothing the till sends today
 * contains a repeat**, so reading them as quantities changes no existing
 * behaviour; it gives the missing selector somewhere to land.
 */

/** No quota recorded for a group means no ceiling, exactly as before. */
export const NO_QUOTA = null;

/**
 * How many times each choice was picked.
 *
 * A `Map` rather than a `Set`, and that is the whole change on this path: the
 * `Set` this replaces is where « 2 × viande hachée » used to be silently
 * collapsed into one.
 */
export function countChoices(optionIds: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of optionIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/**
 * Add a menu's pinned choices WITHOUT adding to a count the cashier already
 * made.
 *
 * Batch 5.9 pins the choices a menu governs and they used to join the cashier's
 * through a union of sets, so an id present in both counted once. Adding them
 * to a multiset would count it twice and charge a menu's size twice over. Set
 * to one only when absent, which is what the union did.
 */
export function withPinnedChoices(
  counts: Map<string, number>,
  pinned: Iterable<string>,
): Map<string, number> {
  for (const id of pinned) if (!counts.has(id)) counts.set(id, 1);
  return counts;
}

/** What a group asks of a selection, once the product's quota is known. */
export interface GroupRule {
  groupName: string;
  productName: string;
  required: boolean;
  multiple: boolean;
  /** The product's ceiling for this group, or `NO_QUOTA` when it has none. */
  quota: number | null;
  /** A menu governs this group, so it is not asked inside the menu (Batch 5.9). */
  governed?: boolean;
}

/**
 * Check one group's selections and return the French refusal, or `null`.
 *
 * ORDER MATTERS AND IS DELIBERATE: the floor is reported before the ceiling, so
 * a cashier who has chosen nothing is told to choose rather than told about a
 * maximum they are nowhere near.
 */
export function checkGroupSelection(rule: GroupRule, total: number): string | null {
  if (rule.required && !rule.governed && total === 0) {
    return `Option obligatoire manquante : ${rule.groupName}`;
  }
  if (!rule.multiple && total > 1) {
    return `Une seule sélection autorisée pour : ${rule.groupName}`;
  }
  if (rule.quota !== null && total > rule.quota) {
    return `« ${rule.groupName} » : ${rule.quota} au maximum pour ${rule.productName}.`;
  }
  return null;
}

/**
 * The quota a product records for a group, or `NO_QUOTA`.
 *
 * Structural rather than Prisma-typed so a test can pass three plain objects,
 * and so the same reader serves the checkout and the catalogue screen.
 */
export function quotaFor(
  quotas: readonly { groupId: string; included: number }[] | null | undefined,
  groupId: string,
): number | null {
  const found = quotas?.find((q) => q.groupId === groupId);
  return found ? found.included : NO_QUOTA;
}

/**
 * L-220 — which groups the product form offers a count for, and what it sends.
 *
 * WHY THIS IS NOT READ OFF THE PRODUCT. It was, and the field was then
 * INVISIBLE WHILE CREATING one: the gate asked `product.options` for its
 * inherited groups, and a product being created has none yet. The operator
 * filled the form, saved, reopened it, and only then could say how many viandes
 * it included. The groups were knowable all along — they belong to the CATEGORY
 * being chosen, which the form has from its first render.
 *
 * MULTI-SELECT ONLY. A single-select group is already capped at one by
 * `!multiple`, so a count on it could never be reached and the field would be
 * asking a question with no answer.
 *
 * `inherits` is `inheritCategoryGlobals`: a product that does not inherit never
 * sees the category's groups, so it is offered none and — see `quotaPayload` —
 * sends none.
 */
export function quotaGroupsFor(
  category: { optionGroups?: readonly { id: string; name: string; multiple: boolean }[] } | null | undefined,
  inherits: boolean,
): { id: string; name: string; multiple: boolean }[] {
  if (!inherits) return [];
  return (category?.optionGroups ?? []).filter((g) => g.multiple).map((g) => ({ ...g }));
}

/**
 * The `optionQuotas` a save carries, from the boxes the form is showing.
 *
 * BUILT FROM THE GROUPS ON SCREEN, not from everything the form has ever held.
 * Changing a product's category leaves the previous category's numbers in
 * state, and sending those would write a ceiling against a group the product
 * cannot see — inert, invisible, and confusing to the next person who reads the
 * table wondering why a Tacos rule is attached to a burger.
 *
 * An empty box means NO CEILING and is dropped. `0` is kept, because « this
 * size includes none of that group » is a real answer and a truthiness test
 * would silently discard it.
 */
export function quotaPayload(
  groups: readonly { id: string }[],
  values: Readonly<Record<string, string>>,
): { groupId: string; included: number }[] {
  const out: { groupId: string; included: number }[] = [];
  for (const g of groups) {
    const raw = (values[g.id] ?? "").trim();
    if (raw === "") continue;
    const included = Number(raw);
    if (!Number.isInteger(included) || included < 0) continue;
    out.push({ groupId: g.id, included });
  }
  return out;
}
