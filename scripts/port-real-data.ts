// Data recovery: port the user's REAL data from the old DB (float euros, old
// schema) into the current schema (integer cents + fiscal journal tables).
//
// Usage: bun scripts/port-real-data.ts
//
// The old DB is at db/real-data-backup/real-data.db (secured copy of the
// z.ai original). The current DB at db/custom.db is wiped and re-populated.
//
// Money conversion: every Float euro value → Math.round(x * 100) integer cents.
// Embedded JSON money fields (optionsJson, addOnsJson, vatBreakdownJson,
// topProductsJson) are parsed, converted, and re-serialized.

import { Database } from "bun:sqlite";

const OLD_DB = "db/real-data-backup/real-data.db";
const NEW_DB = "db/custom.db";

const toC = (v: number | null | undefined): number | null =>
  v == null ? null : Math.round(v * 100);
const toC0 = (v: number | null | undefined): number =>
  v == null ? 0 : Math.round(v * 100);

// Convert embedded JSON money fields (euros → cents).
function convertOptionsJson(json: string | null): string | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return json;
    const converted = arr.map((o: Record<string, unknown>) => ({
      ...o,
      ...(o.priceModifier != null ? { priceModifier: toC0(o.priceModifier as number) } : {}),
    }));
    return JSON.stringify(converted);
  } catch { return json; }
}
function convertAddOnsJson(json: string | null): string | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return json;
    const converted = arr.map((a: Record<string, unknown>) => ({
      ...a,
      ...(a.price != null ? { price: toC0(a.price as number) } : {}),
    }));
    return JSON.stringify(converted);
  } catch { return json; }
}
function convertVatBreakdownJson(json: string | null): string | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    const converted: Record<string, { ht: number; vat: number; ttc: number }> = {};
    for (const [rate, v] of Object.entries(obj)) {
      const r = v as { ht: number; vat: number; ttc: number };
      converted[rate] = { ht: toC0(r.ht), vat: toC0(r.vat), ttc: toC0(r.ttc) };
    }
    return JSON.stringify(converted);
  } catch { return json; }
}
function convertTopProductsJson(json: string | null): string | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return json;
    const converted = arr.map((p: Record<string, unknown>) => ({
      ...p,
      ...(p.total != null ? { total: toC0(p.total as number) } : {}),
    }));
    return JSON.stringify(converted);
  } catch { return json; }
}

const old = new Database(OLD_DB, { readonly: true });
const nu = new Database(NEW_DB);

// --- Wipe the new DB (demo data) ---
console.log("Wiping current (demo) DB...");
const tableNames = nu.query("SELECT name FROM sqlite_master WHERE type='table'").all()
  .map((t) => (t as { name: string }).name)
  .filter((n) => !n.startsWith("sqlite_") && !n.startsWith("_prisma"));
nu.run("PRAGMA foreign_keys = OFF");
for (const t of tableNames) nu.run(`DELETE FROM "${t}"`);
nu.run("PRAGMA foreign_keys = ON");

