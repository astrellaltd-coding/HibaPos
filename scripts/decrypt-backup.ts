#!/usr/bin/env bun
/**
 * Standalone backup decryption tool (C-05, Batch 2.1).
 *
 * WHY THIS EXISTS
 * ---------------
 * A restore writes a `pre-restore-*.dbenc` safety snapshot before replacing
 * the live database. Until now there was no way to open that file except
 * through the application — and the situation where you need it most is
 * exactly the one where the application will not start, because the database
 * it wants to open is the one that got broken.
 *
 * This tool does ONE thing: decrypt an encrypted backup to a plain SQLite
 * file. It never writes to the live database, never touches Prisma, and
 * never deletes anything.
 *
 * USAGE
 *   bun scripts/decrypt-backup.ts <encrypted-file> <output-file>
 *   bun scripts/decrypt-backup.ts --list
 *
 * The key comes from BACKUP_ENCRYPTION_KEY in the environment (or .env). If
 * that key is lost, no tool can recover these files — that is the point of
 * P-02 in the remediation plan.
 *
 * The on-disk format is written by encryptFile() in
 * src/lib/services/backup.ts and MUST stay in step with it:
 *   [ 16-byte salt ][ 12-byte GCM IV ][ 16-byte GCM tag ][ ciphertext ]
 *   key = scrypt(secret, salt, N=2^17, r=8, p=1, 32 bytes)
 */
import { promises as fs, existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import crypto from "crypto";
// L-196 — the SAME rule the application uses to find its backups. `paths.ts`
// imports only `fs` and `path`, so it costs a CLI nothing.
import { backupsDir } from "../src/lib/paths";

const SCRYPT_N = 1 << 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const GCM_IV_LEN = 12;
const SALT_LEN = 16;
const TAG_LEN = 16;

function fail(message: string): never {
  console.error(`\n  ERREUR : ${message}\n`);
  process.exit(1);
}

/**
 * One named value out of `.env`, or null.
 *
 * Factored out for **L-196**: the secret was read from `.env` by hand because
 * this tool has to work « on a machine where the app has never been started »,
 * and `BACKUP_LOCATION` needs exactly the same courtesy for exactly the same
 * reason. Reading one variable that way and not the other is how the tool ended
 * up holding the right key and looking in the wrong folder.
 */
function readEnvFile(name: string): string | null {
  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) return null;
  const raw = readFileSync(envPath, "utf8");
  const match = raw.match(new RegExp(`^\\s*${name}\\s*=\\s*"?([^"\\r\\n]+)"?`, "m"));
  return match ? match[1].trim() : null;
}

/**
 * WHERE THE BACKUPS ARE — L-196, and the reason this function exists.
 *
 * THE DEFECT: `listBackups()` read `path.join(process.cwd(), "db", "backups")`,
 * a hardcoded literal, and **ignored `BACKUP_LOCATION` entirely** — while the
 * application honours it (`backupsDir()` in `src/lib/paths.ts`, where it
 * overrides the default outright: C-06, a backup on the same disk as the
 * database is not a backup).
 *
 * So on 2026-09-15, with six backups sitting in the configured folder, `--list`
 * showed two files from five days earlier and nothing newer. **This is the
 * recovery tool** — `scripts/README.md` calls it « the only way to open a
 * backup when the app will not start » — and the honest reading of its output
 * in that moment is « I have no recent backup ».
 *
 * **It is also the defect that got a script DELETED from this folder.** Rule 3
 * of `scripts/README.md` exists because `port-real-data.ts` opened
 * `db/custom.db` by a hardcoded literal and ignored `DATABASE_URL`; that rule
 * ends « nothing in this folder does that any more, and nothing new may », and
 * it was not true when it was written down.
 *
 * The environment is consulted first, then `.env` — because the situation this
 * tool is for is one where the application has never run and nothing has loaded
 * that file for it.
 */
function resolveBackupsDir(): string {
  if (!process.env.BACKUP_LOCATION?.trim()) {
    const fromFile = readEnvFile("BACKUP_LOCATION");
    if (fromFile) process.env.BACKUP_LOCATION = fromFile;
  }
  return backupsDir();
}

/** The pre-`BACKUP_LOCATION` default, named so `--list` can warn when files are
 *  still sitting in it. Not where anything is written any more. */
function legacyBackupsDir(): string {
  return path.join(process.cwd(), "db", "backups");
}

function loadSecret(): string {
  // L-141 (R9.3) — the fallback is KEPT HERE deliberately, and it is the reason
  // the application keeps it too. This is the recovery tool: the file in front
  // of it may have been encrypted under either name, and a tool that refuses
  // the only key an operator has is not a recovery tool. The application's
  // `backupSecret()` adds the guard this cannot — refusing when both names are
  // set and differ — because it is choosing which key to WRITE with, and this
  // is only ever reading.
  let secret = process.env.BACKUP_ENCRYPTION_KEY || process.env.BACKUP_SECRET;
  if (!secret) {
    // Fall back to .env so the tool works on a machine where the app has
    // never been started.
    //
    // L-141: the .env fallback read only the long name while the env-var path
    // accepted both, so a machine holding the key under the old name in .env —
    // and the app never started, which is when this tool is used — was told the
    // key was absent.
    secret = readEnvFile("BACKUP_ENCRYPTION_KEY") ?? readEnvFile("BACKUP_SECRET") ?? undefined;
  }
  if (!secret) {
    fail(
      "BACKUP_ENCRYPTION_KEY introuvable (ni dans l'environnement, ni dans .env).\n" +
        "  Sans cette clé, aucune sauvegarde chiffrée ne peut être ouverte.",
    );
  }
  if (secret.length < 32) {
    fail("BACKUP_ENCRYPTION_KEY doit contenir au moins 32 caractères.");
  }
  return secret;
}

