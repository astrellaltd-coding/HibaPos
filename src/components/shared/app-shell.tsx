"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Topbar } from "@/components/shared/topbar";
import { useAppStore } from "@/store/app-store";
import { useAutoLock } from "@/hooks/use-auto-lock";
import { HomeDashboard } from "@/components/shared/home-dashboard";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import dynamic from "next/dynamic";
import { ViewLoader } from "@/components/shared/view-loader";
import type { CategoryDto, ProductDto, Role } from "@/types/api";
import { canAccessView } from "@/components/shared/nav-config";
import { ShieldAlert } from "lucide-react";

const DashboardView = dynamic(
  () => import("@/features/dashboard/dashboard-view").then((m) => m.DashboardView),
  { loading: () => <ViewLoader label="Chargement du tableau de bord..." />, ssr: false }
);
const PosView = dynamic(
  () => import("@/features/catalog/pos-view").then((m) => m.PosView),
  { loading: () => <ViewLoader label="Chargement de la caisse..." />, ssr: false }
);
const OrdersView = dynamic(
  () => import("@/features/orders/orders-view").then((m) => m.OrdersView),
  { loading: () => <ViewLoader label="Chargement des commandes..." />, ssr: false }
);
const CategoriesView = dynamic(
  () => import("@/features/catalog/categories-view").then((m) => m.CategoriesView),
  { loading: () => <ViewLoader label="Chargement des catégories..." />, ssr: false }
);
const ProductsView = dynamic(
  () => import("@/features/catalog/products-view").then((m) => m.ProductsView),
  { loading: () => <ViewLoader label="Chargement des produits..." />, ssr: false }
);
const AddonsView = dynamic(
  () => import("@/features/catalog/addons-view").then((m) => m.AddonsView),
  { loading: () => <ViewLoader label="Chargement des suppléments..." />, ssr: false }
);
const MediaView = dynamic(
  () => import("@/features/media/media-view").then((m) => m.MediaView),
  { loading: () => <ViewLoader label="Chargement de la médiathèque..." />, ssr: false }
);
const CustomersView = dynamic(
  () => import("@/features/catalog/customers-view").then((m) => m.CustomersView),
  { loading: () => <ViewLoader label="Chargement des clients..." />, ssr: false }
);
const ShiftsView = dynamic(
  () => import("@/features/shifts/shifts-view").then((m) => m.ShiftsView),
  { loading: () => <ViewLoader label="Chargement des caisses..." />, ssr: false }
);
const ReportsView = dynamic(
  () => import("@/features/reports/reports-view").then((m) => m.ReportsView),
  { loading: () => <ViewLoader label="Chargement des rapports fiscaux..." />, ssr: false }
);
const FiscalView = dynamic(
  () => import("@/features/fiscal/fiscal-view").then((m) => m.FiscalView),
  { loading: () => <ViewLoader label="Chargement du module fiscal..." />, ssr: false }
);
const UsersView = dynamic(
  () => import("@/features/admin/users-view").then((m) => m.UsersView),
  { loading: () => <ViewLoader label="Chargement des utilisateurs..." />, ssr: false }
);
const SettingsView = dynamic(
  () => import("@/features/admin/settings-view").then((m) => m.SettingsView),
  { loading: () => <ViewLoader label="Chargement des paramètres..." />, ssr: false }
);
const AuditView = dynamic(
  () => import("@/features/admin/audit-view").then((m) => m.AuditView),
  { loading: () => <ViewLoader label="Chargement du journal d'audit..." />, ssr: false }
);
const BackupsView = dynamic(
  () => import("@/features/admin/backups-view").then((m) => m.BackupsView),
  { loading: () => <ViewLoader label="Chargement des sauvegardes..." />, ssr: false }
);
const LogsView = dynamic(
  () => import("@/features/admin/logs-view").then((m) => m.LogsView),
  { loading: () => <ViewLoader label="Chargement des logs système..." />, ssr: false }
);
const TablesView = dynamic(
  () => import("@/features/tables/tables-view").then((m) => m.TablesView),
  { loading: () => <ViewLoader label="Chargement du plan de salle..." />, ssr: false }
);
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Shown instead of a view the current role may not open (C-16, Batch 4.4).
 *
 *  A refusal rather than a redirect: sending the user to the home screen would
 *  look like the app losing their click, and it would hide the fact that the
 *  address they typed is gated. */
