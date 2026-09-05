"use client";

import { useAppStore, type AppView } from "@/store/app-store";
import { NAV_ITEMS, LEAST_PRIVILEGED_ROLE } from "@/components/shared/nav-config";
import type { Role } from "@/types/api";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Pizza,
  Folder,
  Images,
  Users,
  BarChart3,
  UserCog,
  Settings,
  DatabaseBackup,
  FileText,
  Grid3x3,
  Clock,
  ScrollText,
  ShieldCheck,
  ArrowRight,
  Zap,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Quick-access metadata (exact order of the design)                  */
/* ------------------------------------------------------------------ */
const QUICK_ACCESS: {
  view: AppView;
  title: string;
  image: string;
}[] = [
  { view: "pos", title: "Caisse", image: "/home-cards/caisse.png" },
  { view: "dashboard", title: "Tableau de bord", image: "/home-cards/tableau-de-bord.png" },
  { view: "orders", title: "Commandes", image: "/home-cards/commandes.png" },
];

/* ------------------------------------------------------------------ */
/*  Module metadata — label / description / icon per view              */
/*  (order matches the design; extra app modules appended at the end)  */
/* ------------------------------------------------------------------ */
const MODULE_META: Partial<
  Record<AppView, { label: string; subtitle: string; icon: LucideIcon; image?: string }>
> = {
  products: { label: "Produits", subtitle: "Gestion des produits", icon: Pizza, image: "/home-cards/produits.png" },
  categories: { label: "Catégories", subtitle: "Organisation catalogue", icon: Folder, image: "/home-cards/categories.png" },
  media: { label: "Médiathèque", subtitle: "Images & médias", icon: Images, image: "/home-cards/supplements.png" },
  customers: { label: "Clients", subtitle: "Base de clientèle", icon: Users, image: "/home-cards/clients.png" },
  reports: { label: "Rapports", subtitle: "Analyses & rapports", icon: BarChart3, image: "/home-cards/rapports.png" },
  // C-27 (Batch 3.4). The home grid keeps its OWN module list, so adding the
  // nav entry alone left the fiscal module reachable from the sidebar but not
  // from the screen operators actually start on. Role filtering below reads
  // NAV_ITEMS, so the MANAGER+ gate applies here too. No card image yet — the
  // renderer falls back to the icon.
  fiscal: { label: "Fiscal", subtitle: "Journal, clôtures & archives", icon: ShieldCheck },
  users: { label: "Utilisateurs", subtitle: "Gestion des accès", icon: UserCog, image: "/home-cards/utilisateurs.png" },
  settings: { label: "Paramètres", subtitle: "Configuration", icon: Settings, image: "/home-cards/parametres.png" },
  backups: { label: "Sauvegardes", subtitle: "Données & sauvegarde", icon: DatabaseBackup, image: "/home-cards/sauvegardes.png" },
  logs: { label: "Journaux", subtitle: "Logs techniques", icon: FileText, image: "/home-cards/journaux.png" },
  shifts: { label: "Caisses", subtitle: "Gestion des shifts", icon: Clock, image: "/home-cards/shifts.png" },
  audit: { label: "Audit", subtitle: "Journal d'audit", icon: ScrollText, image: "/home-cards/audit.png" },
};

const MODULE_ORDER: AppView[] = [
  "products",
  "categories",
  "media",
  "customers",
  "reports",
  "fiscal",
  "users",
  "settings",
  "backups",
  "logs",
  // C-21 / DD-09 (Batch 5.2): the "tables" entry stood here and in
  // MODULE_META above. The filter below reads NAV_ITEMS, so deleting the nav
  // row alone would already have dropped the card — but MODULE_ORDER is
  // `AppView[]`, so removing the view from the union makes this a compile
  // error rather than a silently dead entry. C-27's lesson was that this list
  // is separate from the nav table; that cuts both ways.
  "shifts",
  "audit",
];

