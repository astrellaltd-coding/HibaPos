import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { verifyFiscalChain, verifyMonthlyCloses, verifyAnnualCloses } from "@/lib/services/fiscal";
import { db } from "@/lib/db";

// GET /api/fiscal/verify — walk the hash chains and report the first break.
// Used as the ISCA tamper-detection control (inspecteur can request it).
export const GET = withAuth(
  async () => {
    const [events, monthly, annual, grandTotal, eventCount] = await Promise.all([
      verifyFiscalChain(),
      verifyMonthlyCloses(),
      verifyAnnualCloses(),
      db.grandTotal.findUnique({ where: { id: "singleton" } }),
      db.fiscalEvent.count(),
    ]);
    return NextResponse.json({
      fiscalEvents: { ...events, total: eventCount },
      monthlyCloses: monthly,
      annualCloses: annual,
      grandTotal,
    });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
