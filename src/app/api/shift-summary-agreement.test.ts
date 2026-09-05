import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { hashPin } from "@/lib/auth";
import { GET as shiftSummary } from "@/app/api/shifts/summary/route";
import { GET as xReport } from "@/app/api/reports/x/route";

// L-48 (Batch 7.4a) — the shift panel and the X report must answer the same
// `expectedCash` for the same till.
//
// THE FINDING. `shifts/summary/route.ts` computed
// `openingFloat + grossCashTotal - cashRefundsTotal`, while `reports.ts`
// computed the same expression **plus `cash.net`** — M-05's whole point, since
// without it a 200 € supplier payment shows up as a 200 € shortfall at every
// close. Measured on a copy of production during Batch 5.6's walkthrough: with
// zero movements both endpoints answered **21 580**; after one +50,00 €
// approvisionnement they answered **21 580 and 26 580**.
//
// WHY A TEST RATHER THAN A FIX ALONE. The row asked for both, and the reason is
// in the finding's own history: this is M-14 — "a fourth aggregation semantic"
// — reopening at the exact endpoint M-14 was about, after Batch 5.5 moved five
// callers onto `cash.net` and missed this one. A fix without an assertion is
// the same repair for the third time. **Driven over HTTP**, because the claim
// is about what the two ENDPOINTS answer, not about what two helpers compute.
//
// The panel was latent when the finding was recorded — nothing in `src/` fetched
// it — and that protection ends the moment anything wires the live shift panel
// up, which is what the endpoint exists for.

const PIN = "515151";
let manager: { id: string };

async function wipe() {
  await db.cashMovement.deleteMany();
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.zReport.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.refund.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
  await ensureFiscalCounter();
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  manager = await db.user.create({
    data: { username: "l48-manager", name: "L48", role: "MANAGER", pinHash: await hashPin(PIN) },
  });
  await signInAs({ id: manager.id, username: "l48-manager", role: "MANAGER" });
});

afterAll(clearCookies);

async function openTill(openingFloat: number) {
  return db.shift.create({
    data: { number: 1, status: "OPEN", openingFloat, openedById: manager.id, openedAt: new Date() },
  });
}

/** Both endpoints' `expectedCash`, for the currently open till. */
async function bothExpectedCash(): Promise<{ panel: number; xreport: number }> {
  const panel = await callJson<{ expectedCash: number }>(shiftSummary, {
    url: "http://localhost/api/shifts/summary",
  });
  const x = await callJson<{ expectedCash: number }>(xReport, {
    url: "http://localhost/api/reports/x",
  });
  expect(panel.status).toBe(200);
  expect(x.status).toBe(200);
  return { panel: panel.body.expectedCash, xreport: x.body.expectedCash };
}

describe("L-48 — the shift panel and the X report agree on expectedCash", () => {
  it("agree when the till has no cash movements", async () => {
    // The control. This case passed BEFORE the fix too — which is exactly why
    // it was not noticed: the disagreement only appears once a movement exists.
    await openTill(21_580);
    const { panel, xreport } = await bothExpectedCash();
    expect(panel).toBe(21_580);
    expect(panel).toBe(xreport);
  });

  it("agree after an approvisionnement — the case that used to disagree", async () => {
    const shift = await openTill(21_580);
    await db.cashMovement.create({
      data: {
        shiftId: shift.id,
        category: "APPROVISIONNEMENT",
        amount: 5_000, // +50,00 €
        reason: "Fond de caisse complémentaire",
        cashierId: manager.id,
      },
    });

    const { panel, xreport } = await bothExpectedCash();
    // The measured numbers from the finding, reproduced: the panel used to
    // answer 21 580 here while the X report answered 26 580.
    expect(xreport).toBe(26_580);
    expect(panel).toBe(26_580);
    expect(panel).toBe(xreport);
  });

  it("agree when money LEAVES the drawer, which is the direction that hides a shortfall", async () => {
    // A supplier paid in cash. Before M-05 this read as a 200 € shortfall at
    // the close, every time — which is how staff learn to ignore the variance
    // figure. The panel must not reintroduce that reading.
    const shift = await openTill(30_000);
    await db.cashMovement.create({
      data: {
        shiftId: shift.id,
        category: "DEPENSE",
        amount: -20_000, // −200,00 €
        reason: "Fournisseur",
        cashierId: manager.id,
      },
    });

    const { panel, xreport } = await bothExpectedCash();
    expect(panel).toBe(10_000);
    expect(panel).toBe(xreport);
  });

  it("agree across several movements in both directions", async () => {
    const shift = await openTill(10_000);
    for (const [category, amount, reason] of [
      ["APPROVISIONNEMENT", 5_000, "Appoint"],
      ["PRELEVEMENT", -3_000, "Dépôt banque"],
      ["ERREUR_DE_CAISSE", -150, "Erreur de rendu"],
    ] as const) {
      await db.cashMovement.create({
        data: { shiftId: shift.id, category, amount, reason, cashierId: manager.id },
      });
    }

    const { panel, xreport } = await bothExpectedCash();
    expect(panel).toBe(10_000 + 5_000 - 3_000 - 150);
    expect(panel).toBe(xreport);
  });

  it("ignores another till's movements — the scoping both endpoints must share", async () => {
    // `shiftCashMovementsWhere` scopes to the till the money physically moved
    // through. If the two endpoints ever scope differently, they disagree again
    // for a reason the term-by-term comparison above would not catch.
    const open = await openTill(10_000);
    const other = await db.shift.create({
      data: {
        number: 2,
        status: "CLOSED",
        openingFloat: 0,
        openedById: manager.id,
        openedAt: new Date(Date.now() - 86_400_000),
        closedAt: new Date(Date.now() - 80_000_000),
      },
    });
    await db.cashMovement.create({
      data: {
        shiftId: other.id,
        category: "APPROVISIONNEMENT",
        amount: 99_999,
        reason: "Another till entirely",
        cashierId: manager.id,
      },
    });
    await db.cashMovement.create({
      data: {
        shiftId: open.id,
        category: "APPROVISIONNEMENT",
        amount: 2_500,
        reason: "This till",
        cashierId: manager.id,
      },
    });

    const { panel, xreport } = await bothExpectedCash();
    expect(panel).toBe(12_500);
    expect(panel).toBe(xreport);
  });
});
