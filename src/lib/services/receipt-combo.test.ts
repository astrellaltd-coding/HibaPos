import { describe, it, expect } from "vitest";
import { renderReceipt, articleBlocks } from "@/lib/services/receipt";
import type { OrderDto } from "@/types/api";

// Batch 5.9f — a menu on the client ticket.
//
// The operator's ruling: the client ticket is the ONLY paper — there is no
// kitchen ticket — so it has to show what the menu contained. It shows it as
// indented, price-less lines, in the idiom `receipt.ts` already uses for
// options.
//
// AND IT MUST NOT PRINT PER-COMPONENT AMOUNTS. The 10,86 € and 10,85 € and
// 3,19 € a Menu Chill books are the shares its forfait was divided into so each
// component could carry its own VAT rate. They are allocation artefacts, not
// prices: nobody was charged 10,86 € for a pizza, and printing that figure on a
// fiscal document would state a price the customer did not pay and could not
// have refused. The `Détail TVA` block carries the rates instead.

/**
 * The ticket's own spacing, normalised for assertions.
 *
 * `formatEuro` goes through `Intl` fr-FR, which puts a NO-BREAK SPACE (U+00A0)
 * before the euro sign and a NARROW one (U+202F) between the thousands —
 * deliberately, because `ticket-layout.ts` must not break a line there. A test
 * that types an ordinary space is asserting against a string the renderer never
 * produces, which is what these three assertions did on their first run.
 */
const flat = (t: string) => t.replace(/[\u00A0\u202F]/g, " ");

const line = (over: Partial<OrderDto["items"][number]>): OrderDto["items"][number] =>
  ({
    id: over.id ?? Math.random().toString(36).slice(2),
    productId: "p",
    productName: "X",
    unitPrice: 0,
    quantity: 1,
    lineTotal: 0,
    vatRate: 10,
    optionsJson: null,
    addOnsJson: null,
    notes: null,
    comboGroupId: null,
    comboName: null,
    comboPrice: null,
    ...over,
  }) as OrderDto["items"][number];

/** A Menu Chill à emporter: two Seniors at 10 %, a Coca at 5,5 %. */
function menuLines(groupId = "g1") {
  return [
    line({
      id: "a",
      productName: "Regina",
      unitPrice: 1086,
      lineTotal: 1086,
      vatRate: 10,
      optionsJson: JSON.stringify([{ group: "Taille", choice: "Senior", priceModifier: 300 }]),
      comboGroupId: groupId,
      comboName: "Menu Chill",
      comboPrice: 2490,
    }),
    line({
      id: "b",
      productName: "Quatre Fromages",
      unitPrice: 1085,
      lineTotal: 1085,
      vatRate: 10,
      optionsJson: JSON.stringify([{ group: "Taille", choice: "Senior", priceModifier: 300 }]),
      comboGroupId: groupId,
      comboName: "Menu Chill",
      comboPrice: 2490,
    }),
    line({
      id: "c",
      productName: "Coca",
      unitPrice: 319,
      lineTotal: 319,
      vatRate: 5.5,
      comboGroupId: groupId,
      comboName: "Menu Chill",
      comboPrice: 2490,
    }),
  ];
}

const order = (items: OrderDto["items"], over: Partial<OrderDto> = {}): OrderDto =>
  ({
    id: "o1",
    number: 42,
    shiftId: "s",
    cashierId: "c",
    customerId: null,
    status: "COMPLETED",
    orderType: "TAKEAWAY",
    tableLabel: null,
    subtotal: items.reduce((n, i) => n + i.lineTotal, 0),
    vatTotal: 215,
    discountTotal: 0,
    total: items.reduce((n, i) => n + i.lineTotal, 0),
    itemCount: 1,
    notes: null,
    createdAt: new Date("2026-09-09T12:00:00Z").toISOString(),
    completedAt: null,
    items,
    payments: [],
    cashier: { name: "Resp", username: "resp" },
    shift: { number: 1 },
    ...over,
  }) as unknown as OrderDto;

