import { describe, it, expect } from "vitest";
import { formatEuro } from "@/lib/format";
import { cashVarianceCents, formatVariance } from "./z-close";

// fr-FR currency output uses U+00A0 before "€" and U+202F as the thousands
// separator. Normalise both to a plain space so the assertions read as the
// operator sees them.
const shown = (s: string) => s.replace(/[\u00A0\u202F]/g, " ");

// C-02 (Batch 1.2) — the Z-close dialog divided cents by 100 before handing
// them to Money/formatEuro, which divide by 100 themselves. A 200,00 €
// opening float rendered "2,00 €" and a 5,00 € shortage rendered "0,05 €",
// on the one screen whose purpose is catching missing cash. These tests pin
// the three numbers that screen shows.
describe("Z-close dialog display (cents in, one division out)", () => {
  // The scenario the batch validates by hand: 200,00 € opening float,
  // 420,70 € expected in the drawer, operator counts 415,70 €.
  const openingFloat = 20000;
  const expectedCash = 42070;

  it("shows the opening float and expected cash as euros", () => {
    expect(shown(formatEuro(openingFloat))).toBe("200,00 €");
    expect(shown(formatEuro(expectedCash))).toBe("420,70 €");
  });

  it("would have shown a hundredth of the real figure before the fix", () => {
    // Regression pin: this is exactly what the removed `/ 100` produced.
    expect(shown(formatEuro(openingFloat / 100))).toBe("2,00 €");
    expect(shown(formatEuro(expectedCash / 100))).toBe("4,21 €");
  });

  it("reports a 5,00 € shortage as 5,00 €, not 0,05 €", () => {
    const variance = cashVarianceCents(41570, expectedCash);
    expect(variance).toBe(-500);
    expect(shown(formatVariance(variance))).toBe("-5,00 €");
    expect(shown(formatVariance(variance))).not.toBe("-0,05 €");
  });

  it("reports a 5,00 € surplus with an explicit plus sign", () => {
    const variance = cashVarianceCents(42570, expectedCash);
    expect(variance).toBe(500);
    expect(shown(formatVariance(variance))).toBe("+5,00 €");
  });

  it("reports an exact count as a signless zero", () => {
    const variance = cashVarianceCents(expectedCash, expectedCash);
    expect(variance).toBe(0);
    expect(shown(formatVariance(variance))).toBe("0,00 €");
  });

  it("keeps the sign correct for a shortage larger than the expected float", () => {
    // Drawer emptied: counted 0 against 420,70 € expected.
    expect(shown(formatVariance(cashVarianceCents(0, expectedCash)))).toBe(
      "-420,70 €",
    );
  });

  it("does not round a one-cent discrepancy away", () => {
    // The old euros path ran the difference through round2(), which could
    // only ever show whole cents anyway — but the cent path is exact.
    expect(cashVarianceCents(42069, expectedCash)).toBe(-1);
    expect(shown(formatVariance(cashVarianceCents(42069, expectedCash)))).toBe(
      "-0,01 €",
    );
  });

  it("formats four-figure amounts with the French thousands separator", () => {
    expect(shown(formatEuro(123456))).toBe("1 234,56 €");
    expect(shown(formatVariance(cashVarianceCents(223456, 100000)))).toBe(
      "+1 234,56 €",
    );
  });
});
