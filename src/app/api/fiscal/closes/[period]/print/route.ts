import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/services/settings";
import { printReceiptText } from "@/lib/services/printer";
import { renderDayCloseTicket } from "@/lib/services/day-close-ticket";
import { audit } from "@/lib/services/audit";

// POST /api/fiscal/closes/[period]/print — L-98 (R9.1).
//
// THE FINDING. « The Z report and the daily close have no print path at all. »
// `renderDayCloseTicket` was called in exactly one place — inside a `<pre>` on
// the fiscal screen — and `printReceiptText` had exactly two callers, both
// order tickets. Ctrl+P on that screen produced a **blank page**, because
// `globals.css` hides `body *` in print media and shows only `#receipt-print`,
// which the fiscal screen does not have. So « the slip the operator files with
// the books » could be read and never printed, by any route.
//
// THE OPERATOR SETTLED IT on 2026-09-13: the slip needs to print. That decision
// also unblocked **L-88** — the give-away figures `DailyClose` seals but the
// document did not carry — which is fixed in `day-close-ticket.ts` in the same
// batch, because a line missing from a document nobody can print is a different
// problem from one missing from a document they file.
//
// ── WHY A ROUTE AND NOT `window.print()` ────────────────────────────────────
// The same argument L-97 settles for the customer's ticket: the browser path
// re-renders, and a re-rendering drifts. This sends the SAME text the screen
// shows, produced by the same function from the same sealed row, down the same
// ESC/POS transport the order tickets use — so there is one document and one
// way it reaches paper.
//
// The drawer is deliberately NOT opened: a close is not a tender, and
// `orders/[id]/reprint` already establishes that a document reprint must not
// become an untraced way to open the till.
export const POST = withAuthParams(
  async (_req, { user, params }) => {
    const close = await db.dailyClose.findUnique({ where: { period: params.period } });
    if (!close) {
      return NextResponse.json({ error: "Clôture introuvable." }, { status: 404 });
    }

    const settings = await getSettings();
    const content = renderDayCloseTicket(close, {
      restaurantName: settings.restaurantName,
      receiptWidth: settings.receiptWidth,
      factice: settings.factice,
    });

    const outcome = await printReceiptText(content);

    // Journalled either way, and in three states rather than two — the same
    // distinction L-143 settled for `Receipt.printStatus` in this batch, made
    // here for the same reason:
    //
    //   PRINTED  the slip reached the printer
    //   FAILED   it was ATTEMPTED and did not
    //   SKIPPED  it was never attempted — printing is off, or no printer is
    //            configured. Nothing is wrong, and an audit trail that calls
    //            that a failure teaches its reader to ignore the failures.
    //
    // A slip the operator believes they printed and did not is the shape L-96
    // is about, and this log is where « did it actually go » is answered
    // afterwards, so the three must stay distinguishable.
    const action = outcome.ok
      ? "DAY_CLOSE_TICKET_PRINTED"
      : outcome.reason === "FAILED"
        ? "DAY_CLOSE_TICKET_PRINT_FAILED"
        : "DAY_CLOSE_TICKET_PRINT_SKIPPED";
    await audit(
      action,
      "DailyClose",
      close.id,
      { period: close.period, ...(outcome.ok ? {} : { reason: outcome.reason }) },
      user.id,
    );

    if (!outcome.ok) {
      return NextResponse.json(
        { printed: false, reason: outcome.reason, message: outcome.message },
        // 200, not an error status: the caller asked whether it printed and is
        // being told. `orders/[id]/print` answers the same shape for the same
        // reason — a printer that is off is not a bad request.
        { status: 200 },
      );
    }

    return NextResponse.json({ printed: true });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
