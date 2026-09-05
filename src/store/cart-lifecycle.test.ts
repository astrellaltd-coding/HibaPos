import { describe, it, expect, beforeEach } from "vitest";
import {
  useCartStore,
  vetPersistedCart,
  CART_PERSIST_VERSION,
  type CartItem,
  type HeldOrder,
} from "@/store/cart-store";
import { useAppStore, operatorChanged } from "@/store/app-store";
import type { UserDto } from "@/types/api";

// C-23 (Batch 5.4) — held orders and cart lifecycle.
//
// DD-11 (operator, 2026-09-05): this restaurant runs ONE till, so held orders
// stay device-local. No server model, no new API, no migration — which leaves
// the two halves of C-23 that were never a design question:
//
//   1. NOTHING cleared the cart when the person at the till changed.
//      `app-store.ts` set `user: null` and did not touch it, so cashier B
//      inherited cashier A's open ticket AND A's parked tickets, and rang them
//      under B's name. `clear()` is called from exactly two places — a
//      successful checkout and the "Vider" button — and neither is a logout.
//
//   2. The persisted cart had NO `version` and NO `migrate`. Everything
//      written before the euros→cents migration (`720660a`) held euros in the
//      same field names, so it rehydrated silently and wrongly: 12,50 € comes
//      back as `unitPrice: 12.5` and is read as twelve cents. This is the half
//      that corrupts a sale rather than merely leaking one.
//
// The lock arm of (1) is not theoretical. `POST /api/auth/unlock` takes a
// username and a PIN exactly as the login route does, and the client's lock
// path sets the user to null and shows the profile picker — so whoever comes
// back from a lock may be a different person.

const alice: UserDto = {
  id: "u-alice",
  username: "alice",
  name: "Alice",
  role: "MANAGER",
  active: true,
  createdAt: new Date().toISOString(),
} as UserDto;

const bob: UserDto = { ...alice, id: "u-bob", username: "bob", name: "Bob" };

function line(overrides: Partial<CartItem> = {}): CartItem {
  return {
    uid: "l1",
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
    ...overrides,
  };
}

function held(id = "h1"): HeldOrder {
  return {
    id,
    label: "Commande 1",
    items: [line()],
    orderType: "DINE_IN",
    tableLabel: "",
    customerId: null,
    discountTotal: 0,
    notes: "",
    heldAt: Date.now(),
  };
}

/** A cart mid-sale, with a ticket parked beside it. */
function seedCart() {
  useCartStore.setState({
    items: [line()],
    orderType: "TAKEAWAY",
    tableLabel: "",
    customerId: "c1",
    discountTotal: 250,
    notes: "sans oignons",
    heldOrders: [held()],
  });
}

beforeEach(() => {
  useCartStore.getState().clearForOperatorChange();
  useAppStore.setState({ user: null, view: "home" });
});

describe("operatorChanged — which transitions are a change of person (C-23)", () => {
  it("is FALSE from null, which is the ordinary page refresh", () => {
    // The regression that guards the feature persistence exists for: on a
    // reload the store starts empty and `fetchUser()` fills the same person
    // back in. Treating that as a change would discard the sale being rung.
    expect(operatorChanged(null, alice)).toBe(false);
  });

  it("is TRUE to null — logout, and the auto-lock", () => {
    expect(operatorChanged(alice, null)).toBe(true);
  });

  it("is TRUE between two different people", () => {
    expect(operatorChanged(alice, bob)).toBe(true);
  });

  it("is FALSE for the same person re-fetched", () => {
    expect(operatorChanged(alice, { ...alice })).toBe(false);
  });

  it("compares the id, not the object", () => {
    // `fetchUser` builds a fresh object every call, so identity by reference
    // would report a change on every poll and empty the cart under the cashier.
    expect(operatorChanged(alice, { ...alice, name: "Alice (renamed)" })).toBe(false);
  });
});

