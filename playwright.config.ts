import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { E2E_BASE_URL, E2E_PORT, E2E_DIR, e2eServerEnv } from "./tests/e2e/env";

// T-10 (Batch 6.3). What this file used to do, and why `bun run test:e2e` was
// forbidden by the plan's warning 2:
//
//   webServer.command = "bun run dev"   → loads the REAL `.env`, so every spec
//                                         wrote orders, refunds and sealed Z
//                                         reports into the PRODUCTION database
//                                         and its append-only hash chain.
//   reuseExistingServer: true           → hijacked whatever was already on
//                                         :3000, including a dev server
//                                         somebody was using.
//   baseURL http://localhost:3000       → the same port a developer uses.
//
// All three are now closed. The server runs the PRODUCTION BUILD (`next
// start`), with an environment this config passes explicitly — never inherited
// from a shell — pointed at a throwaway database under the system temp
// directory. `tests/e2e/global-setup.ts` builds and seeds that database, and
// refuses to run at all if the path is not disposable.
export default defineConfig({
  testDir: "./tests/e2e",
  // The specs share one database and one till; they are ordered and stateful.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // T-11: one login per RUN, not per test. Logging in per test tripped Batch
    // 4.1's brute-force limiter — 429 partway through the suite — which is the
    // protection working, not a defect to route around.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(E2E_DIR, "storage-state.json"),
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // `next start`, not `next dev`: dev reads `.env`, and the whole point is
    // that this server's environment comes from `e2eServerEnv()` below.
    command: `bunx next start -p ${E2E_PORT} -H 127.0.0.1`,
    url: E2E_BASE_URL,
    // NEVER reuse. A server already listening is a server whose database this
    // config did not choose.
    reuseExistingServer: false,
    timeout: 180000,
    env: e2eServerEnv(),
    stdout: "pipe",
    stderr: "pipe",
  },
});
