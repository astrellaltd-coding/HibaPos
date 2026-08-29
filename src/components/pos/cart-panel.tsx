"use client";

import { useState } from "react";
import { useCartStore, computeLineTotal, computeCartTotals, type CartItem } from "@/store/cart-store";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CustomerDto } from "@/types/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Money } from "@/components/shared/money";
import { ProductImage } from "@/components/shared/product-image";
import { EmptyState } from "@/components/shared/empty-state";
import { CustomerPickerDialog } from "@/components/pos/customer-picker-dialog";
import { HeldOrdersDialog } from "@/components/pos/held-orders-dialog";
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
import { Minus, Plus, Trash2, Pencil, ShoppingCart, Wallet, User, Pause, Layers, StickyNote, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/format";
import { motion, AnimatePresence } from "framer-motion";

export function CartPanel({ onCheckout, onEditItem, onOpenDiscount }: { onCheckout: () => void; onEditItem?: (item: CartItem) => void; onOpenDiscount?: () => void }) {
  const {
    items,
    incItem,
    decItem,
    removeItem,
    clear,
    orderType,
    setOrderType,
    customerId,
    setCustomerId,
    discountTotal,
    setDiscount,
    holdCurrent,
    heldOrders,
    notes,
    setNotes,
    tableLabel,
  } = useCartStore();

  const { subtotal, total } = computeCartTotals(items, discountTotal);

  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // Fetch a single customer by id when set; invalidate via ["customer", id]
  // by the customers-view mutations so cart panel stays in sync.
  const { data: customer } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => api.get<CustomerDto>(`/api/customers/${customerId}`),
    enabled: !!customerId,
    retry: false,
  });

  return (
    <div className="flex h-full w-full flex-col bg-card">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Commande en cours</h3>
        </div>
        <div className="flex items-center gap-0.5">
          {heldOrders.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="relative h-12 min-h-[48px] gap-1 px-3 text-xs text-amber-600 hover:bg-amber-50 hover:text-amber-700"
              onClick={() => setHeldOpen(true)}
              title="Commandes en attente"
            >
              <Layers className="h-4 w-4" /> {heldOrders.length}
              <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
            </Button>
          )}
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-12 min-h-[48px] gap-1 px-2.5 text-xs text-muted-foreground hover:text-amber-600"
              onClick={() => holdCurrent(tableLabel || `Commande ${heldOrders.length + 1}`)}
              title="Mettre en attente (F4)"
            >
              <Pause className="h-4 w-4" /> Attente
            </Button>
          )}
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-12 min-h-[48px] gap-1 px-2.5 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmClearOpen(true)}
              title="Vider le panier"
            >
              <Trash2 className="h-4 w-4" /> Vider
            </Button>
          )}
        </div>
      </div>

      {/* Order type pills */}
      <div className="shrink-0 border-b border-border p-2">
        <div className="flex rounded-xl border border-border bg-muted/30 p-1">
          <button
            onClick={() => setOrderType("DINE_IN")}
            className={cn(
              "flex-1 h-12 min-h-[48px] items-center justify-center rounded-lg text-xs font-semibold transition-all",
              orderType === "DINE_IN"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Sur place
          </button>
          <button
            onClick={() => setOrderType("TAKEAWAY")}
            className={cn(
              "flex-1 h-12 min-h-[48px] items-center justify-center rounded-lg text-xs font-semibold transition-all",
              orderType === "TAKEAWAY"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            À emporter
          </button>
          <button
            onClick={() => setOrderType("LIVRAISON")}
            className={cn(
              "flex-1 h-12 min-h-[48px] items-center justify-center rounded-lg text-xs font-semibold transition-all",
              orderType === "LIVRAISON"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Livraison
          </button>
        </div>
      </div>

      {/* Items list */}
      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={ShoppingCart}
            title="Commande vide"
            description="Touchez un produit pour l'ajouter à la commande."
            className="border-0 bg-transparent"
          />
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0" style={{ touchAction: "pan-y" }}>
          <div className="space-y-1.5 p-2.5">
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <motion.div
                  key={item.uid}
                  layout
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 30, scale: 0.9 }}
                  transition={{ duration: 0.13, ease: "easeOut" }}
                  className="rounded-xl border border-border bg-background p-2"
                >
                  <div className="flex items-start gap-2">
                    <ProductImage image={item.image} alt={item.productName} className="mt-0.5 h-8 w-8 shrink-0 rounded-md text-base" />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold leading-tight text-foreground">{item.productName}</p>
                      {item.options.length > 0 && (
                        <p className="mt-0.5 line-clamp-1 text-[9px] text-muted-foreground">
                          {item.options.map((o) => o.choice).join(", ")}
                        </p>
                      )}
                      {item.addOns.length > 0 && (
                        <div className="mt-0.5 space-y-0.5">
                          {item.addOns.map((a) => (
                            <div key={a.id} className="flex items-center justify-between text-[9px] text-muted-foreground">
                              <span>+ {a.name}</span>
                              <span>{formatEuro(a.price)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {item.notes && (
                        <div className="mt-0.5 text-[9px] italic text-foreground/70">
                          « {item.notes} »
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        className="flex h-6 w-6 min-h-[32px] items-center justify-center rounded-md border border-border bg-background transition-colors hover:bg-muted active:scale-95"
                        onClick={() => decItem(item.uid)}
                        aria-label="Diminuer"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-5 text-center text-xs font-semibold tabular-nums">{item.quantity}</span>
                      <button
                        className="flex h-6 w-6 min-h-[32px] items-center justify-center rounded-md border border-border bg-background transition-colors hover:bg-muted active:scale-95"
                        onClick={() => incItem(item.uid)}
                        aria-label="Augmenter"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    <Money amount={computeLineTotal(item)} className="mt-1.5 shrink-0 text-[12px] font-bold text-foreground" />

                    <div className="flex shrink-0 items-center gap-0.5">
                      {onEditItem && (item.options.length > 0 || item.addOns.length > 0) && (
                        <button
                          className="flex h-6 w-6 min-h-[32px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary active:scale-95"
                          onClick={() => onEditItem(item)}
                          aria-label="Modifier"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        className="flex h-6 w-6 min-h-[32px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-95"
                        onClick={() => removeItem(item.uid)}
                        aria-label="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      )}

      {/* Action Buttons Row — sibling-level (NOT nested) clear chips for customer + discount. */}
      {items.length > 0 && (
        <div className="shrink-0 px-2.5 pt-2 pb-1">
          {notesOpen && (
            <div className="mb-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes de commande..."
                rows={2}
                className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary"
              />
            </div>
          )}
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "flex-1 h-9 gap-1.5 text-xs",
                orderType === "LIVRAISON" && (!customerId || !customer?.address)
                  ? "border-amber-500 text-amber-600 animate-pulse"
                  : customerId && "border-primary text-primary",
              )}
              title={orderType === "LIVRAISON" && (!customerId || !customer?.address) ? "Livraison : client et adresse requis" : undefined}
              onClick={() => setCustomerPickerOpen(true)}
            >
              <User className="h-3.5 w-3.5" />
              {customer ? (
                <span className="truncate max-w-[80px]">{customer.name}</span>
              ) : (
                "Client"
              )}
            </Button>
            {customerId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12 min-h-[48px] min-w-[48px] shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => setCustomerId(null)}
                aria-label="Retirer le client"
                title="Retirer le client"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className={cn("flex-1 h-12 min-h-[48px] gap-1.5 text-xs font-semibold", discountTotal > 0 && "border-primary text-primary")}
              onClick={onOpenDiscount}
            >
              <Tag className="h-4 w-4" />
              Remise
            </Button>
            {discountTotal > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12 min-h-[48px] min-w-[48px] shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => setDiscount(0)}
                aria-label="Retirer la remise"
                title="Retirer la remise"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className={cn("flex-1 h-12 min-h-[48px] gap-1.5 text-xs font-semibold", notes && "border-primary text-primary")}
              onClick={() => setNotesOpen(!notesOpen)}
            >
              <StickyNote className="h-4 w-4" />
              Note
            </Button>
          </div>
        </div>
      )}

      {/* Totals + checkout */}
      <div className="shrink-0 border-t border-border bg-muted/20 p-2.5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Sous-total</span>
          <Money amount={subtotal} className="font-medium" />
        </div>

        {discountTotal > 0 && (
          <div className="mb-2 flex items-center justify-between text-sm text-destructive">
            <span className="flex items-center gap-1.5">Remise</span>
            <Money amount={-discountTotal} className="font-medium" />
          </div>
        )}

        <Button
          className="h-12 w-full gap-2 text-lg font-bold shadow-sm transition-all active:scale-[0.98]"
          size="lg"
          disabled={items.length === 0 || (orderType === "LIVRAISON" && (!customerId || !customer?.address))}
          onClick={onCheckout}
        >
          <Wallet className="h-5 w-5" />
          Encaisser {items.length > 0 && `• ${formatEuro(total)}`}
        </Button>
      </div>

      {/* Clear cart confirmation */}
      <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vider la commande ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action retire tous les articles de la commande en cours. Les commandes mises en attente ne sont pas affectées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => { clear(); setConfirmClearOpen(false); }}
            >
              Vider
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialogs */}
      <CustomerPickerDialog
        open={customerPickerOpen}
        onOpenChange={setCustomerPickerOpen}
        selectedId={customerId}
        onSelect={setCustomerId}
      />
      <HeldOrdersDialog open={heldOpen} onOpenChange={setHeldOpen} />
    </div>
  );
}