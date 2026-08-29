"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CustomerDto } from "@/types/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/shared/money";
import { formatEuro, formatDateTime, formatRelativeDateTime } from "@/lib/format";

const ORDER_TYPE_LABELS: Record<string, string> = {
  DINE_IN: "Sur place",
  TAKEAWAY: "À emporter",
  LIVRAISON: "Livraison",
};
import {
  Phone,
  Mail,
  MapPin,
  ShoppingBag,
  Calendar,
  TrendingUp,
  Receipt,
  Heart,
  Loader2,
} from "lucide-react";

type CustomerDetail = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  stats: {
    totalSpent: number;
    totalOrders: number;
    totalItems: number;
    avgTicket: number;
    lastVisit: string | null;
    firstVisit: string | null;
  };
  favoriteProducts: { name: string; quantity: number; total: number }[];
  paymentBreakdown: { method: string; amount: number; count: number }[];
  orders: {
    id: string;
    number: number;
    status: string;
    orderType: string;
    tableLabel: string | null;
    total: number;
    itemCount: number;
    createdAt: string;
    cashierName: string;
    shiftNumber: number | null;
    items: { productName: string; quantity: number; lineTotal: number }[];
    payments: { method: string; amount: number }[];
  }[];
};



export function CustomerDetailDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: CustomerDto | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ["customer", "detail", customer?.id],
    queryFn: () => api.get<CustomerDetail>(`/api/customers/${customer!.id}/detail`),
    enabled: !!customer && open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b border-border p-5">
          <DialogTitle className="flex items-center gap-2">
            {customer?.name ?? "Client"}
          </DialogTitle>
          <DialogDescription>
            Profil et historique des commandes
          </DialogDescription>
        </DialogHeader>

        {isLoading || !detail ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-5 p-5">
              {/* Contact info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {detail.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{detail.phone}</span>
                  </div>
                )}
                {detail.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{detail.email}</span>
                  </div>
                )}
                {detail.address && (
                  <div className="col-span-2 flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{detail.address}</span>
                  </div>
                )}
                {!detail.phone && !detail.email && !detail.address && (
                  <p className="col-span-2 text-sm text-muted-foreground">Aucune coordonnée renseignée</p>
                )}
              </div>

              {detail.notes && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium">Note</p>
                  <p className="mt-0.5">{detail.notes}</p>
                </div>
              )}

              <Separator />

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  icon={TrendingUp}
                  label="Total dépensé"
                  value={formatEuro(detail.stats.totalSpent)}
                  tone="amber"
                />
                <StatCard
                  icon={Receipt}
                  label="Commandes"
                  value={String(detail.stats.totalOrders)}
                  tone="default"
                />
                <StatCard
                  icon={ShoppingBag}
                  label="Articles"
                  value={String(detail.stats.totalItems)}
                  tone="default"
                />
                <StatCard
                  icon={Calendar}
                  label="Ticket moyen"
                  value={detail.stats.totalOrders > 0 ? formatEuro(detail.stats.avgTicket) : "—"}
                  tone="default"
                />
              </div>

              {/* Visit info */}
              {detail.stats.firstVisit && (
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Client depuis le
                  </span>
                  <span className="font-medium">{formatDateTime(detail.stats.firstVisit)}</span>
                </div>
              )}
              {detail.stats.lastVisit && (
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Dernière visite
                  </span>
                  <span className="font-medium">{formatRelativeDateTime(detail.stats.lastVisit)}</span>
                </div>
              )}

              {/* Favorite products */}
              {detail.favoriteProducts.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Heart className="h-4 w-4 text-rose-500" />
                      Produits favoris
                    </h3>
                    <div className="space-y-1.5">
                      {detail.favoriteProducts.map((p, i) => (
                        <div
                          key={p.name}
                          className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                        >
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {i + 1}
                          </span>
                          <span className="flex-1 truncate font-medium text-foreground">{p.name}</span>
                          <span className="text-xs text-muted-foreground">{p.quantity}×</span>
                          <Money amount={p.total} className="text-sm font-semibold" />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Order history */}
              <Separator />
              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  Historique des commandes ({detail.orders.length})
                </h3>
                {detail.orders.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                    Aucune commande terminée
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detail.orders.map((order) => (
                      <div
                        key={order.id}
                        className="rounded-lg border border-border bg-card p-3 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">#{order.number}</span>
                            <Badge
                              variant={order.status === "COMPLETED" ? "default" : "secondary"}
                              className={
                                order.status === "COMPLETED"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-rose-100 text-rose-700"
                              }
                            >
                              {order.status === "COMPLETED" ? "Terminée" : "Remboursée"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {ORDER_TYPE_LABELS[order.orderType]}
                              {order.tableLabel ? ` · ${order.tableLabel}` : ""}
                            </span>
                          </div>
                          <Money amount={order.total} className="font-semibold" />
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{formatRelativeDateTime(order.createdAt)}</span>
                          <span>· {order.itemCount} article{order.itemCount > 1 ? "s" : ""}</span>
                          <span>· {order.cashierName}</span>
                        </div>
                        <div className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">
                          {order.items.map((i) => `${i.quantity}× ${i.productName}`).join(", ")}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  tone: "amber" | "default";
}) {
  return (
    <div
      className={
        "rounded-xl border p-3 " +
        (tone === "amber"
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card")
      }
    >
      <Icon
        className={
          "mb-1.5 h-4 w-4 " + (tone === "amber" ? "text-primary" : "text-muted-foreground")
        }
      />
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
