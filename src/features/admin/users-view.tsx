"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { UserDto, Role } from "@/types/api";
import { formatRelativeDateTime } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  UserCog,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Users,
  ShieldCheck,
} from "lucide-react";

type CreateBody = {
  username: string;
  name: string;
  role: Role;
  pin: string;
  active: boolean;
};

type UpdateBody = {
  name?: string;
  role?: Role;
  pin?: string;
  active?: boolean;
};

function RoleBadge({ role }: { role: Role }) {
  if (role === "SUPER_ADMIN") {
    return (
      <Badge className="bg-primary/15 text-primary border-primary/30">
        <ShieldCheck className="h-3 w-3" />
        Super Admin
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-muted text-muted-foreground">
      Gérant
    </Badge>
  );
}

function PinInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={6}
      value={value}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, "").slice(0, 6);
        onChange(v);
      }}
      placeholder={placeholder ?? "••••••"}
      className="tnum tracking-[0.4em]"
    />
  );
}

export function UsersView() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserDto | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<UserDto[]>("/api/users"),
  });

  const toggleActive = useMutation({
    mutationFn: (u: UserDto) =>
      api.put<UserDto>(`/api/users/${u.id}`, { active: !u.active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Statut mis à jour");
    },
    onError: (e: unknown) => {
      toast.error(
        e instanceof ApiError ? e.message : "Erreur lors de la mise à jour",
      );
    },
  });

  return (
    <div className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <PageHeader
        icon={UserCog}
        title="Utilisateurs"
        description="Comptes caissiers et administrateurs"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Nouvel utilisateur
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !users || users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun utilisateur"
          description="Créez votre premier utilisateur pour commencer."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Nouvel utilisateur
            </Button>
          }
        />
      ) : (
        <div className="max-h-[60vh] overflow-y-auto scroll-thin rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Nom d&apos;utilisateur</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-foreground">
                    {u.name}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {u.username}
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={u.role} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={u.active}
                        disabled={toggleActive.isPending}
                        onCheckedChange={() => toggleActive.mutate(u)}
                      />
                      <span
                        className={
                          u.active
                            ? "text-xs text-emerald-600"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        {u.active ? "Actif" : "Inactif"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatRelativeDateTime(u.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing(u)}
                        aria-label="Modifier"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(u)}
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

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing && (
        <EditUserDialog user={editing} onOpenChange={(o) => !o && setEditing(null)} />
      )}
      {deleteTarget && (
        <DeleteUserDialog
          user={deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>("MANAGER");
  const [pin, setPin] = useState("");
  const [active, setActive] = useState(true);

  const reset = () => {
    setName("");
    setUsername("");
    setRole("MANAGER");
    setPin("");
    setActive(true);
  };

  const create = useMutation({
    mutationFn: (body: CreateBody) => api.post<UserDto>("/api/users", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Utilisateur créé");
      reset();
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof ApiError ? e.message : "Erreur lors de la création");
    },
  });

  const pinValid = /^\d{6}$/.test(pin);
  const canSubmit =
    name.trim().length > 0 &&
    username.trim().length >= 3 &&
    pinValid &&
    !create.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    create.mutate({
      username: username.trim(),
      name: name.trim(),
      role,
      pin,
      active,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvel utilisateur</DialogTitle>
          <DialogDescription>
            Créez un compte caissier ou administrateur.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-name">Nom complet</Label>
            <Input
              id="u-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Marie Dupont"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-username">Nom d&apos;utilisateur</Label>
            <Input
              id="u-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="marie"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <p className="text-xs text-muted-foreground">
              Minimum 3 caractères.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-role">Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="u-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MANAGER">Gérant</SelectItem>
                <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-pin">Code PIN (6 chiffres)</Label>
            <PinInput value={pin} onChange={setPin} />
            {!pinValid && pin.length > 0 && (
              <p className="text-xs text-destructive">
                Le PIN doit comporter exactement 6 chiffres.
              </p>
            )}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Compte actif</p>
              <p className="text-xs text-muted-foreground">
                Désactivez pour bloquer l&apos;accès sans supprimer.
              </p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  onOpenChange,
}: {
  user: UserDto;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [pin, setPin] = useState("");
  const [active, setActive] = useState(user.active);

  const update = useMutation({
    mutationFn: (body: UpdateBody) =>
      api.put<UserDto>(`/api/users/${user.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Utilisateur modifié");
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof ApiError ? e.message : "Erreur lors de la modification");
    },
  });

  const pinValid = pin === "" || /^\d{6}$/.test(pin);
  const canSubmit =
    name.trim().length > 0 && pinValid && !update.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const body: UpdateBody = {
      name: name.trim(),
      role,
      active,
    };
    if (pin) body.pin = pin;
    update.mutate(body);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier l&apos;utilisateur</DialogTitle>
          <DialogDescription>
            {user.username} — créé {formatRelativeDateTime(user.createdAt)}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-name">Nom complet</Label>
            <Input
              id="e-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-role">Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="e-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MANAGER">Gérant</SelectItem>
                <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-pin">Réinitialiser le PIN</Label>
            <PinInput value={pin} onChange={setPin} placeholder="Laisser vide pour conserver" />
            <p className="text-xs text-muted-foreground">
              Laisser vide pour conserver le PIN actuel.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Compte actif</p>
              <p className="text-xs text-muted-foreground">
                Désactivez pour bloquer l&apos;accès sans supprimer.
              </p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={update.isPending}
          >
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({
  user,
  onOpenChange,
}: {
  user: UserDto;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => api.delete(`/api/users/${user.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Utilisateur supprimé");
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof ApiError ? e.message : "Erreur lors de la suppression");
    },
  });

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cet utilisateur ?</AlertDialogTitle>
          <AlertDialogDescription>
            Vous êtes sur le point de supprimer le compte de{" "}
            <span className="font-semibold text-foreground">{user.name}</span>{" "}
            ({user.username}). Cette action est irréversible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              del.mutate();
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
  );
}
