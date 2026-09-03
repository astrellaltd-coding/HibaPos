import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams, parseJson } from "@/lib/api-handler";
import { shiftCloseSchema } from "@/lib/validation";
import { generateZReport } from "@/lib/services/reports";
import { audit } from "@/lib/services/audit";
import { createBackup } from "@/lib/services/backup";
import { logTechnical } from "@/lib/services/technical-logger";

export const POST = withAuthParams(async (req, { user, params }) => {
  const shift = await db.shift.findUnique({ where: { id: params.id } });
  if (!shift) return NextResponse.json({ error: "Caisse introuvable" }, { status: 404 });
  if (shift.status === "CLOSED") {
    return NextResponse.json({ error: "Cette caisse est déjà clôturée" }, { status: 409 });
  }
  const body = await parseJson(req);
  const parsed = shiftCloseSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalide" }, { status: 400 });
  }

  let z, report, cashVariance;
  try {
    const result = await generateZReport(shift.id, parsed.data.closingFloat, user.id);
    z = result.z;
    report = result.report;
    cashVariance = result.cashVariance;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur lors de la génération du rapport Z";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Automatic backup after Z report (business rule).
  //
  // C-06, Batch 2.2: this used to swallow the failure into console.error and
  // return 200 regardless, so a restaurant could believe it had been backing
  // up nightly for months and have nothing. The Z report itself must still
  // succeed — it is a sealed fiscal document and a backup problem cannot be
  // allowed to block a shift from closing — but the operator is now told.
  let backup: unknown = null;
  let backupError: string | null = null;
  try {
    backup = await createBackup(user.id);
  } catch (e) {
    backupError = e instanceof Error ? e.message : "Échec de la sauvegarde automatique";
    console.error("[z-report] backup failed", e);
    await logTechnical(
      "ERROR",
      "z-report",
      `Automatic backup after Z report ${z.number} FAILED: ${backupError}`,
    );
    await audit(
      "BACKUP_FAILED",
      "ZReport",
      z.id,
      { zReportNumber: z.number, error: backupError },
      user.id,
    );
  }

  await audit("SHIFT_CLOSED", "Shift", shift.id, { zReportNumber: z.number, cashVariance }, user.id);
  await audit("Z_REPORT_GENERATED", "ZReport", z.id, { number: z.number, shiftId: shift.id }, user.id);

  return NextResponse.json({
    zReport: {
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
    },
    report,
    cashVariance,
    backup,
    backupError,
  });
});
