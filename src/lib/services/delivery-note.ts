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
import { formatDateTime } from "@/lib/format";
import { printReceiptText, type PrinterDeps } from "@/lib/services/printer";
import type { OrderDto, SettingsDto } from "@/types/api";
// L-63: the same layout helpers as the other three renderers. Nothing
// downstream can rescue an over-long line — `buildPrintJob` passes the text
// through verbatim — so a 32-column paper wraps here or not at all.
import { centred, wrapToWidth } from "@/lib/services/ticket-layout";

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
  const pushCentred = (str: string) => lines.push(...centred(str, w));
  const rule = () => lines.push("=".repeat(w));

  // The FACTICE stamp travels, even though this is not a fiscal document.
  // A test delivery and a real one produce the same slip otherwise, and the
  // person holding it is on a doorstep rather than in front of the till.
  if (s.factice) {
    pushCentred("*** FACTICE — SIMULATION ***");
    lines.push("");
  }

  rule();
  pushCentred("BON DE LIVRAISON");
  pushCentred("DOCUMENT NON FISCAL");
  rule();
  // The order number ties the slip to the ticket in the bag without repeating
  // anything fiscal: it is the same `Ticket N°` the sealed receipt prints, and
  // the pair is how a driver checks they have the right bag.
  push(`Commande N° ${order.number}`);
  push(formatDateTime(order.createdAt));
  lines.push("");

  push(customer.name.trim());
  if (customer.phone?.trim()) push(customer.phone.trim());
  lines.push("");

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

  rule();
  return lines.join("\n");
}

/**
 * Print the slip for this order, if it is owed one.
 *
 * Returns `null` when no slip was owed — a sur-place order, or an order with no
 * customer — and `true`/`false` for whether the paper came out. The three
 * states are distinct on purpose: « there was nothing to print » and « it
 * failed to print » are different things to tell a cashier, and collapsing them
 * into a boolean is how `printStatus` came to mean two things (L-143).
 *
 * BOTH PRINT ROUTES CALL THIS, and neither decides anything for itself. It is
 * the same argument as `missingForDelivery`: one rule, every caller asks it.
 *
 * IT NEVER FAILS THE RECEIPT. The sealed ticket is the document that matters
 * and it has already printed by the time this is called; a slip that does not
 * come out is a cashier's problem, not a failed sale. Nothing is written to the
 * database here — no row, no fiscal event, no audit entry — because nothing has
 * happened that the journal does not already hold as the VENTE.
 */
export async function printDeliveryNote(
  order: OrderForDeliveryNote,
  settings: Partial<SettingsDto>,
  deps: PrinterDeps = {},
): Promise<boolean | null> {
  const note = renderDeliveryNote(order, settings);
  if (note === null) return null;
  // No drawer kick: nothing is being tendered, and the receipt's own print
  // already decided that question for this sale.
  const outcome = await printReceiptText(note, {}, deps);
  return outcome.ok;
}
