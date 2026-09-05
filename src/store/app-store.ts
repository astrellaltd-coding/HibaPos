"use client";

import { create } from "zustand";
import type { UserDto } from "@/types/api";
import { api } from "@/lib/api-client";

export type AppView =
  | "home"
  | "dashboard"
  | "pos"
  | "orders"
  | "categories"
  | "products"
  | "addons"
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
  "addons", "media", "customers", "shifts", "reports", "fiscal", "users", "settings",
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

export const useAppStore = create<AppState>((set) => ({
  user: null,
  loadingUser: true,
  view: "home",
  posSearch: "",
  setUser: (user) => set({ user }),
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
    try {
      const res = await api.get<{ user: UserDto | null }>("/api/auth/me");
      set({ user: res.user, loadingUser: false });
    } catch {
      set({ user: null, loadingUser: false });
    }
  },
  logout: async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // ignore
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
