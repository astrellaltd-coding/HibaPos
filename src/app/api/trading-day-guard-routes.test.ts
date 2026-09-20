import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { wipeDatabase } from "@/lib/test-wipe";
import { closeDay } from "@/lib/services/fiscal";
import { POST as openShift } from "@/app/api/shifts/route";
import { POST as createOrder } from "@/app/api/orders/route";

// L-99 / L-228 — THE GUARDS, DRIVEN THROUGH THE ROUTES THAT ENFORCE THEM.
//
// `trading-day-guard.test.ts` proves the rules. This file proves the ROUTES ASK
// THEM — the gap this project has shipped three times, where a unit test on an
// extracted rule proves the rule and not that anything calls it. So every
// assertion here goes through the real handler against a real database.
//
// WHAT PUT THEM HERE: on 2026-09-19 the France caisse was found open for about
// 48 hours. Its Z would have spanned two trading days, and no day could be
// sealed at all meanwhile because `assertNoOpenShift` refuses every close while
// a caisse is open.

const PIN = "515151";

/** What `signInAs` needs, for either role — the helpers take both. */
type Signable = { id: string; username: string; role: "MANAGER" | "SUPER_ADMIN" };
let manager: Signable;
let admin: Signable;
let productId: string;

/** The cut-off the France till moves to on 2026-09-20: trading day = calendar day. */
const CUTOFF = 0;

async function setCutoff(hour: number) {
  await db.setting.upsert({
    where: { key: "businessDayCutoffHour" },
    create: { key: "businessDayCutoffHour", value: String(hour) },
    update: { value: String(hour) },
  });
}

async function openCaisse(as = manager, body: Record<string, unknown> = {}) {
  clearCookies();
  await signInAs(as);
  return callJson<{ error?: string; unsealedDay?: string; canForce?: boolean; id?: string; number?: number }>(
    openShift,
    { method: "POST", url: "http://localhost/api/shifts", body: { openingFloat: 0, ...body } },
  );
}

async function ring(as = manager) {
  clearCookies();
  await signInAs(as);
  return callJson<{ error?: string }>(createOrder, {
    method: "POST",
    url: "http://localhost/api/orders",
    body: {
      orderType: "TAKEAWAY",
      items: [{ productId, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: 500 }],
    },
  });
}

/** A shift whose `openedAt` is back-dated, which is the 48-hour case. */
async function openCaisseAt(when: Date) {
  // NUMBER 900, not 1. `nextShiftNumber` allocates from the fiscal counter and
  // not from `max(Shift.number)`, so a fixture that inserts number 1 directly
  // leaves the counter at 0 and the route then tries to create number 1 again
  // -- a unique-constraint failure that looks like a bug in the guard and is
  // not. Fixtures here stay above anything the counter will hand out.
  const shift = await db.shift.create({
    data: { number: 900, status: "OPEN", openedById: manager.id, openedAt: when, openingFloat: 0 },
  });
  return shift;
}

