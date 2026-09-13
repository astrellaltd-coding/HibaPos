// Next.js startup hook (C-19, Batch 2.3).
//
// The audit noted there was no `instrumentation.ts` and no `middleware.ts`,
// so the application had no way to run anything once at boot — which is why
// the WAL pragma was left to a shell script that had been deleted, and never
// ran at all. This is that missing hook.
//
// L-22 (Batch 7.5): the zod French locale is configured HERE as well as in
// `validation.ts`, and both are needed. Thirteen API routes declare inline
// schemas and never import `validation.ts`; this runs once at startup, before
// any request, so those are covered too. Static, not inside `register()` — the
// config must be in place before the first route module parses anything, and
// it touches nothing runtime-specific.
import "@/lib/zod-locale";

export async function register() {
  // Runs in both the Node and Edge runtimes; only Node can reach SQLite.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { applyStartupPragmas } = await import("@/lib/db-pragmas");
  const { logTechnical } = await import("@/lib/services/technical-logger");

  // Secrets first: an install with no `.env` has to have a `SESSION_SECRET`
  // before anything signs a cookie. `auth.ts` resolves it for itself at import
  // — this only parks the rest in `process.env` for the readers that expect
  // them there, and reports which were newly made.
  try {
    const { bootstrapSecrets } = await import("@/lib/services/secret-store");
    const { generated } = bootstrapSecrets();
    if (generated.length) {
      await logTechnical(
        "WARN",
        "startup",
        `Generated ${generated.join(", ")} for this install. They must be recorded off this machine — Réglages shows them once.`,
      );
    }
  } catch (e) {
    // L-112: `console.error` and NOTHING else. Measured live — the
    // malformed-SESSION_SECRET probe produced one stdout line and zero
    // `TechnicalLog` rows, on a machine whose stdout nobody is watching.
    //
    // The row is ADDED, not swapped in: `logTechnical` writes to the database,
    // which is the thing that may be failing. Keeping both means the console
    // line survives the case where the row cannot be written.
    console.error("[startup] secret bootstrap failed", e);
    await logTechnical(
      "ERROR",
      "startup",
      `Secret bootstrap failed: ${e instanceof Error ? e.message : String(e)}`,
      e instanceof Error ? e.stack : undefined,
    );
  }

  // Then migrations, BEHIND A VERIFIED BACKUP, and before anything serves: a
  // schema the code does not match fails at the first query, so there is
  // nothing to protect by deferring it.
  //
  // L-139: this used to read « Deliberately after the pragmas ». It is not —
  // the gate runs here and `applyStartupPragmas()` runs below it, so migrations
  // go first. Harmless in effect (the pragma is idempotent and the journal mode
  // is stored in the file), but it stated an ordering that was evidently
  // designed and was not there, which is the kind of comment that gets trusted
  // in a hurry. Corrected to describe what happens. **Whether the pragmas
  // SHOULD come first is a real question and not this batch's**: migrating in
  // rollback-journal mode is slower and less crash-safe than in WAL.
  //
  // It does NOT block startup on a refusal, and that is a judgement, not an
  // oversight. A till that will not open tells the operator nothing; a till
  // that opens and says loudly « migration non appliquée, voici pourquoi » can
  // be diagnosed. The protection is that the schema was not touched.
  try {
    const { runStartupMigrationGate } = await import("@/lib/services/startup-migration");
    type GateStatus = Awaited<ReturnType<typeof runStartupMigrationGate>>["status"];
    const r = await runStartupMigrationGate();
    // L-110 and L-114 were both silent because the branches below did not
    // cover them. Written as an exhaustive map rather than a chain of `else
    // if`, so a status added later without a reporting decision is a TYPE
    // ERROR here instead of another silence.
    const LEVEL: Record<GateStatus, "INFO" | "WARN" | "ERROR" | null> = {
      // The normal case, every boot. Deliberately not logged: a row per start
      // would bury the ones that matter, and `pruneLogs()` only runs at shift
      // close (L-176).
      UP_TO_DATE: null,
      APPLIED: "INFO",
      REFUSED_NO_VERIFIED_BACKUP: "ERROR",
      FAILED_AFTER_MIGRATE: "ERROR",
      FAILED_VERIFICATION_ERROR: "ERROR",
      // A half-applied schema serving a till. Nothing is more serious here.
      REFUSED_FAILED_MIGRATION: "ERROR",
      // The app cannot tell whether it is up to date. Was `UP_TO_DATE`.
      SKIPPED_NO_MIGRATIONS_DIR: "ERROR",
      REFUSED_LOCK_UNWRITABLE: "ERROR",
      SKIPPED_NO_MIGRATION_TABLE: "WARN",
      // Normal with two workers; the other one is doing the work.
      SKIPPED_LOCKED: "INFO",
    };
    const level = LEVEL[r.status];
    if (level) {
      const message =
        r.status === "APPLIED"
          ? `Applied ${r.pending.length} migration(s) behind verified backup ${r.backup}: ${r.pending.join(", ")}.`
          : (r.reason ?? r.status);
      if (level === "ERROR") console.error(`[startup] ${message}`);
      await logTechnical(level, "startup", message);
    }
  } catch (e) {
    // L-112, same shape as the secret bootstrap above: the row is added, the
    // console line stays.
    console.error("[startup] migration gate failed", e);
    await logTechnical(
      "ERROR",
      "startup",
      `Migration gate threw: ${e instanceof Error ? e.message : String(e)}`,
      e instanceof Error ? e.stack : undefined,
    );
  }

  try {
    const result = await applyStartupPragmas();

    if (result.applied) {
      await logTechnical(
        "INFO",
        "startup",
        `SQLite journal mode set to WAL (${result.databasePath ?? "unknown path"}).`,
      );
    } else if (result.skipped === "CLOUD_SYNC") {
      // Loud on purpose: this is a data-loss risk with a known fix (DD-02),
      // and it is invisible until the day it corrupts something.
      console.warn(`[startup] ${result.warning}`);
      await logTechnical("WARN", "startup", result.warning ?? "WAL skipped.");
    } else if (result.journalMode.toLowerCase() !== "wal") {
      await logTechnical(
        "WARN",
        "startup",
        `SQLite journal mode is "${result.journalMode}" and could not be changed to WAL.`,
      );
    }
  } catch (e) {
    // Never block startup. A till that will not open is worse than a till in
    // rollback-journal mode. But it must leave a trace — L-112.
    console.error("[startup] pragma setup failed", e);
    await logTechnical(
      "ERROR",
      "startup",
      `Pragma setup failed: ${e instanceof Error ? e.message : String(e)}`,
      e instanceof Error ? e.stack : undefined,
    );
  }
}
