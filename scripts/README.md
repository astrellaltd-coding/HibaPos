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
   **The same applies to `BACKUP_LOCATION`**, which decides where backups live
   and overrides everything else (C-06).

   > ⚠ **This rule used to end « Nothing in this folder does that any more, and
   > nothing new may », and that sentence was FALSE for four days.**
   > `decrypt-backup.ts` — the recovery tool — resolved its directory from the
   > literal `db/backups` and ignored `BACKUP_LOCATION`, so on 2026-09-15, with
   > six backups in the configured folder, `--list` showed two files from five
   > days earlier and nothing newer. **The operator found it by running the
   > verification command and asking why today's backup was missing.** Fixed the
   > same day (**L-196**), and `scripts-docs.test.ts` now sweeps this folder for
   > the pattern, so the claim is checked rather than asserted.

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
| `apply-migration.ts` | ⚠ **THE ONLY WAY A MIGRATION IS APPLIED HERE**, and the command `CLAUDE.md` hands over — never `bunx prisma migrate deploy`, whose green banner is identical whichever migration it ran and was misread as applied twice when it was not. Refuses while anything holds the database open, or while a `-wal`, `-shm` or `-journal` file sits beside it — then one file is not the whole database. Takes a restore point in `../db-snapshots/` and verifies its sha256 before going on, applies, then re-reads and reports what actually changed. `--expect` takes a **PATH to a rehearsal fingerprint JSON**, not a migration name; **since R10.2 a path it cannot read fails the run** rather than printing « skipped » under a tick (L-166). | **Schema only.** It applies migrations and writes no rows of its own. | `bun scripts/apply-migration.ts`<br>`bun scripts/apply-migration.ts --apply --expect ../db-snapshots/r31-acceptance/fp-r31-after.json` |
| `seed-users.ts` | **Resets the PIN of one existing account.** The new PIN is typed at the prompt and never echoed, never printed, and never stored in this file. Refuses an account that does not exist, and refuses the two PINs published in this repository. Journals the reset as `USER_PIN_RESET_SCRIPT`. | **No.** One `update` of one column. | `bun scripts/seed-users.ts` (lists accounts)<br>`bun scripts/seed-users.ts --user admin --apply` |
| `fix-fiscal-counter.ts` | **Raises `FiscalCounter` to `max(number)` of orders, shifts, Z reports and journal events** — the repair for a counter that has fallen behind its tables. **Refuses to lower any counter** (L-38). | No. | `bun scripts/fix-fiscal-counter.ts`<br>`bun scripts/fix-fiscal-counter.ts --apply` |
| `init-fiscal-counter.ts` | **Creates the `FiscalCounter` singleton at zero on a fresh database.** Refuses when the fiscal tables are non-empty, and points at `fix-fiscal-counter.ts` instead — creating it at zero beside sealed rows would rewind the counters (L-38). | No. | `bun scripts/init-fiscal-counter.ts`<br>`bun scripts/init-fiscal-counter.ts --apply` |
| `rotate-secrets.ts` | **Rotates `SESSION_SECRET` and `BACKUP_ENCRYPTION_KEY`** (SEC-ROT / Batch 7.3). Generates both on this machine and **never prints them** — same rule as `seed-users.ts`. Copies `.env` aside and verifies the copy first, replaces only those two lines preserving their quoting, then re-reads and confirms every other line is byte-identical. **Refuses if `FISCAL_CHAIN_KEY` is present**, which is armed at 8.0 and must never be rotated, and refuses to invent a key that is absent. | **No rows.** Rewrites two lines of `.env`; the previous file is kept in the backup directory. | `bun scripts/rotate-secrets.ts`<br>`bun scripts/rotate-secrets.ts --apply`<br>Runbook: `REMEDIATION_PLAN.md` |
| `pre-golive-reset.ts` | ⚠ **P-04 / Batch 8.0 — the pre-go-live fiscal reset.** Deletes the development TRADING data and resets `FiscalCounter` to zero, so the restaurant's first genuine receipt is **#1**. Keeps the catalogue, users, settings **and the audit log**. Refuses if `FISCAL_CHAIN_KEY` is already armed (the arming comes after), and refuses while the app answers on 3000. Asks for `EFFACER` and a backup confirmation before writing. **Runs once, before the first real sale, and never after one.** | ⚠ **YES — the most destructive script here.** `Receipt`, `OrderItem`, `Payment`, `Refund`, `Order`, `ZReport`, `CashMovement`, `Shift`, `FiscalEvent`, `DailyClose`, `MonthlyClose`, `AnnualClose`, `FiscalArchive` (rows **and** files), `GrandTotal`, `Table`. | `bun scripts/pre-golive-reset.ts`<br>`bun scripts/pre-golive-reset.ts --apply`<br>Runbook: `REMEDIATION_PLAN.md` |
| `set-drink-vat-rates.ts` | Sets the sealed-container drink categories (`Canette`, `Bouteilles`) to 5,5 % VAT and their products to inherit. Refuses if the category tree is not the one it was written for. Idempotent. | No. | `bun scripts/set-drink-vat-rates.ts`<br>`bun scripts/set-drink-vat-rates.ts --apply` |
| `set-option-quotas.ts` | **L-217.** Sets how many of a category option group each taco size includes — `Tacos M` 1 viande, `L` 2, `XL` 3 — the operator's determination of 2026-09-18. A CEILING, not a requirement: the group's own `required` supplies the floor, and beyond the count the caisse refuses rather than charging. Refuses if a size is missing, if `Viande` is single-select, or if a size does not inherit the category's globals — a quota written against the wrong group is a ceiling that silently never applies. Takes its own sha-verified restore point and reads the rows back before claiming success. Idempotent. | No. | `bun scripts/set-option-quotas.ts`<br>`bun scripts/set-option-quotas.ts --apply` |
| `add-tacos.ts` | **L-215 / L-217, for an installation that never got the tacos.** Creates the three `CategoryOptionGroup` rows on the existing `Tacos` category — `Sauces` (9, free), `Viande` (6, obligatoire, only `Tenders` at +1,00 €), `Extras` (7 at +1,00 €) — their 22 choices, and the three sizes at 6,90 / 8,90 / 11,90 € with **+1,00 € en livraison**, the rule this catalogue keeps for every hot savoury item. Written because the France till and this machine diverged by exactly the tacos and nothing else: a section-by-section digest of both catalogues on 2026-09-19 matched on six of eight, and excluding the `Tacos` category's groups here reproduced the till's other two hashes to the character. **Refuses** if there is no `Tacos` category (it fills one in, it does not invent one — the icon is what the POS strip shows), if any `Tacos…` product or any group on that category already exists (it creates; it never merges), or if `ProductOptionQuota` is absent — that last one because the sizes would then exist with no ceiling, which is a taco taking six viandes for 6,90 €. One transaction, its own sha-verified restore point, and it re-reads every group, choice and price before claiming success. **It does NOT set the ceilings** — `set-option-quotas.ts` does, run it straight after — and it does NOT set the photo, which travels with the code into `public/uploads/Produits/` and appears in the médiathèque by itself. | No. | `bun scripts/add-tacos.ts`<br>`bun scripts/add-tacos.ts --apply`<br>then `bun scripts/set-option-quotas.ts --apply` |
| `catalogue-fingerprint.ts` | **L-229 — one number that says whether two installs hold the same menu.** Reduces every catalogue row to a natural key built from NAMES (`<category>/<product>/<group>`) plus its own non-id columns, so the fingerprint survives the fresh `cuid()`s `add-tacos.ts` mints and can be compared between this machine and the France till. A digest over raw rows cannot: the same menu created by a script twice has different ids both times, so it would report a correct transfer as a failed one. Covers `ProductOptionQuota`, which `CATALOGUE_TABLES` omits (**L-225**) and which is the difference between a `Tacos M` that includes one viande and one that includes six. Names any absent table rather than dropping it, because a schema that is behind is not a menu that differs. | **No writes.** Opens the database `readonly`, never through Prisma — safe on a till that is serving. | `bun scripts/catalogue-fingerprint.ts`<br>`bun scripts/catalogue-fingerprint.ts ../db-snapshots/tacos-rehearsal/custom.db` |
| `set-business-day-cutoff.ts` | **Sets `businessDayCutoffHour`** — the hour a trading day ends and the next begins. Exists because Réglages is the wrong instrument on both installs: reaching it here means running the app against the live catalogue, which § 5 forbids, and on the till DD-26 makes the field SUPER_ADMIN-only so the Gérant account in daily use is refused it (**L-230**). **`--hour` is required and has no default.** Carries a refusal the screen does not: it will **not RAISE the hour once any day has been sealed**, because moving the boundary later drags moments belonging to a later day back into a sealed one — one of the two things that arm **L-228**. Lowering is always allowed. Also refuses while a `-wal`/`-shm`/`-journal` sits beside the database, since then the restore point would not be the whole database. Reads the value back and re-parses it as a number. Idempotent. | **No.** One `upsert` of one `Setting` row. | `bun scripts/set-business-day-cutoff.ts --hour 0`<br>`bun scripts/set-business-day-cutoff.ts --hour 0 --apply` |
| `set-tacos-image.ts` | **L-232.** Points `Tacos M`, `L` and `XL` at `/uploads/Produits/Tacos.webp` — the one string **measured off the France till**, where the operator attached the photograph in the médiathèque on 2026-09-20, rather than a value retyped on a second machine. Until this runs, the Tacos are the only products a cashier can see with no photograph (the other imageless three are `showOnPos = 0`). Refuses if the file is not on disk, if a size is missing, or if any row **already points somewhere else** — overwriting that would undo a decision this script did not take. Checks for `-wal`/`-shm` only **after** closing its own read connection, so the check means something (see `apply-migration.ts` and L-234). Reads the rows back and checkpoints. Idempotent. | **No.** One `update` of one column on three rows. | `bun scripts/set-tacos-image.ts`<br>`bun scripts/set-tacos-image.ts --apply` |
| `build-box-menus.ts` | **R3.3 / L-69** — turns Box 15, Box 35 and the Tenders box into menus composés, so the sealed drink each one bundles is taxed at 5,5 % à emporter instead of the whole price sitting at 10 %. Per box: a hidden food-only component (`showOnPos = false`, never on the till grid), the existing product becomes the menu at the same name and the same price, then two slots — the food with exactly one choice so the cashier is never asked for it, and the drink from its whole category. Validates the shape and prices both services before booking. **It has already run** — `docs/BASELINES.md` records the 9 menus composés — and a second run **refuses each box it already built** rather than duplicating it. | **No.** It creates products, slots and choices; it deletes nothing. | `bun scripts/build-box-menus.ts`<br>`bun scripts/build-box-menus.ts --apply` |
| `trim-catalogue-names.ts` | **L-39 / R4.4** — strips the stray leading and trailing whitespace out of catalogue names, which otherwise render indented on the till. Touches `name` and nothing else, addresses rows **by id** — never by the name it is changing — and **refuses the whole run** if a trim would collide two siblings into one name. `docs/BASELINES.md` pins the outcome: **0 names carry stray whitespace** since R4.4, so a non-empty dry run today means the catalogue has been edited by hand since. | **No.** `name` updates only. | `bun scripts/trim-catalogue-names.ts`<br>`bun scripts/trim-catalogue-names.ts --apply` |
| `fix-duplicate-product-options.ts` | Finds product-level option groups that duplicate an inherited category global. | **YES — deletes `OptionGroup` rows** (and their choices, by cascade) with `--apply`. Catalogue data: see the warning below. | `bun scripts/fix-duplicate-product-options.ts`<br>`bun scripts/fix-duplicate-product-options.ts --apply` |
| `delete-product.ts` | Supprime **definitivement** une ligne `Product`. Le logiciel n a **pas** de suppression definitive : sa route `DELETE` desactive (`active: false`) pour preserver le lien avec les ventes passees, et c est le bon defaut. Ce script est pour le cas etroit d un produit cree par erreur, **jamais vendu** et **deja desactive**, qui survivrait sinon au reset du § 6. **Six refus** (2026-09-11 : trois auparavant) : produit non identifie de facon unique, produit encore actif, produit reference par une ligne de commande **ou par un menu compose** (`ComboSlot`, `ComboSlotChoice`), produit nomme par un **document fiscal scelle** (`topProductsJson`, `givenAwayProductsJson`, `dataJson` — du JSON sans cle etrangere, que rien d autre ne protege), point de restauration non conforme. Prend son propre point de restauration dans `../db-snapshots/` et se verifie ensuite. Ecrit un `AuditLog` `PRODUCT_HARD_DELETED` avec `userId: null` — c etait un script, pas une personne. | ⚠ **OUI — supprime la ligne `Product`**, et par cascade du schema ses `OptionGroup` et leurs `OptionChoice`. Rien d autre ; les groupes de la categorie ne sont pas touches. Donnees catalogue : voir l avertissement ci-dessous. | `bun scripts/delete-product.ts --id <cuid>`<br>`bun scripts/delete-product.ts --id <cuid> --apply`<br>*(la forme par nom marche toujours)* |
| `decrypt-backup.ts` | Decrypts an encrypted backup to a plain SQLite file, **for when the app will not start** — which is the one situation where it is the only way in. Refuses to write over `custom.db` or over an existing file; that second refusal is why running it twice reports « le fichier de sortie existe déjà » rather than silently redoing the work. Needs `BACKUP_ENCRYPTION_KEY`, and reads it from `.env` when the environment has none — the app may never have started. **`--list` reads `BACKUP_LOCATION` since L-196** (2026-09-15); before that it looked only in `db/backups` and could not see a single backup the app had taken. It also names the old folder when files are still sitting in it. | No — writes only the output file you name. | `bun scripts/decrypt-backup.ts --list`<br>`bun scripts/decrypt-backup.ts <chemin/complet/fichier.dbenc> <sortie.db>` |
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
- For **first boot on a FRESH install** use `bun run db:seed` (`prisma/seed.ts`),
  not `seed-users.ts`. It creates the bootstrap accounts and the catalogue,
  takes its PINs from `SEED_ADMIN_PIN` / `SEED_MANAGER_PIN`, and no-ops once any
  user exists.
  - ⚠ **NEVER FROM THIS DIRECTORY.** `REMEDIATION_PLAN.md`'s § 5 lists `db:seed`
    as « ❌ **Never, from this directory** », and it is right: `.env` here points
    `DATABASE_URL` at `db/custom.db`, **the live catalogue**. Both lines are true
    in their own frame — this one describes a fresh install in France, that one
    describes the machine you are reading it on — and without this clause a
    reader following the README runs a command the safety register forbids.
    That collision is **L-168**, and this clause is the fix (R10.2).
  - **The manager's PIN is GENERATED and shown once**, in a box, unless you set
    `SEED_MANAGER_PIN` yourself — and a published default (`123456`, `111111`)
    is REFUSED in that variable, before anything is written. **Write the printed
    one down as it appears**: it is stored only as a scrypt hash and this is the
    only time anything sees it. A PIN you chose yourself is never printed.
  - ⚠ **Until 2026-09-14 this path installed `111111`** — the value
    `POST /api/seed` had refused since R9.5, because R9.5's row named the route
    and not the CLI, and this file is what points a first boot at the CLI. That
    was **L-191**, and it is fixed; if you seeded an install before that date,
    the manager's PIN is the published one and must be rotated.
  - The admin PIN stays **`123456`** by default, and that is **the operator's
    decision of 2026-09-13**, taken knowing the value is published — not an
    oversight. It is recorded under R9.5 in `REMEDIATION_DONE.md`.