describe("the cart empties when the operator changes (C-23)", () => {
  it("clears the sale AND the parked tickets when the user goes to null", () => {
    seedCart();
    useAppStore.getState().setUser(alice);
    // Sanity: arriving from null must not have emptied anything.
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().heldOrders).toHaveLength(1);

    useAppStore.getState().setUser(null); // the auto-lock path
    expect(useCartStore.getState().items).toEqual([]);
    expect(useCartStore.getState().heldOrders).toEqual([]);
  });

  it("clears when a different cashier takes over", () => {
    useAppStore.getState().setUser(alice);
    seedCart();
    useAppStore.getState().setUser(bob);
    expect(useCartStore.getState().items).toEqual([]);
    expect(useCartStore.getState().heldOrders).toEqual([]);
  });

  it("resets the whole sale, not only its lines", () => {
    // The fields that would otherwise follow the ticket into the next
    // operator's first sale: the customer, the discount, the notes and the
    // order type — the last of which reprices every line.
    useAppStore.getState().setUser(alice);
    seedCart();
    useAppStore.getState().setUser(bob);
    const s = useCartStore.getState();
    expect(s.orderType).toBe("DINE_IN");
    expect(s.customerId).toBeNull();
    expect(s.discountTotal).toBe(0);
    expect(s.notes).toBe("");
    expect(s.tableLabel).toBe("");
  });

  it("KEEPS the cart when the same person is re-fetched", () => {
    useAppStore.getState().setUser(alice);
    seedCart();
    useAppStore.getState().setUser({ ...alice });
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().heldOrders).toHaveLength(1);
  });

  it("KEEPS the cart across a page refresh — the behaviour persistence is for", () => {
    // THE OVER-CLEARING CONTROL. A `setUser` that emptied the cart every time
    // would satisfy every other test in this block; this is the one it fails.
    seedCart();
    useAppStore.setState({ user: null }); // fresh page: store starts empty
    useAppStore.getState().setUser(alice); // fetchUser() resolves
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().heldOrders).toHaveLength(1);
  });

  it("clears when the server says the session is over", async () => {
    // `fetchUser()` also sets the user with a bare `set()`, so it bypassed the
    // guard exactly as `logout` did. An expired or revoked cookie makes the
    // server answer `{ user: null }`, which leaves the login screen in front of
    // whoever is standing at the till — so the cart must not be waiting.
    //
    // Found by walking the app, not by reading it: the walkthrough could not
    // get past the login screen, which is what made this path worth following.
    //
    // ── AMENDED BY M-21 (Batch 5.7d), AND INVERTED RATHER THAN DELETED ──────
    // This case used to rely on "no server in a test: the catch takes it" and
    // asserted that ANY failure ended the session. That is the behaviour M-21
    // identifies as the defect — a transient blip is not a sign-out, and
    // treating it as one destroyed the very cart this file protects. So the
    // trigger moved from "the request failed" to "the server said so", which
    // is what the case was always about, and the old trigger is asserted
    // directly below as its opposite.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ user: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    try {
      useAppStore.getState().setUser(alice);
      seedCart();
      await useAppStore.getState().fetchUser();
      expect(useAppStore.getState().user).toBeNull();
      expect(useCartStore.getState().items).toEqual([]);
      expect(useCartStore.getState().heldOrders).toEqual([]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("KEEPS the cart when the request merely FAILS — M-21", async () => {
    // The inversion, and the money half of M-21. There is no server in a test,
    // so `fetchUser`'s catch runs — which is exactly a transient blip. Before
    // Batch 5.7d this ended the session and cleared the basket; the sale in
    // progress was gone and the queue was still there.
    useAppStore.getState().setUser(alice);
    seedCart();
    await useAppStore.getState().fetchUser();
    expect(useAppStore.getState().user).toEqual(alice);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().heldOrders).toHaveLength(1);
  });

  it("clears on logout, which does not go through setUser", async () => {
    // `logout()` sets `user: null` and `view: "home"` in one call of its own,
    // so it bypasses `setUser` entirely — which is exactly how the defect
    // survived. It calls the same guard.
    //
    // Awaited, because it is async: it posts to the API first and ignores the
    // failure, and in a test there is no server, so the catch takes it and the
    // state change proceeds on the next microtask.
    useAppStore.getState().setUser(alice);
    seedCart();
    await useAppStore.getState().logout();
    expect(useCartStore.getState().items).toEqual([]);
    expect(useCartStore.getState().heldOrders).toEqual([]);
  });
});

