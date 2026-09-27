/**
 * L-238. The reset's closing line said « Catalogue intact … aucun changement »
 * on the strength of sixteen row COUNTS. These tests are about the two ways
 * that sentence was weaker than it read: a change that does not move a count,
 * and a table nobody remembered to put on the list.
 */
import { describe, it, expect } from "vitest";
import {
  verifiedTables,
  digestRows,
  digestTables,
  overallDigest,
  changedTables,
  type TableSnapshotReader,
} from "@/lib/services/preserved-digest";

/** The reset's two lists, as at 2026-09-27. */
const EMPTIED = ["Order", "OrderItem", "Receipt", "FiscalEvent"] as const;
const REWRITTEN = ["FiscalCounter"] as const;

/** A schema shaped like this one: the two lists, plus preserved tables, plus
 *  `ProductOptionQuota`, which is in NEITHER list in the real script. */
const SCHEMA = [
  "Order",
  "OrderItem",
  "Receipt",
  "FiscalEvent",
  "FiscalCounter",
  "Product",
  "Category",
  "ProductOptionQuota",
  "Setting",
  "User",
  "_prisma_migrations",
  "sqlite_sequence",
];

function reader(
  tables: Record<string, { columns: string[]; rows: Record<string, unknown>[] }>,
): TableSnapshotReader {
  return {
    tableNames: async () => Object.keys(tables),
    columns: async (t) => tables[t].columns,
    rows: async (t) => tables[t].rows,
  };
}

