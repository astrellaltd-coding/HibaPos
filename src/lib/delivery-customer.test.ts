import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  DELIVERY_REQUIRED_FIELDS,
  customerFormBlocked,
  deliveryBlockReason,
  deliveryMissingMessage,
  isDeliverable,
  missingForDelivery,
} from "@/lib/delivery-customer";

// L-214 — WHAT A DELIVERY CLIENT MUST HAVE, and who agrees about it.
//
// THE DEFECT. `POST /api/orders` refused `LIVRAISON` unless the client had a
// name, a phone AND an address. The till gated on `!customerId ||
// !customer?.address` — the phone was not in the condition, in all three places
// the condition appeared. Each side had written the rule out for itself and the
// two had drifted, so a client with an address and no phone passed every check
// the cashier could see, the payment dialog opened, the cash was taken, and the
// server answered 400 with no way to repair the client from the caisse.
//
// The shape of the fix is what the last group of tests here is about: there is
// now ONE function and three callers. A rule test alone would not have caught
// the original defect — both sides' rules were individually coherent — so the
// tests that matter are the ones asserting that nobody spells it out again.

describe("L-214 — which fields a delivery needs", () => {
  it("names all three, in the order the screen asks for them", () => {
    expect([...DELIVERY_REQUIRED_FIELDS]).toEqual(["name", "phone", "address"]);
  });

  it("REPORTS A MISSING PHONE — the field the till used to ignore", () => {
    // The exact client that reached a 400 after the cash was counted.
    expect(missingForDelivery({ name: "Dupont", address: "12 rue de Paris" })).toEqual(["phone"]);
    expect(isDeliverable({ name: "Dupont", address: "12 rue de Paris" })).toBe(false);
  });

  it("reports a missing address, which is the half that was already caught", () => {
    expect(missingForDelivery({ name: "Dupont", phone: "0612131415" })).toEqual(["address"]);
  });

  it("reports several at once, so the screen can name them all", () => {
    expect(missingForDelivery({ name: "Dupont" })).toEqual(["phone", "address"]);
    expect(missingForDelivery({})).toEqual(["name", "phone", "address"]);
    expect(missingForDelivery(null)).toEqual(["name", "phone", "address"]);
  });

  it("accepts the complete client", () => {
    const c = { name: "Dupont", phone: "0612131415", address: "12 rue de Paris" };
    expect(missingForDelivery(c)).toEqual([]);
    expect(isDeliverable(c)).toBe(true);
  });

  it("COUNTS WHITESPACE AS MISSING, which the old condition did not", () => {
    // Not pedantry: the picker sends `newAddress.trim()` and the route stores
    // what it is given, so « " " » was an address as far as `!customer?.address`
    // was concerned — truthy, and useless to a driver.
    expect(missingForDelivery({ name: "Dupont", phone: "0612131415", address: "   " })).toEqual(["address"]);
    expect(missingForDelivery({ name: " ", phone: " ", address: " " })).toEqual(["name", "phone", "address"]);
  });

  it("treats null and undefined alike, because the DTO and Prisma differ", () => {
    expect(missingForDelivery({ name: "D", phone: null, address: undefined })).toEqual(["phone", "address"]);
  });
});

