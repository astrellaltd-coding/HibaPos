import { describe, it, expect } from "vitest";
import {
  allocateCombo,
  expandSlots,
  slotAllowsProduct,
  slotSurcharge,
  COMBO_FALLBACK_RATE_FLOOR,
  type ComboComponent,
  type ComboSlotDefinition,
} from "@/lib/services/combo";
import { splitVat, vatRateKey, sum2 } from "@/lib/money";

// Batch 5.9 — the allocation, against `docs/politique-ventilation-tva.md`.
//
// The nine cases in § 5 of that document are the specification, and this file
// is where they are pinned. **Six of the nine were corrected on 2026-09-09**,
// by one cent each, because the figures published there had not in fact been
// produced the way the software produces them:
//
//   1. GROUPING. The Menu Eco à emporter row apportioned 26,70 (three Juniors
//      as ONE weight) against 3,50. The software apportions across COMPONENTS —
//      four weights — because a menu books one `OrderItem` per component and a
//      line is the only thing that can carry a rate. 22,02 / 2,88, not
//      22,01 / 2,89. One row.
//
//   2. WHERE THE HT IS ROUNDED. The document divided each rate BUCKET once
//      (« 21,71 ÷ 1,10 = 19,74 »). This till divides each LINE — `lineHt =
//      round(lineNetTotal / (1 + rate/100))`, which is Batch 3.11's stored,
//      tested invariant. Five more rows, the three sur place ones among them.
//
// Neither is a defect and neither was a choice made here: they follow from
// booking a menu as its components, which is item 5.9d and the reason the
// kitchen can now be told which pizzas were ordered. The direction is not
// systematic — five rows gain a cent of VAT, one loses one.
//
// WHAT THIS FILE PROVES AND WHAT IT DOES NOT. It proves the arithmetic. It
// proves nothing about whether anything CALLS it — that is `combo-checkout.test.ts`,
// and Batches 5.8 and 3.12 both shipped a correct rule nothing consulted.

// Reference prices measured read-only from the live catalogue, 2026-09-09.
// The pizza sizes are CATEGORY option choices carrying absolute prices
// (`Pizzas → Taille`), so `computeLinePricing` resolves sur place to the
// pickup absolute — which is why Junior is 8,90 both sur place and à emporter.
const JUNIOR = { dineIn: 890, takeaway: 890, delivery: 990 };
const SENIOR = { dineIn: 1190, takeaway: 1190, delivery: 1350 };
const MEGA = { dineIn: 1590, takeaway: 1590, delivery: 1890 };
const BOUTEILLE = 350;

