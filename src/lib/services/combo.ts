// Menus composés — slot resolution and VAT allocation (Batch 5.9).
//
// A menu is sold at ONE forfait and contains items at DIFFERENT rates: a pizza
// is 10 % however it is sold, a sealed bottle or can is 10 % sur place and
// 5,5 % à emporter et en livraison (L-68, Batch 3.12). So the forfait has to be
// divided between the rates before any of it can be declared.
//
// THE METHOD IS NOT DECIDED HERE. It is `docs/politique-ventilation-tva.md`,
// agreed with the operator on 2026-09-09: ventilation au prorata des prix de
// vente à l'unité, pour le mode de vente concerné. This file implements that
// document and nothing else; § 2 is the rule, § 4 the fallback, § 6 the
// supplements. **The accountant has not confirmed the method** — the rates are
// settled and live, the division of a forfait between them is not — so nothing
// here may be described as compliant.
//
// WHY THE SPLIT LIVES IN LINES RATHER THAN IN A BREAKDOWN. `OrderItem` carries
// exactly one `vatRate`, and every report, every Z close and every archive
// reads that column. A menu therefore books as one line per component, each
// with its own `resolveVatRate(component, orderType)` and its own share of the
// forfait, tied back together by `comboGroupId`. There is no second place where
// a rate could be recorded, and adding one would be a second implementation of
// the thing `splitVat` already is.

import { apportion } from "@/lib/money";

/**
 * The floor the fallback can never go below (policy § 4).
 *
 * « la totalité du prix est imposée au taux le plus élevé des taux en présence
 * (10 %) ». The parenthetical is 10 because 10 is the highest rate this
 * catalogue contains; `Math.max` is what makes the sentence rather than the
 * parenthetical the rule, so a menu that ever contained a 20 % item would fall
 * back to 20 and not to 10.
 *
 * The floor exists for the case where a rate could not be resolved AT ALL: we
 * cannot know that the missing one was not the highest, and the policy says to
 * majorer, jamais minorer.
 */
export const COMBO_FALLBACK_RATE_FLOOR = 10;

/** One slot of a menu, as far as the till is concerned. */
export type ComboSlotDefinition = {
  id: string;
  name: string;
  /** How many components this slot takes. The Duo's burger slot is 2. */
  quantity: number;
  sortOrder: number;
  /** The tree a filler may come from — this category and its children. */
  sourceCategoryId: string;
  /** An explicit whitelist. EMPTY means the whole source tree at no surcharge;
   *  ONE entry means the component is fixed and is never asked. */
  choices: { productId: string; surcharge: number; sortOrder: number }[];
  /** Category option groups the menu governs — see `ComboSlotOptionRule`. */
  optionRules: { categoryOptionGroupId: string; categoryOptionChoiceId: string | null }[];
};

/**
 * One slot filled once.
 *
 * A slot with `quantity: 2` produces TWO seats, and that is the whole reason
 * this batch exists: the Duo's two burgers are configured independently — the
 * first with salad, the second without — which one `CartItem` could not express
 * and two seats can.
 */
export type ComboSeat = {
  slot: ComboSlotDefinition;
  /** 0-based position WITHIN the slot. */
  seatIndex: number;
  /** 0-based position across the whole menu — the order the cashier is asked,
   *  and the order the client must send its components in. */
  position: number;
};

/** Every seat of a menu, in the order the cashier is asked. */
export function expandSlots(slots: ComboSlotDefinition[]): ComboSeat[] {
  const seats: ComboSeat[] = [];
  const ordered = [...slots].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  for (const slot of ordered) {
    for (let i = 0; i < Math.max(0, slot.quantity); i++) {
      seats.push({ slot, seatIndex: i, position: seats.length });
    }
  }
  return seats;
}

/** What a given filler costs on top of the forfait, or 0. */
export function slotSurcharge(slot: ComboSlotDefinition, productId: string): number {
  return slot.choices.find((c) => c.productId === productId)?.surcharge ?? 0;
}

/**
 * May this product fill this slot?
 *
 * `categoryIdsInTree` is the slot's source category plus its children, resolved
 * by the caller from the database — the same one-step walk `pos-view.tsx` does
 * for a parent category, and the same one `computeLinePricing` does for
 * inherited options. Categories are at most two deep (`categories/route.ts`
 * refuses a grandchild).
 *
 * A COMBO MAY NEVER FILL A SLOT, whatever the whitelist says. `Menu Eco` sits
 * under `Pizzas`, so an « any pizza » slot would otherwise offer the menu
 * itself, and a menu inside a menu has no forfait to apportion.
 */
export function slotAllowsProduct(
  slot: ComboSlotDefinition,
  product: { id: string; categoryId: string; isCombo: boolean },
  categoryIdsInTree: ReadonlySet<string>,
): boolean {
  if (product.isCombo) return false;
  if (slot.choices.length > 0) return slot.choices.some((c) => c.productId === product.id);
  return categoryIdsInTree.has(product.categoryId);
}

