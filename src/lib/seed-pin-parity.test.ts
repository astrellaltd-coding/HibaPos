import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  PUBLISHED_DEFAULT_PINS,
  isPublishedDefaultPin,
  isRefusedAdminSeedPin,
  SANCTIONED_ADMIN_SEED_PIN,
} from "@/lib/auth";

// L-191 — THE TWO SEED PATHS, AND THE ONE THAT WAS LEFT BEHIND.
//
// R9.5 put the bootstrap PINs to the operator and fixed `POST /api/seed`: the
// manager's PIN is generated and shown once, and a published default in
// `SEED_MANAGER_PIN` is refused. **`prisma/seed.ts` was not in that row and was
// not touched** — it went on reading `SEED_MANAGER_PIN ?? "111111"`, the exact
// value the route had begun refusing, behind a comment calling its own defaults
// « insecure ». It imports `hashPin` from `auth.ts`, so the denylist was one
// named import away the whole time.
//
// It matters because of WHICH path it is: `scripts/README.md` sends a first
// boot to `bun run db:seed`, and the France install is a fresh install.
//
// ── WHY THIS IS A SOURCE-TEXT TEST ──────────────────────────────────────────
// `prisma/seed.ts` calls `main()` at the top level, so importing it runs it
// against whatever `DATABASE_URL` holds. It cannot be imported here and must
// not be. So the file is read as text — the same bargain `deployment.test.ts`
// makes for the PowerShell it cannot run — and the behaviour was proved by
// hand against a throwaway database on 2026-09-14, six runs, recorded in
// `REMEDIATION_DONE.md`.
//
// What IS executed here is the shared denylist, and the parity between the two
// paths: a fix to one that is not made to the other is the whole finding.

const REPO = process.cwd();
const CLI = readFileSync(path.join(REPO, "prisma", "seed.ts"), "utf8");
const ROUTE = readFileSync(path.join(REPO, "src", "app", "api", "seed", "route.ts"), "utf8");

/** Comments stripped: every assertion below would otherwise match the prose
 *  explaining it, which is this project's most repeated test bug. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .split("\n")
    .map((l) => (/^\s*(\/\/|\*)/.test(l) ? " ".repeat(l.length) : l))
    .join("\n");
}

/**
 * Comment continuations joined, then « » spans dropped — for the one assertion
 * that is ABOUT a comment and so cannot strip them.
 *
 * The file's new header quotes the promise it is retracting, inside guillemets.
 * Matching the raw source therefore found the retraction and called it the
 * promise, which is the same bug caught in R10.2 and the reason this helper is
 * written the same way there.
 */
function claims(src: string): string {
  return src.replace(/\n\s*\/\/ ?/g, " ").replace(/«[^»]*»/g, " ");
}

