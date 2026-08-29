import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { z } from "zod";
import { audit } from "@/lib/services/audit";

const tableSchema = z.object({
  label: z.string().min(1, "Le nom est requis").max(30),
  seats: z.number().int().min(1).max(20).default(4),
  zone: z.string().max(40).optional().nullable(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

export const GET = withAuth(async () => {
  const tables = await db.table.findMany({
    orderBy: [{ zone: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
  });
  return NextResponse.json(tables);
});

export const POST = withAuth(async (req, { user }) => {
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Réservé au super administrateur" }, { status: 403 });
  }
  const body = await parseJson(req);
  const parsed = tableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalide" }, { status: 400 });
  }
  const existing = await db.table.findUnique({ where: { label: parsed.data.label } });
  if (existing) {
    return NextResponse.json({ error: "Ce nom de table existe déjà" }, { status: 409 });
  }
  const table = await db.table.create({
    data: { ...parsed.data, zone: parsed.data.zone ?? null },
  });
  await audit("TABLE_CREATED", "Table", table.id, parsed.data, user.id);
  return NextResponse.json(table, { status: 201 });
});
