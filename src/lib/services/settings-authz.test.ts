import { describe, it, expect } from "vitest";
import {
  authorizeSettingsWrite,
  changedSettingKeys,
  MANAGER_WRITABLE_SETTINGS,
  SUPER_ADMIN_ONLY_SETTINGS,
} from "@/lib/services/settings-authz";
import { DEFAULT_SETTINGS } from "@/lib/services/settings";
import type { SettingsInput } from "@/lib/validation";

// DD-26 and DD-27 as a rule, tested as a rule (R8.1).
//
// `settings-write.test.ts` drives the real route and is where « the route
// actually calls this » is proved. This file is for the cases a driven test
// covers badly: the eight `.optional().nullable()` settings, where getting
// « did this change? » wrong goes wrong in BOTH directions —
//
//   too eager  → a MANAGER saving the printer is refused because the SIRET
//                looked edited when it was not. That is L-101 again.
//   too lazy   → a MANAGER edits the SIRET and it reads as unchanged. That is
//                worse, and it is silent.
//
// The whole-DTO save the settings screen sends (`settings-view.tsx:121`) means
// every one of those eight fields is present on every save, so this is the
// normal path and not an edge.

const base = (): SettingsInput => ({ ...DEFAULT_SETTINGS });

describe("changedSettingKeys — sending a field is not writing it", () => {
  it("reports nothing for a byte-identical whole-DTO save", () => {
    expect(changedSettingKeys(base(), { ...base() })).toEqual([]);
  });

  it("reports only the field that moved", () => {
    expect(changedSettingKeys(base(), { ...base(), printerQueue: "SUNSO WTP-800" })).toEqual([
      "printerQueue",
    ]);
  });

  it("treats null and undefined and an absent key as the same absence", () => {
    // `restaurantSiret` is "" in DEFAULT_SETTINGS and nullable in the schema.
    // A client that round-trips it through JSON can hand back null for "" — and
    // if that reads as an edit, the MANAGER is refused for touching nothing.
    const current = { ...base(), restaurantSiret: null } as unknown as SettingsInput;
    expect(changedSettingKeys(current, { restaurantSiret: null })).toEqual([]);
    expect(changedSettingKeys(current, { restaurantSiret: undefined })).toEqual([]);
    expect(changedSettingKeys(current, {})).toEqual([]);
  });

  it("does NOT treat empty string and null as the same, because they are not", () => {
    // The lazy direction. "" is a value the operator typed (or cleared); null
    // is the column being empty. `getSettings()` returns "" for these, so a
    // client sending null IS asking for a change and must be authorised for it.
    const current = { ...base(), restaurantSiret: "" };
    expect(changedSettingKeys(current, { restaurantSiret: null })).toEqual(["restaurantSiret"]);
  });

  it("sees a real edit to every restricted field", () => {
    // Guards the eager/lazy pair above from being satisfied by a function that
    // simply never reports a change. One assertion per SUPER_ADMIN-only field,
    // because those are the ones where a missed change is a silent widening.
    const current = base();
    for (const key of SUPER_ADMIN_ONLY_SETTINGS) {
      const value = typeof current[key] === "number" ? (current[key] as number) + 1 : "changed";
      expect(changedSettingKeys(current, { [key]: value }), `${key} read as unchanged`).toEqual([key]);
    }
  });
});

describe("DD-26 — the field split", () => {
  const allow = (role: string, changed: string[]) =>
    authorizeSettingsWrite({
      role,
      changed: changed as never,
      journalHasRealSale: false,
    });

  it("lets a MANAGER write every operational field", () => {
    expect(allow("MANAGER", [...MANAGER_WRITABLE_SETTINGS]).ok).toBe(true);
  });

  it("refuses a MANAGER every identity and fiscal-policy field, one at a time", () => {
    for (const key of SUPER_ADMIN_ONLY_SETTINGS) {
      const v = allow("MANAGER", [key]);
      expect(v.ok, `${key} was allowed to a MANAGER`).toBe(false);
      if (!v.ok) {
        expect(v.refused).toEqual([key]);
        expect(v.message, "the message must name the field").toContain(key);
      }
    }
  });

  it("names every refused field, not just the first", () => {
    const v = allow("MANAGER", ["restaurantSiret", "defaultVatRate"]);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.refused).toEqual(["restaurantSiret", "defaultVatRate"]);
  });

  it("lets a SUPER_ADMIN write anything", () => {
    expect(allow("SUPER_ADMIN", [...SUPER_ADMIN_ONLY_SETTINGS, ...MANAGER_WRITABLE_SETTINGS]).ok).toBe(true);
  });

  it("refuses an unknown role the restricted fields", () => {
    // Not reachable today — DD-07 left two roles — but the rule is « is this
    // SUPER_ADMIN? », not « is this MANAGER? », so a role added later is
    // refused by default rather than admitted by omission.
    const v = allow("SOMETHING_NEW", ["restaurantSiret"]);
    expect(v.ok).toBe(false);
  });
});

describe("DD-27 — FACTICE is one-way once anything real has been sold", () => {
  const toggle = (role: string, from: boolean, to: boolean, journalHasRealSale: boolean) =>
    authorizeSettingsWrite({
      role,
      changed: ["factice"],
      factice: { from, to },
      journalHasRealSale,
    });

  it("allows OFF in every combination — R6.3 must never be blocked", () => {
    for (const role of ["MANAGER", "SUPER_ADMIN"]) {
      for (const real of [false, true]) {
        expect(toggle(role, true, false, real).ok, `${role}, journal real=${real}`).toBe(true);
      }
    }
  });

  it("allows ON before the first real sale", () => {
    expect(toggle("MANAGER", false, true, false).ok).toBe(true);
  });

  it("refuses a MANAGER turning it ON once the journal holds a real event", () => {
    const v = toggle("MANAGER", false, true, true);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.refused).toEqual(["factice"]);
      expect(v.message).toContain("SIMULATION");
    }
  });

  it("keeps the SUPER_ADMIN escape hatch", () => {
    expect(toggle("SUPER_ADMIN", false, true, true).ok).toBe(true);
  });

  it("does not fire when factice is not part of the change", () => {
    // The guard reads a `factice` argument the route only supplies when the
    // key changed. Without this, a printer save on a trading till could be
    // refused by a rule that has nothing to do with it.
    expect(
      authorizeSettingsWrite({
        role: "MANAGER",
        changed: ["printerQueue"],
        journalHasRealSale: true,
      }).ok,
    ).toBe(true);
  });
});
