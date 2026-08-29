import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams, parseJson } from "@/lib/api-handler";
import { refundSchema } from "@/lib/validation";
import { round2 } from "@/lib/money";
import { verifyApprovalToken, ApprovalError } from "@/lib/approvals";
import type { PaymentMethod } from "@prisma/client";

/** In-transaction validation failure with an HTTP status. */
class RefundError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RefundError";
    this.status = status;
  }
}

export const POST = withAuthParams(async (req, { user, params }) => {
  const order = await db.order.findUnique({
    where: { id: params.id },
    include: {
      refunds: true,
      payments: true,
      shift: { select: { id: true, status: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  if (order.status !== "COMPLETED" && order.status !== "REFUNDED") {
    return NextResponse.json(
      { error: "Seules les commandes terminées peuvent être remboursées" },
      { status: 409 }
    );
  }
  // Reject refunds on orders whose shift is already CLOSED (post-Z reconciliation drift).
  // The cashier should open a new shift or escalate to a SUPER_ADMIN to re-open reconciliation.
  if (order.shift?.status === "CLOSED") {
    return NextResponse.json(
      { error: "La caisse attachée à cette commande est déjà clôturée. Remboursement impossible." },
      { status: 409 }
    );
  }

  const body = await parseJson(req);
  const parsed = refundSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalide" },
      { status: 400 }
    );
  }
  if (parsed.data.amount <= 0) {
    return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
  }

  // Validate the requested refund method was actually used for the original
  // payment — cashiers can't refund a method the customer didn't pay with.
  const refundMethod: PaymentMethod | null = (parsed.data.method ?? null);
  if (refundMethod) {
    const validMethods = new Set(order.payments.map((p) => p.method));
    // VOUCHER is also acceptable for store-credit refunds even if not paid that way.
    if (!validMethods.has(refundMethod) && refundMethod !== "VOUCHER") {
      return NextResponse.json(
        { error: "Méthode de remboursement non autorisée (le client n'a pas payé par ce moyen)." },
        { status: 400 }
      );
    }
  }

  // Manager approval verification.
  // - approvalToken (preferred): signed single-use token from /api/auth/approve,
  //   verified against (action=REFUND, amount=refundAmount).
  // - MANAGER+/SUPER_ADMIN callers: self-approve (their session IS the auth).
  // - CASHIER callers MUST present a valid approvalToken — legacy `approvedById`
  //   is no longer trusted alone (closes forged-approval vulnerability S2).
  let refundApproverId: string | null = null;
  if (parsed.data.approvalToken) {
    try {
      const result = verifyApprovalToken(parsed.data.approvalToken, {
        action: "REFUND",
        amount: parsed.data.amount,
      });
      const approver = await db.user.findUnique({
        where: { id: result.approverId, active: true },
        select: { role: true },
      });
      if (!approver || (approver.role !== "MANAGER" && approver.role !== "SUPER_ADMIN")) {
        return NextResponse.json({ error: "Approbateur invalide ou non autorisé." }, { status: 403 });
      }
      refundApproverId = result.approverId;
    } catch (e) {
      const status = e instanceof ApprovalError ? e.status : 500;
      const message = e instanceof Error ? e.message : "Token d'approbation invalide.";
      return NextResponse.json({ error: message }, { status });
    }
  } else if (user.role === "MANAGER" || user.role === "SUPER_ADMIN") {
    // Self-approve; manager or super-admin callers authorize their own refund.
    refundApproverId = user.id;
  } else {
    // CASHIER must present a fresh signed approval token.
    return NextResponse.json(
      { error: "Token d'approbation manager requis pour rembourser." },
      { status: 400 }
    );
  }

  let refund;
  try {
    refund = await db.$transaction(async (tx) => {
    // Re-read refunds + order INSIDE the transaction: the pre-tx
    // `alreadyRefunded` is a stale snapshot and two concurrent refund POSTs
    // could both pass validation and double-spend (post-audit N8). The
    // transaction's write lock serializes this re-check.
    const freshRefunds = await tx.refund.findMany({ where: { orderId: order.id } });
    const freshRefunded = freshRefunds.reduce((acc, r) => acc + r.amount, 0);
    const freshOrder = await tx.order.findUnique({
      where: { id: order.id },
      select: { total: true, status: true },
    });
    if (!freshOrder) throw new Error("Commande introuvable");
    if (freshOrder.status !== "COMPLETED" && freshOrder.status !== "REFUNDED") {
      throw new RefundError(
        "Seules les commandes terminées peuvent être remboursées",
        409
      );
    }
    if (freshRefunded >= freshOrder.total - 0.001) {
      throw new RefundError(
        "Cette commande a déjà été entièrement remboursée",
        400
      );
    }
    if (parsed.data.amount > round2(freshOrder.total - freshRefunded) + 0.001) {
      throw new RefundError("Montant de remboursement supérieur au solde", 400);
    }

    const r = await tx.refund.create({
      data: {
        orderId: order.id,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
        cashierId: user.id,
        approvedById: refundApproverId,
        // Record the issuing shift (== the order's open shift so far) so
        // Z reports stay attributed correctly even if the underlying order
        // has a different shift in a multi-shift scenario.
        shiftId: order.shift?.id ?? null,
        method: refundMethod,
      },
    });

    const totalRefunded = round2(freshRefunded + parsed.data.amount);
    const fullyRefunded = totalRefunded >= freshOrder.total - 0.001;

    if (fullyRefunded) {
      await tx.order.update({
        where: { id: order.id },
        data: { status: "REFUNDED", refundedAt: new Date() },
      });
    }

    // Auto-free the table linked to this order (if dine-in with a table label).
    if (fullyRefunded && order.orderType === "DINE_IN" && order.tableLabel) {
      await tx.table.updateMany({
        where: { currentOrderId: order.id, status: "OCCUPIED" },
        data: { status: "FREE", currentOrderId: null },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "ORDER_REFUNDED",
        entity: "Order",
        entityId: order.id,
        details: JSON.stringify({
          amount: parsed.data.amount,
          reason: parsed.data.reason,
          method: refundMethod,
          approvedById: refundApproverId,
          totalRefunded,
          fullyRefunded,
        }),
      },
    });

    return r;
    });
  } catch (e) {
    if (e instanceof RefundError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  return NextResponse.json(refund, { status: 201 });
});