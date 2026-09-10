import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { productSchema, validateComboShape } from "@/lib/validation";
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

// Serialize a raw product + category data into ProductDto.
// Category options are merged first, then product-specific options.
// Category add-ons are merged with product-specific add-ons.
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

export const GET = withAuth(async (req) => {
  const url = new URL(req.url);
  const categoryId = url.searchParams.get("categoryId");
  const subCategoryId = url.searchParams.get("subCategoryId");
  const includeInactive = url.searchParams.get("all") === "1";

  // Build categoryId filter:
  // - If subCategoryId is provided, filter by that exact category.
  // - If categoryId is a parent with children and no subCategoryId,
  //   include products from the parent + all its children.
  // - Otherwise, filter by exact categoryId.
  let categoryFilter: Prisma.ProductWhereInput["categoryId"] = undefined;
  if (subCategoryId) {
    categoryFilter = subCategoryId;
  } else if (categoryId) {
    const cat = await db.category.findUnique({
      where: { id: categoryId },
      include: { children: { select: { id: true } } },
    });
    if (cat && cat.children.length > 0) {
      const ids = [categoryId, ...cat.children.map((c) => c.id)];
      categoryFilter = { in: ids };
    } else {
      categoryFilter = categoryId;
    }
  }

  const products = await db.product.findMany({
    where: {
      ...(categoryFilter ? { categoryId: categoryFilter } : {}),
      ...(includeInactive ? {} : { active: true }),
    },
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
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(products.map(serialize));
});

export const POST = withAuth(async (req, { user }) => {
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
  // On CREATE there is nothing to preserve, so an absent field really does
  // mean « no slots » — and a menu with no slots is refused.
  const shapeErrors = validateComboShape({ ...parsed.data, comboSlots: comboSlots ?? [] });
  if (shapeErrors.length > 0) {
    return NextResponse.json({ error: shapeErrors[0], errors: shapeErrors }, { status: 400 });
  }
  if (parsed.data.isCombo && comboSlots !== undefined) {
    const catalogueErrors = await validateComboAgainstCatalogue(comboSlots, null);
    if (catalogueErrors.length > 0) {
      return NextResponse.json({ error: catalogueErrors[0], errors: catalogueErrors }, { status: 400 });
    }
  }

  const product = await db.$transaction(async (tx) => {
    const created = await tx.product.create({
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
      include: { options: { include: { choices: true } } },
    });
    // Batch 5.9. On create there is nothing to preserve, so absent means
    // "no slots" — the same reading `options` has four lines below.
    if (comboSlots !== undefined) {
      await replaceComboSlots(tx, created.id, comboSlots);
    }
    // `options` is optional since C-24 (Batch 4.6) so that a PUT omitting it
    // cannot wipe a product's groups. On create there is nothing to preserve,
    // so absent simply means "no product-specific groups".
    const groups = options ?? [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const group = await tx.optionGroup.create({
        data: {
          productId: created.id,
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
    return tx.product.findUnique({
      where: { id: created.id },
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
  await audit("PRODUCT_CREATED", "Product", product!.id, { name: product!.name }, user.id);
  return NextResponse.json(serialize(product!), { status: 201 });
});
