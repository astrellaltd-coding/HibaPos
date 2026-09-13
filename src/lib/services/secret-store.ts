// Secrets that an install generates for itself, so it can start without a
// hand-written `.env` (operator, 2026-09-11).
//
// ── WHY ─────────────────────────────────────────────────────────────────────
// The app ships as a Tauri v2 installer and install day runs no commands. A
// Tauri install has no `.env`, and one cannot be shipped inside the bundle:
// the secret would be identical on every install and readable by anyone who
// opened it. So the install makes its own on first run.
//
// `auth.ts` refused to start without `SESSION_SECRET` and that refusal was
// right for a hand-deployed install — there, a missing secret meant somebody
// had skipped a step. For an installer it means nobody has run yet.
//
// ── THE ENVIRONMENT ALWAYS WINS ─────────────────────────────────────────────
// If a variable is already set, it is used and nothing is written. That is
// what makes this change invisible to the existing install, which holds all of
// its secrets in `.env` — and it keeps `scripts/rotate-secrets.ts` the way
// secrets are rotated, rather than creating a second competing source.
//
// ── WHAT IS AND IS NOT GENERATED HERE ───────────────────────────────────────
// `SESSION_SECRET` and `BACKUP_ENCRYPTION_KEY` are generated on demand.
// **`FISCAL_CHAIN_KEY` IS NOT.** Arming it is a fiscal act with an ordering
// rule — only onto an empty journal, because a half-keyed chain verifies under
// neither mode (`fiscal.ts:111` throws `ChainKeyMisconfiguredError` at the
// next write). Generating it as a side effect of booting would arm it at a
// moment nobody chose. It is armed through `POST /api/setup/chain-key`, which
// checks the journal first.
//
// ── NOTHING HERE EVER LOGS, RETURNS OR THROWS A VALUE ───────────────────────
// Batch 7.3's rule, kept: a secret in an error message is a secret in a log.
// Errors name the variable. The ONE place a value is deliberately shown is
// `GET /api/setup/secrets`, because a backup key that exists only on the
// machine it protects is not a backup key — and that is a decision, taken on
// 2026-09-11, not an accident of this module.
import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import { backupsDir, dataDir } from "@/lib/paths";
// L-115 (R9.4): the length threshold comes from the module that ENFORCES it.
// This function and `fiscalChainKey()` disagreeing is how the finding happened.
import { CHAIN_KEY_MIN_LENGTH } from "@/lib/fiscal-key";

/** The secrets an install may generate for itself, and the minimum length
 *  each of their readers enforces. */
export const GENERATED_SECRETS = ["SESSION_SECRET", "BACKUP_ENCRYPTION_KEY"] as const;
export type GeneratedSecret = (typeof GENERATED_SECRETS)[number];

/** Armed deliberately, never at boot. Kept here so the file that stores it and
 *  the route that arms it name it in one place. */
export const CHAIN_KEY = "FISCAL_CHAIN_KEY";

const MIN_LENGTH = 32;

type StoreFile = {
  /** `name -> 64 hex characters`. */
  secrets: Record<string, string>;
  /** Secrets generated here and NOT yet acknowledged by a person. A key the
   *  operator has not written down elsewhere is a key that will be lost. */
  unacknowledged: string[];
  createdAt?: string;
};

export function secretStorePath(): string {
  return path.join(dataDir(), "db", "secrets.json");
}

function readStore(): StoreFile {
  const file = secretStorePath();
  if (!existsSync(file)) return { secrets: {}, unacknowledged: [] };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<StoreFile>;
    return {
      secrets: parsed.secrets && typeof parsed.secrets === "object" ? parsed.secrets : {},
      unacknowledged: Array.isArray(parsed.unacknowledged) ? parsed.unacknowledged : [],
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : undefined,
    };
  } catch {
    // A corrupt store is NOT silently replaced: overwriting it would discard a
    // backup key and make every existing backup unreadable. Refuse instead,
    // naming the file and not its contents.
    throw new Error(
      `${file} is present but unreadable. Move it aside only if you are certain no backup depends on the key inside it.`,
    );
  }
}

