# HibaPOS France — HARD INVARIANTS

**Never break these.** Each one was learned by something going wrong.

---

## Why this file exists, and why it is not in the plan

It was **§ 3 of `REMEDIATION_PLAN.md`** until 2026-09-11, and it was the only part of that
document that is not about outstanding work. Two things follow from that, and both are the
reason it moved:

1. **The plan retires; these do not.** `REMEDIATION_PLAN.md` holds what is still to do, and it
   closes when Phase 6 closes. If these rules had gone with it, the knowledge that
   `tw-animate-css` is the animation plugin — and that removing the other one breaks every
   dialog **silently, with no build error** — would have retired too.
2. **The plan has a 40 960-byte ceiling**, deliberately, so that a session can read it in one
   pass before touching anything. This section was 8 442 of those bytes and was not outstanding
   work, so it was crowding the thing the ceiling exists to protect.

**Read this before changing anything, and read `REMEDIATION_PLAN.md` for what is outstanding.**
Nothing here expires because a phase closed. When one of these stops being true, it is amended
with a date and the superseded text — never quietly deleted.

---


Distilled from the constraints every completed batch left behind. Each one was learned by
something going wrong.

### Money and fiscal

- **All money is integer cents, end to end.** Storage, DTO, arithmetic. Euros exist only at the
  display boundary (`formatEuro`) and the input boundary (`parseEuroInput`).
- **`FiscalEvent` is never pruned, by any retention setting.** The audit log has a retention
  knob; the fiscal journal does not.
- **Sealed rows are immutable.** Never re-serialise a sealed payload to match a newer shape.
- **An archived `Receipt.content` is never re-rendered.** It is the document that was issued.
- **`apportion` is the only splitter.** Largest-remainder, so parts always sum to the whole.
  Never round per-line independently — that is how an order's VAT stops matching its total.
- **`OrderItem.vatRate` is a snapshot** taken at sale time from `resolveVatRate(product,
  orderType)`. A later catalogue edit must never restate a sale already made.
- **A thing is counted under its IDENTITY, never under its label** (R2.1/R2.2). Products by
  `productId`, menus by `comboProductId`; the name is the fallback only when the identity is
  gone. Names are not unique — three live pairs share one.
- **`itemsCount` counts a menu as ONE article, `topProducts` counts its components**, and
  `topMenus` is the third answer beside them. All three are right; none may be "reconciled".
- **`referencePrice` is null where no prorata happened.** Null is the statement. Never
  backfill it, never default it to 0.
- **`topMenus` is in the sealed close payload and NOT in `CLOTURE_Z`** — both halves are
  operator decisions, both pinned, both freeze at the first real close.
- **The client's `vatRate` is ignored.** `orders/route.ts` is the only place that decides what
  is booked. A tampered basket cannot choose its own tax.
- **Nothing may claim fiscal compliance.** Not this file, not `REMEDIATION_PLAN.md`, not a
  test result, not a document, not a passing suite.

### Database and process

- **`src/lib/db.ts` must cache the Prisma client on `globalThis` UNCONDITIONALLY.** The
  dev-only guard is what broke the restore: two clients meant two handles on the SQLite file,
  and Windows refuses to rename over an open handle.
- **Nothing in `scripts/` may open a database path not derived from `DATABASE_URL` or
  `HIBAPOS_DATA_DIR`.** `git grep "new Database("` was the check; today it returns exactly
  one hit and that hit is a *comment* (`scripts/apply-migration.ts:48`). No script uses
  `bun:sqlite` at all — the fifteen that touch a database go through `PrismaClient`, so **`git grep "new
  PrismaClient("` is the check that matches the current risk surface.** Run both.
- **Every script in `scripts/` is a dry run unless given `--apply`.** Read the header first.
- **Never run `bunx vitest` or `npx vitest`.** `vitest.config.ts` throws at import, on purpose:
  vitest never loads `test-setup.ts`, which is the only thing pointing `DATABASE_URL` at a
  throwaway database. **`bun run test` is the runner.**
- **Never run `git clean`.**
- **Never write to `db/custom.db` or to real menu data.** Scratch copy, both env vars
  overridden, marker proved first.
- **Applying a migration to production and editing the live catalogue are not CLAUDE's to
  do.** Prepare, rehearse, verify, hand over the exact command. *(2026-09-11: the APP now
  migrates itself at startup behind a verified backup — PREP-4. That is the application on its
  own machine; this rule is about Claude and is unchanged.)* **The command is `bun
  scripts/apply-migration.ts --apply --expect <name>`**, not `bunx prisma migrate deploy` —
  see § 5. The rule is unchanged; only the command is, and `CLAUDE.md` says
  the same since 2026-09-11.
