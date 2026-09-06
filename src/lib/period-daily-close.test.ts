import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  businessDayOf,
  businessDayBounds,
  monthBounds,
  yearBounds,
  lastCompletedBusinessDay,
  lastCompletedMonth,
  lastCompletedYear,
  openedOnEarlierBusinessDay,
} from "@/lib/period";

// DD-23 / DD-24 (Batch 3.8) — the trading day.
//
// The operator chose a sealed day close on a clock that runs from a cut-off
// hour rather than from midnight, so a service ending at 01:30 stays in the day
// it started, and chose that the month and the exercice run on the same clock
// so no two sealed documents can disagree about the same tickets. This file
// pins that clock. Everything here is pure: no database, no settings, no dates
// read from the system, so a failure here is arithmetic and nothing else.
//
// L-54's own cases (Batch 3.7) survive at the bottom, moved onto the trading
// day. **The last case is a SOURCE assertion**, not behaviour: it proves the
// shifts screen calls the helper, and nothing more, because L-47 blocks driving
// the authenticated screen in the in-app pane (Batches 5.4, 5.7d, 3.7).

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const CUTOFF = 5;

describe("businessDayOf — what 'the day' means (DD-23)", () => {
  it("puts a ticket rung after the cut-off in the day that has started", () => {
    expect(businessDayOf(at(2026, 6, 12, 18, 30), CUTOFF)).toBe("2026-06-12");
    expect(businessDayOf(at(2026, 6, 12, 23, 59), CUTOFF)).toBe("2026-06-12");
  });

  it("puts a ticket rung BEFORE the cut-off in the previous day — the late service", () => {
    // The case the operator asked for: Friday service running to 01:30.
    expect(businessDayOf(at(2026, 6, 13, 1, 30), CUTOFF)).toBe("2026-06-12");
    expect(businessDayOf(at(2026, 6, 13, 4, 59), CUTOFF)).toBe("2026-06-12");
  });

  it("treats the cut-off hour itself as the start of the new day", () => {
    expect(businessDayOf(at(2026, 6, 13, 5, 0), CUTOFF)).toBe("2026-06-13");
  });

  it("with a cut-off of 0 is exactly the calendar day", () => {
    // The setting can be turned off, and when it is, nothing about the old
    // behaviour changes. This is the control for the whole file.
    expect(businessDayOf(at(2026, 6, 13, 1, 30), 0)).toBe("2026-06-13");
    expect(businessDayOf(at(2026, 6, 13, 0, 0), 0)).toBe("2026-06-13");
    expect(businessDayOf(at(2026, 6, 12, 23, 59), 0)).toBe("2026-06-12");
  });

  it("rolls back across a month and a year boundary", () => {
    expect(businessDayOf(at(2026, 7, 1, 1, 0), CUTOFF)).toBe("2026-06-30");
    expect(businessDayOf(at(2027, 1, 1, 2, 0), CUTOFF)).toBe("2026-12-31");
  });
});

describe("businessDayBounds — half-open, and it spans midnight", () => {
  it("runs cut-off to cut-off", () => {
    expect(businessDayBounds("2026-06-12", CUTOFF)).toEqual({
      from: at(2026, 6, 12, 5),
      to: at(2026, 6, 13, 5),
    });
  });

  it("runs into the next month without a special case", () => {
    expect(businessDayBounds("2026-06-30", CUTOFF)).toEqual({
      from: at(2026, 6, 30, 5),
      to: at(2026, 7, 1, 5),
    });
  });

  it("contains exactly the instants businessDayOf assigns to it", () => {
    const { from, to } = businessDayBounds("2026-06-12", CUTOFF);
    const inside = at(2026, 6, 13, 1, 30);
    expect(inside >= from && inside < to).toBe(true);
    expect(businessDayOf(inside, CUTOFF)).toBe("2026-06-12");
    const outside = at(2026, 6, 13, 5, 0);
    expect(outside >= to).toBe(true);
    expect(businessDayOf(outside, CUTOFF)).toBe("2026-06-13");
  });
});

