import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { readFileSync } from "node:fs";
import { renameWithRetry, RENAME_RETRY_BUDGET_MS } from "@/lib/services/backup";

// L-61 / L-62 (Batch 2.5) — the swap that could not complete on Windows.
//
// WHAT WENT WRONG. `restoreBackup` replaces the live database with
// `fs.rename(staged, dbPath)` after `await db.$disconnect()`. Windows refuses
// to rename over a file another handle still has open — and there WAS another
// handle. `src/lib/db.ts` cached its PrismaClient on `globalThis` only when
// `NODE_ENV !== "production"`, so the production server built **two**: Next
// bundles server code per entry point, and `instrumentation.ts` got one module
// instance of `db.ts` while the route handlers got another. Measured on the
// real production build — one process, two constructions, one before "Ready"
// and one on the first request. Disconnecting one left the other holding the
// file, and every restore died with `EPERM`.
//
// Every case below drives the SHIPPED function. `renameWithRetry` takes its
// `rename` and `sleep` as injectable dependencies precisely so the retry logic
// can be exercised without a real Windows handle — reimplementing the loop in
// this file would let these tests pass while the shipped code was broken,
// which is the one thing a fiscal recovery path must not allow.

/** An `fs.rename` that fails `failures` times with `code`, then really renames. */
function flakyRename(failures: number, code = "EPERM") {
  let calls = 0;
  const impl = async (from: string, to: string) => {
    calls++;
    if (calls <= failures) {
      const e = new Error(`${code}: simulated open handle`) as NodeJS.ErrnoException;
      e.code = code;
      throw e;
    }
    await fs.rename(from, to);
  };
  return { impl, calls: () => calls };
}

describe("the PrismaClient is a singleton in production too (L-61's root cause)", () => {
  // Asserted on the source, because the defect is invisible to a unit test: it
  // needs two Next.js server bundles in one process to appear, and by then it
  // appears as a failed restore rather than as anything a test would see.
  const src = readFileSync(path.join(process.cwd(), "src", "lib", "db.ts"), "utf8");
  const code = src
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"));

  it("caches on globalThis with no environment condition", () => {
    expect(code).toContain("globalForPrisma.prisma = db;");
  });

  it("does not gate the cache on NODE_ENV", () => {
    // The exact shape that caused L-61. Checked over command lines rather than
    // raw text, because the comment above it quotes the old code to explain
    // what went wrong — and a file must be allowed to record its own history.
    const gated = code.filter(
      (l) => l.includes("globalForPrisma.prisma = db") && l.includes("NODE_ENV"),
    );
    expect(
      gated,
      "db.ts caches the client only outside production again — that is L-61, and it breaks restore",
    ).toEqual([]);
  });
});

