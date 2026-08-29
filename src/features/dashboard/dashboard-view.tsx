"use client";

import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { DashboardDto, OrderDto } from "@/types/api";
import { PageHeader, EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  ReceiptText,
  Package,
  Calculator,
  RefreshCw,
  AlertTriangle,
  Store,
  Utensils,
  ShoppingBag,
  PieChart as PieChartIcon,
  CalendarDays,
  Download,
} from "lucide-react";
import { formatEuro, formatRelativeDateTime } from "@/lib/format";
import { toast } from "sonner";
import { exportDashboardCSV, downloadCSV } from "@/lib/csv-export";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Espèces",
  CARD: "Carte",
  VOUCHER: "Bon",
};

const PAYMENT_COLORS: Record<string, string> = {
  CASH: "var(--chart-1)",
  CARD: "var(--chart-2)",
  VOUCHER: "var(--chart-4)",
};

function statusBadge(status: OrderDto["status"]) {
  switch (status) {
    case "COMPLETED":
      return <Badge className="bg-emerald-100 text-emerald-700">Terminée</Badge>;
    case "REFUNDED":
      return <Badge variant="destructive">Remboursée</Badge>;
    case "CANCELLED":
      return <Badge variant="secondary">Annulée</Badge>;
    default:
      return <Badge variant="outline">En attente</Badge>;
  }
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
  loading,
  isMoney,
  trend,
  sublabel,
}: {
  label: string;
  value: string | number;
  icon: typeof TrendingUp;
  accent?: boolean;
  loading?: boolean;
  isMoney?: boolean;
  trend?: { pct: number | null; label: string };
  sublabel?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded-xl p-5 shadow-sm transition-shadow hover:shadow-md",
        accent && "ring-1 ring-primary/20",
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            accent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-24" />
      ) : (
        <>
          <p
            className={cn(
              "tnum mt-3 text-2xl font-bold tracking-tight",
              accent ? "text-primary" : "text-foreground",
            )}
          >
            {isMoney ? formatEuro(Number(value)) : value}
          </p>
          {sublabel && <p className="mt-0.5 text-[11px] text-muted-foreground">{sublabel}</p>}
          {trend && trend.pct !== null && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px]">
              {trend.pct >= 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-rose-500" />
              )}
              <span className={trend.pct >= 0 ? "font-medium text-emerald-600" : "font-medium text-rose-600"}>
                {trend.pct >= 0 ? "+" : ""}{trend.pct}%
              </span>
              <span className="text-muted-foreground">{trend.label}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function DashboardView() {
  const { data, isLoading, isFetching, refetch, error } = useQuery<DashboardDto, ApiError>({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardDto>("/api/dashboard"),
    refetchInterval: 60_000,
  });

  // Out-of-stock products alert
  const { data: outOfStock } = useQuery({
    queryKey: ["products", "out-of-stock"],
    queryFn: () =>
      api.get<{ id: string; name: string; image: string | null }[]>(
        "/api/catalog/products/availability",
      ),
    refetchInterval: 60_000,
  });

  const hourlyData =
    data?.hourly?.map((h) => ({ ...h, label: `${h.hour}h` })) ?? [];
  const hasHourly = hourlyData.some((h) => h.sales > 0);

  const totalPayments = data?.paymentBreakdown?.reduce((acc, p) => acc + p.amount, 0) ?? 0;

  return (
    <div className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Tableau de bord"
        description="Vue d'ensemble de l'activité du jour"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (data) {
                  const csv = exportDashboardCSV(data);
                  const date = new Date().toISOString().slice(0, 10);
                  downloadCSV(csv, `tableau-de-bord-${date}.csv`);
                  toast.success("Tableau de bord exporté en CSV");
                }
              }}
              disabled={!data}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              Actualiser
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Erreur lors du chargement du tableau de bord : {error.message}
        </div>
      )}

      {data && !data.currentShift && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold text-primary">Aucune caisse ouverte</p>
            <p className="text-muted-foreground">
              Ouvrez une caisse dans l'écran des shifts pour encaisser les ventes du jour.
            </p>
          </div>
        </div>
      )}

      {/* Out-of-stock alert */}
      {outOfStock && outOfStock.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm dark:border-rose-900 dark:bg-rose-950/30">
          <div className="relative mt-0.5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
            <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
            </span>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-rose-700 dark:text-rose-300">
              {outOfStock.length} produit{outOfStock.length > 1 ? "s" : ""} épuisé{outOfStock.length > 1 ? "s" : ""}
            </p>
            <p className="text-muted-foreground">
              {outOfStock.slice(0, 5).map((p) => p.name).join(", ")}
              {outOfStock.length > 5 && ` et ${outOfStock.length - 5} autre${outOfStock.length - 5 > 1 ? "s" : ""}…`}
            </p>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Ventes du jour"
          value={data?.todaySales ?? 0}
          icon={TrendingUp}
          accent
          isMoney
          loading={isLoading}
          trend={data?.comparison ? { pct: data.comparison.todayVsLastWeekDayPct, label: "vs même jour dernière semaine" } : undefined}
        />
        <KpiCard
          label="Commandes"
          value={data?.todayOrders ?? 0}
          icon={ReceiptText}
          loading={isLoading}
          sublabel={data?.comparison ? `${data.comparison.lastWeekDayCount} le même jour dernière semaine` : undefined}
        />
        <KpiCard
          label="Articles vendus"
          value={data?.todayItems ?? 0}
          icon={Package}
          loading={isLoading}
        />
        <KpiCard
          label="Ticket moyen"
          value={data?.avgTicket ?? 0}
          icon={Calculator}
          isMoney
          loading={isLoading}
        />
      </div>

      {/* Weekly comparison row */}
      {data?.comparison && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Cette semaine</h2>
                <p className="text-xs text-muted-foreground">vs semaine dernière</p>
              </div>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold tabular-nums text-foreground">{formatEuro(data.comparison.thisWeekSales)}</p>
                <p className="text-xs text-muted-foreground">{data.comparison.thisWeekOrdersCount} commande{data.comparison.thisWeekOrdersCount > 1 ? "s" : ""}</p>
              </div>
              {data.comparison.weekVsLastWeekPct !== null && (
                <div className="flex items-center gap-1 text-sm">
                  {data.comparison.weekVsLastWeekPct >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-rose-500" />
                  )}
                  <span className={data.comparison.weekVsLastWeekPct >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                    {data.comparison.weekVsLastWeekPct >= 0 ? "+" : ""}{data.comparison.weekVsLastWeekPct}%
                  </span>
                </div>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Semaine dernière :</span>
              <span className="font-medium text-foreground">{formatEuro(data.comparison.lastWeekSales)}</span>
              <span>·</span>
              <span>{data.comparison.lastWeekOrdersCount} cmd</span>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Même jour dernière semaine</h2>
                <p className="text-xs text-muted-foreground">comparaison jour pour jour</p>
              </div>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold tabular-nums text-foreground">{formatEuro(data.comparison.lastWeekDaySales)}</p>
                <p className="text-xs text-muted-foreground">{data.comparison.lastWeekDayCount} commande{data.comparison.lastWeekDayCount > 1 ? "s" : ""}</p>
              </div>
              {data.comparison.todayVsLastWeekDayPct !== null && (
                <div className="flex items-center gap-1 text-sm">
                  {data.comparison.todayVsLastWeekDayPct >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-rose-500" />
                  )}
                  <span className={data.comparison.todayVsLastWeekDayPct >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                    {data.comparison.todayVsLastWeekDayPct >= 0 ? "+" : ""}{data.comparison.todayVsLastWeekDayPct}%
                  </span>
                </div>
              )}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Aujourd'hui : <span className="font-medium text-foreground">{formatEuro(data.todaySales)}</span> · {data.todayOrders} cmd
            </div>
          </div>
        </div>
      )}

      {/* Second row: hourly chart + payment breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Ventes par heure</h2>
              <p className="text-xs text-muted-foreground">Répartition horaire du chiffre du jour</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--primary)" }} />
              Ventes (€)
            </div>
          </div>
          {isLoading ? (
            <Skeleton className="h-[240px] w-full rounded-lg" />
          ) : hasHourly ? (
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    interval={1}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [formatEuro(Number(v)), "Ventes"]}
                    labelFormatter={(l) => `Heure : ${l}`}
                  />
                  <Bar dataKey="sales" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[240px] flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <ShoppingBag className="mb-2 h-8 w-8 opacity-50" />
              Aucune vente enregistrée aujourd'hui.
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Répartition des paiements</h2>
          <p className="text-xs text-muted-foreground">Méthodes utilisées aujourd'hui</p>

          {isLoading ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : data && data.paymentBreakdown.length > 0 ? (
            <div className="mt-4 space-y-2.5">
              {data.paymentBreakdown.map((p) => {
                const pct = totalPayments > 0 ? (p.amount / totalPayments) * 100 : 0;
                const color = PAYMENT_COLORS[p.method] ?? "var(--primary)";
                return (
                  <div key={p.method} className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: color }}
                        />
                        {PAYMENT_LABELS[p.method] ?? p.method}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.count} pmt{p.count > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-end justify-between gap-2">
                      <Money amount={p.amount} className="text-base font-bold text-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 flex flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <Store className="mb-2 h-8 w-8 opacity-50" />
              Aucun paiement aujourd'hui.
            </div>
          )}
        </div>
      </div>

      {/* Third row: top products + recent orders */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Produits les plus vendus</h2>
              <p className="text-xs text-muted-foreground">Top du jour par quantité</p>
            </div>
            <Utensils className="h-4 w-4 text-muted-foreground" />
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : data && data.topProducts.length > 0 ? (
            <ul className="divide-y divide-border">
              {data.topProducts.map((p, i) => (
                <li key={p.name} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      i === 0
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.quantity} vendus</p>
                  </div>
                  <Money amount={p.total} className="text-sm font-semibold text-foreground" />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Package}
              title="Aucune vente"
              description="Les produits les plus vendus apparaîtront ici."
              className="border-0 bg-transparent py-8"
            />
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Commandes récentes</h2>
              <p className="text-xs text-muted-foreground">8 dernières transactions</p>
            </div>
            <ReceiptText className="h-4 w-4 text-muted-foreground" />
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : data && data.recentOrders.length > 0 ? (
            <ul className="scroll-thin max-h-72 divide-y divide-border overflow-y-auto">
              {data.recentOrders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
                    #{o.number}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {o.cashier?.name ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeDateTime(o.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Money amount={o.total} className="text-sm font-semibold text-foreground" />
                    {statusBadge(o.status)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={ReceiptText}
              title="Aucune commande"
              description="Les commandes récentes apparaîtront ici."
              className="border-0 bg-transparent py-8"
            />
          )}
        </div>
      </div>

      {/* Fourth row: top categories */}
      {data && data.topCategories && data.topCategories.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Ventes par catégorie</h2>
              <p className="text-xs text-muted-foreground">Répartition du chiffre du jour</p>
            </div>
            <PieChartIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Pie chart */}
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.topCategories}
                    dataKey="revenue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    innerRadius={40}
                    paddingAngle={2}
                  >
                    {data.topCategories.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatEuro(value)}
                    contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Category list with bars */}
            <div className="space-y-2.5">
              {(() => {
                const maxRev = Math.max(...data.topCategories.map((c) => c.revenue));
                return data.topCategories.map((cat) => (
                  <div key={cat.name}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                        {cat.name}
                      </span>
                      <span className="font-semibold tabular-nums text-foreground">{formatEuro(cat.revenue)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all duration-200"
                        style={{ width: `${(cat.revenue / maxRev) * 100}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