/** A drink is 10 % sur place and 5,5 % otherwise — L-68, Batch 3.12. */
const drinkRate = (orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON") => (orderType === "DINE_IN" ? 10 : 5.5);

function pizza(ref: number, n: number): ComboComponent[] {
  return Array.from({ length: n }, (_, i) => ({
    slotId: "pizza",
    slotName: "Pizza",
    productId: `p${i}`,
    productName: `Pizza ${i + 1}`,
    referencePrice: ref,
    supplements: 0,
    vatRate: 10,
    optionsJson: null,
    addOnsJson: null,
    notes: null,
  }));
}
function bouteille(rate: number): ComboComponent {
  return {
    slotId: "drink",
    slotName: "Boisson",
    productId: "d",
    productName: "Coca",
    referencePrice: BOUTEILLE,
    supplements: 0,
    vatRate: rate,
    optionsJson: null,
    addOnsJson: null,
    notes: null,
  };
}

/** The `Détail TVA` block a ticket would print for these lines: per-LINE
 *  splits accumulated per rate, exactly as `receipt.ts` and the checkout
 *  transaction both do it. */
function buckets(lines: { unitPrice: number; vatRate: number }[]) {
  const out: Record<string, { ttc: number; ht: number; vat: number }> = {};
  for (const l of lines) {
    const k = vatRateKey(l.vatRate);
    const s = splitVat(l.unitPrice, l.vatRate);
    const b = (out[k] ??= { ttc: 0, ht: 0, vat: 0 });
    b.ttc += l.unitPrice;
    b.ht += s.ht;
    b.vat += s.vat;
  }
  return out;
}

function run(components: ComboComponent[], forfait: number, menuVatRate = 10) {
  const a = allocateCombo({
    menuProductId: "menu",
    menuName: "Menu",
    forfait,
    menuVatRate,
    components,
  });
  // L-136 (R8.5): `allocateCombo` can now refuse a component whose share plus
  // supplements would be negative. Every case in this file is a legitimate
  // allocation, so a refusal here is a bug in the fixture and should stop the
  // test rather than be threaded through 30 assertions as a union.
  if ("error" in a) throw new Error(`allocateCombo refused this fixture: ${a.error}`);
  return { allocation: a, buckets: buckets(a.lines) };
}

type Expected = { ttc: number; ht: number }; // per rate key
const CASES: {
  menu: string;
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON";
  components: (rate: number) => ComboComponent[];
  forfait: number;
  expect: Record<string, Expected>;
  vat: number;
}[] = [
  // ---- Menu Eco — 3 pizzas Junior + 1 bouteille — 24,90 in all three modes
  {
    menu: "Menu Eco",
    orderType: "DINE_IN",
    components: (r) => [...pizza(JUNIOR.dineIn, 3), bouteille(r)],
    forfait: 2490,
    expect: { "10": { ttc: 2490, ht: 2263 } },
    vat: 227,
  },
  {
    menu: "Menu Eco",
    orderType: "TAKEAWAY",
    components: (r) => [...pizza(JUNIOR.takeaway, 3), bouteille(r)],
    forfait: 2490,
    expect: { "10": { ttc: 2202, ht: 2001 }, "5.5": { ttc: 288, ht: 273 } },
    vat: 216,
  },
  {
    menu: "Menu Eco",
    orderType: "LIVRAISON",
    components: (r) => [...pizza(JUNIOR.delivery, 3), bouteille(r)],
    forfait: 2490,
    expect: { "10": { ttc: 2228, ht: 2025 }, "5.5": { ttc: 262, ht: 248 } },
    vat: 217,
  },
  // ---- Menu Chill — 2 pizzas Senior + 1 bouteille — 24,90 / 28,90 livraison
  {
    menu: "Menu Chill",
    orderType: "DINE_IN",
    components: (r) => [...pizza(SENIOR.dineIn, 2), bouteille(r)],
    forfait: 2490,
    expect: { "10": { ttc: 2490, ht: 2263 } },
    vat: 227,
  },
  {
    menu: "Menu Chill",
    orderType: "TAKEAWAY",
    components: (r) => [...pizza(SENIOR.takeaway, 2), bouteille(r)],
    forfait: 2490,
    expect: { "10": { ttc: 2171, ht: 1973 }, "5.5": { ttc: 319, ht: 302 } },
    vat: 215,
  },
  {
    menu: "Menu Chill",
    orderType: "LIVRAISON",
    components: (r) => [...pizza(SENIOR.delivery, 2), bouteille(r)],
    forfait: 2890,
    expect: { "10": { ttc: 2558, ht: 2326 }, "5.5": { ttc: 332, ht: 315 } },
    vat: 249,
  },
  // ---- Menu XXL — 2 pizzas Mega + 1 bouteille — 33,90 / 36,90 livraison
  {
    menu: "Menu XXL",
    orderType: "DINE_IN",
    components: (r) => [...pizza(MEGA.dineIn, 2), bouteille(r)],
    forfait: 3390,
    expect: { "10": { ttc: 3390, ht: 3081 } },
    vat: 309,
  },
  {
    menu: "Menu XXL",
    orderType: "TAKEAWAY",
    components: (r) => [...pizza(MEGA.takeaway, 2), bouteille(r)],
    forfait: 3390,
    expect: { "10": { ttc: 3054, ht: 2776 }, "5.5": { ttc: 336, ht: 318 } },
    vat: 296,
  },
  {
    menu: "Menu XXL",
    orderType: "LIVRAISON",
    components: (r) => [...pizza(MEGA.delivery, 2), bouteille(r)],
    forfait: 3690,
    expect: { "10": { ttc: 3377, ht: 3070 }, "5.5": { ttc: 313, ht: 297 } },
    vat: 323,
  },
];

describe("allocation — the nine cases of docs/politique-ventilation-tva.md § 5", () => {
  for (const c of CASES) {
    it(`${c.menu} ${c.orderType} splits ${(c.forfait / 100).toFixed(2)} € as the policy says`, () => {
      const { allocation, buckets: b } = run(c.components(drinkRate(c.orderType)), c.forfait);
      expect(allocation.fallback).toBeNull();
      for (const [rate, want] of Object.entries(c.expect)) {
        expect(b[rate], `no ${rate} % bucket`).toBeDefined();
        expect(b[rate].ttc, `${rate} % base TTC`).toBe(want.ttc);
        expect(b[rate].ht, `${rate} % base HT`).toBe(want.ht);
      }
      expect(Object.keys(b).sort()).toEqual(Object.keys(c.expect).sort());
      expect(sum2(Object.values(b).map((x) => x.vat)), "total VAT").toBe(c.vat);
    });
  }

  it("every case lands EXACTLY on the selling price — the property apportion() is here for", () => {
    for (const c of CASES) {
      const { allocation } = run(c.components(drinkRate(c.orderType)), c.forfait);
      expect(sum2(allocation.lines.map((l) => l.allocatedShare)), `${c.menu} ${c.orderType}`).toBe(c.forfait);
    }
  });

  it("sur place produces ONE bucket at 10 % and nothing else", () => {
    for (const c of CASES.filter((x) => x.orderType === "DINE_IN")) {
      const { buckets: b } = run(c.components(10), c.forfait);
      expect(Object.keys(b)).toEqual(["10"]);
      expect(b["10"].ttc).toBe(c.forfait);
    }
  });

  it("à emporter and en livraison always carry a 5,5 % share, and it is the drink's", () => {
    for (const c of CASES.filter((x) => x.orderType !== "DINE_IN")) {
      const { allocation, buckets: b } = run(c.components(5.5), c.forfait);
      expect(b["5.5"], `${c.menu} ${c.orderType}`).toBeDefined();
      const drinkLines = allocation.lines.filter((l) => l.vatRate === 5.5);
      expect(drinkLines).toHaveLength(1);
      expect(drinkLines[0].productName).toBe("Coca");
      expect(b["5.5"].ttc).toBe(drinkLines[0].unitPrice);
    }
  });
});

describe("allocation — supplements are outside the forfait (policy § 6)", () => {
  const base = () => [...pizza(SENIOR.takeaway, 2), bouteille(5.5)];

  it("a supplement is charged on top and does not move the allocation", () => {
    const plain = run(base(), 2490);
    const withSupp = base();
    withSupp[0] = { ...withSupp[0], supplements: 150 }; // « Oeuf » 1,50 € on the first pizza
    const supp = run(withSupp, 2490);

    // The allocation base is the menu price ALONE — the shares are untouched.
    expect(supp.allocation.lines.map((l) => l.allocatedShare)).toEqual(
      plain.allocation.lines.map((l) => l.allocatedShare),
    );
    expect(sum2(supp.allocation.lines.map((l) => l.allocatedShare))).toBe(2490);
    // And the customer pays 1,50 € more, at the pizza's own rate.
    expect(sum2(supp.allocation.lines.map((l) => l.unitPrice))).toBe(2490 + 150);
    expect(supp.buckets["10"].ttc).toBe(plain.buckets["10"].ttc + 150);
    expect(supp.buckets["5.5"].ttc).toBe(plain.buckets["5.5"].ttc);
  });

  it("a supplement rides on ITS OWN component's line, so it takes that component's rate", () => {
    const comps = base();
    comps[2] = { ...comps[2], supplements: 100 }; // hypothetical: on the drink
    const { allocation } = run(comps, 2490);
    const drink = allocation.lines.find((l) => l.productName === "Coca")!;
    expect(drink.supplements).toBe(100);
    expect(drink.vatRate).toBe(5.5);
    // Recorded rather than defended: no add-on in this catalogue is offered on
    // a drink (they exist on `Pizzas` and `Sandwichs` only, both 10 % in every
    // mode), so this branch is unreachable on the live data. If a paid extra is
    // ever offered on a reduced-rate component it must get its own line.
  });
});

describe("allocation — the fallback (policy § 4)", () => {
  it("taxes the WHOLE forfait at the highest rate present when no reference price exists", () => {
    const comps = [...pizza(0, 2), { ...bouteille(5.5), referencePrice: 0 }];
    const { allocation } = run(comps, 2490);
    expect(allocation.fallback).not.toBeNull();
    expect(allocation.fallback!.reason).toBe("aucun prix de référence au catalogue");
    expect(allocation.fallback!.rate).toBe(10);
    expect(allocation.lines).toHaveLength(1);
    expect(allocation.lines[0].unitPrice).toBe(2490);
    expect(allocation.lines[0].vatRate).toBe(10);
  });

  it("falls back when a component's rate could not be resolved", () => {
    const comps = [...pizza(SENIOR.takeaway, 2), { ...bouteille(5.5), vatRate: Number.NaN }];
    const { allocation } = run(comps, 2490);
    expect(allocation.fallback!.reason).toBe("taux de TVA non résolu pour un composant");
    expect(allocation.lines[0].vatRate).toBe(10);
  });

  it("MAJORE, never minore — a menu of drinks alone still falls back to 10 %", () => {
    // Every rate present is 5,5, so « le taux le plus élevé des taux en
    // présence » would be 5,5. The floor is what keeps the software on the
    // safe side of a division it could not justify.
    //
    // THE MENU'S OWN RATE IS 5,5 HERE, AND THAT IS THE POINT. This assertion
    // passed with `menuVatRate: 10` and went on passing when the floor was
    // reverted away — `Math.max(0, 10, 5.5)` is 10 either way, so it was true
    // for the wrong reason and proved nothing. Found by the revert protocol;
    // with every rate in sight at 5,5, only the floor can produce 10.
    const comps = [
      { ...bouteille(5.5), referencePrice: 0 },
      { ...bouteille(5.5), referencePrice: 0, productId: "d2" },
    ];
    const { allocation } = run(comps, 700, 5.5);
    expect(allocation.fallback!.rate).toBe(COMBO_FALLBACK_RATE_FLOOR);
    expect(allocation.lines[0].vatRate).toBe(10);
  });

  it("takes a rate ABOVE the floor when one is present", () => {
    const comps = [
      { ...pizza(0, 1)[0], vatRate: 20 },
      { ...bouteille(5.5), referencePrice: 0 },
    ];
    const { allocation } = run(comps, 1000);
    expect(allocation.fallback!.rate).toBe(20);
  });

  it("keeps the composition on the fallback line, so the ticket can still print it", () => {
    const comps = [...pizza(0, 2), { ...bouteille(5.5), referencePrice: 0 }];
    const { allocation } = run(comps, 2490);
    const parsed = JSON.parse(allocation.lines[0].optionsJson!) as { group: string; choice: string }[];
    expect(parsed.map((p) => p.choice)).toEqual(["Pizza 1", "Pizza 2", "Coca"]);
  });

  it("folds the supplements in at the fallback rate rather than splitting them out", () => {
    const comps = [...pizza(0, 1)];
    comps[0] = { ...comps[0], supplements: 150 };
    const { allocation } = run(comps, 1000);
    expect(allocation.lines).toHaveLength(1);
    expect(allocation.lines[0].unitPrice).toBe(1150);
    expect(allocation.lines[0].vatRate).toBe(10);
  });

  it("a menu with no components at all falls back rather than booking nothing", () => {
    const { allocation } = run([], 2490);
    expect(allocation.fallback!.reason).toBe("menu sans composant");
    expect(allocation.lines).toHaveLength(1);
    expect(allocation.lines[0].unitPrice).toBe(2490);
  });
});

describe("slots", () => {
  const slot = (over: Partial<ComboSlotDefinition> = {}): ComboSlotDefinition => ({
    id: "s1",
    name: "Pizza",
    quantity: 1,
    sortOrder: 0,
    sourceCategoryId: "pizzas",
    choices: [],
    optionRules: [],
    ...over,
  });

  it("a slot of quantity 2 becomes two seats — the Duo's two burgers", () => {
    const seats = expandSlots([slot({ id: "burger", name: "Burger", quantity: 2 })]);
    expect(seats).toHaveLength(2);
    expect(seats.map((s) => s.seatIndex)).toEqual([0, 1]);
    expect(seats.map((s) => s.position)).toEqual([0, 1]);
  });

  it("seats come out in slot order, and the positions run across the whole menu", () => {
    const seats = expandSlots([
      slot({ id: "drink", name: "Boisson", sortOrder: 2 }),
      slot({ id: "burger", name: "Burger", quantity: 2, sortOrder: 0 }),
      slot({ id: "frite", name: "Frite", sortOrder: 1 }),
    ]);
    expect(seats.map((s) => s.slot.name)).toEqual(["Burger", "Burger", "Frite", "Boisson"]);
    expect(seats.map((s) => s.position)).toEqual([0, 1, 2, 3]);
  });

  it("A COMBO MAY NEVER FILL A SLOT, even one that whitelists it", () => {
    const s = slot({ choices: [{ productId: "menu-eco", surcharge: 0, sortOrder: 0 }] });
    expect(
      slotAllowsProduct(s, { id: "menu-eco", categoryId: "pizzas", isCombo: true }, new Set(["pizzas"])),
    ).toBe(false);
    // …and the same product would be allowed if it were not a menu.
    expect(
      slotAllowsProduct(s, { id: "menu-eco", categoryId: "pizzas", isCombo: false }, new Set(["pizzas"])),
    ).toBe(true);
  });

  it("an empty whitelist means the whole source tree, children included", () => {
    const s = slot();
    const tree = new Set(["pizzas", "sauce-tomate", "creme-frech", "menu"]);
    expect(slotAllowsProduct(s, { id: "p", categoryId: "sauce-tomate", isCombo: false }, tree)).toBe(true);
    expect(slotAllowsProduct(s, { id: "b", categoryId: "burgers", isCombo: false }, tree)).toBe(false);
  });

  it("a whitelist overrides the tree — a product in the category but not on the list is refused", () => {
    const s = slot({ choices: [{ productId: "frite", surcharge: 0, sortOrder: 0 }] });
    const tree = new Set(["croustillants"]);
    expect(slotAllowsProduct(s, { id: "frite", categoryId: "croustillants", isCombo: false }, tree)).toBe(true);
    expect(slotAllowsProduct(s, { id: "box15", categoryId: "croustillants", isCombo: false }, tree)).toBe(false);
  });

  it("carries the operator's +1,50 € for a Frite Cheddar inside a Duo", () => {
    // The figure could NOT be derived from the catalogue: standalone, Frite is
    // 3,50 and Frite Cheddar 4,90, a difference of 1,40. The operator's ruling
    // of 2026-09-09 is 1,50, which is the modifier the `Burgers → Frite`
    // category group already carries. That is why the surcharge is stored.
    const s = slot({
      name: "Frite",
      choices: [
        { productId: "frite", surcharge: 0, sortOrder: 0 },
        { productId: "potatoes", surcharge: 0, sortOrder: 1 },
        { productId: "cheddar", surcharge: 150, sortOrder: 2 },
      ],
    });
    expect(slotSurcharge(s, "frite")).toBe(0);
    expect(slotSurcharge(s, "cheddar")).toBe(150);
    expect(slotSurcharge(s, "inconnu")).toBe(0);
  });
});
