import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { listWindowsPrinters } from "@/lib/services/printer-transport";

/**
 * GET /api/print/printers — the print queues Windows can see (Batch 1.3d, L-70).
 *
 * Feeds the picker in Réglages. It exists because NOBODY KNOWS WHAT THE
 * PRINTER WILL BE CALLED until its driver is installed on the till: the
 * operator opens Réglages at the commissioning session and chooses from this
 * list. A typed queue name would be a silent misconfiguration — the spooler
 * simply refuses a name that is one character out, and the symptom is "nothing
 * printed", which is the least diagnosable failure this application has.
 *
 * Read-only, and it changes nothing: it shells out to `print-raw.ps1 -List`.
 * On a non-Windows host the helper cannot run and the list comes back empty,
 * which the form renders as "no printer found" rather than as an error.
 */
export const GET = withAuth(
  async () => {
    const printers = await listWindowsPrinters().catch(() => [] as string[]);
    return NextResponse.json({ printers }, { status: 200 });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
