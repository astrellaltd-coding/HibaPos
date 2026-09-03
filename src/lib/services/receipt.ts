// Receipt rendering — pure text snapshot for fiscal immutability.
import type { OrderDto, SettingsDto } from "@/types/api";
import { formatDateTime, formatEuro } from "@/lib/format";
import { addToVatBreakdown, apportion, type VatBreakdown } from "@/lib/money";

/**
 * M-06 (Batch 3.6) — the per-rate VAT block.
 *
 * Built the same way the checkout transaction builds the one it stores on the
 * order: the discount is apportioned across the lines exactly (largest
 * remainder, M-13), then each line's NET total is split by its own snapshotted
 * rate. Sharing the arithmetic is the point — a ticket that disagreed with the
 * Z report it rolls up into would be worse than no breakdown at all.
 *
 * The rate label comes from the breakdown KEY, which is already minimal form
 * ("5.5", "10"). Deliberately not `toFixed(1)`: that is L-19, and it would
 * print a 1,05 % rate as "1,1 %" — a wrong rate on a fiscal document.
 */
function vatBreakdownOf(order: OrderDto): VatBreakdown {
  const breakdown: VatBreakdown = {};
  const lineNets = apportion(order.items.map((i) => i.lineTotal), order.total);
  order.items.forEach((item, idx) => {
    addToVatBreakdown(breakdown, lineNets[idx], item.vatRate ?? 10);
  });
  return breakdown;
}

/** "5.5" → "5,5 %" — French decimal comma, no invented precision. */
function rateLabel(key: string): string {
  return `${key.replace(".", ",")} %`;
}

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
  // M-06: the TVA number was a stored setting that no document ever printed.
  if (s.restaurantTva) lines.push(center(`TVA : ${s.restaurantTva}`));
  lines.push("-".repeat(w));
  lines.push(leftRight(`Ticket N° ${order.number}`, formatDateTime(order.createdAt)));
  lines.push(leftRight(`Caissier : ${order.cashier?.name ?? "-"}`, `Caisse #${order.shift?.number ?? "-"}`));
  const typeLabel = order.orderType === "DINE_IN" ? "Sur place" : order.orderType === "TAKEAWAY" ? "À emporter" : "Livraison";
  lines.push(leftRight(`Type : ${typeLabel}`, order.tableLabel ? `Table : ${order.tableLabel}` : ""));
  lines.push("-".repeat(w));

  for (const item of order.items) {
    lines.push(leftRight(`${item.quantity}× ${item.productName}`, formatEuro(item.lineTotal)));
    if (item.optionsJson) {
      try {
        const opts = JSON.parse(item.optionsJson) as { group: string; choice: string }[];
        for (const o of opts) lines.push(`  · ${o.choice}`);
      } catch {
        lines.push("  · (options illisibles)");
      }
    }
    if (item.addOnsJson) {
      try {
        const adds = JSON.parse(item.addOnsJson) as { name: string; price: number }[];
        for (const a of adds) lines.push(`  + ${a.name} (${formatEuro(a.price)})`);
      } catch {
        lines.push("  + (suppléments illisibles)");
      }
    }
  }

  lines.push("-".repeat(w));
  lines.push(leftRight("Sous-total", formatEuro(order.subtotal)));
  if (order.discountTotal > 0) lines.push(leftRight("Remise", `-${formatEuro(order.discountTotal)}`));

  // M-06: one line per rate. This restaurant sells at two (10 % and 5,5 %),
  // so the single merged "dont TVA" line hid the split on every ticket.
  // Sorted numerically, not lexicographically — "10" sorts before "5.5" as
  // text, which would print the rates in the wrong order.
  const breakdown = vatBreakdownOf(order);
  const rateKeys = Object.keys(breakdown).sort((a, b) => Number(a) - Number(b));
  if (rateKeys.length > 0) {
    lines.push("Détail TVA");
    for (const key of rateKeys) {
      const row = breakdown[key];
      lines.push(leftRight(`TVA ${rateLabel(key)} (HT ${formatEuro(row.ht)})`, formatEuro(row.vat)));
    }
  }

  // Kept as the total, below the detail. `order.vatTotal` is the stored,
  // sealed figure; the rows above are recomputed. They agree — both run the
  // same apportionment over the same snapshotted rates — but the ticket shows
  // the stored one, because that is the number the fiscal record holds.
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
