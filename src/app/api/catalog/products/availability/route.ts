import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { z } from "zod";
import { audit } from "@/lib/services/audit";

// Bulk toggle product availability (mark as in-stock / out-of-stock / 86'd).
// Body: { updates: [{ id: string, available: boolean }] }
const schema = z.object({
  updates: z.array(z.object({ id: z.string(), available: z.boolean() })).min(1),
});

export const POST = withAuth(async (req, { user }) => {
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Réservé au super administrateur" }, { status: 403 });
  }
  const body = await parseJson(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Format invalide" }, { status: 400 });
  }

  let updated = 0;
  for (const u of parsed.data.updates) {
    const result = await db.product.updateMany({
      where: { id: u.id },
      data: { available: u.available },
    });
    updated += result.count;
  }

  await audit(
    "PRODUCT_AVAILABILITY_UPDATED",
    "Product",
    null,
    { updated, count: parsed.data.updates.length },
    user.id,
  );

  return NextResponse.json({ ok: true, updated });
});

// Get products that are currently out of stock (unavailable).
export const GET = withAuth(async () => {
  const outOfStock = await db.product.findMany({
    where: { available: false, active: true },
    select: { id: true, name: true, image: true, price: true, categoryId: true, category: { select: { name: true, color: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(outOfStock);
});
