import { NextResponse } from "next/server";
import { withAuth, parseJson } from "@/lib/api-handler";
import { printTestPage } from "@/lib/services/printer";

/**
 * POST /api/print/test — print the commissioning self-test receipt.
 *
 * This is the operator's hardware tool (C-03, Batch 1.3): it proves the
 * printer is reachable, that the configured column width fits the paper, and
 * that accents and the euro sign render — before the restaurant opens rather
 * than during a service. `openDrawer` also pulses the drawer so the DK-port
 * wiring can be checked in the same step.
 *
 * No fiscal event: a test page is not a ticket and must not enter the JFP.
 */
export const POST = withAuth(
  async (req) => {
    const body = (await parseJson(req).catch(() => null)) as { openDrawer?: boolean } | null;
    const outcome = await printTestPage({ openDrawer: body?.openDrawer === true });

    if (outcome.ok) {
      return NextResponse.json(outcome, { status: 200 });
    }
    // Configuration problems are the caller's to fix; a printer that is
    // configured but unreachable is an upstream failure.
    const status = outcome.reason === "FAILED" ? 502 : 409;
    return NextResponse.json({ ...outcome, error: outcome.message }, { status });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
