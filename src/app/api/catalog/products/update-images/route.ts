import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import { audit } from "@/lib/services/audit";

// Update product images for products that match by name.
// Body: { images: { "Product Name": "/products/image.png", ... } }
export const POST = withAuth(async (req, { user }) => {
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Réservé au super administrateur" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.images || typeof body.images !== "object") {
    return NextResponse.json({ error: "Format invalide" }, { status: 400 });
  }
  let updated = 0;
  for (const [name, image] of Object.entries(body.images)) {
    const result = await db.product.updateMany({
      where: { name },
      data: { image: image as string },
    });
    updated += result.count;
  }
  await audit("PRODUCT_IMAGES_UPDATED", "Product", null, { updated }, user.id);
  return NextResponse.json({ ok: true, updated });
});
