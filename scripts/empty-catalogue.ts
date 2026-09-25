#!/usr/bin/env bun
/**
 * Empty the catalogue, so that `importCatalogue` can be used on an install
 * that already has one.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * **L-226.** `importCatalogue` refuses unless every catalogue table is empty,
 * and its refusal says « videz le catalogue ou repartez d'une installation
 * neuve » — **naming an action no route, screen or script could perform.**
 * Nothing in `src/` empties a catalogue; `pre-golive-reset.ts` deletes the
 * trading data and KEEPS the catalogue, by design. So the transfer worked
 * exactly once per installation, on a machine that had never had a menu, and
 * the France till therefore got `add-tacos.ts` and `set-option-quotas.ts` by
 * hand instead of the mechanism built for the job.
 *
 * This is the other half. With it, carrying a menu becomes « export here,
 * import there » for ever after.
 *
 * ── THE REFUSAL THAT MATTERS: IT WILL NOT RUN ON AN INSTALL THAT HAS TRADED ─
 * A sealed receipt names its products **under their identity**, which is
 * R2.1's whole invariant, and `OrderItem` snapshots `productName` beside a
 * nullable `productId` precisely so a sale stays readable. Deleting the
 * catalogue under a history does not break a foreign key — SQLite would
 * allow much of it — it makes a fiscal document refer to rows that no longer
 * exist, quietly, which is the worst shape of damage this project can do.
 *
 * So the rule is blunt and checkable: **every table `pre-golive-reset.ts`
 * deletes must already be empty.** On a till that has traded the answer is
 * « no », and this says so and stops. If emptying is genuinely intended, the
 * reset runs first — deliberately, by the operator, as its own decision.
 *
 * ── DRY RUN UNLESS GIVEN `--apply`, AND THEN IT ASKS ────────────────────────
 *   bun scripts/empty-catalogue.ts            # report only, changes nothing
 *   bun scripts/empty-catalogue.ts --apply    # asks for VIDER, then deletes
 *
 * The table list is IMPORTED from `catalogue-transfer.ts` rather than copied,
 * so « what a catalogue is » has one definition. Deleting in the reverse of
 * the export's insert order is FK-safe by construction (L-225 added
 * `ProductOptionQuota` last, so it goes first here).
 */
import { PrismaClient } from "@prisma/client";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { createHash } from "crypto";
import path from "path";
import { CATALOGUE_TABLES } from "../src/lib/services/catalogue-transfer";

const APPLY = process.argv.includes("--apply");

const RED = "\x1b[31m", GRN = "\x1b[32m", YEL = "\x1b[33m", OFF = "\x1b[0m";

/** Everything `pre-golive-reset.ts` deletes. All of it must already be gone. */
const MUST_BE_EMPTY = [
  "Receipt", "OrderItem", "Payment", "Refund", "Order", "Customer",
  "ZReport", "CashMovement", "Shift", "FiscalEvent", "DailyClose",
  "MonthlyClose", "AnnualClose", "FiscalArchive", "GrandTotal", "Table",
] as const;

function sha256(file: string) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** The database this run will touch, from `DATABASE_URL` — rule 3 of
 *  `scripts/README.md`: the variable is what these scripts obey. */
function databaseFile(): string {
  const url = process.env.DATABASE_URL ?? "";
  const m = /^file:(.*?)(\?|$)/.exec(url);
  if (!m?.[1]) throw new Error(`DATABASE_URL is not a file: URL — got ${url || "(unset)"}`);
  return m[1];
}

async function confirm(prompt: string, expected: string): Promise<boolean> {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(prompt)).trim() === expected;
  } finally {
    rl.close();
  }
}

/** Counts for a list of tables, through a client that is CLOSED again — which
 *  is what lets the journal-file check below mean anything (L-234). */
async function survey(): Promise<{ catalogue: Record<string, number>; trading: Record<string, number> }> {
  const db = new PrismaClient();
  try {
    // A database whose schema is behind — an old snapshot, or an install with
    // a migration pending — must say so, not emit a raw Prisma « no such
    // table » from somewhere in the middle of a survey.
    const present = new Set(
      (
        await db.$queryRawUnsafe<{ name: string }[]>(
          `SELECT name FROM sqlite_master WHERE type='table'`,
        )
      ).map((r) => r.name),
    );
    const absent = [...CATALOGUE_TABLES.map((t) => t.table), ...MUST_BE_EMPTY].filter(
      (t) => !present.has(t),
    );
    if (absent.length) {
      throw new Error(
        `REFUS : tables absentes de ce schema — ${absent.join(", ")}.\n` +
          `  Cette base est en retard sur le code. Appliquez les migrations d'abord\n` +
          `  (scripts/apply-migration.ts), puis relancez.`,
      );
    }

    const catalogue: Record<string, number> = {};
    for (const { table } of CATALOGUE_TABLES) {
      const [{ c }] = await db.$queryRawUnsafe<{ c: bigint | number }[]>(
        `SELECT COUNT(*) c FROM "${table}"`,
      );
      catalogue[table] = Number(c);
    }
    const trading: Record<string, number> = {};
    for (const table of MUST_BE_EMPTY) {
      const [{ c }] = await db.$queryRawUnsafe<{ c: bigint | number }[]>(
        `SELECT COUNT(*) c FROM "${table}"`,
      );
      trading[table] = Number(c);
    }
    return { catalogue, trading };
  } finally {
    await db.$disconnect();
  }
}

function table(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([t, n]) => `    ${t.padEnd(24)}${String(n).padStart(6)}`)
    .join("\n");
}

