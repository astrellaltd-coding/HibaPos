import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { getSettings, saveSettings, DEFAULT_SETTINGS } from "@/lib/services/settings";
import { appendFiscalEvent } from "@/lib/services/fiscal";
import { ensureFiscalCounter } from "@/lib/services/sequence";

// L-18 (Batch 3.1b) — FACTICE / simulation mode.
//
// The mode was read on eight fiscal write paths and stamped both the receipt
// and every FiscalEvent, but no screen could set it and no `factice` row
// existed in Setting, so it was permanently false. That is why twenty
// development orders were journalled as genuine sales.
//
// These tests pin the composition the checkout route performs at
// orders/route.ts:390 — `getSettings()` then `factice: settings.factice` into
// appendFiscalEvent — in both directions. The OFF direction matters at least
// as much as the ON one: it is what must hold on the restaurant's first real
// sale.

async function resetSettings() {
  await db.setting.deleteMany();
}

describe("FACTICE mode — settings (L-18)", () => {
  beforeEach(async () => {
    await resetSettings();
  });

  it("defaults to TRUE when no setting row exists — reversed 2026-09-11", async () => {
    // An install that has never seen the switch must not silently mark real
    // sales as simulations.
    // REVERSED on the operator's instruction, 2026-09-11. This asserted
    // `false` from Batch 3.1's L-18 onwards, which meant a brand-new database
    // treated its first ticket as a real fiscal document — before a printer,
    // before any check, before anyone said « go live ». The stamp is now the
    // default and REMOVING it is the deliberate act (R6.3, which comes last).
    // Exact assertion, new decision: not a weakened test.
    expect(DEFAULT_SETTINGS.factice).toBe(true);
    const settings = await getSettings();
    expect(settings.factice).toBe(true);
    // And still with NO row: the default is what answers, not a written value.
    // That is the half that makes this about a fresh install rather than about
    // one setting — nothing has to be saved for a new till to be in simulation.
    expect(await db.setting.findUnique({ where: { key: "factice" } })).toBeNull();
  });

  it("round-trips through saveSettings and persists as a real row", async () => {
    await saveSettings({ factice: true });
    const row = await db.setting.findUnique({ where: { key: "factice" } });
    expect(row).not.toBeNull();
    expect(JSON.parse(row!.value)).toBe(true);
    expect((await getSettings()).factice).toBe(true);
  });

  it("can be turned back off — the state before the first real sale", async () => {
    await saveSettings({ factice: true });
    expect((await getSettings()).factice).toBe(true);
    await saveSettings({ factice: false });
    expect((await getSettings()).factice).toBe(false);
    // Turned off must mean off, not merely absent from the update.
    const row = await db.setting.findUnique({ where: { key: "factice" } });
    expect(JSON.parse(row!.value)).toBe(false);
  });

  it("survives an unrelated settings save", async () => {
    await saveSettings({ factice: true });
    await saveSettings({ restaurantName: "HIBA FOOD" });
    const settings = await getSettings();
    expect(settings.factice).toBe(true);
    expect(settings.restaurantName).toBe("HIBA FOOD");
  });
});

describe("FACTICE mode — fiscal journal (L-18)", () => {
  beforeEach(async () => {
    await db.fiscalEvent.deleteMany();
    await db.fiscalCounter.deleteMany();
    await resetSettings();
    await ensureFiscalCounter();
  });

  it("marks the journal entry when the setting is on", async () => {
    await saveSettings({ factice: true });
    const settings = await getSettings();
    // Exactly the composition orders/route.ts:390 performs.
    const ev = await db.$transaction((tx) =>
      appendFiscalEvent(tx, {
        type: "VENTE",
        factice: settings.factice ?? false,
        data: { orderNumber: 1, total: 1000 },
      }),
    );
    expect(ev.factice).toBe(true);
  });

  it("leaves the journal entry unmarked when the setting is off", async () => {
    // 2026-09-11: this now TURNS THE SETTING OFF, which its name always
    // claimed. It never did — it read `getSettings()` against an empty table
    // and leaned on `DEFAULT_SETTINGS.factice` being `false`. So the test
    // passed for a reason unrelated to its subject, and the moment the default
    // was reversed it failed while the behaviour it names was untouched. A test
    // that depends on a default it is not about is a test that will mislead
    // somebody once.
    await saveSettings({ factice: false });
    const settings = await getSettings();
    const ev = await db.$transaction((tx) =>
      appendFiscalEvent(tx, {
        type: "VENTE",
        factice: settings.factice ?? false,
        data: { orderNumber: 1, total: 1000 },
      }),
    );
    expect(ev.factice).toBe(false);
  });

  it("does not put factice into the hashed payload", async () => {
    // The flag is a column, not part of `data`. If it were hashed, toggling
    // the mode would change how an otherwise identical sale chains — and a
    // real sale's hash must not depend on a settings switch.
    await saveSettings({ factice: true });
    const ev = await db.$transaction((tx) =>
      appendFiscalEvent(tx, {
        type: "VENTE",
        factice: true,
        data: { orderNumber: 1, total: 1000 },
      }),
    );
    expect(ev.dataJson).not.toContain("factice");
  });
});
