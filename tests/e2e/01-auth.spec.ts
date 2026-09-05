import { test, expect } from "@playwright/test";
import { E2E_USERNAME } from "./env";

test.describe("Authentication & Security", () => {
  test("bootstrap / me endpoint is accessible", async ({ request }) => {
    const res = await request.get("/api/auth/me");
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("user");
  });

  test("rejects invalid PIN login attempt", async ({ request }) => {
    // T-11 (Batch 6.3): this named `admin`, which does not exist in the
    // disposable database — so it would have answered 401 for the WRONG
    // reason, "no such user" rather than "wrong PIN", and passed anyway. It
    // now names the operator `global-setup.ts` seeds, so the 401 it asserts is
    // the one it claims to be testing.
    const res = await request.post("/api/auth/login", {
      data: {
        username: E2E_USERNAME,
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
