// French formatting helpers (cents, dates, numbers).
// All money values arrive as INTEGER CENTS from the API. formatEuro divides
// by 100 to render euros. This is the single display-boundary conversion
// point — no other code should divide cents by 100.

const eurFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

// L-07 (Batch 7.2): `numberFormatter` and its only consumer `formatNumber`
// were removed together — nothing imported either. Money is formatted by
// `formatEuro` and `Money`, which perform the single cents→euros division
// (C-02); a general number formatter had no caller and was one more way to
// print an amount.

/** Format a cent amount, e.g. 1250 -> "12,50 €". */
export function formatEuro(cents: number): string {
  return eurFormatter.format((cents ?? 0) / 100);
}

/**
 * The cash variance as the operator reads it: an explicit "+" for a surplus,
 * the formatter's own "-" for a shortage, no sign for an exact count.
 *
 * Moved here from `features/shifts/z-close.ts` in Batch 7.2 (L-08), where it
 * was defined, used once, and hand-copied at four other call sites. **Its
 * reason for existing travels with it**: `formatEuro` performs the single
 * cents→euros division, and no caller may divide by 100 as well. Doing exactly
 * that was C-02 — a 5,00 € shortage rendered as "0,05 €" on the one screen
 * whose purpose is catching missing cash.
 */
export function formatVariance(varianceCents: number): string {
  return `${varianceCents > 0 ? "+" : ""}${formatEuro(varianceCents)}`;
}

/**
 * Byte sizes in French units — L-08 (Batch 7.2).
 *
 * This existed twice, in `backups-view.tsx` and `media-view.tsx`, with two
 * signatures and ONE behavioural difference: media's `if (!bytes) return "—"`
 * caught zero as well as null, so a zero-byte media file rendered as an
 * em dash. **The merged version returns "0 o" for zero and "—" only for
 * null/undefined**, deliberately: a zero-byte upload is an anomaly, and
 * hiding it behind the same dash used for "unknown" is how it goes unnoticed.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Format a date/time for receipts: "27/07/2026 14:35". */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format a date: "27/07/2026". */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// L-07 (Batch 7.2): `formatTime` was removed — zero importers. `formatDateTime`
// and `formatRelativeDateTime` are what the screens and receipts use.

/** Relative short label for today: "Aujourd'hui 14:35". */
export function formatRelativeDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Aujourd'hui ${time}`;
  if (isYesterday) return `Hier ${time}`;
  return formatDateTime(d);
}

/**
 * A date a customer reads rather than decodes — « Mer. 1 octobre 2026 — 20:42 ».
 *
 * Added 2026-09-30 for the ticket. `formatDateTime` stays and is still used:
 * the receipt falls back to it when the long form would not fit beside the
 * ticket number, and every screen that wants a compact stamp keeps it.
 *
 * The weekday is abbreviated and the month is not, because « Mer. 1 sept. »
 * reads as an abbreviation of nothing in particular while « Mer. 1 septembre »
 * reads as a date. Locale is pinned to `fr-FR` like every other formatter here.
 */
export function formatDateTimeLong(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = d.toLocaleDateString("fr-FR", { weekday: "short" });
  const rest = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  // `toLocaleDateString` gives « mer. » — capitalised here so the line opens
  // like a sentence rather than mid-word.
  const weekday = day.charAt(0).toUpperCase() + day.slice(1);
  return `${weekday} ${rest} — ${time}`;
}
