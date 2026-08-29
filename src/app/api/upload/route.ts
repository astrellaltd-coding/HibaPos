import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { withAuth } from "@/lib/api-handler";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
];

const EXT_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * POST /api/upload
 * Accepts multipart/form-data with an image file.
 * Body: FormData with field "file" (image) and optional "folder".
 */
export const POST = withAuth(async (req) => {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Requête multipart invalide." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Champ 'file' requis (image)." }, { status: 400 });
  }

  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json(
      { error: `Type MIME non autorisé: ${file.type}` },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `Fichier trop volumineux (max ${MAX_SIZE_BYTES / 1024 / 1024} Mo).` },
      { status: 400 }
    );
  }

  const ext = EXT_MAP[file.type] ?? "png";

  // Sanitize original filename: keep alphanumeric, spaces, dashes, underscores, dots
  // and normalize to a safe string.
  const originalBase = file.name
    .replace(/\.[^/.]+$/, "") // strip existing extension
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-zA-Z0-9._\-\s]/g, "") // keep safe chars
    .trim()
    .replace(/\s+/g, "_"); // spaces → underscores

  let baseName = originalBase || "image";
  if (baseName.length > 60) baseName = baseName.slice(0, 60);

  // Optional folder
  const folder = formData.get("folder");
  let targetDir = UPLOAD_DIR;
  let urlPrefix = "/uploads/";
  if (typeof folder === "string" && folder.trim() !== "") {
    const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, "");
    if (safeFolder) {
      targetDir = path.join(UPLOAD_DIR, safeFolder);
      urlPrefix = `/uploads/${safeFolder}/`;
    }
  }

  if (!existsSync(targetDir)) {
    await mkdir(targetDir, { recursive: true });
  }

  // Handle name collisions by appending a counter
  let safeName = `${baseName}.${ext}`;
  let filePath = path.join(targetDir, safeName);
  let counter = 1;
  while (existsSync(filePath)) {
    safeName = `${baseName}_${counter}.${ext}`;
    filePath = path.join(targetDir, safeName);
    counter++;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const url = `${urlPrefix}${safeName}`;
  return NextResponse.json({ url, size: buffer.length, mime: file.type });
});
