// The till's key for ONE sale — L-89 / L-90 (R8.2).
//
// Its own module for the reason `checkout-intent.ts` is its own module: a
// value built inline in a component cannot be exercised by a test, and this
// project has shipped that gap three times. What the till SENDS is the thing
// that has to be right.
//
// WHAT IT IS FOR. A double-tap on « Valider » booked the sale twice — measured,
// orders #9 and #10 28 ms apart — and a committed sale whose HTTP response is
// lost gets rung again by an operator looking at a cart that never cleared.
// Both produce a second order, a second sealed VENTE event, and a second
// movement of `GrandTotal`, which is never decremented. The key makes the
// server able to recognise the second request as the same sale.
//
// WHAT IT IS NOT. Not a nonce, not a secret, not an identifier the server
// parses. It never appears on a ticket or in a fiscal payload. It only has to
// be unique enough that two different sales never collide, on one till, over
// the life of an install.

/**
 * A fresh key.
 *
 * `crypto.randomUUID()` where it exists — every browser this runs in, and Node
 * since 19. The fallback is not decoration: `randomUUID` is only exposed on
 * **secure origins**, and a till served over plain http on a LAN address is
 * exactly the case where it is missing. Discovering that at the counter, with
 * every checkout throwing, is not a trade worth making for one line.
 *
 * The fallback uses `getRandomValues`, which has no secure-origin condition,
 * and falls back again to time plus `Math.random()`. That last one is weak in
 * the abstract and sufficient here: a collision needs two sales on the same
 * till in the same millisecond drawing the same 64-bit-ish value, and the
 * consequence of a collision is one refused checkout, not a wrong figure.
 */
export function newCheckoutKey(): string {
  const c: Crypto | undefined = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  if (typeof c?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** The bounds `POST /api/orders` enforces, so the client cannot send a key the
 *  server will refuse. Exported for the test that checks the two agree. */
export const CHECKOUT_KEY_MIN = 8;
export const CHECKOUT_KEY_MAX = 100;
