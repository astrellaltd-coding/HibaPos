import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { ORDER_STATUS_LABELS } from "@/lib/order-labels";

// DD-13 (2026-09-05), Batch 5.6 — M-08. There is no pre-payment order state.
//
// `enum OrderStatus` held four values and only two were ever written:
// `COMPLETED` (checkout.ts) and `REFUNDED` (refund.ts). `PENDING` and
// `CANCELLED` were read, filtered and rendered by code that could never fire,
// which is worse than absent — a UI arm reading « En attente » and a shift
// counter reporting 0 both describe a feature the product does not have.
// All 20 production orders were `COMPLETED`, confirmed read-only first.
//
// ── THE TRAP THIS FILE EXISTS TO HOLD ────────────────────────────────────────
// `PENDING` names TWO unrelated things in this codebase:
//
//   1. `OrderStatus.PENDING`   — removed by this batch. Fiscal.
//   2. `Receipt.printStatus`   — a plain String column, `@default("PENDING")`,
//                                meaning "not yet sent to the printer". It is
//                                written for EVERY receipt at checkout and
//                                moved to PRINTED / FAILED by the print route.
//
// A removal driven by `grep PENDING` deletes the second one and breaks receipt
// printing on every sale. So this file asserts the removal in BOTH directions:
// no order-status `PENDING` may come back, and the receipt's `PENDING` must
// still be there. `CANCELLED` has no such twin and is asserted flatly.
//
// ── WHAT THIS PROVES, AND WHAT IT DOES NOT ───────────────────────────────────
// Three of these assertions read source text rather than executing it: the
// query filter's zod enum and both `statusBadge` switches are module-private,
// and driving the route needs a request scope (`withAuth` → `getSession()` →
// `cookies()` throws outside one) that stays with Batch 6.1 — the same
// boundary `api-authorization.test.ts` draws for the role matrix. Text
// assertions catch a value being reintroduced, a filter being widened, and a
// fallback arm naming a state again. They do not prove the route returns 400,
// and they are not counted here as if they did.

const REPO_ROOT = process.cwd();
const SRC = path.join(REPO_ROOT, "src");
const SCHEMA = path.join(REPO_ROOT, "prisma", "schema.prisma");

/** The values `enum OrderStatus` is expected to hold after DD-13. */
const LIVE_STATUSES = ["COMPLETED", "REFUNDED"];
const REMOVED_STATUSES = ["PENDING", "CANCELLED"];

/** The ONLY code lines under `src/` allowed to mention `PENDING` after this
 *  batch: the receipt print-status namespace, plus this file, which names both
 *  values in constants on purpose. Keyed by path relative to the repo root.
 *
 *  This list is the trap, written down. Shrinking it means a receipt no longer
 *  starts life unprinted; growing it means `PENDING` came back as an order
 *  state under a different name. Either is a decision, and either fails here. */
const PENDING_IS_A_RECEIPT_HERE: Record<string, string> = {
  "src/lib/services/checkout.ts":
    'every receipt is created unprinted — `printStatus: "PENDING"`, not an order status',
  "src/lib/order-status.test.ts": "this file",
};

/** Every .ts/.tsx under src/. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...sourceFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/** Lines mentioning `token` that are not themselves comment lines. Same blunt
 *  comment test as `role-model.test.ts`, and deliberately so: a surviving line
 *  passes only if its trimmed form opens with `//`, `*` or `/*`. It errs toward
 *  reporting — a trailing `// PENDING` on a line of code is an offender rather
 *  than an excuse. A false positive costs a comment move; a false negative
 *  costs the assertion its point. */
function codeLinesMentioning(source: string, token: string): string[] {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return withoutBlocks
    .split(/\r?\n/)
    .filter((line) => line.includes(token))
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .map((line) => line.trim());
}

/** The values inside a named Prisma enum block. */
function prismaEnumValues(schema: string, name: string): string[] {
  const block = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema);
  expect(block).not.toBeNull();
  return block![1]
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("//"));
}

