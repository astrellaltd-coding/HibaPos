// L-221 / L-222 — the bon de livraison, and the reason it is a second piece of
// paper rather than four more lines on the first one.
//
// ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
// Reported by the restaurant's owner at the caisse on 2026-09-18, trying a
// livraison: the delivery ticket said « Type : Livraison » and nothing whatever
// about who or where. `OrderDto.customer` was `{ name: string }` alone, both
// order routes selected exactly the name, and `renderReceipt` printed no
// customer at all. **The driver was handed a ticket with no destination on it.**
//
// ── WHY NOT JUST PUT THE ADDRESS ON THE TICKET ──────────────────────────────
// Because of what that ticket is. `Receipt.content` is the SEALED document
// (R9.1 — « the customer's paper IS the sealed `Receipt.content` »): nothing in
// the application rewrites it, the only production writes to the `Receipt` row
// are `printStatus`, `printedAt` and `reprintCount`, and `buildAnnualArchive`
// copies the text VERBATIM into the annual archive file — the one destined for
// the administration (V-02, L-52). A name, a telephone number and a home
// address put there are permanent, and that is a personal-data question rather
// than a layout one.
//
// **THE OPERATOR DECIDED IT ON 2026-09-18**, given both shapes in writing: the
// sealed ticket gains the customer's NAME, and a delivery ALSO prints this
// slip, which carries the telephone number and the address and is never stored.
// It is the only shape that keeps a customer's home out of an immutable fiscal
// record while still telling the driver where to go.
//
// ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
// **It is not a fiscal document and it must never look like one.** It carries
// no total, no VAT, no ticket number, no SIRET and no software identity line,
// and it says « DOCUMENT NON FISCAL » under its own title. Leaving the money
// off is deliberate: the sale is settled at the till before this prints, so a
// figure here would buy nothing and would invite the slip being handed over as
// a receipt. Nothing is written to the database when it prints — there is no
// row, no fiscal event and no audit entry, because nothing has happened that
// the journal does not already hold as the VENTE.
//
// `renderDeliveryNote` is pure, like `renderReceipt` and `renderDayCloseTicket`:
// it takes the order and the settings and returns text. No database, no printer,
// no clock of its own. `printDeliveryNote` below is the one impure export, and
// it lives here rather than in either print route so that the two routes cannot
// come to disagree about when a slip is owed — which is exactly what L-214 was.

import type { OrderDto, SettingsDto } from "@/types/api";
import type { PrintOutcome } from "@/lib/services/printer";
// L-63: the same layout helpers as the other three renderers. Nothing
// downstream can rescue an over-long line — `buildPrintJob` passes the text
// through verbatim — so a 32-column paper wraps here or not at all.
import { box, field } from "@/lib/services/ticket-layout";

/**
 * Just enough of an order to print a delivery slip.
 *
 * Structural rather than `OrderDto`, for the reason `DayCloseForTicket` is:
 * the renderer must not drift into needing a live database row, and a test
 * builds one of these by hand.
 */
export type OrderForDeliveryNote = Pick<OrderDto, "number" | "orderType" | "notes"> & {
  /**
   * `Date` as well as `string`, because both callers hand it a PRISMA ROW.
   * `OrderDto.createdAt` is a string — it has been through JSON — and the two
   * print routes read the order straight from the database, where it is a
   * `Date`. `formatDateTime` has always taken either; narrowing this to the
   * DTO's string would force a caller to stringify a date so that this could
   * parse it back, which is two conversions to lose precision in.
   */
  createdAt: Date | string;
  customer?: { name: string; phone: string | null; address: string | null; city: string | null } | null;
};

/**
 * The slip, or `null` when this order does not get one.
 *
 * ONE RETURN VALUE AND ONE CHECK, on purpose: `null` means « do not print a
 * second document », and every caller then has exactly one condition to get
 * right. The alternative — each print route deciding for itself whether an
 * order is a delivery with a customer — is the shape L-214 was about, where two
 * sides wrote the same rule in different words and drifted.
 *
 * `null` for a non-delivery, and `null` for a delivery whose customer row is
 * missing. The second is defensive rather than reachable: `POST /api/orders`
 * refuses a LIVRAISON without a deliverable client. A slip with an empty name
 * and no address would be worse on paper than no slip at all.
 */
