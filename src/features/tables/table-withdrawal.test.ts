import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { createOrderInTransaction, type CheckoutInput } from "@/lib/services/checkout";
import { processRefund } from "@/lib/services/refund";
import { getSettings } from "@/lib/services/settings";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import type { SettingsDto } from "@/types/api";

// C-21, Batch 5.2 — the OTHER half of the withdrawal (DD-09, 2026-09-05).
//
// DD-09 withdrew the floor-plan screen and kept the `Table` model,
// `/api/tables*`, the checkout auto-link and the refund release "in place,
// unused, in case table service ever exists". A retention promised in a
// decision record and never executed is indistinguishable from dead code, and
// the next dead-code sweep (Batch 7.2) would be right to delete it. So the two
// server-side halves are exercised here, with a table label supplied directly
// to the service — which is precisely what the POS no longer does.
//
// WHERE THESE TESTS COME FROM. Batch 5.2's *Validation Required* was written
// for the answer DD-09 did not get, and two of its criteria were:
//
//   - "Manual: completing a dine-in sale with a table sets that table OCCUPIED
//      and links currentOrderId"
//   - "Manual: a full refund frees the table (confirm it now actually fires)"
//
// Their UI half is void — there is no picker to complete them through. Their
// SERVER half is exactly what DD-09 retained, so it survives the re-derivation
// and moves from manual to automated, which is the stronger form. The criteria
// they replace are named in the record.
//
// WHAT THESE CANNOT PROVE, and it matters for reading them: every assertion
// below passes against the pre-batch code too. Nothing here is evidence FOR
// the withdrawal — `nav-access.test.ts` holds that. These are regression
// assertions in the strict sense: they fail only if someone later removes what
// DD-09 said to keep.

let userId: string;
let shiftId: string;
let settings: SettingsDto;

/** Drop `//` line comments, so a source-level assertion cannot be satisfied by
 *  prose — including this batch's own comments, which name everything it
 *  removed. That is not hypothetical: the first version of the app-shell
 *  assertion below matched the comment that replaced the import it was
 *  checking for. */
const stripLineComments = (src: string) => src.replace(/\/\/.*/g, "");

/** Every table this file writes, in dependency order — the whole run shares one
 *  database (test-setup.ts), so a row left behind here breaks another file.
 *  `Table` is on the list because this is the only file that writes one. */
async function clearAll() {
  await db.fiscalEvent.deleteMany();
  await db.grandTotal.deleteMany();
  await db.receipt.deleteMany();
  await db.refund.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.table.deleteMany();
  await db.shift.deleteMany();
  await db.auditLog.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
}

afterAll(clearAll);

async function reset() {
  await clearAll();
  await ensureFiscalCounter();
  const user = await db.user.create({
    data: { username: `c21-${Date.now()}`, name: "Caissier", role: "MANAGER", pinHash: "x:y" },
  });
  const shift = await db.shift.create({
    data: { number: 1, openedById: user.id, openingFloat: 10000, status: "OPEN" },
  });
  userId = user.id;
  shiftId = shift.id;
  settings = (await getSettings()) as unknown as SettingsDto;
}

function checkoutInput(totalCents: number, overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    shiftId,
    cashierId: userId,
    customerId: null,
    orderType: "DINE_IN",
    tableLabel: null,
    notes: null,
    subtotal: totalCents,
    discountTotal: 0,
    totalAfterDiscount: totalCents,
    discountApprovedById: null,
    itemCount: 1,
    items: [
      {
        productId: null,
        productName: "Sandwich",
        unitPrice: totalCents,
        quantity: 1,
        lineTotal: totalCents,
        vatRate: 10,
        optionsJson: null,
        addOnsJson: null,
        notes: null,
      },
    ],
    payments: [{ method: "CASH", amount: totalCents }],
    settings,
    ...overrides,
  };
}

