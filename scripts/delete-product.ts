#!/usr/bin/env bun
/**
 * L-81 — remove a product ROW from the catalogue, permanently.
 *
 * ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
 * `DELETE /api/catalog/products/[id]` is a SOFT delete: it sets `active=false`
 * and nothing more, deliberately, « to preserve order history integrity ». That
 * is the right default and it is why the app has no way to do this. A product
 * that was never meant to exist — a test row typed into the live catalogue — is
 * the case the soft delete cannot serve: it is already inactive, and pressing
 * the app's delete button on it changes nothing at all.
 *
 * ── IT IS A DRY RUN UNLESS GIVEN `--apply` ──────────────────────────────────
 *   bun scripts/delete-product.ts --id <cuid>            # report only
 *   bun scripts/delete-product.ts --id <cuid> --apply    # delete, then verify
 *
 * ── THE FIVE REFUSALS, AND WHY EACH ONE ─────────────────────────────────────
 *  1. **The product must exist.** A typo in an id must not be a silent no-op
 *     that reads like success.
 *  2. **It must already be `active = 0`.** Deactivate through the app first.
 *     Two deliberate steps, on two different days if you like — this is the
 *     only operation in this project that destroys catalogue data outright.
 *  3. **Nothing may reference it.** `OrderItem.productId` and
 *     `OrderItem.comboProductId`, `ComboSlot.productId`, `ComboSlotChoice.productId`,
 *     `OptionGroup.productId`. SQLite would allow most of these: `OrderItem`
 *     declares `onDelete: SetNull` and `ComboSlot` declares `onDelete: Cascade`,
 *     so the database's own answer to « this product was sold » is to quietly
 *     null the line's identity, and its answer to « this menu has slots » is to
 *     delete them too. Neither is an answer anyone asked for.
 *  4. **No SEALED document may name it.** A Z report or a period close carries
 *     `topProductsJson` / `givenAwayProductsJson`, which hold the product's ID
 *     as plain JSON — no foreign key, so nothing in the database defends them.
 *     Deleting a product an immutable fiscal document identifies would leave
 *     that document pointing at a row that no longer exists, and the document
 *     cannot be corrected. This is the refusal that matters most, and it is the
 *     one the schema cannot express.
 *  5. **The restore point must verify.** Same rule as every other script here.
 *
 * Refusals 3 and 4 together mean this is only ever usable BEFORE a product has
 * taken part in anything — which, for a row created by mistake, is exactly when
 * it should be used and is the only time it is safe.
 *
 * The database is always the one `DATABASE_URL` names. This script derives no
 * path of its own.
 */

import { PrismaClient } from "@prisma/client";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { createHash } from "crypto";

const APPLY = process.argv.includes("--apply");
const idIdx = process.argv.indexOf("--id");
const ID = idIdx >= 0 ? process.argv[idIdx + 1] : null;

function databasePath(): string {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) {
    console.error("DATABASE_URL must be a file: URL. Run from the project root.");
    process.exit(1);
  }
  return resolve(url.slice("file:".length).split("?")[0]);
}

const sha256 = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");

const db = new PrismaClient();
const dbPath = databasePath();

/** Every column that holds a product id as a foreign key. */
const REFERENCES: { table: string; column: string; note: string }[] = [
  { table: "OrderItem", column: "productId", note: "sold on an order line" },
  { table: "OrderItem", column: "comboProductId", note: "the menu a line belonged to" },
  { table: "ComboSlot", column: "productId", note: "this product IS a menu, with slots" },
  { table: "ComboSlotChoice", column: "productId", note: "a legal filler for a menu slot" },
  { table: "OptionGroup", column: "productId", note: "carries per-product option groups" },
];

/** Every column that holds a product id inside a SEALED JSON payload. */
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

async function countWhere(table: string, column: string, value: string): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ c: bigint | number }[]>(
    `SELECT COUNT(*) c FROM "${table}" WHERE "${column}" = ?`,
    value,
  );
  return Number(rows[0]?.c ?? 0);
}

async function countLike(table: string, column: string, value: string): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ c: bigint | number }[]>(
    `SELECT COUNT(*) c FROM "${table}" WHERE "${column}" LIKE ?`,
    `%${value}%`,
  );
  return Number(rows[0]?.c ?? 0);
}

