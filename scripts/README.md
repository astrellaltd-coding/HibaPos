# scripts/ — operator one-off tools

These scripts are **not** invoked by the app at runtime. They are run by hand,
from the project root, against whatever database `DATABASE_URL` points at.

Rewritten in **Batch 4.5** (C-17, L-37, L-38, DOC-09). What it used to say was
wrong in three ways that mattered, and the corrections are the rules below.

## Three rules

1. **`--apply` writes. Nothing else does.** Every script here is a dry run by
   default and reports what it *would* do. Two of them used to write with no
   flag at all, and a third wrote unless you remembered to pass `--dry`.
2. **Read the header before running anything.** Each file opens with what it
   changes and why it exists. This folder previously contained a script that
   destroyed the production database in one command with no confirmation
   (`port-real-data.ts`, removed in Batch 4.5 — finding L-37).
3. **`DATABASE_URL` is not a safety belt on its own.** It is what these
   scripts obey, so setting it at a scratch copy is how you test them — but
   verify the script actually reads it. `port-real-data.ts` opened
   `db/custom.db` by a hardcoded literal and ignored the variable entirely.
   Nothing in this folder does that any more, and nothing new may.

> **The old header said "Safe to delete after running." It was not true and it
> is gone.** `seed-users.ts` is the only way back into a till whose PIN has
> been lost, `decrypt-backup.ts` is the only way to open a backup when the app
> will not start, and `fix-fiscal-counter.ts` repairs a counter that would
> otherwise refuse every sale. Keep the folder.

## What each script does

Every deletion any script performs is named in this table. If a row says "no
writes", the script cannot change data at all.

| Script | What it does | Deletes? | How to run |
|---|---|---|---|
| `seed-users.ts` | **Resets the PIN of one existing account.** The new PIN is typed at the prompt and never echoed, never printed, and never stored in this file. Refuses an account that does not exist, and refuses the two PINs published in this repository. Journals the reset as `USER_PIN_RESET_SCRIPT`. | **No.** One `update` of one column. | `bun scripts/seed-users.ts` (lists accounts)<br>`bun scripts/seed-users.ts --user admin --apply` |
| `fix-fiscal-counter.ts` | **Raises `FiscalCounter` to `max(number)` of orders, shifts, Z reports and journal events** — the repair for a counter that has fallen behind its tables. **Refuses to lower any counter** (L-38). | No. | `bun scripts/fix-fiscal-counter.ts`<br>`bun scripts/fix-fiscal-counter.ts --apply` |
| `init-fiscal-counter.ts` | **Creates the `FiscalCounter` singleton at zero on a fresh database.** Refuses when the fiscal tables are non-empty, and points at `fix-fiscal-counter.ts` instead — creating it at zero beside sealed rows would rewind the counters (L-38). | No. | `bun scripts/init-fiscal-counter.ts`<br>`bun scripts/init-fiscal-counter.ts --apply` |
| `set-drink-vat-rates.ts` | Sets the sealed-container drink categories (`Canette`, `Bouteilles`) to 5,5 % VAT and their products to inherit. Refuses if the category tree is not the one it was written for. Idempotent. | No. | `bun scripts/set-drink-vat-rates.ts`<br>`bun scripts/set-drink-vat-rates.ts --apply` |
| `fix-duplicate-product-options.ts` | Finds product-level option groups that duplicate an inherited category global. | **YES — deletes `OptionGroup` rows** (and their choices, by cascade) with `--apply`. Catalogue data: see the warning below. | `bun scripts/fix-duplicate-product-options.ts`<br>`bun scripts/fix-duplicate-product-options.ts --apply` |
| `decrypt-backup.ts` | Decrypts an encrypted backup to a plain SQLite file, for when the app will not start. Refuses to write over `custom.db` or over an existing file. Needs `BACKUP_ENCRYPTION_KEY`. | No — writes only the output file you name. | `bun scripts/decrypt-backup.ts --list`<br>`bun scripts/decrypt-backup.ts <fichier.dbenc> <sortie.db>` |
| `inspect-db.ts` | Prints category and product counts and names. | No writes. | `bun scripts/inspect-db.ts` |
| `inspect-options.ts` | Prints each category's option groups, choices and add-ons. | No writes. | `bun scripts/inspect-options.ts` |
| `inspect-product.ts` | Prints one product's full graph. Takes the product name as an argument. | No writes. | `bun scripts/inspect-product.ts "Chicken Club"` |

> **The catalogue is real and irreplaceable.** Categories, products, options and
> images are the restaurant's own work. `fix-duplicate-product-options.ts` is
> the only script here that deletes catalogue rows — read its dry-run output
> line by line before passing `--apply`, and take a backup first.

## Removed in Batch 4.5

| Script | Why |
|---|---|
| `port-real-data.ts` | **Destroyed the production database in one command** (`bun scripts/port-real-data.ts`): it opened `db/custom.db` by a hardcoded literal, disabled foreign keys and ran `DELETE FROM` on every table before refilling from a 1 September copy. No flag, no dry run, and it ignored `DATABASE_URL`, so the usual scratch-copy protection did not apply. Its job — the euros→cents port — completed on 1 September, so the capability was spent. Finding **L-37**. Its source copy now sits outside the repo at `../db-snapshots/real-data-backup.pre-cents-port.2026-09-01T17-13-56Z/`. |
| `seed-category-options.ts` | Deleted products and wiped every category option group, choice and add-on **globally**, with no flag. It seeded a demo catalogue that the real 78-product one replaced. Finding **C-17**. |

Both remain in git history if the code is ever needed.

## Notes

- Scripts import `@prisma/client` directly rather than `src/lib/db`, so a CLI
  run does not pull Next.js server-only modules into scope.
  `fix-duplicate-product-options.ts` is the exception and imports
  `src/lib/db`; it works because that module has no Next.js imports.
- **`scripts/` is checked by `bun run typecheck` and `bun run lint`** since
  Batch 4.5. It was excluded from both (`tsconfig.json`, `eslint.config.mjs`)
  and nine database-mutating scripts had zero static checking — which mattered
  concretely: `hashPin` became async in Batch 4.2, and a missing `await` in
  `seed-users.ts` would have stored the string `"[object Promise]"` as a PIN
  hash with nothing to catch it.
- For **first boot** use `bun run db:seed` (`prisma/seed.ts`), not
  `seed-users.ts`. It creates the bootstrap accounts and the catalogue, takes
  its PINs from `SEED_ADMIN_PIN` / `SEED_MANAGER_PIN`, and no-ops once any
  user exists.