describe("C-21 — the server-side table wire is retained and still works (DD-09)", () => {
  beforeEach(reset);

  it("still marks a matching table OCCUPIED and links the order", async () => {
    // checkout.ts:202-208, which no sale has ever entered: `tableLabel` comes
    // from a cart field with no writer. Supplied directly here.
    const table = await db.table.create({ data: { label: "T1", seats: 4, zone: "Salle" } });
    expect(table.status).toBe("FREE");

    const order = await createOrderInTransaction(checkoutInput(1200, { tableLabel: "T1" }));

    const after = await db.table.findUnique({ where: { id: table.id } });
    expect(after!.status).toBe("OCCUPIED");
    expect(after!.currentOrderId).toBe(order.id);
  });

  it("still frees the table on a full refund", async () => {
    // refund.ts:131-136. The half the old criteria asked us to "confirm it now
    // actually fires" — it does, given a linked table to free.
    const table = await db.table.create({ data: { label: "T2", seats: 2, zone: "Salle" } });
    const order = await createOrderInTransaction(checkoutInput(1500, { tableLabel: "T2" }));
    expect((await db.table.findUnique({ where: { id: table.id } }))!.status).toBe("OCCUPIED");

    await processRefund(
      {
        orderId: order.id,
        amount: 1500,
        reason: "Erreur de saisie",
        method: "CASH",
        approverId: userId,
        cashierId: userId,
        factice: false,
      },
      {
        id: order.id,
        number: order.number,
        total: 1500,
        status: "COMPLETED",
        orderType: "DINE_IN",
        tableLabel: "T2",
        refunds: [],
      },
    );

    const after = await db.table.findUnique({ where: { id: table.id } });
    expect(after!.status).toBe("FREE");
    expect(after!.currentOrderId).toBeNull();
  });

  it("leaves a dine-in sale alone when no label is supplied — which is every sale", async () => {
    // The state the till is actually in after this batch, and the reason the
    // two tests above are latent rather than live: `payment-dialog.tsx:160`
    // sends `tableLabel || null`, and the cart's `tableLabel` is permanently
    // "". A table that exists is simply never touched. DINE_IN itself is NOT
    // withdrawn — 18 of production's 20 orders carry it; it means eating in,
    // not being served at a table.
    const table = await db.table.create({ data: { label: "T3", seats: 4, zone: "Salle" } });
    const order = await createOrderInTransaction(checkoutInput(900));

    expect(order.orderType).toBe("DINE_IN");
    expect(order.tableLabel).toBeNull();
    const after = await db.table.findUnique({ where: { id: table.id } });
    expect(after!.status).toBe("FREE");
    expect(after!.currentOrderId).toBeNull();
  });
});

describe("C-21 — what the withdrawal deliberately did NOT delete", () => {
  it("keeps the floor-plan screen on disk, imported by nothing", async () => {
    // DD-09 withdraws the feature; it does not delete it. The screen is the
    // only client `/api/tables*` has, so deleting one and keeping the other
    // would be incoherent. Both stay. This asserts the state precisely: the
    // file exists, and the shell no longer reaches it.
    const { readFileSync, existsSync } = await import("node:fs");
    expect(existsSync("src/features/tables/tables-view.tsx")).toBe(true);

    // Assert on the exact import EXPRESSION, not on the path as prose: the
    // shell now carries a comment naming the file it no longer imports, and a
    // looser substring matches that comment and fails.
    const shell = readFileSync("src/components/shared/app-shell.tsx", "utf8");
    expect(shell).not.toContain('import("@/features/tables/tables-view")');
    expect(shell).not.toContain("<TablesView");
  });

  it("keeps the three table routes under the API authorization walk", async () => {
    // `api-authorization.test.ts` walks the filesystem, so retaining the routes
    // retains their coverage — a reason of its own not to delete them.
    const { existsSync } = await import("node:fs");
    for (const p of [
      "src/app/api/tables/route.ts",
      "src/app/api/tables/[id]/route.ts",
      "src/app/api/tables/seed/route.ts",
    ]) {
      expect(existsSync(p)).toBe(true);
    }
  });

  it("keeps the receipt printing a table label when an order carries one", async () => {
    // The far end of the retained wire. `receipt.ts:58` prints the label when
    // there is one; `renderReceipt` itself is covered by `receipt.test.ts`,
    // whose fixture still carries `tableLabel: "T1"`.
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/lib/services/receipt.ts", "utf8")).toContain("order.tableLabel");
  });

  it("keeps setTableLabel working, and called from nowhere", async () => {
    // C-21's own evidence, turned into a test: `grep -rn setTableLabel src/`
    // returned exactly two hits, both in `cart-store.ts` — its type and its
    // implementation. That was the finding. After DD-09 it is the intended
    // state, so it is pinned in both directions: the setter must still work
    // (someone deleting it as dead code fails here), and nothing may call it
    // (someone wiring a picker back in without reopening DD-09 fails here too).
    //
    // The first version of this test asserted that "setTableLabel" appears in
    // cart-store.ts. It passed against a store whose setter had been renamed —
    // the substring survives inside a longer name, and the type declaration
    // matches it anyway. Methods → *Prove the test fails on the old code*: a
    // revert that changes nothing is a defect in the test.
    const { useCartStore } = await import("@/store/cart-store");
    expect(useCartStore.getState().tableLabel).toBe("");
    useCartStore.getState().setTableLabel("T9");
    expect(useCartStore.getState().tableLabel).toBe("T9");
    useCartStore.getState().setTableLabel("");

    const { readdirSync, statSync, readFileSync } = await import("node:fs");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const full = `${dir}/${e}`;
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e) && !full.endsWith("table-withdrawal.test.ts")) {
          // Strip line comments so this file's own prose cannot satisfy it.
          const code = stripLineComments(readFileSync(full, "utf8"));
          if (code.includes("setTableLabel")) hits.push(full);
        }
      }
    };
    walk("src");
    expect(hits).toEqual(["src/store/cart-store.ts"]);
    // And not even there is it CALLED — both hits are declarations.
    const cart = stripLineComments(readFileSync("src/store/cart-store.ts", "utf8"));
    expect(cart).not.toContain("setTableLabel(");
    expect(cart.match(/setTableLabel:/g)).toHaveLength(2);
  });
});
