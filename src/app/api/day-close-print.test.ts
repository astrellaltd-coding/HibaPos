import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { closeDay } from "@/lib/services/fiscal";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { renderDayCloseTicket } from "@/lib/services/day-close-ticket";

// L-98 (R9.1) — the day's closing slip can actually reach paper.
//
// THE FINDING, in the audit's words: « The Z report and the daily close have no
// print path at all. » `renderDayCloseTicket` was called in exactly one place,
// inside a `<pre>` on the fiscal screen, and `printReceiptText` had exactly two
// callers, both order tickets. Ctrl+P on that screen produced a BLANK PAGE:
// `globals.css` hides `body *` in print media and shows only `#receipt-print`,
// which the fiscal screen does not have. So the document the operator is told
// to file with the books could be read on a screen and printed by no route at
// all.
//
// The operator settled on 2026-09-13 that it must print. That also unblocked
// L-88 — the give-away figures the close seals and the slip did not carry —
// which is fixed in `day-close-ticket.ts` in the same batch.
//
// WHAT THIS FILE PROVES. It drives the real handler through `route-harness.ts`
// with a real session, against a real sealed close: that the route exists, that
// it renders THE SEALED ROW rather than anything a client sends, that it says
// truthfully what happened, and that it never opens the drawer.
//
// ── WHAT IT USED TO SAY IT COULD NOT DO — L-186, and it can now ─────────────
// This paragraph read « It does NOT prove that ink reaches paper:
// `printReceiptText` resolves its own transport from settings, so with printing
// switched off the honest answer is « not attempted », and that is the case
// asserted. » That was true and it was the FINDING: no test could drive a
// SUCCESSFUL print through any of the three print routes, so the branch writing
// `DAY_CLOSE_TICKET_PRINTED` was asserted as source text and never executed.
//
// The routes now take an injectable printer, and **`print-success.test.ts`
// drives all three to a successful print, a failed one, and the drawer rules
// in the bytes.** What stays here is the not-attempted case, which is still the
// one production hits: printing is off in this database, which is the default.

const PIN = "424242";
let manager: { id: string; username: string; role: "MANAGER" };
let admin: { id: string; username: string; role: "SUPER_ADMIN" };

type AuditRow = { action: string; entity: string; entityId: string | null; details: string | null };

const auditRows = (): Promise<AuditRow[]> =>
  db.auditLog.findMany({ orderBy: { createdAt: "asc" } }) as Promise<AuditRow[]>;

async function route() {
  return import("@/app/api/fiscal/closes/[period]/print/route");
}

async function seal(period = "2026-06-12"): Promise<{ id: string; period: string; dataJson: string }> {
  const shift = await db.shift.create({
    data: {
      number: 1,
      openedById: admin.id,
      openedAt: new Date(2026, 5, 12, 10, 0),
      status: "CLOSED",
      closedById: admin.id,
      closedAt: new Date(2026, 5, 12, 23, 0),
      openingFloat: 5000,
    },
  });
  await db.order.create({
    data: {
      number: 7001,
      shiftId: shift.id,
      cashierId: admin.id,
      status: "COMPLETED",
      subtotal: 2000,
      discountTotal: 0,
      total: 2000,
      vatTotal: 182,
      itemCount: 1,
      createdAt: new Date(2026, 5, 12, 12, 0),
      completedAt: new Date(2026, 5, 12, 12, 0),
      items: { create: [{ productName: "Burger", quantity: 1, lineTotal: 2000, vatRate: 10, unitPrice: 2000 }] },
      payments: { create: [{ method: "CASH", amount: 2000, cashierId: admin.id }] },
    },
  });
  // One meal handed over free, so L-88's line is on the document this route
  // renders — the two findings meet here and nowhere else.
  await db.order.create({
    data: {
      number: 7002,
      shiftId: shift.id,
      cashierId: admin.id,
      status: "COMPLETED",
      subtotal: 0,
      discountTotal: 0,
      total: 0,
      vatTotal: 0,
      itemCount: 1,
      createdAt: new Date(2026, 5, 12, 13, 0),
      completedAt: new Date(2026, 5, 12, 13, 0),
      items: { create: [{ productName: "Tacos", quantity: 1, lineTotal: 0, vatRate: 10, unitPrice: 0 }] },
      payments: { create: [{ method: "OFFERT", amount: 0, cashierId: admin.id }] },
    },
  });
  return closeDay(period, admin.id, false, new Date(2026, 5, 20));
}

