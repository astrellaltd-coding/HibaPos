// Shared Zod validation schemas (used by both client forms and API routes).
import { z } from "zod";

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
});
export type ProductInput = z.infer<typeof productSchema>;

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
  // `/api/auth/approve` — with one operational role that route can never
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
  printerName: z.string().max(60).optional().nullable(),
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
});
export type SettingsInput = z.infer<typeof settingsSchema>;
