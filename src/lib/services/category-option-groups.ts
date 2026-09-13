// Saving a category must not destroy the menu rules that depend on it — L-91.
//
// ── WHAT WENT WRONG ──────────────────────────────────────────────────────────
//
// `PUT /api/catalog/categories/[id]` replaced option groups wholesale:
// `categoryOptionGroup.deleteMany({ categoryId })`, then re-`create` with fresh
// cuids. `ComboSlotOptionRule.categoryOptionGroupId` is `onDelete: Cascade`, so
// **every rule went with them** — no error, no warning, and `CATEGORY_UPDATED`
// records the category name and nothing else.
//
// A `ComboSlotOptionRule` is what fixes a menu component's option *without
// asking the cashier*. All seven live rows hang off one group, `Pizzas →
// Taille`. Losing them does two things:
//
//   1. the cashier is asked the size again inside the menu, and can ring a
//      Junior in an XXL;
//   2. `componentReferencePrice` loses its pinned choice — and the three
//      `Taille` choices carry absolute prices, so **the weight `apportion` is
//      handed really does move, and that weight is what divides the forfait
//      between 10 % and 5,5 %.**
//
// That is why this is group A and not a catalogue nicety.
//
// ── WHY MATCHING BY ID WAS NOT ENOUGH ON ITS OWN ─────────────────────────────
//
// The audit's suggested fix is « match incoming groups by id and update in
// place ». Necessary, and measured to be insufficient: **the client sent no ids
// at all.** `categories-view.tsx` loads them into its form and then drops them
// when building the payload, and the `Taille` group is rebuilt from scratch by
// the save handler rather than passed through. So every group arrived looking
// new, and match-by-id alone would have deleted and recreated all of them
// exactly as before. The client was fixed in the same commit; this module is
// what makes that fix load-bearing rather than decorative.
//
// So: match by id, reconcile choices by id too — `ComboSlotOptionRule`
// .categoryOptionChoiceId is `onDelete: Restrict`, so a preserved group whose
// choices were replaced would fail with a raw Prisma foreign-key error instead
// of a sentence — and **refuse, naming the menu, when a save would remove
// something a rule depends on.** A refusal the operator can read beats a
// cascade they cannot see.

import type { Prisma } from "@prisma/client";

/** One option group as the route received it. `id` present ⇒ « this is the
 *  group you already have », absent ⇒ « create a new one ». */
export type IncomingOptionGroup = {
  id?: string;
  name: string;
  required: boolean;
  multiple: boolean;
  choices: IncomingOptionChoice[];
};

export type IncomingOptionChoice = {
  id?: string;
  name: string;
  priceModifier: number;
  pickupPriceModifier?: number | null;
  deliveryPriceModifier?: number | null;
  pickupPrice?: number | null;
  deliveryPrice?: number | null;
  image?: string | null;
};

/** Raised when a save would remove a group or choice a menu rule pins. Carries
 *  a French sentence naming the menus, because « 500 » tells the operator
 *  nothing and the cascade told them less. */
export class OptionGroupInUseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptionGroupInUseError";
  }
}

type TxClient = Prisma.TransactionClient;

/** The menus that pin something in this category, for the refusal message. */
async function menusUsing(
  tx: TxClient,
  where: Prisma.ComboSlotOptionRuleWhereInput,
): Promise<string[]> {
  const rules = await tx.comboSlotOptionRule.findMany({
    where,
    select: { slot: { select: { name: true, product: { select: { name: true } } } } },
  });
  const names = rules.map((r) => `${r.slot.product.name} → ${r.slot.name}`);
  return [...new Set(names)].sort();
}

/**
 * Bring this category's option groups in line with `incoming`, in place.
 *
 * Matched by id: updated. New: created. Missing from the payload: deleted —
 * unless a `ComboSlotOptionRule` depends on it, which is a refusal.
 *
 * Runs inside the caller's transaction, so a refusal rolls back the whole save
 * rather than leaving a category half-edited.
 */
