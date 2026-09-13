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
import { migrationsDir, resolvedDatabasePath } from "@/lib/paths";

export type GateStatus =
  | "UP_TO_DATE"
  | "APPLIED"
  | "REFUSED_NO_VERIFIED_BACKUP"
  | "FAILED_AFTER_MIGRATE"
  | "SKIPPED_NO_MIGRATION_TABLE"
  | "SKIPPED_LOCKED"
  // ── added by R9.2, each replacing a case that was previously SILENT ────────
  /** A previous run left a migration row with no `finished_at`: started and
   *  never finished. L-110. The schema is half-applied and only a person can
   *  say which half. */
  | "REFUSED_FAILED_MIGRATION"
  /** `prisma/migrations` could not be found. L-114 — this used to be
   *  indistinguishable from « nothing is pending ». */
  | "SKIPPED_NO_MIGRATIONS_DIR"
  /** The lock could not be CREATED, which is not the same as another process
   *  holding it. L-113. */
  | "REFUSED_LOCK_UNWRITABLE"
  /** A verification query threw after the deploy. L-112 — this used to escape
   *  the function and leave `lastResult` stale. */
  | "FAILED_VERIFICATION_ERROR";

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

/**
 * The migrations shipped with this build, or `null` when the directory is not
 * there at all — L-114.
 *
 * It used to resolve `prisma/migrations` against `process.cwd()` and return
 * `[]` when absent. `[]` means « nothing is pending », which the gate reported
 * as `UP_TO_DATE` — the one status `instrumentation.ts` did not log. So a build
 * that could not see its own migrations said nothing at all and served against
 * whatever schema it found. The Next server trace has **zero** prisma entries,
 * so a trace-driven package lands in exactly that state.
 *
 * `null` is not `[]`, and the gate now says which.
 */
function migrationsOnDisk(): string[] | null {
  const dir = migrationsDir();
  if (!existsSync(dir)) return null;
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

/**
 * Migrations that actually FINISHED — L-110, and the clause that was missing
 * is `finished_at IS NOT NULL`.
 *
 * Prisma writes the `_prisma_migrations` row **before** running the SQL and
 * stamps `finished_at` only on success. So a power cut, a killed process or a
 * `deploy` that errors leaves a row this query used to read as applied. The
 * consequences, both measured against a synthesised table:
 *
 *   NEXT BOOT — `pendingMigrations()` is empty, the gate says `UP_TO_DATE`,
 *   nothing is logged, and the app serves against a half-applied schema.
 *   SAME RUN  — `stillPending` uses this same query, so it is empty even when
 *   the deploy failed, and `integrity_check` cannot see a missing column. The
 *   gate returned **`APPLIED`**. That is the exact failure it was built to
 *   prevent, reported as success.
 */
async function appliedMigrations(): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ migration_name: string }[]>(
    `SELECT migration_name FROM _prisma_migrations
      WHERE rolled_back_at IS NULL AND finished_at IS NOT NULL
      ORDER BY finished_at`,
  );
  return rows.map((r) => r.migration_name);
}

/**
 * Rows that started and never finished. L-110.
 *
 * MEASURED, 2026-09-13, and it settles what the gate should DO about one.
 * Against a real database with fifteen migrations applied and the last row's
 * `finished_at` set to NULL, `bunx prisma migrate deploy` **exits 1 with
 * `P3009`** — « migrate found failed migrations in the target database, new
 * migrations will not be applied » — and changes nothing.
 *
 * So « make it pending again and let the gate retry » is not a thing that
 * exists. Retrying would take a fresh backup (≈49 MB, L-179), be refused, and
 * report `FAILED_AFTER_MIGRATE` telling the operator to restore a backup for
 * damage that never happened — on every single boot. Prisma requires a person
 * and `prisma migrate resolve`, so the gate refuses, names the row, and spends
 * nothing.
 */
async function failedMigrations(): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ migration_name: string }[]>(
    `SELECT migration_name FROM _prisma_migrations
      WHERE rolled_back_at IS NULL AND finished_at IS NULL
      ORDER BY started_at`,
  );
  return rows.map((r) => r.migration_name);
}

