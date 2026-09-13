// Pure pricing computation for a single order line — extracted from orders/route.ts
// (Phase 8a — makes the highest-risk checkout arithmetic testable without a DB/HTTP).
//
// Given an item intent (product id, quantity, option ids, addons) and the
// already-fetched product (with its category graph + option groups + add-ons),
// compute the server-authoritative unit price, line total, and JSON snapshots.
// Returns either a pricing result or an error string (which the route maps to 400).

export type ProductWithRelations = {
  id: string;
  name: string;
  price: number; // cents
  pickupPrice: number | null; // cents
  deliveryPrice: number | null; // cents
  vatRate: number;
  category: {
    parent: {
      optionGroups: { id: string; name: string; required: boolean; multiple: boolean; choices: ChoiceRow[] }[];
      addOns: AddOnRow[];
    } | null;
    optionGroups: { id: string; name: string; required: boolean; multiple: boolean; choices: ChoiceRow[] }[];
    addOns: AddOnRow[];
  } | null;
  options: { id: string; name: string; required: boolean; multiple: boolean; choices: ChoiceRow[] }[];
  inheritCategoryGlobals: boolean;
};

/** The shape `resolveVatRate` needs — far less than a full product row, so a
 *  caller can resolve a rate from a narrow `select`. */
export type VatResolvable = {
  vatRate: number;
  inheritCategoryVat?: boolean | null;
  category?: {
    vatRate?: number | null;
    vatRateTakeaway?: number | null;
    parent?: { vatRate?: number | null; vatRateTakeaway?: number | null } | null;
  } | null;
};

/** The three order types, as far as VAT is concerned (L-68, Batch 3.12).
 *
 *  Structural rather than imported from Prisma so `resolveVatRate` stays
 *  testable without a database, exactly as `VatResolvable` is. */
export type VatOrderType = "DINE_IN" | "TAKEAWAY" | "LIVRAISON";

/**
 * The VAT rate that actually applies to a product (L-16/L-17, Batch 3.1c).
 *
 * Nearest wins: the product's own rate unless it opts into inheritance, then
 * its own category, then the parent category. Categories are at most two deep
 * (`categories/route.ts` refuses a grandchild), so this is the same one-step
 * walk `computeLinePricing` already does for options and add-ons below.
 *
 * Falls back to the product's stored `vatRate` when inheritance is on but no
 * category in the chain sets a rate. That is deliberately the *quietest*
 * failure: a misconfigured category leaves the rate exactly as it was rather
 * than silently moving money.
 *
 * Note what this does NOT affect: `OrderItem.vatRate` is snapshotted at
 * checkout and every report reads that, so changing a category's rate can
 * never alter a sale that has already happened.
 */
export function resolveVatRate(
  product: VatResolvable,
  orderType: VatOrderType = "DINE_IN",
): number {
  // ONE governing source, read twice — L-68 (Batch 3.12).
  //
  // Both rates come from the SAME level of the chain. Resolving them
  // independently would let a category set the sur-place rate while its parent
  // supplied the à-emporter one, so a single sale could be taxed from two
  // different places in the catalogue and neither would look wrong on its own.
  const governing =
    !product.inheritCategoryVat
      ? null
      : product.category?.vatRate != null
        ? product.category
        : product.category?.parent?.vatRate != null
          ? product.category.parent
          : null;

  // Identical to this function's behaviour before 3.12: own rate unless
  // inheriting, then own category, then parent, then the product's stored rate.
  const dineIn = governing?.vatRate ?? product.vatRate;
  if (orderType === "DINE_IN") return dineIn;

  // À emporter and livraison. Absent means "the same rate whatever the order
  // type", which is why adding the column moved nothing: every category that
  // has not set it resolves exactly as it did before.
  return governing?.vatRateTakeaway ?? dineIn;
}

export type ChoiceRow = {
  id: string;
  name: string;
  priceModifier: number; // cents
  pickupPriceModifier?: number | null;
  deliveryPriceModifier?: number | null;
  pickupPrice?: number | null; // absolute cents (category-level only)
  deliveryPrice?: number | null; // absolute cents
};

type AddOnRow = {
  id: string;
  name: string;
  price: number; // cents
  active: boolean;
  /** L-94 (R8.5). Null means the restaurant's `defaultVatRate`. */
  vatRate?: number | null;
  vatRateTakeaway?: number | null;
};

