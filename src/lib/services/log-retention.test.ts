import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  auditLogRetentionDays,
  pruneLogs,
  technicalLogRetentionDays,
} from "@/lib/services/log-retention";
import { verifyFiscalChain } from "@/lib/services/fiscal";
import { parseReportRange, ReportRangeError, MAX_REPORT_RANGE_DAYS } from "@/lib/report-range";

// L-92 (R8.4): `parseReportRange` now takes the trading-day cut-off, and takes
// it as a REQUIRED argument for `period.ts`'s reason — a default is how this
// module and the sealed closes came to measure different periods. These tests
// are about the LENGTH bound (M-31) and not about the clock, so they pass a
// fixed hour; the clock itself is tested in `report-range.test.ts`.
const CUTOFF = 5;

// M-29 + M-31 (Batch 2.4). The point of the retention tests is not that rows
// disappear — it is that the RIGHT rows disappear and the fiscal journal is
// untouched. FiscalEvent is append-only by design; a retention job that
// pruned it would be the deletion path the attestation says does not exist.

const DAY = 24 * 60 * 60 * 1000;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  saved.tech = process.env.TECHNICAL_LOG_RETENTION_DAYS;
  saved.audit = process.env.AUDIT_LOG_RETENTION_DAYS;
  await db.technicalLog.deleteMany({});
  await db.auditLog.deleteMany({});
  await db.fiscalEvent.deleteMany({});
});

afterEach(() => {
  for (const [key, envName] of [
    ["tech", "TECHNICAL_LOG_RETENTION_DAYS"],
    ["audit", "AUDIT_LOG_RETENTION_DAYS"],
  ] as const) {
    if (saved[key] === undefined) delete process.env[envName];
    else process.env[envName] = saved[key]!;
  }
});

async function addTechnicalLog(ageDays: number) {
  return db.technicalLog.create({
    data: {
      level: "INFO",
      source: "test",
      message: `aged ${ageDays}d`,
      createdAt: new Date(Date.now() - ageDays * DAY),
    },
  });
}

describe("retention configuration", () => {
  it("keeps technical logs for 90 days by default", () => {
    delete process.env.TECHNICAL_LOG_RETENTION_DAYS;
    expect(technicalLogRetentionDays()).toBe(90);
  });

  it("keeps audit logs forever unless an operator opts in", () => {
    // Audit rows record who approved a discount, who refunded, who restored
    // a backup. How long that evidence must live is a business and legal
    // question, not a disk-space one.
    delete process.env.AUDIT_LOG_RETENTION_DAYS;
    expect(auditLogRetentionDays()).toBe(0);
  });

  it("ignores nonsense rather than deleting on a typo", () => {
    for (const bad of ["abc", "-30", ""]) {
      process.env.TECHNICAL_LOG_RETENTION_DAYS = bad;
      expect(technicalLogRetentionDays()).toBe(90);
    }
  });
});

