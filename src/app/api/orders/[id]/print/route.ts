import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams } from "@/lib/api-handler";
import { getSettings } from "@/lib/services/settings";
import { printReceiptText } from "@/lib/services/printer";

/**
 * POST /api/orders/[id]/print — print the ticket for a completed sale.
 *
 * This is the *first* print of a receipt, not a reprint: it emits no fiscal
 * event, because the sale is already journalled as a VENTE and the ticket is
 * part of that transaction. Printing the same ticket again goes through
 * /api/orders/[id]/reprint, which does write a REIMPRESSION event.
 *
 * Called after the checkout has committed, and deliberately never fails the
 * sale: a printer problem comes back as `printed: false` with a message for
 * the cashier, who can retry from the order's reprint button.
 */
export const POST = withAuthParams(async (_req, { params }) => {
  const orderId = params.id;

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { receipt: true, payments: { select: { method: true } } },
  });

  if (!order) {
    return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  }
  if (!order.receipt) {
    return NextResponse.json({ error: "Aucun reçu trouvé pour cette commande." }, { status: 404 });
  }

  // Whether the drawer opens is decided here, from the order's own payments —
  // never from the request body. A client that could ask for a drawer kick on
  // demand would be a till-control hole.
  const settings = await getSettings();
  const paidWithCash = order.payments.some((p) => p.method === "CASH");
  const openDrawer = paidWithCash && settings.openDrawerOnCash !== false;

  const outcome = await printReceiptText(order.receipt.content, { openDrawer });

  // Record what actually happened. PENDING receipts that never printed stay
  // visible as FAILED so a shift's unprinted tickets can be found later.
  if (outcome.ok) {
    await db.receipt.update({
      where: { id: order.receipt.id },
      data: { printStatus: "PRINTED", printedAt: new Date() },
    });
  } else if (outcome.reason === "FAILED") {
    await db.receipt.update({
      where: { id: order.receipt.id },
      data: { printStatus: "FAILED" },
    });
  }

  return NextResponse.json(
    {
      printed: outcome.ok,
      drawerOpened: outcome.ok && openDrawer,
      ...(outcome.ok ? {} : { reason: outcome.reason, message: outcome.message }),
    },
    { status: 200 },
  );
});
