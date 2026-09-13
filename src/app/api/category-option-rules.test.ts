import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";

// L-91 (R8.3) — saving a category must not destroy the menu rules that depend
// on it.
//
// THE DEFECT, proved by audit pass 3 on a scratch copy with `foreign_keys=ON`:
// `PUT /api/catalog/categories/[id]` replaced option groups wholesale —
// `categoryOptionGroup.deleteMany({ categoryId })` then re-`create` with fresh
// cuids — and `ComboSlotOptionRule.categoryOptionGroupId` is `onDelete:
// Cascade`. **Every rule went with them.** No error, no warning;
// `CATEGORY_UPDATED` records the category name and nothing else.
//
// WHY IT IS GROUP A. A `ComboSlotOptionRule` fixes a menu component's option
// without asking the cashier. All seven live rows hang off `Pizzas → Taille`.
// Losing them lets a Junior be rung inside an XXL — and `componentReferencePrice`
// loses its pinned choice, so **the weight `apportion` divides the forfait by
// really does move, and that weight is what splits it between 10 % and 5,5 %.**
//
// The trigger is an ordinary admin save with no edits, because the client sends
// `optionGroups` unconditionally.

const PIN = "424242";
let admin: { id: string; username: string; role: "SUPER_ADMIN" };
let categoryId: string;
let groupId: string;
let choiceIds: string[];
let ruleId: string;
let menuName: string;
let slotName: string;

async function wipe() {
  await db.comboSlotOptionRule.deleteMany();
  await db.comboSlotChoice.deleteMany();
  await db.comboSlot.deleteMany();
  await db.categoryOptionChoice.deleteMany();
  await db.categoryOptionGroup.deleteMany();
  await db.categoryAddOn.deleteMany();
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
}

/** The live shape, in miniature: a Pizzas category with a `Taille` group whose
 *  choices carry absolute prices, and a menu whose slot pins one of them. */
beforeEach(async () => {
  clearCookies();
  await wipe();

  const u = await db.user.create({
    data: {
      username: `r83-${Date.now()}-${Math.random()}`,
      name: "Admin",
      role: "SUPER_ADMIN",
      pinHash: await hashPin(PIN),
    },
  });
  admin = { id: u.id, username: u.username, role: "SUPER_ADMIN" };

  const cat = await db.category.create({ data: { name: `Pizzas ${Date.now()}`, vatRate: 10 } });
  categoryId = cat.id;

  const group = await db.categoryOptionGroup.create({
    data: { categoryId: cat.id, name: "Taille", required: true, multiple: false, sortOrder: 0 },
  });
  groupId = group.id;

  choiceIds = [];
  for (const [i, c] of [
    { name: "Junior", pickupPrice: 890 },
    { name: "Senior", pickupPrice: 1190 },
    { name: "Mega", pickupPrice: 1590 },
  ].entries()) {
    const created = await db.categoryOptionChoice.create({
      data: { groupId: group.id, name: c.name, priceModifier: 0, pickupPrice: c.pickupPrice, sortOrder: i },
    });
    choiceIds.push(created.id);
  }

  menuName = "Menu XXL";
  const menu = await db.product.create({
    data: { name: menuName, price: 2500, categoryId: cat.id, isCombo: true, active: true, available: true },
  });
  slotName = "Pizza 1";
  const slot = await db.comboSlot.create({
    data: { productId: menu.id, name: slotName, quantity: 1, sortOrder: 0, sourceCategoryId: cat.id },
  });
  const rule = await db.comboSlotOptionRule.create({
    data: {
      slotId: slot.id,
      categoryOptionGroupId: group.id,
      // The pinned choice — Mega, because this is the XXL.
      categoryOptionChoiceId: choiceIds[2],
    },
  });
  ruleId = rule.id;

  await signInAs(admin);
});

afterAll(wipe);

const PUT = async () => (await import("@/app/api/catalog/categories/[id]/route")).PUT;

async function save(body: Record<string, unknown>) {
  return callJson<{ error?: string }>(await PUT(), {
    method: "PUT",
    url: `http://localhost/api/catalog/categories/${categoryId}`,
    params: { id: categoryId },
    body,
  });
}

