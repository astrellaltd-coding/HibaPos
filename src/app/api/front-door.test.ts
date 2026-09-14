import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin, isPublishedDefaultPin, PUBLISHED_DEFAULT_PINS } from "@/lib/auth";
import { PUBLISHED_PIN_REFUSAL } from "@/lib/services/account-policy";
import { rateLimitReset } from "@/lib/rate-limit";

// R9.5 — the front door.
//
// L-102 · L-118 · L-187 at the boundary. L-103 and L-147 are the login SCREEN
// and are covered in `login-screen-refusal.test.tsx`, which can render.
//
// What these three share is that each is only true from outside: a lockout that
// never clears, a denylist the application does not consult, and a bootstrap
// that installs a credential printed in this repository. None of them is
// visible from a unit test of the function underneath.

const GOOD_PIN = "481902";
const OTHER_PIN = "739114";
let admin: { id: string; username: string; role: "SUPER_ADMIN" };
let target: { id: string };

async function wipe(): Promise<void> {
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.fiscalEvent.deleteMany();
  // L-154 (R9.7): Refund.orderId is `onDelete: Restrict`.
  await db.refund.deleteMany();
  await db.order.deleteMany();
  await db.fiscalCounter.deleteMany();
  await db.user.deleteMany();
  // The CATALOGUE too, or `freshSeed()` is not fresh: `seedCatalogAndSettings`
  // throws P2002 on the second call and the route takes its concurrent-race
  // branch instead of the success one. Which is how the hole in that branch
  // was found, so this stays as it is rather than being narrowed.
  await db.comboSlotOptionRule.deleteMany();
  await db.comboSlotChoice.deleteMany();
  await db.comboSlot.deleteMany();
  await db.categoryOptionChoice.deleteMany();
  await db.categoryOptionGroup.deleteMany();
  await db.optionChoice.deleteMany();
  await db.optionGroup.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.setting.deleteMany();
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  // The login route throttles per IP+username, and `clientIp()` is the
  // constant "local" (DD-06, no proxy) — so without this the fourth test in a
  // file shares a bucket with the first.
  rateLimitReset("login:local:lockme");
  rateLimitReset("login-unknown:local");

  const a = await db.user.create({
    data: { username: `r95-sa-${Date.now()}-${Math.random()}`, name: "Admin", role: "SUPER_ADMIN", pinHash: await hashPin(GOOD_PIN) },
  });
  admin = { id: a.id, username: a.username, role: "SUPER_ADMIN" };
  const t = await db.user.create({
    data: { username: `r95-mgr-${Date.now()}-${Math.random()}`, name: "Resp", role: "MANAGER", pinHash: await hashPin(OTHER_PIN) },
  });
  target = { id: t.id };
});

afterAll(async () => {
  await wipe();
});

