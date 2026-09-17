"use client";

/**
 * L-214 — the client box, on a delivery.
 *
 * WHAT THE OWNER REPORTED, 2026-09-17: « the client input when delivery is set »
 * needs work. It did, in four separate ways, and all four came from this dialog
 * not knowing what kind of order it was being opened for.
 *
 *  1. It starred `Adresse *` and left `Téléphone` unstarred, while `Créer`
 *     needed only a name — so the form's own emphasis pointed at the client the
 *     server would REFUSE, after the cash had been taken.
 *  2. It looked identical on a delivery and on a sur-place order, so there was
 *     nothing to tell a cashier that this one needed more.
 *  3. Its list printed `téléphone · email` and NEVER the address, so there was
 *     no way to see which of the regulars could actually be delivered to.
 *  4. Nothing here could repair an existing client. A regular with no phone
 *     was a dead end: the card in the POS is read-only and editing lived in
 *     Réglages → Clients, which means leaving the caisse with a queue waiting.
 *
 * All four are closed. The requirement itself is `missingForDelivery`'s, which
 * is the function `POST /api/orders` now calls too — the drift between the two
 * was the finding, and one shared rule is the fix.
 *
 * THE OPERATOR DECIDED BOTH OPEN QUESTIONS on 2026-09-17: a delivery client
 * must have a phone and the till should ask up front; and a cashier should be
 * able to fix a client's record here rather than being sent to Réglages.
 */

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
import { UserPlus, Search, Check, User, MapPin, Phone, Pencil, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  customerFormBlocked,
  deliveryMissingMessage,
  isDeliverable,
  missingForDelivery,
} from "@/lib/delivery-customer";