function AccessDenied() {
  const { setView } = useAppStore();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <ShieldAlert className="h-10 w-10 text-[var(--icon-warm)]" strokeWidth={1.8} />
      <div className="space-y-1">
        <p className="text-lg font-semibold">Accès refusé</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Votre compte n&apos;a pas les droits nécessaires pour ouvrir cette section.
        </p>
      </div>
      <Button variant="outline" onClick={() => setView("home")}>
        Retour à l&apos;accueil
      </Button>
    </div>
  );
}

export function AppShell() {
  const { view, user, setUser } = useAppStore();
  // C-16 (Batch 4.4). Recomputed on every render, so a role change through
  // switch-user takes effect immediately rather than at the next navigation.
  const viewAllowed = canAccessView(user?.role as Role | undefined, view);
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnSeconds, setWarnSeconds] = useState(30);
  const queryClient = useQueryClient();

  // Catalog prefetch (Phase 11c): warm the products + categories cache on
  // app mount so the POS grid renders instantly when the cashier navigates
  // to the caisse view (no loading spinner on first open).
  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: ["categories"],
      queryFn: () => api.get<CategoryDto[]>("/api/catalog/categories"),
    });
    void queryClient.prefetchQuery({
      queryKey: ["products", "all", true],
      queryFn: () => api.get<ProductDto[]>("/api/catalog/products?all=1"),
    });
  }, [queryClient]);

  useAutoLock(
    true,
    () => {
      setWarnOpen(false);
      setUser(null);
    },
    (s) => {
      setWarnSeconds(s);
      setWarnOpen(true);
    }
  );

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-full flex-col gap-3 overflow-hidden bg-[var(--shell-bg)] p-3">
        <Topbar />
        {view === "home" ? (
          <div className="no-scrollbar flex-1 overflow-hidden rounded-2xl">
            <HomeDashboard />
          </div>
        ) : (
          <main className="scroll-thin flex-1 overflow-y-auto rounded-2xl">
            {/* C-16 (Batch 4.4): every branch below used to render on `view ===`
                alone, so any hash typed into the URL mounted its view with live
                forms and buttons — `#/backups` included the database-restore
                button. `canAccessView` is now the single gate, and it fails
                closed: an unknown or not-yet-loaded role gets the least
                privilege. The check is here rather than in `initHashSync`
                because the hash is parsed before the session is known; this is
                the first point that has both. */}
            {!viewAllowed ? (
              <AccessDenied />
            ) : (
            <>
            {view === "pos" && <PosView />}
            {view === "dashboard" && <DashboardView />}
            {view === "orders" && <OrdersView />}
            {view === "tables" && <TablesView />}
            {view === "categories" && <CategoriesView />}
            {view === "products" && <ProductsView />}
            {view === "addons" && <AddonsView />}
            {view === "media" && <MediaView />}
            {view === "customers" && <CustomersView />}
            {view === "shifts" && <ShiftsView />}
            {view === "reports" && <ReportsView />}
            {view === "fiscal" && <FiscalView />}
            {view === "users" && <UsersView />}
            {view === "settings" && <SettingsView />}
            {view === "audit" && <AuditView />}
            {view === "backups" && <BackupsView />}
            {view === "logs" && <LogsView />}
            </>
            )}
          </main>
        )}

        {/* Idle warning dialog */}
        <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Verrouillage imminent</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Inactivité détectée. La session sera verrouillée dans{" "}
              <span className="font-semibold text-foreground">{warnSeconds}s</span>.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setWarnOpen(false)}>
                Rester connecté
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ErrorBoundary>
  );
}
