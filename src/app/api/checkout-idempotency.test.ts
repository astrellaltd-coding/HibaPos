import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { saveSettings } from "@/lib/services/settings";
import { newCheckoutKey, CHECKOUT_KEY_MIN, CHECKOUT_KEY_MAX } from "@/lib/checkout-key";
import { isUniqueViolation } from "@/lib/services/checkout";
import type { OrderDto } from "@/types/api";

// L-89 / L-90 (R8.2) — one checkout attempt, one sale.
//
// L-89, reproduced live by audit pass 4: a double-tap on « Valider » produced
// orders #9 and #10, 28 ms apart, and `FiscalEvent` went 15 → 16. `GrandTotal`
// moved twice — and it is **never decremented** (`schema.prisma`), so the
// inflation is permanent. A refund corrects the money; nothing removes the
// phantom sale.
//
// L-90 is the same permanent consequence reached another way: the sale commits,
// the HTTP response is lost, `api-client.ts` has no timeout and no retry, the
// cart is still on screen, and the operator rings it again.
//
// WHAT IS ASSERTED HERE AND WHAT IS NOT. These drive `POST /api/orders` over
// the real route with a real session. They prove the SERVER is idempotent,
// which is the half that has to hold whatever the client does — a submit latch
// in a React component cannot protect against a lost response, a reload, or a
// second till. The latch itself is a `useRef` in `payment-dialog.tsx` and is
// not driven here: this project has no React test renderer, and the latch is
// the cheap half. **The key is the durable one.**

