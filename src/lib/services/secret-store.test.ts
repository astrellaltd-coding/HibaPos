import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import os from "os";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import {
  GENERATED_SECRETS,
  CHAIN_KEY,
  resolveSecret,
  bootstrapSecrets,
  armChainKey,
  acknowledgeSecrets,
  secretsAwaitingRecord,
  unacknowledgedSecrets,
  chainKeyArmed,
  secretStorePath,
} from "@/lib/services/secret-store";

// FIRST-RUN SECRETS (operator, 2026-09-11).
//
// ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
// The app ships as a Tauri installer and install day runs no commands, so an
// install with no `.env` has to start. `auth.ts` used to throw at import
// without `SESSION_SECRET`, which for an installer means refusing to be
// installed.
//
// ── THE PROPERTY THAT MAKES THE CHANGE SAFE, AND IT IS TESTED FIRST ─────────
// **The environment always wins.** The existing install holds every secret in
// `.env`, and `test-setup.ts` sets them for this suite — so if that property
// broke, this suite would start writing a `secrets.json` and the whole change
// would have leaked into a live install. It is asserted before anything else.
//
// ── NO ASSERTION IN THIS FILE PRINTS A SECRET ───────────────────────────────
// Values are compared by length, by shape and against each other. A test that
// echoed one would put it in CI output, which is the thing Batch 7.3's rule
// exists to stop.

const REAL_DATA_DIR = process.env.HIBAPOS_DATA_DIR;
const REAL_ENV: Record<string, string | undefined> = {};
let sandbox: string;

