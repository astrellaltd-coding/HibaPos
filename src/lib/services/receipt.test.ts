import { describe, it, expect } from "vitest";
import { renderReceipt } from "@/lib/services/receipt";
import { SOFTWARE_IDENTITY } from "@/lib/version";
import type { OrderDto, OrderItemDto, SettingsDto } from "@/types/api";

type TestRefund = { id: string; amount: number; reason: string; createdAt: string };
type TestOrder = OrderDto & { refunds?: TestRefund[] };

// Snapshot test for the fiscal receipt renderer. Because receipts are
// immutable fiscal artifacts, any change to formatting must be deliberate —
// a snapshot diff forces a reviewer to opt in.

const baseOrder: TestOrder = {
  id: "ord-1",
  number: 42,
  shiftId: "s1",
  cashierId: "c1",
  customerId: null,
  status: "COMPLETED",
  orderType: "DINE_IN",
  tableLabel: "T1",
  subtotal: 2250,  // 22.50 € in cents
  vatTotal: 205,   // 2.05 € in cents
  discountTotal: 0,
  total: 2250,
  notes: null,
  itemCount: 4,
  fiscalEventId: null,
  createdAt: "2026-08-14T12:30:00.000Z",
  completedAt: "2026-08-14T12:30:00.000Z",
  refundedAt: null,
  items: [
    {
      id: "oi-1",
      productId: "p1",
      productName: "Double Cheese",
      unitPrice: 990,   // 9.90 € in cents
      quantity: 2,
      lineTotal: 1980,  // 19.80 € in cents
      vatRate: 10,
      optionsJson: JSON.stringify([
        { group: "Cuisson", choice: "À point" },
      ]),
      addOnsJson: JSON.stringify([
        { id: "add1", name: "Bacon", price: 150 }, // 1.50 € in cents
      ]),
      notes: null,
    },
    {
      id: "oi-2",
      productId: "p2",
      productName: "Coca-Cola",
      unitPrice: 270,  // 2.70 € in cents
      quantity: 1,
      lineTotal: 270,
      vatRate: 10,
      optionsJson: null,
      addOnsJson: null,
      notes: null,
    },
  ] as OrderItemDto[],
  payments: [
    {
      id: "pay-1",
      method: "CASH",
      amount: 2250,  // 22.50 € in cents
      tendered: 2500, // 25.00 € in cents
      change: 250,   // 2.50 € in cents
      createdAt: "2026-08-14T12:30:00.000Z",
    },
  ],
  refunds: [],
  cashier: { name: "Admin", username: "admin" },
  customer: null,
  shift: { number: 7 },
};

const baseSettings: Partial<SettingsDto> = {
  restaurantName: "HibaPOS Test",
  restaurantAddress: "12 Rue Test, 75001 Paris",
  restaurantPhone: "01 23 45 67 89",
  restaurantSiret: "TEST-SIRET",
  restaurantTva: "TEST-TVA",
  footerNote: "Merci de votre visite !",
  receiptWidth: 42,
};

/** `formatEuro` goes through Intl fr-FR, which puts a NO-BREAK space (U+00A0)
 *  before the euro sign. Assertions written with an ordinary space would never
 *  match, so normalise rather than paste an invisible character into every
 *  expectation. */
const norm = (t: string) => t.replace(/[\u00a0\u202f]/g, " ");

