import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { exportCatalogue } from "@/lib/services/catalogue-transfer";
import { audit } from "@/lib/services/audit";

// GET /api/catalog/export — the whole catalogue as one JSON file.
//
// SUPER_ADMIN only, declaratively. It is a read, but it hands over every
// product, price and menu structure in one request, which is the same class of
// thing DD-22 made `GET /api/users` and `GET /api/backups` SUPER_ADMIN for. The
// till's operator has no use for it; the person moving the catalogue to a new
// install does.
//
// It writes nothing to the catalogue and is safe to run at any time — the only
// write is the `AuditLog` row below, which records that a copy was taken.
// `Content-Disposition` makes a browser save it rather than render it.
export const GET = withAuth(
  async (_req, { user }) => {
    const data = await exportCatalogue();
    await audit(
      "CATALOGUE_EXPORTED",
      "Catalogue",
      null,
      { counts: data.counts, missingImages: data.missingImages.length },
      user.id,
    );
    const stamp = data.exportedAt.replace(/[:.]/g, "-");
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="hibapos-catalogue-${stamp}.json"`,
        // Never cached: a catalogue export is a point-in-time copy and a stale
        // one is worse than none.
        "cache-control": "no-store",
      },
    });
  },
  { roles: ["SUPER_ADMIN"] },
);
