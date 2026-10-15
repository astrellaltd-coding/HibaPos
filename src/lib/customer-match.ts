/**
 * L-265 — how a client is found, told apart, and ordered.
 *
 * MEASURED BEFORE WRITING THIS, on a scratch copy, 2026-10-15: a client saved
 * as « 06 12 34 56 78 » was found by « 06 12 34 » and « 56 78 » and NOT by
 * « 0612345678 » or « 5678 ». The search was a raw `contains` on the phone as
 * typed, so it matched only when the cashier reproduced the spaces of whoever
 * created the record — and a cashier who found nothing created the client a
 * second time, splitting one regular's history across two rows. Nothing
 * stopped that either: creating a client never looked for the number.
 *
 * Pure and structural so the test runner holds it without a database, and so
 * the route and the screens apply one rule rather than three.
 */

/** Lower case, accents off, spaces collapsed — « Éloïse  Martin » finds « eloise martin ». */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** The digits of a phone number, nothing else. */
export function phoneDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * One key per French number, however it was typed.
 *
 * « 06 12 34 56 78 », « 06.12.34.56.78 », « +33 6 12 34 56 78 » and
 * « 0033612345678 » are the same telephone, and the duplicate check must say
 * so. The international prefix is folded back to the national 0; anything that
 * is not a French number is left as its digits.
 */
export function phoneKey(s: string | null | undefined): string {
  let d = phoneDigits(s);
  if (d.startsWith("0033")) d = d.slice(4);
  else if (d.startsWith("33") && d.length === 11) d = d.slice(2);
  if (d.length === 9 && !d.startsWith("0")) d = `0${d}`;
  return d;
}

/** Fewer digits than this is a search for a name that happens to contain one. */
export const MIN_PHONE_QUERY_DIGITS = 3;

export type MatchableCustomer = {
  name: string;
  phone: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
};

/**
 * Does this client answer the cashier's search?
 *
 * Text is compared without case or accents, on the name, the town, the street
 * and the e-mail. The phone is compared on DIGITS: a query carrying at least
 * three digits matches any client whose number contains them — so the last
 * four digits a caller reads out are enough.
 */
export function customerMatches(query: string, c: MatchableCustomer): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const text = [c.name, c.city, c.address, c.email].map(normalizeText);
  if (text.some((t) => t.includes(q))) return true;
  const digits = phoneDigits(query);
  if (digits.length < MIN_PHONE_QUERY_DIGITS) return false;
  const own = phoneDigits(c.phone);
  return own.includes(digits) || phoneKey(c.phone).includes(phoneKey(query));
}

export type RankableCustomer = {
  name: string;
  orderCount: number;
  lastOrderAt: Date | string | null;
};

/**
 * Regulars first — the operator's choice, 2026-10-15: most orders first, the
 * most recent order breaking a tie, then the name, so the order is stable
 * between two openings of the list.
 */
export function compareRegularsFirst(a: RankableCustomer, b: RankableCustomer): number {
  if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
  const ta = a.lastOrderAt ? new Date(a.lastOrderAt).getTime() : 0;
  const tb = b.lastOrderAt ? new Date(b.lastOrderAt).getTime() : 0;
  if (tb !== ta) return tb - ta;
  return normalizeText(a.name).localeCompare(normalizeText(b.name), "fr");
}

/** The client already holding this number, if any — same key, not the same record. */
export function findPhoneTwin<C extends { id: string; phone: string | null }>(
  phone: string | null | undefined,
  candidates: readonly C[],
  exceptId?: string,
): C | null {
  const key = phoneKey(phone);
  if (key.length < 8) return null;
  return candidates.find((c) => c.id !== exceptId && phoneKey(c.phone) === key) ?? null;
}

/**
 * « 12 commandes · il y a 3 j » — how a regular is recognised at a glance.
 * `now` is a parameter so the wording can be tested at a fixed day.
 */
export function orderHistoryLabel(orderCount: number, lastOrderAt: Date | string | null, now: Date): string {
  if (orderCount === 0 || !lastOrderAt) return "Aucune commande";
  const count = `${orderCount} commande${orderCount > 1 ? "s" : ""}`;
  const last = new Date(lastOrderAt);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(last)) / 86_400_000);
  const when =
    days <= 0
      ? "aujourd'hui"
      : days === 1
        ? "hier"
        : days < 31
          ? `il y a ${days} j`
          : last.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${count} · dernière ${when}`;
}
