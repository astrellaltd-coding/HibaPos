import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { ensureFiscalCounter } from "@/lib/services/sequence";

// L-143 (R9.1) — FAILED means it was attempted and failed.
//
// THE FINDING: the two routes that write `Receipt.printStatus` disagreed.
// `orders/[id]/print` wrote FAILED only when the print was ATTEMPTED and
// failed; `orders/[id]/reprint` wrote it for ANY non-ok outcome — so a reprint
// with printing switched off in the settings marked the receipt FAILED, when
// nothing had been tried and nothing was wrong with it. Two routes, one column,
// two meanings, and the wrong one is the one the restaurant will hit: printing
// is off in this database today, which is the default.
//
// Three states carry four outcomes, and they are now read the same way in both
// routes:
//
//   PRINTED  the job reached the printer
//   FAILED   it was ATTEMPTED and did not
//   PENDING  it was never attempted — printing is off, or no printer is
//            configured. Nothing is wrong with the ticket.
//
// THE OTHER HALF OF THIS FINDING IS NOT FIXED HERE, and saying so is part of
// the fix. The comment that used to sit in `print/route.ts` claimed unprinted
// tickets « stay visible as FAILED so a shift's unprinted tickets can be found
// later ». They do not, and could not: **nothing reads this column.** Zero
// readers across the `.tsx` files, three writers. Whether to surface it or drop
// it is a decision for the operator and is recorded, not taken. Which is
// exactly why the value must be right in the meantime — a column nobody reads
// yet is a column somebody will read later, and it will be read as history.

const PIN = "424242";
let manager: { id: string; username: string; role: "MANAGER" };

async function reprintRoute() {
  return import("@/app/api/orders/[id]/reprint/route");
}

/** A completed cash sale with a sealed receipt, ready to reprint. */
async function saleWithReceipt(): Promise<{ orderId: string; receiptId: string }> {
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
      number: 8001,
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
        create: [{ productName: "Burger", quantity: 1, lineTotal: 2000, vatRate: 10, unitPrice: 2000 }],
      },
      payments: { create: [{ method: "CASH", amount: 2000, cashierId: manager.id }] },
    },
  });
  const receipt = await db.receipt.create({
    data: {
      orderId: order.id,
      receiptNumber: order.number,
      content: "HIBA FOOD\nTOTAL 20,00\n",
    },
  });
  return { orderId: order.id, receiptId: receipt.id };
}

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
      username: `l143-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin(PIN),
    },
  });
  manager = { id: m.id, username: m.username, role: "MANAGER" };
});

describe("L-143 — a reprint that was never attempted is not a failure", () => {
  it("leaves printStatus alone when printing is switched off", async () => {
    // THE REGRESSION, exactly. Printing is disabled — the default, and
    // production's value today — so nothing is attempted and the ticket is
    // fine. The old code stamped it FAILED.
    const { orderId, receiptId } = await saleWithReceipt();
    const before = await db.receipt.findUniqueOrThrow({ where: { id: receiptId } });
    await signInAs(manager);

    const res = await callJson<{ printed: boolean }>((await reprintRoute()).POST, {
      method: "POST",
      url: `http://localhost/api/orders/${orderId}/reprint`,
      params: { id: orderId },
    });
    expect(res.status).toBe(201);
    expect(res.body.printed).toBe(false);

    const after = await db.receipt.findUniqueOrThrow({ where: { id: receiptId } });
    expect(after.printStatus, "a reprint nobody attempted marked the ticket FAILED").toBe(
      before.printStatus,
    );
    expect(after.printStatus).not.toBe("FAILED");
    expect(after.printedAt).toBeNull();
  });

  it("still journals the REIMPRESSION, because the request happened", async () => {
    // The distinction is about the ticket's own status, NOT about the trace. A
    // reprint must be journalled even when no paper comes out — that is the
    // traceability requirement the fiscal event exists for, and weakening it
    // would be a much worse bug than the one being fixed.
    const { orderId } = await saleWithReceipt();
    await signInAs(manager);
    await callJson((await reprintRoute()).POST, {
      method: "POST",
      url: `http://localhost/api/orders/${orderId}/reprint`,
      params: { id: orderId },
    });
    expect(await db.fiscalEvent.count({ where: { type: "REIMPRESSION" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "RECEIPT_REPRINTED" } })).toBe(1);
  });

  it("still counts the tirage", async () => {
    const { orderId, receiptId } = await saleWithReceipt();
    await signInAs(manager);
    for (let i = 1; i <= 3; i++) {
      const res = await callJson<{ reprintCount: number; content: string }>(
        (await reprintRoute()).POST,
        {
          method: "POST",
          url: `http://localhost/api/orders/${orderId}/reprint`,
          params: { id: orderId },
        },
      );
      expect(res.body.reprintCount).toBe(i);
      expect(res.body.content).toContain(`[COPIE — Tirage N° ${i}]`);
    }
    const after = await db.receipt.findUniqueOrThrow({ where: { id: receiptId } });
    expect(after.reprintCount).toBe(3);
    // Three reprints, none attempted, and the ticket's status is untouched.
    expect(after.printStatus).not.toBe("FAILED");
  });

  it("does not report a print that did not happen", async () => {
    const { orderId } = await saleWithReceipt();
    await signInAs(manager);
    const res = await callJson<{ printed: boolean; printMessage?: string }>(
      (await reprintRoute()).POST,
      {
        method: "POST",
        url: `http://localhost/api/orders/${orderId}/reprint`,
        params: { id: orderId },
      },
    );
    expect(res.body.printed).toBe(false);
    expect(res.body.printMessage, "the caller is told nothing about why").toBeTruthy();
  });
});

