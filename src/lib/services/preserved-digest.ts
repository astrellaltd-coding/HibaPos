/**
 * Content fingerprints for the tables a reset must leave alone (**L-238**).
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `scripts/pre-golive-reset.ts` ended with
 *
 *     Catalogue intact (16 tables verifiees, aucun changement)
 *
 * and what it had compared was sixteen row COUNTS. A product whose price, VAT
 * rate, image or availability changed during the run was reported as « aucun
 * changement », in the one script in this repository that has no undo.
 *
 * It is not hypothetical. On the France till on 2026-09-20 the reset printed
 * that line and `catalogue-fingerprint.ts`, run immediately afterwards, showed
 * the `Product` section digest had moved — `49c19fa9482a4c22` →
 * `a389811326c53d5c` — while the count sat at 86 throughout. The cause was
 * benign (the operator had attached the Tacos photograph minutes earlier) and
 * that is exactly the finding: **the line cannot tell a benign change from the
 * other kind.**
 *
 * ── WHY THE TABLE LIST IS DERIVED AND NOT WRITTEN DOWN ──────────────────────
 * A hand-maintained list of « what to check » has now failed three times in
 * this project, each time silently:
 *
 *   L-72   the three `ComboSlot*` tables postdated the script and were in
 *          NEITHER of its lists, so « Catalogue intact » was printed without
 *          ever looking at the menus. The fix added them to the list.
 *   L-225  `ProductOptionQuota` was missing from `CATALOGUE_TABLES`, so an
 *          export dropped the option ceilings. The fix DERIVED the list.
 *   L-238  `ProductOptionQuota` is in neither of the reset's lists either —
 *          measured 2026-09-27, it appears nowhere in that file. Nothing
 *          deletes it, so the ceilings were never at risk; they were simply
 *          never verified. **That is L-72 for the third time.**
 *
 * So the question is asked of the SCHEMA: every table SQLite reports, minus
 * the ones the reset deliberately empties, minus the counter it deliberately
 * rewrites, is a table whose content must come out identical. A table added
 * tomorrow is covered on the day it is added, by nobody remembering anything.
 *
 * ── WHAT A DIGEST COVERS, AND WHAT IT DELIBERATELY DOES NOT ─────────────────
 * Ids ARE included, unlike `catalogue-fingerprint.ts`, and the difference is
 * the purpose. That script compares two INSTALLS, where the same menu carries
 * different `cuid()`s, so it reduces rows to natural keys. This one compares
 * one database with ITSELF, minutes apart, where an id that moved is a change
 * worth shouting about.
 *
 * Row ORDER is not covered: the serialised rows are sorted before hashing, so
 * only content counts. A false alarm in this script costs the operator a
 * frightening red line at the one moment nothing can be undone, and physical
 * order is not something the reset promises anything about.
 */
import { createHash } from "crypto";

/** Tables that are not application data and never take part. */
const NOT_APPLICATION_DATA = [/^sqlite_/, /^_prisma_migrations$/];

const isApplicationData = (table: string) =>
  !NOT_APPLICATION_DATA.some((re) => re.test(table));

/** What `verifiedTables` needs to know about the database. */
export interface TableSnapshotReader {
  /** Every table SQLite reports, application data or not. */
  tableNames(): Promise<string[]>;
  /** Column names for one table, in declaration order. */
  columns(table: string): Promise<string[]>;
  /** Every row of one table, as objects keyed by column name. */
  rows(table: string, columns: string[]): Promise<Record<string, unknown>[]>;
}

export type Digests = Record<string, string>;

/**
 * The tables whose content a reset must not change: everything in the schema
 * except what it empties and what it rewrites.
 *
 * `preferredOrder` only decides how the report READS — names in it come first,
 * in its order, and anything else follows alphabetically. A name missing from
 * it therefore costs a tidy report and never costs a check, which is the whole
 * difference between this and the list L-72 and L-225 were about.
 *
 * @throws if `emptied` or `rewritten` names a table the schema does not have —
 *   a typo there would silently excuse a table from verification — or if the
 *   result is empty, which is how a sweep passes by sweeping nothing.
 */
export function verifiedTables(
  allTables: readonly string[],
  emptied: readonly string[],
  rewritten: readonly string[],
  preferredOrder: readonly string[] = [],
): string[] {
  const present = new Set(allTables);
  const unknown = [...emptied, ...rewritten].filter((t) => !present.has(t));
  if (unknown.length) {
    throw new Error(
      `Ces tables sont exclues de la verification mais absentes du schema : ${unknown.join(", ")}. ` +
        "Une faute de frappe ici dispense une table de tout controle.",
    );
  }

  const excluded = new Set([...emptied, ...rewritten]);
  const verified = allTables.filter((t) => isApplicationData(t) && !excluded.has(t));

  if (!verified.length) {
    throw new Error(
      "Aucune table a verifier : la derivation n'a rien retenu, donc le controle ne prouverait rien.",
    );
  }

  const rank = (t: string) => {
    const i = preferredOrder.indexOf(t);
    return i === -1 ? preferredOrder.length : i;
  };
  return verified.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * One value, serialised so that types cannot be confused with each other.
 *
 * The prefixes are the point: a VAT rate that turned from the number `10` into
 * the string `"10"` is a change, and `null` is not the empty string. Without
 * them a digest would report « aucun changement » for exactly the kind of
 * quiet coercion this file exists to catch.
 */
function serialiseValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") return `n:${value.toString()}`;
  if (typeof value === "number") return `n:${String(value)}`;
  if (typeof value === "string") return `s:${value}`;
  if (typeof value === "boolean") return `b:${value ? 1 : 0}`;
  if (value instanceof Date) return `d:${value.toISOString()}`;
  if (value instanceof Uint8Array) return `x:${Buffer.from(value).toString("base64")}`;
  return `j:${JSON.stringify(value)}`;
}

/** A stable digest of one table's content. Row order does not count; values do. */
export function digestRows(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): string {
  const lines = rows
    .map((row) => columns.map((c) => `${c}=${serialiseValue(row[c])}`).join("\u001f"))
    .sort();
  const h = createHash("sha256");
  // The column list is hashed first, so a dropped or renamed column moves the
  // digest even if every remaining value is identical.
  h.update(`${columns.join("\u001f")}\u001e`);
  for (const line of lines) h.update(`${line}\u001e`);
  return h.digest("hex").slice(0, 16);
}

/** Digest every named table. */
export async function digestTables(
  reader: TableSnapshotReader,
  tables: readonly string[],
): Promise<Digests> {
  const out: Digests = {};
  for (const t of tables) {
    const columns = await reader.columns(t);
    out[t] = digestRows(columns, await reader.rows(t, columns));
  }
  return out;
}

/** One digest over a whole set, for the single line the operator reads. */
export function overallDigest(digests: Digests): string {
  const h = createHash("sha256");
  for (const table of Object.keys(digests).sort()) h.update(`${table}=${digests[table]}\u001e`);
  return h.digest("hex").slice(0, 16);
}

/**
 * Which tables differ between two snapshots — including one that appeared or
 * disappeared, because a table the second snapshot cannot see is not a table
 * that came through the reset unchanged.
 */
export function changedTables(before: Digests, after: Digests): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((t) => before[t] !== after[t])
    .sort();
}
