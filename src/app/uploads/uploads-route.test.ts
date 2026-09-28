/**
 * L-246 — an image uploaded through the médiathèque must be SERVED.
 *
 * THE FINDING, from the France till on 2026-09-28. The operator uploaded a
 * category icon and two product photographs; the médiathèque listed them, with
 * their real size and dimensions, and the browser showed broken images. Eight
 * other images in the same folder displayed — and those eight were EXACTLY the
 * eight tracked in git, i.e. the ones present when `next build` last ran.
 *
 * `HIBAPOS_DATA_DIR` is unset on that till, so `uploadsDir()` is
 * `public/uploads`, and **Next only serves what was in `public/` at build
 * time**. This route existed to serve uploads and stood aside in that layout —
 * so a file uploaded after the build was served by nobody.
 *
 * It was read as a webp fault. It was not: 113 webp files in this repository
 * display correctly. The broken ones were simply the newest.
 *
 * THIS FILE IS THE FIRST TEST THIS ROUTE HAS EVER HAD. The defect lived in its
 * first four lines for as long as the route has existed.
 */
import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import path from "path";
import { GET } from "@/app/uploads/[...path]/route";

/** A one-pixel PNG, so the bytes served are a real image. */
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex",
);

/** `public/uploads`, which is what `uploadsDir()` answers with no data dir. */
const publicUploads = () => path.join(process.cwd(), "public", "uploads");

const ORIGINAL_DATA_DIR = process.env.HIBAPOS_DATA_DIR;
const written: string[] = [];

/** Serve one path through the real route, as the browser would ask for it. */
function get(segments: string[]) {
  return GET(new NextRequest(`http://localhost/uploads/${segments.join("/")}`), {
    params: Promise.resolve({ path: segments }),
  });
}

/** Put a file where the app would have written it, and remember to remove it. */
function place(dir: string, name: string, bytes: Buffer = PNG) {
  mkdirSync(dir, { recursive: true });
  const full = path.join(dir, name);
  writeFileSync(full, bytes);
  written.push(full);
  return full;
}

afterEach(() => {
  // The env var first: a later test reading a stale layout would be worse than
  // a stray file.
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.HIBAPOS_DATA_DIR;
  else process.env.HIBAPOS_DATA_DIR = ORIGINAL_DATA_DIR;
  while (written.length) {
    const f = written.pop()!;
    try {
      if (existsSync(f)) rmSync(f);
    } catch {
      /* a stray test file is not worth failing a suite over */
    }
  }
});

describe("L-246 — the legacy layout, where the defect was", () => {
  it("SERVES A FILE THAT DID NOT EXIST AT BUILD TIME — the whole finding", async () => {
    // The médiathèque writes at runtime. Before the fix this answered 404 and
    // left the file to Next's static handler, which only knows what was on
    // disk when the build ran, so the image was served by nobody.
    delete process.env.HIBAPOS_DATA_DIR;
    const name = `__l246-runtime-${process.pid}.png`;
    place(publicUploads(), name);

    const res = await get([name]);
    expect(res.status, "a runtime upload is still not served").toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it("serves it from a SUBFOLDER too, which is where the médiathèque puts things", async () => {
    // The till's file was `/uploads/categories/paninic.webp`.
    delete process.env.HIBAPOS_DATA_DIR;
    const name = `__l246-sub-${process.pid}.webp`;
    place(path.join(publicUploads(), "categories"), name);

    const res = await get(["categories", name]);
    expect(res.status).toBe(200);
    // And the type the till's file needed. webp was never the fault, but a
    // route that served it as something else would have looked identical.
    expect(res.headers.get("Content-Type")).toBe("image/webp");
  });
});

describe("the external layout still works", () => {
  it("serves from HIBAPOS_DATA_DIR when one is set", async () => {
    // DD-02's case, and the one the route was written for. `test-setup.ts`
    // already points HIBAPOS_DATA_DIR at a throwaway tree.
    const dataDir = process.env.HIBAPOS_DATA_DIR;
    expect(dataDir, "the harness stopped setting HIBAPOS_DATA_DIR").toBeTruthy();
    const name = `__l246-external-${process.pid}.png`;
    place(path.join(dataDir!, "uploads"), name);

    const res = await get([name]);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });
});

describe("what it must still refuse", () => {
  it("REFUSES TO CLIMB OUT of the uploads directory", async () => {
    // The guard that makes a public, unauthenticated route acceptable at all:
    // `/uploads/../../db/custom.db` would otherwise hand out the database.
    for (const attempt of [
      ["..", "..", "db", "custom.db"],
      ["..", "..", ".env"],
      ["categories", "..", "..", "..", "package.json"],
    ]) {
      const res = await get(attempt);
      expect(res.status, `escaped with ${attempt.join("/")}`).toBe(404);
    }
  });

  it("refuses a file that is not media, however real it is", async () => {
    // Not a general file server. Proved against a file that EXISTS, so this
    // cannot pass merely because nothing is there.
    delete process.env.HIBAPOS_DATA_DIR;
    const name = `__l246-notmedia-${process.pid}.txt`;
    const full = place(publicUploads(), name, Buffer.from("plain text"));
    expect(existsSync(full)).toBe(true);

    const res = await get([name]);
    expect(res.status).toBe(404);
  });

  it("404s on a file that is not there, rather than throwing", async () => {
    const res = await get([`__l246-absent-${process.pid}.png`]);
    expect(res.status).toBe(404);
  });
});