beforeEach(async () => {
  clearCookies();
  await wipeDatabase();
  await ensureFiscalCounter();
  await setCutoff(CUTOFF);
  const m = await db.user.create({
    data: { username: `l228m-${Date.now()}-${Math.random()}`, name: "Resp", role: "MANAGER", pinHash: await hashPin(PIN) },
  });
  manager = { id: m.id, username: m.username, role: "MANAGER" };
  const a = await db.user.create({
    data: { username: `l228a-${Date.now()}-${Math.random()}`, name: "Admin", role: "SUPER_ADMIN", pinHash: await hashPin(PIN) },
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
});

describe("L-99 — guard B: a caisse whose trading day has ended takes no more orders", () => {
  it("REFUSES A SALE THROUGH A 48-HOUR CAISSE, naming it and the day", async () => {
    // The France till on 2026-09-19, exactly: opened two days ago, never closed.
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    await openCaisseAt(twoDaysAgo);

    const res = await ring();

    expect(res.status, "the 48-hour caisse still takes orders").toBe(409);
    expect(res.body.error).toContain("n° 900");
    expect(res.body.error, "does not tell the cashier to close it").toContain("rapport Z");
    expect(await db.order.count(), "an order was booked into a dead trading day").toBe(0);
  });

  it("accepts a sale through a caisse opened today, which is every normal service", async () => {
    // The other direction, and it is the one that would stop a restaurant if
    // the rule were wrong.
    const opened = await openCaisse();
    expect(opened.status).toBe(201);

    const res = await ring();
    expect(res.status, res.body.error ?? "").toBe(201);
    expect(await db.order.count()).toBe(1);
  });
});

describe("L-228 — guard A: a sealed day takes no more orders", () => {
  it("REFUSES A SALE INTO A DAY THAT IS ALREADY SEALED", async () => {
    // Reachable here by raising the cut-off AFTER the seal, which is the
    // settings-only path L-228 names -- no code change, no clock tampering.
    // Seal yesterday under cut-off 0, then move the cut-off to 23: "now"
    // (before 23:00) then belongs to yesterday, which is sealed.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const period = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    await closeDay(period, manager.id, false, new Date());

    const now = new Date();
    if (now.getHours() >= 23) return; // the one hour of the day this construction cannot be built in
    await setCutoff(23);
    await openCaisseAt(new Date());

    const res = await ring();

    expect(res.status, "a sale was accepted into a sealed day").toBe(409);
    expect(res.body.error).toContain(period);
    expect(res.body.error).toContain("scellée");
    expect(await db.order.count()).toBe(0);
  });
});

describe("L-228 — guard C: an unsealed day blocks the next caisse", () => {
  async function yesterdayWithASale() {
    // A shift and an order dated yesterday, then the shift closed, so the day
    // has activity and no caisse is open -- the state the owner leaves behind
    // when he closes the till and not the day.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const shift = await db.shift.create({
      data: { number: 901, status: "CLOSED", openedById: manager.id, openedAt: yesterday, closedAt: yesterday, openingFloat: 0 },
    });
    await db.order.create({
      data: {
        number: 901, shiftId: shift.id, cashierId: manager.id, status: "COMPLETED",
        subtotal: 500, discountTotal: 0, total: 500, vatTotal: 45, itemCount: 1,
        createdAt: yesterday, completedAt: yesterday,
      },
    });
    return yesterday;
  }

  it("REFUSES TO OPEN A CAISSE while yesterday recorded sales and is unsealed", async () => {
    await yesterdayWithASale();

    const res = await openCaisse();

    expect(res.status, "the caisse opened with yesterday unsealed").toBe(409);
    expect(res.body.error).toContain("clôture du jour");
    expect(res.body.unsealedDay, "the client is not told WHICH day to seal").toBeTruthy();
    expect(await db.shift.count({ where: { status: "OPEN" } })).toBe(0);
  });

  it("A QUIET DAY DOES NOT BLOCK — the day the restaurant was closed", async () => {
    // Nothing was rung, so there is nothing to seal and nothing accumulates.
    // Measured against the same three tables `assertDaySequence` seals on.
    const res = await openCaisse();
    expect(res.status, res.body.error ?? "").toBe(201);
  });

  it("TODAY'S OWN SALES DO NOT BLOCK — the day in progress is not an unsealed day", async () => {
    // FOUND BY A REVERT, not by design. Dropping the `lt: today.from` bound in
    // `earliestUnsealedDayWithActivity` makes today's own orders count as an
    // earlier unsealed day -- and every test stayed green, because none of them
    // reopened a caisse on the same day. Closing for a break and reopening is a
    // real thing, and being refused over a sale rung an hour earlier would stop
    // a restaurant for a reason nobody could act on: today cannot be sealed.
    const now = new Date();
    const shift = await db.shift.create({
      data: { number: 902, status: "CLOSED", openedById: manager.id, openedAt: now, closedAt: now, openingFloat: 0 },
    });
    await db.order.create({
      data: {
        number: 902, shiftId: shift.id, cashierId: manager.id, status: "COMPLETED",
        subtotal: 500, discountTotal: 0, total: 500, vatTotal: 45, itemCount: 1,
        createdAt: now, completedAt: now,
      },
    });

    const res = await openCaisse();
    expect(res.status, res.body.error ?? "").toBe(201);
  });

  it("opens normally once the day IS sealed", async () => {
    const yesterday = await yesterdayWithASale();
    const period = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    await closeDay(period, manager.id, false, new Date());

    const res = await openCaisse();
    expect(res.status, res.body.error ?? "").toBe(201);
  });
});

describe("L-228 — the escape, and its two conditions", () => {
  async function blocked() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const shift = await db.shift.create({
      data: { number: 901, status: "CLOSED", openedById: manager.id, openedAt: yesterday, closedAt: yesterday, openingFloat: 0 },
    });
    await db.order.create({
      data: {
        number: 901, shiftId: shift.id, cashierId: manager.id, status: "COMPLETED",
        subtotal: 500, discountTotal: 0, total: 500, vatTotal: 45, itemCount: 1,
        createdAt: yesterday, completedAt: yesterday,
      },
    });
  }

  it("A MANAGER CANNOT FORCE IT, and is refused rather than ignored", async () => {
    // Silently dropping the flag would tell the caller the day was sealed when
    // it was not.
    await blocked();
    const res = await openCaisse(manager, { force: true });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("super administrateur");
    expect(await db.shift.count({ where: { status: "OPEN" } })).toBe(0);
  });

  it("A SUPER_ADMIN CAN, AND THE JOURNAL RECORDS IT", async () => {
    // The whole of the escape's safety: who did it, and which day was left.
    await blocked();
    const before = await db.fiscalEvent.count();

    const res = await openCaisse(admin, { force: true });

    expect(res.status, res.body.error ?? "").toBe(201);
    expect(await db.fiscalEvent.count(), "forcing an open left no trace in the journal").toBe(before + 1);
    const ev = await db.fiscalEvent.findFirstOrThrow({ orderBy: { sequence: "desc" } });
    expect(ev.type).toBe("OUVERTURE_FORCEE");
    expect(ev.userId, "the journal does not say WHO forced it").toBe(admin.id);
    expect(ev.dataJson, "the journal does not say which day was left unsealed").toContain("unsealedDay");
  });

  it("tells the SUPER_ADMIN the escape exists, and does not tell the MANAGER", async () => {
    // `canForce` is what the screen reads to decide whether to offer the
    // button. Offering it to an account that will be refused is worse than not
    // offering it.
    await blocked();
    expect((await openCaisse(admin)).body.canForce).toBe(true);
    expect((await openCaisse(manager)).body.canForce).toBe(false);
  });

  it("THE ESCAPE DOES NOT REACH A SEALED DAY", async () => {
    // A protects a document that is already sealed, and nothing operational is
    // worth writing a sale into one. There is no force on the orders route at
    // all, so a forced-open caisse still cannot ring into a sealed day.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const period = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    await closeDay(period, manager.id, false, new Date());
    const now = new Date();
    if (now.getHours() >= 23) return;
    await setCutoff(23);
    await openCaisseAt(new Date());

    const res = await ring(admin);
    expect(res.status, "a SUPER_ADMIN rang a sale into a sealed day").toBe(409);
  });
});
