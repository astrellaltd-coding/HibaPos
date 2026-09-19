/**
 * L-224 — what the search box hands to the new-client form.
 *
 * ── WHAT THE OWNER ASKED FOR, 2026-09-19 ────────────────────────────────────
 * At the caisse, on a livraison: you open the client picker, type the
 * customer's telephone number into the search, find nothing because they are
 * new, click « Créer un nouveau client » — and the form opens EMPTY, so you
 * type the same number a second time. With a queue waiting.
 *
 * So whatever was typed into the search comes across into the form. One rule,
 * in one place, because the picker is a component and a rule inside a JSX
 * `onClick` is a rule no test can call — which is exactly what L-214 found
 * when `customerFormBlocked` was an inline ternary and its revert stayed green.
 *
 * ── WHICH BOX IT LANDS IN, AND WHY IT IS A GUESS ────────────────────────────
 * The search matches a name OR a telephone number (and, since L-221, a town),
 * so the text alone has to say which it is. THE OPERATOR CHOSE « decide by
 * what you typed », 2026-09-19: digits go to `Téléphone`, anything else goes
 * to `Nom`.
 *
 * IT IS A GUESS AND IT IS ALLOWED TO BE WRONG, which is why it seeds a form
 * rather than deciding anything. The worst case is a cashier clearing one box
 * — strictly better than today, where they retype into an empty one. Nothing
 * downstream trusts it: `customerFormBlocked` still requires all four fields
 * for a delivery and `POST /api/orders` still refuses what it always refused.
 */

/**
 * The characters a French telephone number is written with here.
 *
 * Spaces, dots, dashes, slashes and brackets are all in live use for the same
 * number — « 06 12 13 14 15 », « 06.12.13.14.15 », « +33 6 12 13 14 15 » — and
 * a plus may only lead. One letter anywhere disqualifies the whole string,
 * which is what keeps « 12 rue des Lilas » out of the telephone box.
 */
const PHONE_SHAPED = /^\+?[\d\s.\-/()]+$/;

/**
 * FOUR DIGITS, not one.
 *
 * A single digit is far more likely to be someone starting to type a house
 * number or a name containing one than a telephone number, and « 3 » in the
 * telephone box is noise the cashier has to clear. Four is the shortest thing
 * anybody types at a caisse meaning « this is a phone », and it still catches
 * a half-entered « 0612 ».
 */
const MIN_PHONE_DIGITS = 4;

/** Does this look like somebody typing a telephone number? */
export function looksLikePhone(query: string): boolean {
  const q = query.trim();
  if (!q || !PHONE_SHAPED.test(q)) return false;
  return q.replace(/\D/g, "").length >= MIN_PHONE_DIGITS;
}

/**
 * The name and telephone a new-client form should open with, given the search.
 *
 * KEPT EXACTLY AS TYPED, never reformatted. « 06 12 13 14 15 » is how this
 * restaurant writes a number and how it is stored; a helpful normaliser here
 * would hand the customer file a second spelling of every number in it, and
 * the customers list searches with `contains`, so the two spellings would stop
 * finding each other.
 *
 * Returns two empty strings for an empty search, which is the form as it opened
 * before this existed — so the caller has no special case to write.
 */
export function seedFromSearch(query: string): { name: string; phone: string } {
  const q = query.trim();
  if (!q) return { name: "", phone: "" };
  return looksLikePhone(q) ? { name: "", phone: q } : { name: q, phone: "" };
}
