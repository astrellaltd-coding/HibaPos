import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import { audit } from "@/lib/services/audit";

// Seed default tables if none exist.
export const POST = withAuth(async (_req, { user }) => {
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Réservé au super administrateur" }, { status: 403 });
  }
  const count = await db.table.count();
  if (count > 0) {
    return NextResponse.json({ ok: true, message: "Tables déjà créées", skipped: true });
  }

  const defaultTables = [
    { label: "T1", seats: 2, zone: "Salle", sortOrder: 1 },
    { label: "T2", seats: 4, zone: "Salle", sortOrder: 2 },
    { label: "T3", seats: 4, zone: "Salle", sortOrder: 3 },
    { label: "T4", seats: 6, zone: "Salle", sortOrder: 4 },
    { label: "T5", seats: 2, zone: "Salle", sortOrder: 5 },
    { label: "T6", seats: 4, zone: "Terrasse", sortOrder: 6 },
    { label: "T7", seats: 4, zone: "Terrasse", sortOrder: 7 },
    { label: "T8", seats: 8, zone: "Terrasse", sortOrder: 8 },
  ];

  for (const t of defaultTables) {
    await db.table.create({ data: t });
  }

  await audit("TABLES_SEEDED", "Table", null, { count: defaultTables.length }, user.id);
  return NextResponse.json({ ok: true, created: defaultTables.length });
});
