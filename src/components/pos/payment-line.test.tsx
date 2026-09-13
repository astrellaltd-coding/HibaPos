import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import path from "path";
import { PaymentLineRow, lineDisplay, PAID_METHOD_DISPLAY } from "@/components/pos/payment-line";
import { OFFERT, OFFERT_LABEL } from "@/lib/tender-policy";
import type { PaymentMethod } from "@/types/api";

// L-100 (R8.2) — the OFFERT line, RENDERED.
//
// THE DEFECT, reproduced live by audit pass 4: adding the give-away tender
// threw `TypeError: Cannot read properties of undefined (reading 'icon')` and
// took the whole POS into the error boundary. DD-14's tender — the only way to
// settle a 100 %-discounted order — was unusable from the till, while the API
// accepted the identical sale.
//
// **The finding is not the missing entry. It is that nothing would have caught
// it.** No test rendered the component; `offert-tender.test.ts` asserts the
// enum, the route and the schema, none of which is what broke. So this file
// renders, and it renders EVERY member of the `PaymentMethod` enum rather than
// the one that happened to be missing — a tender added later is covered
// without anyone remembering to come back here.
//
// It uses `react-dom/server`, which is already a dependency, and needs no DOM
// and no test renderer. Adding either is a dependency decision rather than a
// batch's, and this makes it unnecessary for anything shaped like a row.

/** Every tender the product has, read from the enum's own declaration so this
 *  list cannot fall behind it. */
function paymentMethodsFromSchema(): string[] {
  const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const block = /enum PaymentMethod \{([^}]*)\}/.exec(schema);
  if (!block) throw new Error("enum PaymentMethod not found in schema.prisma");
  return block[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("//"));
}

describe("L-100 — a payment line renders for every tender, and never throws", () => {
  it("renders the OFFERT line instead of crashing", () => {
    // The exact state `addOffert()` puts in the dialog: one line, amount 0.
    const html = renderToStaticMarkup(
      <PaymentLineRow line={{ method: OFFERT as PaymentMethod, amount: 0 }} onRemove={() => {}} />,
    );
    expect(html).toContain(OFFERT_LABEL);
    expect(html).toContain("lucide-gift");
  });

  it("renders every member of the PaymentMethod enum", () => {
    // Driven from `schema.prisma`, so adding a tender there and forgetting the
    // till fails HERE rather than at the counter.
    const methods = paymentMethodsFromSchema();
    expect(methods, "the enum parse returned nothing — this test would be vacuous").toContain("OFFERT");
    expect(methods.length).toBeGreaterThanOrEqual(4);

    for (const method of methods) {
      const render = () =>
        renderToStaticMarkup(
          <PaymentLineRow line={{ method: method as PaymentMethod, amount: 250 }} onRemove={() => {}} />,
        );
      expect(render, `${method} threw while rendering a payment line`).not.toThrow();
      expect(render()).toContain("Supprimer la ligne");
    }
  });

  it("renders a tender nobody has taught it about, rather than throwing", () => {
    // The fallback, exercised. A row is reached only when the operator is
    // mid-sale with a customer in front of them; an error boundary costs them
    // the basket, and showing a raw enum value does not.
    const html = renderToStaticMarkup(
      <PaymentLineRow line={{ method: "CRYPTO" as PaymentMethod, amount: 100 }} onRemove={() => {}} />,
    );
    expect(html).toContain("CRYPTO");
  });

  it("shows the cash tendered only when it differs from the amount", () => {
    // Not part of L-100, but it is the one conditional in this row and it moved
    // house with the rest — so it is asserted where it now lives.
    const exact = renderToStaticMarkup(
      <PaymentLineRow line={{ method: "CASH", amount: 500, tendered: 500 }} onRemove={() => {}} />,
    );
    expect(exact).not.toContain("sur ");

    const over = renderToStaticMarkup(
      <PaymentLineRow line={{ method: "CASH", amount: 500, tendered: 1000 }} onRemove={() => {}} />,
    );
    expect(over).toContain("sur ");
    expect(over).toContain("10,00");
  });
});

describe("lineDisplay is total over PaymentMethod", () => {
  it("returns something for every enum member, and never undefined", () => {
    for (const method of paymentMethodsFromSchema()) {
      const d = lineDisplay(method as PaymentMethod);
      expect(d, `${method} has no display`).toBeTruthy();
      expect(typeof d.icon, `${method} has no icon — this is exactly L-100`).not.toBe("undefined");
      expect(d.label.length).toBeGreaterThan(0);
    }
  });

  it("keeps OFFERT out of the paid-tender grid", () => {
    // The property DD-14 relies on, and the reason the crash existed at all:
    // OFFERT must not appear beside Espèces, because the server refuses it
    // against any non-zero total. Its absence from the grid is deliberate —
    // what was wrong was drawing a LINE from that grid.
    expect(PAID_METHOD_DISPLAY.map((m) => m.method)).toEqual(["CASH", "CARD", "VOUCHER"]);
    expect(lineDisplay(OFFERT as PaymentMethod).label).toBe(OFFERT_LABEL);
  });
});
