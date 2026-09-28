import { NextResponse, type NextRequest } from "next/server";
import { createReadStream, statSync } from "fs";
import path from "path";
import { Readable } from "stream";
import { uploadsDir } from "@/lib/paths";

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
  // ── THIS ROUTE SERVES IN BOTH LAYOUTS SINCE L-246 (2026-09-28) ───────────
  //
  // It used to begin « if (!usingExternalDataDir()) return 404 », on the
  // reasoning that Next's static handler owns this URL in the legacy layout
  // and « if a request reaches here anyway the file is not ours to serve ».
  //
  // THAT IS TRUE OF FILES THAT EXISTED AT BUILD TIME AND FALSE OF EVERY FILE
  // UPLOADED SINCE. **Next only serves what was in `public/` when `next build`
  // ran.** On the France till, where `HIBAPOS_DATA_DIR` is unset, the
  // médiathèque writes to `public/uploads/` and the image was then served by
  // nobody: this route stood aside, and Next had never heard of the file.
  //
  // MEASURED 2026-09-28, on the till: eight category images displayed and two
  // did not, and the eight were EXACTLY the eight tracked in git — present
  // when the build ran. The two were uploaded afterwards. The operator read it
  // as a webp fault; 113 webp files in this repository display correctly, and
  // the broken pair were simply the newest.
  //
  // So the guard is gone and the route is the fallback. Static serving still
  // wins for build-time files, the traversal guard below is untouched, and an
  // image uploaded through the médiathèque is visible without a rebuild —
  // which is what the médiathèque is for.
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
