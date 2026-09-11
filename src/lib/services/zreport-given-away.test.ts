import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { createOrderInTransaction } from "@/lib/services/checkout";
import { generateZReport, computeShiftReport } from "@/lib/services/reports";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { saveSettings, DEFAULT_SETTINGS } from "@/lib/services/settings";
import { OFFERT } from "@/lib/tender-policy";
import { hashPin } from "@/lib/auth";
import type { SettingsDto, ZReportDto } from "@/types/api";

// L-83 (R7.1, 2026-09-11) — the give-away figures were never sealed, and never
// sent.
//
// ── THE DEFECT ───────────────────────────────────────────────────────────────
// DD-20 (Batch 7.4a) reports what was GIVEN AWAY beside what was sold, and
// `ZReportDto` has declared `givenAwayCount`, `givenAwayItemsCount` and
// `givenAwayProducts` ever since. Three things were missing underneath:
// `ZReport` had no column for any of them, `generateZReport` wrote none, and
// the GET in `api/reports/z` mapped stored columns only. So the DTO promised
// what no route could serve.
//
// ── WHY IT WAS INVISIBLE RATHER THAN LOUD ────────────────────────────────────
// `GivenAway` in `reports-view.tsx` opens `if (!count) return null`, and
// `undefined` is falsy. The « Offerts » block was therefore simply ABSENT from
// every Z report — which is exactly what a shift with no give-aways renders.
// Nothing threw and nothing logged, and a test asserting « the section is
// absent » would have passed against the bug in both states. So every
// assertion below is made with a NON-ZERO give-away, and checks that the
// property is PRESENT and carries the figure — never that something is
// missing.
//
// ── WHAT THIS FILE CLAIMS, IN ORDER ──────────────────────────────────────────
//   1. what is SEALED — the three columns, read back OUT OF THE DATABASE after
//      the close, not from the object `generateZReport` happened to return.
//   2. that they are sealed under the product's IDENTITY (R2.1), because this
//      catalogue has live pairs sharing a name and a sealed row cannot be
//      corrected afterwards.
//   3. that the `CLOTURE_Z` journal payload is NOT grown — the operator's
//      decision, pinned the way `menu-reporting.test.ts` pins `topMenus`.
//   4. what the ROUTE SENDS — over `GET /api/reports/z`, because the finding is
//      about a DTO a client reads and not about an aggregator.
//   5. that the route sends the SEALED figures and not a recomputation, which
//      is the whole of « seal them » rather than « compute them at read time ».
//   6. that the X report still computes them LIVE, which is what an X report is
//      for and was correct before this item.
//
// Give-aways are rung through `createOrderInTransaction` — the real checkout,
// as `offert-tender.test.ts` does — rather than through `POST /api/orders`,
// because a 100 % discount needs a DD-19 step-up token and that path is DD-19's
// claim. What a client sends to CREATE a give-away is `offert-tender.test.ts`'s
// subject; what a Z report seals and serves afterwards is this file's.

