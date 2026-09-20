import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { shiftOpenSchema } from "@/lib/validation";
import { nextShiftNumber } from "@/lib/services/sequence";
import { audit } from "@/lib/services/audit";
import { TX_FISCAL } from "@/lib/tx-options";
import { getSettings } from "@/lib/services/settings";
import { appendFiscalEvent } from "@/lib/services/fiscal";
import {
  earliestUnsealedDayWithActivity,
  unsealedDayRefusal,
  forceNotPermittedRefusal,
  FORCE_OPEN_EVENT,
} from "@/lib/services/trading-day-guard";

export const GET = withAuth(async () => {
  const shifts = await db.shift.findMany({
    orderBy: { openedAt: "desc" },
    take: 50,
    include: {
      openedBy: { select: { name: true, username: true } },
      closedBy: { select: { name: true, username: true } },
    },
  });
  return NextResponse.json(shifts);
});

/** Thrown inside the open transaction when a till is already open (L-45). */
class ShiftAlreadyOpenError extends Error {}

export const POST = withAuth(async (req, { user }) => {
  const body = await parseJson(req);
  const parsed = shiftOpenSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalide" }, { status: 400 });
  }

  // L-45 (Batch 7.4c) — the C-15 shape at a fourth site.
  //
  // The single-open-till guard used to run BEFORE the transaction that creates
  // the shift, so two concurrent opens could both pass it and both create one.
  // Batch 4.7 closed this exact shape three times — the checkout, the Z report
  // and the refund — and did not name this one; Batch 5.5's cash movements
  // resolve the same question INSIDE their own transaction, which is why they
  // added no exposure. Fixed the same way: the guard is read inside the
  // transaction that acts on it, so the second opener sees the first's row or
  // is serialised behind it.
  //
  // Latent when found and still latent: nothing has ever produced two open
  // tills, and the restaurant has one operator. It matters slightly more since
  // Batch 5.3, because "the current open till" is now what a refund is
  // attributed to.
  // L-99 / L-228 — A DAY THAT RECORDED OPERATIONS AND IS NOT SEALED BLOCKS THE
  // NEXT CAISSE.
  //
  // WHAT THIS IS FOR: on 2026-09-19 the France caisse was found open for about
  // 48 hours, and the half nobody had noticed is that no day could be sealed at
  // all meanwhile — `assertNoOpenShift` refuses every close while a caisse is
  // open. The operator's decision of 2026-09-20 is that the till should stop
  // rather than warn: the cashier meets this at 11:30, seals yesterday with one
  // tap, and trades.
  //
  // A QUIET DAY DOES NOT BLOCK. The rule looks for an order, a cash movement or
  // a refund — the same three `assertDaySequence` seals in order — so a Monday
  // the restaurant was closed has nothing to seal and nothing accumulates.
  //
  // READ OUTSIDE THE TRANSACTION, deliberately, unlike the already-open check
  // below. That one is a race (L-45: two opens could both pass it); this one is
  // not — a day cannot become sealed or unsealed by a concurrent request on a
  // single-operator till, and the cost of being wrong is a refusal the operator
  // retries, not two caisses.
  const settings = await getSettings();
  const blockingDay = await earliestUnsealedDayWithActivity(
    new Date(),
    settings.businessDayCutoffHour,
    db,
  );

  if (blockingDay) {
    // THE ESCAPE, and its two conditions are the whole of its safety.
    //
    // B and C can stop a restaurant selling, and if the seal itself fails —
    // an out-of-sequence day, a crash between the Z and the close — the
    // alternative to an escape is a till that takes no order until somebody
    // reaches a developer. The operator chose the escape on 2026-09-20: only a
    // SUPER_ADMIN may take it, and taking it goes into the fiscal journal.
    //
    // `force` from a MANAGER is refused rather than ignored. Silently dropping
    // it would tell the caller the day was sealed when it was not.
    if (!parsed.data.force) {
      return NextResponse.json(
        { error: unsealedDayRefusal(blockingDay), unsealedDay: blockingDay, canForce: user.role === "SUPER_ADMIN" },
        { status: 409 },
      );
    }
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: forceNotPermittedRefusal }, { status: 403 });
    }
  }

  let shift;
  try {
    shift = await db.$transaction(async (tx) => {
      const open = await tx.shift.findFirst({ where: { status: "OPEN" } });
      if (open) throw new ShiftAlreadyOpenError();
      const number = await nextShiftNumber(tx);
      const created = await tx.shift.create({
        data: {
          number,
          status: "OPEN",
          openedById: user.id,
          openingFloat: parsed.data.openingFloat,
          notes: parsed.data.notes ?? null,
        },
        include: { openedBy: { select: { name: true, username: true } } },
      });
      // Journalled INSIDE the transaction that creates the caisse, so the
      // journal cannot hold a forced open for a caisse that was never made,
      // nor a caisse whose forcing left no trace. The same rule
      // `appendFiscalEvent`'s own header states.
      if (blockingDay) {
        await appendFiscalEvent(tx, {
          type: FORCE_OPEN_EVENT,
          userId: user.id,
          factice: settings.factice ?? false,
          shiftId: created.id,
          data: { shiftNumber: created.number, unsealedDay: blockingDay },
        });
      }
      return created;
    }, TX_FISCAL);
  } catch (e) {
    if (e instanceof ShiftAlreadyOpenError) {
      // The same 409 and the same message as before: the refusal an operator
      // reads has not changed, only where it is decided.
      return NextResponse.json(
        { error: "Une caisse est déjà ouverte. Clôturez-la d'abord." },
        { status: 409 },
      );
    }
    throw e;
  }
  await audit(
    "SHIFT_OPENED",
    "Shift",
    shift.id,
    {
      number: shift.number,
      openingFloat: parsed.data.openingFloat,
      // L-228: null on every ordinary open, so a forced one is findable in the
      // audit log by a query rather than by reading every row.
      forcedOverUnsealedDay: blockingDay ?? null,
    },
    user.id,
  );
  return NextResponse.json(shift, { status: 201 });
});
