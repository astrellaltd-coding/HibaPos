#!/usr/bin/env bun
/**
 * Read-only: one number that says whether two installs hold the same menu.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Carrying the Tacos to France is a script per change (`add-tacos.ts`,
 * `set-option-quotas.ts`) because the catalogue transfer cannot be used yet —
 * the option ceilings do not travel (L-225) and the import refuses a non-empty
 * destination (L-226). A script per change needs a way to prove it landed, and
 * on 2026-09-19 that proof was produced by a throwaway in the scratchpad. The
 * number it printed — `2d62a6b83ba006bf` — went into the hand-over as the
 * thing France should expect, and **the code that produced it no longer
 * exists**. That is L-229. This file is the replacement, in version control,
 * where the next session can run the same comparison rather than guess at it.
 *
 * ── IDS ARE IGNORED, AND THAT IS THE WHOLE DESIGN ───────────────────────────
 * `add-tacos.ts` creates its rows with `@default(cuid())`, so the Tacos rows in
 * France will NEVER carry the same ids as the ones here. A digest over raw rows
 * therefore cannot match across two machines however correct the update was —
 * it would report a successful transfer as a failed one, which is the specific
 * trap this file exists to remove.
 *
 * So every row is reduced to a NATURAL KEY built from names, resolved through
 * its parents, plus its own non-id columns:
 *
 *     Category               name                       (`@unique`)
 *     Product                <category>/<name>
 *     OptionGroup            <product>/<name>
 *     OptionChoice           <group>/<name>
 *     CategoryOptionGroup    <category>/<name>
 *     CategoryOptionChoice   <group>/<name>
 *     CategoryAddOn          <category>/<name>
 *     ComboSlot              <product>/<name>
 *     ComboSlotChoice        <slot>/<product>
 *     ComboSlotOptionRule    <slot>/<group>/<choice>
 *     ProductOptionQuota     <product>/<group>
 *
 * Rows are sorted by that key, so insertion order does not count either. The
 * section digest is `sha256(the sorted lines).slice(0, 16)`; the catalogue
 * fingerprint is the same over the section lines. Two installs printing the
 * same fingerprint hold the same menu — same names, prices, VAT rates, sort
 * orders, ceilings — whatever ids they gave it.
 *
 * `createdAt` is NOT in any list. It records when a row was typed, which is
 * different on every machine and is not part of what a menu IS.
 *
 * ── IT COVERS THE CEILINGS, WHICH THE TRANSFER DOES NOT ─────────────────────
 * `ProductOptionQuota` is the eleventh section and is deliberately NOT one of
 * `CATALOGUE_TABLES` — that omission is L-225. A fingerprint that skipped it
 * would go green on a France till where a Tacos M takes all six viandes for
 * 6,90 €, which is exactly the bug (L-217) the ceilings were added to stop. If
 * the table is absent the section says so rather than being silently dropped,
 * because « no ceilings » and « no such column » are different situations.
 *
 * ── WRITES NOTHING ──────────────────────────────────────────────────────────
 * `bun:sqlite` with `readonly: true`, as the plan's method requires for live
 * data — never Prisma, which would run the WAL startup hook against the
 * production file. Safe to run on the France till while it is serving.
 */
import { Database } from "bun:sqlite";
import { createHash } from "crypto";
import { resolvedDatabasePath } from "../src/lib/paths";

/** `sha256`, truncated. Sixteen hex characters is enough to compare two menus
 *  by eye over a telephone, which is how this one will actually be used. */
const h16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

type Row = Record<string, unknown>;

/**
 * A section: the table, the columns whose VALUES are compared, and how to build
 * the natural key. `key` names the parent columns to resolve, in order; `self`
 * names the row's own column that finishes the key.
 */
type Section = {
  table: string;
  /** Compared as values. Never contains an id. */
  values: string[];
  /** Parent columns to resolve into the key, each with the table it points at. */
  parents: { column: string; table: string }[];
  /** The row's own column that completes the key — omitted when the parents suffice. */
  self?: string;
};

