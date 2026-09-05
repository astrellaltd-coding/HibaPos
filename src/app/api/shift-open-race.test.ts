import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { hashPin } from "@/lib/auth";
import { POST as openShift } from "@/app/api/shifts/route";

// L-45 (Batch 7.4c) — the single-open-till guard, inside the transaction.
//
// THE SHAPE. `POST /api/shifts` read `findFirst({ status: "OPEN" })` and THEN
// opened a `$transaction` to create the shift, so two concurrent opens could
// both pass the guard and both create one. That is **C-15 at a fourth site**:
// Batch 4.7 closed the checkout, the Z report and the refund the same way and
// did not name this one, and Batch 5.5's cash movements resolve the same
// question inside their own transaction, which is why they added no exposure.
//
// WHY IT MATTERS EVEN THOUGH IT IS LATENT. Nothing has ever produced two open
// tills and the restaurant has one operator. But since Batch 5.3 "the current
// open till" is what a refund is attributed to, and three separate readers
// resolve it with `findFirst` + `orderBy: { openedAt: "desc" }` — they would
// all agree on WHICH of two tills they meant, and the second one should not
// exist.

const PIN = "135790";
let manager: { id: string };

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
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
  await ensureFiscalCounter();
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  manager = await db.user.create({
    data: { username: "l45-manager", name: "L45", role: "MANAGER", pinHash: await hashPin(PIN) },
  });
  await signInAs({ id: manager.id, username: "l45-manager", role: "MANAGER" });
});

afterAll(clearCookies);

function open(openingFloat = 10_000) {
  return callJson<{ id?: string; number?: number; error?: string }>(openShift, {
    url: "http://localhost/api/shifts",
    method: "POST",
    body: { openingFloat },
  });
}

describe("L-45 — only one till can ever be open", () => {
  it("opens a till, and refuses the second with 409 and the same message", async () => {
    const first = await open();
    expect(first.status).toBe(201);

    const second = await open();
    expect(second.status).toBe(409);
    // The refusal an operator reads is unchanged by this fix — only where it
    // is decided moved.
    expect(second.body.error).toBe("Une caisse est déjà ouverte. Clôturez-la d'abord.");
    expect(await db.shift.count({ where: { status: "OPEN" } })).toBe(1);
  });

  it("TEN SIMULTANEOUS opens produce exactly ONE till", async () => {
    // The property the fix exists for. Under the old shape all ten could read
    // "no till open" before any of them created one.
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => open()));

    const created = results.filter(
      (r) => r.status === "fulfilled" && r.value.status === 201,
    );
    const refused = results.filter(
      (r) => r.status === "fulfilled" && r.value.status === 409,
    );

    // Exactly one till exists, whatever the responses were. This is the
    // assertion that matters and it is about the DATABASE, not the replies.
    expect(await db.shift.count({ where: { status: "OPEN" } })).toBe(1);
    expect(await db.shift.count()).toBe(1);

    // At most one caller was told it succeeded. A loser may be refused 409 or
    // rejected by the write lock — both are acceptable, and asserting a fixed
    // split of the ten is the mistake L-43 was made of.
    expect(created.length).toBeLessThanOrEqual(1);
    expect(created.length + refused.length).toBeLessThanOrEqual(10);
  });

  it("a till can be opened again once the previous one is closed", async () => {
    // The control: the guard must not be a permanent refusal.
    const first = await open();
    expect(first.status).toBe(201);
    await db.shift.update({
      where: { id: first.body.id! },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    const second = await open();
    expect(second.status).toBe(201);
    expect(second.body.number).toBe(2);
    expect(await db.shift.count({ where: { status: "OPEN" } })).toBe(1);
  });
});
