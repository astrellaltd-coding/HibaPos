import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";

// Returns the top N most-ordered products (by total quantity sold).
// Falls back to recently added products if no orders exist yet.
export const GET = withAuth(async (req) => {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "8"), 20);

  // Aggregate total quantity per product from completed orders.
  const topItems = await db.orderItem.groupBy({
    by: ["productId"],
    where: { productId: { not: null } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: limit,
  });

  const productIds = topItems.map((t) => t.productId).filter(Boolean) as string[];
  const products = await db.product.findMany({
    where: { id: { in: productIds }, active: true, available: true },
    include: {
      category: { select: { id: true, name: true, color: true } },
      options: { include: { choices: true } },
    },
  });

  // Preserve the order by quantity.
  const ranked = productIds
    .map((id) => {
      const p = products.find((x) => x.id === id);
      if (!p) return null;
      const qty = topItems.find((t) => t.productId === id)?._sum.quantity ?? 0;
      return { product: p, soldCount: qty };
    })
    .filter(Boolean) as { product: typeof products[0]; soldCount: number }[];

  // If fewer than `limit` favorites, fill with recently-added available products.
  if (ranked.length < limit) {
    const existingIds = new Set(productIds);
    const fillers = await db.product.findMany({
      where: { active: true, available: true, id: { notIn: [...existingIds] } },
      include: {
        category: { select: { id: true, name: true, color: true } },
        options: { include: { choices: true } },
      },
      orderBy: { sortOrder: "asc" },
      take: limit - ranked.length,
    });
    for (const f of fillers) {
      ranked.push({ product: f, soldCount: 0 });
    }
  }

  const serialized = ranked.map(({ product, soldCount }) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    vatRate: product.vatRate,
    categoryId: product.categoryId,
    image: product.image,
    active: product.active,
    available: product.available,
    sortOrder: product.sortOrder,
    options: (product.options ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((g) => ({
        id: g.id,
        name: g.name,
        required: g.required,
        multiple: g.multiple,
        sortOrder: g.sortOrder,
        choices: (g.choices ?? [])
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((c) => ({ ...c })),
      })),
    category: product.category
      ? { id: product.category.id, name: product.category.name, color: product.category.color }
      : null,
    soldCount,
  }));

  return NextResponse.json(serialized);
});
