import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams, parseJson } from "@/lib/api-handler";
import { categorySchema, categoryOptionGroupSchema, categoryAddOnSchema } from "@/lib/validation";
import { audit } from "@/lib/services/audit";

export const GET = withAuthParams(async (_req, { params }) => {
  const cat = await db.category.findUnique({
    where: { id: params.id },
    include: {
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true }, orderBy: { sortOrder: "asc" } },
      optionGroups: { include: { choices: true }, orderBy: { sortOrder: "asc" } },
      addOns: { orderBy: { sortOrder: "asc" } },
      _count: { select: { products: true } },
    },
  });
  if (!cat) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  // Product count = direct + descendant products (children only, max depth = 2)
  const childProductCounts = await db.category.findMany({
    where: { parentId: params.id },
    select: { _count: { select: { products: true } } },
  });
  const descendantCount = childProductCounts.reduce((sum, c) => sum + c._count.products, 0);

  return NextResponse.json({
    id: cat.id,
    name: cat.name,
    color: cat.color,
    icon: cat.icon,
    sortOrder: cat.sortOrder,
    active: cat.active,
    parentId: cat.parentId,
    parentName: cat.parent?.name ?? null,
    children: cat.children.map((ch) => ({ id: ch.id, name: ch.name })),
    productCount: cat._count.products + descendantCount,
    optionGroups: cat.optionGroups.map((g) => ({
      id: g.id,
      name: g.name,
      required: g.required,
      multiple: g.multiple,
      sortOrder: g.sortOrder,
      choices: g.choices.map((c) => ({
        id: c.id,
        name: c.name,
        priceModifier: c.priceModifier,
        pickupPriceModifier: c.pickupPriceModifier,
        deliveryPriceModifier: c.deliveryPriceModifier,
        pickupPrice: c.pickupPrice,
        deliveryPrice: c.deliveryPrice,
        image: c.image,
        sortOrder: c.sortOrder,
      })),
    })),
    addOns: cat.addOns.map((a) => ({
      id: a.id,
      name: a.name,
      price: a.price,
      image: a.image,
      sortOrder: a.sortOrder,
      active: a.active,
    })),
  });
});

