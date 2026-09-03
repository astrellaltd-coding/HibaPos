import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { categorySchema } from "@/lib/validation";
import { audit } from "@/lib/services/audit";

export const GET = withAuth(async () => {
  const categories = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true }, orderBy: { sortOrder: "asc" } },
      _count: { select: { products: true } },
    },
  });

  // Compute productCount as direct products + all descendant products.
  // Build a quick lookup of child IDs per parent.
  const childIdsByParent = new Map<string, string[]>();
  for (const c of categories) {
    if (c.parentId) {
      const existing = childIdsByParent.get(c.parentId) ?? [];
      existing.push(c.id);
      childIdsByParent.set(c.parentId, existing);
    }
  }

  // Descendant product counts (only 1 level deep per max-depth=2 rule)
  const descendantProductCounts = new Map<string, number>();
  for (const c of categories) {
    if (!c.parentId && c.children.length > 0) {
      const childIds = c.children.map((ch) => ch.id);
      const childProducts = categories
        .filter((cat) => childIds.includes(cat.id))
        .reduce((sum, cat) => sum + cat._count.products, 0);
      descendantProductCounts.set(c.id, childProducts);
    }
  }

  return NextResponse.json(
    categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      sortOrder: c.sortOrder,
      vatRate: c.vatRate,
      active: c.active,
      parentId: c.parentId,
      parentName: c.parent?.name ?? null,
      children: c.children.map((ch) => ({ id: ch.id, name: ch.name })),
      productCount: c._count.products + (descendantProductCounts.get(c.id) ?? 0),
    })),
  );
});

export const POST = withAuth(async (req, { user }) => {
  if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ error: "Réservé au manager ou super administrateur" }, { status: 403 });
  }
  const body = await parseJson(req);
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalide" }, { status: 400 });
  }

  const { parentId, ...data } = parsed.data;

  // Depth guard: parent must be top-level (no parent of its own)
  if (parentId) {
    const parent = await db.category.findUnique({ where: { id: parentId }, select: { parentId: true } });
    if (!parent) {
      return NextResponse.json({ error: "Catégorie parente introuvable" }, { status: 400 });
    }
    if (parent.parentId) {
      return NextResponse.json({ error: "La catégorie parente ne peut pas elle-même avoir de parent (max 2 niveaux)" }, { status: 400 });
    }
  }

  const cat = await db.category.create({ data: { ...data, parentId: parentId ?? null } });
  await audit("CATEGORY_CREATED", "Category", cat.id, parsed.data, user.id);
  return NextResponse.json(cat, { status: 201 });
});
