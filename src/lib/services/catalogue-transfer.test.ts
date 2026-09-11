import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import {
  CATALOGUE_TABLES,
  CATALOGUE_FORMAT,
  exportCatalogue,
  CATALOGUE_REFERENCES,
  CatalogueImportError,
  NOT_EMPTY_REFUSAL,
  type CatalogueExport,
} from "@/lib/services/catalogue-transfer";
import { saveSettings, getSettings } from "@/lib/services/settings";
import { hashPin } from "@/lib/auth";

// CATALOGUE EXPORT / IMPORT (operator, 2026-09-11).
//
// ── WHAT IT IS FOR ──────────────────────────────────────────────────────────
// The restaurant gets a FRESH install keeping this catalogue. Nothing could
// carry it: no script exported catalogue data, `csv-export.ts` covers the
// dashboard, `/api/seed` seeds a demo catalogue. The only route was to carry
// `db/custom.db` itself, which is not a fresh install.
//
// ── WHY THE TESTS GO THROUGH THE ROUTES ─────────────────────────────────────
// The standing rule here: a unit test on an extracted function proves the
// function, not that anything calls it — this project has shipped that gap
// three times. So the round-trip below is driven over
// `GET /api/catalog/export` and `POST /api/catalog/import` through
// `route-harness`, and then **read back out of the database**, because what a
// fresh install ends up holding is the claim. `exportCatalogue` is called
// directly only where the assertion is about the FILE rather than the request.
//
// ── THE STRUCTURE THE FIXTURE HAS TO HAVE ───────────────────────────────────
// A catalogue is not a list of products. It is ten tables with five kinds of
// reference between them, and the one that decides the import's shape is
// `Category.parentId` pointing at Category — so the fixture nests a category
// and the file is deliberately reordered to put a parent AFTER its child.

const PIN = "515151";
let admin: { id: string; username: string };

type Ids = {
  pizzas: string; classiques: string; boissons: string;
  regina: string; coca: string; menu: string;
  group: string; choiceA: string; choiceB: string;
  catGroup: string; catChoice: string; addOn: string;
  slot: string; slotChoice: string; rule: string;
};
let ids: Ids;

async function wipeCatalogue() {
  await db.comboSlotOptionRule.deleteMany();
  await db.comboSlotChoice.deleteMany();
  await db.comboSlot.deleteMany();
  await db.categoryAddOn.deleteMany();
  await db.categoryOptionChoice.deleteMany();
  await db.categoryOptionGroup.deleteMany();
  await db.optionChoice.deleteMany();
  await db.optionGroup.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
}

async function wipeAll() {
  await db.auditLog.deleteMany();
  await db.fiscalEvent.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await wipeCatalogue();
  await db.setting.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
}

/** A structurally complete catalogue: nesting, per-product options, category
 *  globals, an add-on, and a menu composé with a slot, a filler and a rule. */
