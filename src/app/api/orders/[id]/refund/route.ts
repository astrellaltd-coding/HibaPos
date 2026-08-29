import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams, parseJson } from "@/lib/api-handler";
import { refundSchema } from "@/lib/validation";
import { verifyApprovalToken, ApprovalError } from "@/lib/approvals";
import { processRefund, RefundError } from "@/lib/services/refund";
import { getSettings } from "@/lib/services/settings";
import type { PaymentMethod } from "@prisma/client";

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
  const settings = await getSettings();
  try {
    refund = await processRefund(
      {
        orderId: order.id,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
        method: refundMethod,
        approverId: refundApproverId,
        cashierId: user.id,
        factice: settings.factice ?? false,
      },
      order as unknown as {
        id: string;
        total: number;
        status: "COMPLETED" | "REFUNDED";
        orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON";
        tableLabel: string | null;
        shift: { id: string; status: "OPEN" | "CLOSED" } | null;
        refunds: { amount: number }[];
      },
    );
  } catch (e) {
    if (e instanceof RefundError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  return NextResponse.json(refund, { status: 201 });
});