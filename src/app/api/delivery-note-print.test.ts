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

    // ONE PIECE OF PAPER — the owner's ask of 2026-09-27, and the property
    // that carries it. Each `printReceiptText` runs the cutter, so a second
    // job IS a second slip: counting jobs is counting pieces of paper, and
    // this number is the test. It was 2 until 2026-09-27.
    expect(printer.jobs.length, "the delivery was cut into two pieces of paper again").toBe(1);
    const paper = printed(printer.jobs);
    expect(paper, "the driver's destination is still not on any paper").toContain("12 rue des Lilas");
    expect(paper).toContain("VILLEURBANNE");
    expect(paper).toContain("0612131415");
    // The second title block went with the second cut: on one slip it read as
    // a second document, which is what the owner was objecting to.
    expect(paper, "the slip is announcing itself as a separate document again").not.toContain(
      "BON DE LIVRAISON",
    );
    // Since 2026-09-30 the block is a framed section titled in the owner's
    // wording, sitting above the ARTICLES frame rather than at the foot.
    expect(paper).toContain("INFORMATIONS CLIENT");
  });

  it("KEEPS THE HOME ADDRESS OUT OF THE SEALED TICKET, which is now the DATABASE's copy", async () => {
    // The operator's decision of 2026-09-18, reaffirmed 2026-09-27 with the
    // alternative in writing: `Receipt.content` is copied VERBATIM into the
    // annual fiscal archive, so a customer's home must never reach it.
    //
    // THIS TEST CHANGED ITS EVIDENCE AND KEPT ITS CLAIM. It used to read job 0
    // and job 1 — « the ticket » and « the slip » — because they were two print
    // jobs. They are one now, and the paper legitimately holds both, so reading
    // the paper could no longer tell the two apart. It reads the SEALED ROW
    // instead, which is the document the decision is actually about and the one
    // the archive copies. Asserting on the paper would have been the weaker
    // test all along.
    const { orderId } = await sale({ customer: JEAN });
    const printer = capturing();
    await signInAs(manager);
    await callJson(createPrintHandler(printer), {
      method: "POST",
      url: "http://localhost/api/orders/x/print",
      params: { id: orderId },
    });

    const sealed = await db.receipt.findFirst({ where: { orderId } });
    expect(sealed?.content, "no sealed receipt was stored").toContain("TOTAL");
    expect(sealed?.content, "the home address reached the SEALED, archived ticket").not.toContain(
      "12 rue des Lilas",
    );
    expect(sealed?.content, "the telephone number reached the SEALED, archived ticket").not.toContain(
      "0612131415",
    );
    expect(sealed?.content, "the sealed ticket does not name the customer").toContain(
      "Client : Jean Dupont",
    );

    // And the other half: the driver still gets them, on the paper only.
    const paper = printed(printer.jobs);
    expect(paper).toContain("12 rue des Lilas");
    expect(paper).toContain("0612131415");
    expect(
      paper.length,
      "the paper is not longer than the sealed ticket, so nothing was appended",
    ).toBeGreaterThan(sealed!.content.length);
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

  it("REPORTS THE BLOCK AS FAILED WHEN THE ONE JOB FAILED — not as « never attempted »", async () => {
    // WHAT THIS TEST USED TO SAY, and why the answer flipped. It expected
    // `null`, « no slip was attempted », because the slip was a SECOND print
    // job that the route skipped once the ticket had failed. There is no second
    // job now: the block goes to the printer inside the ticket's job, so when
    // that job fails the block was attempted and did fail. `false` is the
    // truthful answer and `null` would now be a lie.
    //
    // The distinction itself is L-143's and is intact — see the test below,
    // where printing is merely switched off and the answer is `null` again.
    const { orderId } = await sale({ customer: JEAN });
    const printer = failing();
    await signInAs(manager);
    const res = await callJson<{ printed: boolean; deliveryNote: boolean | null }>(
      createPrintHandler(printer),
      { method: "POST", url: "http://localhost/api/orders/x/print", params: { id: orderId } },
    );
    expect(res.body.printed).toBe(false);
    expect(res.body.deliveryNote, "a failed job reported the block as never attempted").toBe(false);
    expect(printer.jobs.length, "a dead printer was given more than one job").toBe(1);
  });

  it("REPORTS NULL — not false — WHEN PRINTING IS SWITCHED OFF", async () => {
    // The other side of the test above, and the reason the merge needed
    // `deliveryNoteOutcome` rather than a bare `outcome.ok`. A till with the
    // printer disabled has not FAILED to print a delivery block; nothing was
    // attempted. Reporting that as a failure is precisely the defect L-143
    // found in the reprint route and fixed, and collapsing the two states is
    // the easiest thing to get wrong when two jobs become one.
    //
    // No transport is injected, so `resolvePrinter` reads the settings and
    // answers DISABLED — `printerEnabled` is false on a fresh database.
    const { orderId } = await sale({ customer: JEAN });
    await signInAs(manager);
    const res = await callJson<{ printed: boolean; deliveryNote: boolean | null }>(
      createPrintHandler({}),
      { method: "POST", url: "http://localhost/api/orders/x/print", params: { id: orderId } },
    );
    expect(res.body.printed).toBe(false);
    expect(
      res.body.deliveryNote,
      "a till with printing switched off was told its delivery block FAILED",
    ).toBeNull();
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
    // other does not. Both call `deliveryPaper` and neither decides.
    const { orderId } = await sale({ customer: JEAN });
    const printer = capturing();
    await signInAs(manager);
    const res = await callJson<{ printed: boolean; deliveryNote: boolean | null }>(
      createReprintHandler(printer),
      { method: "POST", url: "http://localhost/api/orders/x/reprint", params: { id: orderId } },
    );

    expect(res.status).toBe(201);
    expect(res.body.deliveryNote).toBe(true);
    // One slip on a reprint too, for the same reason and by the same route:
    // a second job would cut the paper again. Was 2 until 2026-09-27.
    expect(printer.jobs.length, "the reprint was cut into two pieces of paper").toBe(1);
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
    // The block used to be job 1 and could be read on its own. On one slip it
    // has to be cut out of the paper, and the cut is unambiguous: the block
    // opens with the framed title « INFORMATIONS CLIENT », which appears
    // nowhere else on the ticket.
    const lines = text(printer.jobs[0]).split("\n");
    const start = lines.findIndex((l) => /\|\s*INFORMATIONS CLIENT\s*\|/.test(l)) - 1;
    expect(start, "the delivery block is not on the paper at all").toBeGreaterThan(-1);
    const block = lines.slice(start).join("\n");

    expect(block).toContain("12 rue des Lilas");
    expect(block, "the block carries a [COPIE] mark it has no counter for").not.toContain("COPIE");
    // And the mark IS on the fiscal part above it, which is the half that has
    // a tirage counter — otherwise this test would pass on a paper with no
    // copy mark anywhere.
    expect(lines.slice(0, start).join("\n")).toContain("[COPIE");
  });
});
