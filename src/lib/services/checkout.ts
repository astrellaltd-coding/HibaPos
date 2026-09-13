// Checkout service — the transaction body of POST /api/orders, extracted so
// the shift-state race can be tested without an HTTP harness (C-15, Batch 4.7).
//
// This follows the shape `processRefund` already established: the route keeps
// request parsing, server-authoritative pricing, payment validation and the
// step-up token; this module owns everything that must be atomic — numbering,
// the order, its lines, its payments, the receipt snapshot, the VENTE journal
// entry, the grand total and the audit row. It throws CheckoutError for the
// one refusal that can only be decided inside the transaction.
//
// WHY THE SHIFT IS RE-READ HERE. The route looks up the open shift before it
// does any of its work; that read is not in a transaction, and a read outside
// a transaction does not wait for one — measured in Batch 4.7, it returns
// `OPEN` while a Z close is mid-flight. Prisma's interactive transactions on
// SQLite, by contrast, do not overlap at all: the second one's body does not
// begin until the first has committed (measured in both `delete` and `wal`
// journal modes). So re-asserting the status as the FIRST statement in here is
// exactly what closes C-15's window: a checkout that starts after the close
// committed sees CLOSED and is refused, and one that commits before it starts
// is counted by a Z report that now computes inside its own transaction.
import { db } from "@/lib/db";
import { nextReceiptNumber } from "@/lib/services/sequence";
import { renderReceipt } from "@/lib/services/receipt";
import { appendFiscalEvent, incrementGrandTotal } from "@/lib/services/fiscal";
import { sum2, addToVatBreakdown, apportion, splitVat, type VatBreakdown } from "@/lib/money";
import { buildVentePayload, buildOrderAuditDetails } from "@/lib/services/sale-journal";
import { TX_CHECKOUT, isTransactionBusyError } from "@/lib/tx-options";
import type { OrderDto, SettingsDto } from "@/types/api";
import type { PaymentMethod } from "@prisma/client";

/** In-transaction checkout failure with the HTTP status the route must return. */
export class CheckoutError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CheckoutError";
    this.status = status;
  }
}

/** Shown when the till was closed between the route's lookup and the sale
 *  being written. The cart is kept client-side, so the cashier opens a new
 *  till and rings the sale again — into the shift it actually belongs to. */
export const SHIFT_CLOSED_DURING_CHECKOUT_MESSAGE =
  "La caisse a été clôturée pendant l'encaissement. Ouvrez une caisse et recommencez la commande.";

/**
 * Is this till still open? — L-41 (Batch 5.7c).
 *
 * THE FINDING. `orders/route.ts` looks the shift up once, near the top, then
 * prices every line (one database read per product), reads the settings, and
 * only then consumes the operator's single-use step-up token — after which the
 * transaction below re-asserts the status and may refuse 409. So a discounted
 * sale that lost the race to a Z close was refused **with the PIN already
 * spent**, and the operator had to re-enter it for a sale that was never
 * refused on its own merits.
 *
 * The route now calls this immediately before `consumeStepUpToken`. That does
 * NOT close the race — nothing outside a transaction can, which is C-15's
 * whole point and why Batch 4.7 put the real assertion inside the transaction
 * — but it moves the check from "before all the pricing work" to "one
 * statement before the token", which is the window that was costing the PIN.
 *
 * Exported and shared so the route's pre-check and the transaction's guarantee
 * cannot drift apart: Batch 5.5 note 4's shape, where the route runs a pure
 * check first and the service keeps its own copy.
 */
export async function isShiftStillOpen(shiftId: string): Promise<boolean> {
  const shift = await db.shift.findUnique({ where: { id: shiftId }, select: { status: true } });
  return shift?.status === "OPEN";
}

/** Shown when the sale could not obtain a transaction inside its budget —
 *  in practice, a Z close holding the database longer than TX_CHECKOUT's
 *  `maxWait`. Nothing was written; retrying is safe. */
