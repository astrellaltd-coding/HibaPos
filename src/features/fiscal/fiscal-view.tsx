"use client";

// C-27 (Batch 3.4) — the fiscal operator interface.
//
// Every /api/fiscal/* endpoint existed, was role-gated and was tested, and not
// one of them had a caller. The Conservation and Archivage mechanisms were
// implemented but an operator could not perform them: no screen sealed a
// month, sealed a year, generated an archive, downloaded one for an inspector,
// or ran the chain verification the attestation names as its tamper-detection
// control. This screen is that surface.
//
// Role gates are the server's (`withAuth({roles})`); the UI mirrors them so an
// operator is not offered a button that will 403. Closing a year and
// generating an archive are SUPER_ADMIN; everything else is MANAGER+.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";
import { PageHeader } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Money } from "@/components/shared/money";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";
import { lastCompletedMonth, lastCompletedYear } from "@/lib/period";
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Archive,
  Download,
  ScrollText,
  Sigma,
  Loader2,
  Inbox,
  RefreshCw,
} from "lucide-react";

type ChainResult = { ok: boolean; checked?: number; eventsChecked?: number; firstBreakAt: number | string | null; total?: number };
type VerifyResult = {
  fiscalEvents: ChainResult;
  monthlyCloses: ChainResult;
  annualCloses: ChainResult;
  grandTotal: GrandTotalDto | null;
};
type GrandTotalDto = {
  totalSales: number;
  totalOrders: number;
  totalVat: number;
  totalCash: number;
  totalCard: number;
  totalVoucher: number;
  totalRefunded: number;
  lastUpdatedAt: string | null;
};
type CloseRow = {
  id: string;
  period: string;
  salesTotal: number;
  salesCount: number;
  vatTotal: number;
  refundsTotal: number;
  refundsCount: number;
  sealedAt: string;
  hash: string;
  previousHash: string | null;
};
type ArchiveRow = {
  id: string;
  year: number;
  filename: string;
  checksum: string;
  sizeBytes: number;
  generatedAt: string;
};
type FiscalEventRow = {
  id: string;
  sequence: number;
  type: string;
  timestamp: string;
  factice: boolean;
  hash: string;
  dataJson: string;
};

