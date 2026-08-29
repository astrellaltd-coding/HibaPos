import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { addOnSchema } from "@/lib/validation";
import { audit } from "@/lib/services/audit";

export const GET = withAuth(async (req) => {
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("all") === "1";
  const addons = await db.addOn.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(addons);
});

export const POST = withAuth(async (req, { user }) => {
  if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ error: "Réservé au manager ou super administrateur" }, { status: 403 });
  }
  const body = await parseJson(req);
  const parsed = addOnSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalide" }, { status: 400 });
  }
  const addon = await db.addOn.create({ data: parsed.data });
  await audit("ADDON_CREATED", "AddOn", addon.id, parsed.data, user.id);
  return NextResponse.json(addon, { status: 201 });
});