describe("the month and the exercice run on the same clock (DD-24)", () => {
  it("June ends at the cut-off on 1 July, not at midnight", () => {
    expect(monthBounds(2026, 6, CUTOFF)).toEqual({ from: at(2026, 6, 1, 5), to: at(2026, 7, 1, 5) });
    expect(yearBounds(2026, CUTOFF)).toEqual({ from: at(2026, 1, 1, 5), to: at(2027, 1, 1, 5) });
  });

  it("THE WORKED EXAMPLE the operator was shown: 1 July 01:00 belongs to Friday 30 June AND to June", () => {
    const ticket = at(2026, 7, 1, 1, 0);
    expect(businessDayOf(ticket, CUTOFF)).toBe("2026-06-30");
    const june = monthBounds(2026, 6, CUTOFF);
    expect(ticket >= june.from && ticket < june.to).toBe(true);
    const july = monthBounds(2026, 7, CUTOFF);
    expect(ticket < july.from).toBe(true);
    // And the trading day it belongs to sits wholly inside June.
    const day = businessDayBounds("2026-06-30", CUTOFF);
    expect(day.from >= june.from && day.to <= june.to).toBe(true);
  });

  it("with a cut-off of 0 the month is the calendar month again", () => {
    expect(monthBounds(2026, 6, 0)).toEqual({ from: at(2026, 6, 1), to: at(2026, 7, 1) });
    expect(yearBounds(2026, 0)).toEqual({ from: at(2026, 1, 1), to: at(2027, 1, 1) });
  });
});

describe("what the close screen proposes", () => {
  it("offers the trading day that has actually finished", () => {
    // 03:00 on Saturday: Friday is STILL RUNNING, so Thursday is on offer.
    expect(lastCompletedBusinessDay(at(2026, 6, 13, 3, 0), CUTOFF)).toBe("2026-06-11");
    // 06:00 on Saturday: Friday has ended.
    expect(lastCompletedBusinessDay(at(2026, 6, 13, 6, 0), CUTOFF)).toBe("2026-06-12");
  });

  it("does not offer a month that has not ended (DD-24 rewrote this)", () => {
    // 03:00 on 1 July: June ends at 05:00, so it is not closeable yet.
    expect(lastCompletedMonth(at(2026, 7, 1, 3, 0), CUTOFF)).toEqual({ year: 2026, month: 5 });
    // 06:00 on 1 July: June has ended.
    expect(lastCompletedMonth(at(2026, 7, 1, 6, 0), CUTOFF)).toEqual({ year: 2026, month: 6 });
    // Mid-month is unremarkable.
    expect(lastCompletedMonth(at(2026, 6, 15, 12, 0), CUTOFF)).toEqual({ year: 2026, month: 5 });
  });

  it("rolls back over January and over the new year", () => {
    expect(lastCompletedMonth(at(2026, 1, 15), CUTOFF)).toEqual({ year: 2025, month: 12 });
    expect(lastCompletedYear(at(2027, 1, 1, 3, 0), CUTOFF)).toBe(2025);
    expect(lastCompletedYear(at(2027, 1, 1, 6, 0), CUTOFF)).toBe(2026);
  });
});

describe("openedOnEarlierBusinessDay (L-54, on the trading-day clock)", () => {
  it("does NOT warn about a normal late service — the whole point of the change", () => {
    // Opened Friday 18:00, still open Saturday 01:30. One trading day.
    expect(openedOnEarlierBusinessDay(at(2026, 6, 12, 18, 0), at(2026, 6, 13, 1, 30), CUTOFF)).toBe(false);
  });

  it("warns once a real trading day has been crossed", () => {
    // Still open at 06:00 on Saturday: Friday is over and was never closed.
    expect(openedOnEarlierBusinessDay(at(2026, 6, 12, 18, 0), at(2026, 6, 13, 6, 0), CUTOFF)).toBe(true);
  });

  it("warns for a till left open across whole days — production's shift 3 shape", () => {
    // Shift 3 on the production database was opened 2026-08-28 and still held
    // orders on 09-01 when measured read-only on 2026-09-06.
    expect(openedOnEarlierBusinessDay(at(2026, 8, 28, 18, 0), at(2026, 9, 1, 12, 0), CUTOFF)).toBe(true);
  });

  it("is quiet within the day it was opened", () => {
    expect(openedOnEarlierBusinessDay(at(2026, 6, 12, 9, 0), at(2026, 6, 12, 23, 0), CUTOFF)).toBe(false);
  });

  it("does not warn about the future when the clock has been moved back", () => {
    expect(openedOnEarlierBusinessDay(at(2026, 6, 13, 10, 0), at(2026, 6, 12, 23, 0), CUTOFF)).toBe(false);
  });

  it("with a cut-off of 0 behaves as the calendar-day version did", () => {
    expect(openedOnEarlierBusinessDay(at(2026, 6, 12, 23, 50), at(2026, 6, 13, 0, 10), 0)).toBe(true);
  });

  it("is wired into the open-till panel of the shifts screen (source assertion)", () => {
    const src = readFileSync(path.join(process.cwd(), "src/features/shifts/shifts-view.tsx"), "utf8");
    expect(src).toContain("openedOnEarlierBusinessDay(");
    expect(src).toContain("journée d&apos;exploitation");
    expect(src).toContain('data-testid="till-crossed-midnight"');
  });
});
