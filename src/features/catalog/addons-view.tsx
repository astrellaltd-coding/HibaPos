"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { AddOnDto } from "@/types/api";
import { PageHeader, EmptyState } from "@/components/shared/empty-state";
import { ProductImage } from "@/components/shared/product-image";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { PlusCircle, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { MediaPickerDialog } from "@/components/shared/media-picker-dialog";
import { ImagePlus, X } from "lucide-react";

type AddOnForm = {
  name: string;
  price: number;
  image: string;
  active: boolean;
  sortOrder: number;
};

type AddOnPayload = {
  name: string;
  price: number;
  image: string | null;
  active: boolean;
  sortOrder: number;
};

const EMPTY_FORM: AddOnForm = {
  name: "",
  price: 0,
  image: "➕",
  active: true,
  sortOrder: 0,
};

export function AddonsView() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AddOnDto | null>(null);
  const [form, setForm] = useState<AddOnForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AddOnDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: addons, isLoading } = useQuery({
    queryKey: ["addons"],
    queryFn: () => api.get<AddOnDto[]>("/api/catalog/addons?all=1"),
  });

  // Reset form state on dialog CLOSE — done here instead of in an effect to
  // satisfy the react-hooks/set-state-in-effect rule.
  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (a: AddOnDto) => {
    setEditing(a);
    setForm({
      name: a.name,
      price: a.price,
      image: a.image ?? "➕",
      active: a.active,
      sortOrder: a.sortOrder,
    });
    setDialogOpen(true);
  };

  const createMut = useMutation({
    mutationFn: (body: AddOnPayload) =>
      api.post<AddOnDto>("/api/catalog/addons", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addons"] });
      toast.success("Supplément créé");
      closeDialog();
    },
    onError: (e: ApiError) => toast.error(e.message || "Erreur lors de la création"),
  });

  const updateMut = useMutation({
    mutationFn: (body: AddOnPayload) =>
      api.put<AddOnDto>(`/api/catalog/addons/${editing?.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addons"] });
      toast.success("Supplément mis à jour");
      closeDialog();
    },
    onError: (e: ApiError) => toast.error(e.message || "Erreur lors de la mise à jour"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/catalog/addons/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addons"] });
      toast.success("Supplément supprimé");
      setDeleteTarget(null);
    },
    onError: (e: ApiError) => toast.error(e.message || "Erreur lors de la suppression"),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Le nom est requis");
      return;
    }
    if (form.price < 0) {
      toast.error("Le prix doit être positif");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        price: Number(form.price) || 0,
        image: form.image.trim() || null,
        active: form.active,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (editing) {
        await updateMut.mutateAsync(payload);
      } else {
        await createMut.mutateAsync(payload);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <PageHeader
        icon={PlusCircle}
        title="Suppléments"
        description="Extras proposés à la caisse"
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nouveau supplément
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !addons || addons.length === 0 ? (
        <EmptyState
          icon={PlusCircle}
          title="Aucun supplément"
          description="Ajoutez des extras (sauces, suppléments, boissons…) proposés à la caisse."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nouveau supplément
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {addons.map((a) => (
            <AddOnCard
              key={a.id}
              addon={a}
              onEdit={() => openEdit(a)}
              onDelete={() => setDeleteTarget(a)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Modifier le supplément" : "Nouveau supplément"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Mettez à jour les informations du supplément."
                : "Renseignez les informations du nouveau supplément."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="addon-name">Nom</Label>
              <Input
                id="addon-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex. Sauce supplémentaire"
                autoFocus
                maxLength={60}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="addon-price">Prix (€)</Label>
                <div className="relative">
                  <Input
                    id="addon-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))
                    }
                    className="pr-8"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                    €
                  </span>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="addon-sort">Ordre de tri</Label>
                <Input
                  id="addon-sort"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      sortOrder: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  min={0}
                />
              </div>
            </div>

            {/* Icon — emoji or image from media center */}
            <MediaPickerDialog
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              currentUrl={form.image.startsWith("/") ? form.image : null}
              title="Image du supplement"
              defaultFolder="Options"
              onSelect={(url) => setForm((f) => ({ ...f, image: url }))}
            />
            <div className="grid gap-2">
              <Label>Image (optionnel)</Label>
              {form.image && (form.image.startsWith("/") || form.image.startsWith("http")) ? (
                <div className="relative overflow-hidden rounded-xl border border-border bg-muted/30">
                  <img src={form.image} alt="" className="h-24 w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, image: "" }))}
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-lg bg-black/50 px-2 py-1 text-xs text-white hover:bg-black/70"
                  >
                    <ImagePlus className="h-3.5 w-3.5" /> Changer
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={form.image}
                    onChange={(e) => setForm((f) => ({ ...f, image: e.target.value.slice(0, 200) }))}
                    placeholder="🧀 ou laisser vide"
                    maxLength={200}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary"
                  >
                    <ImagePlus className="h-3.5 w-3.5" /> Mediath.
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <div>
                <Label htmlFor="addon-active" className="cursor-pointer">
                  Supplément actif
                </Label>
                <p className="text-xs text-muted-foreground">
                  Les suppléments inactifs ne sont pas proposés à la caisse.
                </p>
              </div>
              <Switch
                id="addon-active"
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeDialog}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Enregistrer" : "Créer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le supplément</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer{" "}
              <span className="font-semibold text-foreground">
                {deleteTarget?.name}
              </span>{" "}
              ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddOnCard({
  addon,
  onEdit,
  onDelete,
}: {
  addon: AddOnDto;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <ProductImage
          image={addon.image}
          alt={addon.name}
          className="h-12 w-12 shrink-0 rounded-lg text-2xl"
          glyphClassName="text-2xl"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-foreground">
            {addon.name}
          </h3>
          <div className="mt-0.5 flex items-center gap-2">
            <Money amount={addon.price} className="text-sm font-bold text-primary" />
          </div>
        </div>
        <Badge variant={addon.active ? "default" : "secondary"}>
          {addon.active ? "Actif" : "Inactif"}
        </Badge>
      </div>

      <div className="flex items-center justify-end gap-1 border-t border-border pt-2">
        <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Modifier">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label="Supprimer"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
