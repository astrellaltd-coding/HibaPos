import { describe, it, expect, beforeEach } from "vitest";
// Only `mock` comes from bun:test — `src/types/bun-test.d.ts` declares that one
// function on purpose (Batch 6.1), so reaching for more of it is a type error.
import { mock } from "bun:test";
import { db } from "@/lib/db";
import { ensureFiscalCounter } from "@/lib/services/sequence";

// L-31 (Batch 7.4c) — `POST /api/seed` must not report a failure as success.
//
// THE FINDING. The catalogue step was wrapped in a bare `catch` that returned
// « Base initialisée (requête concurrente). » for EVERY error, so an operator
// was told the database was initialised when the catalogue had not been seeded
// at all. Observed during Batch 4.3's validation: on a copy whose users were
// empty but whose catalogue was intact, `seedCatalogAndSettings` threw on
// duplicate category names and the route answered **200** with that message.
//
// The users branch directly above it already distinguished the genuine race —
// P2002, the unique-constraint violation — from everything else. This is that
// same distinction, applied one branch down.
//
// The service is stubbed rather than provoked, because the point is what the
// ROUTE does with each kind of failure, and a real duplicate-name collision
// only reproduces the P2002 half.

const realSeed = await import("@/lib/services/seed");
const realSeedCatalog = realSeed.seedCatalogAndSettings;
let throwsWith: unknown = null;

mock.module("@/lib/services/seed", () => ({
  ...realSeed,
  seedCatalogAndSettings: async (adminId: string) => {
    if (throwsWith) throw throwsWith;
    return realSeedCatalog(adminId);
  },
}));

const { POST: seed } = await import("@/app/api/seed/route");

async function wipe() {
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.setting.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
  await ensureFiscalCounter();
}

async function callSeed() {
  // `POST` takes no argument — the route reads its own session and counts.
  const res = await seed();
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(async () => {
  throwsWith = null;
  await wipe();
});

describe("L-31 — a failed catalogue seed is reported as a failure", () => {
  it("reports a REAL failure as a failure, naming what did and did not happen", async () => {
    throwsWith = new Error("disk on fire");
    const { status, body } = await callSeed();

    expect(status).toBe(500);
    expect(body.ok).toBe(false);
    // The operator needs both halves: the accounts exist, the catalogue does
    // not. Being told only "erreur" would leave them unsure whether to re-run.
    expect(String(body.message)).toContain("comptes ont été créés");
    expect(String(body.message)).toContain("catalogue n'a PAS été initialisé");
    expect(body.users).toBe(2);

    // …and the claim is true: the two bootstrap accounts really were created.
    expect(await db.user.count()).toBe(2);
    expect(await db.category.count()).toBe(0);
  });

  it("still reports a GENUINE lost race as success — P2002, as the users branch does", async () => {
    throwsWith = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const { status, body } = await callSeed();

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(String(body.message)).toContain("requête concurrente");
  });

  it("CONTROL: a clean seed still succeeds and says so", async () => {
    const { status, body } = await callSeed();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.users).toBe(2);
    // The catalogue really was seeded — so the failure branch above is not
    // passing for the trivial reason that seeding never works here.
    expect(await db.category.count()).toBeGreaterThan(0);
  });
});
