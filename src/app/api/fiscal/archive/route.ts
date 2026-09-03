import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { buildAnnualArchive, recordAnnualArchive } from "@/lib/services/fiscal";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fiscalArchivesDir } from "@/lib/paths";

const ARCHIVES_DIR = fiscalArchivesDir();

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

    const existing = await db.fiscalArchive.findUnique({ where: { year } });

    // Build first — reads only, writes nothing (M-02).
    const built = await buildAnnualArchive(year);
    const archivePath = path.join(ARCHIVES_DIR, built.filename);

    // An archive already recorded for this year.
    if (existing) {
      // Is its file actually there? If so, this is a plain duplicate request.
      try {
        await fs.access(archivePath);
        return NextResponse.json(
          { error: `Archive déjà générée pour ${year}` },
          { status: 409 },
        );
      } catch {
        // The row exists but the file does not — the dead end M-02 describes.
        // Repair it, but ONLY if the archive reproduces byte for byte. If the
        // underlying data has moved since, writing a different file under the
        // recorded checksum would be a lie, so refuse and say why.
        if (built.checksum !== existing.checksum) {
          return NextResponse.json(
            {
              error:
                `Le fichier de l'archive ${year} est absent et ne peut pas être reproduit à ` +
                `l'identique : les données de l'exercice ont changé depuis sa génération ` +
                `(condensat attendu ${existing.checksum.slice(0, 12)}…, recalculé ` +
                `${built.checksum.slice(0, 12)}…). L'entrée du journal fiscal reste la ` +
                `référence. Restaurez le fichier depuis une sauvegarde.`,
            },
            { status: 409 },
          );
        }
        await fs.mkdir(ARCHIVES_DIR, { recursive: true });
        await fs.writeFile(archivePath, built.json, "utf8");
        await fs.writeFile(
          path.join(ARCHIVES_DIR, built.checksumFilename),
          built.checksumFileContent,
          "utf8",
        );
        return NextResponse.json(
          {
            filename: built.filename,
            checksum: built.checksum,
            sizeBytes: built.sizeBytes,
            notice: built.notice,
            year,
            repaired: true,
          },
          { status: 200 },
        );
      }
    }

    try {
      // File to disk BEFORE the row: a failed write must leave nothing behind
      // to block a retry (M-02). The reverse order created a row that refused
      // regeneration while the download route asked for exactly that.
      await fs.mkdir(ARCHIVES_DIR, { recursive: true });
      await fs.writeFile(archivePath, built.json, "utf8");
      await fs.writeFile(
        path.join(ARCHIVES_DIR, built.checksumFilename),
        built.checksumFileContent,
        "utf8",
      );

      await recordAnnualArchive(year, user.id, {
        filename: built.filename,
        checksum: built.checksum,
        sizeBytes: built.sizeBytes,
      });

      return NextResponse.json(
        {
          filename: built.filename,
          checksum: built.checksum,
          checksumFilename: built.checksumFilename,
          sizeBytes: built.sizeBytes,
          notice: built.notice,
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
