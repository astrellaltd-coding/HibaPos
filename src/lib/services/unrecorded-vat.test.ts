import { describe, it, expect } from "vitest";
import {
  requireVatRate,
  isUnrecordedVatRate,
  UnrecordedVatRateError,
  UNRECORDED_VAT_LABEL,
} from "@/lib/money";
import { renderReceipt } from "@/lib/services/receipt";
import type { OrderDto, SettingsDto } from "@/types/api";

// L-129 (R9.8) — a null `OrderItem.vatRate` is no longer silently 10 %.
//
// THE FINDING: the column is nullable and **what null meant was written down
// nowhere**. Three readers, all in the money path, did `item.vatRate ?? 10` —
// into the printed ticket's VAT table, the order's VAT breakdown, and therefore
// the Z report and every close.
//
// **10 % is the restauration rate; a drink à emporter is 5,5 %.** So the
// default was not conservative in either direction: it understated the VAT due
// on one and overstated it on the other.
//
// It contradicted two rules this schema states about its own nullable columns,
// one of them two lines below `vatRate` in the same model — `lineNetTotal` and
// `lineHt` are nullable « rather than writing invented figures into the fiscal
// record », and `referencePrice` says « Null is the statement. Never backfill
// it. » `?? 10` was exactly that backfill.
//
// ── TWO READERS, TWO ANSWERS, AND THAT IS DELIBERATE ─────────────────────────
// The aggregation REFUSES: a VAT breakdown gets sealed, and a sealed figure may
// not be guessed. The receipt PRINTS and says the rate is unknown, because
// « printing must never lose a sale ». They are asked different questions.
//
// Nothing writes a null rate today. This is reachable through a restore of an
// older database, a hand edit, or any future writer — and the point of settling
// it now is that none of those arrives with a warning.

const settings: Partial<SettingsDto> = {
  restaurantName: "HIBA FOOD",
  receiptWidth: 42,
};

function orderWith(rates: (number | null)[]): OrderDto {
  const items = rates.map((vatRate, i) => ({
    id: `i${i}`,
    productName: `Ligne ${i + 1}`,
    quantity: 1,
    unitPrice: 1000,
    lineTotal: 1000,
    vatRate,
  }));
  return {
    id: "o1",
    number: 1,
    status: "COMPLETED",
    orderType: "TAKEAWAY",
    subtotal: 1000 * rates.length,
    discountTotal: 0,
    total: 1000 * rates.length,
    vatTotal: 0,
    itemCount: rates.length,
    createdAt: new Date().toISOString(),
    items,
    payments: [{ method: "CASH", amount: 1000 * rates.length }],
  } as unknown as OrderDto;
}

describe("L-129 — the rule itself", () => {
  it("returns a rate that was recorded, including zero", () => {
    // Zero is a RATE, not an absence. A guard written with `||` would treat a
    // zero-rated line as unrecorded and refuse a sale that is perfectly legal.
    expect(requireVatRate(10, "x")).toBe(10);
    expect(requireVatRate(5.5, "x")).toBe(5.5);
    expect(requireVatRate(0, "x")).toBe(0);
  });

  it("refuses null and undefined", () => {
    for (const bad of [null, undefined]) {
      expect(() => requireVatRate(bad, "la ligne « Coca »")).toThrow(UnrecordedVatRateError);
    }
  });

  it("is typed, and names the line without inventing a rate", () => {
    let caught: unknown;
    try {
      requireVatRate(null, "la ligne « Coca »");
    } catch (e) {
      caught = e;
    }
    expect(isUnrecordedVatRate(caught)).toBe(true);
    const message = (caught as Error).message;
    expect(message).toContain("Coca");
    expect(message).toContain("5,5");
    expect(message).toContain("10 %");
    // …and it says what to do, rather than only that it refused.
    expect(message).toContain("avant de clôturer");
  });
});

// The aggregation's two cases live in `aggregate.test.ts`, which already has a
// valid `AggregatableOrder` fixture — building one by hand here produced an
// order with no `refunds` array and a TypeError instead of the refusal.

describe("L-129 — the receipt prints, and says what it does not know", () => {
  it("never claims 10 % for a line that has no rate", () => {
    const text = renderReceipt(orderWith([null]), settings as SettingsDto);
    expect(text, "the ticket claimed a rate nobody recorded").not.toContain("10 %");
    expect(text).toContain(UNRECORDED_VAT_LABEL);
  });

  it("still prints the sale — printing must never lose one", () => {
    const text = renderReceipt(orderWith([null]), settings as SettingsDto);
    expect(text).toContain("Ligne 1");
    expect(text).toContain("HIBA FOOD");
    expect(text.length).toBeGreaterThan(100);
  });

  it("does not put a « % » after a label that is not a rate", () => {
    // « non enregistré % » would be worse than the invented 10 it replaced.
    const text = renderReceipt(orderWith([null]), settings as SettingsDto);
    expect(text).not.toContain(`${UNRECORDED_VAT_LABEL} %`);
    expect(text).toContain(`Taux ${UNRECORDED_VAT_LABEL}`);
  });

  it("keeps the recorded rates separate from the unrecorded ones", () => {
    // A ticket with one of each. The 10 % line must still print as 10 %, and
    // the unknown one must not be folded into it.
    const text = renderReceipt(orderWith([10, null]), settings as SettingsDto);
    expect(text).toContain("10 %");
    expect(text).toContain(UNRECORDED_VAT_LABEL);
  });

  it("is unchanged for an ordinary ticket", () => {
    // Every sale this catalogue can make records a rate, so nothing about the
    // normal ticket may move.
    const text = renderReceipt(orderWith([10, 5.5]), settings as SettingsDto);
    expect(text).not.toContain(UNRECORDED_VAT_LABEL);
    expect(text).toContain("10 %");
    expect(text).toContain("5,5 %");
  });

  it("puts no line over the paper, with the longer label", () => {
    // « Taux non enregistré » is wider than « 10,0 % », and L-63's rule applies
    // to every line this renderer emits.
    for (let w = 32; w <= 48; w++) {
      const over = renderReceipt(orderWith([null, 10]), {
        ...settings,
        receiptWidth: w,
      } as SettingsDto)
        .split("\n")
        .filter((l) => l.length > w);
      expect({ w, over }).toEqual({ w, over: [] });
    }
  });
});
