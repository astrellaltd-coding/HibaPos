// Shared Zod validation schemas (used by both client forms and API routes).
import { z } from "zod";
// L-22 (Batch 7.5): makes every message below French, including the ~70 fields
// that carry no message of their own. Side-effect import — see the module.
import "@/lib/zod-locale";

/**
 * The VAT rates this restaurant can select (DD-17, Batch 3.1c).
 *
 * Operator determination of 2026-09-03: 10 % on everything sold for
 * consumption, 5,5 % on a drink in a sealed can or bottle — the criterion is
 * the container, not the drink. No alcohol is sold, so 20 % is unused today;
 * it stays selectable anyway, because a needed rate that cannot be chosen is
 * exactly the L-17 defect this batch removes. 2,1 % is excluded: it covers
 * press and medicines and can never apply to a restaurant.
 *
 * Replaces `z.number().min(0).max(100)` on the product path, which accepted
 * 37,3 % — and would have accepted a "6 %" that does not exist in France.
 */
export const ALLOWED_VAT_RATES = [20, 10, 5.5] as const;
export type AllowedVatRate = (typeof ALLOWED_VAT_RATES)[number];

const vatRateField = z.number().refine(
  (v) => (ALLOWED_VAT_RATES as readonly number[]).includes(v),
  { message: "Taux de TVA non autorisé : 20 %, 10 % ou 5,5 %" },
);

export const loginSchema = z.object({
  username: z.string().min(1, "Nom d'utilisateur requis"),
  pin: z
    .string()
    .min(6, "Le code PIN doit contenir 6 chiffres")
    .max(6, "Le code PIN doit contenir 6 chiffres")
    .regex(/^\d{6}$/, "Le code PIN doit contenir 6 chiffres"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const categorySchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(60),
  color: z.string().default("#f59e0b"),
  icon: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
  parentId: z.string().optional().nullable(),
  // NULL / omitted = "not set here". Products that opt into inheritance
  // resolve own category -> parent -> their own rate (L-16/L-17).
  vatRate: vatRateField.nullable().optional(),
  // The rate when the order is NOT consumed on the premises — L-68, Batch 3.12.
  // NULL / omitted = "the same rate whatever the order type", which is why
  // adding it moved nothing: every category that leaves it unset resolves
  // exactly as it did before. Same allowed values as `vatRate`, so a typo here
  // is refused by the same guard rather than by a second one that could drift.
  vatRateTakeaway: vatRateField.nullable().optional(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const optionGroupSchema = z.object({
  name: z.string().min(1),
  required: z.boolean().default(false),
  multiple: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  choices: z
    .array(
      z.object({
        name: z.string().min(1),
        priceModifier: z.number().int().default(0), // cents
        pickupPriceModifier: z.number().int().nullable().optional(),
        deliveryPriceModifier: z.number().int().nullable().optional(),
        image: z.string().nullable().optional(),
        sortOrder: z.number().int().default(0),
      }),
    )
    .default([]),
});

export const categoryOptionGroupSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Le nom est requis"),
  required: z.boolean().default(false),
  multiple: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  choices: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1, "Le nom est requis"),
        priceModifier: z.number().int().default(0), // cents
        pickupPriceModifier: z.number().int().nullable().optional(),
        deliveryPriceModifier: z.number().int().nullable().optional(),
        pickupPrice: z.number().int().nullable().optional(), // absolute cents
        deliveryPrice: z.number().int().nullable().optional(), // absolute cents
        image: z.string().nullable().optional(),
        sortOrder: z.number().int().default(0),
      }),
    )
    .min(1, "Au moins un choix est requis"),
});

export const categoryAddOnSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Le nom est requis").max(60),
  price: z.number().int().min(0, "Le prix doit être positif (en centimes)"),
  image: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

/**
 * One slot of a menu composé (Batch 5.9).
 *
 * `choices` empty means « the whole source category tree »; one entry means
 * the component is fixed and the cashier is never asked. `surcharge` is cents
 * on top of the forfait for that filler — the operator's +1,50 € Frite
 * Cheddar, a figure the catalogue cannot yield (standalone the two products
 * differ by 1,40).
 */
