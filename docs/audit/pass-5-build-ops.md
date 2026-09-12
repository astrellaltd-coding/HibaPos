# Pass 5 — Build, dependencies and operations

**What actually ships, and what happens while it runs.**

Read-only audit, 2026-09-12. Nothing outside this file was changed; nothing was committed.
Numbering starts at **L-89** as `docs/audit/README.md` instructs, so collisions with the other
five passes are expected and are resolved at consolidation.

**Nothing in this file is evidence of French fiscal or legal compliance.**

---

## 0. Baseline — re-measured, not trusted

Every figure below was taken today against this tree and the live database (read-only,
`bun:sqlite` with `readonly: true`). § 4 of the plan holds on **every** line.

| Thing | § 4 says | Measured 2026-09-12 | Verdict |
|---|---|---|---|
| Tests | 1382 pass / 0 fail / 114 files | **1382 pass, 0 fail, 114 files**, 359.07 s, 4469 `expect()` | ✅ (the `expect()` drift is the one § 4 predicts) |
| `prisma:error` blocks | zero | **zero** in the full run | ✅ |
| `typecheck` · `lint` | clean | both exit 0, no output | ✅ |
| `bun run build` | safe | exits 0, 56 routes | ✅ |
| Production sha256 | `0d304ee7…083cdb`, 884 736 B | **identical**, mtime still 2026-09-11 16:33:12, no `-wal`/`-shm` | ✅ |
| Migrations | 15 applied, none pending | **15**, all `finished_at` set, none pending | ✅ |
| Trading tables | all fifteen zero | **all fifteen zero** | ✅ |
| Fiscal counters | 0/0/0/0 | **0/0/0/0**, `FiscalEvent` empty | ✅ |
| Catalogue | 84 products / 14 categories / 80 on grid | **84 / 14 / 80** (`active=1 AND showOnPos=1`) | ✅ |
| Duplicate names | none | **none** (`GROUP BY name HAVING COUNT(*)>1` → 0 rows) | ✅ |
| `integrity_check` · FK | ok · 0 | **ok · 0**, `schema_version` 171 | ✅ |
| Journal mode | `delete` | **`delete`** | ✅ |

**No drift.** The operator has not edited the catalogue since 2026-09-11 16:33.

Two things worth recording that are not drift:

- `active=1` is **83**, not 84 — `5 nuggets test` is still there and still inactive. **already L-81.**
- `TechnicalLog` carries **9 rows in production, all the same WAL-refusal WARN**, one per
  application start. `AuditLog` carries 601 rows.

### The app was run, and on a proved scratch copy

`db/custom.db` was copied to the scratchpad, a marker user `AUDIT5 MARKER SCRATCH` was written
into the **copy** with the app's own `hashPin` under a path guard, and the built server was
started on **port 3095** (3090 was already listening — another pass) with `DATABASE_URL`,
`HIBAPOS_DATA_DIR` and `BACKUP_LOCATION` all pointed at the copy. `.next/BUILD_ID`
(`-HVfkgzQ4Fe9gzXYDCwBV`, 11:53:24) is newer than every source file.

**Proof before any write:** the pre-auth `GET /api/auth/profiles` returned the marker first in
the list. The server had the copy open. Afterwards the copy was deleted and production's sha256,
size, mtime and the absence of sidecars were re-confirmed — all unchanged.

---

## 1. CONFIRMED findings

Ranked by what could lose money, lose the recovery path, or stop the till taking money.
Every row was measured, not inferred; the method is in the "How established" column.

