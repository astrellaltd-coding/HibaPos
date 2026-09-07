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

// L-21 (Batch 1.3b) — the renderer wraps what does not fit the paper.
//
// `center()` padded a string towards the middle of the paper and returned it
// untouched when it was already wider, because the `Math.max(0, …)` clamps the
// PADDING and not the string. Measured read-only on the live settings
// 2026-09-07: the restaurant's address is 56 characters and the paper is 48
// columns, so every ticket carried one line eight characters over.
//
// The wrap has to be in the renderer or nowhere: `buildPrintJob()` passes the
// text through verbatim on purpose, so that the printed ticket equals the
// archived `Receipt.content` byte for byte.

/** The live `restaurantAddress`, read from the production `Setting` row. */
const LIVE_ADDRESS = "23 Grande Rue 45210, 45210 Ferrières-en-Gâtinais, France";

describe("renderReceipt wraps over-long settings fields (L-21)", () => {
  const live: Partial<SettingsDto> = {
    ...baseSettings,
    restaurantAddress: LIVE_ADDRESS,
    receiptWidth: 48,
  };

  it("no longer prints the 56-character address onto 48-column paper", () => {
    const lines = renderReceipt(baseOrder, live).split("\n");
    expect(lines.some((l) => l.includes(LIVE_ADDRESS))).toBe(false);
    // Still on the ticket, in full and in order — wrapped, not truncated. An
    // establishment's address is part of what makes the document fiscal.
    const addr = lines.filter((l) => /Grande Rue|Gâtinais/.test(l)).map((l) => l.trim());
    expect(addr.length).toBe(2);
    expect(addr.join(" ")).toBe(LIVE_ADDRESS);
  });

  it("produces a consistent snapshot at the production width and address", () => {
    // A SECOND snapshot, added rather than substituted. The first one renders
    // settings that fit at 42 columns and must stay byte-identical through this
    // batch; this one is the live install — 48 columns, the real address.
    expect(renderReceipt(baseOrder, live)).toMatchSnapshot();
  });

  it("leaves no line over the paper at any supported width, for all three fields", () => {
    // The three the finding names, each at a length that overflows. 32..48 is
    // the whole range `settingsSchema` allows and `normalizeReceiptColumns`
    // can produce, so this is the invariant and not a spot check.
    const overflowing: Partial<SettingsDto> = {
      ...baseSettings,
      restaurantName: "Restaurant du Très Long Nom de la Place du Marché",
      restaurantAddress: LIVE_ADDRESS,
      footerNote: "Merci de votre visite et à très bientôt dans notre établissement !",
    };
    expect(overflowing.restaurantName!.length).toBeGreaterThan(48);
    expect(overflowing.footerNote!.length).toBeGreaterThan(48);
    for (let w = 32; w <= 48; w++) {
      const over = renderReceipt(baseOrder, { ...overflowing, receiptWidth: w })
        .split("\n")
        .filter((l) => l.length > w);
      // Reported with the width, so a failure says which column count broke.
      expect({ w, over }).toEqual({ w, over: [] });
    }
  });

  it("wraps the settings-derived identity lines at the narrowest paper (32)", () => {
    // `settingsSchema` allows 30 characters of phone and 40 each of SIRET and
    // TVA number; at 32 columns those lines pass the paper well before the
    // schema's own limit, so they are not safe merely because they are short
    // on this install today.
    const long: Partial<SettingsDto> = {
      ...baseSettings,
      receiptWidth: 32,
      restaurantPhone: "+33 2 38 87 44 09 poste 1234",
      restaurantSiret: "812 345 678 00021 812 345 678",
      restaurantTva: "FR 12 345678901 FR 12 3456789",
    };
    const lines = renderReceipt(baseOrder, long).split("\n");
    expect(lines.every((l) => l.length <= 32)).toBe(true);
    // …and each value survives whole rather than being cut off at the margin.
    const flat = lines.map((l) => l.trim()).join(" ");
    expect(flat).toContain("+33 2 38 87 44 09 poste 1234");
    expect(flat).toContain("812 345 678 00021 812 345 678");
    expect(flat).toContain("FR 12 345678901 FR 12 3456789");
  });

  it("does not touch a ticket whose fields already fit", () => {
    // The regression control for the whole batch, stated independently of the
    // snapshot: `baseSettings` fits at 42 columns, so the wrap must be inert.
    const lines = renderReceipt(baseOrder, baseSettings).split("\n");
    expect(lines.filter((l) => l.includes("12 Rue Test, 75001 Paris"))).toHaveLength(1);
    expect(lines.filter((l) => l.includes("Merci de votre visite !"))).toHaveLength(1);
    expect(lines.filter((l) => l.trim() === "HibaPOS Test")).toHaveLength(1);
  });
});

