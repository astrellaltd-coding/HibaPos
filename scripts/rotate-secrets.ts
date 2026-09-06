#!/usr/bin/env bun
/**
 * SEC-ROT / Batch 7.3 — rotate `SESSION_SECRET` and `BACKUP_ENCRYPTION_KEY`.
 *
 * WHY A SCRIPT AND NOT A HAND EDIT. The hand-over says "edit `.env` and replace
 * the two lines, keep the quotes, change nothing else — in particular leave
 * `DATABASE_URL` alone". That is three ways to break a till that will not then
 * start, at the one moment nobody wants a puzzle. This does the surgical
 * replacement and touches nothing else.
 *
 * ── WHO GENERATES THE SECRETS ────────────────────────────────────────────────
 * **This script does, on the operator's machine, and it never prints them.**
 * Batch 7.3's rule is that Claude does not generate the new secrets and does not
 * see them, because a secret pasted into a transcript is a secret in a log. The
 * rule is honoured: the values exist only in `.env` and in the backup copy this
 * script makes before writing. Nothing is echoed, returned or logged. The
 * precedent is `seed-users.ts`, which takes a PIN at a prompt and never echoes
 * it either.
 *
 * ── WHAT IT COSTS, AND IT IS NOT NOTHING ─────────────────────────────────────
 * Every session is invalidated — whoever is signed in is signed out, including
 * you if you are doing this remotely. Any step-up or approval token in flight
 * stops verifying. **No PIN changes and nobody is locked out.**
 *
 * And **the encrypted backups already on disk become permanently unreadable**,
 * because they were written under the old `BACKUP_ENCRYPTION_KEY`. DD-04
 * accepted that: Batch 8.2 established the three on this install are not
 * restorable anyway — they predate seven fiscal tables and
 * `assertCompatibleSchema` refuses them. But they ARE readable today as
 * evidence, so **keep the backup copy this script makes**. It is the only way
 * they will ever open again.
 *
 * ── WHAT IT WILL NOT TOUCH ───────────────────────────────────────────────────
 * `FISCAL_CHAIN_KEY`. It is armed once, at Batch 8.0, after the fiscal reset,
 * and rotating it after arming makes the whole journal permanently unverifiable.
 * If it is already present this script refuses outright.
 *
 * USAGE
 *   bun scripts/rotate-secrets.ts                    # dry run
 *   bun scripts/rotate-secrets.ts --apply
 *   bun scripts/rotate-secrets.ts --apply --env <path>   # rehearsal on a copy
 */
import { randomBytes } from "node:crypto";
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes("--apply");
const envArg = ARGS.indexOf("--env");
const ENV_PATH = envArg >= 0 ? ARGS[envArg + 1] : path.join(process.cwd(), ".env");
const backupArg = ARGS.indexOf("--backup-dir");
const BACKUP_DIR = backupArg >= 0 ? ARGS[backupArg + 1] : "C:\\HibaPOS-secrets-backup";

const RED = "\x1b[31m";
const YEL = "\x1b[33m";
const GRN = "\x1b[32m";
const OFF = "\x1b[0m";

function fail(m: string): never {
  console.error(`\n${RED}  REFUS : ${m}${OFF}\n`);
  process.exit(1);
}

/** The two lines this script is allowed to change. Nothing else, ever. */
const ROTATES = ["SESSION_SECRET", "BACKUP_ENCRYPTION_KEY"] as const;

/** Present and non-empty? Reports SHAPE only — never the value. */
function readShape(env: string, key: string): { present: boolean; length: number; quoted: boolean } {
  const m = env.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "m"));
  if (!m) return { present: false, length: 0, quoted: false };
  const raw = m[1].trim();
  const quoted = raw.startsWith('"') && raw.endsWith('"');
  return { present: true, length: (quoted ? raw.slice(1, -1) : raw).length, quoted };
}

/** Replace one `KEY=…` line, preserving the quoting style already in the file. */
function replaceLine(env: string, key: string, value: string): string {
  const re = new RegExp(`^(\\s*${key}\\s*=\\s*)(.*)$`, "m");
  const m = env.match(re);
  if (!m) throw new Error(`${key} not found`);
  const quoted = m[2].trim().startsWith('"');
  return env.replace(re, `$1${quoted ? `"${value}"` : value}`);
}