describe("pruneLogs", () => {
  it("deletes technical logs past the cutoff and keeps the rest", async () => {
    process.env.TECHNICAL_LOG_RETENTION_DAYS = "30";
    await addTechnicalLog(1);
    await addTechnicalLog(29);
    await addTechnicalLog(31);
    await addTechnicalLog(365);

    const result = await pruneLogs();

    expect(result.technicalLogsDeleted).toBe(2);
    const remaining = await db.technicalLog.findMany({ where: { source: "test" } });
    expect(remaining).toHaveLength(2);
  });

  it("leaves audit logs alone by default", async () => {
    delete process.env.AUDIT_LOG_RETENTION_DAYS;
    await db.auditLog.create({
      data: {
        action: "OLD_ACTION",
        entity: "Test",
        entityId: "x",
        createdAt: new Date(Date.now() - 3650 * DAY),
      },
    });

    const result = await pruneLogs();

    expect(result.auditLogsDeleted).toBe(0);
    expect(await db.auditLog.count()).toBe(1);
  });

  it("prunes audit logs when an operator opts in", async () => {
    process.env.AUDIT_LOG_RETENTION_DAYS = "365";
    await db.auditLog.create({
      data: {
        action: "ANCIENT",
        entity: "Test",
        entityId: "x",
        createdAt: new Date(Date.now() - 400 * DAY),
      },
    });
    await db.auditLog.create({
      data: { action: "RECENT", entity: "Test", entityId: "y", createdAt: new Date() },
    });

    const result = await pruneLogs();

    expect(result.auditLogsDeleted).toBe(1);
    expect((await db.auditLog.findMany()).map((a) => a.action)).toEqual(["RECENT"]);
  });

  it("NEVER prunes the fiscal journal, whatever the retention says", async () => {
    // The line this module must not cross.
    process.env.TECHNICAL_LOG_RETENTION_DAYS = "1";
    process.env.AUDIT_LOG_RETENTION_DAYS = "1";

    const { appendFiscalEvent } = await import("@/lib/services/fiscal");
    await db.$transaction((tx) =>
      appendFiscalEvent(tx, { type: "OUVERTURE_TIROIR", data: { reason: "old" } }),
    );
    // Note: the event is NOT backdated. `timestamp` is an input to the event
    // hash, so rewriting it is tampering and breaks the chain — which is the
    // tamper detection doing its job.
    //
    // L-121 (R9.7) — **THE CLOCK IS MOVED INSTEAD, AND THAT IS THE WHOLE FIX.**
    //
    // This called `pruneLogs()` with the real clock, so the fresh event was
    // never older than a one-day cutoff and **a dated prune of the fiscal
    // journal would have deleted nothing and passed.** Only an *unconditional*
    // `deleteMany` could fail it. The test guarding the single hardest
    // invariant in the product could not fail against the bug it names.
    //
    // `pruneLogs(now: Date = new Date())` was built to take the clock. Pushing
    // `now` 400 days forward puts every cutoff far past this event with no
    // backdating and no tampering — so a `fiscalEvent.deleteMany({ where: {
    // timestamp: { lt: cutoff(days) } } })` added beside the other two now
    // deletes it, and this test goes red.
    const before = await db.fiscalEvent.count();
    expect(before, "no fiscal event to protect — this test would be vacuous").toBeGreaterThan(0);

    await pruneLogs(new Date(Date.now() + 400 * DAY));

    expect(await db.fiscalEvent.count()).toBe(before);
    const verdict = await verifyFiscalChain();
    expect(verdict.ok).toBe(true);
  });

  it("removes expired sessions, which were only cleared at login", async () => {
    const user = await db.user.upsert({
      where: { username: "retention-session-test" },
      update: {},
      create: {
        username: "retention-session-test",
        name: "Session Test",
        role: "MANAGER",
        pinHash: "not-a-real-hash",
      },
    });
    await db.session.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() - DAY) },
    });

    const result = await pruneLogs();
    expect(result.sessionsDeleted).toBeGreaterThanOrEqual(1);
  });
});

describe("L-176 — WHEN the prune runs, which was the whole finding", () => {
  const read = async (rel: string) => {
    const { readFileSync } = await import("fs");
    const path = (await import("path")).default;
    return readFileSync(path.join(process.cwd(), rel), "utf8");
  };

  // THE FINDING: everything above tests what `pruneLogs` DOES. Nothing tested
  // when it is CALLED, and it was called in exactly one place — after a Z close.
  // **A till restarted daily but closed rarely therefore accumulates
  // `TechnicalLog` without bound**, and that table is the only durable record
  // of a refused startup migration or a degraded backup, so the rows that
  // matter end up buried among the ones that do not. Production already carries
  // nine identical WAL-refusal WARNs, one per start.
  //
  // Asserted as source because a Next startup hook cannot be invoked from the
  // suite — `register()` is called by the framework, in a runtime this test has
  // no way to enter. The same bargain `deployment.test.ts` makes for PowerShell
  // and `small-findings.test.ts` already makes for this very file.

  it("runs after a Z close, as it always did", async () => {
    const src = await read("src/app/api/shifts/[id]/close/route.ts");
    expect(src, "the close-time prune is gone").toContain("pruneLogs()");
  });

  it("ALSO runs at startup — L-176's fix", async () => {
    // The boot is the right second trigger precisely because it is the event
    // the failing case HAS: the till that never closes a shift is still
    // restarted.
    const src = await read("src/instrumentation.ts");
    expect(src, "the startup prune is gone — L-176 is back").toContain("pruneLogs");
    expect(src, "it is not actually called").toMatch(/await pruneLogs\(\)/);
  });

  it("runs last, after the migration gate, and cannot fail the boot", async () => {
    // ORDER: it deletes from the schema this process is going to serve, so it
    // has to come after the gate that may have migrated it. FAILURE: the same
    // contract as the close-time call — housekeeping, never able to fail the
    // thing it is attached to. A till that will not open is worse than a till
    // with a long log table.
    const src = await read("src/instrumentation.ts");
    const gate = src.indexOf("runStartupMigrationGate");
    const prune = src.indexOf("await pruneLogs()");
    expect(gate, "the migration gate left instrumentation.ts").toBeGreaterThan(-1);
    expect(prune, "the prune left instrumentation.ts").toBeGreaterThan(-1);
    expect(prune, "the prune now runs BEFORE the migration gate").toBeGreaterThan(gate);

    // The `catch` that makes it housekeeping, matched as a block containing the
    // call rather than as the word « catch » somewhere in a 150-line file.
    const after = src.slice(prune);
    expect(after.slice(0, 600), "the startup prune is no longer guarded").toContain("} catch");
  });

  it("logs only when it actually deleted something", async () => {
    // A row per boot is what the migration gate's `UP_TO_DATE: null` exists to
    // avoid, and writing one here would be this finding again from the other
    // end: the prune that exists to keep the table readable, making it longer.
    const src = await read("src/instrumentation.ts");
    const prune = src.indexOf("await pruneLogs()");
    const block = src.slice(prune, prune + 900);
    expect(block, "the startup prune logs unconditionally").toMatch(/if \(total > 0\)/);
  });
});

