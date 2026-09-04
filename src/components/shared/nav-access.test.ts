import { describe, it, expect } from "vitest";
import {
  LEAST_PRIVILEGED_ROLE,
  NAV_ITEMS,
  canAccessView,
} from "@/components/shared/nav-config";
import type { AppView } from "@/store/app-store";
import type { Role } from "@/types/api";

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

// DD-07 / Batch 4.4b: the product's whole role model. `CASHIER` was removed
// here — the owner asked for a single operational role — which is why
// LEAST_PRIVILEGED_ROLE is now MANAGER. Adding a role means adding it here,
// and both loops below will hold it to the nav table.
const ROLES: Role[] = ["SUPER_ADMIN", "MANAGER"];

describe("C-16 — canAccessView is the single gate", () => {
  it("lets the home screen through for anyone", () => {
    // The landing page filters its own cards; blocking it would strand a user
    // with nowhere to go.
    expect(canAccessView("MANAGER", "home")).toBe(true);
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
    // And that default is genuinely the least privileged.
    //
    // Batch 4.4b degraded the floor by exactly one rung: DD-07 removed
    // `CASHIER`, so `LEAST_PRIVILEGED_ROLE` is now `MANAGER` and the old form
    // of this assertion — "strictly fewer views than a manager" — cannot hold
    // by construction. It is revisited, not deleted: what it was protecting is
    // that the fail-closed default is a FLOOR, so assert the floor property
    // directly. Every role must open at least what the default opens, and at
    // least one role must open more. Both halves matter: the first is the
    // floor, the second stops the floor quietly becoming the ceiling.
    const asDefault = ALL_VIEWS.filter((v) => canAccessView(undefined, v));
    for (const role of ROLES) {
      const asRole = ALL_VIEWS.filter((v) => canAccessView(role, v));
      for (const view of asDefault) {
        expect(asRole, `${role} must open at least the default's views`).toContain(view);
      }
    }
    const asSuperAdmin = ALL_VIEWS.filter((v) => canAccessView("SUPER_ADMIN", v));
    expect(asDefault.length).toBeLessThan(asSuperAdmin.length);
  });

  it("keeps the restore button away from the manager account", () => {
    // DD-07: `backups` was deliberately NOT opened to MANAGER, because that
    // view holds the restore button and the manager account is whoever is
    // standing at the till.
    expect(canAccessView("MANAGER", "backups")).toBe(false);
    expect(canAccessView("SUPER_ADMIN", "backups")).toBe(true);
    // …and the fail-closed default cannot reach it either. After Batch 4.4b
    // that default IS the manager, so this is the same fact twice — pinned
    // anyway, because it is the one that must survive a change to the floor.
    expect(canAccessView(LEAST_PRIVILEGED_ROLE, "backups")).toBe(false);
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
      expect(canAccessView("SUPER_ADMIN", view)).toBe(true);
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
      for (const role of ROLES) {
        expect(canAccessView(role, item.view)).toBe(item.roles.includes(role));
      }
    }
  });
});
