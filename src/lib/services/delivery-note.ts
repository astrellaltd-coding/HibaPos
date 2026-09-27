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
import { leftRight, wrapToWidth } from "@/lib/services/ticket-layout";

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
  const push = (str: string) => lines.push(...wrapToWidth(str, w));
  const rule = () => lines.push("-".repeat(w));

  // ── ONE SLIP, NOT TWO — the owner's ask of 2026-09-27 ─────────────────────
  //
  // This block used to open with its own `=` rules, « BON DE LIVRAISON »,
  // « DOCUMENT NON FISCAL », the order number and the date, and it printed as
  // a SECOND print job, so the cutter ran twice and the customer got two
  // pieces of paper. The restaurant's owner asked for one, on the grounds that
  // the second repeated what the first already said.
  //
  // He was right about the duplication and wrong about the reason: the order
  // number and date did repeat the ticket, but the TELEPHONE NUMBER and the
  // ADDRESS appear nowhere else. So the header and the repeated fields go, the
  // contact details stay, and this is appended to the ticket in ONE print job
  // (`deliveryPaper`) — one cut, one slip.
  //
  // WHAT DID NOT CHANGE, AND IS THE POINT: none of this enters
  // `Receipt.content`. The sealed ticket still carries the customer's NAME and
  // nothing more, so no home address is copied verbatim into the annual
  // archive — the operator's decision of 2026-09-18, reaffirmed 2026-09-27 when
  // the alternative was on the table and declined. This text is rendered at
  // PRINT time and stored nowhere.
  //
  // No FACTICE stamp here either: it was repeated because this was its own
  // document, and on one slip the ticket's own banner is directly above.
  rule();
  push("LIVRAISON");

  // Name and telephone on one line while they fit, because the driver reads
  // both at the same moment; `leftRight` wraps rather than truncates when the
  // paper is narrow, like every other line on this roll.
  const phone = customer.phone?.trim();
  if (phone) lines.push(...leftRight(customer.name.trim(), phone, w));
  else push(customer.name.trim());

  // The address as the driver reads it: street, then town in capitals, the way
  // a French postal address is laid out. Both are required for a delivery
  // (`DELIVERY_REQUIRED_FIELDS`), so in practice both are here — the guards are
  // for the same reason the customer guard above is.
  if (customer.address?.trim()) push(customer.address.trim());
  if (customer.city?.trim()) push(customer.city.trim().toUpperCase());

  // The order's own note, which is where « code 34B2, 3e étage » goes. It is
  // on no other printed document: the sealed ticket does not carry it either.
  if (order.notes?.trim()) {
    lines.push("");
    push(order.notes.trim());
  }

  // No closing rule: this block ends the paper, and the cutter is the end mark.
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
export function deliveryPaper(
  receiptText: string,
  order: OrderForDeliveryNote,
  settings: Partial<SettingsDto>,
): { paper: string; owed: boolean } {
  const note = renderDeliveryNote(order, settings);
  if (note === null) return { paper: receiptText, owed: false };
  return { paper: [receiptText, note].join("\n"), owed: true };
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
