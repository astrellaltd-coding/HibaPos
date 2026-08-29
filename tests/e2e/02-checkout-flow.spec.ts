import { test, expect } from "@playwright/test";

// E2E checkout flow — the highest-risk untested cashier journey.
// Verifies: login → open shift → checkout → receipt → fiscal journal → Z close.
// Uses Playwright's request fixture (API-level) for deterministic coverage.
// The dev server (bun run dev) auto-starts via playwright.config.ts webServer.

test.describe("Checkout flow (API-level e2e)", () => {
  test("full cashier journey: login → open shift → checkout → Z close", async ({ request }) => {
    // 1. Login as admin
    const loginRes = await request.post("/api/auth/login", {
      data: { username: "admin", pin: "123456" },
    });
    expect(loginRes.status()).toBe(200);
    const loggedIn = await loginRes.json();
    expect(loggedIn.username).toBe("admin");
    const cookies = loginRes.headers()["set-cookie"];
    expect(cookies).toBeDefined();

    // Playwright's request fixture persists cookies automatically across
    // subsequent calls on the same test scope.

    // 2. Check no shift is open (fresh DB after seed)
    const meRes = await request.get("/api/auth/me");
    expect(meRes.status()).toBe(200);

    const currentShiftRes = await request.get("/api/shifts/current");
    // Either 200 with null or 404 — both mean "no open shift"
    expect([200, 404].includes(currentShiftRes.status())).toBe(true);

    // 3. Open a shift with a float
    const openRes = await request.post("/api/shifts", {
      data: { openingFloat: 100 },
    });
    expect(openRes.status()).toBe(200);
    const shift = await openRes.json();
    expect(shift.status).toBe("OPEN");
    expect(shift.openingFloat).toBe(100);

    // 4. Fetch catalog to get a product ID
    const productsRes = await request.get("/api/catalog/products?all=1");
    expect(productsRes.status()).toBe(200);
    const products = await productsRes.json();
    expect(products.length).toBeGreaterThan(0);
    const product = products[0];

    // 5. Checkout: create an order with the product
    const checkoutRes = await request.post("/api/orders", {
      data: {
        orderType: "DINE_IN",
        items: [
          {
            productId: product.id,
            quantity: 2,
            optionIds: [],
            addons: [],
          },
        ],
        payments: [
          { method: "CASH", amount: Math.round(product.price * 2 * 100) / 100, tendered: Math.round(product.price * 2 * 100) / 100 + 5 },
        ],
      },
    });
    expect(checkoutRes.status()).toBe(201);
    const order = await checkoutRes.json();
    expect(order.number).toBeGreaterThan(0);
    expect(order.status).toBe("COMPLETED");
    expect(order.fiscalEventId).toBeDefined();
    expect(order.items.length).toBe(1);

    // 6. Verify the fiscal journal has a VENTE event
    const eventsRes = await request.get("/api/fiscal/events?type=VENTE&limit=10");
    expect(eventsRes.status()).toBe(200);
    const events = await eventsRes.json();
    expect(events.length).toBeGreaterThan(0);
    const venteEvent = events.find((e: { type: string; orderId: string | null }) => e.type === "VENTE" && e.orderId === order.id);
    expect(venteEvent).toBeDefined();
    expect(venteEvent.hash).toMatch(/^[0-9a-f]{64}$/);

    // 7. Verify the fiscal chain is intact
    const verifyRes = await request.get("/api/fiscal/verify");
    expect(verifyRes.status()).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.fiscalEvents.ok).toBe(true);

    // 8. Verify the grand total was incremented
    const gtRes = await request.get("/api/fiscal/grand-total");
    expect(gtRes.status()).toBe(200);
    const gt = await gtRes.json();
    expect(gt.totalOrders).toBeGreaterThanOrEqual(1);
    expect(gt.totalSales).toBeGreaterThanOrEqual(product.price * 2 - 0.01);

    // 9. Close the shift (Z report)
    const closeRes = await request.post(`/api/shifts/${shift.id}/close`, {
      data: { closingFloat: 100 + product.price * 2 },
    });
    expect([200, 201].includes(closeRes.status())).toBe(true);
    const closeData = await closeRes.json();
    expect(closeData.zReport).toBeDefined();
    expect(closeData.zReport.number).toBeGreaterThan(0);
    expect(closeData.zReport.salesCount).toBeGreaterThanOrEqual(1);

    // 10. Verify a CLOTURE_Z fiscal event was appended
    const zEventsRes = await request.get("/api/fiscal/events?type=CLOTURE_Z&limit=10");
    expect(zEventsRes.status()).toBe(200);
    const zEvents = await zEventsRes.json();
    expect(zEvents.length).toBeGreaterThan(0);

    // 11. Final chain verification — still intact after Z close
    const finalVerifyRes = await request.get("/api/fiscal/verify");
    expect(finalVerifyRes.status()).toBe(200);
    const finalVerify = await finalVerifyRes.json();
    expect(finalVerify.fiscalEvents.ok).toBe(true);
  });

  test("refund appends a REMBOURSEMENT fiscal event", async ({ request }) => {
    // Login
    const loginRes = await request.post("/api/auth/login", {
      data: { username: "admin", pin: "123456" },
    });
    expect(loginRes.status()).toBe(200);

    // Open shift
    const openRes = await request.post("/api/shifts", {
      data: { openingFloat: 50 },
    });
    const shift = await openRes.json();

    // Get a product + checkout
    const productsRes = await request.get("/api/catalog/products?all=1");
    const products = await productsRes.json();
    const product = products[0];
    const total = Math.round(product.price * 100) / 100;

    const checkoutRes = await request.post("/api/orders", {
      data: {
        orderType: "TAKEAWAY",
        items: [{ productId: product.id, quantity: 1, optionIds: [], addons: [] }],
        payments: [{ method: "CARD", amount: total }],
      },
    });
    expect(checkoutRes.status()).toBe(201);
    const order = await checkoutRes.json();

    // Refund the full amount (admin self-approves)
    const refundRes = await request.post(`/api/orders/${order.id}/refund`, {
      data: { amount: total, reason: "Test refund" },
    });
    expect([200, 201].includes(refundRes.status())).toBe(true);

    // Verify a REMBOURSEMENT or ANNULATION event was appended
    const eventsRes = await request.get("/api/fiscal/events?type=REMBOURSEMENT&limit=10");
    const rembEvents = await eventsRes.json();
    const annulEvents = await (await request.get("/api/fiscal/events?type=ANNULATION&limit=10")).json();
    expect(rembEvents.length + annulEvents.length).toBeGreaterThan(0);

    // Chain still intact
    const verifyRes = await request.get("/api/fiscal/verify");
    const verifyData = await verifyRes.json();
    expect(verifyData.fiscalEvents.ok).toBe(true);

    // Cleanup: close the shift
    await request.post(`/api/shifts/${shift.id}/close`, {
      data: { closingFloat: 50 },
    });
  });
});
