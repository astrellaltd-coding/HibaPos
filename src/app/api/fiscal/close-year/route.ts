import { NextResponse } from "next/server";
import { withAuth, parseJson } from "@/lib/api-handler";
import { z } from "zod";
import { closeYear } from "@/lib/services/fiscal";
import { getSettings } from "@/lib/services/settings";

const schema = z.object({
  year: z.number().int().min(2000).max(2100),
});

// POST /api/fiscal/close-year — seal an annual clôture (ISCA archivage).
// Restricted to SUPER_ADMIN. One per "YYYY" period; idempotency rejected 409.
export const POST = withAuth(
  async (req, { user }) => {
    const body = await parseJson(req);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Année invalide" }, { status: 400 });
    }
    const settings = await getSettings();
    try {
      const close = await closeYear(parsed.data.year, user.id, settings.factice ?? false);
      return NextResponse.json(close, { status: 201 });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Erreur de clôture" },
        { status: 409 },
      );
    }
  },
  { roles: ["SUPER_ADMIN"] },
);
