// Apply pending migrations at startup — but only behind a VERIFIED backup.
//
// ── WHY THIS EXISTS, AND WHY IT IS THE MOST DANGEROUS THING HERE ────────────
// The app ships as an installer and install day runs no commands, so an update
// that changes the schema has nobody to run `prisma migrate deploy`. Without
// this, a v1.1 over a v1.0 either refuses to work or needs a shell.
//
// It is also a reversal of the plan's long-standing rule that applying a
// migration is the OPERATOR's action, taken deliberately by the operator on
// 2026-09-11. That rule was written because *this project* twice believed a
// migration was applied when it was not, and because `migrate deploy` prints
// the same green banner whichever migration it ran. An application migrating
// its own database at startup is a different actor from a person at a prompt —
// but the failure mode is the same, and worse on a fiscal database: a
// half-applied migration on a till that then takes money.
//
// ── SO THE BACKUP IS NOT A COURTESY, IT IS THE GATE ─────────────────────────
// Nothing is migrated until a backup exists AND HAS BEEN OPENED AGAIN. Not
// "written" — written is what a corrupt file also is. `createBackup` snapshots
// with `VACUUM INTO` and records a sha256 of the plaintext; this decrypts the
// encrypted result and checks that sha back. If any part of that fails the
// migration does **not** run, and the reason is recorded.
//
// The order is the whole design: **backup, verify, migrate, verify.** A backup
// taken afterwards would be a backup of the thing that went wrong.
//
// ── WHAT IT REFUSES TO TOUCH ────────────────────────────────────────────────
// A database with no `_prisma_migrations` table at all was built by
// `prisma db push` — every test database here, and any install bootstrapped
// that way. `migrate deploy` against one of those would try to apply the
// entire history over an existing schema. It is skipped, loudly.
//
// ── ONE PROCESS ONLY ────────────────────────────────────────────────────────
// Two workers booting together would both try to migrate. A lock file created
// with `wx` gives one of them the job; the other skips. Same class of problem
// as the secret store's write race, and the same reason for handling it:
// intermittent damage is the worst kind.
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { spawnSync } from "child_process";
import { db } from "@/lib/db";
import { dataDir } from "@/lib/paths";

export type GateStatus =
  | "UP_TO_DATE"
  | "APPLIED"
  | "REFUSED_NO_VERIFIED_BACKUP"
  | "FAILED_AFTER_MIGRATE"
  | "SKIPPED_NO_MIGRATION_TABLE"
  | "SKIPPED_LOCKED";

export type GateResult = {
  status: GateStatus;
  pending: string[];
  /** The backup the migration ran behind, when one was taken and verified. */
  backup?: string;
  /** Why, in French, when the answer is a refusal or a failure. */
  reason?: string;
};

/** The last result, for a health route or a log to report. Startup runs once. */
let lastResult: GateResult | null = null;
export function lastMigrationGateResult(): GateResult | null {
  return lastResult;
}

function migrationsOnDisk(): string[] {
  const dir = path.resolve("prisma/migrations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((e) => statSync(path.join(dir, e)).isDirectory())
    .sort();
}

async function hasMigrationTable(): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'`,
  );
  return rows.length > 0;
}

async function appliedMigrations(): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ migration_name: string }[]>(
    `SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY finished_at`,
  );
  return rows.map((r) => r.migration_name);
}

/** On disk and not applied. Read-only. */
export async function pendingMigrations(): Promise<string[]> {
  if (!(await hasMigrationTable())) return [];
  const applied = await appliedMigrations();
  return migrationsOnDisk().filter((m) => !applied.includes(m));
}

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

/** Deps, injected only so a test can make each step fail. The defaults are the
 *  real thing, so production is unchanged — the pattern `createBackup` already
 *  uses for its `tarLoader`. */
export type GateDeps = {
  takeBackup: () => Promise<{ filename: string; checksum: string | null; encrypted: boolean }>;
  /** Decrypt a backup file and return its plaintext bytes. */
  openBackup: (filename: string) => Promise<Buffer>;
  /** Async so a caller can await the work. `spawnSync` is synchronous and is
   *  simply wrapped; a test's stand-in needs to await its own writes. */
  deploy: () => Promise<{ ok: boolean; output: string }>;
};

function defaultDeps(): GateDeps {
  return {
    takeBackup: async () => {
      const { createBackup } = await import("@/lib/services/backup");
      const b = await createBackup(null);
      return { filename: b.filename, checksum: b.checksum, encrypted: b.encrypted };
    },
    openBackup: async (filename) => {
      const { decryptFile, defaultBackupPaths } = await import("@/lib/services/backup");
      const secret = process.env.BACKUP_ENCRYPTION_KEY || process.env.BACKUP_SECRET;
      if (!secret) throw new Error("BACKUP_ENCRYPTION_KEY absente.");
      const file = path.join(defaultBackupPaths().backupDir, filename);
      const out = `${file}.verify-${process.pid}.tmp`;
      try {
        await decryptFile(file, out, secret);
        return await readFile(out);
      } finally {
        if (existsSync(out)) rmSync(out, { force: true });
      }
    },
    deploy: async () => {
      const r = spawnSync("bunx", ["prisma", "migrate", "deploy"], {
        encoding: "utf-8",
        shell: true,
      });
      return {
        ok: r.status === 0,
        output: `${r.stdout ?? ""}${r.stderr ?? ""}`.slice(-4000),
      };
    },
  };
}