export function CustomerPickerDialog({
  open,
  onOpenChange,
  selectedId,
  onSelect,
  orderType = "DINE_IN",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** L-214: what this order is. A delivery asks for more, and says so. */
  orderType?: string;
}) {
  const forDelivery = orderType === "LIVRAISON";
  const [search, setSearch] = useState("");
  /** `null` = the list; `"new"` = the create form; a DTO = editing that client. */
  const [editing, setEditing] = useState<CustomerDto | "new" | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const queryClient = useQueryClient();

  /**
   * Leave no half-typed client behind when the dialog closes.
   *
   * An EVENT rather than an effect on `open`: `react-hooks/set-state-in-effect`
   * refuses the effect form, rightly, and every close passes through here
   * anyway — Radix routes Escape, the overlay and the « × » to `onOpenChange`,
   * and the rows below call `close()` instead of the raw prop.
   */
  const close = () => {
    setEditing(null);
    setForm({ name: "", phone: "", address: "" });
    onOpenChange(false);
  };

  const { data: customers } = useQuery({
    queryKey: ["customers", search],
    queryFn: () => api.get<CustomerDto[]>(`/api/customers${search ? `?q=${encodeURIComponent(search)}` : ""}`),
    enabled: open,
  });

  const body = () => ({
    name: form.name.trim(),
    phone: form.phone.trim() || null,
    address: form.address.trim() || null,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post<CustomerDto>("/api/customers", body()),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`Client « ${customer.name} » créé`);
      onSelect(customer.id);
      close();
    },
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : "Erreur lors de la création");
    },
  });

  /**
   * L-214 — the repair path, and the reason it is worth its own mutation.
   *
   * A delivery to a regular whose record has no phone could not be completed
   * from the caisse at all. `["customer", id]` is invalidated as well as the
   * list, because that is the key `cart-panel.tsx` reads — without it the cart
   * would go on believing the old record and « Encaisser » would stay dead
   * after the cashier had just fixed the thing blocking it.
   */
  const updateMutation = useMutation({
    mutationFn: (id: string) => api.put<CustomerDto>(`/api/customers/${id}`, body()),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer", customer.id] });
      toast.success(`Client « ${customer.name} » mis à jour`);
      onSelect(customer.id);
      close();
    },
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : "Erreur lors de la mise à jour");
    },
  });

  const pending = createMutation.isPending || updateMutation.isPending;
  const draft = { name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() };
  const missing = missingForDelivery(draft);
  /**
   * WHAT THE FORM REQUIRES depends on the order, and on nothing else.
   *
   * On a delivery: all three, because that is what the server will insist on.
   * Otherwise: a name, exactly as before — a quick client for a sur-place order
   * must not suddenly need an address, and the server does not ask for one.
   */
  const blocked = customerFormBlocked(orderType, draft);
  const blockMessage = forDelivery && missing.length > 0 ? deliveryMissingMessage(missing) : null;

  const startEdit = (c: CustomerDto) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone ?? "", address: c.address ?? "" });
  };

  const submit = () => {
    if (blocked || pending) return;
    if (editing === "new") createMutation.mutate();
    else if (editing) updateMutation.mutate(editing.id);
  };

  const isNew = editing === "new";

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b border-border p-5">
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            {isNew ? "Nouveau client" : editing ? "Modifier le client" : "Sélectionner un client"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {editing
              ? forDelivery
                ? "Une livraison demande le nom, le téléphone et l'adresse."
                : "Le nom suffit pour une commande sur place ou à emporter."
              : forDelivery
                ? "Livraison : choisissez un client livrable, ou complétez sa fiche."
                : "Recherchez ou créez un client"}
          </p>
        </DialogHeader>

        {editing ? (
          <div className="space-y-4 p-5">
            <div>
              <Label htmlFor="customer-picker-nom" className="mb-1.5 block text-xs">
                Nom <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customer-picker-nom"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nom du client"
                autoFocus
              />
            </div>
            <div>
              {/* L-214 — the star follows the RULE now. `Téléphone` carried no
                * star while `Adresse` carried one, and `Créer` asked for
                * neither — so the form's emphasis and its button and the
                * server's requirement were three different things. */}
              <Label htmlFor="customer-picker-telephone" className="mb-1.5 block text-xs">
                Téléphone {forDelivery && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="customer-picker-telephone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="06 12 34 56 78"
                inputMode="tel"
              />
            </div>
            <div>
              <Label htmlFor="customer-picker-adresse" className="mb-1.5 block text-xs">
                Adresse {forDelivery && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="customer-picker-adresse"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="12 rue de Paris, 75001 Paris"
              />
            </div>

            {/* L-214 — WHY THE BUTTON WILL NOT PRESS, in words. The old form
              * simply left `Créer` disabled with nothing to read, which on a
              * touchscreen is indistinguishable from a broken button. */}
            {blockMessage && (
              <div
                role="status"
                className="flex items-start gap-1.5 rounded-lg border border-amber-500/60 bg-amber-500/10 px-2.5 py-2 text-[11px] font-medium leading-snug text-amber-700 dark:text-amber-400"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{blockMessage}</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-11 min-h-[44px] flex-1"
                onClick={() => setEditing(null)}
                disabled={pending}
              >
                Retour
              </Button>
              <Button className="h-11 min-h-[44px] flex-1" disabled={blocked || pending} onClick={submit}>
                {pending ? "Enregistrement…" : isNew ? "Créer" : "Enregistrer"}
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
                className="mt-2 h-11 min-h-[44px] w-full gap-1.5"
                onClick={() => {
                  setForm({ name: "", phone: "", address: "" });
                  setEditing("new");
                }}
              >
                <UserPlus className="h-3.5 w-3.5" /> Créer un nouveau client
              </Button>
            </div>

            <ScrollArea className="max-h-[45vh]">
              {customers && customers.length > 0 ? (
                <div className="divide-y divide-border">
                  {customers.map((c) => {
                    const short = missingForDelivery(c);
                    const deliverable = isDeliverable(c);
                    return (
                      <div key={c.id} className="flex items-stretch">
                        <button
                          onClick={() => {
                            onSelect(c.id);
                            close();
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                            {c.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                            {/* L-214 — THE ADDRESS IS ON THE ROW. The list showed
                              * phone and email and never the address, so on a
                              * delivery there was no way to tell which of these
                              * people could be delivered to. */}
                            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                              <Phone className="h-3 w-3 shrink-0" />
                              {c.phone || "—"}
                            </p>
                            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {c.address || "—"}
                            </p>
                            {forDelivery && !deliverable && (
                              <p className="mt-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                {deliveryMissingMessage(short)}
                              </p>
                            )}
                          </div>
                          {selectedId === c.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                        </button>
                        {/* L-214 — the repair, WITHOUT LEAVING THE CAISSE. A
                          * regular whose record has no phone was a dead end on a
                          * delivery: the POS card is read-only and editing lives
                          * in Réglages → Clients. The operator's decision,
                          * 2026-09-17: fix it here, so the queue keeps moving. */}
                        <button
                          onClick={() => startEdit(c)}
                          aria-label={`Modifier ${c.name}`}
                          title={`Modifier ${c.name}`}
                          className="grid min-h-[44px] w-11 shrink-0 place-items-center border-l border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
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

        {selectedId && !editing && (
          <DialogFooter className="border-t border-border p-3">
            <Button
              variant="outline"
              size="sm"
              className="h-11 min-h-[44px] w-full text-muted-foreground"
              onClick={() => {
                onSelect(null);
                close();
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
