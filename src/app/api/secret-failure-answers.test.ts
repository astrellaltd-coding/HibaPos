import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import path from "path";
import os from "os";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { CHAIN_KEY } from "@/lib/services/secret-store";
import { withAuth } from "@/lib/api-handler";
import { ChainKeyMisconfiguredError } from "@/lib/fiscal-key";
import { SecretMisconfiguredError } from "@/lib/services/secret-store";

// R9.4 — the configuration failures reach the operator as WORDS.
//
// L-115 and L-116 are both « the till answers 500 with nothing in the body »,
// and L-119 is « a route hands back a key it should have stopped showing ».
// None of the three is visible below the HTTP boundary, so this file drives the
// real handlers through `route-harness.ts`.
//
// WHY THE TWO WRAPPER CASES USE A PROBE HANDLER. Reproducing L-115 end to end
// needs a malformed `FISCAL_CHAIN_KEY` in the environment at the moment a
// fiscal route runs, and this suite shares one process with 130 other files —
// arming a broken key globally would break them, not test them. What the
// finding is actually about is the MAPPING: a typed error thrown inside a
// handler must come back as a French 503 rather than an empty 500. That is
// exactly what a probe handler wrapped in the real `withAuth` measures, and
// `secrets-resolve.test.ts` proves separately that the real code throws the
// typed error. The two halves meet.

const PIN = "424242";
let admin: { id: string; username: string; role: "SUPER_ADMIN" };
let manager: { id: string; username: string; role: "MANAGER" };
let sandbox: string;

// A DATA DIRECTORY OF ITS OWN, per test.
//
// `armChainKey()` writes `secrets.json` and parks `FISCAL_CHAIN_KEY` in
// `process.env`. Without this the first test arms the key for the whole run —
// so the read-back counting test saw three read-backs instead of two, and every
// later file in the suite would have believed the chain was keyed. The env var
// is restored as carefully as the directory, because that one leaves the
// process rather than the disk.
const REAL_ENV: Record<string, string | undefined> = {};
const SANDBOXED = ["HIBAPOS_DATA_DIR", "BACKUP_LOCATION", "FISCAL_CHAIN_KEY"];

