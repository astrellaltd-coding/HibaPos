"use client";

import { Banknote, CreditCard, Ticket, Trash2, Coins, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/format";
import { OFFERT, OFFERT_LABEL } from "@/lib/tender-policy";
import type { PaymentMethod } from "@/types/api";

// L-100 (R8.2) — one payment line, and the reason it is its own module.
//
// THE DEFECT. `payment-dialog.tsx` held the whole list inline and drew each
// line with `METHODS.find(x => x.method === l.method)!` followed by `m.icon`.
// `METHODS` carries CASH, CARD and VOUCHER; `OFFERT` is deliberately kept out
// of that grid, because it is not an alternative way to pay a bill — it is the
// only way to settle one discounted to nothing (DD-14). So the moment
// `addOffert()` put an OFFERT line in state the render threw
// `Cannot read properties of undefined (reading 'icon')` and took the entire
// POS into the error boundary. **DD-14's tender was unusable from the till**,
// which is the only way to settle a 100 %-discounted order, while the API
// accepted the identical sale without complaint.
//
// WHY A MODULE AND NOT A THREE-LINE PATCH IN PLACE. The audit's own note is
// that *nothing would have caught it*: no test renders that component, and
// `offert-tender.test.ts` asserts the enum, the route and the schema — none of
// which is the thing that broke. This project has no React test renderer and
// no DOM environment, and adding one is a dependency decision rather than a
// batch's. Pulled out here, the row can be rendered by `react-dom/server`'s
// `renderToStaticMarkup`, which needs neither — and it can be rendered for
// EVERY member of the `PaymentMethod` enum, so a tender added later is covered
// without anybody remembering to add a case.

/** The three tenders that move money, as the grid draws them. */
export const PAID_METHOD_DISPLAY: {
  method: PaymentMethod;
  label: string;
  icon: typeof Banknote;
  color: string;
}[] = [
  { method: "CASH", label: "Espèces", icon: Banknote, color: "text-emerald-600" },
  { method: "CARD", label: "Carte", icon: CreditCard, color: "text-sky-600" },
  { method: "VOUCHER", label: "Bon / Ticket", icon: Ticket, color: "text-amber-600" },
];

const OFFERT_DISPLAY = {
  method: OFFERT as PaymentMethod,
  label: OFFERT_LABEL,
  icon: Gift,
  color: "text-fuchsia-600",
};

/**
 * How a line is drawn. **Total over `PaymentMethod` by construction** — the
 * fallback is not decoration.
 *
 * A tender this list has not been taught about must render as a line and not
 * as a crash: by the time a payment line exists, the operator is mid-sale with
 * a customer in front of them, and an error boundary costs them the basket.
 * Showing the raw enum value is ugly and recoverable; throwing is neither.
 */
export function lineDisplay(method: PaymentMethod): {
  label: string;
  icon: typeof Banknote;
  color: string;
} {
  const paid = PAID_METHOD_DISPLAY.find((x) => x.method === method);
  if (paid) return paid;
  if (method === OFFERT_DISPLAY.method) return OFFERT_DISPLAY;
  return { label: method, icon: Coins, color: "text-muted-foreground" };
}

export type PayLine = { method: PaymentMethod; amount: number; tendered?: number }; // cents

export function PaymentLineRow({
  line,
  onRemove,
}: {
  line: PayLine;
  onRemove: () => void;
}) {
  const m = lineDisplay(line.method);
  const Icon = m.icon;
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5">
      <Icon className={cn("h-4 w-4", m.color)} />
      <span className="flex-1 text-sm font-medium">
        {m.label}
        {line.method === "CASH" && line.tendered && line.tendered !== line.amount && (
          <span className="ml-1 text-xs text-muted-foreground">(sur {formatEuro(line.tendered)})</span>
        )}
      </span>
      <span className="text-sm font-semibold tabular-nums">{formatEuro(line.amount)}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-12 w-12 min-h-[48px] min-w-[48px] text-muted-foreground hover:text-destructive"
        aria-label="Supprimer la ligne"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
