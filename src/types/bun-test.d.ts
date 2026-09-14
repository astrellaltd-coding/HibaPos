// Just enough of `bun:test` to typecheck, and deliberately no more.
//
// Batch 6.1. `bun-types` USED to be a devDependency, and referencing it —
// globally in `tsconfig.json` or file-locally with a triple-slash — redefines
// `fetch`, `ReadableStream` and friends, which then fight the `dom` lib this
// project compiles against. That produced a fresh crop of errors in files that
// had none, so the whole package was never the fix.
//
// L-161 (R10.1): it was therefore **declared and referenced by nothing**, and
// has been removed from `package.json` along with `@types/tar` (superseded by
// `tar@7`'s own types, which resolve automatically). A dependency nothing can
// use is a dependency somebody will one day try to use — and the first thing
// they will find is the paragraph above. This file is the whole of what the
// test code needs from `bun:test`, and it has no package behind it.
//
// `mock.module` is the only thing the test code needs: `route-harness.ts` uses
// it to stub `next/headers` (without which no route can be driven at all), and
// `checkout-rollback.test.ts` uses it to make `appendFiscalEvent` throw
// mid-transaction. Declaring that one function keeps the surface honest — if a
// test reaches for more of `bun:test`, it has to be added here on purpose.
declare module "bun:test" {
  export const mock: {
    /** Replace a module's exports for the current test file. */
    module(specifier: string, factory: () => unknown): void;
  };
}