function ChainBadge({ label, result }: { label: string; result: ChainResult | undefined }) {
  if (!result) return null;
  const checked = result.eventsChecked ?? result.checked ?? 0;
  return (
    <div
      className={
        "flex items-start gap-3 rounded-lg border px-3 py-2.5 " +
        (result.ok
          ? "border-emerald-500/50 bg-emerald-500/[0.06]"
          : "border-destructive/60 bg-destructive/10")
      }
    >
      {result.ok ? (
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">
          {result.ok
            ? `${checked} entrée${checked > 1 ? "s" : ""} vérifiée${checked > 1 ? "s" : ""} — chaîne intacte`
            : `Rupture détectée à la séquence ${String(result.firstBreakAt)}`}
        </p>
      </div>
    </div>
  );
}

export function FiscalView() {
  const qc = useQueryClient();
  const user = useAppStore((s) => s.user);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const now = new Date();

  // L-25 (Batch 3.6b): the month field used to propose the CURRENT month —
  // the one period the server now refuses, and the one whose premature seal
  // is unrepairable. Both close fields propose the last completed period.
  const proposedMonth = lastCompletedMonth(now);
  const [closeYearInput, setCloseYearInput] = useState(proposedMonth.year);
  const [closeMonthInput, setCloseMonthInput] = useState(proposedMonth.month);
  const [annualYearInput, setAnnualYearInput] = useState(lastCompletedYear(now));
  const [archiveYearInput, setArchiveYearInput] = useState(now.getFullYear() - 1);
  const [drawerReason, setDrawerReason] = useState("");

  const verify = useQuery({
    queryKey: ["fiscal", "verify"],
    queryFn: () => api.get<VerifyResult>("/api/fiscal/verify"),
  });
  const grandTotal = useQuery({
    queryKey: ["fiscal", "grand-total"],
    queryFn: () => api.get<GrandTotalDto>("/api/fiscal/grand-total"),
  });
  const closes = useQuery({
    queryKey: ["fiscal", "closes"],
    queryFn: () => api.get<{ monthly: CloseRow[]; annual: CloseRow[] }>("/api/fiscal/closes"),
  });
  const archives = useQuery({
    queryKey: ["fiscal", "archives"],
    queryFn: () => api.get<ArchiveRow[]>("/api/fiscal/archive"),
  });
  const events = useQuery({
    queryKey: ["fiscal", "events"],
    queryFn: () => api.get<FiscalEventRow[]>("/api/fiscal/events", { limit: 50 }),
  });

  const fail = (e: unknown, fallback: string) =>
    toast.error(e instanceof ApiError ? e.message : fallback);

  const closeMonth = useMutation({
    mutationFn: () =>
      api.post("/api/fiscal/close-month", { year: closeYearInput, month: closeMonthInput }),
    onSuccess: () => {
      toast.success(`Clôture mensuelle scellée — ${closeYearInput}-${String(closeMonthInput).padStart(2, "0")}`);
      qc.invalidateQueries({ queryKey: ["fiscal"] });
    },
    onError: (e) => fail(e, "Échec de la clôture mensuelle"),
  });

  const closeYear = useMutation({
    mutationFn: () => api.post("/api/fiscal/close-year", { year: annualYearInput }),
    onSuccess: () => {
      toast.success(`Clôture annuelle scellée — ${annualYearInput}`);
      qc.invalidateQueries({ queryKey: ["fiscal"] });
    },
    onError: (e) => fail(e, "Échec de la clôture annuelle"),
  });

  const generateArchive = useMutation({
    mutationFn: () =>
      api.post<{ filename: string; checksum: string; repaired?: boolean }>("/api/fiscal/archive", {
        year: archiveYearInput,
      }),
    onSuccess: (r) => {
      toast.success(
        r.repaired
          ? `Fichier de l'archive ${archiveYearInput} restauré à l'identique`
          : `Archive ${archiveYearInput} générée — ${r.checksum.slice(0, 12)}…`,
      );
      qc.invalidateQueries({ queryKey: ["fiscal", "archives"] });
    },
    onError: (e) => fail(e, "Échec de la génération de l'archive"),
  });

  const openDrawer = useMutation({
    mutationFn: () => api.post("/api/fiscal/drawer", { reason: drawerReason.trim() || undefined }),
    onSuccess: () => {
      toast.success("Ouverture de tiroir enregistrée au journal fiscal");
      setDrawerReason("");
      qc.invalidateQueries({ queryKey: ["fiscal", "events"] });
    },
    onError: (e) => fail(e, "Échec de l'ouverture du tiroir"),
  });

  const chainsOk =
    verify.data?.fiscalEvents.ok && verify.data?.monthlyCloses.ok && verify.data?.annualCloses.ok;

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5 lg:p-6">
      <PageHeader
        icon={ShieldCheck}
        title="Fiscal (JFP)"
        description="Journal fiscal, clôtures scellées, archives et vérification des chaînes"
      />

      {/* --- Vérification des chaînes ------------------------------------ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {chainsOk === false ? (
              <ShieldAlert className="h-4 w-4 text-destructive" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-primary" />
            )}
            Vérification d&apos;intégrité
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => verify.refetch()}
            disabled={verify.isFetching}
          >
            {verify.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Relancer
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {verify.isLoading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : (
            <>
              <ChainBadge label="Journal fiscal (JFP)" result={verify.data?.fiscalEvents} />
              <ChainBadge label="Clôtures mensuelles" result={verify.data?.monthlyCloses} />
              <ChainBadge label="Clôtures annuelles" result={verify.data?.annualCloses} />
              <p className="text-xs text-muted-foreground">
                Ce contrôle recalcule chaque condensat SHA-256 et le compare à celui enregistré.
                C&apos;est le contrôle de détection d&apos;altération cité par l&apos;attestation de
                conformité ; un inspecteur peut en demander l&apos;exécution.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* --- Grand total perpétuel --------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sigma className="h-4 w-4 text-primary" />
            Grand total perpétuel
          </CardTitle>
        </CardHeader>
        <CardContent>
          {grandTotal.isLoading ? (
            <Skeleton className="h-16 w-full rounded-lg" />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Ventes cumulées", value: grandTotal.data?.totalSales ?? 0 },
                  { label: "TVA cumulée", value: grandTotal.data?.totalVat ?? 0 },
                  { label: "Espèces", value: grandTotal.data?.totalCash ?? 0 },
                  { label: "Carte", value: grandTotal.data?.totalCard ?? 0 },
                  { label: "Titres-restaurant", value: grandTotal.data?.totalVoucher ?? 0 },
                  { label: "Remboursements", value: grandTotal.data?.totalRefunded ?? 0 },
                ].map((k) => (
                  <div key={k.label} className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      <Money amount={k.value} />
                    </p>
                  </div>
                ))}
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Commandes</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {grandTotal.data?.totalOrders ?? 0}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Compteur perpétuel : il ne se remet jamais à zéro, y compris à la clôture.
                {grandTotal.data?.lastUpdatedAt
                  ? ` Dernière mise à jour : ${formatDateTime(grandTotal.data.lastUpdatedAt)}.`
                  : ""}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* --- Clôtures ----------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-primary" />
            Clôtures scellées
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cm-year">Année</Label>
              <Input
                id="cm-year"
                type="number"
                className="w-28"
                value={closeYearInput}
                onChange={(e) => setCloseYearInput(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cm-month">Mois</Label>
              <Input
                id="cm-month"
                type="number"
                min={1}
                max={12}
                className="w-24"
                value={closeMonthInput}
                onChange={(e) => setCloseMonthInput(Number(e.target.value))}
              />
            </div>
            <Button type="button" onClick={() => closeMonth.mutate()} disabled={closeMonth.isPending}>
              {closeMonth.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Clôturer le mois
            </Button>
            <p className="text-xs text-muted-foreground">
              Irréversible : une clôture scellée ne peut être ni modifiée ni supprimée. Un mois ne
              peut être clôturé qu&apos;une fois terminé, et toutes ses caisses clôturées.
            </p>
          </div>

          {isSuperAdmin && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cy-year">Exercice</Label>
                <Input
                  id="cy-year"
                  type="number"
                  className="w-28"
                  value={annualYearInput}
                  onChange={(e) => setAnnualYearInput(Number(e.target.value))}
                />
              </div>
              <Button type="button" onClick={() => closeYear.mutate()} disabled={closeYear.isPending}>
                {closeYear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Clôturer l&apos;exercice
              </Button>
              <p className="text-xs text-muted-foreground">
                Réservé au super administrateur. Clôturez les douze mois avant l&apos;exercice. Un
                exercice ne peut être clôturé qu&apos;une fois terminé.
              </p>
            </div>
          )}

          <Separator />

          {closes.isLoading ? (
            <Skeleton className="h-20 w-full rounded-lg" />
          ) : (closes.data?.monthly.length ?? 0) + (closes.data?.annual.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
              Aucune clôture scellée pour le moment.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Période</th>
                    <th className="py-2 pr-3 text-right">Ventes</th>
                    <th className="py-2 pr-3 text-right">TVA</th>
                    <th className="py-2 pr-3 text-right">Remboursements</th>
                    <th className="py-2 pr-3">Scellée le</th>
                    <th className="py-2">Condensat</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(closes.data?.annual ?? []), ...(closes.data?.monthly ?? [])].map((c) => (
                    <tr key={c.id} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-medium">{c.period}</td>
                      <td className="py-2 pr-3 text-right tabular-nums"><Money amount={c.salesTotal} /></td>
                      <td className="py-2 pr-3 text-right tabular-nums"><Money amount={c.vatTotal} /></td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        <Money amount={c.refundsTotal} />
                        <span className="ml-1 text-xs text-muted-foreground">× {c.refundsCount}</span>
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{formatDateTime(c.sealedAt)}</td>
                      <td className="py-2 font-mono text-[11px] text-muted-foreground">{c.hash.slice(0, 16)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Archives ----------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Archive className="h-4 w-4 text-primary" />
            Archives annuelles
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isSuperAdmin && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ar-year">Exercice</Label>
                <Input
                  id="ar-year"
                  type="number"
                  className="w-28"
                  value={archiveYearInput}
                  onChange={(e) => setArchiveYearInput(Number(e.target.value))}
                />
              </div>
              <Button
                type="button"
                onClick={() => generateArchive.mutate()}
                disabled={generateArchive.isPending}
              >
                {generateArchive.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                Générer l&apos;archive
              </Button>
              <p className="text-xs text-muted-foreground">
                Produit un JSON ouvert + un fichier .sha256 vérifiable avec{" "}
                <code className="rounded bg-muted px-1">sha256sum -c</code>.
              </p>
            </div>
          )}

          {archives.isLoading ? (
            <Skeleton className="h-16 w-full rounded-lg" />
          ) : (archives.data?.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
              Aucune archive générée.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {archives.data?.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{a.filename}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      SHA-256 {a.checksum.slice(0, 24)}… · {(a.sizeBytes / 1024).toFixed(0)} Kio
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/fiscal/archive/${a.year}`} download={a.filename}>
                      <Download className="h-4 w-4" />
                      Télécharger
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Tiroir-caisse ------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="h-4 w-4 text-primary" />
            Ouverture de tiroir tracée
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <Label htmlFor="drawer-reason">Motif (facultatif)</Label>
            <Input
              id="drawer-reason"
              value={drawerReason}
              onChange={(e) => setDrawerReason(e.target.value)}
              placeholder="Appoint, correction d'erreur…"
              maxLength={280}
            />
          </div>
          <Button type="button" variant="outline" onClick={() => openDrawer.mutate()} disabled={openDrawer.isPending}>
            {openDrawer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Inbox className="h-4 w-4" />}
            Ouvrir le tiroir
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Écrit un événement <code className="rounded bg-muted px-1">OUVERTURE_TIROIR</code> au
            journal fiscal, et déclenche l&apos;impulsion physique si une imprimante est configurée.
          </p>
        </CardContent>
      </Card>

      {/* --- Journal ------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4 text-primary" />
            Journal fiscal — 50 dernières entrées
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.isLoading ? (
            <Skeleton className="h-32 w-full rounded-lg" />
          ) : (events.data?.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
              Journal vide.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Séq.</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Horodatage</th>
                    <th className="py-2">Condensat</th>
                  </tr>
                </thead>
                <tbody>
                  {events.data?.map((e) => (
                    <tr key={e.id} className="border-b border-border/60">
                      <td className="py-2 pr-3 tabular-nums">{e.sequence}</td>
                      <td className="py-2 pr-3">
                        <span className="font-medium">{e.type}</span>
                        {e.factice && (
                          <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                            FACTICE
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{formatDateTime(e.timestamp)}</td>
                      <td className="py-2 font-mono text-[11px] text-muted-foreground">{e.hash.slice(0, 16)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
