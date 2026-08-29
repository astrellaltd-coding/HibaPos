import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams } from "@/lib/api-handler";

export const GET = withAuthParams(async (_req, { params }) => {
  const order = await db.order.findUnique({
    where: { id: params.id },
    include: {
      items: true,
      payments: true,
      cashier: { select: { name: true, username: true } },
      customer: { select: { name: true } },
      shift: { select: { number: true } },
      refunds: { include: { cashier: { select: { name: true } } } },
    },
  });
  if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  return NextResponse.json(order);
});
