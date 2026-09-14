import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { closeDay } from "@/lib/services/fiscal";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { wipeDatabase } from "@/lib/test-wipe";
import { roleGateOf } from "@/lib/api-handler";
import type { PrinterDeps } from "@/lib/services/printer";
import { createPrintHandler } from "@/app/api/orders/[id]/print/route";
import { createReprintHandler } from "@/app/api/orders/[id]/reprint/route";
import { createDayClosePrintHandler } from "@/app/api/fiscal/closes/[period]/print/route";

// L-186 (R10.x) — the branch that says a print SUCCEEDED, actually executed.
//
// THE FINDING, in the audit's words: « No test can drive a SUCCESSFUL print
// through any of the three print routes. » Each called `printReceiptText` with
// no `deps`, so `resolvePrinter` built its own transport from settings — and a
// test could reach `DISABLED` and `NOT_CONFIGURED` and nothing else, because
// the only alternative was a real socket or a real Windows spooler. So the
// branch that writes `printStatus: "PRINTED", printedAt: now` — **the branch
// L-96 was about** — was asserted only as SOURCE TEXT, in
// `reprint-print-status.test.ts` and `day-close-print.test.ts`, which both said
// so out loud rather than pretending otherwise.
//
// It was never a regression: true since Batch 1.3, and the reason L-96 could
// sit undetected. `printer.ts` and `printer-spooler.test.ts` already covered
// the layer BELOW with an injected transport. What had no cover at all was the
// route's own bookkeeping around it — which is the part that writes to the
// database and answers the cashier.
//
// ── WHAT MADE IT TESTABLE ───────────────────────────────────────────────────
// Each route now exports a factory taking `PrinterDeps`, and `POST` is that
// factory called with none. `resolvePrinter` returns an injected transport
// BEFORE it reads settings, so a test supplies a transport and nothing else —
// it does not have to arrange a printer configuration as well, which would have
// made these tests depend on `DEFAULT_SETTINGS` staying as it is.
//
// ── WHY NOT `mock.module` ───────────────────────────────────────────────────
// It is global to the whole run — `checkout-rollback.test.ts` says so in its
// own header, and `backup.ts:391` records `mock.module("tar", …)` being tried
// and rejected on measurement. Mocking `@/lib/services/printer` here would
// reach every other file in the run. An argument does not.

const PIN = "525252";
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
function failing(): PrinterDeps {
  return {
    transport: {
      async send() {
        throw new Error("test: the printer is on fire");
      },
      describe: () => "test:failing",
    },
  };
}

/**
 * ESC p — the drawer pulse, and the only ESC/POS command that begins this way.
 * `init()` is ESC @, the code page is ESC t, the cut is GS V, so finding these
 * two bytes in a job means the drawer was kicked and nothing else does.
 */
const DRAWER_KICK = Buffer.from([0x1b, 0x70]);
const kicked = (jobs: Buffer[]) => jobs.some((j) => j.includes(DRAWER_KICK));

async function sale(opts: { method?: "CASH" | "CARD"; number?: number } = {}) {
  const shift = await db.shift.create({
    data: {
      number: 1,
      openedById: manager.id,
      openedAt: new Date(2026, 5, 12, 10, 0),
      status: "OPEN",
      openingFloat: 5000,
    },
  });
  const order = await db.order.create({
    data: {
      number: opts.number ?? 9001,
      shiftId: shift.id,
      cashierId: manager.id,
      status: "COMPLETED",
      subtotal: 2000,
      discountTotal: 0,
      total: 2000,
      vatTotal: 182,
      itemCount: 1,
      createdAt: new Date(2026, 5, 12, 12, 0),
      completedAt: new Date(2026, 5, 12, 12, 0),
      items: {
        create: [
          { productName: "Burger", quantity: 1, lineTotal: 2000, vatRate: 10, unitPrice: 2000 },
        ],
      },
      payments: {
        create: [{ method: opts.method ?? "CASH", amount: 2000, cashierId: manager.id }],
      },
    },
  });
  const receipt = await db.receipt.create({
    data: {
      orderId: order.id,
      receiptNumber: order.number,
      content: "HIBA FOOD\nBurger 20,00\nTOTAL 20,00\n",
    },
  });
  return { orderId: order.id, receiptId: receipt.id };
}