// L-63 (Batch 1.3c) — the SECOND way this renderer overflowed the paper.
//
// 1.3b fixed the centred lines. `leftRight()` clamped the GAP to one space, so
// an over-wide pair went out as `left + " " + right` with the amount past the
// edge; and the option, add-on and change sub-lines were raw pushes with no
// width arithmetic near them.
//
// Measured 2026-09-07 from the schema's own maxima, at 48 columns: the cashier
// line reached 62, the item line 69, an option 52 and an add-on 49. Latent on
// today's catalogue — the longest product name is 21 characters — and one
// operator edit away, because `productSchema.name` allows 80, `userSchema.name`
// 60, and `categoryOptionGroupSchema.choices[].name` has NO maximum at all.
describe("renderReceipt lays out every line, not only the centred ones (L-63)", () => {
  const LONG_PRODUCT = "Menu Maxi Best Of Double Cheeseburger Bacon Frites Boisson";
  const LONG_CHOICE = "Sauce blanche maison à l'ail et aux fines herbes";
  const LONG_ADDON = "Supplément galette de pomme de terre";
  const LONG_OPERATOR_NAME = "Jean-Baptiste de la Tour du Pin Verclause";

  const heavy: TestOrder = {
    ...baseOrder,
    tableLabel: "Terrasse côté jardin 12",
    itemCount: 2,
    cashier: { name: LONG_OPERATOR_NAME, username: "jb" },
    items: [
      {
        ...baseOrder.items[0],
        productName: LONG_PRODUCT,
        optionsJson: JSON.stringify([{ group: "Sauce", choice: LONG_CHOICE }]),
        addOnsJson: JSON.stringify([{ id: "a1", name: LONG_ADDON, price: 150 }]),
      },
    ] as OrderItemDto[],
  };

  it("puts no line over the paper at any supported width", () => {
    for (let w = 32; w <= 48; w++) {
      const over = renderReceipt(heavy, { ...baseSettings, receiptWidth: w })
        .split("\n")
        .filter((l) => l.length > w);
      expect({ w, over }).toEqual({ w, over: [] });
    }
  });

  it("wraps an over-long article label and keeps ONE amount, on its last line", () => {
    const lines = renderReceipt(heavy, { ...baseSettings, receiptWidth: 48 }).split("\n");
    const price = norm(formatEuroLike(1980));
    const withPrice = lines.map(norm).filter((l) => l.endsWith(price));
    // Exactly one line carries the article's amount — which is what keeps a
    // wrapped label distinguishable from the start of a new article.
    expect(withPrice).toHaveLength(1);
    // …and the whole label survives, across however many lines it took. No
    // ellipsis: BOFiP § 50 lists the article's libellé among the data in scope.
    const start = lines.findIndex((l) => l.startsWith("2× "));
    // The article's block runs from its first line to the one carrying the
    // amount — which is exactly the property being asserted above.
    const endsAt = lines.findIndex((l, i) => i >= start && norm(l).endsWith(price));
    expect(endsAt).toBeGreaterThan(start);
    const label = lines
      .slice(start, endsAt + 1)
      .map(norm)
      .join(" ")
      .replace(price, "")
      .split(/\s+/)
      .filter(Boolean)
      .join(" ");
    expect(label).toBe(`2× ${LONG_PRODUCT}`);
  });

  it("indents a wrapped option or add-on past its marker", () => {
    const lines = renderReceipt(heavy, { ...baseSettings, receiptWidth: 48 }).split("\n");
    const optStart = lines.findIndex((l) => l.startsWith("  · "));
    expect(optStart).toBeGreaterThan(-1);
    const optLines: string[] = [lines[optStart]];
    for (let i = optStart + 1; i < lines.length && lines[i].startsWith("    "); i++) {
      optLines.push(lines[i]);
    }
    expect(optLines.length).toBeGreaterThan(1);
    // A continuation must not read as a second choice.
    for (const l of optLines.slice(1)) expect(l.trimStart().startsWith("· ")).toBe(false);
    expect(optLines.map((l) => l.trim()).join(" ")).toBe(`· ${LONG_CHOICE}`);
    expect(lines.join("\n")).toContain(LONG_ADDON.slice(0, 20));
  });

  it("wraps the cashier line without losing the name or the service number", () => {
    const lines = renderReceipt(heavy, { ...baseSettings, receiptWidth: 48 }).split("\n");
    const start = lines.findIndex((l) => l.startsWith("Caissier : "));
    const block = lines.slice(start, start + 2).join(" ");
    expect(block).toContain(LONG_OPERATOR_NAME);
    expect(block).toContain("Service 7");
    expect(lines.slice(start, start + 2).every((l) => l.length <= 48)).toBe(true);
  });

  it("wraps the change line, which was a raw push too", () => {
    // "  Reçu 1 234,56 € — Rendu 1 234,56 €" is 36 columns on 32-column paper,
    // with no long name involved anywhere.
    const big: TestOrder = {
      ...baseOrder,
      payments: [{ ...baseOrder.payments[0], tendered: 123456, change: 121206 }],
    };
    const lines = renderReceipt(big, { ...baseSettings, receiptWidth: 32 }).split("\n");
    expect(lines.every((l) => l.length <= 32)).toBe(true);
    expect(lines.map((l) => l.trim()).join(" ")).toContain("Reçu");
    expect(lines.map((l) => l.trim()).join(" ")).toContain("Rendu");
  });
});

/** `formatEuro`'s output, without importing the module into a test that is
 *  about layout rather than money. */
function formatEuroLike(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
