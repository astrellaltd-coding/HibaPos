// Settings service — typed get/set backed by the Setting table (JSON values).
import { db } from "@/lib/db";
import type { SettingsInput } from "@/lib/validation";
import { normalizeReceiptColumns } from "@/lib/services/escpos";

export const DEFAULT_SETTINGS: SettingsInput = {
  restaurantName: "HibaPOS France",
  restaurantAddress: "12 Rue de la Paix, 75002 Paris",
  restaurantPhone: "01 23 45 67 89",
  restaurantSiret: "",
  restaurantTva: "",
  footerNote: "Merci de votre visite !",
  defaultVatRate: 10,
  currency: "EUR",
  printerName: "Sunso WTP-801",
  printerHost: "",
  printerPort: 9100,
  printerEnabled: false,
  openDrawerOnCash: true,
  receiptWidth: 48,
  discountApprovalThreshold: 20,
  autoPrint: false,
  factice: false,
};

export async function getSettings(): Promise<SettingsInput> {
  const rows = await db.setting.findMany();
  const map: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      map[row.key] = JSON.parse(row.value);
    } catch {
      map[row.key] = row.value;
    }
  }
  const merged = { ...DEFAULT_SETTINGS, ...(map as Partial<SettingsInput>) };

  // L-20 (Batch 3.1d): repair the legacy millimetre `receiptWidth` on the way
  // out. Batch 1.3 made the field a COLUMN count and tightened the schema to
  // 32..48, but the live row still holds the millimetre value 80 — so the
  // settings form loaded 80, PUT it straight back, and every save was rejected
  // with `400 Too big: expected number to be <=48`. That blocked *all*
  // configuration, not just the width.
  //
  // Normalising here rather than in the route fixes both readers at once: the
  // settings form, and `renderReceipt()`, which uses this value as its column
  // count directly (`receipt.ts:8`) and was therefore still producing
  // 80-column receipt text for a 48-column printer.
  //
  // Deliberately does NOT write the row back — Batch 1.3's policy, and
  // `normalizeReceiptColumns`'s own contract. The stored value corrects itself
  // the first time the operator saves.
  return { ...merged, receiptWidth: normalizeReceiptColumns(merged.receiptWidth) };
}

export async function saveSettings(input: Partial<SettingsInput>): Promise<SettingsInput> {
  const current = await getSettings();
  const merged = { ...current, ...input };

  // Write only the keys that actually changed — avoids upserting every setting
  // on every save (write amplification).
  //
  // The comparison is against what is actually STORED, not against the
  // normalised view getSettings() returns (L-20, Batch 3.1d). Comparing
  // against the normalised view would make a repaired legacy value equal
  // itself, so the row would never be corrected: `receiptWidth` would read as
  // 48 forever while the database went on saying 80. A save is an explicit
  // operator action, so it is the right moment to persist the repair — which
  // is also what the plan's outstanding "save receiptWidth as 48" item asks
  // for, and the operator no longer has to know to do it by hand.
  //
  // A key with no row yet is written on the first save and skipped thereafter,
  // so the amplification is one-time rather than per-save.
  const storedRows = await db.setting.findMany();
  const stored = new Map(storedRows.map((row) => [row.key, row.value]));
  for (const [key, value] of Object.entries(merged)) {
    const next = JSON.stringify(value);
    if (stored.get(key) !== next) {
      await db.setting.upsert({
        where: { key },
        create: { key, value: next },
        update: { value: next },
      });
    }
  }
  return merged;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return row.value as unknown as T;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });
}
