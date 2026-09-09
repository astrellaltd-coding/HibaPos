// Menus composés at checkout — turning one basket line into the lines the
// fiscal record holds (Batch 5.9d/5.9e).
//
// `combo.ts` owns the ARITHMETIC and knows nothing about the database. This
// module owns everything that has to read the catalogue: which products may
// fill a slot, what each one costs at catalogue for this order type, what the
// cashier configured on it, and what rate it resolves to. It hands the result
// to `allocateCombo` and turns that into `CheckoutItem`s.
//
// SERVER-AUTHORITATIVE, like every other price in this route. The client sends
// slot ids, product ids and option ids — an INTENT. Every figure below is read
// from the database here; a basket that claimed its own forfait, its own
// reference prices or its own rates would be ignored.

import { db } from "@/lib/db";
import {
  computeLinePricing,
  resolveBasePrice,
  resolveChoiceModifier,
  resolveVatRate,
  type ChoiceRow,
  type ProductWithRelations,
  type VatOrderType,
  type VatResolvable,
} from "@/lib/services/pricing";
import {
  allocateCombo,
  expandSlots,
  slotAllowsProduct,
  slotSurcharge,
  type ComboComponent,
  type ComboSlotDefinition,
} from "@/lib/services/combo";
import type { CheckoutItem } from "@/lib/services/checkout";

/** What the client sends for one seat of a menu. */
export type ComboComponentIntent = {
  slotId: string;
  productId: string;
  optionIds: string[];
  addons: { addonId: string; quantity: number }[];
  notes?: string | null;
};

/**
 * A product read with everything both pricing and rate resolution need.
 *
 * `ProductWithRelations` describes what `computeLinePricing` reads and
 * `VatResolvable` what `resolveVatRate` reads; a component is passed to both,
 * so it has to satisfy both. Neither type is widened to swallow the other —
 * each stays the narrowest thing its own function needs, which is what lets a
 * caller elsewhere resolve a rate from a two-column `select`.
 */
export type ComponentProduct = ProductWithRelations &
  VatResolvable & {
    categoryId: string;
    isCombo: boolean;
    active: boolean;
    available: boolean;
  };

/** The relations `priceComboItem` needs on the menu product. */
export type MenuWithSlots = ProductWithRelations &
  VatResolvable & {
  isCombo: boolean;
  comboSlots: {
    id: string;
    name: string;
    quantity: number;
    sortOrder: number;
    sourceCategoryId: string;
    choices: { productId: string; surcharge: number; sortOrder: number }[];
    optionRules: { categoryOptionGroupId: string; categoryOptionChoiceId: string | null }[];
  }[];
};

/** The Prisma `include` that produces `MenuWithSlots`. Exported so the route
 *  and the tests cannot drift from each other. */
export const COMBO_MENU_INCLUDE = {
  comboSlots: {
    include: { choices: true, optionRules: true },
    orderBy: { sortOrder: "asc" },
  },
} as const;

export type ComboPricingResult = {
  lines: CheckoutItem[];
  /** The menu's forfait for this order type, per unit. */
  forfait: number;
  /** Non-null when the allocation could not be performed and the whole forfait
   *  was taxed at the higher rate instead (policy § 4). */
  fallback: { reason: string; rate: number } | null;
};

export type ComboPricingError = { error: string };

/** Every category id a slot may draw from: the source category and its
 *  children. Categories are at most two deep — `categories/route.ts` refuses a
 *  grandchild — so this is the same one-step walk the POS grid does. */
async function categoryTree(categoryId: string): Promise<Set<string>> {
  const children = await db.category.findMany({
    where: { parentId: categoryId },
    select: { id: true },
  });
  return new Set([categoryId, ...children.map((c) => c.id)]);
}

/** The full relation graph a component needs in order to be priced — the same
 *  one `orders/route.ts` fetches for an ordinary line. */
const COMPONENT_INCLUDE = {
  category: {
    include: {
      optionGroups: { include: { choices: true } },
      addOns: true,
      parent: {
        include: {
          optionGroups: { include: { choices: true } },
          addOns: true,
        },
      },
    },
  },
  options: { include: { choices: true } },
} as const;

/**
 * Price one menu line and return the `OrderItem`s it books.
 *
 * `quantity` is how many of this menu the basket holds. The allocation is done
 * ONCE, per unit, and the quantity is carried on each line — so the shares stay
 * integers and `unitPrice` keeps meaning what `OrderItem.unitPrice` means
 * everywhere else.
 */
