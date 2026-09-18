// Receipt rendering — pure text snapshot for fiscal immutability.
import type { OrderDto, SettingsDto } from "@/types/api";
import { formatDateTime, formatEuro } from "@/lib/format";
import {
  addToVatBreakdown,
  apportion,
  UNRECORDED_VAT_LABEL,
  type VatBreakdown,
} from "@/lib/money";
import { PAYMENT_LABELS_FULL } from "@/lib/order-labels";
import { SOFTWARE_IDENTITY } from "@/lib/version";
// L-21 (Batch 1.3b) / L-63 (Batch 1.3c) — the column layout of a printed
// ticket, shared with `day-close-ticket.ts` and `printer.ts`. Every line this
// renderer emits goes through one of these, so "no line exceeds the paper" is
// an invariant of the construction rather than a list of the fields somebody
// remembered. Each returns a line that already fits BYTE-IDENTICALLY.
import { centred, leftRight, marked } from "@/lib/services/ticket-layout";

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
    // L-129 (R9.8) — THE RECEIPT ANSWERS DIFFERENTLY FROM THE AGGREGATION, and
    // deliberately.
    //
    // `aggregate.ts` refuses a null rate: a VAT breakdown that gets sealed must
    // not carry a figure nobody measured. **Printing must never lose a sale**,
    // so this does not refuse — it prints the line and says the rate was not
    // recorded, instead of folding it into 10 % and claiming one.
    //
    // 10 % is the restauration rate and a drink à emporter is 5,5 %, so the old
    // `?? 10` was not conservative in either direction: it understated the VAT
    // on one and overstated it on the other, on a document the customer keeps.
    if (item.vatRate === null || item.vatRate === undefined) {
      // TTC only. `ht` and `vat` stay at zero because neither can be computed
      // without a rate, and putting the TTC in the HT column would be the same
      // invention in a different place.
      breakdown[UNRECORDED_VAT_LABEL] ??= { ht: 0, vat: 0, ttc: 0 };
      breakdown[UNRECORDED_VAT_LABEL].ttc += lineNets[idx];
      return;
    }
    addToVatBreakdown(breakdown, lineNets[idx], item.vatRate);
  });
  return breakdown;
}

/** "5.5" → "5,5 %" — French decimal comma, no invented precision. */
function rateLabel(key: string): string {
  // L-129 (R9.8): the unrecorded bucket is not a rate and must not be printed
  // with a « % » after it — « non enregistré % » would be worse than the
  // invented 10 this replaced.
  if (key === UNRECORDED_VAT_LABEL) return `Taux ${UNRECORDED_VAT_LABEL}`;
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
 * The article blocks a ticket prints — Batch 5.9f.
 *
 * An ordinary line is its own block. The lines of ONE menu composé are a single
 * block, gathered by `comboGroupId`, because that is what the customer bought:
 * a Menu Chill at 24,90, not a pizza at 10,86 and another at 10,85 and a Coca
 * at 3,19. Those three figures are ALLOCATION ARTEFACTS — the shares the
 * forfait was divided into so each could carry its own VAT rate — and printing
 * them would state prices the customer did not pay and cannot be charged.
 *
 * Order is preserved and grouping is by id, not by adjacency: two Menu Chills
 * on one ticket have two group ids and stay two blocks, and a line that landed
 * between them would not merge them.
 */
type ArticleBlock =
  | { kind: "item"; item: OrderDto["items"][number] }
  | { kind: "combo"; name: string; price: number; quantity: number; parts: OrderDto["items"] };

export function articleBlocks(items: OrderDto["items"]): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  const byGroup = new Map<string, Extract<ArticleBlock, { kind: "combo" }>>();
  for (const item of items) {
    const group = item.comboGroupId ?? null;
    if (!group) {
      blocks.push({ kind: "item", item });
      continue;
    }
    const existing = byGroup.get(group);
    if (existing) {
      existing.parts.push(item);
      continue;
    }
    const block: Extract<ArticleBlock, { kind: "combo" }> = {
      kind: "combo",
      // `comboName` is snapshotted beside the lines, so renaming a menu in the
      // catalogue cannot restate a ticket that was already printed.
      name: item.comboName ?? item.productName,
      price: item.comboPrice ?? 0,
      quantity: item.quantity,
      parts: [item],
    };
    byGroup.set(group, block);
    blocks.push(block);
  }
  return blocks;
}

