import { NextResponse } from "next/server";
import { inheritedGroupNames, splitOwnFromInherited } from "@/lib/services/product-options";
import { db } from "@/lib/db";
import { withAuthParams, parseJson } from "@/lib/api-handler";
import { productSchema, validateComboShape, COMBO_NEEDS_A_SLOT } from "@/lib/validation";
import { validateComboAgainstCatalogue, replaceComboSlots } from "@/lib/services/combo-admin";
import { audit } from "@/lib/services/audit";
import type { ProductDto } from "@/types/api";
import { Prisma } from "@prisma/client";
import { resolveVatRate } from "@/lib/services/pricing";

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    category: {
      include: {
        optionGroups: { include: { choices: true } };
        addOns: true;
        parent: {
          include: {
            optionGroups: { include: { choices: true } };
            addOns: true;
          };
        };
      };
    };
    options: { include: { choices: true } };
    comboSlots: { include: { choices: true; optionRules: true } };
  };
}>;

function serialize(p: ProductWithRelations): ProductDto {
  const inheritGlobals = p.inheritCategoryGlobals !== false;

  const basePrice = p.price ?? 0;
  const pickupBase = p.pickupPrice ?? basePrice;
  const deliveryBase = p.deliveryPrice ?? basePrice;

  // Sub-categories are folders: products inherit options/add-ons from the parent category.
  const effectiveCategory = p.category?.parent ?? p.category;

  const categoryOptions = inheritGlobals
    ? (effectiveCategory?.optionGroups ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((g) => ({
          id: g.id,
          name: g.name,
          required: g.required,
          multiple: g.multiple,
          sortOrder: g.sortOrder,
          inherited: true,
          choices: (g.choices ?? [])
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((c) => {
              const hasAbsolute = c.pickupPrice != null;
              if (hasAbsolute) {
                const absPickup = Number(c.pickupPrice);
                const absDelivery = c.deliveryPrice != null ? Number(c.deliveryPrice) : absPickup;
                return {
                  id: c.id,
                  name: c.name,
                  priceModifier: parseFloat((absPickup - basePrice).toFixed(2)),
                  pickupPriceModifier: parseFloat((absPickup - pickupBase).toFixed(2)),
                  deliveryPriceModifier: parseFloat((absDelivery - deliveryBase).toFixed(2)),
                  pickupPrice: absPickup,
                  deliveryPrice: absDelivery,
                  image: c.image ?? null,
                  sortOrder: c.sortOrder,
                };
              }
              return {
                id: c.id,
                name: c.name,
                priceModifier: c.priceModifier,
                pickupPriceModifier: c.pickupPriceModifier ?? null,
                deliveryPriceModifier: c.deliveryPriceModifier ?? null,
                pickupPrice: null,
                deliveryPrice: null,
                image: c.image ?? null,
                sortOrder: c.sortOrder,
              };
            }),
        }))
    : [];

  const productOptions = (p.options ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => ({
      id: g.id,
      name: g.name,
      required: g.required,
      multiple: g.multiple,
      sortOrder: g.sortOrder,
      inherited: false,
      choices: (g.choices ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => ({
          id: c.id,
          name: c.name,
          priceModifier: c.priceModifier,
          pickupPriceModifier: c.pickupPriceModifier ?? null,
          deliveryPriceModifier: c.deliveryPriceModifier ?? null,
          image: c.image ?? null,
          sortOrder: c.sortOrder,
        })),
    }));

  const categoryAddOns = inheritGlobals
    ? (effectiveCategory?.addOns ?? [])
        .filter((a) => a.active)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((a) => ({
          id: a.id,
          name: a.name,
          price: a.price,
          image: a.image ?? null,
          sortOrder: a.sortOrder,
          active: a.active,
        }))
    : [];

  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    pickupPrice: p.pickupPrice ?? null,
    deliveryPrice: p.deliveryPrice ?? null,
    vatRate: p.vatRate,
    // L-16/L-17 (Batch 3.1c): `vatRate` above stays the product's OWN stored
    // value so the form can edit an override; `effectiveVatRate` is what a
    // sale would actually be taxed at.
    inheritCategoryVat: p.inheritCategoryVat ?? false,
    effectiveVatRate: resolveVatRate(p),
    categoryId: p.categoryId,
    image: p.image ?? null,
    active: p.active,
    available: p.available,
    // R3.1. `?? true` is the vintage guard, not a default: a row read through a
    // client generated before the column existed has `undefined` here, and the
    // honest reading of that is « this product appeared on the grid », which is
    // what every row did before the migration.
    showOnPos: p.showOnPos ?? true,
    inheritCategoryGlobals: inheritGlobals,
    sortOrder: p.sortOrder,
    options: [...categoryOptions, ...productOptions],
    // DD-15 (Batch 5.7a): this was `[...categoryAddOns, ...productAddOns]`.
    // The second half came from the `ProductAddon` join, which had no writer
    // anywhere, so it was ALWAYS `[]` and this concatenation always equalled
    // its first half. `ProductDto.addOns` therefore carries exactly what it
    // carried before — the category's add-ons, 21 of them on production.
    addOns: categoryAddOns,
    category: p.category
      ? { id: p.category.id, name: p.category.name, color: p.category.color }
      : undefined,
    // Batch 5.9. `comboSlots` may be absent when a caller fetched the product
    // without them; an ordinary product simply has none.
    isCombo: p.isCombo === true,
    comboSlots: (p.comboSlots ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((slot) => ({
        id: slot.id,
        name: slot.name,
        quantity: slot.quantity,
        sortOrder: slot.sortOrder,
        sourceCategoryId: slot.sourceCategoryId,
        choices: (slot.choices ?? [])
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((c) => ({ productId: c.productId, surcharge: c.surcharge, sortOrder: c.sortOrder })),
        optionRules: (slot.optionRules ?? []).map((r) => ({
          categoryOptionGroupId: r.categoryOptionGroupId,
          categoryOptionChoiceId: r.categoryOptionChoiceId,
        })),
      })),
  };
}

export const GET = withAuthParams(async (_req, { params }) => {
  const product = await db.product.findUnique({
    where: { id: params.id },
    include: {
      category: {
        include: {
          optionGroups: { include: { choices: true } },
          addOns: true,
          parent: {
            include: {
              optionGroups: { include: { choices: true } },
              addOns: true,
            },
          },
        },
      },
      options: { include: { choices: true } },
      // Batch 5.9 — the POS needs a menu's slots to ask for its components.
      comboSlots: { include: { choices: true, optionRules: true } },
    },
  });
  if (!product) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json(serialize(product));
});

export const PUT = withAuthParams(async (req, { user, params }) => {
  if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ error: "Réservé au manager ou super administrateur" }, { status: 403 });
  }
  const body = await parseJson(req);
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalide" }, { status: 400 });
  }
  const { options, comboSlots, ...productData } = parsed.data;

  // Batch 5.9e — a menu that could not be sold correctly is refused HERE,
  // where there is time to fix it. `docs/politique-ventilation-tva.md` § 4:
  // « Le repli est la ceinture, la validation est les bretelles. » The
  // higher-rate fallback still exists and still works; this is what is meant
  // to keep it from ever firing in service.
  const shapeErrors = validateComboShape(parsed.data);
  if (shapeErrors.length > 0) {
    return NextResponse.json({ error: shapeErrors[0], errors: shapeErrors }, { status: 400 });
  }
  // An update that does not send `comboSlots` keeps the ones the menu has —
  // but a product being TURNED INTO a menu has none to keep, and would be
  // saved as a menu that sells under the fallback. Asked of the database
  // because that is the only place the answer lives.
  if (parsed.data.isCombo && comboSlots === undefined) {
    const existing = await db.comboSlot.count({ where: { productId: params.id } });
    if (existing === 0) {
      return NextResponse.json({ error: COMBO_NEEDS_A_SLOT, errors: [COMBO_NEEDS_A_SLOT] }, { status: 400 });
    }
  }
  if (parsed.data.isCombo && comboSlots !== undefined) {
    const catalogueErrors = await validateComboAgainstCatalogue(comboSlots, params.id);
    if (catalogueErrors.length > 0) {
      return NextResponse.json({ error: catalogueErrors[0], errors: catalogueErrors }, { status: 400 });
    }
  }

  const product = await db.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: params.id },
      data: {
        name: productData.name,
        description: productData.description ?? null,
        price: productData.price,
        pickupPrice: productData.pickupPrice,
        deliveryPrice: productData.deliveryPrice,
        vatRate: productData.vatRate,
        inheritCategoryVat: productData.inheritCategoryVat,
        categoryId: productData.categoryId,
        image: productData.image ?? null,
        active: productData.active,
        available: productData.available,
        // R3.1. Enumerated like every field around it — this handler does not
        // spread `productData`, so a column added to the schema and not added
        // here is silently dropped on every write.
        showOnPos: productData.showOnPos,
        inheritCategoryGlobals: productData.inheritCategoryGlobals,
        isCombo: productData.isCombo,
        sortOrder: productData.sortOrder,
      },
    });
    // Batch 5.9. Replaced WHOLESALE, and only when the caller actually sent
    // the field — C-24's rule (Batch 4.6), and it matters more here than it
    // does for `options`: a menu whose slots a partial update silently wiped
    // would keep selling, at its forfait, under the higher-rate fallback,
    // over-taxing every sale with nothing on screen to say so.
    if (comboSlots !== undefined) {
      await replaceComboSlots(tx, params.id, comboSlots);
    }
    // Replace product-specific option groups wholesale — but ONLY when the
    // caller actually sent the field (C-24, Batch 4.6). `options` used to
    // default to `[]`, so a PUT that omitted it deleted every option group
    // the product had and returned 200. Absent now leaves them untouched;
    // an explicit `[]` still clears them.
    if (options !== undefined) {
      // L-67 (Batch 5.8). REFUSE TO STORE A GROUP THE PRODUCT ALREADY INHERITS.
      //
      // The GET merges the category's groups with the product's own and marks
      // neither, so any client that round-trips a product — the admin editor
      // does — sends the inherited ones straight back here. Persisting them
      // gave the product its own copy of every group its category provides,
      // while the category kept its own, and the POS then rendered each one
      // twice. Twelve products on production reached that state, all edited on
      // one afternoon; a « Sauces » group marked `required` had to be answered
      // twice before the product could be added to a basket.
      //
      // The rule is `scripts/fix-duplicate-product-options.ts`'s, reproduced
      // through the shared module so the guard and the repair cannot drift:
      // inheritance on, category is `parent ?? category`, names compared
      // trimmed and lower-cased. A product needing its own version of an
      // inherited group turns `inheritCategoryGlobals` off — with it on, a
      // same-named group is this corruption and not an override.
      //
      // Silent rather than a 400: the client is sending back what the GET gave
      // it, which is not a caller error, and failing the save would block an
      // operator from editing a price on any product with inherited options.
      const savedCategory = productData.categoryId
        ? await tx.category.findUnique({
            where: { id: productData.categoryId },
            include: { optionGroups: { select: { name: true } }, parent: { include: { optionGroups: { select: { name: true } } } } },
          })
        : null;
      const inherited = inheritedGroupNames(
        productData.inheritCategoryGlobals !== false,
        savedCategory,
      );
      const { own: ownGroups } = splitOwnFromInherited(options, inherited);

      await tx.optionGroup.deleteMany({ where: { productId: params.id } });
      for (let i = 0; i < ownGroups.length; i++) {
        const g = ownGroups[i];
        const group = await tx.optionGroup.create({
          data: {
            productId: params.id,
            name: g.name,
            required: g.required,
            multiple: g.multiple,
            sortOrder: i,
          },
        });
        for (let j = 0; j < g.choices.length; j++) {
          const ch = g.choices[j];
          await tx.optionChoice.create({
            data: {
              groupId: group.id,
              name: ch.name,
              priceModifier: ch.priceModifier,
              pickupPriceModifier: ch.pickupPriceModifier ?? null,
              deliveryPriceModifier: ch.deliveryPriceModifier ?? null,
              image: ch.image ?? null,
              sortOrder: j,
            },
          });
        }
      }
    }
    return tx.product.findUnique({
      where: { id: params.id },
      include: {
        category: {
          include: {
            optionGroups: { include: { choices: true } },
            addOns: true,
            parent: {
              include: {
                optionGroups: { include: { choices: true } },
                addOns: true,
              },
            },
          },
        },
        options: { include: { choices: true } },
        comboSlots: { include: { choices: true, optionRules: true } },
      },
    });
  });
  await audit("PRODUCT_UPDATED", "Product", params.id, { name: productData.name }, user.id);
  return NextResponse.json(serialize(product!));
});

export const DELETE = withAuthParams(async (_req, { user, params }) => {
  if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ error: "Réservé au manager ou super administrateur" }, { status: 403 });
  }
  // Soft delete by deactivating to preserve order history integrity.
  const product = await db.product.update({
    where: { id: params.id },
    data: { active: false },
  });
  await audit("PRODUCT_DELETED", "Product", params.id, { name: product.name }, user.id);
  return NextResponse.json({ ok: true });
});
