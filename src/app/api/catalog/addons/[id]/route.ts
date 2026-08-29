import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams, parseJson } from "@/lib/api-handler";
import { addOnSchema } from "@/lib/validation";
import { audit } from "@/lib/services/audit";

export const PUT = withAuthParams(async (req, { user, params }) => {
  if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ error: "Réservé au manager ou super administrateur" }, { status: 403 });
  }
  const body = await parseJson(req);
  const parsed = addOnSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalide" }, { status: 400 });
  }
  const addon = await db.addOn.update({ where: { id: params.id }, data: parsed.data });
  await audit("ADDON_UPDATED", "AddOn", addon.id, parsed.data, user.id);
  return NextResponse.json(addon);
});

export const DELETE = withAuthParams(async (_req, { user, params }) => {
  if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ error: "Réservé au manager ou super administrateur" }, { status: 403 });
  }
  await db.addOn.update({ where: { id: params.id }, data: { active: false } });
  await audit("ADDON_DELETED", "AddOn", params.id, null, user.id);
  return NextResponse.json({ ok: true });
});