describe("chain verification paging (M-31)", () => {
  it("gives the same verdict whatever the page size", async () => {
    // The journal is append-only and grows for the life of the business, so
    // it is walked in pages. The seam between pages must not change the
    // answer: each page carries the previous page's last hash forward.
    const { appendFiscalEvent } = await import("@/lib/services/fiscal");
    for (let i = 0; i < 12; i++) {
      await db.$transaction((tx) =>
        appendFiscalEvent(tx, { type: "OUVERTURE_TIROIR", data: { i } }),
      );
    }

    const whole = await verifyFiscalChain(1000);
    expect(whole.ok).toBe(true);
    expect(whole.eventsChecked).toBe(12);

    for (const pageSize of [1, 2, 5, 7, 11, 12, 13]) {
      const paged = await verifyFiscalChain(pageSize);
      expect(paged.ok).toBe(true);
      expect(paged.eventsChecked).toBe(whole.eventsChecked);
      expect(paged.lastSequence).toBe(whole.lastSequence);
    }
  });

  it("finds a break that straddles a page boundary", async () => {
    const { appendFiscalEvent } = await import("@/lib/services/fiscal");
    for (let i = 0; i < 6; i++) {
      await db.$transaction((tx) =>
        appendFiscalEvent(tx, { type: "OUVERTURE_TIROIR", data: { i } }),
      );
    }
    const third = await db.fiscalEvent.findFirst({ orderBy: { sequence: "asc" }, skip: 2 });
    await db.fiscalEvent.update({
      where: { id: third!.id },
      data: { dataJson: '{"tampered":true}' },
    });

    // Page size 2 puts the tampered row first in its page, so the break is
    // only found if the previous page's hash was carried across.
    const tail = await db.fiscalEvent.findFirst({ orderBy: { sequence: "desc" } });
    const verdict = await verifyFiscalChain(2);
    expect(verdict.ok).toBe(false);
    expect(verdict.firstBreakAt).toBe(third!.sequence);
    // Sequences are global and monotonic (FiscalCounter never rewinds), so
    // the tail is whatever this run reached — not 6.
    expect(verdict.lastSequence).toBe(tail!.sequence);
  });
});

describe("report range bounds (M-31)", () => {
  it("defaults to the last seven days", () => {
    const now = new Date(2026, 8, 10);
    const { days } = parseReportRange(null, null, CUTOFF, now);
    expect(days).toBe(7);
  });

  it("refuses a range longer than the limit instead of stalling the till", () => {
    const now = new Date(2026, 8, 10);
    expect(() => parseReportRange("2020-01-01", "2026-09-10", CUTOFF, now)).toThrow(ReportRangeError);
    try {
      parseReportRange("2020-01-01", "2026-09-10", CUTOFF, now);
    } catch (e) {
      expect((e as Error).message).toContain(String(MAX_REPORT_RANGE_DAYS));
    }
  });

  it("allows a full twelve months", () => {
    const now = new Date(2026, 8, 10);
    expect(() => parseReportRange("2025-09-11", "2026-09-10", CUTOFF, now)).not.toThrow();
  });

  it("rejects inverted and invalid dates", () => {
    const now = new Date(2026, 8, 10);
    expect(() => parseReportRange("2026-09-10", "2026-09-01", CUTOFF, now)).toThrow(ReportRangeError);
    expect(() => parseReportRange("not-a-date", "2026-09-01", CUTOFF, now)).toThrow(ReportRangeError);
  });
});
