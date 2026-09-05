"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProductDto, AddOnDto } from "@/types/api";

export type CartOption = {
  group: string;
  choice: string;
  choiceId: string;
  /** The modifier RESOLVED for the order type the line was added under — what
   *  the dialog showed the operator, and what the line is priced at now. */
  priceModifier: number;
  /** M-19 (Batch 5.7c): the DINE_IN modifier, kept alongside the resolved one.
   *
   *  The defect was that `priceModifier` held the resolved value and
   *  `recalculateUnitPrice` then read it back as though it were the dine-in
   *  one. Add a line under TAKEAWAY where the choice has a pickup modifier,
   *  switch to DINE_IN, and the line reprices with the TAKEAWAY figure —
   *  neither branch below fires, so `priceModifier` is used verbatim. The
   *  client total then disagrees with the server's and the checkout is
   *  refused « Paiement incorrect ». */
  dineInPriceModifier: number;
  pickupPriceModifier?: number | null;
  deliveryPriceModifier?: number | null;
};
export type CartAddOn = { id: string | null; name: string; price: number };
export type CartItem = {
  uid: string; // unique line id
  productId: string | null;
  productName: string;
  basePrice: number; // TTC base (DINE_IN price)
  pickupPrice: number | null; // TTC takeaway price
  deliveryPrice: number | null; // TTC delivery price
  unitPrice: number; // TTC including options (addons are tracked separately per line)
  quantity: number;
  options: CartOption[];
  addOns: CartAddOn[];
  notes?: string | null;
  vatRate: number;
  image?: string | null;
};

export type HeldOrder = {
  id: string;
  label: string;
  items: CartItem[];
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON";
  tableLabel: string;
  customerId: string | null;
  discountTotal: number;
  notes: string;
  heldAt: number;
};

type CartState = {
  items: CartItem[];
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON";
  tableLabel: string;
  customerId: string | null;
  discountTotal: number;
  notes: string;
  heldOrders: HeldOrder[];
  addItem: (item: CartItem) => void;
  incItem: (uid: string) => void;
  decItem: (uid: string) => void;
  removeItem: (uid: string) => void;
  updateItem: (uid: string, updates: Partial<Omit<CartItem, "uid" | "productId" | "productName">>) => void;
  clear: () => void;
  setOrderType: (t: "DINE_IN" | "TAKEAWAY" | "LIVRAISON") => void;
  setTableLabel: (s: string) => void;
  setCustomerId: (id: string | null) => void;
  setDiscount: (n: number) => void;
  setNotes: (s: string) => void;
  holdCurrent: (label: string) => void;
  recallOrder: (id: string) => void;
  deleteHeld: (id: string) => void;
  clearForOperatorChange: () => void;
};

/**
 * The persisted shape, and the only thing hydration may produce (C-23, Batch 5.4).
 *
 * Kept beside the store rather than inlined three times: `clear()` resets the
 * in-progress sale, `clearForOperatorChange()` resets that AND the parked
 * tickets, and `vetPersistedCart()` discards a payload it cannot vouch for. All
 * three have to mean the same "empty", or one of them is a way for state to
 * survive something it should not.
 */
const emptySale = () => ({
  items: [] as CartItem[],
  orderType: "DINE_IN" as const,
  tableLabel: "",
  customerId: null as string | null,
  discountTotal: 0,
  notes: "",
});

export type PersistedCart = ReturnType<typeof emptySale> & {
  heldOrders: HeldOrder[];
  /** The schema version, carried INSIDE the state. See `vetPersistedCart`. */
  schema: number;
};

/** A FUNCTION, not a constant. A shared empty object would hand the same
 *  `items` array to every caller: one discarded cart's first keystroke would
 *  then appear inside the next discard, and inside `clear()`. */
const emptyCart = (): PersistedCart => ({ ...emptySale(), heldOrders: [], schema: CART_PERSIST_VERSION });

