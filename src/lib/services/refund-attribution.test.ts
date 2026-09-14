import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { db } from "@/lib/db";
import {
  processRefund,
  RefundError,
  REFUND_ITEMS_INVALID_MESSAGE,
  type RefundItemAttribution,
} from "@/lib/services/refund";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { wipeDatabase } from "@/lib/test-wipe";
import { refundSchema } from "@/lib/validation";

// L-171 — a refund records WHICH ITEMS it was for.
//
// THE FINDING: a partial refund is apportioned across the order's lines by TTC
// weight, not against the item returned. The audit measured it — refunding
// 500 c of a 1 640 c order moved the 5,5 % bucket from 300 to 209, so **91 c was
// credited at 5,5 % although the stated reason was « Pizza renvoyée »**. There
// was no line-level refund and no column recording the attribution, so an
// inspector could ask which item came back and the software could not answer.
//
// ── THE SCOPE IS THE OPERATOR'S, AND IT IS THE NARROW ONE ───────────────────
// They chose, 2026-09-14: **record the attribution, leave the arithmetic
// alone.** The audit says the arithmetic « is not wrong » — it follows directly
// from « `apportion` is the only splitter », an invariant of this project.
// Computing the refund FROM the named lines moves money between VAT buckets on
// every partial refund, and through the Z report and every close; that is a
// different change and it was not taken.
//
// **So the load-bearing assertion in this file is the one that proves NOTHING
// ABOUT THE MONEY MOVED.** The rest records an answer that did not exist.

let userId: string;
let orderId: string;
let lines: { id: string; productName: string; quantity: number; lineTotal: number }[];