async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  SEC-ROT — rotation des secrets`);
  console.log(`  ${APPLY ? `${RED}MODE APPLY${OFF}` : `${GRN}SIMULATION${OFF}`}`);
  console.log(`${"=".repeat(70)}\n`);
  console.log(`  .env : ${ENV_PATH}`);

  if (!existsSync(ENV_PATH)) fail(`Fichier introuvable : ${ENV_PATH}`);
  const env = await fs.readFile(ENV_PATH, "utf8");

  // --- refuse if the chain key is in play ---------------------------------
  if (/^\s*FISCAL_CHAIN_KEY\s*=\s*\S/m.test(env)) {
    fail(
      "FISCAL_CHAIN_KEY est presente dans ce fichier.\n" +
        "  Ce script ne la touche pas et refuse de continuer : elle est armee UNE\n" +
        "  fois, au lot 8.0, apres la remise a zero fiscale. La faire tourner rend\n" +
        "  le journal definitivement non verifiable.\n" +
        "  Si elle est deja armee, la rotation des deux autres secrets se fait a la\n" +
        "  main, en la laissant strictement intacte.",
    );
  }

  // --- both targets must already exist ------------------------------------
  console.log(`\n  Etat actuel (longueurs seulement, jamais les valeurs) :`);
  for (const k of ROTATES) {
    const s = readShape(env, k);
    if (!s.present) fail(`${k} est absente de ${ENV_PATH}. Ce script remplace, il n'invente pas.`);
    if (s.length === 0) fail(`${k} est vide. Renseignez-la d'abord, ou utilisez .env.example.`);
    console.log(`    ${k.padEnd(24)} ${String(s.length).padStart(3)} caracteres${s.quoted ? ", entre guillemets" : ""}`);
  }
  const others = env
    .split("\n")
    .filter((l) => /^\s*[A-Z_]+\s*=/.test(l))
    .map((l) => l.split("=")[0].trim())
    .filter((k) => !ROTATES.includes(k as (typeof ROTATES)[number]));
  console.log(`\n  Laissees intactes : ${others.join(", ") || "(aucune autre)"}`);

  if (!APPLY) {
    console.log(`\n  ${GRN}SIMULATION — rien n'a ete modifie.${OFF}`);
    console.log(`  Avec --apply, ce script va :`);
    console.log(`    1. copier ${ENV_PATH} vers ${BACKUP_DIR}`);
    console.log(`    2. generer deux valeurs de 64 caracteres hexadecimaux`);
    console.log(`    3. remplacer UNIQUEMENT les deux lignes ci-dessus`);
    console.log(`\n  ${YEL}Consequences :${OFF} toutes les sessions sont invalidees (aucun PIN`);
    console.log(`  ne change), et les sauvegardes chiffrees existantes deviennent`);
    console.log(`  DEFINITIVEMENT illisibles. Conservez la copie de l'etape 1.\n`);
    return;
  }

  // --- 1. back up the current file, outside the repo -----------------------
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `env-before-rotation-${stamp}.txt`);
  await fs.writeFile(backupPath, env, "utf8");
  const verify = await fs.readFile(backupPath, "utf8");
  if (verify !== env) fail("La copie de sauvegarde differe de l'original. Rien n'a ete modifie.");
  console.log(`\n  ${GRN}Copie de sauvegarde${OFF} : ${backupPath} (${verify.length} octets, verifiee)`);

  // --- 2. generate, and never show ----------------------------------------
  let next = env;
  for (const k of ROTATES) {
    const value = randomBytes(32).toString("hex");
    next = replaceLine(next, k, value);
  }
  if (next === env) fail("Aucune ligne n'a change. Rien n'a ete ecrit.");

  // --- 3. write, then re-read and check the SHAPE only ---------------------
  await fs.writeFile(ENV_PATH, next, "utf8");
  const after = await fs.readFile(ENV_PATH, "utf8");
  for (const k of ROTATES) {
    const s = readShape(after, k);
    if (s.length !== 64) fail(`${k} fait ${s.length} caracteres apres ecriture, attendu 64. Restaurez ${backupPath}.`);
  }
  for (const k of others) {
    const before = env.match(new RegExp(`^\\s*${k}\\s*=.*$`, "m"))?.[0];
    const now = after.match(new RegExp(`^\\s*${k}\\s*=.*$`, "m"))?.[0];
    if (before !== now) fail(`${k} a change alors qu'elle ne devait pas. Restaurez ${backupPath}.`);
  }

  console.log(`  ${GRN}Rotation effectuee${OFF} : les deux valeurs font 64 caracteres hexadecimaux.`);
  console.log(`  ${others.length} autre(s) ligne(s) verifiee(s) identique(s).`);
  console.log(`\n  ${YEL}A FAIRE MAINTENANT :${OFF}`);
  console.log(`    1. Redemarrer l'application`);
  console.log(`       (sur la caisse : Restart-ScheduledTask -TaskName "HibaPOS Server")`);
  console.log(`    2. GET /api/auth/me doit repondre {"user":null} — l'ancienne session est refusee`);
  console.log(`    3. Se reconnecter avec le PIN habituel : il n'a pas change`);
  console.log(`    4. CONSERVER ${backupPath}`);
  console.log(`       C'est le seul moyen de rouvrir un jour les sauvegardes chiffrees`);
  console.log(`       ecrites avant cette rotation.`);
  console.log(`    5. Ne PAS envoyer les valeurs a Claude.\n`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