describe("clear() and clearForOperatorChange() are different, on purpose (C-23)", () => {
  it("clear() ends a SALE and leaves the parked tickets alone", () => {
    // Called on a successful checkout and by the « Vider » button. Dropping
    // held tickets here would lose a parked order on every completed sale.
    seedCart();
    useCartStore.getState().clear();
    expect(useCartStore.getState().items).toEqual([]);
    expect(useCartStore.getState().heldOrders).toHaveLength(1);
  });

  it("clearForOperatorChange() ends an OPERATOR and takes the tickets too", () => {
    seedCart();
    useCartStore.getState().clearForOperatorChange();
    expect(useCartStore.getState().items).toEqual([]);
    expect(useCartStore.getState().heldOrders).toEqual([]);
  });
});

describe("the persisted-cart vetting (C-23)", () => {
  // The stamp lives INSIDE the payload, because zustand's own `version` never
  // reaches a cart that has no version key — the case C-23 actually names. See
  // `vetPersistedCart`'s docstring and `cart-persist-wiring.test.ts`.
  const goodPayload = {
    schema: CART_PERSIST_VERSION,
    items: [line()],
    orderType: "DINE_IN" as const,
    tableLabel: "",
    customerId: null,
    discountTotal: 0,
    notes: "",
    heldOrders: [held()],
  };

  it("keeps a payload stamped with the current schema", () => {
    // THE OVER-DISCARDING CONTROL: vetting that returned an empty cart for
    // everything would satisfy every other test here.
    const out = vetPersistedCart(goodPayload);
    expect(out.items).toHaveLength(1);
    expect(out.heldOrders).toHaveLength(1);
    expect(out.discountTotal).toBe(0);
  });

  it("DISCARDS an unstamped cart — the euros-era shape", () => {
    // What `720660a` left behind: the same field names holding euros, and no
    // version of any kind anywhere in the payload.
    const { schema: _drop, ...unstamped } = goodPayload;
    void _drop;
    const out = vetPersistedCart({
      ...unstamped,
      items: [line({ basePrice: 12.5, unitPrice: 12.5 })],
      discountTotal: 2.5,
    });
    expect(out.items).toEqual([]);
    expect(out.heldOrders).toEqual([]);
    expect(out.discountTotal).toBe(0);
  });

  it("does not rehydrate a euro price into a cent field", () => {
    // Stated as the money defect rather than as a version number: 12,50 €
    // surviving into `unitPrice` is a line rung at twelve cents.
    const { schema: _drop, ...unstamped } = goodPayload;
    void _drop;
    const out = vetPersistedCart({ ...unstamped, items: [line({ unitPrice: 12.5 })] });
    expect(out.items.some((i: CartItem) => i.unitPrice === 12.5)).toBe(false);
  });

  it("DISCARDS a schema from the future", () => {
    // Downgrade after an update: a payload this build cannot read must not be
    // half-interpreted.
    expect(vetPersistedCart({ ...goodPayload, schema: CART_PERSIST_VERSION + 1 }).items).toEqual([]);
  });

  it("DISCARDS a structurally wrong payload at the right schema", () => {
    // The stamp says what the UNITS are, not that the payload is intact.
    expect(vetPersistedCart({ ...goodPayload, items: "nope" }).items).toEqual([]);
    expect(vetPersistedCart({ ...goodPayload, heldOrders: null }).heldOrders).toEqual([]);
    expect(vetPersistedCart(null).items).toEqual([]);
    expect(vetPersistedCart("garbage").items).toEqual([]);
  });

  it("fills in a field the payload is missing rather than returning undefined", () => {
    const out = vetPersistedCart({ schema: CART_PERSIST_VERSION, items: [line()], heldOrders: [] });
    expect(out.orderType).toBe("DINE_IN");
    expect(out.notes).toBe("");
    expect(out.customerId).toBeNull();
  });

  it("returns a fresh object each time, never the shared empty", () => {
    // A returned singleton would be mutated by the first cashier's next
    // keystroke and hand the mutation to the next discard.
    const a = vetPersistedCart(null);
    const b = vetPersistedCart(null);
    a.items.push(line());
    expect(b.items).toEqual([]);
  });
});