/**
 * On disk and not applied. Read-only.
 *
 * Returns `[]` when the migrations directory is missing, which is what a
 * caller wanting a plain list needs; the GATE asks `migrationsOnDisk()`
 * directly so it can tell that case apart (L-114).
 */
export async function pendingMigrations(): Promise<string[]> {
  if (!(await hasMigrationTable())) return [];
  const onDisk = migrationsOnDisk();
  if (onDisk === null) return [];
  const applied = await appliedMigrations();
  return onDisk.filter((m) => !applied.includes(m));
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

/**
 * The lock sits beside the DATABASE, not beside the data directory — L-137.
 *
 * It used to be `dataDir()/db/migrate.lock` while the database is wherever
 * `DATABASE_URL` points. Two installs sharing one database file therefore took
 * two different locks and both migrated it, which is the one thing the lock
 * exists to prevent. The database is what is being protected, so the database
 * is what the lock is named after.
 */
export function migrationLockPath(): string {
  return path.join(path.dirname(path.resolve(resolvedDatabasePath())), "migrate.lock");
}

/** Internal alias, so the body below reads as it did. */
const lockPath = migrationLockPath;

/** Why `takeLock` said no. L-113: these two were the same answer. */
type LockOutcome = "TAKEN" | "HELD_BY_ANOTHER" | "UNWRITABLE";

/**
 * `wx` fails if the file exists, so exactly one process gets the job.
 *
 * L-113: a data directory that could not be written returned the same `false`
 * as a lock another process was holding, and the gate turned that into
 * « Un autre processus applique déjà les migrations. » The migration then never
 * ran, on every start, with a diagnosis sending the operator to look for a
 * second process that does not exist. The two cases are now distinguished by
 * asking whether the lock file is actually there.
 */
function takeLock(): LockOutcome {
  const file = lockPath();
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${process.pid} ${new Date().toISOString()}\n`, { flag: "wx" });
    return "TAKEN";
  } catch {
    // A lock left by a crashed process would block every future start, so a
    // stale one is reclaimed. Ten minutes is far longer than any migration
    // here and far shorter than a person noticing.
    try {
      if (Date.now() - statSync(file).mtimeMs > 10 * 60 * 1000) {
        unlinkSync(file);
        writeFileSync(file, `${process.pid} ${new Date().toISOString()}\n`, { flag: "wx" });
        return "TAKEN";
      }
      // The file is there and is not stale: somebody else has the job.
      return "HELD_BY_ANOTHER";
    } catch {
      // No lock file to stat — so the write failed for a reason that is not
      // contention. An unwritable or missing directory is the common one, and
      // it needs a completely different sentence.
      return existsSync(file) ? "HELD_BY_ANOTHER" : "UNWRITABLE";
    }
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

  // L-110, and it comes FIRST because it is the one case where doing nothing
  // is not safe and doing something is not possible. A row with no
  // `finished_at` is a migration that started and never finished: the schema is
  // half-applied, and `migrate deploy` refuses it (P3009, measured) rather than
  // retrying. So refuse too, name the row, and take no backup — there is
  // nothing to protect if nothing is going to run.
  const failed = await failedMigrations();
  if (failed.length > 0) {
    return record({
      status: "REFUSED_FAILED_MIGRATION",
      pending: failed,
      reason:
        `Migration NON appliquée : une migration précédente a été interrompue et n'a jamais ` +
        `abouti (${failed.join(", ")}). Le schéma est peut-être à moitié appliqué. ` +
        `Prisma refuse d'en appliquer d'autres tant que cette ligne n'est pas résolue ` +
        `(\`prisma migrate resolve\`), et cette décision revient à une personne : seule une ` +
        `inspection peut dire ce qui a été appliqué et ce qui ne l'a pas été. ` +
        `Restaurez une sauvegarde antérieure ou résolvez la ligne, puis redémarrez.`,
    });
  }

  // L-114. `null` is « I could not see the migrations », which is not the same
  // as « there are none pending » and must never again be answered with the one
  // status nothing logs.
  const onDisk = migrationsOnDisk();
  if (onDisk === null) {
    return record({
      status: "SKIPPED_NO_MIGRATIONS_DIR",
      pending: [],
      reason:
        `Le dossier des migrations est introuvable (${migrationsDir()}). ` +
        `Impossible de dire si le schéma est à jour. ` +
        `Définissez HIBAPOS_APP_DIR si l'application est empaquetée.`,
    });
  }

  const pending = await pendingMigrations();
  if (pending.length === 0) return record({ status: "UP_TO_DATE", pending: [] });

  const lock = takeLock();
  if (lock !== "TAKEN") {
    // L-113: two different problems that used to share one sentence.
    return record({
      status: lock === "HELD_BY_ANOTHER" ? "SKIPPED_LOCKED" : "REFUSED_LOCK_UNWRITABLE",
      pending,
      reason:
        lock === "HELD_BY_ANOTHER"
          ? "Un autre processus applique déjà les migrations."
          : `Migration NON appliquée : impossible de créer le verrou ${lockPath()}. ` +
            `Le dossier n'est pas accessible en écriture. Ce n'est PAS un autre processus.`,
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
    //
    // L-112: these three queries had no `catch`, only a `finally` releasing the
    // lock. A throw from any of them escaped the function, `lastResult` was
    // never assigned, and `lastMigrationGateResult()` kept its PREVIOUS value —
    // which is precisely where « the backup succeeded but the disk filled during
    // the migrate » lands. Now it is a verdict like any other.
    let stillPending: string[];
    let integrity: string;
    let fkErrors: number;
    try {
      stillPending = await pendingMigrations();
      const [row] = await db.$queryRawUnsafe<{ integrity_check: string }[]>(
        `PRAGMA integrity_check`,
      );
      integrity = row?.integrity_check ?? "unknown";
      fkErrors = (await db.$queryRawUnsafe<unknown[]>(`PRAGMA foreign_key_check`)).length;
    } catch (e) {
      return record({
        status: "FAILED_VERIFICATION_ERROR",
        pending,
        backup: backupName,
        reason:
          `Migration appliquée mais INVÉRIFIABLE : la vérification a échoué ` +
          `(${e instanceof Error ? e.message : String(e)}). L'état du schéma est inconnu. ` +
          `Sauvegarde préalable « ${backupName} ».` +
          (applied.ok ? "" : ` Sortie de migrate : ${applied.output.slice(-300)}`),
      });
    }

    // L-111: `deploy()` reporting failure was never a condition — the verdict
    // rested entirely on the three checks above, and `applied.ok` was consulted
    // only to decide whether to append the process output to a message. A
    // deploy that says it failed must never be reported as applied.
    const inconsistent = integrity !== "ok" || fkErrors > 0;
    if (!applied.ok || stillPending.length > 0 || inconsistent) {
      // L-138: « Restaurez la sauvegarde » was said even when NOTHING had been
      // changed — a deploy that never ran, or that Prisma refused. Restoring is
      // unnecessary work on a fiscal database and reads as though damage
      // occurred. Say which of the two this is.
      const nothingChanged =
        !inconsistent && stillPending.length === pending.length;
      return record({
        status: "FAILED_AFTER_MIGRATE",
        pending: stillPending,
        backup: backupName,
        reason:
          (nothingChanged
            ? `Migration NON appliquée : \`migrate deploy\` a échoué et le schéma n'a PAS été ` +
              `modifié. Il n'y a rien à restaurer — corrigez la cause, puis redémarrez. ` +
              `La sauvegarde « ${backupName} » a tout de même été prise et vérifiée. `
            : `Migration incomplète ou base incohérente après application. ` +
              `Restaurez la sauvegarde « ${backupName} » avant de continuer. `) +
          `(${stillPending.length} en attente sur ${pending.length}, ` +
          `integrity_check « ${integrity} », ${fkErrors} erreur(s) de clé étrangère, ` +
          `migrate ${applied.ok ? "a rendu 0" : "a échoué"}.)` +
          (applied.ok ? "" : ` Sortie : ${applied.output.slice(-300)}`),
      });
    }

    return record({ status: "APPLIED", pending, backup: backupName });
  } finally {
    releaseLock();
  }
}
