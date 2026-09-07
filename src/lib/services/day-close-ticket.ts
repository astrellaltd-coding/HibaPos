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
