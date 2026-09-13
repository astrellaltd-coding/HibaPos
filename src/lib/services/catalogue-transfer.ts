// Catalogue export / import — carrying a real catalogue into a fresh install.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// The operator settled on 2026-09-11 that the restaurant gets a **fresh
// install**, keeping this catalogue because it is the correct one. Nothing in
// the app could do that: no script exported catalogue data, `csv-export.ts`
// covers the dashboard only, and `/api/seed` seeds a DEMO catalogue
// (« Fanta 33cl » at 20 % VAT). The only route was to carry `db/custom.db`
// itself, which is not a fresh install.
//
// ── WHAT TRAVELS, AND WHAT DELIBERATELY DOES NOT ────────────────────────────
// The ten tables below, in dependency order — 266 rows on the live catalogue,
// which is a JSON file of tens of kilobytes.
//
// **Images do not travel.** Every image column holds a PATH
// (`/uploads/Produits/margarita.png`), and those 147 files are tracked in git
// (DD-16), so they arrive with the application. `verifyImages` reports any
// referenced file that is missing from disk — at export time, where it can
// still be fixed, rather than on install day.
//
// **`Setting` does not travel**, on the operator's instruction. The printer
// queue and `factice` are properties of an install, not of a catalogue, and
// carrying them is how a fresh install arrives live and pointed at the wrong
// printer.
//
// **Trading data does not travel.** Not orders, not the journal, not closes.
// A catalogue is not a history.
//
// ── IDS ARE PRESERVED ───────────────────────────────────────────────────────
// Every row keeps its `id`. R2.1's whole invariant is that a thing is counted
// under its identity and never under its label, so an export whose ids were
// regenerated would be a catalogue that no past sale could be matched against.
// It is harmless today — zero orders exist — and would be a trap the first
// time somebody imported into a database that had traded. Which `assertEmpty`
// refuses anyway, for the same reason.
//
// ── ONE TRANSACTION, AND IT REFUSES A NON-EMPTY CATALOGUE ───────────────────
// Import is all-or-nothing and only ever writes into an empty catalogue. It
// does not merge: `Category.name` is `@unique`, and a merge is where silent
// duplicates come from — this project already carries L-82, three pairs of
// products that shared a name, for exactly that reason.
import type { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { existsSync } from "fs";
import path from "path";

/** Bumped when the shape changes in a way an older importer cannot read. */
export const CATALOGUE_FORMAT = "hibapos-catalogue/1";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * The tables that make up a catalogue, in FK-safe insert order, each with the
 * columns that travel.
 *
 * The column lists are EXPLICIT and not `SELECT *`, so that adding a column to
 * one of these models is a decision rather than a silent inclusion — and
 * `catalogue-transfer.test.ts` compares each list against the database's own
 * `PRAGMA table_info`, so a new column fails a test until somebody says whether
 * it should travel. `updatedAt` is never in a list: it is `@updatedAt`, and the
 * honest value on import is the moment the row was written.
 */
export const CATALOGUE_TABLES = [
  { model: "category", table: "Category",
    fields: ["id", "name", "color", "icon", "sortOrder", "active", "vatRate", "vatRateTakeaway", "createdAt", "parentId"] },
  { model: "product", table: "Product",
    fields: ["id", "name", "description", "price", "pickupPrice", "deliveryPrice", "vatRate", "categoryId", "image", "active", "available", "inheritCategoryGlobals", "inheritCategoryVat", "isCombo", "showOnPos", "sortOrder", "createdAt"] },
  { model: "optionGroup", table: "OptionGroup",
    fields: ["id", "productId", "name", "required", "multiple", "sortOrder"] },
  { model: "optionChoice", table: "OptionChoice",
    fields: ["id", "groupId", "name", "priceModifier", "pickupPriceModifier", "deliveryPriceModifier", "image", "sortOrder"] },
  { model: "categoryOptionGroup", table: "CategoryOptionGroup",
    fields: ["id", "categoryId", "name", "required", "multiple", "sortOrder"] },
  { model: "categoryOptionChoice", table: "CategoryOptionChoice",
    fields: ["id", "groupId", "name", "priceModifier", "pickupPriceModifier", "deliveryPriceModifier", "pickupPrice", "deliveryPrice", "image", "sortOrder"] },
  { model: "categoryAddOn", table: "CategoryAddOn",
    // L-94 (R8.5): `vatRate` and `vatRateTakeaway` travel. A supplement's own
    // rate is catalogue data like its price, and an export that dropped it
    // would land every supplement back on `defaultVatRate` in the new install.
    fields: ["id", "categoryId", "name", "price", "image", "sortOrder", "active", "vatRate", "vatRateTakeaway"] },
  { model: "comboSlot", table: "ComboSlot",
    fields: ["id", "productId", "name", "quantity", "sortOrder", "sourceCategoryId"] },
  { model: "comboSlotChoice", table: "ComboSlotChoice",
    fields: ["id", "slotId", "productId", "surcharge", "sortOrder"] },
  { model: "comboSlotOptionRule", table: "ComboSlotOptionRule",
    fields: ["id", "slotId", "categoryOptionGroupId", "categoryOptionChoiceId"] },
] as const;

type Row = Record<string, unknown>;

export type CatalogueExport = {
  format: string;
  exportedAt: string;
  /** The software that wrote it, and the schema it was written against. Carried
   *  so a mismatch is READABLE on import rather than inferred from a failure. */
  software: string;
  migration: string | null;
  counts: Record<string, number>;
  /** Referenced image paths with no file on disk. Empty is the healthy case. */
  missingImages: string[];
  tables: Record<string, Row[]>;
};

/** Columns that hold an image PATH, per table — for the on-disk check. */
const IMAGE_FIELDS: Record<string, string> = {
  Product: "image",
  OptionChoice: "image",
  CategoryOptionChoice: "image",
  CategoryAddOn: "image",
};

/** `/uploads/x.png` -> `<cwd>/public/uploads/x.png`. Paths are app-relative. */
function imageFile(p: string): string {
  return path.join(process.cwd(), "public", p.replace(/^\/+/, ""));
}

/**
 * The schema this catalogue was written against, or null.
 *
 * ASKS WHETHER THE TABLE EXISTS FIRST, rather than querying it and catching
 * the failure — `_prisma_migrations` is absent from any database built with
 * `prisma db push`, which is every test database here. A `try/catch` around
 * the query returns the right answer and still emits a `prisma:error` block
 * per call, because Prisma logs before the `catch` runs. That is R4.3's lesson
 * at a new site: a clean suite run has zero of those blocks and this would
 * have added eight.
 */
async function latestMigration(client: Tx): Promise<string | null> {
  const present = await client.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'`,
  );
  if (!present.length) return null;
  const rows = await client.$queryRawUnsafe<{ migration_name: string }[]>(
    `SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1`,
  );
  return rows[0]?.migration_name ?? null;
}

