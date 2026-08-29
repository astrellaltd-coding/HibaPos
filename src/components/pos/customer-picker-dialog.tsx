"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { CustomerDto } from "@/types/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/shared/empty-state";
import { UserPlus, Search, Check, User } from "lucide-react";
import { toast } from "sonner";

export function CustomerPickerDialog({
  open,
  onOpenChange,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const queryClient = useQueryClient();

  const { data: customers } = useQuery({
    queryKey: ["customers", search],
    queryFn: () => api.get<CustomerDto[]>(`/api/customers${search ? `?q=${encodeURIComponent(search)}` : ""}`),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; phone?: string; address?: string }) =>
      api.post<CustomerDto>("/api/customers", { name: data.name, phone: data.phone || null, address: data.address || null }),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`Client « ${customer.name} » créé`);
      onSelect(customer.id);
      setCreating(false);
      setNewName("");
      setNewPhone("");
      setNewAddress("");
      onOpenChange(false);
    },
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : "Erreur lors de la création");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b border-border p-5">
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> {creating ? "Nouveau client" : "Sélectionner un client"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {creating ? "Créez un client rapide pour cette commande" : "Recherchez ou créez un client"}
          </p>
        </DialogHeader>

        {creating ? (
          <div className="space-y-4 p-5">
            <div>
              <Label className="mb-1.5 block text-xs">Nom *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nom du client"
                autoFocus
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Téléphone</Label>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="06 12 34 56 78"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Adresse * <span className="text-muted-foreground">(requis pour la livraison)</span></Label>
              <Input
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="12 rue de Paris, 75001 Paris"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCreating(false)}>
                Retour
              </Button>
              <Button
                className="flex-1"
                disabled={!newName.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate({ name: newName.trim(), phone: newPhone.trim(), address: newAddress.trim() })}
              >
                {createMutation.isPending ? "Création…" : "Créer"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher par nom, téléphone…"
                  className="pl-9"
                  autoFocus
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full gap-1.5"
                onClick={() => setCreating(true)}
              >
                <UserPlus className="h-3.5 w-3.5" /> Créer un nouveau client
              </Button>
            </div>

            <ScrollArea className="max-h-[45vh]">
              {customers && customers.length > 0 ? (
                <div className="divide-y divide-border">
                  {customers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        onSelect(c.id);
                        onOpenChange(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[c.phone, c.email].filter(Boolean).join(" · ") || "Aucun contact"}
                        </p>
                      </div>
                      {selectedId === c.id && (
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-4">
                  <EmptyState
                    icon={User}
                    title={search ? "Aucun client trouvé" : "Aucun client"}
                    description={search ? "Essayez un autre terme ou créez un nouveau client." : "Créez votre premier client."}
                  />
                </div>
              )}
            </ScrollArea>
          </>
        )}

        {selectedId && !creating && (
          <DialogFooter className="border-t border-border p-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => {
                onSelect(null);
                onOpenChange(false);
              }}
            >
              Retirer le client de la commande
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
