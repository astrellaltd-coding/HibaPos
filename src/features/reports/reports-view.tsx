"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { XReportDto, ZReportDto } from "@/types/api";
import { formatEuro, formatDateTime, formatDate } from "@/lib/format";
import { Money } from "@/components/shared/money";
import { EmptyState, PageHeader } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  BarChart3,
  FileText,
  RefreshCw,
  Loader2,
  ShieldCheck,
  CalendarRange,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type VatRow = { ht: number; vat: number; ttc: number };

function varianceTone(v: number) {
  if (v === 0) return "text-muted-foreground";
  return v > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
}

function varianceLabel(v: number) {
  if (v === 0) return "Écart nul";
  return v > 0 ? "Excédent" : "Manquant";
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "primary" | "emerald" | "rose";
}) {
  const toneCls =
    tone === "primary"
      ? "text-primary"
      : tone === "emerald"
        ? "text-emerald-600 dark:text-emerald-400"
        : tone === "rose"
          ? "text-rose-600 dark:text-rose-400"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tnum tabular-nums", toneCls)}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function VatBreakdownTable({ breakdown }: { breakdown: Record<string, VatRow> }) {
  const rates = Object.keys(breakdown).sort((a, b) => Number(a) - Number(b));
  if (rates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
        Aucune vente sur cette période.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>Taux TVA</TableHead>
            <TableHead className="text-right">Base HT</TableHead>
            <TableHead className="text-right">TVA</TableHead>
            <TableHead className="text-right">TTC</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rates.map((r) => {
            const row = breakdown[r];
            return (
              <TableRow key={r}>
                <TableCell className="font-medium">{Number(r).toFixed(1)} %</TableCell>
                <TableCell className="text-right">
                  <Money amount={row.ht} />
                </TableCell>
                <TableCell className="text-right">
                  <Money amount={row.vat} />
                </TableCell>
                <TableCell className="text-right font-medium">
                  <Money amount={row.ttc} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function TopProductsList({
  items,
}: {
  items: { name: string; quantity: number; total: number }[];
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
        Aucun produit vendu.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {items.map((p, i) => (
        <li
          key={`${p.name}-${i}`}
          className="flex items-center justify-between px-3 py-2 text-sm"
        >
          <span className="font-medium text-foreground">{p.name}</span>
          <span className="flex items-center gap-3 text-muted-foreground">
            <span className="tnum tabular-nums">×{p.quantity}</span>
            <Money amount={p.total} className="font-medium text-foreground" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function ReportsView() {
  const [tab, setTab] = useState("x");

  return (
    <div className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <PageHeader
        icon={BarChart3}
        title="Rapports"
        description="Rapports X, Z et analyse des ventes"
      />

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="self-start">
          <TabsTrigger value="x">
            <FileText className="h-4 w-4" />
            Rapport X
          </TabsTrigger>
          <TabsTrigger value="z">
            <ShieldCheck className="h-4 w-4" />
            Rapports Z
          </TabsTrigger>
          <TabsTrigger value="sales">
            <CalendarRange className="h-4 w-4" />
            Ventes par période
          </TabsTrigger>
        </TabsList>

        <TabsContent value="x" className="mt-4 min-h-0">
          <XReportTab />
        </TabsContent>
        <TabsContent value="z" className="mt-4 min-h-0">
          <ZReportsTab />
        </TabsContent>
        <TabsContent value="sales" className="mt-4 min-h-0">
          <SalesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1 — X report (live)
// ---------------------------------------------------------------------------

function XReportTab() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["report", "x"],
    queryFn: () => api.get<XReportDto>("/api/reports/x"),
    refetchInterval: 15_000,
    retry: false,
  });

  // If no shift is open, the API returns 404 → isError. Show empty state.
  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Chargement du rapport…
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={Lock}
        title="Aucune caisse ouverte"
        description="Le rapport X est généré en temps réel à partir de la caisse actuellement ouverte. Ouvrez une caisse pour visualiser ce rapport."
        action={
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            Réessayer
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Rapport X — Caisse #{data?.shift.number}
          </p>
          <p className="text-xs text-muted-foreground">
            Généré le {data ? formatDateTime(data.generatedAt) : "—"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Actualiser
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Ventes totales" value={<Money amount={data?.salesTotal ?? 0} />} tone="primary" />
        <Kpi label="Nb ventes" value={data?.salesCount ?? 0} />
        <Kpi label="TVA collectée" value={<Money amount={data?.vatTotal ?? 0} />} />
        <Kpi
          label="Espèces attendues"
          value={<Money amount={data?.expectedCash ?? 0} />}
          tone="emerald"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Répartition TVA</h3>
          <VatBreakdownTable breakdown={data?.vatBreakdown ?? {}} />
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Règlements</h3>
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Espèces" value={<Money amount={data?.cashTotal ?? 0} />} />
            <Kpi label="Carte" value={<Money amount={data?.cardTotal ?? 0} />} />
            <Kpi label="Bons" value={<Money amount={data?.voucherTotal ?? 0} />} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Kpi label="Fond de caisse" value={<Money amount={data?.openingFloat ?? 0} />} />
            <Kpi label="Remises" value={<Money amount={data?.discountsTotal ?? 0} />} tone="rose" />
          </div>
        </section>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Top produits</h3>
        <TopProductsList items={data?.topProducts ?? []} />
      </section>

      <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Rapport en temps réel — non définitif. Les montants évoluent avec chaque vente.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — Z reports (history)
// ---------------------------------------------------------------------------

function ZReportsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["zreports"],
    queryFn: () => api.get<ZReportDto[]>("/api/reports/z"),
  });
  const [selected, setSelected] = useState<ZReportDto | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Rapports Z — historique immuable
        </h3>
        <span className="text-xs text-muted-foreground">
          {data?.length ?? 0} rapport(s)
        </span>
      </div>

      <div className="max-h-[60vh] overflow-y-auto scroll-thin rounded-xl border border-border bg-card">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Caisse</TableHead>
              <TableHead className="text-right">Ventes</TableHead>
              <TableHead className="text-right">Espèces</TableHead>
              <TableHead className="text-right">Écart</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  Chargement…
                </TableCell>
              </TableRow>
            ) : !data || data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  Aucun rapport Z. Clôturez une caisse pour générer le premier.
                </TableCell>
              </TableRow>
            ) : (
              data.map((z) => (
                <TableRow
                  key={z.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(z)}
                >
                  <TableCell className="font-medium">#{z.number}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(z.generatedAt)}
                  </TableCell>
                  <TableCell>#{z.shift.number}</TableCell>
                  <TableCell className="text-right">
                    <Money amount={z.salesTotal} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money amount={z.cashTotal} />
                  </TableCell>
                  <TableCell className={cn("text-right font-medium", varianceTone(z.cashVariance))}>
                    {z.cashVariance > 0 ? "+" : ""}
                    {formatEuro(z.cashVariance)}
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-primary/10 text-primary">Définitif</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ZReportDetailDialog report={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function ZReportDetailDialog({
  report,
  onClose,
}: {
  report: ZReportDto | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!report} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Rapport Z #{report?.number}
          </DialogTitle>
          <DialogDescription>
            Généré le {report ? formatDateTime(report.generatedAt) : "—"} • Caisse #
            {report?.shift.number}
          </DialogDescription>
        </DialogHeader>

        {report && (
          <div className="scroll-thin max-h-[60vh] overflow-y-auto pr-1">
            <div className="mb-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
              <span className="font-semibold">Rapport Z immuable.</span> Ce rapport a été figé lors
              de la clôture de la caisse et ne peut plus être modifié.
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Ventes totales" value={<Money amount={report.salesTotal} />} tone="primary" />
              <Kpi label="Nb ventes" value={report.salesCount} />
              <Kpi label="TVA collectée" value={<Money amount={report.vatTotal} />} />
              <Kpi label="Remises" value={<Money amount={report.discountsTotal} />} tone="rose" />
            </div>

            <h3 className="mb-2 mt-5 text-sm font-semibold text-foreground">Répartition TVA</h3>
            <VatBreakdownTable breakdown={report.vatBreakdown} />

            <h3 className="mb-2 mt-5 text-sm font-semibold text-foreground">Règlements</h3>
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Espèces" value={<Money amount={report.cashTotal} />} />
              <Kpi label="Carte" value={<Money amount={report.cardTotal} />} />
              <Kpi label="Bons" value={<Money amount={report.voucherTotal} />} />
            </div>

            <h3 className="mb-2 mt-5 text-sm font-semibold text-foreground">
              Espèces et écart de caisse
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Fond initial" value={<Money amount={report.openingFloat} />} />
              <Kpi label="Espèces attendues" value={<Money amount={report.expectedCash} />} />
              <Kpi label="Espèces comptées" value={<Money amount={report.closingFloat} />} />
              <Kpi
                label="Écart"
                value={
                  <span>
                    {report.cashVariance > 0 ? "+" : ""}
                    {formatEuro(report.cashVariance)}
                  </span>
                }
                tone={
                  report.cashVariance > 0
                    ? "emerald"
                    : report.cashVariance < 0
                      ? "rose"
                      : "default"
                }
                hint={varianceLabel(report.cashVariance)}
              />
            </div>

            <h3 className="mb-2 mt-5 text-sm font-semibold text-foreground">Top produits</h3>
            <TopProductsList items={report.topProducts} />

            {report.shift.openedBy && (
              <p className="mt-4 text-xs text-muted-foreground">
                Caisse ouverte par{" "}
                <span className="font-medium text-foreground">
                  {report.shift.openedBy.name}
                </span>{" "}
                le {formatDateTime(report.shift.openedAt)}
                {report.shift.closedBy && (
                  <>
                    {" "}
                    et clôturée par{" "}
                    <span className="font-medium text-foreground">
                      {report.shift.closedBy.name}
                    </span>{" "}
                    le {formatDateTime(report.shift.closedAt ?? report.generatedAt)}.
                  </>
                )}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — Sales over period
// ---------------------------------------------------------------------------

type SalesReport = {
  from: string;
  to: string;
  totalSales: number;
  totalOrders: number;
  totalItems: number;
  avgTicket: number;
  cashTotal: number;
  cardTotal: number;
  voucherTotal: number;
  days: { date: string; sales: number; orders: number; items: number }[];
  topProducts: { name: string; quantity: number; total: number }[];
};

function SalesTab() {
  // Default to the last 7 days.
  const [fromStr, setFromStr] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return toIsoDate(d);
  });
  const [toStr, setToStr] = useState(() => toIsoDate(new Date()));

  // Active query key — only updates when user clicks "Calculer".
  const [range, setRange] = useState<{ from: string; to: string }>({
    from: fromStr,
    to: toStr,
  });

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["sales", range.from, range.to],
    queryFn: () =>
      api.get<SalesReport>("/api/reports/sales", {
        from: range.from,
        to: range.to,
      }),
  });

  const canCompute = useMemo(() => {
    const f = new Date(fromStr);
    const t = new Date(toStr);
    return !isNaN(f.getTime()) && !isNaN(t.getTime()) && f.getTime() <= t.getTime();
  }, [fromStr, toStr]);

  return (
    <div className="flex flex-col gap-5">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-1.5">
          <Label htmlFor="from">Du</Label>
          <Input
            id="from"
            type="date"
            value={fromStr}
            onChange={(e) => setFromStr(e.target.value)}
            max={toStr}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to">Au</Label>
          <Input
            id="to"
            type="date"
            value={toStr}
            onChange={(e) => setToStr(e.target.value)}
            min={fromStr}
          />
        </div>
        <Button
          onClick={() => setRange({ from: fromStr, to: toStr })}
          disabled={!canCompute || isFetching}
        >
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarRange className="h-4 w-4" />}
          Calculer
        </Button>
        {(fromStr !== range.from || toStr !== range.to) && (
          <span className="text-xs text-muted-foreground">
            Période affichée : {formatDate(range.from)} → {formatDate(range.to)}
          </span>
        )}
      </div>

      {error ? (
        <EmptyState
          icon={BarChart3}
          title="Aucune donnée"
          description={
            error instanceof ApiError
              ? error.message
              : "Impossible de charger les ventes pour cette période."
          }
        />
      ) : isLoading ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Calcul en cours…
        </div>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi
              label="Total ventes"
              value={<Money amount={data.totalSales} />}
              tone="primary"
              hint={`${data.totalOrders} commande(s)`}
            />
            <Kpi label="Commandes" value={data.totalOrders} />
            <Kpi label="Articles vendus" value={data.totalItems} />
            <Kpi
              label="Ticket moyen"
              value={<Money amount={data.avgTicket} />}
            />
          </div>

          {/* Daily sales chart */}
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Ventes journalières
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.days} margin={{ top: 5, right: 8, bottom: 5, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => formatDate(d)}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    tickFormatter={(v) => `${v} €`}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      fontSize: 12,
                    }}
                    labelFormatter={(d) => formatDate(String(d))}
                    formatter={(value: number, name) => {
                      if (name === "sales") return [formatEuro(value), "Ventes"];
                      return [String(value), String(name)];
                    }}
                  />
                  <Bar dataKey="sales" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Sales + orders trend line chart */}
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Tendance ventes &amp; commandes
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.days} margin={{ top: 5, right: 8, bottom: 5, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => formatDate(d)}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    tickFormatter={(v) => `${v} €`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      fontSize: 12,
                    }}
                    labelFormatter={(d) => formatDate(String(d))}
                    formatter={(value: number, name) => {
                      if (name === "sales") return [formatEuro(value), "Ventes"];
                      if (name === "orders") return [String(value), "Commandes"];
                      return [String(value), String(name)];
                    }}
                  />
                  <Legend
                    iconType="line"
                    formatter={(value) => (
                      <span className="text-xs text-muted-foreground">
                        {value === "sales" ? "Ventes (€)" : "Commandes"}
                      </span>
                    )}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="sales"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "var(--primary)", strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="orders"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 3, fill: "var(--chart-2)", strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Payment breakdown */}
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Répartition des paiements
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <Kpi label="Espèces" value={<Money amount={data.cashTotal} />} />
                <Kpi label="Carte" value={<Money amount={data.cardTotal} />} />
                <Kpi label="Bons" value={<Money amount={data.voucherTotal} />} />
              </div>
              <PaymentBar
                items={[
                  { label: "Espèces", value: data.cashTotal, color: "var(--chart-1)" },
                  { label: "Carte", value: data.cardTotal, color: "var(--chart-2)" },
                  { label: "Bons", value: data.voucherTotal, color: "var(--chart-4)" },
                ]}
              />
            </section>

            {/* Top products */}
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Top produits — période
              </h3>
              <div className="scroll-thin max-h-72 overflow-y-auto">
                <TopProductsList items={data.topProducts} />
              </div>
            </section>
          </div>

          {data.totalOrders === 0 && (
            <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Aucune vente enregistrée sur la période sélectionnée.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function PaymentBar({
  items,
}: {
  items: { label: string; value: number; color: string }[];
}) {
  const total = items.reduce((acc, it) => acc + it.value, 0);
  if (total === 0) return null;
  return (
    <div className="mt-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {items.map((it) => {
          const pct = (it.value / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={it.label}
              style={{ width: `${pct}%`, backgroundColor: it.color }}
              title={`${it.label} : ${formatEuro(it.value)} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {items.map((it) => (
          <span key={it.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: it.color }}
            />
            {it.label}{" "}
            <span className="font-medium text-foreground">{formatEuro(it.value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
