// Receipt rendering — pure text snapshot for fiscal immutability.
import type { OrderDto, SettingsDto } from "@/types/api";
import { formatDateTime, formatEuro } from "@/lib/format";
import { addToVatBreakdown, apportion, type VatBreakdown } from "@/lib/money";
import { PAYMENT_LABELS_FULL } from "@/lib/order-labels";
import { SOFTWARE_IDENTITY } from "@/lib/version";

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

/**
 * L-58 (Batch 3.10) — the « numéro de la caisse » BOFiP § 50 lists among the
 * data in scope for the fonctionnalité de caisse.
 *
 * A LITERAL, and deliberately not a setting. This installation is one
 * restaurant, one till: a single SQLite file, a singleton `GrandTotal`, a
 * singleton `FiscalCounter` and one `Shift` sequence — there is no second till
 * for a number to distinguish it from (`docs/conformite-isca-map.md` § 1).
 * Inventing an operator-facing setting to hold the constant `1` would be a
 * value nobody could ever answer differently, and the finding asks for a
 * correct label, not a configuration surface.
 *
 * If a second till ever exists this must become per-install, and so must the
 * counters it sits beside — the number is the smallest part of that change.
 */
const CAISSE_NUMBER = 1;

/**
 * L-21 (Batch 1.3b) — break a line that is wider than the paper.
 *
 * `center()` below pads a string towards the middle and returns it untouched
 * when it is already wider than the paper: the `Math.max(0, …)` clamps the
 * PADDING, not the string. So an over-long field reached the printer at full
 * length, and nothing downstream could rescue it — `buildPrintJob()` passes
 * the text through verbatim on purpose (`escpos.ts`), because the printed
 * ticket must equal the archived `Receipt.content` byte for byte. The wrap
 * therefore has to happen here, at render time, before the snapshot is sealed.
 *
 * Measured on the live settings 2026-09-07: the restaurant's address is 56
 * characters against 48 columns of paper.
 *
 * Two properties this must have, and both are pinned by tests:
 *
 * 1. **A string that already fits comes back byte-identical.** Every ticket
 *    whose fields fit renders exactly as it did before this batch — which is
 *    why the receipt snapshot is unchanged by it.
 * 2. **A single token wider than the paper is hard-broken.** Word-wrapping
 *    alone cannot place a 60-character word on 48-column paper, and silently
 *    emitting it would reinstate the defect for the one input that provokes it.
 *
 * Lengths are counted in UTF-16 units, the same unit `center()` and
 * `leftRight()` have always used, so the three agree. For the French
 * repertoire this receipt prints that equals the printed column count; a
 * combining mark would over-count by one and wrap a column early, which errs
 * towards fitting the paper.
 */
export function wrapToWidth(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const out: string[] = [];
  let current = "";
  const flush = () => {
    if (current.length > 0) out.push(current);
    current = "";
  };
  for (const word of text.split(/\s+/)) {
    if (word.length === 0) continue;
    let token = word;
    while (token.length > width) {
      flush();
      out.push(token.slice(0, width));
      token = token.slice(width);
    }
    if (current.length === 0) current = token;
    else if (current.length + 1 + token.length <= width) current += ` ${token}`;
    else {
      flush();
      current = token;
    }
  }
  flush();
  // Only reachable from a string that is all whitespace and wider than the
  // paper. It has no words to lay out, so it collapses to one empty line
  // rather than to nothing, which would silently drop a line from the ticket.
  return out.length > 0 ? out : [""];
}

