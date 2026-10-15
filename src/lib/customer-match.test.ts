import { describe, it, expect } from "vitest";
import {
  compareRegularsFirst,
  customerMatches,
  findPhoneTwin,
  normalizeText,
  orderHistoryLabel,
  phoneKey,
} from "@/lib/customer-match";

// L-265 — finding a client. The measurement that started it, on a scratch
// copy, 2026-10-15: « 06 12 34 56 78 » was found by « 06 12 34 » and « 56 78 »
// and NOT by « 0612345678 » or « 5678 ». A cashier who found nothing created
// the regular a second time.

const spaced = { name: "Test Espaces", phone: "06 12 34 56 78", city: "Ferrières-en-Gâtinais" };

describe("L-265 — the phone is searched on its digits", () => {
  it("finds a spaced number from the same number typed without spaces", () => {
    expect(customerMatches("0612345678", spaced)).toBe(true);
  });

  it("finds it from the last four digits a caller reads out", () => {
    expect(customerMatches("5678", spaced)).toBe(true);
  });

  it("still finds it with the spaces typed as they were saved", () => {
    expect(customerMatches("06 12 34", spaced)).toBe(true);
    expect(customerMatches("56 78", spaced)).toBe(true);
  });

  it("finds a compact number from a spaced or dotted query", () => {
    const compact = { name: "X", phone: "0612345678" };
    expect(customerMatches("06 12 34 56", compact)).toBe(true);
    expect(customerMatches("06.12.34", compact)).toBe(true);
  });

  it("does not match a number that does not contain the digits", () => {
    expect(customerMatches("9999", spaced)).toBe(false);
  });

  it("needs three digits before treating a query as a phone", () => {
    // « 5 » alone would match half the book.
    expect(customerMatches("5", spaced)).toBe(false);
  });
});

describe("L-265 — names and towns, without case or accents", () => {
  it("finds « Éloïse » from « eloise »", () => {
    expect(customerMatches("eloise", { name: "Éloïse Martin", phone: null })).toBe(true);
  });

  it("finds by town, accents ignored", () => {
    expect(customerMatches("ferrieres", spaced)).toBe(true);
  });

  it("an empty search matches everyone", () => {
    expect(customerMatches("   ", spaced)).toBe(true);
  });

  it("normalizeText collapses spaces and drops accents", () => {
    expect(normalizeText("  Chèvre   Miel ")).toBe("chevre miel");
  });
});

describe("L-265 — one key per French number", () => {
  it("folds spaces, dots and the international prefix to one key", () => {
    const key = "0612345678";
    for (const p of ["06 12 34 56 78", "06.12.34.56.78", "+33 6 12 34 56 78", "0033612345678", "+33612345678"]) {
      expect(phoneKey(p), p).toBe(key);
    }
  });

  it("leaves a non-French number as its digits", () => {
    expect(phoneKey("+213 555 12 34 56")).toBe("213555123456");
  });
});

describe("L-265 — the duplicate check", () => {
  const book = [
    { id: "a", name: "Mme A", phone: "06 12 34 56 78" },
    { id: "b", name: "M. B", phone: null },
  ];

  it("finds the client who already has this number, however it is typed", () => {
    expect(findPhoneTwin("+33 6 12 34 56 78", book)?.id).toBe("a");
    expect(findPhoneTwin("0612345678", book)?.id).toBe("a");
  });

  it("does not report the record being edited as its own twin", () => {
    expect(findPhoneTwin("0612345678", book, "a")).toBeNull();
  });

  it("does not compare a missing or too-short number", () => {
    expect(findPhoneTwin(null, book)).toBeNull();
    expect(findPhoneTwin("5678", book)).toBeNull();
  });
});

describe("L-265 — regulars first (the operator's choice, 2026-10-15)", () => {
  it("puts most orders first, the latest order breaking a tie, then the name", () => {
    const list = [
      { name: "Rare", orderCount: 1, lastOrderAt: "2026-10-14T12:00:00Z" },
      { name: "Habitué ancien", orderCount: 9, lastOrderAt: "2026-10-01T12:00:00Z" },
      { name: "Habitué récent", orderCount: 9, lastOrderAt: "2026-10-13T12:00:00Z" },
      { name: "Nouveau", orderCount: 0, lastOrderAt: null },
      { name: "Aaron", orderCount: 0, lastOrderAt: null },
    ];
    expect(list.slice().sort(compareRegularsFirst).map((c) => c.name)).toEqual([
      "Habitué récent",
      "Habitué ancien",
      "Rare",
      "Aaron",
      "Nouveau",
    ]);
  });
});

describe("L-265 — the history line on a client's card", () => {
  const now = new Date(2026, 9, 15, 20, 0);
  it("says how many orders and how long ago", () => {
    expect(orderHistoryLabel(12, new Date(2026, 9, 12, 19, 0), now)).toBe("12 commandes · dernière il y a 3 j");
    expect(orderHistoryLabel(1, new Date(2026, 9, 15, 12, 0), now)).toBe("1 commande · dernière aujourd'hui");
    expect(orderHistoryLabel(2, new Date(2026, 9, 14, 23, 0), now)).toBe("2 commandes · dernière hier");
  });

  it("gives the date once it is more than a month old", () => {
    expect(orderHistoryLabel(3, new Date(2026, 7, 1, 12, 0), now)).toBe("3 commandes · dernière 01/08/2026");
  });

  it("says so for a client who never ordered", () => {
    expect(orderHistoryLabel(0, null, now)).toBe("Aucune commande");
  });
});