/** A data directory of its own, so nothing here can reach the real store. */
function useSandbox() {
  sandbox = path.join(os.tmpdir(), `hibapos-secret-store-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(path.join(sandbox, "db"), { recursive: true });
  process.env.HIBAPOS_DATA_DIR = sandbox;
  // Guard the guard: if the path did not move, every test below would be
  // writing into the install's own store.
  expect(secretStorePath().startsWith(sandbox)).toBe(true);
  expect(secretStorePath()).toContain(os.tmpdir());
}

function clearEnv() {
  for (const name of [...GENERATED_SECRETS, CHAIN_KEY]) {
    REAL_ENV[name] = process.env[name];
    delete process.env[name];
  }
}

function restoreEnv() {
  for (const [k, v] of Object.entries(REAL_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function storeContents() {
  return JSON.parse(readFileSync(secretStorePath(), "utf8")) as {
    secrets: Record<string, string>;
    unacknowledged: string[];
  };
}

afterEach(() => {
  restoreEnv();
  if (REAL_DATA_DIR === undefined) delete process.env.HIBAPOS_DATA_DIR;
  else process.env.HIBAPOS_DATA_DIR = REAL_DATA_DIR;
  if (sandbox && existsSync(sandbox)) rmSync(sandbox, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. The environment wins — the property the whole change rests on
// ---------------------------------------------------------------------------

describe("the environment always wins", () => {
  it("uses the environment's value and writes no store at all", () => {
    useSandbox();
    // `test-setup.ts` already set this for the suite; assert rather than assume.
    expect(process.env.SESSION_SECRET, "the suite's own secret is missing").toBeTruthy();

    const r = resolveSecret("SESSION_SECRET");
    expect(r.source).toBe("environment");
    expect(r.value).toBe(process.env.SESSION_SECRET);
    // THE ASSERTION THAT PROTECTS THE LIVE INSTALL: nothing was persisted.
    expect(existsSync(secretStorePath())).toBe(false);
  });

  it("leaves an install with a .env completely untouched", () => {
    useSandbox();
    const before = { ...process.env };
    bootstrapSecrets();
    for (const name of GENERATED_SECRETS) {
      expect(process.env[name]).toBe(before[name]);
    }
    expect(existsSync(secretStorePath())).toBe(false);
    expect(unacknowledgedSecrets()).toEqual([]);
  });

  it("refuses an environment value that is too short, naming the variable only", () => {
    useSandbox();
    process.env.SESSION_SECRET = "tooshort";
    try {
      resolveSecret("SESSION_SECRET");
      throw new Error("should have refused");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("SESSION_SECRET");
      expect(msg).toContain("32");
      // The rule: the message names the variable and never the value.
      expect(msg).not.toContain("tooshort");
    }
  });
});

// ---------------------------------------------------------------------------
// 2. A fresh install with nothing set
// ---------------------------------------------------------------------------

describe("an install with no environment makes its own", () => {
  it("generates both boot secrets, 64 hex characters each, and persists them", () => {
    useSandbox();
    clearEnv();

    const { generated } = bootstrapSecrets();
    expect(generated.sort()).toEqual([...GENERATED_SECRETS].sort());

    for (const name of GENERATED_SECRETS) {
      const v = process.env[name];
      expect(v, name).toBeTruthy();
      expect(v!.length, name).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(v!), name).toBe(true);
    }
    // The two are not the same secret — a single source reused for both would
    // mean a stolen session key also opens every backup.
    expect(process.env.SESSION_SECRET).not.toBe(process.env.BACKUP_ENCRYPTION_KEY);

    const store = storeContents();
    expect(Object.keys(store.secrets).sort()).toEqual([...GENERATED_SECRETS].sort());
    expect(store.unacknowledged.sort()).toEqual([...GENERATED_SECRETS].sort());
  });

  it("is idempotent: a second boot reuses what the first one wrote", () => {
    useSandbox();
    clearEnv();
    bootstrapSecrets();
    const first = { ...storeContents().secrets };

    // A restart: the process env is cleared again, the file is not.
    clearEnv();
    const { generated } = bootstrapSecrets();
    expect(generated).toEqual([]); // nothing new was made
    expect(storeContents().secrets).toEqual(first);
    expect(process.env.SESSION_SECRET).toBe(first.SESSION_SECRET);
  });

  it("does NOT create the fiscal chain key by booting", () => {
    // The ordering rule, at the level of « what can happen by accident ».
    // A key armed as a side effect of starting is a key armed at a moment
    // nobody chose — and DD-25 says it is armed once, on an empty journal.
    useSandbox();
    clearEnv();
    bootstrapSecrets();

    expect(process.env[CHAIN_KEY]).toBeUndefined();
    expect(Object.keys(storeContents().secrets)).not.toContain(CHAIN_KEY);
    expect(() => resolveSecret(CHAIN_KEY)).toThrow(/not armed/);
  });

  it("restores an ALREADY ARMED chain key on the next boot", () => {
    // Otherwise an install would forget it had been armed the moment it
    // restarted, and every hash written before the restart would stop
    // verifying — which looks exactly like tampering.
    useSandbox();
    clearEnv();
    bootstrapSecrets();
    const armed = armChainKey().value;

    clearEnv();
    bootstrapSecrets();
    expect(process.env[CHAIN_KEY]).toBe(armed);
  });

  it("refuses to overwrite a store it cannot read", () => {
    // The worst available outcome is replacing a `BACKUP_ENCRYPTION_KEY` and
    // making every existing backup unreadable. A corrupt file is therefore a
    // refusal, not a fresh start.
    useSandbox();
    clearEnv();
    writeFileSync(secretStorePath(), "{ this is not json", "utf8");
    expect(() => bootstrapSecrets()).toThrow(/unreadable/);
    // And it did not replace it.
    expect(readFileSync(secretStorePath(), "utf8")).toContain("not json");
  });
});

// ---------------------------------------------------------------------------
// 3. Arming, and acknowledgement
// ---------------------------------------------------------------------------

describe("arming the chain key", () => {
  it("returns the same key on a second call rather than making another", () => {
    // Re-arming would orphan every hash already computed under the first key.
    useSandbox();
    clearEnv();
    bootstrapSecrets();

    const first = armChainKey();
    expect(first.alreadyArmed).toBe(false);
    expect(first.value).toMatch(/^[0-9a-f]{64}$/);

    const second = armChainKey();
    expect(second.alreadyArmed).toBe(true);
    expect(second.value).toBe(first.value);
  });

  it("puts the armed key where fiscalChainKey() reads from", async () => {
    // `fiscal-key.ts` reads `process.env` on EVERY call by design. This is the
    // seam that makes the store work without touching that function.
    useSandbox();
    clearEnv();
    bootstrapSecrets();
    armChainKey();

    const { isChainKeyed, fiscalChainKey } = await import("@/lib/fiscal-key");
    expect(isChainKeyed()).toBe(true);
    expect(fiscalChainKey()).toBe(process.env[CHAIN_KEY]);
  });
});

describe("acknowledgement is what stops a key being lost", () => {
  it("lists every generated key as awaiting a record, with its value", () => {
    useSandbox();
    clearEnv();
    bootstrapSecrets();
    const pending = secretsAwaitingRecord();
    expect(pending.map((p) => p.name).sort()).toEqual([...GENERATED_SECRETS].sort());
    for (const p of pending) expect(p.value.length).toBe(64);
  });

  it("stops returning a value once it has been acknowledged", () => {
    useSandbox();
    clearEnv();
    bootstrapSecrets();
    const { remaining } = acknowledgeSecrets(["SESSION_SECRET"]);
    expect(remaining).toEqual(["BACKUP_ENCRYPTION_KEY"]);
    expect(secretsAwaitingRecord().map((p) => p.name)).toEqual(["BACKUP_ENCRYPTION_KEY"]);

    acknowledgeSecrets(["BACKUP_ENCRYPTION_KEY"]);
    expect(secretsAwaitingRecord()).toEqual([]);
    // Acknowledged, not deleted: the application still has to read them.
    expect(Object.keys(storeContents().secrets).sort()).toEqual([...GENERATED_SECRETS].sort());
  });

  it("survives a restart — acknowledgement is a fact, not a session state", () => {
    useSandbox();
    clearEnv();
    bootstrapSecrets();
    acknowledgeSecrets([...GENERATED_SECRETS]);
    clearEnv();
    bootstrapSecrets();
    expect(unacknowledgedSecrets()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. The routes — what a client can actually reach
// ---------------------------------------------------------------------------

describe("the setup routes", () => {
  beforeEach(async () => {
    clearCookies();
    // FK-safe order, and it has to be the FULL order rather than the four
    // tables this file touches. `User` is the parent of `Order.cashierId`,
    // `Shift.openedById` and more — so deleting users while an earlier test
    // file's orders are still present is a foreign-key violation. It passes in
    // isolation and fails in the suite, which is L-40 exactly: files clean up
    // before each test and not after, so what is already in the database
    // depends on what ran first.
    await db.fiscalEvent.deleteMany();
    await db.auditLog.deleteMany();
    await db.dailyClose.deleteMany();
    await db.monthlyClose.deleteMany();
    await db.annualClose.deleteMany();
    await db.zReport.deleteMany();
    await db.payment.deleteMany();
    await db.receipt.deleteMany();
    await db.refund.deleteMany();
    await db.orderItem.deleteMany();
    await db.order.deleteMany();
    await db.customer.deleteMany();
    await db.cashMovement.deleteMany();
    await db.shift.deleteMany();
    await db.grandTotal.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany();
    await db.fiscalCounter.deleteMany();
    await ensureFiscalCounter();
    const u = await db.user.create({
      data: {
        username: `sec-${Date.now()}-${Math.random()}`,
        name: "Dev",
        role: "SUPER_ADMIN",
        pinHash: await hashPin("515151"),
      },
    });
    await signInAs({ id: u.id, username: u.username, role: "SUPER_ADMIN" });
  });

  it("GET returns the pending keys, and nothing once acknowledged", async () => {
    useSandbox();
    clearEnv();
    bootstrapSecrets();

    const mod = await import("@/app/api/setup/secrets/route");
    const first = await callJson<{ pending: { name: string; value: string }[] }>(mod.GET, {
      url: "http://localhost/api/setup/secrets",
    });
    expect(first.status).toBe(200);
    expect(first.body.pending.map((p) => p.name).sort()).toEqual([...GENERATED_SECRETS].sort());

    const ack = await callJson<{ remaining: string[] }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/setup/secrets",
      body: { names: [...GENERATED_SECRETS] },
    });
    expect(ack.status).toBe(200);
    expect(ack.body.remaining).toEqual([]);

    // THE ASSERTION THAT BOUNDS THE EXPOSURE: the route cannot be used to read
    // a key back after it has been acknowledged.
    const second = await callJson<{ pending: unknown[] }>(mod.GET, {
      url: "http://localhost/api/setup/secrets",
    });
    expect(second.body.pending).toEqual([]);
  });

  it("reports chainArmed as a FACT, distinguishing never-armed from armed-and-recorded", async () => {
    // The bug this exists for: the screen first derived « armed » from the
    // absence of the key in the pending list. That is true in TWO opposite
    // states — never armed, and armed then acknowledged — so the card would
    // have offered to arm a key that was already protecting a journal.
    useSandbox();
    clearEnv();
    bootstrapSecrets();

    const mod = await import("@/app/api/setup/secrets/route");
    const before = await callJson<{ chainArmed: boolean }>(mod.GET, {
      url: "http://localhost/api/setup/secrets",
    });
    expect(before.body.chainArmed).toBe(false);
    expect(chainKeyArmed()).toBe(false);

    armChainKey();
    acknowledgeSecrets([CHAIN_KEY]); // recorded, so it leaves `pending`

    const after = await callJson<{ chainArmed: boolean; pending: { name: string }[] }>(mod.GET, {
      url: "http://localhost/api/setup/secrets",
    });
    // The chain key is ABSENT from `pending` — and armed. Those are the two
    // answers the old derivation collapsed into one. The other two secrets are
    // still pending here, which is why the assertion names the chain key
    // rather than counting the list.
    expect(after.body.pending.map((p) => p.name)).not.toContain(CHAIN_KEY);
    expect(after.body.chainArmed).toBe(true);
  });

  it("records the acknowledgement in the audit log, by NAME and never by value", async () => {
    useSandbox();
    clearEnv();
    bootstrapSecrets();
    const secret = process.env.SESSION_SECRET!;

    const mod = await import("@/app/api/setup/secrets/route");
    await callJson(mod.POST, {
      method: "POST",
      url: "http://localhost/api/setup/secrets",
      body: { names: ["SESSION_SECRET"] },
    });

    const row = await db.auditLog.findFirstOrThrow({ where: { action: "SECRETS_ACKNOWLEDGED" } });
    expect(row.details).toContain("SESSION_SECRET");
    expect(row.details).not.toContain(secret);
  });

  it("refuses to arm the chain key while the journal holds anything", async () => {
    useSandbox();
    clearEnv();
    bootstrapSecrets();

    // One event is enough: a mixed chain verifies under neither mode.
    await db.fiscalEvent.create({
      data: {
        sequence: 1,
        type: "VENTE",
        dataJson: "{}",
        hash: "deadbeef",
        previousHash: null,
        factice: false,
      },
    });

    const mod = await import("@/app/api/setup/chain-key/route");
    const res = await callJson<{ error?: string; events?: number }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/setup/chain-key",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("journal vide");
    expect(res.body.events).toBe(1);
    // And it did not arm anything on the way to refusing.
    expect(process.env[CHAIN_KEY]).toBeUndefined();
  });

  it("arms it on an empty journal, journals that fact, and is idempotent", async () => {
    useSandbox();
    clearEnv();
    bootstrapSecrets();
    expect(await db.fiscalEvent.count()).toBe(0);

    const mod = await import("@/app/api/setup/chain-key/route");
    const first = await callJson<{ value: string; alreadyArmed: boolean }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/setup/chain-key",
    });
    expect(first.status).toBe(200);
    expect(first.body.alreadyArmed).toBe(false);
    expect(first.body.value).toMatch(/^[0-9a-f]{64}$/);

    const row = await db.auditLog.findFirstOrThrow({ where: { action: "FISCAL_CHAIN_KEY_ARMED" } });
    expect(row.details).toContain(CHAIN_KEY);
    expect(row.details).not.toContain(first.body.value);

    const second = await callJson<{ value: string; alreadyArmed: boolean }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/setup/chain-key",
    });
    expect(second.body.alreadyArmed).toBe(true);
    expect(second.body.value).toBe(first.body.value);
    // Armed once. A second row would mean a second key.
    expect(await db.auditLog.count({ where: { action: "FISCAL_CHAIN_KEY_ARMED" } })).toBe(1);
  });

  afterAll(clearCookies);
});
