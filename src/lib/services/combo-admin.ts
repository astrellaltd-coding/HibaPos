// Refusing to SAVE a menu that could not be sold correctly (Batch 5.9e).
//
// `docs/politique-ventilation-tva.md` § 4, verbatim: « Ce repli est conçu pour
// ne jamais se déclencher en service : la configuration d'un menu incomplet
// doit être refusée à l'enregistrement, là où il y a le temps de la corriger.
// Le repli est la ceinture, la validation est les bretelles. »
//
// `validateComboShape` in `validation.ts` is the half that needs no database —
// a name, a quantity, a price, no duplicate filler. This is the half that
// does: does that category exist, is that filler really in it, and is anything
// here a menu itself. Both run on every create and every update, and the route
// answers 400 with a French sentence naming the slot.
//
// SPLIT RATHER THAN MERGED because `validateComboShape` is pure and is
// therefore testable without a database, and because the schema-shaped half is
// the half the admin form can eventually run client-side.

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type ComboSlotInput = {
  name: string;
  quantity: number;
  sourceCategoryId: string;
  choices: { productId: string; surcharge: number; sortOrder: number }[];
  optionRules: { categoryOptionGroupId: string; categoryOptionChoiceId: string | null }[];
};

/**
 * The checks that need the catalogue. Returns French sentences, empty if fine.
 *
 * `productId` is the menu being saved, or null on create — a slot may not be
 * filled by the menu it belongs to, and on create there is no id to compare
 * against yet (the product does not exist, so it cannot be whitelisted either).
 */
export async function validateComboAgainstCatalogue(
  slots: ComboSlotInput[],
  productId: string | null,
): Promise<string[]> {
  const errors: string[] = [];

  for (const [i, slot] of slots.entries()) {
    const where = slot.name?.trim() ? `« ${slot.name} »` : `Composant ${i + 1}`;

    const category = await db.category.findUnique({
      where: { id: slot.sourceCategoryId },
      select: { id: true, name: true },
    });
    if (!category) {
      errors.push(`${where} : la catégorie choisie n'existe pas.`);
      continue;
    }

    const children = await db.category.findMany({
      where: { parentId: category.id },
      select: { id: true },
    });
    const tree = [category.id, ...children.map((c) => c.id)];

    if (slot.choices.length === 0) {
      // « Any product in this tree » — so the tree must contain something
      // sellable that is not itself a menu. A slot drawing on an empty
      // category asks the cashier a question with no answers, and the sale
      // would take the fallback.
      const n = await db.product.count({
        where: { categoryId: { in: tree }, isCombo: false, active: true },
      });
      if (n === 0) {
        errors.push(
          `${where} : aucun produit disponible dans « ${category.name} » — un menu ne peut pas contenir un menu.`,
        );
      }
      continue;
    }

    for (const choice of slot.choices) {
      const p = await db.product.findUnique({
        where: { id: choice.productId },
        select: { id: true, name: true, categoryId: true, isCombo: true, active: true },
      });
      if (!p) {
        errors.push(`${where} : un produit proposé n'existe pas.`);
        continue;
      }
      if (p.isCombo) {
        // The operator's ruling, and it is why the check is on the product and
        // not on the category: `Menu Eco` sits under `Pizzas`, so an « any
        // pizza » slot would otherwise offer the menu itself.
        errors.push(`${where} : « ${p.name} » est un menu composé et ne peut pas être un composant.`);
      }
      if (p.id === productId) {
        errors.push(`${where} : un menu ne peut pas se contenir lui-même.`);
      }
      if (!tree.includes(p.categoryId)) {
        errors.push(`${where} : « ${p.name} » n'est pas dans « ${category.name} ».`);
      }
      if (!p.active) {
        errors.push(`${where} : « ${p.name} » est désactivé.`);
      }
    }
  }

  // The option rules must name groups that exist, and a pinned choice must
  // belong to the group it is pinned in — a pin pointing into another group
  // would be applied nowhere and the component would be worth its base price
  // with nobody told.
  for (const [i, slot] of slots.entries()) {
    const where = slot.name?.trim() ? `« ${slot.name} »` : `Composant ${i + 1}`;
    for (const rule of slot.optionRules) {
      const group = await db.categoryOptionGroup.findUnique({
        where: { id: rule.categoryOptionGroupId },
        select: { id: true, name: true },
      });
      if (!group) {
        errors.push(`${where} : un groupe d'options réglé par le menu n'existe pas.`);
        continue;
      }
      if (rule.categoryOptionChoiceId === null) continue;
      const choice = await db.categoryOptionChoice.findUnique({
        where: { id: rule.categoryOptionChoiceId },
        select: { id: true, name: true, groupId: true },
      });
      if (!choice) {
        errors.push(`${where} : le choix imposé pour « ${group.name} » n'existe pas.`);
      } else if (choice.groupId !== group.id) {
        errors.push(`${where} : « ${choice.name} » n'appartient pas à « ${group.name} ».`);
      }
    }
  }

  return errors;
}

/** Replace a menu's slots wholesale, inside the caller's transaction.
 *
 *  Wholesale rather than incremental for the same reason `options` is: a slot
 *  has no stable identity from the form's point of view, and reconciling one
 *  would be a second way for a menu to end up half-configured. */
export async function replaceComboSlots(
  tx: Prisma.TransactionClient,
  productId: string,
  slots: ComboSlotInput[],
): Promise<void> {
  // `ComboSlotChoice` and `ComboSlotOptionRule` both cascade from the slot, so
  // deleting the slots removes them too.
  await tx.comboSlot.deleteMany({ where: { productId } });
  for (const [i, slot] of slots.entries()) {
    const created = await tx.comboSlot.create({
      data: {
        productId,
        name: slot.name,
        quantity: slot.quantity,
        sortOrder: i,
        sourceCategoryId: slot.sourceCategoryId,
      },
    });
    for (const [j, choice] of slot.choices.entries()) {
      await tx.comboSlotChoice.create({
        data: {
          slotId: created.id,
          productId: choice.productId,
          surcharge: choice.surcharge,
          sortOrder: j,
        },
      });
    }
    for (const rule of slot.optionRules) {
      await tx.comboSlotOptionRule.create({
        data: {
          slotId: created.id,
          categoryOptionGroupId: rule.categoryOptionGroupId,
          categoryOptionChoiceId: rule.categoryOptionChoiceId,
        },
      });
    }
  }
}
