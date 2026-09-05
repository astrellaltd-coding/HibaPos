// Shared API response types (mirror of Prisma models, JSON-serializable).
// DD-07 / Batch 4.4b: one operational role. MANAGER runs the till; SUPER_ADMIN
// is the developer's account. Mirrors `UserRole` in prisma/schema.prisma.
export type Role = "SUPER_ADMIN" | "MANAGER";

export type UserDto = {
  id: string;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
};

export type CategoryOptionGroupDto = {
  id: string;
  name: string;
  required: boolean;
  multiple: boolean;
  sortOrder: number;
  choices: {
    id: string;
    name: string;
    priceModifier: number;
    pickupPriceModifier?: number | null;
    deliveryPriceModifier?: number | null;
    image?: string | null;
    sortOrder: number;
  }[];
};

export type CategoryAddOnDto = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  sortOrder: number;
  active: boolean;
};

export type CategoryDto = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  sortOrder: number;
  active: boolean;
  parentId: string | null;
  parentName?: string | null;
  /** VAT for products in this category that inherit. null = not set here. */
  vatRate: number | null;
  children?: { id: string; name: string }[];
  productCount?: number;
  optionGroups?: CategoryOptionGroupDto[];
  addOns?: CategoryAddOnDto[];
};

export type OptionGroupDto = {
  id: string;
  name: string;
  required: boolean;
  multiple: boolean;
  sortOrder: number;
  choices: {
    id: string;
    name: string;
    priceModifier: number;
    pickupPriceModifier?: number | null;
    deliveryPriceModifier?: number | null;
    pickupPrice?: number | null;
    deliveryPrice?: number | null;
    image?: string | null;
    sortOrder: number;
  }[];
};

export type ProductDto = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  pickupPrice: number | null;
  deliveryPrice: number | null;
  vatRate: number;
  categoryId: string;
  image: string | null;
  active: boolean;
  available: boolean;
  inheritCategoryGlobals: boolean;
  /** The product's own stored rate (an override when inheritCategoryVat is false). */
  inheritCategoryVat: boolean;
  /** What a sale would actually be taxed at — own rate, or the category chain. */
  effectiveVatRate: number;
  sortOrder: number;
  options: OptionGroupDto[];
  addOns: AddOnDto[];
  category?: { id: string; name: string; color: string };
};

export type AddOnDto = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  active: boolean;
  sortOrder: number;
};

export type CustomerDto = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  orderCount?: number;
};

export type OrderItemDto = {
  id: string;
  productId: string | null;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  // Snapshot of the VAT rate at the time of sale (Batch 3.1c). The column has
  // always existed and checkout has always written it; the DTO simply never
  // declared it, so no client-side consumer could read it. M-06 is the first.
  vatRate: number | null;
  optionsJson: string | null;
  addOnsJson: string | null;
  notes: string | null;
};

/** DD-14 (Batch 5.7b): `OFFERT` is the give-away tender. Not a refund
 *  channel — `RefundDto.method` below still names only the three paid ones. */
export type PaymentMethod = "CASH" | "CARD" | "VOUCHER" | "OFFERT";

export type PaymentDto = {
  id: string;
  method: "CASH" | "CARD" | "VOUCHER";
  amount: number; // applied to bill
  tendered: number | null; // cash handed over
  change: number | null; // change returned
  createdAt: string;
};

export type OrderDto = {
  id: string;
  number: number;
  shiftId: string;
  cashierId: string;
  customerId: string | null;
  /** DD-13 (Batch 5.6): mirrors `enum OrderStatus`, which holds exactly these
   *  two. `PENDING` and `CANCELLED` were removed — there is no pre-payment
   *  order state. Unrelated to `Receipt.printStatus`, a plain String whose
   *  own default is the string "PENDING". */
  status: "COMPLETED" | "REFUNDED";
  orderType: "DINE_IN" | "TAKEAWAY" | "LIVRAISON";
  tableLabel: string | null;
  subtotal: number;
  vatTotal: number;
  discountTotal: number;
  total: number;
  notes: string | null;
  itemCount: number;
  fiscalEventId: string | null;
  createdAt: string;
  completedAt: string | null;
  refundedAt: string | null;
  items: OrderItemDto[];
  payments: PaymentDto[];
  cashier?: { name: string; username: string };
  customer?: { name: string } | null;
  shift?: { number: number };
};

