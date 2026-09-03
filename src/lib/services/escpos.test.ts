import { describe, it, expect } from "vitest";
import {
  CODE_PAGE_WPC1252,
  buildPrintJob,
  columnsForPaperMm,
  cut,
  drawerKick,
  encodeText,
  feed,
  init,
  normalizeReceiptColumns,
  selectCodePage,
} from "@/lib/services/escpos";

// C-03 (Batch 1.3) — the ESC/POS command layer. These assertions are the
// only pre-hardware guarantee that the right bytes reach the printer, so
// they check exact byte sequences rather than behaviour-by-proxy.

const bytes = (b: Buffer) => Array.from(b);

describe("ESC/POS control commands", () => {
  it("emits ESC @ to reset the printer", () => {
    expect(bytes(init())).toEqual([0x1b, 0x40]);
  });

  it("selects WPC1252 (page 16) by default", () => {
    expect(bytes(selectCodePage())).toEqual([0x1b, 0x74, 16]);
    expect(CODE_PAGE_WPC1252).toBe(16);
  });

  it("feeds n lines with ESC d", () => {
    expect(bytes(feed(4))).toEqual([0x1b, 0x64, 4]);
    expect(bytes(feed(0))).toEqual([0x1b, 0x64, 0]);
    expect(bytes(feed(999))).toEqual([0x1b, 0x64, 255]);
  });

  it("cuts partially by default and fully on request", () => {
    expect(bytes(cut())).toEqual([0x1d, 0x56, 66, 0]);
    expect(bytes(cut({ full: true }))).toEqual([0x1d, 0x56, 65, 0]);
    expect(bytes(cut({ feedDots: 24 }))).toEqual([0x1d, 0x56, 66, 24]);
  });
});

describe("cash-drawer kick", () => {
  it("pulses pin 2 for 50 ms with a 500 ms guard by default", () => {
    // t1/t2 are in units of 2 ms: 50 ms → 25, 500 ms → 250.
    expect(bytes(drawerKick())).toEqual([0x1b, 0x70, 0, 25, 250]);
  });

  it("addresses pin 5 when the drawer is wired to it", () => {
    expect(bytes(drawerKick({ pin: 5 }))).toEqual([0x1b, 0x70, 1, 25, 250]);
  });

  it("converts millisecond durations and clamps to one byte", () => {
    expect(bytes(drawerKick({ onMs: 100, offMs: 200 }))).toEqual([0x1b, 0x70, 0, 50, 100]);
    expect(bytes(drawerKick({ onMs: 10_000, offMs: 10_000 }))).toEqual([0x1b, 0x70, 0, 255, 255]);
  });
});

describe("text encoding (CP1252)", () => {
  it("encodes ASCII unchanged", () => {
    expect(bytes(encodeText("TOTAL 12.50"))).toEqual([...Buffer.from("TOTAL 12.50", "ascii")]);
  });

  it("encodes the French repertoire used on receipts", () => {
    expect(bytes(encodeText("é"))).toEqual([0xe9]);
    expect(bytes(encodeText("è"))).toEqual([0xe8]);
    expect(bytes(encodeText("ê"))).toEqual([0xea]);
    expect(bytes(encodeText("à"))).toEqual([0xe0]);
    expect(bytes(encodeText("ç"))).toEqual([0xe7]);
    expect(bytes(encodeText("ù"))).toEqual([0xf9]);
    expect(bytes(encodeText("û"))).toEqual([0xfb]);
    expect(bytes(encodeText("î"))).toEqual([0xee]);
    expect(bytes(encodeText("ô"))).toEqual([0xf4]);
    expect(bytes(encodeText("°"))).toEqual([0xb0]);
    expect(bytes(encodeText("œ"))).toEqual([0x9c]);
  });

  it("encodes the euro sign in a single byte", () => {
    expect(bytes(encodeText("€"))).toEqual([0x80]);
  });

  it("encodes a real receipt line without loss", () => {
    // The exact shape formatEuro produces, NBSP included.
    expect(bytes(encodeText("TOTAL 22,50 €"))).toEqual([
      ...Buffer.from("TOTAL 22,50 ", "ascii"),
      0x80,
    ]);
  });

  it("flattens NBSP and narrow NBSP to a plain space", () => {
    // fr-FR emits NBSP before € and narrow NBSP between thousands; printers
    // render 0xA0 inconsistently, so both must arrive as 0x20.
    expect(bytes(encodeText("1 234"))).toEqual([...Buffer.from("1 234", "ascii")]);
    expect(bytes(encodeText("a b"))).toEqual([0x61, 0x20, 0x62]);
  });

  it("turns newlines into CR LF", () => {
    expect(bytes(encodeText("a\nb"))).toEqual([0x61, 0x0d, 0x0a, 0x62]);
  });

  it("folds characters CP1252 cannot carry down to ASCII", () => {
    expect(bytes(encodeText("ā"))).toEqual([0x61]); // combining mark stripped
    expect(bytes(encodeText("ł"))).toEqual([]); // no ASCII equivalent — dropped
    expect(bytes(encodeText("→"))).toEqual([]); // dropped rather than mojibake
  });

  it("never emits a byte below 0x20 except CR and LF", () => {
    const sample = "Reçu N° 42 — 22,50 €    ā→ł\nMerci !";
    for (const byte of bytes(encodeText(sample))) {
      if (byte === 0x0d || byte === 0x0a) continue;
      expect(byte).toBeGreaterThanOrEqual(0x20);
    }
  });
});