describe("DD-13 — the two dead order statuses are gone", () => {
  it("finds the source tree", () => {
    // A guard on the guard: a walk that silently returned nothing would make
    // every assertion below pass vacuously. CONTROL — this cannot fail under
    // any revert of this batch, and is not coverage.
    expect(sourceFiles(SRC).length).toBeGreaterThan(100);
  });

  it("leaves the enum holding exactly the two states an order can be in", () => {
    expect(prismaEnumValues(readFileSync(SCHEMA, "utf8"), "OrderStatus")).toEqual(LIVE_STATUSES);
  });

  it("leaves no CANCELLED anywhere under src/, outside a comment", () => {
    // `CANCELLED` has no second meaning in this codebase, so this one is flat.
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      if (path.relative(REPO_ROOT, file).split(path.sep).join("/") === "src/lib/order-status.test.ts") {
        continue;
      }
      for (const line of codeLinesMentioning(readFileSync(file, "utf8"), "CANCELLED")) {
        offenders.push(`${path.relative(REPO_ROOT, file)}: ${line}`);
      }
    }
    // Named individually so a failure says where, not just how many.
    expect(offenders).toEqual([]);
  });

  it("leaves no PENDING under src/ except where it means a receipt", () => {
    // THE TRAP, first direction. Anything not in the allowlist is an order
    // status coming back.
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
      if (rel in PENDING_IS_A_RECEIPT_HERE) continue;
      for (const line of codeLinesMentioning(readFileSync(file, "utf8"), "PENDING")) {
        offenders.push(`${rel}: ${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("drops the permanently-zero cancelled counter from the shift summary", () => {
    const summary = readFileSync(
      path.join(SRC, "app", "api", "shifts", "summary", "route.ts"),
      "utf8",
    );
    expect(codeLinesMentioning(summary, "cancelledOrders")).toEqual([]);
    // …and the counters beside it are still produced, so a removal that took
    // the wrong line with it fails here rather than passing quietly.
    expect(codeLinesMentioning(summary, "refundedOrders").length).toBeGreaterThan(0);
    expect(codeLinesMentioning(summary, "completedOrders").length).toBeGreaterThan(0);
  });
});

describe("the receipt print-status namespace, which shares the word", () => {
  it("still creates every receipt as PENDING at checkout", () => {
    // THE TRAP, second direction. This is what a `grep PENDING` removal breaks:
    // receipts would be created with no print status, and the print route's
    // PENDING → PRINTED / FAILED transition would have nothing to move.
    const checkout = readFileSync(path.join(SRC, "lib", "services", "checkout.ts"), "utf8");
    expect(codeLinesMentioning(checkout, 'printStatus: "PENDING"')).toHaveLength(1);
  });

  it("still defaults Receipt.printStatus to PENDING in the schema", () => {
    const schema = readFileSync(SCHEMA, "utf8");
    expect(codeLinesMentioning(schema, "printStatus")).toEqual([
      'printStatus   String    @default("PENDING") // PENDING | PRINTED | FAILED',
    ]);
    // The two namespaces are separate: `printStatus` is a String column, and
    // must not become the enum this batch just narrowed.
    expect(schema).not.toContain("printStatus   OrderStatus");
  });

  it("keeps the print route's two transitions off that column", () => {
    const print = readFileSync(
      path.join(SRC, "app", "api", "orders", "[id]", "print", "route.ts"),
      "utf8",
    );
    expect(print).toContain('printStatus: "PRINTED"');
    expect(print).toContain('printStatus: "FAILED"');
  });
});

describe("the query filter, narrowed with the enum", () => {
  it("accepts exactly the statuses the enum has", () => {
    // The API contract changed deliberately: `?status=CANCELLED` answered an
    // empty list and now answers 400. Derived from the schema rather than
    // retyped, so adding a state to the enum without widening the filter — or
    // widening the filter past the enum — fails here either way.
    const route = readFileSync(path.join(SRC, "app", "api", "orders", "route.ts"), "utf8");
    const literal = /const STATUS_ENUM = z\.enum\(\[([^\]]*)\]\)/.exec(route);
    expect(literal).not.toBeNull();
    const accepted = literal![1]
      .split(",")
      .map((v) => v.trim().replace(/^["']|["']$/g, ""))
      .filter((v) => v.length > 0);
    expect(accepted).toEqual(prismaEnumValues(readFileSync(SCHEMA, "utf8"), "OrderStatus"));
  });

  it("builds its refusal message from that list rather than a second copy", () => {
    // The old message hard-coded all four names beside a four-value enum. A
    // second hand-maintained list is how the two drift apart.
    const route = readFileSync(path.join(SRC, "app", "api", "orders", "route.ts"), "utf8");
    expect(route).toContain("STATUS_ENUM.options.join");
    for (const dead of REMOVED_STATUSES) {
      expect(codeLinesMentioning(route, dead)).toEqual([]);
    }
  });
});

describe("what the operator is shown", () => {
  it("names exactly the statuses the enum has, and nothing else", () => {
    // Executed, not read: the real module. `Record<OrderDto["status"], string>`
    // makes a missing label a type error; this catches the other direction —
    // a label kept for a state that no longer exists.
    expect(Object.keys(ORDER_STATUS_LABELS).sort()).toEqual([...LIVE_STATUSES].sort());
    expect(ORDER_STATUS_LABELS.COMPLETED).toBe("Terminée");
    expect(ORDER_STATUS_LABELS.REFUNDED).toBe("Remboursée");
  });

  it("never tells the operator an order is awaiting payment or cancelled", () => {
    // M-08's user-visible half, and Batch 5.6's own validation criterion:
    // "the UI no longer implies the state exists". Both `statusBadge` switches
    // fell through to « En attente » for anything they did not recognise, which
    // is a pre-payment state described in French on a screen the manager reads.
    //
    // ── AMENDED IN BATCH 7.2 (L-08), AND IT IS STRICTLY STRONGER ─────────────
    // This test FAILED when 7.2 de-duplicated the two byte-identical switches
    // into `OrderStatusBadge`: it asserted each view file contains
    // `ORDER_STATUS_LABELS.COMPLETED`, and neither does any more — the badge is
    // rendered from one module now. The assertion is MOVED, not dropped, and a
    // third one is added that the old shape could not express: **neither view
    // may declare a `statusBadge` switch of its own again**, which is the
    // property 7.2 established and the one that would let these drift apart a
    // second time. Nothing here was relaxed to make the run go green.
    for (const view of [
      path.join(SRC, "features", "orders", "orders-view.tsx"),
      path.join(SRC, "features", "dashboard", "dashboard-view.tsx"),
    ]) {
      const source = readFileSync(view, "utf8");
      expect(codeLinesMentioning(source, "En attente")).toEqual([]);
      expect(codeLinesMentioning(source, "Annulée")).toEqual([]);
      // The duplication must not come back.
      expect(source).not.toContain("function statusBadge");
      // …and the shared badge really is what the view renders, so a switch
      // deleted wholesale fails here instead of passing for the wrong reason.
      expect(source).toContain("<OrderStatusBadge status=");
    }

    // The labels moved with the switch, so assert them where they now live.
    const badge = readFileSync(
      path.join(SRC, "components", "shared", "order-status-badge.tsx"),
      "utf8",
    );
    expect(badge).toContain("ORDER_STATUS_LABELS.COMPLETED");
    expect(badge).toContain("ORDER_STATUS_LABELS.REFUNDED");
    expect(codeLinesMentioning(badge, "En attente")).toEqual([]);
    expect(codeLinesMentioning(badge, "Annulée")).toEqual([]);
  });
});