const PIN = "424242";
let cashier: { id: string; username: string; role: "MANAGER" };
let product: { id: string; price: number };

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
      username: `r82-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin(PIN),
    },
  });
  cashier = { id: u.id, username: u.username, role: "MANAGER" };

  const cat = await db.category.create({ data: { name: `R82 ${Date.now()}`, vatRate: 10 } });
  const p = await db.product.create({
    data: { name: "Pizza R82", price: 1200, categoryId: cat.id, active: true, available: true },
  });
  product = { id: p.id, price: p.price };

  await db.shift.create({
    data: { number: 1, openedById: u.id, openedAt: new Date(), openingFloat: 0, status: "OPEN" },
  });
  await signInAs(cashier);
});

// L-154 BIT HERE, and this is the two-line half of it.
//
// The audit called it "a standing wipe-order hazard that has not yet bitten":
// sixteen test files wipe in an order FK enforcement would refuse if the data
// were there, and two of them delete `User` with nothing else cleared. This
// file is the first to leave orders, payments and shifts behind for them —
// `fiscal-verify-software.test.ts` then failed with a foreign-key violation on
// `db.user.deleteMany()`, three tests down, for a reason nothing in that file
// could explain.
//
// Cleaning up after itself is this file's own responsibility and follows
// `orders-route.test.ts`'s precedent. **The durable fix is one shared wipe
// helper in FK order, and it belongs to R9.7** — sixteen hand-maintained lists
// that already disagree with each other is the finding, not this one file.
afterAll(wipe);

const POST = async () => (await import("@/app/api/orders/route")).POST;

async function checkout(body: Record<string, unknown>) {
  return callJson<OrderDto & { error?: string }>(await POST(), {
    method: "POST",
    url: "http://localhost/api/orders",
    body,
  });
}

/** The sale the till would send, minus the key. */
function sale(extra: Record<string, unknown> = {}) {
  return {
    orderType: "DINE_IN",
    tableLabel: null,
    customerId: null,
    notes: null,
    // The intent shape the till sends — see `checkout-intent.ts`. Written out
    // rather than built through `buildCheckoutItems`, because this file is
    // about the KEY and a cart fixture would only add a way to be wrong.
    items: [{ productId: product.id, quantity: 1, notes: null, optionIds: [], addons: [] }],
    payments: [{ method: "CASH", amount: product.price }],
    ...extra,
  };
}

describe("L-89 — the same key twice is one sale", () => {
  it("books one order, one VENTE event, and one GrandTotal movement", async () => {
    const key = newCheckoutKey();

    const first = await checkout(sale({ idempotencyKey: key }));
    expect(first.status, `first checkout failed: ${first.body.error}`).toBe(201);

    const second = await checkout(sale({ idempotencyKey: key }));
    expect(second.status, `the replay failed: ${second.body.error}`).toBe(201);

    // The consequence, measured the way the audit measured it.
    expect(await db.order.count(), "the sale was booked twice — this is L-89").toBe(1);
    expect(await db.fiscalEvent.count({ where: { type: "VENTE" } })).toBe(1);
    expect(await db.receipt.count()).toBe(1);

    // GrandTotal is never decremented, so a second movement here is permanent.
    const gt = await db.grandTotal.findFirst();
    expect(gt?.totalSales, "GrandTotal moved twice, and it cannot be moved back").toBe(product.price);
    expect(gt?.totalOrders, "the perpetual ticket count moved twice").toBe(1);
  });

  it("answers the replay with the SAME order, not a new one", async () => {
    // The operator must see one sale and one receipt number. An idempotent
    // route that answered 409 would leave the till showing an error for a sale
    // that succeeded, which is L-90 with extra steps.
    const key = newCheckoutKey();
    const first = await checkout(sale({ idempotencyKey: key }));
    const second = await checkout(sale({ idempotencyKey: key }));

    expect(second.body.id).toBe(first.body.id);
    expect(second.body.number).toBe(first.body.number);
    expect(second.body.total).toBe(first.body.total);
    expect(second.body.items?.length).toBe(first.body.items?.length);
    expect(second.body.payments?.length).toBe(first.body.payments?.length);
  });

  it("survives the two requests overlapping, which is what the tap actually does", async () => {
    // The read-then-write inside the service is NOT the guarantee: two taps
    // 28 ms apart can both pass it. The unique index is. Fired together so
    // neither has finished before the other starts.
    const key = newCheckoutKey();
    const [a, b] = await Promise.all([
      checkout(sale({ idempotencyKey: key })),
      checkout(sale({ idempotencyKey: key })),
    ]);

    expect([a.status, b.status], `one of the concurrent taps failed: ${a.body.error ?? b.body.error}`).toEqual([201, 201]);
    expect(a.body.id, "two concurrent taps produced two different orders").toBe(b.body.id);
    expect(await db.order.count()).toBe(1);
    expect(await db.fiscalEvent.count({ where: { type: "VENTE" } })).toBe(1);
  });

  it("still books two sales for two different keys", async () => {
    // The other direction, and the one that would make this useless if wrong:
    // two genuine sales must still be two sales.
    const a = await checkout(sale({ idempotencyKey: newCheckoutKey() }));
    const b = await checkout(sale({ idempotencyKey: newCheckoutKey() }));

    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.id).not.toBe(b.body.id);
    expect(await db.order.count()).toBe(2);
    expect(await db.fiscalEvent.count({ where: { type: "VENTE" } })).toBe(2);
  });

  it("still books a sale when no key is sent at all", async () => {
    // Every order written before this column existed has none, and the e2e
    // suite and any other client must keep working. Two keyless sales are two
    // sales — SQLite treats NULLs as distinct in a unique index, which is the
    // property the migration relies on.
    const a = await checkout(sale());
    const b = await checkout(sale());

    expect([a.status, b.status], `${a.body.error ?? b.body.error}`).toEqual([201, 201]);
    expect(await db.order.count()).toBe(2);
    const rows = await db.order.findMany({ select: { idempotencyKey: true } });
    expect(rows.every((r) => r.idempotencyKey === null)).toBe(true);
  });
});

describe("L-90 — a retry after a lost response is the same sale", () => {
  it("returns the committed order rather than writing a second one", async () => {
    // The sale commits; the response never reaches the till; the cart is still
    // on screen and the operator rings it again with the SAME key, because the
    // key is deliberately not cleared on failure.
    const key = newCheckoutKey();
    const committed = await checkout(sale({ idempotencyKey: key }));
    expect(committed.status).toBe(201);

    // …the till saw nothing, and retries.
    const retry = await checkout(sale({ idempotencyKey: key }));

    expect(retry.status).toBe(201);
    expect(retry.body.number, "the operator would have been given a second receipt number").toBe(
      committed.body.number,
    );
    expect(await db.order.count()).toBe(1);
  });

  it("does not care that the retry's basket is identical — only the key", async () => {
    // Deliberate: the key identifies the ATTEMPT. A retry that differs (a
    // re-scan, a corrected line) is still the same attempt as far as the till
    // is concerned, and answering with the committed order is right — the
    // customer already paid for what was booked.
    const key = newCheckoutKey();
    const first = await checkout(sale({ idempotencyKey: key }));
    const second = await checkout(
      sale({ idempotencyKey: key, payments: [{ method: "CARD", amount: product.price }] }),
    );

    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    const payments = await db.payment.findMany();
    expect(payments.length, "the second basket wrote a payment").toBe(1);
    expect(payments[0].method).toBe("CASH");
  });
});

describe("the key the till generates is one the server accepts", () => {
  it("is inside the bounds the route enforces", () => {
    // Two hand-maintained numbers in two files is how they drift. Asserted
    // here, and the route's own schema is the other half.
    for (let i = 0; i < 50; i++) {
      const k = newCheckoutKey();
      expect(k.length).toBeGreaterThanOrEqual(CHECKOUT_KEY_MIN);
      expect(k.length).toBeLessThanOrEqual(CHECKOUT_KEY_MAX);
    }
  });

  it("does not repeat", () => {
    const keys = new Set(Array.from({ length: 500 }, () => newCheckoutKey()));
    expect(keys.size).toBe(500);
  });

  it("is refused by the route when it is too short to be one", async () => {
    const r = await checkout(sale({ idempotencyKey: "short" }));
    expect(r.status).toBe(400);
    expect(await db.order.count()).toBe(0);
  });
});

describe("the backstop's predicate, since its use is not driven", () => {
  it("recognises a P2002 on idempotencyKey, and nothing else", () => {
    // Prisma reports the offending columns in `meta.target`, as an array on
    // some engines and a string on others. Both shapes, because getting this
    // wrong makes the backstop never fire and nothing would say so.
    expect(isUniqueViolation({ code: "P2002", meta: { target: ["idempotencyKey"] } }, "idempotencyKey")).toBe(true);
    expect(isUniqueViolation({ code: "P2002", meta: { target: "Order_idempotencyKey_key" } }, "idempotencyKey")).toBe(true);

    // A unique violation on a DIFFERENT column must not be swallowed as a
    // replay — `number` is the receipt sequence, and answering that with
    // somebody else's order would be far worse than failing.
    expect(isUniqueViolation({ code: "P2002", meta: { target: ["number"] } }, "idempotencyKey")).toBe(false);
    expect(isUniqueViolation({ code: "P2003", meta: { target: ["idempotencyKey"] } }, "idempotencyKey")).toBe(false);
    expect(isUniqueViolation(new Error("boom"), "idempotencyKey")).toBe(false);
    expect(isUniqueViolation(null, "idempotencyKey")).toBe(false);
    expect(isUniqueViolation(undefined, "idempotencyKey")).toBe(false);
  });
});
