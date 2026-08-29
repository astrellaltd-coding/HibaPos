import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { shiftOpenSchema } from "@/lib/validation";
import { nextShiftNumber } from "@/lib/services/sequence";
import { audit } from "@/lib/services/audit";

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

export const POST = withAuth(async (req, { user }) => {
  // Open a new shift. Only one open shift at a time.
  const open = await db.shift.findFirst({ where: { status: "OPEN" } });
  if (open) {
    return NextResponse.json(
      { error: "Une caisse est déjà ouverte. Clôturez-la d'abord." },
      { status: 409 },
    );
  }
  const body = await parseJson(req);
  const parsed = shiftOpenSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalide" }, { status: 400 });
  }
  const shift = await db.$transaction(async (tx) => {
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
    return created;
  });
  await audit("SHIFT_OPENED", "Shift", shift.id, { number: shift.number, openingFloat: parsed.data.openingFloat }, user.id);
  return NextResponse.json(shift, { status: 201 });
});