/**
 * A supplement's OWN VAT rate — L-94 (R8.5).
 *
 * `docs/politique-ventilation-tva.md` § 6: « Un supplément … relève de son
 * propre taux — 10 % pour un supplément alimentaire. » It did not: a supplement
 * was folded into its host's line and therefore booked at the host's rate. A
 * food supplement on a takeaway canette would have booked at 5,5 %.
 *
 * **Null resolves to `defaultVatRate`, NOT to the host's rate**, and that is
 * the correction rather than an implementation detail. Inheriting the host is
 * precisely what was wrong; « son propre taux » is the restaurant's food rate.
 *
 * Both rates come from the same level, for `resolveVatRate`'s reason (L-68): a
 * supplement that sets one and not the other uses its own rate in both modes,
 * so a single sale can never be taxed from two different places.
 */
export function resolveAddOnVatRate(
  addon: { vatRate?: number | null; vatRateTakeaway?: number | null },
  orderType: VatOrderType,
  defaultVatRate: number,
): number {
  if (addon.vatRate == null) return defaultVatRate;
  if (orderType === "DINE_IN") return addon.vatRate;
  return addon.vatRateTakeaway ?? addon.vatRate;
}

/** A supplement booked on its OWN line, because its rate differs from the line
 *  it was added to. `OrderItem` carries exactly one rate — the same constraint
 *  that made a menu explode into one line per component (Batch 5.9). */
export type SeparateAddOnLine = {
  addonId: string;
  name: string;
  /** Unit price in cents — the supplement's own price, not multiplied. */
  price: number;
  /** Add-on quantity × the host line's quantity. */
  quantity: number;
  lineTotal: number; // cents
  vatRate: number;
};

/**
 * The base price for one order type - EXTRACTED from `computeLinePricing`
 * (Batch 5.9) so a menu component's reference price is read the same way a
 * sold line is priced.
 *
 * Absent means "the dine-in price applies", which is why each arm tests for
 * `null` rather than falling through: a product with no `pickupPrice` sells at
 * `price` a emporter, and always has.
 */
export function resolveBasePrice(
  product: { price: number; pickupPrice: number | null; deliveryPrice: number | null },
  orderType: VatOrderType,
): number {
  if (orderType === "TAKEAWAY" && product.pickupPrice != null) return product.pickupPrice;
  if (orderType === "LIVRAISON" && product.deliveryPrice != null) return product.deliveryPrice;
  return product.price;
}

/**
 * What one chosen option adds to the base - EXTRACTED from
 * `computeLinePricing` (Batch 5.9), unchanged line for line.
 *
 * WHY IT MOVED. Batch 5.9's menu components need the catalogue price of a
 * pizza *at the size the menu fixes*, and the sizes are category choices
 * carrying ABSOLUTE prices (`Taille`: Junior 8,90 / Senior 11,90 / Mega 15,90
 * a emporter). Re-deriving that arithmetic beside this one is precisely the
 * "second implementation" the record warns about - `money.ts`'s `splitVat`
 * comment and Batch 6.2 note 3 are both about a rule that existed twice.
 *
 * `dineInBase` is the product's `price` and is NOT the same as `basePrice`
 * under DINE_IN: the serializer relativises an absolute choice price against
 * the dine-in figure, so both are needed.
 */
export function resolveChoiceModifier(
  choice: ChoiceRow,
  orderType: VatOrderType,
  basePrice: number,
  dineInBase: number,
): number {
  if (choice.pickupPrice != null) {
    // Absolute choice price (category-level only). deliveryPrice
    // defaults to the pickup absolute when unset (serializer parity).
    const absPickup = choice.pickupPrice;
    const absDelivery = choice.deliveryPrice != null ? choice.deliveryPrice : absPickup;
    if (orderType === "TAKEAWAY") return absPickup - basePrice;
    if (orderType === "LIVRAISON") return absDelivery - basePrice;
    // DINE_IN: serializer relativizes against the dine-in base.
    return absPickup - dineInBase;
  }
  if (orderType === "TAKEAWAY" && choice.pickupPriceModifier != null) return choice.pickupPriceModifier;
  if (orderType === "LIVRAISON" && choice.deliveryPriceModifier != null) return choice.deliveryPriceModifier;
  return choice.priceModifier;
}

export type ItemIntent = {
  productId: string;
  quantity: number;
  optionIds: string[];
  addons: { addonId: string; quantity: number }[];
};

