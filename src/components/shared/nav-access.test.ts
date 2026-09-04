import { describe, it, expect } from "vitest";
import {
  LEAST_PRIVILEGED_ROLE,
  NAV_ITEMS,
  canAccessView,
} from "@/components/shared/nav-config";
import type { AppView } from "@/store/app-store";

// C-16, Batch 4.4 — role gating was client-side only, and only in one place.
//
// `app-shell.tsx` rendered every view on `view ===` with no role condition,
// and `initHashSync` accepted any of the valid hashes from the URL. Role
// filtering existed solely in the home dashboard's module list, and even that
// defaulted an unknown role to MANAGER — failing open. So typing `#/backups`
// mounted the backups view with its live buttons, database restore included.
//
// The server side held on every sensitive mutation, which is why the audit
// scored this as exposure rather than compromise. It is still the difference
// between a locked door and a sign asking politely, and after DD-07 the
// account standing at the till all day is a MANAGER.

const ALL_VIEWS = NAV_ITEMS.map((n) => n.view);

describe("C-16 — canAccessView is the single gate", () => {
  it("lets the home screen through for anyone", () => {
    // The landing page filters its own cards; blocking it would strand a user
    // with nowhere to go.
    expect(canAccessView("CASHIER", "home")).toBe(true);
    expect(canAccessView(undefined, "home")).toBe(true);
  });

  it("refuses a view that is not in the nav table at all", () => {
    // An unknown hash must not fall through to "allowed".
    expect(canAccessView("SUPER_ADMIN", "nonsense" as AppView)).toBe(false);
  });

  it("fails closed when the role is unknown or not yet loaded", () => {
    // The fail-open default is the specific defect: `?? "MANAGER"`.
    for (const view of ALL_VIEWS) {
      expect(canAccessView(undefined, view)).toBe(
        canAccessView(LEAST_PRIVILEGED_ROLE, view),
      );
      expect(canAccessView(null, view)).toBe(
        canAccessView(LEAST_PRIVILEGED_ROLE, view),
      );
    }
    // And that default is genuinely the least privileged: it can open strictly
    // fewer views than a manager.
    const asDefault = ALL_VIEWS.filter((v) => canAccessView(undefined, v));
    const asManager = ALL_VIEWS.filter((v) => canAccessView("MANAGER", v));
    expect(asDefault.length).toBeLessThan(asManager.length);
  });

  it("keeps the restore button away from the manager account", () => {
    // DD-07: `backups` was deliberately NOT opened to MANAGER, because that
    // view holds the restore button and the manager account is whoever is
    // standing at the till.
    expect(canAccessView("MANAGER", "backups")).toBe(false);
    expect(canAccessView("CASHIER", "backups")).toBe(false);
    expect(canAccessView("SUPER_ADMIN", "backups")).toBe(true);
  });

  it("keeps users and technical logs to the super administrator", () => {
    for (const view of ["users", "logs"] as AppView[]) {
      expect(canAccessView("MANAGER", view)).toBe(false);
      expect(canAccessView("SUPER_ADMIN", view)).toBe(true);
    }
  });

  it("gives the manager settings and the audit journal (DD-07)", () => {
    // Réglages carries the printer configuration and the SIRET / TVA number;
    // the audit journal is read-only. Both were opened deliberately.
    for (const view of ["settings", "audit"] as AppView[]) {
      expect(canAccessView("MANAGER", view)).toBe(true);
      expect(canAccessView("CASHIER", view)).toBe(false);
    }
  });

  it("leaves the fiscal surface with the manager", () => {
    // Batch 3.4's screen: chain verification, sealed closes, archives and the
    // journal. Nothing in this batch may take it away.
    expect(canAccessView("MANAGER", "fiscal")).toBe(true);
    expect(canAccessView("MANAGER", "reports")).toBe(true);
  });

  it("agrees with the nav table for every role and view", () => {
    // The gate must be the table, not a second opinion about it.
    for (const item of NAV_ITEMS) {
      for (const role of ["SUPER_ADMIN", "MANAGER", "CASHIER"] as const) {
        expect(canAccessView(role, item.view)).toBe(item.roles.includes(role));
      }
    }
  });
});