/** Read the whole catalogue. Read-only: it writes nothing, anywhere. */
export async function exportCatalogue(client: Tx = db): Promise<CatalogueExport> {
  const tables: Record<string, Row[]> = {};
  const counts: Record<string, number> = {};
  const missingImages: string[] = [];

  for (const { model, table, fields } of CATALOGUE_TABLES) {
    const cols = fields.map((f) => `"${f}"`).join(", ");
    // Ordered by id so two exports of the same catalogue are byte-identical,
    // which is what makes a diff between them meaningful.
    const rows = await client.$queryRawUnsafe<Row[]>(
      `SELECT ${cols} FROM "${table}" ORDER BY "id"`,
    );
    // Dates come back as Date or as epoch ms depending on the driver; ISO
    // strings survive JSON and are unambiguous either way.
    for (const r of rows) {
      if (r.createdAt instanceof Date) r.createdAt = r.createdAt.toISOString();
      else if (typeof r.createdAt === "number") r.createdAt = new Date(r.createdAt).toISOString();
    }
    tables[model] = rows;
    counts[model] = rows.length;

    const imageField = IMAGE_FIELDS[table];
    if (imageField) {
      for (const r of rows) {
        const p = r[imageField];
        if (typeof p === "string" && p && !p.startsWith("data:") && !existsSync(imageFile(p))) {
          missingImages.push(p);
        }
      }
    }
  }

  const { SOFTWARE_IDENTITY } = await import("@/lib/version");
  return {
    format: CATALOGUE_FORMAT,
    exportedAt: new Date().toISOString(),
    software: SOFTWARE_IDENTITY,
    migration: await latestMigration(client),
    counts,
    missingImages: [...new Set(missingImages)].sort(),
    tables,
  };
}

