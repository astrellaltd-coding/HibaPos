// Next.js startup hook (C-19, Batch 2.3).
//
// The audit noted there was no `instrumentation.ts` and no `middleware.ts`,
// so the application had no way to run anything once at boot — which is why
// the WAL pragma was left to a shell script that had been deleted, and never
// ran at all. This is that missing hook.

export async function register() {
  // Runs in both the Node and Edge runtimes; only Node can reach SQLite.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { applyStartupPragmas } = await import("@/lib/db-pragmas");
  const { logTechnical } = await import("@/lib/services/technical-logger");

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
