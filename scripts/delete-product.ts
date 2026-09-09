#!/usr/bin/env bun
/**
 * Permanently delete ONE product row, by name.
 *
 * DRY RUN BY DEFAULT, like every script in this folder since Batch 4.5. Writes
 * only with `--apply`.
 *
 *   bun scripts/delete-product.ts "Menu Eco"            # report only
 *   bun scripts/delete-product.ts "Menu Eco" --apply    # delete
 *
 * WHY THIS EXISTS. The application deliberately has NO hard delete: its
 * `DELETE /api/catalog/products/[id]` sets `active: false` and says why —
 * "soft delete by deactivating to preserve order history integrity". That is
 * the right default and this script does not change it. But a product created
 * by mistake, never sold, and already deactivated leaves a row that will
 * survive § 6's reset (which preserves the catalogue) and reappear in every
 * listing for the rest of the installation's life. Menu Eco on 2026-09-09 was
 * exactly that: its price had been corrupted 24,90 -> 8,90 by a save while it
 * inherited the Pizzas size group, and the operator chose to remove it and
 * rebuild the menus with Batch 5.9.
 *
 * THE THREE REFUSALS, and each one protects something specific:
 *
 *   1. The name must match EXACTLY ONE product. Deleting the wrong row of a
 *      pair is not recoverable from here.
 *   2. The product must ALREADY BE INACTIVE. Hard-deleting something the till
 *      is still selling is never what anybody meant; deactivate it in the
 *      product editor first and look at the POS before coming back.
 *   3. The product must have ZERO OrderItem rows. This is the important one.
 *      `OrderItem.productId` is `onDelete: SetNull`, so deleting a sold product
 *      would NOT break the fiscal record — `productName`, `unitPrice` and
 *      `vatRate` are snapshotted on the line — but it would sever every sale
 *      from the thing that was sold, for a tidiness gain. If a product has ever
 *      been sold, the soft delete is the correct treatment and this script
 *      refuses.
 *
 * WHAT IT DELETES. The `Product` row, and with it — by the schema's own
 * cascades, not by anything here — its `OptionGroup` rows and their
 * `OptionChoice` rows. Nothing else. `CategoryOptionGroup` belongs to the
 * category and is untouched.
 *
 * AUDIT. It writes an `AuditLog` row with `action: "PRODUCT_HARD_DELETED"` and
 * `userId: null` — the column is nullable, and null is the honest value: this
 * was a maintenance script, not a person clicking. The route's own delete
 * writes `PRODUCT_DELETED` against a real user; the two are deliberately
 * different actions so a reader can tell them apart.
 *
 * The catalogue is real and irreplaceable (plan warning 4). Take a backup
 * first; the operator did on 2026-09-09.
 */
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const name = args.filter((a) => !a.startsWith("--"))[0];

if (!name) {
  console.error('Usage: bun scripts/delete-product.ts "<nom du produit>" [--apply]');
  process.exit(1);
}

const db = new PrismaClient();

console.log(apply ? "=== APPLY — suppression definitive ===" : "=== SIMULATION — aucune suppression (ajoutez --apply) ===");
console.log("");

const matches = await db.product.findMany({
  where: { name },
  select: {
    id: true,
    name: true,
    price: true,
    active: true,
    category: { select: { name: true } },
    _count: { select: { options: true } },
  },
});

if (matches.length === 0) {
  console.error(`REFUS : aucun produit ne s'appelle « ${name} ».`);
  await db.$disconnect();
  process.exit(1);
}
if (matches.length > 1) {
  console.error(`REFUS : ${matches.length} produits s'appellent « ${name} ». Ce script n'en supprime qu'un, nommement.`);
  for (const m of matches) console.error(`   - ${m.id} (${m.category?.name ?? "sans categorie"})`);
  await db.$disconnect();
  process.exit(1);
}

const p = matches[0];
const soldLines = await db.orderItem.count({ where: { productId: p.id } });

console.log(`Produit    : ${p.name}`);
console.log(`Id         : ${p.id}`);
console.log(`Categorie  : ${p.category?.name ?? "-"}`);
console.log(`Prix       : ${(p.price / 100).toFixed(2)} EUR`);
console.log(`Actif      : ${p.active ? "OUI" : "non"}`);
console.log(`Groupes d'options propres : ${p._count.options}`);
console.log(`Lignes de commande        : ${soldLines}`);
console.log("");

if (p.active) {
  console.error("REFUS : ce produit est encore ACTIF.");
  console.error("        Desactivez-le d'abord (interrupteur « Actif » dans la fiche produit)");
  console.error("        et verifiez en caisse qu'il a bien disparu.");
  await db.$disconnect();
  process.exit(1);
}

if (soldLines > 0) {
  console.error(`REFUS : ce produit apparait dans ${soldLines} ligne(s) de commande.`);
  console.error("        La desactivation est le traitement correct dans ce cas :");
  console.error("        elle preserve le lien entre les ventes passees et le produit vendu.");
  await db.$disconnect();
  process.exit(1);
}

if (!apply) {
  console.log("Serait supprime : la ligne Product, ses groupes d'options et leurs choix (cascade).");
  console.log("Rien n'a ete supprime. Relancez avec --apply pour appliquer.");
  await db.$disconnect();
  process.exit(0);
}

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

const left = await db.product.count({ where: { id: p.id } });
console.log(`Supprime. Verification : ${left} ligne restante pour cet id (attendu 0).`);
console.log("Consignez-le dans docs/CHANGES-LOG.md -> OPERATOR CATALOGUE CHANGES.");
await db.$disconnect();