describe("receipt column width (L-13)", () => {
  it("derives Font A columns from the paper width in millimetres", () => {
    expect(columnsForPaperMm(80)).toBe(48);
    expect(columnsForPaperMm(58)).toBe(32);
  });

  it("repairs a legacy receiptWidth that holds millimetres", () => {
    // The live setting is 80 — a paper width, used by renderReceipt as a
    // column count. 80 columns do not fit on 80 mm paper; 48 do.
    expect(normalizeReceiptColumns(80)).toBe(48);
    expect(normalizeReceiptColumns(58)).toBe(32);
  });

  it("passes through a genuine column count", () => {
    expect(normalizeReceiptColumns(48)).toBe(48);
    expect(normalizeReceiptColumns(42)).toBe(42);
    expect(normalizeReceiptColumns(32)).toBe(32);
  });

  it("clamps nonsense into the printable range", () => {
    expect(normalizeReceiptColumns(0)).toBe(32);
    expect(normalizeReceiptColumns(1000)).toBe(48);
    expect(normalizeReceiptColumns(null)).toBe(48);
    expect(normalizeReceiptColumns(undefined)).toBe(48);
    expect(normalizeReceiptColumns(Number.NaN)).toBe(48);
  });
});

describe("buildPrintJob", () => {
  const text = "HIBA FOOD\nTicket N° 42\nTOTAL 22,50 €";

  it("resets, selects the code page, prints, feeds and cuts", () => {
    const job = bytes(buildPrintJob(text));
    expect(job.slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x74, 16]);
    expect(job.slice(-4)).toEqual([0x1d, 0x56, 66, 0]);
  });

  it("passes the rendered text through verbatim", () => {
    // The printed ticket and the archived Receipt.content must be the same
    // string — nothing in the print path may reflow or re-wrap it.
    const job = buildPrintJob(text);
    expect(job.includes(encodeText(text))).toBe(true);
  });

  it("kicks the drawer only when asked, after the cut", () => {
    const withDrawer = bytes(buildPrintJob(text, { openDrawer: true }));
    expect(withDrawer.slice(-5)).toEqual([0x1b, 0x70, 0, 25, 250]);

    // Check for the ESC p sequence, not the byte 0x70 on its own — that is
    // also the letter "p", which appears in plenty of receipt text.
    const withoutDrawer = buildPrintJob(text);
    expect(withoutDrawer.includes(Buffer.from([0x1b, 0x70]))).toBe(false);
  });

  it("can skip the cut for a continuous-roll printer", () => {
    const job = bytes(buildPrintJob(text, { cutPaper: false }));
    expect(job.slice(-3)).toEqual([0x1b, 0x64, 4]);
  });

  it("always terminates the last line so the cut does not eat it", () => {
    const unterminated = buildPrintJob("no trailing newline");
    expect(unterminated.includes(Buffer.from([0x0d, 0x0a]))).toBe(true);
  });
});