export const CHECKOUT_BUSY_MESSAGE =
  "La caisse est occupée (clôture en cours). Réessayez dans quelques secondes.";

export type CheckoutItem = {
  productId: string | null;
  productName: string;
  unitPrice: number; // cents
  quantity: number;
  lineTotal: number; // cents
  vatRate: number;
  optionsJson: string | null;
  addOnsJson: string | null;
  notes: string | null;
  /**
   * Batch 5.9 — set on the lines of a menu composé, absent on every other.
   *
   * A menu is sold at one forfait and booked as one line per component,
   * because components carry different rates and `OrderItem.vatRate` is the
   * only place a rate lives. These three are what let a reader put the menu
   * back together: which lines belong to it, what it was called, and what its
   * forfait was.
   */
  comboGroupId?: string | null;
  comboName?: string | null;
  comboPrice?: number | null;
  /**
   * L-77 (R2.2) — the menu's IDENTITY, beside `comboName`, which is its label.
   * Reports count menus by this. `comboName` is a snapshot of a string and two
   * menus could share one, which is L-76 exactly, one level up.
   */
  comboProductId?: string | null;
  /**
   * L-78 (R2.3) — the allocation's EVIDENCE: this component's standalone
   * catalogue price for this order type, the weight its share was computed
   * from. Null on an ordinary line and on a menu that took the policy's § 4
   * fallback, where the forfait was not divided at all.
   */
  referencePrice?: number | null;
};

export type CheckoutPayment = {
  method: PaymentMethod;
  amount: number; // cents
  tendered?: number | null; // cents
};

export type CheckoutInput = {
  shiftId: string;
  cashierId: string;
  customerId: string | null;
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON";
  tableLabel: string | null;
  notes: string | null;
  subtotal: number; // cents
  discountTotal: number; // cents
  totalAfterDiscount: number; // cents
  /** DD-19 / C-13: who authorised the discount, or null. */
  discountApprovedById: string | null;
  itemCount: number;
  items: CheckoutItem[];
  payments: CheckoutPayment[];
  settings: SettingsDto;
  /**
   * The till's key for ONE checkout attempt — L-89 / L-90 (R8.2).
   *
   * Optional, and it stays optional: every order written before this existed
   * has none, and a client that sends none still checks out exactly as before.
   * When it IS sent, this sale is written at most once however many times the
   * request arrives.
   */
  idempotencyKey?: string | null;
};

/** The relations an `OrderDto` carries. One shape, so the replay below returns
 *  byte-for-byte what the original call returned. */
const ORDER_DTO_INCLUDE = {
  items: true,
  payments: true,
  cashier: { select: { name: true, username: true } },
  customer: { select: { name: true } },
  shift: { select: { number: true } },
} as const;

/**
 * The order this key already wrote, or null.
 *
 * Read OUTSIDE the transaction on the way in, and again inside the catch when
 * the unique index refuses the insert. Neither read is the guarantee — the
 * INDEX is. Two taps 28 ms apart (measured by audit pass 4: orders #9 and #10)
 * can both pass a read-then-write, and only the database can arbitrate.
 */
async function orderForKey(key: string): Promise<OrderDto | null> {
  const existing = await db.order.findUnique({
    where: { idempotencyKey: key },
    include: ORDER_DTO_INCLUDE,
  });
  return (existing as unknown as OrderDto) ?? null;
}

/**
 * Prisma's unique-constraint code.
 *
 * Exported for a test. The BACKSTOP it guards is deliberately not driven end
 * to end (provoking a real P2002 costs a `prisma:error` block against a pinned
 * zero), so the predicate itself is where the coverage goes: getting the
 * `target` match wrong would leave the backstop silently never firing, which
 * is the failure mode that matters.
 */
