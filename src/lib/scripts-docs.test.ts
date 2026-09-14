import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

// R10.2 — the operator scripts and the index that is supposed to describe them.
//
// `scripts/` is where the irreversible things live: the fiscal reset, the
// migration applier, the PIN reset, the only way into an encrypted backup when
// the app will not start. None of it runs in the app, so nothing in the normal
// test suite exercises any of it, and `bun run typecheck` is the only automated
// eye on the code at all.
//
// WHAT THIS FILE PINS is therefore the layer above the code: that the index
// names every script and every row names a real one (**L-165**), that each one
// can be run the way its own examples say (**L-169**), that the migration
// applier fails rather than shrugs when it is asked to verify and cannot
// (**L-166**), that the one script that cannot be undone states a true reason
// for its order (**L-146**), and that the index never sends a reader down a
// command the safety register forbids on this machine (**L-168**).
//
// It reads files as text. It cannot tell you a script works; it can tell you
// nobody quietly removed the property that keeps it honest — which is the same
// bargain `deployment.test.ts` makes for the PowerShell it cannot run.

const REPO = process.cwd();
const SCRIPTS = path.join(REPO, "scripts");
const README = readFileSync(path.join(SCRIPTS, "README.md"), "utf8");

const read = (f: string) => readFileSync(path.join(SCRIPTS, f), "utf8");

const LIVE_HEADING = "## What each script does";
const RETIRED_HEADING = "## Removed in Batch 4.5";

/**
 * The live table only — the « Removed in Batch 4.5 » one names deleted files.
 * Returns "" rather than throwing when a heading moves, so that the failure
 * surfaces as the named vacuity test below and not as a module that would not
 * load: « this file did not run » is the one result a guard must never give.
 */
function liveTable(): string {
  const start = README.indexOf(LIVE_HEADING);
  const end = README.indexOf(RETIRED_HEADING);
  if (start < 0 || end < start) return "";
  return README.slice(start, end);
}

const SCRIPT_FILES = readdirSync(SCRIPTS)
  .filter((f) => f.endsWith(".ts"))
  .sort();

const INDEXED = [...liveTable().matchAll(/^\| `([a-z0-9-]+\.ts)` \|/gm)].map((m) => m[1]).sort();

