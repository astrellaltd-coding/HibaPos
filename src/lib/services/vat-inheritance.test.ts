import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { resolveVatRate } from "@/lib/services/pricing";
import { productSchema, categorySchema, ALLOWED_VAT_RATES } from "@/lib/validation";
import { addToVatBreakdown, type VatBreakdown } from "@/lib/money";

// L-16 / L-17 (Batch 3.1c) — category-level VAT rates.
//
// L-17: the only VAT control matched the *immediate* category's name against
// "boisson" and never walked to the parent, so it never appeared for `Canette`
// or `Bouteilles` — the real drink categories. L-16: consequently all 17 cans
// and bottles sat at 10 % where the operator determined 5,5 % applies.
//
// The rate now lives on the category and resolves nearest-wins. The property
// that makes that safe is the snapshot: OrderItem.vatRate is written at
// checkout and every report reads it, so editing a category can never restate
// a sale that has already happened. That is pinned below.

describe("resolveVatRate — nearest wins (L-16/L-17)", () => {
  it("uses the product's own rate when it does not inherit", () => {
    expect(
      resolveVatRate({
        vatRate: 10,
        inheritCategoryVat: false,
        category: { vatRate: 5.5, parent: { vatRate: 20 } },
      }),
    ).toBe(10);
  });

  it("uses its own category's rate when inheriting", () => {
    // The live shape: a can in `Canette`, which carries 5,5 %.
    expect(
      resolveVatRate({
        vatRate: 10,
        inheritCategoryVat: true,
        category: { vatRate: 5.5, parent: { vatRate: null } },
      }),
    ).toBe(5.5);
  });

  it("falls back to the parent category when its own has no rate", () => {
    expect(
      resolveVatRate({
        vatRate: 20,
        inheritCategoryVat: true,
        category: { vatRate: null, parent: { vatRate: 10 } },
      }),
    ).toBe(10);
  });

  it("lets a sub-category override its parent", () => {
    // A future `Boissons chaudes` at 10 % under a parent that says 5,5 %:
    // poured for immediate consumption is 10 %, per the operator's
    // determination — the criterion is the container, not the drink.
    expect(
      resolveVatRate({
        vatRate: 20,
        inheritCategoryVat: true,
        category: { vatRate: 10, parent: { vatRate: 5.5 } },
      }),
    ).toBe(10);
  });

  it("falls back to the product's own rate when nothing in the chain is set", () => {
    // The quietest failure: a misconfigured category leaves the rate exactly
    // where it was rather than silently moving money.
    expect(
      resolveVatRate({
        vatRate: 10,
        inheritCategoryVat: true,
        category: { vatRate: null, parent: { vatRate: null } },
      }),
    ).toBe(10);
    expect(resolveVatRate({ vatRate: 10, inheritCategoryVat: true, category: null })).toBe(10);
  });
});