/**
 * Bump when the persisted shape or its UNITS change (C-23, Batch 5.4).
 *
 * Version 1 is the integer-cents shape. Everything written before commit
 * `720660a` held EUROS in the same field names, so it rehydrates silently and
 * wrongly: a 12,50 € line comes back as `unitPrice: 12.5` and is read as
 * 12 cents. The store had no version guard of any kind, which is the half of
 * C-23 that could corrupt a sale rather than merely leak one.
 *
 * **Version 2 (M-19, Batch 5.7c)** adds `CartOption.dineInPriceModifier`. A
 * version-1 line has no such field, so its DINE_IN price would fall back to
 * the modifier it was added under — the very defect M-19 names. Bumped rather
 * than defaulted, which is what the instruction above says to do when the
 * persisted SHAPE changes.
 */
export const CART_PERSIST_VERSION = 2;

/**
 * Vet a persisted payload; return the empty cart when it cannot be vouched for.
 *
 * **Why the version is stamped inside the state rather than left to zustand.**
 * `persist`'s own `version`/`migrate` pair cannot see the case C-23 actually
 * names. Measured against zustand 5.0.10, `middleware.js` reads:
 *
 *     if (typeof deserializedStorageValue.version === "number" &&
 *         deserializedStorageValue.version !== options.version) { ...migrate... }
 *     else { return [false, deserializedStorageValue.state]; }
 *
 * A euros-era payload has **no `version` key at all**, so `typeof undefined`
 * is not `"number"`, the guard short-circuits, and the state hydrates
 * verbatim — `migrate` is never called. A `version` and a `migrate` were
 * written first and proved not to fire, by loading the real module against a
 * stubbed `localStorage`; `cart-persist-wiring.test.ts` is that proof, kept.
 *
 * So the version travels in the payload, where `merge` — which zustand calls on
 * every hydration, migrated or not — can see it. A cart with no `schema`, or a
 * `schema` this build does not know, is discarded.
 *
 * Deliberately a discard and not a conversion. A euros-era cart could in
 * principle be multiplied by 100, but nothing records which of the two shapes a
 * given payload is, and a cart is seconds of re-keying — where a silently
 * mis-scaled one is a sale rung at a hundredth of its price.
 */
