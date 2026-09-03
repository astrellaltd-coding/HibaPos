// Printer service (C-03, Batch 1.3) — settings + ESC/POS + transport.
//
// The one rule this file exists to enforce: **printing must never lose a
// sale.** The order, its payments and its fiscal event are committed before
// anything is sent to the printer, and every function here resolves with an
// outcome instead of throwing. A dead printer degrades the ticket, not the
// transaction — the cashier gets a warning and can reprint from the order.

import { getSettings } from "@/lib/services/settings";
import { buildPrintJob, drawerKick, init, normalizeReceiptColumns } from "@/lib/services/escpos";
import {
  PrinterError,
  createTcpTransport,
  type PrinterTransport,
} from "@/lib/services/printer-transport";

export type PrintOutcome =
  | { ok: true; target: string }
  | { ok: false; reason: "DISABLED" | "NOT_CONFIGURED"; message: string }
  | { ok: false; reason: "FAILED"; code: string; message: string; target: string };

/**
 * Build the configured transport, or explain why there isn't one.
 *
 * Printing disabled and printing misconfigured are deliberately different
 * outcomes: the first is a choice (the restaurant may not have wired the
 * printer yet) and must stay silent, the second is a mistake worth telling
 * the operator about.
 */
export async function resolvePrinter(deps: { transport?: PrinterTransport } = {}): Promise<
  { ok: true; transport: PrinterTransport } | { ok: false; outcome: PrintOutcome }
> {
  if (deps.transport) return { ok: true, transport: deps.transport };

  const settings = await getSettings();
  if (!settings.printerEnabled) {
    return {
      ok: false,
      outcome: {
        ok: false,
        reason: "DISABLED",
        message: "Impression désactivée dans les réglages.",
      },
    };
  }
  const host = (settings.printerHost ?? "").trim();
  if (!host) {
    return {
      ok: false,
      outcome: {
        ok: false,
        reason: "NOT_CONFIGURED",
        message: new PrinterError("NOT_CONFIGURED", "", "").operatorMessage,
      },
    };
  }
  return {
    ok: true,
    transport: createTcpTransport({ host, port: settings.printerPort }),
  };
}

/** Send an already-assembled job, converting any failure into an outcome. */
async function deliver(transport: PrinterTransport, job: Buffer): Promise<PrintOutcome> {
  try {
    await transport.send(job);
    return { ok: true, target: transport.describe() };
  } catch (err) {
    if (err instanceof PrinterError) {
      return {
        ok: false,
        reason: "FAILED",
        code: err.code,
        message: err.operatorMessage,
        target: err.target,
      };
    }
    return {
      ok: false,
      reason: "FAILED",
      code: "UNKNOWN",
      message: "Échec de l'impression.",
      target: transport.describe(),
    };
  }
}

/**
 * Print a receipt.
 *
 * `text` must be the exact string stored as `Receipt.content` — the printed
 * ticket and the archived fiscal artifact have to be the same document, so
 * this function formats nothing.
 */
export async function printReceiptText(
  text: string,
  opts: { openDrawer?: boolean } = {},
  deps: { transport?: PrinterTransport } = {},
): Promise<PrintOutcome> {
  const resolved = await resolvePrinter(deps);
  if (!resolved.ok) return resolved.outcome;
  return deliver(resolved.transport, buildPrintJob(text, { openDrawer: opts.openDrawer }));
}

/**
 * Pulse the drawer without printing anything.
 *
 * Used by the traced manual-open path. The fiscal `OUVERTURE_TIROIR` event is
 * the caller's responsibility — the drawer must be journalled whether or not
 * the solenoid actually fired, so the event is written first and this is
 * best-effort.
 */
export async function openCashDrawer(
  deps: { transport?: PrinterTransport } = {},
): Promise<PrintOutcome> {
  const resolved = await resolvePrinter(deps);
  if (!resolved.ok) return resolved.outcome;
  return deliver(resolved.transport, Buffer.concat([init(), drawerKick()]));
}

/**
 * Commissioning self-test: the receipt an operator prints to prove the
 * printer works before the restaurant opens.
 *
 * It deliberately exercises everything that can be wrong on a fresh install
 * — the column width, the accented characters, the euro sign, the cut and
 * (optionally) the drawer — so one sheet of paper answers every question.
 */
export async function printTestPage(
  opts: { openDrawer?: boolean } = {},
  deps: { transport?: PrinterTransport } = {},
): Promise<PrintOutcome & { columns?: number }> {
  const settings = await getSettings();
  const columns = normalizeReceiptColumns(settings.receiptWidth);
  const resolved = await resolvePrinter(deps);
  if (!resolved.ok) return resolved.outcome;

  const outcome = await deliver(
    resolved.transport,
    buildPrintJob(renderTestPage(columns, settings.restaurantName), {
      openDrawer: opts.openDrawer,
    }),
  );
  return { ...outcome, columns };
}

/** The self-test ticket body. Pure, so its layout is unit-testable. */
export function renderTestPage(columns: number, restaurantName = "HibaPOS"): string {
  const center = (s: string) =>
    " ".repeat(Math.max(0, Math.floor((columns - s.length) / 2))) + s;
  // A ruler the operator can read: if the digits wrap, the column count is
  // wrong for this paper and receiptWidth needs correcting (L-13).
  const ruler = Array.from({ length: columns }, (_, i) => String((i + 1) % 10)).join("");

  return [
    center("*** TEST IMPRIMANTE ***"),
    center(restaurantName),
    "-".repeat(columns),
    `Largeur configuree : ${columns} colonnes`,
    ruler,
    "-".repeat(columns),
    "Accents : é è ê à ç ù û î ô œ °",
    "Euro    : 12,50 € — 1 234,56 €",
    "-".repeat(columns),
    center("Si la regle ci-dessus tient"),
    center("sur une ligne, c'est bon."),
    "",
  ].join("\n");
}
