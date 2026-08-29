import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { audit } from "@/lib/services/audit";
import { z } from "zod";

// Update product images for products that match by name.
// Body: { images: { "Product Name": "/products/image.png", ... } }
const schema = z.object({
  images: z.record(z.string(), z.string()).refine(
    (rec) => Object.keys(rec).length > 0,
    "Au moins une image requise",
  ),
});

export const POST = withAuth(async (req, { user }) => {
  const body = await parseJson(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Format invalide" }, { status: 400 });
  }
  // Atomic bulk update — all-or-nothing.
  const updated = await db.$transaction(async (tx) => {
    let count = 0;
    for (const [name, image] of Object.entries(parsed.data.images)) {
      const result = await tx.product.updateMany({
        where: { name },
        data: { image },
      });
      count += result.count;
    }
    return count;
  });
  await audit("PRODUCT_IMAGES_UPDATED", "Product", null, { updated }, user.id);
  return NextResponse.json({ ok: true, updated });
}, { roles: ["SUPER_ADMIN"] });