describe("L-214 — what the operator is told", () => {
  it("names what is missing rather than reciting all three", () => {
    expect(deliveryMissingMessage(["phone"])).toBe(
      "Informations manquantes pour la livraison : le téléphone.",
    );
    expect(deliveryMissingMessage(["phone", "address"])).toBe(
      "Informations manquantes pour la livraison : le téléphone et l'adresse.",
    );
    expect(deliveryMissingMessage(["name", "phone", "address"])).toBe(
      "Informations manquantes pour la livraison : le nom, le téléphone et l'adresse.",
    );
  });

  it("KEEPS THE TWO WORDS THE ROUTE'S TESTS PIN", () => {
    // `orders-route.test.ts` has asserted since it was written that the refusal
    // contains « livraison » and, for the address case, « adresse ». Those
    // assertions are the record of what the route promised, and they are
    // case-sensitive.
    for (const m of [
      deliveryMissingMessage(["phone"]),
      deliveryMissingMessage(["address"]),
      deliveryMissingMessage(["name", "phone", "address"]),
    ]) {
      expect(m).toContain("livraison");
    }
    expect(deliveryMissingMessage(["address"])).toContain("adresse");
  });

  it("says nothing at all when the order is not a delivery", () => {
    expect(deliveryBlockReason("DINE_IN", null, null)).toBeNull();
    expect(deliveryBlockReason("TAKEAWAY", null, null)).toBeNull();
    // …including for a client who could never be delivered to. A sur-place
    // order with a named-only client is perfectly good and the server agrees.
    expect(deliveryBlockReason("TAKEAWAY", "c1", { name: "Dupont" })).toBeNull();
  });

  it("asks for a client first, then for the client's details", () => {
    expect(deliveryBlockReason("LIVRAISON", null, null)).toBe(
      "Un client est obligatoire pour une livraison.",
    );
    expect(deliveryBlockReason("LIVRAISON", "c1", { name: "Dupont", address: "12 rue" })).toBe(
      "Informations manquantes pour la livraison : le téléphone.",
    );
    expect(
      deliveryBlockReason("LIVRAISON", "c1", { name: "Dupont", phone: "06", address: "12 rue" }),
    ).toBeNull();
  });

  it("DOES NOT ACCUSE A CLIENT IT HAS NOT READ YET", () => {
    // A `customerId` is set and the query has not answered. Saying « il manque
    // le nom » about a row nobody has read is a lie — and it is what
    // `!customer?.address` did, which is why picking a client left the button
    // dead for a moment with no explanation. It blocks, and says why honestly.
    expect(deliveryBlockReason("LIVRAISON", "c1", undefined)).toBe("Chargement du client…");
  });
});

describe("L-214 — what the client FORM requires, which depends on the order", () => {
  // EXTRACTED BECAUSE THE REVERT SURVIVED IT. This was an inline ternary in the
  // picker, and reverting it to « a name is enough » — the exact behaviour the
  // owner reported — left every test green, because the only assertion covering
  // it was that the old condition's text had gone. That says nothing about what
  // replaced it.

  it("on a DELIVERY, asks for all three", () => {
    expect(customerFormBlocked("LIVRAISON", { name: "", phone: "", address: "" })).toBe(true);
    expect(customerFormBlocked("LIVRAISON", { name: "Dupont" })).toBe(true);
    // The client the old form was happy to make and the server then refused.
    expect(customerFormBlocked("LIVRAISON", { name: "Dupont", address: "12 rue" })).toBe(true);
    expect(customerFormBlocked("LIVRAISON", { name: "Dupont", phone: "06" })).toBe(true);
    expect(
      customerFormBlocked("LIVRAISON", { name: "Dupont", phone: "06", address: "12 rue" }),
    ).toBe(false);
  });

  it("on any OTHER order, a name is still enough", () => {
    // The other direction matters as much: a quick client for a sur-place order
    // must not suddenly need an address the server never asks for.
    expect(customerFormBlocked("DINE_IN", { name: "Dupont" })).toBe(false);
    expect(customerFormBlocked("TAKEAWAY", { name: "Dupont" })).toBe(false);
    expect(customerFormBlocked("TAKEAWAY", { name: "" })).toBe(true);
    expect(customerFormBlocked("TAKEAWAY", { name: "   " })).toBe(true);
  });
});

