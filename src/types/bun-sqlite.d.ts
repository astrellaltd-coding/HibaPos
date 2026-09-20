// Just enough of `bun:sqlite` to typecheck, and deliberately no more.
//
// Same bargain as `bun-test.d.ts` beside it, and for the same reason: pulling
// `bun-types` in — globally or with a triple-slash — redefines `fetch`,
// `ReadableStream` and friends, which then fight the `dom` lib this project
// compiles against. `apply-migration.ts`'s header records that collision as
// the reason it reads through Prisma instead, and names
// `app/uploads/[...path]/route.ts` as the file it breaks.
//
// But the plan's method for LIVE data is explicit and is not Prisma: « Read-only
// inspection of live data. `bun:sqlite` with `readonly: true`. Never load Prisma
// or the WAL startup hook against the production file. »
// `catalogue-fingerprint.ts` is that kind of tool — it is meant to be run
// against the France till while it is serving — so it needs the module, and the
// module needs a declaration that does not drag Bun's globals in behind it.
//
// The surface below is what that one script uses. Anything reaching for more of
// `bun:sqlite` has to add it here on purpose.
declare module "bun:sqlite" {
  /** A prepared statement, in the two shapes this project reads it. */
  export interface Statement {
    /** Every row. Parameters bind positionally to `?` placeholders. */
    all(...params: unknown[]): unknown[];
    /** The first row, or `null` when the query matched nothing. */
    get(...params: unknown[]): unknown;
  }

  export class Database {
    /**
     * `readonly: true` is the only mode anything here should open a live
     * database in — it is what makes the tool safe to point at a till.
     */
    constructor(filename: string, options?: { readonly?: boolean });
    query(sql: string): Statement;
    close(): void;
  }
}
