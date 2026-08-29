import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams } from "@/lib/api-handler";
import { promises as fs } from "node:fs";
import path from "node:path";

const ARCHIVES_DIR = path.join(process.cwd(), "db", "fiscal-archives");

// GET /api/fiscal/archive/[year] — download a generated annual archive (JSON).
export const GET = withAuthParams(
  async (_req, { params }) => {
    const year = Number(params.year);
    if (!Number.isFinite(year)) {
      return NextResponse.json({ error: "Année invalide" }, { status: 400 });
    }
    const meta = await db.fiscalArchive.findUnique({ where: { year } });
    if (!meta) return NextResponse.json({ error: "Archive introuvable" }, { status: 404 });
    try {
      const content = await fs.readFile(path.join(ARCHIVES_DIR, meta.filename), "utf8");
      return new NextResponse(content, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${meta.filename}"`,
        },
      });
    } catch {
      return NextResponse.json(
        { error: "Fichier archive absent du disque. Régénérez-le via POST /api/fiscal/archive." },
        { status: 404 },
      );
    }
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
