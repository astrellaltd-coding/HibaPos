import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { appendFiscalEvent } from "@/lib/services/fiscal";
import { getSettings } from "@/lib/services/settings";
import { openCashDrawer } from "@/lib/services/printer";

// POST /api/fiscal/drawer — trace a manual cash-drawer open (cash drop, count,
// payout). Required by ISCA: "ouverture de tiroir" must appear in the JFP.
export const POST = withAuth(
  async (req, { user }) => {
    const body = (await parseJson(req).catch(() => null)) as { reason?: string } | null;
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 280) : null;
    const settings = await getSettings();
    const ev = await db.$transaction((tx) =>
      appendFiscalEvent(tx, {
        type: "OUVERTURE_TIROIR",
        userId: user.id,
        factice: settings.factice ?? false,
        data: { cashierId: user.id, cashierName: user.name, reason },
      }),
    );
    // Journal first, kick second (C-03, Batch 1.3). The fiscal record of an
    // "ouverture de tiroir" must exist whether or not the solenoid fires —
    // and a drawer opened by hand while the printer is offline is exactly
    // the case the JFP needs to capture. So a printing failure is reported
    // alongside a successful, already-committed event, never instead of it.
    const drawer = await openCashDrawer();

    return NextResponse.json(
      {
        ok: true,
        sequence: ev.sequence,
        hash: ev.hash,
        timestamp: ev.timestamp,
        drawer: drawer.ok
          ? { opened: true }
          : { opened: false, reason: drawer.reason, message: drawer.message },
      },
      { status: 201 },
    );
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
