// Shared order labels (French) — extracted from receipt-dialog.tsx,
// orders-view.tsx, customer-detail-dialog.tsx, dashboard-view.tsx
// (Phase 7b — pure cleanup, no behavior change).

import type { OrderDto } from "@/types/api";

export const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Espèces",
  CARD: "Carte",
  VOUCHER: "Bon",
};

export const PAYMENT_LABELS_FULL: Record<string, string> = {
  CASH: "Espèces",
  CARD: "Carte",
  VOUCHER: "Bon / Ticket",
};

export const ORDER_TYPE_LABELS: Record<OrderDto["orderType"], string> = {
  DINE_IN: "Sur place",
  TAKEAWAY: "À emporter",
  LIVRAISON: "Livraison",
};

/** DD-13 / M-08 (Batch 5.6). The order states the product has, and their
 *  French names — one home, so the two `statusBadge` switches cannot drift
 *  apart again. They already had: `orders-view.tsx`'s own `StatusFilter`
 *  offered COMPLETED / REFUNDED while its badge switch still handled a
 *  CANCELLED that nothing could produce.
 *
 *  Keyed by `OrderDto["status"]`, so adding a state to the enum without
 *  naming it here is a type error rather than a silent « En attente ». */
export const ORDER_STATUS_LABELS: Record<OrderDto["status"], string> = {
  COMPLETED: "Terminée",
  REFUNDED: "Remboursée",
};
