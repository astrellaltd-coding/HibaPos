import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { saveSettings } from "@/lib/services/settings";

// L-92 (R8.4), driven — the three report routes really do read the cut-off.
//
// `report-range.test.ts` pins the rule. A unit test on an extracted rule proves
// the rule and NOT that anything calls it, and this project has shipped that
// gap three times (§ 2 step 4) — so these send the audit's own reproduction
// through the real routes: **one ticket at 02:30 on 1 August**, which belongs
// to trading day 07-31 and therefore to JULY, not August.
//
// Before R8.4 that ticket was inside the August report and sealed into July's
// close. Measured by audit pass 1: `MonthlyClose 2026-08` vatTotal 104,
// `GET /api/reports/vat?from=2026-08-01&to=2026-08-31` → totalVat 0.

const PIN = "424242";
let manager: { id: string; username: string; role: "MANAGER" };
let shiftId: string;

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.setting.deleteMany();
}

/** An order stamped at an exact local instant. Written directly, because what
 *  is under test is how a period is MEASURED, not how a sale is created. */
async function orderAt(when: Date, total: number) {
  // Scalars first, then the lines. Prisma refuses to mix scalar foreign keys
  // with nested `create`s on the same call, and the relation form is not what
  // this fixture is about.
  const order = await db.order.create({
    data: {
      number: Math.floor(Math.random() * 1_000_000),
      shiftId,
      cashierId: manager.id,
      status: "COMPLETED",
      orderType: "DINE_IN",
      subtotal: total,
      vatTotal: Math.round(total - total / 1.1),
      total,
      itemCount: 1,
      createdAt: when,
      completedAt: when,
    },
  });
  await db.orderItem.create({
    data: {
      orderId: order.id,
      productName: "Pizza",
      unitPrice: total,
      quantity: 1,
      lineTotal: total,
      vatRate: 10,
    },
  });
  await db.payment.create({
    data: { orderId: order.id, cashierId: manager.id, method: "CASH", amount: total },
  });
  return order;
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  await saveSettings({ businessDayCutoffHour: 5, factice: false });

  const u = await db.user.create({
    data: {
      username: `r84-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin(PIN),
    },
  });
  manager = { id: u.id, username: u.username, role: "MANAGER" };

  const shift = await db.shift.create({
    data: { number: 1, openedById: u.id, openedAt: new Date(2026, 6, 1), openingFloat: 0, status: "OPEN" },
  });
  shiftId = shift.id;

  await signInAs(manager);
});

afterAll(wipe);

type RangeReport = { from: string; to: string; cutoffHour: number };

async function vat(from: string, to: string) {
  const mod = await import("@/app/api/reports/vat/route");
  return callJson<RangeReport & { totalVat: number; totalHt: number; rows: unknown[]; error?: string }>(
    mod.GET,
    { method: "GET", url: `http://localhost/api/reports/vat?from=${from}&to=${to}` },
  );
}

describe("L-92 — the report routes use the trading-day cut-off", () => {
  it("places a 02:30 ticket in JULY, not August", async () => {
    // The audit's ticket. 1 August 02:30 is trading day 2026-07-31.
    await orderAt(new Date(2026, 7, 1, 2, 30), 1100);

    const august = await vat("2026-08-01", "2026-08-31");
    expect(august.status, august.body.error).toBe(200);
    expect(august.body.totalVat, "the 02:30 ticket is still counted in August").toBe(0);
    expect(august.body.rows).toEqual([]);

    const july = await vat("2026-07-01", "2026-07-31");
    expect(july.status, july.body.error).toBe(200);
    expect(july.body.totalVat, "the 02:30 ticket is in neither month").toBeGreaterThan(0);
  });

  it("places a 02:30 ticket on 1 September in AUGUST", async () => {
    // The other end. Before R8.4 this one fell outside August entirely, which
    // is the direction that makes a filed figure too SMALL.
    await orderAt(new Date(2026, 8, 1, 2, 30), 1100);

    const august = await vat("2026-08-01", "2026-08-31");
    expect(august.status, august.body.error).toBe(200);
    expect(august.body.totalVat, "a ticket sealed into August is missing from its report").toBeGreaterThan(0);
  });

  it("reports the boundaries it measured, and the cut-off it used", async () => {
    // The operator's decision was « snap AND say so », and the screen says it
    // from these fields rather than re-deriving them.
    const r = await vat("2026-08-01", "2026-08-31");
    expect(r.body.cutoffHour).toBe(5);
    expect(new Date(r.body.from).getHours()).toBe(5);
    expect(new Date(r.body.to).getHours()).toBe(5);
    expect(new Date(r.body.from).getDate()).toBe(1);
    expect(new Date(r.body.from).getMonth()).toBe(7); // August
    expect(new Date(r.body.to).getMonth()).toBe(8); // 1 September
  });

  it("follows the setting rather than a constant", async () => {
    // The route must READ `businessDayCutoffHour`. A hard-coded 5 would pass
    // every assertion above.
    await saveSettings({ businessDayCutoffHour: 9 });
    const r = await vat("2026-08-01", "2026-08-31");
    expect(r.body.cutoffHour).toBe(9);
    expect(new Date(r.body.from).getHours()).toBe(9);
  });

  it("measures calendar days when the operator sets the cut-off to 0", async () => {
    // `0` is a supported setting, not a disabled feature — so a 02:30 ticket
    // then belongs to the calendar day it was rung on.
    await saveSettings({ businessDayCutoffHour: 0 });
    await orderAt(new Date(2026, 7, 1, 2, 30), 1100);

    const r = await vat("2026-08-01", "2026-08-31");
    expect(r.body.cutoffHour).toBe(0);
    expect(new Date(r.body.from).getHours()).toBe(0);
    expect(r.body.totalVat).toBeGreaterThan(0);
  });

  it("does the same on the sales and cashiers routes", async () => {
    // Three routes share the module and all three had the defect. Asserting
    // one of them would leave the other two free to drift.
    await orderAt(new Date(2026, 7, 1, 2, 30), 1100);

    const sales = await import("@/app/api/reports/sales/route");
    const s = await callJson<RangeReport & { totalSales: number }>(sales.GET, {
      method: "GET",
      url: "http://localhost/api/reports/sales?from=2026-08-01&to=2026-08-31",
    });
    expect(s.body.cutoffHour).toBe(5);
    expect(new Date(s.body.from).getHours()).toBe(5);
    expect(s.body.totalSales, "the 02:30 ticket is counted in August's sales").toBe(0);

    const cashiers = await import("@/app/api/reports/cashiers/route");
    const c = await callJson<RangeReport & { totalSales: number }>(cashiers.GET, {
      method: "GET",
      url: "http://localhost/api/reports/cashiers?from=2026-08-01&to=2026-08-31",
    });
    expect(c.body.cutoffHour).toBe(5);
    expect(new Date(c.body.from).getHours()).toBe(5);
    expect(c.body.totalSales).toBe(0);
  });

  it("still counts an ordinary mid-service ticket", async () => {
    // The guard against a fix that simply excludes everything.
    await orderAt(new Date(2026, 7, 15, 20, 0), 1100);
    const r = await vat("2026-08-01", "2026-08-31");
    expect(r.body.totalVat).toBeGreaterThan(0);
  });
});
