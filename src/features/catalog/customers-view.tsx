"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { CustomerDto } from "@/types/api";
import { PageHeader, EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { formatRelativeDateTime } from "@/lib/format";
import { CustomerDetailDialog } from "@/components/pos/customer-detail-dialog";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Mail,
  Phone,
  ShoppingCart,
  X,
  Eye,
} from "lucide-react";

type CustomerForm = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

const EMPTY_FORM: CustomerForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

export function CustomersView() {
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerDto | null>(null);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detailTarget, setDetailTarget] = useState<CustomerDto | null>(null);

  // Debounce search query
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", query],
    queryFn: () =>
      api.get<CustomerDto[]>("/api/customers", query ? { q: query } : undefined),
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

  const openEdit = (c: CustomerDto) => {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      address: c.address ?? "",
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  };

  const createMut = useMutation({
    mutationFn: (body: CustomerForm) =>
      api.post<CustomerDto>("/api/customers", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Client créé");
      closeDialog();
    },
    onError: (e: ApiError) => toast.error(e.message || "Erreur lors de la création"),
  });

  const updateMut = useMutation({
    mutationFn: (body: CustomerForm) =>
      api.put<CustomerDto>(`/api/customers/${editing?.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      // Also invalidate any cached single-customer queries (e.g. the cart
      // panel pulls by id) so post-edit info reflects new state.
      qc.invalidateQueries({ queryKey: ["customer"] });
      toast.success("Client mis à jour");
      closeDialog();
    },
    onError: (e: ApiError) => toast.error(e.message || "Erreur lors de la mise à jour"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/customers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Client supprimé");
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
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("Email invalide");
      return;
    }
    setSaving(true);
    try {
      const payload: CustomerForm = {
        ...form,
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        notes: form.notes.trim(),
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

  const clearSearch = useCallback(() => setSearchInput(""), []);

  return (
    <div className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <PageHeader
        icon={Users}
        title="Clients"
        description="Carnet de clients"
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nouveau client
          </Button>
        }
      />

      <div className="flex items-center gap-2">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Rechercher par nom, téléphone ou email…"
            className="h-11 pl-9 pr-12"
          />
          {searchInput && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={clearSearch}
              className="absolute right-1 top-1/2 h-11 w-11 -translate-y-1/2"
              aria-label="Effacer la recherche"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !customers || customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={query ? "Aucun résultat" : "Aucun client"}
          description={
            query
              ? `Aucun client ne correspond à « ${query} ».`
              : "Ajoutez votre premier client au carnet."
          }
          action={
            !query ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Nouveau client
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="max-h-[60vh] overflow-y-auto scroll-thin rounded-xl border border-border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="pl-4">Nom</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-center">Commandes</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead className="w-[88px] text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-4 font-medium text-foreground">
                    {c.name}
                  </TableCell>
                  <TableCell>
                    {c.phone ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />
                        {c.phone}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.email ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        <span className="truncate">{c.email}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={(c.orderCount ?? 0) > 0 ? "default" : "secondary"}
                      className="gap-1"
                    >
                      <ShoppingCart className="h-3 w-3" />
                      {c.orderCount ?? 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRelativeDateTime(c.createdAt)}
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDetailTarget(c)}
                        aria-label="Détails"
                        title="Voir le détail"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(c)}
                        aria-label="Modifier"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(c)}
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

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Modifier le client" : "Nouveau client"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Mettez à jour les informations du client."
                : "Renseignez les coordonnées du nouveau client."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="cust-name">
                Nom <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cust-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex. Marie Dupont"
                autoFocus
                maxLength={80}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="cust-phone">Téléphone</Label>
                <Input
                  id="cust-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="06 12 34 56 78"
                  maxLength={30}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cust-email">Email</Label>
                <Input
                  id="cust-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="marie@exemple.fr"
                  maxLength={120}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cust-address">Adresse</Label>
              <Textarea
                id="cust-address"
                value={form.address}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
                placeholder="12 rue de la Paix, 75002 Paris"
                rows={2}
                maxLength={200}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cust-notes">Notes</Label>
              <Textarea
                id="cust-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Préférences, allergies, informations utiles…"
                rows={3}
                maxLength={500}
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
            <AlertDialogTitle>Supprimer le client</AlertDialogTitle>
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

      <CustomerDetailDialog
        customer={detailTarget}
        open={!!detailTarget}
        onOpenChange={(v) => !v && setDetailTarget(null)}
      />
    </div>
  );
}