async function seedCatalogue(): Promise<Ids> {
  const pizzas = await db.category.create({
    data: { name: "Pizzas", color: "#111", sortOrder: 1, vatRate: 10, vatRateTakeaway: 5.5 },
  });
  const classiques = await db.category.create({
    // The nesting the two-pass import exists for.
    data: { name: "Classiques", color: "#222", sortOrder: 2, parentId: pizzas.id },
  });
  const boissons = await db.category.create({
    data: { name: "Boissons", color: "#333", sortOrder: 3, vatRate: 10 },
  });

  const regina = await db.product.create({
    data: { name: "Regina", price: 1200, vatRate: 10, categoryId: classiques.id,
            image: "/uploads/Produits/regina-does-not-exist.png", sortOrder: 1 },
  });
  const coca = await db.product.create({
    data: { name: "Coca", price: 150, vatRate: 10, categoryId: boissons.id, sortOrder: 2 },
  });
  const menu = await db.product.create({
    data: { name: "Menu Test", price: 1400, vatRate: 10, categoryId: pizzas.id, isCombo: true },
  });

  const group = await db.optionGroup.create({
    data: { productId: regina.id, name: "Cuisson", required: true, multiple: false },
  });
  const choiceA = await db.optionChoice.create({
    data: { groupId: group.id, name: "Normale", priceModifier: 0, sortOrder: 1 },
  });
  const choiceB = await db.optionChoice.create({
    data: { groupId: group.id, name: "Bien cuite", priceModifier: 50, sortOrder: 2 },
  });

  const catGroup = await db.categoryOptionGroup.create({
    data: { categoryId: pizzas.id, name: "Taille", required: true },
  });
  const catChoice = await db.categoryOptionChoice.create({
    data: { groupId: catGroup.id, name: "Grande", priceModifier: 300, pickupPrice: 1500 },
  });
  const addOn = await db.categoryAddOn.create({
    data: { categoryId: pizzas.id, name: "Supplément fromage", price: 100 },
  });

  const slot = await db.comboSlot.create({
    data: { productId: menu.id, name: "La pizza", quantity: 1, sourceCategoryId: classiques.id },
  });
  const slotChoice = await db.comboSlotChoice.create({
    data: { slotId: slot.id, productId: regina.id, surcharge: 0 },
  });
  const rule = await db.comboSlotOptionRule.create({
    data: { slotId: slot.id, categoryOptionGroupId: catGroup.id, categoryOptionChoiceId: catChoice.id },
  });

  return {
    pizzas: pizzas.id, classiques: classiques.id, boissons: boissons.id,
    regina: regina.id, coca: coca.id, menu: menu.id,
    group: group.id, choiceA: choiceA.id, choiceB: choiceB.id,
    catGroup: catGroup.id, catChoice: catChoice.id, addOn: addOn.id,
    slot: slot.id, slotChoice: slotChoice.id, rule: rule.id,
  };
}

beforeEach(async () => {
  clearCookies();
  await wipeAll();
  const u = await db.user.create({
    data: {
      username: `cat-${Date.now()}-${Math.random()}`,
      name: "Dev",
      role: "SUPER_ADMIN",
      pinHash: await hashPin(PIN),
    },
  });
  admin = { id: u.id, username: u.username };
  await signInAs({ id: u.id, username: u.username, role: "SUPER_ADMIN" });
  ids = await seedCatalogue();
});

afterAll(async () => {
  clearCookies();
  await wipeAll();
});

async function exportOverHttp() {
  const mod = await import("@/app/api/catalog/export/route");
  return callJson<CatalogueExport>(mod.GET, { url: "http://localhost/api/catalog/export" });
}

async function importOverHttp(body: unknown) {
  const mod = await import("@/app/api/catalog/import/route");
  return callJson<{ error?: string; total?: number; inserted?: Record<string, number> }>(mod.POST, {
    method: "POST",
    url: "http://localhost/api/catalog/import",
    body,
  });
}

// ---------------------------------------------------------------------------
// 1. The column lists must not go stale
// ---------------------------------------------------------------------------

