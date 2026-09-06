import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { openedOnEarlierLocalDay } from "@/lib/period";

// L-54 (Batch 3.7) — the operator is told when the open till has crossed a
// calendar day. The Z seals a shift; whether that is accepted as the « clôture
// journalière » is unsettled (research question 5), and the software's part
// under « prévoir » is to provide the close and say whose job it is.
//
// **The last case is a SOURCE assertion**: it proves the shifts screen calls
// the helper for the open till, and nothing more — L-47 blocks driving the
// authenticated screen in the in-app pane (Batches 5.4, 5.7d, 3.7/L-53).

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min);

describe("openedOnEarlierLocalDay (L-54)", () => {
  it("is false while the till is on the day it was opened", () => {
    expect(openedOnEarlierLocalDay(at(2026, 9, 6, 9, 0), at(2026, 9, 6, 23, 59))).toBe(false);
  });

  it("is true the moment local midnight has passed — the service that runs past midnight", () => {
    expect(openedOnEarlierLocalDay(at(2026, 9, 6, 23, 50), at(2026, 9, 7, 0, 10))).toBe(true);
  });

  it("is true for a till left open across whole days — production's shift 3 shape", () => {
    // Shift 3 on the production database was opened 2026-08-28 and still held
    // orders on 09-01 when measured read-only on 2026-09-06.
    expect(openedOnEarlierLocalDay(at(2026, 8, 28, 18, 0), at(2026, 9, 1, 12, 0))).toBe(true);
  });

  it("is decided on LOCAL days, not on 24-hour spans", () => {
    // Twenty hours, same day: no. Two hours, across midnight: yes.
    expect(openedOnEarlierLocalDay(at(2026, 9, 6, 1, 0), at(2026, 9, 6, 21, 0))).toBe(false);
    expect(openedOnEarlierLocalDay(at(2026, 9, 6, 23, 0), at(2026, 9, 7, 1, 0))).toBe(true);
  });

  it("does not warn about the future when the clock has been moved back", () => {
    expect(openedOnEarlierLocalDay(at(2026, 9, 7, 1, 0), at(2026, 9, 6, 23, 0))).toBe(false);
  });

  it("is wired into the open-till panel of the shifts screen (source assertion)", () => {
    const src = readFileSync(path.join(process.cwd(), "src/features/shifts/shifts-view.tsx"), "utf8");
    expect(src).toContain("openedOnEarlierLocalDay(new Date(shift.openedAt), now)");
    expect(src).toContain("journée d&apos;exploitation");
    expect(src).toContain('data-testid="till-crossed-midnight"');
  });
});
