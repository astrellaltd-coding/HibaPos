// T-11 (Batch 6.3) — the two things every stateful spec needs, in one place.
import type { APIRequestContext } from "@playwright/test";
import { E2E_USERNAME, E2E_PIN } from "./env";

/** Log in with the credentials `global-setup.ts` seeded.
 *
 *  The specs used to hardcode `admin` / `123456` — the PUBLISHED DEFAULTS. The
 *  operator changed both live PINs on 2026-09-04, so every spec had since been
 *  failing at login rather than at its assertions: a failure that reads like an
 *  application regression and is not one. The suite now owns its own operator. */
export async function login(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/auth/login", {
    data: { username: E2E_USERNAME, pin: E2E_PIN },
  });
  if (res.status() !== 200) {
    throw new Error(`e2e login failed (${res.status()}): ${await res.text()}`);
  }
}

/**
 * Leave no till open — the other half of T-11.
 *
 * `03-shift-flow.spec.ts` opened a shift and never closed it, so the NEXT run's
 * `POST /api/shifts` got 409 where it expected 200 and the suite could only be
 * run once. Called from `afterAll` in every spec that opens one, so a spec that
 * fails mid-way still leaves the next run a clean till.
 */
export async function closeAnyOpenShift(request: APIRequestContext): Promise<void> {
  // No login here. The `setup` project authenticates once per run and every
  // spec — and every hook — inherits that session through `storageState`.
  // An extra login per cleanup tripped Batch 4.1's brute-force limiter, which
  // is the same 429 that made the per-test logins untenable.
  const current = await request.get("/api/shifts/current");
  if (current.status() !== 200) return;
  const shift = await current.json();
  if (!shift?.id) return;
  await request.post(`/api/shifts/${shift.id}/close`, {
    data: { closingFloat: shift.openingFloat ?? 0 },
  });
}