async function wipe(): Promise<void> {
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.fiscalEvent.deleteMany();
  await db.fiscalCounter.deleteMany();
  await db.user.deleteMany();
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  await ensureFiscalCounter();

  const stamp = `${Date.now()}-${Math.random()}`;
  const a = await db.user.create({
    data: { username: `r94-sa-${stamp}`, name: "Admin", role: "SUPER_ADMIN", pinHash: await hashPin(PIN) },
  });
  const m = await db.user.create({
    data: { username: `r94-mgr-${stamp}`, name: "Resp", role: "MANAGER", pinHash: await hashPin(PIN) },
  });
  admin = { id: a.id, username: a.username, role: "SUPER_ADMIN" };
  manager = { id: m.id, username: m.username, role: "MANAGER" };

  for (const name of SANDBOXED) {
    if (!(name in REAL_ENV)) REAL_ENV[name] = process.env[name];
    delete process.env[name];
  }
  sandbox = path.join(os.tmpdir(), `hibapos-r94-routes-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(path.join(sandbox, "db"), { recursive: true });
  process.env.HIBAPOS_DATA_DIR = sandbox;
  process.env.BACKUP_LOCATION = path.join(sandbox, "db", "backups");
  // Guard the guard: without this every test below writes the install's store.
  const { secretStorePath } = await import("@/lib/services/secret-store");
  expect(secretStorePath().startsWith(sandbox)).toBe(true);
});

afterEach(() => {
  if (sandbox && existsSync(sandbox)) rmSync(sandbox, { recursive: true, force: true });
  for (const name of SANDBOXED) {
    if (REAL_ENV[name] === undefined) delete process.env[name];
    else process.env[name] = REAL_ENV[name];
  }
});

afterAll(async () => {
  await wipe();
});

describe("L-115 / L-116 — a configuration failure is answered, not swallowed", () => {
  it("turns a chain-key refusal into a French 503, not an empty 500", async () => {
    // THE FINDING, at the boundary where it was measured: the audit started the
    // app with a short key, logged in successfully, and got HTTP 500 with a
    // ZERO-BYTE BODY from `POST /api/fiscal/drawer`. The cashier saw nothing.
    const probe = withAuth(async () => {
      throw new ChainKeyMisconfiguredError("FISCAL_CHAIN_KEY est mal configurée : test.");
    });
    await signInAs(admin);
    const res = await callJson<{ error: string }>(probe, {
      method: "POST",
      url: "http://localhost/api/fiscal/probe",
    });
    expect(res.status, "an unmapped throw is a 500 with no body").toBe(503);
    expect(res.body.error).toContain("FISCAL_CHAIN_KEY");
  });

  it("turns a secret misconfiguration into a French 503 too", async () => {
    const probe = withAuth(async () => {
      throw new SecretMisconfiguredError("SESSION_SECRET", "SESSION_SECRET est absente ou trop courte.");
    });
    await signInAs(admin);
    const res = await callJson<{ error: string }>(probe, {
      method: "POST",
      url: "http://localhost/api/probe",
    });
    expect(res.status).toBe(503);
    expect(res.body.error).toContain("SESSION_SECRET");
  });

  it("still lets an ordinary error be an ordinary error", async () => {
    // Without this the mapping above is satisfied by a wrapper that dresses
    // every failure as a configuration problem, which would hide real bugs.
    const probe = withAuth(async () => {
      throw new Error("something else went wrong");
    });
    await signInAs(admin);
    await expect(
      callJson(probe, { method: "POST", url: "http://localhost/api/probe" }),
    ).rejects.toThrow(/something else/);
  });

  it("answers the LOGIN route, which is not behind the wrapper", async () => {
    // The one the audit measured, and the one the wrapper cannot reach: an
    // unauthenticated operator meets `POST /api/auth/login` before any session
    // exists. It has to answer for itself.
    const src = await import("fs").then((fs) =>
      fs.readFileSync(path.join(process.cwd(), "src/app/api/auth/login/route.ts"), "utf8"),
    );
    expect(src).toContain("isSecretMisconfigured");
    expect(src).toContain("secretMisconfiguredResponse");
    // …inside the try that already catches the busy-scrypt case, so the two
    // configuration answers sit together rather than in two shapes.
    const block = src.slice(src.indexOf("return await login(req);"));
    expect(block.indexOf("isSecretMisconfigured")).toBeGreaterThan(0);
    expect(block.indexOf("isSecretMisconfigured")).toBeLessThan(block.indexOf("throw e;"));
  });

  it("does not throw at import any more, which is what produced the bare 500", async () => {
    // `auth.ts` and `approvals.ts` validated at MODULE LOAD, so a bad secret
    // failed the import and Next answered a 500 no handler could dress. Both
    // now resolve at import and refuse at use.
    for (const rel of ["src/lib/auth.ts", "src/lib/approvals.ts"]) {
      const src = await import("fs").then((fs) =>
        fs.readFileSync(path.join(process.cwd(), rel), "utf8"),
      );
      expect(src, `${rel} still resolves eagerly`).toContain("lazySecret(");
      expect(src, `${rel} still throws at module load`).not.toMatch(
        /^if \(!(SECRET|SESSION_SECRET)\) \{/m,
      );
    }
  });

  it("leaves approvals.ts reading the store, not process.env", async () => {
    // L-117: PREP-3 converted only `auth.ts`, and `resolveSecret()` does not
    // write `process.env` — only `bootstrapSecrets()` does, from the async
    // hook a route module can beat. So on an install with no `.env`,
    // `approvals.ts` threw at import while `auth.ts` resolved happily.
    // **The blast radius is the checkout**: orders, refunds, step-up and cash
    // movements are all in that module graph.
    const src = await import("fs").then((fs) =>
      fs.readFileSync(path.join(process.cwd(), "src/lib/approvals.ts"), "utf8"),
    );
    // COMMENTS STRIPPED FIRST. The fix's own comment explains what the file
    // used to read, so scanning the raw text matches the sentence describing
    // the thing it is asserting the absence of — measured, it failed on itself.
    const code = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(code.length, "everything was stripped — this would pass empty").toBeGreaterThan(500);
    expect(code, "approvals.ts is back on the old contract").not.toContain(
      "process.env.SESSION_SECRET",
    );
    expect(code).toContain('lazySecret("SESSION_SECRET")');
  });
});

describe("L-119 — the chain key stops being readable back", () => {
  async function route() {
    return import("@/app/api/setup/chain-key/route");
  }

  it("shows the key on the first arm, and journals it", async () => {
    await signInAs(admin);
    const mod = await route();
    const first = await callJson<{ value: string; alreadyArmed: boolean }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/setup/chain-key",
    });
    expect(first.status).toBe(200);
    expect(first.body.alreadyArmed).toBe(false);
    expect(first.body.value.length).toBeGreaterThanOrEqual(32);
    expect(await db.auditLog.count({ where: { action: "FISCAL_CHAIN_KEY_ARMED" } })).toBe(1);
  });

  it("still shows it while nobody has confirmed recording it", async () => {
    // The failure this whole flow exists to prevent is a key nobody wrote down.
    await signInAs(admin);
    const mod = await route();
    const first = await callJson<{ value: string }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/setup/chain-key",
    });
    const again = await callJson<{ value?: string; alreadyArmed: boolean }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/setup/chain-key",
    });
    expect(again.body.alreadyArmed).toBe(true);
    expect(again.body.value).toBe(first.body.value);
  });

  it("JOURNALS every read-back, which nothing did before", async () => {
    // THE FINDING's second half: the audit row was written only inside the
    // `!alreadyArmed` path, so every later disclosure was untraced.
    await signInAs(admin);
    const mod = await route();
    for (let i = 0; i < 3; i++) {
      await callJson(mod.POST, { method: "POST", url: "http://localhost/api/setup/chain-key" });
    }
    const reads = await db.auditLog.findMany({ where: { action: "FISCAL_CHAIN_KEY_READ_BACK" } });
    expect(reads.length, "two read-backs left no trace").toBe(2);
    for (const row of reads) {
      const d = JSON.parse(row.details ?? "{}") as Record<string, unknown>;
      expect(d.name).toBe(CHAIN_KEY);
      expect(d.disclosed, "the row must say whether the value was actually shown").toBe(true);
      // Names only, never values — the rule this feature already follows.
      expect(row.details).not.toContain(CHAIN_KEY.toLowerCase());
    }
  });

  it("STOPS showing it once the operator says they recorded it", async () => {
    // `setup/secrets/route.ts` documents the bound in the same feature: « After
    // POST, this route answers with nothing to show and cannot be used to read
    // a key back. » It could, through this sibling — on every call, for ever.
    await signInAs(admin);
    const mod = await route();
    await callJson(mod.POST, { method: "POST", url: "http://localhost/api/setup/chain-key" });

    const { acknowledgeSecrets } = await import("@/lib/services/secret-store");
    acknowledgeSecrets([CHAIN_KEY]);

    const after = await callJson<{
      value?: string;
      alreadyArmed: boolean;
      acknowledged?: boolean;
      message?: string;
    }>(mod.POST, { method: "POST", url: "http://localhost/api/setup/chain-key" });

    expect(after.status).toBe(200);
    expect(after.body.alreadyArmed).toBe(true);
    expect(after.body.value, "the key is still being handed back after acknowledgement").toBeUndefined();
    expect(after.body.acknowledged).toBe(true);
    // Not a dead end: it says where the key actually is.
    expect(after.body.message).toContain("secrets.json");
  });

  it("records the refusal to disclose, too", async () => {
    // « Somebody asked and was not shown » is as much a fact as « somebody was
    // shown », and reconstructing who saw the key later needs both.
    await signInAs(admin);
    const mod = await route();
    await callJson(mod.POST, { method: "POST", url: "http://localhost/api/setup/chain-key" });
    const { acknowledgeSecrets } = await import("@/lib/services/secret-store");
    acknowledgeSecrets([CHAIN_KEY]);
    await db.auditLog.deleteMany({ where: { action: "FISCAL_CHAIN_KEY_READ_BACK" } });

    await callJson(mod.POST, { method: "POST", url: "http://localhost/api/setup/chain-key" });

    const reads = await db.auditLog.findMany({ where: { action: "FISCAL_CHAIN_KEY_READ_BACK" } });
    expect(reads).toHaveLength(1);
    expect(JSON.parse(reads[0].details ?? "{}").disclosed).toBe(false);
  });

  it("is SUPER_ADMIN only — the till's operator cannot reach it", async () => {
    await signInAs(manager);
    const mod = await route();
    const res = await callJson(mod.POST, {
      method: "POST",
      url: "http://localhost/api/setup/chain-key",
    });
    expect(res.status).toBe(403);
  });

  it("refuses to arm at all once the journal holds anything", async () => {
    // The ordering rule the route exists for, pinned beside the disclosure
    // change so neither can be relaxed without the other being looked at.
    await signInAs(admin);
    const mod = await route();
    const { appendFiscalEvent } = await import("@/lib/services/fiscal");
    await db.$transaction((tx) =>
      appendFiscalEvent(tx, { type: "OUVERTURE_TIROIR", userId: admin.id, data: {} }),
    );
    const res = await callJson<{ error: string; events: number }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/setup/chain-key",
    });
    expect(res.status).toBe(409);
    expect(res.body.events).toBeGreaterThan(0);
  });
});
