import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { resolveSnapshotOptions, safeParseOptions } from "@/lib/order-parsers";

// L-87 (R4.7) — reordering a line must put REAL catalogue ids in the cart.
//
// ── THE DEFECT ───────────────────────────────────────────────────────────────
// `optionsJson` snapshots an option as `{ group, choice, priceModifier }` —
// names, no ids, because that is what the ticket prints. The reorder path put
// those into the cart with `choiceId: ""`, under a comment reading « snapshot
// has no choice ids; server recomputes by product at checkout ».
//
// The server does not. `pricing.ts:233` filters the catalogue's choices with
// `selectedOptionIds.has(c.id)`, and `""` matches nothing — so every reordered
// option was silently dropped. Worse, `pricing.ts:239` then refuses the whole
// line if the product has a REQUIRED group:
//
//     Option obligatoire manquante : Taille
//
// Every pizza on this catalogue has a required « Taille ». So reordering was
// not degraded, it was broken, and the comment asserted the opposite of what
// the code it described actually did.
//
// ── THE MATCH IS TRIMMED AND CASE-FOLDED, DELIBERATELY ───────────────────────
// The live catalogue holds fourteen names with stray leading or trailing spaces
// (L-39 — « Sauces », « Barbecue », « Mayonnaise »…). R4.4 trims them. A
// snapshot taken BEFORE that trim must still match the catalogue AFTER it, and
// vice versa, or fixing L-39 would silently break reordering for every order
// already taken. That is tested below in both directions.

const GROUPS = [
  {
    name: "Taille",
    choices: [
      { id: "ch-junior", name: "Junior" },
      { id: "ch-senior", name: "Senior" },
    ],
  },
  {
    // As it sits in the live catalogue today: a TRAILING space (L-39).
    name: "Sauces ",
    choices: [
      // As they sit in the live catalogue today: LEADING spaces (L-39).
      { id: "ch-barbecue", name: " Barbecue" },
      { id: "ch-mayo", name: " Mayonnaise" },
    ],
  },
];

const snapshot = (rows: { group: string; choice: string; priceModifier?: number }[]) =>
  safeParseOptions(JSON.stringify(rows));

describe("L-87 — the ids the checkout actually needs", () => {
  it("resolves every option to a real catalogue id", () => {
    const { resolved, unresolved } = resolveSnapshotOptions(
      snapshot([{ group: "Taille", choice: "Senior", priceModifier: 300 }]),
      GROUPS,
    );

    expect(unresolved).toEqual([]);
    expect(resolved).toEqual([
      { group: "Taille", choice: "Senior", choiceId: "ch-senior", priceModifier: 300 },
    ]);
    // The whole point: NOT the empty string the server cannot match.
    expect(resolved[0].choiceId).not.toBe("");
  });

  it("matches across the L-39 whitespace, in BOTH directions", () => {
    // A snapshot taken from today's dirty catalogue, matched against the
    // catalogue as it is now.
    const before = resolveSnapshotOptions(
      snapshot([{ group: "Sauces ", choice: " Barbecue" }]),
      GROUPS,
    );
    expect(before.resolved.map((o) => o.choiceId)).toEqual(["ch-barbecue"]);

    // The same snapshot, matched against a catalogue AFTER R4.4 trims it. This
    // is the direction that matters: every order already taken must still
    // reorder once the names are cleaned.
    const trimmed = GROUPS.map((g) => ({
      name: g.name.trim(),
      choices: g.choices.map((c) => ({ ...c, name: c.name.trim() })),
    }));
    const after = resolveSnapshotOptions(
      snapshot([{ group: "Sauces ", choice: " Barbecue" }]),
      trimmed,
    );
    expect(after.resolved.map((o) => o.choiceId)).toEqual(["ch-barbecue"]);

    // And a CLEAN snapshot against the dirty catalogue — the other direction,
    // which is what happens for orders taken after the trim if it were rolled
    // back, and costs nothing to guarantee.
    const reverse = resolveSnapshotOptions(snapshot([{ group: "Sauces", choice: "Barbecue" }]), GROUPS);
    expect(reverse.resolved.map((o) => o.choiceId)).toEqual(["ch-barbecue"]);
  });

  it("reports what the catalogue no longer offers, rather than dropping it silently", () => {
    // Silently dropping is precisely the old behaviour. The cashier is told.
    const { resolved, unresolved } = resolveSnapshotOptions(
      snapshot([
        { group: "Taille", choice: "Senior" },
        { group: "Taille", choice: "Mega" }, // withdrawn from the catalogue
        { group: "Garniture", choice: "Olives" }, // whole group gone
      ]),
      GROUPS,
    );

    expect(resolved.map((o) => o.choiceId)).toEqual(["ch-senior"]);
    expect(unresolved).toEqual(["Taille : Mega", "Garniture : Olives"]);
  });

  it("does not invent an id for a choice from the wrong group", () => {
    // « Senior » exists, but not under « Sauces ». Matching on the choice name
    // alone would resolve it and book a size as a sauce.
    const { resolved, unresolved } = resolveSnapshotOptions(
      snapshot([{ group: "Sauces", choice: "Senior" }]),
      GROUPS,
    );
    expect(resolved).toEqual([]);
    expect(unresolved).toEqual(["Sauces : Senior"]);
  });

  it("handles an empty snapshot and an empty catalogue", () => {
    expect(resolveSnapshotOptions([], GROUPS)).toEqual({ resolved: [], unresolved: [] });
    expect(resolveSnapshotOptions(snapshot([{ group: "Taille", choice: "Senior" }]), [])).toEqual({
      resolved: [],
      unresolved: ["Taille : Senior"],
    });
  });
});

describe("L-87 — the reorder path is wired to it", () => {
  it("no longer sends choiceId: \"\", and reports unresolved options", () => {
    // The extracted rule proves the rule; this proves the reorder path calls
    // it. Comments stripped first — a source assertion that reads prose is
    // worse than none.
    const code = readFileSync(path.join(process.cwd(), "src/features/orders/orders-view.tsx"), "utf-8")
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");

    expect(code).toContain("resolveSnapshotOptions(options, product?.options ?? [])");
    expect(code).toContain("choiceId: o.choiceId");
    // The defect itself is gone, not merely bypassed.
    expect(code).not.toMatch(/choiceId:\s*""/);
    // And the cashier is told when the catalogue has moved under the order.
    expect(code).toContain("unresolvable");
  });
});
