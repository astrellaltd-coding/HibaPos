// Shared Zod validation schemas (used by both client forms and API routes).
import { z } from "zod";

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
        priceModifier: z.number().default(0),
        pickupPriceModifier: z.number().nullable().optional(),
        deliveryPriceModifier: z.number().nullable().optional(),
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
        priceModifier: z.number().default(0),
        pickupPriceModifier: z.number().nullable().optional(),
        deliveryPriceModifier: z.number().nullable().optional(),
        pickupPrice: z.number().nullable().optional(),
        deliveryPrice: z.number().nullable().optional(),
        image: z.string().nullable().optional(),
        sortOrder: z.number().int().default(0),
      }),
    )
    .min(1, "Au moins un choix est requis"),
});

export const categoryAddOnSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Le nom est requis").max(60),
  price: z.number().min(0, "Le prix doit être positif"),
  image: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

export const productSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(80),
  description: z.string().max(280).optional().nullable(),
  price: z.number().min(0, "Le prix doit être positif"),
  pickupPrice: z.number().min(0).optional().nullable(),
  deliveryPrice: z.number().min(0).optional().nullable(),
  vatRate: z.number().min(0).max(100).default(20),
  categoryId: z.string().min(1, "Catégorie requise"),
  image: z.string().optional().nullable(),
  active: z.boolean().default(true),
  available: z.boolean().default(true),
  inheritCategoryGlobals: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  options: z.array(optionGroupSchema).default([]),
});
export type ProductInput = z.infer<typeof productSchema>;

export const addOnSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(60),
  price: z.number().min(0, "Le prix doit être positif"),
  image: z.string().optional().nullable(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type AddOnInput = z.infer<typeof addOnSchema>;

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
  role: z.enum(["SUPER_ADMIN", "MANAGER", "CASHIER"]).default("MANAGER"),
  pin: z.string().regex(/^\d{6}$/, "6 chiffres requis"),
  active: z.boolean().default(true),
});
export type UserInput = z.infer<typeof userSchema>;

export const shiftOpenSchema = z.object({
  openingFloat: z.number().min(0).default(0),
  notes: z.string().max(500).optional().nullable(),
});

export const shiftCloseSchema = z.object({
  closingFloat: z.number().min(0),
  notes: z.string().max(500).optional().nullable(),
});

export const orderItemSchema = z.object({
  productId: z.string().nullable(),
  productName: z.string(),
  unitPrice: z.number(),
  quantity: z.number().int().min(1),
  lineTotal: z.number(),
  options: z
    .array(
      z.object({
        group: z.string(),
        choice: z.string(),
        priceModifier: z.number().default(0),
      }),
    )
    .default([]),
  addOns: z
    .array(
      z.object({
        id: z.string().nullable(),
        name: z.string(),
        price: z.number(),
      }),
    )
    .default([]),
  notes: z.string().optional().nullable(),
});
export type OrderItemInput = z.infer<typeof orderItemSchema>;

export const paymentSchema = z.object({
  method: z.enum(["CASH", "CARD", "VOUCHER"]),
  amount: z.number().min(0.01),
});

export const checkoutSchema = z.object({
  orderType: z.enum(["DINE_IN", "TAKEAWAY", "LIVRAISON"]).default("DINE_IN"),
  tableLabel: z.string().max(40).optional().nullable(),
  customerId: z.string().nullable().optional(),
  items: z.array(orderItemSchema).min(1, "La commande est vide"),
  payments: z.array(paymentSchema).min(1, "Au moins un paiement"),
  notes: z.string().max(500).optional().nullable(),
  discountTotal: z.number().min(0).default(0),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const refundSchema = z.object({
  amount: z.number().min(0.01),
  reason: z.string().min(1, "Motif requis").max(280),
  approvedById: z.string().optional(), // legacy — only honored for MANAGER+/SUPER_ADMIN callers
  approvalToken: z.string().optional(), // recommended: signed single-use token from /api/auth/approve
  method: z.enum(["CASH", "CARD", "VOUCHER"]).optional(), // refund channel; null legacy defaults to CASH in reports
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
  receiptWidth: z.number().int().min(32).max(80).default(80),
  discountApprovalThreshold: z.number().min(0).max(100).default(20),
  autoPrint: z.boolean().default(false),
  factice: z.boolean().default(false),
});
export type SettingsInput = z.infer<typeof settingsSchema>;
