"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { OrderDto, SettingsDto } from "@/types/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, CheckCircle2, Download } from "lucide-react";
import { formatDateTime, formatEuro } from "@/lib/format";
import { downloadReceipt } from "@/lib/receipt";
import { useEffect } from "react";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Espèces",
  CARD: "Carte",
  VOUCHER: "Bon / Ticket",
};

const ORDER_TYPE_LABELS: Record<OrderDto["orderType"], string> = {
  DINE_IN: "Sur place",
  TAKEAWAY: "À emporter",
  LIVRAISON: "Livraison",
};

// Mirror orders-view.tsx safeParse helpers. Used to guard receipt rendering
// against malformed server JSON (a single corrupt line item shouldn't crash
// the entire modal).
type ParsedOption = { group: string; choice: string };
type ParsedAddOn = { name: string; price: number };
function safeParseOptions(json: string | null): ParsedOption[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as ParsedOption[]) : [];
  } catch {
    return [];
  }
}
function safeParseAddOns(json: string | null): ParsedAddOn[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as ParsedAddOn[]) : [];
  } catch {
    return [];
  }
}

export function ReceiptDialog({
  order,
  open,
  onOpenChange,
}: {
  order: OrderDto | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsDto>("/api/settings"),
  });

  const handlePrint = () => window.print();

  useEffect(() => {
    if (!open) return;
    // Auto-print if setting is enabled
    if (settings?.autoPrint) {
      const t = setTimeout(() => handlePrint(), 350);
      return () => clearTimeout(t);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handlePrint();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, settings?.autoPrint]);

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-[420px] flex-col gap-0 overflow-hidden p-0 print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <DialogHeader className="shrink-0 border-b border-border p-5 print:hidden">
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Commande encaissée
          </DialogTitle>
        </DialogHeader>

        {/* Receipt body — this is what prints */}
        <div id="receipt-print" className="receipt-paper min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 font-mono text-[12px] leading-relaxed text-foreground print:overflow-visible">
          <div className="text-center">
            <p className="text-base font-bold">{settings?.restaurantName ?? "HibaPOS France"}</p>
            {settings?.restaurantAddress && <p>{settings.restaurantAddress}</p>}
            {settings?.restaurantPhone && <p>Tél : {settings.restaurantPhone}</p>}
            {settings?.restaurantSiret && <p>SIRET : {settings.restaurantSiret}</p>}
            {settings?.restaurantTva && <p>TVA : {settings.restaurantTva}</p>}
          </div>
          <div className="my-2 border-t border-dashed border-foreground/40" />
          <div className="flex justify-between">
            <span>Reçu N°</span>
            <span className="font-bold">{order.number}</span>
          </div>
          <div className="flex justify-between">
            <span>Date</span>
            <span>{formatDateTime(order.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span>Caisse</span>
            <span>#{order.shift?.number ?? "-"} · {order.cashier?.name ?? "-"}</span>
          </div>
          <div className="flex justify-between">
            <span>Type</span>
            <span>{ORDER_TYPE_LABELS[order.orderType]}{order.tableLabel ? ` · ${order.tableLabel}` : ""}</span>
          </div>
          <div className="my-2 border-t border-dashed border-foreground/40" />

          {/* Items */}
          <div className="space-y-1.5">
            {order.items.map((item) => {
              const opts = safeParseOptions(item.optionsJson);
              const addons = safeParseAddOns(item.addOnsJson);
              return (
              <div key={item.id}>
                <div className="flex justify-between gap-2">
                  <span className="flex-1">
                    <span className="font-bold">{item.quantity}×</span> {item.productName}
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
                      <div key={i} className="flex justify-between">
                        <span>+ {a.name}</span>
                        <span>{formatEuro(a.price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              );
            })}
          </div>

          <div className="my-2 border-t border-dashed border-foreground/40" />
          <div className="flex justify-between">
            <span>Sous-total</span>
            <span>{formatEuro(order.subtotal)}</span>
          </div>
          {order.discountTotal > 0 && (
            <div className="flex justify-between">
              <span>Remise</span>
              <span>-{formatEuro(order.discountTotal)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>dont TVA</span>
            <span>{formatEuro(order.vatTotal)}</span>
          </div>
          <div className="my-1 border-t border-dashed border-foreground/40" />
          <div className="flex justify-between text-base font-bold">
            <span>TOTAL</span>
            <span>{formatEuro(order.total)}</span>
          </div>
          <div className="my-2 border-t border-dashed border-foreground/40" />
          <p className="font-bold">Paiements</p>
          {order.payments.map((p) => (
            <div key={p.id}>
              <div className="flex justify-between">
                <span>{METHOD_LABELS[p.method] ?? p.method}</span>
                <span>{formatEuro(p.amount)}</span>
              </div>
              {p.method === "CASH" && (p.tendered ?? 0) > 0 && (
                <div className="pl-2 text-[11px] text-foreground/70">
                  <span>Reçu {formatEuro(p.tendered ?? 0)} — Rendu {formatEuro(p.change ?? 0)}</span>
                </div>
              )}
            </div>
          ))}

          <div className="my-3 border-t border-dashed border-foreground/40" />
          <div className="text-center text-[11px]">
            <p>{order.itemCount} article{order.itemCount > 1 ? "s" : ""}</p>
            <p className="mt-2 font-semibold">{settings?.footerNote ?? "Merci de votre visite !"}</p>
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row gap-2 border-t border-border p-4 print:hidden">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Nouvelle vente
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => downloadReceipt(order, settings)} title="Télécharger le reçu">
            <Download className="h-4 w-4" />
          </Button>
          <Button className="flex-1 gap-2" onClick={handlePrint}>
            <Printer className="h-4 w-4" /> Imprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
