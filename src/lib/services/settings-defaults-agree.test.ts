import { describe, it, expect } from "vitest";
import { settingsSchema } from "@/lib/validation";
import { DEFAULT_SETTINGS } from "@/lib/services/settings";
import {
  SUPER_ADMIN_ONLY_SETTINGS,
  MANAGER_WRITABLE_SETTINGS,
} from "@/lib/services/settings-authz";

// L-93 (R8.1) — the two default tables may not disagree.
//
// THE FINDING: `settingsSchema` materialised `factice: false` and
// `printerConnection: "network"` for an absent key; `DEFAULT_SETTINGS` answered
// `true` and `"usb"`. `PUT /api/settings` parsed with the schema and handed the
// result to `saveSettings`, which does `{ ...current, ...input }` — and a
// *present* key overwrites. So a settings save that merely OMITTED `factice`
// performed R6.3 silently, and one that omitted `printerConnection` undid the
// 2026-09-11 USB decision R6.4 rests on.
//
// Both defaults were pinned before this file existed — `validation.test.ts` for
// the schema, `fresh-install-defaults.test.ts` for `DEFAULT_SETTINGS` — and
// both were green. **Nothing asserted they AGREE**, which is how the product
// held two answers with a clean suite. That is the gap this file closes, and it
// closes it for every key rather than for the two that happened to drift.

/** The materialised output of the schema for a body that supplies only the
 *  two fields with no default at all. Everything else here is a default. */
function materialisedDefaults(): Record<string, unknown> {
  const parsed = settingsSchema.safeParse({
    restaurantName: DEFAULT_SETTINGS.restaurantName,
    defaultVatRate: DEFAULT_SETTINGS.defaultVatRate,
  });
  if (!parsed.success) throw new Error(`the schema rejected its own minimum: ${parsed.error.message}`);
  return parsed.data as unknown as Record<string, unknown>;
}

describe("L-93 — settingsSchema and DEFAULT_SETTINGS answer the same thing", () => {
  it("agrees on every key the schema materialises", () => {
    // Key by key, and named individually so a failure says WHICH field drifted
    // rather than dumping two objects at the reader.
    const defaults = materialisedDefaults();
    const table = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
    const disagreements: string[] = [];
    for (const [key, schemaValue] of Object.entries(defaults)) {
      const tableValue = table[key];
      if (JSON.stringify(schemaValue) !== JSON.stringify(tableValue)) {
        disagreements.push(
          `${key}: settingsSchema=${JSON.stringify(schemaValue)} DEFAULT_SETTINGS=${JSON.stringify(tableValue)}`,
        );
      }
    }
    expect(
      disagreements,
      `the two default tables disagree — this is L-93, and the failing direction matters: ` +
        `a PUT that omits the key writes the SCHEMA's answer over the stored value. ` +
        `DEFAULT_SETTINGS is the authority; make the schema follow it: ${disagreements.join(" · ")}`,
    ).toEqual([]);
  });

  it("names exactly which keys carry a default, so the check above cannot go vacuous", () => {
    // The classic vacuous shape: if the parse ever returned two keys, the loop
    // above would pass over nothing and report agreement.
    //
    // Pinned as the SET rather than as a count, because the two failures worth
    // catching are different. A field that LOSES its `.default()` drops out of
    // the comparison silently — that is the vacuous direction. A field that
    // GAINS one joins it, and then the two tables can drift on a key nobody
    // thought about — which is L-93 arriving somewhere new.
    //
    // Twelve keys: the ten below, plus the two `materialisedDefaults()` has to
    // supply because they have no default at all. The other eight settings are
    // `.optional().nullable()` — no default, so nothing to disagree about, and
    // `DEFAULT_SETTINGS` is their only source.
    const defaults = materialisedDefaults();
    expect(Object.keys(defaults).sort()).toEqual([
      "autoPrint",
      "businessDayCutoffHour",
      "currency",
      "defaultVatRate",       // supplied, not defaulted
      "discountApprovalThreshold",
      "factice",
      "openDrawerOnCash",
      "printerConnection",
      "printerEnabled",
      "printerPort",
      "receiptWidth",
      "restaurantName",       // supplied, not defaulted
    ]);
  });

  it("still answers factice=true and printerConnection=usb, the two that drifted", () => {
    // Stated as values, not only as an agreement, so that reconciling them the
    // WRONG WAY round — moving DEFAULT_SETTINGS to the schema's old answers —
    // fails here. Both carry dated operator decisions (2026-09-11): a fresh
    // install is in SIMULATION until someone says otherwise, and the
    // restaurant's Sunso WTP-801 is on a USB cable.
    const defaults = materialisedDefaults();
    expect(defaults.factice).toBe(true);
    expect(defaults.printerConnection).toBe("usb");
    expect(DEFAULT_SETTINGS.factice).toBe(true);
    expect(DEFAULT_SETTINGS.printerConnection).toBe("usb");
  });
});

describe("DD-26 — every setting is classified, exactly once", () => {
  it("partitions the schema: no field is in both lists, and none is in neither", () => {
    // The rule this enforces is that adding a field to `settingsSchema` without
    // deciding who may write it FAILS, rather than defaulting silently to one
    // side. Defaulting to MANAGER-writable would quietly widen the gate;
    // defaulting to SUPER_ADMIN would quietly reproduce L-101.
    const schemaKeys = Object.keys(DEFAULT_SETTINGS).sort();
    const sa = [...SUPER_ADMIN_ONLY_SETTINGS];
    const mgr = [...MANAGER_WRITABLE_SETTINGS];

    const both = sa.filter((k) => (mgr as string[]).includes(k));
    expect(both, `classified twice: ${both.join(", ")}`).toEqual([]);

    const classified: string[] = [...sa, ...mgr].sort();
    const unclassified = schemaKeys.filter((k) => !classified.includes(k));
    expect(
      unclassified,
      `a setting nobody has decided about — add it to SUPER_ADMIN_ONLY_SETTINGS or ` +
        `MANAGER_WRITABLE_SETTINGS in settings-authz.ts (DD-26): ${unclassified.join(", ")}`,
    ).toEqual([]);

    const invented = classified.filter((k) => !schemaKeys.includes(k));
    expect(invented, `classified but not a setting: ${invented.join(", ")}`).toEqual([]);
    expect(classified).toEqual(schemaKeys);
  });

  it("keeps the four fields DD-26 singled out on the SUPER_ADMIN side", () => {
    // Not a restatement of the list: these four are the ones DD-26 argues
    // about by name, and they are the ones a later widening would reach for.
    // `discountApprovalThreshold` escapes every DD-19 step-up at 100, and
    // `businessDayCutoffHour` sets the edges of every sealed document.
    for (const key of ["restaurantSiret", "restaurantTva", "discountApprovalThreshold", "businessDayCutoffHour"]) {
      expect(SUPER_ADMIN_ONLY_SETTINGS as readonly string[], `${key} must stay SUPER_ADMIN-only`).toContain(key);
    }
    // And the two Phase 6 rows depend on these being the MANAGER's:
    // R6.3 is `factice`, R6.4 is the printer queue.
    for (const key of ["factice", "printerQueue", "printerConnection", "printerEnabled"]) {
      expect(MANAGER_WRITABLE_SETTINGS as readonly string[], `${key} must stay MANAGER-writable — R6.3/R6.4 need it`).toContain(key);
    }
  });
});
