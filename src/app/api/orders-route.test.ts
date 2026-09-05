import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { grantStepUp, STEP_UP_REQUIRED_MESSAGE } from "@/lib/services/step-up";
import { hashPin } from "@/lib/auth";
import { saveSettings } from "@/lib/services/settings";

// T-02 (Batch 6.1) — discount-authorization ENFORCEMENT, driven over HTTP.
//
// THE GAP, as the audit put it: "the token primitive has 7 tests in isolation;
// nothing exercises the route branch deciding whether a discount needs one. A
// regression accepting an unapproved discount passes 136/136. The classic POS
// fraud vector."
//
// That was still true after Batch 4.4c built the step-up, and after 5.7b and
// 5.7c pinned the route's ORDERING — because none of those sends a request.
// `withAuth` → `getSession()` → `cookies()` throws outside a request scope, so
// six batches wrote the limitation down and deferred it here. `route-harness.ts`
// is what closed it; this file is the first use.
//
// WHAT THESE PROVE THAT A UNIT TEST DOES NOT: that the branch actually wired
// into `POST /api/orders` refuses. `discount-policy.ts` being correct and the
// route consulting it are two different claims, and only the second one is the
// fraud vector.

const PIN = "424242";
let manager: { id: string; username: string };
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
  await saveSettings({ discountApprovalThreshold: 20, factice: false });

  const u = await db.user.create({
    data: {
      username: `t02-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin(PIN),
    },
  });
  manager = { id: u.id, username: u.username };

  const cat = await db.category.create({ data: { name: "Plats", color: "#fff", sortOrder: 1 } });
  const p = await db.product.create({
    data: { name: "Tacos", price: 1000, vatRate: 10, categoryId: cat.id, active: true, available: true },
  });
  product = { id: p.id, price: p.price };

  await db.shift.create({
    data: { number: 1, openedById: u.id, openedAt: new Date(), openingFloat: 0, status: "OPEN" },
  });

  await signInAs({ id: u.id, username: u.username, role: "MANAGER" });
});

afterAll(wipe);

/** A checkout body. `discountValue` is cents (AMOUNT). */
function order(discountValue: number, stepUpToken?: string) {
  const total = product.price - discountValue;
  return {
    orderType: "TAKEAWAY",
    items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
    ...(discountValue > 0
      ? { discount: { type: "AMOUNT", value: discountValue, ...(stepUpToken ? { stepUpToken } : {}) } }
      : {}),
    payments: [{ method: "CASH", amount: total }],
  };
}

async function post(body: unknown) {
  const mod = await import("@/app/api/orders/route");
  return callJson<{ error?: string; number?: number; total?: number; discountTotal?: number }>(mod.POST, {
    method: "POST",
    url: "http://localhost/api/orders",
    body,
  });
}

describe("T-02 — a discount over the threshold cannot be taken without a PIN", () => {
  it("THE FRAUD VECTOR: 30 % with no token is refused 403", async () => {
    // 300 of 1000 is 30 %, above the configured 20 % threshold.
    const { status, body } = await post(order(300));
    expect(status).toBe(403);
    expect(body.error).toBe(STEP_UP_REQUIRED_MESSAGE);
    // …and nothing was written. A refusal that still books the sale is worse
    // than no refusal at all.
    expect(await db.order.count()).toBe(0);
    expect(await db.fiscalEvent.count()).toBe(0);
  });

  it("a 100 % discount with no token is refused too", async () => {
    // The give-away tender (DD-14, Batch 5.7b) does not open a back door: it
    // still goes through the same gate, because 100 % is over any threshold.
    const body = {
      orderType: "TAKEAWAY",
      items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
      discount: { type: "AMOUNT", value: product.price },
      payments: [{ method: "OFFERT", amount: 0 }],
    };
    const res = await post(body);
    expect(res.status).toBe(403);
    expect(await db.order.count()).toBe(0);
  });

  it("the SAME discount with the caller's own PIN is accepted", async () => {
    // CONTROL. Without this, "refuse everything" would satisfy the cases above.
    const grant = await grantStepUp({
      callerId: manager.id,
      pin: PIN,
      action: "DISCOUNT",
      amount: 300,
    });
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;

    const { status, body } = await post(order(300, grant.token));
    expect(status).toBe(201);
    expect(body.discountTotal).toBe(300);
    expect(body.total).toBe(700);
    // The approver is recorded — C-13's point, and DD-19's.
    const row = await db.order.findFirstOrThrow();
    expect(row.discountApprovedById).toBe(manager.id);
  });

  it("a discount AT or UNDER the threshold needs no PIN", async () => {
    // CONTROL on the other side: the gate must not fire on ordinary trade.
    // `discountNeedsStepUp` is strictly greater-than, so exactly 20 % passes.
    const { status } = await post(order(200));
    expect(status).toBe(201);
    const row = await db.order.findFirstOrThrow();
    expect(row.discountTotal).toBe(200);
    expect(row.discountApprovedById).toBeNull();
  });

  it("a token bound to a SMALLER discount does not authorise a bigger one", async () => {
    // The amount binding, which is what stops a 5 % PIN being reused for 50 %.
    const grant = await grantStepUp({ callerId: manager.id, pin: PIN, action: "DISCOUNT", amount: 300 });
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;
    const { status } = await post(order(900, grant.token));
    expect(status).not.toBe(201);
    expect(await db.order.count()).toBe(0);
  });

  it("a token is single use — the second sale with it is refused", async () => {
    const grant = await grantStepUp({ callerId: manager.id, pin: PIN, action: "DISCOUNT", amount: 300 });
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;

    expect((await post(order(300, grant.token))).status).toBe(201);
    const second = await post(order(300, grant.token));
    expect(second.status).not.toBe(201);
    expect(await db.order.count()).toBe(1);
  });

  it("a token minted for a REFUND does not authorise a discount", async () => {
    // Action binding. A refund PIN and a discount PIN are both "the caller's
    // own PIN"; only the binding keeps them apart.
    const grant = await grantStepUp({ callerId: manager.id, pin: PIN, action: "REFUND", amount: 300 });
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;
    const { status } = await post(order(300, grant.token));
    expect(status).not.toBe(201);
    expect(await db.order.count()).toBe(0);
  });

  it("refuses a token another operator minted", async () => {
    // The CALLER binding, at the route. `step-up.test.ts` (Batch 4.4c) already
    // covers it at the service — a revert of the check fails that file — so
    // this is not the property's only cover. It is here because the route is
    // where it matters: DD-19's whole point is that the person taking the
    // discount re-enters THEIR OWN PIN, and a token minted by the manager in
    // the back office must not settle a discount at the till.
    const other = await db.user.create({
      data: {
        username: `t02-other-${Date.now()}-${Math.random()}`,
        name: "Autre",
        role: "MANAGER",
        pinHash: await hashPin("909090"),
      },
    });
    const grant = await grantStepUp({ callerId: other.id, pin: "909090", action: "DISCOUNT", amount: 300 });
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;

    // Signed in as `manager`, presenting `other`'s token.
    const { status } = await post(order(300, grant.token));
    expect(status).toBe(403);
    expect(await db.order.count()).toBe(0);
  });

  it("refuses an unauthenticated caller before any of this", async () => {
    // The gate under the gate. `api-authorization.test.ts` asserts the route
    // DECLARES a session requirement; this asserts the request is refused.
    clearCookies();
    const { status } = await post(order(0));
    expect(status).toBe(401);
    expect(await db.order.count()).toBe(0);
  });
});
