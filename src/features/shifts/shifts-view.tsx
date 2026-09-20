"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Kpi, VatBreakdownTable, TopProductsList } from "@/components/shared/report-widgets";
import { api, ApiError } from "@/lib/api-client";
import type { SettingsDto, ShiftDto, XReportDto } from "@/types/api";
import { formatDateTime, formatVariance } from "@/lib/format";
import { openedOnEarlierBusinessDay } from "@/lib/period";
import { Money } from "@/components/shared/money";
import { EmptyState, PageHeader } from "@/components/shared/empty-state";
import { cashVarianceCents } from "./z-close";
import { CashMovementDialog } from "./cash-movement-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  ArrowRightLeft,
  Loader2,
  DatabaseBackup,
  AlertTriangle,
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

const todayLabel = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** L-228 — what `POST /api/shifts/[id]/close` reports about the day seal. */
type DaySeal = { sealed: string[]; failed: { day: string; message: string } | null };

export function ShiftsView() {
  const qc = useQueryClient();
  const [now, setNow] = useState(() => new Date());

  // Live tick so the shift duration stays fresh.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // --- Queries ---
  // DD-24 (Batch 3.8): the trading-day cut-off governs the notice below.
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsDto>("/api/settings"),
  });
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
  const [cashDialog, setCashDialog] = useState(false); // M-05 (Batch 5.5)
  const [zResult, setZResult] = useState<{
    zReport: ZReportSummary;
    cashVariance: number;
    backup: { filename: string } | null;
    backupError?: string | null;
    daySeal?: DaySeal;
  } | null>(null);

  // L-228 — what the till refused to open over, and whether this account may
  // override it. Held rather than toasted: a toast cannot carry the two buttons
  // the operator needs, and the whole point is that he seals the day with one
  // tap instead of being sent to another screen.
  const [blockedBy, setBlockedBy] = useState<{ day: string; canForce: boolean; message: string } | null>(null);
  const [pendingOpen, setPendingOpen] = useState<{ openingFloat: number; notes?: string } | null>(null);

  // --- Open shift mutation ---
  const openMutation = useMutation({
    mutationFn: (vars: { openingFloat: number; notes?: string; force?: boolean }) =>
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
    onError: (err, vars) => {
      // L-228 — THE 409 NO LONGER MEANS ONE THING.
      //
      // This branch used to hard-code « Une caisse est déjà ouverte », which
      // was the only 409 this route could answer. It now also refuses when a
      // trading day that recorded sales is unsealed, and printing the old
      // sentence for that would send the operator to look for a caisse that is
      // not open. The body says which it is.
      const body = err instanceof ApiError ? (err.body as { unsealedDay?: string; canForce?: boolean } | null) : null;
      if (err instanceof ApiError && err.status === 409 && body?.unsealedDay) {
        setPendingOpen({ openingFloat: vars.openingFloat, notes: vars.notes });
        setBlockedBy({ day: body.unsealedDay, canForce: Boolean(body.canForce), message: err.message });
        setOpenDialog(false);
        return;
      }
      const msg =
        err instanceof ApiError && err.status === 409
          ? err.message
          : err instanceof ApiError
            ? err.message
            : "Impossible d'ouvrir la caisse.";
      toast.error("Erreur", { description: msg });
    },
  });

  // L-228 — seal the day the till refused over, then open the caisse.
  //
  // One tap. The alternative the operator meets today is being told to go to
  // the Fiscal screen, find the day and seal it there, which is the second
  // action he was never going to remember in the first place.
  const sealBlockingDay = useMutation({
    mutationFn: (day: string) => api.post("/api/fiscal/close-day", { day }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal"] });
      toast.success("Journée clôturée");
      const retry = pendingOpen;
      setBlockedBy(null);
      setPendingOpen(null);
      if (retry) openMutation.mutate(retry);
    },
    onError: (err) => {
      // The seal itself failed. THIS is the case the SUPER_ADMIN escape exists
      // for, so the dialog stays open and keeps offering it.
      toast.error("Clôture impossible", {
        description: err instanceof ApiError ? err.message : "La journée n'a pas pu être scellée.",
      });
    },
  });

  // --- Close shift mutation ---
  const closeMutation = useMutation({
    mutationFn: (vars: { closingFloat: number; notes?: string; sealDay: boolean }) =>
      api.post<{ zReport: ZReportSummary; cashVariance: number; backup: { filename: string } | null; backupError?: string | null; daySeal?: DaySeal }>(
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
          cutoffHour={settings?.businessDayCutoffHour ?? 5}
          xReport={xReport ?? null}
          xError={xError}
          onShowX={() => setXDialog(true)}
          onClose={() => setCloseDialog(true)}
          onCashMovement={() => setCashDialog(true)}
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
            {/* L-149 (R9.10): « 1 caisses ». The rest of the product uses the
              * `N vente(s)` / `N mouvement(s)` convention. */}
            {shifts?.length ?? 0} caisse{(shifts?.length ?? 0) > 1 ? "s" : ""}
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
                          : formatVariance(s.cashVariance)}
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

      {/* ---------------- Cash movement dialog (M-05, Batch 5.5) ---------------- */}
      <CashMovementDialog open={cashDialog} onOpenChange={setCashDialog} />

      {/* ---------------- Open dialog ---------------- */}
      <OpenShiftDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        onSubmit={(v) => openMutation.mutate(v)}
        loading={openMutation.isPending}
      />

      {/* ---------------- L-228: the day that blocks the caisse ---------------- */}
      <Dialog open={blockedBy !== null} onOpenChange={(o) => !o && setBlockedBy(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Journée non clôturée
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{blockedBy?.message}</p>
          <p className="text-sm text-muted-foreground">
            La caisse ne peut pas être ouverte tant que la journée du{" "}
            <span className="font-medium text-foreground">{blockedBy?.day}</span> n&apos;est pas
            scellée. Elle le sera en une fois ici.
          </p>
          <DialogFooter className="gap-2 sm:flex-col-reverse">
            {/* The escape, and it is only rendered for an account that may take
              * it: offering a button that will answer 403 is worse than not
              * offering one. `canForce` comes from the server, which is also
              * where the refusal is enforced. */}
            {blockedBy?.canForce ? (
              <Button
                variant="outline"
                className="w-full"
                disabled={openMutation.isPending || sealBlockingDay.isPending}
                onClick={() => {
                  const retry = pendingOpen;
                  setBlockedBy(null);
                  setPendingOpen(null);
                  if (retry) openMutation.mutate({ ...retry, force: true });
                }}
              >
                Forcer l&apos;ouverture sans clôturer
              </Button>
            ) : null}
            <Button
              className="w-full"
              disabled={sealBlockingDay.isPending || openMutation.isPending}
              onClick={() => blockedBy && sealBlockingDay.mutate(blockedBy.day)}
            >
              {sealBlockingDay.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LockKeyhole className="h-4 w-4" />
              )}
              Clôturer la journée du {blockedBy?.day} et ouvrir la caisse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  topProducts: { productId: string | null; name: string; quantity: number; total: number }[];
  // L-77 (R2.2) — menus sold, counted once per menu and identified by
  // `comboProductId`. Beside `topProducts`, which counts the components a
  // menu explodes into, and beside `itemsCount`, which counts a menu as one
  // article. The three answer different questions and all three are right.
  topMenus: { comboProductId: string | null; name: string; quantity: number; total: number }[];
  generatedAt: string;
};

function OpenShiftCard({
  shift,
  now,
  cutoffHour,
  xReport,
  xError,
  onShowX,
  onClose,
  onCashMovement,
}: {
  shift: ShiftDto;
  now: Date;
  /** DD-24 (Batch 3.8): the trading-day cut-off, so the notice below fires on a
   *  crossed TRADING day and not on every service that runs past midnight. */
  cutoffHour: number;
  xReport: XReportDto | null;
  xError: boolean;
  onShowX: () => void;
  onClose: () => void;
  onCashMovement: () => void;
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
            {/* L-54 (Batch 3.7). The Z seals THIS till, not a calendar day.
                The regulation requires a daily close and the software provides
                it; running it at the end of every trading day is the
                operator's. Says so here, where the till is closed, and turns
                amber once the till has crossed local midnight. Refusing sales
                on such a till would be a business decision (DD-23), not a
                notice — nothing here blocks anything. */}
            <p className="mt-1.5 text-xs text-muted-foreground">
              La clôture (Z) scelle cette caisse, pas la journée. Clôturez la caisse à la fin
              de chaque journée d&apos;exploitation, puis scellez la{" "}
              <span className="font-medium text-foreground">clôture du jour</span> depuis
              l&apos;écran Fiscal.
            </p>
            {openedOnEarlierBusinessDay(new Date(shift.openedAt), now, cutoffHour) ? (
              <p
                className="mt-1.5 rounded-md border border-amber-500/60 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-800"
                data-testid="till-crossed-midnight"
              >
                Cette caisse a été ouverte un jour antérieur ({formatDateTime(shift.openedAt)}) et
                n&apos;a pas été clôturée : son rapport Z couvrira plusieurs journées.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* M-05 / DD-12 (Batch 5.5): the only way to record cash that moves
              for a reason that is not a sale. Before it, a supplier payment out
              of the drawer had nowhere to go and showed up as a shortfall at
              the close. */}
          <Button variant="outline" onClick={onCashMovement}>
            <ArrowRightLeft className="h-4 w-4" />
            Mouvement de caisse
          </Button>
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
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
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
        {/* M-05 (Batch 5.5) */}
        <Kpi
          label="Mouvements"
          value={
            <Money
              amount={(xReport?.cashInTotal ?? 0) - (xReport?.cashOutTotal ?? 0)}
            />
          }
          hint={`${xReport?.cashMovementsCount ?? 0} mouvement(s)`}
        />
        <Kpi
          label="Espèces attendues"
          value={<Money amount={xReport?.expectedCash ?? 0} />}
          // M-05 (Batch 5.5): the hint said "Fond + ventes espèces", which this
          // batch made untrue — the figure now nets refunds and movements too.
          hint="Fond + espèces − remboursements ± mouvements"
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
  onSubmit: (v: { closingFloat: number; notes?: string; sealDay: boolean }) => void;
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
  onSubmit: (v: { closingFloat: number; notes?: string; sealDay: boolean }) => void;
  onCancel: () => void;
}) {
  // L-228 (2026-09-20) — CLOSING THE CAISSE CLOSES THE DAY, and it is checked.
  //
  // The operator's decision: « once he closed the till, the day is auto
  // closed ». So the ordinary flow is unchanged — count the cash, press the
  // button, the day seals — and this box exists for the one case that would
  // otherwise be expensive.
  //
  // WHY IT IS A BOX AND NOT UNCONDITIONAL. Sealing the day makes guard A refuse
  // every further sale in it, and there is NO override for that: the
  // SUPER_ADMIN escape covers opening a caisse, never a sale into a sealed day.
  // A caisse closed at 15:00 by mistake would therefore cost the evening. One
  // pre-checked box is the cheapest way to make that unreachable by accident.
  const [sealDay, setSealDay] = useState(true);

  // L-132 (R9.10) — EMPTY, not pre-filled with what we already believe.
  //
  // This was `useState((expectedCash / 100).toFixed(2))`, so the default action
  // sealed « Écart nul » and recorded a count that may never have been made —
  // on the screen `z-close.ts`'s own header says exists for « catching missing
  // cash ». Pressing straight through produced a perfect Z.
  //
  // **The operator settled it on 2026-09-14**: start empty, and keep the seal
  // disabled until something is entered. They chose the version that costs them
  // one action at every close, including the ones where nothing is wrong.
  const [countedStr, setCountedStr] = useState("");
  const [notes, setNotes] = useState("");

  // Has a figure been entered at all? `counted` falls back to 0 for an
  // unparseable value, and 0 is a legitimate count — an empty drawer — so
  // « nothing typed » cannot be inferred from the number.
  const hasCount = useMemo(() => {
    const n = parseFloat(countedStr.replace(",", "."));
    return countedStr.trim().length > 0 && Number.isFinite(n) && n >= 0;
  }, [countedStr]);

  const counted = useMemo(() => {
    const n = parseFloat(countedStr.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [countedStr]);

  // expectedCash and openingFloat arrive as CENTS from the API, and
  // Money/formatEuro divide by 100 themselves (format.ts is the single
  // display boundary) — so everything below stays in CENTS. `countedCents`
  // is the exact value submitted as closingFloat, so what the operator is
  // shown and what the Z report records cannot drift apart.
  const countedCents = Math.round(counted * 100);
  const varianceCents = cashVarianceCents(countedCents, expectedCash);
  const v = varianceStyle(varianceCents);

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
            placeholder="Comptez, puis saisissez le total"
            value={countedStr}
            onChange={(e) => setCountedStr(e.target.value)}
            autoFocus
          />
        </div>

        <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Fond de caisse initial</span>
            <Money amount={openingFloat} />
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-muted-foreground">Espèces attendues</span>
            <Money amount={expectedCash} className="font-medium" />
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-muted-foreground">Écart calculé</span>
            {/* L-132: an écart of « 0,00 € » before anything is counted is the
              * claim this finding is about. Until a figure is entered there is
              * no écart to state. */}
            {hasCount ? (
              <span className={cn("font-semibold tnum tabular-nums", v.cls)}>
                {formatVariance(varianceCents)}{" "}
                <span className="ml-1 text-xs font-normal">({v.label})</span>
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>

        {/* L-228 — the second half of the close, where the operator can see it. */}
        <label
          htmlFor="close-seal-day"
          className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/40 p-3"
        >
          <Switch
            id="close-seal-day"
            checked={sealDay}
            onCheckedChange={setSealDay}
            className="mt-0.5 shrink-0"
          />
          <span className="text-sm">
            <span className="font-medium text-foreground">
              Clôturer aussi la journée du {todayLabel()}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Scelle la clôture du jour en même temps que la caisse.{" "}
              <span className="font-medium">Plus aucune vente ne sera possible aujourd&apos;hui.</span>{" "}
              Décochez si vous rouvrez la caisse plus tard dans la journée.
            </span>
          </span>
        </label>

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
          onClick={() =>
            onSubmit({ closingFloat: countedCents, notes: notes.trim() || undefined, sealDay })
          }
          // L-132 (R9.10): a Z cannot be sealed over a count nobody made.
          disabled={loading || !hasCount}
          title={hasCount ? undefined : "Saisissez les espèces comptées pour clôturer."}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
          {sealDay ? "Clôturer la caisse et la journée" : "Générer le rapport Z et clôturer"}
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
            <h3 className="mb-2 mt-5 text-sm font-semibold text-foreground">Menus composés</h3>
            <TopProductsList items={report.topMenus} emptyLabel="Aucun menu vendu." />
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
    backupError?: string | null;
    daySeal?: DaySeal;
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
                {formatVariance(result.cashVariance)}{" "}
                <span className="text-xs font-normal">({v.label})</span>
              </span>
            </div>
          </div>

          {/* L-228 — WHAT THE CLOSE SEALED, and what it could not.
            *
            * The confirmation half is what the operator asked for: he closed
            * the till, and he can see that the day went with it. The failure
            * half matters more — a day that could not be sealed will surface
            * tomorrow morning as a refusal to open the caisse, and meeting it
            * then, with a queue, having never been told, is the shape this
            * whole feature exists to avoid. Same argument as the backup notice
            * below, which C-06 wrote for the same reason. */}
          {result.daySeal && result.daySeal.sealed.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-border bg-primary/5 p-3 text-xs">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-foreground">
                  {result.daySeal.sealed.length > 1
                    ? `${result.daySeal.sealed.length} journées clôturées`
                    : "Journée clôturée"}
                </p>
                <p className="text-muted-foreground">{result.daySeal.sealed.join(" · ")}</p>
              </div>
            </div>
          )}

          {result.daySeal?.failed && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">
                  La journée du {result.daySeal.failed.day} n&apos;a pas pu être clôturée
                </p>
                <p className="text-muted-foreground">{result.daySeal.failed.message}</p>
                <p className="mt-1 text-muted-foreground">
                  Le rapport Z est valide et la caisse est clôturée. La caisse refusera de
                  s&apos;ouvrir tant que cette journée n&apos;est pas scellée — prévenez le
                  responsable.
                </p>
              </div>
            </div>
          )}

          {result.backup && (
            <div className="flex items-start gap-2 rounded-xl border border-border bg-primary/5 p-3 text-xs">
              <DatabaseBackup className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-foreground">Sauvegarde automatique créée</p>
                <p className="text-muted-foreground">{result.backup.filename}</p>
              </div>
            </div>
          )}

          {/* C-06 (Batch 2.2): a failed automatic backup used to be swallowed
              into console.error while the close returned 200, so a restaurant
              could go months believing it was protected. The Z report is still
              valid — that is why this is a warning on a successful close and
              not an error — but it must be impossible to miss. */}
          {result.backupError && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs">
              <DatabaseBackup className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">
                  Échec de la sauvegarde automatique
                </p>
                <p className="text-muted-foreground">{result.backupError}</p>
                <p className="mt-1 text-muted-foreground">
                  Le rapport Z est valide et la caisse est clôturée, mais aucune
                  sauvegarde n&apos;a été créée. Prévenez le responsable.
                </p>
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
