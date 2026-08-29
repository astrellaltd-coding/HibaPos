import { NextResponse } from "next/server";
import { withAuth, parseJson } from "@/lib/api-handler";
import { getSettings, saveSettings } from "@/lib/services/settings";
import { settingsSchema } from "@/lib/validation";
import { audit } from "@/lib/services/audit";

export const GET = withAuth(async () => {
  const settings = await getSettings();
  return NextResponse.json(settings);
});

export const PUT = withAuth(async (req, { user }) => {
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Réservé au super administrateur" }, { status: 403 });
  }
  const body = await parseJson(req);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalide" }, { status: 400 });
  }
  const settings = await saveSettings(parsed.data);
  await audit("SETTINGS_UPDATED", "Setting", null, { keys: Object.keys(parsed.data) }, user.id);
  return NextResponse.json(settings);
});
