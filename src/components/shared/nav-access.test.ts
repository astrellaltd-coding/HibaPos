import { describe, it, expect } from "vitest";
import {
  LEAST_PRIVILEGED_ROLE,
  NAV_ITEMS,
  canAccessView,
} from "@/components/shared/nav-config";
import { hashToView } from "@/store/app-store";
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

// C-21, Batch 5.2 — the table feature is withdrawn (DD-09).
//
// WHY THIS BLOCK EXISTS AT ALL, stated plainly because it is the trap this
// batch was handed. Both loops above are driven by `NAV_ITEMS`: `ALL_VIEWS` is
// built from it at the top of this file, and the last test walks it directly.
// So deleting a row does not fail anything here — it silently removes one view
// from everything this file checks, and the suite still reports green. The
// coverage that C-16 bought would have shrunk by one view with nobody
// noticing. These assertions are what is put back in its place: the row is
// gone, and that is now a claim under test rather than an absence.
describe("C-21 — the table feature is withdrawn (DD-09, Batch 5.2)", () => {
  it("has no nav row, so the gate refuses the view for every role", () => {
    // `canAccessView` refuses a view with no row (`if (!item) return false`),
    // which is what makes deleting the row sufficient rather than merely
    // cosmetic. The cast is the same one the "nonsense" test above uses, and
    // it says the right thing: after this batch, `tables` IS an unknown view.
    expect(NAV_ITEMS.find((n) => n.view === ("tables" as AppView))).toBeUndefined();
    for (const role of ROLES) {
      expect(canAccessView(role, "tables" as AppView)).toBe(false);
    }
    // And the fail-closed default cannot reach it either.
    expect(canAccessView(undefined, "tables" as AppView)).toBe(false);
    expect(canAccessView(null, "tables" as AppView)).toBe(false);
    expect(canAccessView(LEAST_PRIVILEGED_ROLE, "tables" as AppView)).toBe(false);
  });

  it("does not resolve #/tables to a view at all", () => {
    // The second half of the withdrawal, and the reason `tables` left the
    // `AppView` union rather than just the nav table. Left in the union, the
    // hash would still resolve and the shell would answer «Accès refusé» —
    // which claims the address is GATED. It is not gated; the screen is gone.
    // `#/tables` is now an unrecognised hash like any other, so the view does
    // not change.
    expect(hashToView("#/tables")).toBeNull();
    expect(hashToView("#/nonsense")).toBeNull();
    // The neighbours it was removed from between are untouched.
    expect(hashToView("#/orders")).toBe("orders");
    expect(hashToView("#/shifts")).toBe("shifts");
    expect(hashToView("#/")).toBe("home");
  });

  it("took exactly one row with it", () => {
    // The other half of the shrink: a removal that took a neighbour would also
    // pass every assertion above. This is what makes those meaningful, and it
    // is why the whole surviving table is pinned rather than a sample of it.
    expect(ALL_VIEWS).toEqual([
      "pos", "dashboard", "orders", "shifts",
      "categories", "products", "addons", "media", "customers",
      "reports", "fiscal", "users", "settings",
      "audit", "backups", "logs",
    ]);
  });
});
