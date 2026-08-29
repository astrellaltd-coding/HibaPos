import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { db } from "@/lib/db";

// GET /api/fiscal/grand-total — the perpetual grand total (never resets).
export const GET = withAuth(
  async () => {
    const gt = await db.grandTotal.findUnique({ where: { id: "singleton" } });
    return NextResponse.json(
      gt ?? {
        totalSales: 0,
        totalOrders: 0,
        totalVat: 0,
        totalCash: 0,
        totalCard: 0,
        totalVoucher: 0,
        totalRefunded: 0,
        lastUpdatedAt: null,
      },
    );
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