export async function priceComboItem(args: {
  menu: MenuWithSlots;
  components: ComboComponentIntent[];
  quantity: number;
  orderType: VatOrderType;
  /** The id shared by this menu's lines. Injected so a test can pin it. */
  groupId: string;
}): Promise<ComboPricingResult | ComboPricingError> {
  const { menu, components, quantity, orderType, groupId } = args;

  const slots: ComboSlotDefinition[] = menu.comboSlots.map((s) => ({
    id: s.id,
    name: s.name,
    quantity: s.quantity,
    sortOrder: s.sortOrder,
    sourceCategoryId: s.sourceCategoryId,
    choices: s.choices,
    optionRules: s.optionRules,
  }));

  const seats = expandSlots(slots);
  // A menu with NO slots is not refused here. Policy § 4 lists « composition
  // incomplète » among the fallback triggers, and a refusal at the till stops
  // the restaurant trading over a catalogue mistake; `allocateCombo` sells it
  // at the forfait, at the higher rate, which is what the policy asks for.
  // 5.9e's admin validation is what stops such a menu existing.
  //
  // A MISMATCH is different and is refused: the client and the server disagree
  // about what this menu contains, and guessing which is right would be
  // guessing what the customer ordered.
  if (components.length !== seats.length) {
    return {
      error: `Composition incomplète pour ${menu.name} : ${seats.length} choix attendus, ${components.length} reçus.`,
    };
  }

  // One tree lookup per distinct source category, not one per seat.
  const trees = new Map<string, Set<string>>();
  for (const slot of slots) {
    if (!trees.has(slot.sourceCategoryId)) {
      trees.set(slot.sourceCategoryId, await categoryTree(slot.sourceCategoryId));
    }
  }

  const priced: ComboComponent[] = [];

  for (const [index, seat] of seats.entries()) {
    const intent = components[index];
    // The seats are ordered and the client must answer them in order. Checking
    // the slot id as well as the position is what stops a basket answering the
    // drink slot with a pizza by shuffling its array.
    if (intent.slotId !== seat.slot.id) {
      return {
        error: `Composition invalide pour ${menu.name} : le choix ${index + 1} ne correspond pas à « ${seat.slot.name} ».`,
      };
    }

    const product = (await db.product.findUnique({
      where: { id: intent.productId },
      include: COMPONENT_INCLUDE,
    })) as ComponentProduct | null;

    // Same refusal, same wording as an ordinary line in `orders/route.ts`: a
    // component that is 86'd is not sellable inside a menu either.
    if (!product || !product.active || !product.available) {
      return { error: `Produit introuvable ou indisponible : ${intent.productId}` };
    }

    if (!slotAllowsProduct(seat.slot, product, trees.get(seat.slot.sourceCategoryId)!)) {
      // A COMBO IS REFUSED HERE, whatever else is true of it: `Menu Eco` sits
      // under `Pizzas`, so an « any pizza » slot would otherwise offer the menu
      // itself and there would be a forfait inside a forfait.
      return {
        error: `« ${product.name} » n'est pas proposé pour « ${seat.slot.name} » dans ${menu.name}.`,
      };
    }

    const governedGroupIds = new Set(seat.slot.optionRules.map((r) => r.categoryOptionGroupId));
    const fixedChoiceIds = seat.slot.optionRules
      .map((r) => r.categoryOptionChoiceId)
      .filter((id): id is string => id !== null);

    // ---- what the customer pays for this component, beyond the forfait ----
    const full = computeLinePricing(
      {
        productId: intent.productId,
        quantity: 1,
        optionIds: intent.optionIds,
        addons: intent.addons,
      },
      product,
      orderType,
      { governedGroupIds, fixedChoiceIds },
    );
    if ("error" in full) return { error: full.error };

    // ---- the allocation WEIGHT: the catalogue price at the size the menu fixes
    //
    // Deliberately NOT a second `computeLinePricing` call with no options: a
    // component's own REQUIRED groups (« Crudités » on every burger) are not
    // governed by the menu, so that call would be refused for a missing option
    // rather than answer the question. This is what `resolveBasePrice` and
    // `resolveChoiceModifier` were extracted for — the same arithmetic, asked
    // the narrower question.
    const basePrice = resolveBasePrice(product, orderType);
    const effectiveCategory = product.category?.parent ?? product.category;
    const applicableChoices = new Map<string, ChoiceRow>();
    if (product.inheritCategoryGlobals) {
      for (const g of effectiveCategory?.optionGroups ?? []) {
        for (const c of g.choices) applicableChoices.set(c.id, c as ChoiceRow);
      }
    }
    let referencePrice = basePrice;
    for (const id of fixedChoiceIds) {
      const choice = applicableChoices.get(id);
      // A pin that names a group this product does not have contributes
      // nothing. It cannot misprice — the modifier is only ever applied where
      // the group exists — and 5.9e's admin validation refuses to save one.
      if (choice) referencePrice += resolveChoiceModifier(choice, orderType, basePrice, product.price);
    }

    priced.push({
      slotId: seat.slot.id,
      slotName: seat.slot.name,
      productId: product.id,
      productName: product.name,
      referencePrice,
      // Everything on top of the forfait, and outside the allocation (§ 6):
      // what the cashier's own choices added beyond the pinned ones, the
      // component's add-ons, and the slot's surcharge for this filler.
      supplements:
        full.unitPrice - referencePrice + full.addOnsTotal + slotSurcharge(seat.slot, product.id),
      vatRate: resolveVatRate(product, orderType),
      optionsJson: full.optionsJson,
      addOnsJson: full.addOnsJson,
      notes: intent.notes ?? null,
    });
  }

  const forfait = resolveBasePrice(menu, orderType);
  const allocation = allocateCombo({
    menuProductId: menu.id,
    menuName: menu.name,
    forfait,
    menuVatRate: resolveVatRate(menu, orderType),
    components: priced,
  });

  return {
    forfait,
    fallback: allocation.fallback,
    lines: allocation.lines.map((l) => ({
      productId: l.productId,
      productName: l.productName,
      unitPrice: l.unitPrice,
      quantity,
      lineTotal: l.unitPrice * quantity,
      vatRate: l.vatRate,
      optionsJson: l.optionsJson,
      addOnsJson: l.addOnsJson,
      notes: l.notes,
      comboGroupId: groupId,
      comboName: menu.name,
      comboPrice: forfait,
    })),
  };
}
