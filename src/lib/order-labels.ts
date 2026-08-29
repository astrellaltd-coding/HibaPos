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
