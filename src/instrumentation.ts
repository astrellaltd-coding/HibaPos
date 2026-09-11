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
    console.error("[startup] secret bootstrap failed", e);
  }

  // Then migrations, BEHIND A VERIFIED BACKUP. Deliberately after the pragmas
  // and before anything serves: a schema the code does not match fails at the
  // first query, so there is nothing to protect by deferring it.
  //
  // It does NOT block startup on a refusal, and that is a judgement, not an
  // oversight. A till that will not open tells the operator nothing; a till
  // that opens and says loudly « migration non appliquée, voici pourquoi » can
  // be diagnosed. The protection is that the schema was not touched.
  try {
    const { runStartupMigrationGate } = await import("@/lib/services/startup-migration");
    const r = await runStartupMigrationGate();
    if (r.status === "APPLIED") {
      await logTechnical(
        "INFO",
        "startup",
        `Applied ${r.pending.length} migration(s) behind verified backup ${r.backup}: ${r.pending.join(", ")}.`,
      );
    } else if (r.status === "REFUSED_NO_VERIFIED_BACKUP" || r.status === "FAILED_AFTER_MIGRATE") {
      console.error(`[startup] ${r.reason}`);
      await logTechnical("ERROR", "startup", r.reason ?? r.status);
    } else if (r.status === "SKIPPED_NO_MIGRATION_TABLE" && r.reason) {
      await logTechnical("WARN", "startup", r.reason);
    }
  } catch (e) {
    console.error("[startup] migration gate failed", e);
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
    // rollback-journal mode.
    console.error("[startup] pragma setup failed", e);
  }
}
