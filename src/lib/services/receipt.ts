// Receipt rendering — pure text snapshot for fiscal immutability.
import type { OrderDto, SettingsDto } from "@/types/api";
import { formatDateTime, formatEuro } from "@/lib/format";

export function renderReceipt(order: OrderDto, settings?: Partial<SettingsDto>): string {
  const s = settings ?? {};
  const lines: string[] = [];
  const w = Math.max(32, s.receiptWidth ?? 42);
  const center = (str: string) => " ".repeat(Math.max(0, Math.floor((w - str.length) / 2))) + str;
  const leftRight = (l: string, r: string) => l + " ".repeat(Math.max(1, w - l.length - r.length)) + r;

  // FACTICE / SIMULATION stamp — required by ISCA when the caisse runs in
  // school/test mode so demo tickets are never mistaken for real fiscal ones.
  if (s.factice) {
    lines.push(center("*** FACTICE — SIMULATION ***"));
    lines.push(center("TICKET NON VALABLE"));
    lines.push("");
  }

  lines.push(center(s.restaurantName ?? "HibaPOS France"));
  if (s.restaurantAddress) lines.push(center(s.restaurantAddress));
  if (s.restaurantPhone) lines.push(center(`Tél : ${s.restaurantPhone}`));
  if (s.restaurantSiret) lines.push(center(`SIRET : ${s.restaurantSiret}`));
  lines.push("-".repeat(w));
  lines.push(leftRight(`Ticket N° ${order.number}`, formatDateTime(order.createdAt)));
  lines.push(leftRight(`Caissier : ${order.cashier?.name ?? "-"}`, `Caisse #${order.shift?.number ?? "-"}`));
  const typeLabel = order.orderType === "DINE_IN" ? "Sur place" : order.orderType === "TAKEAWAY" ? "À emporter" : "Livraison";
  lines.push(leftRight(`Type : ${typeLabel}`, order.tableLabel ? `Table : ${order.tableLabel}` : ""));
  lines.push("-".repeat(w));

  for (const item of order.items) {
    lines.push(leftRight(`${item.quantity}× ${item.productName}`, formatEuro(item.lineTotal)));
    if (item.optionsJson) {
      const opts = JSON.parse(item.optionsJson) as { group: string; choice: string }[];
      for (const o of opts) lines.push(`  · ${o.choice}`);
    }
    if (item.addOnsJson) {
      const adds = JSON.parse(item.addOnsJson) as { name: string; price: number }[];
      for (const a of adds) lines.push(`  + ${a.name} (${formatEuro(a.price)})`);
    }
  }

  lines.push("-".repeat(w));
  lines.push(leftRight("Sous-total", formatEuro(order.subtotal)));
  if (order.discountTotal > 0) lines.push(leftRight("Remise", `-${formatEuro(order.discountTotal)}`));
  lines.push(leftRight("dont TVA", formatEuro(order.vatTotal)));
  lines.push(leftRight("TOTAL", formatEuro(order.total)));
  lines.push("-".repeat(w));
  lines.push("Paiements");
  for (const p of order.payments) {
    const methodLabel = p.method === "CASH" ? "Espèces" : p.method === "CARD" ? "Carte" : "Bon / Ticket";
    lines.push(leftRight(methodLabel, formatEuro(p.amount)));
    if (p.method === "CASH" && (p.tendered ?? 0) > 0) {
      lines.push(`  Reçu ${formatEuro(p.tendered ?? 0)} — Rendu ${formatEuro(p.change ?? 0)}`);
    }
  }
  lines.push("-".repeat(w));
  lines.push(center(`${order.itemCount} article${order.itemCount > 1 ? "s" : ""}`));
  lines.push(center(s.footerNote ?? "Merci de votre visite !"));

  return lines.join("\n");
}
