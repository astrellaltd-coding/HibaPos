"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type { ShiftDto, XReportDto } from "@/types/api";
import { formatEuro, formatDateTime } from "@/lib/format";
import { Money } from "@/components/shared/money";
import { EmptyState, PageHeader } from "@/components/shared/empty-state";
import { round2 } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Clock,
  LockKeyhole,
  PlayCircle,
  FileText,
  CheckCircle2,
  ArrowRight,
  Loader2,
  DatabaseBackup,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Compute a friendly "Xh Ymin" duration between two dates. */
function formatDuration(from: Date | string, to: Date): string {
  const start = typeof from === "string" ? new Date(from) : from;
  const ms = Math.max(0, to.getTime() - start.getTime());
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}

/** Variance presentation rules. */
function varianceStyle(v: number | null | undefined) {
  if (v === null || v === undefined || v === 0) {
    return {
      cls: "text-muted-foreground",
      label: "Écart nul",
      badge: "bg-muted text-muted-foreground",
    };
  }
  if (v > 0) {
    return {
      cls: "text-emerald-600",
      label: "Excédent",
      badge: "bg-emerald-500/15 text-emerald-700",
    };
  }
  return {
    cls: "text-rose-600",
    label: "Manquant",
    badge: "bg-rose-500/15 text-rose-700",
  };
}

