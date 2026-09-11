#!/usr/bin/env bun
/**
 * Permanently delete ONE product row.
 *
 * DRY RUN BY DEFAULT, like every script in this folder since Batch 4.5. Writes
 * only with `--apply`.
 *
 *   bun scripts/delete-product.ts --id <cuid>           # report only
 *   bun scripts/delete-product.ts --id <cuid> --apply   # delete, then verify
 *   bun scripts/delete-product.ts "Menu Eco"            # by name, still supported
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The application deliberately has NO hard delete: `DELETE /api/catalog/products/[id]`
 * sets `active: false` and says why — « soft delete by deactivating to preserve
 * order history integrity ». That is the right default and this script does not
 * change it. But a product created by mistake, never sold, and already
 * deactivated leaves a row that will survive § 6's reset (which preserves the
 * catalogue) and reappear in every listing for the rest of the installation's
 * life. *Menu Eco* on 2026-09-09 was that case; `5 nuggets test` (L-81) is the
 * current one.
 *
 * ── 2026-09-11: ADDRESS BY ID, AND THREE MORE REFUSALS ──────────────────────
 * This script was written on 2026-09-09 and addressed a product BY NAME, with a
 * refusal if the name was not unique. Both are kept — the name form is what
 * `scripts/README.md` and `docs/CHANGES-LOG.md` document — but `--id` is now
 * the preferred form, because the plan's own invariant is that a thing is
 * identified by its IDENTITY and never by its label, and because a name can be
 * changed afterwards while an id cannot. R7.2 renamed three pairs on
 * 2026-09-11 for exactly that reason.
 *
 * Three refusals were added at the same time, for things that did not exist or
 * were not considered when it was written: menus composés (Batch 5.9), the
 * sealed report payloads, and a verified restore point.
 *
 * ── THE REFUSALS, and what each one protects ────────────────────────────────
 *
 *   1. The product must be identified UNAMBIGUOUSLY — one id, or a name that
 *      matches exactly one row. Deleting the wrong row of a pair is not
 *      recoverable from here.
 *   2. It must ALREADY BE INACTIVE. Hard-deleting something the till is still
 *      selling is never what anybody meant; deactivate it in the product editor
 *      first and look at the POS before coming back.
 *   3. It must have ZERO `OrderItem` rows, by `productId` or `comboProductId`.
 *      `OrderItem.productId` is `onDelete: SetNull`, so deleting a sold product
 *      would NOT break the fiscal record — `productName`, `unitPrice` and
 *      `vatRate` are snapshotted on the line — but it WOULD sever every sale
 *      from the thing that was sold, for a tidiness gain. If a product has ever
 *      been sold, the soft delete is the correct treatment and this refuses.
 *   4. It must not BE a menu (`ComboSlot.productId`) or be a legal filler for
 *      one (`ComboSlotChoice.productId`). `ComboSlot` is `onDelete: Cascade`,
 *      so deleting a menu would silently take its slots with it — a much larger
 *      operation than this script should perform without being asked.
 *   5. **No SEALED document may name it.** `ZReport.topProductsJson`,
 *      `ZReport.givenAwayProductsJson` (R7.1, 2026-09-11) and the period closes'
 *      `topProductsJson`/`dataJson` hold product ids as PLAIN JSON with no
 *      foreign key, so nothing in the database defends them. A sealed fiscal
 *      document may not be corrected, so a product one identifies has to keep
 *      existing. This is the refusal no schema can express.
 *   6. The restore point must verify against the original, byte for byte.
 *
 * ── WHAT IT DELETES ─────────────────────────────────────────────────────────
 * The `Product` row, and with it — by the schema's own cascade, not by anything
 * here — its OWN `OptionGroup` rows and their `OptionChoice` rows. That is
 * deliberate: a product's own option groups belong to it. Nothing else.
 * `CategoryOptionGroup` belongs to the category and is untouched. The count is
 * printed before anything is written.
 *
 * ── AUDIT ───────────────────────────────────────────────────────────────────
 * It writes an `AuditLog` row with `action: "PRODUCT_HARD_DELETED"` and
 * `userId: null` — the column is nullable, and null is the honest value: this
 * was a maintenance script, not a person clicking. The route's own delete writes
 * `PRODUCT_DELETED` against a real user; the two are deliberately different
 * actions so a reader can tell them apart. The audit log SURVIVES § 6's reset,
 * so this row is the lasting record that the product ever existed.
 *
 * The catalogue is real and irreplaceable. This takes its own restore point into
 * `../db-snapshots/` and the database is always the one `DATABASE_URL` names —
 * this script derives no path of its own. Log the result in
 * `docs/CHANGES-LOG.md` → OPERATOR CATALOGUE CHANGES.
 */
