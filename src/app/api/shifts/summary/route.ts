import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";

export const GET = withAuth(async () => {
  // The business invariant is ONE open shift at a time (see POST /api/shifts'
  // 409 guard). Query the open shift itself rather than filtering by the
  // caller — previously any cashier other than the shift opener got a 404
  // on a shared till.
  const shift = await db.shift.findFirst({
    where: { status: "OPEN" },
    orderBy: { openedAt: "desc" },
    include: {
      openedBy: { select: { name: true } },
      orders: {
        include: { items: true, payments: true },
      },
    },
  });

  if (!shift) {
    return NextResponse.json({ error: "Aucune caisse ouverte." }, { status: 404 });
  }

  const orders = shift.orders;
  const completedOrders = orders.filter((o) => o.status === "COMPLETED");
  const refundedOrders = orders.filter((o) => o.status === "REFUNDED");
  const cancelledOrders = orders.filter((o) => o.status === "CANCELLED");

  const summary = {
    shiftId: shift.id,
    shiftNumber: shift.number,
    openedAt: shift.openedAt,
    openedBy: shift.openedBy?.name ?? null,
    openingFloat: shift.openingFloat,
    totalOrders: orders.length,
    completedOrders: completedOrders.length,
    refundedOrders: refundedOrders.length,
    cancelledOrders: cancelledOrders.length,
    subtotal: completedOrders.reduce((s, o) => s + o.subtotal, 0),
    discountTotal: completedOrders.reduce((s, o) => s + (o.discountTotal ?? 0), 0),
    vatTotal: completedOrders.reduce((s, o) => s + o.vatTotal, 0),
    total: completedOrders.reduce((s, o) => s + o.total, 0),
    payments: {
      CASH: completedOrders.reduce(
        (s, o) => s + o.payments.filter((p) => p.method === "CASH").reduce((ps, p) => ps + p.amount, 0),
        0
      ),
      CARD: completedOrders.reduce(
        (s, o) => s + o.payments.filter((p) => p.method === "CARD").reduce((ps, p) => ps + p.amount, 0),
        0
      ),
      VOUCHER: completedOrders.reduce(
        (s, o) => s + o.payments.filter((p) => p.method === "VOUCHER").reduce((ps, p) => ps + p.amount, 0),
        0
      ),
    },
    refundedTotal: refundedOrders.reduce((s, o) => s + o.total, 0),
  };

  return NextResponse.json(summary);
});
