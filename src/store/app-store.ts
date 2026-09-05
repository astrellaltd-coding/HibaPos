"use client";

import { create } from "zustand";
import type { UserDto } from "@/types/api";
import { api } from "@/lib/api-client";
import { useCartStore } from "@/store/cart-store";

export type AppView =
  | "home"
  | "dashboard"
  | "pos"
  | "orders"
  | "categories"
  | "products"
  | "media"
  | "customers"
  | "shifts"
  | "reports"
  | "fiscal"
  | "users"
  | "settings"
  | "audit"
  | "backups"
  | "logs";

/** Every hash the address bar may resolve to a view.
 *
 *  C-21 / DD-09 (Batch 5.2): `"tables"` was removed from here and from
 *  `AppView` above. Dropping the nav row alone would already refuse the view —
 *  `canAccessView` returns false for a view with no row — but it would refuse
 *  it as *Accès refusé*, which says the address is gated when in fact the
 *  screen no longer exists. Removing the view from the union instead makes the
 *  compiler carry the withdrawal into `app-shell.tsx` and
 *  `home-dashboard.tsx`, and makes `#/tables` an unrecognised hash like any
 *  other. */
const VALID_VIEWS: AppView[] = [
  "home", "dashboard", "pos", "orders", "categories", "products",
  "media", "customers", "shifts", "reports", "fiscal", "users", "settings",
  "audit", "backups", "logs",
];

/** Map a URL hash (e.g. "#/pos", "#/orders", "#/", "") to an AppView.
 *  Returns null for unrecognized hashes (no view change).
 *
 *  Exported for `nav-access.test.ts` only: `initHashSync` needs a `window`,
 *  which `bun test` does not provide, and this is the pure half of it. Same
 *  reason Batch 5.1 extracted `matchesShortcut`. */
export function hashToView(hash: string): AppView | null {
  const clean = hash.replace(/^#\/?/, "").split("?")[0] as AppView;
  if (!clean || clean === "home") return "home";
  return VALID_VIEWS.includes(clean) ? clean : null;
}

/** Map an AppView to its URL hash. */
function viewToHash(view: AppView): string {
  return view === "home" ? "#/" : `#/${view}`;
}

/**
 * DOM id of the POS search box.
 *
 * Batch 5.1: the input lives in the topbar (it is only rendered on the POS
 * view) while the F1 and "/" shortcuts are registered in pos-view. Those two
 * are in different component trees with no shared ref, and pos-view's own
 * `searchInputRef` was never attached to anything — so `focusSearch()` was a
 * no-op even once the matcher started firing. Both sides import this constant,
 * which is what keeps them in step.
 */
export const POS_SEARCH_INPUT_ID = "pos-search-input";

/**
 * Did the person at the till change? (C-23, Batch 5.4.)
 *
 * Not "did `user` change" — that fires on the ordinary page refresh, where the
 * store starts at `null` and `fetchUser()` fills it back in with the same
 * person. Clearing there would throw away the in-progress sale that persistence
 * exists to protect. What must clear is a change of IDENTITY:
 *
 *   null → someone   the refresh / first load. Keep the cart.
 *   someone → null   logout, or the auto-lock. Clear it.
 *   A → B            a different operator. Clear it.
 *   A → A            re-fetch of the same session. Keep it.
 *
 * The lock arm is not theoretical: `POST /api/auth/unlock` takes a username and
 * a PIN like the login route does, and the client's lock path just sets the user
 * to null and shows the profile picker — so whoever comes back may be someone
 * else. Pure and exported so the four cases above are tested directly.
 */
export function operatorChanged(prev: UserDto | null, next: UserDto | null): boolean {
  if (prev === null) return false;
  if (next === null) return true;
  return prev.id !== next.id;
}

type AppState = {
  user: UserDto | null;
  loadingUser: boolean;
  view: AppView;
  posSearch: string;
  setUser: (u: UserDto | null) => void;
  setLoadingUser: (v: boolean) => void;
  setView: (v: AppView) => void;
  setPosSearch: (q: string) => void;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
};

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  loadingUser: true,
  view: "home",
  posSearch: "",
  setUser: (user) => {
    // C-23 (Batch 5.4). The single choke point: the auto-lock sets the user to
    // null through here, `logout` below goes through the same guard, and a
    // future switch-user has to as well. Deciding it here rather than at each
    // caller is the point — the defect was that one caller (`logout`) did not
    // know it had to.
    if (operatorChanged(get().user, user)) {
      useCartStore.getState().clearForOperatorChange();
    }
    set({ user });
  },
  setLoadingUser: (loadingUser) => set({ loadingUser }),
  setView: (view) => {
    set({ view, posSearch: "" });
    // Sync the URL hash for back-button support + deep-linking (#/pos, #/orders…).
    // No loop risk: the hashchange listener sets the same view → Zustand no-op.
    if (typeof window !== "undefined") {
      const newHash = viewToHash(view);
      if (window.location.hash !== newHash && window.location.hash !== newHash.slice(1)) {
        window.location.hash = newHash;
      }
    }
  },
  setPosSearch: (posSearch) => set({ posSearch }),
  fetchUser: async () => {
    // C-23 (Batch 5.4). This sets the user with a bare `set()` and so bypassed
    // `setUser` — the same way `logout` did, and the reason the guard is stated
    // once and called from each. Both arms below can END a session: the server
    // answers `{ user: null }` when the cookie has expired or been revoked, and
    // the catch runs when the request fails outright. Either leaves the login
    // screen in front of whoever is standing there, so the cart must not be
    // waiting for them. Found by walking the app rather than by reading it.
    let next: UserDto | null = null;
    try {
      const res = await api.get<{ user: UserDto | null }>("/api/auth/me");
      next = res.user;
    } catch {
      next = null;
    }
    if (operatorChanged(get().user, next)) {
      useCartStore.getState().clearForOperatorChange();
    }
    set({ user: next, loadingUser: false });
  },
  logout: async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // ignore
    }
    if (operatorChanged(get().user, null)) {
      useCartStore.getState().clearForOperatorChange();
    }
    set({ user: null, view: "home" });
    if (typeof window !== "undefined" && window.location.hash !== "#/" && window.location.hash !== "") {
      window.location.hash = "#/";
    }
  },
}));

/** Initialize URL-hash ↔ view synchronization. Call ONCE on app mount
 *  (e.g. in page.tsx useEffect). Reads the initial hash (deep-link support:
 *  navigating to /#/pos lands on the POS view after login) and registers a
 *  `hashchange` listener so the browser back/forward buttons navigate views.
 *  Returns a cleanup function for the useEffect. */
export function initHashSync(): () => void {
  if (typeof window === "undefined") return () => {};

  // 1. Deep-link: read the initial hash and set the view.
  const initial = hashToView(window.location.hash);
  if (initial && initial !== "home") {
    useAppStore.setState({ view: initial });
  }

  // 2. Back/forward button: hashchange → update the view.
  const onHashChange = () => {
    const view = hashToView(window.location.hash);
    if (view) {
      useAppStore.setState({ view, posSearch: "" });
    }
  };
  window.addEventListener("hashchange", onHashChange);

  return () => window.removeEventListener("hashchange", onHashChange);
}