export function renderReceipt(order: OrderDto, settings?: Partial<SettingsDto>): string {
  const s = settings ?? {};
  const lines: string[] = [];
  const w = Math.max(32, s.receiptWidth ?? 42);
  const center = (str: string) => " ".repeat(Math.max(0, Math.floor((w - str.length) / 2))) + str;
  const leftRight = (l: string, r: string) => l + " ".repeat(Math.max(1, w - l.length - r.length)) + r;
  // L-21 (Batch 1.3b): every centred line goes through here, so the invariant
  // is "no centred line exceeds the paper" rather than a list of the fields
  // somebody remembered to wrap. For a string that already fits, `wrapToWidth`
  // returns it unchanged and this is exactly the centre-and-push it replaces.
  const pushCentred = (str: string) => {
    for (const part of wrapToWidth(str, w)) lines.push(center(part));
  };

  // FACTICE / SIMULATION stamp — required by ISCA when the caisse runs in
  // school/test mode so demo tickets are never mistaken for real fiscal ones.
  if (s.factice) {
    pushCentred("*** FACTICE — SIMULATION ***");
    pushCentred("TICKET NON VALABLE");
    lines.push("");
  }

  pushCentred(s.restaurantName ?? "HibaPOS France");
  if (s.restaurantAddress) pushCentred(s.restaurantAddress);
  if (s.restaurantPhone) pushCentred(`Tél : ${s.restaurantPhone}`);
  if (s.restaurantSiret) pushCentred(`SIRET : ${s.restaurantSiret}`);
  // M-06: the TVA number was a stored setting that no document ever printed.
  if (s.restaurantTva) pushCentred(`TVA : ${s.restaurantTva}`);
  // L-58 (Batch 3.10): the till identifies itself, in the block that identifies
  // the establishment. Centred, so it collides with nothing at any column count
  // — which is why it goes here rather than onto the cashier line below, where
  // it would have competed with the cashier's name for the width.
  //
  // That reasoning cited L-21 — "this renderer centres but never wraps" — which
  // was true when 3.10 wrote it and stopped being true in Batch 1.3b. The
  // placement stands on its own merits: a centred line has the whole width.
  pushCentred(`Caisse N° ${CAISSE_NUMBER}`);
  lines.push("-".repeat(w));
  lines.push(leftRight(`Ticket N° ${order.number}`, formatDateTime(order.createdAt)));
  // L-58 (Batch 3.10): this field used to read `Caisse #${shift.number}`, which
  // is the SHIFT counter — 3 on production, on a single-till install, so a
  // reader of the ticket saw a third till whose two siblings have no data
  // anywhere. The number is worth keeping (it ties the ticket to the Z report
  // that rolls it up); only its name was wrong. `Service N` is exactly as wide
  // as the `Caisse #N` it replaces, so no ticket gets closer to overflowing
  // than it already was.
  lines.push(leftRight(`Caissier : ${order.cashier?.name ?? "-"}`, `Service ${order.shift?.number ?? "-"}`));
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
    // DD-14 (Batch 5.7b). This was a two-branch ternary whose ELSE meant
    // "Bon / Ticket", so a new tender would have been printed under the wrong
    // name onto an immutable fiscal snapshot. It now reads the shared table
    // and falls back to the raw value rather than to a specific tender.
    const methodLabel = PAYMENT_LABELS_FULL[p.method] ?? p.method;
    lines.push(leftRight(methodLabel, formatEuro(p.amount)));
    if (p.method === "CASH" && (p.tendered ?? 0) > 0) {
      lines.push(`  Reçu ${formatEuro(p.tendered ?? 0)} — Rendu ${formatEuro(p.change ?? 0)}`);
    }
  }
  lines.push("-".repeat(w));
  pushCentred(`${order.itemCount} article${order.itemCount > 1 ? "s" : ""}`);
  pushCentred(s.footerNote ?? "Merci de votre visite !");
  // L-53 (Batch 3.7): the software identifies itself on every ticket. Until
  // this line the ticket named the restaurant and never the software — the
  // "HibaPOS France" above is only a fallback for a MISSING restaurant name —
  // while the attestation regime is version-matched and a control compares
  // the version in use with the attestations held. Last line, after the
  // footer, so the operator's own closing words keep their place.
  pushCentred(SOFTWARE_IDENTITY);

  return lines.join("\n");
}