async function main() {
  console.log("");
  console.log("=".repeat(74));
  console.log(`  ${APPLY ? `${RED}VIDER LE CATALOGUE — MODE APPLY, DESTRUCTIF${OFF}` : `${YEL}VIDER LE CATALOGUE — SIMULATION${OFF}`}`);
  console.log("=".repeat(74));

  const file = databaseFile();
  console.log(`\n  DATABASE_URL : ${file}`);

  const { catalogue, trading } = await survey();

  // --- refusal 1: one file must be the whole database ------------------------
  // After `survey()` opened a client and closed it, so SQLite has cleared any
  // read-only tool's leftovers and anything still here belongs to someone else.
  // The same ordering `apply-migration.ts` depends on — see L-234.
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (existsSync(file + suffix)) {
      throw new Error(
        `${path.basename(file)}${suffix} sits beside the database after this script closed its ` +
          `own connection, so something else holds it. Stop the application and run this again.`,
      );
    }
  }

  const catalogueTotal = Object.values(catalogue).reduce((a, b) => a + b, 0);
  console.log(`\n  ${YEL}A SUPPRIMER${OFF}`);
  console.log(table(catalogue));
  console.log(`    ${"TOTAL".padEnd(24)}${String(catalogueTotal).padStart(6)}`);

  // --- refusal 2: the install must not have traded ---------------------------
  const nonEmpty = Object.entries(trading).filter(([, n]) => n > 0);
  if (nonEmpty.length) {
    console.log(`\n  ${RED}DONNEES D'EXPLOITATION PRESENTES${OFF}`);
    console.log(table(Object.fromEntries(nonEmpty)));
    throw new Error(
      `REFUS : cette installation a des donnees d'exploitation.\n` +
        `  Un ticket scelle nomme ses produits sous leur identite (R2.1), et un OrderItem\n` +
        `  conserve productName a cote d'un productId nullable pour cette raison. Vider le\n` +
        `  catalogue sous un historique ne casse pas une cle etrangere — cela rend un document\n` +
        `  fiscal illisible, en silence.\n` +
        `  Si c'est bien l'intention : lancez d'abord scripts/pre-golive-reset.ts, qui est une\n` +
        `  decision de l'operateur a part entiere, puis relancez celui-ci.`,
    );
  }
  console.log(`\n  ${GRN}Aucune donnee d'exploitation${OFF} (${MUST_BE_EMPTY.length} tables verifiees, toutes a zero).`);

  if (catalogueTotal === 0) {
    console.log(`\n  Le catalogue est deja vide. Rien a faire.`);
    return;
  }

  if (!APPLY) {
    console.log(`\n  ${catalogueTotal} ligne(s) seraient supprimees. Rien n'a ete modifie.`);
    console.log(`  Relancez avec --apply pour vider.\n`);
    return;
  }

  console.log(`\n  ${RED}Cette operation est IRREVERSIBLE.${OFF}`);
  console.log(`  Le point de restauration ci-dessous est le seul retour en arriere.\n`);
  if (!(await confirm(`  Tapez VIDER pour confirmer la suppression de ${catalogueTotal} ligne(s) : `, "VIDER"))) {
    console.log(`\n  Annule. Rien n'a ete modifie.\n`);
    return;
  }

  // --- restore point ---------------------------------------------------------
  const snapshots = path.resolve(process.cwd(), "..", "db-snapshots");
  if (!existsSync(snapshots)) mkdirSync(snapshots, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const restore = path.join(snapshots, `before-empty-catalogue-${stamp}.db`);
  copyFileSync(file, restore);
  const beforeSha = sha256(file);
  if (sha256(restore) !== beforeSha) {
    throw new Error("Restore point does not match the source. Refusing to write.");
  }
  console.log(`\n  Point de restauration : ${restore}`);
  console.log(`    sha256 : ${beforeSha}`);

  // --- delete, in the reverse of the FK-safe insert order --------------------
  const db = new PrismaClient();
  try {
    const order = [...CATALOGUE_TABLES].reverse();
    console.log(`\n  ${RED}Suppression…${OFF}`);
    await db.$transaction(async (tx) => {
      for (const { table: t } of order) {
        const n = await tx.$executeRawUnsafe(`DELETE FROM "${t}"`);
        console.log(`    ${t.padEnd(24)}${String(n).padStart(6)} supprimee(s)`);
      }
    });

    // --- verify, by reading back rather than trusting the transaction --------
    const after: Record<string, number> = {};
    for (const { table: t } of CATALOGUE_TABLES) {
      const [{ c }] = await db.$queryRawUnsafe<{ c: bigint | number }[]>(
        `SELECT COUNT(*) c FROM "${t}"`,
      );
      after[t] = Number(c);
    }
    const left = Object.entries(after).filter(([, n]) => n > 0);
    if (left.length) {
      throw new Error(
        `des lignes subsistent : ${left.map(([t, n]) => `${t}=${n}`).join(", ")}. ` +
          `Point de restauration ci-dessus.`,
      );
    }

    await db.auditLog.create({
      data: {
        userId: null,
        action: "CATALOGUE_EMPTIED",
        entity: "Catalogue",
        entityId: null,
        details: JSON.stringify({
          deleted: catalogueTotal,
          perTable: catalogue,
          restore,
          via: "scripts/empty-catalogue.ts",
        }),
      },
    });

    await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    await db.$disconnect();
  }

  console.log(`\n  ${GRN}Catalogue vide${OFF} (${CATALOGUE_TABLES.length} tables relues, toutes a zero).`);
  console.log(`  sha256 apres : ${sha256(file)}`);
  console.log(`\n  ${GRN}✅ FAIT.${OFF} L'import d'un catalogue est maintenant possible sur cette installation.\n`);
}

main().catch((e) => {
  console.error(`\n${RED}❌ ${e instanceof Error ? e.message : String(e)}${OFF}\n`);
  process.exitCode = 1;
});
