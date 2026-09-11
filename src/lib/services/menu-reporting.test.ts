import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import {
  aggregateOrders,
  AGGREGATE_INCLUDE,
  periodAggregateOptions,
} from "@/lib/services/aggregate";
import { computeShiftReport, generateZReport } from "@/lib/services/reports";
import { closeDay } from "@/lib/services/fiscal";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { hashPin } from "@/lib/auth";
import { saveSettings, getSettings } from "@/lib/services/settings";
import { businessDayOf } from "@/lib/period";
import { apportion, sum2 } from "@/lib/money";

// L-77 (R2.2) and L-78 (R2.3) — a menu composé is countable, and its VAT
// allocation is justifiable years later.
//
// ── WHAT WAS WRONG ───────────────────────────────────────────────────────────
// A menu is sold at ONE forfait and BOOKED as one line per component, because
// `OrderItem.vatRate` is the only place a rate lives and a menu holds two rates
// the moment it leaves the premises. `comboGroupId` / `comboName` / `comboPrice`
// tie those lines back together — and until this batch the RECEIPT RENDERER was
// their only reader. So « how many Menu Chill did I sell? » had no answer, and
// inside one report `itemsCount` counted a menu as one article while
// `topProducts` counted its three components.
//
// And `OrderItem` recorded the RESULT of the forfait's division but not the
// standalone catalogue prices it was divided in proportion to. Those figures
// are the division's justification; without them a catalogue price change makes
// an old sale's split unreconstructable, and French doctrine requires an
// allocation to be justifiable on request.
//
// ── WHY THESE TESTS ARE SHAPED LIKE THIS ─────────────────────────────────────
// `combo-allocation.test.ts` already proves `allocateCombo` divides correctly.
// It would go on passing if nothing stored the result — which is the defect
// this project shipped in Batch 5.8 and again in Batch 3.12, both times caught
// only by reverting the WIRING rather than the logic. So every claim below is
// asserted from the database after a real `POST /api/orders`, or from a sealed
// document, and never from the pure function on its own.