export function renderReceipt(order: OrderDto, settings?: Partial<SettingsDto>): string {
  const s = settings ?? {};
  const lines: string[] = [];
  const w = Math.max(32, s.receiptWidth ?? 42);
  const pushCentred = (str: string) => lines.push(...centred(str, w));
  const pushLeftRight = (l: string, r: string) => lines.push(...leftRight(l, r, w));
  // A marked sub-line under an article: the option's `· `, the add-on's `+ `,
  // and the change line's plain indent. Continuations line up under the TEXT,
  // so a wrapped choice cannot be read as a second choice (L-63).
  const pushMarked = (indent: string, str: string) => lines.push(...marked(indent, str, w));

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
  pushLeftRight(`Ticket N° ${order.number}`, formatDateTime(order.createdAt));
  // L-58 (Batch 3.10): this field used to read `Caisse #${shift.number}`, which
  // is the SHIFT counter — 3 on production, on a single-till install, so a
  // reader of the ticket saw a third till whose two siblings have no data
  // anywhere. The number is worth keeping (it ties the ticket to the Z report
  // that rolls it up); only its name was wrong. `Service N` is exactly as wide
  // as the `Caisse #N` it replaces, so no ticket gets closer to overflowing
  // than it already was.
  pushLeftRight(`Caissier : ${order.cashier?.name ?? "-"}`, `Service ${order.shift?.number ?? "-"}`);
  const typeLabel = order.orderType === "DINE_IN" ? "Sur place" : order.orderType === "TAKEAWAY" ? "À emporter" : "Livraison";
  pushLeftRight(`Type : ${typeLabel}`, order.tableLabel ? `Table : ${order.tableLabel}` : "");
  lines.push("-".repeat(w));

  // The chosen options of one article, as indented price-less lines. Extracted
  // in Batch 5.9f because a menu's components need them one level deeper.
  const pushOptions = (item: OrderDto["items"][number], indent: string) => {
    if (!item.optionsJson) return;
    try {
      // L-217: `quantity` is OPTIONAL and absent on every snapshot written
      // before 2026-09-18, so `?? 1` is the vintage rule the plan requires of
      // anything reading a sealed payload — not a default standing in for a
      // figure nobody recorded.
      const opts = JSON.parse(item.optionsJson) as { group: string; choice: string; quantity?: number }[];
      for (const o of opts) {
        const n = o.quantity ?? 1;
        // `2× ` and not `(x2)`: the same mark the article lines above use, so
        // the paper has ONE way of saying how many of something there are.
        pushMarked(indent, n > 1 ? `${n}× ${o.choice}` : o.choice);
      }
    } catch {
      pushMarked(indent, "(options illisibles)");
    }
  };
  // The supplements, WITH their prices — unlike an option or a component, a
  // supplement is money the customer paid.
  const pushAddOns = (item: OrderDto["items"][number], indent: string) => {
    if (!item.addOnsJson) return;
    try {
      // L-219: `quantity` has been in this snapshot since L-127 (R8.5) and no
      // reader had ever looked at it. R8.5's own comment measured the cost —
      // « 3 x Viande Hachee printed as one + Viande Hachee (1,50 EUR), 4,50 EUR
      // unexplained on a document that is never re-rendered » — and fixed the
      // WRITER. This is the reader catching up.
      //
      // THE PRICE STAYS THE UNIT PRICE. Everything indented under an article is
      // its per-unit configuration; the article's own line carries the total,
      // and that is the figure the customer reconciles against. `2x Cheddar
      // (1,00 EUR)` is two cheddars at a euro each, which needs no new
      // convention to read.
      //
      // `?? 1` is the vintage rule: every snapshot written before R8.5 omits the
      // field, and absent means one.
      const adds = JSON.parse(item.addOnsJson) as { name: string; price: number; quantity?: number }[];
      for (const a of adds) {
        const n = a.quantity ?? 1;
        pushMarked(indent, `${n > 1 ? `${n}× ` : ""}${a.name} (${formatEuro(a.price)})`);
      }
    } catch {
      pushMarked(indent, "(suppléments illisibles)");
    }
  };

  for (const block of articleBlocks(order.items)) {
    if (block.kind === "item") {
      pushLeftRight(`${block.item.quantity}× ${block.item.productName}`, formatEuro(block.item.lineTotal));
      pushOptions(block.item, "  · ");
      pushAddOns(block.item, "  + ");
      continue;
    }

    // A menu composé (Batch 5.9f). The operator's ruling: the ticket shows the
    // composition, as indented price-less lines, and NO per-component amount.
    // The forfait is the price beside the menu's name; the `Détail TVA` block
    // below carries the rates the components were booked at.
    pushLeftRight(`${block.quantity}× ${block.name}`, formatEuro(block.price * block.quantity));
    for (const part of block.parts) {
      pushMarked("  · ", part.productName);
      // The component's own choices — « Senior », « Sans Crudités ». One level
      // deeper, so a choice can never be read as another component.
      pushOptions(part, "    · ");
      pushAddOns(part, "    + ");
    }
  }

  lines.push("-".repeat(w));
  pushLeftRight("Sous-total", formatEuro(order.subtotal));
  if (order.discountTotal > 0) pushLeftRight("Remise", `-${formatEuro(order.discountTotal)}`);

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
      pushLeftRight(`TVA ${rateLabel(key)} (HT ${formatEuro(row.ht)})`, formatEuro(row.vat));
    }
  }

  // Kept as the total, below the detail. `order.vatTotal` is the stored,
  // sealed figure; the rows above are recomputed. They agree — both run the
  // same apportionment over the same snapshotted rates — but the ticket shows
  // the stored one, because that is the number the fiscal record holds.
  pushLeftRight("dont TVA", formatEuro(order.vatTotal));
  pushLeftRight("TOTAL", formatEuro(order.total));
  lines.push("-".repeat(w));
  lines.push("Paiements");
  for (const p of order.payments) {
    // DD-14 (Batch 5.7b). This was a two-branch ternary whose ELSE meant
    // "Bon / Ticket", so a new tender would have been printed under the wrong
    // name onto an immutable fiscal snapshot. It now reads the shared table
    // and falls back to the raw value rather than to a specific tender.
    const methodLabel = PAYMENT_LABELS_FULL[p.method] ?? p.method;
    pushLeftRight(methodLabel, formatEuro(p.amount));
    if (p.method === "CASH" && (p.tendered ?? 0) > 0) {
      pushMarked("  ", `Reçu ${formatEuro(p.tendered ?? 0)} — Rendu ${formatEuro(p.change ?? 0)}`);
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