export function vetPersistedCart(persisted: unknown): PersistedCart {
  if (!persisted || typeof persisted !== "object") return emptyCart();
  const c = persisted as Partial<PersistedCart>;
  if (c.schema !== CART_PERSIST_VERSION) return emptyCart();
  // Structural sanity at the right version: the stamp says what the units are,
  // not that the payload is intact. Hand-edited or truncated storage reaches
  // this point stamped correctly and shaped wrongly.
  if (!Array.isArray(c.items) || !Array.isArray(c.heldOrders)) return emptyCart();
  return { ...emptyCart(), ...c, schema: CART_PERSIST_VERSION };
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      orderType: "DINE_IN",
      tableLabel: "",
      customerId: null,
      discountTotal: 0,
      notes: "",
      heldOrders: [],
  addItem: (item) =>
    set((s) => {
      // Merge identical lines (same product + same options + same addons + same notes)
      const key = (i: CartItem) =>
        `${i.productId}|${JSON.stringify(i.options)}|${JSON.stringify(i.addOns)}|${i.notes ?? ""}`;
      const newKey = key(item);
      const idx = s.items.findIndex((i) => key(i) === newKey);
      if (idx >= 0) {
        const items = [...s.items];
        items[idx] = { ...items[idx], quantity: items[idx].quantity + item.quantity };
        return { items };
      }
      return { items: [...s.items, item] };
    }),
  incItem: (uid) =>
    set((s) => ({
      items: s.items.map((i) => (i.uid === uid ? { ...i, quantity: i.quantity + 1 } : i)),
    })),
  decItem: (uid) =>
    set((s) => ({
      items: s.items
        .map((i) => (i.uid === uid ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0),
    })),
  removeItem: (uid) => set((s) => ({ items: s.items.filter((i) => i.uid !== uid) })),
  updateItem: (uid, updates) =>
    set((s) => ({
      items: s.items.map((i) => (i.uid === uid ? { ...i, ...updates } : i)),
    })),
  clear: () => set(emptySale()),
  /**
   * C-23 (Batch 5.4): everything, parked tickets included.
   *
   * `clear()` is the end of a sale — checkout, or the "Vider" button — and
   * must leave the held tickets alone. This is the end of an OPERATOR, and
   * must not: `app-store.ts` used to set `user: null` without touching the
   * cart, so cashier B inherited A's open ticket and A's parked tickets and
   * rang them under B's name. Called from `setUser` and `logout`, which is
   * every way the identity at the till can change.
   */
  clearForOperatorChange: () => set(emptyCart()),
  setOrderType: (orderType) =>
    set((s) => ({
      orderType,
      items: s.items.map((item) => ({
        ...item,
        unitPrice: recalculateUnitPrice(item, orderType),
      })),
    })),
  // C-21 / DD-09 (Batch 5.2): CALLED FROM NOWHERE, deliberately. This setter
  // is the near end of the table wire — cart → payment-dialog → POST /api/orders
  // → checkout auto-link → receipt — every other link of which is live and
  // retained. C-21 was that the wire looked connected because a floor-plan
  // screen existed; 5.2 removed the screen and left the wire, so `tableLabel`
  // is permanently "" and `payment-dialog.tsx:160` permanently sends null.
  // Held tickets therefore keep their "Commande N" fallback (`cart-panel.tsx:95`),
  // which is now the intended behaviour and not a symptom.
  setTableLabel: (tableLabel) => set({ tableLabel }),
  setCustomerId: (customerId) => set({ customerId }),
  setDiscount: (discountTotal) => set({ discountTotal }),
  setNotes: (notes) => set({ notes }),
  holdCurrent: (label) =>
    set((s) => {
      if (s.items.length === 0) return {};
      const held: HeldOrder = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: label || s.tableLabel || `Commande ${s.heldOrders.length + 1}`,
        items: s.items,
        orderType: s.orderType,
        tableLabel: s.tableLabel,
        customerId: s.customerId,
        discountTotal: s.discountTotal,
        notes: s.notes,
        heldAt: Date.now(),
      };
      return { heldOrders: [...s.heldOrders, held], ...emptySale() };
    }),
  recallOrder: (id) =>
    set((s) => {
      const held = s.heldOrders.find((h) => h.id === id);
      if (!held) return {};
      return {
        items: held.items.map((item) => ({
          ...item,
          unitPrice: recalculateUnitPrice(item, held.orderType),
        })),
        orderType: held.orderType,
        tableLabel: held.tableLabel,
        customerId: held.customerId,
        discountTotal: held.discountTotal,
        notes: held.notes,
        heldOrders: s.heldOrders.filter((h) => h.id !== id),
      };
    }),
  deleteHeld: (id) =>
    set((s) => ({ heldOrders: s.heldOrders.filter((h) => h.id !== id) })),
    }),
    {
      name: "hibapos-cart",
      // Persist the in-progress sale + held orders so a page reload or
      // browser restart doesn't wipe them. Exclude nothing — all fields
      // are small and user-relevant.
      //
      // C-23 (Batch 5.4): `version` and `migrate` were both absent, so a cart
      // written before the euros→cents migration (`720660a`) rehydrated its
      // euro numbers into cent fields with nothing to notice. An unversioned
      // payload is read as version 0 and discarded.
      // C-23 (Batch 5.4). `version` is declared so zustand stamps and compares
      // its own, and `migrate` handles a numbered upgrade — but neither is what
      // closes the finding: an UNVERSIONED payload never reaches `migrate` at
      // all (see `vetPersistedCart`). `merge` is the load-bearing hook, because
      // zustand calls it on every hydration whether it migrated or not.
      version: CART_PERSIST_VERSION,
      migrate: (state) => vetPersistedCart(state),
      merge: (persisted, current) => ({ ...current, ...vetPersistedCart(persisted) }),
      partialize: (s) => ({
        items: s.items,
        orderType: s.orderType,
        tableLabel: s.tableLabel,
        customerId: s.customerId,
        discountTotal: s.discountTotal,
        notes: s.notes,
        heldOrders: s.heldOrders,
        // Stamped into the payload so `merge` can check it. See above.
        schema: CART_PERSIST_VERSION,
      }),
    },
  ),
);