describe("L-102 — a lockout that expires actually expires", () => {
  async function lockMe(): Promise<string> {
    const u = await db.user.create({
      data: { username: "lockme", name: "Lock", role: "MANAGER", pinHash: await hashPin(GOOD_PIN) },
    });
    return u.id;
  }

  async function login(username: string, pin: string) {
    rateLimitReset(`login:local:${username}`);
    const mod = await import("@/app/api/auth/login/route");
    return callJson<{ error?: string; lockedUntil?: string }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/auth/login",
      body: { username, pin },
    });
  }

  it("lets a locked-out operator back in once the lock has passed", async () => {
    // THE FINDING. `auth/unlock` resets `failedAttempts: 0, lockedUntil: null`
    // once the lock expires; `login` never did. So `newFailed` went 6, 7, 8…
    // and **every subsequent wrong PIN re-locked for a further 15 minutes,
    // indefinitely** — an operator who fat-fingered five times could not
    // recover through the login screen AT ALL, while the lock screen would
    // have cleared it. Two accounts and a restaurant in service.
    const id = await lockMe();
    await db.user.update({
      where: { id },
      data: { failedAttempts: 5, lockedUntil: new Date(Date.now() - 60_000) },
    });

    const res = await login("lockme", GOOD_PIN);
    expect(res.status, "the expired lock was never cleared").not.toBe(423);
    expect(res.status).toBe(200);
  });

  it("clears the counter, not just the timestamp", async () => {
    // The counter is what made it permanent. A reset that cleared only
    // `lockedUntil` would re-lock on the very next mistake.
    const id = await lockMe();
    await db.user.update({
      where: { id },
      data: { failedAttempts: 5, lockedUntil: new Date(Date.now() - 60_000) },
    });

    const res = await login("lockme", "000001");
    expect(res.status, "one wrong PIN after an expired lock re-locked at once").toBe(401);
    const after = await db.user.findUniqueOrThrow({ where: { id } });
    expect(after.failedAttempts, "the counter carried on from 5").toBe(1);
    expect(after.lockedUntil).toBeNull();
  });

  it("gives the full budget back, not one attempt", async () => {
    // The whole recovery. Four more mistakes must be survivable, exactly as
    // they are for an account that has never been locked.
    const id = await lockMe();
    await db.user.update({
      where: { id },
      data: { failedAttempts: 5, lockedUntil: new Date(Date.now() - 60_000) },
    });
    for (let i = 1; i <= 4; i++) {
      const res = await login("lockme", "000001");
      expect({ i, status: res.status }).toEqual({ i, status: 401 });
    }
    const ok = await login("lockme", GOOD_PIN);
    expect(ok.status, "the fifth attempt should still have been allowed").toBe(200);
  });

  it("STILL locks after five consecutive failures", async () => {
    // The direction that would make the till defenceless if wrong.
    const id = await lockMe();
    for (let i = 1; i <= 5; i++) await login("lockme", "000001");
    const after = await db.user.findUniqueOrThrow({ where: { id } });
    expect(after.failedAttempts).toBe(5);
    expect(after.lockedUntil).not.toBeNull();
    const res = await login("lockme", GOOD_PIN);
    expect(res.status, "a live lock must hold, even for the right PIN").toBe(423);
  });

  it("still refuses while the lock is live", async () => {
    const id = await lockMe();
    await db.user.update({
      where: { id },
      data: { failedAttempts: 5, lockedUntil: new Date(Date.now() + 60_000) },
    });
    const res = await login("lockme", GOOD_PIN);
    expect(res.status).toBe(423);
    expect(res.body.lockedUntil).toBeTruthy();
  });

  it("agrees with the unlock route, which is the finding", async () => {
    // « Two unauthenticated login paths with different lockout arithmetic. »
    // The property is the AGREEMENT, so it is stated as one.
    const both = ["src/app/api/auth/login/route.ts", "src/app/api/auth/unlock/route.ts"].map(
      (rel) => readFileSync(path.join(process.cwd(), rel), "utf8"),
    );
    for (const src of both) {
      expect(src).toMatch(/failedAttempts:\s*0,\s*lockedUntil:\s*null/);
    }
    // …and neither carries a stale timestamp forward on a sub-threshold failure.
    for (const src of both) {
      expect(src).not.toContain(": user.lockedUntil;");
    }
  });
});

describe("L-118 — a published PIN cannot be installed through the application", () => {
  it("refuses one on POST /api/users", async () => {
    // `isPublishedDefaultPin` had exactly ONE call site in the repository —
    // `scripts/seed-users.ts`, an operator CLI that `bun test src` cannot even
    // reach. `docs/INVARIANTS.md` states the guard as a property of the SYSTEM.
    const mod = await import("@/app/api/users/route");
    await signInAs(admin);
    for (const pin of PUBLISHED_DEFAULT_PINS) {
      const res = await callJson<{ error: string }>(mod.POST, {
        method: "POST",
        url: "http://localhost/api/users",
        body: { username: `new-${pin}`, name: "Nouveau", role: "MANAGER", pin, active: true },
      });
      expect({ pin, status: res.status }).toEqual({ pin, status: 400 });
      expect(res.body.error).toBe(PUBLISHED_PIN_REFUSAL);
    }
    expect(await db.user.count({ where: { username: { startsWith: "new-" } } })).toBe(0);
  });

  it("refuses one on PUT /api/users/[id], which is where a ROTATION happens", async () => {
    // `auth.ts` records why: on 2026-09-04 the operator's first attempt at
    // changing both live PINs set the super-administrator to one of these two
    // values, « caught by reading the repository, not by the application ».
    const mod = await import("@/app/api/users/[id]/route");
    await signInAs(admin);
    for (const pin of PUBLISHED_DEFAULT_PINS) {
      const res = await callJson<{ error: string }>(mod.PUT, {
        method: "PUT",
        url: `http://localhost/api/users/${target.id}`,
        params: { id: target.id },
        body: { pin },
      });
      expect({ pin, status: res.status }).toEqual({ pin, status: 400 });
      expect(res.body.error).toBe(PUBLISHED_PIN_REFUSAL);
    }
  });

  it("leaves the stored hash untouched when it refuses", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    const mod = await import("@/app/api/users/[id]/route");
    await signInAs(admin);
    await callJson(mod.PUT, {
      method: "PUT",
      url: `http://localhost/api/users/${target.id}`,
      params: { id: target.id },
      body: { pin: PUBLISHED_DEFAULT_PINS[0] },
    });
    const after = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.pinHash).toBe(before.pinHash);
  });

  it("still ACCEPTS an ordinary PIN, on both routes", async () => {
    // Without this the denylist is satisfied by refusing every PIN, which
    // would leave the operator unable to create or rotate anything.
    await signInAs(admin);
    const create = await import("@/app/api/users/route");
    const created = await callJson<{ id: string }>(create.POST, {
      method: "POST",
      url: "http://localhost/api/users",
      body: { username: "ordinaire", name: "Ordinaire", role: "MANAGER", pin: "246813", active: true },
    });
    expect(created.status).toBe(201);

    const update = await import("@/app/api/users/[id]/route");
    const updated = await callJson(update.PUT, {
      method: "PUT",
      url: `http://localhost/api/users/${target.id}`,
      params: { id: target.id },
      body: { pin: "135792" },
    });
    expect(updated.status).toBe(200);
  });

  it("refuses before it hashes, so a refusal costs no scrypt", async () => {
    // `hashPin` is bounded (C-09) and each call is 128 MiB. A denylist checked
    // AFTER hashing would let a caller burn the queue on values that were
    // never going to be accepted.
    const src = readFileSync(path.join(process.cwd(), "src/app/api/users/route.ts"), "utf8");
    expect(src.indexOf("isPublishedDefaultPin")).toBeLessThan(src.indexOf("await hashPin("));
    const put = readFileSync(
      path.join(process.cwd(), "src/app/api/users/[id]/route.ts"),
      "utf8",
    );
    expect(put.indexOf("isPublishedDefaultPin")).toBeLessThan(put.indexOf("await hashPin("));
  });
});