beforeEach(async () => {
  clearCookies();
  await wipeDatabase();
  await ensureFiscalCounter();
  const m = await db.user.create({
    data: {
      username: `l186-${Date.now()}-${Math.random()}`,
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

describe("L-186 — a print that succeeds is recorded as one", () => {
  it("writes PRINTED and printedAt when the job reaches the printer", async () => {
    // The assertion this file exists for. Before L-186 the closest a test could
    // get was reading the `if (outcome.ok)` block as a string.
    const { orderId, receiptId } = await sale();
    const before = await db.receipt.findUniqueOrThrow({ where: { id: receiptId } });
    expect(before.printStatus, "the fixture starts unprinted").not.toBe("PRINTED");
    expect(before.printedAt).toBeNull();

    const printer = capturing();
    await signInAs(manager);
    const res = await callJson<{ printed: boolean; drawerOpened: boolean }>(
      createPrintHandler(printer),
      { method: "POST", url: "http://localhost/api/orders/x/print", params: { id: orderId } },
    );

    expect(res.status).toBe(200);
    expect(res.body.printed, "the route says it did not print").toBe(true);

    const after = await db.receipt.findUniqueOrThrow({ where: { id: receiptId } });
    expect(after.printStatus).toBe("PRINTED");
    expect(after.printedAt, "PRINTED with no printedAt is half the record").not.toBeNull();

    // And the bytes really went somewhere — a route that reported success
    // without delivering anything would pass every assertion above.
    expect(printer.jobs.length, "nothing was sent to the transport").toBe(1);
    expect(printer.jobs[0].toString("latin1")).toContain("Burger");
  });

  it("writes FAILED when the transport rejects", async () => {
    // The other half of L-143's three states, and the one that was equally
    // unreachable: FAILED means ATTEMPTED AND FAILED, which needs an attempt.
    const { orderId, receiptId } = await sale();
    await signInAs(manager);
    const res = await callJson<{ printed: boolean; reason?: string }>(
      createPrintHandler(failing()),
      { method: "POST", url: "http://localhost/api/orders/x/print", params: { id: orderId } },
    );

    expect(res.status).toBe(200);
    expect(res.body.printed).toBe(false);
    expect(res.body.reason, "a rejected send is FAILED, not DISABLED").toBe("FAILED");
    const after = await db.receipt.findUniqueOrThrow({ where: { id: receiptId } });
    expect(after.printStatus).toBe("FAILED");
    expect(after.printedAt, "a failed print must not stamp printedAt").toBeNull();
  });

  it("leaves the status alone when the print was never attempted", async () => {
    // L-143's third state, and the one the restaurant hits: printing is off in
    // this database, which is the default. PENDING means NOT ATTEMPTED, and
    // nothing is wrong with the ticket.
    //
    // Driven with NO deps on purpose — an injected transport bypasses settings
    // by design, so the not-attempted path is only reachable through the real
    // resolver. That makes this the one test here that exercises `POST`'s own
    // configuration, and it is what a revert widening `else if (reason ===
    // "FAILED")` back to a bare `else` has to fail against: with a transport
    // that rejects, both spellings write FAILED and the bug is invisible.
    const { orderId, receiptId } = await sale();
    await signInAs(manager);
    const res = await callJson<{ printed: boolean; reason?: string }>(createPrintHandler(), {
      method: "POST",
      url: "http://localhost/api/orders/x/print",
      params: { id: orderId },
    });

    expect(res.body.printed).toBe(false);
    expect(res.body.reason, "printing is off, so nothing was attempted").not.toBe("FAILED");
    const after = await db.receipt.findUniqueOrThrow({ where: { id: receiptId } });
    expect(after.printStatus, "a ticket nobody tried to print is not FAILED").not.toBe("FAILED");
    expect(after.printStatus).not.toBe("PRINTED");
    expect(after.printedAt).toBeNull();
  });

  it("opens the drawer for a cash sale and not for a card one", async () => {
    // DD-20's rule, now observable in the BYTES rather than inferred from the
    // response field. The drawer is decided from the order's own payments and
    // never from the request body — a client that could ask for a kick on
    // demand would be a till-control hole — so the two cases differ only in how
    // the sale was paid.
    for (const [method, expected] of [["CASH", true], ["CARD", false]] as const) {
      await wipeDatabase({ keep: ["user", "fiscalCounter"] });
      const { orderId } = await sale({ method, number: method === "CASH" ? 9101 : 9102 });
      const printer = capturing();
      await signInAs(manager);
      const res = await callJson<{ drawerOpened: boolean }>(createPrintHandler(printer), {
        method: "POST",
        url: "http://localhost/api/orders/x/print",
        params: { id: orderId },
      });
      expect(res.body.drawerOpened, `${method}: the response`).toBe(expected);
      expect(kicked(printer.jobs), `${method}: the bytes on the wire`).toBe(expected);
    }
  });
});

describe("L-186 — the reprint, and the drawer it must never open", () => {
  it("writes PRINTED and keeps the COPIE marking", async () => {
    const { orderId, receiptId } = await sale();
    const printer = capturing();
    await signInAs(manager);
    const res = await callJson<{ printed: boolean; reprintCount: number; content: string }>(
      createReprintHandler(printer),
      { method: "POST", url: "http://localhost/api/orders/x/reprint", params: { id: orderId } },
    );

    expect(res.status).toBe(201);
    expect(res.body.printed).toBe(true);
    expect(res.body.reprintCount).toBe(1);
    const after = await db.receipt.findUniqueOrThrow({ where: { id: receiptId } });
    expect(after.printStatus).toBe("PRINTED");
    expect(after.printedAt).not.toBeNull();

    // What reached the printer is the COPY, not the original — the marking is
    // the whole point of a reprint being distinguishable on paper.
    expect(printer.jobs.length).toBe(1);
    expect(printer.jobs[0].toString("latin1")).toContain("COPIE");
  });

  it("never kicks the drawer, even though the sale was cash", async () => {
    // Asserted in the bytes for the first time. A reprint that opened the till
    // would be a way around the traced manual-open path, and the sale here is
    // CASH precisely so that the rule is not passing by accident.
    const { orderId } = await sale({ method: "CASH" });
    const printer = capturing();
    await signInAs(manager);
    await callJson(createReprintHandler(printer), {
      method: "POST",
      url: "http://localhost/api/orders/x/reprint",
      params: { id: orderId },
    });
    expect(printer.jobs.length).toBe(1);
    expect(kicked(printer.jobs), "a reprint opened the cash drawer").toBe(false);
  });

  it("still journals the REIMPRESSION when the print itself fails", async () => {
    // The fiscal event is not conditional on the paper. A reprint that failed
    // to print is still a reprint that was asked for, and the journal is what
    // the inspection reads.
    const { orderId } = await sale();
    await signInAs(manager);
    const res = await callJson<{ printed: boolean }>(createReprintHandler(failing()), {
      method: "POST",
      url: "http://localhost/api/orders/x/reprint",
      params: { id: orderId },
    });
    expect(res.status).toBe(201);
    expect(res.body.printed).toBe(false);
    const events = await db.fiscalEvent.findMany({ where: { type: "REIMPRESSION" } });
    expect(events.length, "the reprint was not journalled").toBe(1);
  });
});

describe("L-186 — the day's closing slip", () => {
  async function seal(period = "2026-06-12") {
    const shift = await db.shift.create({
      data: {
        number: 1,
        openedById: manager.id,
        openedAt: new Date(2026, 5, 12, 10, 0),
        status: "CLOSED",
        closedById: manager.id,
        closedAt: new Date(2026, 5, 12, 23, 0),
        openingFloat: 5000,
      },
    });
    await db.order.create({
      data: {
        number: 9201,
        shiftId: shift.id,
        cashierId: manager.id,
        status: "COMPLETED",
        subtotal: 2000,
        discountTotal: 0,
        total: 2000,
        vatTotal: 182,
        itemCount: 1,
        createdAt: new Date(2026, 5, 12, 12, 0),
        completedAt: new Date(2026, 5, 12, 12, 0),
        items: {
          create: [
            { productName: "Burger", quantity: 1, lineTotal: 2000, vatRate: 10, unitPrice: 2000 },
          ],
        },
        payments: { create: [{ method: "CASH", amount: 2000, cashierId: manager.id }] },
      },
    });
    return closeDay(period, manager.id, false, new Date(2026, 5, 20));
  }

  it("audits DAY_CLOSE_TICKET_PRINTED when it actually prints", async () => {
    // Three audit states carry four outcomes here, and until L-186 only the two
    // that need no printer — SKIPPED and, with a configured-but-broken one,
    // FAILED — could be reached. PRINTED was the one that mattered and the one
    // nothing could produce.
    const close = await seal();
    const printer = capturing();
    await signInAs(manager);
    const res = await callJson<{ printed: boolean }>(createDayClosePrintHandler(printer), {
      method: "POST",
      url: "http://localhost/api/fiscal/closes/2026-06-12/print",
      params: { period: "2026-06-12" },
    });

    expect(res.status).toBe(200);
    expect(res.body.printed).toBe(true);
    const rows = await db.auditLog.findMany({ where: { action: "DAY_CLOSE_TICKET_PRINTED" } });
    expect(rows.length, "the successful print was not journalled").toBe(1);
    expect(rows[0].entityId).toBe(close.id);

    // And it is the SLIP that went down the wire, not an empty job. Decoded as
    // latin1 because `encodeText` writes CP1252, whose bytes coincide with
    // latin1 for everything this document contains — « Ô » is 0xD4 in both.
    const sent = printer.jobs[0].toString("latin1");
    expect(sent, "the job carries no closing-slip heading").toContain("CLÔTURE DU JOUR");
    // The French date, not the ISO period — the slip is a document a person
    // files, and this assertion caught the difference on its first run.
    expect(sent, "the slip went out without the day it closes").toContain("12/06/2026");
    expect(sent, "the integrity code is what makes it the sealed document").toContain(
      "Code d'intégrité",
    );
  });

  it("audits DAY_CLOSE_TICKET_PRINT_FAILED when the transport rejects", async () => {
    await seal();
    await signInAs(manager);
    const res = await callJson<{ printed: boolean; reason?: string }>(
      createDayClosePrintHandler(failing()),
      {
        method: "POST",
        url: "http://localhost/api/fiscal/closes/2026-06-12/print",
        params: { period: "2026-06-12" },
      },
    );
    expect(res.body.printed).toBe(false);
    expect(res.body.reason).toBe("FAILED");
    const failedRows = await db.auditLog.findMany({
      where: { action: "DAY_CLOSE_TICKET_PRINT_FAILED" },
    });
    expect(failedRows.length).toBe(1);
    const skipped = await db.auditLog.findMany({
      where: { action: "DAY_CLOSE_TICKET_PRINT_SKIPPED" },
    });
    expect(skipped.length, "an attempted failure was recorded as skipped").toBe(0);
  });

  it("never kicks the drawer — now proved in the bytes, not in the source", async () => {
    // `day-close-print.test.ts` asserted this by reading the route's text,
    // saying « the drawer is decided by an argument this route does not pass,
    // and an absent argument cannot be observed at runtime ». It can be now.
    // A close is not a tender, and the end of the day is exactly when an
    // untraced drawer would be worth abusing.
    await seal();
    const printer = capturing();
    await signInAs(manager);
    await callJson(createDayClosePrintHandler(printer), {
      method: "POST",
      url: "http://localhost/api/fiscal/closes/2026-06-12/print",
      params: { period: "2026-06-12" },
    });
    expect(printer.jobs.length).toBe(1);
    expect(kicked(printer.jobs), "the closing slip opened the cash drawer").toBe(false);
  });
});

describe("L-186 — the production handlers are the factories with no deps", () => {
  it("exports POST built from each factory", async () => {
    // The factory must not become a parallel handler that drifts from the one
    // Next actually imports. Each `POST` is its factory called with nothing, so
    // there is one code path and the tests above exercise it.
    for (const route of [
      "@/app/api/orders/[id]/print/route",
      "@/app/api/orders/[id]/reprint/route",
      "@/app/api/fiscal/closes/[period]/print/route",
    ]) {
      const mod = (await import(route)) as Record<string, unknown>;
      expect(typeof mod.POST, `${route} lost its POST`).toBe("function");
      const factory = Object.entries(mod).find(
        ([name]) => name.startsWith("create") && name.endsWith("Handler"),
      );
      expect(factory, `${route} lost its factory`).toBeTruthy();
      expect(typeof factory![1]).toBe("function");

      // `typeof === "function"` is not enough, and a revert proved it: exporting
      // the FACTORY ITSELF as `POST` — `= createPrintHandler` instead of
      // `= createPrintHandler()` — passes that and ships a route Next would
      // call with a Request as its `deps`. What distinguishes them is the gate
      // `withAuth` stamps on what it returns; a bare factory carries none.
      expect(
        roleGateOf(mod.POST),
        `${route}: POST is not a wrapped handler — is it the factory itself?`,
      ).not.toBeNull();
      expect(
        roleGateOf(factory![1]),
        `${route}: the factory is already wrapped, so POST is wrapped twice`,
      ).toBeNull();
    }
  });
});
