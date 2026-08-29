"use client";

import { create } from "zustand";
import type { UserDto } from "@/types/api";
import { api } from "@/lib/api-client";

export type AppView =
  | "home"
  | "dashboard"
  | "pos"
  | "orders"
  | "tables"
  | "categories"
  | "products"
  | "addons"
  | "media"
  | "customers"
  | "shifts"
  | "reports"
  | "users"
  | "settings"
  | "audit"
  | "backups"
  | "logs";

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
  setView: (view) => set({ view, posSearch: "" }),
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
  },
}));
