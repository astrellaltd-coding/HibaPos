"use client";

import { useEffect } from "react";
import { useAppStore, initHashSync } from "@/store/app-store";
import { LoginScreen } from "@/features/auth/login-screen";
import { AppShell } from "@/components/shared/app-shell";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { user, loadingUser, fetchUser } = useAppStore();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // URL-hash ↔ view sync: deep-link support (#/pos lands on POS after login)
  // + browser back/forward buttons navigate views. Mounted once for the
  // lifetime of the SPA (LoginScreen and AppShell both benefit).
  useEffect(() => {
    return initHashSync();
  }, []);

  if (loadingUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Chargement d'HibaPOS…</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginScreen />;
  return <AppShell />;
}
