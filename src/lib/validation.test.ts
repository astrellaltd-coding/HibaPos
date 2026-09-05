import { describe, it, expect } from "vitest";
import {
  loginSchema,
  settingsSchema,
  refundSchema,
  productSchema,
  customerSchema,
  userSchema,
} from "@/lib/validation";

describe("loginSchema", () => {
  it("accepts a valid 6-digit PIN + username", () => {
    const r = loginSchema.safeParse({ username: "admin", pin: "123456" });
    expect(r.success).toBe(true);
  });

  it("rejects a PIN with letters", () => {
    const r = loginSchema.safeParse({ username: "admin", pin: "abcdef" });
    expect(r.success).toBe(false);
  });

  it("rejects a 5-digit PIN", () => {
    const r = loginSchema.safeParse({ username: "admin", pin: "12345" });
    expect(r.success).toBe(false);
  });

  it("rejects empty username", () => {
    const r = loginSchema.safeParse({ username: "", pin: "123456" });
    expect(r.success).toBe(false);
  });
});

// T-08 (Batch 6.2). A `describe("checkoutSchema")` block of six cases stood
// here and tested a schema **no route runs** — the live checkout validates with
// `checkoutIntentSchema`, declared inline in `orders/route.ts`. The six were
// **re-pointed at the route**, not deleted, and now live in
// `src/app/api/orders-route.test.ts`: four of them named real behaviour with no
// other cover, so deleting them would have reduced coverage. `checkoutSchema`
// itself went with them (L-02), which is why this block cannot simply be fixed
// in place.

describe("settingsSchema", () => {
  it("accepts valid settings with factice flag", () => {
    const r = settingsSchema.safeParse({
      restaurantName: "Test",
      defaultVatRate: 20,
      factice: true,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.factice).toBe(true);
    }
  });

  it("defaults factice to false when omitted", () => {
    const r = settingsSchema.safeParse({
      restaurantName: "Test",
      defaultVatRate: 10,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.factice).toBe(false);
    }
  });

  it("rejects VAT rate > 100", () => {
    const r = settingsSchema.safeParse({
      restaurantName: "Test",
      defaultVatRate: 101,
    });
    expect(r.success).toBe(false);
  });
});

describe("refundSchema", () => {
  it("accepts a valid refund", () => {
    const r = refundSchema.safeParse({ amount: 550, reason: "Client insatisfait" });
    expect(r.success).toBe(true);
  });

  it("rejects a zero-amount refund", () => {
    const r = refundSchema.safeParse({ amount: 0, reason: "Test" });
    expect(r.success).toBe(false);
  });

  it("rejects an empty reason", () => {
    const r = refundSchema.safeParse({ amount: 5, reason: "" });
    expect(r.success).toBe(false);
  });

  it("accepts an optional method", () => {
    const r = refundSchema.safeParse({ amount: 5, reason: "Test", method: "CASH" });
    expect(r.success).toBe(true);
  });
});

describe("productSchema", () => {
  it("accepts a valid product", () => {
    const r = productSchema.safeParse({
      name: "Double Cheese",
      price: 990,
      categoryId: "cat-1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a negative price", () => {
    const r = productSchema.safeParse({
      name: "Test",
      price: -1,
      categoryId: "cat-1",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const r = productSchema.safeParse({
      name: "",
      price: 5,
      categoryId: "cat-1",
    });
    expect(r.success).toBe(false);
  });

  it("rejects VAT rate > 100", () => {
    const r = productSchema.safeParse({
      name: "Test",
      price: 5,
      categoryId: "cat-1",
      vatRate: 101,
    });
    expect(r.success).toBe(false);
  });

  // C-24, Batch 4.6 — `options` must not default to `[]`.
  //
  // `PUT /api/catalog/products/[id]` replaces option groups wholesale: it
  // runs `optionGroup.deleteMany({ productId })` and recreates from this
  // field. While it defaulted to `[]`, any PUT that omitted `options`
  // parsed as "the empty list" and silently deleted every option group the
  // product had, answering 200. The route now skips the replace entirely
  // when the field is absent, and this is the parse-level half of that.
  describe("options — absent means unchanged (C-24)", () => {
    const base = { name: "Test", price: 100, categoryId: "cat-1" };

    it("leaves `options` undefined when the field is omitted", () => {
      const r = productSchema.safeParse(base);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.options).toBeUndefined();
    });

    it("keeps an explicit empty array distinct from absent", () => {
      // An explicit `[]` still means "clear them" — that is how the form
      // removes the last group, so it must survive as an empty array.
      const r = productSchema.safeParse({ ...base, options: [] });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.options).toEqual([]);
    });

    it("still parses a populated list", () => {
      const r = productSchema.safeParse({
        ...base,
        options: [{ name: "Cuisson", choices: [{ name: "Saignant" }] }],
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.options).toHaveLength(1);
        expect(r.data.options![0].choices[0].name).toBe("Saignant");
      }
    });

    it("rejects a malformed option group rather than dropping it", () => {
      // The product side validates the whole body up front, so a nameless
      // group fails the parse and the route 400s before any delete. The
      // category side needed a new module for this; here it was already
      // structurally right and only the default was wrong.
      const r = productSchema.safeParse({
        ...base,
        options: [{ name: "", choices: [{ name: "x" }] }],
      });
      expect(r.success).toBe(false);
    });
  });
});

describe("customerSchema", () => {
  it("accepts a valid customer", () => {
    const r = customerSchema.safeParse({ name: "Jean Dupont" });
    expect(r.success).toBe(true);
  });

  it("accepts a customer with phone + email", () => {
    const r = customerSchema.safeParse({
      name: "Jean",
      phone: "06 12 34 56 78",
      email: "jean@test.fr",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const r = customerSchema.safeParse({
      name: "Jean",
      email: "not-an-email",
    });
    expect(r.success).toBe(false);
  });

  it("accepts an empty email string", () => {
    const r = customerSchema.safeParse({ name: "Jean", email: "" });
    expect(r.success).toBe(true);
  });
});

describe("userSchema", () => {
  it("accepts a valid user", () => {
    const r = userSchema.safeParse({
      username: "admin",
      name: "Admin",
      role: "SUPER_ADMIN",
      pin: "123456",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a PIN with non-digits", () => {
    const r = userSchema.safeParse({
      username: "admin",
      name: "Admin",
      pin: "12345a",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid username (special chars)", () => {
    const r = userSchema.safeParse({
      username: "admin!",
      name: "Admin",
      pin: "123456",
    });
    expect(r.success).toBe(false);
  });
});
