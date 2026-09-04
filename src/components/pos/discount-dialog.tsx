"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCartStore, computeCartTotals } from "@/store/cart-store";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { SettingsDto } from "@/types/api";
import { Tag, AlertCircle } from "lucide-react";
import { formatEuro } from "@/lib/format";
import { toCents } from "@/lib/money";
import { discountNeedsStepUp } from "@/lib/discount-policy";

export function DiscountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { items, discountTotal, setDiscount } = useCartStore();
  const { subtotal } = computeCartTotals(items, discountTotal);
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsDto>("/api/settings"),
  });

  // The input works in EUROS for the user; `value` is stored in euros until
  // `apply()` converts to cents via `toCents()` before pushing to the cart store.
  const discountEuros = discountTotal > 0 ? discountTotal / 100 : 0;
  const [value, setValue] = useState<number>(discountEuros);

  const threshold = settings?.discountApprovalThreshold ?? 20;
  // L-34 (Batch 4.4c): this divided EUROS by CENTS — `value` is euros (see the
  // comment above), `subtotal` is cents — so a genuine 40 % discount displayed
  // as « 0.4% du sous-total », a hundredfold understatement on the very figure
  // the operator reads to predict the PIN prompt below. The arithmetic in
  // `handleChange` was already right; `discountNeedsStepUp` is now that same
  // rule, shared with the payment dialog and with the checkout route, and it
  // takes cents on both sides.
  const discountCents = toCents(value);
  const percent = subtotal > 0 ? Math.round((discountCents / subtotal) * 1000) / 10 : 0;
  // Derived, not held in state. As state it was seeded `false` and only ever
  // written by `handleChange`, so re-opening the dialog on an already-applied
  // above-threshold discount showed no banner until the operator retyped the
  // amount — the one case where the warning matters most.
  const needsApproval = discountNeedsStepUp(discountCents, subtotal, threshold);

  const handleChange = (v: number) => {
    setValue(Math.max(0, Math.min(subtotal / 100, v)));
  };

  const apply = () => {
    setDiscount(toCents(value));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" /> Remise
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground">Sous-total</p>
            <p className="text-2xl font-bold">{formatEuro(subtotal)}</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Montant de la remise (€)</label>
            <input
              type="number"
              min={0}
              max={subtotal / 100}
              step={0.5}
              value={value || ""}
              onChange={(e) => handleChange(Number(e.target.value) || 0)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-right text-lg font-semibold tabular-nums outline-none focus:border-primary"
              autoFocus
            />
            <p className="text-right text-xs text-muted-foreground">{percent}% du sous-total</p>
          </div>
          {needsApproval && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Remise supérieure à {threshold}%. Vous devrez saisir votre code PIN lors de l'encaissement.
              </span>
            </div>
          )}
        </div>
        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="flex-1" onClick={apply} disabled={toCents(value) > subtotal}>
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
