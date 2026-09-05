"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { OrderDto } from "@/types/api";
import { PageHeader, EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectItem,
  SelectContent,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  ReceiptText,
  RefreshCw,
  Printer,
  Download,
  RotateCcw,
  Loader2,
  Utensils,
  ShoppingBag,
  Coins,
  Gift,
  CreditCard,
  Ticket,
  MapPin,
  User as UserIcon,
  Repeat,
  Search,
  X,
} from "lucide-react";
import { useCartStore } from "@/store/cart-store";
import { useAppStore } from "@/store/app-store";
import { downloadReceipt } from "@/lib/receipt";
import { PAYMENT_LABELS, ORDER_TYPE_LABELS } from "@/lib/order-labels";
import { OrderStatusBadge } from "@/components/shared/order-status-badge";
import { safeParseOptions, safeParseAddOns } from "@/lib/order-parsers";
import { StepUpPinDialog, type StepUpConfirmation } from "@/components/pos/step-up-pin-dialog";
import type { SettingsDto } from "@/types/api";
// uuid replaced with built-in crypto.randomUUID()
import { formatEuro, formatDateTime, formatRelativeDateTime } from "@/lib/format";
import { fromCents, parseEuroInput } from "@/lib/money";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type RefundDto = {
  id: string;
  amount: number;
  reason: string;
  cashierId: string;
  createdAt: string;
  cashier?: { name: string } | null;
};

type DetailedOrderDto = OrderDto & {
  refunds: RefundDto[];
};

type StatusFilter = "ALL" | "COMPLETED" | "REFUNDED";

function paymentIcon(method: string) {
  switch (method) {
    case "CASH":
      return Coins;
    case "CARD":
      return CreditCard;
    case "VOUCHER":
      return Ticket;
    case "OFFERT":
      return Gift;
    default:
      return Coins;
  }
}

// L-08 (Batch 7.2): the `statusBadge` switch that stood here was byte-identical
// to the one in the other view — 21 lines each — and both now come from
// `OrderStatusBadge`. Batch 5.6's DD-13 / M-08 reasoning travelled with it.

function paymentBadge(method: string) {
  const Icon = paymentIcon(method);
  const styles: Record<string, string> = {
    CASH: "bg-emerald-50 text-emerald-700 border-emerald-200",
    CARD: "bg-sky-50 text-sky-700 border-sky-200",
    VOUCHER: "bg-amber-50 text-amber-700 border-amber-200",
    // DD-14 (Batch 5.7b) — visually distinct, because "given away" and "paid"
    // must not look alike on the screen a manager scans.
    OFFERT: "bg-violet-50 text-violet-700 border-violet-200",
  };
  return (
    <Badge variant="outline" className={cn("gap-1", styles[method])}>
      <Icon className="h-3 w-3" />
      {PAYMENT_LABELS[method] ?? method}
    </Badge>
  );
}

function orderTypeBadge(orderType: OrderDto["orderType"]) {
  const Icon = orderType === "DINE_IN" ? Utensils : orderType === "LIVRAISON" ? MapPin : ShoppingBag;
  const styles: Record<OrderDto["orderType"], string> = {
    DINE_IN: "bg-amber-50 text-amber-700 border-amber-200",
    TAKEAWAY: "bg-sky-50 text-sky-700 border-sky-200",
    LIVRAISON: "bg-purple-50 text-purple-700 border-purple-200",
  };
  return (
    <Badge variant="outline" className={cn("gap-1", styles[orderType])}>
      <Icon className="h-3 w-3" /> {ORDER_TYPE_LABELS[orderType]}
    </Badge>
  );
}