function deriveKey(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      secret,
      salt,
      KEY_LEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 512 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key as Buffer)),
    );
  });
}

function encryptedFilesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".dbenc") || f.endsWith(".enc"))
    .sort();
}

function listBackups(): void {
  const dir = resolveBackupsDir();
  const files = encryptedFilesIn(dir);

  if (files.length === 0) {
    console.log(`\n  Aucune sauvegarde chiffrée dans ${dir}\n`);
  } else {
    console.log(`\n  Sauvegardes dans ${dir} :\n`);
    for (const f of files) {
      const stat = statSync(path.join(dir, f));
      const mb = (stat.size / 1024 / 1024).toFixed(2);
      const kind = f.startsWith("pre-restore-")
        ? "instantané de sécurité"
        : f.endsWith(".uploads.enc")
          ? "images"
          : "base de données";
      console.log(`    ${f}\n      ${mb} Mo · ${kind} · ${stat.mtime.toISOString()}`);
    }
    console.log("");
  }

  // L-196 — SAY SO WHEN THE OLD FOLDER STILL HOLDS SOMETHING.
  //
  // Files written before `BACKUP_LOCATION` was set are still in the install
  // directory, and this tool used to show ONLY those. Someone who ran it then
  // and runs it now would otherwise see a completely different list with no
  // explanation, which is its own kind of alarming during a recovery. Naming
  // both places costs four lines and removes the ambiguity entirely.
  const legacy = legacyBackupsDir();
  if (path.resolve(legacy) !== path.resolve(dir)) {
    const stale = encryptedFilesIn(legacy);
    if (stale.length > 0) {
      console.log(`  ⚠ ${stale.length} fichier(s) également présent(s) dans l'ancien dossier :`);
      console.log(`    ${legacy}`);
      console.log(`    (emplacement d'avant BACKUP_LOCATION — plus rien n'y est écrit)\n`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(`
  Déchiffrement d'une sauvegarde HibaPOS

    bun scripts/decrypt-backup.ts --list
    bun scripts/decrypt-backup.ts <fichier.dbenc> <sortie.db>

  Le fichier de sortie ne doit PAS être db/custom.db : déchiffrez ailleurs,
  vérifiez le contenu, puis remplacez la base à l'arrêt de l'application.
`);
    return;
  }

  if (args[0] === "--list") {
    listBackups();
    return;
  }

  const [input, output] = args;
  if (!output) fail("Fichier de sortie manquant. Voir --help.");
  if (!existsSync(input)) fail(`Fichier introuvable : ${input}`);

  // Refuse to write over a live database. Recovering a backup by overwriting
  // the file you are trying to recover is how people lose both.
  const resolvedOut = path.resolve(output);
  if (path.basename(resolvedOut) === "custom.db") {
    fail(
      "Refus d'écrire sur « custom.db ».\n" +
        "  Déchiffrez vers un autre fichier, vérifiez-le, puis remplacez la base\n" +
        "  manuellement avec l'application arrêtée.",
    );
  }
  if (existsSync(resolvedOut)) fail(`Le fichier de sortie existe déjà : ${resolvedOut}`);

  const secret = loadSecret();
  const data = await fs.readFile(input);
  if (data.length < SALT_LEN + GCM_IV_LEN + TAG_LEN) {
    fail("Fichier trop court pour être une sauvegarde chiffrée valide.");
  }

  const salt = data.subarray(0, SALT_LEN);
  const iv = data.subarray(SALT_LEN, SALT_LEN + GCM_IV_LEN);
  const tag = data.subarray(SALT_LEN + GCM_IV_LEN, SALT_LEN + GCM_IV_LEN + TAG_LEN);
  const ciphertext = data.subarray(SALT_LEN + GCM_IV_LEN + TAG_LEN);

  console.log(`  Dérivation de la clé (scrypt N=2^17, quelques secondes)…`);
  const key = await deriveKey(secret, salt);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    fail(
      "Déchiffrement impossible : clé incorrecte ou fichier altéré.\n" +
        "  (AES-GCM authentifie le contenu — un seul octet modifié suffit à le rejeter.)",
    );
  }

  await fs.writeFile(resolvedOut, plaintext);
  const sha = crypto.createHash("sha256").update(plaintext).digest("hex");
  const isSqlite = plaintext.subarray(0, 15).toString("ascii") === "SQLite format 3";

  console.log(`
  ✓ Déchiffré : ${resolvedOut}
    ${(plaintext.length / 1024 / 1024).toFixed(2)} Mo
    SHA-256 : ${sha}
    ${isSqlite ? "Format SQLite valide." : "ATTENTION : en-tête SQLite absent (archive d'images ?)."}
`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
