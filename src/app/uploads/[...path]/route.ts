import { NextResponse, type NextRequest } from "next/server";
import { createReadStream, statSync } from "fs";
import path from "path";
import { Readable } from "stream";
import { uploadsDir, usingExternalDataDir } from "@/lib/paths";

/**
 * GET /uploads/<...> — serve uploaded media from the data directory.
 *
 * Product image URLs are stored in the database as `/uploads/Produits/x.webp`.
 * While uploads live under `public/`, Next serves them statically and this
 * route never runs. Once HIBAPOS_DATA_DIR moves them out of the install
 * directory (DD-02), nothing else would serve them — and every image in the
 * catalogue would break — so this route takes over at exactly the same URL,
 * which means no stored path has to be rewritten.
 *
 * Deliberately public: these are the images shown on the POS screen before
 * anyone has logged in, and they were public as static files too. Nothing
 * else is reachable through it — see the traversal guard below.
 */

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  // In the legacy layout Next's static handler owns this URL; if a request
  // reaches here anyway the file is not ours to serve.
  if (!usingExternalDataDir()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { path: segments } = await ctx.params;
  const root = path.resolve(uploadsDir());
  const target = path.resolve(root, ...segments);

  // Path traversal guard: the resolved file must still be inside the uploads
  // root. Without this, `/uploads/../../db/custom.db` would hand out the
  // entire database over an unauthenticated URL.
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = path.extname(target).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    // Only media. This directory is not a general file server.
    return new NextResponse("Not found", { status: 404 });
  }

  let size: number;
  try {
    const stat = statSync(target);
    if (!stat.isFile()) return new NextResponse("Not found", { status: 404 });
    size = stat.size;
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(target)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      // Uploads are content-addressed by filename in practice; a long cache
      // keeps the POS grid fast on a modest till.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
