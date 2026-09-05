import { test as setup, expect } from "@playwright/test";
import path from "path";
import { E2E_USERNAME, E2E_PIN, E2E_DIR } from "./env";

export const STORAGE_STATE = path.join(E2E_DIR, "storage-state.json");

// T-11 (Batch 6.3) — log in ONCE per run, and share the session.
//
// FOUND BY RUNNING IT: logging in per test answered **429 « Trop de tentatives.
// Réessayez plus tard. »** partway through the suite. That is not a defect —
// it is Batch 4.1's brute-force protection doing exactly its job, and a suite
// that hammered the login route would have to be exempted from it to pass,
// which is the wrong direction entirely.
//
// So the suite logs in once, in a setup project every other project depends
// on, and reuses the cookie. This is Playwright's standard pattern and it also
// makes the specs faster and closer to how a till is actually used: one
// operator, one session, a shift's worth of work.
setup("authenticate once", async ({ request }) => {
  const res = await request.post("/api/auth/login", {
    data: { username: E2E_USERNAME, pin: E2E_PIN },
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).username).toBe(E2E_USERNAME);
  await request.storageState({ path: STORAGE_STATE });
});