const PIN = "515151";
const SETTINGS = { ...DEFAULT_SETTINGS, factice: false } as unknown as SettingsDto;

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
  await db.refund.deleteMany();
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
      username: `r71-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin(PIN),
    },
  });
  manager = { id: u.id, username: u.username };

  // The live name collision, reproduced — L-76's pair. Two DIFFERENT products
  // indistinguishable by label, so a give-away row keyed by name would merge
  // them into a figure neither product ever carried.
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

afterAll(async () => {
  clearCookies();
  await wipe();
});

/** One line through the REAL checkout service. `offert` sends the give-away
 *  shape DD-14 defined: the whole subtotal discounted, and one OFFERT tender
 *  carrying nothing. */
async function ring(product: { id: string; price: number }, quantity: number, offert: boolean) {
  const subtotal = product.price * quantity;
  const discountTotal = offert ? subtotal : 0;
  return createOrderInTransaction({
    shiftId,
    cashierId: manager.id,
    customerId: null,
    orderType: "DINE_IN",
    tableLabel: null,
    notes: null,
    subtotal,
    discountTotal,
    totalAfterDiscount: subtotal - discountTotal,
    discountApprovedById: offert ? manager.id : null,
    itemCount: quantity,
    items: [
      {
        productId: product.id,
        productName: "Coca",
        unitPrice: product.price,
        quantity,
        lineTotal: subtotal,
        vatRate: 10,
        optionsJson: null,
        addOnsJson: null,
        notes: null,
      },
    ],
    payments: (offert
      ? [{ method: OFFERT, amount: 0 }]
      : [{ method: "CASH", amount: subtotal }]) as never,
    settings: SETTINGS,
  });
}

const sell = (p: { id: string; price: number }, q: number) => ring(p, q, false);
const giveAway = (p: { id: string; price: number }, q: number) => ring(p, q, true);

/** The sealed row, read back OUT OF THE DATABASE rather than trusted from the
 *  object `generateZReport` returned. What a Z report carries when it is read
 *  later is a different question from what the function handed back. */
async function sealedRow(id: string) {
  return db.zReport.findUniqueOrThrow({ where: { id } });
}

type SealedGivenAway = { productId: string | null; name: string; quantity: number };

// ---------------------------------------------------------------------------
// 1-3. What is SEALED
// ---------------------------------------------------------------------------

describe("L-83 — what the Z report SEALS", () => {
  it("seals all three give-away figures into the row", async () => {
    await sell(canette, 2); // 300, a real sale
    await giveAway(canette, 2); // two canettes given away
    await giveAway(bouteille, 1); // one bouteille given away

    const { z } = await generateZReport(shiftId, 300, manager.id);
    const row = await sealedRow(z.id);

    // Two ORDERS given away, three ARTICLES on them. Different questions, and
    // DD-20 keeps both.
    expect(row.givenAwayCount).toBe(2);
    expect(row.givenAwayItemsCount).toBe(3);

    const sealed = JSON.parse(row.givenAwayProductsJson ?? "[]") as SealedGivenAway[];
    expect(sealed).toHaveLength(2);
    expect(sealed.reduce((s, r) => s + r.quantity, 0)).toBe(3);

    // And the give-aways are still OUTSIDE the sales, which is the invariant
    // DD-20 exists to protect: sealing them must not book them.
    expect(row.salesTotal).toBe(300);
    expect(row.salesCount).toBe(1);
    const topProducts = JSON.parse(row.topProductsJson ?? "[]") as { quantity: number }[];
    expect(topProducts.reduce((s, r) => s + r.quantity, 0)).toBe(2);
  });

  it("seals zero — not null — on a shift where nothing was given away", async () => {
    // The case every ordinary day produces, and the one the defect looked
    // exactly like. Null here would be indistinguishable from « this column did
    // not exist when the row was sealed », which is a statement about the
    // software rather than about the day.
    await sell(canette, 1);

    const { z } = await generateZReport(shiftId, 150, manager.id);
    const row = await sealedRow(z.id);

    expect(row.givenAwayCount).toBe(0);
    expect(row.givenAwayItemsCount).toBe(0);
    expect(row.givenAwayCount).not.toBeNull();
    expect(row.givenAwayItemsCount).not.toBeNull();
    expect(row.givenAwayProductsJson).toBe("[]");
  });

  it("seals the give-away rows under the product's IDENTITY, not its name", async () => {
    // R2.1's rule, at a column that cannot be corrected once written. Both
    // products are called « Coca »; keyed by name they would seal as one row
    // reading « Coca ×3 », which is no product this restaurant gave away.
    await giveAway(canette, 2);
    await giveAway(bouteille, 1);

    const { z } = await generateZReport(shiftId, 0, manager.id);
    const sealed = JSON.parse(
      (await sealedRow(z.id)).givenAwayProductsJson ?? "[]",
    ) as SealedGivenAway[];

    expect(sealed).toHaveLength(2);
    expect(sealed.every((r) => r.name === "Coca")).toBe(true);
    expect(new Set(sealed.map((r) => r.productId))).toEqual(
      new Set([canette.id, bouteille.id]),
    );
    expect(sealed.find((r) => r.productId === canette.id)).toMatchObject({ quantity: 2 });
    expect(sealed.find((r) => r.productId === bouteille.id)).toMatchObject({ quantity: 1 });
  });

  it("does NOT grow the per-shift CLOTURE_Z journal payload", async () => {
    // R7.1 mirrors `topProductsJson`, and `topProductsJson` is a column that is
    // not in this payload either. Pinned because the natural next edit is to
    // add it « for symmetry », and a sealed payload cannot be un-grown — the
    // same call `menu-reporting.test.ts` pins for `topMenus`.
    await giveAway(canette, 1);
    const { z } = await generateZReport(shiftId, 0, manager.id);

    const ev = await db.fiscalEvent.findFirstOrThrow({
      where: { type: "CLOTURE_Z", zReportId: z.id },
    });
    const payload = JSON.parse(ev.dataJson);
    expect(payload).not.toHaveProperty("givenAwayCount");
    expect(payload).not.toHaveProperty("givenAwayItemsCount");
    expect(payload).not.toHaveProperty("givenAwayProducts");
    expect(payload).not.toHaveProperty("givenAwayProductsJson");
    // And the payload that WAS there is untouched.
    expect(payload.zReportNumber).toBe(z.number);
    expect(payload.salesTotal).toBe(z.salesTotal);
  });
});

// ---------------------------------------------------------------------------
// 4-5. What the ROUTE sends
// ---------------------------------------------------------------------------

async function getZReports() {
  const mod = await import("@/app/api/reports/z/route");
  return callJson<ZReportDto[]>(mod.GET, { url: "http://localhost/api/reports/z" });
}

describe("L-83 — what GET /api/reports/z SENDS", () => {
  it("carries the three figures to the client", async () => {
    await sell(canette, 2);
    await giveAway(canette, 2);
    await giveAway(bouteille, 1);
    await generateZReport(shiftId, 300, manager.id);

    const { status, body } = await getZReports();
    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    const dto = body[0];

    // PRESENCE first, and deliberately. This is the assertion the defect
    // defeated: `undefined` satisfied `if (!count) return null` exactly as 0
    // does, so the block vanished and nothing said so.
    expect(dto).toHaveProperty("givenAwayCount");
    expect(dto).toHaveProperty("givenAwayItemsCount");
    expect(dto).toHaveProperty("givenAwayProducts");
    expect(dto.givenAwayCount).not.toBeUndefined();
    expect(dto.givenAwayItemsCount).not.toBeUndefined();
    expect(dto.givenAwayProducts).not.toBeUndefined();

    expect(dto.givenAwayCount).toBe(2);
    expect(dto.givenAwayItemsCount).toBe(3);
    expect(dto.givenAwayProducts).toHaveLength(2);
    expect(new Set(dto.givenAwayProducts.map((p) => p.productId))).toEqual(
      new Set([canette.id, bouteille.id]),
    );
    // A truthy count is what makes the « Offerts » block render at all.
    expect(Boolean(dto.givenAwayCount)).toBe(true);
  });

  it("sends all three keys on a report with no give-aways too", async () => {
    // The zero day renders nothing either way, so this cannot be checked by
    // looking at the screen — only at the payload. A DTO that declares a
    // `number` must not send `undefined` on the commonest case of all.
    await sell(canette, 1);
    await generateZReport(shiftId, 150, manager.id);

    const { body } = await getZReports();
    const dto = body[0];
    expect(dto).toHaveProperty("givenAwayCount");
    expect(dto).toHaveProperty("givenAwayItemsCount");
    expect(dto).toHaveProperty("givenAwayProducts");
    expect(dto.givenAwayCount).toBe(0);
    expect(dto.givenAwayItemsCount).toBe(0);
    expect(dto.givenAwayProducts).toEqual([]);
  });

  it("sends what was SEALED, not what the aggregator says today", async () => {
    // The whole of the operator's decision. « Seal them » and « recompute them
    // at read time » are indistinguishable on the day of the close and diverge
    // afterwards, so the only way to tell which was built is to make the two
    // disagree. The sealed columns are overwritten here with figures the orders
    // do not support: a recomputing route would answer 2 / 3, and a route that
    // reads the document answers what the document says.
    //
    // Writing to a sealed row is done HERE and nowhere else. It is the
    // instrument, not a behaviour the application has.
    await giveAway(canette, 2);
    await giveAway(bouteille, 1);
    const { z } = await generateZReport(shiftId, 0, manager.id);

    await db.zReport.update({
      where: { id: z.id },
      data: {
        givenAwayCount: 41,
        givenAwayItemsCount: 42,
        givenAwayProductsJson: JSON.stringify([
          { productId: "sentinel", name: "Sentinelle", quantity: 43 },
        ]),
      },
    });

    const { body } = await getZReports();
    expect(body[0].givenAwayCount).toBe(41);
    expect(body[0].givenAwayItemsCount).toBe(42);
    expect(body[0].givenAwayProducts).toEqual([
      { productId: "sentinel", name: "Sentinelle", quantity: 43 },
    ]);

    // The orders are still there and still say 2 / 3 — so the divergence is
    // real, and the route genuinely read the row.
    const live = await computeShiftReport(shiftId);
    expect(live.givenAwayCount).toBe(2);
    expect(live.givenAwayItemsCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 6. The X report, which was already right
// ---------------------------------------------------------------------------

describe("L-83 — the X report still computes give-aways LIVE", () => {
  it("reports the open till's give-aways, and moves as more are given away", async () => {
    // An X report is the running state of an OPEN caisse; it has no sealed row
    // to read and must not acquire one. The second half is what « live » means
    // — a figure that does not move is not a running total.
    const mod = await import("@/app/api/reports/x/route");
    const call = () =>
      callJson<{
        givenAwayCount: number;
        givenAwayItemsCount: number;
        givenAwayProducts: SealedGivenAway[];
      }>(mod.GET, { url: `http://localhost/api/reports/x?shiftId=${shiftId}` });

    await sell(canette, 1);
    await giveAway(canette, 2);

    const first = await call();
    expect(first.status).toBe(200);
    expect(first.body.givenAwayCount).toBe(1);
    expect(first.body.givenAwayItemsCount).toBe(2);
    expect(first.body.givenAwayProducts).toEqual([
      { productId: canette.id, name: "Coca", quantity: 2 },
    ]);

    await giveAway(bouteille, 1);

    const second = await call();
    expect(second.body.givenAwayCount).toBe(2);
    expect(second.body.givenAwayItemsCount).toBe(3);
    expect(second.body.givenAwayProducts).toHaveLength(2);
  });
});
