"use client";

import { create } from "zustand";
import type { ProductDto, AddOnDto } from "@/types/api";

export type CartOption = {
  group: string;
  choice: string;
  choiceId: string;
  priceModifier: number;
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
};

export const useCartStore = create<CartState>((set) => ({
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
  clear: () =>
    set({
      items: [],
      orderType: "DINE_IN",
      tableLabel: "",
      customerId: null,
      discountTotal: 0,
      notes: "",
    }),
  setOrderType: (orderType) =>
    set((s) => ({
      orderType,
      items: s.items.map((item) => ({
        ...item,
        unitPrice: recalculateUnitPrice(item, orderType),
      })),
    })),
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
      return {
        heldOrders: [...s.heldOrders, held],
        items: [],
        orderType: "DINE_IN",
        tableLabel: "",
        customerId: null,
        discountTotal: 0,
        notes: "",
      };
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
}));

export function recalculateUnitPrice(
  item: CartItem,
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON",
): number {
  let base = item.basePrice;
  if (orderType === "TAKEAWAY" && item.pickupPrice != null) base = item.pickupPrice;
  else if (orderType === "LIVRAISON" && item.deliveryPrice != null) base = item.deliveryPrice;
  const modifier = item.options.reduce((acc, o) => {
    let mod = o.priceModifier;
    if (orderType === "TAKEAWAY" && o.pickupPriceModifier != null) mod = o.pickupPriceModifier;
    else if (orderType === "LIVRAISON" && o.deliveryPriceModifier != null) mod = o.deliveryPriceModifier;
    return acc + mod;
  }, 0);
  return Math.round((base + modifier) * 100) / 100;
}

export function computeLineTotal(item: CartItem): number {
  const addonsTotal = item.addOns.reduce((acc, a) => acc + a.price, 0);
  return Math.round((item.unitPrice + addonsTotal) * item.quantity * 100) / 100;
}

export function computeCartTotals(items: CartItem[], discountTotal: number) {
  const subtotal = Math.round(items.reduce((acc, i) => acc + computeLineTotal(i), 0) * 100) / 100;
  const total = Math.max(0, Math.round((subtotal - discountTotal) * 100) / 100);
  return { subtotal, total };
}

export function productUnitPrice(product: ProductDto, options: CartOption[], orderType?: "DINE_IN" | "TAKEAWAY" | "LIVRAISON"): number {
  let base = product.price;
  if (orderType === "TAKEAWAY" && product.pickupPrice != null) {
    base = product.pickupPrice;
  } else if (orderType === "LIVRAISON" && product.deliveryPrice != null) {
    base = product.deliveryPrice;
  }
  const modifier = options.reduce((acc, o) => acc + o.priceModifier, 0);
  return Math.round((base + modifier) * 100) / 100;
}

// silence unused import for AddOnDto type re-export usage
export type { AddOnDto };