/**
 * What a MENU imposes on one of its components (Batch 5.9).
 *
 * Passing none of this leaves `computeLinePricing` behaving exactly as it did
 * before the batch - which is what every existing test asserts.
 */
export type ComboSlotContext = {
  /** Category option groups the menu governs. Not asked inside the menu, and
   *  therefore not REQUIRED inside it: every burger inherits a required
   *  `Frite` group from `Burgers`, and a Duo answers it once with its own
   *  frite slot instead of twice through its two burgers. */
  governedGroupIds: Set<string>;
  /** Choices the menu pins - the pizza size. Priced exactly as if the cashier
   *  had tapped them, because a Senior IS worth 11,90 at catalogue and that is
   *  the weight section 2 of the allocation policy apportions by. */
  fixedChoiceIds: string[];
};

export type LinePricingResult = {
  unitPrice: number; // cents
  lineTotal: number; // cents
  /** The add-ons alone, already multiplied by their quantities (Batch 5.9).
   *  A menu component's supplements have to be separable from its allocated
   *  share: the forfait is what gets split, the supplements ride on top. */
  addOnsTotal: number; // cents
  optionsJson: string | null;
  addOnsJson: string | null;
  /**
   * Supplements whose rate differs from this line's, to be booked as their own
   * `OrderItem` rows — L-94 (R8.5).
   *
   * **Empty for every sale this catalogue can currently make**, and that is
   * deliberate: the operator chose that a supplement stays folded into its host
   * line while the two rates agree, so nothing about a normal ticket changes.
   * `addOnsTotal` above already excludes anything listed here.
   */
  separateAddOns: SeparateAddOnLine[];
};

export type LinePricingError = { error: string };

/** Compute the server-authoritative pricing for one order line.
 *  Pure: no DB, no HTTP. The caller fetches the product (with its full
 *  category/option/add-on graph) and passes it in. */
