// What the till SENDS to `POST /api/orders` — the checkout intent's items.
//
// EXTRACTED from `payment-dialog.tsx` in Batch 5.9, and the reason is the
// defect that forced it. The route was complete, the allocation was correct,
// the cart held a menu's three components — and the checkout answered 400,
// because the dialog built this array inline and nobody had taught it about
// `components`. Every test passed: the route tests construct their own request
// body, so none of them can see what the client actually sends.
//
// That is M-19's shape (Batch 5.7c), one layer further out: a mapping inside a
// component cannot be exercised, so the one place a defect can hide is the one
// place no test looks. `toCartOptions` was extracted for exactly this reason
// and the dialog now calls it; this is the same move for the same reason.
//
// INTENT ONLY. Product ids, option ids, add-on ids, quantities — no prices, no
// rates. The server recomputes every figure from the catalogue, which is why a
// tampered basket cannot choose what it pays or what it is taxed.

import type { CartItem } from "@/store/cart-store";

export type CheckoutItemIntent = {
  productId: string | null;
  quantity: number;
  notes: string | null;
  optionIds: string[];
  // L-80 (R4.2): `string`, matching the checkout schema. Was `string | null`,
  // which described a request the server refuses.
  addons: { addonId: string; quantity: number }[];
  /** Present only on a menu composé, in SLOT ORDER — the order the server's
   *  `expandSlots` produces and validates against. */
  components?: {
    slotId: string;
    productId: string;
    optionIds: string[];
    addons: { addonId: string; quantity: number }[];
  }[];
};

export function buildCheckoutItems(items: CartItem[]): CheckoutItemIntent[] {
  return items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
    notes: i.notes ?? null,
    optionIds: i.options.map((o) => o.choiceId),
    addons: i.addOns.map((a) => ({ addonId: a.id, quantity: 1 })),
    // Omitted entirely on an ordinary line. The route REFUSES a composition
    // attached to something that is not a menu, because a silently ignored
    // field on a checkout is how a client and a server come to disagree about
    // what was sold.
    ...(i.components && i.components.length > 0
      ? {
          components: i.components.map((c) => ({
            slotId: c.slotId,
            productId: c.productId,
            optionIds: c.options.map((o) => o.choiceId),
            addons: c.addOns.map((a) => ({ addonId: a.id, quantity: 1 })),
          })),
        }
      : {}),
  }));
}