describe("renderReceipt", () => {
  it("produces a consistent snapshot for a standard order", () => {
    const text = renderReceipt(baseOrder, baseSettings);
    expect(text).toMatchSnapshot();
  });

  // M-06 (Batch 3.6) — per-rate VAT block and the TVA number.
  //
  // The ticket used to print one merged "dont TVA" line, so a restaurant
  // selling at two rates — which this one does, 10 % and 5,5 % since Batch
  // 3.1c — could not show the split on any ticket. `restaurantTva` was a
  // stored setting no document printed.

  it("prints the TVA number under the SIRET (M-06)", () => {
    const text = renderReceipt(baseOrder, baseSettings);
    expect(text).toContain("TVA : TEST-TVA");
    const lines = text.split("\n");
    expect(lines.findIndex((l) => l.includes("SIRET"))).toBeLessThan(
      lines.findIndex((l) => l.includes("TVA : TEST-TVA")),
    );
  });

  it("omits the TVA line entirely when the setting is unset", () => {
    const text = renderReceipt(baseOrder, { ...baseSettings, restaurantTva: null });
    expect(text).not.toContain("TVA : ");
  });

  it("prints one VAT line per rate, lowest rate first (M-06)", () => {
    // The restaurant's real shape: food at 10 %, a sealed can at 5,5 %.
    const mixed: TestOrder = {
      ...baseOrder,
      vatTotal: 194,
      items: [
        { ...baseOrder.items[0], vatRate: 10 },
        { ...baseOrder.items[1], vatRate: 5.5 },
      ] as OrderItemDto[],
    };
    const text = norm(renderReceipt(mixed, baseSettings));
    expect(text).toContain("Détail TVA");
    // 5,5 % of 2,70 € is 0,14 € — 10 % of 19,80 € is 1,80 €.
    expect(text).toContain("TVA 5,5 % (HT 2,56 €)");
    expect(text).toContain("TVA 10 % (HT 18,00 €)");

    // Numeric order, not lexicographic: "10" sorts BEFORE "5.5" as text, and
    // printing the rates in that order on a fiscal document would be wrong.
    const lines = text.split("\n");
    expect(lines.findIndex((l) => l.includes("TVA 5,5 %"))).toBeLessThan(
      lines.findIndex((l) => l.includes("TVA 10 %")),
    );
  });

  it("keeps the stored vatTotal as the 'dont TVA' figure", () => {
    // The per-rate rows are recomputed; "dont TVA" is the sealed number the
    // order actually carries. They agree — but if they ever did not, the
    // ticket must show what the fiscal record holds.
    const mixed: TestOrder = {
      ...baseOrder,
      vatTotal: 194,
      items: [
        { ...baseOrder.items[0], vatRate: 10 },
        { ...baseOrder.items[1], vatRate: 5.5 },
      ] as OrderItemDto[],
    };
    const text = norm(renderReceipt(mixed, baseSettings));
    expect(text).toContain("dont TVA");
    expect(text).toMatch(/dont TVA {2,}1,94 €/);
  });

  it("splits VAT on the amount NET of a discount, not the gross", () => {
    // A discounted order's VAT is owed on what the customer paid. The
    // apportionment is the same one the checkout transaction stores, so the
    // ticket and the Z report cannot disagree.
    const discounted: TestOrder = {
      ...baseOrder,
      discountTotal: 250,
      total: 2000,
      vatTotal: 182,
    };
    const text = norm(renderReceipt(discounted, baseSettings));
    expect(text).toContain("Remise");
    // 10 % of the 20,00 € actually paid = 1,82 €, not 2,05 € on the 22,50 €.
    expect(text).toContain("TVA 10 % (HT 18,18 €)");
    expect(text).not.toContain("2,05 €");
  });

  it("renders TAKEAWAY order type label", () => {
    const takeaway: TestOrder = { ...baseOrder, orderType: "TAKEAWAY", tableLabel: null };
    const text = renderReceipt(takeaway, baseSettings);
    expect(text).toContain("À emporter");
    expect(text).not.toContain("Sur place");
  });

  it("renders LIVRAISON order type label", () => {
    const delivery: TestOrder = {
      ...baseOrder,
      orderType: "LIVRAISON",
      tableLabel: null,
      customer: { name: "Jean Dupont" },
    };
    const text = renderReceipt(delivery, baseSettings);
    expect(text).toContain("Livraison");
  });

  it("does NOT render a refunds section (fiscal receipt is immutable at sale time)", () => {
    // renderReceipt is called at sale time to snapshot the fiscal receipt.
    // Refunds happen later and are tracked separately in the audit log +
    // order detail dialog. The receipt snapshot itself does NOT include
    // refunds because they didn't exist yet when the snapshot was taken.
    //
    // T-09 (Batch 6.2): this passed `refunds: []`. An empty array cannot
    // produce a refunds section under ANY implementation, so the assertion
    // could not fail — it certified nothing. It now passes REAL refunds, which
    // is the only way the claim above can be tested at all: if `renderReceipt`
    // ever started printing them, this would catch it.
    const withRefunds: TestOrder = {
      ...baseOrder,
      refunds: [
        { id: "r1", amount: 500, reason: "Client insatisfait", createdAt: "2026-08-14T13:00:00.000Z" },
        { id: "r2", amount: 250, reason: "Erreur de saisie", createdAt: "2026-08-14T13:05:00.000Z" },
      ] as TestRefund[],
    };
    const text = renderReceipt(withRefunds, baseSettings);
    expect(text).not.toContain("Remboursements");
    expect(text).not.toContain("Client insatisfait");
    expect(text).not.toContain("5,00 €"); // the refund amount, nowhere on the ticket
    // …and the ticket still shows what it should, so this is not passing
    // because rendering failed.
    expect(text).toContain("TOTAL");
  });

  it("falls back to defaults when settings are absent", () => {
    const text = renderReceipt(baseOrder);
    // L-53 (Batch 3.7) STRENGTHENED this. It read `toContain("HibaPOS
    // France")` over the whole ticket, and once the software names itself on
    // the last line those words appear on EVERY ticket — so the fallback for a
    // missing restaurant name could be deleted and this would still pass.
    // Demonstrated under revert before the line was pinned to the header.
    expect(text.split("\n")[0]).toContain("HibaPOS France");
  });

  // L-53 (Batch 3.7) — the ticket names the software and its version.
  //
  // The attestation regime is version-matched (BOI-LETTRE-000242) and a
  // control compares the version in use with the attestations held
  // (BOI-CF-COM-20-60). Until this batch a ticket on this install — where the
  // restaurant name is set — never named the software at all.
  it("names the software and its version on the last line of every ticket (L-53)", () => {
    const text = renderReceipt(baseOrder, baseSettings);
    const lines = text.split("\n");
    expect(lines[lines.length - 1].trim()).toBe(SOFTWARE_IDENTITY);
    // Not vacuous: the identity is a real dotted release, not a placeholder.
    expect(text).toMatch(/HibaPOS France v\d+\.\d+\.\d+/);
  });

  // L-58 (Batch 3.10) — the ticket's « numéro de la caisse ».
  //
  // BOFiP § 50 lists « numéro de la caisse » among the data in scope for the
  // fonctionnalité de caisse. The ticket carried `Caisse #${shift.number}` —
  // the SHIFT counter, at 3 on production on a single-till install — so it
  // named a third till whose two siblings have no data anywhere, and it named
  // no till at all.
  it("prints a till number that is the TILL, not the shift counter (L-58)", () => {
    const text = renderReceipt(baseOrder, baseSettings);
    // `baseOrder.shift.number` is 7. Under the old code that 7 was printed as
    // the caisse number; under any correct one it cannot be.
    expect(baseOrder.shift!.number).toBe(7);
    expect(text).toContain("Caisse N° 1");
    expect(text).not.toContain("Caisse #7");
    expect(text).not.toContain("Caisse N° 7");
  });

  it("still carries the shift number, under a label that says what it is", () => {
    // Not dropped — it ties the ticket to the Z report that rolls it up. Only
    // its name was wrong.
    const text = renderReceipt(baseOrder, baseSettings);
    expect(text).toContain("Service 7");
    const shiftLine = text.split("\n").find((l) => l.includes("Service 7"))!;
    expect(shiftLine).toContain("Caissier : Admin");
    // The till number belongs to the establishment block, above the separator
    // that opens the transaction — not on this line.
    expect(shiftLine).not.toContain("Caisse");
  });

  it("puts the till number in the establishment block, and centred", () => {
    const lines = renderReceipt(baseOrder, baseSettings).split("\n");
    const caisse = lines.findIndex((l) => l.includes("Caisse N° 1"));
    const tva = lines.findIndex((l) => l.includes("TVA : TEST-TVA"));
    const ticket = lines.findIndex((l) => l.includes("Ticket N°"));
    expect(tva).toBeLessThan(caisse);
    expect(caisse).toBeLessThan(ticket);
    // Centred, so it cannot collide with anything at any column count — which
    // is why it is here and not on the cashier line (L-21: this renderer
    // centres but never wraps).
    expect(lines[caisse].startsWith(" ")).toBe(true);
    expect(lines[caisse].trim()).toBe("Caisse N° 1");
  });

  it("does not make the cashier line wider than it already was (L-21)", () => {
    // `Service 7` is exactly as wide as the `Caisse #7` it replaces, so no
    // ticket gets closer to overflowing than it was before this batch. Pinned
    // at the narrowest supported width, where it would show first.
    expect("Service 7".length).toBe("Caisse #7".length);
    const narrow = renderReceipt(baseOrder, { ...baseSettings, receiptWidth: 32 });
    const shiftLine = narrow.split("\n").find((l) => l.includes("Service 7"))!;
    expect(shiftLine).toBe("Caissier : Admin" + " ".repeat(7) + "Service 7");
    expect(shiftLine.length).toBe(32);
    // And the new centred line fits at the same width.
    expect(narrow.split("\n").every((l) => l.length <= 32)).toBe(true);
  });

  it("keeps the operator's footer note ABOVE the software line", () => {
    const text = renderReceipt(baseOrder, { ...baseSettings, footerNote: "À bientôt !" });
    const lines = text.split("\n").map((l) => l.trim());
    expect(lines.indexOf("À bientôt !")).toBe(lines.length - 2);
    expect(lines[lines.length - 1]).toBe(SOFTWARE_IDENTITY);
  });

  it("handles malformed optionsJson without throwing", () => {
    const malformed: TestOrder = {
      ...baseOrder,
      items: [
        {
          ...baseOrder.items[0],
          optionsJson: "{ not valid json",
        },
      ],
    };
    // Defensive parsing: a corrupted optionsJson column should NOT break
    // receipt rendering/printing — the receipt degrades gracefully with a
    // "(options illisibles)" placeholder line instead of throwing.
    // T-09 (Batch 6.2): an `expect(() => renderReceipt(...)).not.toThrow()`
    // followed this line and was removed. The call below has ALREADY run and
    // been asserted on — if it threw, the test would have failed before
    // reaching the redundant one. Nothing is lost: asserting the output is
    // strictly stronger than asserting the absence of a throw.
    const text = renderReceipt(malformed, baseSettings);
    expect(text).toContain("(options illisibles)");
  });
});

