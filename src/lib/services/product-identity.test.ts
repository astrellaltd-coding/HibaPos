import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import {
  aggregateOrders,
  AGGREGATE_INCLUDE,
  periodAggregateOptions,
} from "@/lib/services/aggregate";
import { createOrderInTransaction } from "@/lib/services/checkout";
import { OFFERT } from "@/lib/tender-policy";
import { DEFAULT_SETTINGS } from "@/lib/services/settings";
import type { SettingsDto } from "@/types/api";
import { generateZReport } from "@/lib/services/reports";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { hashPin } from "@/lib/auth";
import { saveSettings } from "@/lib/services/settings";

// L-76 (R2.1) — a product aggregates under its IDENTITY, not under its label.
//
// ── THE DEFECT ───────────────────────────────────────────────────────────────
// `aggregateOrders` keyed `productAgg` by `item.productName`. `productName` is
// a snapshot of the label at sale time and has never been unique: this
// catalogue carries three live pairs sharing a name at different prices —
// Coca, Fanta and Orangina each exist as a 1,50 € canette and a 3,50 €
// bouteille, all six `active` and `available`, all six ringable today. Selling
// one of each produced ONE row reading « Coca ×2 5,00 € », and that row is
// sealed into `ZReport.topProductsJson` and into every close payload, which are
// immutable by design. `reports/products/route.ts` already keyed by
// `productId ?? productName`, so the two reports disagreed about the same day.
//
// ── WHY THIS FILE AND NOT A UNIT TEST ────────────────────────────────────────
// The plan's method: a unit test on an extracted rule proves the RULE, not that
// anything invokes it. This project has three times shipped a correct function
// nothing called. So the four claims here are, in order:
//
//   1. what the CLIENT SENDS — `POST /api/orders` resolves a product intent to
//      a real `OrderItem.productId`. If the route stored no id, keying by id
//      would silently fall back to the name and this whole batch would be a
//      no-op in production while every unit test passed.
//   2. what is AGGREGATED — the reports that share `aggregateOrders` see two
//      rows, over orders written by the real checkout.
//   3. what is SEALED — `ZReport.topProductsJson`, the immutable document, has
//      two rows. This is the one that cannot be corrected afterwards.
//   4. that the two reports now AGREE — the shared aggregate and
//      `/api/reports/products`, which never had this bug, report the same
//      per-product quantities and revenue for the same period.

