import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { verifyFiscalChain } from "@/lib/services/fiscal";

// L-125 (R9.7) — the journal entry is written BEFORE the paper is attempted,
// and whether or not it succeeds.
//
// THE FINDING: two tests in `fiscal-surface.test.ts` headed « What
// POST /api/fiscal/drawer does » and « What POST /api/orders/[id]/reprint does »
// **re-implemented the routes inline**, calling `appendFiscalEvent` and
// `receipt.update` by hand. `orders/[id]/reprint/route.ts` was invoked by no
// test in either suite. So the invariant both routes carry a comment about —
// « journal first, paper second » — was asserted nowhere, and if either route
// stopped journalling, or moved the write after `printReceiptText`, both tests
// stayed green.
//
// It matters because it is the ISCA traceability rule, and because the failure
// it guards against is the ordinary one: **a printer that is off.** A drawer
// opened by hand while the printer is offline is exactly the case the fiscal
// journal exists to capture, and a reprint of a ticket the customer lost is
// exactly when the paper is most likely not to come out.
//
// Printing is DISABLED in this database — the default, and production's value —
// so every call here takes the failing-transport path for free. That is the
// half that was never covered: not « does it journal », but « does it journal
// when the paper does not come out ».

const PIN = "424242";
let manager: { id: string; username: string; role: "MANAGER" };

async function wipe(): Promise<void> {
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.fiscalEvent.deleteMany();
  await db.receipt.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  // L-154 (R9.7): Refund.orderId is `onDelete: Restrict`.
  await db.refund.deleteMany();
  await db.order.deleteMany();
  await db.zReport.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.setting.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  await ensureFiscalCounter();
  const m = await db.user.create({
    data: {
      username: `l125-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin(PIN),
    },
  });
  manager = { id: m.id, username: m.username, role: "MANAGER" };
});

afterAll(async () => {
  await wipe();
});

async function saleWithReceipt(): Promise<{ orderId: string; receiptId: string }> {
  const shift = await db.shift.create({
    data: { number: 1, openedById: manager.id, openingFloat: 0, status: "OPEN" },
  });
  const order = await db.order.create({
    data: {
      number: 9001,
      shiftId: shift.id,
      cashierId: manager.id,
      status: "COMPLETED",
      subtotal: 1000,
      discountTotal: 0,
      total: 1000,
      vatTotal: 91,
      itemCount: 1,
      completedAt: new Date(),
    },
  });
  const receipt = await db.receipt.create({
    data: { orderId: order.id, receiptNumber: order.number, content: "TICKET\n" },
  });
  return { orderId: order.id, receiptId: receipt.id };
}

describe("L-125 — POST /api/fiscal/drawer, driven", () => {
  const route = () => import("@/app/api/fiscal/drawer/route");

  it("journals OUVERTURE_TIROIR even though the drawer does not open", async () => {
    // The whole invariant in one case. Printing is off, so `openCashDrawer()`
    // fails — and the event must exist anyway, because a drawer opened by hand
    // while the printer is offline is precisely what the JFP is for.
    await signInAs(manager);
    const res = await callJson<{
      ok: boolean;
      sequence: number;
      drawer: { opened: boolean; reason?: string };
    }>((await route()).POST, {
      method: "POST",
      url: "http://localhost/api/fiscal/drawer",
      body: { reason: "Appoint" },
    });

    expect(res.status).toBe(201);
    expect(res.body.drawer.opened, "the drawer opened in a test database").toBe(false);
    expect(res.body.drawer.reason, "a failure with no reason").toBeTruthy();

    const events = await db.fiscalEvent.findMany({ where: { type: "OUVERTURE_TIROIR" } });
    expect(events.length, "the drawer open left no fiscal trace").toBe(1);
    expect(JSON.parse(events[0].dataJson).reason).toBe("Appoint");
    expect(events[0].userId, "the row must name who opened it").toBe(manager.id);
  });

  it("reports the printing failure ALONGSIDE the committed event, never instead", async () => {
    // `ok: true` with `drawer.opened: false` is the shape. A route that
    // answered an error on a printer failure would lose the event the operator
    // is required to have.
    await signInAs(manager);
    const res = await callJson<{ ok: boolean; drawer: { opened: boolean } }>(
      (await route()).POST,
      { method: "POST", url: "http://localhost/api/fiscal/drawer", body: {} },
    );
    expect(res.body.ok).toBe(true);
    expect(res.body.drawer.opened).toBe(false);
    expect(await db.fiscalEvent.count({ where: { type: "OUVERTURE_TIROIR" } })).toBe(1);
  });

  it("keeps the chain verifiable across several opens", async () => {
    await signInAs(manager);
    for (let i = 0; i < 3; i++) {
      await callJson((await route()).POST, {
        method: "POST",
        url: "http://localhost/api/fiscal/drawer",
        body: { reason: `open ${i}` },
      });
    }
    expect(await db.fiscalEvent.count({ where: { type: "OUVERTURE_TIROIR" } })).toBe(3);
    expect((await verifyFiscalChain()).ok, "the chain broke").toBe(true);
  });

  it("refuses an anonymous caller, so no untraced open is possible", async () => {
    const res = await callJson((await route()).POST, {
      method: "POST",
      url: "http://localhost/api/fiscal/drawer",
      body: { reason: "x" },
    });
    expect(res.status).toBe(401);
    expect(await db.fiscalEvent.count()).toBe(0);
  });
});

describe("L-125 — POST /api/orders/[id]/reprint, driven", () => {
  const route = () => import("@/app/api/orders/[id]/reprint/route");

  it("journals REIMPRESSION even though no paper comes out", async () => {
    // « Because the route had no caller, `Receipt.reprintCount` could never
    // leave 0 » — the old test's own words, about a route it did not call.
    const { orderId, receiptId } = await saleWithReceipt();
    await signInAs(manager);

    const res = await callJson<{ printed: boolean; reprintCount: number }>(
      (await route()).POST,
      {
        method: "POST",
        url: `http://localhost/api/orders/${orderId}/reprint`,
        params: { id: orderId },
      },
    );

    expect(res.status).toBe(201);
    expect(res.body.printed, "something printed in a test database").toBe(false);

    const events = await db.fiscalEvent.findMany({ where: { type: "REIMPRESSION" } });
    expect(events.length, "the reprint left no fiscal trace").toBe(1);
    const data = JSON.parse(events[0].dataJson);
    expect(data.receiptId).toBe(receiptId);
    expect(data.reprintCount).toBe(1);
  });

  it("increments reprintCount on the row, not only in the event", async () => {
    const { orderId, receiptId } = await saleWithReceipt();
    await signInAs(manager);
    for (let i = 1; i <= 3; i++) {
      await callJson((await route()).POST, {
        method: "POST",
        url: `http://localhost/api/orders/${orderId}/reprint`,
        params: { id: orderId },
      });
    }
    const receipt = await db.receipt.findUniqueOrThrow({ where: { id: receiptId } });
    expect(receipt.reprintCount).toBe(3);
    expect(await db.fiscalEvent.count({ where: { type: "REIMPRESSION" } })).toBe(3);
  });

  it("writes the audit row as well as the fiscal event", async () => {
    // Two different records for two different readers, and the route writes
    // both inside one transaction.
    const { orderId } = await saleWithReceipt();
    await signInAs(manager);
    await callJson((await route()).POST, {
      method: "POST",
      url: `http://localhost/api/orders/${orderId}/reprint`,
      params: { id: orderId },
    });
    expect(await db.auditLog.count({ where: { action: "RECEIPT_REPRINTED" } })).toBe(1);
  });

  it("keeps the chain verifiable", async () => {
    const { orderId } = await saleWithReceipt();
    await signInAs(manager);
    await callJson((await route()).POST, {
      method: "POST",
      url: `http://localhost/api/orders/${orderId}/reprint`,
      params: { id: orderId },
    });
    expect((await verifyFiscalChain()).ok).toBe(true);
  });

  it("never opens the drawer — a reprint is not a tender", async () => {
    // Stated in the route's own comment: a reprint that opened the till would
    // be a way around the traced manual-open path, which is the route above.
    const src = readFileSync(
      path.join(process.cwd(), "src/app/api/orders/[id]/reprint/route.ts"),
      "utf8",
    );
    expect(src).toContain("printReceiptText(copieContent)");
    expect(src, "a reprint can open the till").not.toContain("openDrawer");
  });
});