export function recalculateUnitPrice(
  item: CartItem,
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON",
): number {
  let base = item.basePrice;
  if (orderType === "TAKEAWAY" && item.pickupPrice != null) base = item.pickupPrice;
  else if (orderType === "LIVRAISON" && item.deliveryPrice != null) base = item.deliveryPrice;
  const modifier = item.options.reduce((acc, o) => {
    // M-19 (Batch 5.7c). The DINE_IN arm now reads the dine-in modifier rather
    // than whatever the line happened to be added under. The `??` fallback is
    // the pre-M-19 behaviour and is reachable only through hand-edited
    // storage: `CART_PERSIST_VERSION` was bumped so every payload written
    // before this batch is discarded rather than half-read.
    let mod = o.dineInPriceModifier ?? o.priceModifier;
    if (orderType === "TAKEAWAY" && o.pickupPriceModifier != null) mod = o.pickupPriceModifier;
    else if (orderType === "LIVRAISON" && o.deliveryPriceModifier != null) mod = o.deliveryPriceModifier;
    return acc + mod;
  }, 0);
  return base + modifier; // integer cents — no rounding needed
}

export function computeLineTotal(item: CartItem): number {
  const addonsTotal = item.addOns.reduce((acc, a) => acc + a.price, 0);
  return (item.unitPrice + addonsTotal) * item.quantity; // integer cents
}

export function computeCartTotals(items: CartItem[], discountTotal: number) {
  const subtotal = items.reduce((acc, i) => acc + computeLineTotal(i), 0);
  const total = Math.max(0, subtotal - discountTotal);
  return { subtotal, total };
}

/** The order-type-specific fields a choice can carry. Structural, so both
 *  `OptionChoiceDto` and a category choice satisfy it. */
export type ChoiceModifiers = {
  id: string;
  name: string;
  priceModifier: number;
  pickupPriceModifier?: number | null;
  deliveryPriceModifier?: number | null;
};

/**
 * Build the cart's options from what the operator ticked — M-19 (Batch 5.7c).
 *
 * EXTRACTED from `product-options-dialog-v2.tsx`, which built this inline in a
 * `useMemo`. The batch's criterion is a test "built through the options
 * dialog's own mapping, not a hand-built `CartItem` — the existing tests miss
 * the bug precisely because they bypass it", and a mapping inside a component
 * cannot be exercised. The dialog now calls this, so the test and the till run
 * the same code.
 *
 * `priceModifier` is the value resolved for `orderType` (what the dialog
 * prices with); `dineInPriceModifier` is always the choice's own dine-in
 * figure, so a later switch back to DINE_IN has something true to read.
 */
export function toCartOptions(
  groups: { name: string; choices: ChoiceModifiers[] }[],
  selected: Record<string, string[]>,
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON",
): CartOption[] {
  const out: CartOption[] = [];
  for (const g of groups) {
    for (const picked of selected[g.name] ?? []) {
      const ch = g.choices.find((c) => c.name === picked);
      if (!ch) continue;
      let effective = ch.priceModifier;
      if (orderType === "TAKEAWAY" && ch.pickupPriceModifier != null) effective = ch.pickupPriceModifier;
      else if (orderType === "LIVRAISON" && ch.deliveryPriceModifier != null) effective = ch.deliveryPriceModifier;
      out.push({
        group: g.name,
        choice: ch.name,
        choiceId: ch.id,
        priceModifier: effective,
        dineInPriceModifier: ch.priceModifier,
        pickupPriceModifier: ch.pickupPriceModifier ?? null,
        deliveryPriceModifier: ch.deliveryPriceModifier ?? null,
      });
    }
  }
  return out;
}

export function productUnitPrice(product: ProductDto, options: CartOption[], orderType?: "DINE_IN" | "TAKEAWAY" | "LIVRAISON"): number {
  let base = product.price;
  if (orderType === "TAKEAWAY" && product.pickupPrice != null) {
    base = product.pickupPrice;
  } else if (orderType === "LIVRAISON" && product.deliveryPrice != null) {
    base = product.deliveryPrice;
  }
  const modifier = options.reduce((acc, o) => acc + o.priceModifier, 0);
  return base + modifier; // integer cents
}

// silence unused import for AddOnDto type re-export usage
export type { AddOnDto };
