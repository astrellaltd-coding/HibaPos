import { NextResponse } from "next/server";
import { withAuth, parseJson } from "@/lib/api-handler";
import { z } from "zod";
import { closeDay } from "@/lib/services/fiscal";
import { getSettings } from "@/lib/services/settings";

const schema = z.object({
  // The TRADING day, "YYYY-MM-DD" on the cut-off clock — not a calendar date
  // picked by the client. `closeDay` derives its own bounds from it.
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Journée invalide (format attendu AAAA-MM-JJ)"),
});

// POST /api/fiscal/close-day — seal a trading day (DD-23, ISCA conservation).
// One per "YYYY-MM-DD"; a duplicate, a day that has not ended, an open caisse
// and an out-of-sequence day are all refused with 409, the same shape as the
// monthly and annual closes beside it.
export const POST = withAuth(
  async (req, { user }) => {
    const body = await parseJson(req);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Journée invalide" },
        { status: 400 },
      );
    }
    const settings = await getSettings();
    try {
      const close = await closeDay(parsed.data.day, user.id, settings.factice ?? false);
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
