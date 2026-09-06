import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import {
  verifyFiscalChain,
  verifyDailyCloses,
  verifyMonthlyCloses,
  verifyAnnualCloses,
} from "@/lib/services/fiscal";
import { db } from "@/lib/db";
import { SOFTWARE_NAME, SOFTWARE_VERSION } from "@/lib/version";

// GET /api/fiscal/verify — walk the hash chains and report the first break.
// Used as the ISCA tamper-detection control (inspecteur can request it).
//
// L-53 (Batch 3.7): also states which software, at which version, is running.
// Here and not on `GET /api`, because this route is authenticated (MANAGER+)
// and the liveness probe is deliberately mute about the process (C-27).
export const GET = withAuth(
  async () => {
    const [events, daily, monthly, annual, grandTotal, eventCount] = await Promise.all([
      verifyFiscalChain(),
      // DD-23 (Batch 3.8): the day close is a sealed, chained document like the
      // other two, so the control an inspector may ask for has to walk it too.
      verifyDailyCloses(),
      verifyMonthlyCloses(),
      verifyAnnualCloses(),
      db.grandTotal.findUnique({ where: { id: "singleton" } }),
      db.fiscalEvent.count(),
    ]);
    return NextResponse.json({
      software: { name: SOFTWARE_NAME, version: SOFTWARE_VERSION },
      fiscalEvents: { ...events, total: eventCount },
      dailyCloses: daily,
      monthlyCloses: monthly,
      annualCloses: annual,
      grandTotal,
    });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
