import { test, expect } from "@playwright/test";
import { E2E_USERNAME } from "./env";

// T-10 (Batch 6.3) — THE MARKER PROOF, and it runs before anything else.
//
// Every batch in this plan that started a server against a copy of production
// proved which database it had open by reading a marker back from the pre-auth
// `GET /api/auth/profiles` BEFORE the first write. This is that method, made
// permanent: the e2e suite writes orders, refunds and sealed Z reports, so
// "the config looks right" is not good enough — the running server has to say
// so itself.
//
// The marker is the operator `global-setup.ts` seeds. Production has `admin`
// and `manager` and has never had `e2e-admin`; the disposable database has
// `e2e-admin` and nothing else. If this spec fails, STOP — every spec after it
// is about to write into whatever database the server actually opened.
test.describe("the server is on the disposable database", () => {
  test("profiles shows the seeded e2e operator, and ONLY that", async ({ request }) => {
    const res = await request.get("/api/auth/profiles");
    expect(res.status()).toBe(200);
    const profiles = (await res.json()) as { username: string }[];
    const names = profiles.map((p) => p.username).sort();

    expect(names).toContain(E2E_USERNAME);
    // The production operators must not be here. Their presence would mean the
    // server opened the real database despite everything above.
    expect(names).not.toContain("admin");
    expect(names).not.toContain("manager");
    expect(names).toEqual([E2E_USERNAME]);
  });

  test("the till is empty — no trading history came with it", async ({ request }) => {
    // Production carries 21 orders and two sealed Z reports. A fresh
    // disposable database carries none, so this is a second, independent way
    // of noticing the same mistake.
    await request.post("/api/auth/login", {
      data: { username: E2E_USERNAME, pin: "778899" },
    });
    const orders = await request.get("/api/orders?limit=200");
    expect(orders.status()).toBe(200);
    expect(((await orders.json()) as unknown[]).length).toBe(0);
  });
});
