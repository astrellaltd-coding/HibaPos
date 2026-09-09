#!/usr/bin/env bun
/**
 * P-04 / Batch 8.0 — the pre-go-live fiscal reset.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  THIS RUNS ONCE, BEFORE THE RESTAURANT'S FIRST REAL SALE, AND NEVER      ║
 * ║  AFTER ONE. From that sale onwards the fiscal journal is append-only,    ║
 * ║  and clearing it is precisely the deletion `docs/attestation-conformite  ║
 * ║  .md` states is impossible.                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * WHY IT EXISTS. The live database carries development trading created while
 * the app was being built — the restaurant has never run HibaPOS. Opening on
 * that state would make the first genuine receipt **#21**, sitting in a journal
 * behind twenty tickets that never happened, with a grand total that never was.
 * Batch 8.1 measured it: 20 orders, 3 shifts, 2 Z reports, 2 fiscal events,
 * `GrandTotal` 54,80 €. Eighteen of those orders are not even journalled
 * (L-60), so the journal cannot be reconciled against the orders table at all
 * until this runs.
 *
 * WHAT IT DELETES — the operator's decision of 2026-09-03 plus three
 * amendments, each written when the table in question was added:
 *   Order, OrderItem, Payment, Receipt, Refund, Shift, ZReport,
 *   Customer (L-73, 2026-09-09 — the operator asked for clients to go too),
 *   FiscalEvent, DailyClose (3.8), MonthlyClose, AnnualClose,
 *   FiscalArchive (rows AND files), CashMovement (5.5), GrandTotal,
 *   Table (5.2 — the one stale `T1 / Salle` row),
 *   and FiscalCounter is reset to zero.
 *
 * WHAT IT KEEPS, deliberately:
 *   Categories, products, option groups and choices, add-ons, product images,
 *   THE SIX COMPOSED MENUS and their slots, choices and option rules
 *   (L-72, 2026-09-09), users, settings — the catalogue is real work recovered
 *   in commit `0c5ede6`; only the trading is fake.
 *
 *   NOT customers any more: they moved to the delete list on 2026-09-09 at the
 *   operator’s request (L-73), superseding the ruling of 2026-09-03.
 *
 *   AND **AuditLog**, which P-04 does not list and this script does not touch.
 *   468 rows of development history stay. Deleting an audit trail is the exact
 *   thing this application forbids everywhere else, and the audit log is not
 *   fiscal data — the fiscal journal is, and that is what is being reset. Same
 *   for `TechnicalLog`, `Session` and `Backup`: operational, not fiscal.
 *
 * USAGE
 *   bun scripts/pre-golive-reset.ts                 # dry run, changes nothing
 *   bun scripts/pre-golive-reset.ts --apply         # asks for confirmation
 *   bun scripts/pre-golive-reset.ts --apply --yes   # rehearsal only, no prompt
 *
 * `--yes` exists so this can be rehearsed unattended on a scratch copy. It is
 * refused unless DATABASE_URL points somewhere obviously disposable, so it
 * cannot be used to skip the prompt on the real till.
 */
import { db } from "@/lib/db";
import { fiscalArchivesDir } from "@/lib/paths";
import { fiscalChainKey } from "@/lib/fiscal-key";
import { promises as fs, existsSync } from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");
const ASSUME_YES = process.argv.includes("--yes");

const RED = "\x1b[31m";
const YEL = "\x1b[33m";
const GRN = "\x1b[32m";
const DIM = "\x1b[2m";
const OFF = "\x1b[0m";

function fail(message: string): never {
  console.error(`\n${RED}  REFUS : ${message}${OFF}\n`);
  process.exit(1);
}

/** Everything this script clears, in foreign-key-safe order.
 *
 *  `Order.shiftId` is `onDelete: Restrict`, so orders must go before shifts —
 *  Batch 3.8 hit exactly this and it turned seven unrelated tests red. The
 *  child rows are cascades of Order, but they are deleted explicitly anyway so
 *  the before/after report can name each count (hard constraint 4). */
