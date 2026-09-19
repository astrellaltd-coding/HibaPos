import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { renderDeliveryNote, type OrderForDeliveryNote } from "@/lib/services/delivery-note";
import type { SettingsDto } from "@/types/api";

// L-222 — THE DOCUMENT THE DRIVER ACTUALLY NEEDS.
//
// THE FINDING, reported by the restaurant's owner at the caisse on 2026-09-18:
// the delivery ticket said « Type : Livraison » and nothing whatever about who
// or where. Nothing pointed at it — every delivery test asserted that the ORDER
// was accepted or refused, and the one test that rendered a LIVRAISON ticket
// read only the word « Livraison » with `customer: { name: "Jean Dupont" }`
// sitting unasserted in its own fixture.
//
// THE DECISION THIS FILE PINS is the operator's, taken 2026-09-18 with both
// shapes in writing. `Receipt.content` is sealed and `buildAnnualArchive` copies
// it verbatim into the archive file for the exercice, so a home address put
// there is permanent. The sealed ticket therefore carries the NAME
// (`receipt.test.ts`), and everything else is here, on a slip that is printed
// and never stored.
//
// So the assertions come in pairs: what this document SAYS, and what it must
// NOT say. The second half is the decision; the first is only layout.

const baseSettings: Partial<SettingsDto> = {
  restaurantName: "HibaPOS Test",
  receiptWidth: 42,
  factice: false,
};

const delivery: OrderForDeliveryNote = {
  number: 42,
  orderType: "LIVRAISON",
  createdAt: "2026-09-18T17:41:00.000Z",
  notes: null,
  customer: {
    name: "Jean Dupont",
    phone: "06 12 13 14 15",
    address: "12 rue des Lilas",
    city: "Villeurbanne",
  },
};

describe("L-222 — the bon de livraison", () => {
  it("TELLS THE DRIVER WHERE TO GO, which no printed document did", () => {
    const note = renderDeliveryNote(delivery, baseSettings);
    expect(note, "a delivery with a complete client got no slip").not.toBeNull();
    expect(note).toContain("Jean Dupont");
    expect(note).toContain("06 12 13 14 15");
    expect(note).toContain("12 rue des Lilas");
  });

  it("puts the town in capitals, under the street, as an address is written", () => {
    const note = renderDeliveryNote(delivery, baseSettings)!;
    const lines = note.split("\n");
    const street = lines.findIndex((l) => l.includes("12 rue des Lilas"));
    const town = lines.findIndex((l) => l.includes("VILLEURBANNE"));
    expect(town, "the town is not on the slip in capitals").toBeGreaterThan(-1);
    expect(town, "the town is printed above the street").toBe(street + 1);
  });

  it("SAYS IT IS NOT A FISCAL DOCUMENT, in its own title block", () => {
    // The half that keeps this slip from ever being handed over as a receipt.
    const note = renderDeliveryNote(delivery, baseSettings)!;
    expect(note).toContain("BON DE LIVRAISON");
    expect(note).toContain("DOCUMENT NON FISCAL");
  });

  it("CARRIES NO MONEY, NO VAT AND NO FISCAL IDENTITY", () => {
    // Deliberate, and the reason is that this document is not journalled and
    // not archived. A total on it would buy the driver nothing — the sale is
    // settled at the till before this prints — and would invite the slip being
    // treated as the ticket.
    const note = renderDeliveryNote(delivery, baseSettings)!;
    for (const forbidden of ["TOTAL", "TVA", "SIRET", "Paiements", "€"]) {
      expect(note, `the slip prints « ${forbidden} », which belongs on the ticket`).not.toContain(
        forbidden,
      );
    }
  });

  it("ties itself to the ticket by the order number, and nothing else", () => {
    const note = renderDeliveryNote(delivery, baseSettings)!;
    expect(note).toContain("Commande N° 42");
    // `Ticket N°` is the sealed receipt's own wording. Two documents saying
    // « Ticket N° 42 » would be two tickets.
    expect(note).not.toContain("Ticket N°");
  });

  it("prints the order's note, which is where a door code goes", () => {
    const note = renderDeliveryNote(
      { ...delivery, notes: "Code 34B2, 3e étage, sonner chez Martin" },
      baseSettings,
    )!;
    expect(note).toContain("Code 34B2, 3e étage, sonner chez Martin");
  });

  it("carries the FACTICE stamp when the caisse is in simulation", () => {
    // The person holding this is on a doorstep, not in front of the till, so a
    // test delivery says so on the paper like every other document here.
    const note = renderDeliveryNote(delivery, { ...baseSettings, factice: true })!;
    expect(note).toContain("FACTICE");
  });

  describe("when NO slip is owed, it returns null rather than an empty one", () => {
    // One return value and one check, so that every caller has exactly one
    // condition to get right — the shape L-214 was about.
    it("on a sur-place or an à-emporter order", () => {
      expect(renderDeliveryNote({ ...delivery, orderType: "DINE_IN" }, baseSettings)).toBeNull();
      expect(renderDeliveryNote({ ...delivery, orderType: "TAKEAWAY" }, baseSettings)).toBeNull();
    });

    it("on a delivery with no customer row at all", () => {
      expect(renderDeliveryNote({ ...delivery, customer: null }, baseSettings)).toBeNull();
      expect(renderDeliveryNote({ ...delivery, customer: undefined }, baseSettings)).toBeNull();
    });

    it("on a delivery whose client is a name of whitespace", () => {
      // The same whitespace rule `missingForDelivery` applies. A slip headed by
      // a blank line is worse on paper than no slip.
      expect(
        renderDeliveryNote({ ...delivery, customer: { ...delivery.customer!, name: "   " } }, baseSettings),
      ).toBeNull();
    });
  });

  it("NEVER EXCEEDS THE PAPER, at the narrowest width the settings allow", () => {
    // L-63: nothing downstream can rescue an over-long line — `buildPrintJob`
    // passes the text through verbatim — so it wraps here or not at all.
    const long: OrderForDeliveryNote = {
      ...delivery,
      notes: "Sonner trois fois puis attendre devant la porte vitrée du fond à gauche du hall",
      customer: {
        name: "Jean-Baptiste de la Tour du Pin Verclause",
        phone: "06 12 13 14 15",
        address: "1287 boulevard du Maréchal Jean-Marie de Lattre de Tassigny, bâtiment C, escalier 4",
        city: "Saint-Rémy-en-Bouzemont-Saint-Genest-et-Isson",
      },
    };
    for (const width of [32, 42, 48]) {
      const note = renderDeliveryNote(long, { ...baseSettings, receiptWidth: width })!;
      for (const line of note.split("\n")) {
        expect(line.length, `a ${line.length}-column line on ${width}-column paper: « ${line} »`)
          .toBeLessThanOrEqual(width);
      }
    }
  });

  it("WRITES NOTHING ANYWHERE — no database, no fiscal event, no audit row", () => {
    // Asserted against the source because there is no other way to assert an
    // absence of side effects, and because this is the property that makes the
    // slip non-fiscal. Comments are stripped first: this file's own header
    // explains the decision using the words « fiscal event » and « audit »,
    // and an assertion must be made against the code, not against the prose
    // written to explain it (L-214's lesson, third occurrence).
    const src = readFileSync(path.join(process.cwd(), "src/lib/services/delivery-note.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const forbidden of ["db.", "prisma", "appendFiscalEvent", "auditLog", "audit("]) {
      expect(src, `the slip module reaches for « ${forbidden} »`).not.toContain(forbidden);
    }
  });
});
