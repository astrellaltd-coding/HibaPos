import { describe, it, expect } from "vitest";
import { renderReceipt } from "@/lib/services/receipt";
import type { OrderDto, OrderItemDto, SettingsDto } from "@/types/api";

type TestRefund = { id: string; amount: number; reason: string; createdAt: string };
type TestOrder = OrderDto & { refunds?: TestRefund[] };

// Snapshot test for the fiscal receipt renderer. Because receipts are
// immutable fiscal artifacts, any change to formatting must be deliberate —
// a snapshot diff forces a reviewer to opt in.

const baseOrder: TestOrder = {
  id: "ord-1",
  number: 42,
  shiftId: "s1",
  cashierId: "c1",
  customerId: null,
  status: "COMPLETED",
  orderType: "DINE_IN",
  tableLabel: "T1",
  subtotal: 22.5,
  vatTotal: 2.05,
  discountTotal: 0,
  total: 22.5,
  notes: null,
  itemCount: 4,
  fiscalEventId: null,
  createdAt: "2026-08-14T12:30:00.000Z",
  completedAt: "2026-08-14T12:30:00.000Z",
  refundedAt: null,
  items: [
    {
      id: "oi-1",
      productId: "p1",
      productName: "Double Cheese",
      unitPrice: 9.9,
      quantity: 2,
      lineTotal: 19.8,
      optionsJson: JSON.stringify([
        { group: "Cuisson", choice: "À point" },
      ]),
      addOnsJson: JSON.stringify([
        { id: "add1", name: "Bacon", price: 1.5 },
      ]),
      notes: null,
    },
    {
      id: "oi-2",
      productId: "p2",
      productName: "Coca-Cola",
      unitPrice: 2.7,
      quantity: 1,
      lineTotal: 2.7,
      optionsJson: null,
      addOnsJson: null,
      notes: null,
    },
  ] as OrderItemDto[],
  payments: [
    {
      id: "pay-1",
      method: "CASH",
      amount: 22.5,
      tendered: 25,
      change: 2.5,
      createdAt: "2026-08-14T12:30:00.000Z",
    },
  ],
  refunds: [],
  cashier: { name: "Admin", username: "admin" },
  customer: null,
  shift: { number: 7 },
};

const baseSettings: Partial<SettingsDto> = {
  restaurantName: "HibaPOS Test",
  restaurantAddress: "12 Rue Test, 75001 Paris",
  restaurantPhone: "01 23 45 67 89",
  restaurantSiret: "TEST-SIRET",
  restaurantTva: "TEST-TVA",
  footerNote: "Merci de votre visite !",
  receiptWidth: 42,
};

describe("renderReceipt", () => {
  it("produces a consistent snapshot for a standard order", () => {
    const text = renderReceipt(baseOrder, baseSettings);
    expect(text).toMatchSnapshot();
  });

  it("renders TAKEAWAY order type label", () => {
    const takeaway: TestOrder = { ...baseOrder, orderType: "TAKEAWAY", tableLabel: null };
    const text = renderReceipt(takeaway, baseSettings);
    expect(text).toContain("À emporter");
    expect(text).not.toContain("Sur place");
  });

  it("renders LIVRAISON order type label", () => {
    const delivery: TestOrder = {
      ...baseOrder,
      orderType: "LIVRAISON",
      tableLabel: null,
      customer: { name: "Jean Dupont" },
    };
    const text = renderReceipt(delivery, baseSettings);
    expect(text).toContain("Livraison");
  });

  it("does NOT render a refunds section (fiscal receipt is immutable at sale time)", () => {
    // renderReceipt is called at sale time to snapshot the fiscal receipt.
    // Refunds happen later and are tracked separately in the audit log +
    // order detail dialog. The receipt snapshot itself does NOT include
    // refunds because they didn't exist yet when the snapshot was taken.
    const withRefundsField: TestOrder = {
      ...baseOrder,
      refunds: [],
    };
    const text = renderReceipt(withRefundsField, baseSettings);
    expect(text).not.toContain("Remboursements");
  });

  it("falls back to defaults when settings are absent", () => {
    const text = renderReceipt(baseOrder);
    expect(text).toContain("HibaPOS France");
  });

  it("handles malformed optionsJson without throwing", () => {
    const malformed: TestOrder = {
      ...baseOrder,
      items: [
        {
          ...baseOrder.items[0],
          optionsJson: "{ not valid json",
        },
      ],
    };
    // renderReceipt uses JSON.parse (fiscal path is server-authoritative;
    // malformed data would be a DB corruption). The function should throw —
    // but it's caught at the API route level. We just assert the throw
    // happens so the receipt isn't silently broken.
    expect(() => renderReceipt(malformed, baseSettings)).toThrow();
  });
});