export function renderDeliveryNote(
  order: OrderForDeliveryNote,
  settings?: Partial<SettingsDto>,
): string | null {
  if (order.orderType !== "LIVRAISON") return null;
  const customer = order.customer;
  if (!customer?.name?.trim()) return null;

  const s = settings ?? {};
  const w = Math.max(32, s.receiptWidth ?? 42);
  const lines: string[] = [];

  // -- ONE SLIP, AND NOTHING HERE IS SEALED ---------------------------------
  //
  // 2026-09-27: this was its own print job with its own « BON DE LIVRAISON /
  // DOCUMENT NON FISCAL » header, so the cutter ran twice and the customer got
  // two pieces of paper. The owner asked for one.
  //
  // 2026-09-30, **L-248**: the operator researched the personal-data question
  // and the answer went further than the layout. The fiscal obligation can
  // justify keeping data already necessary to a retained document, but it does
  // not make delivery data fiscal -- an address and a telephone are needed to
  // execute the delivery, not to evidence the transaction. So **the NAME came
  // out of `Receipt.content` too**, and this block now carries every piece of
  // customer data that appears on the ticket.
  //
  // **NONE OF IT IS STORED.** `deliveryPaper()` inserts these lines into the
  // PRINTED paper; `buildAnnualArchive` copies `Receipt.content`, which no
  // longer mentions the customer at all. The consequence worth knowing: a
  // deletion request now genuinely erases someone -- the ticket keeps the
  // transaction and loses the person -- where before their name was frozen for
  // the whole retention period.
  //
  // No FACTICE stamp: the ticket's own banner is a few lines above.
  lines.push(...box(["INFORMATIONS CLIENT"], w));
  lines.push(...field("Nom", customer.name.trim(), w));

  const phone = customer.phone?.trim();
  if (phone) lines.push(...field("Téléphone", phone, w));

  // Street and town in one field, the town in capitals the way a French postal
  // address is laid out. `field()` hangs the continuation under the value, so a
  // long address cannot wrap back to the margin and read as a new label.
  const street = customer.address?.trim();
  const town = customer.city?.trim().toUpperCase();
  const postal = [street, town].filter(Boolean).join(", ");
  if (postal) lines.push(...field("Adresse", postal, w));

  // The order's own note -- « code 34B2, 3e étage ». It is on NO other printed
  // document, which is why dropping this block would cost the driver every door
  // code in the restaurant.
  const note = order.notes?.trim();
  if (note) lines.push(...field("Note", note, w));

  return lines.join("\n");
}

/**
 * The paper for one order: the sealed ticket, followed by the delivery block
 * when the order is owed one.
 *
 * ONE JOB, ONE CUT — the owner's ask of 2026-09-27. This used to be
 * `printDeliveryNote`, a SECOND call to `printReceiptText`, and a second call
 * runs the cutter again: the customer got two pieces of paper and complained
 * that the second repeated the first. Composing the text and printing once is
 * what makes it one slip; nothing else here changed.
 *
 * `owed` is kept separate from the text because the three states of
 * `deliveryNotePrinted` still have to be told apart — « none was due » is not
 * « it failed » (L-143). It is `false` for a sur-place order or an order with
 * no deliverable customer, exactly as `renderDeliveryNote` returning `null` was.
 *
 * NOTHING HERE IS SEALED. `receiptText` is the sealed `Receipt.content` and is
 * passed through untouched; the block is appended at print time and stored
 * nowhere, which is what keeps a customer's home address out of the annual
 * archive (the operator's decision of 2026-09-18, reaffirmed 2026-09-27).
 */
/**
 * The ARTICLES frame's title line, which is what the client block is inserted
 * above. Anchored on the WORD between the frame's bars and not on the whole
 * line: the bars are padding, and the padding changes with `receiptWidth`,
 * which the operator may set to 32, 42 or 48.
 */
const ARTICLES_TITLE = /^\|\s*ARTICLES\s*\|$/;

export function deliveryPaper(
  receiptText: string,
  order: OrderForDeliveryNote,
  settings: Partial<SettingsDto>,
): { paper: string; owed: boolean } {
  const note = renderDeliveryNote(order, settings);
  if (note === null) return { paper: receiptText, owed: false };

  // -- WHERE THE BLOCK GOES, AND WHY IT IS FOUND RATHER THAN COUNTED --------
  //
  // The owner wants the client details high on the ticket, under the order's
  // own details -- not at the foot, where they sat until 2026-09-30. So the
  // block is INSERTED rather than appended, immediately above the ARTICLES
  // frame.
  //
  // The insertion point is SEARCHED FOR in the sealed text, because a reprint
  // has nothing else to go on: it is handed `Receipt.content` out of the
  // database and no render-time position survives in there.
  //
  // **A TICKET SEALED BEFORE THIS CHANGE HAS NO SUCH FRAME.** Every receipt
  // issued up to 2026-09-30 is the older flat layout, so the search answers -1
  // and the block is appended at the end as it used to be. That is not a
  // degraded case to tidy up later: a reprint of an old order must not lose the
  // driver's address because the layout moved on.
  const lines = receiptText.split("\n");
  const titleAt = lines.findIndex((l) => ARTICLES_TITLE.test(l));
  if (titleAt <= 0) return { paper: [receiptText, note].join("\n"), owed: true };

  // `titleAt - 1` is the frame's top edge; the block and one blank line go in
  // front of it, so the paper reads ... Type, blank, CLIENT frame, blank,
  // ARTICLES frame ...
  const insertAt = titleAt - 1;
  const paper = [...lines.slice(0, insertAt), ...note.split("\n"), "", ...lines.slice(insertAt)];
  return { paper: paper.join("\n"), owed: true };
}

/**
 * What to report for the delivery block, given the receipt's own print outcome.
 *
 * THE THREE STATES OF L-143, PRESERVED THROUGH THE MERGE. When the block was
 * its own print job the answers were obvious: `null` nothing was owed, `true`
 * the paper came out, `false` it was tried and failed. On one job they all come
 * from the receipt's outcome, and the trap is that `ok: false` covers two
 * different things:
 *
 *   FAILED                      attempted, did not print  → `false`
 *   DISABLED / NOT_CONFIGURED   never attempted at all    → `null`
 *
 * Collapsing those to `outcome.ok` would report « the slip failed » on a till
 * with printing switched off, which is the exact mistake L-143 found in the
 * reprint route and fixed. One rule, both routes ask it.
 */
export function deliveryNoteOutcome(owed: boolean, outcome: PrintOutcome): boolean | null {
  if (!owed) return null;
  if (outcome.ok) return true;
  return outcome.reason === "FAILED" ? false : null;
}
