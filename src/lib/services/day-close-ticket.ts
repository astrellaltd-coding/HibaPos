// DD-23 / DD-25 (Batch 3.8) — the trading day's closing slip.
//
// Nothing rendered a close to paper before this: the Z existed as a database
// row and an on-screen summary, and the only printed fiscal document was the
// receipt. The day close gets one because the operator chose to file it with
// the books, so that the integrity code on the paper no longer matches a
// database somebody has rewritten. That is the half of DD-25 that actually
// works, and it is why this module exists in Batch 3.8 rather than 3.9 —
// **Batch 3.9 changes what the fingerprint is computed from, not this ticket.**
//
// Pure, like `renderReceipt`: it takes a sealed row and the settings and
// returns text. No database, no printer, no clock of its own. It renders from
// the ROW rather than from a freshly computed aggregation, so a reprint of a
// day sealed months ago reproduces what was sealed, never a recomputation of it.
import { formatDateTime, formatEuro } from "@/lib/format";
import type { VatBreakdown } from "@/lib/money";
import { SOFTWARE_IDENTITY } from "@/lib/version";
// L-63 (Batch 1.3c): this file carried its own copy of the receipt's three-line
// `center()` — and therefore its defect. The slip is a fiscal document the
// operator files with the books, so it gets the same guarantee: no line wider
// than the paper, and a line that already fits emitted byte-identically.
import { centred, leftRight as layoutLeftRight } from "@/lib/services/ticket-layout";

/** The columns of the sealed row this ticket needs. Deliberately structural
 *  rather than the Prisma type: the renderer must not drift into needing a
 *  live database row, and a test builds one of these by hand. */
export type DayCloseForTicket = {
  period: string; // "YYYY-MM-DD", the trading day
  cutoffHour: number;
  salesTotal: number;
  salesCount: number;
  vatTotal: number;
  cashTotal: number;
  cardTotal: number;
  voucherTotal: number;
  discountsTotal: number;
  refundsTotal: number;
  refundsCount: number;
  cashInTotal: number;
  cashOutTotal: number;
  cashMovementsCount: number;
  /**
   * The canonical sealed payload — L-88 (R9.1).
   *
   * **Where the give-aways are.** `DailyClose` has no column for them:
   * `givenAwayCount` and `givenAwayProductsJson` are columns on `ZReport`, and
   * for a trading day the figures exist only in here, which is the string the
   * hash is taken over. So the line below prints from the sealed record itself
   * rather than from a field beside it, and cannot disagree with what was
   * sealed.
   *
   * Optional because a close sealed before R7.1 has no give-away keys in its
   * payload, and a slip reprinted from one must say nothing rather than print a
   * zero it cannot stand behind — the rule `perpetualSalesTotal` follows below.
   */
  dataJson?: string | null;
  perpetualSalesTotal: number | null;
  vatBreakdownJson: string | null;
  sealedAt: Date | string;
  hash: string;
};

/**
 * The code the operator files with the books.
 *
 * The first 16 hex characters of the close's fingerprint, upper-cased and cut
 * into groups of four so a person can read one off paper and compare it with
 * the screen without losing their place. Sixty-four bits is far beyond what a
 * human comparison needs and short enough to be transcribed; the full
 * fingerprint stays in the database and in the archive for machine checking.
 */
export function formatIntegrityCode(hash: string): string {
  const head = hash.replace(/[^0-9a-f]/gi, "").slice(0, 16).toUpperCase();
  return (head.match(/.{1,4}/g) ?? []).join("-");
}

/** `"2026-06-12"` → `"12/06/2026"`, the way a French closing slip reads. */
function frenchDay(period: string): string {
  const [y, m, d] = period.split("-");
  return `${d}/${m}/${y}`;
}

/** "5.5" → "5,5 %" — the receipt's rule, and for the same reason: never
 *  `toFixed(1)`, which would print a 1,05 % rate as "1,1 %" (L-19). */
function rateLabel(key: string): string {
  return `${key.replace(".", ",")} %`;
}

/**
 * The give-aways, read out of the sealed payload — L-88 (R9.1).
 *
 * `dataJson` is the exact string the close's hash is taken over, so this is the
 * figure that was sealed rather than one recomputed beside it.
 *
 * NOTHING HERE THROWS. This renders a document that has already been sealed,
 * and a close whose slip cannot be printed at all is worse than one that omits
 * a line: an unparseable payload is a verification failure, which
 * `verifyDailyCloses()` is what reports. A payload from before R7.1 simply has
 * no give-away keys, and this returns zero for it — which is also the truth,
 * because the tender did not exist yet.
 */
function sealedGiveaways(
  dataJson: string | null | undefined,
): { count: number; products: { name: string; quantity: number }[] } {
  const none = { count: 0, products: [] };
  if (!dataJson) return none;
  let payload: unknown;
  try {
    payload = JSON.parse(dataJson);
  } catch {
    return none;
  }
  if (typeof payload !== "object" || payload === null) return none;
  const raw = payload as { givenAwayCount?: unknown; givenAwayProducts?: unknown };
  const count = typeof raw.givenAwayCount === "number" ? raw.givenAwayCount : 0;
  if (count <= 0) return none;
  // Row by row, and `null` first: `typeof null === "object"`, so a null entry
  // reaches `r.name` and throws — which this function must never do. Measured;
  // the hardened case in `daily-close.test.ts` is what found it.
  const products = Array.isArray(raw.givenAwayProducts)
    ? raw.givenAwayProducts.flatMap((row) => {
        if (typeof row !== "object" || row === null) return [];
        const r = row as { name?: unknown; quantity?: unknown };
        if (typeof r.name !== "string" || typeof r.quantity !== "number") return [];
        return [{ name: r.name, quantity: r.quantity }];
      })
    : [];
  return { count, products };
}

