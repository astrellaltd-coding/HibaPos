import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";

export const GET = withAuth(async () => {
  const shift = await db.shift.findFirst({
    where: { status: "OPEN" },
    orderBy: { openedAt: "desc" },
    include: {
      openedBy: { select: { name: true, username: true } },
      closedBy: { select: { name: true, username: true } },
    },
  });
  return NextResponse.json(shift);
});
