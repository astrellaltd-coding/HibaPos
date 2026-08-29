import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { db } from "@/lib/db";

// GET /api/fiscal/closes — list sealed monthly + annual clôtures.
export const GET = withAuth(
  async () => {
    const [monthly, annual] = await Promise.all([
      db.monthlyClose.findMany({ orderBy: { period: "desc" }, take: 200 }),
      db.annualClose.findMany({ orderBy: { period: "desc" }, take: 50 }),
    ]);
    return NextResponse.json({ monthly, annual });
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
