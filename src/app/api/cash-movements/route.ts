import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { cashMovementSchema } from "@/lib/validation";
import { consumeStepUpToken } from "@/lib/services/step-up";
import { getSettings } from "@/lib/services/settings";
import {
  recordCashMovement,
  requiresStepUp,
  categorySignRefusal,
  CashMovementError,
  NO_OPEN_SHIFT_FOR_MOVEMENT_MESSAGE,
} from "@/lib/services/cash-movement";

// M-05 / DD-12 (Batch 5.5) — entrée / sortie de caisse.

/** The current till's movements, newest first, for the shift panel. */
export const GET = withAuth(
  async (req) => {
    const url = new URL(req.url);
    const shiftId = url.searchParams.get("shiftId");
    const shift = shiftId
      ? await db.shift.findUnique({ where: { id: shiftId }, select: { id: true } })
      : await db.shift.findFirst({
          where: { status: "OPEN" },
          orderBy: { openedAt: "desc" },
          select: { id: true },
        });
    if (!shift) return NextResponse.json([]);
    const movements = await db.cashMovement.findMany({
      where: { shiftId: shift.id },
      orderBy: { createdAt: "desc" },
      include: { cashier: { select: { name: true } } },
    });
    return NextResponse.json(movements);
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);

export const POST = withAuth(
  async (req, { user }) => {
    const body = await parseJson(req);
    const parsed = cashMovementSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalide" },
        { status: 400 },
      );
    }
    const { category, amount, reason, stepUpToken } = parsed.data;

    // Both pre-checks sit ahead of the step-up token, so a movement that can
    // never succeed does not burn the operator's single-use PIN (cf. L-41). The
    // decisive versions of both are inside `recordCashMovement`'s transaction.
    //
    // The sign check is here because of this batch's own walkthrough: a
    // negative APPROVISIONNEMENT needs a PIN under the direction rule and is
    // refused by the service whatever the PIN says, so without this the caller
    // was told « Confirmation par code PIN requise » for a request whose real
    // problem was the sign.
    const signRefusal = categorySignRefusal(category, amount);
    if (signRefusal) {
      return NextResponse.json({ error: signRefusal }, { status: 400 });
    }

    const openShift = await db.shift.findFirst({
      where: { status: "OPEN" },
      select: { id: true },
    });
    if (!openShift) {
      return NextResponse.json(
        { error: NO_OPEN_SHIFT_FOR_MOVEMENT_MESSAGE },
        { status: 409 },
      );
    }

    // The PIN gate, and the whole of the operator's 2026-09-05 answer: money
    // LEAVING the drawer needs the operator's own PIN, money arriving does not.
    // The token is bound to the caller, the action and the exact amount, so a
    // token minted for one payout cannot authorise a larger one. It is bound to
    // the ABSOLUTE amount because `verifyApprovalToken` compares magnitudes and
    // the client has no reason to know the sign convention.
    let approverId: string | null = null;
    if (requiresStepUp(amount)) {
      const stepUp = await consumeStepUpToken({
        token: stepUpToken,
        callerId: user.id,
        action: "CASH_OUT",
        amount: Math.abs(amount),
      });
      if (!stepUp.ok) {
        return NextResponse.json({ error: stepUp.message }, { status: stepUp.status });
      }
      approverId = stepUp.approverId;
    }

    const settings = await getSettings();
    try {
      const movement = await recordCashMovement({
        category,
        amount,
        reason,
        cashierId: user.id,
        approverId,
        factice: settings.factice ?? false,
      });
      return NextResponse.json(movement, { status: 201 });
    } catch (e) {
      if (e instanceof CashMovementError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