describe("verifiedTables — derived from the schema, not from a list somebody maintains", () => {
  it("covers a table that is in NEITHER of the reset's lists", () => {
    // This is the L-238 half that L-72 already taught once and L-225 twice.
    // `ProductOptionQuota` holds the option ceilings — how many viandes a
    // `Tacos M` includes before the caisse refuses. It appears NOWHERE in
    // pre-golive-reset.ts, so nothing deleted it and nothing checked it.
    expect(verifiedTables(SCHEMA, EMPTIED, REWRITTEN)).toContain("ProductOptionQuota");
  });

  it("excludes what the reset empties, what it rewrites, and SQLite's own tables", () => {
    const verified = verifiedTables(SCHEMA, EMPTIED, REWRITTEN);
    for (const t of [...EMPTIED, ...REWRITTEN]) expect(verified).not.toContain(t);
    expect(verified).not.toContain("_prisma_migrations");
    expect(verified).not.toContain("sqlite_sequence");
    expect(verified).toEqual(["Category", "Product", "ProductOptionQuota", "Setting", "User"]);
  });

  it("refuses a schema where the exclusions do not exist, because a typo would excuse a table", () => {
    expect(() => verifiedTables(SCHEMA, ["Odrer"], REWRITTEN)).toThrow(/absentes du schema/);
  });

  it("refuses to verify nothing at all", () => {
    // The vacuity guard. A sweep that passes by sweeping nothing is the most
    // repeated test bug in this repository.
    expect(() => verifiedTables(["Order"], ["Order"], [])).toThrow(/n'a rien retenu/);
  });

  it("reads in the preferred order, then alphabetically", () => {
    expect(verifiedTables(SCHEMA, EMPTIED, REWRITTEN, ["User", "Product"])).toEqual([
      "User",
      "Product",
      "Category",
      "ProductOptionQuota",
      "Setting",
    ]);
  });
});

describe("digestRows — what a count cannot see", () => {
  const columns = ["id", "name", "price", "vatRate", "image"];
  const before = [
    { id: "p1", name: "Tacos M", price: 690, vatRate: 10, image: null },
    { id: "p2", name: "Coca", price: 150, vatRate: 5.5, image: null },
  ];

  it("MOVES when a price changes and the row count does not — the whole finding", () => {
    const after = [
      { id: "p1", name: "Tacos M", price: 750, vatRate: 10, image: null },
      { id: "p2", name: "Coca", price: 150, vatRate: 5.5, image: null },
    ];
    expect(after.length).toBe(before.length);
    expect(digestRows(columns, after)).not.toBe(digestRows(columns, before));
  });

  it("MOVES when only an image is attached — the change measured on the till", () => {
    // 2026-09-20: `Product` moved from `49c19fa9482a4c22` to
    // `a389811326c53d5c` on the Tacos photograph while the count stayed at 86,
    // and the reset printed « aucun changement ».
    const after = before.map((r) => (r.id === "p1" ? { ...r, image: "/uploads/Tacos.webp" } : r));
    expect(digestRows(columns, after)).not.toBe(digestRows(columns, before));
  });

  it("MOVES when a VAT rate stops being a number and becomes a string", () => {
    const after = before.map((r) => (r.id === "p2" ? { ...r, vatRate: "5.5" } : r));
    expect(digestRows(columns, after)).not.toBe(digestRows(columns, before));
  });

  it("distinguishes NULL from the empty string", () => {
    const withNull = [{ id: "a", name: null }];
    const withEmpty = [{ id: "a", name: "" }];
    expect(digestRows(["id", "name"], withNull)).not.toBe(digestRows(["id", "name"], withEmpty));
  });

  it("MOVES when an id changes, unlike catalogue-fingerprint.ts", () => {
    // Deliberately different from the cross-install fingerprint, which ignores
    // ids because two installs mint different `cuid()`s. Here the comparison is
    // one database against itself, so an id that moved is a real change.
    const after = before.map((r) => (r.id === "p1" ? { ...r, id: "p9" } : r));
    expect(digestRows(columns, after)).not.toBe(digestRows(columns, before));
  });

  it("MOVES when a column is dropped even though every remaining value is identical", () => {
    const shorter = columns.filter((c) => c !== "image");
    expect(digestRows(shorter, before)).not.toBe(digestRows(columns, before));
  });

  it("does NOT move when only row order differs", () => {
    // A false alarm here is a red line at the one moment nothing can be undone.
    expect(digestRows(columns, [...before].reverse())).toBe(digestRows(columns, before));
  });

  it("is stable across Date, bigint and byte values", () => {
    const cols = ["at", "n", "blob"];
    const rows = [
      { at: new Date("2026-09-20T18:00:00.000Z"), n: BigInt(42), blob: new Uint8Array([1, 2, 3]) },
    ];
    const same = [
      { at: new Date("2026-09-20T18:00:00.000Z"), n: BigInt(42), blob: new Uint8Array([1, 2, 3]) },
    ];
    expect(digestRows(cols, rows)).toBe(digestRows(cols, same));
    expect(digestRows(cols, [{ ...rows[0], n: BigInt(43) }])).not.toBe(digestRows(cols, rows));
  });

  it("treats a bigint and a number of the same value as equal", () => {
    // Prisma's raw SQLite reader returns either for an INTEGER column, and a
    // reset that reported « LE CATALOGUE A CHANGE » because of that would be
    // worse than the defect it replaced.
    expect(digestRows(["n"], [{ n: BigInt(7) }])).toBe(digestRows(["n"], [{ n: 7 }]));
  });

  it("an empty table has a digest, and it is not the digest of a different empty table", () => {
    expect(digestRows(["id"], [])).toBe(digestRows(["id"], []));
    expect(digestRows(["id"], [])).not.toBe(digestRows(["id", "name"], []));
  });
});

describe("digestTables and changedTables", () => {
  const snapshot = {
    Product: { columns: ["id", "price"], rows: [{ id: "p1", price: 690 }] },
    Setting: { columns: ["key", "value"], rows: [{ key: "factice", value: "true" }] },
  };

  it("names exactly the table whose content moved", async () => {
    const before = await digestTables(reader(snapshot), ["Product", "Setting"]);
    const after = await digestTables(
      reader({ ...snapshot, Product: { columns: ["id", "price"], rows: [{ id: "p1", price: 750 }] } }),
      ["Product", "Setting"],
    );
    expect(changedTables(before, after)).toEqual(["Product"]);
  });

  it("reports nothing when nothing moved", async () => {
    const before = await digestTables(reader(snapshot), ["Product", "Setting"]);
    const after = await digestTables(reader(snapshot), ["Product", "Setting"]);
    expect(changedTables(before, after)).toEqual([]);
    expect(overallDigest(before)).toBe(overallDigest(after));
  });

  it("reports a table that disappeared between the two snapshots", () => {
    expect(changedTables({ Product: "aaaa", Setting: "bbbb" }, { Product: "aaaa" })).toEqual([
      "Setting",
    ]);
  });

  it("the overall digest moves when any one table moves", () => {
    expect(overallDigest({ A: "1", B: "2" })).not.toBe(overallDigest({ A: "1", B: "3" }));
  });
});
