import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { wipeDatabase } from "@/lib/test-wipe";
import type { PrinterDeps } from "@/lib/services/printer";
import { createPrintHandler } from "@/app/api/orders/[id]/print/route";
import { createReprintHandler } from "@/app/api/orders/[id]/reprint/route";

// L-222 — WHAT COMES OUT OF THE PRINTER FOR A DELIVERY, read off the bytes.
//
// THE FINDING, from the restaurant's owner at the caisse on 2026-09-18: the
// delivery ticket said « Type : Livraison » and nothing about who or where, so
// the driver was handed a ticket with no destination on it. Nothing pointed at
// it because every delivery test asserted that the ORDER was accepted or
// refused, and none had ever read what was printed.
//
// `delivery-note.test.ts` proves the slip RENDERS. This file proves the ROUTES
// PRINT IT — the gap this project has shipped three times, where a unit test on
// an extracted rule proves the rule and not that anything calls it. So the
// assertions here are made on the captured ESC/POS payloads and on nothing else.
//
// The capturing transport is L-186's, and the reason it exists: `resolvePrinter`
// returns an injected transport BEFORE it reads settings, so a test supplies one
// and does not have to arrange a printer configuration as well.

const PIN = "636363";
let manager: { id: string; username: string; role: "MANAGER" };

/** A transport that accepts everything and keeps what it was given. */
function capturing(): PrinterDeps & { jobs: Buffer[] } {
  const jobs: Buffer[] = [];
  return {
    jobs,
    transport: {
      async send(payload: Buffer) {
        jobs.push(payload);
      },
      describe: () => "test:capture",
    },
  };
}

/** A transport that fails the way a real one does: the send rejects. */
function failing(): PrinterDeps & { jobs: Buffer[] } {
  const jobs: Buffer[] = [];
  return {
    jobs,
    transport: {
      async send(payload: Buffer) {
        jobs.push(payload);
        throw new Error("test: the printer is on fire");
      },
      describe: () => "test:failing",
    },
  };
}

/**
 * One printed job, as text.
 *
 * DECODED AS LATIN-1 AND NOT AS UTF-8, which is not a detail: `encodeText`
 * emits CP1252 (`escpos.ts`), so « é » leaves this application as the single
 * byte 0xE9. Read back as UTF-8 that is a replacement character, and the first
 * version of this file asserted on a door code containing « étage » and failed
 * for exactly that reason. CP1252 and Latin-1 agree on every accented vowel the
 * French repertoire uses; they differ in 0x80–0x9F, which is where the em dash
 * lives, so nothing here asserts on one.
 */
const text = (job: Buffer) => job.toString("latin1");

/** Everything that reached the printer, as one string. */
const printed = (jobs: Buffer[]) => jobs.map(text).join("\n");

async function sale(opts: {
  orderType?: "DINE_IN" | "TAKEAWAY" | "LIVRAISON";
  customer?: { name: string; phone?: string; address?: string; city?: string } | null;
  notes?: string | null;
} = {}) {
  const shift = await db.shift.create({
    data: {
      number: 1,
      openedById: manager.id,
      openedAt: new Date(2026, 8, 18, 10, 0),
      status: "OPEN",
      openingFloat: 5000,
    },
  });
  const customer = opts.customer
    ? await db.customer.create({
        data: {
          name: opts.customer.name,
          phone: opts.customer.phone ?? null,
          address: opts.customer.address ?? null,
          city: opts.customer.city ?? null,
        },
      })
    : null;
  const order = await db.order.create({
    data: {
      number: 4242,
      shiftId: shift.id,
      cashierId: manager.id,
      customerId: customer?.id ?? null,
      status: "COMPLETED",
      orderType: opts.orderType ?? "LIVRAISON",
      notes: opts.notes ?? null,
      subtotal: 2000,
      discountTotal: 0,
      total: 2000,
      vatTotal: 182,
      itemCount: 1,
      createdAt: new Date(2026, 8, 18, 19, 41),
      completedAt: new Date(2026, 8, 18, 19, 41),
      items: {
        create: [{ productName: "Tacos L", quantity: 1, lineTotal: 2000, vatRate: 10, unitPrice: 2000 }],
      },
      payments: { create: [{ method: "CARD", amount: 2000, cashierId: manager.id }] },
    },
  });
  // The sealed text, exactly as `renderReceipt` would have written it for this
  // order: the customer's NAME and nothing else about them. Written by hand
  // rather than rendered, so that this file tests the ROUTES and a change to
  // the receipt's layout cannot quietly make it pass or fail.
  await db.receipt.create({
    data: {
      orderId: order.id,
      receiptNumber: order.number,
      content: "HIBA FOOD\nType : Livraison\nClient : Jean Dupont\nTacos L 20,00\nTOTAL 20,00\n",
    },
  });
  return { orderId: order.id };
}