/**
 * Write the store atomically, then RE-READ it and return what is actually on
 * disk.
 *
 * Two server workers booting together would otherwise each generate their own
 * secret and keep it in memory: sessions signed by one would be rejected by the
 * other, intermittently, which is the worst shape a bug can have. Writing to a
 * temporary file and renaming makes one of them win, and re-reading makes both
 * adopt the winner.
 */
function persist(mutate: (s: StoreFile) => void): StoreFile {
  const file = secretStorePath();
  mkdirSync(path.dirname(file), { recursive: true });
  const next = readStore();
  next.createdAt ??= new Date().toISOString();
  mutate(next);
  const tmp = `${file}.${process.pid}.tmp`;
  // 0o600: readable by this user only. Best-effort — Windows ACLs do not map
  // onto the POSIX mode, so this is a correct request and not a guarantee.
  writeFileSync(tmp, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, file);
  return readStore();
}

function generate(): string {
  return randomBytes(32).toString("hex"); // 64 hex characters
}

/**
 * Do encrypted backups already exist? — L-106 (R9.4).
 *
 * THE FINDING: a **corrupt** store is refused loudly, with the right reasoning
 * — « overwriting it would discard a backup key and make every existing backup
 * unreadable ». A **DELETED** one returns `{secrets:{}, unacknowledged:[]}` and
 * `resolveSecret` then makes a brand-new `BACKUP_ENCRYPTION_KEY` with no error
 * and no warning. Deleting the file is at least as destructive as corrupting
 * it, and it is the outcome the corrupt path exists to prevent. Measured by the
 * audit: key `a97945f9…` before the delete, `39abcbd0…` after, source
 * `generated`, no error.
 *
 * WHAT TELLS A FIRST RUN FROM A LOST STORE. The audit suggested a marker, and
 * `createdAt` is half of one — but a marker inside the file cannot survive the
 * file being deleted, which is the case. So the evidence is taken from
 * somewhere the deletion did not reach: **the backups themselves.** If there
 * are encrypted backups on disk, a key was used to write them, and minting a
 * fresh one orphans exactly those files. If there are none, nothing can be
 * orphaned and a first run proceeds untouched.
 *
 * Synchronous, because `resolveSecret` is — which also rules out asking the
 * database, the other place the evidence lives.
 *
 * FALSE POSITIVES cost nothing they should not: an operator who deliberately
 * wants a new key with old backups present gets a refusal telling them how to
 * proceed, which is the same answer the corrupt-store path gives and for the
 * same reason. `BACKUP_LOCATION` and `rotate-secrets.ts` both go through the
 * environment, which wins before this is ever reached.
 */
function encryptedBackupsExist(): boolean {
  try {
    const dir = backupsDir();
    if (!existsSync(dir)) return false;
    return readdirSync(dir).some((f) => f.endsWith(".dbenc") || f.endsWith(".enc"));
  } catch {
    // Cannot tell. Answering « no » would restore the silent regeneration this
    // guard exists to stop, so an unreadable backup directory counts as
    // « something might be there ».
    return true;
  }
}

/** A secret's value, from the environment, else the store, else newly made. */
export function resolveSecret(name: GeneratedSecret | typeof CHAIN_KEY): {
  value: string;
  source: "environment" | "store" | "generated";
} {
  const fromEnv = process.env[name]?.trim();
  if (fromEnv) {
    if (fromEnv.length < MIN_LENGTH) {
      throw new Error(`${name} must be at least ${MIN_LENGTH} characters long.`);
    }
    return { value: fromEnv, source: "environment" };
  }

  const stored = readStore().secrets[name]?.trim();
  if (stored && stored.length >= MIN_LENGTH) return { value: stored, source: "store" };

  // `FISCAL_CHAIN_KEY` is never created by a read — see the header.
  if (name === CHAIN_KEY) {
    throw new Error(`${CHAIN_KEY} is not armed. Arm it deliberately, on an empty journal.`);
  }

  // L-106 (R9.4) — DO NOT MINT A BACKUP KEY OVER EXISTING BACKUPS.
  //
  // Reached when the store holds no usable value for `name`, which on a fresh
  // install is normal and after a deleted `secrets.json` is a catastrophe: the
  // new key cannot open a single existing `.dbenc`, and nothing says so until
  // someone needs one. Refused in the same words and for the same reason the
  // corrupt-store path is, one function up.
  if (name === "BACKUP_ENCRYPTION_KEY" && encryptedBackupsExist()) {
    throw new Error(
      `${name} is not in ${secretStorePath()} and encrypted backups already exist in ` +
        `${backupsDir()}. Generating a new key here would make every one of them ` +
        `unreadable. Restore the secret store, or set ${name} in the environment to the ` +
        `value those backups were written under. If you are certain none of them is ` +
        `needed, move them aside and try again.`,
    );
  }

  const after = persist((s) => {
    s.secrets[name] ??= generate();
    if (!s.unacknowledged.includes(name)) s.unacknowledged.push(name);
  });
  return { value: after.secrets[name], source: "generated" };
}

