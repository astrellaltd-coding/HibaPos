import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { wipeDatabase } from "@/lib/test-wipe";
import { closeDay } from "@/lib/services/fiscal";
import { POST as closeShift } from "@/app/api/shifts/[id]/close/route";
import { POST as openShift } from "@/app/api/shifts/route";
import { POST as createOrder } from "@/app/api/orders/route";

// L-228 — CLOSING THE CAISSE SEALS THE DAY.
//
// The operator's decision, 2026-09-20: « once he closed the till, the day is
// auto closed ». He shuts at 23:00 and closes the caisse at 23:30 — at which
// point the trading day has NOT ended, which is why `closeDay` needed a narrow
// door rather than a relaxed rule.
//
// Driven through the real close route, because a service test proves the
// service and not that the route calls it.

const PIN = "484848";
type Signable = { id: string; username: string; role: "MANAGER" | "SUPER_ADMIN" };
let manager: Signable;
let admin: Signable;
let productId: string;

const dayString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function setCutoff(hour: number) {
  await db.setting.upsert({
    where: { key: "businessDayCutoffHour" },
    create: { key: "businessDayCutoffHour", value: String(hour) },
    update: { value: String(hour) },
  });
}

type CloseBody = {
  daySeal?: { sealed: string[]; failed: { day: string; message: string } | null };
  error?: string;
};

async function openAndSell(opts: { force?: boolean } = {}) {
  clearCookies();
  // FORCING IT IS THE ONLY WAY TO BUILD AN ARREARS, and that is guard C doing
  // its job rather than a gap in the test: a caisse cannot be opened while an
  // ended day with sales is unsealed, so days cannot pile up unless a
  // SUPER_ADMIN overrode the refusal (or the caisse was never closed at all).
  await signInAs(opts.force ? admin : manager);
  const opened = await callJson<{ id: string; error?: string }>(openShift, {
    method: "POST",
    url: "http://localhost/api/shifts",
    body: { openingFloat: 0, ...(opts.force ? { force: true } : {}) },
  });
  expect(opened.status, opened.body.error ?? "").toBe(201);
  const res = await callJson<{ error?: string }>(createOrder, {
    method: "POST",
    url: "http://localhost/api/orders",
    body: {
      orderType: "TAKEAWAY",
      items: [{ productId, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: 500 }],
    },
  });
  expect(res.status, res.body.error ?? "").toBe(201);
  return opened.body.id;
}

async function closeCaisse(shiftId: string, body: Record<string, unknown> = {}) {
  clearCookies();
  await signInAs(manager);
  return callJson<CloseBody>(closeShift, {
    method: "POST",
    url: `http://localhost/api/shifts/${shiftId}/close`,
    params: { id: shiftId },
    body: { closingFloat: 500, ...body },
  });
}

beforeEach(async () => {
  clearCookies();
  await wipeDatabase();
  await ensureFiscalCounter();
  await setCutoff(0); // the France till's setting: trading day = calendar day
  const m = await db.user.create({
    data: { username: `l228s-${Date.now()}-${Math.random()}`, name: "Resp", role: "MANAGER", pinHash: await hashPin(PIN) },
  });
  manager = { id: m.id, username: m.username, role: "MANAGER" };
  const a = await db.user.create({
    data: { username: `l228sa-${Date.now()}-${Math.random()}`, name: "Admin", role: "SUPER_ADMIN", pinHash: await hashPin(PIN) },
  });
  admin = { id: a.id, username: a.username, role: "SUPER_ADMIN" };
  const cat = await db.category.create({ data: { name: "Cat", vatRate: 10 } });
  const p = await db.product.create({
    data: { name: "Truc", price: 500, categoryId: cat.id, vatRate: 10, active: true, available: true },
  });
  productId = p.id;
});

afterAll(async () => {
  await wipeDatabase();

  // THIS FILE TAKES REAL BACKUPS, AND HAS TO CLEAR THEM UP AFTER ITSELF.
  //
  // It drives the real close route, which takes an automatic backup after every
  // Z (C-06). Those `.dbenc` files land in the suite's shared `BACKUP_LOCATION`
  // and outlive this file — and `secret-store.test.ts` then unsets
  // BACKUP_ENCRYPTION_KEY to test a bare install, at which point L-193's guard
  // refuses to mint a new key « because encrypted backups already exist ».
  //
  // MEASURED, not guessed: running this file then that one reproduces it every
  // time, fourteen failures with that exact message. **The guard is right and
  // is not weakened here** — it is doing precisely what R9.4 built it for. What
  // was wrong is that this file left something behind.
  const dir = process.env.BACKUP_LOCATION;
  if (dir && dir.includes("hibapos-test-db")) {
    const { existsSync, readdirSync, rmSync } = await import("fs");
    const path = await import("path");
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        rmSync(path.join(dir, f), { force: true });
      }
    }
  }
});

