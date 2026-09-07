import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

// DOC-04 — the README's test counts, pinned.
//
// THE PROBLEM THIS SOLVES. `README.md` prints how many tests this project has.
// A number a human retypes after every batch drifts, and this one has: it was
// recorded as wrong once (105 vs 136), corrected, and was wrong again by
// 2026-09-07 (879 vs 963). Twice corrected, twice drifted. The operator asked
// for it pinned rather than corrected a third time.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. It recomputes the two figures from
// the test files themselves and compares them with what the README claims. It
// cannot tell whether a test is any good, and it is not a substitute for
// running the suite — but a session that adds tests and forgets the README now
// fails here instead of shipping a stale number.
//
// WHY A DECLARATION COUNT NEEDS A REGISTRY. `bun test` reports RUNS, not
// declarations, and two declarations in this repo expand into several runs
// each. Counting lines alone gives 951 against a real 963. The expansions are
// listed below, and that list is the point: adding a third one makes this test
// fail with a message that says where to record it, which is exactly the
// moment somebody should be thinking about it.

/** `process.cwd()`, as `role-model.test.ts` and `plan-freshness.test.ts` use —
 *  `import.meta.dir` is a Bun property `tsc --noEmit` does not know. */
const REPO_ROOT = process.cwd();

/**
 * `it(`, `test(`, `it.each(`, `test.skip(` … at the start of a line.
 *
 * The modifiers are listed rather than matched as `\.[a-z]+`, because that
 * form also matches **`test.describe(`** — which declares no test and appears
 * once per e2e spec file. The first draft of this file counted 18 e2e tests
 * against a measured 13, and those five were the describes.
 */
const DECLARATION =
  /^[ \t]*(?:it|test|setup)(?:\.(?:each|skip|only|todo|failing|fails|concurrent|serial))?\(/gm;


/**
 * Declarations that produce more than one run.
 *
 * `runs` is what the runner reports for that one declaration. Add an entry
 * whenever a test is generated from data or a loop — the totals below will not
 * add up until you do.
 */
const EXPANSIONS = [
  {
    where: "src/hooks/use-keyboard-shortcuts.test.ts",
    what: 'it.each(["F1" … "F9"]) — seven function keys',
    runs: 7,
  },
  {
    where: "src/lib/deployment.test.ts",
    what: "for (const f of ALL_SCRIPTS) it(…) — seven PowerShell scripts",
    runs: 7,
  },
];

function testFilesUnder(dir: string, match: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...testFilesUnder(full, match));
    else if (match(entry)) out.push(full);
  }
  return out;
}

function countDeclarations(files: string[]): number {
  return files.reduce(
    (n, f) => n + (readFileSync(f, "utf8").match(DECLARATION)?.length ?? 0),
    0,
  );
}

function readme(): string {
  return readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
}

/** The number the README prints before `tests unitaires` / `tests (`. */
function claimedUnitCount(src: string): number {
  const m = /#\s*([0-9]+)\s+tests unitaires/.exec(src);
  expect(m, "README no longer states a unit-test count in the form '# N tests unitaires'").toBeTruthy();
  return Number(m![1]);
}

function claimedE2eCount(src: string): number {
  const m = /Playwright\s*—\s*([0-9]+)\s+tests/.exec(src);
  expect(m, "README no longer states an e2e count in the form 'Playwright — N tests'").toBeTruthy();
  return Number(m![1]);
}

describe("README test counts (DOC-04)", () => {
  it("counts something at all, so a silent zero cannot pass this file", () => {
    const unit = testFilesUnder(path.join(REPO_ROOT, "src"), (f) => /\.test\.tsx?$/.test(f));
    const e2e = testFilesUnder(path.join(REPO_ROOT, "tests", "e2e"), (f) =>
      /\.spec\.ts$/.test(f) || f === "auth.setup.ts",
    );
    expect(unit.length).toBeGreaterThan(50);
    expect(e2e.length).toBeGreaterThan(4);
    expect(countDeclarations(unit)).toBeGreaterThan(500);
  });

  it("the README's unit-test count is what the runner would report", () => {
    const files = testFilesUnder(path.join(REPO_ROOT, "src"), (f) => /\.test\.tsx?$/.test(f));
    const declarations = countDeclarations(files);
    // Each expansion contributes `runs` where the line count saw 1.
    const extra = EXPANSIONS.reduce((n, e) => n + e.runs - 1, 0);
    const total = declarations + extra;
    expect(
      claimedUnitCount(readme()),
      `README says ${claimedUnitCount(readme())} unit tests; ${declarations} declarations + ` +
        `${extra} from ${EXPANSIONS.length} expansions = ${total}. Either update the README, or — if you ` +
        `added a test generated from data or a loop — add it to EXPANSIONS in this file.`,
    ).toBe(total);
  });

  it("the README's e2e count includes the setup project, because Playwright runs it", () => {
    // Measured 2026-09-07 by running the suite: `13 passed`. The setup project
    // in `auth.setup.ts` logs in once per run and Playwright counts it as a
    // test, so 12 spec tests report as 13. The plan said 13, a de-stale pass
    // "corrected" it to 12 from a static count of the spec files alone, and
    // running it put the original figure back. Hence this assertion, and hence
    // `auth.setup.ts` in the file list.
    const files = testFilesUnder(path.join(REPO_ROOT, "tests", "e2e"), (f) =>
      /\.spec\.ts$/.test(f) || f === "auth.setup.ts",
    );
    const total = countDeclarations(files);
    expect(
      claimedE2eCount(readme()),
      `README says ${claimedE2eCount(readme())} e2e tests; the spec files plus auth.setup.ts declare ${total}.`,
    ).toBe(total);
  });

  it("every registered expansion still exists where it says it does", () => {
    // An expansion that was deleted would silently inflate the total by six
    // and the README would be "corrected" to match a number nobody ran.
    for (const e of EXPANSIONS) {
      const src = readFileSync(path.join(REPO_ROOT, e.where), "utf8");
      const hasEach = /\b(?:it|test)\.each\(/.test(src);
      const hasLoop = /for \(const \w+ of \w+\) \{[\s\S]{0,200}?^\s*(?:it|test)\(/m.test(src);
      expect(hasEach || hasLoop, `${e.where}: no ${e.what} found — is the EXPANSIONS entry stale?`).toBe(true);
    }
  });
});