/**
 * Resolve every boot-time secret and put it in `process.env`.
 *
 * Writing to `process.env` is deliberate and is what makes this change small:
 * `auth.ts`, `backup.ts` and `fiscal-key.ts` go on reading the environment
 * exactly as they always have — and `fiscalChainKey()` in particular reads it
 * on EVERY call by design, so a value parked there is seen without touching
 * that function at all.
 */
/**
 * A resolvable secret that is present but unusable — L-116 (R9.4).
 *
 * THE FINDING: with a malformed `SESSION_SECRET` the server printed `✓ Ready`,
 * the login screen rendered 200, `GET /api/auth/profiles` answered 200 with a
 * populated picker — and `POST /api/auth/login` answered **500 Internal Server
 * Error**. A till that looks fine and cannot take a login.
 *
 * The cause is the shape rather than the check: `auth.ts` and `approvals.ts`
 * validated at MODULE LOAD and threw there, so the import itself failed and
 * Next answered with a bare 500 that no handler could dress. Nothing was wrong
 * with refusing — what was wrong was refusing in a way nobody could read.
 *
 * Typed so the wrapper can map it, exactly as `ChainKeyMisconfiguredError` and
 * `ScryptBusyError` already are. Never carries the value: a secret in an error
 * message is a secret in a log (Batch 7.3's rule).
 */
export class SecretMisconfiguredError extends Error {
  secretName: string;
  constructor(secretName: string, message: string) {
    super(message);
    this.name = "SecretMisconfiguredError";
    this.secretName = secretName;
  }
}

export function isSecretMisconfigured(e: unknown): e is SecretMisconfiguredError {
  return e instanceof SecretMisconfiguredError;
}

/** What the operator is told. French, because it reaches the login screen. */
export function secretMisconfiguredMessage(name: string, minLength: number): string {
  return (
    `${name} est absente ou trop courte (minimum ${minLength} caractères). ` +
    "L'application ne peut pas ouvrir de session tant qu'elle ne l'est pas. " +
    "Corrigez-la dans .env, ou supprimez la ligne pour que l'installation en " +
    "génère une — Réglages l'affichera une fois."
  );
}

/**
 * Resolve a secret at import, but do not THROW until something uses it —
 * L-116 (R9.4).
 *
 * The resolution still happens once, at module load, so the cost and the
 * ordering are unchanged and `auth.ts`'s note about beating the async
 * `register()` hook still holds. What changes is that a bad value no longer
 * takes the importing module down with it: the module loads, and the first call
 * that actually needs the secret throws `SecretMisconfiguredError`, which
 * `withAuth` and the login route answer with words.
 *
 * **BOTH GUARDS SURVIVE.** The app still cannot serve without a usable secret,
 * and still refuses one under `minLength`. It refuses per request instead of at
 * import — which is the only place a request can be told anything.
 */
