import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import path from "path";
import { ReceiptPrintable } from "@/components/pos/receipt-dialog";

// L-97 (R9.1) — the paper the customer is handed IS the archived document.
//
// THE FINDING. `globals.css` hides `body *` in print media and shows only
// `#receipt-print`. That id sat on the styled block the cashier READS, which is
// a second rendering built from the order DTO — so `window.print()` produced a
// ticket that was never the one `renderReceipt` sealed into `Receipt.content`
// inside the checkout transaction. The two disagree by four things, listed and
// asserted below. The worst of them is the FACTICE stamp: `factice` is `true`
// in production today, so the customer's copy did not say it was invalid.
//
// It is not a rare path. `autoPrint` fires it 350 ms after the dialog opens,
// with nobody looking, and while the ESC/POS transport is unconfigured — R6.4 —
// the browser is the ONLY way anything reaches paper.
//
// WHY THIS FILE RENDERS A COMPONENT RATHER THAN THE DIALOG. `DialogContent`
// portals, and `react-dom/server` yields nothing for a portal, so the dialog
// cannot be rendered here at all. « Nothing rendered it » is exactly how L-100
// reached the till, so the node that must be right was extracted into
// `ReceiptPrintable` and is rendered here for real. The half that a rendering
// cannot see — that the id is not ALSO on the styled block, and that the
// stylesheet still keys on it — is read out of the two source files, because a
// test that passes after someone moves the id back is not a test.

const SEALED = [
  "*** TICKET FACTICE — SANS VALEUR ***",
  "        HibaPOS France",
  "Reçu N° 2026-000123",
  "Caisse N° 1",
  "--------------------------------",
  "1 x Tacos                  9,50 €",
  "--------------------------------",
  "TOTAL                      9,50 €",
  "Détail TVA",
  "  10,00 %   TVA 0,86 €   HT 8,64 €",
  "HibaPOS 1.0.0 — certifié n/a",
].join("\n");

function markup(content: string | null | undefined): string {
  return renderToStaticMarkup(<ReceiptPrintable content={content} />);
}

function source(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("L-97 — what prints is the sealed text, not a re-rendering", () => {
  it("carries the print id", () => {
    expect(markup(SEALED)).toContain('id="receipt-print"');
  });

  it("prints the sealed text verbatim", () => {
    const html = markup(SEALED);
    // Line by line, so a partial match cannot pass for the document.
    for (const line of SEALED.split("\n")) {
      expect(html, `the sealed line ${JSON.stringify(line)} is not on the paper`).toContain(
        line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
      );
    }
  });

  it("carries the four things the DTO re-rendering dropped", () => {
    // Named individually rather than as one blob, so a regression says WHICH.
    const html = markup(SEALED);
    expect(html, "the FACTICE stamp — the customer's copy did not say it was invalid").toContain(
      "FACTICE",
    );
    expect(html, "Caisse N°").toContain("Caisse N° 1");
    expect(html, "the per-rate VAT breakdown").toContain("Détail TVA");
    expect(html, "the software identity line").toContain("HibaPOS 1.0.0");
  });

  it("renders nothing at all when there is no sealed document", () => {
    // Not a blank `#receipt-print`: an empty element with that id still wins the
    // print stylesheet and hands over a blank page. Nothing means the dialog's
    // own guard is what the operator meets.
    expect(markup(null)).toBe("");
    expect(markup(undefined)).toBe("");
    expect(markup("")).toBe("");
  });

  it("is hidden on screen and shown only in print", () => {
    // `hidden print:block`, not a visibility class: `display: none` beats the
    // stylesheet's `visibility: visible`, so the wrong pair here prints blank
    // or shows the raw text twice on screen.
    const html = markup(SEALED);
    expect(html).toMatch(/class="[^"]*\bhidden\b[^"]*"/);
    expect(html).toMatch(/class="[^"]*\bprint:block\b[^"]*"/);
  });
});

describe("L-97 — the id is not also on the block the cashier reads", () => {
  it("appears exactly once in the dialog's source", () => {
    // The regression this finding IS: two elements carrying the id, the styled
    // one winning, and the paper silently becoming the re-rendering again.
    const dialog = source(path.join("src", "components", "pos", "receipt-dialog.tsx"));
    const hits = dialog.match(/id="receipt-print"/g) ?? [];
    expect(hits.length, "receipt-print is declared more than once, or not at all").toBe(1);
  });

  it("declares it on ReceiptPrintable, not on the styled block", () => {
    const dialog = source(path.join("src", "components", "pos", "receipt-dialog.tsx"));
    const printable = /export function ReceiptPrintable\b[\s\S]*?\n}/.exec(dialog);
    expect(printable, "ReceiptPrintable is gone — this file's subject moved").not.toBeNull();
    expect(printable![0]).toContain('id="receipt-print"');
    // And the styled block, which is the one that used to have it.
    expect(dialog).toContain("receipt-paper min-h-0");
    const styled = dialog.slice(dialog.indexOf("receipt-paper min-h-0"));
    expect(styled, "the id is back on the block the cashier reads").not.toContain(
      'id="receipt-print"',
    );
  });

  it("is still the id the print stylesheet keys on", () => {
    // Without this the two source checks above are vacuous: rename the id in
    // both files and everything passes while nothing prints.
    const css = source(path.join("src", "app", "globals.css"));
    expect(css).toContain("#receipt-print");
    expect(css).toMatch(/body\s*\*\s*\{\s*visibility:\s*hidden/);
  });
});

describe("L-97 — the dialog will not print what it does not have", () => {
  const dialog = source(path.join("src", "components", "pos", "receipt-dialog.tsx"));

  it("gates auto-print on the sealed text", () => {
    // `autoPrint` is unattended. Firing it with no `#receipt-print` in the tree
    // pushes a blank page out of the printer and reports nothing.
    expect(dialog).toMatch(/settings\?\.autoPrint\s*&&\s*sealed/);
  });

  it("disables the print button rather than printing something else", () => {
    expect(dialog).toContain("disabled={!sealed}");
  });

  it("includes the sealed text in the order DTO", () => {
    // The other end of the same property: the field has to arrive for any of
    // this to work, and `checkout.ts` is where it is selected.
    const checkout = source(path.join("src", "lib", "services", "checkout.ts"));
    const include = /const ORDER_DTO_INCLUDE = \{[\s\S]*?\} as const;/.exec(checkout);
    expect(include, "ORDER_DTO_INCLUDE is gone — this assertion moved").not.toBeNull();
    expect(include![0]).toContain("receipt:");
    expect(include![0]).toContain("content: true");
  });
});
