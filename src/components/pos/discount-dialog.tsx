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

  const [value, setValue] = useState<number>(discountTotal);
  const [needsApproval, setNeedsApproval] = useState(false);

  const threshold = settings?.discountApprovalThreshold ?? 20;
  const percent = subtotal > 0 ? Math.round((value / subtotal) * 1000) / 10 : 0;

  const handleChange = (v: number) => {
    setValue(Math.max(0, Math.min(subtotal, v)));
    setNeedsApproval(subtotal > 0 && (v / subtotal) * 100 > threshold);
  };

  const apply = () => {
    setDiscount(value);
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
            <label className="text-sm font-medium">Montant de la remise</label>
            <input
              type="number"
              min={0}
              max={subtotal}
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
                Remise supérieure à {threshold}%. Un manager doit approuver lors de l'encaissement.
              </span>
            </div>
          )}
        </div>
        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="flex-1" onClick={apply} disabled={value > subtotal}>
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