describe("L-143 — the two routes agree", () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

  it("both write FAILED only for an attempted print", async () => {
    // The finding was a DISAGREEMENT between two files, so the property is
    // about both of them, and this reads both as source.
    //
    // AMENDED 2026-09-14 (L-186). It used to say the FAILED branch « needs a
    // printer that answers and then breaks, which this suite cannot produce
    // honestly ». It can now: the routes take an injectable printer, and
    // `print-success.test.ts` drives that exact branch with a transport whose
    // send rejects. **This assertion is kept anyway and is not redundant** —
    // the runtime test proves the branch behaves on the paths it drives, and
    // this proves the two files still express the rule the SAME way. The
    // finding was that they did not, and that is a property of the pair, which
    // no single run can observe.
    for (const rel of [
      "src/app/api/orders/[id]/print/route.ts",
      "src/app/api/orders/[id]/reprint/route.ts",
    ]) {
      const src = read(rel);
      expect(src, `${rel} lost the attempted/not-attempted distinction`).toContain(
        'outcome.reason === "FAILED"',
      );
      // The shape that was wrong: `else { … FAILED … }` with no reason check.
      expect(src, `${rel} writes FAILED for any non-ok outcome`).not.toMatch(
        /}\s*else\s*\{\s*await db\.receipt\.update\([^)]*printStatus: "FAILED"/,
      );
    }
  });

  it("records that nothing reads the column, so the claim is not made again", async () => {
    // The comment this replaced asserted a reader that does not exist. Pinned
    // as a measurement rather than as prose: if a screen starts reading
    // `printStatus`, this test fails and the note gets revisited deliberately.
    const { globSync } = await import("fs");
    const files = globSync("src/**/*.tsx", { cwd: process.cwd() }) as string[];
    const readers = files.filter((f) => read(f).includes("printStatus"));
    expect(readers, "printStatus now has a reader — L-143's other half is live").toEqual([]);
  });
});

// Leaves the database as it found it. `beforeEach` cleans up BEFORE each test,
// so without this the last test's rows outlive the file — and the next file's
// reset is written for the tables that file uses, not for these. A leftover
// `Order` holding a `shiftId` is a P2003 on someone else's `shift.deleteMany()`,
// and the failure surfaces three files away from its cause.
afterAll(async () => {
  await wipe();
});
