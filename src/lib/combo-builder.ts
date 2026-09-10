// The slot-by-slot flow, as a pure state machine (Batch 5.9c).
//
// SEPARATE FROM THE DIALOG ON PURPOSE. Batch 5.7c's M-19 was a mapping that
// lived inside `product-options-dialog-v2.tsx` and therefore could not be
// tested: the store's tests built a `CartItem` by hand and missed the defect
// precisely because they bypassed the component. The rule was extracted into
// `toCartOptions` and the dialog now calls it, so the test and the till run the
// same code. Everything below follows that: the dialog renders, this decides.

import type { CategoryDto, ProductDto, ComboSlotDto } from "@/types/api";
import type { CartComponent, CartOption, CartAddOn } from "@/store/cart-store";

/** One seat: a slot filled once. `quantity: 2` produces two. */
export type BuilderSeat = {
  slot: ComboSlotDto;
  /** 0-based position within the slot — « Pizza 1 », « Pizza 2 ». */
  seatIndex: number;
  /** How many seats this slot has, so the label can say « 1 / 2 ». */
  seatCount: number;
};

/** Every seat of a menu, in the order the cashier is asked. Mirrors
 *  `expandSlots` on the server; the server is the authority and re-derives it,
 *  and a disagreement is refused there rather than silently priced. */
export function builderSeats(slots: ComboSlotDto[]): BuilderSeat[] {
  const out: BuilderSeat[] = [];
  for (const slot of [...slots].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))) {
    for (let i = 0; i < Math.max(0, slot.quantity); i++) {
      out.push({ slot, seatIndex: i, seatCount: slot.quantity });
    }
  }
  return out;
}

/** What the cashier is asked at this seat. « Pizza » alone when the slot takes
 *  one; « Pizza 2 / 2 » when it takes several, so two identical questions in a
 *  row are visibly different questions. */
export function seatLabel(seat: BuilderSeat): string {
  return seat.seatCount > 1 ? `${seat.slot.name} ${seat.seatIndex + 1} / ${seat.seatCount}` : seat.slot.name;
}

/** The category ids a slot draws from: the source category and its children. */
export function slotCategoryIds(slot: ComboSlotDto, categories: CategoryDto[]): Set<string> {
  const ids = new Set<string>([slot.sourceCategoryId]);
  for (const c of categories) {
    if (c.parentId === slot.sourceCategoryId) ids.add(c.id);
  }
  return ids;
}

/**
 * The products offered for a slot, in catalogue order.
 *
 * A COMBO IS NEVER OFFERED. `Menu Eco` sits under `Pizzas`, so an « any pizza »
 * slot would otherwise offer the menu itself; the server refuses it too, and
 * this is what stops the cashier being shown a choice that cannot be rung.
 */
