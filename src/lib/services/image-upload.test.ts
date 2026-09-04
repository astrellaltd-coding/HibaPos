import { describe, it, expect } from "vitest";
import {
  ALLOWED_MIME,
  CONTENT_REFUSAL,
  MAX_UPLOAD_BYTES,
  QUOTA_REFUSAL,
  UPLOAD_QUOTA_BYTES,
  bytesMatchDeclaredType,
  exceedsQuota,
} from "@/lib/services/image-upload";

// M-24, Batch 4.4 — `POST /api/upload` trusted the client's MIME type and had
// no ceiling on the directory. The route also had no role gate at all; that
// half is asserted in `api-authorization.test.ts`.

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const GIF89 = Array.from("GIF89a").map((c) => c.charCodeAt(0));
const GIF87 = Array.from("GIF87a").map((c) => c.charCodeAt(0));
const bytes = (...b: number[]) => Uint8Array.from(b);
const webp = () => {
  const b = new Uint8Array(16);
  b.set(Array.from("RIFF").map((c) => c.charCodeAt(0)), 0);
  b.set(Array.from("WEBP").map((c) => c.charCodeAt(0)), 8);
  return b;
};

describe("M-24 — the declared type must match the bytes", () => {
  it("accepts each format's real signature", () => {
    expect(bytesMatchDeclaredType(bytes(...PNG), "image/png")).toBe(true);
    expect(bytesMatchDeclaredType(bytes(...JPEG), "image/jpeg")).toBe(true);
    expect(bytesMatchDeclaredType(bytes(...JPEG), "image/jpg")).toBe(true);
    expect(bytesMatchDeclaredType(bytes(...GIF87), "image/gif")).toBe(true);
    expect(bytesMatchDeclaredType(bytes(...GIF89), "image/gif")).toBe(true);
    expect(bytesMatchDeclaredType(webp(), "image/webp")).toBe(true);
  });

  it("refuses a non-image wearing an image MIME type", () => {
    // The finding, exactly: the route believed `file.type`, which the client
    // sets. "PK\\x03\\x04" is a ZIP; a shell script is just text.
    const zip = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00);
    const script = Uint8Array.from(
      Array.from("#!/bin/sh\nrm -rf /").map((c) => c.charCodeAt(0)),
    );
    for (const mime of ALLOWED_MIME) {
      expect(bytesMatchDeclaredType(zip, mime)).toBe(false);
      expect(bytesMatchDeclaredType(script, mime)).toBe(false);
    }
  });

  it("refuses a real image that lies about which format it is", () => {
    // A genuine JPEG declared as a PNG would otherwise be stored with a .png
    // extension. Worth refusing rather than quietly renaming.
    expect(bytesMatchDeclaredType(bytes(...JPEG), "image/png")).toBe(false);
    expect(bytesMatchDeclaredType(bytes(...PNG), "image/gif")).toBe(false);
    expect(bytesMatchDeclaredType(webp(), "image/jpeg")).toBe(false);
  });

  it("refuses a type outside the allowed list, whatever the bytes", () => {
    expect(bytesMatchDeclaredType(bytes(...PNG), "image/svg+xml")).toBe(false);
    expect(bytesMatchDeclaredType(bytes(...PNG), "text/html")).toBe(false);
  });

  it("refuses a file too short to carry a signature", () => {
    expect(bytesMatchDeclaredType(bytes(0x89, 0x50), "image/png")).toBe(false);
    expect(bytesMatchDeclaredType(new Uint8Array(0), "image/png")).toBe(false);
    // A RIFF container that is not WEBP — truncated before the format tag.
    const shortRiff = Uint8Array.from(
      Array.from("RIFF1234").map((c) => c.charCodeAt(0)),
    );
    expect(bytesMatchDeclaredType(shortRiff, "image/webp")).toBe(false);
  });
});

describe("M-24 — the uploads directory has a ceiling", () => {
  it("admits an upload that fits", () => {
    expect(exceedsQuota(0, 1024)).toBe(false);
    expect(exceedsQuota(UPLOAD_QUOTA_BYTES - 1024, 1024)).toBe(false);
  });

  it("refuses the upload that would cross the line", () => {
    expect(exceedsQuota(UPLOAD_QUOTA_BYTES, 1)).toBe(true);
    expect(exceedsQuota(UPLOAD_QUOTA_BYTES - 1024, 1025)).toBe(true);
  });

  it("leaves the live catalogue comfortable room", () => {
    // The real uploads tree measured ~49 MB across 139 files when this was
    // written. The quota must not be something a normal catalogue trips over.
    const liveCatalogueBytes = 49 * 1024 * 1024;
    expect(exceedsQuota(liveCatalogueBytes, MAX_UPLOAD_BYTES)).toBe(false);
    expect(UPLOAD_QUOTA_BYTES).toBeGreaterThan(liveCatalogueBytes * 4);
  });

  it("states both refusals in French", () => {
    expect(QUOTA_REFUSAL).toContain("saturé");
    expect(CONTENT_REFUSAL).toContain("ne correspond pas");
  });
});
