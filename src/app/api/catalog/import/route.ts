import { NextResponse } from "next/server";
import { withAuth, parseJson } from "@/lib/api-handler";
import {
  importCatalogue,
  CatalogueImportError,
  type CatalogueExport,
} from "@/lib/services/catalogue-transfer";
import { audit } from "@/lib/services/audit";

// POST /api/catalog/import — write a catalogue into an EMPTY one.
//
// SUPER_ADMIN only, declaratively, and destructive by nature: it populates the
// thing every price, every menu and every VAT rate is read from. It is listed
// in `api-authorization.test.ts`'s `DESTRUCTIVE` table for that reason.
//
// It does NOT merge. `importCatalogue` refuses unless all ten catalogue tables
// are empty, and refuses inside the transaction that would do the writing, so
// a refusal leaves nothing behind. Merging would mean deciding what to do about
// two products with the same name — and L-82, three live pairs sharing a name,
// is what that decision looks like when it is made by accident.
//
// The refusal is a 409 rather than a 400: the request is well-formed, the
// database is simply not in a state where it can be answered.
export const POST = withAuth(
  async (req, { user }) => {
    const body = (await parseJson(req)) as CatalogueExport | null;
    if (!body) {
      return NextResponse.json({ error: "Corps de requête vide ou invalide." }, { status: 400 });
    }
    try {
      const result = await importCatalogue(body);
      await audit(
        "CATALOGUE_IMPORTED",
        "Catalogue",
        null,
        { inserted: result.inserted, total: result.total, from: result.from },
        user.id,
      );
      return NextResponse.json(result);
    } catch (e) {
      if (e instanceof CatalogueImportError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
  },
  { roles: ["SUPER_ADMIN"] },
);