describe("L-165 — the index names every script, and every row names a script", () => {
  it("finds scripts and rows at all", () => {
    // The vacuous shape this project has been bitten by: a sweep that passes
    // because it swept nothing. Both sides have to be populated for the
    // comparison below to mean anything.
    expect(README.indexOf(LIVE_HEADING), `the index lost « ${LIVE_HEADING} »`).toBeGreaterThan(-1);
    expect(README.indexOf(RETIRED_HEADING), `the index lost « ${RETIRED_HEADING} »`).toBeGreaterThan(
      -1,
    );
    expect(SCRIPT_FILES.length, "no .ts files found in scripts/").toBeGreaterThan(10);
    expect(INDEXED.length, "no rows parsed out of the index table").toBeGreaterThan(10);
  });

  it("documents all of them", () => {
    // THE FINDING: `apply-migration.ts`, `build-box-menus.ts` and
    // `trim-catalogue-names.ts` were in the folder and absent from the table —
    // and `apply-migration.ts` is the command `CLAUDE.md` hands the operator for
    // applying a migration, so the most dangerous script here was the one the
    // index did not mention.
    const missing = SCRIPT_FILES.filter((f) => !INDEXED.includes(f));
    expect(
      missing,
      `scripts with no row in scripts/README.md: ${missing.join(", ")}\n` +
        "Add a row — script · what it does · Deletes? · How to run — to the table " +
        "under « What each script does ». The « Deletes? » column is the one that " +
        "has to be right: the header of that table promises every deletion is named there.",
    ).toEqual([]);
  });

  it("indexes nothing that has been removed", () => {
    // The other direction. A row for a file that no longer exists is worse than
    // no row: it is an instruction to run something that is not there, and the
    // retired ones already have their own table saying why they went.
    const ghosts = INDEXED.filter((f) => !SCRIPT_FILES.includes(f));
    expect(ghosts, `rows naming files that do not exist: ${ghosts.join(", ")}`).toEqual([]);
  });

  it("names every deletion in the row for the script that performs it", () => {
    // The table's own promise: « Every deletion any script performs is named in
    // this table. » Pinned for the two rows added in R10.2, because both were
    // written from the source rather than from the old prose.
    const table = liveTable();
    expect(table).toMatch(/\| `build-box-menus\.ts` \|[^\n]*\| \*\*No\.\*\*/);
    expect(table).toMatch(/\| `trim-catalogue-names\.ts` \|[^\n]*\| \*\*No\.\*\*/);
    // And that those claims are true of the code, not just of the table.
    expect(read("build-box-menus.ts"), "build-box-menus.ts now deletes").not.toMatch(
      /\.delete(Many)?\(/,
    );
    expect(read("trim-catalogue-names.ts"), "trim-catalogue-names.ts now deletes").not.toMatch(
      /\.delete(Many)?\(/,
    );
  });
});

describe("L-169 — every script can be run the way its own header says", () => {
  it("starts with the bun shebang", () => {
    const without = SCRIPT_FILES.filter((f) => !read(f).startsWith("#!/usr/bin/env bun\n"));
    expect(
      without,
      `scripts with no shebang: ${without.join(", ")}\n` +
        "Every header in this folder documents `bun scripts/<name>.ts`, and thirteen of " +
        "fifteen carried `#!/usr/bin/env bun`. Two did not, so they were the two that " +
        "would fail if anyone ran them the way an executable is run.",
    ).toEqual([]);
  });
});

describe("L-166 — a verification that cannot happen is a failure, not a footnote", () => {
  const src = read("apply-migration.ts");

  /** The `--expect` not-found branch, comments stripped, so a test cannot match its own excuse. */
  function notFoundBranch(): string {
    const start = src.indexOf("if (!existsSync(EXPECT)) {");
    expect(start, "the `--expect` existence check is gone").toBeGreaterThan(-1);
    const end = src.indexOf("} else {", start);
    expect(end, "the not-found branch lost its else").toBeGreaterThan(start);
    return src
      .slice(start, end)
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
  }

  it("fails the run when the fingerprint cannot be read", () => {
    // THE FINDING: it printed « skipped. » and left `ok` alone, so the run still
    // ended ✅ APPLIED AND VERIFIED with the rehearsal comparison silently lost.
    // The migration itself was always applied and the pending list always
    // checked — what went missing is the half the operator asked for by passing
    // the flag. Being told the check did not happen, on a line above a tick, is
    // the worst of both.
    const branch = notFoundBranch();
    expect(branch, "the missing-fingerprint branch no longer fails the run").toContain("ok = false");
    expect(branch, "« skipped » is back in the branch that does not compare").not.toMatch(
      /skipped/i,
    );
  });

  it("says what `--expect` actually takes", () => {
    // `CLAUDE.md` spells the hand-over command `--expect <name>`, which reads as
    // a migration name. The likeliest wrong value is therefore exactly the one
    // that used to produce a green banner and no comparison, so the refusal has
    // to correct the misreading rather than merely report a missing file.
    const branch = notFoundBranch();
    expect(branch).toMatch(/PATH to a rehearsal fingerprint JSON/);
    expect(branch).toMatch(/not a migration name/);
  });

  it("and the index says the same thing", () => {
    const row = liveTable()
      .split("\n")
      .find((l) => l.startsWith("| `apply-migration.ts` |"));
    expect(row, "no row for apply-migration.ts").toBeTruthy();
    expect(row!).toMatch(/PATH to a rehearsal fingerprint JSON/);
    expect(row!, "the index still recommends `bunx prisma migrate deploy`").toMatch(
      /never `bunx prisma migrate deploy`/,
    );
  });

  it("and so does the hand-over command in CLAUDE.md", () => {
    // The prose half, added on the operator's word 2026-09-14 — that file is
    // theirs. It spelled the command `--expect <name>`, which reads as the
    // MIGRATION name, so the likeliest wrong value was exactly the one that
    // used to end ✅ APPLIED AND VERIFIED without comparing anything.
    const claude = readFileSync(path.join(REPO, "CLAUDE.md"), "utf8");
    expect(claude, "CLAUDE.md spells `--expect <name>` again").not.toMatch(
      /--expect <name>/,
    );
    expect(claude).toMatch(/`--expect` takes a PATH/);
    expect(claude, "the hand-over command left CLAUDE.md").toMatch(
      /scripts\/apply-migration\.ts --apply --expect/,
    );
  });
});

describe("L-167 — the invariants name every file a test refuses to lose", () => {
  // THE FINDING: `docs/INVARIANTS.md`'s « Deliberately retained — do not clean
  // up » listed `tables-view.tsx` and two unreachable branches, and not the
  // three `/api/tables` routes that `table-withdrawal.test.ts` pins. DD-09
  // withdrew table service, so those routes have no screen and read as dead
  // weight — and the invariants are exactly the document a cleanup consults
  // before deleting dead weight. It would have deleted three files a test
  // requires, and learnt so from a red suite rather than from the list whose
  // whole job is to say it first.
  const invariants = readFileSync(path.join(REPO, "docs", "INVARIANTS.md"), "utf8");
  const withdrawal = readFileSync(
    path.join(REPO, "src", "features", "tables", "table-withdrawal.test.ts"),
    "utf8",
  );

  /** The routes that test insists on, read from the test rather than copied. */
  const PINNED = [...withdrawal.matchAll(/"(src\/app\/api\/tables\/[^"]+\.ts)"/g)].map(
    (m) => m[1],
  );

  it("reads the pinned list out of the test", () => {
    // Copying the three paths into this file would make it agree with itself.
    // Parsed from the source, a FOURTH pinned route also has to be documented.
    expect(PINNED.length, "no pinned table routes parsed out of table-withdrawal.test.ts").toBe(3);
  });

  it("names each of them in « Deliberately retained »", () => {
    const start = invariants.indexOf('### Deliberately retained — do not "clean up"');
    expect(start, "the retained section is gone or renamed").toBeGreaterThan(-1);
    const end = invariants.indexOf("\n---", start);
    const section = invariants.slice(start, end > start ? end : undefined);
    const unlisted = PINNED.filter((p) => !section.includes(p.replace("src/app/api", "api")) && !section.includes(p));
    expect(
      unlisted,
      `pinned by table-withdrawal.test.ts and not in the retained list: ${unlisted.join(", ")}\n` +
        "Add them. That list is what a cleanup reads before deleting something that " +
        "looks unreachable, and these three are unreachable by design (DD-09).",
    ).toEqual([]);
  });
});

describe("L-146 — the irreversible script states a true reason for its order", () => {
  const src = read("pre-golive-reset.ts");

  it("no longer calls deleting Customer first an FK violation", () => {
    // It is not one. `Order.customerId` is `onDelete: SetNull`, so the wrong
    // order would SUCCEED and quietly null every link — which is worse than the
    // throw the comment promised, and it was written at exactly the line a
    // future editor reads before reordering it.
    //
    // TWO THINGS THIS HAS TO GET RIGHT, both learned the hard way here.
    // Comment continuations are JOINED first, or the same false sentence
    // re-wrapped across two `//` lines walks straight past the regex — which is
    // what the first attempt at this revert did. And QUOTED spans are then
    // dropped, because the correction itself quotes the sentence it is
    // correcting, inside « » — an assertion that matched that would be red on
    // the fixed code, which is this project's most repeated test bug.
    const claimed = src.replace(/\n\s*\/\/ ?/g, " ").replace(/«[^»]*»/g, " ");
    expect(claimed, "the wrong reason is back").not.toMatch(/deleting it first is an FK violation/);
    expect(claimed, "the wrong reason is back in other words").not.toMatch(
      /Customer[^.]*\bis an FK violation\b/,
    );
  });

  it("states the reason the schema actually gives", () => {
    const schema = readFileSync(path.join(REPO, "prisma", "schema.prisma"), "utf8");
    expect(
      schema,
      "`Order.customerId` is no longer `onDelete: SetNull`, so the comment in " +
        "pre-golive-reset.ts is now wrong in the other direction — read it before " +
        "changing this test.",
    ).toMatch(/customer\s+Customer\?\s+@relation\(fields: \[customerId\][^)]*onDelete: SetNull\)/);
    expect(src).toMatch(/onDelete: SetNull/);
  });

  it("still deletes Order before Customer", () => {
    // The property the comment exists to protect. The reason was wrong; the
    // order was right, and correcting the prose must not have moved the rows.
    const order = src.indexOf('\n  "Order",');
    const customer = src.indexOf('\n  "Customer",');
    expect(order, "Order left DELETION_ORDER").toBeGreaterThan(-1);
    expect(customer, "Customer left DELETION_ORDER").toBeGreaterThan(-1);
    expect(order, "Customer is now deleted before Order").toBeLessThan(customer);
  });
});

