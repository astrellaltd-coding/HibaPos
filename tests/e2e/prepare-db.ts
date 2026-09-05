#!/usr/bin/env bun
// T-10 / T-11 (Batch 6.3) — build the e2e suite's own database and seed it.
//
// A standalone bun script rather than Playwright's `globalSetup`, for two
// reasons found by running it:
//
//   1. Playwright starts `webServer` BEFORE `globalSetup`, so the server came
//      up pointed at a database directory that did not exist yet and logged
//      "Error code 14: Unable to open the database file".
//   2. Playwright's runner does not resolve this project's `@/*` path alias,
//      so importing the application's own `hashPin` failed outright — and
//      hand-rolling the hash instead would seed a PIN the app cannot verify.
//
// Run by `bun run test:e2e` before the build and before Playwright, under bun,
// which resolves the alias and gives the ordering guarantee.
import { execSync } from "child_process";
import { mkdirSync, rmSync } from "fs";
import {
  E2E_DIR,
  E2E_DATABASE_URL,
  E2E_USERNAME,
  E2E_PIN,
  e2eServerEnv,
  assertDisposableE2eDatabase,
} from "./env";

// FIRST. Before anything is created, wiped or connected to.
assertDisposableE2eDatabase();

// A fresh database every run — half of T-11. The suite was not re-runnable:
// `03-shift-flow.spec.ts` opened a shift and never closed it, so the next
// run's `POST /api/shifts` got 409 where it expected 200. The specs now clean
// up after themselves AND start from nothing, because either alone leaves a
// way to get stuck.
rmSync(E2E_DIR, { recursive: true, force: true });
mkdirSync(E2E_DIR, { recursive: true });

const env = { ...process.env, ...e2eServerEnv() };
execSync("bunx prisma db push --skip-generate --accept-data-loss", {
  stdio: "pipe",
  timeout: 120_000,
  env,
});

process.env.DATABASE_URL = E2E_DATABASE_URL;
process.env.HIBAPOS_DATA_DIR = E2E_DIR;
process.env.SESSION_SECRET = env.SESSION_SECRET;
process.env.BACKUP_ENCRYPTION_KEY = env.BACKUP_ENCRYPTION_KEY;

const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
try {
  // The application's OWN hashing. A seeded PIN the app cannot verify would
  // fail every spec at login for a reason that has nothing to do with them —
  // which is exactly what the hardcoded `admin` / `123456` had been doing
  // since the operator changed the live PINs on 2026-09-04.
  const { hashPin } = await import("@/lib/auth");
  await db.fiscalCounter.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
  await db.user.create({
    data: {
      username: E2E_USERNAME,
      name: "E2E Admin",
      role: "SUPER_ADMIN",
      pinHash: await hashPin(E2E_PIN),
      active: true,
    },
  });
  const category = await db.category.create({
    data: { name: "E2E", color: "#888888", sortOrder: 1, active: true },
  });
  await db.product.create({
    data: {
      name: "E2E Tacos",
      price: 1000,
      vatRate: 10,
      categoryId: category.id,
      active: true,
      available: true,
    },
  });
  console.log(`[e2e] disposable database ready: ${E2E_DATABASE_URL}`);
  console.log(`[e2e] seeded operator: ${E2E_USERNAME}`);
} finally {
  await db.$disconnect();
}