const PIN = "515151";
let manager: { id: string; username: string };
let shiftId: string;
let canette: { id: string; price: number };
let bouteille: { id: string; price: number };

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.zReport.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.fiscalCounter.deleteMany();
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  await ensureFiscalCounter();
  await saveSettings({ factice: false });

  const u = await db.user.create({
    data: {
      username: `r21-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin(PIN),
    },
  });
  manager = { id: u.id, username: u.username };

  // The live collision, reproduced: one name, two categories, two prices.
  // Both rates are 10 so nothing here depends on the rate — the point is that
  // two DIFFERENT products are indistinguishable by label alone.
  const cans = await db.category.create({
    data: { name: "Canette", color: "#111", sortOrder: 1, vatRate: 10 },
  });
  const bottles = await db.category.create({
    data: { name: "Bouteilles", color: "#222", sortOrder: 2, vatRate: 10 },
  });
  const a = await db.product.create({
    data: { name: "Coca", price: 150, vatRate: 10, categoryId: cans.id, active: true, available: true },
  });
  const b = await db.product.create({
    data: { name: "Coca", price: 350, vatRate: 10, categoryId: bottles.id, active: true, available: true },
  });
  canette = { id: a.id, price: a.price };
  bouteille = { id: b.id, price: b.price };

  const s = await db.shift.create({
    data: { number: 1, openedById: u.id, openedAt: new Date(), openingFloat: 0, status: "OPEN" },
  });
  shiftId = s.id;

  await signInAs({ id: u.id, username: u.username, role: "MANAGER" });
});

afterAll(wipe);

/** A sale through the route the till actually calls. */
async function sell(productId: string, quantity: number, price: number) {
  const mod = await import("@/app/api/orders/route");
  const res = await callJson<{ error?: string; id?: string }>(mod.POST, {
    method: "POST",
    url: "http://localhost/api/orders",
    body: {
      orderType: "TAKEAWAY",
      items: [{ productId, quantity, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: price * quantity }],
    },
  });
  expect(res.status).toBe(201);
  return res;
}

async function ordersForAggregate() {
  return db.order.findMany({ where: { shiftId }, include: AGGREGATE_INCLUDE });
}

describe("L-76 — what the client sends: the route records an identity", () => {
  it("stores the resolved productId on every line, never just the name", async () => {
    await sell(canette.id, 1, canette.price);
    await sell(bouteille.id, 1, bouteille.price);

    const items = await db.orderItem.findMany({ orderBy: { lineTotal: "asc" } });
    expect(items).toHaveLength(2);
    // Both lines carry the SAME label...
    expect(items.map((i) => i.productName)).toEqual(["Coca", "Coca"]);
    // ...and DIFFERENT identities. This is the fact the aggregation now keys
    // on; if it were ever untrue the fix below would be inert in production.
    expect(items[0].productId).toBe(canette.id);
    expect(items[1].productId).toBe(bouteille.id);
    expect(items[0].productId).not.toBe(items[1].productId);
  });
});

describe("L-76 — what is aggregated: two products, two rows", () => {
  it("does not merge two products that share a name", async () => {
    await sell(canette.id, 3, canette.price); // 450
    await sell(bouteille.id, 2, bouteille.price); // 700

    const agg = aggregateOrders(await ordersForAggregate());

    // Before the fix this was a single row: { name: "Coca", quantity: 5,
    // total: 1150 } — a figure no product ever charged.
    expect(agg.topProducts).toHaveLength(2);
    expect(agg.topProducts.map((p) => p.name)).toEqual(["Coca", "Coca"]);

    const byId = new Map(agg.topProducts.map((p) => [p.productId, p]));
    expect(byId.get(canette.id)).toMatchObject({ quantity: 3, total: 450 });
    expect(byId.get(bouteille.id)).toMatchObject({ quantity: 2, total: 700 });

    // The totals still reconcile: splitting a row must not invent or lose a
    // cent, which is the property every report downstream depends on.
    expect(agg.topProducts.reduce((s, p) => s + p.total, 0)).toBe(agg.salesTotal);
    expect(agg.topProducts.reduce((s, p) => s + p.quantity, 0)).toBe(agg.itemsCount);
  });

  it("still merges two lines that are genuinely the same product", async () => {
    // The CONTROL. Keying by identity must not split a product across the
    // orders it was sold on — that would be the opposite defect, and a test
    // that only proves separation cannot tell the two apart.
    await sell(canette.id, 1, canette.price);
    await sell(canette.id, 2, canette.price);

    const agg = aggregateOrders(await ordersForAggregate());
    expect(agg.topProducts).toHaveLength(1);
    expect(agg.topProducts[0]).toMatchObject({ productId: canette.id, quantity: 3, total: 450 });
  });
});

describe("L-76 — what is SEALED: the Z report is the document that cannot be fixed", () => {
  it("seals two rows into topProductsJson, with the identity that tells them apart", async () => {
    await sell(canette.id, 3, canette.price);
    await sell(bouteille.id, 2, bouteille.price);

    const { z } = await generateZReport(shiftId, 0, manager.id);
    const sealed = JSON.parse(z.topProductsJson ?? "[]") as {
      productId: string | null;
      name: string;
      quantity: number;
      total: number;
    }[];

    expect(sealed).toHaveLength(2);
    expect(sealed.every((r) => r.name === "Coca")).toBe(true);
    // Sealed and immutable: this is why R2.1 runs before the restaurant's
    // first close, while the shape is still free to change.
    expect(new Set(sealed.map((r) => r.productId))).toEqual(
      new Set([canette.id, bouteille.id]),
    );
    expect(sealed.find((r) => r.productId === canette.id)).toMatchObject({ quantity: 3, total: 450 });
    expect(sealed.find((r) => r.productId === bouteille.id)).toMatchObject({ quantity: 2, total: 700 });
    // The Z's own product rows still add up to the Z's own sales figure.
    expect(sealed.reduce((s, r) => s + r.total, 0)).toBe(z.salesTotal);
  });
});

describe("L-76 — the two reports agree", () => {
  it("aggregateOrders and /api/reports/products give the same product rows", async () => {
    await sell(canette.id, 3, canette.price);
    await sell(bouteille.id, 2, bouteille.price);

    const agg = aggregateOrders(await ordersForAggregate());

    const now = new Date();
    const ymd = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
    const mod = await import("@/app/api/reports/products/route");
    const { status, body } = await callJson<{
      rows: { productId: string | null; productName: string; quantity: number; revenue: number }[];
    }>(mod.GET, { url: `http://localhost/api/reports/products?from=${ymd}&to=${ymd}` });
    expect(status).toBe(200);

    // The disagreement L-76 named: this route always keyed by identity and the
    // shared aggregate keyed by name, so for this day one said two rows and the
    // other said one. Both say two now, with the same figures in each.
    const mine = new Map(agg.topProducts.map((p) => [p.productId, p]));
    const theirs = new Map(body.rows.map((r) => [r.productId, r]));
    expect([...theirs.keys()].sort()).toEqual([...mine.keys()].sort());
    for (const [id, row] of theirs) {
      expect(mine.get(id)!.quantity).toBe(row.quantity);
      expect(mine.get(id)!.total).toBe(row.revenue);
      expect(mine.get(id)!.name).toBe(row.productName);
    }
  });
});

