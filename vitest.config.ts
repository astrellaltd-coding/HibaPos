// L-06 (Batch 6.3) — this file exists to make `bunx vitest` FAIL.
//
// THE HAZARD, in the audit's words: "`vitest@^3` is a devDependency with no
// config and no script. Running `bunx vitest` bypasses the `bunfig.toml`
// preload that redirects `DATABASE_URL`, and four test files begin by wiping
// 17 tables."
//
// The redirect and its guard live in `test-setup.ts`, which `bunfig.toml`
// preloads for `bun test`. Vitest does not read `bunfig.toml`, so it never
// reaches either — the guard cannot protect a runner that never loads it.
//
// WHY THE DEPENDENCY WAS NOT SIMPLY REMOVED, which is the plan's other
// suggestion. Two reasons, both measured:
//   1. Every one of the ~66 test files imports from "vitest" (bun redirects
//      those to `bun:test` at runtime), and `tsc` needs the package's types.
//      Removing it means rewriting every import or shimming the types — a
//      large, unrelated change inside a batch about e2e safety.
//   2. It would not close the hole anyway: `bunx vitest` FETCHES the package
//      when it is not installed, so the command still runs.
//
// Throwing from the config does close it. Vitest loads this before it collects
// a single test, so there is no path from `bunx vitest` to a database.
throw new Error(
  [
    "",
    "  vitest is not the test runner for this project.",
    "",
    "  It does not read bunfig.toml, so it never loads test-setup.ts — which",
    "  is the only thing pointing DATABASE_URL at a throwaway database. Four",
    "  test files begin by wiping seventeen tables.",
    "",
    "  Use:  bun test src --timeout 30000",
    "",
    "  (L-06, Batch 6.3. The `vitest` package stays a devDependency only",
    "   because every test file imports its types.)",
    "",
  ].join("\n"),
);
