import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { getSettings, saveSettings } from "@/lib/services/settings";
import { settingsSchema } from "@/lib/validation";
import { renderReceipt } from "@/lib/services/receipt";
import type { OrderDto, SettingsDto } from "@/types/api";

// L-20 (Batch 3.1d) — the Réglages screen could not be saved at all.
//
// Batch 1.3 (L-13) made `receiptWidth` a COLUMN count and tightened the schema
// to 32..48. The live row still held the legacy millimetre value 80, and
// getSettings() returned it raw — so the settings form loaded 80, PUT it
// straight back, and the server rejected the whole payload with
// `400 Too big: expected number to be <=48`. Every setting was frozen, not
// just the width.
//
// The regression test that matters is the round-trip: whatever getSettings()
// returns must satisfy the schema the PUT route validates against, because
// that is exactly what the form does.

async function setStoredWidth(value: number) {
  await db.setting.deleteMany();
  await db.setting.upsert({
    where: { key: "receiptWidth" },
    create: { key: "receiptWidth", value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });
}

describe("getSettings — receiptWidth normalisation (L-20)", () => {
  beforeEach(async () => {
    await db.setting.deleteMany();
  });

  it("maps the legacy 80 mm row to 48 columns", async () => {
    // The exact state of the production install.
    await setStoredWidth(80);
    expect((await getSettings()).receiptWidth).toBe(48);
  });

  it("maps the legacy 58 mm row to 32 columns", async () => {
    await setStoredWidth(58);
    expect((await getSettings()).receiptWidth).toBe(32);
  });

  it("leaves an already-valid column count untouched", async () => {
    for (const width of [32, 42, 48]) {
      await setStoredWidth(width);
      expect((await getSettings()).receiptWidth).toBe(width);
    }
  });

  it("does NOT rewrite the stored row — reads must not mutate settings", async () => {
    // Batch 1.3's policy, and normalizeReceiptColumns()'s own contract. The
    // value corrects itself when the operator next saves, not behind their back.
    await setStoredWidth(80);
    await getSettings();
    const row = await db.setting.findUnique({ where: { key: "receiptWidth" } });
    expect(JSON.parse(row!.value)).toBe(80);
  });
});

describe("settings round-trip — the form's own path (L-20)", () => {
  beforeEach(async () => {
    await db.setting.deleteMany();
  });

  it("what getSettings() returns is accepted by the PUT schema, with a legacy row", async () => {
    // This is the failure the operator actually hit: the form GETs, then PUTs
    // the same object back. Before the fix this parse failed on receiptWidth.
    await setStoredWidth(80);
    const loaded = await getSettings();
    const parsed = settingsSchema.safeParse(loaded);
    expect(parsed.success).toBe(true);
  });

  it("a full GET → PUT cycle saves and stores the corrected width", async () => {
    await setStoredWidth(80);
    const loaded = await getSettings();
    const parsed = settingsSchema.safeParse(loaded);
    expect(parsed.success).toBe(true);
    await saveSettings(parsed.success ? parsed.data : loaded);
    const row = await db.setting.findUnique({ where: { key: "receiptWidth" } });
    // The legacy value corrects itself on the first save — the operator does
    // not have to know to re-pick the width in the selector.
    expect(JSON.parse(row!.value)).toBe(48);
  });

  it("an unrelated setting can be changed while a legacy width row exists", async () => {
    // The concrete thing that was blocked: DOC-15 asks the operator to correct
    // printerName, and they could not, because the width failed validation.
    await setStoredWidth(80);
    const loaded = await getSettings();
    const parsed = settingsSchema.safeParse({ ...loaded, printerName: "Sunso WTP-801" });
    expect(parsed.success).toBe(true);
    await saveSettings(parsed.success ? parsed.data : loaded);
    expect((await getSettings()).printerName).toBe("Sunso WTP-801");
  });
});

describe("receipt width follows the normalised setting (L-20)", () => {
  beforeEach(async () => {
    await db.setting.deleteMany();
  });

  it("renders at 48 columns from a legacy 80 mm row", async () => {
    // renderReceipt() uses receiptWidth directly as a column count
    // (receipt.ts:8), so the raw 80 was still producing 80-column receipt text
    // for a printer that fits 48 — new receipts, not only the archived ones
    // L-14 covers.
    await setStoredWidth(80);
    const settings = await getSettings();
    const order: OrderDto = {
      id: "o1",
      number: 1,
      shiftId: "s1",
      cashierId: "c1",
      customerId: null,
      status: "COMPLETED",
      orderType: "TAKEAWAY",
      tableLabel: null,
      subtotal: 150,
      vatTotal: 8,
      discountTotal: 0,
      total: 150,
      notes: null,
      itemCount: 1,
      fiscalEventId: null,
      createdAt: "2026-09-03T12:00:00.000Z",
      completedAt: "2026-09-03T12:00:00.000Z",
      refundedAt: null,
      items: [
        {
          id: "oi1",
          productId: "p1",
          productName: "Coca",
          unitPrice: 150,
          quantity: 1,
          lineTotal: 150,
          optionsJson: null,
          addOnsJson: null,
          notes: null,
          vatRate: 5.5,
        },
      ],
      payments: [{ id: "pay1", method: "CASH", amount: 150, tendered: 150, change: 0 }],
    } as unknown as OrderDto;

    const text = renderReceipt(order, settings as unknown as SettingsDto);
    const separator = text.split("\n").find((l) => /^-+$/.test(l));
    // The rule line is drawn at exactly `w`, so it reports the width used.
    expect(separator?.length).toBe(48);
  });
});
