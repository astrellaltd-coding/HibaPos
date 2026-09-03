import { describe, it, expect } from "vitest";
import {
  openCashDrawer,
  printReceiptText,
  printTestPage,
  renderTestPage,
} from "@/lib/services/printer";
import { PrinterError, type PrinterTransport } from "@/lib/services/printer-transport";
import { encodeText } from "@/lib/services/escpos";

// C-03 (Batch 1.3) — the printer service. The contract under test is that
// printing NEVER throws: a sale is already committed by the time anything
// reaches the printer, so every failure has to come back as an outcome the
// caller can ignore.

function recordingTransport() {
  const sent: Buffer[] = [];
  const transport: PrinterTransport = {
    send: async (payload) => {
      sent.push(payload);
    },
    describe: () => "192.168.1.50:9100",
  };
  return { transport, sent };
}

function failingTransport(code: "UNREACHABLE" | "TIMEOUT" | "WRITE_FAILED") {
  const transport: PrinterTransport = {
    send: async () => {
      throw new PrinterError(code, "192.168.1.50:9100", "technical detail");
    },
    describe: () => "192.168.1.50:9100",
  };
  return transport;
}

describe("printReceiptText", () => {
  it("sends the receipt and reports the target", async () => {
    const { transport, sent } = recordingTransport();
    const outcome = await printReceiptText("Ticket N° 42\nTOTAL 22,50 €", {}, { transport });

    expect(outcome).toEqual({ ok: true, target: "192.168.1.50:9100" });
    expect(sent).toHaveLength(1);
  });

  it("prints the archived text verbatim", async () => {
    // The printed ticket and Receipt.content must be the same document.
    const text = "Ticket N° 42\nTOTAL 22,50 €";
    const { transport, sent } = recordingTransport();
    await printReceiptText(text, {}, { transport });

    expect(sent[0].includes(encodeText(text))).toBe(true);
  });

  it("kicks the drawer only when asked", async () => {
    const kick = Buffer.from([0x1b, 0x70]);
    const withDrawer = recordingTransport();
    await printReceiptText("x", { openDrawer: true }, { transport: withDrawer.transport });
    expect(withDrawer.sent[0].includes(kick)).toBe(true);

    const without = recordingTransport();
    await printReceiptText("x", {}, { transport: without.transport });
    expect(without.sent[0].includes(kick)).toBe(false);
  });

  it("returns a failure outcome instead of throwing when the printer is down", async () => {
    const outcome = await printReceiptText("x", {}, { transport: failingTransport("UNREACHABLE") });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.reason).toBe("FAILED");
    if (outcome.reason !== "FAILED") throw new Error("unreachable");
    expect(outcome.code).toBe("UNREACHABLE");
    // Operator-facing French, not an errno.
    expect(outcome.message).toContain("Imprimante injoignable");
  });

  it("stays silent when printing is disabled in settings", async () => {
    // No transport injected, and the default settings have printing off.
    const outcome = await printReceiptText("x");
    expect(outcome).toMatchObject({ ok: false, reason: "DISABLED" });
  });
});

describe("openCashDrawer", () => {
  it("sends a reset followed by the kick, and nothing else", async () => {
    const { transport, sent } = recordingTransport();
    const outcome = await openCashDrawer({ transport });

    expect(outcome.ok).toBe(true);
    expect(Array.from(sent[0])).toEqual([0x1b, 0x40, 0x1b, 0x70, 0, 25, 250]);
  });

  it("reports a failure rather than throwing", async () => {
    const outcome = await openCashDrawer({ transport: failingTransport("TIMEOUT") });
    expect(outcome).toMatchObject({ ok: false, reason: "FAILED", code: "TIMEOUT" });
  });
});

describe("printTestPage", () => {
  it("reports the column count it printed at", async () => {
    const { transport } = recordingTransport();
    const outcome = await printTestPage({}, { transport });
    // Default settings: receiptWidth 48 columns (80 mm paper).
    expect(outcome).toMatchObject({ ok: true, columns: 48 });
  });
});

describe("renderTestPage", () => {
  it("fits the configured width on both paper sizes", () => {
    for (const columns of [32, 48]) {
      for (const line of renderTestPage(columns, "HIBA FOOD").split("\n")) {
        expect(line.length).toBeLessThanOrEqual(columns);
      }
    }
  });

  it("prints a ruler exactly as wide as the configured columns", () => {
    // If the ruler wraps on paper, receiptWidth is wrong for that printer.
    const ruler = renderTestPage(48).split("\n").find((l) => l.startsWith("123456789"));
    expect(ruler).toBeDefined();
    expect(ruler).toHaveLength(48);
    expect(renderTestPage(32).split("\n").find((l) => l.startsWith("123456789"))).toHaveLength(32);
  });

  it("exercises the characters most likely to be mis-encoded", () => {
    const page = renderTestPage(48);
    for (const char of ["é", "è", "ê", "à", "ç", "ù", "û", "î", "ô", "œ", "°", "€"]) {
      expect(page).toContain(char);
    }
  });

  it("names the restaurant so the operator knows which till printed it", () => {
    expect(renderTestPage(48, "HIBA FOOD")).toContain("HIBA FOOD");
  });
});
