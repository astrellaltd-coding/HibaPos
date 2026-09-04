import { describe, it, expect } from "vitest";
import {
  hasTraded,
  NOT_FRESH_REFUSAL,
  refuseUserSelfEdit,
  SELF_ACTIVE_REFUSAL,
  SELF_DEACTIVATE_REFUSAL,
  SELF_PIN_REFUSAL,
  type TradingFingerprint,
} from "@/lib/services/account-policy";

// Batch 4.3 — M-23 and the freshness half of C-18.

describe("M-23 — a caller may not rewrite their own credentials", () => {
  const cashier = { callerId: "u-cashier", callerRole: "CASHIER", targetId: "u-cashier" };

  it("refuses a cashier changing their own PIN", () => {
    // The finding, exactly: no current PIN was ever asked for, so anyone at an
    // unlocked till could set a new one and lock the cashier out of their own
    // account.
    expect(
      refuseUserSelfEdit({ ...cashier, pin: "999999", active: undefined }),
    ).toEqual({ error: SELF_PIN_REFUSAL, status: 403 });
  });

  it("refuses a cashier changing their own active flag", () => {
    expect(
      refuseUserSelfEdit({ ...cashier, pin: undefined, active: true }),
    ).toEqual({ error: SELF_ACTIVE_REFUSAL, status: 403 });
  });

  it("lets a cashier still edit their own name", () => {
    // The refusal must be about credentials, not about self-edit in general —
    // the route's other self-editable field keeps working.
    expect(
      refuseUserSelfEdit({ ...cashier, pin: undefined, active: undefined }),
    ).toBeNull();
  });

  it("refuses a manager the same way", () => {
    // MANAGER is not SUPER_ADMIN, so the same rule applies — a manager cannot
    // quietly re-PIN their own account either.
    expect(
      refuseUserSelfEdit({
        callerId: "u-mgr",
        callerRole: "MANAGER",
        targetId: "u-mgr",
        pin: "123456",
        active: undefined,
      }),
    ).toEqual({ error: SELF_PIN_REFUSAL, status: 403 });
  });

  it("leaves administration of OTHER accounts untouched", () => {
    // This is the path the Utilisateurs view uses. It must not change, or the
    // only PIN-reset mechanism in the product breaks.
    expect(
      refuseUserSelfEdit({
        callerId: "u-admin",
        callerRole: "SUPER_ADMIN",
        targetId: "u-cashier",
        pin: "424242",
        active: false,
      }),
    ).toBeNull();
    // …including a manager resetting nothing of their own but editing a peer,
    // which the route's own 403 governs, not this rule.
    expect(
      refuseUserSelfEdit({
        callerId: "u-mgr",
        callerRole: "MANAGER",
        targetId: "u-other",
        pin: "424242",
        active: undefined,
      }),
    ).toBeNull();
  });

  it("lets a super administrator reset their own PIN", () => {
    // Deliberate: a SUPER_ADMIN on this route is administering, and the
    // operator's 2026-09-04 decision keeps PIN management where it is —
    // the Utilisateurs view, which lists the administrator's own row.
    expect(
      refuseUserSelfEdit({
        callerId: "u-admin",
        callerRole: "SUPER_ADMIN",
        targetId: "u-admin",
        pin: "424242",
        active: undefined,
      }),
    ).toBeNull();
  });

  it("refuses self-deactivation for everyone, super administrator included", () => {
    for (const role of ["CASHIER", "MANAGER", "SUPER_ADMIN"]) {
      const refusal = refuseUserSelfEdit({
        callerId: "u-self",
        callerRole: role,
        targetId: "u-self",
        pin: undefined,
        active: false,
      });
      expect(refusal).not.toBeNull();
      // A cashier trips the broader credential rule first (403); a super
      // administrator reaches the deactivation rule itself (400). Either way
      // the account stays on.
      if (role === "SUPER_ADMIN") {
        expect(refusal).toEqual({ error: SELF_DEACTIVATE_REFUSAL, status: 400 });
      } else {
        expect(refusal).toEqual({ error: SELF_ACTIVE_REFUSAL, status: 403 });
      }
    }
  });
});

describe("C-18 — the bootstrap belongs to a fresh install only", () => {
  const zeroCounter = {
    lastReceiptNumber: 0,
    lastShiftNumber: 0,
    lastZReportNumber: 0,
    lastFiscalEventSequence: 0,
  };
  const fresh: TradingFingerprint = {
    counter: zeroCounter,
    orderCount: 0,
    eventCount: 0,
  };

  it("allows a genuinely fresh install", () => {
    expect(hasTraded(fresh)).toBe(false);
    // …and one that has not even created its counter row yet.
    expect(hasTraded({ ...fresh, counter: null })).toBe(false);
  });

  it("refuses once the database has orders", () => {
    expect(hasTraded({ ...fresh, orderCount: 1 })).toBe(true);
  });

  it("refuses once the journal has entries", () => {
    expect(hasTraded({ ...fresh, eventCount: 1 })).toBe(true);
  });

  it("refuses on any advanced counter, even with the tables emptied", () => {
    // This is the C-17 scenario the guard exists for: a script has run
    // `deleteMany({})` over users and orders, so counts read zero — but the
    // fiscal counters do not rewind, and they are what gives the wipe away.
    for (const field of [
      "lastReceiptNumber",
      "lastShiftNumber",
      "lastZReportNumber",
      "lastFiscalEventSequence",
    ] as const) {
      expect(
        hasTraded({ ...fresh, counter: { ...zeroCounter, [field]: 1 } }),
      ).toBe(true);
    }
  });

  it("states the refusal in French", () => {
    expect(NOT_FRESH_REFUSAL).toContain("Base non vierge");
  });
});

describe("DD-06 — the server binds the loopback address only", () => {
  it("pins the bind flag in the production start script", async () => {
    // The operator's decision of 2026-09-04: the POS runs on the all-in-one
    // till and nothing else. Without `-H`, `next start` binds 0.0.0.0 and the
    // whole API — including the public profile list and the login route —
    // answers on the restaurant Wi-Fi.
    //
    // C-18's evidence cites a `start.ps1` for the missing flag; that file does
    // not exist, so `package.json` is where the decision has to live, and this
    // asserts nobody drops it while editing a neighbouring script.
    const pkg = (await import("../../../package.json")) as unknown as {
      default: { scripts: Record<string, string> };
    };
    expect(pkg.default.scripts.start).toContain("-H 127.0.0.1");
  });
});
