import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { buildVentePayload, buildOrderAuditDetails, type SaleJournalInput } from "@/lib/services/sale-journal";
import { appendFiscalEvent, verifyFiscalChain } from "@/lib/services/fiscal";
import { nextReceiptNumber, ensureFiscalCounter } from "@/lib/services/sequence";

// C-13 (Batch 3.5) — the manager who approved a discount was verified and then
// discarded.
//
// `discountApproverId` was assigned from the verified approval token at
// orders/route.ts:237 and never read again. Order had no approver column, and
// neither the ORDER_CREATED audit entry nor the VENTE journal payload carried
// the id. The system enforced the approval correctly and kept no record of who
// gave it.
//
// What these tests cover, and what they do not: the two payloads are now built
// by shared helpers, so the assertions below run the SAME code the checkout
// route runs (orders/route.ts:420, :438) rather than a copy of it. The
// surrounding transaction — numbering, order write, receipt, grand total — is
// still inline in the route and is reproduced here in `sellWithDiscount`. That
// composition is pinned by comment, not by execution; testing the checkout
// transaction end-to-end is T-02 / T-05 / T-06 in Batch 6.1.

const APPROVED: SaleJournalInput = {
  orderNumber: 1042,
  total: 8000,
  subtotal: 10000,
  vatTotal: 727,
  discountTotal: 2000,
  discountApprovedById: "manager-cuid",
  itemCount: 3,
  orderType: "DINE_IN",
  payments: [{ method: "CASH", amount: 8000 }],
  cashierId: "cashier-cuid",
};

const UNAPPROVED: SaleJournalInput = {
  ...APPROVED,
  orderNumber: 1043,
  total: 10000,
  discountTotal: 0,
  discountApprovedById: null,
};

describe("sale journal payloads (C-13)", () => {
  it("puts the approver in the VENTE payload", () => {
    expect(buildVentePayload(APPROVED).discountApprovedById).toBe("manager-cuid");
  });

  it("puts the approver AND the amount approved in the audit entry", () => {
    const details = buildOrderAuditDetails(APPROVED);
    expect(details.discountApprovedById).toBe("manager-cuid");
    // Without the amount, an AuditLog query for "what did this manager
    // authorise" returns rows that do not say what was authorised.
    expect(details.discountTotal).toBe(2000);
  });

  it("keeps the key present, as null, on a sale with no approver", () => {
    // Present-and-null and absent are different claims. Absent is what every
    // event written before this batch says, and those rows are sealed.
    const payload = buildVentePayload(UNAPPROVED);
    const details = buildOrderAuditDetails(UNAPPROVED);
    expect("discountApprovedById" in payload).toBe(true);
    expect(payload.discountApprovedById).toBeNull();
    expect("discountApprovedById" in details).toBe(true);
    expect(details.discountApprovedById).toBeNull();
  });

  it("leaves the rest of the VENTE payload exactly as it was", () => {
    // The shape change must be additive: a payload that quietly dropped or
    // renamed a field would break nothing visible and lose fiscal data.
    expect(buildVentePayload(APPROVED)).toEqual({
      orderNumber: 1042,
      total: 8000,
      subtotal: 10000,
      vatTotal: 727,
      discountTotal: 2000,
      discountApprovedById: "manager-cuid",
      itemCount: 3,
      orderType: "DINE_IN",
      payments: [{ method: "CASH", amount: 8000 }],
      cashierId: "cashier-cuid",
    });
  });

  it("keeps the audit entry's original four fields", () => {
    expect(buildOrderAuditDetails(APPROVED)).toMatchObject({
      number: 1042,
      total: 8000,
      items: 3,
      payments: 1,
    });
  });
});

/** Reproduces the checkout transaction's writes around the shared payload
 *  builders — orders/route.ts:321 (the column), :420 (the journal), :438 (the
 *  audit entry). */
async function sellWithDiscount(opts: {
  cashierId: string;
  shiftId: string;
  approverId: string | null;
  subtotal: number;
  discountTotal: number;
}) {
  const total = opts.subtotal - opts.discountTotal;
  return db.$transaction(async (tx) => {
    const number = await nextReceiptNumber(tx);
    const created = await tx.order.create({
      data: {
        number,
        shiftId: opts.shiftId,
        cashierId: opts.cashierId,
        status: "COMPLETED",
        subtotal: opts.subtotal,
        vatTotal: Math.round(total - total / 1.1),
        discountTotal: opts.discountTotal,
        discountApprovedById: opts.approverId,
        total,
        itemCount: 1,
        completedAt: new Date(),
      },
    });
    const saleJournal: SaleJournalInput = {
      orderNumber: number,
      total,
      subtotal: opts.subtotal,
      vatTotal: created.vatTotal,
      discountTotal: opts.discountTotal,
      discountApprovedById: opts.approverId,
      itemCount: 1,
      orderType: "DINE_IN",
      payments: [{ method: "CASH", amount: total }],
      cashierId: opts.cashierId,
    };
    const ev = await appendFiscalEvent(tx, {
      type: "VENTE",
      userId: opts.cashierId,
      orderId: created.id,
      shiftId: opts.shiftId,
      data: buildVentePayload(saleJournal),
    });
    await tx.order.update({ where: { id: created.id }, data: { fiscalEventId: ev.id } });
    await tx.auditLog.create({
      data: {
        userId: opts.cashierId,
        action: "ORDER_CREATED",
        entity: "Order",
        entityId: created.id,
        details: JSON.stringify(buildOrderAuditDetails(saleJournal)),
      },
    });
    return { orderId: created.id, number, eventId: ev.id };
  });
}

