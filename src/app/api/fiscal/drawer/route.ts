import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { appendFiscalEvent } from "@/lib/services/fiscal";
import { getSettings } from "@/lib/services/settings";

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
    return NextResponse.json(
      { ok: true, sequence: ev.sequence, hash: ev.hash, timestamp: ev.timestamp },
      { status: 201 },
    );
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
