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
  // L-154 (R9.7): Refund.orderId is `onDelete: Restrict`.
  await db.refund.deleteMany();
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

// T-08 (Batch 6.2) — the six cases that used to test `checkoutSchema`.
//
// `validation.test.ts` exercised a schema **no route runs**: the live checkout
// validates with `checkoutIntentSchema`, declared inline in `orders/route.ts`
// and differently shaped. A reader concluded checkout input was validated; it
// was validated by something else entirely, and the tests could not have
// noticed if the real one changed.
//
// **They were re-pointed, not deleted.** Four of the six name behaviour that is
// real and had NO other cover — measured before touching anything: nothing
// tested the LIVRAISON customer rule against the route, and nothing tested the
// empty-order or no-payments refusals at all. Deleting them would have reduced
// real coverage, which this batch's criterion forbids and safety rule 2
// prohibits. Re-pointed, they assert the same intentions about the object that
// actually runs.
describe("L-84 — a product hidden from the till cannot be ordered by naming it", () => {
  // THE FINDING: the route checked `active` and `available` and NOT
  // `showOnPos`, so a request naming a hidden product directly was booked.
  // « Cannot be sold alone » was true of the INTERFACE and not of the API.
  //
  // Not a fraud vector — the till is the only client and it prices from the
  // real catalogue — but R3.3 created three hidden components precisely so a
  // menu's food half is never sold on its own, and that promise was one HTTP
  // request from being false.

  /** A product the grid does not show — R3.3's shape. */
  async function hiddenProduct() {
    const cat = await db.category.findFirstOrThrow();
    return db.product.create({
      data: {
        name: "Box 15 (sans boisson)",
        price: 900,
        vatRate: 10,
        categoryId: cat.id,
        active: true,
        available: true,
        showOnPos: false,
      },
    });
  }

  it("REFUSES it, where it used to book it", async () => {
    const hidden = await hiddenProduct();
    const res = await post({
      orderType: "TAKEAWAY",
      items: [{ productId: hidden.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: 900 }],
    });
    expect(res.status).toBe(400);
    expect(await db.order.count(), "a hidden product was booked").toBe(0);
  });

  it("says nothing that confirms the product exists", async () => {
    // A distinct refusal — « ce produit est masqué » — would tell a caller that
    // the id they guessed is real. The message is the same one an unknown id
    // gets, deliberately.
    const hidden = await hiddenProduct();
    const refusedHidden = await post({
      orderType: "TAKEAWAY",
      items: [{ productId: hidden.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: 900 }],
    });
    const refusedUnknown = await post({
      orderType: "TAKEAWAY",
      items: [{ productId: "does-not-exist", quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: 900 }],
    });
    expect(refusedHidden.status).toBe(refusedUnknown.status);
    // Same wording; only the echoed id differs, and the caller supplied that.
    const strip = (m?: string) => (m ?? "").replace(/ : .*$/, "");
    expect(strip(refusedHidden.body.error)).toBe(strip(refusedUnknown.body.error));
  });

  it("still sells an ORDINARY product — the control", async () => {
    // Without this the refusal above is satisfied by a route that refuses
    // everything, which is the vacuous shape this project has been bitten by.
    const res = await post(order(0));
    expect(res.status).toBe(201);
    expect(await db.order.count()).toBe(1);
  });

  it("spells the rule the way the OTHER reader of showOnPos spells it", async () => {
    // `pos-grid.ts:37` reads `showOnPos !== false`; this route reads
    // `showOnPos === false`. Both treat a null as VISIBLE. The bare `!showOnPos`
    // form treats it as HIDDEN — so the day the column becomes nullable, those
    // two readers would disagree about every null row. That is L-129 and L-177
    // exactly: one column, two readers, no stated meaning for null.
    //
    // The column is `Boolean @default(true)` and NOT NULL today (measured on
    // the live catalogue: 3 hidden, 81 visible, no nulls), so **no runtime test
    // can distinguish the two spellings** — a revert swapping them produces no
    // failure, correctly, and that is a fact about the change rather than a gap.
    // What IS checkable is that the two readers agree, and that is the property
    // worth keeping.
    const { readFileSync } = await import("fs");
    const path = (await import("path")).default;
    const code = (rel: string) =>
      readFileSync(path.join(process.cwd(), rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*)/.test(l))
        .join("\n");

    for (const rel of ["src/app/api/orders/route.ts", "src/lib/pos-grid.ts"]) {
      const src = code(rel);
      expect(src, `${rel} stopped consulting showOnPos`).toMatch(/showOnPos/);
      expect(
        src,
        `${rel} uses the bare "!showOnPos", which reads a null as HIDDEN while ` +
          "the other reader reads it as visible",
      ).not.toMatch(/!\s*\w+\.showOnPos\b/);
    }
  });

  it("leaves MENUS alone — and names the test that proves it", async () => {
    // **THE THING THIS CHANGE COULD HAVE BROKEN.** The guard is on the
    // TOP-LEVEL product the cart names. A menu composé is looked up here as the
    // MENU — `showOnPos = true` — and explodes into its components from
    // `product.comboSlots`, not through a second pass of the check. So a menu
    // whose components are hidden must still sell.
    //
    // **That is already proved, properly, somewhere else**:
    // `hidden-product.test.ts` rings a box menu through this very route with a
    // hidden component and checks its VAT rate, on the real R3.3 fixture. My
    // first attempt here rebuilt that fixture by hand, got `ComboSlot`'s shape
    // wrong, and would have been a worse copy of a better test.
    //
    // So this asserts the COVERAGE still exists rather than duplicating it: if
    // someone deletes that test, this says where the safety net went.
    const { readFileSync } = await import("fs");
    const path = (await import("path")).default;
    const src = readFileSync(
      path.join(process.cwd(), "src/lib/services/hidden-product.test.ts"),
      "utf8",
    );
    expect(src, "the menu-through-the-real-route test is gone").toContain(
      "sells inside a menu, through the real checkout",
    );
    expect(src, "it no longer drives THIS route").toContain('import("@/app/api/orders/route")');
  });
});

