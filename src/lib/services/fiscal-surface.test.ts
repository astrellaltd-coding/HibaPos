import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { NAV_ITEMS } from "@/components/shared/nav-config";
import { appendFiscalEvent, verifyFiscalChain, closeMonth } from "@/lib/services/fiscal";
import { ensureFiscalCounter } from "@/lib/services/sequence";

// C-27 (Batch 3.4) — the fiscal operator surface.
//
// Nineteen of 59 routes had no client caller, and the group included EVERY
// /api/fiscal/* endpoint. The Conservation and Archivage mechanisms were
// implemented, gated and tested, and an operator could not reach any of them.
// Two consequences were not merely cosmetic: no REIMPRESSION event was ever
// written because the reprint route was never called, and the same was true
// of OUVERTURE_TIROIR.

describe("the fiscal surface is reachable (C-27)", () => {
  it("has a navigation entry, gated to MANAGER and above", () => {
    const fiscal = NAV_ITEMS.find((i) => i.view === "fiscal");
    expect(fiscal).toBeDefined();
    expect(fiscal!.roles).toContain("SUPER_ADMIN");
    expect(fiscal!.roles).toContain("MANAGER");
    // Batch 4.4b: the third line here asserted that CASHIER could not see the
    // fiscal module. DD-07 removed the role, so it is asserted on the whole
    // role model instead — nothing outside these two may reach it.
    expect(fiscal!.roles.length).toBe(2);
  });

  it("keeps the till's own surface unchanged", () => {
    // This pinned the five views a cashier could open. Batch 4.4b removed the
    // role; the same five are what the till uses, and they are now the
    // manager's, so the list is pinned against the surviving operational role.
    // Revisited, not deleted: a view silently appearing in or vanishing from
    // the till's own surface is still what this is here to catch.
    const forTill = NAV_ITEMS.filter((i) => i.roles.includes("MANAGER")).map((i) => i.view);
    expect(forTill).toContain("pos");
    expect(forTill).toContain("orders");
    expect(forTill).toContain("shifts");
    expect(forTill).toContain("customers");
    // C-21 / DD-09 (Batch 5.2): `tables` was the fifth member of this list and
    // is now asserted ABSENT. It is not being dropped because it broke — it
    // broke because the feature was withdrawn, and "a view vanishing from the
    // till's own surface" is exactly what this test exists to catch, so the
    // catch is answered here rather than deleted. Flipping it keeps the count
    // of pinned views at five.
    expect(forTill).not.toContain("tables");
    // …and the three that stayed with the super administrator (DD-07).
    expect(forTill).not.toContain("users");
    expect(forTill).not.toContain("backups");
    expect(forTill).not.toContain("logs");
  });
});

describe("the journal records what the new UI does", () => {
  beforeEach(async () => {
    await db.fiscalEvent.deleteMany();
    await db.monthlyClose.deleteMany();
    await db.order.deleteMany();
    await db.shift.deleteMany();
    await db.grandTotal.deleteMany();
    await db.user.deleteMany();
    await db.fiscalCounter.deleteMany();
    await ensureFiscalCounter();
  });

  it("writes an OUVERTURE_TIROIR entry, with its reason, that the chain accepts", async () => {
    // What POST /api/fiscal/drawer does — previously unreachable, so this
    // event type had never been written by the application at all.
    const user = await db.user.create({
      data: { username: `drawer-${Date.now()}`, name: "Drawer", role: "MANAGER", pinHash: "x:y" },
    });
    const ev = await db.$transaction((tx) =>
      appendFiscalEvent(tx, {
        type: "OUVERTURE_TIROIR",
        userId: user.id,
        data: { reason: "Appoint" },
      }),
    );
    expect(ev.type).toBe("OUVERTURE_TIROIR");
    expect(JSON.parse(ev.dataJson).reason).toBe("Appoint");

    const chain = await verifyFiscalChain();
    expect(chain.ok).toBe(true);
  });

  it("writes a REIMPRESSION entry and increments reprintCount", async () => {
    // What POST /api/orders/[id]/reprint does. Because the route had no
    // caller, Receipt.reprintCount could never leave 0.
    const user = await db.user.create({
      data: { username: `rp-${Date.now()}`, name: "RP", role: "MANAGER", pinHash: "x:y" },
    });
    const shift = await db.shift.create({
      data: { number: 500, openedById: user.id, openingFloat: 0, status: "OPEN" },
    });
    const order = await db.order.create({
      data: {
        number: 5000, shiftId: shift.id, cashierId: user.id, status: "COMPLETED",
        subtotal: 1000, discountTotal: 0, total: 1000, vatTotal: 91, itemCount: 1,
        completedAt: new Date(),
      },
    });
    const receipt = await db.receipt.create({
      data: { orderId: order.id, receiptNumber: 5000, content: "TICKET", printStatus: "PRINTED" },
    });
    expect(receipt.reprintCount).toBe(0);

    const updated = await db.receipt.update({
      where: { id: receipt.id },
      data: { reprintCount: { increment: 1 } },
    });
    const ev = await db.$transaction((tx) =>
      appendFiscalEvent(tx, {
        type: "REIMPRESSION",
        userId: user.id,
        orderId: order.id,
        data: { orderNumber: order.number, reprintCount: updated.reprintCount },
      }),
    );

    expect(updated.reprintCount).toBe(1);
    expect(ev.type).toBe("REIMPRESSION");
    expect(JSON.parse(ev.dataJson).reprintCount).toBe(1);
    expect((await verifyFiscalChain()).ok).toBe(true);
  });

  it("still verifies after a close is sealed through the UI's endpoint", async () => {
    const user = await db.user.create({
      data: { username: `cl-${Date.now()}`, name: "CL", role: "SUPER_ADMIN", pinHash: "x:y" },
    });
    // L-25 (Batch 3.6b): clock pinned past the period being sealed.
    // AMENDED 2026-09-06 (Batch 3.8, DD-24): the month now ends at the
    // trading-day cut-off, so midnight on the 1st is five hours early.
    const close = await closeMonth(2026, 5, user.id, false, new Date(2026, 5, 1, 6, 0));
    expect(close.period).toBe("2026-05");
    expect(close.hash).toHaveLength(64);

    const chain = await verifyFiscalChain();
    expect(chain.ok).toBe(true);

    // The close is journalled, which is what the screen's list reads back.
    const ev = await db.fiscalEvent.findFirst({ where: { type: "CLOTURE_M" } });
    expect(ev).not.toBeNull();
    expect(JSON.parse(ev!.dataJson).period).toBe("2026-05");
  });
});
