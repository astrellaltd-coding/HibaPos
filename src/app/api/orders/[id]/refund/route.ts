import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams, parseJson } from "@/lib/api-handler";
import { refundSchema } from "@/lib/validation";
import { consumeStepUpToken } from "@/lib/services/step-up";
import {
  processRefund,
  RefundError,
  NO_OPEN_SHIFT_FOR_REFUND_MESSAGE,
} from "@/lib/services/refund";
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
  // C-14 / DD-10 (Batch 5.3). This refused any order whose own shift was
  // CLOSED, so a customer returning the next day could not be refunded at all
  // and the workaround was cash out of the drawer with no record. The refusal
  // that replaces it is the opposite question: not "is the sale's till still
  // open" but "is there a till open to pay this out of". Kept as a PRE-check,
  // ahead of the step-up token below, so a refund attempted with no caisse
  // open does not burn the operator's single-use PIN token (cf. L-41). The
  // decisive check is the same one inside `processRefund`'s transaction, where
  // a Z close committing beside this request cannot slip past it.
  const openShift = await db.shift.findFirst({
    where: { status: "OPEN" },
    select: { id: true },
  });
  if (!openShift) {
    return NextResponse.json({ error: NO_OPEN_SHIFT_FOR_REFUND_MESSAGE }, { status: 409 });
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

  // Step-up PIN — DD-19, Batch 4.4c. EVERY refund, at any amount, with no
  // threshold (operator decision, 2026-09-04). The caller must have re-entered
  // their own PIN at `/api/auth/step-up` and must present the single-use token
  // it issued, bound to (this caller, REFUND, this exact cent amount).
  //
  // This REPLACES two arms that stood here. The `approvalToken` arm verified a
  // *manager's* approval from `/api/auth/approve`; with one operational role
  // (DD-07) that route forbids self-approval and can never succeed, which is
  // exactly why a lone manager could not refund through the UI at all (M-18 —
  // closed here by the operator's decision, rather than in Batch 5.7). The
  // else-branch self-approved at any amount with no keystroke, which is the
  // gap DD-19 was answered to close.
  //
  // The role check the old arm performed is not reproduced: the token names
  // the caller, `withAuthParams` already established their session, and the
  // product has no role below MANAGER to exclude.
  const stepUp = await consumeStepUpToken({
    token: parsed.data.stepUpToken,
    callerId: user.id,
    action: "REFUND",
    amount: parsed.data.amount,
  });
  if (!stepUp.ok) {
    return NextResponse.json({ error: stepUp.message }, { status: stepUp.status });
  }
  const refundApproverId: string | null = stepUp.approverId;

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
        number: number;
        total: number;
        status: "COMPLETED" | "REFUNDED";
        orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON";
        tableLabel: string | null;
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