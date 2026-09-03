import { NextResponse } from "next/server";
import { withAuthParams, parseJson } from "@/lib/api-handler";
import { restoreBackup } from "@/lib/services/backup";

/**
 * POST /api/backups/[id]/restore
 * SUPER_ADMIN-only. Restores the DB file from the encrypted backup, creating
 * a pre-restore safety snapshot (registered as its own Backup row) first.
 * The caller should refresh/invalidate everything afterwards — the entire
 * application state comes from the restored database.
 */
export const POST = withAuthParams(
  async (req, { user, params }) => {
    // Extra role check (withAuthParams options.roles is the primary gate).
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Réservé au super administrateur" }, { status: 403 });
    }
    await parseJson(req).catch(() => null);
    try {
      const result = await restoreBackup(params.id, user.id);
      return NextResponse.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Échec de la restauration";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  },
  { roles: ["SUPER_ADMIN"] },
);