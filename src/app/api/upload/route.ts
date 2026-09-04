import { NextResponse } from "next/server";
import { writeFile, mkdir, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { withAuth } from "@/lib/api-handler";
import { uploadsDir } from "@/lib/paths";
import {
  ALLOWED_MIME,
  CONTENT_REFUSAL,
  EXT_MAP,
  MAX_UPLOAD_BYTES,
  QUOTA_REFUSAL,
  bytesMatchDeclaredType,
  exceedsQuota,
} from "@/lib/services/image-upload";

const UPLOAD_DIR = uploadsDir();

/** Bytes currently stored under the uploads tree. Walked per upload: uploads
 *  happen while someone edits the catalogue, not during service, and the tree
 *  is ~139 files. */
async function uploadsSizeBytes(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0;
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await uploadsSizeBytes(full);
    else if (entry.isFile()) total += (await stat(full)).size;
  }
  return total;
}

/**
 * POST /api/upload
 * Accepts multipart/form-data with an image file.
 * Body: FormData with field "file" (image) and optional "folder".
 *
 * M-24 (Batch 4.4): this route had no role gate, believed the client-declared
 * MIME type, and imposed no ceiling on the directory. It is now MANAGER+ —
 * uploading is a catalogue action and `media` is MANAGER+ in `nav-config.ts` —
 * the bytes must match the declared type, and the tree has a quota.
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

  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return NextResponse.json(
      { error: `Type MIME non autorisé: ${file.type}` },
      { status: 400 }
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Fichier trop volumineux (max ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo).` },
      { status: 400 }
    );
  }

  // Read once: the same buffer is signature-checked and then written.
  const buffer = Buffer.from(await file.arrayBuffer());

  if (!bytesMatchDeclaredType(buffer, file.type)) {
    return NextResponse.json({ error: CONTENT_REFUSAL }, { status: 400 });
  }

  if (exceedsQuota(await uploadsSizeBytes(UPLOAD_DIR), buffer.length)) {
    return NextResponse.json({ error: QUOTA_REFUSAL }, { status: 507 });
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

  await writeFile(filePath, buffer);

  const url = `${urlPrefix}${safeName}`;
  return NextResponse.json({ url, size: buffer.length, mime: file.type });
}, { roles: ["SUPER_ADMIN", "MANAGER"] });