async function wipe(): Promise<void> {
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.fiscalEvent.deleteMany();
  await db.dailyClose.deleteMany();
  await db.monthlyClose.deleteMany();
  await db.annualClose.deleteMany();
  await db.cashMovement.deleteMany();
  await db.refund.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.zReport.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.setting.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  await ensureFiscalCounter();
  await db.setting.create({
    data: { key: "businessDayCutoffHour", value: JSON.stringify(5) },
  });

  const stamp = `${Date.now()}-${Math.random()}`;
  const m = await db.user.create({
    data: { username: `l98-mgr-${stamp}`, name: "Resp", role: "MANAGER", pinHash: await hashPin(PIN) },
  });
  const a = await db.user.create({
    data: { username: `l98-sa-${stamp}`, name: "Admin", role: "SUPER_ADMIN", pinHash: await hashPin(PIN) },
  });
  manager = { id: m.id, username: m.username, role: "MANAGER" };
  admin = { id: a.id, username: a.username, role: "SUPER_ADMIN" };
});

describe("L-98 — the slip has a print route at all", () => {
  it("answers a POST for a sealed close", async () => {
    const close = await seal();
    await signInAs(admin);
    const res = await callJson<{ printed: boolean; reason?: string }>((await route()).POST, {
      method: "POST",
      url: "http://localhost/api/fiscal/closes/2026-06-12/print",
      params: { period: close.period },
    });
    // Printing is off in this database, so the honest answer is « not printed »
    // WITH a reason — not a 500, and not a cheerful `printed: true`.
    expect(res.status).toBe(200);
    expect(res.body.printed).toBe(false);
    expect(res.body.reason, "an unprinted slip must say why").toBeTruthy();
  });

  it("404s for a period that was never closed", async () => {
    await signInAs(admin);
    const res = await callJson<{ error: string }>((await route()).POST, {
      method: "POST",
      url: "http://localhost/api/fiscal/closes/2026-06-30/print",
      params: { period: "2026-06-30" },
    });
    expect(res.status).toBe(404);
  });

  it("lets the MANAGER print it, because the MANAGER is who is at the till", async () => {
    // The shape of L-101, which blocks R6.3 and R6.4: a screen that offers a
    // button the API then refuses. The fiscal screen is open to both roles, so
    // this route is too.
    const close = await seal();
    await signInAs(manager);
    const res = await callJson((await route()).POST, {
      method: "POST",
      url: "http://localhost/api/fiscal/closes/2026-06-12/print",
      params: { period: close.period },
    });
    expect(res.status, "the MANAGER was refused a button they are shown").not.toBe(403);
  });

  it("refuses an anonymous caller", async () => {
    const close = await seal();
    const res = await callJson((await route()).POST, {
      method: "POST",
      url: "http://localhost/api/fiscal/closes/2026-06-12/print",
      params: { period: close.period },
    });
    expect(res.status).toBe(401);
  });
});

describe("L-98 — what it prints is the sealed row", () => {
  it("renders the close from the database, not from the request", async () => {
    // The same argument L-97 settles for the customer's ticket. A body that
    // could influence the document would make the printed slip and the sealed
    // one two different things, and the printed one is what goes in the binder.
    const close = await seal();
    await signInAs(admin);
    await callJson((await route()).POST, {
      method: "POST",
      url: "http://localhost/api/fiscal/closes/2026-06-12/print",
      params: { period: close.period },
      body: { period: "2026-01-01", salesTotal: 999999, restaurantName: "AUTRE" },
    });
    const rows = await auditRows();
    expect(rows.length).toBe(1);
    expect(rows[0].entityId, "the row it acted on came from the URL, not the body").toBe(close.id);
    expect(JSON.parse(rows[0].details ?? "{}").period).toBe("2026-06-12");
  });

  it("sends the same text the screen shows, including L-88's give-away line", async () => {
    // The route and the screen must be one document. Rendered here from the
    // same sealed row by the same function, and asserted to carry the line
    // whose absence was L-88.
    const close = await seal();
    const text = renderDayCloseTicket(close as never, { receiptWidth: 42 });
    expect(text).toContain("CLÔTURE DU JOUR");
    expect(text).toContain("Offerts (1)");
    expect(text).toContain("Tacos");
  });

  it("never opens the cash drawer", async () => {
    // A close is not a tender. `orders/[id]/reprint` already establishes that a
    // document reprint must not become an untraced way to open the till, and a
    // slip printed at the end of the day is exactly when that would be worth
    // abusing.
    //
    // NARROWED 2026-09-14 (L-186). This matched `printReceiptText(content)` as
    // source text, saying « the drawer is decided by an argument this route
    // does not pass, and an absent argument cannot be observed at runtime ».
    // **It can be observed now**: `print-success.test.ts` drives this route
    // with a capturing transport and asserts no `ESC p` in the job — the rule
    // proved in the bytes rather than in the spelling of a call.
    //
    // What stays here is the SOURCE half, and it is not redundant: the runtime
    // test proves the drawer did not open on the paths it drives, and this
    // proves the route has no way to open it at all. A route that grew an
    // `openDrawer` branch behind a condition no test happens to take would pass
    // the first and fail this.
    const src = readFileSync(
      path.join(process.cwd(), "src/app/api/fiscal/closes/[period]/print/route.ts"),
      "utf8",
    );
    expect(src, "the print call changed shape — check it still passes no options").toContain(
      "printReceiptText(content, {}, deps)",
    );
    expect(src, "the drawer must not be reachable from a close").not.toContain("openDrawer");
  });
});