beforeEach(async () => {
  clearCookies();
  await wipeDatabase();
  await ensureFiscalCounter();
  const m = await db.user.create({
    data: {
      username: `l222-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin(PIN),
    },
  });
  manager = { id: m.id, username: m.username, role: "MANAGER" };
});

afterAll(async () => {
  await wipeDatabase();
});

const JEAN = { name: "Jean Dupont", phone: "0612131415", address: "12 rue des Lilas", city: "Villeurbanne" };

describe("L-222 — a LIVRAISON print puts the destination on paper", () => {
  it("PRINTS THE ADDRESS, which no printed document carried", async () => {
    // THE ASSERTION THIS FILE EXISTS FOR. Before this commit the printer got
    // one job for a delivery and it said « Type : Livraison » and no more.
    const { orderId } = await sale({ customer: JEAN });
    const printer = capturing();
    await signInAs(manager);

    const res = await callJson<{ printed: boolean; deliveryNote: boolean | null }>(
      createPrintHandler(printer),
      { method: "POST", url: "http://localhost/api/orders/x/print", params: { id: orderId } },
    );

    expect(res.status).toBe(200);
    expect(res.body.printed).toBe(true);
    expect(res.body.deliveryNote, "the route did not report a slip").toBe(true);

    expect(printer.jobs.length, "the delivery got one job, as it did before").toBe(2);
    const paper = printed(printer.jobs);
    expect(paper, "the driver's destination is still not on any paper").toContain("12 rue des Lilas");
    expect(paper).toContain("VILLEURBANNE");
    expect(paper).toContain("0612131415");
    expect(paper).toContain("BON DE LIVRAISON");
  });

  it("KEEPS THE HOME ADDRESS OUT OF THE SEALED TICKET, and in the slip only", async () => {
    // The operator's decision, and the half that is not layout: the sealed
    // receipt is copied verbatim into the annual fiscal archive, so the address
    // must be on the second document and only there. Asserted per JOB, because
    // « it is on the paper somewhere » is exactly what must not be enough here.
    const { orderId } = await sale({ customer: JEAN });
    const printer = capturing();
    await signInAs(manager);
    await callJson(createPrintHandler(printer), {
      method: "POST",
      url: "http://localhost/api/orders/x/print",
      params: { id: orderId },
    });

    const [ticket, slip] = printer.jobs.map(text);
    expect(ticket, "the sealed ticket is not the first job").toContain("TOTAL");
    expect(ticket, "the home address reached the SEALED, archived ticket").not.toContain(
      "12 rue des Lilas",
    );
    expect(ticket, "the telephone number reached the SEALED, archived ticket").not.toContain(
      "0612131415",
    );
    expect(ticket, "the sealed ticket does not name the customer").toContain("Client : Jean Dupont");
    expect(slip).toContain("12 rue des Lilas");
    expect(slip, "the slip does not say it is non-fiscal").toContain("DOCUMENT NON FISCAL");
  });

  it("prints the order's note on the slip, which is where a door code goes", async () => {
    const { orderId } = await sale({ customer: JEAN, notes: "Code 34B2, 3e étage" });
    const printer = capturing();
    await signInAs(manager);
    await callJson(createPrintHandler(printer), {
      method: "POST",
      url: "http://localhost/api/orders/x/print",
      params: { id: orderId },
    });
    expect(printed(printer.jobs)).toContain("Code 34B2, 3e étage");
  });

  it("PRINTS ONE JOB, NOT TWO, for a sur-place or an à-emporter order", async () => {
    // The other direction, and it is what stops this becoming a second sheet of
    // paper on every sale of the day. `deliveryNote: null` is « none was owed »
    // and is deliberately not `false`, which means « it failed ».
    for (const orderType of ["DINE_IN", "TAKEAWAY"] as const) {
      await wipeDatabase();
      await ensureFiscalCounter();
      const m = await db.user.create({
        data: {
          username: `l222-${orderType}-${Date.now()}-${Math.random()}`,
          name: "Resp",
          role: "MANAGER",
          pinHash: await hashPin(PIN),
        },
      });
      manager = { id: m.id, username: m.username, role: "MANAGER" };
      const { orderId } = await sale({ orderType, customer: JEAN });
      const printer = capturing();
      clearCookies();
      await signInAs(manager);
      const res = await callJson<{ deliveryNote: boolean | null }>(createPrintHandler(printer), {
        method: "POST",
        url: "http://localhost/api/orders/x/print",
        params: { id: orderId },
      });
      expect(printer.jobs.length, `${orderType} printed a delivery slip`).toBe(1);
      expect(res.body.deliveryNote, `${orderType} reported a slip`).toBeNull();
    }
  });

  it("does not print a slip for a delivery with no customer row", async () => {
    // Defensive rather than reachable — `POST /api/orders` refuses a LIVRAISON
    // without a deliverable client — and it is the branch that would put a slip
    // with an empty name on the paper if `renderDeliveryNote` stopped checking.
    const { orderId } = await sale({ customer: null });
    const printer = capturing();
    await signInAs(manager);
    const res = await callJson<{ deliveryNote: boolean | null }>(createPrintHandler(printer), {
      method: "POST",
      url: "http://localhost/api/orders/x/print",
      params: { id: orderId },
    });
    expect(printer.jobs.length).toBe(1);
    expect(res.body.deliveryNote).toBeNull();
  });

  it("DOES NOT TRY THE SLIP WHEN THE TICKET ITSELF FAILED TO PRINT", async () => {
    // A printer that is jammed or off will not print the second document
    // either, and a slip is not worth a second error. The receipt is the
    // document that matters and its outcome is what the cashier is told.
    const { orderId } = await sale({ customer: JEAN });
    const printer = failing();
    await signInAs(manager);
    const res = await callJson<{ printed: boolean; deliveryNote: boolean | null }>(
      createPrintHandler(printer),
      { method: "POST", url: "http://localhost/api/orders/x/print", params: { id: orderId } },
    );
    expect(res.body.printed).toBe(false);
    expect(res.body.deliveryNote, "a slip was attempted after the ticket failed").toBeNull();
    expect(printer.jobs.length, "more than the ticket was sent to a dead printer").toBe(1);
  });

  it("NEVER LETS THE SLIP CHANGE THE RECEIPT'S OWN printStatus", async () => {
    // The slip is not journalled, not stored and not counted. `printStatus` is
    // the RECEIPT's, and L-143 settled what its three values mean.
    const { orderId } = await sale({ customer: JEAN });
    const printer = capturing();
    await signInAs(manager);
    await callJson(createPrintHandler(printer), {
      method: "POST",
      url: "http://localhost/api/orders/x/print",
      params: { id: orderId },
    });
    const receipt = await db.receipt.findFirstOrThrow({ where: { orderId } });
    expect(receipt.printStatus).toBe("PRINTED");
    expect(receipt.reprintCount, "printing the slip counted as a reprint").toBe(0);
  });
});

describe("L-222 — a REPRINT owes the driver the same two documents", () => {
  it("prints the copy AND the slip", async () => {
    // A reprint is what a cashier reaches for when the paper jammed. Leaving it
    // out would be the drift L-214 was about: one route knowing a rule the
    // other does not. Both call `printDeliveryNote` and neither decides.
    const { orderId } = await sale({ customer: JEAN });
    const printer = capturing();
    await signInAs(manager);
    const res = await callJson<{ printed: boolean; deliveryNote: boolean | null }>(
      createReprintHandler(printer),
      { method: "POST", url: "http://localhost/api/orders/x/reprint", params: { id: orderId } },
    );

    expect(res.status).toBe(201);
    expect(res.body.deliveryNote).toBe(true);
    expect(printer.jobs.length).toBe(2);
    const paper = printed(printer.jobs);
    expect(paper).toContain("[COPIE");
    expect(paper).toContain("12 rue des Lilas");
  });

  it("does not mark the SLIP as a copy — it is not a document with tirages", async () => {
    const { orderId } = await sale({ customer: JEAN });
    const printer = capturing();
    await signInAs(manager);
    await callJson(createReprintHandler(printer), {
      method: "POST",
      url: "http://localhost/api/orders/x/reprint",
      params: { id: orderId },
    });
    const slip = text(printer.jobs[1]);
    expect(slip).toContain("BON DE LIVRAISON");
    expect(slip, "the slip carries a [COPIE] mark it has no counter for").not.toContain("COPIE");
  });
});