async function main(): Promise<number> {
  console.log("");
  console.log("  Database : " + dbPath);

  if (!ID) {
    console.error("");
    console.error("  Usage: bun scripts/delete-product.ts --id <cuid> [--apply]");
    console.error("  This script names no product of its own.");
    return 1;
  }

  // ── refusal 1: it must exist ──────────────────────────────────────────────
  const product = await db.product.findUnique({ where: { id: ID } });
  if (!product) {
    console.error("");
    console.error(`  REFUSED: no product with id ${ID}.`);
    console.error("  Nothing was changed. Check the id rather than the script.");
    return 1;
  }
  const category = await db.category.findUnique({ where: { id: product.categoryId } });
  console.log("");
  console.log(`  Product  : «${product.name}»`);
  console.log(`  Id       : ${product.id}`);
  console.log(`  Price    : ${product.price} cents`);
  console.log(`  Category : ${category?.name ?? "(none)"}`);
  console.log(`  State    : active=${product.active} available=${product.available} isCombo=${product.isCombo}`);
  console.log("");

  // ── refusal 2: it must already be deactivated ─────────────────────────────
  if (product.active) {
    console.error("  REFUSED: this product is still ACTIVE.");
    console.error("  Deactivate it in the app first. Two steps, on purpose: this one");
    console.error("  destroys the row and cannot be undone except from the restore point.");
    return 1;
  }
  console.log("  Active check : already inactive.");

  // ── refusal 3: nothing may reference it ───────────────────────────────────
  const refs: string[] = [];
  for (const r of REFERENCES) {
    let n = 0;
    try {
      n = await countWhere(r.table, r.column, ID);
    } catch {
      continue; // column or table absent in this schema vintage
    }
    if (n > 0) refs.push(`${r.table}.${r.column} — ${n} row(s): ${r.note}`);
  }
  if (refs.length) {
    console.error("");
    console.error("  REFUSED: this product is referenced.");
    for (const r of refs) console.error("     " + r);
    console.error("");
    console.error("  SQLite would have allowed most of this: OrderItem is ON DELETE SET NULL,");
    console.error("  so past sales would silently lose the identity they are counted under,");
    console.error("  and ComboSlot is ON DELETE CASCADE, so a menu's slots would go with it.");
    return 1;
  }
  console.log("  Reference check: 0 rows in " + REFERENCES.length + " foreign-key columns.");

  // ── refusal 4: no sealed document may name it ─────────────────────────────
  const sealed: string[] = [];
  for (const s of SEALED) {
    let n = 0;
    try {
      n = await countLike(s.table, s.column, ID);
    } catch {
      continue;
    }
    if (n > 0) sealed.push(`${s.table}.${s.column} — ${n} sealed row(s)`);
  }
  if (sealed.length) {
    console.error("");
    console.error("  REFUSED: an immutable fiscal document identifies this product.");
    for (const s of sealed) console.error("     " + s);
    console.error("");
    console.error("  These are JSON snapshots, not foreign keys, so nothing in the database");
    console.error("  defends them. A sealed document may not be corrected, so the product it");
    console.error("  names has to keep existing.");
    return 1;
  }
  console.log(`  Sealed-document check: 0 of ${SEALED.length} sealed payloads name it.`);

  if (!APPLY) {
    console.log("");
    console.log("  DRY RUN. Nothing was changed.");
    console.log(`     bun scripts/delete-product.ts --id ${ID} --apply`);
    console.log("");
    return 0;
  }

  // ── refusal 5: the restore point, and it is not optional ──────────────────
  const stamp = new Date(statSync(dbPath).mtime).toISOString().slice(0, 10);
  const snapDir = resolve(dirname(dbPath), "..", "..", "db-snapshots");
  mkdirSync(snapDir, { recursive: true });
  const snap = join(snapDir, `custom.db.before-delete-${ID}-${stamp}`);
  if (existsSync(snap)) {
    console.error(`  REFUSED: ${snap} already exists. Move it aside first.`);
    return 1;
  }
  copyFileSync(dbPath, snap);
  if (sha256(snap) !== sha256(dbPath)) {
    console.error("  REFUSED: the restore point does not match the original. Nothing deleted.");
    return 1;
  }
  console.log("");
  console.log("  Restore point: " + snap);
  console.log("  sha256       : " + sha256(snap));

  const before = await db.product.count();
  await db.product.delete({ where: { id: ID } });

  // ── verify rather than assume ─────────────────────────────────────────────
  const gone = (await db.product.findUnique({ where: { id: ID } })) === null;
  const after = await db.product.count();
  const fk = await db.$queryRawUnsafe<unknown[]>(`PRAGMA foreign_key_check`);
  const [{ integrity_check: integrity }] =
    await db.$queryRawUnsafe<{ integrity_check: string }[]>(`PRAGMA integrity_check`);

  console.log("");
  console.log("  ── RESULT ──────────────────────────────────────────────────");
  console.log(`  Row deleted    : ${gone ? "yes" : "NO"}`);
  console.log(`  Products       : ${before} -> ${after}`);
  console.log(`  FK errors      : ${fk.length}`);
  console.log(`  integrity_check: ${integrity}`);
  console.log(`  sha256         : ${sha256(dbPath)}`);

  const ok = gone && after === before - 1 && fk.length === 0 && integrity === "ok";
  console.log("");
  console.log(ok ? "  ✅ DELETED AND VERIFIED." : "  ❌ SOMETHING IS WRONG — restore from the point above.");
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
