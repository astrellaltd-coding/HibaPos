"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { ShiftDto } from "@/types/api";
import { useAppStore, POS_SEARCH_INPUT_ID } from "@/store/app-store";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Lock, Unlock, LogOut, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NAV_ITEMS } from "@/components/shared/nav-config";
import { motion, AnimatePresence } from "framer-motion";

/* Burger logo mark (white line-art on orange tile). */
function BurgerMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white"
    >
      {/* top bun */}
      <path d="M5 9.6 C5 6.2 8 4.6 12 4.6 C16 4.6 19 6.2 19 9.6 Z" />
      {/* sesame seeds */}
      <path d="M9.4 7.1 l0.7 -0.4" />
      <path d="M12.3 6.5 l0.7 0.2" />
      <path d="M14.9 7.2 l0.7 -0.4" />
      {/* lettuce wave */}
      <path d="M4.5 12.2 q1.9 -1.7 3.8 0 q1.9 1.7 3.7 0 q1.9 -1.7 3.8 0 q1.9 1.7 3.7 0" />
      {/* patty */}
      <path d="M5 15 h14" />
      {/* bottom bun */}
      <path d="M6 17.6 h12 v0.7 a2.4 2.4 0 0 1 -2.4 2.4 H8.4 A2.4 2.4 0 0 1 6 18.3 Z" />
    </svg>
  );
}

/** Elapsed session time, "00:46:25" style. */
function useSessionTimer() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const hh = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function Topbar() {
  const { view, setView, user, logout, posSearch, setPosSearch } = useAppStore();
  const sessionTime = useSessionTimer();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isPOS = view === "pos";

  const { data: shift } = useQuery({
    queryKey: ["shift", "current"],
    queryFn: () => api.get<ShiftDto | null>("/api/shifts/current"),
    refetchInterval: 30_000,
  });

  const shiftOpen = !!shift;

  /* Resolve current module meta (null when on home) */
  const currentNav = view === "home" ? null : NAV_ITEMS.find((n) => n.view === view) ?? null;
  const ModuleIcon = currentNav?.icon ?? null;

  return (
    <header className="flex h-[68px] shrink-0 items-center justify-between gap-4 rounded-2xl bg-[var(--topbar-bg)] px-5 text-white shadow-lg">
      {/* Left: Logo + Brand (or module icon + name) */}
      <button
        onClick={() => setView("home")}
        className="flex items-center gap-3 outline-none transition-opacity hover:opacity-90"
      >
        {/* Icon tile — burger on home, module icon on sub-views */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--brand-from)] to-[var(--brand-to)] shadow-md transition-all duration-300">
          <AnimatePresence mode="wait">
            {ModuleIcon ? (
              <motion.div
                key="module-icon"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <ModuleIcon className="h-5 w-5 text-white" strokeWidth={1.8} />
              </motion.div>
            ) : (
              <motion.div
                key="burger-icon"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <BurgerMark />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Title — module name or HibaPOS */}
        <div className="text-left leading-tight transition-all duration-300">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
            >
              <h1 className="text-[15px] font-bold tracking-tight text-white">
                {currentNav ? currentNav.label : "HibaPOS"}
              </h1>
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/50">
                {currentNav ? "← Accueil" : "CAISSE RESTAURANT"}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </button>

      {/* Center: Search bar — only on POS */}
      {isPOS && (
        <div className="relative mx-4 flex max-w-sm flex-1 items-center">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            id={POS_SEARCH_INPUT_ID}
            ref={searchInputRef}
            value={posSearch}
            onChange={(e) => setPosSearch(e.target.value)}
            placeholder="Rechercher un produit…"
            className="h-9 w-full rounded-full border border-white/15 bg-white/10 pl-9 pr-8 text-sm text-white outline-none placeholder:text-white/40 transition-colors focus:border-white/30 focus:bg-white/15"
          />
          {posSearch && (
            <button
              onClick={() => setPosSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Right: Session timer, Shift, Notifications, User */}
      <div className="flex items-center gap-3">
        {/* Shift status */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setView("shifts")}
          className={cn(
            "hidden h-8 gap-1.5 rounded-full px-3 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white sm:flex",
            shiftOpen && "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
          )}
        >
          {shiftOpen ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {shiftOpen ? `Caisse #${shift?.number}` : "Caisse fermée"}
        </Button>

        {/* Session timer */}
        <span className="text-sm font-semibold tabular-nums tracking-wide text-white/90">
          {sessionTime}
        </span>

        {/* Lock / Logout */}
        <Button
          variant="ghost"
          size="icon"
          onClick={logout}
          aria-label="Se déconnecter"
          title="Se déconnecter"
          className="h-11 w-11 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Lock className="h-4 w-4" />
        </Button>

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 flex items-center gap-2.5 rounded-full px-2 py-1.5 text-left outline-none transition-colors hover:bg-white/10">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand-from)] to-[var(--brand-to)] text-sm font-bold text-white">
                {user?.name?.slice(0, 1).toUpperCase() ?? "U"}
              </div>
              <div className="hidden leading-tight md:block">
                <p className="text-xs font-bold text-white">{user?.name}</p>
                <p className="text-[10px] font-medium text-white/50">
                  {user?.role === "SUPER_ADMIN"
                    ? "Super Admin"
                    : user?.role === "MANAGER"
                      ? "Gérant"
                      : "Caissier"}
                </p>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-white/40" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="leading-tight">
              <p className="text-sm font-semibold">{user?.name}</p>
              <p className="text-xs font-normal text-muted-foreground">@{user?.username}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="text-red-600 focus:text-red-600"
            >
              <LogOut className="h-4 w-4" />
              Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