describe("T-08 — the checkout input rules, against the schema the route runs", () => {
  it("accepts a valid DINE_IN order", async () => {
    const { status } = await post({
      orderType: "DINE_IN",
      items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: product.price }],
    });
    expect(status).toBe(201);
  });

  it("accepts TAKEAWAY without a customer", async () => {
    const { status } = await post(order(0));
    expect(status).toBe(201);
  });

  it("REFUSES LIVRAISON without a customer", async () => {
    // The old test called this "superRefine" — the live route does not use one,
    // it checks at `orders/route.ts` after pricing. Same rule, real object.
    const { status, body } = await post({
      orderType: "LIVRAISON",
      items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: product.price }],
    });
    expect(status).toBe(400);
    expect(body.error).toContain("livraison");
    expect(await db.order.count()).toBe(0);
  });

  it("accepts LIVRAISON with a customer who has name, phone, address and town", async () => {
    // CONTROL, and it pins what "a customer" has to mean: the route demands
    // all four, so a customer row with only a name is still refused. L-221
    // added the town on 2026-09-18, on the operator's decision.
    const customer = await db.customer.create({
      data: { name: "Jean Dupont", phone: "0612131415", address: "1 rue Test", city: "Lyon" },
    });
    const { status } = await post({
      orderType: "LIVRAISON",
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: product.price }],
    });
    expect(status).toBe(201);
  });

  it("REFUSES LIVRAISON to a customer with NO PHONE — L-214's gap", async () => {
    // THE CASE NOTHING PINNED, and the one the owner met. This route has
    // demanded a phone since it was written; the till gated on the address
    // alone, so this exact client passed every check the cashier could see,
    // the payment dialog opened, the cash was taken — and then this.
    //
    // The refusal is tested HERE as well as in `delivery-customer.test.ts`
    // because a rule test proves the rule and not that the route calls it.
    const customer = await db.customer.create({
      data: { name: "Sans Téléphone", address: "1 rue Test", city: "Lyon" },
    });
    const { status, body } = await post({
      orderType: "LIVRAISON",
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: product.price }],
    });
    expect(status).toBe(400);
    expect(body.error).toContain("livraison");
    expect(body.error, "the refusal does not say WHICH field is missing").toContain("téléphone");
    expect(await db.order.count()).toBe(0);
  });

  it("REFUSES LIVRAISON to a customer with NO TOWN — L-221", async () => {
    // Tested HERE as well as in `delivery-customer.test.ts` for the reason the
    // test above gives: a rule test proves the rule and not that the route
    // calls it. This project has shipped that gap three times.
    //
    // The client the owner made at the caisse on 2026-09-18: a name, a phone
    // and a street, because there was no box for a town anywhere. Yesterday
    // this order was accepted and the driver got a street with no commune.
    const customer = await db.customer.create({
      data: { name: "Sans Ville", phone: "0612131415", address: "1 rue Test" },
    });
    const { status, body } = await post({
      orderType: "LIVRAISON",
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: product.price }],
    });
    expect(status).toBe(400);
    expect(body.error).toContain("livraison");
    expect(body.error, "the refusal does not name the town").toContain("ville");
    expect(await db.order.count()).toBe(0);
  });

  it("names ONLY what is missing, rather than reciting all three", async () => {
    // The old message recited « un nom, un téléphone et une adresse » whatever
    // was actually absent, which tells a cashier holding the cash nothing about
    // what to fix. Same sentence the till prints before it gets this far.
    const customer = await db.customer.create({ data: { name: "Rien Que Le Nom" } });
    const { status, body } = await post({
      orderType: "LIVRAISON",
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: product.price }],
    });
    expect(status).toBe(400);
    expect(body.error).toContain("téléphone");
    expect(body.error).toContain("adresse");
    expect(body.error, "a name was given, so it must not be listed as missing").not.toContain("le nom");
  });

  it("REFUSES a customerId that matches no row, and says so", async () => {
    // Its own message since L-214: the shared rule would otherwise report
    // « le nom, le téléphone et l'adresse » missing from a client that does
    // not exist, which sends the cashier looking for a record to fix.
    const { status, body } = await post({
      orderType: "LIVRAISON",
      customerId: "cl00000000000000000000000",
      items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: product.price }],
    });
    expect(status).toBe(400);
    expect(body.error).toContain("introuvable");
    expect(await db.order.count()).toBe(0);
  });

  it("REFUSES LIVRAISON to a customer whose address is only WHITESPACE", async () => {
    // `!customer.address` was truthy for « "  " », so a space was an address.
    const customer = await db.customer.create({
      data: { name: "Espace", phone: "0600000000", address: "   " },
    });
    const { status, body } = await post({
      orderType: "LIVRAISON",
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: product.price }],
    });
    expect(status).toBe(400);
    expect(body.error).toContain("adresse");
  });

  it("REFUSES LIVRAISON to a customer with no address", async () => {
    // Added at the re-pointing: the old schema test could not express this,
    // because the schema only knew whether a `customerId` was present.
    const customer = await db.customer.create({ data: { name: "Sans Adresse", phone: "0600000000" } });
    const { status, body } = await post({
      orderType: "LIVRAISON",
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: product.price }],
    });
    expect(status).toBe(400);
    expect(body.error).toContain("adresse");
  });

  it("REFUSES an order with no items", async () => {
    const { status, body } = await post({
      orderType: "TAKEAWAY",
      items: [],
      payments: [{ method: "CASH", amount: 100 }],
    });
    expect(status).toBe(400);
    expect(body.error).toContain("vide");
  });

  it("REFUSES an order with no payments", async () => {
    const { status, body } = await post({
      orderType: "TAKEAWAY",
      items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [],
    });
    expect(status).toBe(400);
    expect(body.error).toContain("Au moins un paiement");
  });

  // ── L-123 (R9.7) — THE TENDER MUST MATCH THE PRICE THE SERVER COMPUTED ─────
  //
  // `paidTotal !== totalAfterDiscount → 400 « Paiement incorrect »` is the one
  // thing stopping a basket booking a 10,00 € sale against a 1,00 € tender, and
  // **removing it failed nothing.** « Paiement incorrect » appeared in the route
  // and in comments, and in no test and no e2e spec.
  //
  // It went untested because it is invisible to the helpers: `order()` above
  // computes `amount` FROM the price, and so does every other fixture in the
  // suite, so none of them can even express a mismatch. The price is passed
  // through the same arithmetic on both sides and the assertion is a tautology.
  // These build the body by hand for that reason.
  //
  // Both directions matter and they are not symmetrical. **Underpaying is the
  // fraud** — a till that books the sale and takes a euro. **Overpaying is the
  // mistake** — change owed, and an order whose payments and total disagree,
  // which every report downstream reads as money that arrived.

  it("REFUSES an UNDERPAYMENT, which is the fraud", async () => {
    const { status, body } = await post({
      orderType: "TAKEAWAY",
      items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: 100 }], // the product is 1 000
    });
    expect(status).toBe(400);
    expect(body.error).toContain("Paiement incorrect");
    expect(await db.order.count(), "a sale was booked against a short tender").toBe(0);
  });

  it("REFUSES an OVERPAYMENT, because change is not the server's to invent", async () => {
    const { status, body } = await post({
      orderType: "TAKEAWAY",
      items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: product.price + 500 }],
    });
    expect(status).toBe(400);
    expect(body.error).toContain("Paiement incorrect");
    expect(await db.order.count()).toBe(0);
  });

  it("REFUSES a one-cent mismatch, in either direction", async () => {
    // The interesting boundary. A check written with a tolerance would pass
    // the two above and let a rounding-shaped skim through.
    for (const delta of [-1, 1]) {
      const { status } = await post({
        orderType: "TAKEAWAY",
        items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
        payments: [{ method: "CASH", amount: product.price + delta }],
      });
      expect({ delta, status }).toEqual({ delta, status: 400 });
    }
    expect(await db.order.count()).toBe(0);
  });

  it("REFUSES when SPLIT payments do not add up", async () => {
    // The realistic shape: two tenders, each plausible, summing to less than
    // the basket. A per-payment check would pass this.
    const { status, body } = await post({
      orderType: "TAKEAWAY",
      items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [
        { method: "CASH", amount: Math.floor(product.price / 2) },
        { method: "CARD", amount: Math.floor(product.price / 2) - 100 },
      ],
    });
    expect(status).toBe(400);
    expect(body.error).toContain("Paiement incorrect");
    expect(await db.order.count()).toBe(0);
  });

  it("ACCEPTS split payments that DO add up — the control", async () => {
    // Without this the four above are satisfied by a route that refuses every
    // split tender, and the till takes cash only.
    const half = Math.floor(product.price / 2);
    const { status } = await post({
      orderType: "TAKEAWAY",
      items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [
        { method: "CASH", amount: half },
        { method: "CARD", amount: product.price - half },
      ],
    });
    expect(status).toBe(201);
    expect(await db.order.count()).toBe(1);
  });

  it("checks against the price the SERVER computed, not the one sent", async () => {
    // The whole meaning of « server-authoritative ». A client that sends its
    // own total must not be able to move the figure the tender is compared to.
    const { status } = await post({
      orderType: "TAKEAWAY",
      items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
      total: 100,
      subtotal: 100,
      payments: [{ method: "CASH", amount: 100 }],
    });
    expect(status, "a client-supplied total was believed").toBe(400);
    expect(await db.order.count()).toBe(0);
  });
});

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