import { PrismaClient } from "@prisma/client";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { createHash } from "crypto";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const idIdx = args.indexOf("--id");
const byId = idIdx >= 0 ? args[idIdx + 1] : null;
const byName = args.filter((a) => !a.startsWith("--") && a !== byId)[0] ?? null;

function databasePath(): string {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) {
    console.error("DATABASE_URL doit etre une URL file:. Lancez depuis la racine du projet.");
    process.exit(1);
  }
  return resolve(url.slice("file:".length).split("?")[0]);
}

const sha256 = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");

const db = new PrismaClient();
const dbPath = databasePath();

/** Foreign-key columns that hold a product id. */
const REFERENCES: { table: string; column: string; why: string }[] = [
  { table: "OrderItem", column: "productId", why: "vendu sur une ligne de commande" },
  { table: "OrderItem", column: "comboProductId", why: "le menu auquel une ligne appartenait" },
  { table: "ComboSlot", column: "productId", why: "ce produit EST un menu compose, avec des emplacements" },
  { table: "ComboSlotChoice", column: "productId", why: "choix autorise dans un emplacement de menu" },
];

/** Columns that hold a product id inside a SEALED JSON payload — no FK. */
const SEALED: { table: string; column: string }[] = [
  { table: "ZReport", column: "topProductsJson" },
  { table: "ZReport", column: "givenAwayProductsJson" },
  { table: "DailyClose", column: "topProductsJson" },
  { table: "DailyClose", column: "dataJson" },
  { table: "MonthlyClose", column: "topProductsJson" },
  { table: "MonthlyClose", column: "dataJson" },
  { table: "AnnualClose", column: "topProductsJson" },
  { table: "AnnualClose", column: "dataJson" },
];

async function countRaw(table: string, column: string, value: string, like: boolean): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ c: bigint | number }[]>(
    `SELECT COUNT(*) c FROM "${table}" WHERE "${column}" ${like ? "LIKE" : "="} ?`,
    like ? `%${value}%` : value,
  );
  return Number(rows[0]?.c ?? 0);
}