const SECTIONS: Section[] = [
  { table: "Category", values: ["color", "icon", "sortOrder", "active", "vatRate", "vatRateTakeaway"], parents: [{ column: "parentId", table: "Category" }], self: "name" },
  { table: "Product", values: ["description", "price", "pickupPrice", "deliveryPrice", "vatRate", "image", "active", "available", "inheritCategoryGlobals", "inheritCategoryVat", "isCombo", "showOnPos", "sortOrder"], parents: [{ column: "categoryId", table: "Category" }], self: "name" },
  { table: "OptionGroup", values: ["required", "multiple", "sortOrder"], parents: [{ column: "productId", table: "Product" }], self: "name" },
  { table: "OptionChoice", values: ["priceModifier", "pickupPriceModifier", "deliveryPriceModifier", "image", "sortOrder"], parents: [{ column: "groupId", table: "OptionGroup" }], self: "name" },
  { table: "CategoryOptionGroup", values: ["required", "multiple", "sortOrder"], parents: [{ column: "categoryId", table: "Category" }], self: "name" },
  { table: "CategoryOptionChoice", values: ["priceModifier", "pickupPriceModifier", "deliveryPriceModifier", "pickupPrice", "deliveryPrice", "image", "sortOrder"], parents: [{ column: "groupId", table: "CategoryOptionGroup" }], self: "name" },
  { table: "CategoryAddOn", values: ["price", "image", "sortOrder", "active", "vatRate", "vatRateTakeaway"], parents: [{ column: "categoryId", table: "Category" }], self: "name" },
  { table: "ComboSlot", values: ["quantity", "sortOrder"], parents: [{ column: "productId", table: "Product" }, { column: "sourceCategoryId", table: "Category" }], self: "name" },
  { table: "ComboSlotChoice", values: ["surcharge", "sortOrder"], parents: [{ column: "slotId", table: "ComboSlot" }, { column: "productId", table: "Product" }] },
  { table: "ComboSlotOptionRule", values: [], parents: [{ column: "slotId", table: "ComboSlot" }, { column: "categoryOptionGroupId", table: "CategoryOptionGroup" }, { column: "categoryOptionChoiceId", table: "CategoryOptionChoice" }] },
  // L-225: not a CATALOGUE_TABLES member, and the reason the tacos cannot be
  // carried by the transfer. Covered here on purpose.
  { table: "ProductOptionQuota", values: ["included"], parents: [{ column: "productId", table: "Product" }, { column: "groupId", table: "CategoryOptionGroup" }] },
];

/** How each table's own natural key is built, used when resolving a parent. */
const KEY_OF: Record<string, { parents: { column: string; table: string }[]; self?: string }> = Object.fromEntries(
  SECTIONS.map((s) => [s.table, { parents: s.parents, self: s.self }]),
);

const target = process.argv[2] ?? resolvedDatabasePath();
const db = new Database(target, { readonly: true });

function exists(table: string): boolean {
  return !!db.query("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
}

const cache = new Map<string, string>();

/**
 * The natural key of one row, resolved through its parents.
 *
 * Memoised per table+id, and guarded against a cycle — `Category.parentId`
 * points at `Category`, and a catalogue whose parent chain looped would
 * otherwise hang here rather than report anything.
 */
function keyOf(table: string, id: unknown, seen: Set<string> = new Set()): string {
  if (id === null || id === undefined) return "-";
  const memo = table + ":" + String(id);
  const hit = cache.get(memo);
  if (hit !== undefined) return hit;
  if (seen.has(memo)) return "<<cycle>>";
  seen.add(memo);

  const spec = KEY_OF[table];
  if (!spec) return String(id);
  const cols = [...spec.parents.map((p) => p.column), ...(spec.self ? [spec.self] : [])];
  const row = db
    .query('SELECT ' + cols.map((c) => '"' + c + '"').join(", ") + ' FROM "' + table + '" WHERE id = ?')
    .get(id as string) as Row | null;
  if (!row) return "<<missing " + table + " " + String(id) + ">>";

  const parts = spec.parents.map((p) => keyOf(p.table, row[p.column], seen));
  if (spec.self) parts.push(String(row[spec.self]));
  const key = parts.filter((p) => p !== "-").join("/");
  cache.set(memo, key);
  return key;
}

console.log("database : " + target);
console.log("");

const sectionLines: string[] = [];
let absent = 0;

for (const s of SECTIONS) {
  if (!exists(s.table)) {
    absent++;
    sectionLines.push(s.table + " ABSENT");
    console.log("  " + s.table.padEnd(22) + "   TABLE ABSENT — this install's schema is behind");
    continue;
  }
  const cols = ["id", ...s.parents.map((p) => p.column), ...(s.self ? [s.self] : []), ...s.values];
  const rows = db.query('SELECT ' + cols.map((c) => '"' + c + '"').join(", ") + ' FROM "' + s.table + '"').all() as Row[];

  const lines = rows
    .map((r) => {
      const key = [
        ...s.parents.map((p) => keyOf(p.table, r[p.column])),
        ...(s.self ? [String(r[s.self])] : []),
      ]
        .filter((p) => p !== "-")
        .join("/");
      const vals = s.values.map((v) => v + "=" + String(r[v]));
      return key + "" + vals.join("");
    })
    .sort();

  const digest = h16(lines.join("\n"));
  sectionLines.push(s.table + " " + lines.length + " " + digest);
  console.log("  " + s.table.padEnd(22) + String(lines.length).padStart(5) + " rows   " + digest);
}

const fingerprint = h16(sectionLines.join("\n"));
const products = exists("Product")
  ? (db.query('SELECT COUNT(*) AS c FROM "Product"').get() as { c: number }).c
  : -1;

console.log("");
console.log("  CATALOGUE FINGERPRINT : " + fingerprint);
console.log("  products              : " + products);
if (absent) {
  console.log("");
  console.log("  " + absent + " table(s) absent. The fingerprint above is NOT comparable with an");
  console.log("  install whose schema is complete — apply the pending migrations first.");
}
console.log("");
console.log("  Two installs holding the same menu print the same fingerprint, whatever");
console.log("  ids they gave it. When they differ, the section digests above say which");
console.log("  part of the menu differs; the row counts beside them usually say why.");

db.close();