export function ShiftsView() {
  const qc = useQueryClient();
  const [now, setNow] = useState(() => new Date());

  // Live tick so the shift duration stays fresh.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // --- Queries ---
  const { data: current, isLoading: currentLoading } = useQuery({
    queryKey: ["shift", "current"],
    queryFn: () => api.get<ShiftDto | null>("/api/shifts/current"),
    refetchInterval: 30_000,
  });

  const isOpen = !!current && current.status === "OPEN";

  const { data: shifts } = useQuery({
    queryKey: ["shifts"],
    queryFn: () => api.get<ShiftDto[]>("/api/shifts"),
  });

  const { data: xReport, isError: xError } = useQuery({
    queryKey: ["report", "x"],
    queryFn: () => api.get<XReportDto>("/api/reports/x"),
    enabled: isOpen,
    refetchInterval: 15_000,
    retry: false,
  });

  // --- Dialog state ---
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [xDialog, setXDialog] = useState(false);
  const [zResult, setZResult] = useState<{
    zReport: ZReportSummary;
    cashVariance: number;
    backup: { filename: string } | null;
  } | null>(null);

  // --- Open shift mutation ---
  const openMutation = useMutation({
    mutationFn: (vars: { openingFloat: number; notes?: string }) =>
      api.post<ShiftDto>("/api/shifts", vars),
    onSuccess: () => {
      toast.success("Caisse ouverte", {
        description: "Vous pouvez maintenant encaisser des ventes.",
      });
      setOpenDialog(false);
      qc.invalidateQueries({ queryKey: ["shift", "current"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
      // Dashboard's "current shift" indicator depends on shift lifecycle.
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError && err.status === 409
          ? "Une caisse est déjà ouverte. Clôturez-la d'abord."
          : err instanceof ApiError
            ? err.message
            : "Impossible d'ouvrir la caisse.";
      toast.error("Erreur", { description: msg });
    },
  });

  // --- Close shift mutation ---
  const closeMutation = useMutation({
    mutationFn: (vars: { closingFloat: number; notes?: string }) =>
      api.post<{ zReport: ZReportSummary; cashVariance: number; backup: { filename: string } | null }>(
        `/api/shifts/${current?.id}/close`,
        vars,
      ),
    onSuccess: (data) => {
      setCloseDialog(false);
      setZResult(data);
      qc.invalidateQueries({ queryKey: ["shift", "current"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
      qc.invalidateQueries({ queryKey: ["zreports"] });
      qc.invalidateQueries({ queryKey: ["report", "x"] });
      // Dashboard KPIs (today's sales, current-shift badge, expected cash)
      // depend on the shift lifecycle — without this the dashboard shows
      // stale numbers until its 60s refetchInterval fires.
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => {
      toast.error("Erreur", {
        description:
          err instanceof ApiError ? err.message : "Impossible de clôturer la caisse.",
      });
    },
  });

  return (
    <div className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <PageHeader
        icon={Clock}
        title="Caisses (shifts)"
        description="Ouverture et clôture de caisse"
      />

      {/* ---------------- Current shift ---------------- */}
      {currentLoading ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Chargement…
        </div>
      ) : isOpen && current ? (
        <OpenShiftCard
          shift={current}
          now={now}
          xReport={xReport ?? null}
          xError={xError}
          onShowX={() => setXDialog(true)}
          onClose={() => setCloseDialog(true)}
        />
      ) : (
        <EmptyState
          icon={LockKeyhole}
          title="Aucune caisse ouverte"
          description="Ouvrez une caisse pour commencer à encaisser des ventes. Un fond de caisse initial est requis."
          action={
            <Button onClick={() => setOpenDialog(true)}>
              <PlayCircle className="h-4 w-4" />
              Ouvrir la caisse
            </Button>
          }
        />
      )}

      {/* ---------------- History ---------------- */}
      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Historique des caisses</h2>
          <span className="text-xs text-muted-foreground">
            {shifts?.length ?? 0} caisses
          </span>
        </div>
        <div className="max-h-[40vh] overflow-y-auto scroll-thin rounded-xl border border-border bg-card">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Ouverte le</TableHead>
                <TableHead>par</TableHead>
                <TableHead>Clôturée le</TableHead>
                <TableHead className="text-right">Fond de caisse</TableHead>
                <TableHead className="text-right">Ventes</TableHead>
                <TableHead className="text-right">Espèces attendues</TableHead>
                <TableHead className="text-right">Écart</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!shifts || shifts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    Aucune caisse enregistrée pour le moment.
                  </TableCell>
                </TableRow>
              ) : (
                shifts.map((s) => {
                  const v = varianceStyle(s.cashVariance);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">#{s.number}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(s.openedAt)}
                      </TableCell>
                      <TableCell>{s.openedBy?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.closedAt ? formatDateTime(s.closedAt) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Money amount={s.openingFloat} />
                      </TableCell>
                      <TableCell className="text-right">
                        {s.salesTotal !== null ? <Money amount={s.salesTotal} /> : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.expectedCash !== null ? <Money amount={s.expectedCash} /> : "—"}
                      </TableCell>
                      <TableCell className={cn("text-right font-medium", v.cls)}>
                        {s.cashVariance === null
                          ? "—"
                          : `${s.cashVariance > 0 ? "+" : ""}${formatEuro(s.cashVariance)}`}
                      </TableCell>
                      <TableCell>
                        {s.status === "OPEN" ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700">
                            Ouverte
                          </Badge>
                        ) : (
                          <Badge className="bg-muted text-muted-foreground">Clôturée</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* ---------------- Open dialog ---------------- */}
      <OpenShiftDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        onSubmit={(v) => openMutation.mutate(v)}
        loading={openMutation.isPending}
      />

      {/* ---------------- Close dialog ---------------- */}
      <CloseShiftDialog
        open={closeDialog}
        onOpenChange={setCloseDialog}
        expectedCash={xReport?.expectedCash ?? 0}
        openingFloat={current?.openingFloat ?? 0}
        loading={closeMutation.isPending}
        onSubmit={(v) => closeMutation.mutate(v)}
      />

      {/* ---------------- X report detail dialog ---------------- */}
      <XReportDialog
        open={xDialog}
        onOpenChange={setXDialog}
        report={xReport ?? null}
      />

      {/* ---------------- Z report success dialog ---------------- */}
      <ZReportSuccessDialog
        open={!!zResult}
        onOpenChange={(o) => !o && setZResult(null)}
        result={zResult}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type ZReportSummary = {
  id: string;
  number: number;
  salesTotal: number;
  salesCount: number;
  vatTotal: number;
  cashTotal: number;
  cardTotal: number;
  voucherTotal: number;
  openingFloat: number;
  expectedCash: number;
  closingFloat: number;
  cashVariance: number;
  vatBreakdown: Record<string, { ht: number; vat: number; ttc: number }>;
  topProducts: { name: string; quantity: number; total: number }[];
  generatedAt: string;
};

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
        ? "text-emerald-600"
        : tone === "rose"
          ? "text-rose-600"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tnum tabular-nums", toneCls)}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function VatBreakdownTable({
  breakdown,
}: {
  breakdown: Record<string, { ht: number; vat: number; ttc: number }>;
}) {
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
        <li key={`${p.name}-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
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

function OpenShiftCard({
  shift,
  now,
  xReport,
  xError,
  onShowX,
  onClose,
}: {
  shift: ShiftDto;
  now: Date;
  xReport: XReportDto | null;
  xError: boolean;
  onShowX: () => void;
  onClose: () => void;
}) {
  return (
    <section className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">
                Caisse #{shift.number} — en cours
              </h2>
              <Badge className="bg-emerald-500/15 text-emerald-700">
                Ouverte
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ouverte par <span className="font-medium text-foreground">{shift.openedBy?.name ?? "—"}</span>
              {" • "}
              {formatDateTime(shift.openedAt)}
              {" • "}
              <span className="font-medium text-foreground">{formatDuration(shift.openedAt, now)}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Fond de caisse initial :{" "}
              <Money amount={shift.openingFloat} className="font-medium text-foreground" />
              {shift.notes ? <span className="ml-2 italic">« {shift.notes} »</span> : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onShowX} disabled={!xReport}>
            <FileText className="h-4 w-4" />
            Rapport X détaillé
          </Button>
          <Button variant="destructive" onClick={onClose}>
            <LockKeyhole className="h-4 w-4" />
            Clôturer la caisse (Z)
          </Button>
        </div>
      </div>

      {/* Live X-report summary grid */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label="Ventes totales"
          value={<Money amount={xReport?.salesTotal ?? 0} />}
          hint={`${xReport?.salesCount ?? 0} vente(s)`}
          tone="primary"
        />
        <Kpi
          label="Espèces"
          value={<Money amount={xReport?.cashTotal ?? 0} />}
        />
        <Kpi label="Carte" value={<Money amount={xReport?.cardTotal ?? 0} />} />
        <Kpi label="Bons" value={<Money amount={xReport?.voucherTotal ?? 0} />} />
        <Kpi
          label="Fond de caisse"
          value={<Money amount={xReport?.openingFloat ?? shift.openingFloat} />}
        />
        <Kpi
          label="Espèces attendues"
          value={<Money amount={xReport?.expectedCash ?? 0} />}
          hint="Fond + ventes espèces"
          tone="emerald"
        />
      </div>

      {xError && (
        <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700">
          Impossible de charger le rapport X en temps réel.
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Rapport en temps réel — non définitif. Rafraîchi automatiquement toutes les 15 secondes.
      </p>
    </section>
  );
}

function OpenShiftDialog({
  open,
  onOpenChange,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (v: { openingFloat: number; notes?: string }) => void;
  loading: boolean;
}) {
  const [floatStr, setFloatStr] = useState("100.00");
  const [notes, setNotes] = useState("");

  const floatNum = useMemo(() => {
    const n = parseFloat(floatStr.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [floatStr]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ouvrir la caisse</DialogTitle>
          <DialogDescription>
            Saisissez le fond de caisse initial (espèces présentes dans la caisse).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="open-float">Fond de caisse initial (€)</Label>
            <Input
              id="open-float"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={floatStr}
              onChange={(e) => setFloatStr(e.target.value)}
            />
              <p className="text-xs text-muted-foreground">
              Valeur : <Money amount={Math.round(floatNum * 100)} className="font-medium text-foreground" />
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="open-notes">Note (optionnelle)</Label>
            <Textarea
              id="open-notes"
              placeholder="Ex: Fonds vérifié en début de service…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Annuler
          </Button>
          <Button
            onClick={() => onSubmit({ openingFloat: Math.round(floatNum * 100), notes: notes.trim() || undefined })}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Ouvrir la caisse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseShiftDialog({
  open,
  onOpenChange,
  expectedCash,
  openingFloat,
  loading,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  expectedCash: number;
  openingFloat: number;
  loading: boolean;
  onSubmit: (v: { closingFloat: number; notes?: string }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Form is mounted fresh each time the dialog opens → state init from props. */}
        {open && (
          <CloseShiftForm
            expectedCash={expectedCash}
            openingFloat={openingFloat}
            loading={loading}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CloseShiftForm({
  expectedCash,
  openingFloat,
  loading,
  onSubmit,
  onCancel,
}: {
  expectedCash: number;
  openingFloat: number;
  loading: boolean;
  onSubmit: (v: { closingFloat: number; notes?: string }) => void;
  onCancel: () => void;
}) {
  const [countedStr, setCountedStr] = useState((expectedCash / 100).toFixed(2));
  const [notes, setNotes] = useState("");

  const counted = useMemo(() => {
    const n = parseFloat(countedStr.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [countedStr]);

  // expectedCash and openingFloat arrive as CENTS from the API; convert to
  // euros for the variance display (user-facing).
  const expectedCashEuros = expectedCash / 100;
  const variance = round2(counted - expectedCashEuros);
  const v = varianceStyle(variance);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Clôturer la caisse (Z)</DialogTitle>
        <DialogDescription>
          Comptez les espèces présentes dans la caisse et saisissez le montant total. Un rapport Z
          immuable sera généré.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="close-counted">Espèces comptées (€)</Label>
          <Input
            id="close-counted"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={countedStr}
            onChange={(e) => setCountedStr(e.target.value)}
          />
        </div>

        <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Fond de caisse initial</span>
            <Money amount={openingFloat / 100} />
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-muted-foreground">Espèces attendues</span>
            <Money amount={expectedCash / 100} className="font-medium" />
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-muted-foreground">Écart calculé</span>
            <span className={cn("font-semibold tnum tabular-nums", v.cls)}>
              {variance > 0 ? "+" : ""}
              {formatEuro(variance)}{" "}
              <span className="ml-1 text-xs font-normal">({v.label})</span>
            </span>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="close-notes">Note de clôture (optionnelle)</Label>
          <Textarea
            id="close-notes"
            placeholder="Ex: Écart expliqué par une erreur de rendu monnaie…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Annuler
        </Button>
        <Button
          variant="destructive"
          onClick={() => onSubmit({ closingFloat: Math.round(counted * 100), notes: notes.trim() || undefined })}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
          Générer le rapport Z et clôturer
        </Button>
      </DialogFooter>
    </>
  );
}

function XReportDialog({
  open,
  onOpenChange,
  report,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  report: XReportDto | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Rapport X — caisse #{report?.shift.number ?? "—"}</DialogTitle>
          <DialogDescription>
            Rapport en temps réel — non définitif. Généré le{" "}
            {report ? formatDateTime(report.generatedAt) : "—"}.
          </DialogDescription>
        </DialogHeader>

        {report ? (
          <div className="scroll-thin max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Ventes totales" value={<Money amount={report.salesTotal} />} tone="primary" />
              <Kpi label="Nb ventes" value={report.salesCount} />
              <Kpi label="TVA collectée" value={<Money amount={report.vatTotal} />} />
              <Kpi label="Remises" value={<Money amount={report.discountsTotal} />} />
            </div>

            <h3 className="mb-2 mt-5 text-sm font-semibold text-foreground">
              Répartition TVA
            </h3>
            <VatBreakdownTable breakdown={report.vatBreakdown} />

            <h3 className="mb-2 mt-5 text-sm font-semibold text-foreground">Règlements</h3>
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Espèces" value={<Money amount={report.cashTotal} />} />
              <Kpi label="Carte" value={<Money amount={report.cardTotal} />} />
              <Kpi label="Bons" value={<Money amount={report.voucherTotal} />} />
            </div>

            <h3 className="mb-2 mt-5 text-sm font-semibold text-foreground">Espèces attendues</h3>
            <div className="grid grid-cols-2 gap-3">
              <Kpi label="Fond + espèces" value={<Money amount={report.expectedCash} />} tone="emerald" />
              <Kpi label="Fond initial" value={<Money amount={report.openingFloat} />} />
            </div>

            <h3 className="mb-2 mt-5 text-sm font-semibold text-foreground">Top produits</h3>
            <TopProductsList items={report.topProducts} />
          </div>
        ) : (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            Aucune donnée.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ZReportSuccessDialog({
  open,
  onOpenChange,
  result,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  result: {
    zReport: ZReportSummary;
    cashVariance: number;
    backup: { filename: string } | null;
  } | null;
}) {
  if (!result) return null;
  const z = result.zReport;
  const v = varianceStyle(result.cashVariance);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Caisse clôturée — Rapport Z #{z.number}
          </DialogTitle>
          <DialogDescription>
            La caisse a été clôturée avec succès. Le rapport Z est immuable.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Ventes totales" value={<Money amount={z.salesTotal} />} tone="primary" />
            <Kpi label="Nb ventes" value={z.salesCount} />
          </div>
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Espèces attendues</span>
              <Money amount={z.expectedCash} className="font-medium" />
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">Espèces comptées</span>
              <Money amount={z.closingFloat} className="font-medium" />
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">Écart de caisse</span>
              <span className={cn("font-semibold tnum tabular-nums", v.cls)}>
                {result.cashVariance > 0 ? "+" : ""}
                {formatEuro(result.cashVariance)}{" "}
                <span className="text-xs font-normal">({v.label})</span>
              </span>
            </div>
          </div>

          {result.backup && (
            <div className="flex items-start gap-2 rounded-xl border border-border bg-primary/5 p-3 text-xs">
              <DatabaseBackup className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-foreground">Sauvegarde automatique créée</p>
                <p className="text-muted-foreground">{result.backup.filename}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            <ArrowRight className="h-4 w-4" />
            Terminer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
