import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-handler";
import { deleteBackup } from "@/lib/services/backup";
import { audit } from "@/lib/services/audit";

export const DELETE = withAuthParams(async (_req, { user, params }) => {
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Réservé au super administrateur" }, { status: 403 });
  }
  await deleteBackup(params.id);
  await audit("BACKUP_DELETED", "Backup", params.id, null, user.id);
  return NextResponse.json({ ok: true });
});