describe("L-228 — closing the caisse seals today, which has not ended", () => {
  it("SEALS THE DAY IN PROGRESS — the whole point, and impossible before this", async () => {
    // `assertPeriodEnded` refuses today for every other caller; this path
    // passes `sealTheDayInProgress` and is the only one that does.
    const shiftId = await openAndSell();
    const today = dayString(new Date());

    const res = await closeCaisse(shiftId);

    expect(res.status, res.body.error ?? "").toBe(200);
    expect(res.body.daySeal?.sealed, "closing the caisse did not seal the day").toContain(today);
    expect(res.body.daySeal?.failed).toBeNull();
    expect(await db.dailyClose.count({ where: { period: today } })).toBe(1);
  });

  it("AND THE SEALED DAY THEN REFUSES A SALE — guard A, which is what makes this safe", async () => {
    // The two commits are in this order on purpose. Sealing a day that has not
    // ended is only safe because nothing can be rung into it afterwards.
    const shiftId = await openAndSell();
    await closeCaisse(shiftId);

    clearCookies();
    await signInAs(manager);
    const reopened = await callJson<{ error?: string }>(openShift, {
      method: "POST", url: "http://localhost/api/shifts", body: { openingFloat: 0 },
    });
    expect(reopened.status, "the caisse would not reopen at all").toBe(201);

    const sale = await callJson<{ error?: string }>(createOrder, {
      method: "POST",
      url: "http://localhost/api/orders",
      body: {
        orderType: "TAKEAWAY",
        items: [{ productId, quantity: 1, optionIds: [], addons: [] }],
        payments: [{ method: "CASH", amount: 500 }],
      },
    });
    expect(sale.status, "a sale was rung into the day that had just been sealed").toBe(409);
    expect(sale.body.error).toContain("scellée");
  });

  it("DOES NOT SEAL TODAY WHEN THE OPERATOR UNCHECKS IT — the mid-afternoon break", async () => {
    // Closing the caisse at 15:00 by mistake must not cost an evening. There is
    // no override for a sale into a sealed day, by design, so the protection
    // has to be here.
    const shiftId = await openAndSell();

    const res = await closeCaisse(shiftId, { sealDay: false });

    expect(res.status, res.body.error ?? "").toBe(200);
    expect(res.body.daySeal?.sealed).toEqual([]);
    expect(await db.dailyClose.count()).toBe(0);
  });

  it("DOES NOT SEAL A DAY NOBODY TRADED IN", async () => {
    // Opened, sold nothing, closed. Sealing would lock the till out of a day
    // that never traded, and there is nothing to seal.
    clearCookies();
    await signInAs(manager);
    const opened = await callJson<{ id: string }>(openShift, {
      method: "POST", url: "http://localhost/api/shifts", body: { openingFloat: 0 },
    });

    const res = await closeCaisse(opened.body.id, { closingFloat: 0 });

    expect(res.status, res.body.error ?? "").toBe(200);
    expect(res.body.daySeal?.sealed).toEqual([]);
    expect(await db.dailyClose.count()).toBe(0);
  });

  it("is idempotent — a second caisse the same day seals nothing and does not fail", async () => {
    const first = await openAndSell();
    await closeCaisse(first);
    const today = dayString(new Date());
    expect(await db.dailyClose.count({ where: { period: today } })).toBe(1);

    // The day is sealed, so no sale can be rung; open and close an empty one.
    clearCookies();
    await signInAs(manager);
    const opened = await callJson<{ id: string }>(openShift, {
      method: "POST", url: "http://localhost/api/shifts", body: { openingFloat: 0 },
    });
    const res = await closeCaisse(opened.body.id, { closingFloat: 0 });

    expect(res.status, res.body.error ?? "").toBe(200);
    expect(res.body.daySeal?.sealed, "it sealed the day twice").toEqual([]);
    expect(res.body.daySeal?.failed).toBeNull();
    expect(await db.dailyClose.count()).toBe(1);
  });
});

