import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { secretStorePath } from "@/lib/services/secret-store";

// L-151 (audit pass 2, R9.6) — a refusal leaves a trace, and so does a
// disclosure.
//
// THE FINDING, in the audit's words: "`withAuth`/`withAuthParams` return 403
// with **no audit row** — a MANAGER probing SUPER_ADMIN routes leaves no
// trace, while `LOGIN_FAILED`, `USER_SWITCH_FAILED` and
// `MANAGER_APPROVAL_FAILED` are all journalled. And `GET /api/setup/secrets`
// — the one route that returns a secret — writes **no audit row on the read**;
// only the harmless acknowledgement is recorded. The disclosure is unlogged
// and the confirmation is logged." `audit` appeared 0 times in
// `api-handler.ts`.
//
// WHY THESE ARE DRIVEN AND NOT READ AS SOURCE TEXT. `api-authorization.test.ts`
// says up front that it asserts what a route *declares* and cannot send a
// request. Four of this project's tests were found by the same audit to prove
// nothing because they assert source text (L-121 … L-126), and a fifth passed
// vacuously for a year (L-124). So these go through `route-harness.ts`: a real
// session minted by the application's own `createSession`, a real `Request`,
// the real wrapper, and the row read back out of the database afterwards.
// What that proves is that the wrapper writes it — not merely that the call
// appears in the file.

const PIN = "424242";
let manager: { id: string; username: string; role: "MANAGER" };
let admin: { id: string; username: string; role: "SUPER_ADMIN" };

type AuditRow = {
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  userId: string | null;
};

const rows = (action: string): Promise<AuditRow[]> =>
  db.auditLog.findMany({ where: { action }, orderBy: { createdAt: "asc" } }) as Promise<AuditRow[]>;

const detailsOf = (r: AuditRow): Record<string, unknown> =>
  JSON.parse(r.details ?? "{}") as Record<string, unknown>;

beforeEach(async () => {
  clearCookies();
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();

  const stamp = `${Date.now()}-${Math.random()}`;
  const m = await db.user.create({
    data: { username: `l151-mgr-${stamp}`, name: "Resp", role: "MANAGER", pinHash: await hashPin(PIN) },
  });
  const a = await db.user.create({
    data: { username: `l151-sa-${stamp}`, name: "Admin", role: "SUPER_ADMIN", pinHash: await hashPin(PIN) },
  });
  manager = { id: m.id, username: m.username, role: "MANAGER" };
  admin = { id: a.id, username: a.username, role: "SUPER_ADMIN" };
});

describe("L-151 — a 403 from a declared role gate is journalled", () => {
  it("writes ACCESS_DENIED naming the route, the method, the role and what was required", async () => {
    // `GET /api/users` is SUPER_ADMIN-only (DD-22: the API was contradicting a
    // navigation entry that is already SUPER_ADMIN-only).
    const mod = await import("@/app/api/users/route");
    await signInAs(manager);

    const res = await callJson(mod.GET, { method: "GET", url: "http://localhost/api/users" });
    expect(res.status).toBe(403);

    const denied = await rows("ACCESS_DENIED");
    expect(denied.length, "the refusal wrote no audit row").toBe(1);
    expect(denied[0].userId, "the row must name WHO was refused").toBe(manager.id);
    expect(denied[0].entity).toBe("Api");
    expect(denied[0].entityId, "the row must name WHICH route").toBe("/api/users");

    const d = detailsOf(denied[0]);
    expect(d.method).toBe("GET");
    expect(d.role, "the role the caller actually had").toBe("MANAGER");
    expect(d.requiredRoles, "the gate they ran into").toEqual(["SUPER_ADMIN"]);
  });

  it("writes nothing when the same route is called by someone allowed to call it", async () => {
    // Without this the assertion above is satisfied by a wrapper that logs
    // every request, which is a different (and much noisier) thing.
    const mod = await import("@/app/api/users/route");
    await signInAs(admin);

    const res = await callJson(mod.GET, { method: "GET", url: "http://localhost/api/users" });
    expect(res.status, "a SUPER_ADMIN must not be refused").not.toBe(403);
    expect(await rows("ACCESS_DENIED")).toEqual([]);
  });

  it("covers withAuthParams too, which is a second copy of the same branch", async () => {
    // Both wrappers carried the same unlogged 403, so fixing one and not the
    // other would leave every dynamic route silent. This is the only
    // declared-roles dynamic route that refuses a MANAGER.
    //
    // SAFE TO CALL: the refusal happens in the wrapper, before the handler is
    // invoked — nothing in `backups/[id]/restore` runs. It is deliberately
    // NOT called as SUPER_ADMIN anywhere in this file, because that handler
    // overwrites the live database.
    const mod = await import("@/app/api/backups/[id]/restore/route");
    await signInAs(manager);

    const res = await callJson(mod.POST, {
      method: "POST",
      url: "http://localhost/api/backups/does-not-exist/restore",
      params: { id: "does-not-exist" },
    });
    expect(res.status).toBe(403);

    const denied = await rows("ACCESS_DENIED");
    expect(denied.length).toBe(1);
    expect(denied[0].entityId).toBe("/api/backups/does-not-exist/restore");
    expect(detailsOf(denied[0]).method).toBe("POST");
  });

  // NOT TESTED HERE, deliberately: that the refusal survives a FAILING audit
  // write. `audit()` swallows its own errors and logs to `TechnicalLog`, so the
  // property holds — but the only way to make the write fail from a test is to
  // take the table away, and Prisma prints a `prisma:error` block when it does.
  // `docs/BASELINES.md` pins **zero** of those in a clean run, down from twelve
  // that R4.3 and R4.6 spent a batch each removing. That property is worth more
  // than this assertion, and the assertion is about `audit()`'s contract rather
  // than about L-151. Written, measured, removed — recorded here so the next
  // session does not rediscover it as a gap. Its cost was one new
  // `prisma:error` block in the suite output.

});