export function lazySecret(
  name: GeneratedSecret | typeof CHAIN_KEY,
  minLength = 32,
): () => string {
  let state: { ok: true; value: string } | { ok: false; message: string };
  try {
    const value = resolveSecret(name).value;
    state =
      value && value.length >= minLength
        ? { ok: true, value }
        : { ok: false, message: secretMisconfiguredMessage(name, minLength) };
  } catch (e) {
    // `resolveSecret` raises its own length guard, and a store that cannot be
    // read throws too. Either way the answer to the caller is the same.
    state = {
      ok: false,
      message: `${secretMisconfiguredMessage(name, minLength)} (${e instanceof Error ? e.message : String(e)})`,
    };
  }
  return () => {
    if (!state.ok) throw new SecretMisconfiguredError(name, state.message);
    return state.value;
  };
}

export function bootstrapSecrets(): { generated: GeneratedSecret[] } {
  const generated: GeneratedSecret[] = [];
  for (const name of GENERATED_SECRETS) {
    const r = resolveSecret(name);
    process.env[name] = r.value;
    if (r.source === "generated") generated.push(name);
  }
  // A chain key already in the store belongs in the environment too, or an
  // install would forget it had been armed the moment it restarted.
  const chain = readStore().secrets[CHAIN_KEY];
  if (chain && !process.env[CHAIN_KEY]) process.env[CHAIN_KEY] = chain;
  return { generated };
}

/** Arm the fiscal chain key, and return it ONCE so it can be recorded. The
 *  caller is responsible for having checked that the journal is empty. */
export function armChainKey(): { value: string; alreadyArmed: boolean } {
  const existing = process.env[CHAIN_KEY]?.trim() || readStore().secrets[CHAIN_KEY];
  if (existing) return { value: existing, alreadyArmed: true };
  const after = persist((s) => {
    s.secrets[CHAIN_KEY] ??= generate();
    if (!s.unacknowledged.includes(CHAIN_KEY)) s.unacknowledged.push(CHAIN_KEY);
  });
  const value = after.secrets[CHAIN_KEY];
  process.env[CHAIN_KEY] = value;
  return { value, alreadyArmed: false };
}

/**
 * Is the fiscal chain key armed?
 *
 * Cannot be inferred from the unacknowledged list: a key that was armed AND
 * recorded is absent from it, and so is a key that was never armed. Those are
 * opposite states and a screen that confuses them would offer to arm a key
 * that is already protecting a journal.
 */
export function chainKeyArmed(): boolean {
  // L-115 (R9.4) — LENGTH-BLIND, and it reported the opposite of the truth.
  //
  // `?.trim()` is truthy for any non-empty value, so a key of eight characters
  // made `GET /api/setup/secrets` answer `chainArmed: true` **while the till
  // refused every sale** — the one screen an operator would check to find out
  // whether arming had worked told them it had. « Armed » has to mean « a key
  // that `fiscalChainKey()` will accept », or it means nothing.
  //
  // The threshold is imported rather than repeated: this function and the one
  // that enforces it disagreeing is how the finding happened.
  const fromEnv = process.env[CHAIN_KEY]?.trim() ?? "";
  if (fromEnv.length >= CHAIN_KEY_MIN_LENGTH) return true;
  if (fromEnv.length > 0) return false; // present but unusable — not armed
  return (readStore().secrets[CHAIN_KEY]?.trim().length ?? 0) >= CHAIN_KEY_MIN_LENGTH;
}

/** Which generated secrets nobody has confirmed recording yet. */
export function unacknowledgedSecrets(): string[] {
  return readStore().unacknowledged;
}

/** The values still awaiting acknowledgement, for the one screen that shows
 *  them. Returns nothing for a secret that has already been acknowledged. */
export function secretsAwaitingRecord(): { name: string; value: string }[] {
  const store = readStore();
  return store.unacknowledged
    .filter((n) => store.secrets[n])
    .map((n) => ({ name: n, value: store.secrets[n] }));
}

/** Mark secrets as recorded elsewhere. Unknown names are ignored rather than
 *  rejected: the caller is a screen, not a contract. */
export function acknowledgeSecrets(names: string[]): { remaining: string[] } {
  const after = persist((s) => {
    s.unacknowledged = s.unacknowledged.filter((n) => !names.includes(n));
  });
  return { remaining: after.unacknowledged };
}
