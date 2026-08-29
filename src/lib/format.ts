// French formatting helpers (euro, dates, numbers).

const eurFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

const numberFormatter = new Intl.NumberFormat("fr-FR");

/** Format a euro amount, e.g. 12.5 -> "12,50 €". */
export function formatEuro(amount: number): string {
  return eurFormatter.format(amount ?? 0);
}

/** Format a plain number with French separators. */
export function formatNumber(n: number): string {
  return numberFormatter.format(n ?? 0);
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

/** Format a time: "14:35". */
export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

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