/** What the fixed client now sends: the group and its choices, WITH their ids. */
function roundTrip(overrides: Record<string, unknown> = {}) {
  return {
    name: "Pizzas",
    color: "#f59e0b",
    sortOrder: 0,
    active: true,
    vatRate: 10,
    optionGroups: [
      {
        id: groupId,
        name: "Taille",
        required: true,
        multiple: false,
        sortOrder: 0,
        choices: [
          { id: choiceIds[0], name: "Junior", priceModifier: 0, pickupPrice: 890, sortOrder: 0 },
          { id: choiceIds[1], name: "Senior", priceModifier: 0, pickupPrice: 1190, sortOrder: 1 },
          { id: choiceIds[2], name: "Mega", priceModifier: 0, pickupPrice: 1590, sortOrder: 2 },
        ],
      },
    ],
    addOns: [],
    ...overrides,
  };
}

describe("L-91 — a GET→PUT round trip with no edits keeps the menu rules", () => {
  it("survives the save, with the same group id and the same pinned choice", async () => {
    const before = await db.comboSlotOptionRule.count();
    expect(before).toBe(1);

    const r = await save(roundTrip());
    expect(r.status, `the save failed: ${r.body.error}`).toBe(200);

    expect(await db.comboSlotOptionRule.count(), "the menu rule was destroyed — this is L-91").toBe(1);
    const rule = await db.comboSlotOptionRule.findUnique({ where: { id: ruleId } });
    expect(rule, "the rule row itself is gone").toBeTruthy();
    expect(rule?.categoryOptionGroupId, "the group was replaced with a fresh cuid").toBe(groupId);
    expect(rule?.categoryOptionChoiceId, "the pinned size was lost").toBe(choiceIds[2]);
  });

  it("keeps the group's identity, not merely a group with the same name", async () => {
    // The distinction that matters: delete-and-recreate leaves a group called
    // « Taille » too. Only the id says it is the same one, and only the id is
    // what the rule points at.
    await save(roundTrip());
    const groups = await db.categoryOptionGroup.findMany({ where: { categoryId } });
    expect(groups.length).toBe(1);
    expect(groups[0].id).toBe(groupId);

    const choices = await db.categoryOptionChoice.findMany({
      where: { groupId },
      orderBy: { sortOrder: "asc" },
    });
    expect(choices.map((c) => c.id)).toEqual(choiceIds);
  });

  it("still applies the edits — this is not a no-op", async () => {
    // A fix that preserved the rules by ignoring the payload would pass every
    // assertion above.
    const r = await save(
      roundTrip({
        optionGroups: [
          {
            id: groupId,
            name: "Taille",
            required: false,
            multiple: true,
            sortOrder: 0,
            choices: [
              { id: choiceIds[0], name: "Petite", priceModifier: 0, pickupPrice: 950, sortOrder: 0 },
              { id: choiceIds[1], name: "Senior", priceModifier: 0, pickupPrice: 1190, sortOrder: 1 },
              { id: choiceIds[2], name: "Mega", priceModifier: 0, pickupPrice: 1690, sortOrder: 2 },
            ],
          },
        ],
      }),
    );
    expect(r.status).toBe(200);

    const group = await db.categoryOptionGroup.findUnique({ where: { id: groupId } });
    expect(group?.required).toBe(false);
    expect(group?.multiple).toBe(true);

    const choices = await db.categoryOptionChoice.findMany({ where: { groupId }, orderBy: { sortOrder: "asc" } });
    expect(choices[0].name, "a renamed choice was not saved").toBe("Petite");
    expect(choices[0].pickupPrice).toBe(950);
    expect(choices[2].pickupPrice, "the price the VAT split weighs was not saved").toBe(1690);
    // …and the rule still points where it did.
    expect((await db.comboSlotOptionRule.findUnique({ where: { id: ruleId } }))?.categoryOptionChoiceId).toBe(
      choiceIds[2],
    );
  });

  it("adds and removes ordinary groups without touching the pinned one", async () => {
    const r = await save(
      roundTrip({
        optionGroups: [
          ...roundTrip().optionGroups,
          {
            name: "Cuisson",
            required: false,
            multiple: false,
            sortOrder: 1,
            choices: [{ name: "Bien cuite", priceModifier: 0, sortOrder: 0 }],
          },
        ],
      }),
    );
    expect(r.status, r.body.error).toBe(200);
    expect(await db.categoryOptionGroup.count({ where: { categoryId } })).toBe(2);

    // …and removing it again is fine, because nothing pins it.
    const r2 = await save(roundTrip());
    expect(r2.status, r2.body.error).toBe(200);
    expect(await db.categoryOptionGroup.count({ where: { categoryId } })).toBe(1);
    expect(await db.comboSlotOptionRule.count()).toBe(1);
  });
});

