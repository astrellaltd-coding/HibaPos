import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { db } from "@/lib/db";

// GET /api/fiscal/events — list fiscal journal entries (newest first).
// Query params: ?limit=100 (max 500), ?type=VENTE to filter by event type.
export const GET = withAuth(
  async (req) => {
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
    const type = url.searchParams.get("type");
    const events = await db.fiscalEvent.findMany({
      where: type ? { type } : {},
      orderBy: { sequence: "desc" },
      take: limit,
    });
    return NextResponse.json(events);
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
