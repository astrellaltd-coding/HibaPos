import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  renderDeliveryNote,
  deliveryPaper,
  deliveryNoteOutcome,
  type OrderForDeliveryNote,
} from "@/lib/services/delivery-note";
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

  it("NO LONGER CLAIMS TO BE A DOCUMENT OF ITS OWN — one slip since 2026-09-27", () => {
    // WHAT THIS TEST USED TO PIN, and why the replacement is not a weakening.
    // It asserted « BON DE LIVRAISON » and « DOCUMENT NON FISCAL », a title
    // block whose job was to stop the slip being handed over AS A RECEIPT.
    //
    // The owner asked for one piece of paper, so the block is now composed onto
    // the ticket and the cutter runs once (`deliveryPaper`). It cannot be
    // handed over as a receipt because it cannot be separated from one — which
    // is a stronger guarantee than a title saying so, and it is pinned by
    // « ONE PRINT JOB » in `delivery-note-print.test.ts`.
    //
    // What must still hold is that nothing here reads as fiscal, and that is
    // the test below: no money, no VAT, no SIRET.
    const note = renderDeliveryNote(delivery, baseSettings)!;
    expect(note).not.toContain("BON DE LIVRAISON");
    expect(note).not.toContain("DOCUMENT NON FISCAL");
    // It still says what it is, in one word, so the driver can find it.
    expect(note).toContain("LIVRAISON");
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

  it("REPEATS NOTHING THE TICKET ABOVE IT ALREADY SAYS", () => {
    // The owner's actual complaint on 2026-09-27 — « the second one is useless,
    // it has the same information ». He was right about the order number and
    // the date, which did repeat the ticket, and wrong about the telephone and
    // the address, which appear nowhere else and are still here.
    //
    // The order number tied the two documents together when they were two. On
    // one slip there is nothing to tie.
    const note = renderDeliveryNote(delivery, baseSettings)!;
    expect(note).not.toContain("Commande N° 42");
    expect(note).not.toContain("18/09/2026");
    // `Ticket N°` is the sealed receipt's own wording, and printing it twice
    // would read as two tickets.
    expect(note).not.toContain("Ticket N°");
    // What is NOT a repetition, and is the whole reason the block survives:
    expect(note).toContain("06 12 13 14 15");
    expect(note).toContain("12 rue des Lilas");
  });

  it("prints the order's note, which is where a door code goes", () => {
    const note = renderDeliveryNote(
      { ...delivery, notes: "Code 34B2, 3e étage, sonner chez Martin" },
      baseSettings,
    )!;
    expect(note).toContain("Code 34B2, 3e étage, sonner chez Martin");
  });

  it("does NOT repeat the FACTICE stamp — the ticket above it carries it once", () => {
    // This block used to stamp itself, because it was its own document printed
    // on its own paper and the person holding it was on a doorstep rather than
    // in front of the till. On one slip the ticket's banner is a few lines up,
    // and stamping twice on one piece of paper reads as two documents again.
    const note = renderDeliveryNote(delivery, { ...baseSettings, factice: true })!;
    expect(note).not.toContain("FACTICE");
  });

  it("the composed paper still carries the stamp — exactly once", () => {
    // The pair to the test above: the stamp did not disappear, it stopped being
    // duplicated. Counted rather than merely found, because « contains » would
    // pass on two.
    const paper = deliveryPaper(
      "*** FACTICE — SIMULATION ***\nTicket N° 42\nTOTAL 12,00 €",
      delivery,
      { ...baseSettings, factice: true },
    ).paper;
    expect(paper.match(/FACTICE/g)).toHaveLength(1);
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

describe("deliveryPaper — one slip, and the sealed ticket untouched", () => {
  const TICKET = "Ticket N° 42\nTOTAL                12,00 €\nMerci de votre visite !";

  it("puts the ticket FIRST and the delivery block under it", () => {
    const { paper, owed } = deliveryPaper(TICKET, delivery, baseSettings);
    expect(owed).toBe(true);
    expect(paper.startsWith(TICKET), "the sealed ticket is not at the top of the paper").toBe(true);
    expect(paper.indexOf("12 rue des Lilas")).toBeGreaterThan(paper.indexOf("TOTAL"));
  });

  it("PASSES THE SEALED TICKET THROUGH BYTE FOR BYTE", () => {
    // The decision of 2026-09-18, reaffirmed 2026-09-27: the address is
    // appended at PRINT time and never enters `Receipt.content`. If this
    // function ever rewrote the ticket it was handed, the paper and the
    // archived document would part company silently.
    const { paper } = deliveryPaper(TICKET, delivery, baseSettings);
    expect(paper.slice(0, TICKET.length)).toBe(TICKET);
  });

  it("returns the ticket unchanged, and owes nothing, when there is no delivery", () => {
    for (const orderType of ["DINE_IN", "TAKEAWAY"] as const) {
      const { paper, owed } = deliveryPaper(TICKET, { ...delivery, orderType }, baseSettings);
      expect(owed, `${orderType} was given a delivery block`).toBe(false);
      expect(paper).toBe(TICKET);
    }
  });

  it("owes nothing when the delivery has no deliverable customer", () => {
    const { paper, owed } = deliveryPaper(TICKET, { ...delivery, customer: null }, baseSettings);
    expect(owed).toBe(false);
    expect(paper).toBe(TICKET);
  });
});

describe("deliveryNoteOutcome — L-143's three states survive the merge", () => {
  // The trap the merge created: on one print job there is no separate outcome
  // for the block, and `ok: false` covers both « it failed » and « it was never
  // attempted ». Reporting the second as a failure is the exact mistake L-143
  // found in the reprint route.
  it("reports nothing when no block was owed, whatever the printer did", () => {
    expect(deliveryNoteOutcome(false, { ok: true, target: "usb" })).toBeNull();
    expect(
      deliveryNoteOutcome(false, { ok: false, reason: "FAILED", code: "E", message: "m", target: "usb" }),
    ).toBeNull();
  });

  it("reports TRUE when the paper came out", () => {
    expect(deliveryNoteOutcome(true, { ok: true, target: "usb" })).toBe(true);
  });

  it("reports FALSE only when it was attempted and failed", () => {
    expect(
      deliveryNoteOutcome(true, { ok: false, reason: "FAILED", code: "E", message: "m", target: "usb" }),
    ).toBe(false);
  });

  it("reports NULL — not false — when printing is off or unconfigured", () => {
    // A till with the printer switched off has not failed to print a slip.
    for (const reason of ["DISABLED", "NOT_CONFIGURED"] as const) {
      expect(
        deliveryNoteOutcome(true, { ok: false, reason, message: "m" }),
        `${reason} was reported as a failure`,
      ).toBeNull();
    }
  });
});