function lockPath(): string {
  return path.join(dataDir(), "db", "migrate.lock");
}

/** `wx` fails if the file exists, so exactly one process gets the job. */
function takeLock(): boolean {
  const file = lockPath();
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${process.pid} ${new Date().toISOString()}\n`, { flag: "wx" });
    return true;
  } catch {
    // A lock left by a crashed process would block every future start, so a
    // stale one is reclaimed. Ten minutes is far longer than any migration
    // here and far shorter than a person noticing.
    try {
      if (Date.now() - statSync(file).mtimeMs > 10 * 60 * 1000) {
        unlinkSync(file);
        writeFileSync(file, `${process.pid} ${new Date().toISOString()}\n`, { flag: "wx" });
        return true;
      }
    } catch {
      /* another process won the reclaim — it has the job */
    }
    return false;
  }
}

function releaseLock(): void {
  try {
    if (existsSync(lockPath())) unlinkSync(lockPath());
  } catch {
    /* best effort: a leftover lock is reclaimed after ten minutes */
  }
}

export const NO_BACKUP_REFUSAL =
  "Migration NON appliquée : la sauvegarde préalable n'a pas pu être créée et vérifiée. " +
  "Le schéma reste tel quel. Corrigez la sauvegarde, puis redémarrez.";

/**
 * The gate. Safe to call when nothing is pending — that is the normal case and
 * it costs one query.
 */
export async function runStartupMigrationGate(
  deps: GateDeps = defaultDeps(),
): Promise<GateResult> {
  const record = (r: GateResult) => {
    lastResult = r;
    return r;
  };

  if (!(await hasMigrationTable())) {
    return record({
      status: "SKIPPED_NO_MIGRATION_TABLE",
      pending: [],
      reason:
        "Base créée par `prisma db push` : pas de table `_prisma_migrations`. " +
        "`migrate deploy` tenterait d'appliquer tout l'historique par-dessus un schéma existant.",
    });
  }

  const pending = await pendingMigrations();
  if (pending.length === 0) return record({ status: "UP_TO_DATE", pending: [] });

  if (!takeLock()) {
    return record({
      status: "SKIPPED_LOCKED",
      pending,
      reason: "Un autre processus applique déjà les migrations.",
    });
  }

  try {
    // ── 1. the backup, and it must OPEN again ─────────────────────────────
    let backupName: string;
    try {
      const b = await deps.takeBackup();
      backupName = b.filename;
      if (!b.checksum) throw new Error("la sauvegarde n'a pas de somme de contrôle.");
      const plaintext = await deps.openBackup(b.filename);
      if (sha256(plaintext) !== b.checksum) {
        throw new Error("la somme de contrôle de la sauvegarde déchiffrée ne correspond pas.");
      }
      // A SQLite file starts with this. A backup that decrypts to something
      // else is not a backup, whatever its checksum says.
      if (!plaintext.subarray(0, 15).toString("latin1").startsWith("SQLite format 3")) {
        throw new Error("la sauvegarde déchiffrée n'est pas un fichier SQLite.");
      }
    } catch (e) {
      return record({
        status: "REFUSED_NO_VERIFIED_BACKUP",
        pending,
        reason: `${NO_BACKUP_REFUSAL} (${e instanceof Error ? e.message : String(e)})`,
      });
    }

    // ── 2. apply ──────────────────────────────────────────────────────────
    const applied = await deps.deploy();

    // ── 3. verify, rather than trust the exit code ────────────────────────
    // `migrate deploy` prints the same banner whichever migration it ran —
    // the whole reason `scripts/apply-migration.ts` exists. So the verdict
    // comes from the database.
    const stillPending = await pendingMigrations();
    const [{ integrity_check: integrity }] = await db.$queryRawUnsafe<
      { integrity_check: string }[]
    >(`PRAGMA integrity_check`);
    const fk = await db.$queryRawUnsafe<unknown[]>(`PRAGMA foreign_key_check`);

    if (stillPending.length > 0 || integrity !== "ok" || fk.length > 0) {
      return record({
        status: "FAILED_AFTER_MIGRATE",
        pending: stillPending,
        backup: backupName,
        reason:
          `Migration incomplète ou base incohérente après application : ` +
          `${stillPending.length} en attente, integrity_check « ${integrity} », ` +
          `${fk.length} erreur(s) de clé étrangère. ` +
          `Restaurez la sauvegarde « ${backupName} » avant de continuer.` +
          (applied.ok ? "" : ` Sortie : ${applied.output.slice(-300)}`),
      });
    }

    return record({ status: "APPLIED", pending, backup: backupName });
  } finally {
    releaseLock();
  }
}