| id | sev | file:line | what is wrong | how established | cost to fix |
|---|---|---|---|---|---|
| **L-89** | **High** | `src/lib/services/backup.ts:466-478` | **A failed backup strands an unencrypted copy of the whole database in the backup directory, permanently and invisibly.** `VACUUM INTO` writes `hibapos-backup-<stamp>.db` in plaintext at `:466`; it is unlinked only at `:478`, *after* `encryptFile` at `:477`. `createBackup` has **no `try`/`finally` anywhere in its body** (441-530), so any throw between those lines — a full disk is the obvious one — leaves the plaintext file behind. It gets no `Backup` row, so `pruneBackups` (which iterates rows) never removes it, `listBackups` never shows it, and the operator cannot learn it is there. **`BACKUP_LOCATION` on this install is `C:/Users/einer/OneDrive/Desktop/HibaPOS-Sauvegardes`** — so the file would be synced to OneDrive. | `fs.promises.writeFile` patched to throw `ENOSPC` for `.dbenc` only, real `createBackup` run against the scratch copy. Result: `hibapos-backup-2026-09-12T11-10-02-481Z.db`, **741 376 bytes**, header `SQLite format 3`, `integrity_check` ok, 84 products, 3 `User` rows with their `pinHash` column. Deleted afterwards. | Small. `try { … } finally { await fs.unlink(plainDbPath).catch(()=>{}) }` around 466-478. The file's own L-62 comment at `:826-838` already argues for exactly this shape ("Deliberately in `finally` rather than in a `catch`: the failure that leaves litter is by definition the one nobody predicted"). |
| **L-90** | **High** *(Tauri-reachable, not reachable today)* | `src/instrumentation.ts:37-39` · `src/lib/auth.ts:37-44` | **A malformed `SESSION_SECRET` produces a till that looks fine and cannot take a login.** The server prints `✓ Ready`, the login screen renders 200, `GET /api/auth/profiles` answers 200 with the profile picker populated — and `POST /api/auth/login` answers **`500 Internal Server Error`**. The bootstrap failure is swallowed at `instrumentation.ts:38` into `console.error` alone; **nothing is written to `TechnicalLog`**, so after the process dies there is no record at all. | Measured. Started the built app on the scratch copy with `SESSION_SECRET="tooshort"`. stdout: `[startup] secret bootstrap failed Error: SESSION_SECRET must be at least 32 characters long.` HTTP: `/` 200, `/api/auth/profiles` 200, `POST /api/auth/login` **500**, body `Internal Server Error`. | Medium. Two halves: `logTechnical("ERROR", …)` beside each `console.error` in `register()`, and a French answer for a resolvable-secret failure instead of a bare 500. |
| **L-91** | **High** *(fiscal availability)* | `src/lib/fiscal-key.ts:47-50` · `src/lib/api-handler.ts:133,164` | **A malformed `FISCAL_CHAIN_KEY` makes every fiscal write answer 500 with an EMPTY body — the exact regression the typed error exists to prevent.** `fiscalChainKey()` throws a **plain `Error`** for a short key at `:48`, three lines above the `ChainKeyMisconfiguredError` path the project introduced for the mixed-chain case. `isChainKeyMisconfigured()` is an `instanceof` test, so `api-handler.ts:133/164` does not map it and it falls through to a generic 500. The file's own docblock at `:73-82` describes this symptom and calls it "the worst version of this". Compounding it: **`chainKeyArmed()` (`secret-store.ts:185-188`) is length-blind**, so `GET /api/setup/secrets` reports `chainArmed: true` while the till refuses every sale. | Measured. Started with `FISCAL_CHAIN_KEY="tooshortkey"`; login succeeded (200), then `POST /api/fiscal/drawer` → **HTTP 500, zero-byte body**. Server log shows the throw inside `services/fiscal`. | Small. Throw `ChainKeyMisconfiguredError` (or a sibling typed error) at `fiscal-key.ts:48`, and length-check in `chainKeyArmed()`. |
| **L-92** | **Medium** | `src/lib/services/startup-migration.ts:69-71` | **When the migrations directory cannot be found, the gate reports `UP_TO_DATE`.** `migrationsOnDisk()` resolves `prisma/migrations` against **`process.cwd()`** — not `dataDir()`, which everything else in the file uses — and returns `[]` if it is absent. `pendingMigrations()` then filters an empty list and the gate answers `UP_TO_DATE` at `:200`. The failure mode is not loud; it is "everything is fine". | Code read, plus: the Next server trace `.next/next-server.js.nft.json` (604 entries) contains **zero** prisma-related entries — no `schema.prisma`, no `prisma/migrations/`, no query engine. Any packaging that follows that trace lands in exactly this state. | Small. Distinguish "directory absent" from "directory empty" and report a refusal; anchor the path deliberately rather than on `cwd`. |
| **L-93** | **Medium** | `src/lib/services/startup-migration.ts:143-166, 210-215` | **A data directory that cannot be written is reported as "another process is already applying migrations".** `takeLock()` catches the `mkdirSync`/`writeFileSync` failure, then the stale-lock reclaim's `statSync` throws too, and it returns `false` — which the gate turns into `SKIPPED_LOCKED` with the reason « Un autre processus applique déjà les migrations. » The migration then never runs, on every start, with a diagnosis that sends the operator looking for a second process. | Measured. `takeLock()`'s body reproduced verbatim against a data dir that is a file: outer catch `ENOTDIR`, inner catch `ENOENT`, returns `false`. | Small. Separate the "could not create" branch from the "already exists" branch. |
| **L-94** | **Medium** *(fiscal record)* | `src/lib/services/backup.ts:1016-1049` | **The retention prune journals its `SUPPRESSION_SAUVEGARDE` AFTER deleting every file; `deleteBackup` deliberately journals first and says why.** `deleteBackup:1085-1094` carries the rule in prose — "a trace written afterwards would be lost if the process died mid-delete" — and `pruneBackups` breaks it: the unlink loop runs `:1016-1040`, the `appendFiscalEvent` at `:1049`. Prune is the **automatic** path (every Z close) and therefore the frequent one; `deleteBackup` is the rare manual one. | Code read, both functions side by side. | Small. Move the `appendFiscalEvent` above the loop, journalling the doomed list. |
| **L-95** | **Medium** *(Tauri)* | `src/instrumentation.ts:38, 59, 65, 92` | **Every startup failure path reports only through `console.error`.** The secret bootstrap catch, the migration-gate outer catch and the pragma catch each write to stdout and nothing else. The *inner* results do reach `logTechnical`, so the successful and refused paths are recorded — but a **thrown** startup failure leaves no database record at all. A Tauri bundle has nowhere to show stdout. | Code read, and confirmed live: the `SESSION_SECRET` probe (L-90) produced a stdout line and **zero** `TechnicalLog` rows. | Small. `await logTechnical("ERROR", "startup", …)` in each of the three catches. |
| **L-96** | **Low-Medium** | `src/lib/db.ts:35-40` | **The comment stating where the SQLite pragmas come from is wrong.** It says `?_fk=1` sets `foreign_keys` and `?_busy_timeout=5000` sets `busy_timeout`. **Prisma ignores both.** The right values happen to be in force because Prisma's SQLite connector sets them itself. The query string is also shipped in `.env.example:12`, so the Tauri install template will carry a parameter that does nothing, and anyone raising `_busy_timeout` for a slow disk will change nothing and believe they have. | Measured, three ways, on a copy: with `?_fk=1&_busy_timeout=5000` → `foreign_keys=1`, `busy_timeout=5000`; with **no parameters at all** → the *same* two values; with `?_busy_timeout=99999` → still **5000**. | Trivial. Correct the comment. Removing the query string changes nothing (measured) but is a separate decision. |
| **L-97** | **Low** | `src/features/shifts/cash-movement-dialog.tsx:20` → `src/lib/services/cash-movement.ts:27` → `src/lib/db.ts` | **A server-only module reaches the client bundle, and brings `@prisma/client` with it.** A `"use client"` dialog imports two pure values (`CASH_MOVEMENT_LABELS`, `requiresStepUp`) from a service whose module graph is `@/lib/db` → `@prisma/client`. The result is `.next/static/chunks/de62b42041536438.js`, **501.7 KB — the largest client chunk, 19 % of the 2.68 MB of client JS** — containing `db.ts` compiled for the browser (`let k=globalThis,R=k.prisma??new A.PrismaClient({log:["error"]});k.prisma=R`). It does **not** crash: the browser build's constructor returns a `Proxy` whose *get* trap throws, and `db.ts` never reads a property. It is lazily loaded, not in the initial page. **No secret leaks** — see § 2. `db.ts`'s top-level `globalThis` assignment is an INVARIANT and is what makes the module un-tree-shakeable, so the fix is on the service side, never in `db.ts`. | Reverse import graph over 104 modules in the closure of 59 `"use client"` entry files; then confirmed in the built artifact and in `react-loadable-manifest.json`. Eleven server modules are in that closure (`db.ts`, `fiscal-key.ts`, `aggregate`, `cash-movement`, `day-close-ticket`, `escpos`, `fiscal`, `receipt`, `sequence`, `settings`, `ticket-layout`) — only `db.ts` survives tree-shaking, because of its side effect. | Small. Move the two constants into a module with no `db` import. A `import "server-only"` in `db.ts` would turn any recurrence into a build error. |
| **L-98** | **Low** | `scripts/README.md` (the "What each script does" table) | **Three of the fifteen scripts are missing from the index, including the most important one.** The table documents twelve: `apply-migration.ts`, `build-box-menus.ts` and `trim-catalogue-names.ts` are absent. `apply-migration.ts` is the command **`CLAUDE.md` names as the only way a migration is applied here**, and the README is what `CLAUDE.md`-adjacent practice says to read first. | `ls scripts/*.ts` = 15; the table's rows for live scripts = 12 (the other two rows are in the "Removed in Batch 4.5" table and are correct). | Small, documentation only. |
| **L-99** | **Low** | `CLAUDE.md` (the hand-over command) · `scripts/apply-migration.ts:231-233, 263` | **The hand-over command is wrong about its own argument, and a wrong argument is silently skipped under a green banner.** `CLAUDE.md` says `bun scripts/apply-migration.ts --apply --expect <name>`, which reads as the migration name. `--expect` takes a **path to a rehearsal fingerprint JSON** (the script's own header and plan § 5 both say so). Given a non-path, `:232` prints "Expected fingerprint not found at … — skipped." and `ok` is untouched, so the run still ends **`✅ APPLIED AND VERIFIED.`** The primary protection survives (`ok = newlyApplied.length > 0 && stillPending.length === 0`, and the migration is named before and after), but the half that compares against the rehearsal is lost silently. The `catch` at `:257` has the same property. | Code read; `../db-snapshots/r31-acceptance/fingerprint.ts` and `r71-acceptance/fingerprint.ts` both exist, so the documented usage is live and only `CLAUDE.md`'s wording is wrong. | Trivial: `--expect <fingerprint.json>` in `CLAUDE.md` (operator's file — bring the text, do not edit). Optionally make an unreadable `--expect` set `ok = false`. |
| **L-100** | **Low** | `package.json:60,62` | **Two devDependencies are declared and used by nothing.** `@types/tar@^6.1.13`: `tar@7.5.22` ships its own types and `tsc --traceResolution` shows `import("tar")` resolving to `node_modules/tar/dist/esm/index.d.ts@7.5.22` — the `@types` copy is pulled in only as an automatic type-reference directive (there is no `types` array in `tsconfig.json`), i.e. v6 declarations loaded into a program that uses v7. `bun-types@^1.3.4`: **`src/types/bun-test.d.ts` exists precisely so it is never referenced** — "referencing it … redefines `fetch`, `ReadableStream` and friends, which then fight the `dom` lib". **Neither is on `docs/INVARIANTS.md`'s Deliberately retained list** — `tar` is, and `@types/tar` is a different package. | Full import inventory of `src/`, `scripts/`, `prisma/`, `tests/` and the root configs against `package.json`; `tsc --traceResolution`; `grep` for `bun-types` (two hits: `package.json`, and a comment saying why it is not used). | Trivial. Removal needs the usual `bun install` + lockfile + `bun run build` gate. |
| **L-101** | **Low** | `src/instrumentation.ts:41` | The comment reads "Then migrations … **Deliberately after the pragmas** and before anything serves". The migration gate is invoked at `:51`; `applyStartupPragmas()` is invoked at `:69`. **Migrations run before the pragmas, not after.** Harmless in effect (the first-ever start on a non-synced root migrates in rollback-journal mode and switches to WAL afterwards) but it states an ordering that was evidently designed and is not there. | Code read of the single `register()` body. | Trivial. Either the comment or the order. |
| **L-102** | **Low** *(Tauri)* | `.github/workflows/ci.yml` | **Both CI jobs are `runs-on: ubuntu-latest`; the product is a Windows application.** The Prisma engine is `query_engine-windows.dll.node`, the printer transport is the Windows RAW spooler, `.zscripts/` is PowerShell, and every path-sensitive behaviour this project has been bitten by (`EPERM` on rename, OneDrive locking, `MoveFileEx`) is Windows-only. Nothing is ever built or tested on Windows except by hand on this machine. Separately: the fast `checks` job runs typecheck/lint/tests but **not `bun run build`** — the gate the Phase 5 entry calls "the one that matters". The build does run, but inside the slower `e2e` job behind `prepare-db`, so a build break surfaces misattributed as an e2e failure. | Read `.github/workflows/ci.yml` in full. | Medium (a `windows-latest` matrix leg costs runner minutes); adding `bun run build` to `checks` is trivial. |
| **L-103** | **Low** | `src/lib/services/backup.ts:450,717` · `startup-migration.ts:121` · `scripts/decrypt-backup.ts:48` | **`BACKUP_SECRET` is a live fallback for the backup key in four places and is documented nowhere** — not in `.env.example`, not in `docs/INVARIANTS.md`'s Secrets section, not in the plan. `bootstrapSecrets()` and `scripts/rotate-secrets.ts` know only `BACKUP_ENCRYPTION_KEY`. So an install holding its key as `BACKUP_SECRET` would have a fresh `BACKUP_ENCRYPTION_KEY` generated and preferred by the `||`, orphaning every backup made under the old name — silently, because both names "work". | `grep` over `src/` and `scripts/` for `BACKUP_SECRET`; env-var inventory (17 variables read by code, 13 documented in `.env.example`). | Trivial: document it, or drop the fallback. |
| **L-104** | **Low** | `next.config.ts` (no `poweredByHeader`) | `X-Powered-By: Next.js` is served on the HTML route. Free to remove; nothing depends on it. The five deliberate headers are all present and correct (see § 2). | Measured with `curl -D -` against the running scratch server. | Trivial: `poweredByHeader: false`. |
| **L-105** | **Low** | `docs/INVARIANTS.md` (Deliberately retained list) | **Three live API routes are pinned by a test but absent from the retained list.** `table-withdrawal.test.ts:203-205` asserts `src/app/api/tables/route.ts`, `src/app/api/tables/[id]/route.ts` and `src/app/api/tables/seed/route.ts` stay. The invariants name only `tables-view.tsx` and the two unreachable branches in `checkout.ts` / `refund.ts`. A future cleanup reading the invariants — which is what they are for — would delete three files a test pins. | `grep` of the test; cross-read against the list. | Trivial, documentation only. |

### On the removal candidates, against the Deliberately retained list

Checked explicitly, as instructed:

- **`tar`** — on the list. **Stays.** Confirmed still loaded through a dynamic `import()` at `backup.ts:279` and `:403`, invisible to static analysis.
- **`tw-animate-css`** — on the list. **Stays.** Confirmed imported at `globals.css:2` (`@import "tw-animate-css";`, line 2, immediately after `@import "tailwindcss";`). `tailwindcss-animate` is not declared and not present.
- **`@types/tar`** — **not** on the list, and not the same package as `tar`. Removal candidate (L-100).
- **`bun-types`** — **not** on the list; `src/types/bun-test.d.ts` documents why it is unused. Removal candidate (L-100).
- **`vitest`** — **not** on the list, but **must stay**: all **114 of 114** test files import from `"vitest"`, exactly as `vitest.config.ts` claims. The justification is intact.
- **`prisma` (in `dependencies`, not `devDependencies`)** — **correct and now load-bearing at runtime.** `startup-migration.ts:133` spawns `bunx prisma migrate deploy`. It is not a misfiled devDependency.
- **`sharp`** — used at `src/app/api/media/route.ts:7`. Stays; it is the only native module in the server trace.
- **`/api/tables*`** — pinned by a test, missing from the list (L-105). **Do not remove.**

**Used-but-undeclared: none.** Every bare specifier in `src/`, `scripts/`, `prisma/`, `tests/`
and the root configs resolves to a declared package, a Node builtin or `bun:*`.

---

## 2. What is NOT wrong — negatives worth recording

These were checked because the pass asked, and they came back clean. Recording them saves the
next session the work.

- **No `.env` value reaches the client bundle.** All 57 files under `.next/static` were scanned
  for the literal value of every variable in `.env` (counts printed, values never): `DATABASE_URL`
  0, `SESSION_SECRET` 0, `BACKUP_ENCRYPTION_KEY` 0, `BACKUP_LOCATION` 0. The strings
  `SESSION_SECRET` / `BACKUP_ENCRYPTION_KEY` / `FISCAL_CHAIN_KEY` **do** appear in
  `a53c120298c9c2f0.js` — as the **names and French risk labels** of PREP-3's secrets screen
  ("Sans elle, le journal fiscal ne peut plus être vérifié du tout."). Names, not values.
- **The security headers are actually served**, on all three surface types — the prerendered
  HTML route, an API route and a static chunk: `Content-Security-Policy` (the full ten-directive
  value verbatim), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`.
  **No HSTS**, which is the documented deliberate omission and is right: DD-06 binds
  `127.0.0.1` over plain HTTP and `Strict-Transport-Security` would break the till.
  `'unsafe-inline'`/`'unsafe-eval'` in `script-src` are the second documented omission.
- **The cloud-sync refusal works, in both directions.** Production stays in `delete` mode with
  the French WARN; the scratch copy — whose path segment is
  `C--Users-einer-OneDrive-Desktop-Work-HibaFood-The-App`, containing the string "OneDrive" —
  **went to WAL**, with `PRAGMA journal_mode` returning `wal` and an INFO row. That is exactly
  the whole-segment matching `db-pragmas.ts:44-52` says it implements, tested against the trap
  it names.
- **`bun run build` does not touch the live database.** sha256 identical before and after, no
  sidecars created.
- **A locked SQLite database fails safely and is handled.** Held an exclusive write lock from a
  second process; a Prisma write **failed after 5 508 ms with `P1008`**. `tx-options.ts:62-66`
  catches `P1008` and `P2028` explicitly and maps them to a capacity answer, so this does not
  reach a cashier as a stack trace. The 5 s is Prisma's own `busy_timeout`, not the URL's.
- **The three inspect scripts and `decrypt-backup.ts` write nothing**, as documented.
  `decrypt-backup.ts`'s duplicated format constants are **in step** with `backup.ts`:
  salt 16 / IV 12 / tag 16, `scrypt N=2^17 r=8 p=1`, 32-byte key, `SQLite format 3` check.
- **The invariant greps both pass.** `git grep "new Database("` returns three hits, all prose or
  comment (`INVARIANTS.md:63`, `docs/SQLITE_WAL.md:59`, `apply-migration.ts:48`) — no script opens
  a database that way. `git grep "new PrismaClient("` returns eleven hits in `scripts/`, all
  deriving their path from `DATABASE_URL`, plus `prisma/seed.ts`, `src/lib/db.ts`,
  `backup.ts:553` (the staged-restore client, explicitly scoped) and `tests/e2e/prepare-db.ts`.
- **`db/secrets.json` is covered by `.gitignore`** (`/db/` at line 58) and does not exist on this
  install — `.env` supplies both secrets, so `resolveSecret` returns from the environment and
  never persists. Confirmed live: no `secrets.json`, no `migrate.lock`, no backup written at
  startup on the scratch run.
- **A failed automatic backup does not fail a Z close.** `shifts/[id]/close/route.ts:49-68`
  catches it, records `ERROR` in `TechnicalLog`, audits `BACKUP_FAILED`, and still returns the
  sealed Z with `backupError` in the payload. That is the right trade and it is implemented.
- **`.next/BUILD_ID` still exists under Next 16 + Turbopack**, so plan § 2's freshness check is
  still valid. It is written **last** in the build, at 11:53:24 against the build's 11:53:00 start
  — a `cat` issued while the build is finalising will miss it. Worth knowing; not a defect.

---

## 3. SUSPECTED — not settled

| id | sev | file:line | what I suspect | why I could not settle it |
|---|---|---|---|---|
| **L-106** | Medium | `src/lib/services/backup.ts:784-788` | **The same plaintext leak as L-89, on the restore path.** The pre-restore safety snapshot is `VACUUM INTO` → `sha256OfFile` → `encryptFile` → `unlink`, all **outside** the `try` that begins at `:791`. A failure at `:787` strands `pre-restore-<stamp>.db` in the backup directory. The L-62 comment at `:826-838` cleans up the *staged* files on every exit and does not cover this one, because it is created before the block it guards. | Structurally identical to L-89 and I proved L-89 by measurement, but I did not force a failure inside a real `restoreBackup` — that needs a `Backup` row, a decryptable file, and the maintenance gate, and the run is irreversible against whatever database it points at. Reported as suspected on purpose. |
| **L-107** | Low-Medium | `src/lib/services/startup-migration.ts:133-136` | `spawnSync("bunx", ["prisma","migrate","deploy"], { shell: true })` at startup. If a packaged bundle lacks the prisma CLI, `bunx` **fetches it** rather than failing — a network call from a till at boot, or a hang where there is no network. With `prisma` in `dependencies` and `node_modules` present this resolves locally and the concern does not arise. | Cannot be settled without a Tauri bundle. The gate's own failure handling is sound either way: a failed deploy leaves `stillPending > 0` → `FAILED_AFTER_MIGRATE` behind a verified backup, with the schema untouched. But see L-108 — the *message* is then wrong. |
| **L-108** | Low | `src/lib/services/startup-migration.ts:243-252` | When `deploy` simply never ran (CLI missing, spawn failed), the verdict is `FAILED_AFTER_MIGRATE` and the operator is told « Migration incomplète ou base incohérente … **Restaurez la sauvegarde** ». Nothing was changed; restoring is unnecessary work on a fiscal database and reads as though damage occurred. | The branch is correct in outcome and wrong in diagnosis; whether that matters enough to split is a judgement, and it needs the L-107 answer first. |
| **L-109** | Low | `src/lib/services/backup.ts:108-110` | The scrypt comment says `r=8 p=1` "keeps memory ~1 GiB peak". The actual requirement is `128 · N · r` = **128 MiB**. `maxmem` is set to 2 GiB here and to 512 MiB in `scripts/decrypt-backup.ts:77` — both work, so nothing is broken; the stated figure is 8× the real one and is the number anyone sizing a Tauri bundle would reach for. | Arithmetic, not measurement. I did not instrument the process's RSS during a real backup, and the transient buffers (three ~47 MB copies during media encryption) matter as much as scrypt does. |
| **L-110** | Low | `src/lib/services/log-retention.ts:66` · `shifts/[id]/close/route.ts:71` | `pruneLogs()` runs **only** at shift close. A till that is restarted daily but closed rarely accumulates `TechnicalLog` without bound — and it is the only durable record of a refused startup migration or a degraded backup. Production already carries 9 identical WAL-refusal WARNs, one per start; a genuinely different startup warning would sit among them. | A restaurant closes a shift daily, so in the intended operation this never bites. Whether it is worth a second trigger is a decision, not a defect. |

### What I could not settle without writing something

- **Whether a real pending migration applies correctly at startup.** There is none — production
  is at 15 of 15 — and creating one is a write. PREP-4's own entry says the same and says the
  first real exercise is the first Tauri update. L-92 and L-93 are about what happens *around*
  that path, and both were established without one.
- **Whether a Tauri webview accepts the session cookie.** `auth.ts:243-248` sets `secure: !isPlainHttp`,
  where `isPlainHttp` is `APP_URL.startsWith("http://")`. **Production `.env` has no `APP_URL`**
  (it holds exactly four keys: `DATABASE_URL`, `SESSION_SECRET`, `BACKUP_ENCRYPTION_KEY`,
  `BACKUP_LOCATION`), so the cookie is set `Secure` and works today only because browsers treat
  `http://127.0.0.1` as a trustworthy origin — which I verified: the login on port 3095 round-tripped
  a session over plain HTTP. Under a `tauri://` or `http://tauri.localhost` origin the answer is
  unknown and needs a Tauri shell.
- **The exact split of the 501.7 KB Prisma client chunk** between the browser runtime and the
  generated model tables. I measured the chunk and its cause, not its internal proportions.

---

## 4. The fifteen scripts — needed? correct? described accurately?

`scripts/` holds **15 `.ts` files plus `README.md`**. Every one still derives its database from
`DATABASE_URL`; none opens a hardcoded path.

| script | still needed? | still correct? | described accurately? |
|---|---|---|---|
| `apply-migration.ts` | **Yes** — `CLAUDE.md` names it as the only way a migration is applied here. | Yes. Dry run by default; refuses on a running process or a `-wal`/`-shm`/`-journal` sidecar; takes and sha-verifies a restore point; names the migration before and after. | **No — twice.** Absent from `scripts/README.md`'s table (**L-98**), and `CLAUDE.md` mis-states its `--expect` argument (**L-99**). |
| `pre-golive-reset.ts` | **Yes** — R6.1. Ran once on 2026-09-10; whether it runs again is a decision. | Yes, and the guards match the prose (refuses an armed `FISCAL_CHAIN_KEY`, refuses while the app answers, demands `EFFACER`). | Yes, and it carries the ⚠ it deserves. |
| `delete-product.ts` | **Yes** — L-81 is prepared and awaiting the operator. | Yes; six refusals including the sealed-payload one no schema can express. | Yes, in French, and the row was updated on 2026-09-11 to six refusals. |
| `rotate-secrets.ts` | **Yes** — the way `SESSION_SECRET` and `BACKUP_ENCRYPTION_KEY` are rotated; used on 2026-09-11. | Yes. Never prints a value; refuses when `FISCAL_CHAIN_KEY` is present; verifies the `.env` copy first. | Yes, including the ⚠ correction of the paragraph that once argued for destroying data. **But it does not know `BACKUP_SECRET`** — see **L-103**. |
| `seed-users.ts` | **Yes** — the only way back into a till whose PIN is lost. | Yes. One `update` of one column; refuses the two published PINs. | Yes. |
| `decrypt-backup.ts` | **Yes** — the only way to open a backup when the app will not start. | Yes; format constants verified in step with `backup.ts`. | Yes. |
| `fix-fiscal-counter.ts` | **Yes** — repairs a counter that would otherwise refuse every sale. | Yes; refuses to lower any counter (L-38). | Yes. |
| `init-fiscal-counter.ts` | **Yes** — for a fresh database. | Yes; refuses when the fiscal tables are non-empty. | Yes. |
| `build-box-menus.ts` | **Kept, spent** — applied (R3.3) and idempotent; re-running prints « déjà un menu composé ». | Yes. | **No** — absent from `README.md`'s table (**L-98**). Plan § 5 does carry it. |
| `trim-catalogue-names.ts` | **Kept, spent** — applied (R4.4) and idempotent; re-running prints `NOTHING TO TRIM`. | Yes; refuses a trim that would collide two siblings. | **No** — absent from `README.md`'s table (**L-98**). Plan § 5 does carry it. |
| `set-drink-vat-rates.ts` | **Kept, spent** — applied; idempotent; refuses a category tree it does not recognise. | Yes. | Yes. Its header cites **V-14**, which is not in plan § 8's table — check `docs/conformite-isca-map.md` § 9 at consolidation. |
| `fix-duplicate-product-options.ts` | **Yes** — the only repair for L-67's shape. | Yes; converted to `--apply` in 4.5, `--dry` kept as a no-op. | Yes, including the catalogue-deletion warning. It is the one script importing `src/lib/db`, and `README.md`'s Notes say so. |
| `inspect-db.ts` · `inspect-options.ts` · `inspect-product.ts` | **Yes** — read-only, and cheap. | Yes; write nothing. `inspect-options.ts` prints cents correctly since the euros→cents port. | Yes. |

Two smaller notes on the directory:

- `set-drink-vat-rates.ts` and `fix-duplicate-product-options.ts` are the only two without a
  `#!/usr/bin/env bun` shebang and the only two not marked executable (`-rw-r--r--` against the
  others' `-rwxr-xr-x`). Cosmetic; both are invoked as `bun scripts/…`.
- `README.md`'s Notes say « For **first boot** use `bun run db:seed` », while plan § 5 lists
  `db:seed` as **❌ Never, from this directory**. Both are right in their own frame — "first boot"
  means a fresh install, and `prisma/seed.ts:12-13` no-ops once any user exists, which it does
  here (3 users on the scratch copy, 2 in production). But a reader following the README on
  *this* machine runs a command the safety register forbids. Worth one clarifying clause at
  consolidation; I have not counted it as a finding.

---

## 5. Two numbers the packaging phase will want, and one piece of housekeeping

- **`node_modules` is 840.5 MB across 46 477 files.** The Prisma query engine alone is
  **20.2 MB** (`query_engine-windows.dll.node`), plus a 2.1 MB wasm engine and a 2.2 MB
  `index.d.ts`.
- **Backup retention's real disk ceiling is ~1.4 GB, not "30 small files".** `DEFAULT_RETENTION`
  is 30 `Backup` rows; each may reference a distinct media archive, and the current one is
  **49 129 786 bytes**. Media archives are content-addressed and reference-counted, so in steady
  state (photos sitting still) 30 backups share one archive and cost ~70 MB total — but every
  image upload changes the fingerprint and starts a new 47 MB archive that lives until its last
  referring row is pruned. Worth stating before a disk is sized.
- **`.next/dev` holds 1 223 MB** of stale dev-server artefacts from 2026-09-11 17:04 — 98 % of
  the 1 247 MB `.next` tree; the production build is ~24 MB. It is gitignored, so this is not a
  repository problem, but it sits inside the OneDrive-synced Desktop. Deleting it is safe and is
  the operator's call; I have not touched it.

---

## 6. Proposed § 7 rows

Proposed, not placed. Ids continue from L-88 per `docs/audit/README.md`; they will be reassigned
in the consolidation sweep.

| ID | Severity | Finding | Owner |
|---|---|---|---|
| **L-89** | **High** | A backup that fails after its `VACUUM INTO` leaves an unencrypted copy of the whole database in `BACKUP_LOCATION` — which is a OneDrive-synced folder on this install. `createBackup` (`backup.ts:441-530`) has no `try`/`finally`; the plaintext is unlinked only at `:478`, after `encryptFile` at `:477`. The file gets no `Backup` row, so nothing prunes it and nothing lists it. Measured: an injected `ENOSPC` on the `.dbenc` write left a 741 376-byte readable database with the `User.pinHash` column in it. | none |
| **L-90** | **High** | A malformed `SESSION_SECRET` gives a till that starts, prints `✓ Ready`, renders the login screen and answers `POST /api/auth/login` with a bare `500 Internal Server Error`. The bootstrap failure reaches `console.error` only (`instrumentation.ts:38`) and never `TechnicalLog`. Not reachable while `.env` holds a good value; reachable exactly where PREP-3 makes `.env` optional. | none |
| **L-91** | **High** | A malformed `FISCAL_CHAIN_KEY` makes every fiscal write answer **500 with an empty body** — the failure `fiscal-key.ts:73-82` documents as "the worst version of this" and introduced `ChainKeyMisconfiguredError` to prevent. The short-key branch at `:48` throws a plain `Error`, which `api-handler.ts:133/164` cannot map. `chainKeyArmed()` (`secret-store.ts:185-188`) is length-blind, so `GET /api/setup/secrets` reports the chain armed while the till refuses every sale. | none |
| **L-92** | Medium | `startup-migration.ts:69-71` resolves `prisma/migrations` against `process.cwd()` and returns `[]` when the directory is absent, so the gate reports `UP_TO_DATE`. The Next server trace carries no migrations, no `schema.prisma` and no Prisma engine, so a trace-driven package lands in exactly that state. | none |
| **L-93** | Medium | A data directory that cannot be written makes `takeLock()` (`startup-migration.ts:143-166`) return `false`, which the gate reports as `SKIPPED_LOCKED` / « Un autre processus applique déjà les migrations. » The migration then never runs, every start, under a wrong diagnosis. | none |
| **L-94** | Medium | `pruneBackups` (`backup.ts:1016-1049`) appends its `SUPPRESSION_SAUVEGARDE` fiscal event **after** unlinking every file. `deleteBackup:1085-1094` journals first and carries the reason in prose. Prune is the automatic path, run at every Z close. | none |
| **L-95** | Medium | Every *thrown* startup failure reports only through `console.error` (`instrumentation.ts:38, 65, 92`) and leaves no `TechnicalLog` row. A Tauri bundle has nowhere to show stdout. | none |
| **L-96** | Low | `db.ts:35-40` states that `?_fk=1` and `?_busy_timeout=5000` in `DATABASE_URL` set the SQLite pragmas. Measured: Prisma ignores both and sets the same values itself. `.env.example:12` ships the query string. | none |
| **L-97** | Low | `cash-movement-dialog.tsx:20` imports two constants from `services/cash-movement.ts`, whose graph reaches `lib/db.ts` → `@prisma/client`, putting a 501.7 KB Prisma browser chunk (19 % of client JS) in the bundle. No secret leaks; no crash. Fix on the service side — `db.ts`'s `globalThis` cache is an invariant and is what makes the module un-shakeable. | none |
| **L-98** | Low | `scripts/README.md`'s table documents 12 of the 15 scripts. Missing: `apply-migration.ts`, `build-box-menus.ts`, `trim-catalogue-names.ts`. | none |
| **L-99** | Low | `CLAUDE.md`'s hand-over command says `--expect <name>`; the flag takes a fingerprint JSON **path**, and a non-path is skipped silently while the run still ends `✅ APPLIED AND VERIFIED`. | none |
| **L-100** | Low | `@types/tar` (superseded by `tar@7`'s own types) and `bun-types` (deliberately unreferenced — `src/types/bun-test.d.ts` exists because of it) are declared and used by nothing. Neither is on the Deliberately retained list; `tar` is, and is a different package. | none |
| **L-101** | Low | `instrumentation.ts:41` says migrations run "deliberately after the pragmas". They run before (`:51` vs `:69`). | none |
| **L-102** | Low | CI runs only on `ubuntu-latest` for a Windows product, and the fast `checks` job does not run `bun run build` — the build is exercised only inside the slower `e2e` job. | none |
| **L-103** | Low | `BACKUP_SECRET` is a live fallback for the backup key in four places and is documented nowhere; `bootstrapSecrets()` and `rotate-secrets.ts` know only `BACKUP_ENCRYPTION_KEY`. | none |
| **L-104** | Low | `X-Powered-By: Next.js` is served; `poweredByHeader` is not disabled. | none |
| **L-105** | Low | `/api/tables`, `/api/tables/[id]` and `/api/tables/seed` are pinned by `table-withdrawal.test.ts:203-205` but are absent from `docs/INVARIANTS.md`'s Deliberately retained list. | none |
| **L-106** | Medium *(suspected)* | The restore path's pre-restore safety snapshot (`backup.ts:784-788`) has L-89's exact shape and sits outside the `try` that L-62 added. Not exercised. | none |
| **L-107** | Low-Med *(suspected)* | `spawnSync("bunx", ["prisma","migrate","deploy"], { shell: true })` at startup: if the bundle lacks the CLI, `bunx` fetches it over the network. Needs a Tauri bundle to settle. | none |
| **L-108** | Low *(suspected)* | When `deploy` never ran, the gate says « base incohérente … Restaurez la sauvegarde », though nothing was changed. | none |
| **L-109** | Low *(suspected)* | `backup.ts:108-110` states scrypt's peak as "~1 GiB". `128·N·r` is 128 MiB. `maxmem` is 2 GiB here and 512 MiB in `decrypt-backup.ts:77`; nothing is broken, the figure is 8× high. | none |
| **L-110** | Low *(suspected)* | `pruneLogs()` runs only at shift close, so `TechnicalLog` is unbounded on a till that restarts but does not close. It is the only durable record of a refused startup migration. | none |

### Rediscoveries — one line each, as instructed

- **already L-05** — `next.config.ts` has no `output` key. Still true. One measured addition
  for the Tauri phase, in § 7 below: reinstating `output: "standalone"` as-is would produce a
  bundle that cannot open its own database, because the server trace carries no Prisma engine,
  no `schema.prisma` and no migrations.
- **already L-51** — `backup.ts` reads the media archive into memory whole. Re-measured today:
  `hibapos-media-4b5ed80dca201113.enc` is **49 129 786 bytes**. The figure has not moved. One
  addition: since PREP-4 this also happens **at startup**, whenever a migration is pending, via
  `createBackup(null)` at `startup-migration.ts:116`.
- **already L-81** — `5 nuggets test` is still in the catalogue, still `active=0`.
- **already L-75** — 32-bit Windows. Carried to Tauri; nothing new.

### One bookkeeping discrepancy for consolidation

The nine "do not re-report" ids listed in the prompt and in `docs/audit/README.md` include
**L-82**, but `REMEDIATION_PLAN.md` § 7 has no L-82 — its ninth row is **L-88** (the day-close
slip not printing what was given away), which neither list mentions. One of the two is wrong.
I have treated § 7 as authoritative and left L-88 alone.

---

## 7. What Tauri needs to know from this pass

Ordered by how early the packaging plan has to answer it.

**1. The bundle must carry four things Next's own file trace does not.** Measured:
`.next/next-server.js.nft.json` has 604 entries and **zero** prisma-related ones — no
`query_engine-windows.dll.node`, no `@prisma/client`, no `schema.prisma`, no `prisma/migrations/`.
The only native module traced is sharp's. So:
- the Prisma client and its 20.2 MB Windows engine must be placed deliberately;
- `prisma/migrations/` must ship, and must be findable — today `startup-migration.ts:70` looks
  for it relative to **`process.cwd()`**, so the launcher's working directory is a load-bearing
  decision, not a detail;
- **if it is not found, the app says `UP_TO_DATE`** (L-92). The most important failure in the
  packaging story is currently silent.
- and this is the measured reason **L-05 is not a free choice**: reinstating `output: "standalone"`
  as-is yields a tree that cannot open its own database.

**2. Whether `bunx prisma migrate deploy` is reachable inside the bundle is still the open
question PREP-4 named — and the answer changes the message, not just the outcome.** The gate is
sound if the CLI is missing (nothing is changed, behind a verified backup) but it then tells the
operator to restore a backup that is not needed (L-108), and `bunx` may reach for the network
(L-107). Deciding this is a prerequisite for the first Tauri update, not for the first install.

**3. A till with no console loses every startup diagnosis.** The three `console.error` calls in
`instrumentation.ts` (`:38`, `:65`, `:92`) are the only report for a *thrown* startup failure —
measured live with the `SESSION_SECRET` probe: stdout got a stack trace, `TechnicalLog` got
nothing. Under Tauri, stdout goes nowhere. Route these to `logTechnical` **and** to something the
operator can see, before the installer ships (L-95).

**4. PREP-3 made `.env` optional, and that is exactly what makes L-90 and L-91 reachable.** On
this install they cannot happen — `.env` holds good values. On an install where a person types a
secret into a first-run screen, a short `SESSION_SECRET` gives a till that renders normally and
500s on login, and a short `FISCAL_CHAIN_KEY` gives a till that reports its chain **armed** and
answers every fiscal write with an empty 500. Both are cheap to fix and both are install-day
failures, which is the worst day to have them.

**5. The session cookie's `secure` flag is decided by `APP_URL`, which production does not set.**
`auth.ts:243-248`: `secure: !APP_URL.startsWith("http://")`. Production `.env` has four keys and
`APP_URL` is not one, so the cookie is `Secure` and works today only because `http://127.0.0.1`
is a trustworthy origin — verified, a login round-tripped over plain HTTP on port 3095. Whether a
`tauri://localhost` or `http://tauri.localhost` origin accepts it is **unknown and must be tested
in the shell**. The code comment at `:239` already anticipates the Tauri webview; the value is
simply not set.

**6. `BACKUP_LOCATION` pointing into OneDrive is the amplifier for L-89.** The high finding is
that a failed backup strands a plaintext database; the reason it is *high* rather than *medium*
is that this install's backup directory is inside a synced folder, so the plaintext leaves the
machine. Tauri's data-directory decision (DD-02 is explicitly deferred to this phase) should settle
where backups live at the same time as where the database lives — and should keep the two on
different volumes, which is still R6.5.

**7. Sizes, for the installer budget.** `node_modules` 840.5 MB / 46 477 files. Production
`.next` build ~24 MB (the other 1 223 MB of the `.next` tree is stale dev output). Client JS
2.68 MB across 42 files, of which **501.7 KB is a Prisma browser chunk the app has no use for**
(L-97) — the cheapest single reduction available. Largest CSS 96.6 KB. Backup retention's real
disk ceiling is ~1.4 GB, not the ~70 MB steady state.

**8. Nothing is ever built or tested on Windows.** Both CI jobs are `ubuntu-latest` (L-102),
while every platform-specific failure this project has had — `EPERM` on rename, OneDrive file
locks, `MoveFileEx` semantics, the RAW spooler transport — is Windows-only. A Tauri v2 Windows
app should not inherit a pipeline that has never compiled for its own target.

**9. Two dependency traps survive the move, in opposite directions.** `tw-animate-css` is a
**devDependency** that produces production-visible CSS: a `bun install --production` followed by a
build would silently drop every dialog and dropdown animation, with **no build error** (this is
the trap `docs/INVARIANTS.md` records, in the packaging form it will take next). And `tar` is
loaded through a dynamic `import()` that no bundler analysis sees. Any Tauri packaging step that
prunes dependencies must be checked against the built CSS artifact and against `backup.ts`, not
against a static import graph.

---

*Scratch copy created, proved by marker, and deleted. Production `db/custom.db` verified
byte-identical (sha256 `0d304ee7…083cdb`, 884 736 bytes, mtime 2026-09-11 16:33:12, no `-wal`
or `-shm`) after every step. No file in this repository was modified except this one, and
nothing was committed.*