describe("L-191 — the CLI seed installs no published default", () => {
  it("reads both files at all", () => {
    expect(code(CLI).length, "prisma/seed.ts is empty or all comment").toBeGreaterThan(500);
    expect(code(ROUTE).length, "the seed route is empty or all comment").toBeGreaterThan(500);
  });

  it("has no manager fallback left", () => {
    // THE FINDING, exactly. `?? "111111"` was the whole of it.
    expect(
      code(CLI),
      "prisma/seed.ts falls back to a manager PIN again — it must generate one",
    ).not.toMatch(/SEED_MANAGER_PIN\s*\?\?/);
    for (const pin of PUBLISHED_DEFAULT_PINS) {
      if (pin === "123456") continue; // the admin's, and the operator's decision
      expect(code(CLI), `prisma/seed.ts still names ${pin} in code`).not.toContain(pin);
    }
  });

  it("refuses a published default in SEED_MANAGER_PIN, as the route does", () => {
    for (const src of [code(CLI), code(ROUTE)]) {
      expect(src).toMatch(/isPublishedDefaultPin\(configuredManagerPin\)/);
    }
    // One message, not two hand-written ones.
    expect(code(CLI)).toContain("PUBLISHED_PIN_REFUSAL");
    expect(code(ROUTE)).toContain("PUBLISHED_PIN_REFUSAL");
  });

  it("generates with randomInt and re-checks the result, as the route does", () => {
    for (const [name, src] of [["prisma/seed.ts", code(CLI)], ["seed/route.ts", code(ROUTE)]] as const) {
      expect(src, `${name} no longer generates with randomInt`).toMatch(
        /randomInt\(0,\s*1_000_000\)/,
      );
      expect(src, `${name} stopped zero-padding, which shrinks the keyspace`).toMatch(
        /padStart\(6,\s*"0"\)/,
      );
      expect(src, `${name} stopped re-checking the generated value`).toMatch(
        /if \(!isPublishedDefaultPin\(pin\)\) return pin/,
      );
    }
  });

  it("keeps the admin's 123456, which is the operator's decision and not an oversight", () => {
    // The half that must NOT change. R9.5 put it to them on 2026-09-13 knowing
    // the value is published: « Admin always 123456 ». A later session tidying
    // « a published PIN in the seed » would remove this too.
    //
    // The literal moved into `SANCTIONED_ADMIN_SEED_PIN` with L-192, so both
    // halves are asserted: the constant still holds that value, and both paths
    // still fall back to the constant.
    expect(SANCTIONED_ADMIN_SEED_PIN, "the admin's seeded PIN changed").toBe("123456");
    for (const [name, src] of [["prisma/seed.ts", code(CLI)], ["seed/route.ts", code(ROUTE)]] as const) {
      expect(src, `${name} no longer falls back to the sanctioned admin PIN`).toContain(
        "process.env.SEED_ADMIN_PIN?.trim() || SANCTIONED_ADMIN_SEED_PIN",
      );
    }
  });

  it("refuses a DIFFERENT published default in SEED_ADMIN_PIN — L-192", () => {
    // The operator's rule of 2026-09-14, after being shown that the denylist
    // could not simply be pointed at this variable: `123456` IS published and
    // IS the sanctioned value, so refusing every published default would refuse
    // their own decision. « Refuse any published default except the sanctioned
    // one » is what they chose, and `isRefusedAdminSeedPin` states it once.
    expect(isRefusedAdminSeedPin("111111"), "111111 is accepted for the admin").toBe(true);
    expect(isRefusedAdminSeedPin("123456"), "the sanctioned value is refused").toBe(false);
    expect(isRefusedAdminSeedPin("482913"), "an ordinary chosen PIN is refused").toBe(false);
    // And both paths actually call it, before hashing anything.
    for (const [name, src] of [["prisma/seed.ts", code(CLI)], ["seed/route.ts", code(ROUTE)]] as const) {
      expect(src, `${name} does not check the admin PIN at all`).toMatch(
        /isRefusedAdminSeedPin\(adminPin\)/,
      );
      const check = src.indexOf("isRefusedAdminSeedPin(adminPin)");
      const hash = src.indexOf("hashPin(adminPin)");
      expect(hash, `${name} stopped hashing the admin PIN`).toBeGreaterThan(-1);
      expect(check, `${name} refuses AFTER hashing — C-09 bounds hashPin, so a`
        + " denylist checked after it lets a caller burn the queue on values that"
        + " were never going to be accepted").toBeLessThan(hash);
    }
  });

  it("prints the generated PIN, and says so where it used to promise not to", () => {
    // The reversal is the point: a generated PIN nobody is shown is an account
    // nobody can open, which is worse than the published default it replaced.
    // `seed/route.ts` made that exact mistake first and had it caught by a test.
    expect(code(CLI), "the generated PIN is never shown").toMatch(
      /console\.log\([^)]*generatedManagerPin|row\(generatedManagerPin\)/,
    );
    expect(
      claims(CLI),
      "the old promise not to print is being made again, outside the quote that retracts it",
    ).not.toMatch(/temporary PINs are intentionally NOT logged or printed/);
    // A CHOSEN pin is still not printed — whoever set the variable knows it.
    expect(code(CLI), "a configured PIN is printed too").not.toMatch(
      /console\.log\([^)]*configuredManagerPin/,
    );
  });

  it("draws the box from its contents so it cannot go crooked", () => {
    // Not cosmetic pedantry: the first version hard-coded the rules and the
    // padding and the digits sat visibly off-centre. This is the one line an
    // operator has to copy correctly, at install time, once.
    const title = "CODE GÉRANT (manager) — généré, affiché UNE SEULE FOIS";
    expect(CLI).toContain(title);
    const width = title.length + 4;
    const row = (s: string) => {
      const left = Math.floor((width - s.length) / 2);
      return `  │${" ".repeat(left)}${s}${" ".repeat(width - s.length - left)}│`;
    };
    // Reproduce the renderer and check it agrees with itself at both widths.
    expect(row(title).length).toBe(row("123456").length);
    expect(row(title).length).toBe(`  ┌${"─".repeat(width)}┐`.length);
    expect(code(CLI), "the box is hand-drawn again").toMatch(/"─"\.repeat\(width\)/);
  });

  it("keeps the denylist itself honest", () => {
    // The one thing here that actually executes.
    expect(PUBLISHED_DEFAULT_PINS).toContain("111111");
    expect(PUBLISHED_DEFAULT_PINS).toContain("123456");
    expect(isPublishedDefaultPin("111111")).toBe(true);
    expect(isPublishedDefaultPin("482913")).toBe(false);
  });
});

describe("L-191 — and the documents stop suggesting the value", () => {
  it(".env.example no longer offers 111111 as the manager's PIN", () => {
    const env = readFileSync(path.join(REPO, ".env.example"), "utf8");
    const line = env.split("\n").find((l) => l.includes("SEED_MANAGER_PIN="));
    expect(line, "SEED_MANAGER_PIN vanished from .env.example").toBeTruthy();
    for (const pin of PUBLISHED_DEFAULT_PINS) {
      expect(line!, `.env.example suggests ${pin} for the manager`).not.toContain(pin);
    }
  });
});
