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
  Grid3x3,
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
  { view: "pos", label: "Caisse", icon: ScanLine, roles: ["SUPER_ADMIN", "MANAGER", "CASHIER"], group: "caisse" },
  { view: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, roles: ["SUPER_ADMIN", "MANAGER"], group: "caisse" },
  { view: "orders", label: "Commandes", icon: ReceiptText, roles: ["SUPER_ADMIN", "MANAGER", "CASHIER"], group: "caisse" },
  { view: "tables", label: "Tables", icon: Grid3x3, roles: ["SUPER_ADMIN", "MANAGER", "CASHIER"], group: "caisse" },
  { view: "shifts", label: "Caisses (shifts)", icon: Clock, roles: ["SUPER_ADMIN", "MANAGER", "CASHIER"], group: "caisse" },

  { view: "categories", label: "Catégories", icon: FolderTree, roles: ["SUPER_ADMIN", "MANAGER"], group: "catalogue" },
  { view: "products", label: "Produits", icon: Package, roles: ["SUPER_ADMIN", "MANAGER"], group: "catalogue" },
  { view: "addons", label: "Suppléments", icon: PlusCircle, roles: ["SUPER_ADMIN", "MANAGER"], group: "catalogue" },
  { view: "media", label: "Médiathèque", icon: Images, roles: ["SUPER_ADMIN", "MANAGER"], group: "catalogue" },
  { view: "customers", label: "Clients", icon: Users, roles: ["SUPER_ADMIN", "MANAGER", "CASHIER"], group: "catalogue" },

  { view: "reports", label: "Rapports", icon: BarChart3, roles: ["SUPER_ADMIN", "MANAGER"], group: "gestion" },
  // C-27 (Batch 3.4): the fiscal surface had no nav entry at all, so every
  // /api/fiscal/* endpoint was unreachable from the application.
  { view: "fiscal", label: "Fiscal (JFP)", icon: ShieldCheck, roles: ["SUPER_ADMIN", "MANAGER"], group: "gestion" },
  { view: "users", label: "Utilisateurs", icon: UserCog, roles: ["SUPER_ADMIN"], group: "gestion" },
  { view: "settings", label: "Paramètres", icon: Settings, roles: ["SUPER_ADMIN"], group: "gestion" },

  { view: "audit", label: "Journal d'audit", icon: ScrollText, roles: ["SUPER_ADMIN"], group: "systeme" },
  { view: "backups", label: "Sauvegardes", icon: DatabaseBackup, roles: ["SUPER_ADMIN"], group: "systeme" },
  { view: "logs", label: "Logs techniques", icon: Terminal, roles: ["SUPER_ADMIN"], group: "systeme" },
];

export const GROUP_LABELS: Record<NavItem["group"], string> = {
  caisse: "Caisse",
  catalogue: "Catalogue",
  gestion: "Gestion",
  systeme: "Système",
};
