import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-handler";
import { audit } from "@/lib/services/audit";

// Seed default tables if none exist.
//
// ── L-184 (2026-09-14) — THE DECLARATION NOW MATCHES THE HANDLER ────────────
// This declared `{ roles: ["SUPER_ADMIN", "MANAGER"] }` and then answered a
// MANAGER `403 « Réservé au super administrateur »` in its first three lines.
// Two statements of the same rule, disagreeing — and the one the authorization
// map reads is the DECLARATION, so the map said a MANAGER could seed the
// default tables and the route said otherwise.
//
// **Which side is right did NOT need DD-09 reopened**, though the finding was
// filed as though it did. `POST /api/tables` — creating ONE table — is already
// SUPER_ADMIN-only, and seeding eight at once cannot be less privileged than
// creating one. Whether table service ever returns does not move that line.
//
// What settled the FORM is L-151: the declarative refusal writes an audit row
// (`api-handler.ts`), and an inline `return 403` writes nothing. A MANAGER
// attempting this was refused SILENTLY, in a system whose whole point is that
// refused privileged actions leave a trace. Declaring it is also the direction
// R8.1 took with `settings:PUT` — « declared, not inline » (DD-26).
export const POST = withAuth(async (_req, { user }) => {
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

  // Atomic seed — all-or-nothing.
  await db.$transaction(async (tx) => {
    for (const t of defaultTables) {
      await tx.table.create({ data: t });
    }
  });

  await audit("TABLES_SEEDED", "Table", null, { count: defaultTables.length }, user.id);
  return NextResponse.json({ ok: true, created: defaultTables.length });
}, { roles: ["SUPER_ADMIN"] });
