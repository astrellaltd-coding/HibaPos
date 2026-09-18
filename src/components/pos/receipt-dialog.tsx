"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { OrderDto, SettingsDto } from "@/types/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, CheckCircle2, Download } from "lucide-react";
import { formatDateTime, formatEuro } from "@/lib/format";
import { downloadReceipt } from "@/lib/receipt";
import { ORDER_TYPE_LABELS, PAYMENT_LABELS_FULL } from "@/lib/order-labels";
import { safeParseOptions, safeParseAddOns } from "@/lib/order-parsers";
import { useEffect } from "react";
import { toast } from "sonner";

// Mirror orders-view.tsx safeParse helpers. Used to guard receipt rendering
// against malformed server JSON (a single corrupt line item shouldn't crash
// the entire modal).

/**
 * WHAT THE PRINTER GETS — L-97 (R9.1).
 *
 * `globals.css` hides `body *` in print media and shows only `#receipt-print`.
 * That id used to sit on the styled block the cashier reads, which is a SECOND
 * rendering built from the order DTO — so the customer's paper was not the
 * archived document, and dropped four things `Receipt.content` carries: the
 * FACTICE / SIMULATION stamp, `Caisse N°`, the per-rate `Détail TVA` and the
 * software identity line. With `factice = true`, which is production's value
 * today, that is a ticket which does not say it is invalid. `autoPrint` fires
 * it 350 ms after the dialog opens, unattended, on the only path that reaches
 * paper while the ESC/POS transport is unconfigured.
 *
 * So the id lives here, on the sealed text, and this cannot drift from the
 * archive because it IS the archive.
 *
 * `hidden print:block` rather than a visibility class: `display: none` would
 * beat the stylesheet's `visibility: visible` and print an empty page.
 *
 * Its own exported component because the dialog cannot be rendered in a test —
 * `DialogContent` portals, and `react-dom/server` yields nothing for a portal.
 * Untestable is how L-100 reached the till, so the piece that must be right is
 * the piece that is reachable.
 */
export function ReceiptPrintable({ content }: { content: string | null | undefined }) {
  if (!content) return null;
  return (
    <pre
      id="receipt-print"
      className="hidden whitespace-pre-wrap font-mono text-[12px] leading-tight print:block"
    >
      {content}
    </pre>
  );
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

  // L-97 (R9.1) — the sealed document, or nothing.
  //
  // A route that does not include `receipt` gives an order with no sealed text.
  // The old code would have printed its own re-rendering; there is nothing
  // honest to print instead, so the button says so and `autoPrint` stays quiet
  // rather than pushing a blank page out unattended.
  const sealed = order?.receipt?.content ?? null;

  const handlePrint = () => {
    if (!sealed) {
      toast.error("Le ticket archivé n'est pas disponible. Réimprimez depuis les commandes.");
      return;
    }
    window.print();
  };

  useEffect(() => {
    if (!open) return;
    // Auto-print if setting is enabled
    if (settings?.autoPrint && sealed) {
      const t = setTimeout(() => handlePrint(), 350);
      return () => clearTimeout(t);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handlePrint();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settings?.autoPrint, sealed]);

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-[420px] flex-col gap-0 overflow-hidden p-0 print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <DialogHeader className="shrink-0 border-b border-border p-5 print:hidden">
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Commande encaissée
          </DialogTitle>
        </DialogHeader>

        {/* What the printer gets — the sealed document (L-97). */}
        <ReceiptPrintable content={sealed} />

        {/* Receipt body — what the cashier reads on screen */}
        <div className="receipt-paper min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 font-mono text-[12px] leading-relaxed text-foreground print:overflow-visible">
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
                    {/* L-217 reached the PRINTED ticket and not this one, so the
                      * paper and the screen disagreed about the same sale. */}
                    {opts.map((o, i) => (
                      <div key={i}>· {(o.quantity ?? 1) > 1 ? `${o.quantity}× ` : ""}{o.choice}</div>
                    ))}
                  </div>
                )}
                {addons.length > 0 && (
                  <div className="pl-4 text-[11px] text-foreground/70">
                    {addons.map((a, i) => (
                      <div key={i} className="flex justify-between">
                        <span>+ {(a.quantity ?? 1) > 1 ? `${a.quantity}× ` : ""}{a.name}</span>
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
                <span>{PAYMENT_LABELS_FULL[p.method] ?? p.method}</span>
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
          <Button
            className="flex-1 gap-2"
            onClick={handlePrint}
            disabled={!sealed}
            title={sealed ? undefined : "Le ticket archivé n'est pas disponible."}
          >
            <Printer className="h-4 w-4" /> Imprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