/** A component of a menu, priced but not yet allocated. */
export type ComboComponent = {
  slotId: string;
  slotName: string;
  productId: string;
  productName: string;
  /**
   * The allocation WEIGHT: the component's catalogue price for this order
   * type, with the size the menu fixes applied (policy § 2 — « les prix à
   * l'unité des composants, tels qu'ils figurent au catalogue pour le mode de
   * vente concerné »).
   *
   * NOT what the customer pays for it. Nothing prints this.
   */
  referencePrice: number;
  /**
   * Everything charged ON TOP of the forfait and therefore OUTSIDE the
   * allocation (policy § 6): the slot's surcharge, whatever the cashier's own
   * option choices added beyond the fixed ones, and the component's add-ons.
   */
  supplements: number;
  /** `resolveVatRate(component, orderType)`, or NaN if it could not be resolved. */
  vatRate: number;
  optionsJson: string | null;
  addOnsJson: string | null;
  notes: string | null;
};

/** One `OrderItem` the menu will book. */
export type ComboAllocatedLine = {
  productId: string | null;
  productName: string;
  /** The share of the forfait, per menu unit. Zero on nothing. */
  allocatedShare: number;
  supplements: number;
  /** `allocatedShare + supplements` — the unit price this line books at. */
  unitPrice: number;
  vatRate: number;
  optionsJson: string | null;
  addOnsJson: string | null;
  notes: string | null;
};

export type ComboAllocation = {
  lines: ComboAllocatedLine[];
  /** `null` when the prorata applied; otherwise why it did not, and at what
   *  rate the whole forfait was taxed instead. */
  fallback: { reason: string; rate: number } | null;
};

/**
 * Divide a menu's forfait across its components (policy § 2), or fall back
 * (§ 4).
 *
 * Everything is per ONE menu unit. A cart line of `2× Menu Chill` books these
 * same lines with `quantity: 2`, so the shares stay integers and `unitPrice`
 * keeps meaning what `OrderItem.unitPrice` has always meant. Allocating the
 * doubled forfait instead would produce shares that do not divide by two.
 *
 * `apportion` is largest-remainder (M-13, Batch 3.2), so **the shares always
 * sum to the forfait exactly** — which independent per-component rounding
 * cannot guarantee, and which is the property that keeps a menu's lines
 * summing to the price the customer was quoted.
 *
 * SUR PLACE PERFORMS NO SPLIT in the sense that matters: every component
 * resolves to 10 %, so the apportionment runs and lands every share in one
 * bucket. It is not special-cased, because a special case is a second rule.
 */
export function allocateCombo(args: {
  menuProductId: string;
  menuName: string;
  /** The forfait for this order type, per unit, in cents. */
  forfait: number;
  /** The menu product's own resolved rate — only ever used by the fallback. */
  menuVatRate: number;
  components: ComboComponent[];
}): ComboAllocation {
  const { menuProductId, menuName, forfait, menuVatRate, components } = args;

  const resolvedRates = components.map((c) => c.vatRate).filter((r) => Number.isFinite(r) && r >= 0);
  const everyRateResolved = resolvedRates.length === components.length;
  const totalWeight = components.reduce((acc, c) => acc + c.referencePrice, 0);

  const reason =
    components.length === 0
      ? "menu sans composant"
      : !everyRateResolved
        ? "taux de TVA non résolu pour un composant"
        : totalWeight <= 0
          ? "aucun prix de référence au catalogue"
          : forfait <= 0
            ? "prix du menu nul"
            : null;

  if (reason !== null) {
    // § 4. ONE line, the whole forfait, at the highest rate we can justify —
    // supplements folded in at that same rate, because a fallback that split
    // the supplements out would be performing the ventilation it just said it
    // could not perform.
    //
    // The composition still travels, in `optionsJson`: the ticket prints it
    // with the same `  · ` marker it uses for options, so a fallback menu is
    // not a nameless line on the customer's only piece of paper.
    const rate = Math.max(
      COMBO_FALLBACK_RATE_FLOOR,
      Number.isFinite(menuVatRate) ? menuVatRate : 0,
      ...resolvedRates,
    );
    const supplements = components.reduce((acc, c) => acc + c.supplements, 0);
    return {
      lines: [
        {
          productId: menuProductId,
          productName: menuName,
          allocatedShare: Math.max(0, forfait),
          supplements,
          unitPrice: Math.max(0, forfait) + supplements,
          vatRate: rate,
          optionsJson: components.length
            ? JSON.stringify(
                components.map((c) => ({ group: c.slotName, choice: c.productName, priceModifier: 0 })),
              )
            : null,
          addOnsJson: null,
          notes: null,
        },
      ],
      fallback: { reason, rate },
    };
  }

  const shares = apportion(
    components.map((c) => c.referencePrice),
    forfait,
  );

  return {
    lines: components.map((c, i) => ({
      productId: c.productId,
      productName: c.productName,
      allocatedShare: shares[i],
      supplements: c.supplements,
      unitPrice: shares[i] + c.supplements,
      vatRate: c.vatRate,
      optionsJson: c.optionsJson,
      addOnsJson: c.addOnsJson,
      notes: c.notes,
    })),
    fallback: null,
  };
}