export function computeLinePricing(
  itemIntent: ItemIntent,
  product: ProductWithRelations,
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON",
  combo?: ComboSlotContext,
  /**
   * L-94 (R8.5) — what a supplement's rate is measured against.
   *
   * Both optional, so every existing caller and test keeps working unchanged:
   * with neither supplied, a supplement resolves to the host's rate exactly as
   * before, which folds it and changes nothing.
   *
   * `hostVatRate` is passed in rather than derived here because
   * `ProductWithRelations` deliberately carries only what PRICING needs — the
   * option and add-on graph — and not the category's VAT columns. Widening it
   * to make `resolveVatRate` callable from inside would make every caller
   * fetch rate columns it has no use for.
   */
  vat?: { defaultVatRate: number; hostVatRate: number },
): LinePricingResult | LinePricingError {
  // Sub-categories are folders: products inherit options/add-ons from the parent category.
  const effectiveCategory = product.category?.parent ?? product.category;

  // Determine base price by order type (all in cents).
  const basePrice = resolveBasePrice(product, orderType);

  // Merge category options + product options for validation.
  // Products marked `inheritCategoryGlobals=false` skip the category-level
  // groups/add-ons entirely and only use their own.
  const allOptions = [
    ...(product.inheritCategoryGlobals ? (effectiveCategory?.optionGroups ?? []) : []),
    ...(product.options ?? []),
  ];

  // Validate and apply options
  let optionsModifier = 0;
  const chosenOptions: { group: string; choice: string; priceModifier: number }[] = [];
  // Batch 5.9: the menu's pinned choices join what the cashier tapped. They are
  // priced identically - the size is part of what the component is worth.
  const selectedOptionIds = new Set([...itemIntent.optionIds, ...(combo?.fixedChoiceIds ?? [])]);

  for (const group of allOptions) {
    const selectedInGroup = group.choices.filter((c) => selectedOptionIds.has(c.id));
    // Batch 5.9: a group the MENU governs is never asked inside the menu, so it
    // cannot be missing. Outside a menu `combo` is undefined and this reads
    // exactly as it did before.
    const governed = combo?.governedGroupIds.has(group.id) ?? false;
    if (group.required && !governed && selectedInGroup.length === 0) {
      return { error: `Option obligatoire manquante : ${group.name}` };
    }
    if (!group.multiple && selectedInGroup.length > 1) {
      return { error: `Une seule sélection autorisée pour : ${group.name}` };
    }
    for (const choice of selectedInGroup) {
      const c = choice as ChoiceRow;
      const modifier = resolveChoiceModifier(c, orderType, basePrice, product.price);
      optionsModifier += modifier;
      chosenOptions.push({ group: group.name, choice: choice.name, priceModifier: modifier });
    }
  }

  // The add-ons available to this product: the CATEGORY's, and only those.
  //
  // DD-15 (Batch 5.7a). Until this batch these two lines merged in a second
  // source — `product.productAddons`, the `ProductAddon` join — which had
  // **no writer anywhere**, so the set it contributed was always empty and
  // `addonMap`'s second loop never ran. Removing it changes no price. What it
  // does change is that `addon` now means exactly one thing here.
  const availableAddonIds = new Set(
    product.inheritCategoryGlobals
      ? (effectiveCategory?.addOns ?? []).map((a) => a.id)
      : [],
  );

  const addonMap = new Map<string, AddOnRow>();
  if (product.inheritCategoryGlobals) {
    for (const a of effectiveCategory?.addOns ?? []) {
      addonMap.set(a.id, a);
    }
  }

  // Validate and apply addons
  let addonsTotal = 0;
  // L-127 (R8.5): `quantity` joins the snapshot. Optional, because every
  // `addOnsJson` already written omits it and readers must tolerate both.
  const chosenAddons: { id: string | null; name: string; price: number; quantity?: number }[] = [];

  // L-94 (R8.5). A supplement matching this line's rate rides along as before;
  // one that does not gets its own line further down.
  const separateAddOns: SeparateAddOnLine[] = [];

  for (const aIntent of itemIntent.addons) {
    if (!availableAddonIds.has(aIntent.addonId)) {
      return { error: `Supplément non disponible pour ce produit : ${aIntent.addonId}` };
    }
    const addon = addonMap.get(aIntent.addonId);
    if (!addon || !addon.active) {
      return { error: `Supplément introuvable ou inactif : ${aIntent.addonId}` };
    }

    const addonRate = vat ? resolveAddOnVatRate(addon, orderType, vat.defaultVatRate) : null;

    if (vat && addonRate !== null && addonRate !== vat.hostVatRate) {
      // Its own line. `OrderItem` carries exactly one rate, so this is the only
      // way a supplement can be booked at a rate its host does not have — the
      // same argument that made a menu explode into one line per component.
      separateAddOns.push({
        addonId: addon.id,
        name: addon.name,
        price: addon.price,
        quantity: aIntent.quantity * itemIntent.quantity,
        lineTotal: addon.price * aIntent.quantity * itemIntent.quantity,
        vatRate: addonRate,
      });
      continue;
    }

    addonsTotal += addon.price * aIntent.quantity;
    // L-127 (R8.5): the QUANTITY is snapshotted now. It was charged and then
    // dropped, so `addOnsJson` — which is what the ticket and the archive read
    // — could not reproduce the line whenever the quantity exceeded 1.
    // Measured: 3 × Viande Hachee printed as one « + Viande Hachee (1,50 €) »,
    // 4,50 € unexplained on a document that is never re-rendered.
    chosenAddons.push({
      id: addon.id,
      name: addon.name,
      price: addon.price,
      quantity: aIntent.quantity,
    });
  }

  const unitPrice = basePrice + optionsModifier;

  // M-15 (Batch 5.7c). Nothing stopped the options subtracting more than the
  // base, and a negative `unitPrice` makes `lineTotal` negative — which would
  // reduce the order's subtotal, corrupt the VAT apportionment and put a
  // negative line into a sealed fiscal document.
  //
  // REFUSED rather than clamped, deliberately. A negative MODIFIER is normal:
  // an absolute category price below the base produces one by design, and the
  // three that exist on this catalogue resolve to 0, +300 and +700 against the
  // cheapest product in their category — measured before choosing. A negative
  // unit PRICE is a misconfiguration, and clamping it to zero would sell the
  // item free and silently: nobody would ever see it. This way the operator
  // gets a refusal naming the product and the catalogue can be fixed.
  if (unitPrice < 0) {
    return { error: `Prix négatif pour ${product.name} — vérifiez les options de ce produit.` };
  }

  const lineTotal = (unitPrice + addonsTotal) * itemIntent.quantity;

  return {
    unitPrice,
    lineTotal,
    addOnsTotal: addonsTotal,
    optionsJson: chosenOptions.length ? JSON.stringify(chosenOptions) : null,
    addOnsJson: chosenAddons.length ? JSON.stringify(chosenAddons) : null,
    separateAddOns,
  };
}
