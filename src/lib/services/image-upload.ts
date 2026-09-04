// Upload validation and the disk quota — M-24, Batch 4.4.
//
// `POST /api/upload` trusted three things it had no business trusting: that
// the caller was entitled to write to disk (no role gate), that the
// `Content-Type` the client declared described the bytes it sent, and that
// the uploads directory would not grow without limit. The realistic impact is
// not a web shell — nothing under `public/uploads` is executed — it is disk
// exhaustion on the till, and a file that claims to be a PNG while being
// something else entirely sitting in a directory the app serves.
//
// Split out of the route so the checks can be tested without a multipart
// request, in the same spirit as `account-policy.ts` in Batch 4.3.

/** Total bytes permitted under the uploads directory. The live catalogue is
 *  about 49 MB across 139 files, so 250 MB leaves the restaurant room to
 *  replace every image several times over before anything is refused. */
export const UPLOAD_QUOTA_BYTES = 250 * 1024 * 1024;

/** Per-file limit. Unchanged from the route's original value. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
] as const;

export const EXT_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Does the byte content actually look like the type it claims?
 *
 * The declared MIME type comes from the client and is trivially forged. These
 * are the file signatures the five accepted formats really start with:
 *
 *   PNG   89 50 4E 47 0D 0A 1A 0A
 *   JPEG  FF D8 FF
 *   GIF   "GIF87a" / "GIF89a"
 *   WEBP  "RIFF" ???? "WEBP"   (RIFF container, format tag at offset 8)
 *
 * Deliberately a *consistency* check, not a format whitelist by sniffing: the
 * declared type still has to be one of the five, and the bytes then have to
 * match it. Declaring `image/png` and sending a ZIP is refused; so is
 * declaring `image/png` and sending a real JPEG, which is a mistake worth
 * surfacing rather than silently storing under the wrong extension.
 */
export function bytesMatchDeclaredType(buf: Uint8Array, mime: string): boolean {
  const startsWith = (...sig: number[]) =>
    buf.length >= sig.length && sig.every((b, i) => buf[i] === b);
  const ascii = (offset: number, text: string) =>
    buf.length >= offset + text.length &&
    Array.from(text).every((c, i) => buf[offset + i] === c.charCodeAt(0));

  switch (mime) {
    case "image/png":
      return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/jpeg":
    case "image/jpg":
      return startsWith(0xff, 0xd8, 0xff);
    case "image/gif":
      return ascii(0, "GIF87a") || ascii(0, "GIF89a");
    case "image/webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP");
    default:
      return false;
  }
}

export const QUOTA_REFUSAL =
  "Espace de stockage des images saturé. Supprimez des images avant d'en ajouter.";
export const CONTENT_REFUSAL =
  "Le contenu du fichier ne correspond pas à son type déclaré.";

/** Would this upload push the directory past the quota? */
export function exceedsQuota(currentBytes: number, incomingBytes: number): boolean {
  return currentBytes + incomingBytes > UPLOAD_QUOTA_BYTES;
}