describe("the travelling column lists track the schema", () => {
  it("names every column of every catalogue table, except updatedAt", async () => {
    // THE DRIFT GUARD, and the reason the lists are explicit rather than
    // `SELECT *`. A column added to `Product` and not added here would simply
    // not travel — the import would succeed and the fresh install would be
    // quietly missing a field. This fails instead, and the fix is a decision:
    // add it to the list, or add it to the exception below with a reason.
    //
    // `updatedAt` is excluded everywhere: it is `@updatedAt`, so the honest
    // value on import is the moment the row was written, not a copied one.
    const EXCLUDED = new Set(["updatedAt"]);
    for (const { table, fields } of CATALOGUE_TABLES) {
      const cols = (
        await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${table}")`)
      ).map((c) => c.name);
      const shouldTravel = cols.filter((c) => !EXCLUDED.has(c)).sort();
      expect([...fields].sort(), `${table}: the export's column list is stale`).toEqual(shouldTravel);
    }
  });

  it("covers ten tables, in an order no reference points backwards in", () => {
    expect(CATALOGUE_TABLES).toHaveLength(10);
    // Dependency order, asserted as a list rather than trusted: a reordering
    // that put `product` before `category` would fail the round-trip below,
    // but it would fail with an FK error nobody would read as "the order".
    expect(CATALOGUE_TABLES.map((t) => t.table)).toEqual([
      "Category", "Product", "OptionGroup", "OptionChoice",
      "CategoryOptionGroup", "CategoryOptionChoice", "CategoryAddOn",
      "ComboSlot", "ComboSlotChoice", "ComboSlotOptionRule",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. The round trip, over the routes, read back out of the database
// ---------------------------------------------------------------------------

describe("a catalogue survives export and import with its identity intact", () => {
  it("round-trips every table over HTTP, into an emptied database", async () => {
    const { status, body: file } = await exportOverHttp();
    expect(status).toBe(200);
    expect(file.format).toBe(CATALOGUE_FORMAT);
    expect(file.counts).toEqual({
      category: 3, product: 3, optionGroup: 1, optionChoice: 2,
      categoryOptionGroup: 1, categoryOptionChoice: 1, categoryAddOn: 1,
      comboSlot: 1, comboSlotChoice: 1, comboSlotOptionRule: 1,
    });

    // The fresh install: nothing in the catalogue at all.
    await wipeCatalogue();
    expect(await db.product.count()).toBe(0);

    const res = await importOverHttp(file);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(15);

    // READ BACK OUT OF THE DATABASE — the claim is what the install holds.
    expect(await db.category.count()).toBe(3);
    expect(await db.product.count()).toBe(3);
    expect(await db.optionChoice.count()).toBe(2);
    expect(await db.categoryOptionChoice.count()).toBe(1);
    expect(await db.categoryAddOn.count()).toBe(1);
    expect(await db.comboSlotChoice.count()).toBe(1);
    expect(await db.comboSlotOptionRule.count()).toBe(1);
  });

  it("preserves every id, which is what R2.1 counts things under", async () => {
    const { body: file } = await exportOverHttp();
    await wipeCatalogue();
    await importOverHttp(file);

    // Not « three products exist » — THESE three, under the ids they had.
    expect((await db.product.findUnique({ where: { id: ids.regina } }))?.name).toBe("Regina");
    expect((await db.product.findUnique({ where: { id: ids.coca } }))?.name).toBe("Coca");
    expect((await db.category.findUnique({ where: { id: ids.pizzas } }))?.name).toBe("Pizzas");
    expect((await db.optionChoice.findUnique({ where: { id: ids.choiceB } }))?.priceModifier).toBe(50);
    expect((await db.comboSlotChoice.findUnique({ where: { id: ids.slotChoice } }))?.productId).toBe(ids.regina);
    const rule = await db.comboSlotOptionRule.findUnique({ where: { id: ids.rule } });
    expect(rule?.categoryOptionGroupId).toBe(ids.catGroup);
    expect(rule?.categoryOptionChoiceId).toBe(ids.catChoice);
  });

  it("keeps the values a price depends on, not merely the rows", async () => {
    const { body: file } = await exportOverHttp();
    await wipeCatalogue();
    await importOverHttp(file);

    const regina = await db.product.findUniqueOrThrow({ where: { id: ids.regina } });
    expect(regina.price).toBe(1200);
    expect(regina.vatRate).toBe(10);
    expect(regina.categoryId).toBe(ids.classiques);

    // The category VAT chain R2.1/DD-17 resolve through, both rates.
    const pizzas = await db.category.findUniqueOrThrow({ where: { id: ids.pizzas } });
    expect(pizzas.vatRate).toBe(10);
    expect(pizzas.vatRateTakeaway).toBe(5.5);

    // An absolute takeaway price on a category choice — a nullable Int that a
    // careless export would turn into 0 and a careless import would drop.
    const choice = await db.categoryOptionChoice.findUniqueOrThrow({ where: { id: ids.catChoice } });
    expect(choice.pickupPrice).toBe(1500);
    expect(choice.deliveryPrice).toBeNull();

    const slot = await db.comboSlot.findUniqueOrThrow({ where: { id: ids.slot } });
    expect(slot.sourceCategoryId).toBe(ids.classiques);
    expect(slot.quantity).toBe(1);
  });

  it("restores a nested category even when the parent comes AFTER the child", async () => {
    // WHY THE IMPORT IS TWO PASSES. Nothing guarantees the order categories sit
    // in the file, and `Category.parentId` points at Category — so this
    // reverses them on purpose. A single-pass import fails here with a foreign
    // key error; this must not care.
    const { body: file } = await exportOverHttp();
    file.tables.category = [...file.tables.category].reverse();
    const first = file.tables.category[0] as { id: string };
    // Guard the guard: if the reversal did not actually put a child first, the
    // assertion below would pass over an ordering that proves nothing.
    expect(first.id).not.toBe(ids.pizzas);

    await wipeCatalogue();
    const res = await importOverHttp(file);
    expect(res.status).toBe(200);

    const child = await db.category.findUniqueOrThrow({ where: { id: ids.classiques } });
    expect(child.parentId).toBe(ids.pizzas);
    const root = await db.category.findUniqueOrThrow({ where: { id: ids.pizzas } });
    expect(root.parentId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. What must NOT travel
// ---------------------------------------------------------------------------

describe("a catalogue is not an install, and not a history", () => {
  it("carries no settings, so a fresh install does not inherit factice or a printer", async () => {
    await saveSettings({ factice: false, printerQueue: "SUNSO WTP-800" });
    const { body: file } = await exportOverHttp();

    expect(Object.keys(file.tables)).toEqual(CATALOGUE_TABLES.map((t) => t.model));
    expect(JSON.stringify(file)).not.toContain("SUNSO WTP-800");

    // And importing does not touch the settings that are already there.
    await wipeCatalogue();
    await importOverHttp(file);
    expect((await getSettings()).printerQueue).toBe("SUNSO WTP-800");
  });

  it("carries no trading data", async () => {
    const { body: file } = await exportOverHttp();
    for (const forbidden of ["order", "orderItem", "payment", "receipt", "fiscalEvent", "zReport", "user", "session"]) {
      expect(Object.keys(file.tables)).not.toContain(forbidden);
    }
  });

  it("reports a referenced image that is not on disk, at EXPORT time", async () => {
    // The fixture's Regina points at a file that does not exist. Finding that
    // out here is the point: images travel in git (DD-16), so a path with no
    // file is a problem to solve before the export is carried anywhere, not on
    // install day.
    const file = await exportCatalogue();
    expect(file.missingImages).toContain("/uploads/Produits/regina-does-not-exist.png");
    // And a product with no image at all is not reported as missing one.
    expect(file.missingImages).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4. The refusals
// ---------------------------------------------------------------------------

describe("import refuses rather than merges", () => {
  it("answers 409 on a non-empty catalogue and leaves it untouched", async () => {
    const { body: file } = await exportOverHttp();
    // NOT wiped: the catalogue is still there.
    const before = await db.product.count();
    expect(before).toBe(3);

    const res = await importOverHttp(file);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("ne fusionne pas");

    // Nothing half-written — and this one is cheap: `assertEmpty` is the FIRST
    // statement in the transaction, so no row has been written when it throws.
    // The transaction earns its keep on a failure PARTWAY through, which the
    // test below is about.
    expect(await db.product.count()).toBe(3);
    expect(await db.category.count()).toBe(3);
    expect(await db.comboSlot.count()).toBe(1);
  });

  it("refuses when only ONE table is dirty — a stray category is enough", async () => {
    // `Category.name` is unique, so a single leftover row would take the import
    // down partway through. The check covers all ten tables for that reason.
    const { body: file } = await exportOverHttp();
    await wipeCatalogue();
    await db.category.create({ data: { name: "Restes", color: "#000" } });

    const res = await importOverHttp(file);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("Category");
    expect(await db.product.count()).toBe(0); // nothing landed
  });

  it("answers 400 on a file that is not a catalogue export", async () => {
    await wipeCatalogue();
    for (const bad of [{}, { format: "something-else", tables: {} }, { format: CATALOGUE_FORMAT }]) {
      const res = await importOverHttp(bad);
      expect(res.status).toBe(400);
    }
    expect(await db.product.count()).toBe(0);
  });

  it("refuses a dangling reference in French, naming it, before any write", async () => {
    // WHAT THIS REPLACED, and why. This test used to break a foreign key and
    // assert that the transaction rolled the whole import back. It passed — but
    // it proved that `db.$transaction` works, which is Prisma's claim and not
    // this module's, and it cost a `prisma:error` block in every suite run
    // (« Foreign key constraint violated on the foreign key » — no table, no
    // row, no id). A clean run has ZERO of those and that number is worth more
    // than a test of somebody else's rollback.
    //
    // So the module now refuses first, and THAT is this module's claim: a
    // hand-edited file is rejected with a message naming the reference, before
    // a database round trip. The transaction stays as defence in depth for
    // whatever the check cannot foresee; it is deliberately not asserted here.
    const file = await exportCatalogue();
    (file.tables.comboSlotOptionRule[0] as Record<string, unknown>).categoryOptionGroupId =
      "does-not-exist";

    await wipeCatalogue();
    const res = await importOverHttp(file);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("incohérent");
    expect(res.body.error).toContain("comboSlotOptionRule.categoryOptionGroupId");
    expect(res.body.error).toContain("does-not-exist");
    expect(await db.category.count()).toBe(0); // nothing was written
  });

  it("refuses a REQUIRED reference that is missing entirely", async () => {
    // A nullable reference may be absent; a required one may not. `parentId`
    // is the first kind and `categoryId` the second, and conflating them would
    // either reject every root category or accept an orphan product.
    const file = await exportCatalogue();
    delete (file.tables.product[0] as Record<string, unknown>).categoryId;

    await wipeCatalogue();
    const res = await importOverHttp(file);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("product.categoryId manquant");
    expect(await db.product.count()).toBe(0);
  });

  it("accepts a root category, whose parentId is legitimately absent", async () => {
    // The control for the test above: `Pizzas` has no parent and must not be
    // read as a dangling reference. A check that rejected it would reject
    // every catalogue.
    const file = await exportCatalogue();
    await wipeCatalogue();
    const res = await importOverHttp(file);
    expect(res.status).toBe(200);
    expect((await db.category.findUniqueOrThrow({ where: { id: ids.pizzas } })).parentId).toBeNull();
  });

  it("covers every foreign key of every travelling table", () => {
    // The map is the catalogue's shape written down once, so it has to be
    // complete: a reference the map does not know about is a reference the
    // pre-flight cannot check, and the first sign of it would be a Prisma
    // error on somebody's install day.
    const covered = new Set(CATALOGUE_REFERENCES.map((r) => `${r.from}.${r.field}`));
    const expected = new Set([
      "category.parentId", "product.categoryId", "optionGroup.productId",
      "optionChoice.groupId", "categoryOptionGroup.categoryId",
      "categoryOptionChoice.groupId", "categoryAddOn.categoryId",
      "comboSlot.productId", "comboSlot.sourceCategoryId",
      "comboSlotChoice.slotId", "comboSlotChoice.productId",
      "comboSlotOptionRule.slotId", "comboSlotOptionRule.categoryOptionGroupId",
      "comboSlotOptionRule.categoryOptionChoiceId",
    ]);
    expect([...covered].sort()).toEqual([...expected].sort());
    // And every field named is a field that actually travels, or the check
    // would be reading something the export never wrote.
    const byModel = new Map(CATALOGUE_TABLES.map((t) => [t.model as string, t.fields as readonly string[]]));
    for (const r of CATALOGUE_REFERENCES) {
      expect(byModel.get(r.from), `${r.from} is not a travelling table`).toBeDefined();
      expect(byModel.get(r.from)).toContain(r.field);
      expect(byModel.has(r.to), `${r.to} is not a travelling table`).toBe(true);
    }
  });

  it("names the refusal in French, because an operator reads it", async () => {
    expect(NOT_EMPTY_REFUSAL).toContain("catalogue");
    const err = new CatalogueImportError(NOT_EMPTY_REFUSAL, 409);
    expect(err.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// 5. The audit trail
// ---------------------------------------------------------------------------

describe("both halves are journalled in the audit log", () => {
  it("records the export and the import as distinct actions", async () => {
    const { body: file } = await exportOverHttp();
    await wipeCatalogue();
    await importOverHttp(file);

    const actions = (
      await db.auditLog.findMany({ where: { userId: admin.id }, orderBy: { createdAt: "asc" } })
    ).map((a) => a.action);
    expect(actions).toContain("CATALOGUE_EXPORTED");
    expect(actions).toContain("CATALOGUE_IMPORTED");

    const imported = await db.auditLog.findFirstOrThrow({ where: { action: "CATALOGUE_IMPORTED" } });
    const details = JSON.parse(imported.details ?? "{}");
    expect(details.total).toBe(15);
    // The provenance of the file that was applied — which install wrote it,
    // when, and against which schema.
    expect(details.from.software).toBe(file.software);
    expect(details.from.migration).toBe(file.migration);
  });

  it("does not journal an import that was refused", async () => {
    // A refusal is not an event. If it were journalled as one, the audit log
    // would say a catalogue was imported on a day nothing changed.
    await importOverHttp(await exportCatalogue()); // catalogue still populated
    expect(await db.auditLog.count({ where: { action: "CATALOGUE_IMPORTED" } })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. The service, where the claim is about the file and not the request
// ---------------------------------------------------------------------------

describe("the export file itself", () => {
  it("emits every table in ascending id order, whatever order the rows were written in", async () => {
    // THIS TEST USED TO SAY « two exports of one catalogue are byte-identical »
    // and it proved nothing: SQLite returns rows in rowid order consistently
    // for an unchanged table, so two consecutive exports match with or without
    // an `ORDER BY`. Removing the `ORDER BY id` left the suite entirely green,
    // which is the case the plan's method calls a question rather than a
    // verdict — the revert was not a no-op, the test was just weaker than its
    // own name.
    //
    // The real property is that the order comes from the DATA and not from the
    // file's insertion history, because that is what makes a diff between two
    // exports — taken on different machines, or after an edit — mean something.
    // So this inserts a category whose id sorts FIRST and writes it LAST.
    await db.category.create({
      data: { id: "0000-sorts-first", name: "Zéro", color: "#abc" },
    });

    const file = await exportCatalogue();
    const catIds = file.tables.category.map((r) => String(r.id));
    // Written last, emitted first.
    expect(catIds[0]).toBe("0000-sorts-first");
    expect(catIds).toEqual([...catIds].sort());

    // And every other table, for the same reason.
    for (const { model } of CATALOGUE_TABLES) {
      const rowIds = file.tables[model].map((r) => String(r.id));
      expect(rowIds, `${model} is not in id order`).toEqual([...rowIds].sort());
    }

    // Two exports of an unchanged catalogue still match — worth keeping, but
    // as a consequence rather than as the claim.
    const again = await exportCatalogue();
    expect(JSON.stringify(again.tables)).toBe(JSON.stringify(file.tables));
  });

  it("states where it came from, so a mismatch is readable rather than inferred", async () => {
    const file = await exportCatalogue();
    expect(file.software).toContain("HibaPOS");
    expect(file.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // The schema the catalogue was written against. Null only where there is
    // no migrations table at all.
    expect(file.migration === null || typeof file.migration === "string").toBe(true);
  });

  it("writes nothing — it is safe against a live catalogue", async () => {
    const before = await db.product.findMany({ orderBy: { id: "asc" } });
    await exportCatalogue();
    const after = await db.product.findMany({ orderBy: { id: "asc" } });
    expect(after).toEqual(before);
  });
});
