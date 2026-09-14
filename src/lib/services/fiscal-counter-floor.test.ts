import { describe, it, expect } from "vitest";
import {
  CREATE_AT_ZERO_REFUSAL,
  FISCAL_COUNTER_FIELDS,
  counterRegressions,
  describeCounterRegressions,
  mayCreateCounterAtZero,
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
    // CORRECTED 2026-09-14 (R9.7 / L-126). This line used to read « This is
    // `init-fiscal-counter.ts` on the database it is written for », and it was
    // not: **that script never called `counterRegressions`.** It implemented
    // its own inline `populated > 0` refusal, so deleting that block left the
    // whole suite green while the script re-created the counter at 0/0/0/0 on
    // a database still holding sealed orders — L-38's exact outcome, the next
    // genuine sale printing a receipt number that already exists.
    //
    // What this asserts is the UPDATE path on equal values. The CREATE path is
    // `mayCreateCounterAtZero`, tested in its own describe below.
    expect(counterRegressions(fresh, fresh)).toEqual([]);
  });
});

// ── L-126 (R9.7) — MAY THE COUNTER BE CREATED AT ZERO? ───────────────────────
//
// `bun test src` globs `src/` only, so nothing under `scripts/` is reachable —
// the rule was untested because of where it lived, not because anyone decided
// it did not need testing. It moved here; the script kept the I/O and the exit
// code. **This is the pattern for testing any operator script.**
describe("mayCreateCounterAtZero — the create path's floor", () => {
  const empty = { orders: 0, shifts: 0, zReports: 0, events: 0 };

  it("allows a create on a genuinely empty database", () => {
    expect(mayCreateCounterAtZero(empty)).toBe(true);
  });

  it("REFUSES when ANY fiscal table holds a row", () => {
    // Each on its own, because a check that summed only some of them would
    // pass a test that moved them all together. `events` in particular: a
    // journal with entries and no orders is what a drawer-open leaves.
    for (const field of ["orders", "shifts", "zReports", "events"] as const) {
      const counts = { ...empty, [field]: 1 };
      expect({ field, may: mayCreateCounterAtZero(counts) }).toEqual({ field, may: false });
    }
  });

  it("REFUSES on the production shape this exists to protect", () => {
    // L-38's database: sealed orders, a Z, and a journal.
    expect(mayCreateCounterAtZero({ orders: 20, shifts: 3, zReports: 2, events: 47 })).toBe(false);
  });

  it("says WHY, and points at the repair script rather than stopping dead", () => {
    // A refusal that leaves the operator with no next step is how someone ends
    // up deleting the row by hand.
    expect(CREATE_AT_ZERO_REFUSAL).toContain("REFUS");
    expect(CREATE_AT_ZERO_REFUSAL).toContain("numéro en\n  double");
    expect(CREATE_AT_ZERO_REFUSAL).toContain("fix-fiscal-counter.ts");
  });

  it("is what the SCRIPT calls — otherwise this describe tests nothing", async () => {
    // The failure mode this whole finding is: a rule in one place and the
    // decision in another. Read as source because `bun test src` cannot import
    // from `scripts/`, which is the constraint that created the problem.
    const { readFileSync } = await import("fs");
    const path = await import("path");
    const script = readFileSync(
      path.join(process.cwd(), "scripts/init-fiscal-counter.ts"),
      "utf8",
    );
    // THE CALL, not the import. `includes("mayCreateCounterAtZero")` is
    // satisfied by the `import { … }` line, so deleting the script's USE of the
    // rule left this green — measured, the revert survived it. That is the same
    // shape as the finding itself: a rule that exists and is not consulted.
    expect(script, "the rule is imported and never called").toContain(
      "mayCreateCounterAtZero({",
    );
    expect(script).toContain("console.error(CREATE_AT_ZERO_REFUSAL)");
    // …and no longer carries its own copy of the rule.
    expect(script, "the inline refusal is back").not.toContain("populated > 0");
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