describe("L-125 — journal FIRST, paper SECOND", () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

  it("both routes append before they print", async () => {
    // The ORDER is the invariant, and it is not observable from the outcome:
    // with printing disabled both orderings produce the same rows. What
    // distinguishes them is which one survives the process dying in between —
    // journal-first leaves a traced open with no paper, print-first leaves
    // paper with no trace, and only one of those is recoverable.
    // THE CALL, not the name. `indexOf("appendFiscalEvent")` finds the IMPORT
    // at the top of the file, which is before everything — so moving the
    // journal write after the print left this green. Measured: the revert
    // survived it. `appendFiscalEvent(tx,` only ever appears at the call.
    for (const [rel, append, print] of [
      ["src/app/api/fiscal/drawer/route.ts", "appendFiscalEvent(tx,", "openCashDrawer()"],
      ["src/app/api/orders/[id]/reprint/route.ts", "appendFiscalEvent(tx,", "printReceiptText("],
    ] as const) {
      const src = read(rel);
      const a = src.indexOf(append);
      const p = src.indexOf(print);
      expect({ rel, found: a > 0 && p > 0 }).toEqual({ rel, found: true });
      expect(
        { rel, journalFirst: a < p },
        `${rel}: the paper is attempted before the journal entry exists`,
      ).toEqual({ rel, journalFirst: true });
    }
  });
});