async function main(): Promise<number> {
  console.log("");
  console.log(apply ? "=== APPLY — suppression definitive ===" : "=== SIMULATION — aucune suppression (ajoutez --apply) ===");
  console.log("Base : " + dbPath);
  console.log("");

  if (!byId && !byName) {
    console.error('Usage: bun scripts/delete-product.ts --id <cuid> [--apply]');
    console.error('   ou: bun scripts/delete-product.ts "<nom du produit>" [--apply]');
    console.error("Ce script ne nomme aucun produit de lui-meme.");
    return 1;
  }

  // ── refusal 1: identify exactly one product ─────────────────────────────
  const select = {
    id: true, name: true, price: true, active: true, available: true, isCombo: true,
    category: { select: { name: true } },
    _count: { select: { options: true } },
  } as const;

  let p: Awaited<ReturnType<typeof db.product.findFirst<{ select: typeof select }>>> = null;
  if (byId) {
    p = await db.product.findUnique({ where: { id: byId }, select });
    if (!p) {
      console.error(`REFUS : aucun produit avec l'id ${byId}.`);
      return 1;
    }
  } else {
    const matches = await db.product.findMany({ where: { name: byName! }, select });
    if (matches.length === 0) {
      console.error(`REFUS : aucun produit ne s'appelle « ${byName} ».`);
      return 1;
    }
    if (matches.length > 1) {
      console.error(`REFUS : ${matches.length} produits s'appellent « ${byName} ». Ce script n'en supprime qu'un.`);
      for (const m of matches) console.error(`   - ${m.id} (${m.category?.name ?? "sans categorie"}, ${(m.price / 100).toFixed(2)} EUR)`);
      console.error("Relancez avec --id pour lever l'ambiguite.");
      return 1;
    }
    p = matches[0];
  }

  console.log(`Produit    : ${p.name}`);
  console.log(`Id         : ${p.id}`);
  console.log(`Categorie  : ${p.category?.name ?? "-"}`);
  console.log(`Prix       : ${(p.price / 100).toFixed(2)} EUR`);
  console.log(`Actif      : ${p.active ? "OUI" : "non"}   Disponible : ${p.available ? "oui" : "non"}   Menu : ${p.isCombo ? "OUI" : "non"}`);
  console.log(`Groupes d'options propres : ${p._count.options}  (supprimes en cascade avec le produit)`);
  console.log("");

  // ── refusal 2: it must already be deactivated ───────────────────────────
  if (p.active) {
    console.error("REFUS : ce produit est encore ACTIF.");
    console.error("        Desactivez-le d'abord (interrupteur « Actif » dans la fiche produit)");
    console.error("        et verifiez en caisse qu'il a bien disparu.");
    return 1;
  }

  // ── refusals 3 and 4: nothing may reference it ──────────────────────────
  const refs: string[] = [];
  for (const r of REFERENCES) {
    let n = 0;
    try {
      n = await countRaw(r.table, r.column, p.id, false);
    } catch {
      continue; // column absent in this schema vintage
    }
    if (n > 0) refs.push(`${r.table}.${r.column} — ${n} ligne(s) : ${r.why}`);
  }
  if (refs.length) {
    console.error("REFUS : ce produit est reference.");
    for (const r of refs) console.error("   - " + r);
    console.error("");
    console.error("        S'il a ete vendu, la DESACTIVATION est le traitement correct :");
    console.error("        elle preserve le lien entre les ventes passees et le produit vendu.");
    console.error("        SQLite aurait accepte la plupart de ces suppressions —");
    console.error("        OrderItem est ON DELETE SET NULL et ComboSlot est ON DELETE CASCADE.");
    return 1;
  }
  console.log(`References : 0 ligne dans ${REFERENCES.length} colonnes de cle etrangere.`);

  // ── refusal 5: no sealed document may name it ───────────────────────────
  const sealed: string[] = [];
  for (const s of SEALED) {
    let n = 0;
    try {
      n = await countRaw(s.table, s.column, p.id, true);
    } catch {
      continue;
    }
    if (n > 0) sealed.push(`${s.table}.${s.column} — ${n} document(s) scelle(s)`);
  }
  if (sealed.length) {
    console.error("REFUS : un document fiscal SCELLE identifie ce produit.");
    for (const s of sealed) console.error("   - " + s);
    console.error("");
    console.error("        Ce sont des instantanes JSON, pas des cles etrangeres : rien dans la");
    console.error("        base ne les protege. Un document scelle ne se corrige pas, donc le");
    console.error("        produit qu'il nomme doit continuer d'exister.");
    return 1;
  }
  console.log(`Documents scelles : 0 sur ${SEALED.length} instantanes le nomment.`);

  if (!apply) {
    console.log("");
    console.log("Serait supprime : la ligne Product, ses groupes d'options et leurs choix (cascade).");
    console.log("Rien n'a ete supprime. Relancez avec --apply pour appliquer :");
    console.log(`   bun scripts/delete-product.ts --id ${p.id} --apply`);
    console.log("");
    return 0;
  }

  // ── refusal 6: the restore point, and it is not optional ────────────────
  const stamp = new Date(statSync(dbPath).mtime).toISOString().slice(0, 10);
  const snapDir = resolve(dirname(dbPath), "..", "..", "db-snapshots");
  mkdirSync(snapDir, { recursive: true });
  const snap = join(snapDir, `custom.db.before-delete-${p.id}-${stamp}`);
  if (existsSync(snap)) {
    console.error(`REFUS : ${snap} existe deja. Deplacez-le d'abord.`);
    return 1;
  }
  copyFileSync(dbPath, snap);
  if (sha256(snap) !== sha256(dbPath)) {
    console.error("REFUS : le point de restauration ne correspond pas a l'original. Rien supprime.");
    return 1;
  }
  console.log("");
  console.log("Point de restauration : " + snap);
  console.log("sha256                : " + sha256(snap));

  const before = await db.product.count();
  await db.$transaction(async (tx) => {
    await tx.product.delete({ where: { id: p.id } });
    await tx.auditLog.create({
      data: {
        userId: null,
        action: "PRODUCT_HARD_DELETED",
        entity: "Product",
        entityId: p.id,
        details: JSON.stringify({
          name: p.name,
          category: p.category?.name ?? null,
          price: p.price,
          optionGroups: p._count.options,
          via: "scripts/delete-product.ts",
        }),
      },
    });
  });

  // ── verify rather than assume ───────────────────────────────────────────
  const gone = (await db.product.findUnique({ where: { id: p.id } })) === null;
  const after = await db.product.count();
  const fk = await db.$queryRawUnsafe<unknown[]>(`PRAGMA foreign_key_check`);
  const [{ integrity_check: integrity }] =
    await db.$queryRawUnsafe<{ integrity_check: string }[]>(`PRAGMA integrity_check`);

  console.log("");
  console.log("  ── RESULTAT ────────────────────────────────────────────────");
  console.log(`  Ligne supprimee : ${gone ? "oui" : "NON"}`);
  console.log(`  Produits        : ${before} -> ${after}`);
  console.log(`  Erreurs de cle  : ${fk.length}`);
  console.log(`  integrity_check : ${integrity}`);
  console.log(`  sha256          : ${sha256(dbPath)}`);

  const ok = gone && after === before - 1 && fk.length === 0 && integrity === "ok";
  console.log("");
  console.log(ok ? "  ✅ SUPPRIME ET VERIFIE." : "  ❌ ANOMALIE — restaurez depuis le point ci-dessus.");
  console.log("  Consignez-le dans docs/CHANGES-LOG.md -> OPERATOR CATALOGUE CHANGES.");
  console.log("");
  return ok ? 0 : 1;
}

main()
  .then(async (code) => {
    await db.$disconnect();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
