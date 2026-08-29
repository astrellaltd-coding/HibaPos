import { describe, it, expect } from "vitest";
import {
  loginSchema,
  checkoutSchema,
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

describe("checkoutSchema", () => {
  const validBase = {
    orderType: "DINE_IN" as const,
    items: [
      {
        productId: "p1",
        productName: "Test",
        unitPrice: 10,
        quantity: 1,
        lineTotal: 10,
        options: [],
        addOns: [],
      },
    ],
    payments: [{ method: "CASH" as const, amount: 10 }],
  };

  it("accepts a valid DINE_IN order", () => {
    const r = checkoutSchema.safeParse(validBase);
    expect(r.success).toBe(true);
  });

  it("accepts TAKEAWAY without customerId", () => {
    const r = checkoutSchema.safeParse({ ...validBase, orderType: "TAKEAWAY" });
    expect(r.success).toBe(true);
  });

  it("rejects LIVRAISON without customerId (superRefine)", () => {
    const r = checkoutSchema.safeParse({ ...validBase, orderType: "LIVRAISON" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.includes("customerId"));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain("livraison");
    }
  });

  it("accepts LIVRAISON with customerId", () => {
    const r = checkoutSchema.safeParse({
      ...validBase,
      orderType: "LIVRAISON",
      customerId: "cust-1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty order (no items)", () => {
    const r = checkoutSchema.safeParse({ ...validBase, items: [] });
    expect(r.success).toBe(false);
  });

  it("rejects an order with no payments", () => {
    const r = checkoutSchema.safeParse({ ...validBase, payments: [] });
    expect(r.success).toBe(false);
  });
});

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
    const r = refundSchema.safeParse({ amount: 5.5, reason: "Client insatisfait" });
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
      price: 9.9,
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
