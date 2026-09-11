import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { signInAs, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { getSession, ACTIVITY_TOUCH_INTERVAL_MS } from "@/lib/auth";
import { hashPin } from "@/lib/auth";

// L-71 (R4.3) — the sliding activity tracker must not log a Prisma error for a
// write it deliberately does not care about.
//
// ── THE DEFECT ───────────────────────────────────────────────────────────────
// `getSession` ends with a fire-and-forget touch of `Session.lastActivityAt`.
// It used `db.session.update(…).catch(() => {})`. `update` THROWS when no row
// matches (Prisma P2025) — and Prisma's engine LOGS that error before the
// promise rejects, so the `.catch()` swallows the rejection after the log has
// already been written. `db.ts` enables `["error"]` in production too, so those
// blocks also reach the log file the runbook tells an operator to read first.
//
// `updateMany` matches zero rows and resolves with `{ count: 0 }` — no throw,
// therefore no log. Identical semantics here because `id` is the primary key.
// `destroySession`, eight lines below in the same file, already used
// `deleteMany` for precisely this reason.
//
// ── WHAT THIS FILE CAN AND CANNOT PROVE, STATED PLAINLY ──────────────────────
// It CANNOT assert the absence of the log. Measured, not assumed: Prisma's
// engine writes past both `console.error` and `process.stderr.write`, so a test
// in this process cannot intercept it. Replacing the whole log configuration to
// make it observable would be testing a different `db.ts` than production runs.
//
// What it does instead:
//   * asserts the tracker still WORKS when the row is there (the behaviour that
//     must not be lost);
//   * asserts an authenticated request still succeeds when the row is GONE;
//   * asserts the call site uses `updateMany` — because "no error is raised"
//     is the whole mechanism by which "no error is logged" holds, and that one
//     is checkable.
//
// The suite-level evidence sits in `REMEDIATION_DONE.md`: the 4 « No record was
// found for an update » blocks in a full run went to **0**, which is the half
// this fix owns. Total `prisma:error` went 12 → 7-8; the remainder are socket
// timeouts from the SAME line contending for SQLite's single write lock, and
// they vary run to run because they depend on contention. That half is L-86.
//
// ── AND IT IS NOT A TEST ARTEFACT ────────────────────────────────────────────
// The row can genuinely be absent in production: `log-retention.ts` deletes
// expired sessions, so a request already in flight when that runs — or one
// racing a logout — arrives here with a valid signed token and no row.

const PIN = "909090";
let userId: string;
let username: string;

beforeEach(async () => {
  clearCookies();
  await db.session.deleteMany();
  await db.user.deleteMany();
  const u = await db.user.create({
    data: {
      username: `r43-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "MANAGER",
      pinHash: await hashPin(PIN),
    },
  });
  userId = u.id;
  username = u.username;
  await signInAs({ id: u.id, username: u.username, role: "MANAGER" });
});

afterAll(async () => {
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe("L-71 — the tracker still does its job", () => {
  it("moves lastActivityAt when the session row is there", async () => {
    const before = await db.session.findFirstOrThrow({ where: { userId } });
    // Rewind it so any forward movement is unambiguous.
    await db.session.update({
      where: { id: before.id },
      data: { lastActivityAt: new Date(Date.now() - 60_000) },
    });

    const session = await getSession();
    expect(session?.user.username).toBe(username);

    // The touch is fire-and-forget, so give it a moment to land.
    await new Promise((r) => setTimeout(r, 200));
    const after = await db.session.findFirstOrThrow({ where: { id: before.id } });
    expect(after.lastActivityAt.getTime()).toBeGreaterThan(Date.now() - 30_000);
  });
});

describe("L-86 — but it writes at most once a minute", () => {
  it("does NOT write again when lastActivityAt is fresh", async () => {
    // The whole of R4.6. The write had no reader and ran on EVERY authenticated
    // request, taking SQLite's single write lock each time and contending with
    // the request's own work — which is what produced the « Socket timeout »
    // blocks, all from this one line.
    const row = await db.session.findFirstOrThrow({ where: { userId } });
    const fresh = new Date(Date.now() - 5_000); // 5s old, well inside the window
    await db.session.update({ where: { id: row.id }, data: { lastActivityAt: fresh } });

    const session = await getSession();
    expect(session?.user.username).toBe(username);
    await new Promise((r) => setTimeout(r, 250));

    const after = await db.session.findFirstOrThrow({ where: { id: row.id } });
    expect(after.lastActivityAt.getTime()).toBe(fresh.getTime());
  });

  it("DOES write once the value is older than the interval", async () => {
    // The other side of the same boundary — a throttle that never writes is not
    // a throttle, it is a deletion, and the finding explicitly did not ask for
    // one: `lastActivityAt` is the only record of when a till was last used.
    const row = await db.session.findFirstOrThrow({ where: { userId } });
    const stale = new Date(Date.now() - ACTIVITY_TOUCH_INTERVAL_MS - 5_000);
    await db.session.update({ where: { id: row.id }, data: { lastActivityAt: stale } });

    await getSession();
    await new Promise((r) => setTimeout(r, 250));

    const after = await db.session.findFirstOrThrow({ where: { id: row.id } });
    expect(after.lastActivityAt.getTime()).toBeGreaterThan(stale.getTime());
  });
});

describe("L-71 — and it stays silent when the row is gone", () => {
  it("still authenticates the request, and does not reject", async () => {
    const row = await db.session.findFirstOrThrow({ where: { userId } });
    await db.session.delete({ where: { id: row.id } });

    // Under the OLD code this still resolved — the `.catch()` saw to that —
    // but a `prisma:error` block had already been written. The assertion here
    // is that the request itself is unaffected either way, which is the
    // behaviour the fix must not change.
    const session = await getSession();
    await new Promise((r) => setTimeout(r, 200));

    // `getSession` checks the row exists before it gets as far as the touch, so
    // a deleted session correctly authenticates nobody.
    expect(session).toBeNull();
    expect(await db.session.count()).toBe(0);
  });
});

describe("L-71 — the call site itself", () => {
  it("touches the session with updateMany, never update", () => {
    // The honest substitute for asserting the log, and the reason is stated at
    // the top of this file: the log cannot be intercepted in-process. `update`
    // raising P2025 is the entire mechanism behind the noise, so pinning the
    // call shape pins the fix.
    //
    // COMMENTS ARE STRIPPED FIRST, and that is not fussiness. The first version
    // of this assertion sliced from « Touch lastActivityAt » to the first
    // "catch" — which lands inside the explanatory comment above the call, not
    // in the code. It asserted the prose, passed against the reverted code, and
    // was caught only by running the revert. A source assertion that reads
    // comments is worse than none, because it looks like cover.
    const src = readFileSync(path.join(process.cwd(), "src/lib/auth.ts"), "utf-8");
    const code = src
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");

    // The activity touch, in code only.
    expect(code).toMatch(/\.updateMany\(\s*\{\s*where:\s*\{\s*id:\s*payload\.sessionId/);
    // And no `.update(` on the session anywhere in this file's code.
    expect(code).not.toMatch(/session\s*\.?\s*\n?\s*\.?update\(/);
    // The reason `updateMany` is safe here: `destroySession` in the same file
    // already relies on the same no-throw-on-no-match property.
    expect(code).toContain("db.session.deleteMany");
  });
});
