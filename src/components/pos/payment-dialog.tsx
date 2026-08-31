"use client";

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/format";
import { toCents } from "@/lib/money";
import { useCartStore, computeCartTotals } from "@/store/cart-store";
import { useAppStore } from "@/store/app-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { OrderDto, PaymentMethod, SettingsDto } from "@/types/api";
import { Banknote, CreditCard, Ticket, Plus, Trash2, Loader2, CheckCircle2, Coins } from "lucide-react";
import { toast } from "sonner";
import { ManagerApprovalDialog, type ApprovedManager } from "@/components/pos/manager-approval-dialog";

type PayLine = { method: PaymentMethod; amount: number; tendered?: number }; // cents

const METHODS: { method: PaymentMethod; label: string; icon: typeof Banknote; color: string }[] = [
  { method: "CASH", label: "Espèces", icon: Banknote, color: "text-emerald-600" },
  { method: "CARD", label: "Carte", icon: CreditCard, color: "text-sky-600" },
  { method: "VOUCHER", label: "Bon / Ticket", icon: Ticket, color: "text-amber-600" },
];

export function PaymentDialog({
  open,
  onOpenChange,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCompleted: (order: OrderDto) => void;
}) {
  const { items, orderType, tableLabel, customerId, discountTotal, notes, clear } = useCartStore();
  const { user } = useAppStore();
  const { subtotal, total } = computeCartTotals(items, discountTotal);
  const [lines, setLines] = useState<PayLine[]>([]);
  const [activeMethod, setActiveMethod] = useState<PaymentMethod>("CASH");
  const [customAmount, setCustomAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  // Signed approval token captured from ManagerApprovalDialog. Kept in state
  // ONLY for display/badge purposes — the authoritative copy used by
  // `finalize` is passed as an argument on re-entry, because a `setTimeout`
  // or state-based re-entry would capture a stale closure where
  // `approvalToken` is still null (post-audit N1 — the approval dialog
  // looped forever).
  const [approvalToken, setApprovalToken] = useState<string | null>(null);

  // Settings hold the discount approval threshold; pulled here to mirror the
  // server-side gate exactly (a CASHIER with a discount above threshold must
  // present a fresh signed manager approval token, see /api/orders route).
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsDto>("/api/settings"),
  });
  const qc = useQueryClient();

  const paid = useMemo(() => lines.reduce((acc, l) => acc + l.amount, 0), [lines]);
  const remaining = Math.max(0, total - paid);

  // Total cash tendered across all CASH lines (actual cash received) — cents.
  const cashTendered = useMemo(
    () => lines.filter((l) => l.method === "CASH").reduce((acc, l) => acc + (l.tendered ?? l.amount), 0),
    [lines],
  );
  // Cash portion of the order covered by CASH lines — cents.
  const cashCovered = useMemo(
    () => lines.filter((l) => l.method === "CASH").reduce((acc, l) => acc + l.amount, 0),
    [lines],
  );
  const change = Math.max(0, cashTendered - cashCovered);

  const reset = () => {
    setLines([]);
    setCustomAmount("");
    setActiveMethod("CASH");
    setApprovalToken(null);
  };

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) setTimeout(reset, 200);
  };

  const addPayment = (amount: number) => {
    if (amount <= 0) return;
    const currentPaid = lines.reduce((acc, l) => acc + l.amount, 0);
    const currentRemaining = Math.max(0, total - currentPaid);
    if (currentRemaining <= 0) return;

    if (activeMethod === "CASH" && amount > currentRemaining) {
      // Overpayment: cap the order-covered amount, record what the customer actually gave.
      setLines((l) => [...l, { method: activeMethod, amount: currentRemaining, tendered: amount }]);
    } else {
      setLines((l) => [...l, { method: activeMethod, amount: Math.min(amount, currentRemaining) }]);
    }
    setCustomAmount("");
  };

  // Quick-cash buttons: show EURO amounts to the cashier but push CENTS to addPayment.
  // `remaining` is cents; the quick values are euro-facing helpers derived from it.
  const quickCash = [
    remaining,
    Math.ceil(remaining / 100) * 100,
    Math.ceil(remaining / 500) * 500,
    Math.ceil(remaining / 1000) * 1000,
    500, 1000, 2000, 5000,
  ].filter((v, i, arr) => v > 0 && arr.indexOf(v) === i);

  const removeLine = (idx: number) => setLines((l) => l.filter((_, i) => i !== idx));

  // Determine if the cashier (non-MANAGER+/SUPER_ADMIN) needs an approval
  // token because of the discount magnitude. MANAGER+ self-approve at the
  // server-side, no token required from the client.
  const discountPercent = subtotal > 0 ? (discountTotal / subtotal) * 100 : 0;
  const discountThreshold = settings?.discountApprovalThreshold ?? 20;
  const needsDiscountApproval =
    user?.role === "CASHIER" && discountTotal > 0 && discountPercent > discountThreshold + 0.01;

  // `tokenArg` is passed by handleApproved on re-entry after the manager
  // approves. State (`approvalToken`) is intentionally NOT read here for the
  // gate: when this closure was created, state was still null.
  const finalize = async (tokenArg?: string) => {
    if (paid < total - 1) { // within 1 cent
      toast.error("Paiement insuffisant");
      return;
    }

    // If a discount is in play and the cashier is below the role gate, open
    // the manager approval dialog. handleApproved re-enters finalize with
    // the signed approvalToken as an argument (NOT via state — the stale
    // closure would otherwise re-open the dialog forever).
    const effectiveToken = tokenArg ?? approvalToken;
    if (needsDiscountApproval && !effectiveToken) {
      setApprovalOpen(true);
      return;
    }

    setLoading(true);
    try {
      const discount =
        discountTotal > 0
          ? {
              type: "AMOUNT" as const,
              value: discountTotal,
              approvalToken: effectiveToken ?? undefined,
            }
          : undefined;

      const order = await api.post<OrderDto>("/api/orders", {
        orderType,
        tableLabel: tableLabel || null,
        customerId: customerId ?? null,
        discount,
        notes: notes || null,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          notes: i.notes ?? null,
          optionIds: i.options.map((o) => o.choiceId),
          addons: i.addOns.map((a) => ({ addonId: a.id, quantity: 1 })),
        })),
        payments: lines.map((l) => {
          if (l.method !== "CASH") {
            return { method: l.method, amount: l.amount };
          }
          // If the cashier overpaid with cash, tendered was captured explicitly
          // when the line was added (see addPayment). Otherwise it's an exact
          // payment and tendered can stay omitted.
          if (l.tendered) {
            return { method: l.method, amount: l.amount, tendered: l.tendered };
          }
          return { method: l.method, amount: l.amount };
        }),
      });

      toast.success(`Commande #${order.number} encaissée`);
      // Invalidate the queries that depend on orders being created. Until
      // now the dashboard/orders list could lag up to 60s after a checkout.
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["products", "out-of-stock"] });
      qc.invalidateQueries({ queryKey: ["shift", "current"] });

      clear();
      setApprovalToken(null);
      close(false);
      onCompleted(order);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Erreur lors de l'encaissement";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleApproved = (approver: ApprovedManager) => {
    // Store for badge/display state, then immediately re-run finalize with
    // the token as an ARGUMENT — a setTimeout(() => finalize(), 0) here
    // would capture the stale closure where approvalToken === null and
    // re-open the approval dialog forever (post-audit N1).
    setApprovalToken(approver.approvalToken);
    void finalize(approver.approvalToken);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[95vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border p-5">
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" /> Encaissement
          </DialogTitle>
          <p className="text-sm text-muted-foreground">Total à payer et répartition des paiements</p>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
          {/* Left: total + methods + keypad */}
          <div className="border-b border-border p-5 md:border-b-0 md:border-r">
            <div className="mb-4 rounded-xl bg-primary/5 p-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="mt-1 text-4xl font-bold tabular-nums text-foreground">{formatEuro(total)}</p>
              {paid > 0 && (
                <p className={cn("mt-1 text-sm font-medium", remaining > 0 ? "text-destructive" : "text-emerald-600")}>
                  {remaining > 0 ? `Reste ${formatEuro(remaining)}` : `Rendu ${formatEuro(change)}`}
                </p>
              )}
            </div>

            {needsDiscountApproval && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Remise {discountPercent.toFixed(1)}% &gt; seuil {discountThreshold}% — validation manager requise à l'encaissement.
              </p>
            )}

            <p className="mb-2 text-xs font-medium text-muted-foreground">Moyen de paiement</p>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {METHODS.map((m) => {
                const Icon = m.icon;
                const active = activeMethod === m.method;
                return (
                  <button
                    key={m.method}
                    onClick={() => setActiveMethod(m.method)}
                    aria-pressed={active}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border py-3 text-xs font-medium transition-colors",
                      active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-card hover:bg-muted/50",
                    )}
                  >
                    <Icon className={cn("h-5 w-5", active ? "text-primary-foreground" : m.color)} />
                    {m.label}
                  </button>
                );
              })}
            </div>

            {activeMethod === "CASH" && remaining > 0 && (
              <div className="mb-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Montants rapides</p>
                <div className="grid grid-cols-4 gap-2">
                  {quickCash.slice(0, 8).map((v) => (
                    <button
                      key={v}
                      onClick={() => addPayment(v)}
                      className="min-h-[44px] rounded-lg border border-border bg-card py-2 text-sm font-semibold tabular-nums transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                    >
                      {formatEuro(v)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customAmount) {
                    // "0" or invalid input is a no-op — a phantom 0.01 € line
                    // silently corrupts `paid`/`change` (post-audit N2).
                    // Custom amount is entered in EUROS; convert to cents.
                    const n = toCents(Number(customAmount.replace(",", ".")));
                    if (Number.isFinite(n) && n > 0) addPayment(n);
                  }
                }}
                aria-label="Montant libre"
                placeholder="Montant libre"
                className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <Button
                className="h-11 gap-1.5"
                onClick={() => {
                  // Disambiguate from the empty default: when no custom amount
                  // is entered, the cashier implicitly wants the remaining total.
                  if (!customAmount) {
                    if (activeMethod === "CASH") addPayment(remaining);
                    else if (remaining > 0) addPayment(remaining);
                    return;
                  }
                  // Custom amount is entered in EUROS; convert to cents.
                  const n = toCents(Number(customAmount.replace(",", ".")));
                  if (Number.isFinite(n) && n > 0) addPayment(n);
                }}
              >
                <Plus className="h-4 w-4" /> Ajouter
              </Button>
            </div>
          </div>

          {/* Right: payment lines + summary */}
          <div className="flex flex-col p-5">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Paiements enregistrés</p>
            <ScrollArea className="max-h-[32vh] flex-1">
              {lines.length === 0 ? (
                <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                  Aucun paiement. Ajoutez-en un à gauche.
                </div>
              ) : (
                <div className="space-y-2">
                  {lines.map((l, idx) => {
                    const m = METHODS.find((x) => x.method === l.method)!;
                    const Icon = m.icon;
                    return (
                      <div key={idx} className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5">
                        <Icon className={cn("h-4 w-4", m.color)} />
                        <span className="flex-1 text-sm font-medium">
                          {m.label}
                          {l.method === "CASH" && l.tendered && l.tendered !== l.amount && (
                            <span className="ml-1 text-xs text-muted-foreground">(sur {formatEuro(l.tendered)})</span>
                          )}
                        </span>
                        <span className="text-sm font-semibold tabular-nums">{formatEuro(l.amount)}</span>
                        <Button variant="ghost" size="icon" className="h-9 min-h-[48px] w-9 text-muted-foreground hover:text-destructive" aria-label="Supprimer la ligne" onClick={() => removeLine(idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            <Separator className="my-3" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Encaissé</span>
                <span className="font-semibold tabular-nums">{formatEuro(paid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reste</span>
                <span className={cn("font-semibold tabular-nums", remaining > 0 ? "text-destructive" : "text-emerald-600")}>{formatEuro(remaining)}</span>
              </div>
              {change > 0 && (
                <div className="flex justify-between rounded-lg bg-emerald-50 px-3 py-2">
                  <span className="font-semibold text-emerald-700">Rendu (monnaie)</span>
                  <span className="text-lg font-bold tabular-nums text-emerald-700">{formatEuro(change)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-3 border-t border-border p-4">
          <Button variant="outline" className="gap-1.5" onClick={() => close(false)} disabled={loading}>
            Annuler
          </Button>
          <Button
            className="h-11 flex-1 gap-2 text-base font-semibold"
            onClick={() => void finalize()}
            disabled={loading || paid < total - 0.01}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            Valider · {formatEuro(total)}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ManagerApprovalDialog
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
        action="DISCOUNT"
        amount={discountTotal > 0 ? discountTotal : undefined}
        onApproved={handleApproved}
        title="Validation remise"
        description={`La remise (${discountPercent.toFixed(1)}%) dépasse le seuil (${discountThreshold}%). Saisissez le PIN d'un manager pour valider.`}
      />
    </Dialog>
  );
}