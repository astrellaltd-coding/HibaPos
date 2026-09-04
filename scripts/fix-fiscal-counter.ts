#!/usr/bin/env bun
/**
 * Fiscal counter repair — sync FiscalCounter UP to its tables (L-38, Batch 4.5).
 *
 * WHAT THIS IS FOR
 * ----------------
 * The singleton `FiscalCounter` row hands out receipt, shift and Z-report
 * numbers. If it falls BEHIND the rows that already exist — a counter reset,
 * a restore from a snapshot older than the orders around it — then the next
 * sale tries to reuse a number and hits the unique constraint. This script
 * repairs that by raising each counter to `max(number)` of its table.
 *
 * WHAT CHANGED IN BATCH 4.5 (L-38)
 * --------------------------------
 * It used to write those maxima in unconditionally, which made it a rewind
 * as well as a repair. Run after anything that REMOVED rows — a bad restore,
 * or the `port-real-data.ts` wipe this batch deleted — it lowered the
 * counters instead, to 0 against empty tables. The next genuine sale would
 * then print a receipt number already sealed into the fiscal journal, and
 * the duplicate would only surface later.
 *
 * The plan's Batch 4.3 record stated that "a script that wipes users and
 * orders cannot rewind FiscalCounter". That was true of the scripts it was
 * looking at and false of this one. It is now true of this one too.
 *
 * The rule is in `src/lib/services/fiscal-counter-floor.ts`, with its own
 * tests: a counter may be raised or left alone, never lowered. Refusing
 * rather than clamping is deliberate — a counter ABOVE its tables means rows
 * were destroyed, and aligning the counter down would hide that.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 *   bun scripts/fix-fiscal-counter.ts            # report only
 *   bun scripts/fix-fiscal-counter.ts --apply    # write
 *
 * Idempotent: once synced, running it again changes nothing.
 */
import { PrismaClient } from "@prisma/client";
import {
  counterRegressions,
  describeCounterRegressions,
  type FiscalCounterFields,
} from "../src/lib/services/fiscal-counter-floor";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(
    APPLY
      ? "\n  === RÉPARATION DU COMPTEUR FISCAL (écriture) ==="
      : "\n  === SIMULATION — aucune écriture (ajoutez --apply) ===",
  );

  const [orderMax, shiftMax, zMax, eventMax] = await Promise.all([
    db.order.aggregate({ _max: { number: true } }).then((r) => r._max.number ?? 0),
    db.shift.aggregate({ _max: { number: true } }).then((r) => r._max.number ?? 0),
    db.zReport.aggregate({ _max: { number: true } }).then((r) => r._max.number ?? 0),
    db.fiscalEvent.aggregate({ _max: { sequence: true } }).then((r) => r._max.sequence ?? 0),
  ]);

  const proposed = {
    lastReceiptNumber: orderMax,
    lastShiftNumber: shiftMax,
    lastZReportNumber: zMax,
    lastFiscalEventSequence: eventMax,
  } satisfies FiscalCounterFields;

  const existing = await db.fiscalCounter.findUnique({ where: { id: "singleton" } });

  // A missing row is the one case with nothing to regress against, so the
  // maxima can be written straight in. Note this creates it AT the maxima
  // and not at 0 — creating at 0 beside populated tables is exactly the
  // rewind this batch closed on `init-fiscal-counter.ts`.
  const current: FiscalCounterFields = existing
    ? {
        lastReceiptNumber: existing.lastReceiptNumber,
        lastShiftNumber: existing.lastShiftNumber,
        lastZReportNumber: existing.lastZReportNumber,
        lastFiscalEventSequence: existing.lastFiscalEventSequence,
      }
    : { lastReceiptNumber: 0, lastShiftNumber: 0, lastZReportNumber: 0, lastFiscalEventSequence: 0 };

  console.log(
    existing
      ? "\n  Compteur actuel / maximum des tables :\n"
      : "\n  Aucune ligne FiscalCounter — elle sera créée aux maximums des tables :\n",
  );
  for (const field of Object.keys(proposed) as (keyof FiscalCounterFields)[]) {
    const from = current[field];
    const to = proposed[field];
    const verb = to > from ? "RELÈVE" : to < from ? "ABAISSE" : "inchangé";
    console.log(`    ${field.padEnd(26)} ${String(from).padStart(6)} -> ${String(to).padStart(6)}   ${verb}`);
  }

  // --- the floor (L-38) -----------------------------------------------------
  const regressions = counterRegressions(current, proposed);
  if (regressions.length > 0) {
    console.error("\n" + describeCounterRegressions(regressions) + "\n");
    process.exitCode = 1;
    return;
  }

  const raised = (Object.keys(proposed) as (keyof FiscalCounterFields)[]).filter(
    (f) => proposed[f] > current[f],
  );

  if (raised.length === 0) {
    console.log("\n  Le compteur est déjà synchronisé. Rien à réparer.\n");
    return;
  }

  if (!APPLY) {
    console.log("\n  Rien n'a été écrit. Relancez avec --apply pour appliquer.\n");
    return;
  }

  const counter = await db.fiscalCounter.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...proposed },
    // Only the fields that go UP are written. A field left alone cannot be
    // lowered by a concurrent increment landing between the read and this
    // write — the app's own `nextReceiptNumber` uses atomic `increment`.
    update: Object.fromEntries(raised.map((f) => [f, proposed[f]])),
  });

  console.log("\n  ✓ Compteur fiscal synchronisé :", {
    lastReceiptNumber: counter.lastReceiptNumber,
    lastShiftNumber: counter.lastShiftNumber,
    lastZReportNumber: counter.lastZReportNumber,
    lastFiscalEventSequence: counter.lastFiscalEventSequence,
  });
  console.log("");
}

main()
  .catch((e) => {
    console.error("\n  ÉCHEC :", e instanceof Error ? e.message : e, "\n");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