const DELETION_ORDER = [
  "Receipt",
  "OrderItem",
  "Payment",
  "Refund",
  "Order",
  // L-73 (Batch 8.0, 2026-09-09): the operator asked for « clients » to go
  // with the sales. AFTER "Order", never before: Customer is the parent of
  // Order.customerId and deleting it first is an FK violation, not a cascade.
  "Customer",
  "ZReport",
  "CashMovement",
  "Shift",
  "FiscalEvent",
  "DailyClose",
  "MonthlyClose",
  "AnnualClose",
  "FiscalArchive",
  "GrandTotal",
  "Table",
] as const;

/** Named so the report can prove they were left alone. */
const PRESERVED = [
  "User",
  "Category",
  "Product",
  "OptionGroup",
  "OptionChoice",
  "CategoryOptionGroup",
  "CategoryOptionChoice",
  "CategoryAddOn",
  // L-72 (Batch 8.0, 2026-09-09): the three combo tables postdate this script
  // (Batch 5.9) and were in NEITHER list. Nothing deleted them — the menus were
  // never at risk — but the closing "Catalogue intact" line was printed without
  // ever looking at them, at the one moment in this project that has no undo.
  "ComboSlot",
  "ComboSlotChoice",
  "ComboSlotOptionRule",
  "Setting",
  "AuditLog",
  "TechnicalLog",
  "Session",
  "Backup",
] as const;

type Counts = Record<string, number>;

async function countAll(tables: readonly string[]): Promise<Counts> {
  const out: Counts = {};
  for (const t of tables) {
    const rows = await db.$queryRawUnsafe<{ n: bigint | number }[]>(
      `SELECT COUNT(*) AS n FROM "${t}"`,
    );
    out[t] = Number(rows[0]?.n ?? 0);
  }
  return out;
}

function table(counts: Counts, indent = "    "): string {
  const width = Math.max(...Object.keys(counts).map((k) => k.length));
  return Object.entries(counts)
    .map(([k, v]) => `${indent}${k.padEnd(width)}  ${String(v).padStart(6)}`)
    .join("\n");
}

/** Read one line from the operator. `readline` rather than Bun's `for await
 *  (… of console)` so the file typechecks under `tsc` like the rest of
 *  `scripts/` (Batch 4.5 brought this folder under typecheck and lint). */
async function confirm(prompt: string, expected: string): Promise<boolean> {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(prompt);
    return answer.trim() === expected;
  } finally {
    rl.close();
  }
}

