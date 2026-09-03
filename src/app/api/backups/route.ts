import { NextResponse } from "next/server";
import { withAuth, parseJson } from "@/lib/api-handler";
import { createBackup, listBackups } from "@/lib/services/backup";

export const GET = withAuth(async () => {
  const backups = await listBackups();
  return NextResponse.json(backups);
}, { roles: ["SUPER_ADMIN", "MANAGER"] });

export const POST = withAuth(async (req, { user }) => {
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Réservé au super administrateur" }, { status: 403 });
  }
  await parseJson(req).catch(() => null);
  const backup = await createBackup(user.id);
  return NextResponse.json(backup, { status: 201 });
});
