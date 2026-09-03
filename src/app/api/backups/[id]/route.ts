import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-handler";
import { deleteBackup } from "@/lib/services/backup";

export const DELETE = withAuthParams(async (_req, { user, params }) => {
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Réservé au super administrateur" }, { status: 403 });
  }
  // deleteBackup journals the deletion (SUPPRESSION_SAUVEGARDE) and writes the
  // BACKUP_DELETED audit entry itself, with the filename, checksum and fiscal
  // sequence attached — the route no longer duplicates a bare audit call.
  await deleteBackup(params.id, user.id);
  return NextResponse.json({ ok: true });
});