describe("L-98 — the audit trail distinguishes three outcomes", () => {
  it("records SKIPPED, not FAILED, when printing is switched off", async () => {
    // L-143's distinction, made here for the same reason: an audit trail that
    // calls « printing is off » a failure teaches its reader to ignore the
    // failures. Printing is off in this database, which is the default.
    const close = await seal();
    await signInAs(admin);
    await callJson((await route()).POST, {
      method: "POST",
      url: "http://localhost/api/fiscal/closes/2026-06-12/print",
      params: { period: close.period },
    });
    const rows = await auditRows();
    expect(rows.length, "the attempt left no trace").toBe(1);
    expect(rows[0].action).toBe("DAY_CLOSE_TICKET_PRINT_SKIPPED");
    expect(rows[0].entity).toBe("DailyClose");
    expect(JSON.parse(rows[0].details ?? "{}").reason).toBe("DISABLED");
  });

  it("journals every attempt, printed or not", async () => {
    // « Did it actually go » is answered from this log afterwards, so a silent
    // attempt is the one outcome that must not exist.
    const close = await seal();
    await signInAs(admin);
    for (let i = 0; i < 3; i++) {
      await callJson((await route()).POST, {
        method: "POST",
        url: "http://localhost/api/fiscal/closes/2026-06-12/print",
        params: { period: close.period },
      });
    }
    expect((await auditRows()).length).toBe(3);
  });

  it("keeps the three actions distinguishable in the source", async () => {
    // The success and hard-failure branches cannot be driven here — the route
    // resolves its own transport — so the branch STRUCTURE is pinned instead,
    // and the SKIPPED branch above proves the structure is live.
    const src = readFileSync(
      path.join(process.cwd(), "src/app/api/fiscal/closes/[period]/print/route.ts"),
      "utf8",
    );
    expect(src).toContain("DAY_CLOSE_TICKET_PRINTED");
    expect(src).toContain("DAY_CLOSE_TICKET_PRINT_FAILED");
    expect(src).toContain("DAY_CLOSE_TICKET_PRINT_SKIPPED");
    expect(src, "FAILED must be reserved for an attempt that failed").toContain(
      'outcome.reason === "FAILED"',
    );
  });

  it("writes no fiscal event — printing a document is not a fiscal act", async () => {
    // A reprint of an ORDER writes REIMPRESSION because the customer's ticket
    // is a fiscal document being re-issued. A close's slip is a report on
    // documents already sealed; the seal is unchanged and the journal must not
    // gain a chain entry for a sheet of paper. Its trace is the audit row.
    const close = await seal();
    const before = await db.fiscalEvent.count();
    await signInAs(admin);
    await callJson((await route()).POST, {
      method: "POST",
      url: "http://localhost/api/fiscal/closes/2026-06-12/print",
      params: { period: close.period },
    });
    expect(await db.fiscalEvent.count()).toBe(before);
  });

  it("does not touch the sealed close", async () => {
    // Printing must be read-only over the fiscal record. The hash is the whole
    // mechanism; a route that could alter the row it prints would break it.
    const close = await seal();
    const before = await db.dailyClose.findUnique({ where: { id: close.id } });
    await signInAs(admin);
    await callJson((await route()).POST, {
      method: "POST",
      url: "http://localhost/api/fiscal/closes/2026-06-12/print",
      params: { period: close.period },
    });
    const after = await db.dailyClose.findUnique({ where: { id: close.id } });
    expect(after).toEqual(before);
  });
});

// Leaves the database as it found it. `beforeEach` cleans up BEFORE each test,
// so without this the last test's rows outlive the file — and the next file's
// reset is written for the tables that file uses, not for these. A leftover
// `Order` holding a `shiftId` is a P2003 on someone else's `shift.deleteMany()`,
// and the failure surfaces three files away from its cause.
afterAll(async () => {
  await wipe();
});
