import { describe, it, expect, beforeEach, afterEach } from "vitest";

// C-23 (Batch 5.4) — is the guard actually WIRED, not merely written?
//
// `cart-lifecycle.test.ts` tests the vetting as a function. That leaves the
// thing a unit test of a pure function can never catch: whether `persist`
// actually calls it on the payload that matters.
//
// THIS FILE FOUND A REAL DEFECT AND IS KEPT FOR IT. The batch first shipped
// `version: 1` + `migrate`, which is what the audit's own remediation direction
// asks for and what every zustand tutorial shows. It does not work for the case
// C-23 names. Measured against zustand 5.0.10, `node_modules/zustand/middleware.js`:
//
//     if (typeof deserializedStorageValue.version === "number" &&
//         deserializedStorageValue.version !== options.version) { ...migrate... }
//     else { return [false, deserializedStorageValue.state]; }
//
// A euros-era cart has NO `version` key, so `typeof undefined !== "number"`,
// the guard short-circuits, and the state hydrates verbatim — `migrate` is
// never called at all. The first run of this file caught exactly that: three
// cases passed and the euros one rehydrated `unitPrice: 12.5` untouched. The
// fix stamps the version inside the payload and checks it in `merge`, which
// zustand calls on every hydration whether it migrated or not.
//
// The browser was the obvious place to prove this and it did not work out: in
// this session's pane the app rendered its login screen even with a valid
// session, on the PRE-batch build as well as the post-batch one, so it is an
// environment condition and not a regression — but it meant no walkthrough
// could reach the POS view, which is where the cart store is first imported.
// This file is the better artifact anyway: it runs on every `bun test src`
// rather than once in a session. The store module is imported DYNAMICALLY,
// after a `localStorage` stub is in place, because `persist` hydrates at
// module-evaluation time — a top-of-file import would run before the stub.

function stubLocalStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  return map;
}

/** A cart exactly as commit `720660a` left it: euros in the cent fields, and
 *  no version of any kind — neither zustand's own key nor the in-state stamp. */
const EUROS_ERA = JSON.stringify({
  state: {
    items: [
      {
        uid: "old-1",
        productId: "p-old",
        productName: "Tacos",
        basePrice: 12.5,
        pickupPrice: null,
        deliveryPrice: null,
        unitPrice: 12.5,
        quantity: 2,
        options: [],
        addOns: [],
        vatRate: 10,
      },
    ],
    orderType: "TAKEAWAY",
    tableLabel: "",
    customerId: null,
    discountTotal: 2.5,
    notes: "panier en euros",
    heldOrders: [
      {
        id: "h-old",
        label: "Commande 1",
        items: [],
        orderType: "DINE_IN",
        tableLabel: "",
        customerId: null,
        discountTotal: 0,
        notes: "",
        heldAt: 1,
      },
    ],
  },
});

const CURRENT = (version: number) =>
  JSON.stringify({
    version,
    state: {
      schema: version,
      items: [
        {
          uid: "new-1",
          productId: "p-new",
          productName: "Burger",
          basePrice: 1000,
          pickupPrice: null,
          deliveryPrice: null,
          unitPrice: 1000,
          quantity: 1,
          options: [],
          addOns: [],
          vatRate: 10,
        },
      ],
      orderType: "DINE_IN",
      tableLabel: "",
      customerId: null,
      discountTotal: 0,
      notes: "",
      heldOrders: [],
    },
  });

let saved: unknown;
beforeEach(() => {
  saved = (globalThis as { localStorage?: unknown }).localStorage;
});
afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = saved;
});

/** Fresh module registry per case, so `persist` hydrates against this stub. */
async function loadStoreWith(stored: string | null) {
  stubLocalStorage(stored === null ? {} : { "hibapos-cart": stored });
  // A cache-busting query keeps each case's `persist` hydration independent;
  // without it the second import returns the first one's already-hydrated store.
  const mod = await import(`@/store/cart-store?wiring=${Math.random()}`);
  // Hydration is scheduled, not synchronous, in some zustand versions.
  await (mod.useCartStore.persist?.rehydrate?.() ?? Promise.resolve());
  return mod as typeof import("@/store/cart-store");
}

describe("the version guard is wired into persist, not merely written (C-23)", () => {
  it("hydrates EMPTY from a euros-era cart that carries no version", async () => {
    const { useCartStore } = await loadStoreWith(EUROS_ERA);
    const s = useCartStore.getState();
    expect(s.items).toEqual([]);
    expect(s.heldOrders).toEqual([]);
    expect(s.discountTotal).toBe(0);
    expect(s.notes).toBe("");
    // The money defect, stated as money: 12,50 € must not arrive in a cent field.
    expect(s.items.some((i) => i.unitPrice === 12.5)).toBe(false);
  });

  it("hydrates a CURRENT-version cart intact — the over-discarding control", async () => {
    // Without this, a `migrate` that returned an empty cart unconditionally
    // would pass the case above and destroy every legitimate cart.
    const { useCartStore, CART_PERSIST_VERSION } = await loadStoreWith(
      CURRENT(1),
    );
    expect(CART_PERSIST_VERSION).toBe(1);
    const s = useCartStore.getState();
    expect(s.items).toHaveLength(1);
    expect(s.items[0].unitPrice).toBe(1000);
  });

  it("hydrates EMPTY from a version this build does not know", async () => {
    const { useCartStore } = await loadStoreWith(CURRENT(99));
    expect(useCartStore.getState().items).toEqual([]);
  });

  it("starts empty when nothing is stored at all", async () => {
    const { useCartStore } = await loadStoreWith(null);
    expect(useCartStore.getState().items).toEqual([]);
    expect(useCartStore.getState().heldOrders).toEqual([]);
  });

  it("ROUND TRIP: a cart this build wrote survives the next load", async () => {
    // THE OVER-DISCARDING CONTROL AT THE WIRING LEVEL, and it was added because
    // a revert exposed its absence: dropping the `schema` stamp from
    // `partialize` failed nothing, because every other fixture here supplies
    // the stamp itself. Without this case, a change that stopped stamping would
    // make each reload silently wipe the cashier's open ticket — the exact
    // opposite defect from the one the batch is closing, and a worse one.
    const map = stubLocalStorage();
    const first = await import(`@/store/cart-store?roundtrip-a=${Math.random()}`);
    first.useCartStore.getState().addItem({
      uid: "rt-1",
      productId: "p1",
      productName: "Burger",
      basePrice: 1000,
      pickupPrice: null,
      deliveryPrice: null,
      unitPrice: 1000,
      quantity: 1,
      options: [],
      addOns: [],
      vatRate: 10,
    });

    const written = map.get("hibapos-cart");
    expect(written).toBeTruthy();
    // It really did go through `partialize`, stamp and all.
    expect(JSON.parse(written!).state.schema).toBe(first.CART_PERSIST_VERSION);

    // A second load against the same storage is what a page reload is.
    const second = await loadStoreWith(written!);
    expect(second.useCartStore.getState().items).toHaveLength(1);
    expect(second.useCartStore.getState().items[0].unitPrice).toBe(1000);
  });
});
