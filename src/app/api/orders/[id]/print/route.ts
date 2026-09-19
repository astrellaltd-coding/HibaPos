import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams } from "@/lib/api-handler";
import { getSettings } from "@/lib/services/settings";
import { printReceiptText, type PrinterDeps } from "@/lib/services/printer";
import { printDeliveryNote } from "@/lib/services/delivery-note";

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
/**
 * L-186 — the handler is built rather than declared, so the printer can be
 * injected. `POST` below is the production one, built with no deps, and is
 * what Next imports; nothing else changes.
 *
 * THE FINDING: no test could drive a SUCCESSFUL print through any of the three
 * print routes. Each called `printReceiptText` with no `deps`, so
 * `resolvePrinter` built its own transport from settings — a test could reach
 * `DISABLED` and `NOT_CONFIGURED` and nothing else, because the alternative was
 * a real socket or a real spooler. The branch just below that writes
 * `printStatus: "PRINTED", printedAt: now` — **the branch L-96 was about** —
 * was asserted only as source text, in two test files that said so out loud.
 *
 * `printer.ts` and `printer-spooler.test.ts` already covered the layer BELOW
 * this with an injected transport. What had no cover was the route's own
 * bookkeeping around it, which is the part that writes to the database.
 */
export function createPrintHandler(deps: PrinterDeps = {}) {
  return withAuthParams(async (_req, { params }) => {
    const orderId = params.id;

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        receipt: true,
        payments: { select: { method: true } },
        // L-222: the driver's destination. This route selected the receipt and
        // the payment methods and nothing else, so even a renderer that wanted
        // to print an address had none to print.
        customer: { select: { name: true, phone: true, address: true, city: true } },
      },
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

    const outcome = await printReceiptText(order.receipt.content, { openDrawer }, deps);

    // L-222 — THE BON DE LIVRAISON, a second piece of paper on a delivery.
    //
    // AFTER the receipt and never instead of it: the sealed ticket is the
    // document that matters, and it carries the customer's NAME. This slip
    // carries the telephone number and the address, and is not stored anywhere
    // — the operator's decision of 2026-09-18, so that a customer's home never
    // enters `Receipt.content` and, through it, the annual fiscal archive.
    //
    // `printDeliveryNote` answers `null` when no slip is owed, so the rule
    // « which orders get one » lives in one place and both print routes ask it.
    // Nothing here can fail the receipt or move `printStatus`: a slip that does
    // not come out is a reprint away and the sale is already journalled.
    const deliveryNotePrinted = outcome.ok
      ? await printDeliveryNote(order, settings, deps)
      : null;

    // Record what actually happened — L-143 (R9.1) settled which of the two
    // routes was right, because they disagreed.
    //
    // Three states have to carry four outcomes, so they are read as:
    //
    //   PRINTED  the job reached the printer
    //   FAILED   it was ATTEMPTED and did not
    //   PENDING  it was never attempted — printing is off, or no printer is
    //            configured. Nothing is wrong with the ticket.
    //
    // This route already made that distinction; `reprint` wrote FAILED for any
    // non-ok outcome, so a reprint with printing disabled marked the receipt
    // failed. It now matches this one. **The comment that used to sit here
    // claimed unprinted tickets « stay visible as FAILED so a shift's unprinted
    // tickets can be found later » — they do not, and could not: nothing reads
    // this column.** Zero readers in `.tsx`, three writers. Whether to surface it
    // or drop it is recorded as L-143's remaining half and is not this batch's.
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
        // `null` = no slip was owed; true/false = whether it came out. Three
        // states rather than two, because « there was nothing to print » and
        // « it failed » are different things to tell a cashier (L-143).
        deliveryNote: deliveryNotePrinted,
        ...(outcome.ok ? {} : { reason: outcome.reason, message: outcome.message }),
      },
      { status: 200 },
    );
  });
}

export const POST = createPrintHandler();
