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

  it("defaults to false when no setting row exists", async () => {
    // An install that has never seen the switch must not silently mark real
    // sales as simulations.
    expect(DEFAULT_SETTINGS.factice).toBe(false);
    const settings = await getSettings();
    expect(settings.factice).toBe(false);
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
