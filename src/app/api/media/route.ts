import { NextResponse } from "next/server";
import { withAuth, parseJson } from "@/lib/api-handler";
import { z } from "zod";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";
import sharp from "sharp";
import { uploadsDir as mediaRoot } from "@/lib/paths";
import { audit } from "@/lib/services/audit";
import {
  collectImageUsage,
  clearImageReferences,
  totalCleared,
  type UsageEntry,
} from "@/lib/services/media-usage";

/**
 * Cached image dimensions, keyed by path + size + mtime.
 *
 * `sharp().metadata()` opens and parses each file. The media library is
 * opened repeatedly and the images almost never change, so the cache key
 * includes size and mtime: edit or replace a file and it is re-probed,
 * otherwise the answer is free after the first look.
 */
const dimensionCache = new Map<string, { width: number | null; height: number | null }>();

async function imageDimensions(
  fullPath: string,
  size: number | null,
  mtimeMs: number,
): Promise<{ width: number | null; height: number | null }> {
  const key = `${fullPath}|${size ?? "?"}|${Math.floor(mtimeMs)}`;
  const cached = dimensionCache.get(key);
  if (cached) return cached;
  let dims: { width: number | null; height: number | null } = { width: null, height: null };
  try {
    const meta = await sharp(fullPath).metadata();
    dims = { width: meta.width ?? null, height: meta.height ?? null };
  } catch {
    /* not an image sharp can read */
  }
  // Bounded so a pathological uploads folder cannot grow this without limit.
  if (dimensionCache.size > 2000) dimensionCache.clear();
  dimensionCache.set(key, dims);
  return dims;
}

/** Run an async mapper over items, at most `limit` in flight. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}



export const GET = withAuth(async () => {
  // C-25 (Batch 4.6): the usage scan lives in `media-usage.ts` and covers all
  // SIX image columns. It used to cover three, so 30 of the 124 referenced
  // images — every sauce and topping — displayed as unused here.
  const usageMap = await collectImageUsage();

  // M-30 (Batch 2.4): the walk used to be readdirSync + statSync, and ran
  // sharp().metadata() on EVERY file, sequentially, unpaginated. On the real
  // uploads folder (139 files, 49 MiB) that blocks the Node event loop — so
  // opening the media library froze the till mid-service. It is now an async
  // walk, with stats and dimension probes run in bounded parallel and
  // dimensions cached, because they only change when the file does.
  const uploadsDir = mediaRoot();

  async function walkDir(dir: string, base: string): Promise<{ relativePath: string; fullPath: string }[]> {
    const results: { relativePath: string; fullPath: string }[] = [];
    let entries: import("fs").Dirent<string>[];
    try {
      entries = (await fs.readdir(dir, { withFileTypes: true })) as import("fs").Dirent<string>[];
    } catch {
      return results;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        results.push(...(await walkDir(fullPath, rel)));
      } else if (entry.isFile()) {
        results.push({ relativePath: rel, fullPath });
      }
    }
    return results;
  }

  const allFiles = await walkDir(uploadsDir, "");

  // Merge: disk files first (with DB usage info), then DB-only refs (missing files)
  const seen = new Set<string>();
  const items: { url: string; filename: string; folder: string; size: number | null; width: number | null; height: number | null; usedBy: UsageEntry[] }[] = [];

  const probed = await mapWithConcurrency(allFiles, 8, async ({ relativePath, fullPath }) => {
    const url = `/uploads/${relativePath.split("\\").join("/")}`;
    let size: number | null = null;
    let mtimeMs = 0;
    try {
      const st = await fs.stat(fullPath);
      size = st.size;
      mtimeMs = st.mtimeMs;
    } catch {
      /* file vanished between walk and stat */
    }
    const { width, height } = await imageDimensions(fullPath, size, mtimeMs);
    const parts = relativePath.split("\\").join("/").split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
    const filename = parts[parts.length - 1];
    return { url, filename, folder, size, width, height, usedBy: usageMap.get(url) ?? [] };
  });

  for (const item of probed) {
    items.push(item);
    seen.add(item.url);
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

  // 1. Resolve and validate the path FIRST — path-traversal hardened.
  //
  // The reference cleanup below used to run before this guard, so a request
  // carrying an unauthorised path did its database writes and only then
  // answered 400. Nothing was reachable through it (the cleanup matches the
  // literal request string, and no catalogue row holds a traversal path, so
  // it always matched zero rows), but a handler in the batch about validating
  // before mutating should not mutate before validating.
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

  // 2. Clear references in DB — all SIX image columns (C-25, Batch 4.6).
  // This used to clear three of them, so deleting an image used by a category
  // option choice or an add-on left a dangling `/uploads/…` reference and a
  // broken image in the POS picker.
  const cleared = await clearImageReferences(url);

  // 3. Delete the file.
  const fileExisted = existsSync(target);
  if (fileExisted) {
    await fs.unlink(target);
  }

  // 4. Journal it (C-25, Batch 4.6). Every other destructive route audits;
  // this one did not, so an image disappearing from the POS was untraceable.
  // The per-column counts are recorded because detaching an image from nine
  // toppings is a different event from deleting an unused file.
  await audit(
    "MEDIA_DELETED",
    "Media",
    url,
    { url, fileExisted, referencesCleared: totalCleared(cleared), byColumn: cleared },
    user.id,
  );

  return NextResponse.json({ success: true });
});
