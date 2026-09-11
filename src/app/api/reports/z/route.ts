import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { z } from "zod";
import { generateZReport, ZReportError } from "@/lib/services/reports";
import { audit } from "@/lib/services/audit";

const zReportPostSchema = z.object({
  shiftId: z.string().min(1, "shiftId requis"),
  closingFloat: z.number().int().min(0, "closingFloat requis (en centimes)"),
});

// Z reports are immutable fiscal close-out records with full financial
// history (cash variance, VAT breakdowns) — manager-level data. The UI
// restricts them to MANAGER+ (nav-config); this gate enforces it server-side.
// (Note: closing a shift is deliberately open to any authenticated role —
// POST /api/shifts/[id]/close declares no roles — while listing historical Z
// reports is not. That asymmetry was a cashier-era business rule; Batch 4.4b
// removed the role and left the asymmetry alone, because widening or
// narrowing it is a business decision, not a consequence of DD-07.)
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
      refundsTotal: z.refundsTotal,
      refundsCount: z.refundsCount,
      openingFloat: z.openingFloat,
      expectedCash: z.expectedCash,
      closingFloat: z.closingFloat,
      cashVariance: z.cashVariance,
      vatBreakdown: JSON.parse(z.vatBreakdownJson ?? "{}"),
      topProducts: JSON.parse(z.topProductsJson ?? "[]"),
      // L-83 (R7.1). `ZReportDto` has declared these three since Batch 7.4a and
      // this map sent none of them, so `report.givenAwayCount` was `undefined`
      // on the client — and `GivenAway` opens `if (!count) return null`, which
      // `undefined` satisfies. The block was therefore absent from every Z
      // report and nothing ever threw. Read back from the columns R7.1 seals,
      // NOT recomputed from the orders: the row is the document.
      //
      // `?? 0` / `?? "[]"` reads a null as « nothing », the same fallback
      // `topProducts` uses one line above. No row can carry null — the columns
      // were added when zero `ZReport` rows existed and `generateZReport` has
      // written all three ever since — so the fallback is a type guarantee for
      // the DTO's `number`, not a figure anyone will ever see.
      givenAwayCount: z.givenAwayCount ?? 0,
      givenAwayItemsCount: z.givenAwayItemsCount ?? 0,
      givenAwayProducts: JSON.parse(z.givenAwayProductsJson ?? "[]"),
      shift: z.shift,
    })),
  );
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);

export const POST = withAuth(
  async (req, { user }) => {
    const body = (await parseJson(req)) as Record<string, unknown> | null;
    const parsed = zReportPostSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalide" },
        { status: 400 },
      );
    }
    const { shiftId, closingFloat } = parsed.data;
    // C-15 (Batch 4.7): before this batch nothing here caught the duplicate-Z
    // guard, so closing an already-closed shift through this route answered
    // 500 with a stack trace while the same refusal through
    // `POST /api/shifts/[id]/close` answered 400. Both now answer 409.
    let result;
    try {
      result = await generateZReport(shiftId, closingFloat, user.id);
    } catch (e) {
      if (e instanceof ZReportError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
    await audit("REPORT_Z_GENERATED", "ZReport", result.z.id, { shiftId }, user.id);
    return NextResponse.json(result);
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
