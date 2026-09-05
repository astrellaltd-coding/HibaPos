"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { BackupDto } from "@/types/api";
import { formatDateTime, formatBytes } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  DatabaseBackup,
  Plus,
  Trash2,
  Loader2,
  Info,
  FileArchive,
  RotateCcw,
} from "lucide-react";

export function BackupsView() {
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<BackupDto | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupDto | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");

  const { data: backups, isLoading } = useQuery({
    queryKey: ["backups"],
    queryFn: () => api.get<BackupDto[]>("/api/backups"),
  });

  const create = useMutation({
    mutationFn: () => api.post<BackupDto>("/api/backups"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backups"] });
      toast.success("Sauvegarde créée");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof ApiError ? e.message : "Erreur lors de la sauvegarde");
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/backups/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backups"] });
      toast.success("Sauvegarde supprimée");
      setDeleteTarget(null);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof ApiError ? e.message : "Erreur lors de la suppression");
    },
  });

  const restore = useMutation({
    mutationFn: (id: string) =>
      api.post<{ ok: boolean; safetyBackupId: string | null }>(`/api/backups/${id}/restore`),
    onSuccess: (data) => {
      qc.invalidateQueries(); // The ENTIRE app state comes from the restored DB.
      toast.success("Base restaurée", {
        description: data.safetyBackupId
          ? "Un instantané pré-restauration a été créé — vous pouvez revenir en arrière depuis cette liste."
          : "Un instantané pré-restauration chiffré a été écrit sur le disque.",
      });
      setRestoreTarget(null);
      setRestoreConfirm("");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof ApiError ? e.message : "Échec de la restauration");
    },
  });

  return (
    <div className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <PageHeader
        icon={DatabaseBackup}
        title="Sauvegardes"
        description="Export et restauration des données"
        actions={
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Créer une sauvegarde
          </Button>
        }
      />

      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm text-foreground">
          Une sauvegarde automatique est créée après chaque rapport Z. Les
          sauvegardes sont stockées localement sur le serveur.
        </p>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !backups || backups.length === 0 ? (
        <EmptyState
          icon={FileArchive}
          title="Aucune sauvegarde"
          description="Créez une première sauvegarde pour sécuriser vos données."
          action={
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              <Plus className="h-4 w-4" />
              Créer une sauvegarde
            </Button>
          }
        />
      ) : (
        <div className="max-h-[60vh] overflow-y-auto scroll-thin rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fichier</TableHead>
                <TableHead>Taille</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Créée par</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <span className="font-mono text-xs text-foreground">
                      {b.filename}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono">
                      {formatBytes(b.size)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(b.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {b.createdBy?.name ?? "Système"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setRestoreTarget(b);
                          setRestoreConfirm("");
                        }}
                        aria-label="Restaurer"
                        title="Restaurer cette sauvegarde"
                        className="text-primary hover:bg-primary/10 hover:text-primary"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(b)}
                        aria-label="Supprimer"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {deleteTarget && (
        <AlertDialog open onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer cette sauvegarde ?</AlertDialogTitle>
              <AlertDialogDescription>
                Vous êtes sur le point de supprimer le fichier{" "}
                <span className="font-mono font-semibold text-foreground">
                  {deleteTarget.filename}
                </span>
                . Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={del.isPending}>
                Annuler
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  del.mutate(deleteTarget.id);
                }}
                disabled={del.isPending}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {del.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {restoreTarget && (
        <AlertDialog open onOpenChange={(o) => { if (!o) { setRestoreTarget(null); setRestoreConfirm(""); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restaurer cette sauvegarde ?</AlertDialogTitle>
              <AlertDialogDescription>
                La base de données actuelle sera remplacée par{" "}
                <span className="font-mono font-semibold text-foreground">
                  {restoreTarget.filename}
                </span>{" "}
                ({formatDateTime(restoreTarget.createdAt)}). Un instantané
                chiffré de l'état actuel sera créé automatiquement pour
                permettre un retour arrière. Pour confirmer, saisissez{" "}
                <span className="font-semibold text-foreground">RESTAURER</span>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={restoreConfirm}
              onChange={(e) => setRestoreConfirm(e.target.value)}
              placeholder="RESTAURER"
              autoFocus
            />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={restore.isPending}>
                Annuler
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  restore.mutate(restoreTarget.id);
                }}
                disabled={restore.isPending || restoreConfirm !== "RESTAURER"}
              >
                {restore.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Restaurer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
