// ⚠ TEST ONLY. Nothing in the application imports this module, and nothing
// should — `deployment.test.ts`'s convention, and the same warning
// `route-harness.ts` carries.
//
// L-154 (R9.7) — ONE WIPE ORDER, INSTEAD OF 71 HAND-MAINTAINED LISTS.
//
// ── THE HAZARD ───────────────────────────────────────────────────────────────
// Foreign-key enforcement is on (`?_fk=1`), and a `Restrict` violation really
// throws. Measured on this tree, not taken from the audit's count:
//
//   * **71 test files call `deleteMany`.**
//   * **17 delete `Shift` without deleting `ZReport` first**, and
//     `ZReport.shiftId` is `onDelete: Restrict`.
//   * **3 delete `User` with almost nothing else cleared.**
//
// Under today's data most of those do not trip, because the file happens not to
// create the row that would block it. That is not a property anybody chose, and
// it has now failed three times in three batches:
//
//   R8.2  a new test file left orders behind and `fiscal-verify-software.test.ts`
//         died on `db.user.deleteMany()` three tests away.
//   R8.6  a new file stopped leaving a `Setting` row behind and
//         `reports.test.ts` — which had been free-riding on it — failed.
//   R9.1  L-88's give-away fixture left an order behind and
//         `fiscal-chain-key.test.ts` died on a P2003, **ten failures across
//         three files away from the cause**.
//
// Every one was patched at its own source with an `afterAll`. That is the
// workaround this finding predicts will keep being needed, and R9.5's L-189
// found the mirror image — a file free-riding on state it never created.
//
// ── THE ORDER ────────────────────────────────────────────────────────────────
// Children before parents, and the two `Restrict` edges first because they are
// the ones that throw rather than cascade:
//
//   ZReport.shiftId   -> Shift    (Restrict)
//   Refund.orderId    -> Order    (Restrict)
//
// Everything else is `Cascade` or a plain id with no FK — the sealed-document
// convention this schema uses deliberately (`DailyClose.sealedById`,
// `Refund.approvedById`), so those rows survive a `User` delete on purpose.
//
// Derived from `prisma/schema.prisma` by hand and pinned by
// `test-wipe.test.ts`, which fails if a model appears in the schema and not
// here — so a new table cannot quietly fall out of the order.

import { db } from "@/lib/db";

/**
 * Every model this helper clears, child-first.
 *
 * Order is the whole point: it is read top to bottom and each entry may only
 * depend on entries above it.
 */
export const WIPE_ORDER = [
  // ── documents that point at orders and shifts ──────────────────────────────
  "auditLog",
  "technicalLog",
  "session",
  "fiscalEvent",
  "receipt",
  "refund", // Restrict -> Order
  "payment",
  "orderItem",
  "cashMovement",
  "zReport", // Restrict -> Shift
  // ── the sealed closes, which reference nothing that follows ────────────────
  "fiscalArchive",
  "dailyClose",
  "monthlyClose",
  "annualClose",
  // ── orders, then the shifts they hang off ──────────────────────────────────
  "order",
  "shift",
  "grandTotal",
  "fiscalCounter",
  // ── the catalogue, deepest first ───────────────────────────────────────────
  "comboSlotOptionRule",
  "comboSlotChoice",
  "comboSlot",
  "categoryOptionChoice",
  "categoryOptionGroup",
  "categoryAddOn",
  "optionChoice",
  "optionGroup",
  "product",
  "category",
  // ── the rest ───────────────────────────────────────────────────────────────
  "customer",
  "table",
  "backup",
  "setting",
  "user",
] as const;

export type WipeModel = (typeof WIPE_ORDER)[number];

export type WipeOptions = {
  /**
   * Models to leave alone. Use it for state the file's own `beforeAll` created
   * once — a user, a catalogue — rather than re-creating it per test.
   *
   * Naming what you keep is deliberately noisier than naming what you delete:
   * the list of things to delete goes stale silently when a table is added,
   * which is exactly how this finding happened.
   */
  keep?: readonly WipeModel[];
};

/**
 * Clear the test database in an order the foreign keys allow.
 *
 * Safe to call when a table is already empty. Deliberately NOT wrapped in a
 * transaction: SQLite has one writer, and a failure part-way through is more
 * useful reported at the statement that caused it than rolled back into
 * silence.
 */
export async function wipeDatabase(options: WipeOptions = {}): Promise<void> {
  const keep = new Set<string>(options.keep ?? []);
  const client = db as unknown as Record<string, { deleteMany: () => Promise<unknown> }>;
  for (const model of WIPE_ORDER) {
    if (keep.has(model)) continue;
    await client[model].deleteMany();
  }
}