describe("L-118 — the bootstrap, as the operator settled it on 2026-09-13", () => {
  const seedRoute = () => import("@/app/api/seed/route");

  async function freshSeed(managerPin?: string) {
    await wipe();
    const real = process.env.SEED_MANAGER_PIN;
    if (managerPin === undefined) delete process.env.SEED_MANAGER_PIN;
    else process.env.SEED_MANAGER_PIN = managerPin;
    try {
      const mod = await seedRoute();
      return await callJson<{ ok: boolean; managerPin?: string; error?: string }>(mod.POST, {
        method: "POST",
        url: "http://localhost/api/seed",
      });
    } finally {
      if (real === undefined) delete process.env.SEED_MANAGER_PIN;
      else process.env.SEED_MANAGER_PIN = real;
    }
  }

  it("keeps the ADMIN on 123456 — the operator's decision, recorded", async () => {
    // « Admin always 123456 », 2026-09-13. Asserted so that a later session
    // changing it has to change this line and read why. The value IS published
    // in this repository; that was said before the choice was made.
    const res = await freshSeed();
    expect(res.body.ok).toBe(true);
    const { verifyPin } = await import("@/lib/auth");
    const adminUser = await db.user.findUniqueOrThrow({ where: { username: "admin" } });
    expect(await verifyPin("123456", adminUser.pinHash)).toBe(true);
  });

  it("GENERATES the manager's PIN when none is configured, and returns it once", async () => {
    const res = await freshSeed();
    expect(res.body.managerPin, "no PIN was returned — nobody can log in as the manager").toBeTruthy();
    expect(res.body.managerPin).toMatch(/^\d{6}$/);
    expect(isPublishedDefaultPin(res.body.managerPin!), "a published default was generated").toBe(
      false,
    );

    const { verifyPin } = await import("@/lib/auth");
    const managerUser = await db.user.findUniqueOrThrow({ where: { username: "manager" } });
    expect(
      await verifyPin(res.body.managerPin!, managerUser.pinHash),
      "the PIN shown is not the PIN installed",
    ).toBe(true);
  });

  it("never installs 111111 again", async () => {
    const res = await freshSeed();
    const { verifyPin } = await import("@/lib/auth");
    const managerUser = await db.user.findUniqueOrThrow({ where: { username: "manager" } });
    expect(await verifyPin("111111", managerUser.pinHash)).toBe(false);
    expect(res.body.managerPin).not.toBe("111111");
  });

  it("generates a DIFFERENT PIN each install", async () => {
    // A generated value that repeated would be a published default with extra
    // steps. Ten installs, ten values — a collision at 10^6 is possible and
    // vanishingly unlikely; a constant is what this is guarding against.
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const res = await freshSeed();
      seen.add(res.body.managerPin!);
    }
    expect(seen.size).toBeGreaterThan(8);
  });

  it("uses SEED_MANAGER_PIN when it is set, and does NOT return it", async () => {
    // The operator's own value: they already have it, so echoing it back is a
    // disclosure that buys nothing.
    const res = await freshSeed("357911");
    expect(res.body.ok).toBe(true);
    expect(res.body.managerPin, "a configured PIN was echoed back").toBeUndefined();
    const { verifyPin } = await import("@/lib/auth");
    const managerUser = await db.user.findUniqueOrThrow({ where: { username: "manager" } });
    expect(await verifyPin("357911", managerUser.pinHash)).toBe(true);
  });

  it("refuses a published default in SEED_MANAGER_PIN", async () => {
    const res = await freshSeed("111111");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(PUBLISHED_PIN_REFUSAL);
    expect(await db.user.count(), "users were created despite the refusal").toBe(0);
  });

  it("puts the PIN in EVERY response that has already created the users", async () => {
    // The bug this batch shipped and caught: both users are created BEFORE the
    // catalogue is touched, so the two catalogue-failure branches return with a
    // manager account already installed. My first version added the PIN to the
    // success response only — **a manager account nobody could ever log into,
    // which is worse than the published default it replaced.**
    //
    // WHY THIS COUNTS RATHER THAN DRIVES. Reaching those branches means causing
    // a real P2002, and Prisma logs it: one `prisma:error` block against
    // `docs/BASELINES.md`'s pinned zero. R8.2 set the precedent of measuring
    // what a test costs and redesigning rather than spending it — measured
    // here too, at exactly one block. So the PIN is built ONCE as `pinPayload`
    // and the invariant is « every response past that point spreads it »,
    // which is both checkable and the thing that was actually wrong.
    const src = readFileSync(path.join(process.cwd(), "src/app/api/seed/route.ts"), "utf8");

    const built = src.indexOf("const pinPayload =");
    expect(built, "pinPayload is gone — this assertion moved").toBeGreaterThan(0);

    // Everything after the users exist. `admin` is created first, so the users
    // are in place from the manager's `create` onwards.
    // Bounded at the end of `seed()`. Slicing to end-of-file swept in the `GET`
    // handler's own return and reported a fourth branch that does not exist —
    // a false positive is as useless as a missed one.
    const seedEnd = src.indexOf("export async function GET");
    expect(seedEnd, "the GET handler moved — this bound needs rewriting").toBeGreaterThan(0);
    const afterUsers = src.slice(src.indexOf('username: "manager"'), seedEnd);
    const returns = afterUsers.match(/return NextResponse\.json\(/g) ?? [];
    const spreads = afterUsers.match(/\.\.\.pinPayload,/g) ?? [];

    expect(returns.length, "no responses found after the users are created").toBeGreaterThan(2);
    expect(
      spreads.length,
      `${returns.length} responses can be returned once the users exist and ` +
        `${spreads.length} carry the PIN — the rest install a credential nobody is shown`,
    ).toBe(returns.length);
  });

  it("builds the PIN payload before any of those responses can be reached", async () => {
    // The counting above is satisfied by a `pinPayload` declared after the
    // branches, which would not compile — but it is also satisfied by one
    // declared after the users are created and before only SOME of them. It is
    // built at the point the PIN is generated, which is before either user.
    const src = readFileSync(path.join(process.cwd(), "src/app/api/seed/route.ts"), "utf8");
    expect(src.indexOf("const pinPayload =")).toBeLessThan(src.indexOf('username: "admin"'));
  });

  it("returns nothing on the idempotent re-run", async () => {
    // « Shown once » has to mean once. A second press must not re-disclose.
    await freshSeed();
    await signInAs({
      ...(await db.user.findUniqueOrThrow({ where: { username: "admin" } })),
      role: "SUPER_ADMIN",
    });
    const mod = await seedRoute();
    const again = await callJson<{ skipped?: boolean; managerPin?: string }>(mod.POST, {
      method: "POST",
      url: "http://localhost/api/seed",
    });
    expect(again.body.skipped).toBe(true);
    expect(again.body.managerPin).toBeUndefined();
  });
});

describe("L-187 — the PIN path asks for the memory it needs", () => {
  it("derives maxmem from the scrypt parameters", async () => {
    // `maxmem: 1 << 30` — 1 GiB for a 128 MiB working set. Same shape L-142
    // measured in `backup.ts` at the identical parameters (RSS delta 128.8 MiB,
    // floor between 128 and 129), but this is the path that runs on EVERY login
    // and every step-up rather than once per Z close.
    const src = readFileSync(path.join(process.cwd(), "src/lib/auth.ts"), "utf8");
    expect(src).toContain("SCRYPT_WORKING_SET = 128 * (1 << 17) * 8 * 1");
    expect(src).toContain("maxmem: SCRYPT_WORKING_SET * 2");
    expect(src, "the 1 GiB literal is back").not.toContain("maxmem: 1 << 30");
  });

  it("still hashes and verifies at the shipped ceiling", async () => {
    // The test that fails if the derivation is ever wrong: too low and no
    // login works at all.
    const { verifyPin } = await import("@/lib/auth");
    const hash = await hashPin("482619");
    expect(await verifyPin("482619", hash)).toBe(true);
    expect(await verifyPin("482618", hash)).toBe(false);
  });
});