let ported = 0;
function port(table: string, transform: (row: Record<string, unknown>) => Record<string, unknown>, selectSql?: string) {
  const rows = old.query(selectSql ?? `SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
  if (rows.length === 0) { console.log(`  ${table}: 0 rows (skip)`); return; }
  for (const row of rows) {
    const data = transform(row);
    const keys = Object.keys(data);
    const placeholders = keys.map(() => "?").join(", ");
    nu.run(
      `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${placeholders})`,
      ...keys.map((k) => data[k]),
    );
    ported++;
  }
  console.log(`  ${table}: ${rows.length} rows ✓`);
}

console.log("Porting real data (euros → cents)...");

// 1. User
port("User", (r) => ({
  id: r.id, username: r.username, pinHash: r.pinHash, name: r.name,
  role: r.role, active: r.active ? 1 : 0,
  failedAttempts: r.failedAttempts ?? 0, lockedUntil: r.lockedUntil, lastLoginAt: r.lastLoginAt,
  createdAt: r.createdAt, updatedAt: r.updatedAt,
}));

// 2. Category
port("Category", (r) => ({
  id: r.id, name: r.name, color: r.color, icon: r.icon,
  sortOrder: r.sortOrder ?? 0, active: r.active ? 1 : 0,
  createdAt: r.createdAt, updatedAt: r.updatedAt, parentId: r.parentId ?? null,
}));

// 3. Product (price conversion)
port("Product", (r) => ({
  id: r.id, name: r.name, description: r.description,
  price: toC0(r.price as number),
  pickupPrice: toC(r.pickupPrice as number | null),
  deliveryPrice: toC(r.deliveryPrice as number | null),
  vatRate: r.vatRate, categoryId: r.categoryId, image: r.image,
  active: r.active ? 1 : 0, available: r.available != null ? (r.available ? 1 : 0) : 1,
  inheritCategoryGlobals: r.inheritCategoryGlobals != null ? (r.inheritCategoryGlobals ? 1 : 0) : 1,
  sortOrder: r.sortOrder ?? 0, createdAt: r.createdAt, updatedAt: r.updatedAt,
}));

// 4. OptionGroup + OptionChoice
port("OptionGroup", (r) => ({
  id: r.id, productId: r.productId, name: r.name,
  required: r.required ? 1 : 0, multiple: r.multiple ? 1 : 0, sortOrder: r.sortOrder ?? 0,
}));
port("OptionChoice", (r) => ({
  id: r.id, groupId: r.groupId, name: r.name,
  priceModifier: toC0(r.priceModifier as number),
  pickupPriceModifier: toC(r.pickupPriceModifier as number | null),
  deliveryPriceModifier: toC(r.deliveryPriceModifier as number | null),
  image: r.image, sortOrder: r.sortOrder ?? 0,
}));

// 5. CategoryOptionGroup + CategoryOptionChoice (global options)
port("CategoryOptionGroup", (r) => ({
  id: r.id, categoryId: r.categoryId, name: r.name,
  required: r.required ? 1 : 0, multiple: r.multiple ? 1 : 0, sortOrder: r.sortOrder ?? 0,
}));
port("CategoryOptionChoice", (r) => ({
  id: r.id, groupId: r.groupId, name: r.name,
  priceModifier: toC0(r.priceModifier as number),
  pickupPriceModifier: toC(r.pickupPriceModifier as number | null),
  deliveryPriceModifier: toC(r.deliveryPriceModifier as number | null),
  pickupPrice: toC(r.pickupPrice as number | null),
  deliveryPrice: toC(r.deliveryPrice as number | null),
  image: r.image, sortOrder: r.sortOrder ?? 0,
}));

// 6. CategoryAddOn (global add-ons)
port("CategoryAddOn", (r) => ({
  id: r.id, categoryId: r.categoryId, name: r.name,
  price: toC0(r.price as number), image: r.image,
  sortOrder: r.sortOrder ?? 0, active: r.active ? 1 : 0,
}));

// 7. AddOn + ProductAddon (junction)
port("AddOn", (r) => ({
  id: r.id, name: r.name, price: toC0(r.price as number), image: r.image,
  active: r.active ? 1 : 0, sortOrder: r.sortOrder ?? 0,
  createdAt: r.createdAt, updatedAt: r.updatedAt,
}));
port("ProductAddon", (r) => ({ productId: r.productId, addonId: r.addonId }));

// 8. Customer
port("Customer", (r) => ({
  id: r.id, name: r.name, phone: r.phone, email: r.email,
  address: r.address, postalCode: r.postalCode ?? null, notes: r.notes,
  active: r.active ? 1 : 0, createdAt: r.createdAt, updatedAt: r.updatedAt,
}));

// 9. Shift (floats → cents)
port("Shift", (r) => ({
  id: r.id, number: r.number, status: r.status,
  openedById: r.openedById, openedAt: r.openedAt,
  closedById: r.closedById, closedAt: r.closedAt,
  openingFloat: toC0(r.openingFloat as number),
  closingFloat: toC(r.closingFloat as number | null),
  expectedCash: toC(r.expectedCash as number | null),
  cashVariance: toC(r.cashVariance as number | null),
  salesTotal: toC(r.salesTotal as number | null),
  salesCount: r.salesCount, notes: r.notes,
}));

// 10. Order (totals → cents, fiscalEventId = null for pre-journal orders)
port("Order", (r) => ({
  id: r.id, number: r.number, shiftId: r.shiftId, cashierId: r.cashierId,
  customerId: r.customerId, status: r.status, orderType: r.orderType,
  tableLabel: r.tableLabel,
  subtotal: toC0(r.subtotal as number),
  vatTotal: toC0(r.vatTotal as number),
  discountTotal: toC0(r.discountTotal as number),
  total: toC0(r.total as number),
  notes: r.notes, itemCount: r.itemCount ?? 0,
  fiscalEventId: null, // pre-journal order — no fiscal event
  createdAt: r.createdAt, completedAt: r.completedAt, refundedAt: r.refundedAt,
}));

// 11. OrderItem (prices → cents + embedded JSON conversion)
port("OrderItem", (r) => ({
  id: r.id, orderId: r.orderId, productId: r.productId, productName: r.productName,
  unitPrice: toC0(r.unitPrice as number),
  quantity: r.quantity,
  lineTotal: toC0(r.lineTotal as number),
  vatRate: r.vatRate,
  optionsJson: convertOptionsJson(r.optionsJson as string | null),
  addOnsJson: convertAddOnsJson(r.addOnsJson as string | null),
  notes: r.notes,
}));

// 12. Payment
port("Payment", (r) => ({
  id: r.id, orderId: r.orderId, method: r.method,
  amount: toC0(r.amount as number),
  tendered: toC(r.tendered as number | null),
  change: toC(r.change as number | null),
  cashierId: r.cashierId, createdAt: r.createdAt,
}));

// 13. Refund
port("Refund", (r) => ({
  id: r.id, orderId: r.orderId,
  amount: toC0(r.amount as number),
  reason: r.reason, approvedById: r.approvedById, cashierId: r.cashierId,
  shiftId: r.shiftId, method: r.method, fiscalEventId: null, createdAt: r.createdAt,
}));

// 14. Receipt (content is a text snapshot — no conversion needed; same € format)
port("Receipt", (r) => ({
  id: r.id, orderId: r.orderId, receiptNumber: r.receiptNumber,
  content: r.content, printStatus: r.printStatus ?? "PENDING",
  printedAt: r.printedAt, reprintCount: r.reprintCount ?? 0, createdAt: r.createdAt,
}));

// 15. ZReport (all totals → cents + JSON conversion)
port("ZReport", (r) => ({
  id: r.id, shiftId: r.shiftId, number: r.number, generatedAt: r.generatedAt,
  salesTotal: toC0(r.salesTotal as number),
  salesCount: r.salesCount,
  vatTotal: toC0(r.vatTotal as number),
  cashTotal: toC0(r.cashTotal as number),
  cardTotal: toC0(r.cardTotal as number),
  voucherTotal: toC0(r.voucherTotal as number),
  discountsTotal: toC0(r.discountsTotal as number),
  openingFloat: toC0(r.openingFloat as number),
  expectedCash: toC0(r.expectedCash as number),
  closingFloat: toC0(r.closingFloat as number),
  cashVariance: toC0(r.cashVariance as number),
  topProductsJson: convertTopProductsJson(r.topProductsJson as string | null),
  vatBreakdownJson: convertVatBreakdownJson(r.vatBreakdownJson as string | null),
  fiscalEventId: null,
}));

// 16. FiscalCounter (preserve numbering + init the new sequence)
port("FiscalCounter", (r) => ({
  id: r.id,
  lastReceiptNumber: r.lastReceiptNumber ?? 0,
  lastShiftNumber: r.lastShiftNumber ?? 0,
  lastZReportNumber: r.lastZReportNumber ?? 0,
  lastFiscalEventSequence: 0,
}));

// 17. Setting (JSON values — no money conversion)
port("Setting", (r) => ({ key: r.key, value: r.value }));

// 18. AuditLog
port("AuditLog", (r) => ({
  id: r.id, userId: r.userId, action: r.action, entity: r.entity,
  entityId: r.entityId, details: r.details, createdAt: r.createdAt,
}));

// 19. Table
port("Table", (r) => ({
  id: r.id, label: r.label, seats: r.seats ?? 4, status: r.status ?? "FREE",
  zone: r.zone, sortOrder: r.sortOrder ?? 0, active: r.active ? 1 : 0,
  notes: r.notes, currentOrderId: r.currentOrderId,
  createdAt: r.createdAt, updatedAt: r.updatedAt,
}));

console.log("");
console.log(`DONE — ${ported} rows ported. Verify with the app (bun run dev).`);
console.log("The demo seed users (admin/manager) were replaced by the real users");
console.log("(use your REAL PIN — not 123456).");

old.close();
nu.close();
