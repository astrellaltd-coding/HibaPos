import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams, parseJson } from "@/lib/api-handler";
import { shiftCloseSchema } from "@/lib/validation";
import { generateZReport, ZReportError } from "@/lib/services/reports";
import { audit } from "@/lib/services/audit";
import { createBackup } from "@/lib/services/backup";
import { logTechnical } from "@/lib/services/technical-logger";
import { pruneLogs } from "@/lib/services/log-retention";
import { getSettings } from "@/lib/services/settings";
import { sealDaysAfterShiftClose, type AutoSealResult } from "@/lib/services/auto-seal";

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
    // C-15 (Batch 4.7): the refusals `generateZReport` decides inside its own
    // transaction now carry their status. The pre-check above still answers
    // the ordinary "already closed" case without opening one; this arm is what
    // a second close racing the first, or a shift closed underneath us, meets.
    if (e instanceof ZReportError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Erreur lors de la génération du rapport Z";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // L-228 — SEAL THE TRADING DAY, now that no caisse is open.
  //
  // BEFORE the backup, deliberately: the automatic backup below is the one the
  // restaurant keeps, and a backup taken after the seal contains the sealed
  // day. Taken before, it would be a copy of the state the operator had just
  // left behind.
  //
  // IT NEVER FAILS THE Z. The Z is already written and sealed; a day that
  // cannot be sealed is reported here and caught by guard C the next morning,
  // when the till refuses to open. That is what guard C is for, and it is why
  // this can afford to be best-effort. Same shape as the backup below.
  const settings = await getSettings();
  let daySeal: AutoSealResult = { sealed: [], failed: null };
  try {
    daySeal = await sealDaysAfterShiftClose({
      now: new Date(),
      cutoffHour: settings.businessDayCutoffHour,
      userId: user.id,
      factice: settings.factice ?? false,
    });
  } catch (e) {
    daySeal = {
      sealed: [],
      failed: { day: "", message: e instanceof Error ? e.message : "Échec de la clôture du jour" },
    };
  }
  if (daySeal.failed) {
    await logTechnical(
      "ERROR",
      "day-seal",
      `Automatic day close after Z report ${z.number} FAILED on ${daySeal.failed.day}: ${daySeal.failed.message}`,
    );
  }
  for (const day of daySeal.sealed) {
    await audit("DAILY_CLOSE_SEALED", "DailyClose", day, { day, viaShiftClose: shift.id }, user.id);
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

  // Housekeeping on the once-a-day hook (M-29, Batch 2.4). Bounded tables
  // only — FiscalEvent is append-only and is never touched.
  await pruneLogs().catch(() => {});

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
      refundsTotal: z.refundsTotal,
      refundsCount: z.refundsCount,
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
    // L-228: which days this close sealed, and the one it could not. The
    // screen reads both — « Journée du 20/09 clôturée » is the confirmation
    // the operator asked for, and a failure has to be visible rather than
    // waiting to surface as a refusal at 11:30 tomorrow.
    daySeal,
  });
});
