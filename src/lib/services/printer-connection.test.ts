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

  it("an install with a host but NO connection row resolves to USB since 2026-09-11", async () => {
    // THIS ASSERTED TCP UNTIL 2026-09-11, under the name « an install that
    // predates this batch still resolves to TCP ». It was Batch 1.3d's upgrade
    // shim: with no `printerConnection` row, keep resolving as before.
    //
    // Reversed with the default, and the irony is worth recording — the shim
    // asserts precisely the inference L-70 existed to abolish. Batch 1.3d's own
    // words: « which transport, decided by an explicit setting rather than by
    // which field happens to be filled ». A stored host implying « network »
    // IS that inference, kept alive for installs that might be upgraded.
    //
    // There is one install, it has never traded, and its `printerHost` is the
    // empty string — so the scenario this described does not exist, and the
    // guarantee protected nothing. The transport is now what the setting says,
    // and absent a setting it is what the default says: USB.
    await storeSettings({ printerEnabled: true, printerHost: "10.0.0.9", printerPort: 9100 });
    const stored = await db.setting.findMany();
    expect(stored.some((s) => s.key === "printerConnection")).toBe(false);

    const r = await resolvePrinter();
    // USB with no queue: refused, and it names the picker rather than the host
    // it was given — which is the point. A filled-in host no longer decides.
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // `PrintOutcome` is a three-arm union and its success arm carries neither
    // `reason` nor `message`, so narrow before reading them.
    expect(r.outcome.ok).toBe(false);
    if (r.outcome.ok) return;
    expect(r.outcome.reason).toBe("NOT_CONFIGURED");
    expect(r.outcome.message).toContain("imprimante Windows");
    expect(r.outcome.message).not.toContain("10.0.0.9");
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
  it("default to USB, which reverses Batch 1.3d on the operator's instruction", () => {
    // THIS PIN WAS `"network"` UNTIL 2026-09-11, under the name « default to
    // the behaviour that exists today ». Batch 1.3d chose network so that an
    // upgrade changed nothing until the operator switched it — an argument
    // about protecting existing installs.
    //
    // It is reversed, not weakened. There is one install, it has never traded,
    // and it has NO `printerConnection` row — so the default was its effective
    // value, and that value sent every print attempt to « Renseignez l'adresse
    // IP » for a printer that has always been on a USB type-B cable. The pin
    // stays exact; only the decision it records has changed.
    expect(DEFAULT_SETTINGS.printerConnection).toBe("usb");
    // Unchanged, and deliberately: the queue cannot be guessed. It is chosen
    // from the list Windows reports, which is R6.4's remaining half.
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