export function isUniqueViolation(e: unknown, target: string): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as { code?: string; meta?: { target?: unknown } };
  if (err.code !== "P2002") return false;
  const t = err.meta?.target;
  const asText = Array.isArray(t) ? t.join(",") : String(t ?? "");
  return asText.includes(target);
}

/**
 * Write a sale atomically. Refuses with 409 if the shift closed underneath it.
 *
 * The caller MUST have validated everything that does not depend on the state
 * of the database at commit time: prices, payment coverage, livraison fields
 * and the step-up token.
 */
export async function createOrderInTransaction(input: CheckoutInput): Promise<OrderDto> {
  const {
    shiftId,
    cashierId,
    customerId,
    orderType,
    tableLabel,
    notes,
    subtotal,
    discountTotal,
    totalAfterDiscount,
    discountApprovedById,
    itemCount,
    items,
    payments,
    settings,
    idempotencyKey,
  } = input;

  // L-89 / L-90 — the cheap half, and it is only the cheap half. A tap that
  // arrives after the first sale has COMMITTED is answered from here with the
  // order that already exists, so the till shows « Commande #N encaissée » once
  // and the second tap is not a second sale. A tap that arrives while the
  // first is still in flight gets past this read, and the unique index in the
  // catch below is what stops it.
  if (idempotencyKey) {
    const already = await orderForKey(idempotencyKey);
    if (already) return already;
  }

  try {
    // C-15 (Batch 2.3): an explicit budget. Prisma's default is 5 s and this
    // body performs 8+ sequential writes — exceeding it rolls back the sale
    // AFTER the customer has paid, which is the worst moment to fail.
    return await db.$transaction(async (tx) => {
      // C-15 (Batch 4.7): the first statement, before a number is drawn or a
      // row is written. The route's lookup was outside any transaction and can
      // be stale by the time this body runs.
      const shift = await tx.shift.findUnique({
        where: { id: shiftId },
        select: { status: true },
      });
      if (!shift) {
        throw new CheckoutError("Caisse introuvable", 409);
      }
      if (shift.status !== "OPEN") {
        throw new CheckoutError(SHIFT_CLOSED_DURING_CHECKOUT_MESSAGE, 409);
      }

      // L-89 / L-90, the second of three places this key is consulted, and the
      // one that does the work in practice.
      //
      // **Prisma's interactive transactions on SQLite do not overlap** — the
      // second body does not begin until the first commits (§ 2, measured).
      // So by the time a concurrent tap reaches here, the winner's order is
      // committed and this read finds it. The tap outside the transaction can
      // miss it; this one cannot.
      //
      // Returning the existing order here also means the losing request never
      // reaches `tx.order.create`, so the unique index is never asked to
      // refuse anything and Prisma logs nothing. That matters beyond tidiness:
      // a P2002 is written to stderr as a `prisma:error` block, and a till
      // whose log fills with them on every double-tap teaches its operator to
      // ignore the log.
      if (idempotencyKey) {
        const already = await tx.order.findUnique({
          where: { idempotencyKey },
          include: ORDER_DTO_INCLUDE,
        });
        if (already) return already as unknown as OrderDto;
      }

      const number = await nextReceiptNumber(tx);

      // VAT on net-of-discount amounts, with the discount distributed across the
      // lines EXACTLY (M-13, Batch 3.2). Each line used to round on its own —
      // `Math.round(lineTotal × (1 − discountRatio))` — so `Σ netLineTotal` need
      // not equal `total − discount`, and the stored `vatTotal` could sit a cent
      // or two off the order it belongs to. `apportion` gives every line its
      // floor and hands the leftover cents to the largest remainders, so the
      // parts always sum to the whole and the split is deterministic.
      const vatBreakdown: VatBreakdown = {};
      const lineNets = apportion(items.map((i) => i.lineTotal), totalAfterDiscount);
      items.forEach((item, idx) => {
        addToVatBreakdown(vatBreakdown, lineNets[idx], item.vatRate);
      });
      const vatTotal = sum2(Object.values(vatBreakdown).map((v) => v.vat));

      const created = await tx.order.create({
        data: {
          number,
          shiftId,
          cashierId,
          customerId: customerId ?? null,
          status: "COMPLETED",
          orderType,
          tableLabel: tableLabel ?? null,
          subtotal,
          vatTotal,
          discountTotal,
          // C-13 (Batch 3.5): the approval was verified above and then thrown
          // away. Persisted here so a manager can be shown which discounts they
          // authorised, and a dispute can be settled from the data.
          discountApprovedById,
          total: totalAfterDiscount,
          notes: notes ?? null,
          itemCount,
          completedAt: new Date(),
          // Written INSIDE the transaction that writes the sale, so the key
          // and the sale commit or fail together. A key persisted beside a
          // rolled-back order would refuse the operator's honest retry.
          idempotencyKey: idempotencyKey ?? null,
        },
      });

      // L-58 (Batch 3.11): the line's net and its HT are stored, not recomputed
      // later. Both come from the numbers this transaction has already produced
      // — `lineNets[idx]` is the apportioned net above, and the HT uses the same
      // `splitVat` the VAT breakdown uses — so the stored figure cannot drift
      // from the `vatTotal` sealed on this order. A second implementation of the
      // split is exactly what `Σ (lineNetTotal − lineHt) === order.vatTotal`
      // exists to catch.
      for (const [idx, item] of items.entries()) {
        const lineNetTotal = lineNets[idx];
        await tx.orderItem.create({
          data: {
            orderId: created.id,
            productId: item.productId,
            productName: item.productName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
            vatRate: item.vatRate,
            lineNetTotal,
            lineHt: splitVat(lineNetTotal, item.vatRate).ht,
            // Batch 5.9. Null on an ordinary line, which is every line written
            // before this batch and most written after it.
            comboGroupId: item.comboGroupId ?? null,
            comboName: item.comboName ?? null,
            comboPrice: item.comboPrice ?? null,
            // R2.2 / R2.3, and null on an ordinary line for the same reason as
            // the three above: the menu this line belongs to, and the catalogue
            // price its share of the forfait was weighed against.
            comboProductId: item.comboProductId ?? null,
            referencePrice: item.referencePrice ?? null,
            optionsJson: item.optionsJson,
            addOnsJson: item.addOnsJson,
            notes: item.notes,
          },
        });
      }

      for (const p of payments) {
        await tx.payment.create({
          data: {
            orderId: created.id,
            method: p.method,
            amount: p.amount,
            tendered: p.tendered ?? null,
            change: p.tendered ? p.tendered - p.amount : null,
            cashierId,
          },
        });
      }

      // Auto-link table: if dine-in with a tableLabel matching a Table, set it OCCUPIED.
      //
      // C-21 / DD-09 (Batch 5.2): RETAINED DELIBERATELY, and unreachable
      // today. `tableLabel` arrives from the cart, whose `tableLabel` has no
      // writer — that is C-21 itself — so this branch has never been entered
      // by any sale, and the withdrawal of the floor-plan screen does not
      // change that. It stays, working and tested, in case table service ever
      // exists. Do not delete it as dead code without reopening DD-09.
      if (orderType === "DINE_IN" && tableLabel) {
        const table = await tx.table.findUnique({ where: { label: tableLabel } });
        if (table) {
          await tx.table.update({
            where: { id: table.id },
            data: { status: "OCCUPIED", currentOrderId: created.id },
          });
        }
      }

      const orderWithRelations = await tx.order.findUnique({
        where: { id: created.id },
        include: ORDER_DTO_INCLUDE,
      });

      // Persist receipt snapshot for fiscal immutability (inside the same transaction)
      const receiptText = renderReceipt(orderWithRelations as unknown as OrderDto, settings);
      await tx.receipt.create({
        data: {
          orderId: created.id,
          content: receiptText,
          receiptNumber: number,
          printStatus: "PENDING",
          reprintCount: 0,
        },
      });

      // --- Fiscal journal (JFP) — ISCA sécurisation/inaltérabilité ---
      // Append a hash-chained VENTE event + update the perpetual grand total,
      // atomically with the order so the journal can never desync from sales.
      const payCash = sum2(payments.filter((p) => p.method === "CASH").map((p) => p.amount));
      const payCard = sum2(payments.filter((p) => p.method === "CARD").map((p) => p.amount));
      const payVoucher = sum2(payments.filter((p) => p.method === "VOUCHER").map((p) => p.amount));
      // C-13 (Batch 3.5): both payloads are built by the shared helpers in
      // services/sale-journal.ts, so the tests exercise this code rather than a
      // reimplementation of it.
      const saleJournal = {
        orderNumber: number,
        total: totalAfterDiscount,
        subtotal,
        vatTotal,
        discountTotal,
        discountApprovedById,
        itemCount,
        orderType,
        payments: payments.map((p) => ({ method: p.method, amount: p.amount })),
        cashierId,
      };
      const ev = await appendFiscalEvent(tx, {
        type: "VENTE",
        userId: cashierId,
        factice: settings.factice ?? false,
        orderId: created.id,
        shiftId,
        data: buildVentePayload(saleJournal),
      });
      await tx.order.update({ where: { id: created.id }, data: { fiscalEventId: ev.id } });
      await incrementGrandTotal(tx, {
        total: totalAfterDiscount,
        vatTotal,
        cash: payCash,
        card: payCard,
        voucher: payVoucher,
      });

      // Audit inside transaction
      await tx.auditLog.create({
        data: {
          userId: cashierId,
          action: "ORDER_CREATED",
          entity: "Order",
          entityId: created.id,
          details: JSON.stringify(buildOrderAuditDetails(saleJournal)),
        },
      });

      return orderWithRelations as unknown as OrderDto;
    }, TX_CHECKOUT);
  } catch (e) {
    // L-89 / L-90 — THE BACKSTOP, and the third place the key is consulted.
    //
    // The two reads above handle every case this database actually produces,
    // because Prisma's interactive transactions on SQLite do not overlap. This
    // is what happens if that ever stops being true — another engine, another
    // driver, a future where the two bodies really do interleave. Both insert,
    // the UNIQUE INDEX refuses the second, the transaction rolls back entirely
    // (no order, no sealed VENTE event, no GrandTotal movement) and the
    // winner's order is returned instead. The loser's caller cannot tell the
    // difference, which is the whole point: the operator sees one sale because
    // there is one.
    //
    // **The index is the guarantee; the reads are the fast path.** Written in
    // that order deliberately — a read-then-write is not a lock, and
    // `GrandTotal` is never decremented (`schema.prisma`), so a second sale
    // that got through would be permanent. A refund corrects money; it does
    // not remove a phantom sale.
    //
    // NOT driven end to end by a test, and that is a measured trade rather
    // than an omission: provoking a real P2002 makes Prisma write a
    // `prisma:error` block, and `docs/BASELINES.md` pins zero of those in a
    // clean run — twelve of which R4.3 and R4.6 spent a batch each removing.
    // `isUniqueViolation` is tested directly instead.
    if (idempotencyKey && isUniqueViolation(e, "idempotencyKey")) {
      const winner = await orderForKey(idempotencyKey);
      if (winner) return winner;
      // The row is not there, so the key was not what collided, or the winner
      // rolled back after all. Fall through and report honestly rather than
      // invent a success.
    }
    // A close that holds the database longer than this sale can wait must not
    // reach the cashier as a Prisma stack trace. Nothing was written.
    if (isTransactionBusyError(e)) {
      throw new CheckoutError(CHECKOUT_BUSY_MESSAGE, 503);
    }
    throw e;
  }
}