describe("allowed VAT rates (DD-17)", () => {
  it("accepts 20, 10 and 5,5 on a product", () => {
    for (const rate of ALLOWED_VAT_RATES) {
      const parsed = productSchema.safeParse({ name: "X", price: 100, categoryId: "c1", vatRate: rate });
      expect(parsed.success).toBe(true);
    }
  });

  it("rejects a rate that is not a real French rate — including 6", () => {
    // 6 % is the rate C-12 used to invent. It must not be selectable either.
    for (const rate of [6, 2.1, 0, 37.3, 100]) {
      const parsed = productSchema.safeParse({ name: "X", price: 100, categoryId: "c1", vatRate: rate });
      expect(parsed.success).toBe(false);
    }
  });

  it("gives the operator a French message, not a zod default", () => {
    const parsed = productSchema.safeParse({ name: "X", price: 100, categoryId: "c1", vatRate: 6 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toContain("Taux de TVA non autorisé");
  });

  it("defaults a product to 10, this restaurant's standard rate", () => {
    const parsed = productSchema.safeParse({ name: "X", price: 100, categoryId: "c1" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.vatRate).toBe(10);
  });

  it("lets a category leave the rate unset, and constrains it when set", () => {
    expect(categorySchema.safeParse({ name: "Boissons" }).success).toBe(true);
    expect(categorySchema.safeParse({ name: "Boissons", vatRate: null }).success).toBe(true);
    expect(categorySchema.safeParse({ name: "Canette", vatRate: 5.5 }).success).toBe(true);
    expect(categorySchema.safeParse({ name: "Canette", vatRate: 6 }).success).toBe(false);
  });
});

describe("a category edit cannot restate a sale already made (L-16/L-17)", () => {
  beforeEach(async () => {
    await db.orderItem.deleteMany();
    await db.payment.deleteMany();
    await db.order.deleteMany();
    await db.shift.deleteMany();
    await db.product.deleteMany();
    await db.category.deleteMany();
    await db.user.deleteMany();
  });

  it("keeps the snapshotted rate on an existing order line", async () => {
    const boissons = await db.category.create({ data: { name: "Boissons" } });
    const canette = await db.category.create({
      data: { name: "Canette", parentId: boissons.id, vatRate: 5.5 },
    });
    const coca = await db.product.create({
      data: { name: "Coca", price: 150, categoryId: canette.id, vatRate: 10, inheritCategoryVat: true },
    });

    const withCategory = await db.product.findUniqueOrThrow({
      where: { id: coca.id },
      include: { category: { include: { parent: true } } },
    });
    expect(resolveVatRate(withCategory)).toBe(5.5);

    // A sale happens, snapshotting the rate onto the line.
    const user = await db.user.create({
      data: { username: "vat-test", name: "VAT Test", role: "MANAGER", pinHash: "x:y" },
    });
    const shift = await db.shift.create({
      data: { number: 9001, openedById: user.id, openingFloat: 0, status: "OPEN" },
    });
    const order = await db.order.create({
      data: {
        number: 9001,
        shiftId: shift.id,
        cashierId: user.id,
        status: "COMPLETED",
        subtotal: 150,
        vatTotal: 8,
        total: 150,
        itemCount: 1,
        completedAt: new Date(),
      },
    });
    const soldAt = resolveVatRate(withCategory);
    const line = await db.orderItem.create({
      data: {
        orderId: order.id,
        productId: coca.id,
        productName: coca.name,
        unitPrice: 150,
        quantity: 1,
        lineTotal: 150,
        vatRate: soldAt,
      },
    });
    expect(line.vatRate).toBe(5.5);

    // The accountant later moves the category to 20 %.
    await db.category.update({ where: { id: canette.id }, data: { vatRate: 20 } });

    // The product now resolves at the new rate...
    const after = await db.product.findUniqueOrThrow({
      where: { id: coca.id },
      include: { category: { include: { parent: true } } },
    });
    expect(resolveVatRate(after)).toBe(20);

    // ...but the sale that already happened does not move. This is the
    // property that makes live inheritance safe.
    const lineAfter = await db.orderItem.findUniqueOrThrow({ where: { id: line.id } });
    expect(lineAfter.vatRate).toBe(5.5);
  });
});

describe("a 5,5 % drink and 10 % food land in separate breakdown rows", () => {
  it("produces \"5.5\" and \"10\", the first real exercise of the C-12 fix", () => {
    // Before Batch 3.1 this collapsed the drink into a "6 %" heading; before
    // 3.1c the drink could not be set to 5,5 % at all.
    const map: VatBreakdown = {};
    addToVatBreakdown(map, 150, 5.5); // Coca en canette
    addToVatBreakdown(map, 590, 10); // 5 Nuggets
    expect(Object.keys(map).sort()).toEqual(["10", "5.5"]);
    expect(map["5.5"].ttc).toBe(150);
    expect(map["10"].ttc).toBe(590);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L-68 (Batch 3.12) — the same rate does not apply to every order type.
//
// THIS REFINES 3.1c'S RULING RATHER THAN CONTRADICTING IT. That batch moved the
// 17 cans and bottles from 10 % to 5,5 % on the operator's determination, and
// the determination was incomplete rather than wrong: it is the CONTAINER and
// the CONSUMPTION that decide. Operator's ruling 2026-09-09 — a sealed bottle
// or can is 10 % sur place and 5,5 % à emporter et en livraison. Everything
// else in this catalogue stays 10 % under every order type.
//
// The consequence in the code was that `resolveVatRate` took the product and
// nothing else, so a can sold on the premises booked at 5,5 %: an
// under-declaration on every dine-in drink, and the reason this is a batch.
//
// NOTE WHAT IS NOT TESTED HERE: that the ORDER ROUTE passes the order type.
// A rule can be right while nothing consults it — Batch 5.8 shipped exactly
// that mistake — so `orders-vat-by-order-type.test.ts` drives the real handler.
describe("resolveVatRate — the rate follows the order type (L-68)", () => {
  const CAN = {
    vatRate: 10,
    inheritCategoryVat: true,
    category: { vatRate: 10, vatRateTakeaway: 5.5, parent: null },
  };

  it("is the sur-place rate for DINE_IN", () => {
    expect(resolveVatRate(CAN, "DINE_IN")).toBe(10);
  });

  it("is the à-emporter rate for TAKEAWAY and LIVRAISON", () => {
    expect(resolveVatRate(CAN, "TAKEAWAY")).toBe(5.5);
    expect(resolveVatRate(CAN, "LIVRAISON")).toBe(5.5);
  });

  it("defaults to DINE_IN when no order type is given", () => {
    // The parameter is optional so the two display call sites did not have to
    // change. Defaulting to the reduced rate instead would have quietly
    // under-declared every caller that forgot to pass one.
    expect(resolveVatRate(CAN)).toBe(10);
  });

  it("keeps a 10 % product at 10 % under every order type", () => {
    // The safety property of the whole change: `vatRateTakeaway` is null
    // everywhere until a category sets it, so nothing moved when the column
    // was added. A pizza is 10 % eaten in or taken away.
    const pizza = { vatRate: 10, inheritCategoryVat: true, category: { vatRate: 10, parent: null } };
    for (const t of ["DINE_IN", "TAKEAWAY", "LIVRAISON"] as const) {
      expect(resolveVatRate(pizza, t)).toBe(10);
    }
  });

  it("falls back to the sur-place rate when the category sets no à-emporter rate", () => {
    const noTakeaway = { vatRate: 10, inheritCategoryVat: true, category: { vatRate: 5.5, parent: null } };
    expect(resolveVatRate(noTakeaway, "TAKEAWAY")).toBe(5.5);
    expect(resolveVatRate(noTakeaway, "DINE_IN")).toBe(5.5);
  });

  it("reads both rates off the PARENT when the parent is what governs", () => {
    const sub = {
      vatRate: 10,
      inheritCategoryVat: true,
      category: { vatRate: null, vatRateTakeaway: null, parent: { vatRate: 10, vatRateTakeaway: 5.5 } },
    };
    expect(resolveVatRate(sub, "DINE_IN")).toBe(10);
    expect(resolveVatRate(sub, "TAKEAWAY")).toBe(5.5);
  });

  it("takes BOTH rates from the same level, never one from each", () => {
    // The child sets the sur-place rate, so the child governs — and the
    // parent's à-emporter rate must NOT leak in underneath it. Resolving the
    // two independently would tax one sale from two places in the catalogue,
    // and neither half would look wrong on its own.
    const mixed = {
      vatRate: 10,
      inheritCategoryVat: true,
      category: { vatRate: 10, vatRateTakeaway: null, parent: { vatRate: 5.5, vatRateTakeaway: 5.5 } },
    };
    expect(resolveVatRate(mixed, "DINE_IN")).toBe(10);
    expect(resolveVatRate(mixed, "TAKEAWAY")).toBe(10);
  });

  it("lets a product that opts out of inheritance keep its own rate everywhere", () => {
    // A product with a bespoke rate is that rate under every order type. The
    // à-emporter rate lives on the category only — see the batch's *Left open*.
    const own = {
      vatRate: 10,
      inheritCategoryVat: false,
      category: { vatRate: 5.5, vatRateTakeaway: 5.5, parent: null },
    };
    for (const t of ["DINE_IN", "TAKEAWAY", "LIVRAISON"] as const) {
      expect(resolveVatRate(own, t)).toBe(10);
    }
  });
});
