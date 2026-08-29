import { NextResponse } from "next/server";
import { withAuth, parseJson } from "@/lib/api-handler";
import { z } from "zod";
import { closeMonth } from "@/lib/services/fiscal";
import { getSettings } from "@/lib/services/settings";

const schema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

// POST /api/fiscal/close-month — seal a monthly clôture (ISCA conservation).
// One per "YYYY-MM" period; idempotency rejected with 409.
export const POST = withAuth(
  async (req, { user }) => {
    const body = await parseJson(req);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Année/mois invalides" }, { status: 400 });
    }
    const settings = await getSettings();
    try {
      const close = await closeMonth(parsed.data.year, parsed.data.month, user.id, settings.factice ?? false);
      return NextResponse.json(close, { status: 201 });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Erreur de clôture" },
        { status: 409 },
      );
    }
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
