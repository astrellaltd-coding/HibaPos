import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";

export const GET = withAuth(
  async (req) => {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);
    const action = url.searchParams.get("action");
    const logs = await db.auditLog.findMany({
      where: action ? { action: { contains: action } } : {},
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { name: true, username: true } } },
    });
    return NextResponse.json(logs);
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