describe("L-91 — a save that WOULD remove a pinned group is refused, by name", () => {
  it("refuses to drop the group, and names the menu and the slot", async () => {
    // This is what the OLD client sent on every save: no ids, so every group
    // looks new and the real one goes unmatched. It must not succeed quietly.
    const r = await save(
      roundTrip({
        optionGroups: [
          {
            name: "Taille",
            required: true,
            multiple: false,
            sortOrder: 0,
            choices: [{ name: "Junior", priceModifier: 0, pickupPrice: 890, sortOrder: 0 }],
          },
        ],
      }),
    );

    expect(r.status).toBe(409);
    expect(r.body.error, "the operator must be told WHICH menu").toContain(menuName);
    expect(r.body.error).toContain(slotName);

    // And nothing was written: the refusal rolls the whole save back.
    expect(await db.comboSlotOptionRule.count()).toBe(1);
    expect(await db.categoryOptionGroup.count({ where: { categoryId } })).toBe(1);
    expect((await db.categoryOptionChoice.findMany({ where: { groupId } })).length).toBe(3);
  });

  it("refuses to drop the pinned CHOICE, even when the group is kept", async () => {
    // `ComboSlotOptionRule.categoryOptionChoiceId` is `onDelete: Restrict`, so
    // this would otherwise surface as a raw Prisma foreign-key error rather
    // than a sentence — and the group being preserved makes it look safe.
    const r = await save(
      roundTrip({
        optionGroups: [
          {
            id: groupId,
            name: "Taille",
            required: true,
            multiple: false,
            sortOrder: 0,
            choices: [
              { id: choiceIds[0], name: "Junior", priceModifier: 0, pickupPrice: 890, sortOrder: 0 },
              { id: choiceIds[1], name: "Senior", priceModifier: 0, pickupPrice: 1190, sortOrder: 1 },
              // Mega — the pinned one — dropped.
            ],
          },
        ],
      }),
    );

    expect(r.status).toBe(409);
    expect(r.body.error).toContain(menuName);
    expect((await db.categoryOptionChoice.findMany({ where: { groupId } })).length).toBe(3);
    expect((await db.comboSlotOptionRule.findUnique({ where: { id: ruleId } }))?.categoryOptionChoiceId).toBe(
      choiceIds[2],
    );
  });

  it("allows dropping an UNPINNED choice from the same group", async () => {
    // The other direction: the refusal must be about the rule, not about the
    // group being special. Junior is not pinned.
    const r = await save(
      roundTrip({
        optionGroups: [
          {
            id: groupId,
            name: "Taille",
            required: true,
            multiple: false,
            sortOrder: 0,
            choices: [
              { id: choiceIds[1], name: "Senior", priceModifier: 0, pickupPrice: 1190, sortOrder: 0 },
              { id: choiceIds[2], name: "Mega", priceModifier: 0, pickupPrice: 1590, sortOrder: 1 },
            ],
          },
        ],
      }),
    );

    expect(r.status, r.body.error).toBe(200);
    expect((await db.categoryOptionChoice.findMany({ where: { groupId } })).length).toBe(2);
    expect(await db.comboSlotOptionRule.count()).toBe(1);
  });

  it("lets a category with no menu rules be edited freely", async () => {
    // Nothing about this change may make an ordinary category harder to edit.
    await db.comboSlotOptionRule.deleteMany();
    const r = await save(
      roundTrip({
        optionGroups: [
          {
            name: "Tout neuf",
            required: false,
            multiple: false,
            sortOrder: 0,
            // C-24: a group with no choices is refused before the transaction opens.
            choices: [{ name: "Unique", priceModifier: 0, sortOrder: 0 }],
          },
        ],
      }),
    );
    expect(r.status, r.body.error).toBe(200);
    const groups = await db.categoryOptionGroup.findMany({ where: { categoryId } });
    expect(groups.length).toBe(1);
    expect(groups[0].name).toBe("Tout neuf");
    expect(groups[0].id).not.toBe(groupId);
  });
});
