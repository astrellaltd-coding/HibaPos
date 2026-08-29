import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { computeShiftReport } from "@/lib/services/reports";
import { audit } from "@/lib/services/audit";

async function getXReport(shiftId?: string | null) {
  if (!shiftId) {
    const open = await db.shift.findFirst({ where: { status: "OPEN" }, orderBy: { openedAt: "desc" } });
    if (!open) return { error: "Aucune caisse ouverte", status: 404 };
    const report = await computeShiftReport(open.id);
    const shift = await db.shift.findUniqueOrThrow({
      where: { id: open.id },
      include: {
        openedBy: { select: { name: true, username: true } },
        closedBy: { select: { name: true, username: true } },
      },
    });
    return { data: { shift, ...report, generatedAt: new Date().toISOString() } };
  }
  const shift = await db.shift.findUnique({
    where: { id: shiftId },
    include: {
      openedBy: { select: { name: true, username: true } },
      closedBy: { select: { name: true, username: true } },
    },
  });
  if (!shift) return { error: "Caisse introuvable", status: 404 };
  const report = await computeShiftReport(shiftId);
  return { data: { shift, ...report, generatedAt: new Date().toISOString() } };
}

export const GET = withAuth(async (req) => {
  const url = new URL(req.url);
  const shiftId = url.searchParams.get("shiftId");
  const result = await getXReport(shiftId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
});

export const POST = withAuth(
  async (req, { user }) => {
    const body = await parseJson(req).catch(() => ({})) as Record<string, unknown>;
    const shiftId = typeof body.shiftId === "string" ? body.shiftId : null;
    const result = await getXReport(shiftId);
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
    await audit("REPORT_X_GENERATED", "Report", null, { shiftId }, user.id);
    return NextResponse.json(result.data);
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
