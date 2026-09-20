import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  staleShiftDay,
  sealedDayRefusal,
  staleShiftRefusal,
  unsealedDayRefusal,
} from "@/lib/services/trading-day-guard";

// L-99 / L-228 — THE RULES THE TILL NOW ENFORCES ABOUT THE TRADING DAY.
//
// WHAT PUT THEM HERE: on 2026-09-19 the France caisse was found OPEN FOR ABOUT
// 48 HOURS. Its Z would have covered two trading days (L-99, measured), and —
// the half nobody had noticed — no day could be sealed at all meanwhile,
// because `assertNoOpenShift` refuses every close while a caisse is open.
//
// This file covers the PURE half and the wiring. The database half —
// a sale refused into a sealed day, a caisse refused while yesterday is
// unsealed — is `trading-day-guard-routes.test.ts`, because a rule test proves
// the rule and not that anything calls it, which this project has shipped three
// times.

describe("L-99 — a caisse whose trading day has ended", () => {
  const cutoff = 0; // the France till's setting from 2026-09-20

  it("IS STALE the day after it was opened, AND NAMES THAT DAY — the 48-hour case", () => {
    // The day, not a boolean: the refusal has to name it, and a route that
    // computed it for itself is a route that can drift from this module.
    expect(staleShiftDay(new Date(2026, 8, 17, 11, 0), new Date(2026, 8, 19, 11, 0), cutoff)).toBe(
      "2026-09-17",
    );
  });

  it("is NOT stale during its own day, however long it runs", () => {
    // Opened before lunch, still selling at 23:30. One trading day.
    expect(staleShiftDay(new Date(2026, 8, 21, 11, 0), new Date(2026, 8, 21, 23, 30), cutoff)).toBeNull();
  });

  it("KEEPS A LATE SERVICE WHOLE when the cut-off allows one", () => {
    // The reason the hour is a setting. With a 2 a.m. cut-off a service from
    // 22:00 to 01:00 is one day; with midnight it is two, and the till would
    // refuse the 00:20 order mid-service. Both are pinned so that changing the
    // setting cannot quietly change what this rule means.
    const opened = new Date(2026, 8, 21, 22, 0);
    const oneTwenty = new Date(2026, 8, 22, 1, 20);
    expect(staleShiftDay(opened, oneTwenty, 2), "a 2 a.m. cut-off should hold the night together").toBeNull();
    expect(staleShiftDay(opened, oneTwenty, 0), "midnight should end the day at midnight").toBe("2026-09-21");
  });

  it("DOES NOT REFUSE WHEN THE CLOCK HAS MOVED BACKWARDS", () => {
    // A DST correction or a corrected system clock must never lock an operator
    // out of their own till. Same choice `openedOnEarlierBusinessDay` makes.
    expect(staleShiftDay(new Date(2026, 8, 21, 11, 0), new Date(2026, 8, 20, 11, 0), cutoff)).toBeNull();
  });
});

describe("L-228 — what the refusals say", () => {
  // They are read by a cashier with a queue waiting. Each one names the day it
  // is about and what to do next; none of them says « erreur ».

  it("the sealed-day refusal names the day and points forward", () => {
    const m = sealedDayRefusal("2026-09-21");
    expect(m).toContain("2026-09-21");
    expect(m).toContain("scellée");
    expect(m, "does not tell the cashier what to do instead").toContain("journée suivante");
  });

  it("the stale-caisse refusal names the caisse AND the day it belongs to", () => {
    // The number, because that is what the shifts screen shows and what the
    // close button is next to.
    const m = staleShiftRefusal(7, "2026-09-19");
    expect(m).toContain("n° 7");
    expect(m).toContain("2026-09-19");
    expect(m, "does not name the action").toContain("rapport Z");
  });

  it("the unsealed-day refusal names the day to seal", () => {
    const m = unsealedDayRefusal("2026-09-19");
    expect(m).toContain("2026-09-19");
    expect(m).toContain("clôture du jour");
  });
});

describe("L-228 — one module, and every caller asks it", () => {
  // The group that would catch the drift. L-214's lesson: two sides writing the
  // same rule in their own words is how the delivery rule broke, and a rule
  // inside a route handler is a rule no test can call. Asserted against the
  // code with comments stripped — an assertion must never be satisfied by the
  // prose written to explain it (L-213, L-214, and L-221's two failed reverts).
  const code = (rel: string) =>
    readFileSync(path.join(process.cwd(), "src", ...rel.split("/")), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("THE ORDERS ROUTE asks about the sealed day and the stale caisse", () => {
    const route = code("app/api/orders/route.ts");
    expect(route, "the orders route does not import the shared rule").toContain("trading-day-guard");
    expect(route, "nothing refuses a sale into a sealed day").toContain("sealedDayForNow(");
    expect(route, "nothing refuses a sale through a caisse whose day has ended").toContain("staleShiftDay(");
  });

  it("THE OPEN-CAISSE ROUTE asks about an unsealed day", () => {
    const route = code("app/api/shifts/route.ts");
    expect(route, "the open-caisse route does not import the shared rule").toContain("trading-day-guard");
    expect(route).toContain("earliestUnsealedDayWithActivity(");
  });

  it("NEITHER ROUTE SPELLS THE RULE OUT FOR ITSELF", () => {
    // If a route grows its own `businessDayOf(...) !== businessDayOf(...)` the
    // two can disagree and only one of them has tests.
    for (const rel of ["app/api/orders/route.ts", "app/api/shifts/route.ts"]) {
      const src = code(rel);
      expect(src, `${rel} compares trading days itself`).not.toContain("businessDayOf(shift.openedAt");
      expect(src, `${rel} queries DailyClose itself`).not.toContain("dailyClose.findUnique");
    }
  });

  it("THE OVERRIDE IS SUPER_ADMIN ONLY, AND IT IS JOURNALLED", () => {
    // The operator's two conditions, 2026-09-20, and the whole of the escape's
    // safety. Asserted at the route, because a constant nobody reads is not a
    // rule.
    const route = code("app/api/shifts/route.ts");
    expect(route, "the force is not gated on SUPER_ADMIN").toContain("SUPER_ADMIN");
    expect(route, "forcing an open writes no fiscal event").toContain("FORCE_OPEN_EVENT");
  });

  it("THE OVERRIDE DOES NOT REACH THE SEALED-DAY RULE", () => {
    // A protects a document that is already sealed. Nothing operational is
    // worth writing a sale into one, so the force must not appear anywhere near
    // it — if today is sealed the answer is the next day, not a force.
    const guard = code("lib/services/trading-day-guard.ts");
    // BOTH ANCHORS ARE CHECKED BEFORE THE SLICE. The first version ended at
    // `shiftIsStale`, that function was renamed to `staleShiftDay`, indexOf
    // answered -1, and `slice(i, -1)` quietly widened to the whole file --
    // which of course contains FORCE, so the test failed for a reason that had
    // nothing to do with what it asserts. A slice between two names must prove
    // it found them.
    const from = guard.indexOf("sealedDayForNow");
    const to = guard.indexOf("staleShiftDay");
    expect(from, "sealedDayForNow is gone -- this assertion no longer knows what it reads").toBeGreaterThan(-1);
    expect(to, "staleShiftDay is gone -- this assertion no longer knows what it reads").toBeGreaterThan(from);
    expect(guard.slice(from, to), "the sealed-day rule knows about the override").not.toContain("FORCE");
  });
});