export const PUT = withAuthParams(async (req, { user, params }) => {
  if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ error: "Réservé au manager ou super administrateur" }, { status: 403 });
  }
  const body = (await parseJson(req)) as Record<string, unknown>;

  // Validate basic category fields if present
  const parsed = categorySchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalide" }, { status: 400 });
  }

  const incomingParentId = body.parentId as string | null | undefined;

  // --- parentId guards ---
  if (incomingParentId !== undefined) {
    // Cycle guard: cannot be its own parent
    if (incomingParentId === params.id) {
      return NextResponse.json({ error: "Une catégorie ne peut pas être son propre parent" }, { status: 400 });
    }

    // Depth guard: if setting a parent, the parent must be top-level
    if (incomingParentId) {
      const parent = await db.category.findUnique({
        where: { id: incomingParentId },
        select: { parentId: true },
      });
      if (!parent) {
        return NextResponse.json({ error: "Catégorie parente introuvable" }, { status: 400 });
      }
      if (parent.parentId) {
        return NextResponse.json({ error: "La catégorie parente ne peut pas elle-même avoir de parent (max 2 niveaux)" }, { status: 400 });
      }

      // Cycle guard: cannot set a child as parent (would create depth > 2 or cycle)
      const isChild = await db.category.findFirst({
        where: { parentId: params.id, id: incomingParentId },
      });
      if (isChild) {
        return NextResponse.json({ error: "Impossible de définir une sous-catégorie comme parent" }, { status: 400 });
      }
    }
  }

  const cat = await db.$transaction(async (tx) => {
    // Update category basic fields
    const updateData: Record<string, unknown> = { ...parsed.data };
    if (incomingParentId !== undefined) {
      updateData.parentId = incomingParentId ?? null;
    }
    await tx.category.update({
      where: { id: params.id },
      data: updateData,
    });

    // Active cascade: deactivating a parent also deactivates its children
    if (parsed.data.active === false) {
      await tx.category.updateMany({
        where: { parentId: params.id },
        data: { active: false },
      });
    }

    // Replace option groups wholesale if provided
    const optionGroups = body.optionGroups;
    if (Array.isArray(optionGroups)) {
      // Delete old groups (cascade deletes choices)
      await tx.categoryOptionGroup.deleteMany({ where: { categoryId: params.id } });

      for (let i = 0; i < optionGroups.length; i++) {
        const g = optionGroups[i];
        const groupParsed = categoryOptionGroupSchema.safeParse(g);
        if (!groupParsed.success) continue;

        const created = await tx.categoryOptionGroup.create({
          data: {
            categoryId: params.id,
            name: groupParsed.data.name,
            required: groupParsed.data.required,
            multiple: groupParsed.data.multiple,
            sortOrder: i,
          },
        });
        for (let j = 0; j < groupParsed.data.choices.length; j++) {
          const ch = groupParsed.data.choices[j];
          await tx.categoryOptionChoice.create({
            data: {
              groupId: created.id,
              name: ch.name,
              priceModifier: ch.priceModifier,
              pickupPriceModifier: ch.pickupPriceModifier ?? null,
              deliveryPriceModifier: ch.deliveryPriceModifier ?? null,
              pickupPrice: ch.pickupPrice ?? null,
              deliveryPrice: ch.deliveryPrice ?? null,
              image: ch.image ?? null,
              sortOrder: j,
            },
          });
        }
      }
    }

    // Replace add-ons wholesale if provided
    const addOns = body.addOns;
    if (Array.isArray(addOns)) {
      await tx.categoryAddOn.deleteMany({ where: { categoryId: params.id } });

      for (let i = 0; i < addOns.length; i++) {
        const a = addOns[i];
        const addonParsed = categoryAddOnSchema.safeParse(a);
        if (!addonParsed.success) continue;

        await tx.categoryAddOn.create({
          data: {
            categoryId: params.id,
            name: addonParsed.data.name,
            price: addonParsed.data.price,
            image: addonParsed.data.image ?? null,
            sortOrder: i,
            active: addonParsed.data.active,
          },
        });
      }
    }

    return tx.category.findUnique({
      where: { id: params.id },
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true }, orderBy: { sortOrder: "asc" } },
        optionGroups: { include: { choices: true }, orderBy: { sortOrder: "asc" } },
        addOns: { orderBy: { sortOrder: "asc" } },
        _count: { select: { products: true } },
      },
    });
  });

  await audit("CATEGORY_UPDATED", "Category", params.id, { name: parsed.data.name }, user.id);

  const descendantCount = (await db.category.findMany({
    where: { parentId: params.id },
    select: { _count: { select: { products: true } } },
  })).reduce((sum, c) => sum + c._count.products, 0);

  return NextResponse.json({
    id: cat!.id,
    name: cat!.name,
    color: cat!.color,
    icon: cat!.icon,
    sortOrder: cat!.sortOrder,
    active: cat!.active,
    parentId: cat!.parentId,
    parentName: cat!.parent?.name ?? null,
    children: cat!.children.map((ch) => ({ id: ch.id, name: ch.name })),
    productCount: cat!._count.products + descendantCount,
    optionGroups: cat!.optionGroups,
    addOns: cat!.addOns,
  });
});

export const DELETE = withAuthParams(async (_req, { user, params }) => {
  if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ error: "Réservé au manager ou super administrateur" }, { status: 403 });
  }

  // Block if children exist
  const childCount = await db.category.count({ where: { parentId: params.id } });
  if (childCount > 0) {
    return NextResponse.json(
      { error: "Impossible de supprimer : des sous-catégories sont rattachées. Supprimez-les d'abord." },
      { status: 409 },
    );
  }

  const count = await db.product.count({ where: { categoryId: params.id, active: true } });
  if (count > 0) {
    return NextResponse.json(
      { error: "Impossible de supprimer : des produits actifs utilisent cette catégorie" },
      { status: 409 },
    );
  }
  // Soft-delete: deactivate the category
  const cat = await db.category.update({
    where: { id: params.id },
    data: { active: false },
  });
  await audit("CATEGORY_DEACTIVATED", "Category", params.id, { name: cat.name }, user.id);
  return NextResponse.json({ ok: true });
});