// L-18 (Batch 3.1b) — the FACTICE stamp existed in renderReceipt() from the
// start but nothing could turn it on, so it had never been exercised. These
// pin both directions: a simulation ticket must be unmistakable, and a real
// ticket must never carry the mention.
describe("FACTICE simulation stamp (L-18)", () => {
  it("stamps the ticket when factice is on", () => {
    const out = renderReceipt(baseOrder, { ...baseSettings, factice: true });
    expect(out).toContain("FACTICE");
    expect(out).toContain("SIMULATION");
    expect(out).toContain("TICKET NON VALABLE");
    // The stamp must be at the very top, before the restaurant name — an
    // operator scanning a stack of tickets reads the first line.
    const firstLine = out.split("\n").find((l) => l.trim().length > 0) ?? "";
    expect(firstLine).toContain("FACTICE");
  });

  it("leaves a real ticket completely unmarked", () => {
    const out = renderReceipt(baseOrder, { ...baseSettings, factice: false });
    expect(out).not.toContain("FACTICE");
    expect(out).not.toContain("SIMULATION");
    expect(out).not.toContain("NON VALABLE");
  });

  it("does not stamp when the setting is absent entirely", () => {
    // baseSettings carries no `factice` key at all. An install that has never
    // seen the switch must print real tickets, not simulations.
    expect(baseSettings).not.toHaveProperty("factice");
    expect(renderReceipt(baseOrder, baseSettings)).not.toContain("FACTICE");
  });
});
