import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { isShiftStillOpen, SHIFT_CLOSED_DURING_CHECKOUT_MESSAGE } from "@/lib/services/checkout";
import { ensureFiscalCounter } from "@/lib/services/sequence";

// L-41 and M-12 (2026-09-05), Batch 5.7c.
//
// L-41's FINDING. `orders/route.ts` looks the open shift up near the top, then
// prices every line — one database read per product — reads the settings, and
// only then consumes the operator's single-use step-up token. The transaction
// that follows re-asserts the shift status (C-15, Batch 4.7) and may refuse
// 409. So a discounted sale that lost the race to a Z close was refused **with
// the PIN already spent**, costing the operator a second entry for a sale that
// was never refused on its own merits.
//
// WHAT THE FIX IS AND IS NOT. The route now re-reads the till immediately
// before consuming the token. That does **not** close the race — nothing
// outside a transaction can, which is C-15's whole point, and Batch 4.7's
// assertion inside the transaction is still there as the guarantee. It moves
// the check from "before all the pricing work" to "one statement before the
// token", which is the window that was costing the PIN. Stated plainly here
// because a test that implied the race was closed would be worse than none.

/** The route source, comments stripped, so an ordering assertion cannot be
 *  satisfied by prose (Batch 5.2 note 2's technique). */
function routeCode(): string {
  return readFileSync("src/app/api/orders/route.ts", "utf8")
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
    .join("\n");
}

let userId: string;

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.zReport.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
}

describe("L-41 — the till is re-checked before the PIN is spent", () => {
  beforeEach(async () => {
    await wipe();
    await ensureFiscalCounter();
    const u = await db.user.create({
      data: { username: `l41-${Date.now()}-${Math.random()}`, name: "Resp", role: "MANAGER", pinHash: "x:y" },
    });
    userId = u.id;
  });
  afterAll(wipe);

  it("reports an open till as open", async () => {
    const s = await db.shift.create({
      data: { number: 1, openedById: userId, openedAt: new Date(), openingFloat: 0, status: "OPEN" },
    });
    expect(await isShiftStillOpen(s.id)).toBe(true);
  });

  it("reports a till closed underneath the sale as closed", async () => {
    const s = await db.shift.create({
      data: { number: 1, openedById: userId, openedAt: new Date(), openingFloat: 0, status: "OPEN" },
    });
    await db.shift.update({ where: { id: s.id }, data: { status: "CLOSED" } });
    expect(await isShiftStillOpen(s.id)).toBe(false);
  });

  it("reports a till that no longer exists as closed, not as open", async () => {
    // Fail closed. A missing row must never read as "carry on and take money".
    expect(await isShiftStillOpen("does-not-exist")).toBe(false);
  });

  it("is consulted BEFORE the token is consumed, and the token is still last", () => {
    // The ordering IS the fix. Source, because driving the route needs a
    // request scope (`withAuth` → `getSession()` → `cookies()` throws outside
    // one) which stays with Batch 6.1 — the boundary `api-authorization.
    // test.ts` draws. What this proves is the order of the statements.
    const code = routeCode();
    const check = code.indexOf("isShiftStillOpen(");
    const consume = code.indexOf("await consumeStepUpToken(");
    const write = code.indexOf("await createOrderInTransaction(");
    expect(check).toBeGreaterThan(-1);
    expect(consume).toBeGreaterThan(-1);
    expect(check).toBeLessThan(consume);
    // …and consuming the token remains the LAST thing before the write, which
    // is DD-19's own ordering and must not be disturbed by this batch.
    expect(consume).toBeLessThan(write);
  });

  it("keeps the in-transaction assertion, which is the actual guarantee", () => {
    // The pre-check narrows a window; only this closes it. A batch that
    // "fixed" L-41 by moving the assertion out here would reopen C-15.
    const checkout = readFileSync("src/lib/services/checkout.ts", "utf8");
    expect(checkout).toContain("await db.$transaction");
    const tx = checkout.indexOf("await db.$transaction");
    const assertion = checkout.indexOf('shift.status !== "OPEN"');
    expect(assertion).toBeGreaterThan(tx);
    expect(checkout).toContain(SHIFT_CLOSED_DURING_CHECKOUT_MESSAGE.slice(0, 30));
  });
});

describe("M-12 — the PERCENT discount comment matches the code", () => {
  it("no longer claims the value is percent×100", () => {
    // The code computes `subtotal * min(value, 100) / 100` — a PLAIN percent.
    // The schema comment said "percent×100", so a client that believed it and
    // sent 2500 for 25 % would have been clamped to 100 and given the whole
    // order away. The COMMENT was wrong, and the comment was corrected: the UI
    // has only ever sent AMOUNT, so no caller depends on the other reading.
    // Scoped to the `value:` line itself rather than the whole file: the
    // corrected comment above it QUOTES the old wrong wording so the history
    // stays readable, and a file-wide assertion would forbid that. What must
    // not mislead a client is the line documenting the field.
    const route = readFileSync("src/app/api/orders/route.ts", "utf8");
    const valueLine = route
      .split(/\r?\n/)
      .filter((l) => l.trim().startsWith("value: z.number()"));
    expect(valueLine).toHaveLength(1);
    expect(valueLine[0]).not.toContain("percent×100");
    expect(valueLine[0]).toContain("a plain 0-100 percent when PERCENT");
  });

  it("still clamps at 100, so a discount can never exceed the order", () => {
    const code = routeCode();
    expect(code).toContain("Math.min(discount.value, 100)");
  });
});