const PIN = "774411";
let ids: {
  menuChill: string;
  menuChillBis: string;
  pizzaSlot: string;
  drinkSlot: string;
  bisPizzaSlot: string;
  bisDrinkSlot: string;
  regina: string;
  margarita: string;
  coca: string;
  emptyMenu: string;
  user: string;
  shift: string;
};

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.dailyClose.deleteMany();
  await db.zReport.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.comboSlotOptionRule.deleteMany();
  await db.comboSlotChoice.deleteMany();
  await db.comboSlot.deleteMany();
  await db.product.deleteMany();
  await db.categoryOptionChoice.deleteMany();
  await db.categoryOptionGroup.deleteMany();
  await db.categoryAddOn.deleteMany();
  await db.category.deleteMany();
  await db.fiscalCounter.deleteMany();
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  await ensureFiscalCounter();
  await saveSettings({ factice: false });

  const u = await db.user.create({
    data: {
      username: `r22-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin(PIN),
    },
  });

  const pizzas = await db.category.create({ data: { name: "Pizzas", color: "#f00", sortOrder: 1 } });
  const menuCat = await db.category.create({
    data: { name: "Menu", color: "#f00", sortOrder: 2, parentId: pizzas.id },
  });
  const boissons = await db.category.create({ data: { name: "Boissons", color: "#00f", sortOrder: 3 } });
  // The real shape (L-68): a sealed drink is 10 % sur place, 5,5 % à emporter.
  // It is what makes the forfait have to be divided at all.
  const bouteilles = await db.category.create({
    data: {
      name: "Bouteilles",
      color: "#00f",
      sortOrder: 4,
      parentId: boissons.id,
      vatRate: 10,
      vatRateTakeaway: 5.5,
    },
  });

  const product = (name: string, categoryId: string, price: number, over = {}) =>
    db.product.create({
      data: {
        name,
        categoryId,
        price,
        pickupPrice: price,
        deliveryPrice: price,
        vatRate: 10,
        inheritCategoryVat: true,
        active: true,
        available: true,
        ...over,
      },
    });

  const regina = await product("Regina", pizzas.id, 890);
  const margarita = await product("Margarita", pizzas.id, 890);
  const coca = await product("Coca", bouteilles.id, 350);

  const makeMenu = async (name: string, price: number) => {
    const m = await db.product.create({
      data: {
        name,
        categoryId: menuCat.id,
        price,
        pickupPrice: price,
        deliveryPrice: price,
        vatRate: 10,
        inheritCategoryVat: false,
        isCombo: true,
        active: true,
        available: true,
      },
    });
    const pizzaSlot = await db.comboSlot.create({
      data: { productId: m.id, name: "Pizza", quantity: 1, sortOrder: 0, sourceCategoryId: pizzas.id },
    });
    const drinkSlot = await db.comboSlot.create({
      data: { productId: m.id, name: "Boisson", quantity: 1, sortOrder: 1, sourceCategoryId: bouteilles.id },
    });
    return { id: m.id, pizzaSlot: pizzaSlot.id, drinkSlot: drinkSlot.id };
  };

  // TWO menus sharing ONE name, at different prices — L-76's collision, one
  // level up. This is exactly why `comboProductId` exists and why counting
  // menus by `comboName` would have reproduced that bug.
  const chill = await makeMenu("Menu Chill", 1200);
  const chillBis = await makeMenu("Menu Chill", 1500);

  // A menu with no slots at all: `allocateCombo` cannot divide a forfait
  // between no components, so this one takes the policy's § 4 fallback and
  // books ONE line.
  const empty = await db.product.create({
    data: {
      name: "Menu Vide",
      categoryId: menuCat.id,
      price: 1000,
      pickupPrice: 1000,
      deliveryPrice: 1000,
      vatRate: 10,
      inheritCategoryVat: false,
      isCombo: true,
      active: true,
      available: true,
    },
  });

  const s = await db.shift.create({
    data: { number: 1, openedById: u.id, openedAt: new Date(), openingFloat: 0, status: "OPEN" },
  });

  await signInAs({ id: u.id, username: u.username, role: "MANAGER" });

  ids = {
    menuChill: chill.id,
    menuChillBis: chillBis.id,
    pizzaSlot: chill.pizzaSlot,
    drinkSlot: chill.drinkSlot,
    bisPizzaSlot: chillBis.pizzaSlot,
    bisDrinkSlot: chillBis.drinkSlot,
    regina: regina.id,
    margarita: margarita.id,
    coca: coca.id,
    emptyMenu: empty.id,
    user: u.id,
    shift: s.id,
  };
});

afterAll(wipe);

/** A menu, through the route the till actually calls. */
async function sellMenu(opts: {
  menuId: string;
  pizzaSlot: string;
  drinkSlot: string;
  pizzaId?: string;
  quantity?: number;
  price: number;
  orderType?: "DINE_IN" | "TAKEAWAY";
}) {
  const quantity = opts.quantity ?? 1;
  const mod = await import("@/app/api/orders/route");
  const res = await callJson<{ error?: string }>(mod.POST, {
    method: "POST",
    url: "http://localhost/api/orders",
    body: {
      orderType: opts.orderType ?? "TAKEAWAY",
      items: [
        {
          productId: opts.menuId,
          quantity,
          optionIds: [],
          addons: [],
          components: [
            { slotId: opts.pizzaSlot, productId: opts.pizzaId ?? ids.regina, optionIds: [], addons: [] },
            { slotId: opts.drinkSlot, productId: ids.coca, optionIds: [], addons: [] },
          ],
        },
      ],
      payments: [{ method: "CASH", amount: opts.price * quantity }],
    },
  });
  expect(res.status, res.body.error).toBe(201);
  return res;
}

/** An ordinary, non-menu sale. */
async function sellPlain(productId: string, price: number) {
  const mod = await import("@/app/api/orders/route");
  const res = await callJson<{ error?: string }>(mod.POST, {
    method: "POST",
    url: "http://localhost/api/orders",
    body: {
      orderType: "TAKEAWAY",
      items: [{ productId, quantity: 1, optionIds: [], addons: [] }],
      payments: [{ method: "CASH", amount: price }],
    },
  });
  expect(res.status, res.body.error).toBe(201);
}

const orders = () => db.order.findMany({ where: { shiftId: ids.shift }, include: AGGREGATE_INCLUDE });

// ---------------------------------------------------------------- R2.2 ------

describe("L-77 — what the client sends: the menu's identity reaches the row", () => {
  it("stamps comboProductId on EVERY line of the group, not just the first", async () => {
    // The claim that makes the rest of this batch anything other than a no-op.
    // `comboName` was already stored; a name is not an identity, and a report
    // that counted by it would reproduce L-76 exactly.
    await sellMenu({ menuId: ids.menuChill, pizzaSlot: ids.pizzaSlot, drinkSlot: ids.drinkSlot, price: 1200 });

    const lines = await db.orderItem.findMany({ orderBy: { lineTotal: "desc" } });
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.comboProductId === ids.menuChill)).toBe(true);
    expect(lines.every((l) => l.comboName === "Menu Chill")).toBe(true);
    // One group id, shared — this is what says "these two lines are one menu".
    expect(new Set(lines.map((l) => l.comboGroupId)).size).toBe(1);
    expect(lines[0].comboGroupId).toBeTruthy();
  });

  it("leaves comboProductId null on an ordinary sale", async () => {
    await sellPlain(ids.regina, 890);
    const [line] = await db.orderItem.findMany();
    expect(line.comboProductId).toBeNull();
    expect(line.comboGroupId).toBeNull();
  });
});

describe("L-77 — what is counted: menus, once each", () => {
  it("counts one menu per comboGroupId, not one per component line", async () => {
    await sellMenu({ menuId: ids.menuChill, pizzaSlot: ids.pizzaSlot, drinkSlot: ids.drinkSlot, price: 1200 });
    await sellMenu({ menuId: ids.menuChill, pizzaSlot: ids.pizzaSlot, drinkSlot: ids.drinkSlot, price: 1200 });

    const agg = aggregateOrders(await orders());
    expect(agg.topMenus).toHaveLength(1);
    expect(agg.topMenus[0]).toMatchObject({
      comboProductId: ids.menuChill,
      name: "Menu Chill",
      quantity: 2, // TWO menus — not the four component lines they booked
      total: 2400,
    });
  });

  it("counts a quantity-2 cart line as two menus, not as two per component", async () => {
    // The trap this guards: every line of a 2× menu carries `quantity: 2`, so
    // summing the group's line quantities would report FOUR menus for a
    // two-component menu bought twice.
    await sellMenu({
      menuId: ids.menuChill,
      pizzaSlot: ids.pizzaSlot,
      drinkSlot: ids.drinkSlot,
      quantity: 2,
      price: 1200,
    });

    const agg = aggregateOrders(await orders());
    expect(agg.topMenus).toHaveLength(1);
    expect(agg.topMenus[0].quantity).toBe(2);
    expect(agg.topMenus[0].total).toBe(2400);
  });

  it("counts TWO of the same menu on ONE ticket as two", async () => {
    // The case that separates « group by comboGroupId » from « group by the
    // menu product », and the only one that does: on two separate orders the
    // two groupings agree, so a test that sells one menu per order proves
    // nothing about which was chosen. Grouping by the product would merge these
    // two into one group and report ONE Menu Chill, because the count is taken
    // from the group's first line.
    //
    // Added after the revert of exactly this line survived the first version of
    // this file — the plan's rule that a revert everything survives is a
    // question, not a verdict.
    const mod = await import("@/app/api/orders/route");
    const menuItem = () => ({
      productId: ids.menuChill,
      quantity: 1,
      optionIds: [],
      addons: [],
      components: [
        { slotId: ids.pizzaSlot, productId: ids.regina, optionIds: [], addons: [] },
        { slotId: ids.drinkSlot, productId: ids.coca, optionIds: [], addons: [] },
      ],
    });
    const res = await callJson<{ error?: string }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/orders",
      body: {
        orderType: "TAKEAWAY",
        items: [menuItem(), menuItem()],
        payments: [{ method: "CASH", amount: 2400 }],
      },
    });
    expect(res.status, res.body.error).toBe(201);

    // Four lines, TWO group ids — `orders/route.ts` mints a fresh one per item.
    const lines = await db.orderItem.findMany();
    expect(lines).toHaveLength(4);
    expect(new Set(lines.map((l) => l.comboGroupId)).size).toBe(2);

    const agg = aggregateOrders(await orders());
    expect(agg.topMenus).toHaveLength(1);
    expect(agg.topMenus[0]).toMatchObject({ comboProductId: ids.menuChill, quantity: 2, total: 2400 });
  });

  it("does not merge two menus that share a name", async () => {
    // L-76 one level up, and the whole reason `comboProductId` was added rather
    // than counting by `comboName`.
    await sellMenu({ menuId: ids.menuChill, pizzaSlot: ids.pizzaSlot, drinkSlot: ids.drinkSlot, price: 1200 });
    await sellMenu({
      menuId: ids.menuChillBis,
      pizzaSlot: ids.bisPizzaSlot,
      drinkSlot: ids.bisDrinkSlot,
      price: 1500,
    });

    const agg = aggregateOrders(await orders());
    expect(agg.topMenus).toHaveLength(2);
    expect(agg.topMenus.map((m) => m.name)).toEqual(["Menu Chill", "Menu Chill"]);
    const byId = new Map(agg.topMenus.map((m) => [m.comboProductId, m]));
    expect(byId.get(ids.menuChill)).toMatchObject({ quantity: 1, total: 1200 });
    expect(byId.get(ids.menuChillBis)).toMatchObject({ quantity: 1, total: 1500 });
  });

  it("counts a menu that took the § 4 fallback as one menu", async () => {
    // A menu with no components cannot have its forfait divided, so it books a
    // SINGLE line. `comboGroupId` is set on that line too, deliberately, which
    // is what keeps it countable as the menu it was rather than disappearing
    // into `topProducts` as an ordinary product.
    const mod = await import("@/app/api/orders/route");
    const res = await callJson<{ error?: string }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/orders",
      body: {
        orderType: "TAKEAWAY",
        items: [{ productId: ids.emptyMenu, quantity: 1, optionIds: [], addons: [], components: [] }],
        payments: [{ method: "CASH", amount: 1000 }],
      },
    });
    expect(res.status, res.body.error).toBe(201);

    const lines = await db.orderItem.findMany();
    expect(lines).toHaveLength(1);
    expect(lines[0].comboProductId).toBe(ids.emptyMenu);

    const agg = aggregateOrders(await orders());
    expect(agg.topMenus).toEqual([
      { comboProductId: ids.emptyMenu, name: "Menu Vide", quantity: 1, total: 1000 },
    ]);
  });

  it("is empty when nothing sold was a menu", async () => {
    await sellPlain(ids.regina, 890);
    const agg = aggregateOrders(await orders());
    expect(agg.topMenus).toEqual([]);
    expect(agg.topProducts).toHaveLength(1);
  });
});

describe("L-77 — a menu refunded by a LATER period", () => {
  it("moves the menu's revenue and leaves its count alone", async () => {
    // `aggregateOrders` counts menus in TWO branches, and they must agree: the
    // sale branch, and the correction branch that runs for an order whose sale
    // belongs to an earlier period (DD-10's cross-period refund). Refunding a
    // Menu Chill does not un-sell it, so the money moves and the count does
    // not — the same rule `topProducts` follows.
    //
    // Built rather than driven: the shape needed is two periods and
    // `POST /api/orders` can only write into now. The identity and the group id
    // on these lines are the ones the route was proved to write, above.
    const day1 = new Date(2026, 3, 10, 12, 0);
    const day2 = new Date(2026, 3, 20, 12, 0);
    const groupId = "grp-cross-period";
    const order = await db.order.create({
      data: {
        number: 7001,
        shiftId: ids.shift,
        cashierId: ids.user,
        status: "COMPLETED",
        subtotal: 1200,
        discountTotal: 0,
        total: 1200,
        vatTotal: 0,
        itemCount: 1,
        createdAt: day1,
        completedAt: day1,
        items: {
          create: [
            { productId: ids.regina, productName: "Regina", quantity: 1, lineTotal: 850, unitPrice: 850,
              vatRate: 10, comboGroupId: groupId, comboName: "Menu Chill", comboProductId: ids.menuChill,
              comboPrice: 1200, referencePrice: 890 },
            { productId: ids.coca, productName: "Coca", quantity: 1, lineTotal: 350, unitPrice: 350,
              vatRate: 5.5, comboGroupId: groupId, comboName: "Menu Chill", comboProductId: ids.menuChill,
              comboPrice: 1200, referencePrice: 350 },
          ],
        },
        payments: { create: [{ method: "CASH", amount: 1200, cashierId: ids.user }] },
      },
    });
    await db.refund.create({
      data: { orderId: order.id, amount: 300, method: "CASH", reason: "test",
        cashierId: ids.user, shiftId: ids.shift, createdAt: day2 },
    });

    const from = new Date(2026, 3, 15, 0, 0);
    const to = new Date(2026, 3, 25, 0, 0);
    const rows = await db.order.findMany({ where: { id: order.id }, include: AGGREGATE_INCLUDE });
    const agg = aggregateOrders(rows, periodAggregateOptions(from, to));

    expect(agg.topMenus).toHaveLength(1);
    expect(agg.topMenus[0]).toEqual({
      comboProductId: ids.menuChill,
      name: "Menu Chill",
      quantity: 0, // a refund does not un-sell the menu
      total: -300, // but the money it gave back is this period's
    });
    expect(agg.salesTotal).toBe(-300);
    // The menu list and the product list moved by the same money.
    expect(sum2(agg.topMenus.map((m) => m.total))).toBe(sum2(agg.topProducts.map((p) => p.total)));
  });
});

describe("L-77 — the three counts that used to disagree, and now do so on purpose", () => {
  it("keeps itemsCount at one article and topProducts at its components", async () => {
    // NEITHER of these changed, and that is the finding's resolution rather
    // than a gap in it. They answer different questions — what the customer
    // bought, and what left the kitchen — and `topMenus` is the third question,
    // which had no answer at all. Pinned here so a later batch that "fixes the
    // disagreement" by changing one of them has to do it deliberately.
    await sellMenu({ menuId: ids.menuChill, pizzaSlot: ids.pizzaSlot, drinkSlot: ids.drinkSlot, price: 1200 });

    const agg = aggregateOrders(await orders());
    expect(agg.itemsCount).toBe(1); // one article: the menu
    expect(agg.topProducts).toHaveLength(2); // two components: Regina, Coca
    expect(agg.topMenus).toHaveLength(1); // one menu
    // And the money is counted exactly once, whichever list you read.
    expect(sum2(agg.topProducts.map((p) => p.total))).toBe(agg.salesTotal);
    expect(sum2(agg.topMenus.map((m) => m.total))).toBe(agg.salesTotal);
  });
});

describe("L-77 — what is sealed, and what deliberately is not", () => {
  it("seals the menus into a daily close, beside the give-away figures", async () => {
    await sellMenu({ menuId: ids.menuChill, pizzaSlot: ids.pizzaSlot, drinkSlot: ids.drinkSlot, price: 1200 });
    await generateZReport(ids.shift, 0, ids.user);

    // The TRADING day, not the calendar day — DD-23/24. Between midnight and the
    // 05:00 cut-off they differ, and a sale rung at 01:00 belongs to the day
    // before. An earlier version of this test used the calendar day and passed
    // for eleven hours a day; it failed the moment the clock crossed midnight,
    // which is exactly when a real till is still open.
    const { businessDayCutoffHour } = await getSettings();
    const now = new Date();
    const day = businessDayOf(now, businessDayCutoffHour);
    // Closed from a moment after the trading day has ended, which is what
    // `assertPeriodEnded` requires.
    const close = await closeDay(day, ids.user, false, new Date(now.getTime() + 3 * 86_400_000));

    const sealed = JSON.parse(close.dataJson) as {
      topMenus: { comboProductId: string | null; name: string; quantity: number; total: number }[];
    };
    expect(sealed.topMenus).toEqual([
      { comboProductId: ids.menuChill, name: "Menu Chill", quantity: 1, total: 1200 },
    ]);
  });

  it("does NOT grow the per-shift CLOTURE_Z journal payload", async () => {
    // The operator's decision, 2026-09-10: a menu count carries no tax, so it
    // does not buy a fourth permanent growth of the fiscal chain's per-shift
    // entry. Pinned, because the natural next edit is to add it "for symmetry"
    // and a sealed payload cannot be un-grown.
    await sellMenu({ menuId: ids.menuChill, pizzaSlot: ids.pizzaSlot, drinkSlot: ids.drinkSlot, price: 1200 });
    await generateZReport(ids.shift, 0, ids.user);

    const ev = await db.fiscalEvent.findFirstOrThrow({ where: { type: "CLOTURE_Z" } });
    expect(JSON.parse(ev.dataJson)).not.toHaveProperty("topMenus");
  });

  it("shows the menus on the shift report, which is the live document", async () => {
    await sellMenu({ menuId: ids.menuChill, pizzaSlot: ids.pizzaSlot, drinkSlot: ids.drinkSlot, price: 1200 });
    const report = await computeShiftReport(ids.shift);
    expect(report.topMenus).toEqual([
      { comboProductId: ids.menuChill, name: "Menu Chill", quantity: 1, total: 1200 },
    ]);
  });
});

// ---------------------------------------------------------------- R2.3 ------

describe("L-78 — the allocation's evidence is stored, not recomputed", () => {
  it("records each component's standalone catalogue price beside its share", async () => {
    // À emporter, so the two components resolve to DIFFERENT rates and the
    // forfait genuinely has to be divided: Regina 10 %, Coca 5,5 %.
    await sellMenu({
      menuId: ids.menuChill,
      pizzaSlot: ids.pizzaSlot,
      drinkSlot: ids.drinkSlot,
      price: 1200,
      orderType: "TAKEAWAY",
    });

    const lines = await db.orderItem.findMany({ orderBy: { lineTotal: "desc" } });
    const regina = lines.find((l) => l.productName === "Regina")!;
    const coca = lines.find((l) => l.productName === "Coca")!;

    // The WEIGHTS: the catalogue prices, not the shares.
    expect(regina.referencePrice).toBe(890);
    expect(coca.referencePrice).toBe(350);
    // The two rates really are different, so the division is not cosmetic.
    expect(regina.vatRate).toBe(10);
    expect(coca.vatRate).toBe(5.5);
  });

  it("stores enough to re-derive the split with nothing but the row", async () => {
    // THE POINT OF L-78. An inspector asks, years later, why 12,00 € was split
    // the way it was — and the catalogue has moved since. These four columns
    // answer it without reference to any catalogue: the forfait (`comboPrice`),
    // the weights (`referencePrice`), and the result (`unitPrice`).
    await sellMenu({
      menuId: ids.menuChill,
      pizzaSlot: ids.pizzaSlot,
      drinkSlot: ids.drinkSlot,
      price: 1200,
      orderType: "TAKEAWAY",
    });

    const lines = await db.orderItem.findMany({ orderBy: { lineTotal: "desc" } });
    const forfait = lines[0].comboPrice!;
    expect(lines.every((l) => l.comboPrice === forfait)).toBe(true);

    // Re-run the documented method (policy § 2) from the stored figures alone.
    const rederived = apportion(lines.map((l) => l.referencePrice!), forfait);
    expect(lines.map((l) => l.unitPrice)).toEqual(rederived);
    // And the shares still sum to the forfait, which is what makes the split a
    // division rather than three independent roundings.
    expect(sum2(rederived)).toBe(forfait);

    // Now move the catalogue underneath the sale. The evidence must not move.
    await db.product.update({ where: { id: ids.regina }, data: { price: 5000, pickupPrice: 5000 } });
    const after = await db.orderItem.findMany({ orderBy: { lineTotal: "desc" } });
    expect(after.map((l) => l.referencePrice)).toEqual(lines.map((l) => l.referencePrice));
  });

  it("leaves referencePrice null where no division happened", async () => {
    // An ordinary sale, and the § 4 fallback. Null says « nothing was divided
    // here », which 0 would not — 0 asserts a catalogue price of nothing.
    await sellPlain(ids.regina, 890);
    const [plain] = await db.orderItem.findMany();
    expect(plain.referencePrice).toBeNull();

    await db.orderItem.deleteMany();
    await db.payment.deleteMany();
    await db.order.deleteMany();

    const mod = await import("@/app/api/orders/route");
    const res = await callJson<{ error?: string }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/orders",
      body: {
        orderType: "TAKEAWAY",
        items: [{ productId: ids.emptyMenu, quantity: 1, optionIds: [], addons: [], components: [] }],
        payments: [{ method: "CASH", amount: 1000 }],
      },
    });
    expect(res.status, res.body.error).toBe(201);

    const [fallback] = await db.orderItem.findMany();
    expect(fallback.comboProductId).toBe(ids.emptyMenu); // still countable as a menu
    expect(fallback.referencePrice).toBeNull(); // but nothing was apportioned
  });
});