/* ------------------------------------------------------------------ */
/*  Section label                                                      */
/* ------------------------------------------------------------------ */
function SectionLabel({
  icon: Icon,
  label,
  className,
}: {
  icon: LucideIcon;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center gap-2", className)}>
      <Icon className="h-4 w-4 text-[var(--heading-warm)]" strokeWidth={2.2} />
      <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--heading-warm)]">
        {label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick-access card (icon in peach rounded-square, centered)         */
/* ------------------------------------------------------------------ */
function QuickCard({
  item,
  onClick,
}: {
  item: (typeof QUICK_ACCESS)[number];
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="pos-card flex h-full w-full flex-col items-center justify-center gap-3 px-5 py-4 text-center"
    >
      <img src={item.image} alt="" className="h-[116px] w-[116px] object-contain" />
      <p className="text-[15px] font-bold text-[var(--heading-warm)]">{item.title}</p>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/*  Module card — premium redesign matching hero visual language       */
/* ------------------------------------------------------------------ */
function ModuleCard({
  view,
  onClick,
}: {
  view: AppView;
  onClick: () => void;
}) {
  const meta = MODULE_META[view];
  if (!meta) return null;
  const Icon = meta.icon;

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="module-card group relative flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden p-5 text-center"
    >
      {/* ── Decorative background blobs ── */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(232,145,45,0.035) 0%, transparent 70%)",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-5 -left-5 h-24 w-24 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(200,120,60,0.03) 0%, transparent 70%)",
        }}
      />

      {/* ── Icon area with radial glow ── */}
      <div className="relative flex items-center justify-center">
        {/* Radial glow behind icon */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(232,145,45,0.14) 0%, rgba(232,145,45,0.04) 50%, transparent 72%)",
            transform: "scale(1.6)",
          }}
        />
        {meta.image ? (
          <img
            src={meta.image}
            alt=""
            className="relative z-10 h-[88px] w-[88px] object-contain transition-transform duration-300 ease-out group-hover:scale-110 group-hover:rotate-[2deg]"
          />
        ) : (
          <div className="relative z-10 flex h-[88px] w-[88px] items-center justify-center transition-transform duration-300 ease-out group-hover:scale-110 group-hover:rotate-[2deg]">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[var(--card-warm-bg)]">
              <Icon className="h-8 w-8 text-[var(--icon-warm)]" strokeWidth={1.9} />
            </div>
          </div>
        )}
      </div>

      {/* ── Text block ── */}
      <div className="flex flex-col items-center gap-0.5">
        <p className="text-[14px] font-semibold leading-snug text-[var(--heading-warm)]">{meta.label}</p>
        <p className="text-[11px] font-normal leading-tight text-[var(--text-muted-warm)]">{meta.subtitle}</p>
      </div>

      {/* ── Premium circular arrow button ── */}
      <div
        className="flex h-7 w-7 items-center justify-center rounded-full transition-all duration-300 ease-out group-hover:bg-[rgba(232,145,45,0.2)]"
        style={{ background: "rgba(232,145,45,0.10)" }}
      >
        <ArrowRight
          className="h-3.5 w-3.5 text-[var(--icon-warm)] transition-transform duration-300 ease-out group-hover:translate-x-0.5"
          strokeWidth={2.2}
        />
      </div>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export function HomeDashboard() {
  const { user, setView } = useAppStore();
  // C-16 (Batch 4.4): this defaulted to "MANAGER", so a user that failed to
  // load produced a MANAGER module list — a fail-open default in the one
  // place role filtering existed. It now falls to the least privilege.
  const role = (user?.role as Role | undefined) ?? LEAST_PRIVILEGED_ROLE;

  const quickViews = QUICK_ACCESS.map((q) => q.view);
  const allModules = MODULE_ORDER.filter((view) => {
    if (quickViews.includes(view)) return false;
    const nav = NAV_ITEMS.find((n) => n.view === view);
    return !!nav && nav.roles.includes(role);
  });

  return (
    <div className="flex min-h-full flex-col gap-4 bg-[var(--shell-bg)] p-4 md:p-6">
      {/* -------- Row 1: Welcome + Quick Access -------- */}
      <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
        {/* ---- Welcome card ---- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-[28px] border border-[var(--card-warm-border)] bg-[var(--card-hero-bg)] shadow-[0_1px_3px_rgba(60,40,20,0.05)]"
          style={{
            backgroundImage: "url('/home-cards/text-card.png')",
            backgroundSize: "cover",
            backgroundPosition: "80% 85%",
            backgroundRepeat: "no-repeat",
          }}
        >
          {/* text occupies only the left half, vertically centered */}
          <div className="relative z-10 flex h-full min-h-[200px] w-full flex-col justify-center px-7 py-4 md:w-[55%] md:px-8 md:py-5 lg:h-[220px]">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-warm)]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-warm)]">
                ESPACE DE TRAVAIL
              </span>
            </div>
            <h1 className="mt-3 text-[32px] font-extrabold leading-[1.1] tracking-tight text-[var(--heading-warm)] md:text-[36px]">
              Bonjour, {user?.name ?? "Utilisateur"}
            </h1>
            <p className="mt-3 max-w-[350px] text-sm leading-relaxed text-[var(--text-subtle-warm)]">
              Gérez votre restaurant efficacement et suivez chaque commande avec simplicité.
            </p>
          </div>
        </motion.div>

        {/* ---- Quick Access ---- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex h-full flex-col"
        >
          <SectionLabel icon={Zap} label="ACCÈS RAPIDE" className="mb-1" />
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            {QUICK_ACCESS.map((item) => (
              <QuickCard key={item.view} item={item} onClick={() => setView(item.view)} />
            ))}
          </div>
        </motion.div>
      </div>

      {/* -------- Row 2: All Modules -------- */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <SectionLabel icon={Grid3x3} label="TOUS LES MODULES" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {allModules.map((view, idx) => (
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.25 + idx * 0.03 }}
              className="h-full"
            >
              <ModuleCard view={view} onClick={() => setView(view)} />
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