describe("L-217 — how many viandes a size includes, through the real route", () => {
  // THE DEFECT THIS PINS. The operator entered the tacos with `Viande` as a
  // category group, required and multi-select. The route enforced « at least
  // one » and nothing else, so a Tacos M at 6,90 € took all six viandes for
  // 6,90 €. Priced by the server, booked, and sealed.
  //
  // THROUGH THE ROUTE and not only `computeLinePricing`, because the rule and
  // its fetch are two different things: a quota the checkout does not SELECT is
  // a quota that cannot fire, and no rule test can see that.

  /** A category with a `Viande` group, and a taco whose quota is `included`. */
  async function tacosWith(included: number | null, price = 690) {
    const cat = await db.category.create({
      data: { name: `Tacos-${Date.now()}-${Math.random()}`, color: "#f97316", sortOrder: 9 },
    });
    const group = await db.categoryOptionGroup.create({
      data: { categoryId: cat.id, name: "Viande", required: true, multiple: true },
    });
    const hachee = await db.categoryOptionChoice.create({
      data: { groupId: group.id, name: "Viande hachée", priceModifier: 0 },
    });
    const merguez = await db.categoryOptionChoice.create({
      data: { groupId: group.id, name: "Merguez", priceModifier: 0 },
    });
    const tenders = await db.categoryOptionChoice.create({
      data: { groupId: group.id, name: "Tenders", priceModifier: 100 },
    });
    const taco = await db.product.create({
      data: {
        name: included === 1 ? "Tacos M" : included === 2 ? "Tacos L" : "Tacos libre",
        price,
        vatRate: 10,
        categoryId: cat.id,
        active: true,
        available: true,
        inheritCategoryGlobals: true,
      },
    });
    if (included !== null) {
      await db.productOptionQuota.create({
        data: { productId: taco.id, groupId: group.id, included },
      });
    }
    return { taco, hachee, merguez, tenders };
  }

  it("REFUSES the six-viande Tacos M — the sale that was possible until now", async () => {
    const { taco, hachee, merguez, tenders } = await tacosWith(1);
    const { status, body } = await post({
      orderType: "TAKEAWAY",
      items: [
        { productId: taco.id, quantity: 1, optionIds: [hachee.id, merguez.id, tenders.id], addons: [] },
      ],
      payments: [{ method: "CASH", amount: 790 }],
    });
    expect(status).toBe(400);
    expect(body.error).toContain("1 au maximum");
    expect(body.error).toContain("Tacos M");
    expect(await db.order.count()).toBe(0);
  });

  it("REFUSES two of the SAME viande on a Tacos M", async () => {
    // The repeat is the quantity. Before this, the server put the list through
    // a `Set` and this order was one viande — accepted, and half of it never
    // priced or printed.
    const { taco, hachee } = await tacosWith(1);
    const { status, body } = await post({
      orderType: "TAKEAWAY",
      items: [{ productId: taco.id, quantity: 1, optionIds: [hachee.id, hachee.id], addons: [] }],
      payments: [{ method: "CASH", amount: 690 }],
    });
    expect(status).toBe(400);
    expect(body.error).toContain("1 au maximum");
  });

  it("ACCEPTS two of the same viande on a Tacos L, and SNAPSHOTS the quantity", async () => {
    const { taco, hachee } = await tacosWith(2, 890);
    const { status } = await post({
      orderType: "TAKEAWAY",
      items: [{ productId: taco.id, quantity: 1, optionIds: [hachee.id, hachee.id], addons: [] }],
      payments: [{ method: "CASH", amount: 890 }],
    });
    expect(status).toBe(201);
    const item = await db.orderItem.findFirst({ where: { productName: "Tacos L" } });
    const options = JSON.parse(item!.optionsJson!) as { choice: string; quantity?: number }[];
    // ONE entry carrying two, not two entries — the shape `addOnsJson` already
    // uses (L-127, R8.5), so the ticket can print « 2 × Viande hachée ».
    expect(options).toHaveLength(1);
    expect(options[0]!.choice).toBe("Viande hachée");
    expect(options[0]!.quantity).toBe(2);
  });

  it("OMITS the quantity when it is one, so old and new snapshots read alike", () => {
    // L-127's rule, kept: every `optionsJson` already written omits it and
    // readers must tolerate both vintages.
    return (async () => {
      const { taco, hachee } = await tacosWith(2, 890);
      const { status } = await post({
        orderType: "TAKEAWAY",
        items: [{ productId: taco.id, quantity: 1, optionIds: [hachee.id], addons: [] }],
        payments: [{ method: "CASH", amount: 890 }],
      });
      expect(status).toBe(201);
      const item = await db.orderItem.findFirst({ where: { productName: "Tacos L" } });
      const options = JSON.parse(item!.optionsJson!) as Record<string, unknown>[];
      expect(options[0]).not.toHaveProperty("quantity");
    })();
  });

  it("CHARGES a repeated PAID choice twice", async () => {
    // Tenders is +1,00. Two of them on an L is 8,90 + 2,00, and the old `Set`
    // would have sold it for 9,90.
    const { taco, tenders } = await tacosWith(2, 890);
    const { status } = await post({
      orderType: "TAKEAWAY",
      items: [{ productId: taco.id, quantity: 1, optionIds: [tenders.id, tenders.id], addons: [] }],
      payments: [{ method: "CASH", amount: 1090 }],
    });
    expect(status).toBe(201);
    const item = await db.orderItem.findFirst({ where: { productName: "Tacos L" } });
    expect(item!.unitPrice).toBe(1090);
  });

  it("ACCEPTS ONE viande on an L — the ceiling is not a requirement", async () => {
    const { taco, hachee } = await tacosWith(2, 890);
    const { status } = await post({
      orderType: "TAKEAWAY",
      items: [{ productId: taco.id, quantity: 1, optionIds: [hachee.id], addons: [] }],
      payments: [{ method: "CASH", amount: 890 }],
    });
    expect(status).toBe(201);
  });

  it("still refuses NO viande at all, because the group is required", async () => {
    const { taco } = await tacosWith(2, 890);
    const { status, body } = await post({
      orderType: "TAKEAWAY",
      items: [{ productId: taco.id, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: 890 }],
    });
    expect(status).toBe(400);
    expect(body.error).toContain("obligatoire");
  });

  it("LEAVES A GROUP WITH NO QUOTA ALONE — every other group in the catalogue", async () => {
    // Sauces, Crudités, Type de pain… none has a quota row, and a product with
    // none must behave exactly as it did before this existed.
    const { taco, hachee, merguez } = await tacosWith(null, 890);
    const { status } = await post({
      orderType: "TAKEAWAY",
      items: [{ productId: taco.id, quantity: 1, optionIds: [hachee.id, merguez.id], addons: [] }],
      payments: [{ method: "CASH", amount: 890 }],
    });
    expect(status).toBe(201);
  });
});