describe("L-228 — the narrow door is narrow", () => {
  it("REFUSES A FUTURE DAY EVEN WITH THE FLAG — the bypass is for TODAY only", async () => {
    // FOUND BY A REVERT. Widening the condition from « the flag AND the day in
    // progress » to « the flag » alone let a FUTURE day be sealed, and every
    // test stayed green. The comment on `closeDay` claims a future day is
    // still refused; this is that claim, asserted.
    //
    // An empty database on purpose: with any activity today, `assertDaySequence`
    // would refuse tomorrow first and the premature guard would never be
    // reached, so the test would prove the wrong thing.
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    await expect(
      closeDay(dayString(tomorrow), manager.id, false, now, { sealTheDayInProgress: true }),
    ).rejects.toThrow(/prématurée/i);
    expect(await db.dailyClose.count()).toBe(0);
  });

  it("still seals TODAY with the flag, which is the door itself", async () => {
    // The other direction, so the test above cannot pass by the door being
    // welded shut.
    const now = new Date();
    await db.order.create({
      data: {
        number: 950, cashierId: manager.id, status: "COMPLETED",
        subtotal: 500, discountTotal: 0, total: 500, vatTotal: 45, itemCount: 1,
        createdAt: now, completedAt: now,
        shiftId: (await db.shift.create({
          data: { number: 950, status: "CLOSED", openedById: manager.id, openedAt: now, closedAt: now, openingFloat: 0 },
        })).id,
      },
    });

    await closeDay(dayString(now), manager.id, false, now, { sealTheDayInProgress: true });
    expect(await db.dailyClose.count({ where: { period: dayString(now) } })).toBe(1);
  });
});

describe("L-228 — the days that are OWED, earliest first", () => {
  it("SEALS AN ARREARS OF DAYS IN ORDER, which the sequence guard requires", async () => {
    // The 48-hour caisse leaves this behind: two ended days with sales and no
    // close. Sealing only the newest would be refused as out of sequence, so
    // the walk goes earliest first.
    const now = new Date();
    for (const back of [3, 2]) {
      const when = new Date(now);
      when.setDate(when.getDate() - back);
      when.setHours(12, 0, 0, 0);
      const s = await db.shift.create({
        data: { number: 900 + back, status: "CLOSED", openedById: manager.id, openedAt: when, closedAt: when, openingFloat: 0 },
      });
      await db.order.create({
        data: {
          number: 900 + back, shiftId: s.id, cashierId: manager.id, status: "COMPLETED",
          subtotal: 500, discountTotal: 0, total: 500, vatTotal: 45, itemCount: 1,
          createdAt: when, completedAt: when,
        },
      });
    }

    const shiftId = await openAndSell({ force: true });
    const res = await closeCaisse(shiftId);

    const three = new Date(now); three.setDate(three.getDate() - 3);
    const two = new Date(now); two.setDate(two.getDate() - 2);

    expect(res.status, res.body.error ?? "").toBe(200);
    expect(res.body.daySeal?.failed).toBeNull();
    expect(res.body.daySeal?.sealed, "the arrears were not sealed earliest-first").toEqual([
      dayString(three),
      dayString(two),
      dayString(now),
    ]);
  });

  it("REPORTS A FAILURE INSTEAD OF SWALLOWING IT, and the Z still succeeds", async () => {
    // THE STATE HERE IS BUILT BY HAND AND IS NOT REACHABLE THROUGH THE APP.
    // A `DailyClose` dated TOMORROW makes `assertDaySequence` refuse today --
    // « une journée ne peut être clôturée qu'après la dernière journée scellée »
    // -- which is the cleanest way to get a seal that genuinely fails without
    // stubbing anything. What is being asserted is not that this state is
    // likely; it is that when a seal fails, THE Z SURVIVES and the operator is
    // told, rather than a sealed fiscal document being lost to a bookkeeping
    // step that runs after it.
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    await db.dailyClose.create({
      data: {
        period: dayString(tomorrow),
        year: tomorrow.getFullYear(), month: tomorrow.getMonth() + 1, day: tomorrow.getDate(),
        salesTotal: 0, salesCount: 0, vatTotal: 0, cashTotal: 0, cardTotal: 0, voucherTotal: 0,
        discountsTotal: 0, cutoffHour: 0,
        vatBreakdownJson: "{}", topProductsJson: "[]", dataJson: "{}",
        sealedById: manager.id, hash: "handmade-for-this-test",
      },
    });

    const shiftId = await openAndSell();
    const res = await closeCaisse(shiftId);

    expect(res.status, "the Z was lost because a day could not be sealed").toBe(200);
    expect(res.body.daySeal?.failed, "a failed seal was swallowed").not.toBeNull();
    expect(res.body.daySeal?.failed?.day).toBe(dayString(now));
    expect(res.body.daySeal?.failed?.message).toContain("séquence");
    expect(await db.zReport.count(), "the Z report itself did not survive").toBe(1);
    expect(await db.dailyClose.count({ where: { period: dayString(now) } })).toBe(0);
  });
});
