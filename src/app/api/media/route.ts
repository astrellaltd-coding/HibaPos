import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { z } from "zod";
import { readdirSync, promises as fs } from "fs";
import { existsSync, statSync } from "fs";
import path from "path";
import sharp from "sharp";
import { uploadsDir as mediaRoot } from "@/lib/paths";

type UsageEntry = { type: string; label: string };

async function collectDbImages(): Promise<Map<string, UsageEntry[]>> {
  const [categories, products, choices] = await Promise.all([
    db.category.findMany({ select: { icon: true } }),
    db.product.findMany({ select: { id: true, name: true, image: true } }),
    db.optionChoice.findMany({ select: { id: true, name: true, image: true } }),
  ]);

  const usageMap = new Map<string, UsageEntry[]>();

  for (const c of categories) {
    if (c.icon && c.icon.startsWith("/uploads/")) {
      const arr = usageMap.get(c.icon) ?? [];
      arr.push({ type: "categorie", label: "Categorie" });
      usageMap.set(c.icon, arr);
    }
  }
  for (const p of products) {
    if (p.image && p.image.startsWith("/uploads/")) {
      const arr = usageMap.get(p.image) ?? [];
      arr.push({ type: "produit", label: p.name });
      usageMap.set(p.image, arr);
    }
  }
  for (const ch of choices) {
    if (ch.image && ch.image.startsWith("/uploads/")) {
      const arr = usageMap.get(ch.image) ?? [];
      arr.push({ type: "option", label: ch.name });
      usageMap.set(ch.image, arr);
    }
  }

  return usageMap;
}

export const GET = withAuth(async () => {
  const usageMap = await collectDbImages();

  // Recursively collect all image files under /public/uploads/ (including subfolders)
  const uploadsDir = mediaRoot();

  function walkDir(dir: string, base: string): { relativePath: string; fullPath: string }[] {
    const results: { relativePath: string; fullPath: string }[] = [];
    if (!existsSync(dir)) return results;
    for (const entry of readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const rel = base ? `${base}/${entry}` : entry;
      try {
        if (statSync(fullPath).isDirectory()) {
          results.push(...walkDir(fullPath, rel));
        } else {
          results.push({ relativePath: rel, fullPath });
        }
      } catch { /**/ }
    }
    return results;
  }

  const allFiles = walkDir(uploadsDir, "");

  // Merge: disk files first (with DB usage info), then DB-only refs (missing files)
  const seen = new Set<string>();
  const items: { url: string; filename: string; folder: string; size: number | null; width: number | null; height: number | null; usedBy: UsageEntry[] }[] = [];

  for (const { relativePath, fullPath } of allFiles) {
    const url = `/uploads/${relativePath.replace(/\\/g, "/")}`;
    let size: number | null = null;
    let width: number | null = null;
    let height: number | null = null;
    try { size = statSync(fullPath).size; } catch { /**/ }
    try {
      const meta = await sharp(fullPath).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch { /**/ }
    // Determine display folder (empty string = root)
    const parts = relativePath.replace(/\\/g, "/").split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
    const filename = parts[parts.length - 1];
    items.push({ url, filename, folder, size, width, height, usedBy: usageMap.get(url) ?? [] });
    seen.add(url);
  }

  // Add DB-referenced images whose file no longer exists on disk
  for (const [url, usedBy] of usageMap.entries()) {
    if (!seen.has(url)) {
      const rel = url.replace("/uploads/", "");
      const parts = rel.split("/");
      const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
      const filename = parts[parts.length - 1];
      items.push({ url, filename, folder, size: null, width: null, height: null, usedBy });
    }
  }

  // Sort: used first, then by folder + filename
  items.sort((a, b) => {
    const aUsed = a.usedBy.length > 0 ? 0 : 1;
    const bUsed = b.usedBy.length > 0 ? 0 : 1;
    if (aUsed !== bUsed) return aUsed - bUsed;
    const folderCmp = a.folder.localeCompare(b.folder);
    if (folderCmp !== 0) return folderCmp;
    return a.filename.localeCompare(b.filename);
  });

  return NextResponse.json(items);
});

export const DELETE = withAuth(async (req, { user }) => {
  if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ error: "Reserve au manager" }, { status: 403 });
  }

  const body = (await parseJson(req)) as { url?: string } | null;
  const schema = z.object({ url: z.string().min(1, "url requis") });
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "url requis" },
      { status: 400 },
    );
  }
  const { url } = parsed.data;

  if (!url.startsWith("/uploads/")) {
    return NextResponse.json({ error: "URL non autorisee" }, { status: 400 });
  }

  // 1. Clean up references in DB
  await Promise.all([
    db.category.updateMany({ where: { icon: url }, data: { icon: null } }),
    db.product.updateMany({ where: { image: url }, data: { image: null } }),
    db.optionChoice.updateMany({ where: { image: url }, data: { image: null } }),
  ]);

  // 2. Delete file if it exists — path-traversal hardened.
  const uploadsRoot = path.resolve(mediaRoot());
  const filename = url.replace("/uploads/", "");
  const target = path.resolve(uploadsRoot, filename);

  // ensure the resolved target lives strictly inside uploadsRoot.
  // NOTE: only a LEADING ".." segment or an absolute path escapes the root —
  // a legitimate filename like "file..2.png" contains ".." but stays inside.
  const rel = path.relative(uploadsRoot, target);
  if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") {
    return NextResponse.json({ error: "Chemin non autorise" }, { status: 400 });
  }

  if (existsSync(target)) {
    await fs.unlink(target);
  }

  return NextResponse.json({ success: true });
});
