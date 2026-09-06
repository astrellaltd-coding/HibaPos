import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import {
  verifyFiscalChain,
  verifyDailyCloses,
  verifyMonthlyCloses,
  verifyAnnualCloses,
  diagnoseChainKey,
} from "@/lib/services/fiscal";
import { isChainKeyed } from "@/lib/fiscal-key";
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
    // DD-25 (Batch 3.9): when the journal does not verify, say whether the key
    // explains it. A missing key and a rewritten record look identical here,
    // and reporting the first as the second sends someone hunting a fraud that
    // did not happen. `keyed` reports only WHETHER a key is configured — never
    // the key, and never a fragment of it.
    const keyDiagnosis = events.ok ? null : await diagnoseChainKey();
    return NextResponse.json({
      software: { name: SOFTWARE_NAME, version: SOFTWARE_VERSION },
      chainKeyed: isChainKeyed(),
      fiscalEvents: { ...events, total: eventCount },
      ...(keyDiagnosis ? { keyDiagnosis } : {}),
      dailyCloses: daily,
      monthlyCloses: monthly,
      annualCloses: annual,
      grandTotal,
    });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