describe("renameWithRetry (L-61)", () => {
  let dir: string;
  let src: string;
  let dest: string;
  const noSleep = async () => {};

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "hibapos-swap-"));
    src = path.join(dir, "staged.db");
    dest = path.join(dir, "live.db");
    await fs.writeFile(src, "NEW");
    await fs.writeFile(dest, "OLD");
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("replaces the destination on the first try when nothing holds it", async () => {
    const r = await renameWithRetry(src, dest);
    expect(r.attempts).toBe(1);
    expect(await fs.readFile(dest, "utf8")).toBe("NEW");
    await expect(fs.access(src)).rejects.toThrow();
  });

  it("retries EPERM and succeeds once the handle goes away", async () => {
    // The real sequence: the first attempts meet the second client's handle,
    // then `$disconnect()` finishes releasing it — measured at 4–9 ms — and the
    // rename goes through.
    const flaky = flakyRename(3);
    const r = await renameWithRetry(src, dest, { rename: flaky.impl, sleep: noSleep });
    expect(r.attempts).toBe(4);
    expect(flaky.calls()).toBe(4);
    expect(await fs.readFile(dest, "utf8")).toBe("NEW");
  });

  it("retries EACCES and EBUSY too — Windows reports the same thing three ways", async () => {
    for (const code of ["EACCES", "EBUSY"]) {
      await fs.writeFile(src, "NEW");
      await fs.writeFile(dest, "OLD");
      const flaky = flakyRename(2, code);
      const r = await renameWithRetry(src, dest, { rename: flaky.impl, sleep: noSleep });
      expect(r.attempts, code).toBe(3);
      expect(await fs.readFile(dest, "utf8")).toBe("NEW");
    }
  });

  it("gives up inside the budget, and says the data was NOT modified", async () => {
    // A handle that never goes away. The operator has to be told two things:
    // that nothing changed, and what to do instead.
    const held = async () => {
      const e = new Error("EPERM") as NodeJS.ErrnoException;
      e.code = "EPERM";
      throw e;
    };
    let slept = 0;
    const err = await renameWithRetry(src, dest, {
      rename: held,
      budgetMs: 250,
      sleep: async (ms) => {
        slept += ms;
        // Advance the clock the way real sleeping would, so the budget ends.
        await new Promise((r) => setTimeout(r, 30));
      },
    }).catch((e) => e as Error);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/ouvert par un autre/);
    expect((err as Error).message).toMatch(/Aucune donnée n'a été modifiée/);
    expect((err as Error).message).toMatch(/decrypt-backup/);
    expect(slept).toBeGreaterThan(0);
    // The live file is exactly as it was, which is the claim the message makes.
    expect(await fs.readFile(dest, "utf8")).toBe("OLD");
    expect(await fs.readFile(src, "utf8")).toBe("NEW");
  });

  it("does NOT retry a failure retrying cannot fix", async () => {
    // A missing source is ENOENT. Waiting five seconds for a file that was
    // never there is five seconds of a dead till and no better outcome.
    let slept = 0;
    await expect(
      renameWithRetry(path.join(dir, "nope.db"), dest, {
        sleep: async (ms) => {
          slept += ms;
        },
      }),
    ).rejects.toThrow(/ENOENT/);
    expect(slept, "ENOENT was retried; only EPERM/EACCES/EBUSY should be").toBe(0);
    expect(await fs.readFile(dest, "utf8")).toBe("OLD");
  });

  it("has a budget long enough to outlast a real disconnect, and bounded", async () => {
    // Measured: the handle is released 4–9 ms after `$disconnect()` resolves.
    // Five seconds is ~500× that, and still short enough that a genuinely
    // stuck till fails fast rather than hanging.
    expect(RENAME_RETRY_BUDGET_MS).toBeGreaterThanOrEqual(1_000);
    expect(RENAME_RETRY_BUDGET_MS).toBeLessThanOrEqual(30_000);
  });
});

describe("restoreBackup actually uses the retrying swap (L-61)", () => {
  // Without this, every case above could pass while `restoreBackup` went on
  // calling `fs.rename` directly — a perfectly tested function nothing calls.
  const src = readFileSync(
    path.join(process.cwd(), "src", "lib", "services", "backup.ts"),
    "utf8",
  );
  const commands = src
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => !l.startsWith("//") && !l.startsWith("*"));

  it("swaps the database with renameWithRetry, not with a bare fs.rename", () => {
    expect(commands.some((l) => l.includes("renameWithRetry(stagedDbPath, dbPath)"))).toBe(true);
    expect(
      commands.some((l) => /await fs\.rename\(stagedDbPath, dbPath\)/.test(l)),
      "the swap went back to a bare fs.rename — that is L-61",
    ).toBe(false);
  });
});

describe("a failed restore leaves nothing behind (L-62)", () => {
  const src = readFileSync(
    path.join(process.cwd(), "src", "lib", "services", "backup.ts"),
    "utf8",
  );

  it("unlinks the staged database and the decrypted media archive in `finally`", () => {
    // The measured failure left `custom.db.restore-staged` beside the live file
    // and a 47,6 MB UNENCRYPTED copy of every product photo in `db/backups/` —
    // one per attempt. `finally`, not `catch`, because the failure that leaves
    // litter is by definition the one nobody predicted.
    const start = src.indexOf("} finally {\n    // L-62");
    expect(start, "the L-62 cleanup block is gone").toBeGreaterThan(0);
    const block = src.slice(start, src.indexOf("endRestore();", start));
    expect(block).toContain("fs.unlink(stagedDbPath)");
    expect(block).toContain("fs.unlink(stagedUploadsTar)");
  });

  it("clears the tar handle after a successful extract, so cleanup is not a double unlink", () => {
    expect(src).toContain("stagedUploadsTar = null;");
  });
});