export const comboSlotSchema = z.object({
  name: z.string().min(1, "Le composant doit être nommé").max(40),
  quantity: z.number().int().min(1).max(10).default(1),
  sortOrder: z.number().int().default(0),
  sourceCategoryId: z.string().min(1, "Catégorie requise"),
  choices: z
    .array(
      z.object({
        productId: z.string().min(1),
        surcharge: z.number().int().min(0).default(0),
        sortOrder: z.number().int().default(0),
      }),
    )
    .default([]),
  optionRules: z
    .array(
      z.object({
        categoryOptionGroupId: z.string().min(1),
        // null = « governed, and not asked »: another slot answers it.
        categoryOptionChoiceId: z.string().nullable().default(null),
      }),
    )
    .default([]),
});

export const productSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(80),
  description: z.string().max(280).optional().nullable(),
  price: z.number().int().min(0, "Le prix doit être positif (en centimes)"),
  pickupPrice: z.number().int().min(0).optional().nullable(),
  deliveryPrice: z.number().int().min(0).optional().nullable(),
  // Default 10, not 20: 10 % is this restaurant's standard rate and 20 % is
  // alcohol, which it does not sell. Only reachable by an API caller that
  // omits the field — the product form always sends an explicit value.
  vatRate: vatRateField.default(10),
  // Take the rate from the category chain instead of `vatRate` above.
  inheritCategoryVat: z.boolean().default(false),
  categoryId: z.string().min(1, "Catégorie requise"),
  image: z.string().optional().nullable(),
  active: z.boolean().default(true),
  available: z.boolean().default(true),
  /**
   * R3.1 — « Use it on POS ». Defaults TRUE, so every existing caller and
   * every existing product is unaffected: a payload that omits it asks for a
   * product that appears on the grid, which is what all 81 do today.
   */
  showOnPos: z.boolean().default(true),
  inheritCategoryGlobals: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  /**
   * Product-specific option groups — C-24, Batch 4.6.
   *
   * `.optional()`, NOT `.default([])`. The PUT handler replaces these groups
   * wholesale: it deletes every existing group for the product and recreates
   * them from this field. With a `[]` default, a PUT that simply omitted
   * `options` — any partial update, any second client — parsed as "the empty
   * list" and silently destroyed the product's whole option configuration,
   * answering 200. Absent now means *leave them alone*; an explicit `[]`
   * still clears them, which is how the form deletes the last group.
   *
   * On create there is nothing to preserve, so absent means "none" there.
   */
  options: z.array(optionGroupSchema).optional(),
  /**
   * A menu composé (Batch 5.9). Defaults false, so every existing caller and
   * every existing product is unaffected.
   */
  isCombo: z.boolean().default(false),
  /**
   * The menu's slots. `.optional()` for the same reason `options` is: the PUT
   * handler replaces them wholesale, so an absent field must mean « leave them
   * alone » and not « delete them all ». That distinction is C-24 (Batch 4.6),
   * and a menu whose slots were silently wiped by a partial update would sell
   * at its forfait under the higher-rate fallback — a real, invisible cost.
   */
  comboSlots: z.array(comboSlotSchema).optional(),
});
export type ProductInput = z.infer<typeof productSchema>;

/**
 * Is this menu completely enough configured to be SOLD? — Batch 5.9e.
 *
 * `docs/politique-ventilation-tva.md` § 4: « Ce repli est conçu pour ne jamais
 * se déclencher en service : la configuration d'un menu incomplet doit être
 * refusée à l'enregistrement, là où il y a le temps de la corriger. Le repli
 * est la ceinture, la validation est les bretelles. »
 *
 * So this is the bretelles. It runs where there IS time to fix the problem —
 * the catalogue editor — and it returns French sentences an operator can act
 * on. It cannot see the database, so it checks the SHAPE; the routes add the
 * checks that need the catalogue (does this category exist, is this filler a
 * menu itself).
 *
 * ABSENT `comboSlots` IS NOT AN EMPTY ONE. `undefined` means « leave the slots
 * alone » — C-24's rule (Batch 4.6), the same reading `options` has — so the
 * « at least one component » check is skipped when nothing is being written.
 * Whether the menu ALREADY has one is a database question and belongs to the
 * route; on create the caller passes `[]`, because on create absent means none.
 *
 * Returns an empty array when the menu is fine.
 */
/** One wording, used by the shape check and by the route's « it already has
 *  none » check, so an operator never sees two sentences for one problem. */