export class CatalogueImportError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "CatalogueImportError";
    this.status = status;
  }
}

export const NOT_EMPTY_REFUSAL =
  "Le catalogue n'est pas vide. L'import ne fusionne pas : videz le catalogue ou repartez d'une installation neuve.";
export const BAD_FORMAT_REFUSAL = `Format inattendu. Attendu « ${CATALOGUE_FORMAT} ».`;

/** Shape-check the payload without trusting any of it. */
export function parseCatalogueExport(raw: unknown): CatalogueExport {
  if (!raw || typeof raw !== "object") throw new CatalogueImportError(BAD_FORMAT_REFUSAL);
  const p = raw as Partial<CatalogueExport>;
  if (p.format !== CATALOGUE_FORMAT) throw new CatalogueImportError(BAD_FORMAT_REFUSAL);
  if (!p.tables || typeof p.tables !== "object") throw new CatalogueImportError(BAD_FORMAT_REFUSAL);
  for (const { model } of CATALOGUE_TABLES) {
    const rows = (p.tables as Record<string, unknown>)[model];
    if (rows !== undefined && !Array.isArray(rows)) {
      throw new CatalogueImportError(`« ${model} » doit être une liste.`);
    }
  }
  return {
    format: p.format,
    exportedAt: typeof p.exportedAt === "string" ? p.exportedAt : "",
    software: typeof p.software === "string" ? p.software : "",
    migration: typeof p.migration === "string" ? p.migration : null,
    counts: {},
    missingImages: [],
    tables: p.tables as Record<string, Row[]>,
  };
}

/**
 * Every reference inside a catalogue file, as `model.field -> model`.
 *
 * This is the catalogue's shape written down once. It exists so that a
 * dangling reference is refused in French BEFORE anything is written, instead
 * of arriving as Prisma's « Foreign key constraint violated on the foreign
 * key » — which names no row, no table and no id, and is what a hand-edited
 * file produces. `catalogue-transfer.test.ts` asserts the map covers every FK
 * column of every travelling table.
 */
export const CATALOGUE_REFERENCES: { from: string; field: string; to: string; nullable?: true }[] = [
  { from: "category", field: "parentId", to: "category", nullable: true },
  { from: "product", field: "categoryId", to: "category" },
  { from: "optionGroup", field: "productId", to: "product" },
  { from: "optionChoice", field: "groupId", to: "optionGroup" },
  { from: "categoryOptionGroup", field: "categoryId", to: "category" },
  { from: "categoryOptionChoice", field: "groupId", to: "categoryOptionGroup" },
  { from: "categoryAddOn", field: "categoryId", to: "category" },
  { from: "comboSlot", field: "productId", to: "product" },
  { from: "comboSlot", field: "sourceCategoryId", to: "category" },
  { from: "comboSlotChoice", field: "slotId", to: "comboSlot" },
  { from: "comboSlotChoice", field: "productId", to: "product" },
  { from: "comboSlotOptionRule", field: "slotId", to: "comboSlot" },
  { from: "comboSlotOptionRule", field: "categoryOptionGroupId", to: "categoryOptionGroup" },
  { from: "comboSlotOptionRule", field: "categoryOptionChoiceId", to: "categoryOptionChoice", nullable: true },
];

