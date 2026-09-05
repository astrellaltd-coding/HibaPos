import type { AppView } from "@/store/app-store";
import type { Role } from "@/types/api";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ScanLine,
  ReceiptText,
  FolderTree,
  Package,
  PlusCircle,
  Images,
  Users,
  Clock,
  BarChart3,
  UserCog,
  Settings,
  ScrollText,
  DatabaseBackup,
  Terminal,
  ShieldCheck,
} from "lucide-react";

export type NavItem = {
  view: AppView;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  group: "caisse" | "catalogue" | "gestion" | "systeme";
};

export const NAV_ITEMS: NavItem[] = [
  { view: "pos", label: "Caisse", icon: ScanLine, roles: ["SUPER_ADMIN", "MANAGER"], group: "caisse" },
  { view: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, roles: ["SUPER_ADMIN", "MANAGER"], group: "caisse" },
  { view: "orders", label: "Commandes", icon: ReceiptText, roles: ["SUPER_ADMIN", "MANAGER"], group: "caisse" },
  // C-21 / DD-09 (Batch 5.2, 2026-09-05): the "tables" row stood here and was
  // REMOVED. This restaurant does not serve at tables, so the floor plan is
  // withdrawn rather than wired in. This removal is the gate: `canAccessView`
  // refuses a view with no row (`if (!item) return false`), the sidebar reads
  // this array, and `home-dashboard.tsx` filters its own module list against
  // it — so one deleted row closes all three. What deliberately STAYS is
  // server-side and unused: the `Table` model, `/api/tables*`, the checkout
  // auto-link (`checkout.ts:202`) and the refund release (`refund.ts:131`).
  { view: "shifts", label: "Caisses (shifts)", icon: Clock, roles: ["SUPER_ADMIN", "MANAGER"], group: "caisse" },

  { view: "categories", label: "Catégories", icon: FolderTree, roles: ["SUPER_ADMIN", "MANAGER"], group: "catalogue" },
  { view: "products", label: "Produits", icon: Package, roles: ["SUPER_ADMIN", "MANAGER"], group: "catalogue" },
  { view: "addons", label: "Suppléments", icon: PlusCircle, roles: ["SUPER_ADMIN", "MANAGER"], group: "catalogue" },
  { view: "media", label: "Médiathèque", icon: Images, roles: ["SUPER_ADMIN", "MANAGER"], group: "catalogue" },
  { view: "customers", label: "Clients", icon: Users, roles: ["SUPER_ADMIN", "MANAGER"], group: "catalogue" },

  { view: "reports", label: "Rapports", icon: BarChart3, roles: ["SUPER_ADMIN", "MANAGER"], group: "gestion" },
  // C-27 (Batch 3.4): the fiscal surface had no nav entry at all, so every
  // /api/fiscal/* endpoint was unreachable from the application.
  { view: "fiscal", label: "Fiscal (JFP)", icon: ShieldCheck, roles: ["SUPER_ADMIN", "MANAGER"], group: "gestion" },
  { view: "users", label: "Utilisateurs", icon: UserCog, roles: ["SUPER_ADMIN"], group: "gestion" },
  // DD-07 (2026-09-04): opened to MANAGER. The restaurant's only operator is
  // a MANAGER, and Réglages is where the printer IP and name, the receipt
  // width and the SIRET / TVA number are configured — the plan still carries
  // an operator action to correct `printerName` there. Nothing in it is
  // destructive. It does hold the FACTICE switch (Batch 3.1b), which is why
  // that switch announces itself in amber and stamps every ticket.
  { view: "settings", label: "Paramètres", icon: Settings, roles: ["SUPER_ADMIN", "MANAGER"], group: "gestion" },

  // DD-07 (2026-09-04): opened to MANAGER. Read-only, and it is where a
  // question about a void or a refund gets answered.
  { view: "audit", label: "Journal d'audit", icon: ScrollText, roles: ["SUPER_ADMIN", "MANAGER"], group: "systeme" },
  // Deliberately NOT opened to MANAGER (DD-07, 2026-09-04): this view holds
  // the RESTORE button, which overwrites the live database. Backups already
  // run automatically at the Z close (Batch 2.2), so the manager gains
  // nothing — while anyone reaching an unattended till would gain the most
  // destructive control in the product.
  { view: "backups", label: "Sauvegardes", icon: DatabaseBackup, roles: ["SUPER_ADMIN"], group: "systeme" },
  { view: "logs", label: "Logs techniques", icon: Terminal, roles: ["SUPER_ADMIN"], group: "systeme" },
];

/** The least-privileged role, used wherever a role cannot be determined.
 *
 *  C-16 (Batch 4.4): `home-dashboard.tsx` defaulted an unknown role to
 *  `MANAGER`, so a failure to load the user failed **open**. Every such
 *  default now resolves here instead.
 *
 *  Batch 4.4b degraded this floor by exactly one rung. DD-07's final answer
 *  removed `CASHIER` from the product, so `MANAGER` is the least-privileged
 *  role that exists. The default is therefore weaker than it was and is
 *  still meaningfully closed: a caller that falls to it cannot reach `users`,
 *  `backups` or `logs`. Adding a role below MANAGER means changing this
 *  constant, not just the enum. */
export const LEAST_PRIVILEGED_ROLE: Role = "MANAGER";

/** May this role open this view?
 *
 *  C-16 (Batch 4.4): role filtering existed in exactly one place — the home
 *  dashboard's module list — while `app-shell.tsx` rendered on `view ===`
 *  with no role condition and `initHashSync` accepted any of the valid
 *  hashes. So typing `#/backups` mounted the view, live buttons and all,
 *  including database restore. The server side held on every sensitive
 *  mutation, which is why this was exposure rather than compromise; it is
 *  still the difference between a locked door and a sign asking politely.
 *
 *  This is the single authority: the nav table decides, the shell obeys, and
 *  an unknown or missing role gets the least privilege rather than the most. */
export function canAccessView(role: Role | null | undefined, view: AppView): boolean {
  if (view === "home") return true; // the landing page filters its own cards
  const effective: Role = role ?? LEAST_PRIVILEGED_ROLE;
  const item = NAV_ITEMS.find((n) => n.view === view);
  if (!item) return false; // unknown view — refuse rather than guess
  return item.roles.includes(effective);
}

export const GROUP_LABELS: Record<NavItem["group"], string> = {
  caisse: "Caisse",
  catalogue: "Catalogue",
  gestion: "Gestion",
  systeme: "Système",
};
