import { describe, it, expect } from "vitest";
import {
  counterRegressions,
  describeCounterRegressions,
  FISCAL_COUNTER_FIELDS,
  type FiscalCounterFields,
} from "@/lib/services/fiscal-counter-floor";

// Batch 4.5 — L-38 (the counter-repair scripts can rewind FiscalCounter).
//
// Before this batch `scripts/fix-fiscal-counter.ts` read `max(number)` from
// orders, shifts and Z reports and wrote those values into the singleton
// unconditionally. That is a repair when the counter has fallen behind its
// tables and a rewind when it has not: run after anything that removed rows,
// it set the counters down — to 0 against empty tables — and the next
// genuine sale would then print a receipt number already sealed into the
// journal, with the duplicate only discoverable afterwards.
//
// These tests assert the one property that closes it: a proposal is refused
// if and only if it would LOWER some counter. Raising and leaving alone both
// stay available, because a counter that is too low is the condition these
// scripts exist to repair — L-38's direction is to refuse the rewind, not to
// remove the repair.
//
// The pure-function shape is deliberate: `bun test src` globs `src/` only,
// so a rule written inline in `scripts/` could not be tested at all. See the
// module header.

/** Production's live counters on 2026-09-04 — 20/3/2, with 7 journal events. */
const LIVE: FiscalCounterFields = {
  lastReceiptNumber: 20,
  lastShiftNumber: 3,
  lastZReportNumber: 2,
  lastFiscalEventSequence: 7,
};

describe("counterRegressions — the floor under FiscalCounter", () => {
  it("refuses a repair that would lower the receipt number", () => {
    const regressions = counterRegressions(LIVE, { lastReceiptNumber: 19 });
    expect(regressions).toEqual([
      { field: "lastReceiptNumber", current: 20, proposed: 19 },
    ]);
  });

  it("refuses each of the four counters independently", () => {
    // Every field must be guarded, not just the first one checked.
    for (const field of FISCAL_COUNTER_FIELDS) {
      const regressions = counterRegressions(LIVE, { [field]: LIVE[field] - 1 });
      expect(regressions.map((r) => r.field)).toEqual([field]);
    }
  });

  it("refuses the exact L-38 scenario: tables emptied, counters synced to zero", () => {
    // This is what the pre-batch script did after a wipe — `max()` of an
    // empty table is 0, and all three were written straight in.
    const regressions = counterRegressions(LIVE, {
      lastReceiptNumber: 0,
      lastShiftNumber: 0,
      lastZReportNumber: 0,
    });
    expect(regressions.map((r) => r.field)).toEqual([
      "lastReceiptNumber",
      "lastShiftNumber",
      "lastZReportNumber",
    ]);
    expect(regressions.every((r) => r.proposed < r.current)).toBe(true);
  });

  it("allows a repair that raises a counter — the case the scripts exist for", () => {
    // A counter behind its tables: 24 sealed orders, counter says 20. This
    // must go through, or the guard has removed the repair capability.
    expect(counterRegressions(LIVE, { lastReceiptNumber: 24 })).toEqual([]);
  });

  it("allows raising every counter at once", () => {
    expect(
      counterRegressions(LIVE, {
        lastReceiptNumber: 21,
        lastShiftNumber: 4,
        lastZReportNumber: 3,
        lastFiscalEventSequence: 8,
      }),
    ).toEqual([]);
  });

  it("allows a no-op — equal is not lower", () => {
    expect(counterRegressions(LIVE, { ...LIVE })).toEqual([]);
  });

  it("refuses a mixed proposal on the strength of its one bad field", () => {
    // The dangerous shape: two counters legitimately behind, one ahead. The
    // write is atomic, so one regression has to stop the whole repair.
    const regressions = counterRegressions(LIVE, {
      lastReceiptNumber: 25,
      lastShiftNumber: 4,
      lastZReportNumber: 1,
    });
    expect(regressions.map((r) => r.field)).toEqual(["lastZReportNumber"]);
  });

  it("ignores a field the caller does not propose", () => {
    // `fix-fiscal-counter.ts` writes three of the four fields. An omitted
    // field is left alone, which cannot lower it — it must not be compared
    // against `undefined` and counted as a regression.
    expect(counterRegressions(LIVE, {})).toEqual([]);
    expect(counterRegressions(LIVE, { lastReceiptNumber: 20 })).toEqual([]);
  });

  it("guards lastFiscalEventSequence, which L-38 does not name", () => {
    // Both scripts omit this field when CREATING the singleton, so Prisma's
    // @default(0) applies. On a database that lost its counter row but kept
    // its FiscalEvent rows, that rewinds the journal sequence to 0 and the
    // next event reuses a sequence number already inside the hash chain.
    // Same defect as the three named counters, on the create path.
    expect(counterRegressions(LIVE, { lastFiscalEventSequence: 0 })).toEqual([
      { field: "lastFiscalEventSequence", current: 7, proposed: 0 },
    ]);
  });

  it("treats a fresh database honestly — 0 to 0 is not a regression", () => {
    const fresh: FiscalCounterFields = {
      lastReceiptNumber: 0,
      lastShiftNumber: 0,
      lastZReportNumber: 0,
      lastFiscalEventSequence: 0,
    };
    // This is `init-fiscal-counter.ts` on the database it is written for.
    expect(counterRegressions(fresh, fresh)).toEqual([]);
  });
});

describe("describeCounterRegressions — what the operator reads", () => {
  it("names every offending field with both numbers", () => {
    const message = describeCounterRegressions(
      counterRegressions(LIVE, { lastReceiptNumber: 0, lastZReportNumber: 1 }),
    );
    expect(message).toContain("REFUS");
    expect(message).toContain("lastReceiptNumber");
    expect(message).toContain("20 -> 0");
    expect(message).toContain("lastZReportNumber");
    expect(message).toContain("2 -> 1");
  });

  it("points at the data loss rather than at the counter", () => {
    // The refusal has to tell the operator what the condition means. A
    // counter above its tables is the signature of destroyed rows, and
    // aligning the counter down would hide that.
    const regressions = counterRegressions(LIVE, { lastReceiptNumber: 0 });
    const message = describeCounterRegressions(regressions);
    expect(message).toContain("détruites");
    expect(message).toContain("decrypt-backup.ts");
    // Asserted because the guidance text alone is NOT enough: it is present
    // whether or not any field is, so this test passed against a
    // deliberately disabled floor until it also pinned the field line.
    expect(regressions).toHaveLength(1);
    expect(message).toContain("numéro de ticket (lastReceiptNumber) : 20 -> 0");
  });

  it("refuses to compose a refusal out of nothing", () => {
    // Guards the vacuous-pass hole above at its source.
    expect(() => describeCounterRegressions([])).toThrow(/must name what it refuses/);
  });
});