export function renderDayCloseTicket(
  close: DayCloseForTicket,
  settings?: { restaurantName?: string | null; receiptWidth?: number | null; factice?: boolean | null },
): string {
  const s = settings ?? {};
  const w = Math.max(32, s.receiptWidth ?? 42);
  const lines: string[] = [];
  const center = (str: string) => lines.push(...centred(str, w));
  const leftRight = (l: string, r: string) => lines.push(...layoutLeftRight(l, r, w));
  const rule = () => lines.push("-".repeat(w));

  // The FACTICE stamp, on the same terms as the receipt's: a simulated close
  // must never be mistaken for a real one on paper.
  if (s.factice) {
    center("*** FACTICE — SIMULATION ***");
    center("DOCUMENT NON VALABLE");
    lines.push("");
  }

  center(s.restaurantName ?? "HibaPOS France");
  center("CLÔTURE DU JOUR");
  center(`Journée du ${frenchDay(close.period)}`);
  // The hours the day actually covered, from the value SEALED on the row, so a
  // later change to the setting cannot make this slip say something else.
  const h = String(close.cutoffHour).padStart(2, "0");
  center(`(${h}:00 → ${h}:00 le lendemain)`);
  rule();

  leftRight("Tickets", String(close.salesCount));
  leftRight("Ventes TTC", formatEuro(close.salesTotal));
  if (close.discountsTotal > 0) {
    leftRight("dont remises", `-${formatEuro(close.discountsTotal)}`);
  }

  // Per rate, sorted numerically: "10" sorts before "5.5" as text, which would
  // print the rates in the wrong order (the receipt's rule, M-06).
  let breakdown: VatBreakdown = {};
  try {
    breakdown = JSON.parse(close.vatBreakdownJson ?? "{}") as VatBreakdown;
  } catch {
    breakdown = {};
  }
  const rateKeys = Object.keys(breakdown).sort((a, b) => Number(a) - Number(b));
  if (rateKeys.length > 0) {
    lines.push("Détail TVA");
    for (const key of rateKeys) {
      const row = breakdown[key];
      leftRight(`TVA ${rateLabel(key)} (HT ${formatEuro(row.ht)})`, formatEuro(row.vat));
    }
  }
  leftRight("dont TVA", formatEuro(close.vatTotal));
  rule();

  lines.push("Encaissements");
  leftRight("  Espèces", formatEuro(close.cashTotal));
  leftRight("  Carte", formatEuro(close.cardTotal));
  leftRight("  Titre-restaurant", formatEuro(close.voucherTotal));
  if (close.refundsCount > 0) {
    leftRight(`Remboursements (${close.refundsCount})`, `-${formatEuro(close.refundsTotal)}`);
  }
  if (close.cashMovementsCount > 0) {
    leftRight("Entrées de caisse", formatEuro(close.cashInTotal));
    leftRight("Sorties de caisse", `-${formatEuro(close.cashOutTotal)}`);
  }

  // L-88 (R9.1) — the give-aways, on the paper as well as in the seal.
  //
  // `closeDay` has sealed both figures into `dataJson` since R7.1, and this
  // document — the one the operator files with the books — had no line for
  // either. The sealed record carried them; the paper did not, and nothing said
  // why. A ticket handed over free is the transaction an inspector asks about
  // precisely because it left no money behind.
  //
  // Under `if (count > 0)`, which is the same « no permanent zero » rule the
  // refund and cash-movement lines above follow: a give-away is exceptional and
  // a standing « 0 offert » on every slip is noise on a document read in a
  // hurry. Not counted as a sale, per DD-20 — listed after the takings, never
  // among them, and priced at 0,00 € because that is what it was.
  const gifts = sealedGiveaways(close.dataJson);
  if (gifts.count > 0) {
    // Its own band. Printed without one it lands under the « Encaissements »
    // heading and reads as a fourth tender, which is the opposite of DD-20 —
    // measured on the rendered slip, not reasoned about.
    rule();
    // `formatEuro(0)`, not a literal "0,00 €": every other amount on this
    // slip comes from it, and it separates the figure from the sign with a
    // NO-BREAK space (U+00A0). A hand-typed ASCII space here would be the one
    // amount on the document punctuated differently — measured, not assumed.
    leftRight(`Offerts (${gifts.count})`, formatEuro(0));
    for (const g of gifts.products) {
      lines.push(...layoutLeftRight(`  ${g.name}`, `x${g.quantity}`, w));
    }
  }
  rule();

  // L-57: the perpetual total, on the document rather than only in the row.
  // Null means the close predates Batch 3.8 and the figure was never taken —
  // it says so rather than printing a zero it cannot stand behind.
  leftRight(
    "Total perpétuel",
    close.perpetualSalesTotal === null ? "non enregistré" : formatEuro(close.perpetualSalesTotal),
  );
  rule();

  leftRight("Scellée le", formatDateTime(close.sealedAt));
  lines.push("Code d'intégrité :");
  center(formatIntegrityCode(close.hash));
  center("À conserver avec la comptabilité");
  rule();
  center(SOFTWARE_IDENTITY);

  return lines.join("\n");
}