export const COMBO_NEEDS_A_SLOT = "Un menu composé doit avoir au moins un composant.";

export function validateComboShape(input: {
  isCombo?: boolean;
  price?: number;
  comboSlots?: { name: string; quantity: number; sourceCategoryId: string; choices?: { productId: string }[] }[];
}): string[] {
  if (!input.isCombo) {
    // A product that is not a menu may not carry slots: they would be dead
    // configuration that nothing reads, and the next person to set `isCombo`
    // would inherit a composition nobody chose.
    return (input.comboSlots?.length ?? 0) > 0
      ? ["Des composants sont définis alors que ce produit n'est pas un menu composé."]
      : [];
  }

  const errors: string[] = [];
  const slots = input.comboSlots ?? [];
  if (input.comboSlots !== undefined && slots.length === 0) {
    errors.push(COMBO_NEEDS_A_SLOT);
  }
  if ((input.price ?? 0) <= 0) {
    errors.push("Un menu composé doit avoir un prix : le forfait est ce qui est ventilé entre les taux.");
  }
  for (const [i, slot] of slots.entries()) {
    const where = slot.name?.trim() ? `« ${slot.name} »` : `Composant ${i + 1}`;
    if (!slot.name?.trim()) {
      errors.push(`${where} : le composant doit être nommé — c'est la question posée au caissier.`);
    }
    if (!Number.isInteger(slot.quantity) || slot.quantity < 1) {
      errors.push(`${where} : la quantité doit être d'au moins 1.`);
    }
    if (!slot.sourceCategoryId) {
      errors.push(`${where} : choisissez la catégorie dans laquelle piocher.`);
    }
    const ids = (slot.choices ?? []).map((c) => c.productId);
    if (new Set(ids).size !== ids.length) {
      errors.push(`${where} : le même produit est proposé deux fois.`);
    }
  }
  return errors;
}

// DD-15 (Batch 5.7a): `addOnSchema` / `AddOnInput` were here, used only by
// the two deleted `/api/catalog/addons` routes. `categoryAddOnSchema` above is
// the surviving one and is NOT the same thing — it validates the 21 live
// category add-ons through the category editor.

export const customerSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(80),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email("Email invalide").optional().or(z.literal("")),
  address: z.string().max(200).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const userSchema = z.object({
  username: z.string().min(2, "Min. 2 caractères").max(30).regex(/^[a-zA-Z0-9_.-]+$/, "Caractères invalides"),
  name: z.string().min(1, "Le nom est requis").max(80),
  role: z.enum(["SUPER_ADMIN", "MANAGER"]).default("MANAGER"),
  pin: z.string().regex(/^\d{6}$/, "6 chiffres requis"),
  active: z.boolean().default(true),
});
export type UserInput = z.infer<typeof userSchema>;

export const shiftOpenSchema = z.object({
  openingFloat: z.number().int().min(0).default(0), // cents
  notes: z.string().max(500).optional().nullable(),
});

export const shiftCloseSchema = z.object({
  closingFloat: z.number().int().min(0), // cents
  notes: z.string().max(500).optional().nullable(),
});

// L-02 (Batch 6.2), removed together with T-08 exactly as both rows instruct.
//
// `orderItemSchema`, `paymentSchema`, `checkoutSchema`, `CheckoutInput` and
// `OrderItemInput` stood here and were **referenced only by tests**. The live
// checkout validates with `checkoutIntentSchema`, declared inline in
// `orders/route.ts` and differently shaped, so this pair was a second
// hand-maintained copy of a contract nothing enforced — kept in step by hand as
// recently as Batch 5.7b, which is the cost that made removing it right.
//
// ⚠ `CheckoutInput` was a NAME COLLISION as well as dead code:
// `services/checkout.ts` exports its own `CheckoutInput`, which is the live one
// and is untouched. That is the third such collision this remediation has
// found, after `PENDING` (Batch 5.6) and `addon` (Batch 5.7a).

