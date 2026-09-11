import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { cartAddOnsFromSnapshot, safeParseAddOns } from "@/lib/order-parsers";

// L-80 (R4.2) — the cart may not hold an add-on the server cannot price.
//
// ── THE DEFECT ───────────────────────────────────────────────────────────────
// Three layers disagreed about one field:
//
//   cart-store.ts       CartAddOn.id        string | null
//   checkout-intent.ts  addons[].addonId    string | null
//   orders/route.ts     the zod schema      z.string()   <- REQUIRED
//
// So the types described, and permitted, a request the server refuses. The
// compiler could not see it, and the failure mode is a 400 on a real customer's
// checkout.
//
// ── WHY A NULL ID EXISTS AT ALL, AND WHY IT IS NOT A MISTAKE ─────────────────
// `combo-checkout.ts` writes `{ id: null, name: "Supplément …", price }` into a
// line's `addOnsJson`, deliberately: a menu slot's surcharge is money the
// customer paid, and the ticket is the only paper there is, so the receipt
// prints what the extra was for. That is a SNAPSHOT and it is correct.
//
// It only becomes wrong when a snapshot is turned back into CART content, which
// happens in exactly one place: the reorder path in `orders-view.tsx`. So the
// fix narrows the cart type and filters at that one boundary.
//
// ── WHY NOT FILTER LATER, IN `buildCheckoutItems` ────────────────────────────
// Because the cart would still DISPLAY the line and still fold its price into
// `computeCartTotals`, so the payment dialog would tender a total the server
// does not compute. That trades a zod 400 for « Paiement incorrect », which is
// the worse failure. Out of the cart means out of the total.

describe("L-80 — an add-on with no catalogue id never reaches the cart", () => {
  it("drops it, and keeps the ones that can be priced", () => {
    const snapshot = safeParseAddOns(
      JSON.stringify([
        { id: "addon-1", name: "Oeuf", price: 150 },
        // What `combo-checkout.ts` writes for a menu slot's surcharge.
        { id: null, name: "Supplément Frite Cheddar", price: 150 },
        { id: "addon-2", name: "Pepperoni", price: 200 },
      ]),
    );

    const cart = cartAddOnsFromSnapshot(snapshot);

    expect(cart).toEqual([
      { id: "addon-1", name: "Oeuf", price: 150 },
      { id: "addon-2", name: "Pepperoni", price: 200 },
    ]);
    // Every surviving id is a string the checkout schema would accept.
    expect(cart.every((a) => typeof a.id === "string" && a.id.length > 0)).toBe(true);
  });

  it("treats a missing key and an empty string the same as null", () => {
    // `ParsedAddOn.id` is optional, so a snapshot written before the field
    // existed has no key at all. An empty string would pass `z.string()` and
    // then match no catalogue row, which is the same 400 one step later.
    const cart = cartAddOnsFromSnapshot(
      safeParseAddOns(
        JSON.stringify([
          { name: "Sans clé", price: 100 },
          { id: "", name: "Chaîne vide", price: 100 },
          { id: "addon-ok", name: "Bon", price: 100 },
        ]),
      ),
    );
    expect(cart.map((a) => a.id)).toEqual(["addon-ok"]);
  });

  it("passes an ordinary snapshot through unchanged", () => {
    // CONTROL. The overwhelmingly common case is a line with ordinary add-ons,
    // and this must not touch it.
    const rows = [
      { id: "a", name: "Oeuf", price: 150 },
      { id: "b", name: "Pepperoni", price: 200 },
    ];
    expect(cartAddOnsFromSnapshot(rows)).toEqual(rows);
  });

  it("survives a malformed snapshot without throwing", () => {
    expect(cartAddOnsFromSnapshot(safeParseAddOns(null))).toEqual([]);
    expect(cartAddOnsFromSnapshot(safeParseAddOns("not json"))).toEqual([]);
  });
});

describe("L-80 — the boundary is wired, and the types no longer permit a null", () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf-8");
  /** Code only — a source assertion that reads comments is worse than none. */
  const codeOf = (rel: string) =>
    read(rel)
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");

  it("the reorder path maps through cartAddOnsFromSnapshot", () => {
    // The extracted rule proves the rule; this proves the reorder path calls
    // it. Without this the filter could be correct and unreached — the gap this
    // project has shipped three times.
    const code = codeOf("src/features/orders/orders-view.tsx");
    expect(code).toContain("cartAddOnsFromSnapshot(addOns)");
    // And the old shape is gone, not merely bypassed.
    expect(code).not.toMatch(/id:\s*a\.id\s*\?\?\s*null/);
  });

  it("CartAddOn.id and the checkout intent are both non-nullable", () => {
    expect(codeOf("src/store/cart-store.ts")).toContain(
      "export type CartAddOn = { id: string; name: string; price: number };",
    );
    const intent = codeOf("src/lib/checkout-intent.ts");
    expect(intent).not.toMatch(/addonId:\s*string\s*\|\s*null/);
    expect(intent).toMatch(/addonId:\s*string;/);
  });

  it("the server-side surcharge snapshot is untouched — it is allowed to be id-less", () => {
    // The thing the fix must NOT break. `combo-checkout.ts` still writes an
    // id-less add-on into `addOnsJson` so the ticket can name the surcharge;
    // that is a receipt snapshot, not cart content.
    expect(codeOf("src/lib/services/combo-checkout.ts")).toMatch(
      /\{\s*id:\s*null,\s*name:\s*`Supplément/,
    );
  });
});
