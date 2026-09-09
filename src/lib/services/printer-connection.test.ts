import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resolvePrinter } from "@/lib/services/printer";
import { getSettings, saveSettings, DEFAULT_SETTINGS } from "@/lib/services/settings";
import { settingsSchema } from "@/lib/validation";

// L-70 (Batch 1.3d) — which transport does the app actually build?
//
// THIS IS THE FILE THAT MATTERS, and the reason it exists separately from
// `printer-spooler.test.ts` is the lesson this project keeps paying for: a
// unit test on an extracted rule proves the rule, not that anything calls it.
// The spooler transport can be perfect and the till still print nothing, if
// `resolvePrinter` never builds it. So these tests drive the REAL settings
// through the REAL resolver and look at what comes back.

async function storeSettings(values: Record<string, unknown>) {
  await db.setting.deleteMany();
  for (const [key, value] of Object.entries(values)) {
    await db.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
  }
}

beforeEach(async () => {
  await db.setting.deleteMany();
});

// THE WHOLE RUN SHARES ONE DATABASE (Batch 6.3 made the path per-run, not
// per-file), so a file that leaves `printerEnabled: true` behind breaks the
// next file that relies on the default being off — which is exactly what this
// file did to `printer.test.ts` before this hook existed.
afterAll(async () => {
  await db.setting.deleteMany();
});

describe("resolvePrinter chooses the transport the setting names", () => {
  it("USB mode builds the spooler transport, addressed by the queue name", async () => {
    await storeSettings({
      printerEnabled: true,
      printerConnection: "usb",
      printerQueue: "SUNSO WTP-800",
      printerHost: "192.168.1.50", // deliberately ALSO set: the mode must win
    });
    const r = await resolvePrinter();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // A host is configured too; the explicit mode is what decides, which is
    // the whole point of not inferring it from which field is filled.
    expect(r.transport.describe()).toBe("SUNSO WTP-800");
  });

  it("network mode builds the TCP transport, addressed host:port", async () => {
    await storeSettings({
      printerEnabled: true,
      printerConnection: "network",
      printerHost: "192.168.1.50",
      printerPort: 9100,
      printerQueue: "SUNSO WTP-800", // also set, and must be ignored
    });
    const r = await resolvePrinter();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.transport.describe()).toBe("192.168.1.50:9100");
  });

  it("an install that predates this batch still resolves to TCP", async () => {
    // No `printerConnection` row at all — exactly what production holds today.
    await storeSettings({ printerEnabled: true, printerHost: "10.0.0.9", printerPort: 9100 });
    const stored = await db.setting.findMany();
    expect(stored.some((s) => s.key === "printerConnection")).toBe(false);

    const r = await resolvePrinter();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.transport.describe()).toBe("10.0.0.9:9100");
  });
});

describe("each mode's NOT_CONFIGURED names its own missing field", () => {
  it("USB with no queue selected points at the picker, not at an IP address", async () => {
    await storeSettings({ printerEnabled: true, printerConnection: "usb", printerQueue: "" });
    const r = await resolvePrinter();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.outcome.ok).toBe(false);
    if (r.outcome.ok) return;
    expect(r.outcome.reason).toBe("NOT_CONFIGURED");
    expect(r.outcome.message).toContain("imprimante Windows");
    // The regression: this used to be the only message, and it was wrong here.
    expect(r.outcome.message).not.toContain("adresse IP");
  });

  it("network with no host still points at the IP address", async () => {
    await storeSettings({ printerEnabled: true, printerConnection: "network", printerHost: "" });
    const r = await resolvePrinter();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    if (r.outcome.ok) return;
    expect(r.outcome.message).toContain("adresse IP");
  });

  it("disabled beats both modes and stays silent", async () => {
    await storeSettings({
      printerEnabled: false,
      printerConnection: "usb",
      printerQueue: "SUNSO WTP-800",
    });
    const r = await resolvePrinter();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    if (r.outcome.ok) return;
    expect(r.outcome.reason).toBe("DISABLED");
  });

  it("a queue name of only spaces is treated as not configured", async () => {
    await storeSettings({ printerEnabled: true, printerConnection: "usb", printerQueue: "   " });
    const r = await resolvePrinter();
    expect(r.ok).toBe(false);
  });
});

describe("the new settings keys", () => {
  it("default to the behaviour that exists today", () => {
    expect(DEFAULT_SETTINGS.printerConnection).toBe("network");
    expect(DEFAULT_SETTINGS.printerQueue).toBe("");
  });

  it("survive the form round-trip the PUT route validates (L-20's lesson)", async () => {
    const loaded = await getSettings();
    const parsed = settingsSchema.safeParse({
      ...loaded,
      printerConnection: "usb",
      printerQueue: "SUNSO WTP-800",
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("rejects a connection value that is neither mode", () => {
    const parsed = settingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      printerConnection: "bluetooth",
    });
    expect(parsed.success).toBe(false);
  });

  it("persists both keys through saveSettings", async () => {
    await saveSettings({ printerConnection: "usb", printerQueue: "SUNSO WTP-800" });
    const after = await getSettings();
    expect(after.printerConnection).toBe("usb");
    expect(after.printerQueue).toBe("SUNSO WTP-800");
  });
});

describe("printerName stays a label and nothing functional reads it (DOC-15)", () => {
  // Batch 1.3's note 5 said "nothing in the code reads printerName, so the
  // Sunso-vs-Epson contradiction is harmless". This batch had every reason to
  // repurpose it and deliberately did not: the live value is "Sunso WTP-801"
  // and the real Windows queue on the developer machine is "SUNSO WTP-800".
  // Reusing the field would have addressed a queue that does not exist.
  it("the USB transport is addressed by printerQueue, never by printerName", async () => {
    await storeSettings({
      printerEnabled: true,
      printerConnection: "usb",
      printerName: "Sunso WTP-801",
      printerQueue: "SUNSO WTP-800",
    });
    const r = await resolvePrinter();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.transport.describe()).toBe("SUNSO WTP-800");
    expect(r.transport.describe()).not.toBe("Sunso WTP-801");
  });
});