/** Refuse a file whose references do not resolve within itself. */
export function assertReferencesResolve(tables: Record<string, Row[]>): void {
  const known: Record<string, Set<string>> = {};
  for (const { model } of CATALOGUE_TABLES) {
    known[model] = new Set((tables[model] ?? []).map((r) => String(r.id)));
  }
  const dangling: string[] = [];
  for (const { from, field, to, nullable } of CATALOGUE_REFERENCES) {
    for (const row of tables[from] ?? []) {
      const v = row[field];
      if (v === null || v === undefined || v === "") {
        if (!nullable) dangling.push(`${from}.${field} manquant (id ${String(row.id)})`);
        continue;
      }
      if (!known[to].has(String(v))) {
        dangling.push(`${from}.${field} = « ${String(v) }» introuvable dans ${to} (id ${String(row.id)})`);
      }
    }
  }
  if (dangling.length) {
    throw new CatalogueImportError(
      `Fichier incohérent : ${dangling.length} référence(s) ne pointent sur rien. ${dangling.slice(0, 5).join(" · ")}`,
    );
  }
}

/** Every catalogue table must be empty, not merely `Product` — one stray
 *  `Category` collides on its unique name and takes the whole import down
 *  halfway, and « halfway » is the state this refusal exists to prevent. */
async function assertEmpty(client: Tx): Promise<void> {
  const nonEmpty: string[] = [];
  for (const { table } of CATALOGUE_TABLES) {
    const rows = await client.$queryRawUnsafe<{ c: bigint | number }[]>(
      `SELECT COUNT(*) c FROM "${table}"`,
    );
    if (Number(rows[0]?.c ?? 0) > 0) nonEmpty.push(table);
  }
  if (nonEmpty.length) {
    throw new CatalogueImportError(`${NOT_EMPTY_REFUSAL} (${nonEmpty.join(", ")})`, 409);
  }
}

/** Only the declared columns, and only when the row actually carries them. */
function pick(row: Row, fields: readonly string[]): Row {
  const out: Row = {};
  for (const f of fields) if (row[f] !== undefined) out[f] = row[f];
  if (typeof out.createdAt === "string") out.createdAt = new Date(out.createdAt);
  return out;
}

export type ImportResult = {
  inserted: Record<string, number>;
  total: number;
  from: { exportedAt: string; software: string; migration: string | null };
};

/**
 * Write a catalogue into an empty one. All-or-nothing.
 *
 * `Category.parentId` is self-referential, so categories go in twice: every row
 * first with its parent omitted, then a second pass setting it. That is what
 * makes the import independent of the order the categories happen to sit in the
 * file, at any nesting depth — a topological sort would work too and would fail
 * on a cycle that this cannot even notice.
 */
export async function importCatalogue(payload: CatalogueExport): Promise<ImportResult> {
  const parsed = parseCatalogueExport(payload);
  const inserted: Record<string, number> = {};

  // Before anything is written, and outside the transaction: a file that
  // cannot be applied should be refused without a database round trip, and
  // with a message that names the reference.
  assertReferencesResolve(parsed.tables);

  await db.$transaction(async (tx) => {
    await assertEmpty(tx as unknown as Tx);

    for (const { model, fields } of CATALOGUE_TABLES) {
      const rows = parsed.tables[model] ?? [];
      const delegate = (tx as unknown as Record<string, { create: (a: { data: Row }) => Promise<unknown> }>)[model];
      let n = 0;
      for (const row of rows) {
        const data = pick(row, fields);
        // Pass 1 for categories: the parent may not exist yet.
        if (model === "category") delete data.parentId;
        await delegate.create({ data });
        n += 1;
      }
      inserted[model] = n;
    }

    // Pass 2: the parent links, now that every category exists.
    for (const row of parsed.tables.category ?? []) {
      if (typeof row.parentId === "string" && row.parentId) {
        await tx.category.update({
          where: { id: row.id as string },
          data: { parentId: row.parentId },
        });
      }
    }
  });

  return {
    inserted,
    total: Object.values(inserted).reduce((a, b) => a + b, 0),
    from: {
      exportedAt: parsed.exportedAt,
      software: parsed.software,
      migration: parsed.migration,
    },
  };
}