export type ShiftDto = {
  id: string;
  number: number;
  status: "OPEN" | "CLOSED";
  openedById: string;
  openedAt: string;
  closedById: string | null;
  closedAt: string | null;
  openingFloat: number;
  closingFloat: number | null;
  expectedCash: number | null;
  cashVariance: number | null;
  salesTotal: number | null;
  salesCount: number | null;
  notes: string | null;
  openedBy?: { name: string; username: string };
  closedBy?: { name: string; username: string } | null;
};

export type AuditLogDto = {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
  user?: { name: string; username: string } | null;
};

export type DashboardDto = {
  todaySales: number;
  todayOrders: number;
  todayItems: number;
  avgTicket: number;
  cashSales: number;
  cardSales: number;
  currentShift: ShiftDto | null;
  hourly: { hour: number; sales: number; orders: number }[];
  topProducts: { name: string; quantity: number; total: number }[];
  topCategories: { name: string; color: string; revenue: number; quantity: number }[];
  paymentBreakdown: { method: string; amount: number; count: number }[];
  recentOrders: OrderDto[];
  comparison?: {
    lastWeekDaySales: number;
    lastWeekDayCount: number;
    todayVsLastWeekDayPct: number | null;
    thisWeekSales: number;
    lastWeekSales: number;
    thisWeekOrdersCount: number;
    lastWeekOrdersCount: number;
    weekVsLastWeekPct: number | null;
  };
};

export type XReportDto = {
  shift: ShiftDto;
  salesTotal: number;
  salesCount: number;
  vatTotal: number;
  cashTotal: number;
  cardTotal: number;
  voucherTotal: number;
  discountsTotal: number;
  // M-05 (Batch 5.5): entrée / sortie de caisse, both as positive figures.
  cashInTotal: number;
  cashOutTotal: number;
  cashMovementsCount: number;
  cashByCategory: Record<string, number>;
  openingFloat: number;
  expectedCash: number;
  vatBreakdown: Record<string, { ht: number; vat: number; ttc: number }>;
  topProducts: { name: string; quantity: number; total: number }[];
  // DD-20 / L-50 (Batch 7.4a) — what was GIVEN AWAY, beside what was sold.
  // A give-away is a 100 % discount settled with the OFFERT tender; it is
  // never inside `topProducts` or the sales counts, by the operator's choice.
  givenAwayCount: number;
  givenAwayItemsCount: number;
  givenAwayProducts: { name: string; quantity: number }[];
  generatedAt: string;
};

/** M-05 / DD-12 (Batch 5.5) — one entrée / sortie de caisse. */
export type CashMovementDto = {
  id: string;
  shiftId: string;
  category: "APPROVISIONNEMENT" | "PRELEVEMENT" | "DEPENSE" | "ERREUR_DE_CAISSE";
  /** SIGNED cents: positive into the drawer, negative out of it. */
  amount: number;
  reason: string;
  cashierId: string;
  approvedById: string | null;
  createdAt: string;
  cashier?: { name: string } | null;
};

export type ZReportDto = {
  id: string;
  number: number;
  shift: ShiftDto;
  generatedAt: string;
  salesTotal: number;
  salesCount: number;
  vatTotal: number;
  cashTotal: number;
  cardTotal: number;
  voucherTotal: number;
  discountsTotal: number;
  refundsTotal: number; // M-07 (Batch 3.6) — cents given back in the period
  refundsCount: number;
  openingFloat: number;
  expectedCash: number;
  closingFloat: number;
  cashVariance: number;
  vatBreakdown: Record<string, { ht: number; vat: number; ttc: number }>;
  topProducts: { name: string; quantity: number; total: number }[];
  // DD-20 / L-50 (Batch 7.4a) — what was GIVEN AWAY, beside what was sold.
  // A give-away is a 100 % discount settled with the OFFERT tender; it is
  // never inside `topProducts` or the sales counts, by the operator's choice.
  givenAwayCount: number;
  givenAwayItemsCount: number;
  givenAwayProducts: { name: string; quantity: number }[];
  fiscalEventId: string | null;
};