describe("L-168 — the index never offers what § 5 forbids on this machine", () => {
  const plan = readFileSync(path.join(REPO, "REMEDIATION_PLAN.md"), "utf8");

  /** The `bun run` targets the plan's safety register marks « ❌ Never, from this directory ». */
  const FORBIDDEN = [
    ...new Set(
      plan
        .split("\n")
        .filter((l) => l.startsWith("|") && /❌ \*\*Never, from this directory/.test(l))
        .flatMap((l) => [...l.split("|")[1].matchAll(/`(?:bun run )?([a-z][a-z0-9:-]*)`/g)])
        .map((m) => m[1]),
    ),
  ].sort();

  it("reads the safety register at all", () => {
    // If § 5 is renamed or the ❌ marker changes, this list empties and every
    // assertion below passes over nothing. That failure has to be loud.
    expect(FORBIDDEN.length, "no forbidden commands parsed out of the plan's § 5").toBeGreaterThan(
      4,
    );
    expect(FORBIDDEN).toContain("db:seed");
  });

  it("warns beside every one it mentions", () => {
    // THE FINDING: the Notes said « For first boot use `bun run db:seed` » with
    // nothing beside it, while § 5 lists that command as never to be run from
    // this directory — where `.env` points DATABASE_URL at the live catalogue.
    // Both statements were true in their own frame, which is what made the
    // collision hard to see and easy to act on.
    const offences: string[] = [];
    for (const cmd of FORBIDDEN) {
      for (const m of README.matchAll(new RegExp(`\`(?:bun run )?${cmd}\``, "g"))) {
        const near = README.slice(Math.max(0, m.index - 200), m.index + 900);
        if (!/from this directory/i.test(near)) offences.push(`${cmd} @ ${m.index}`);
      }
    }
    expect(
      offences,
      `scripts/README.md offers a command the plan's § 5 forbids here, with no warning ` +
        `beside it: ${offences.join(", ")}\n` +
        "Either drop the mention or say « NEVER FROM THIS DIRECTORY » within the same " +
        "bullet. `.env` here points DATABASE_URL at db/custom.db — the live catalogue.",
    ).toEqual([]);
  });

  it("still tells a fresh install what to do", () => {
    // The warning must not have swallowed the instruction. A reader commissioning
    // a till in France needs the command; a reader on this machine needs the
    // refusal; the note has to carry both.
    expect(README).toMatch(/first boot on a FRESH install/);
    expect(README).toMatch(/bun run db:seed/);
  });

  it("does not send that reader to a published PIN in silence", () => {
    // L-191, recorded not fixed: `prisma/seed.ts` still falls back to `111111`,
    // which `POST /api/seed` has refused since R9.5. Until the code is fixed the
    // index must say so, because the index is what points at that command.
    // `deployment.test.ts` pins the fallback itself, for L-59's own reasons.
    expect(README, "the README stopped warning about SEED_MANAGER_PIN (L-191)").toMatch(
      /SET `SEED_MANAGER_PIN` FIRST/,
    );
    expect(README).toContain("L-191");
  });
});
