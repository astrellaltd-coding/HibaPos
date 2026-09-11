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
