import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { backupStorageReport } from "@/lib/services/backup";

/**
 * GET /api/backups/storage — what is actually on disk, against what the
 * database believes. L-190 (drift) and L-194 (same volume).
 *
 * ── WHY IT IS ITS OWN ENDPOINT AND NOT PART OF `GET /api/backups` ───────────
 * That one is `db.backup.findMany()` — a table read, cheap, and polled by the
 * screen. This one does filesystem I/O: a `readdir` plus a `stat` per file, in
 * a folder that may be on a network share. Folding it in would make every
 * listing pay for it, and would change an endpoint's response shape for one
 * consumer's benefit.
 *
 * ── IT REPORTS. IT CHANGES NOTHING. ─────────────────────────────────────────
 * No write, no delete, no adoption of unmanaged files into the retention prune
 * — which would hand `pruneBackups` a file this software did not create and
 * cannot vouch for. The operator reads it and acts.
 *
 * SUPER_ADMIN only, matching `GET /api/backups` (DD-22 / L-33): the screen is
 * SUPER_ADMIN-only in the navigation, and an endpoint that answered a MANAGER
 * would contradict it. This one is narrower still in what it exposes — absolute
 * paths on the host — which is another reason not to widen it.
 */
export const GET = withAuth(
  async () => {
    const report = await backupStorageReport();
    return NextResponse.json(report);
  },
  { roles: ["SUPER_ADMIN"] },
);