describe("L-214 — ONE rule, and every side calls it", () => {
  // This is the group that would have caught the original defect. The two
  // rules were each coherent on their own; what was wrong was that there were
  // two. So these assertions are about the CALLERS, not the rule.

  const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

  /**
   * THE SAME FILE WITH ITS COMMENTS REMOVED, and every negative assertion below
   * uses it.
   *
   * `expect(cart).not.toContain("!customer?.address")` was written first and
   * FAILED against the fix — because the comment explaining the fix quotes the
   * old condition by name. That is the third time in this project an assertion
   * has matched the prose written to explain it (see also L-213's
   * `data-osk="off"`), and the general answer is better than a third anchor:
   * an assertion about the code should be made against the code. A comment
   * saying « this used to read X » must never be able to fail a test for X.
   */
  const code = (f: string) =>
    read(f)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("THE SERVER asks the shared rule instead of spelling it out", () => {
    const route = read("src/app/api/orders/route.ts");
    expect(route, "the orders route no longer imports the shared rule").toContain(
      'from "@/lib/delivery-customer"',
    );
    expect(route).toContain("missingForDelivery(customer)");
    // And the hand-written condition is gone. This is the exact text that
    // disagreed with the till, and it must not come back.
    expect(code("src/app/api/orders/route.ts"), "the route has gone back to spelling the rule itself").not.toContain(
      "!customer.name || !customer.phone || !customer.address",
    );
  });

  it("THE TILL asks the shared rule, in all three places it used to decide", () => {
    const cart = read("src/components/pos/cart-panel.tsx");
    expect(cart).toContain("deliveryBlockReason(orderType, customerId, customer)");
    // THE CONDITION THAT LEFT THE PHONE OUT. Three copies of it lived here.
    expect(code("src/components/pos/cart-panel.tsx"), "the till is deciding for itself again").not.toContain(
      "!customer?.address",
    );
    // And the explanation is no longer a tooltip nobody on a touchscreen sees.
    expect(code("src/components/pos/cart-panel.tsx"), "the invisible tooltip is back").not.toContain(
      "Livraison : client et adresse requis",
    );
  });

  it("THE PICKER is told the order type, and requires what a delivery needs", () => {
    const picker = read("src/components/pos/customer-picker-dialog.tsx");
    expect(picker).toContain('from "@/lib/delivery-customer"');
    expect(picker).toContain("orderType");
    // The Créer button asked only for a name, on every order type — which is
    // precisely how the refused client got made.
    expect(
      code("src/components/pos/customer-picker-dialog.tsx"),
      "Créer is back to asking only for a name",
    ).not.toContain("disabled={!newName.trim() || createMutation.isPending}");
    // And the cart passes it, or the prop is decoration.
    expect(read("src/components/pos/cart-panel.tsx")).toContain("orderType={orderType}");
  });

  it("THE PICKER can repair an existing client without leaving the caisse", () => {
    const picker = read("src/components/pos/customer-picker-dialog.tsx");
    expect(picker, "no update mutation — a regular with no phone is still a dead end").toContain(
      "api.put<CustomerDto>(`/api/customers/${id}`",
    );
    // The cart reads `["customer", id]`. Without invalidating that key the
    // cart believes the old record and « Encaisser » stays dead after the
    // cashier has just fixed the thing blocking it.
    expect(picker, "the cart's own query key is not invalidated after an edit").toContain(
      'queryKey: ["customer", customer.id]',
    );
  });

  it("THE PICKER shows the address ON THE ROW, so a deliverable client shows", () => {
    const picker = read("src/components/pos/customer-picker-dialog.tsx");
    // THE LIST ROW'S OWN EXPRESSION, not the bare string `c.address`.
    // `toContain("c.address")` was written first and SURVIVED ITS REVERT: the
    // address was taken off the row and `startEdit`'s `c.address ?? ""` kept
    // the assertion true. Same lesson as the comment-stripping above — an
    // assertion must name the thing it is about, not a substring of it.
    expect(picker, "the address is not printed on the list row").toContain('{c.address || "—"}');
    expect(picker).toContain("isDeliverable(c)");
  });

  it("THE PICKER asks the shared rule what its form requires", () => {
    expect(code("src/components/pos/customer-picker-dialog.tsx")).toContain(
      "customerFormBlocked(orderType, draft)",
    );
  });
});
