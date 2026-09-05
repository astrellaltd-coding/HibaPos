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
    parent?: { vatRate?: number | null } | null;
  } | null;
};

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
export function resolveVatRate(product: VatResolvable): number {
  if (!product.inheritCategoryVat) return product.vatRate;
  const own = product.category?.vatRate;
  if (own != null) return own;
  const parent = product.category?.parent?.vatRate;
  if (parent != null) return parent;
  return product.vatRate;
}

type ChoiceRow = {
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
};

export type ItemIntent = {
  productId: string;
  quantity: number;
  optionIds: string[];
  addons: { addonId: string; quantity: number }[];
};

export type LinePricingResult = {
  unitPrice: number; // cents
  lineTotal: number; // cents
  optionsJson: string | null;
  addOnsJson: string | null;
};

export type LinePricingError = { error: string };

/** Compute the server-authoritative pricing for one order line.
 *  Pure: no DB, no HTTP. The caller fetches the product (with its full
 *  category/option/add-on graph) and passes it in. */
export function computeLinePricing(
  itemIntent: ItemIntent,
  product: ProductWithRelations,
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON",
): LinePricingResult | LinePricingError {
  // Sub-categories are folders: products inherit options/add-ons from the parent category.
  const effectiveCategory = product.category?.parent ?? product.category;

  // Determine base price by order type (all in cents).
  let basePrice = product.price;
  if (orderType === "TAKEAWAY" && product.pickupPrice != null) {
    basePrice = product.pickupPrice;
  } else if (orderType === "LIVRAISON" && product.deliveryPrice != null) {
    basePrice = product.deliveryPrice;
  }

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
  const selectedOptionIds = new Set(itemIntent.optionIds);

  for (const group of allOptions) {
    const selectedInGroup = group.choices.filter((c) => selectedOptionIds.has(c.id));
    if (group.required && selectedInGroup.length === 0) {
      return { error: `Option obligatoire manquante : ${group.name}` };
    }
    if (!group.multiple && selectedInGroup.length > 1) {
      return { error: `Une seule sélection autorisée pour : ${group.name}` };
    }
    for (const choice of selectedInGroup) {
      const c = choice as ChoiceRow;
      let modifier = c.priceModifier;
      if (c.pickupPrice != null) {
        // Absolute choice price (category-level only). deliveryPrice
        // defaults to the pickup absolute when unset (serializer parity).
        const absPickup = c.pickupPrice;
        const absDelivery = c.deliveryPrice != null ? c.deliveryPrice : absPickup;
        if (orderType === "TAKEAWAY") {
          modifier = absPickup - basePrice;
        } else if (orderType === "LIVRAISON") {
          modifier = absDelivery - basePrice;
        } else {
          // DINE_IN: serializer relativizes against the dine-in base.
          modifier = absPickup - product.price;
        }
      } else if (orderType === "TAKEAWAY" && c.pickupPriceModifier != null) {
        modifier = c.pickupPriceModifier;
      } else if (orderType === "LIVRAISON" && c.deliveryPriceModifier != null) {
        modifier = c.deliveryPriceModifier;
      }
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
  const chosenAddons: { id: string | null; name: string; price: number }[] = [];

  for (const aIntent of itemIntent.addons) {
    if (!availableAddonIds.has(aIntent.addonId)) {
      return { error: `Supplément non disponible pour ce produit : ${aIntent.addonId}` };
    }
    const addon = addonMap.get(aIntent.addonId);
    if (!addon || !addon.active) {
      return { error: `Supplément introuvable ou inactif : ${aIntent.addonId}` };
    }
    addonsTotal += addon.price * aIntent.quantity;
    chosenAddons.push({ id: addon.id, name: addon.name, price: addon.price });
  }

  const unitPrice = basePrice + optionsModifier;
  const lineTotal = (unitPrice + addonsTotal) * itemIntent.quantity;

  return {
    unitPrice,
    lineTotal,
    optionsJson: chosenOptions.length ? JSON.stringify(chosenOptions) : null,
    addOnsJson: chosenAddons.length ? JSON.stringify(chosenAddons) : null,
  };
}