export async function reconcileOptionGroups(
  tx: TxClient,
  categoryId: string,
  incoming: IncomingOptionGroup[],
): Promise<void> {
  const existing = await tx.categoryOptionGroup.findMany({
    where: { categoryId },
    select: { id: true, choices: { select: { id: true } } },
  });
  const existingById = new Map(existing.map((g) => [g.id, g]));

  // An id the payload names that does not belong to this category is a client
  // bug or a crossed wire, and silently creating a duplicate group would hide
  // it. Treated as « new » would be worse: the real group then goes unmatched
  // and is deleted.
  const claimed = incoming.flatMap((g) => (g.id && existingById.has(g.id) ? [g.id] : []));
  const claimedSet = new Set(claimed);

  // ── 1. groups the payload does not keep ────────────────────────────────────
  const doomed = existing.filter((g) => !claimedSet.has(g.id)).map((g) => g.id);
  if (doomed.length > 0) {
    const menus = await menusUsing(tx, { categoryOptionGroupId: { in: doomed } });
    if (menus.length > 0) {
      throw new OptionGroupInUseError(
        `Ce groupe d'options est utilisé par un menu composé et ne peut pas être supprimé : ` +
          `${menus.join(", ")}. Retirez d'abord la règle du menu, ou renommez le groupe au ` +
          `lieu de le remplacer.`,
      );
    }
    await tx.categoryOptionGroup.deleteMany({ where: { id: { in: doomed } } });
  }

  // ── 2. the rest, in payload order ──────────────────────────────────────────
  for (let i = 0; i < incoming.length; i++) {
    const group = incoming[i];
    const match = group.id ? existingById.get(group.id) : undefined;

    if (!match) {
      const created = await tx.categoryOptionGroup.create({
        data: {
          categoryId,
          name: group.name,
          required: group.required,
          multiple: group.multiple,
          sortOrder: i,
        },
      });
      for (let j = 0; j < group.choices.length; j++) {
        await tx.categoryOptionChoice.create({ data: choiceData(created.id, group.choices[j], j) });
      }
      continue;
    }

    await tx.categoryOptionGroup.update({
      where: { id: match.id },
      data: {
        name: group.name,
        required: group.required,
        multiple: group.multiple,
        sortOrder: i,
      },
    });

    // Choices, by id as well. A rule pins a CHOICE, not just a group
    // (`categoryOptionChoiceId`), and that relation is `onDelete: Restrict` —
    // so replacing the choices of a preserved group would fail with a raw
    // foreign-key error. Refuse first, in French, naming the menu.
    const keptChoiceIds = new Set(
      group.choices.flatMap((c) => (c.id && match.choices.some((x) => x.id === c.id) ? [c.id] : [])),
    );
    const doomedChoices = match.choices.filter((c) => !keptChoiceIds.has(c.id)).map((c) => c.id);
    if (doomedChoices.length > 0) {
      const menus = await menusUsing(tx, { categoryOptionChoiceId: { in: doomedChoices } });
      if (menus.length > 0) {
        throw new OptionGroupInUseError(
          `Un choix de ce groupe est imposé par un menu composé et ne peut pas être supprimé : ` +
            `${menus.join(", ")}. Modifiez le menu d'abord.`,
        );
      }
      await tx.categoryOptionChoice.deleteMany({ where: { id: { in: doomedChoices } } });
    }

    for (let j = 0; j < group.choices.length; j++) {
      const choice = group.choices[j];
      if (choice.id && keptChoiceIds.has(choice.id)) {
        await tx.categoryOptionChoice.update({
          where: { id: choice.id },
          data: choiceData(match.id, choice, j),
        });
      } else {
        await tx.categoryOptionChoice.create({ data: choiceData(match.id, choice, j) });
      }
    }
  }
}

function choiceData(groupId: string, c: IncomingOptionChoice, sortOrder: number) {
  return {
    groupId,
    name: c.name,
    priceModifier: c.priceModifier,
    pickupPriceModifier: c.pickupPriceModifier ?? null,
    deliveryPriceModifier: c.deliveryPriceModifier ?? null,
    pickupPrice: c.pickupPrice ?? null,
    deliveryPrice: c.deliveryPrice ?? null,
    image: c.image ?? null,
    sortOrder,
  };
}