export function OrdersView() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"CASH" | "CARD" | "VOUCHER">("CASH");
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingRefund, setPendingRefund] = useState<{ amount: number; reason: string; method: "CASH" | "CARD" | "VOUCHER" } | null>(null);
  const [searchInput, setSearchInput] = useState("");
  // Debounced search → server-side filtering (Phase 11b — replaces the old
  // fetch-100-then-filter-in-memory pattern that wouldn't scale).
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const ordersQuery = useQuery<OrderDto[], ApiError>({
    queryKey: ["orders", statusFilter, debouncedSearch],
    queryFn: () => {
      const query: Record<string, string | number> = { limit: 100 };
      if (statusFilter !== "ALL") query.status = statusFilter;
      if (debouncedSearch) query.q = debouncedSearch;
      return api.get<OrderDto[]>("/api/orders", query);
    },
  });

  const detailQuery = useQuery<DetailedOrderDto, ApiError>({
    queryKey: ["order", selectedId],
    queryFn: () => api.get<DetailedOrderDto>(`/api/orders/${selectedId}`),
    enabled: !!selectedId,
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsDto>("/api/settings"),
  });

  const refundMutation = useMutation({
    mutationFn: (vars: { id: string; amount: number; reason: string; method: "CASH" | "CARD" | "VOUCHER"; stepUpToken: string }) =>
      api.post<RefundDto>(`/api/orders/${vars.id}/refund`, {
        amount: vars.amount,
        reason: vars.reason,
        method: vars.method,
        // DD-19, Batch 4.4c: the caller's own step-up confirmation, bound to
        // this exact cent amount. The server refuses every refund without one,
        // at any amount — so this is required, not optional.
        stepUpToken: vars.stepUpToken,
      }),
    onSuccess: () => {
      toast.success("Remboursement enregistré.");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setRefundOpen(false);
      setRefundAmount("");
      setRefundReason("");
    },
    onError: (err: ApiError) => {
      toast.error(err.message || "Échec du remboursement.");
    },
  });

  // Server-side filtering (Phase 11b): the query now sends ?q= to the API,
  // so no client-side over-filtering is needed.
  const orders = ordersQuery.data ?? [];
  const detail = detailQuery.data;

  const alreadyRefunded =
    detail?.refunds?.reduce((acc, r) => acc + r.amount, 0) ?? 0;
  const maxRefund = detail ? Math.max(0, detail.total - alreadyRefunded) : 0;

  function openRefund() {
    // The input is a EUROS field (its label reads "Montant (€)"); maxRefund
    // is in CENTS like every other amount in the DTO. Pre-fill euros.
    setRefundAmount(maxRefund > 0 ? fromCents(maxRefund).toFixed(2) : "");
    setRefundReason("");
    setRefundOpen(true);
  }

  function submitRefund() {
    if (!selectedId) return;
    // Euros in (operator types "5,50"), integer cents out — the API, the
    // Refund row and the REMBOURSEMENT fiscal event are all in cents.
    const amountCents = parseEuroInput(refundAmount);
    if (amountCents === null || amountCents <= 0) {
      toast.error("Montant invalide.");
      return;
    }
    if (amountCents > maxRefund) {
      toast.error(`Le montant ne peut pas dépasser ${formatEuro(maxRefund)}.`);
      return;
    }
    if (!refundReason.trim()) {
      toast.error("Veuillez indiquer un motif de remboursement.");
      return;
    }
    // Every refund is confirmed by the signed-in operator's OWN PIN (DD-19,
    // Batch 4.4c) — no threshold, no second person. This replaces the manager
    // approval that used to open here: with one operational role (DD-07)
    // `/api/auth/approve` (DELETED in Batch 7.2 — see `api/auth/step-up/route.ts`) forbids self-approval, so a lone manager could not
    // refund through this screen at all. That was M-18, and the operator's
    // decision of 2026-09-04 closes it here rather than in Batch 5.7.
    //
    // amount is in CENTS from here on: it is both POSTed to the refund route
    // and HMAC-bound into the step-up token, which the server verifies against
    // the same cent value (lib/approvals.ts, lib/services/step-up.ts).
    setPendingRefund({ amount: amountCents, reason: refundReason.trim(), method: refundMethod });
    setStepUpOpen(true);
  }

  function executeRefund(confirmation: StepUpConfirmation) {
    if (!selectedId || !pendingRefund) return;
    refundMutation.mutate({
      id: selectedId,
      amount: pendingRefund.amount,
      reason: pendingRefund.reason,
      method: pendingRefund.method,
      stepUpToken: confirmation.stepUpToken,
    });
    setPendingRefund(null);
  }

  // C-27 (Batch 3.4): reprinting an archived ticket used to call
  // window.print() directly, so no REIMPRESSION event was ever written and
  // Receipt.reprintCount never left 0 — the reprint route existed and had no
  // caller. The fiscal event is written FIRST; only a traced reprint prints.
  // The route is MANAGER+ by design (see its own comment), so a cashier is
  // told to ask rather than being silently allowed an untraced copy.
  const reprintMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<{ reprintCount: number; printed: boolean; printMessage?: string }>(
        `/api/orders/${id}/reprint`,
        {},
      ),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["order", selectedId] });
      toast.success(`Réimpression n° ${r.reprintCount} enregistrée au journal fiscal`);
      if (!r.printed && r.printMessage) toast.warning(r.printMessage);
      window.print();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiError ? e.message : "Échec de la réimpression"),
  });

  function handlePrint() {
    if (!selectedId) return;
    reprintMutation.mutate(selectedId);
  }

  // Re-order: load a past order's items into the cart and navigate to POS.
  const { addItem, clear } = useCartStore();
  const { setView } = useAppStore();

  function handleReorder() {
    if (!detail || detail.items.length === 0) return;
    clear();
    for (const item of detail.items) {
      // M-19 (Batch 5.7c) corrected this comment as well as the shape below.
      // The snapshot stores the modifier AS CHARGED on that order — resolved
      // for whatever order type it was rung under — not a "DINE_IN-era" one.
      // A reorder therefore has no true dine-in figure to recover, so both
      // fields get the snapshot's value: it is the only information there is,
      // and the server recomputes authoritatively at checkout regardless.
      const options = safeParseOptions(item.optionsJson);
      const addOns = safeParseAddOns(item.addOnsJson);
      addItem({
        uid: crypto.randomUUID(),
        productId: item.productId,
        productName: item.productName,
        basePrice: item.unitPrice,
        pickupPrice: null,
        deliveryPrice: null,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        options: options.map((o) => ({
          group: o.group,
          choice: o.choice,
          choiceId: "", // snapshot has no choice ids; server recomputes by product at checkout
          priceModifier: o.priceModifier ?? 0,
          dineInPriceModifier: o.priceModifier ?? 0,
        })),
        addOns: addOns.map((a) => ({
          id: a.id ?? null,
          name: a.name,
          price: a.price,
        })),
        vatRate: 10, // default; the checkout API recomputes from product if available
        notes: item.notes,
      });
    }
    toast.success(`Commande #${detail.number} rechargée dans le panier`);
    setSelectedId(null);
    setView("pos");
  }

  return (
    <div className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <PageHeader
        icon={ReceiptText}
        title="Commandes"
        description="Historique des ventes"
        actions={
          <>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger size="sm" className="w-[150px]">
                <SelectValue placeholder="Filtrer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes</SelectItem>
                <SelectItem value="COMPLETED">Terminées</SelectItem>
                <SelectItem value="REFUNDED">Remboursées</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => ordersQuery.refetch()}
              disabled={ordersQuery.isFetching}
              className="gap-2"
            >
              <RefreshCw
                className={cn("h-4 w-4", ordersQuery.isFetching && "animate-spin")}
              />
              Actualiser
            </Button>
          </>
        }
      />

      {/* Search bar */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Rechercher (N°, table, caissier…)"
          className="h-9 pl-9"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {ordersQuery.isLoading ? (
        <div className="rounded-xl border border-border">
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
        </div>
      ) : ordersQuery.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Erreur lors du chargement : {ordersQuery.error.message}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="Aucune commande"
          description="Aucune transaction ne correspond à votre filtre."
          action={
            <Button variant="outline" size="sm" onClick={() => setStatusFilter("ALL")}>
              Voir toutes les commandes
            </Button>
          }
        />
      ) : (
        <div className="max-h-[60vh] scroll-thin overflow-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="pl-3">N°</TableHead>
                <TableHead>Heure</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">Articles</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Paiement</TableHead>
                <TableHead>Caissier</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => {
                const firstPayment = o.payments[0];
                const extraPayments = o.payments.length - 1;
                return (
                  <TableRow
                    key={o.id}
                    onClick={() => setSelectedId(o.id)}
                    className="cursor-pointer"
                  >
                    <TableCell className="pl-3 font-bold text-foreground">
                      #{o.number}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatRelativeDateTime(o.createdAt)}
                    </TableCell>
                    <TableCell>
                      {orderTypeBadge(o.orderType)}
                    </TableCell>
                    <TableCell className="text-center tnum">{o.itemCount}</TableCell>
                    <TableCell className="text-right">
                      <Money amount={o.total} className="font-semibold" />
                    </TableCell>
                    <TableCell>
                      {firstPayment ? (
                        <span className="inline-flex items-center gap-1.5">
                          {paymentBadge(firstPayment.method)}
                          {extraPayments > 0 && (
                            <span className="text-xs text-muted-foreground">
                              +{extraPayments}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {o.cashier?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="flex max-h-[90vh] max-w-[460px] flex-col gap-0 overflow-hidden p-0 print:max-w-none print:border-0 print:p-0 print:shadow-none">
          <DialogHeader className="shrink-0 border-b border-border p-5 print:hidden">
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-primary" />
              Détail de la commande
            </DialogTitle>
            <DialogDescription>
              Reçu et historique de la transaction.
            </DialogDescription>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : detailQuery.error ? (
            <div className="p-5 text-sm text-destructive">
              Impossible de charger le détail : {detailQuery.error.message}
            </div>
          ) : detail ? (
            <div
              id="receipt-print"
              className="receipt-paper min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 font-mono text-[12px] leading-relaxed text-foreground print:max-h-none print:overflow-visible"
            >
              <div className="text-center">
                <p className="text-base font-bold">Reçu N° {detail.number}</p>
                <p className="text-[11px] text-foreground/70">
                  {formatDateTime(detail.createdAt)}
                </p>
                <p className="mt-1 inline-flex">
                  <OrderStatusBadge status={detail.status} />
                </p>
              </div>
              <div className="my-2 border-t border-dashed border-foreground/40" />

              {/* Meta */}
              <div className="space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-foreground/80">
                    <UserIcon className="h-3 w-3" /> Caissier
                  </span>
                  <span>{detail.cashier?.name ?? "—"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-foreground/80">
                    <MapPin className="h-3 w-3" /> Type
                  </span>
                  <span>
                    {ORDER_TYPE_LABELS[detail.orderType]}
                    {detail.tableLabel ? ` · ${detail.tableLabel}` : ""}
                  </span>
                </div>
                {detail.customer?.name && (
                  <div className="flex justify-between gap-2">
                    <span className="text-foreground/80">Client</span>
                    <span>{detail.customer.name}</span>
                  </div>
                )}
                {detail.shift?.number != null && (
                  <div className="flex justify-between gap-2">
                    <span className="text-foreground/80">Caisse</span>
                    <span>#{detail.shift.number}</span>
                  </div>
                )}
              </div>
              <div className="my-2 border-t border-dashed border-foreground/40" />

              {/* Items */}
              <div className="space-y-1.5">
                {detail.items.map((item) => {
                  const opts = safeParseOptions(item.optionsJson);
                  const addons = safeParseAddOns(item.addOnsJson);
                  return (
                    <div key={item.id}>
                      <div className="flex justify-between gap-2">
                        <span className="flex-1">
                          <span className="font-bold">{item.quantity}×</span>{" "}
                          {item.productName}
                        </span>
                        <span>{formatEuro(item.lineTotal)}</span>
                      </div>
                      {opts.length > 0 && (
                        <div className="pl-4 text-[11px] text-foreground/70">
                          {opts.map((o, i) => (
                            <div key={i}>· {o.choice}</div>
                          ))}
                        </div>
                      )}
                      {addons.length > 0 && (
                        <div className="pl-4 text-[11px] text-foreground/70">
                          {addons.map((a, i) => (
                            <div key={i}>
                              + {a.name} ({formatEuro(a.price)})
                            </div>
                          ))}
                        </div>
                      )}
                      {item.notes && (
                        <div className="pl-4 text-[11px] italic text-foreground/60">
                          « {item.notes} »
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="my-2 border-t border-dashed border-foreground/40" />
              <div className="flex justify-between">
                <span>Sous-total</span>
                <span>{formatEuro(detail.subtotal)}</span>
              </div>
              {detail.discountTotal > 0 && (
                <div className="flex justify-between text-foreground/80">
                  <span>Remise</span>
                  <span>-{formatEuro(detail.discountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-foreground/80">
                <span>dont TVA</span>
                <span>{formatEuro(detail.vatTotal)}</span>
              </div>
              <div className="my-1 border-t border-dashed border-foreground/40" />
              <div className="flex justify-between text-base font-bold">
                <span>TOTAL</span>
                <span>{formatEuro(detail.total)}</span>
              </div>

              <div className="my-2 border-t border-dashed border-foreground/40" />
              <p className="font-bold">Paiements</p>
              {detail.payments.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span>{PAYMENT_LABELS[p.method] ?? p.method}</span>
                  <span>{formatEuro(p.amount)}</span>
                </div>
              ))}

              {detail.refunds.length > 0 && (
                <>
                  <div className="my-2 border-t border-dashed border-foreground/40" />
                  <p className="font-bold text-destructive">Remboursements</p>
                  {detail.refunds.map((r) => (
                    <div key={r.id}>
                      <div className="flex justify-between text-destructive">
                        <span>
                          -{formatEuro(r.amount)} · {r.cashier?.name ?? "—"}
                        </span>
                        <span>{formatDateTime(r.createdAt)}</span>
                      </div>
                      <div className="pl-2 text-[11px] italic text-foreground/70">
                        « {r.reason} »
                      </div>
                    </div>
                  ))}
                </>
              )}

              <div className="my-3 border-t border-dashed border-foreground/40" />
              <div className="text-center text-[11px] text-foreground/70">
                <p>
                  {detail.itemCount} article{detail.itemCount > 1 ? "s" : ""}
                </p>
                <p className="mt-1">Merci de votre visite !</p>
              </div>
            </div>
          ) : null}

          <DialogFooter className="shrink-0 flex-row gap-2 border-t border-border p-4 print:hidden">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handlePrint}
              disabled={!detail}
            >
              <Printer className="h-4 w-4" /> Imprimer
            </Button>
            {detail && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => downloadReceipt(detail as unknown as import("@/types/api").OrderDto, settings ?? undefined)}
                title="Télécharger le reçu"
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
            {detail && detail.status === "COMPLETED" && (
              <Button
                variant="default"
                className="flex-1 gap-2"
                onClick={handleReorder}
              >
                <Repeat className="h-4 w-4" /> Recommander
              </Button>
            )}
            {detail && detail.status === "COMPLETED" && maxRefund > 0 && (
              <Button
                variant="destructive"
                className="flex-1 gap-2"
                onClick={openRefund}
              >
                <RotateCcw className="h-4 w-4" /> Rembourser
              </Button>
            )}
            <Button variant="secondary" onClick={() => setSelectedId(null)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund sub-dialog */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <RotateCcw className="h-5 w-5" /> Rembourser la commande #{detail?.number}
            </DialogTitle>
            <DialogDescription>
              Maximum remboursable :{" "}
              <span className="font-semibold text-foreground">
                {formatEuro(maxRefund)}
              </span>
              . Un motif est obligatoire.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="refund-amount">Montant (€)</Label>
              <Input
                id="refund-amount"
                inputMode="decimal"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="0,00"
                disabled={refundMutation.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Moyen de remboursement</Label>
              <Select
                value={refundMethod}
                onValueChange={(v: "CASH" | "CARD" | "VOUCHER") => setRefundMethod(v)}
                disabled={refundMutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Espèces</SelectItem>
                  <SelectItem value="CARD">Carte bancaire</SelectItem>
                  <SelectItem value="VOUCHER">Avoir / Bon</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-reason">Motif</Label>
              <Textarea
                id="refund-reason"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Ex : client insatisfait, erreur de saisie…"
                disabled={refundMutation.isPending}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRefundOpen(false)}
              disabled={refundMutation.isPending}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={submitRefund}
              disabled={refundMutation.isPending}
              className="gap-2"
            >
              {refundMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Confirmer le remboursement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step-up PIN — every refund, at any amount (DD-19) */}
      <StepUpPinDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        action="REFUND"
        amount={pendingRefund?.amount}
        onConfirmed={executeRefund}
        title="Confirmation du remboursement"
        description="Tout remboursement doit être confirmé par votre code PIN."
      />
    </div>
  );
}
