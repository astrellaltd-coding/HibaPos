import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/services/settings";
import { resolvePrinter } from "@/lib/services/printer";
import { renderReceipt } from "@/lib/services/receipt";
import { appendFiscalEvent } from "@/lib/services/fiscal";
import { createOrderInTransaction } from "@/lib/services/checkout";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import type { OrderDto, SettingsDto } from "@/types/api";

// FRESH-INSTALL DEFAULTS (operator, 2026-09-11).
//
// ── WHY THIS FILE EXISTS SEPARATELY ─────────────────────────────────────────
// `DEFAULT_SETTINGS` is pinned value-by-value in `settings-factice.test.ts` and
// `printer-connection.test.ts`, and those pins are necessary but they prove a
// CONSTANT. This project's standing rule is that a unit test on an extracted
// rule proves the rule and not that anything calls it. So everything below
// starts from a genuinely EMPTY `Setting` table — no row written, nothing
// saved — and asserts the consequence an operator would meet.
//
// ── THE DEFECT THESE DEFAULTS CARRIED ───────────────────────────────────────
// The operator settled on 2026-09-11 that the restaurant gets a **fresh
// install** in France carrying this catalogue. Measured that day, a fresh
// database would have started:
//
//   factice:           false      -> its FIRST ticket a real fiscal document
//   printerConnection: "network"  -> « Renseignez l'adresse IP », for a printer
//                                    that has always been on a USB type-B cable
//
// Neither was a decision about a fresh install; both were decisions about
// something else that a fresh install inherited. `factice: false` came from
// L-18, where the question was whether the flag could be set at all.
// `printerConnection: "network"` came from Batch 1.3d, where the question was
// whether an UPGRADE would change behaviour — and the answer mattered because
// an install with no stored value keeps resolving as it did before. There is
// one install, it has never traded, and it has no stored value, so that
// protection was protecting the wrong thing.
//
// ── WHAT IS NOT CHANGED, AND WHY ────────────────────────────────────────────
// `printerEnabled` stays `false`. An install that has not been commissioned
// should not be attempting to print — and because printing never loses a sale
// (the order, its payments and its fiscal event commit first), leaving it off
// costs nothing and removes a stream of failures nobody can act on yet.
// `printerQueue` stays `""` because it cannot be guessed: it is chosen from the
// list Windows reports, which is R6.4's remaining half.

/** Everything a settings read could pick up. Emptied so the DEFAULTS answer. */
async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.setting.deleteMany();
  await db.fiscalCounter.deleteMany();
}

beforeEach(async () => {
  await wipe();
  await ensureFiscalCounter();
});

afterAll(wipe);

/** The state a Tauri install would boot into: schema present, nothing chosen. */
async function freshSettings() {
  // Proved, not assumed: if a row existed, every assertion below would be
  // about a saved value rather than about a default.
  expect(await db.setting.count()).toBe(0);
  return getSettings();
}

describe("a fresh install is in SIMULATION until someone says otherwise", () => {
  it("answers factice=true with no Setting row written at all", async () => {
    const s = await freshSettings();
    expect(s.factice).toBe(true);
    expect(await db.setting.count()).toBe(0);
  });

  it("stamps the ticket — which is what the operator actually sees", async () => {
    // The consequence, over the REAL checkout and the REAL renderer. A
    // constant cannot show this; a stamped ticket can.
    const s = await freshSettings();
    const user = await db.user.create({
      data: { username: `fi-${Date.now()}`, name: "Resp", role: "MANAGER", pinHash: "x:y" },
    });
    const shift = await db.shift.create({
      data: { number: 1, openedById: user.id, openedAt: new Date(), openingFloat: 0, status: "OPEN" },
    });
    const order = await createOrderInTransaction({
      shiftId: shift.id,
      cashierId: user.id,
      customerId: null,
      orderType: "DINE_IN",
      tableLabel: null,
      notes: null,
      subtotal: 500,
      discountTotal: 0,
      totalAfterDiscount: 500,
      discountApprovedById: null,
      itemCount: 1,
      items: [
        {
          productId: null,
          productName: "Tacos",
          unitPrice: 500,
          quantity: 1,
          lineTotal: 500,
          vatRate: 10,
          optionsJson: null,
          addOnsJson: null,
          notes: null,
        },
      ],
      payments: [{ method: "CASH", amount: 500 }] as never,
      settings: s as unknown as SettingsDto,
    });

    const full = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, payments: true },
    });
    const text = renderReceipt(full as unknown as OrderDto, s as unknown as SettingsDto);
    expect(text).toContain("FACTICE");
    expect(text).toContain("TICKET NON VALABLE");
  });

  it("flags the fiscal journal entry, so a test sale is separable forever", async () => {
    // The half that cannot be corrected afterwards: a sale rung on a fresh
    // install before anyone went live is marked in the chain as what it was.
    const s = await freshSettings();
    const user = await db.user.create({
      data: { username: `fi2-${Date.now()}`, name: "Resp", role: "MANAGER", pinHash: "x:y" },
    });
    const ev = await db.$transaction((tx) =>
      appendFiscalEvent(tx, {
        type: "VENTE",
        userId: user.id,
        factice: s.factice ?? false,
        data: { probe: true },
      }),
    );
    expect(ev.factice).toBe(true);
  });
});

describe("a fresh install points at the printer this restaurant owns", () => {
  it("answers printerConnection=usb with no Setting row written at all", async () => {
    const s = await freshSettings();
    expect(s.printerConnection).toBe("usb");
    expect(await db.setting.count()).toBe(0);
  });

  it("tells the operator to choose a Windows printer, NOT to enter an IP", async () => {
    // THE WHOLE POINT, and the assertion that would have failed before.
    // `printerEnabled` is off by default, and `resolvePrinter` answers DISABLED
    // first — so printing is enabled here, which is exactly what the operator
    // does at R6.4 before choosing a queue. What they meet next used to be a
    // request for an IP address, and an IP was never available: the Sunso
    // WTP-801 is on USB type-B, confirmed with the owner 2026-09-09.
    await db.setting.create({ data: { key: "printerEnabled", value: "true" } });

    const s = await getSettings();
    expect(s.printerEnabled).toBe(true);
    expect(s.printerConnection).toBe("usb"); // still the default — no row for it
    expect(await db.setting.findUnique({ where: { key: "printerConnection" } })).toBeNull();

    const r = await resolvePrinter();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // `PrintOutcome` is a three-arm union and its success arm carries neither
    // `reason` nor `message`, so narrow before reading them.
    expect(r.outcome.ok).toBe(false);
    if (r.outcome.ok) return;
    expect(r.outcome.reason).toBe("NOT_CONFIGURED");
    expect(r.outcome.message).toContain("imprimante Windows");
    // The message the old default produced. Its absence is the fix.
    expect(r.outcome.message).not.toContain("adresse IP");
  });
});
