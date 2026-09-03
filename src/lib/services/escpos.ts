// ESC/POS command layer for the thermal receipt printer (C-03, Batch 1.3).
//
// Pure byte assembly — no I/O whatsoever. Everything here is a deterministic
// function from (text, options) to bytes, so the whole command surface is
// unit-testable byte for byte without hardware. Sending is the transport's
// job (printer-transport.ts).
//
// Target: Sunso WTP-801 (80 mm, ESC/POS, cash drawer on the DK port). The
// command set below is the common ESC/POS core that every 80 mm thermal
// printer implements; nothing vendor-specific is used.

const ESC = 0x1b;
const GS = 0x1d;

/**
 * Printer character code pages, by their ESC t argument.
 *
 * We only support WPC1252 (page 16). It carries the whole French repertoire
 * — accented vowels, ç, œ and the € sign — and, unlike CP858, its byte table
 * can be derived from the runtime's own decoder instead of a hand-typed
 * table, so it cannot silently contain a transcription error. If the printer
 * on site turns out not to support page 16, the self-test receipt will show
 * it immediately and another page can be added against real hardware.
 */
export const CODE_PAGE_WPC1252 = 16;

/** Font A column counts. Font B is narrower but too small for a receipt. */
const COLUMNS_BY_PAPER_MM: Record<number, number> = { 58: 32, 80: 48 };

/**
 * Printable columns for a paper width in millimetres (L-13).
 *
 * `receiptWidth` is a COLUMN count, not a millimetre value — `renderReceipt`
 * uses it as one. The shipped default (80) and the live setting were a
 * millimetre value, which would render every ticket 80 columns wide on a
 * printer that can only fit 48. This helper is what the settings UI should
 * offer ("80 mm → 48 colonnes"), and `normalizeReceiptColumns` repairs the
 * legacy values without touching the stored row.
 */
export function columnsForPaperMm(mm: number): number {
  return COLUMNS_BY_PAPER_MM[mm] ?? 48;
}

/**
 * Coerce a stored `receiptWidth` into a usable column count.
 *
 * Legacy rows hold a paper width in millimetres (58 or 80). Those are mapped
 * to their column counts; anything else is clamped into the printable range.
 * Deliberately does NOT write back — settings are the operator's to change,
 * and a fiscal artifact's width should not be silently rewritten by a read.
 */
export function normalizeReceiptColumns(receiptWidth: number | null | undefined): number {
  if (receiptWidth == null || !Number.isFinite(receiptWidth)) return 48;
  if (receiptWidth in COLUMNS_BY_PAPER_MM) return COLUMNS_BY_PAPER_MM[receiptWidth];
  return Math.min(48, Math.max(32, Math.round(receiptWidth)));
}

// ---------------------------------------------------------------------------
// Text encoding
// ---------------------------------------------------------------------------

/**
 * CP1252 byte table, derived once from the runtime's own decoder.
 *
 * Building it by decoding 0x20–0xFF (rather than typing 96 mappings by hand)
 * makes a transcription error impossible. C1 controls (0x80–0x9F) that CP1252
 * leaves undefined decode to control characters and are skipped.
 */
const cp1252ByChar: Map<string, number> = (() => {
  const map = new Map<string, number>();
  const decoder = new TextDecoder("windows-1252");
  for (let byte = 0x20; byte <= 0xff; byte++) {
    const char = decoder.decode(new Uint8Array([byte]));
    // Undefined slots decode to a C1 control or the replacement character.
    if (char.length !== 1) continue;
    const code = char.charCodeAt(0);
    if (code === 0xfffd || (code >= 0x80 && code <= 0x9f)) continue;
    if (!map.has(char)) map.set(char, byte);
  }
  return map;
})();

/**
 * Last-resort ASCII renderings for characters no code page slot can carry.
 * A receipt that reads "EUR" is recoverable; one full of "?" is not.
 */
const ASCII_FALLBACK: Record<string, string> = {
  "€": "EUR",
  "œ": "oe",
  "Œ": "OE",
  æ: "ae",
  Æ: "AE",
  ß: "ss",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "…": "...",
};

/**
 * Whitespace that must reach the printer as a plain space.
 *
 * fr-FR number formatting emits NBSP before "€" and narrow NBSP as the
 * thousands separator. NBSP does have a CP1252 slot, but printers render
 * 0xA0 inconsistently, so both are flattened before the table lookup.
 */
