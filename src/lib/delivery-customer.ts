/**
 * L-214 — what a client must have before an order can be DELIVERED, in one
 * place, so the till and the server cannot disagree about it again.
 *
 * THE DEFECT THIS EXISTS TO CLOSE. `POST /api/orders` refused `LIVRAISON`
 * unless the client had a name, a phone AND an address. The till gated on
 * `!customerId || !customer?.address` — **the phone was not in the condition**,
 * in all three places the condition appeared. Each side had written the rule out
 * for itself, in its own words, and the two had drifted. The consequence was
 * the worst-shaped kind: a delivery to a client with an address and no phone
 * passed every check the cashier could see, the payment dialog opened, the cash
 * was taken and counted, and the server then answered 400 — with no way to
 * repair the client from the caisse.
 *
 * So there is now ONE function and both sides call it. `cart-panel.tsx` asks it
 * what to say and whether to enable « Encaisser »;
 * `customer-picker-dialog.tsx` asks it what to require; and
 * `app/api/orders/route.ts` asks it whether to refuse. A drift like the one
 * above is no longer something that can be written by accident — it would take
 * deleting a caller.
 *
 * WHETHER A PHONE SHOULD BE REQUIRED AT ALL was the operator's decision, taken
 * 2026-09-17: yes, and the till should ask up front rather than refuse late.
 * The driver has to be able to ring. Nothing that gets booked changed — the
 * server has demanded all three since it was written — what changed is that the
 * screen now asks for what the server will insist on.
 */

/** The three fields, in the order the screen asks for them. */
export const DELIVERY_REQUIRED_FIELDS = ["name", "phone", "address"] as const;

export type DeliveryField = (typeof DELIVERY_REQUIRED_FIELDS)[number];

/** Just enough of a client to judge. Accepts a DTO, a Prisma row or a form. */
export interface DeliveryCandidate {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
}

/** French for each field, with its article, ready to drop into a sentence. */
const LABELS: Record<DeliveryField, string> = {
  name: "le nom",
  phone: "le téléphone",
  address: "l'adresse",
};

/**
 * Which required fields this client is missing.
 *
 * A field of whitespace counts as missing. It is not pedantry: the picker sends
 * `newAddress.trim()` and the route stores whatever it is given, so « " " » was
 * an address as far as the old till condition was concerned — truthy, and
 * useless to a driver.
 */
export function missingForDelivery(c: DeliveryCandidate | null | undefined): DeliveryField[] {
  if (!c) return [...DELIVERY_REQUIRED_FIELDS];
  return DELIVERY_REQUIRED_FIELDS.filter((f) => (c[f] ?? "").trim() === "");
}

/** Can this client be delivered to? */
export function isDeliverable(c: DeliveryCandidate | null | undefined): boolean {
  return missingForDelivery(c).length === 0;
}

/** « le nom, le téléphone et l'adresse » — a French list, with the « et ». */
function frenchList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

/**
 * May the client form be submitted, given the order it is being filled in for?
 *
 * EXTRACTED BECAUSE THE REVERT SURVIVED IT. This was one inline ternary in
 * `customer-picker-dialog.tsx`, and reverting it to « a name is enough » — the
 * exact behaviour the owner reported — left every test green. The only
 * assertion covering it was that the OLD condition's text had gone, which says
 * nothing about what replaced it. A rule nobody can call is a rule nobody can
 * test.
 *
 * On a delivery: all three, because that is what the server will insist on and
 * the whole point is to ask before the cash is taken rather than after. On any
 * other order: a name, exactly as before. A quick client for a sur-place order
 * must not suddenly need an address — the server does not ask for one, and a
 * till that demanded it would be the same defect pointing the other way.
 */
export function customerFormBlocked(orderType: string, draft: DeliveryCandidate): boolean {
  if (orderType === "LIVRAISON") return missingForDelivery(draft).length > 0;
  return (draft.name ?? "").trim() === "";
}

/**
 * The sentence naming what a client is missing.
 *
 * Separate from `deliveryBlockReason` because the SERVER has one case the
 * screen does not: a `customerId` that matches no row at all. « Chargement du
 * client… » is the truth on the till, where the query has not answered yet, and
 * nonsense in a 400. So the route does its own not-found check and calls this;
 * the screen calls the wrapper below.
 */
export function deliveryMissingMessage(missing: DeliveryField[]): string {
  return `Informations manquantes pour la livraison : ${frenchList(missing.map((f) => LABELS[f]))}.`;
}

/**
 * What to tell the operator, naming what is actually missing — or `null` when
 * nothing is.
 *
 * ONE SENTENCE, USED IN THREE PLACES, and that is the point. It is what the
 * cart panel prints under the Client button, what the picker prints under its
 * Créer button, and what the route returns as its 400. The cashier who reads it
 * on the screen and the developer who reads it in a log are reading the same
 * words, which is not true of a rule each caller words for itself.
 *
 * The lower-case « livraison » and the word « adresse » are load-bearing:
 * `orders-route.test.ts` has asserted since it was written that the refusal
 * says both, and those assertions are the record of what the route promised.
 */
export function deliveryBlockReason(
  orderType: string,
  customerId: string | null | undefined,
  customer: DeliveryCandidate | null | undefined,
): string | null {
  if (orderType !== "LIVRAISON") return null;
  if (!customerId) return "Un client est obligatoire pour une livraison.";
  // A customer chosen but not yet loaded is NOT a customer missing its fields.
  // Saying « il manque le nom » about a row nobody has read yet would be a lie,
  // and it is what the old condition did with `!customer?.address`.
  if (!customer) return "Chargement du client…";
  const missing = missingForDelivery(customer);
  if (missing.length === 0) return null;
  return deliveryMissingMessage(missing);
}