export const refundSchema = z.object({
  amount: z.number().int().min(1), // cents (min 1 cent)
  reason: z.string().min(1, "Motif requis").max(280),
  approvedById: z.string().optional(), // legacy — only honored for MANAGER+/SUPER_ADMIN callers
  // DD-19, Batch 4.4c: REQUIRED in practice on every refund. The route refuses
  // without it; the field stays optional here so the refusal is the route's
  // French "Confirmation par code PIN requise." rather than a zod message in
  // English (L-22). It replaced `approvalToken`, the manager approval from
  // `/api/auth/approve` (DELETED in Batch 7.2 — see `api/auth/step-up/route.ts`) — with one operational role that route can never
  // approve the caller's own refund, which is what M-18 described.
  stepUpToken: z.string().optional(), // signed single-use token from /api/auth/step-up
  method: z.enum(["CASH", "CARD", "VOUCHER"]).optional(), // refund channel; null legacy defaults to CASH in reports
});

// M-05 / DD-12 (Batch 5.5) — entrée / sortie de caisse.
export const cashMovementSchema = z.object({
  category: z.enum(["APPROVISIONNEMENT", "PRELEVEMENT", "DEPENSE", "ERREUR_DE_CAISSE"]),
  // SIGNED cents: positive into the drawer, negative out of it. Zero is refused
  // by the service with a French message rather than here, for L-22's reason.
  // The sign must agree with the category — also the service's job, because the
  // message has to name which direction the category means.
  amount: z.number().int(),
  reason: z.string().min(1, "Motif requis").max(280),
  // Required in practice for an OUTGOING movement only (operator, 2026-09-05).
  // Optional here so the refusal is the route's French message and not a zod
  // one in English — the same reasoning as `refundSchema.stepUpToken`.
  stepUpToken: z.string().optional(),
});

export const settingsSchema = z.object({
  restaurantName: z.string().min(1).max(80),
  restaurantAddress: z.string().max(200).optional().nullable(),
  restaurantPhone: z.string().max(30).optional().nullable(),
  restaurantSiret: z.string().max(40).optional().nullable(),
  restaurantTva: z.string().max(40).optional().nullable(),
  footerNote: z.string().max(200).optional().nullable(),
  defaultVatRate: z.number().min(0).max(100),
  currency: z.string().max(3).default("EUR"),
  // A LABEL ONLY, and deliberately still one (DOC-15). What the app actually
  // addresses when printing over USB is `printerQueue` below; keeping the two
  // apart is what stops a decorative value like "Sunso WTP-801" being mistaken
  // for the Windows queue name, which on this very machine is "SUNSO WTP-800".
  printerName: z.string().max(60).optional().nullable(),
  // How the printer is attached (Batch 1.3d, L-69). Explicit rather than
  // inferred from which field is filled: the two modes fail differently and
  // the operator has to be told the right thing to go and look at.
  printerConnection: z.enum(["network", "usb"]).default("network"),
  // The Windows print-queue name, exactly as the spooler reports it. Chosen
  // from a list the app reads from Windows, never typed.
  printerQueue: z.string().max(120).optional().nullable(),
  // Printer connection (C-03, Batch 1.3). DD-01 chose raw TCP on port 9100:
  // an IPv4 address or hostname, empty meaning "no printer configured", in
  // which case every print is skipped with a warning instead of failing.
  printerHost: z.string().max(120).optional().nullable(),
  printerPort: z.number().int().min(1).max(65535).default(9100),
  printerEnabled: z.boolean().default(false),
  // Kick the drawer automatically when a sale is tendered in cash.
  openDrawerOnCash: z.boolean().default(true),
  // COLUMN count, not millimetres — see L-13. 80 mm paper fits 48 columns at
  // Font A, 58 mm fits 32. Legacy rows holding 58/80 are mapped on read by
  // normalizeReceiptColumns(); the max is 48 so new values cannot repeat it.
  receiptWidth: z.number().int().min(32).max(48).default(48),
  discountApprovalThreshold: z.number().min(0).max(100).default(20),
  autoPrint: z.boolean().default(false),
  factice: z.boolean().default(false),
  // DD-23 / DD-24 (Batch 3.8). The hour a TRADING day starts and ends, so a
  // service running to 01:30 belongs to the day it started rather than to the
  // next one. It governs the day close, the monthly close and the exercice
  // alike, which is what stops two sealed documents disagreeing about the same
  // tickets. `0` means calendar days and is a supported setting, not a
  // disabled feature. Bounded 0..23 by the hour it names, not by policy.
  businessDayCutoffHour: z.number().int().min(0).max(23).default(5),
});
export type SettingsInput = z.infer<typeof settingsSchema>;
