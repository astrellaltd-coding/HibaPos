// Settings service — typed get/set backed by the Setting table (JSON values).
import { db } from "@/lib/db";
import type { SettingsInput } from "@/lib/validation";

export const DEFAULT_SETTINGS: SettingsInput = {
  restaurantName: "HibaPOS France",
  restaurantAddress: "12 Rue de la Paix, 75002 Paris",
  restaurantPhone: "01 23 45 67 89",
  restaurantSiret: "",
  restaurantTva: "",
  footerNote: "Merci de votre visite !",
  defaultVatRate: 20,
  currency: "EUR",
  printerName: "Epson TM-m30",
  receiptWidth: 80,
  discountApprovalThreshold: 20,
  autoPrint: false,
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
  return { ...DEFAULT_SETTINGS, ...(map as Partial<SettingsInput>) };
}

export async function saveSettings(input: Partial<SettingsInput>): Promise<SettingsInput> {
  const current = await getSettings();
  const merged = { ...current, ...input };
  for (const [key, value] of Object.entries(merged)) {
    await db.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
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