export type SettingsDto = {
  restaurantName: string;
  restaurantAddress: string | null;
  restaurantPhone: string | null;
  restaurantSiret: string | null;
  restaurantTva: string | null;
  footerNote: string | null;
  defaultVatRate: number;
  currency: string;
  printerName: string | null;
  printerHost: string | null;
  printerPort: number;
  printerEnabled: boolean;
  openDrawerOnCash: boolean;
  receiptWidth: number; // COLUMNS (48 on 80 mm paper, 32 on 58 mm) — see L-13
  discountApprovalThreshold: number; // percent (e.g. 20 = 20%)
  autoPrint: boolean;
  factice: boolean; // FACTICE / SIMULATION mode — stamps receipts + fiscal events
};

export type BackupDto = {
  id: string;
  filename: string;
  size: number;
  checksum: string | null; // SHA-256 of plaintext (integrity verification)
  encrypted: boolean; // AES-256-GCM at-rest encryption flag
  sizeBytes: number | null; // size after encryption
  imagesPath: string | null; // path to included uploads archive (if any)
  createdAt: string;
  createdBy?: { name: string } | null;
};

export type TableStatus = "FREE" | "OCCUPIED" | "RESERVED";

export type TableDto = {
  id: string;
  label: string;
  seats: number;
  status: TableStatus;
  zone: string | null;
  sortOrder: number;
  active: boolean;
  notes: string | null;
  currentOrderId: string | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Fiscal journal (JFP) — ISCA compliance (art. 286-I-3° bis CGI)
// ---------------------------------------------------------------------------

export type FiscalEventType =
  | "VENTE"
  | "ANNULATION"
  | "REMBOURSEMENT"
  // M-05 (Batch 5.5). This union is a SECOND copy of the one in
  // `src/lib/fiscal.ts`, and 5.5 first updated only the server's — caught in
  // the de-stale pass, not by the compiler, because nothing consumes
  // `FiscalEventDto` today (`fiscal-view.tsx` declares its own row with
  // `type: string`). Zero impact now, and a wrong answer for the next person
  // to type against it. Recorded as dead code under L-07 in Batch 7.2.
  | "MOUVEMENT_CAISSE"
  | "CLOTURE_Z"
  | "CLOTURE_M"
  | "CLOTURE_A"
  | "OUVERTURE_TIROIR"
  | "REIMPRESSION"
  | "RESTAURATION"
  | "SUPPRESSION_SAUVEGARDE"
  | "SESSION_OPEN"
  | "SESSION_CLOSE"
  | "SESSION_LOCK"
  | "ARCHIVE_GENEREE";

export type FiscalEventDto = {
  id: string;
  sequence: number;
  type: FiscalEventType;
  orderId: string | null;
  refundId: string | null;
  zReportId: string | null;
  shiftId: string | null;
  closeId: string | null;
  archiveId: string | null;
  userId: string | null;
  factice: boolean;
  timestamp: string;
  dataJson: string;
  previousHash: string | null;
  hash: string;
};

export type GrandTotalDto = {
  totalSales: number;
  totalOrders: number;
  totalVat: number;
  totalCash: number;
  totalCard: number;
  totalVoucher: number;
  totalRefunded: number;
  lastUpdatedAt: string | null;
};

export type MonthlyCloseDto = {
  id: string;
  period: string;
  year: number;
  month: number;
  salesTotal: number;
  salesCount: number;
  vatTotal: number;
  cashTotal: number;
  cardTotal: number;
  voucherTotal: number;
  discountsTotal: number;
  sealedAt: string;
  sealedById: string;
  previousHash: string | null;
  hash: string;
  fiscalEventId: string | null;
};

export type AnnualCloseDto = {
  id: string;
  period: string;
  year: number;
  salesTotal: number;
  salesCount: number;
  vatTotal: number;
  cashTotal: number;
  cardTotal: number;
  voucherTotal: number;
  discountsTotal: number;
  sealedAt: string;
  sealedById: string;
  previousHash: string | null;
  hash: string;
  fiscalEventId: string | null;
};

export type FiscalArchiveDto = {
  id: string;
  year: number;
  filename: string;
  checksum: string;
  sizeBytes: number;
  generatedAt: string;
  generatedById: string;
  fiscalEventId: string | null;
};

export type FiscalChainStatus = {
  ok: boolean;
  eventsChecked: number;
  firstBreakAt: number | null;
  lastSequence: number;
};
