import { describe, it, expect } from "vitest";
import { parseReportRange, ReportRangeError, MAX_REPORT_RANGE_DAYS } from "@/lib/report-range";
import { monthBounds, businessDayBounds, businessDayOf } from "@/lib/period";

// L-92 (R8.4) — a report measures the same period the sealed close measured.
//
// THE DEFECT. `parseReportRange` built midnight-to-midnight bounds while every
// sealed fiscal document runs on the trading-day cut-off (DD-23 / DD-24). So
// the VAT figure a manager files could differ from the sealed close for the
// same month **in both directions, silently**. Audit pass 1 measured it with
// one 02:30 ticket: `MonthlyClose 2026-08` sealed `vatTotal 104`, while
// `GET /api/reports/vat?from=2026-08-01&to=2026-08-31` answered `totalVat 0`,
// `rows []`.
//
// `period.ts` had already learned this and wrote down why: **`cutoffHour` is a
// REQUIRED argument everywhere, deliberately, so the compiler finds every
// caller.** `report-range.ts` was a separate module the compiler never saw —
// which is the whole mechanism of the finding, and the reason the argument is
// required here too rather than defaulted.
//
// THE OPERATOR'S DECISION, 2026-09-13: **snap, and say so on screen.** These
// tests pin the snapping. The saying-so is `reports-view.tsx`, which reads the
// boundaries out of the response rather than re-deriving them.

const CUTOFF = 5; // DD-24, and the live setting

describe("L-92 — report bounds sit on the trading-day clock", () => {
  it("starts and ends at the cut-off, not at midnight", () => {
    const r = parseReportRange("2026-08-01", "2026-08-31", CUTOFF);
    expect(r.fromStart.getHours(), "the range still starts at midnight").toBe(CUTOFF);
    expect(r.toEnd.getHours(), "the range still ends at midnight").toBe(CUTOFF);
    expect(r.cutoffHour).toBe(CUTOFF);
  });

  it("asks for exactly the window MonthlyClose sealed", () => {
    // The assertion the finding is really about: the two must be the same
    // instants, not merely both « August ».
    const report = parseReportRange("2026-08-01", "2026-08-31", CUTOFF);
    const sealed = monthBounds(2026, 8, CUTOFF);
    expect(report.fromStart.getTime()).toBe(sealed.from.getTime());
    expect(report.toEnd.getTime()).toBe(sealed.to.getTime());
  });

  it("agrees with businessDayBounds for a single day", () => {
    const report = parseReportRange("2026-08-15", "2026-08-15", CUTOFF);
    const day = businessDayBounds("2026-08-15", CUTOFF);
    expect(report.fromStart.getTime()).toBe(day.from.getTime());
    expect(report.toEnd.getTime()).toBe(day.to.getTime());
  });

  it("excludes the 02:30 ticket that belongs to the previous trading day", () => {
    // The audit's own reproduction, as a boundary test. A ticket at 02:30 on
    // 1 August belongs to trading day 07-31, so it must be OUTSIDE an August
    // range — it was inside one before, which is how it got counted in the
    // August report and sealed into July's close.
    const ticket = new Date(2026, 7, 1, 2, 30);
    expect(businessDayOf(ticket, CUTOFF)).toBe("2026-07-31");

    const august = parseReportRange("2026-08-01", "2026-08-31", CUTOFF);
    expect(
      ticket.getTime() >= august.fromStart.getTime(),
      "a ticket sealed into July is still inside the August report",
    ).toBe(false);

    // …and it IS inside July's.
    const july = parseReportRange("2026-07-01", "2026-07-31", CUTOFF);
    expect(ticket.getTime() >= july.fromStart.getTime()).toBe(true);
    expect(ticket.getTime() < july.toEnd.getTime()).toBe(true);
  });

  it("includes the 02:30 ticket on the day AFTER the range's last day", () => {
    // The other end, and the half that is easy to forget: a ticket at 02:30 on
    // 1 September belongs to trading day 08-31 and must be INSIDE August.
    const ticket = new Date(2026, 8, 1, 2, 30);
    expect(businessDayOf(ticket, CUTOFF)).toBe("2026-08-31");

    const august = parseReportRange("2026-08-01", "2026-08-31", CUTOFF);
    expect(ticket.getTime() >= august.fromStart.getTime()).toBe(true);
    expect(
      ticket.getTime() < august.toEnd.getTime(),
      "a ticket sealed into August falls outside the August report",
    ).toBe(true);
  });

  it("behaves as calendar days when the cut-off is 0", () => {
    // `0` means calendar days and is a supported setting, not a disabled
    // feature (`validation.ts`). So the old behaviour is still reachable, by
    // saying so rather than by omission.
    const r = parseReportRange("2026-08-01", "2026-08-31", 0);
    expect(r.fromStart.getTime()).toBe(new Date(2026, 7, 1).getTime());
    expect(r.toEnd.getTime()).toBe(new Date(2026, 8, 1).getTime());
  });

  it("refuses a cut-off that is not an hour of the day", () => {
    // The argument is required so the compiler finds every caller; this is
    // what stops a caller satisfying the compiler with nonsense.
    for (const bad of [-1, 24, 5.5, NaN]) {
      expect(() => parseReportRange("2026-08-01", "2026-08-31", bad), `${bad}`).toThrow(
        ReportRangeError,
      );
    }
  });

  it("reports the cut-off it used, so a caller can say so", () => {
    // The screen states the boundaries the SERVER chose. Without this it would
    // have to re-derive them, which is a second implementation of the rule.
    expect(parseReportRange("2026-08-01", "2026-08-31", 5).cutoffHour).toBe(5);
    expect(parseReportRange("2026-08-01", "2026-08-31", 0).cutoffHour).toBe(0);
  });
});

describe("M-31's length bound still holds on the new clock", () => {
  // Moving both ends by the same offset must not change the LENGTH, or a range
  // that was legal yesterday is refused today for a reason nobody changed.
  const now = new Date(2026, 8, 10, 12, 0);

  it("still defaults to the last 7 days", () => {
    expect(parseReportRange(null, null, CUTOFF, now).days).toBe(7);
  });

  it("still refuses a range past the maximum", () => {
    expect(() => parseReportRange("2020-01-01", "2026-09-10", CUTOFF, now)).toThrow(ReportRangeError);
    try {
      parseReportRange("2020-01-01", "2026-09-10", CUTOFF, now);
    } catch (e) {
      expect((e as Error).message).toContain(String(MAX_REPORT_RANGE_DAYS));
    }
  });

  it("still accepts a full year", () => {
    expect(() => parseReportRange("2025-09-11", "2026-09-10", CUTOFF, now)).not.toThrow();
  });

  it("still refuses an inverted or malformed range", () => {
    expect(() => parseReportRange("2026-09-10", "2026-09-01", CUTOFF, now)).toThrow(ReportRangeError);
    expect(() => parseReportRange("not-a-date", "2026-09-01", CUTOFF, now)).toThrow(ReportRangeError);
  });

  it("counts the same number of days whatever the cut-off", () => {
    for (const hour of [0, 5, 12, 23]) {
      expect(parseReportRange("2026-08-01", "2026-08-31", hour).days, `cut-off ${hour}`).toBe(31);
    }
  });
});
