import { test, expect } from "@playwright/test";
import { E2E_USERNAME, E2E_PIN } from "./env";
import { closeAnyOpenShift } from "./helpers";

// E2E shift flow: open → X report → close → Z report (Phase 8e — fills the 03 gap
// between 01-auth and 04-catalog). Uses Playwright's request fixture
// (API-level, deterministic). The dev server auto-starts via
// playwright.config.ts webServer.

test.describe("Shift flow (API-level e2e)", () => {
  // T-11 (Batch 6.3): leave no till open. Without this the suite could
  // only be run once — the next run's `POST /api/shifts` got 409 where it
  // expected 200. In `afterAll` so a spec that fails mid-way still cleans up.
  test.afterAll(async ({ request }) => {
    await closeAnyOpenShift(request);
  });

  test("open → X report → close → Z report", async ({ request }) => {
    // 1. Login as admin
    const loginRes = await request.post("/api/auth/login", {
      data: { username: E2E_USERNAME, pin: E2E_PIN },
    });
    expect(loginRes.status()).toBe(200);
    const loggedIn = await loginRes.json();
    expect(loggedIn.username).toBe(E2E_USERNAME);

    // 2. Verify no shift is open
    const currentRes = await request.get("/api/shifts/current");
    expect([200, 404].includes(currentRes.status())).toBe(true);

    // 3. Open a shift with a float
    const openRes = await request.post("/api/shifts", {
      data: { openingFloat: 5000 }, // 50.00 € in cents
    });
    expect(openRes.status()).toBe(201); // T-11: the route CREATES a shift — 201
    const shift = await openRes.json();
    expect(shift.status).toBe("OPEN");
    expect(shift.openingFloat).toBe(5000);

    // 4. Fetch the live X report
    const xRes = await request.get("/api/reports/x");
    expect([200, 404].includes(xRes.status())).toBe(true);
    if (xRes.status() === 200) {
      const xReport = await xRes.json();
      expect(xReport.salesTotal).toBeGreaterThanOrEqual(0);
      expect(xReport.openingFloat).toBe(5000);
    }

    // 5. Close the shift (Z report) — float matches expected cash
    const closeRes = await request.post(`/api/shifts/${shift.id}/close`, {
      data: { closingFloat: 5000 }, // no sales yet → expected = opening
    });
    expect([200, 201].includes(closeRes.status())).toBe(true);
    const closeData = await closeRes.json();
    expect(closeData.zReport).toBeDefined();
    expect(closeData.zReport.number).toBeGreaterThan(0);
    expect(closeData.zReport.openingFloat).toBe(5000);
    expect(closeData.zReport.closingFloat).toBe(5000);
    expect(closeData.zReport.cashVariance).toBe(0);

    // 6. Verify a CLOTURE_Z fiscal event was appended
    const zEventsRes = await request.get("/api/fiscal/events?type=CLOTURE_Z&limit=10");
    expect(zEventsRes.status()).toBe(200);
    const zEvents = await zEventsRes.json();
    expect(zEvents.length).toBeGreaterThan(0);

    // 7. Verify the fiscal chain is still intact
    const verifyRes = await request.get("/api/fiscal/verify");
    expect(verifyRes.status()).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.fiscalEvents.ok).toBe(true);

    // 8. Verify the shift is now CLOSED
    // T-11 (Batch 6.3): this expected 404. `GET /api/shifts/current` answers
    // **200 with a null body** when no till is open — it has never returned
    // 404. Another expectation that had never been run against a database it
    // could reach, so nothing contradicted it.
    const currentAfterRes = await request.get("/api/shifts/current");
    expect(currentAfterRes.status()).toBe(200);
    expect(await currentAfterRes.json()).toBeNull();

    // 9. Z report is in the history list
    const zListRes = await request.get("/api/reports/z");
    expect(zListRes.status()).toBe(200);
    const zList = await zListRes.json();
    expect(zList.length).toBeGreaterThan(0);
  });

  test("rejects closing an already-closed shift", async ({ request }) => {
    // Login
    await request.post("/api/auth/login", {
      data: { username: E2E_USERNAME, pin: E2E_PIN },
    });

    // Open a shift then close it
    const openRes = await request.post("/api/shifts", {
      data: { openingFloat: 1000 },
    });
    const shift = await openRes.json();
    await request.post(`/api/shifts/${shift.id}/close`, {
      data: { closingFloat: 1000 },
    });

    // Second close → 409
    const secondCloseRes = await request.post(`/api/shifts/${shift.id}/close`, {
      data: { closingFloat: 1000 },
    });
    expect(secondCloseRes.status()).toBe(409);
  });

  test("rejects opening a second shift while one is open", async ({ request }) => {
    await request.post("/api/auth/login", {
      data: { username: E2E_USERNAME, pin: E2E_PIN },
    });

    // Open shift #1
    const open1 = await request.post("/api/shifts", {
      data: { openingFloat: 1000 },
    });
    expect(open1.status()).toBe(201); // T-11: 201, not 200

    // Open shift #2 → 409 (one already open)
    const open2 = await request.post("/api/shifts", {
      data: { openingFloat: 2000 },
    });
    expect(open2.status()).toBe(409);
  });
});
