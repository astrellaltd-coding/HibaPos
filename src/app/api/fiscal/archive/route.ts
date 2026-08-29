import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { generateAnnualArchive } from "@/lib/services/fiscal";
import { promises as fs } from "node:fs";
import path from "node:path";

const ARCHIVES_DIR = path.join(process.cwd(), "db", "fiscal-archives");

// GET /api/fiscal/archive — list generated annual archives.
export const GET = withAuth(
  async () => {
    const archives = await db.fiscalArchive.findMany({ orderBy: { year: "desc" } });
    return NextResponse.json(archives);
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);

// POST /api/fiscal/archive — generate the annual fiscal archive (open JSON +
// SHA-256 + French notice), write it to disk, record the row. SUPER_ADMIN only.
export const POST = withAuth(
  async (req, { user }) => {
    const body = (await parseJson(req)) as { year?: number } | null;
    const year = typeof body?.year === "number" ? body.year : null;
    if (!year) return NextResponse.json({ error: "Année requise" }, { status: 400 });
    try {
      const result = await generateAnnualArchive(year, user.id);
      await fs.mkdir(ARCHIVES_DIR, { recursive: true });
      await fs.writeFile(path.join(ARCHIVES_DIR, result.filename), result.json, "utf8");
      return NextResponse.json(
        {
          filename: result.filename,
          checksum: result.checksum,
          sizeBytes: result.sizeBytes,
          notice: result.notice,
          year,
        },
        { status: 201 },
      );
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Erreur d'archivage" },
        { status: 409 },
      );
    }
  },
  { roles: ["SUPER_ADMIN"] },
);