const SPACE_LIKE = /[\u00a0\u202f\u2009]/g;

/** Strip combining marks: "é" → "e". Handles anything NFD can decompose. */
function foldToAscii(char: string): string {
  const explicit = ASCII_FALLBACK[char];
  if (explicit !== undefined) return explicit;
  const stripped = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Only accept the fold if it produced plain ASCII; otherwise drop the
  // character rather than emitting a byte the printer would render as noise.
  return /^[\x20-\x7e]*$/.test(stripped) ? stripped : "";
}

/**
 * Encode receipt text for the printer.
 *
 * Characters present in CP1252 are emitted directly; anything else is folded
 * to ASCII (é→e, €→EUR) so an unexpected character degrades the ticket
 * instead of corrupting it. Newlines become CR LF, which every ESC/POS
 * printer treats as a line feed.
 */
export function encodeText(text: string): Buffer {
  const bytes: number[] = [];
  for (const char of text.replace(SPACE_LIKE, " ")) {
    if (char === "\n") {
      bytes.push(0x0d, 0x0a);
      continue;
    }
    const direct = cp1252ByChar.get(char);
    if (direct !== undefined) {
      bytes.push(direct);
      continue;
    }
    for (const folded of foldToAscii(char)) {
      const byte = cp1252ByChar.get(folded);
      if (byte !== undefined) bytes.push(byte);
    }
  }
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** ESC @ — reset the printer to its power-on state. */
export function init(): Buffer {
  return Buffer.from([ESC, 0x40]);
}

/** ESC t n — select the character code table. */
export function selectCodePage(page: number = CODE_PAGE_WPC1252): Buffer {
  return Buffer.from([ESC, 0x74, page & 0xff]);
}

/** ESC d n — feed n lines. */
export function feed(lines: number): Buffer {
  return Buffer.from([ESC, 0x64, Math.min(255, Math.max(0, Math.round(lines)))]);
}

/**
 * GS V — cut the paper.
 *
 * Function B (`GS V 66 n`) feeds n dot-lines past the cutter before cutting,
 * which is what stops the last lines of the ticket ending up inside the
 * mechanism. `full` cuts right through; the default partial cut leaves a
 * small tab so the ticket does not fall on the floor.
 */
export function cut(opts: { full?: boolean; feedDots?: number } = {}): Buffer {
  const feedDots = Math.min(255, Math.max(0, Math.round(opts.feedDots ?? 0)));
  return Buffer.from([GS, 0x56, opts.full ? 65 : 66, feedDots]);
}

/**
 * ESC p m t1 t2 — pulse the cash-drawer kick line.
 *
 * The drawer is wired to the printer's DK port and opened by a solenoid
 * pulse. `m` selects the pin (0 = pin 2, the near-universal wiring; 1 = pin
 * 5). t1/t2 are the on/off durations in units of 2 ms, so the customary
 * 25/250 arguments mean 50 ms energised and a 500 ms minimum gap before the
 * next pulse — long enough to throw the solenoid, short enough not to cook
 * the coil.
 */
export function drawerKick(opts: { pin?: 2 | 5; onMs?: number; offMs?: number } = {}): Buffer {
  const m = opts.pin === 5 ? 1 : 0;
  const toUnits = (ms: number) => Math.min(255, Math.max(0, Math.round(ms / 2)));
  return Buffer.from([ESC, 0x70, m, toUnits(opts.onMs ?? 50), toUnits(opts.offMs ?? 500)]);
}

/**
 * Assemble a complete print job: reset, select the code page, print the
 * already-formatted receipt text, feed clear of the cutter, cut, and
 * optionally kick the drawer.
 *
 * The text is passed through verbatim — `renderReceipt()` has already laid it
 * out to the right column count, and that same string is what is stored as
 * the fiscal `Receipt.content`. Nothing here may reflow it, or the printed
 * ticket would stop matching the archived one.
 */
export function buildPrintJob(
  text: string,
  opts: { openDrawer?: boolean; codePage?: number; cutPaper?: boolean } = {},
): Buffer {
  const parts: Buffer[] = [
    init(),
    selectCodePage(opts.codePage ?? CODE_PAGE_WPC1252),
    encodeText(text.endsWith("\n") ? text : `${text}\n`),
    feed(4),
  ];
  if (opts.cutPaper !== false) parts.push(cut());
  if (opts.openDrawer) parts.push(drawerKick());
  return Buffer.concat(parts);
}
