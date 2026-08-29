import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { z } from "zod";
import { computeShiftReport } from "@/lib/services/reports";
import { audit } from "@/lib/services/audit";

const xReportPostSchema = z.object({
  shiftId: z.string().min(1, "shiftId requis"),
});

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
    const body = (await parseJson(req)) as Record<string, unknown> | null;
    const parsed = xReportPostSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalide" },
        { status: 400 },
      );
    }
    const { shiftId } = parsed.data;
    const result = await getXReport(shiftId);
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
    await audit("REPORT_X_GENERATED", "Report", null, { shiftId }, user.id);
    return NextResponse.json(result.data);
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
