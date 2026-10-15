import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { ensureFiscalCounter } from "@/lib/services/sequence";

// L-265 — the client list, through the real route.
//
// Measured on a scratch copy before writing it, 2026-10-15: a client saved as
// « 06 12 34 56 78 » was NOT found by « 0612345678 » or « 5678 », and creating
// a client never looked for the number — so a regular whose number was typed
// differently was created twice. The rules are unit-tested in
// `lib/customer-match.test.ts`; these prove the route applies them.

const PIN = "424242";
let manager: { id: string; username: string; role: "MANAGER" };

async function route() {
  return import("@/app/api/customers/route");
}

type Row = { id: string; name: string; orderCount: number; lastOrderAt: string | null };

async function list(q?: string) {
  const { GET } = await route();
  const url = `http://localhost/api/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`;
  return callJson<Row[]>(GET, { url });
}

async function create(body: Record<string, unknown>) {
  const { POST } = await route();
  return callJson<{ id?: string; error?: string; duplicateOf?: { id: string; name: string } }>(POST, {
    method: "POST",
    url: "http://localhost/api/customers",
    body,
  });
}

let orderNumber = 0;
async function ordersFor(customerId: string, dates: Date[]) {
  const shift = await db.shift.findFirst() ?? (await db.shift.create({
    data: { number: 1, openedById: manager.id, status: "OPEN", openingFloat: 0 },
  }));
  for (const at of dates) {
    await db.order.create({
      data: {
        number: ++orderNumber,
        shiftId: shift.id,
        cashierId: manager.id,
        customerId,
        status: "COMPLETED",
        subtotal: 990,
        discountTotal: 0,
        total: 990,
        vatTotal: 90,
        itemCount: 1,
        createdAt: at,
      },
    });
  }
}

async function wipe(): Promise<void> {
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.fiscalEvent.deleteMany();
  await db.receipt.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.refund.deleteMany();
  await db.order.deleteMany();
  await db.customer.deleteMany();
  await db.zReport.deleteMany();
  await db.shift.deleteMany();
  await db.setting.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  orderNumber = 0;
  await ensureFiscalCounter();
  const m = await db.user.create({
    data: { username: `l265-${Date.now()}`, name: "Gérant", role: "MANAGER", pinHash: await hashPin(PIN) },
  });
  manager = { id: m.id, username: m.username, role: "MANAGER" };
  await signInAs(manager);
});

afterAll(async () => {
  await wipe();
});

describe("GET /api/customers — search (L-265)", () => {
  it("finds a spaced number from the number typed without spaces, and from its last four digits", async () => {
    await db.customer.create({ data: { name: "Mme Espaces", phone: "06 12 34 56 78" } });
    for (const q of ["0612345678", "5678", "06 12 34", "+33 6 12 34 56 78"]) {
      const res = await list(q);
      expect(res.status).toBe(200);
      expect(res.body.map((c) => c.name), `query « ${q} »`).toEqual(["Mme Espaces"]);
    }
  });

  it("finds a name without its accents", async () => {
    await db.customer.create({ data: { name: "Éloïse Martin", phone: null } });
    expect((await list("eloise")).body.map((c) => c.name)).toEqual(["Éloïse Martin"]);
  });
});

describe("GET /api/customers — regulars first (L-265)", () => {
  it("puts the clients who order most first, the latest order breaking a tie, with the date", async () => {
    const rare = await db.customer.create({ data: { name: "Rare", phone: null } });
    const old = await db.customer.create({ data: { name: "Habitué ancien", phone: null } });
    const recent = await db.customer.create({ data: { name: "Habitué récent", phone: null } });
    await db.customer.create({ data: { name: "Jamais", phone: null } });
    await ordersFor(rare.id, [new Date("2026-10-14T12:00:00Z")]);
    await ordersFor(old.id, [new Date("2026-10-01T12:00:00Z"), new Date("2026-10-02T12:00:00Z")]);
    await ordersFor(recent.id, [new Date("2026-10-05T12:00:00Z"), new Date("2026-10-13T12:00:00Z")]);

    const res = await list();
    expect(res.body.map((c) => c.name)).toEqual(["Habitué récent", "Habitué ancien", "Rare", "Jamais"]);
    expect(res.body[0].orderCount).toBe(2);
    expect(new Date(res.body[0].lastOrderAt!).toISOString()).toBe("2026-10-13T12:00:00.000Z");
    expect(res.body[3].lastOrderAt).toBeNull();
  });
});

describe("POST /api/customers — the duplicate check (L-265)", () => {
  it("refuses a number that already belongs to a client, however it is typed, and names them", async () => {
    const existing = await db.customer.create({ data: { name: "Mme A", phone: "06 12 34 56 78" } });
    const res = await create({ name: "Mme A bis", phone: "0612345678", address: "1 rue", city: "Ferrieres" });
    expect(res.status).toBe(409);
    expect(res.body.duplicateOf).toEqual({ id: existing.id, name: "Mme A" });
    expect(await db.customer.count()).toBe(1);
  });

  it("creates it anyway when the cashier says so — a shared landline is real", async () => {
    await db.customer.create({ data: { name: "Mme A", phone: "02 38 87 00 00" } });
    const res = await create({ name: "M. A", phone: "0238870000", allowDuplicatePhone: true });
    expect(res.status).toBe(201);
    expect(await db.customer.count()).toBe(2);
  });

  it("does not check a client created without a number", async () => {
    await db.customer.create({ data: { name: "Sans numéro", phone: null } });
    const res = await create({ name: "Autre sans numéro" });
    expect(res.status).toBe(201);
  });
});