async function main() {
  console.log(`\n${"=".repeat(74)}`);
  console.log(`  P-04 — REMISE A ZERO FISCALE D'AVANT MISE EN SERVICE`);
  console.log(`  ${APPLY ? `${RED}MODE APPLY — DESTRUCTIF${OFF}` : `${GRN}SIMULATION — rien ne sera modifie${OFF}`}`);
  console.log(`${"=".repeat(74)}\n`);

  const url = process.env.DATABASE_URL ?? "(unset)";
  // Hoisted for guard 2 (L-74). The test is unchanged and is still the only
  // thing standing between --yes and a real database.
  const disposable = /scratch|temp|tmp|rehears|test/i.test(url);
  console.log(`  DATABASE_URL : ${url}`);
  console.log(`  archives     : ${fiscalArchivesDir()}\n`);

  // ---- guard 1: the chain key must NOT be armed yet ------------------------
  // Arming happens AFTER this reset (P-04 step 2). A key already set means
  // either the reset has run and the journal is keyed — so this would be a
  // second reset over real, keyed history — or the order was wrong. Either
  // way, stop.
  if (fiscalChainKey() !== null) {
    fail(
      "FISCAL_CHAIN_KEY est deja armee.\n" +
        "  L'armement vient APRES la remise a zero (P-04, etape 2). Si la cle est\n" +
        "  deja en place, soit la remise a zero a deja eu lieu et le journal contient\n" +
        "  des ecritures reelles, soit l'ordre a ete inverse. Dans les deux cas :\n" +
        "  NE PAS CONTINUER sans relire P-04.",
    );
  }

  // ---- guard 2: the application must not be running -----------------------
  // A reset underneath a live server leaves it serving from stale state, and
  // the swap-file lesson of L-61 applies: the process holding the database is
  // the one that must let go of it.
  //
  // L-74 (2026-09-09): this fired on ANY live server, including one holding a
  // COMPLETELY DIFFERENT database, which made the batch’s own rehearsal
  // method impossible on a machine where the operator’s till is running. It
  // is narrowed, NOT weakened: the exemption is exactly the mode this script
  // already documents for rehearsals — `--yes` AND a disposable DATABASE_URL
  // — and `--yes` is refused on anything else a few lines below. On the real
  // till, where `--yes` cannot be used, the guard is untouched.
  const rehearsing = ASSUME_YES && disposable;
  for (const port of rehearsing ? [] : [3000, 3001]) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api`, {
        signal: AbortSignal.timeout(1500),
      });
      if (r.ok) {
        fail(
          `L'application repond encore sur le port ${port}.\n` +
            "  Arretez-la avant la remise a zero :\n" +
            "    Stop-ScheduledTask -TaskName 'HibaPOS Server'",
        );
      }
    } catch {
      /* not answering is what we want */
    }
  }

  // ---- the before picture -------------------------------------------------
  const before = await countAll(DELETION_ORDER);
  const preservedBefore = await countAll(PRESERVED);
  const counterBefore = await db.fiscalCounter.findFirst();

  const archiveDir = fiscalArchivesDir();
  const archiveFiles = existsSync(archiveDir)
    ? (await fs.readdir(archiveDir)).filter((f) => !f.startsWith("."))
    : [];

  console.log(`  ${YEL}A SUPPRIMER${OFF}`);
  console.log(table(before));
  console.log(`\n    ${DIM}fichiers d'archives fiscales : ${archiveFiles.length}${OFF}`);
  if (archiveFiles.length) console.log(archiveFiles.map((f) => `      ${f}`).join("\n"));
  console.log(`\n  ${GRN}A CONSERVER${OFF}`);
  console.log(table(preservedBefore));
  console.log(
    `\n  FiscalCounter avant : recu ${counterBefore?.lastReceiptNumber ?? "-"} / ` +
      `caisse ${counterBefore?.lastShiftNumber ?? "-"} / Z ${counterBefore?.lastZReportNumber ?? "-"} / ` +
      `evenement ${counterBefore?.lastFiscalEventSequence ?? "-"}\n`,
  );

  const totalToDelete = Object.values(before).reduce((a, b) => a + b, 0);

  if (!APPLY) {
    console.log(`  ${GRN}SIMULATION — aucune donnee n'a ete modifiee.${OFF}`);
    console.log(`  ${totalToDelete} ligne(s) et ${archiveFiles.length} fichier(s) seraient supprimes.\n`);
    console.log(`  Avant de relancer avec --apply :`);
    console.log(`    1. Sauvegarde complete, VERIFIEE avec scripts/decrypt-backup.ts,`);
    console.log(`       et copiee HORS de cette machine.`);
    console.log(`    2. L'application arretee.`);
    console.log(`    3. Relire P-04 dans REMEDIATION_PLAN.md.\n`);
    await db.$disconnect();
    return;
  }

  // ---- guard 3: the operator says it out loud -----------------------------
  if (!ASSUME_YES) {
    console.log(`  ${RED}Cette operation est IRREVERSIBLE.${OFF}`);
    console.log(`  ${RED}Elle ne doit jamais etre lancee apres la premiere vente reelle.${OFF}\n`);
    const ok = await confirm(
      `  Tapez EFFACER pour confirmer la suppression de ${totalToDelete} ligne(s) : `,
      "EFFACER",
    );
    if (!ok) fail("Confirmation incorrecte. Rien n'a ete modifie.");
    const backedUp = await confirm(
      `  La sauvegarde est-elle faite, verifiee et copiee ailleurs ? (oui/non) : `,
      "oui",
    );
    if (!backedUp) fail("Faites la sauvegarde d'abord. Rien n'a ete modifie.");
  } else if (!disposable) {
    fail(
      "--yes ne peut pas etre utilise sur cette base.\n" +
        "  Il existe pour les repetitions sur copie jetable ; DATABASE_URL ne\n" +
        "  ressemble pas a une copie. Relancez sans --yes et confirmez a la main.",
    );
  }

  // ---- the deletion -------------------------------------------------------
  console.log(`\n  Suppression…`);
  const deleted: Counts = {};
  await db.$transaction(async (tx) => {
    for (const t of DELETION_ORDER) {
      const n = await tx.$executeRawUnsafe(`DELETE FROM "${t}"`);
      deleted[t] = Number(n);
      console.log(`    ${t.padEnd(16)} ${String(n).padStart(6)} supprimee(s)`);
    }
    // The counter is RESET, not deleted: the singleton must exist, at zero, or
    // the first sale has nothing to increment. `init-fiscal-counter.ts` refuses
    // to create it beside non-empty fiscal tables (L-38), which is why it is
    // done here, inside the same transaction, rather than left to a second step.
    await tx.fiscalCounter.deleteMany();
    await tx.fiscalCounter.create({
      data: {
        id: "singleton",
        lastReceiptNumber: 0,
        lastShiftNumber: 0,
        lastZReportNumber: 0,
        lastFiscalEventSequence: 0,
      },
    });
    console.log(`    ${"FiscalCounter".padEnd(16)} ${"0/0/0/0".padStart(6)} remis a zero`);
  });

  // Archive FILES, after the rows and outside the transaction — a filesystem
  // delete cannot be rolled back, so it goes last.
  let filesRemoved = 0;
  for (const f of archiveFiles) {
    await fs.unlink(path.join(archiveDir, f));
    filesRemoved++;
  }
  if (filesRemoved) console.log(`    ${"archives".padEnd(16)} ${String(filesRemoved).padStart(6)} fichier(s) supprime(s)`);

  // ---- the after picture, for the record (hard constraint 4) --------------
  const after = await countAll(DELETION_ORDER);
  const preservedAfter = await countAll(PRESERVED);
  const counterAfter = await db.fiscalCounter.findFirst();

  const leftovers = Object.entries(after).filter(([, n]) => n > 0);
  const catalogueChanged = PRESERVED.filter((t) => preservedBefore[t] !== preservedAfter[t]);

  console.log(`\n${"=".repeat(74)}`);
  console.log(`  APRES`);
  console.log(`${"=".repeat(74)}`);
  console.log(table(after));
  console.log(
    `\n  FiscalCounter apres : recu ${counterAfter?.lastReceiptNumber} / caisse ${counterAfter?.lastShiftNumber} / ` +
      `Z ${counterAfter?.lastZReportNumber} / evenement ${counterAfter?.lastFiscalEventSequence}`,
  );

  if (leftovers.length) {
    console.log(`\n  ${RED}RESTE DES LIGNES : ${JSON.stringify(Object.fromEntries(leftovers))}${OFF}`);
  }
  if (catalogueChanged.length) {
    console.log(`\n  ${RED}LE CATALOGUE A CHANGE : ${catalogueChanged.join(", ")} — ceci est un defaut.${OFF}`);
    for (const t of catalogueChanged) {
      console.log(`    ${t}: ${preservedBefore[t]} -> ${preservedAfter[t]}`);
    }
  } else {
    console.log(`\n  ${GRN}Catalogue intact${OFF} (${PRESERVED.length} tables verifiees, aucun changement).`);
  }

  console.log(`\n  ${YEL}ETAPES SUIVANTES, DANS CET ORDRE (P-04) :${OFF}`);
  console.log(`    1. Generer la cle : openssl rand -hex 32`);
  console.log(`    2. La coller dans .env comme FISCAL_CHAIN_KEY`);
  console.log(`    3. La sauvegarder AILLEURS QUE SUR CETTE MACHINE`);
  console.log(`       (perdue, le journal ne sera plus jamais verifiable)`);
  console.log(`    4. Redemarrer l'application`);
  console.log(`    5. GET /api/fiscal/verify doit repondre "chainKeyed": true,`);
  console.log(`       chaine ok, lastSequence 0`);
  console.log(`    6. Reglages : FACTICE sur OFF avant la premiere vente reelle`);
  console.log(`    7. Reporter les chiffres ci-dessus dans REMEDIATION_PLAN.md (P-04)\n`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(`\n${RED}  ECHEC : ${e instanceof Error ? e.message : String(e)}${OFF}\n`);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