describe("articleBlocks — a menu's lines are one article", () => {
  it("gathers the lines of one menu and leaves ordinary lines alone", () => {
    const blocks = articleBlocks([
      line({ id: "z", productName: "Tiramisu", lineTotal: 350 }),
      ...menuLines(),
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].kind).toBe("item");
    expect(blocks[1].kind).toBe("combo");
    if (blocks[1].kind === "combo") {
      expect(blocks[1].name).toBe("Menu Chill");
      expect(blocks[1].price).toBe(2490);
      expect(blocks[1].parts).toHaveLength(3);
    }
  });

  it("keeps two menus on one ticket apart, and does not merge across a line between them", () => {
    // Grouping is by id, not by adjacency — two Menu Chills are two blocks even
    // if nothing separates them, and a Tiramisu between them changes nothing.
    const blocks = articleBlocks([
      ...menuLines("g1"),
      line({ id: "z", productName: "Tiramisu", lineTotal: 350 }),
      ...menuLines("g2"),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(["combo", "item", "combo"]);
    expect(blocks.filter((b) => b.kind === "combo")).toHaveLength(2);
  });

  it("falls back to the line's own name if a menu name was never snapshotted", () => {
    const [a, b, c] = menuLines();
    const blocks = articleBlocks([{ ...a, comboName: null }, b, c]);
    expect(blocks[0].kind === "combo" && blocks[0].name).toBe("Regina");
  });
});

describe("the ticket prints the composition and no component price", () => {
  const text = () => flat(renderReceipt(order(menuLines()), { receiptWidth: 48 }));

  it("prints the menu once, at its forfait", () => {
    const t = text();
    expect(t).toContain("1× Menu Chill");
    expect(t).toMatch(/1× Menu Chill\s+24,90/);
  });

  it("prints each component as an indented, price-less line", () => {
    const t = text();
    expect(t).toContain("  · Regina");
    expect(t).toContain("  · Quatre Fromages");
    expect(t).toContain("  · Coca");
  });

  it("PRINTS NO PER-COMPONENT AMOUNT — they are allocation artefacts", () => {
    const t = text();
    for (const artefact of ["10,86", "10,85", "3,19"]) {
      expect(t, `the ticket printed the allocated share ${artefact}`).not.toContain(artefact);
    }
  });

  it("prints a component's own choices one level deeper than the component", () => {
    const t = text();
    // « Senior » must not be readable as a fourth component.
    expect(t).toContain("    · Senior");
    expect(t.indexOf("    · Senior")).toBeGreaterThan(t.indexOf("  · Regina"));
  });

  it("prints a supplement WITH its price — that is money the customer paid", () => {
    const lines = menuLines();
    lines[0] = {
      ...lines[0],
      addOnsJson: JSON.stringify([{ id: "a", name: "Oeuf", price: 150 }]),
      unitPrice: 1236,
      lineTotal: 1236,
    };
    const t = flat(renderReceipt(order(lines, { total: 2640, subtotal: 2640 }), { receiptWidth: 48 }));
    expect(t).toContain("    + Oeuf (1,50 €)");
  });

  it("names a slot surcharge on the paper rather than hiding it in the total", () => {
    const lines = menuLines();
    lines[2] = {
      ...lines[2],
      productName: "Frite Cheddar",
      addOnsJson: JSON.stringify([{ id: null, name: "Supplément Frite Cheddar", price: 150 }]),
    };
    const t = flat(renderReceipt(order(lines), { receiptWidth: 48 }));
    expect(t).toContain("Supplément Frite Cheddar (1,50 €)");
  });

  it("still carries the Détail TVA block, which is where the rates live", () => {
    const t = text();
    expect(t).toContain("Détail TVA");
    expect(t).toContain("TVA 5,5 %");
    expect(t).toContain("TVA 10 %");
  });

  it("prints a quantity-2 menu at twice the forfait", () => {
    const lines = menuLines().map((l) => ({ ...l, quantity: 2, lineTotal: l.lineTotal * 2 }));
    const t = flat(renderReceipt(order(lines), { receiptWidth: 48 }));
    expect(t).toMatch(/2× Menu Chill\s+49,80/);
  });

  it("no line exceeds the paper, menus included (L-21 / L-63)", () => {
    for (const w of [32, 42, 48]) {
      const t = renderReceipt(order(menuLines()), { receiptWidth: w });
      for (const l of t.split("\n")) {
        expect(l.length, `« ${l} » exceeds ${w} columns`).toBeLessThanOrEqual(w);
      }
    }
  });

  it("an ordinary ticket is unchanged by any of this", () => {
    const t = flat(
      renderReceipt(
      order([
        line({
          productName: "Regina",
          quantity: 2,
          lineTotal: 1780,
          optionsJson: JSON.stringify([{ group: "Taille", choice: "Junior" }]),
          addOnsJson: JSON.stringify([{ name: "Oeuf", price: 150 }]),
        }),
      ]),
      { receiptWidth: 48 },
      ),
    );
    expect(t).toContain("2× Regina");
    expect(t).toContain("  · Junior");
    expect(t).toContain("  + Oeuf (1,50 €)");
    expect(t).not.toContain("    · ");
  });
});
