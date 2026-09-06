import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { db } from "@/lib/db";

// GET /api/fiscal/closes — list sealed daily + monthly + annual clôtures.
// DD-23 (Batch 3.8) added the daily ones; they are the most numerous, so they
// carry the largest page.
export const GET = withAuth(
  async () => {
    const [daily, monthly, annual] = await Promise.all([
      db.dailyClose.findMany({ orderBy: { period: "desc" }, take: 400 }),
      db.monthlyClose.findMany({ orderBy: { period: "desc" }, take: 200 }),
      db.annualClose.findMany({ orderBy: { period: "desc" }, take: 50 }),
    ]);
    return NextResponse.json({ daily, monthly, annual });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
