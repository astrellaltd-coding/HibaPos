"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { BackupDto, BackupStorageDto } from "@/types/api";
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
  HardDrive,
  TriangleAlert,
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

  // L-190 / L-194 — what is ACTUALLY on disk, against what the table believes.
  // Its own query because its own endpoint: the listing above is a table read,
  // this one walks the folder. A failure here must never blank the list, so it
  // is read as « nothing to report » rather than surfaced as an error — the
  // screen's job is the backups, and this is the annotation beside them.
  const { data: storage } = useQuery({
    queryKey: ["backups", "storage"],
    queryFn: () => api.get<BackupStorageDto>("/api/backups/storage"),
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

      {/* L-194 — C-06 IS THE REASON `BACKUP_LOCATION` EXISTS, and nothing had
          ever checked it. Measured 2026-09-14: the folder everyone believed was
          syncing is a plain directory, and `C:` is the only volume — every copy
          of the restaurant's data on one disk, with nothing saying so.
          It WARNS and does not block: a backup on the wrong disk beats none. */}
      {storage?.volume === "SAME" && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-destructive">
              Les sauvegardes sont sur le même disque que la base de données.
            </p>
            <p className="text-foreground">
              Une copie sur le même disque n&apos;est pas une sauvegarde : une panne
              emporte les deux. Indiquez un autre volume (clé USB, second disque,
              partage réseau) dans <span className="font-mono text-xs">BACKUP_LOCATION</span>.
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {storage.directory}
              <br />
              {storage.databaseDirectory}
            </p>
          </div>
        </div>
      )}

      {/* L-190 — the folder and the table can drift, and the application
          believes the table. `missing` is the one that bites: a backup listed
          here that is not on disk, found out at the moment of a restore. */}
      {storage && storage.missing.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-destructive">
              {storage.missing.length} sauvegarde(s) introuvable(s) sur le disque.
            </p>
            <p className="text-foreground">
              Ces sauvegardes sont listées ici mais le fichier n&apos;existe plus.
              Une restauration échouerait. Ne comptez pas dessus.
            </p>
            <ul className="font-mono text-[11px] text-muted-foreground">
              {storage.missing.map((m) => (
                <li key={m.id}>{m.filename}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* The harmless direction, and still worth saying: the retention prune
          keeps the newest N ROWS, so a file with no row is never removed. */}
      {storage && storage.unmanaged.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
          <FileArchive className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-foreground">
              {storage.unmanaged.length} fichier(s) non géré(s) dans le dossier.
            </p>
            <p className="text-foreground">
              Présents sur le disque mais inconnus de l&apos;application : ils
              n&apos;apparaissent pas ci-dessous et la purge automatique ne les
              supprimera jamais. À supprimer à la main si vous n&apos;en voulez plus.
            </p>
            <ul className="font-mono text-[11px] text-muted-foreground">
              {storage.unmanaged.map((u) => (
                <li key={u.filename}>
                  {u.filename} · {formatBytes(u.sizeBytes)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

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
