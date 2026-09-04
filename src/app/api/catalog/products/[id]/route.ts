import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams, parseJson } from "@/lib/api-handler";
import { productSchema } from "@/lib/validation";
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
    productAddons: { include: { addon: true } };
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

  const productAddOns = (p.productAddons ?? [])
    .filter((pa) => pa.addon?.active)
    .sort((a, b) => a.addon.sortOrder - b.addon.sortOrder)
    .map((pa) => ({
      id: pa.addon.id,
      name: pa.addon.name,
      price: pa.addon.price,
      image: pa.addon.image ?? null,
      sortOrder: pa.addon.sortOrder,
      active: pa.addon.active,
    }));

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
    inheritCategoryGlobals: inheritGlobals,
    sortOrder: p.sortOrder,
    options: [...categoryOptions, ...productOptions],
    addOns: [...categoryAddOns, ...productAddOns],
    category: p.category
      ? { id: p.category.id, name: p.category.name, color: p.category.color }
      : undefined,
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
      productAddons: { include: { addon: true } },
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
  const { options, ...productData } = parsed.data;
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
        inheritCategoryGlobals: productData.inheritCategoryGlobals,
        sortOrder: productData.sortOrder,
      },
    });
    // Replace product-specific option groups wholesale — but ONLY when the
    // caller actually sent the field (C-24, Batch 4.6). `options` used to
    // default to `[]`, so a PUT that omitted it deleted every option group
    // the product had and returned 200. Absent now leaves them untouched;
    // an explicit `[]` still clears them.
    if (options !== undefined) {
      await tx.optionGroup.deleteMany({ where: { productId: params.id } });
      for (let i = 0; i < options.length; i++) {
        const g = options[i];
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
        productAddons: { include: { addon: true } },
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
