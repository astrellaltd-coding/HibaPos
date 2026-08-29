import { test, expect } from "@playwright/test";

test.describe("Catalog & Category Management Flow", () => {
  test("loads category list and verifies structure", async ({ request }) => {
    const res = await request.get("/api/catalog/categories");
    expect(res.status()).toBe(200);
    const categories = await res.json();
    expect(Array.isArray(categories)).toBe(true);
  });

  test("loads products list and verifies pricing attributes", async ({ request }) => {
    const res = await request.get("/api/catalog/products?all=1");
    expect(res.status()).toBe(200);
    const products = await res.json();
    expect(Array.isArray(products)).toBe(true);
    if (products.length > 0) {
      const p = products[0];
      expect(p).toHaveProperty("id");
      expect(p).toHaveProperty("name");
      expect(p).toHaveProperty("price");
      expect(p).toHaveProperty("vatRate");
    }
  });
});
