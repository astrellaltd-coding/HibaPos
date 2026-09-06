import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { hashPin } from "@/lib/auth";
import { GET as verify } from "@/app/api/fiscal/verify/route";

// L-53 (Batch 3.7) — the running software states its version to an
// authenticated operator.
//
// Driven over the route, not the module: the claim is that the screen a
// control is shown gets the version from the SERVER that is running, and the
// fiscal screen reads exactly this endpoint. `GET /api` — the unauthenticated
// liveness probe — stays mute on purpose (C-27), which the last case pins.

const PIN = "535353";

beforeEach(async () => {
  clearCookies();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
  await ensureFiscalCounter();
  const manager = await db.user.create({
    data: { username: "l53-manager", name: "L53", role: "MANAGER", pinHash: await hashPin(PIN) },
  });
  await signInAs({ id: manager.id, username: "l53-manager", role: "MANAGER" });
});

afterAll(clearCookies);

describe("L-53 — GET /api/fiscal/verify names the software and its version", () => {
  it("answers the version package.json declares", async () => {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      version: string;
    };
    const res = await callJson<{ software?: { name: string; version: string } }>(verify, {
      url: "http://localhost/api/fiscal/verify",
    });
    expect(res.status).toBe(200);
    expect(res.body.software).toEqual({ name: "HibaPOS France", version: pkg.version });
  });

  it("reports the trading-day close chain beside the other three (DD-23)", async () => {
    // The control an inspector may ask for has to walk every sealed chain. The
    // day close is one, and a chain the verification does not visit is a chain
    // nobody checks.
    const res = await callJson<{
      fiscalEvents: { ok: boolean };
      dailyCloses?: { ok: boolean; eventsChecked: number };
      monthlyCloses: { ok: boolean };
      annualCloses: { ok: boolean };
    }>(verify, { url: "http://localhost/api/fiscal/verify" });
    expect(res.status).toBe(200);
    expect(res.body.dailyCloses).toBeDefined();
    expect(res.body.dailyCloses!.ok).toBe(true);
    expect(res.body.dailyCloses!.eventsChecked).toBe(0);
  });

  it("the liveness probe still says nothing about the version (C-27)", async () => {
    const { GET: probe } = await import("@/app/api/route");
    const res = await probe();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("software");
    expect(body).not.toHaveProperty("version");
    expect(JSON.stringify(body)).not.toMatch(/\d+\.\d+\.\d+/);
  });
});
