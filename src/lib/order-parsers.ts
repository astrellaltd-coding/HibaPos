// Shared safe JSON parsers for order item options/add-ons —
// extracted from receipt-dialog.tsx + orders-view.tsx
// (Phase 7b — pure cleanup, no behavior change).
// Guards receipt/order-detail rendering against malformed
// server JSON (a single corrupt line item shouldn't crash the modal).

export type ParsedOption = { group: string; choice: string; priceModifier?: number };
export type ParsedAddOn = { id?: string | null; name: string; price: number };

export function safeParseOptions(json: string | null): ParsedOption[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as ParsedOption[]) : [];
  } catch {
    return [];
  }
}

export function safeParseAddOns(json: string | null): ParsedAddOn[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as ParsedAddOn[]) : [];
  } catch {
    return [];
  }
}

/**
 * L-80 (R4.2) — snapshot add-ons, narrowed to the ones the cart can legally
 * hold.
 *
 * `ParsedAddOn.id` is `string | null | undefined` because an `addOnsJson`
 * snapshot may contain an add-on that never had a catalogue id: `combo-checkout
 * .ts` writes `{ id: null, name: "Supplément …", price }` for a menu slot's
 * surcharge, so the client's ticket can show what the extra was for.
 *
 * That is fine ON A RECEIPT and impossible IN A CART. The checkout schema
 * requires `addonId: z.string()` — the server re-reads every add-on's price
 * from the catalogue by id, which is the whole reason a basket cannot choose
 * its own prices — so an id-less add-on in the cart produces a request the
 * server refuses with a 400, on a real customer's checkout.
 *
 * Dropping it HERE, rather than later in `buildCheckoutItems`, is the point.
 * Filtering at the intent boundary would leave the line still displayed and
 * still folded into `computeCartTotals`, so the client would tender a total the
 * server does not compute — trading a 400 for « Paiement incorrect », which is
 * worse. Out of the cart means out of the total.
 */
export function cartAddOnsFromSnapshot(
  parsed: ParsedAddOn[],
): { id: string; name: string; price: number }[] {
  return parsed
    .filter((a): a is ParsedAddOn & { id: string } => typeof a.id === "string" && a.id.length > 0)
    .map((a) => ({ id: a.id, name: a.name, price: a.price }));
}

/**
 * L-87 (R4.7) — resolve a reordered line's options back to real catalogue ids.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `optionsJson` snapshots an option as `{ group, choice, priceModifier }` —
 * NAMES, no ids, because it is what the ticket prints. The reorder path used to
 * put those straight into the cart with `choiceId: ""` and a comment saying
 * « server recomputes by product at checkout ». It does not: `pricing.ts`
 * filters the catalogue's choices by `selectedOptionIds.has(c.id)`, and `""`
 * matches nothing. So every reordered option was silently dropped — and if the
 * product had a REQUIRED group, `pricing.ts` then refused the whole line with
 * « Option obligatoire manquante ». Reordering was broken for any such product.
 *
 * The ids have to come from the catalogue, matched on the names the snapshot
 * DOES carry. That is what this does.
 *
 * ── WHY THE MATCH IS TRIMMED AND CASE-FOLDED ────────────────────────────────
 * Because the live catalogue contains names with stray leading spaces (L-39 —
 * fourteen of them, « Sauces », « Barbecue », « Mayonnaise »…). A snapshot taken
 * before those are trimmed must still match the trimmed catalogue afterwards,
 * and vice versa, or fixing L-39 would silently break reordering for every
 * order taken before it. `normalizeGroupName` in `product-options.ts` already
 * compares group names this way for option inheritance.
 *
 * Returns the options it could resolve, and the names it could not, so the
 * caller can tell the operator rather than let them discover it at payment.
 */
export function resolveSnapshotOptions(
  snapshot: ParsedOption[],
  groups: { name: string; choices: { id: string; name: string }[] }[],
): {
  resolved: { group: string; choice: string; choiceId: string; priceModifier: number }[];
  unresolved: string[];
} {
  const key = (v: string) => v.trim().toLowerCase();
  const byGroup = new Map(groups.map((g) => [key(g.name), g]));

  const resolved: { group: string; choice: string; choiceId: string; priceModifier: number }[] = [];
  const unresolved: string[] = [];

  for (const opt of snapshot) {
    const group = byGroup.get(key(opt.group));
    const choice = group?.choices.find((c) => key(c.name) === key(opt.choice));
    if (!choice) {
      unresolved.push(`${opt.group} : ${opt.choice}`);
      continue;
    }
    resolved.push({
      group: opt.group,
      choice: opt.choice,
      choiceId: choice.id,
      priceModifier: opt.priceModifier ?? 0,
    });
  }
  return { resolved, unresolved };
}