- Stop any server you started with `taskkill //PID <pid> //T //F`. A leftover `next start`
  holds `query_engine-windows.dll.node` and makes `bunx prisma generate` fail `EPERM`.
  Ports 3021–3026, 3033/3034, 3040–3043, 3050–3052, 3060–3065 and 3070–3083 are spoken for.

### Printing and interface

- **No line any ticket renderer emits may exceed the paper.** `services/ticket-layout.ts` is
  shared by all three renderers — change it there or not at all. **Nothing is ever truncated**
  (BOFiP § 50); it wraps.
- **Touch targets are 44 px minimum**, enforced by `touch-and-labels.test.ts`.
- **Printing must never lose a sale.** The order, its payments and its fiscal event commit
  before anything reaches the printer. Every printer function returns an outcome instead of
  throwing.
- **A `REIMPRESSION` or `OUVERTURE_TIROIR` is journalled before the paper is attempted**, and
  whether or not it succeeds.

### Secrets

- **No PIN or secret value has ever been seen by Claude, and none is recorded anywhere.** Do
  not ask for one and do not write one down. `PUBLISHED_DEFAULT_PINS` in `src/lib/auth.ts`
  refuses the two values this repository publishes about itself.
- **`.env` carried to the till must be the one rotated 2026-09-11.** `SESSION_SECRET` was rotated that day (it had leaked into a session transcript); `DATABASE_URL` and `BACKUP_ENCRYPTION_KEY` were proved byte-identical across the rewrite, so **the two verified backups still decrypt**. The pre-rotation file is beside it as `.env.bak-before-session-rotation-2026-09-11`.
- **Arm `FISCAL_CHAIN_KEY` only on an empty journal**, after the reset and before the first
  real sale. Arming onto a journal holding unkeyed events is refused by design.

### Deliberately retained — do not "clean up"

- **`src/features/tables/tables-view.tsx`** is unreachable by design (DD-09 withdrew table
  service). `table-withdrawal.test.ts` asserts the file exists *and* is not wired.
- **The table auto-link/auto-free branches** in `src/lib/services/checkout.ts:281-285` and
  `src/lib/services/refund.ts:167-168` are unreachable
  today and stay. Do not delete them without reopening DD-09.
- **`round2` in `money.ts`** is retained though the fiscal path no longer uses it.
- **`tw-animate-css` is the animation plugin, NOT `tailwindcss-animate`.** The names differ
  by a hyphen; the app imports the first at `globals.css:2`. Removing the wrong one breaks
  every dialog and dropdown animation **silently** — Tailwind stops generating the classes
  with no build error. Check CSS, not just TypeScript. *(Left by Phase 5.)*
- **`tar` stays.** `backup.ts` loads it through a dynamic `import()`, so static analysis
  cannot see the use. The same trap pointing the other way. *(Left by Phase 5.)*
- **A media failure is journalled and never silent** (R4.1). `null` from `ensureMediaArchive`
  means « nothing to archive »; `{ unavailable }` means « could not archive ». Never conflate.
- **`CartAddOn.id` is `string`** (R4.2) — the checkout schema requires it. An id-less add-on
  is legal only in a *snapshot*; `cartAddOnsFromSnapshot` is the one boundary into the cart.
- **The session activity touch uses `updateMany`, never `update`** (R4.3): `update` throws on
  no-match and Prisma logs before the `.catch()` runs. And it writes **at most once a minute**
  (R4.6) — the value has no reader, and a write per request contends for SQLite's single
  write lock. A clean suite run now has **zero** `prisma:error` blocks, down from twelve.
- **A media failure never costs the database backup** (R4.5). Building the archive is guarded
  as well as loading `tar`, and **both** the plaintext `.tar.gz` and the incomplete `.enc`
  are unlinked (`backup.ts:356-357`). The reuse check is `existsSync(encPath)` on the
  **`.enc`** (`:326`), so it is the `.enc` unlink that defends it; the `.tar.gz` unlink is
  hygiene.
- **A reordered line carries REAL catalogue choice ids** (R4.7), resolved by name against the
  catalogue. `choiceId: ""` matches nothing in `pricing.ts` and silently drops the option.
- **`sellableAlone` and `slotProducts` are a PAIR, and the asymmetry is deliberate.**
  `pos-grid.ts` consults `showOnPos`; `combo-builder.ts` **does not**. That is what lets a
  food-only menu component exist without appearing on the till to be sold alone. Unifying
  them makes L-69's three boxes inexpressible again. Both files say so, pointing at each
  other, and `hidden-product.test.ts` asserts both halves in one test.
- **`/api/reports/vat`, `/api/reports/cashiers`, `/api/reports/products`** have no interface
  and are correct, tested and gated. They are the back-ends the reporting work will use.

---
