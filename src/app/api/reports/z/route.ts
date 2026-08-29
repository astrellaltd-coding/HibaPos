import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { generateZReport } from "@/lib/services/reports";
import { audit } from "@/lib/services/audit";

// Z reports are immutable fiscal close-out records with full financial
// history (cash variance, VAT breakdowns) — manager-level data. The UI
// restricts them to MANAGER+ (nav-config); this gate enforces it server-side.
// (Note: closing a shift is allowed for CASHIER per business rules, but
// listing historical Z reports is not.)
export const GET = withAuth(
  async () => {
  const reports = await db.zReport.findMany({
    orderBy: { generatedAt: "desc" },
    take: 100,
    include: {
      shift: {
        include: {
          openedBy: { select: { name: true, username: true } },
          closedBy: { select: { name: true, username: true } },
        },
      },
    },
  });
  return NextResponse.json(
    reports.map((z) => ({
      id: z.id,
      number: z.number,
      shiftId: z.shiftId,
      generatedAt: z.generatedAt,
      salesTotal: z.salesTotal,
      salesCount: z.salesCount,
      vatTotal: z.vatTotal,
      cashTotal: z.cashTotal,
      cardTotal: z.cardTotal,
      voucherTotal: z.voucherTotal,
      discountsTotal: z.discountsTotal,
      openingFloat: z.openingFloat,
      expectedCash: z.expectedCash,
      closingFloat: z.closingFloat,
      cashVariance: z.cashVariance,
      vatBreakdown: JSON.parse(z.vatBreakdownJson ?? "{}"),
      topProducts: JSON.parse(z.topProductsJson ?? "[]"),
      shift: z.shift,
    })),
  );
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);

export const POST = withAuth(
  async (req, { user }) => {
    const body = await parseJson(req) as Record<string, unknown>;
    const shiftId = typeof body.shiftId === "string" ? body.shiftId : "";
    const closingFloat = typeof body.closingFloat === "number" ? body.closingFloat : NaN;
    if (!shiftId || Number.isNaN(closingFloat)) {
      return NextResponse.json({ error: "shiftId et closingFloat requis" }, { status: 400 });
    }
    const result = await generateZReport(shiftId, closingFloat, user.id);
    await audit("REPORT_Z_GENERATED", "ZReport", result.z.id, { shiftId }, user.id);
    return NextResponse.json(result);
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