export function slotProducts(
  slot: ComboSlotDto,
  products: ProductDto[],
  categories: CategoryDto[],
): ProductDto[] {
  // R3.1 — `showOnPos` IS DELIBERATELY NOT CONSULTED HERE, and that omission is
  // the point of the whole batch. A product hidden from the till's grid
  // (`@/lib/pos-grid`) must still be offerable as a menu component: that is what
  // lets Box 15 have a food-only half priced for the VAT allocation without
  // putting it on the till for a customer to order by itself.
  //
  // These two filters are a pair. If you are about to unify them, or to add
  // `showOnPos` to this line, read `pos-grid.ts` first — `hidden-product.test.ts`
  // asserts both halves in one test so neither can move alone.
  const sellable = products.filter((p) => p.active && p.available && !p.isCombo);
  if (slot.choices.length > 0) {
    const order = new Map(slot.choices.map((c, i) => [c.productId, i]));
    return sellable
      .filter((p) => order.has(p.id))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  const tree = slotCategoryIds(slot, categories);
  return sellable
    .filter((p) => tree.has(p.categoryId))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** What this filler costs on top of the forfait. */
export function fillerSurcharge(slot: ComboSlotDto, productId: string): number {
  return slot.choices.find((c) => c.productId === productId)?.surcharge ?? 0;
}

/**
 * The option groups the cashier is ASKED for a component.
 *
 * Groups the menu governs are removed — answered by the menu (the pizza size)
 * or covered by another slot (every burger inherits a required « Frite » group
 * from `Burgers`, and a Duo asks for a frite once, in its own slot).
 */
export function askedGroups(slot: ComboSlotDto, product: ProductDto) {
  const governed = new Set(slot.optionRules.map((r) => r.categoryOptionGroupId));
  return product.options.filter((g) => !governed.has(g.id));
}

/** The choices the MENU pins for this component — never shown, always priced. */
export function pinnedChoiceIds(slot: ComboSlotDto): string[] {
  return slot.optionRules
    .map((r) => r.categoryOptionChoiceId)
    .filter((id): id is string => id !== null);
}

/**
 * The catalogue price of a component at the size the menu fixes — the
 * allocation weight (`docs/politique-ventilation-tva.md` § 2).
 *
 * DISPLAY AND ECHO ONLY. The server recomputes this from the catalogue on every
 * checkout and ignores whatever the basket claims; it travels so the till can
 * show a running total that agrees with the one the checkout will produce.
 */
export function componentReferencePrice(
  slot: ComboSlotDto,
  product: ProductDto,
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON",
): number {
  let base = product.price;
  if (orderType === "TAKEAWAY" && product.pickupPrice != null) base = product.pickupPrice;
  else if (orderType === "LIVRAISON" && product.deliveryPrice != null) base = product.deliveryPrice;

  const pinned = new Set(pinnedChoiceIds(slot));
  let modifier = 0;
  for (const group of product.options) {
    for (const choice of group.choices) {
      if (!pinned.has(choice.id)) continue;
      // `ProductDto` choices are already relativised by the serializer — an
      // absolute category price arrives here as a modifier against the base for
      // this order type — so this is the same arithmetic `productUnitPrice`
      // does, and not a second reading of the absolute-price rule.
      if (orderType === "TAKEAWAY" && choice.pickupPriceModifier != null) modifier += choice.pickupPriceModifier;
      else if (orderType === "LIVRAISON" && choice.deliveryPriceModifier != null) modifier += choice.deliveryPriceModifier;
      else modifier += choice.priceModifier;
    }
  }
  return base + modifier;
}

/** Assemble one component from what the cashier chose at a seat. */
export function buildComponent(args: {
  seat: BuilderSeat;
  product: ProductDto;
  options: CartOption[];
  addOns: CartAddOn[];
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON";
}): CartComponent {
  const { seat, product, options, addOns, orderType } = args;
  return {
    slotId: seat.slot.id,
    slotName: seat.slot.name,
    productId: product.id,
    productName: product.name,
    options,
    addOns,
    surcharge: fillerSurcharge(seat.slot, product.id),
    referencePrice: componentReferencePrice(seat.slot, product, orderType),
    image: product.image,
  };
}

/** The menu's forfait for an order type — what the line costs before extras. */
export function menuForfait(
  menu: ProductDto,
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON",
): number {
  if (orderType === "TAKEAWAY" && menu.pickupPrice != null) return menu.pickupPrice;
  if (orderType === "LIVRAISON" && menu.deliveryPrice != null) return menu.deliveryPrice;
  return menu.price;
}

/** A seat whose slot offers exactly one filler is not a question — the cashier
 *  configures that product and is never asked which it is. The Duo's two
 *  burgers are this: « 2 Burgers Cheese Royal », asked twice for their crudités
 *  and never for their identity. */
export function fixedFiller(seat: BuilderSeat, products: ProductDto[], categories: CategoryDto[]): ProductDto | null {
  const offered = slotProducts(seat.slot, products, categories);
  return offered.length === 1 ? offered[0] : null;
}