describe("L-151 — showing a secret is journalled, names only", () => {
  const seedStore = (secrets: Record<string, string>, unacknowledged: string[]) => {
    const file = secretStorePath();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ secrets, unacknowledged }, null, 2), "utf8");
  };

  afterEach(() => {
    const file = secretStorePath();
    if (existsSync(file)) rmSync(file, { force: true });
  });

  it("writes SECRETS_VIEWED with the names, and never the values", async () => {
    const VALUE = "a-value-that-must-never-reach-the-audit-log-0123456789";
    seedStore({ BACKUP_ENCRYPTION_KEY: VALUE }, ["BACKUP_ENCRYPTION_KEY"]);
    const mod = await import("@/app/api/setup/secrets/route");
    await signInAs(admin);

    const res = await callJson<{ pending: { name: string; value: string }[] }>(mod.GET, {
      method: "GET",
      url: "http://localhost/api/setup/secrets",
    });
    expect(res.status).toBe(200);
    expect(res.body.pending.map((p) => p.name)).toEqual(["BACKUP_ENCRYPTION_KEY"]);

    const viewed = await rows("SECRETS_VIEWED");
    expect(viewed.length, "the disclosure wrote no audit row").toBe(1);
    expect(viewed[0].userId).toBe(admin.id);
    expect(detailsOf(viewed[0]).names).toEqual(["BACKUP_ENCRYPTION_KEY"]);

    // The rule this route exists to bend, held everywhere else: « a secret in
    // a log is a secret in a log ». Asserted over the WHOLE row, not just the
    // field the code writes, so a later change that stuffs the value into
    // `entityId` fails here too.
    expect(JSON.stringify(viewed[0])).not.toContain(VALUE);
  });

  it("writes nothing when there is nothing to show", async () => {
    // Every visit to the settings screen calls this. A row per visit would
    // bury the one that matters, and there is no disclosure to record when
    // the answer is empty.
    seedStore({ BACKUP_ENCRYPTION_KEY: "x" }, []);
    const mod = await import("@/app/api/setup/secrets/route");
    await signInAs(admin);

    const res = await callJson<{ pending: unknown[] }>(mod.GET, {
      method: "GET",
      url: "http://localhost/api/setup/secrets",
    });
    expect(res.status).toBe(200);
    expect(res.body.pending).toEqual([]);
    expect(await rows("SECRETS_VIEWED")).toEqual([]);
  });

  it("refuses a MANAGER, and that refusal is journalled like any other", async () => {
    // The two halves of L-151 meeting: the one route that returns a secret is
    // also the one where knowing who was turned away matters most.
    seedStore({ BACKUP_ENCRYPTION_KEY: "x" }, ["BACKUP_ENCRYPTION_KEY"]);
    const mod = await import("@/app/api/setup/secrets/route");
    await signInAs(manager);

    const res = await callJson(mod.GET, { method: "GET", url: "http://localhost/api/setup/secrets" });
    expect(res.status).toBe(403);
    expect(await rows("SECRETS_VIEWED")).toEqual([]);

    const denied = await rows("ACCESS_DENIED");
    expect(denied.length).toBe(1);
    expect(denied[0].entityId).toBe("/api/setup/secrets");
  });
});
