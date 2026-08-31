"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCartStore, computeCartTotals, type HeldOrder } from "@/store/cart-store";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
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
import { useState } from "react";
import { Pause, Play, Trash2, Clock } from "lucide-react";

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  return `il y a ${Math.floor(diff / 3600)} h`;
}

export function HeldOrdersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { heldOrders, recallOrder, deleteHeld } = useCartStore();

  const handleRecall = (id: string) => {
    recallOrder(id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b border-border p-5">
          <DialogTitle className="flex items-center gap-2">
            <Pause className="h-5 w-5 text-primary" /> Commandes en attente
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {heldOrders.length > 0
              ? `${heldOrders.length} commande(s) mise(s) en attente`
              : "Aucune commande en attente"}
          </p>
        </DialogHeader>

        {heldOrders.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Pause} title="Aucune commande en attente" description="Mettez une commande en attente avec le bouton « Mettre en attente » pour la reprendre plus tard." />
          </div>
        ) : (
          <ScrollArea className="max-h-[55vh]">
            <div className="space-y-2 p-4">
              {heldOrders.map((order) => (
                <HeldOrderCard
                  key={order.id}
                  order={order}
                  onRecall={() => handleRecall(order.id)}
                  onDelete={() => deleteHeld(order.id)}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="border-t border-border p-4">
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HeldOrderCard({
  order,
  onRecall,
  onDelete,
}: {
  order: HeldOrder;
  onRecall: () => void;
  onDelete: () => void;
}) {
  const { total } = computeCartTotals(order.items, order.discountTotal);
  const itemCount = order.items.reduce((acc, i) => acc + i.quantity, 0);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const orderTypeLabels: Record<HeldOrder["orderType"], string> = {
    DINE_IN: "Sur place",
    TAKEAWAY: "À emporter",
    LIVRAISON: "Livraison",
  };

  return (
    <>
    <div className="rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{order.label}</p>
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {orderTypeLabels[order.orderType]}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {timeAgo(order.heldAt)}
            </span>
            <span>{itemCount} article{itemCount > 1 ? "s" : ""}</span>
            <Money amount={total} className="font-semibold text-foreground" />
          </div>
          <div className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">
            {order.items.map((i) => `${i.quantity}× ${i.productName}`).join(", ")}
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <Button size="sm" className="h-11 flex-1 gap-1.5" onClick={onRecall}>
          <Play className="h-3.5 w-3.5" /> Reprendre
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-11 w-11 text-muted-foreground hover:text-destructive"
          onClick={() => setConfirmDeleteOpen(true)}
          aria-label="Supprimer la commande en attente"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la commande en attente ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {order.label} » sera définitivement perdue. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => { onDelete(); setConfirmDeleteOpen(false); }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </>
  );
}
