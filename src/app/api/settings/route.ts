import { NextResponse } from "next/server";
import { withAuth, parseJson } from "@/lib/api-handler";
import { getSettings, saveSettings } from "@/lib/services/settings";
import { settingsSchema } from "@/lib/validation";
import { audit } from "@/lib/services/audit";

// M-19s (Batch 4.4b): this read was open to any authenticated role while
// `PUT` below is SUPER_ADMIN-only. It returns the SIRET, the TVA number, the
// address, the printer configuration and the discount approval threshold, so
// read and write now agree. With one operational role this changes no
// observable behaviour — both surviving roles are named — which is the point:
// it removes a latent inconsistency rather than a live leak. Batch 4.4's
// measurement is why this could not be done before: `discount-dialog.tsx`,
// `payment-dialog.tsx`, `receipt-dialog.tsx` and `orders-view.tsx` all read
// this route from views that were CASHIER-visible.
export const GET = withAuth(
  async () => {
    const settings = await getSettings();
    return NextResponse.json(settings);
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);

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