beforeEach(async () => {
  await wipeDatabase();
  await ensureFiscalCounter();

  const u = await db.user.create({
    data: {
      username: `l171-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: "x",
    },
  });
  userId = u.id;

  const shift = await db.shift.create({
    data: { number: 1, openedById: u.id, openedAt: new Date(), openingFloat: 0, status: "OPEN" },
  });

  // The audit's own shape: a 1 640 c order with two rates, so a wrong
  // attribution would be visible in the VAT split rather than hidden.
  const order = await db.order.create({
    data: {
      number: 4001,
      shiftId: shift.id,
      cashierId: u.id,
      status: "COMPLETED",
      subtotal: 1640,
      discountTotal: 0,
      total: 1640,
      vatTotal: 141,
      itemCount: 3,
      completedAt: new Date(),
      items: {
        create: [
          { productName: "Pizza", quantity: 1, lineTotal: 1000, vatRate: 10, unitPrice: 1000 },
          { productName: "Canette", quantity: 2, lineTotal: 640, vatRate: 5.5, unitPrice: 320 },
        ],
      },
      payments: { create: [{ method: "CASH", amount: 1640, cashierId: u.id }] },
    },
  });
  orderId = order.id;
  lines = await db.orderItem.findMany({
    where: { orderId: order.id },
    select: { id: true, productName: true, quantity: true, lineTotal: true },
    orderBy: { lineTotal: "desc" },
  });
});

afterAll(async () => {
  await wipeDatabase();
});

async function orderForRefund() {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { refunds: true } });
  return {
    id: o.id,
    number: o.number,
    total: o.total,
    status: o.status as "COMPLETED" | "REFUNDED",
    orderType: o.orderType as "DINE_IN" | "TAKEAWAY" | "LIVRAISON",
    tableLabel: o.tableLabel,
    refunds: o.refunds.map((r) => ({ amount: r.amount })),
  };
}

const refund = async (amount: number, items?: { orderItemId: string; quantity: number }[]) =>
  processRefund(
    {
      orderId,
      amount,
      reason: "Pizza renvoyée",
      method: "CASH",
      approverId: userId,
      cashierId: userId,
      factice: false,
      items: items ?? null,
    },
    await orderForRefund(),
  );

const pizza = () => lines.find((l) => l.productName === "Pizza")!;
const canette = () => lines.find((l) => l.productName === "Canette")!;

describe("L-171 — the answer that did not exist", () => {
  it("records which line came back, with its name snapshotted", async () => {
    const { refundId } = await refund(500, [{ orderItemId: pizza().id, quantity: 1 }]);
    const row = await db.refund.findUniqueOrThrow({ where: { id: refundId } });

    expect(row.itemsJson, "the attribution was not stored").not.toBeNull();
    const items = JSON.parse(row.itemsJson!) as RefundItemAttribution[];
    expect(items).toHaveLength(1);
    expect(items[0].orderItemId).toBe(pizza().id);
    expect(items[0].quantity).toBe(1);
    // The NAME travels with the id, so the answer survives a catalogue edit or
    // a deleted product — the same rule as `OrderItem.productName`.
    expect(items[0].productName).toBe("Pizza");
    expect(items[0].lineTotal, "the ORDER line's total, not a refunded amount").toBe(1000);
  });

  it("stores null when the cashier names nothing, and that means NOT ATTRIBUTED", async () => {
    // The legitimate answer, and the one every refund before 2026-09-14 gave.
    // Null must not come to mean « the whole order » by anybody's assumption —
    // it is stated in the schema and asserted here.
    const { refundId } = await refund(500);
    const row = await db.refund.findUniqueOrThrow({ where: { id: refundId } });
    expect(row.itemsJson).toBeNull();
  });

  it("survives the product it names being renamed afterwards", async () => {
    const { refundId } = await refund(500, [{ orderItemId: pizza().id, quantity: 1 }]);
    await db.orderItem.update({
      where: { id: pizza().id },
      data: { productName: "Pizza (ancienne recette)" },
    });
    const row = await db.refund.findUniqueOrThrow({ where: { id: refundId } });
    const items = JSON.parse(row.itemsJson!) as RefundItemAttribution[];
    expect(items[0].productName, "the snapshot followed the live row").toBe("Pizza");
  });

  it("seals the attribution into the fiscal journal, not only into the column", async () => {
    // A column can be edited; a fiscal event is covered by the chain hash and
    // cannot. « Which item came back » is exactly what an inspection asks, so
    // the answer belongs in the journal as well as on the row.
    const { refundId, fiscalEventId } = await refund(500, [
      { orderItemId: canette().id, quantity: 2 },
    ]);
    const ev = await db.fiscalEvent.findUniqueOrThrow({ where: { id: fiscalEventId } });
    const payload = JSON.parse(ev.dataJson) as { items?: RefundItemAttribution[] | null };
    expect(payload.items, "the journal carries no attribution").toBeTruthy();
    expect(payload.items![0].productName).toBe("Canette");
    expect(payload.items![0].quantity).toBe(2);
    expect(ev.type).toBe("REMBOURSEMENT");
    expect(refundId).toBeTruthy();
  });

  it("is in the audit row too, where a human looks first", async () => {
    await refund(500, [{ orderItemId: pizza().id, quantity: 1 }]);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "ORDER_REFUNDED" } });
    const details = JSON.parse(audit.details ?? "{}") as { items?: RefundItemAttribution[] | null };
    expect(details.items).toBeTruthy();
    expect(details.items![0].productName).toBe("Pizza");
  });
});

describe("L-171 — an attribution that is wrong is worse than none", () => {
  // None says « not attributed ». Wrong says something false, in the journal,
  // on the screen and to an inspector. So every one of these refuses the whole
  // refund rather than storing part of it.

  it("refuses a line from another order", async () => {
    const other = await db.order.create({
      data: {
        number: 4002,
        shiftId: (await db.shift.findFirstOrThrow({ where: { status: "OPEN" } })).id,
        cashierId: userId,
        status: "COMPLETED",
        subtotal: 500,
        discountTotal: 0,
        total: 500,
        vatTotal: 45,
        itemCount: 1,
        completedAt: new Date(),
        items: {
          create: [{ productName: "Tacos", quantity: 1, lineTotal: 500, vatRate: 10, unitPrice: 500 }],
        },
      },
      include: { items: true },
    });
    await expect(
      refund(500, [{ orderItemId: other.items[0].id, quantity: 1 }]),
    ).rejects.toThrow(REFUND_ITEMS_INVALID_MESSAGE);
  });

  it("refuses an id that does not exist at all", async () => {
    await expect(refund(500, [{ orderItemId: "made-up", quantity: 1 }])).rejects.toThrow(
      RefundError,
    );
  });

  it("refuses more of a line than was sold", async () => {
    // One Pizza was sold; two cannot come back.
    await expect(refund(500, [{ orderItemId: pizza().id, quantity: 2 }])).rejects.toThrow(
      REFUND_ITEMS_INVALID_MESSAGE,
    );
  });

  it("refuses a zero or fractional quantity", async () => {
    for (const quantity of [0, -1, 1.5]) {
      await expect(refund(500, [{ orderItemId: pizza().id, quantity }])).rejects.toThrow(
        REFUND_ITEMS_INVALID_MESSAGE,
      );
    }
  });

  it("refuses the same line named twice", async () => {
    await expect(
      refund(500, [
        { orderItemId: pizza().id, quantity: 1 },
        { orderItemId: pizza().id, quantity: 1 },
      ]),
    ).rejects.toThrow(REFUND_ITEMS_INVALID_MESSAGE);
  });

  it("writes NOTHING when it refuses — no refund, no journal entry", async () => {
    // The refusal is inside the transaction, so a rejected attribution must not
    // leave a refund behind with the money moved and the answer missing. That
    // would be the worst of the three outcomes.
    const before = await db.fiscalEvent.count();
    await expect(refund(500, [{ orderItemId: "made-up", quantity: 1 }])).rejects.toThrow();
    expect(await db.refund.count(), "a refused refund was written anyway").toBe(0);
    expect(await db.fiscalEvent.count(), "a refused refund was journalled").toBe(before);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status, "the order status moved on a refused refund").toBe("COMPLETED");
  });
});

describe("L-171 — and NOTHING about the money changed", () => {
  // The load-bearing property of the operator's decision. If any of these move,
  // the narrow scope has quietly become the wide one and every sealed figure
  // computed since is a different number.

  it("leaves the amount, the total refunded and the order status untouched", async () => {
    const named = await refund(500, [{ orderItemId: pizza().id, quantity: 1 }]);
    expect(named.totalRefunded).toBe(500);
    expect(named.fullyRefunded).toBe(false);
    const row = await db.refund.findUniqueOrThrow({ where: { id: named.refundId } });
    expect(row.amount, "the amount followed the named line's price").toBe(500);
    // 500, not 1000 — the Pizza's line total. The refund is what the cashier
    // typed; naming the line does not re-price it. That is the whole of the
    // operator's decision, in one assertion.
  });

  it("moves the perpetual refund total by the amount, not by the lines", async () => {
    await refund(500, [{ orderItemId: pizza().id, quantity: 1 }]);
    const gt = await db.grandTotal.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(gt.totalRefunded).toBe(500);
  });

  it("still refuses a refund larger than the balance, whatever is named", async () => {
    await expect(refund(2000, [{ orderItemId: pizza().id, quantity: 1 }])).rejects.toThrow(
      RefundError,
    );
  });
});

describe("L-171 — the route accepts it, and validates in the right place", () => {
  it("takes `items` in the schema, shape only", async () => {
    // zod for the SHAPE; the service decides the truth against the order's own
    // lines. A client can name any string, and an id it invented must never
    // become a sealed answer — so the ownership check cannot live here.
    const ok = refundSchema.safeParse({
      amount: 500,
      reason: "x",
      items: [{ orderItemId: "abc", quantity: 1 }],
    });
    expect(ok.success, "the schema rejects a well-formed attribution").toBe(true);

    expect(refundSchema.safeParse({ amount: 500, reason: "x" }).success, "items is optional").toBe(
      true,
    );
    expect(
      refundSchema.safeParse({
        amount: 500,
        reason: "x",
        items: [{ orderItemId: "", quantity: 1 }],
      }).success,
      "an empty id passed the schema",
    ).toBe(false);
    expect(
      refundSchema.safeParse({
        amount: 500,
        reason: "x",
        items: [{ orderItemId: "a", quantity: 0 }],
      }).success,
      "a zero quantity passed the schema",
    ).toBe(false);
  });

  it("is wired from the route into the service", async () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/app/api/orders/[id]/refund/route.ts"),
      "utf8",
    );
    expect(src, "the route drops `items` on the floor").toContain("items: parsed.data.items");
  });

  it("is shown on the screen, because a column nothing reads is a column nobody maintains", async () => {
    // L-143's `printStatus` had three writers and zero readers. This is the
    // answer an inspection asks for; it belongs on the screen and not only in
    // the journal.
    const view = readFileSync(
      path.join(process.cwd(), "src/features/orders/orders-view.tsx"),
      "utf8",
    );
    expect(view, "nothing reads the attribution back").toContain("refundItems(r.itemsJson)");
    expect(view, "a refund with no attribution says nothing at all").toContain(
      "Articles non précisés",
    );
    expect(view, "the cashier cannot name an item").toContain("Articles concernés (facultatif)");
  });
});