describe("an approved discount survives into the database (C-13)", () => {
  let cashierId: string;
  let approverId: string;
  let shiftId: string;

  beforeEach(async () => {
    await db.auditLog.deleteMany();
    await db.fiscalEvent.deleteMany();
    await db.order.deleteMany();
    await db.shift.deleteMany();
    await db.user.deleteMany();
    await db.fiscalCounter.deleteMany();
    await ensureFiscalCounter();

    const cashier = await db.user.create({
      data: { username: `c13-cashier-${Date.now()}`, name: "Caissier", role: "CASHIER", pinHash: "x:y" },
    });
    const approver = await db.user.create({
      data: { username: `c13-manager-${Date.now()}`, name: "Responsable", role: "MANAGER", pinHash: "x:y" },
    });
    cashierId = cashier.id;
    approverId = approver.id;
    const shift = await db.shift.create({
      data: { number: 900, openedById: cashier.id, openingFloat: 0, status: "OPEN" },
    });
    shiftId = shift.id;
  });

  it("persists the approver on the order, in the audit log and in the VENTE payload", async () => {
    // A 25 % discount on 100,00 € — above the 20 % default threshold, so a
    // cashier could only have taken it with a manager's approval token.
    const { orderId, number, eventId } = await sellWithDiscount({
      cashierId,
      shiftId,
      approverId,
      subtotal: 10000,
      discountTotal: 2500,
    });

    // 1. The column — the record C-13 says does not exist.
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.discountApprovedById).toBe(approverId);
    expect(order.discountTotal).toBe(2500);

    // 2. The audit entry.
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "ORDER_CREATED", entityId: orderId },
    });
    const details = JSON.parse(audit.details!);
    expect(details.discountApprovedById).toBe(approverId);
    expect(details.discountTotal).toBe(2500);

    // 3. The fiscal journal.
    const ev = await db.fiscalEvent.findUniqueOrThrow({ where: { id: eventId } });
    const payload = JSON.parse(ev.dataJson);
    expect(payload.discountApprovedById).toBe(approverId);
    expect(payload.orderNumber).toBe(number);
    expect(payload.discountTotal).toBe(2500);
  });

  it("records null — not a missing key — when no approval was needed", async () => {
    const { orderId, eventId } = await sellWithDiscount({
      cashierId,
      shiftId,
      approverId: null,
      subtotal: 10000,
      discountTotal: 0,
    });
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.discountApprovedById).toBeNull();
    const ev = await db.fiscalEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(JSON.parse(ev.dataJson).discountApprovedById).toBeNull();
  });

  it("keeps the chain verifiable with the widened payload", async () => {
    // The payload shape changed, so every event written from now on hashes
    // differently from one written before. That is fine — the chain links to
    // the predecessor's hash, not to a payload schema — but it has to be shown.
    await sellWithDiscount({ cashierId, shiftId, approverId, subtotal: 10000, discountTotal: 2500 });
    await sellWithDiscount({ cashierId, shiftId, approverId: null, subtotal: 4000, discountTotal: 0 });
    await sellWithDiscount({ cashierId, shiftId, approverId, subtotal: 6000, discountTotal: 1800 });

    const chain = await verifyFiscalChain();
    expect(chain.ok).toBe(true);
    expect(chain.lastSequence).toBe(3);
    expect(chain.eventsChecked).toBe(3);
  });

  it("survives the approver being deleted — the point of storing a plain id", async () => {
    // Order.discountApprovedById has NO foreign key, the same choice as
    // Refund.approvedById. A sale is a fiscal record: it must not become
    // undeletable-by-proxy, and it must not lose the approver when the
    // approver's account goes.
    const { orderId } = await sellWithDiscount({
      cashierId,
      shiftId,
      approverId,
      subtotal: 10000,
      discountTotal: 2500,
    });
    await db.user.delete({ where: { id: approverId } });

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.discountApprovedById).toBe(approverId);
    expect(await db.user.findUnique({ where: { id: approverId } })).toBeNull();
  });
});
