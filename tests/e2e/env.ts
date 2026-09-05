// T-10 (Batch 6.3) — where the e2e suite's database lives, and its credentials.
//
// THE FINDING: `playwright.config.ts` ran `bun run dev`, which loads the real
// `.env`, so the e2e suite wrote orders, refunds and Z closes into the
// PRODUCTION database — and into an append-only hash chain that cannot be
// cleaned up afterwards. `reuseExistingServer: true` also let it hijack a dev
// server somebody was already using. `bun run test:e2e` has been forbidden by
// the plan's warning 2 ever since, and this module is what lifts that.
//
// One module so the config, the global setup and the specs cannot disagree
// about which database they mean — the disagreement being the whole finding.

import path from "path";
import os from "os";

/** A per-run directory, for the same reason `test-setup.ts` uses one. */
export const E2E_RUN_ID = `e2e-${process.pid}-${Date.now().toString(36)}`;

/** Fixed, not per-run: the config and the global setup are separate processes,
 *  so the path has to be derivable rather than generated. Wiped at the start of
 *  every run instead. */
export const E2E_DIR = path.join(os.tmpdir(), "hibapos-e2e");
export const E2E_DB_PATH = path.join(E2E_DIR, "e2e.db");
export const E2E_DATABASE_URL = `file:${E2E_DB_PATH.split(path.sep).join("/")}?_fk=1&_busy_timeout=5000`;

/** The port. Deliberately NOT 3000: a dev server on the default port is the
 *  thing `reuseExistingServer: true` used to hijack. */
export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

/**
 * T-11: the suite seeds its own credentials instead of assuming `admin` /
 * `123456`. Those were the published defaults, and the operator changed both
 * live PINs on 2026-09-04 — so every spec had been failing at login rather
 * than at its assertions, which is a failure that looks like a regression and
 * is not one.
 */
export const E2E_USERNAME = "e2e-admin";
export const E2E_PIN = "778899";

/** The environment the e2e server must run with. Exported so the Playwright
 *  config passes exactly this and nothing is left to a shell. */
export function e2eServerEnv(): Record<string, string> {
  return {
    DATABASE_URL: E2E_DATABASE_URL,
    HIBAPOS_DATA_DIR: E2E_DIR,
    SESSION_SECRET:
      process.env.SESSION_SECRET ?? "e2e-session-secret-at-least-32-characters-long-0123456789",
    BACKUP_ENCRYPTION_KEY:
      process.env.BACKUP_ENCRYPTION_KEY ?? "e2e-backup-key-32-characters-or-more-0123456789",
    APP_URL: E2E_BASE_URL,
    NODE_ENV: "production",
  };
}

/**
 * THE GUARD, and it is the reason this file is safe to act on.
 *
 * Refuses unless the database is inside the system temp directory — the same
 * rule `test-setup.ts` applies to `bun test`, applied here to Playwright.
 * Called by the global setup BEFORE it creates or wipes anything.
 */
export function assertDisposableE2eDatabase(): void {
  const resolved = path.resolve(E2E_DB_PATH);
  const tmp = path.resolve(os.tmpdir());
  if (!resolved.toLowerCase().startsWith(tmp.toLowerCase() + path.sep)) {
    throw new Error(
      `ABORTED: the e2e database ${resolved} is not under ${tmp}. ` +
        "The e2e suite writes orders and sealed Z reports; it must never " +
        "address the real database (T-10, plan warning 2).",
    );
  }
}
