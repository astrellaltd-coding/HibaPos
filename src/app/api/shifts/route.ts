import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { shiftOpenSchema } from "@/lib/validation";
import { nextShiftNumber } from "@/lib/services/sequence";
import { audit } from "@/lib/services/audit";
import { TX_FISCAL } from "@/lib/tx-options";

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
  let shift;
  try {
    shift = await db.$transaction(async (tx) => {
      const open = await tx.shift.findFirst({ where: { status: "OPEN" } });
      if (open) throw new ShiftAlreadyOpenError();
      const number = await nextShiftNumber(tx);
      return tx.shift.create({
        data: {
          number,
          status: "OPEN",
          openedById: user.id,
          openingFloat: parsed.data.openingFloat,
          notes: parsed.data.notes ?? null,
        },
        include: { openedBy: { select: { name: true, username: true } } },
      });
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
  await audit("SHIFT_OPENED", "Shift", shift.id, { number: shift.number, openingFloat: parsed.data.openingFloat }, user.id);
  return NextResponse.json(shift, { status: 201 });
});
