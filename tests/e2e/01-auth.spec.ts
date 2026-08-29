import { test, expect } from "@playwright/test";

test.describe("Authentication & Security", () => {
  test("bootstrap / me endpoint is accessible", async ({ request }) => {
    const res = await request.get("/api/auth/me");
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("user");
  });

  test("rejects invalid PIN login attempt", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: {
        username: "admin",
        pin: "000000",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects non-existent username login", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: {
        username: "nonexistent_user_xyz",
        pin: "123456",
      },
    });
    expect(res.status()).toBe(401);
  });
});
