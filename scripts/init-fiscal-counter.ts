#!/usr/bin/env bun
/**
 * Create the FiscalCounter singleton on a fresh database (L-38, Batch 4.5).
 *
 * WHAT THIS IS FOR
 * ----------------
 * `FiscalCounter` is a single row that hands out receipt, shift and Z-report
 * numbers. `prisma db seed` creates it; this script exists to recover from a
 * manually dropped table without re-running the whole seed.
 *
 * WHAT CHANGED IN BATCH 4.5 (L-38)
 * --------------------------------
 * It used to upsert the row at zero unconditionally. On a fresh database
 * that is right. On a database that lost its counter row but KEPT its
 * orders, shifts, Z reports and fiscal journal, creating the row at zero
 * rewinds every counter below numbers already sealed into the journal — the
 * next sale then prints a receipt number that exists twice.
 *
 * The `update: {}` branch was always harmless (it writes nothing to an
 * existing row). The `create:` branch was not, and it is the branch this
 * script is run for.
 *
 * So this script now refuses when the tables are not empty, and points at
 * `fix-fiscal-counter.ts`, whose job is precisely to sync a counter UP to
 * populated tables. One tool per job: this one initialises, that one repairs.
 *
 * It also writes `lastFiscalEventSequence` explicitly. Both scripts used to
 * omit it, letting Prisma's `@default(0)` apply — a fourth counter L-38 does
 * not name, rewound on the same path as the three it does.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 *   bun scripts/init-fiscal-counter.ts            # report only
 *   bun scripts/init-fiscal-counter.ts --apply    # write
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(
    APPLY
      ? "\n  === INITIALISATION DU COMPTEUR FISCAL (écriture) ==="
      : "\n  === SIMULATION — aucune écriture (ajoutez --apply) ===",
  );

  const existing = await db.fiscalCounter.findUnique({ where: { id: "singleton" } });

  if (existing) {
    console.log("\n  La ligne FiscalCounter existe déjà :", {
      lastReceiptNumber: existing.lastReceiptNumber,
      lastShiftNumber: existing.lastShiftNumber,
      lastZReportNumber: existing.lastZReportNumber,
      lastFiscalEventSequence: existing.lastFiscalEventSequence,
    });
    console.log(
      "\n  Rien à faire. Pour synchroniser un compteur en retard sur ses\n" +
        "  tables : bun scripts/fix-fiscal-counter.ts\n",
    );
    return;
  }

  const [orders, shifts, zReports, events] = await Promise.all([
    db.order.count(),
    db.shift.count(),
    db.zReport.count(),
    db.fiscalEvent.count(),
  ]);

  const populated = orders + shifts + zReports + events;

  console.log(
    `\n  Aucune ligne FiscalCounter.\n` +
      `  Tables fiscales : ${orders} commandes, ${shifts} services, ${zReports} rapports Z, ${events} événements.\n`,
  );

  if (populated > 0) {
    // The floor (L-38). Creating at zero here would put every counter below
    // numbers already sealed into the journal.
    console.error(
      "  REFUS : les tables fiscales ne sont pas vides.\n\n" +
        "  Créer le compteur à zéro le placerait SOUS des numéros déjà scellés\n" +
        "  dans le journal fiscal, et le prochain ticket porterait un numéro en\n" +
        "  double. Ce script n'initialise qu'une base vierge.\n\n" +
        "  Utilisez la réparation, qui aligne le compteur SUR les tables :\n" +
        "      bun scripts/fix-fiscal-counter.ts\n" +
        "      bun scripts/fix-fiscal-counter.ts --apply\n",
    );
    process.exitCode = 1;
    return;
  }

  if (!APPLY) {
    console.log(
      "  Base vierge : le compteur serait créé à 0/0/0/0.\n" +
        "  Rien n'a été écrit. Relancez avec --apply pour appliquer.\n",
    );
    return;
  }

  await db.fiscalCounter.create({
    data: {
      id: "singleton",
      lastReceiptNumber: 0,
      lastShiftNumber: 0,
      lastZReportNumber: 0,
      lastFiscalEventSequence: 0,
    },
  });

  console.log("  ✓ FiscalCounter créé à 0/0/0/0.\n");
}

main()
  .catch((e) => {
    console.error("\n  ÉCHEC :", e instanceof Error ? e.message : e, "\n");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
