import { NextResponse } from "next/server";
import { withAuth, parseJson } from "@/lib/api-handler";
import { createBackup, listBackups } from "@/lib/services/backup";

export const GET = withAuth(
  async () => {
    const backups = await listBackups();
    return NextResponse.json(backups);
  },
  // DD-22 / L-33 (Batch 7.4b) — narrowed from `["SUPER_ADMIN", "MANAGER"]`.
  //
  // Since Batch 4.4b removed `CASHIER`, that pair admitted the ENTIRE role
  // model — no narrower than declaring no roles at all. This endpoint answered
  // 200 to a MANAGER whose navigation entry for the screen is deliberately
  // SUPER_ADMIN-only (DD-07), so the API contradicted the navigation.
  // `GET /api/logs` already answered 403 and is the shape this now matches.
  //
  // Verified before the change was proposed: **nothing in `src/` calls this as
  // a MANAGER**, so no screen breaks. The operator decided it (DD-22).
  { roles: ["SUPER_ADMIN"] },
);

export const POST = withAuth(async (req, { user }) => {
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Réservé au super administrateur" }, { status: 403 });
  }
  await parseJson(req).catch(() => null);
  const backup = await createBackup(user.id);
  return NextResponse.json(backup, { status: 201 });
});
