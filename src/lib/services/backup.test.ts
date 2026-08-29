import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { encryptFile, decryptFile } from "@/lib/services/backup";

// Backup service encrypt/decrypt round-trip tests.
// Tests the REAL encryptFile/decryptFile helpers (exported from backup.ts),
// not a parallel re-implementation. The production scrypt params (N=2^17)
// make each test ~200ms slower but guarantee the actual code is exercised.

process.env.BACKUP_ENCRYPTION_KEY =
  process.env.BACKUP_ENCRYPTION_KEY ??
  "test-backup-key-32-characters-or-more-0123456789";

describe("backup encrypt/decrypt (real helpers)", () => {
  const tmpDir = path.join(os.tmpdir(), `hibapos-backup-test-${Date.now()}`);
  const secret = process.env.BACKUP_ENCRYPTION_KEY!;

  beforeAll(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("round-trips a binary file unchanged", async () => {
    const plain = path.join(tmpDir, "plain.bin");
    const enc = path.join(tmpDir, "plain.dbenc");
    const dec = path.join(tmpDir, "decrypted.bin");
    const payload = crypto.randomBytes(2048);
    await fs.writeFile(plain, payload);
    await encryptFile(plain, enc, secret);
    await decryptFile(enc, dec, secret);
    const recovered = await fs.readFile(dec);
    expect(recovered.equals(payload)).toBe(true);
  });

  it("ciphertext differs from plaintext (not a passthrough)", async () => {
    const plain = path.join(tmpDir, "p2.bin");
    const enc = path.join(tmpDir, "p2.dbenc");
    const payload = Buffer.from("sensitive-db-content-1234567890");
    await fs.writeFile(plain, payload);
    await encryptFile(plain, enc, secret);
    const ciphertext = await fs.readFile(enc);
    expect(ciphertext.includes(payload)).toBe(false);
  });

  it("rejects decryption with a wrong key (GCM auth check fails)", async () => {
    const plain = path.join(tmpDir, "p3.bin");
    const enc = path.join(tmpDir, "p3.dbenc");
    const dec = path.join(tmpDir, "p3.bin.dec");
    await fs.writeFile(plain, Buffer.from("content-for-wrong-key-test"));
    await encryptFile(plain, enc, secret);
    await expect(
      decryptFile(enc, dec, "different-wrong-key-32-chars-or-more-012345"),
    ).rejects.toThrow();
  });

  it("uses per-file random salt (two encryptions of the same file differ)", async () => {
    const plain = path.join(tmpDir, "p4.bin");
    const enc1 = path.join(tmpDir, "p4.1.dbenc");
    const enc2 = path.join(tmpDir, "p4.2.dbenc");
    await fs.writeFile(plain, Buffer.from("identical-content"));
    await encryptFile(plain, enc1, secret);
    await encryptFile(plain, enc2, secret);
    const c1 = await fs.readFile(enc1);
    const c2 = await fs.readFile(enc2);
    // Salts (first 16 bytes) differ because they're random per-file.
    expect(c1.subarray(0, 16).equals(c2.subarray(0, 16))).toBe(false);
    // But both decrypt back to the same plaintext.
    const dec1 = path.join(tmpDir, "p4.1.out");
    const dec2 = path.join(tmpDir, "p4.2.out");
    await decryptFile(enc1, dec1, secret);
    await decryptFile(enc2, dec2, secret);
    const out1 = await fs.readFile(dec1);
    const out2 = await fs.readFile(dec2);
    expect(out1.equals(out2)).toBe(true);
  });

  it("rejects tampered ciphertext (GCM auth tag mismatch)", async () => {
    const plain = path.join(tmpDir, "p5.bin");
    const enc = path.join(tmpDir, "p5.dbenc");
    await fs.writeFile(plain, Buffer.from("content-to-tamper"));
    await encryptFile(plain, enc, secret);
    // Flip a byte in the ciphertext body (after the 44-byte header).
    const data = await fs.readFile(enc);
    data[data.length - 1] ^= 0x01;
    await fs.writeFile(enc, data);
    const dec = path.join(tmpDir, "p5.out");
    await expect(decryptFile(enc, dec, secret)).rejects.toThrow();
  });
});