describe("L-76 — the CORRECTION branch keys the same way", () => {
  it("credits two cross-period refunds to the two products that were refunded", async () => {
    // `aggregateOrders` has TWO per-product accumulator sites, and they must
    // key identically or a correction lands in a different bucket from the sale
    // it corrects. The second one runs only for an order whose SALE belongs to
    // another period — DD-10's cross-period refund, where today's till hands
    // back money for a sale booked earlier. It moves revenue and deliberately
    // never moves quantity.
    //
    // BOTH Cocas are refunded here, and that is the point: with one order there
    // is only one bucket and keying by name gives the right answer by accident.
    // A first version of this test did exactly that and survived the revert —
    // it proved the branch ran, not that it keyed by identity.
    //
    // Built rather than driven, because the shape needed is two periods and
    // `POST /api/orders` can only write into now. The identity these rows carry
    // is the one the route was proved to store, in the first test above.
    const day1 = new Date(2026, 3, 10, 12, 0);
    const day2 = new Date(2026, 3, 20, 12, 0);
    const sellThenRefund = async (n: number, productId: string, total: number, back: number) => {
      const o = await db.order.create({
        data: {
          number: n,
          shiftId,
          cashierId: manager.id,
          status: "COMPLETED",
          subtotal: total,
          discountTotal: 0,
          total,
          vatTotal: 0,
          itemCount: 1,
          createdAt: day1,
          completedAt: day1,
          items: {
            create: [
              { productId, productName: "Coca", quantity: 1, lineTotal: total, vatRate: 10, unitPrice: total },
            ],
          },
          payments: { create: [{ method: "CASH", amount: total, cashierId: manager.id }] },
        },
      });
      await db.refund.create({
        data: {
          orderId: o.id,
          amount: back,
          method: "CASH",
          reason: "test",
          cashierId: manager.id,
          shiftId,
          createdAt: day2,
        },
      });
      return o;
    };

    await sellThenRefund(9001, canette.id, 150, 50);
    await sellThenRefund(9002, bouteille.id, 350, 100);

    const from = new Date(2026, 3, 15, 0, 0);
    const to = new Date(2026, 3, 25, 0, 0);
    const orders = await db.order.findMany({
      where: { createdAt: { lt: from } },
      include: AGGREGATE_INCLUDE,
    });
    expect(orders).toHaveLength(2);
    const agg = aggregateOrders(orders, periodAggregateOptions(from, to));

    // The later period books the two corrections and nothing else. Keyed by
    // name they collapse into ONE row called « Coca » carrying −150, and the
    // two products' revenue becomes unattributable in a sealed document.
    expect(agg.topProducts).toHaveLength(2);
    const byId = new Map(agg.topProducts.map((p) => [p.productId, p]));
    expect(byId.get(canette.id)).toEqual({
      productId: canette.id,
      name: "Coca",
      quantity: 0, // a refund does not un-sell: the correction moves money only
      total: -50,
    });
    expect(byId.get(bouteille.id)).toEqual({
      productId: bouteille.id,
      name: "Coca",
      quantity: 0,
      total: -100,
    });
    // And the two corrections still add up to the period's own movement.
    expect(agg.salesTotal).toBe(-150);
    expect(agg.topProducts.reduce((sum, p) => sum + p.total, 0)).toBe(agg.salesTotal);
  });
});

