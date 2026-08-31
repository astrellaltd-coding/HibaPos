"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { TableDto, TableStatus } from "@/types/api";
import { PageHeader, EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Grid3x3,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Users,
  CheckCircle2,
  Clock3,
  Armchair,
  Unlock,
} from "lucide-react";

type TableForm = {
  label: string;
  seats: number;
  zone: string;
  sortOrder: number;
};

const EMPTY_FORM: TableForm = { label: "", seats: 4, zone: "Salle", sortOrder: 0 };

const STATUS_CONFIG: Record<TableStatus, { label: string; color: string; bg: string; border: string; icon: typeof CheckCircle2 }> = {
  FREE: {
    label: "Libre",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    icon: CheckCircle2,
  },
  OCCUPIED: {
    label: "Occupée",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-300",
    icon: Clock3,
  },
  RESERVED: {
    label: "Réservée",
    color: "text-sky-700",
    bg: "bg-sky-50",
    border: "border-sky-300",
    icon: Users,
  },
};

export function TablesView() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TableDto | null>(null);
  const [form, setForm] = useState<TableForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TableDto | null>(null);

  const { data: tables, isLoading } = useQuery({
    queryKey: ["tables"],
    queryFn: () => api.get<TableDto[]>("/api/tables"),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: TableStatus }) =>
      api.put<TableDto>(`/api/tables/${vars.id}`, {
        status: vars.status,
        ...(vars.status === "FREE" ? { currentOrderId: null } : {}),
      }),
    // Optimistic update (Phase 11a): cycle the status badge instantly on tap.
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["tables"] });
      const previous = qc.getQueryData<TableDto[]>(["tables"]);
      if (previous) {
        qc.setQueryData<TableDto[]>(
          ["tables"],
          previous.map((t) =>
            t.id === vars.id
              ? { ...t, status: vars.status, ...(vars.status === "FREE" ? { currentOrderId: null } : {}) }
              : t,
          ),
        );
      }
      return { previous };
    },
    onError: (e, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(["tables"], context.previous);
      }
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tables"] });
    },
  });

  const grouped = (tables ?? []).reduce<Record<string, TableDto[]>>((acc, t) => {
    const zone = t.zone ?? "Autre";
    (acc[zone] ??= []).push(t);
    return acc;
  }, {});

  const stats = {
    total: tables?.length ?? 0,
    free: tables?.filter((t) => t.status === "FREE").length ?? 0,
    occupied: tables?.filter((t) => t.status === "OCCUPIED").length ?? 0,
    reserved: tables?.filter((t) => t.status === "RESERVED").length ?? 0,
  };

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(t: TableDto) {
    setEditing(t);
    setForm({ label: t.label, seats: t.seats, zone: t.zone ?? "Salle", sortOrder: t.sortOrder });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.label.trim()) {
      toast.error("Le nom de la table est requis");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, zone: form.zone.trim() || null };
      if (editing) {
        await api.put(`/api/tables/${editing.id}`, payload);
        toast.success("Table mise à jour");
      } else {
        await api.post("/api/tables", payload);
        toast.success("Table créée");
      }
      qc.invalidateQueries({ queryKey: ["tables"] });
      setDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/tables/${deleteTarget.id}`);
      toast.success("Table supprimée");
      qc.invalidateQueries({ queryKey: ["tables"] });
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur");
    }
  }

  return (
    <div className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <PageHeader
        icon={Grid3x3}
        title="Tables"
        description="Plan de salle et gestion des tables"
        actions={
          <div className="flex items-center gap-2">
            {stats.occupied > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={async () => {
                  try {
                    const occupied = tables?.filter((t) => t.status === "OCCUPIED") ?? [];
                    await Promise.all(
                      occupied.map((t) =>
                        api.put(`/api/tables/${t.id}`, { status: "FREE", currentOrderId: null }),
                      ),
                    );
                    qc.invalidateQueries({ queryKey: ["tables"] });
                    toast.success(`${occupied.length} table(s) libérée(s)`);
                  } catch {
                    toast.error("Erreur lors de la libération");
                  }
                }}
              >
                <Unlock className="h-4 w-4" /> Libérer tout
              </Button>
            )}
            <Button className="gap-1.5" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Nouvelle table
            </Button>
          </div>
        }
      />

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatPill label="Total" value={stats.total} icon={Grid3x3} tone="muted" />
        <StatPill label="Libres" value={stats.free} icon={CheckCircle2} tone="emerald" />
        <StatPill label="Occupées" value={stats.occupied} icon={Clock3} tone="amber" />
        <StatPill label="Réservées" value={stats.reserved} icon={Users} tone="sky" />
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
        </div>
      ) : !tables || tables.length === 0 ? (
        <EmptyState
          icon={Grid3x3}
          title="Aucune table"
          description="Créez votre première table pour démarrer le plan de salle."
          action={
            <Button className="gap-1.5" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Créer une table
            </Button>
          }
        />
      ) : (
        <div className="scroll-thin flex-1 space-y-6 overflow-y-auto">
          {Object.entries(grouped).map(([zone, zoneTables]) => (
            <div key={zone}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{zone}</h2>
                <Badge variant="secondary" className="text-xs">{zoneTables.length}</Badge>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {zoneTables.map((t) => (
                  <TableCard
                    key={t.id}
                    table={t}
                    onStatusChange={(status) => statusMutation.mutate({ id: t.id, status })}
                    onEdit={() => openEdit(t)}
                    onDelete={() => setDeleteTarget(t)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier la table" : "Nouvelle table"}</DialogTitle>
            <DialogDescription>
              {editing ? "Modifiez les informations de la table." : "Ajoutez une table au plan de salle."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block text-xs">Nom / N° *</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="ex. T1, Terrasse 2"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block text-xs">Couverts</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={form.seats}
                  onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Zone</Label>
                <Input
                  value={form.zone}
                  onChange={(e) => setForm({ ...form, zone: e.target.value })}
                  placeholder="Salle, Terrasse…"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la table</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer la table{" "}
              <span className="font-semibold text-foreground">{deleteTarget?.label}</span> ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatPill({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Grid3x3;
  tone: "muted" | "emerald" | "amber" | "sky";
}) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    sky: "bg-sky-50 text-sky-700",
  };
  return (
    <div className={cn("flex items-center gap-2.5 rounded-xl border border-border px-4 py-2.5", tones[tone])}>
      <Icon className="h-4 w-4 shrink-0" />
      <div className="leading-tight">
        <p className="text-lg font-bold tabular-nums">{value}</p>
        <p className="text-[11px] opacity-80">{label}</p>
      </div>
    </div>
  );
}

function TableCard({
  table,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  table: TableDto;
  onStatusChange: (status: TableStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cfg = STATUS_CONFIG[table.status];
  const StatusIcon = cfg.icon;

  // Cycle through statuses on click
  const nextStatus: TableStatus =
    table.status === "FREE" ? "OCCUPIED" : table.status === "OCCUPIED" ? "RESERVED" : "FREE";

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border-2 p-3.5 transition-all hover:shadow-md",
        cfg.bg,
        cfg.border,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Armchair className={cn("h-5 w-5", cfg.color)} />
          <span className="text-lg font-bold text-foreground">{table.label}</span>
        </div>
        <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onEdit}
            aria-label="Modifier la table"
            className="flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:bg-foreground/10"
            title="Modifier"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={onDelete}
            aria-label="Supprimer la table"
            className="flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Supprimer"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Seats */}
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Users className="h-3 w-3" /> {table.seats} couverts
      </p>

      {/* Status badge - clickable to cycle */}
      <button
        onClick={() => onStatusChange(nextStatus)}
        className={cn(
          "mt-3 flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-all active:scale-95",
          cfg.bg,
          cfg.border,
          cfg.color,
        )}
        title="Cliquer pour changer le statut"
      >
        <StatusIcon className="h-3.5 w-3.5" />
        {cfg.label}
      </button>

      {/* Quick free button for occupied tables */}
      {table.status === "OCCUPIED" && (
        <button
          onClick={() => onStatusChange("FREE")}
          className="mt-1.5 flex items-center justify-center gap-1 rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition-all hover:bg-emerald-200 active:scale-95"
          title="Libérer la table"
        >
          <Unlock className="h-3 w-3" />
          Libérer
        </button>
      )}
    </div>
  );
}