describe("L-76 — the GIVE-AWAY list keys the same way", () => {
  it("does not merge two given-away products that share a name", async () => {
    // DD-20's `givenAwayProducts` is the third accumulator, and it is sealed
    // into the close payload beside `topProducts`. It had the identical defect.
    const give = async (productId: string, price: number) =>
      createOrderInTransaction({
        shiftId,
        cashierId: manager.id,
        customerId: null,
        orderType: "TAKEAWAY",
        tableLabel: null,
        notes: null,
        subtotal: price,
        discountTotal: price, // a give-away IS a 100 % discount (DD-14)
        totalAfterDiscount: 0,
        discountApprovedById: manager.id,
        itemCount: 1,
        items: [
          {
            productId,
            productName: "Coca",
            unitPrice: price,
            quantity: 1,
            lineTotal: price,
            vatRate: 10,
            optionsJson: null,
            addOnsJson: null,
            notes: null,
          },
        ],
        payments: [{ method: OFFERT, amount: 0 }],
        settings: { ...DEFAULT_SETTINGS, factice: false } as unknown as SettingsDto,
      });

    await give(canette.id, 150);
    await give(bouteille.id, 350);

    const agg = aggregateOrders(await ordersForAggregate());
    expect(agg.givenAwayCount).toBe(2);
    expect(agg.givenAwayProducts).toHaveLength(2);
    expect(new Set(agg.givenAwayProducts.map((p) => p.productId))).toEqual(
      new Set([canette.id, bouteille.id]),
    );
    // Nothing leaked into the sales figures — DD-20 is untouched by R2.1.
    expect(agg.salesTotal).toBe(0);
    expect(agg.topProducts).toHaveLength(0);
  });
});

describe("L-76 — the row order of two rows that share a name", () => {
  it("breaks the last tie on identity, not on arrival order", async () => {
    // Once two rows can share a name, `b.quantity - a.quantity ||
    // a.name.localeCompare(b.name)` returns 0 for both comparisons and the
    // order falls through to whichever order happened to be read first. These
    // rows are SEALED, so their order should be a property of the data and not
    // of a query plan. Asserted both ways round: the same two products, sold in
    // the opposite sequence, must seal in the same order.
    const ids = [canette.id, bouteille.id].sort();
    await sell(canette.id, 1, canette.price);
    await sell(bouteille.id, 1, bouteille.price);
    const first = aggregateOrders(await ordersForAggregate());
    expect(first.topProducts.map((p) => p.productId)).toEqual(ids);

    await db.payment.deleteMany();
    await db.orderItem.deleteMany();
    await db.order.deleteMany();

    await sell(bouteille.id, 1, bouteille.price);
    await sell(canette.id, 1, canette.price);
    const second = aggregateOrders(await ordersForAggregate());
    expect(second.topProducts.map((p) => p.productId)).toEqual(ids);
  });
});

describe("L-76 — a line that has lost its product", () => {
  it("falls back to the name when productId is null, and says so in the row", async () => {
    // `OrderItem.product` is `onDelete: SetNull`, so deleting a product from
    // the catalogue detaches the sales it made rather than rewriting them. Such
    // a line has no identity left, and the name is the best one still on the
    // record — the same fallback `reports/products/route.ts` has always used.
    // Nothing in this database is in that state today; the branch exists
    // because the column is nullable and a report must not throw on it.
    const agg = aggregateOrders([
      {
        status: "COMPLETED",
        subtotal: 500,
        discountTotal: 0,
        total: 500,
        itemCount: 1,
        items: [{ productName: "Produit supprimé", quantity: 1, lineTotal: 500, vatRate: 10 }],
        payments: [{ method: "CASH", amount: 500 }],
        refunds: [],
      },
    ]);
    expect(agg.topProducts).toEqual([
      { productId: null, name: "Produit supprimé", quantity: 1, total: 500 },
    ]);
  });
});
