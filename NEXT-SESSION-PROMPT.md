# The next session

**Rewritten 2026-09-26.** The go-live is postponed — the owner is still testing and the operator is
waiting for his feedback. The operator's decision the same day: **the app is close enough to
production that the next thing is Tauri v2**, and before that, a clear-out. The old prompts are in
git history.

One prompt per session. Paste the block between the rules, and nothing else.

---

## WHERE THINGS STAND

**The France till is current and confirmed working**, running `81eb2f3`: 20 migrations, 86 products
with the Tacos, catalogue fingerprint **`a38c95977b5e1122`**, cut-off 0, boots itself fullscreen.
The owner confirmed the menu, the Tacos configuration and **printing** by telephone on 2026-09-25.
**Nothing is pending on either machine.** Both installs print the same fingerprint.

**The audit queue is down to decisions.** Closed 2026-09-25: L-225, L-226, L-232, L-206, L-237 and
L-207's cheap half; **L-234 closed as not a defect**. What remains is L-203 (a decision with a trap
in it), L-236, and L-207's other half.

**THE GO-LIVE IS NOT NEXT.** R6.1 → R6.2 → R6.3 wait on the owner's feedback. Do not start them, do
not arm the chain key, do not turn FACTICE off.

---

## SESSION A — are we ready for Tauri v2, and what is no longer needed

HibaPOS France. Read `CLAUDE.md`, then `REMEDIATION_PLAN.md` § 1 and § 2, then **Group E** in
`docs/audit/FINDINGS.md` (`L-180`, `L-181`, `L-182`).

**Two jobs, and they are the same job.** The operator wants to move to a Windows native app, and
wants the things that exist only to support « run from source on a till » cleared away. So: **audit
readiness, say plainly what must be decided or built first, and propose what can go.** Bring the
list and wait — do not delete in the same breath as measuring.

### The architecture question, and it is the first one

**This is not a static site Tauri can wrap.** Measured 2026-09-26: **68 `route.ts` files** under
`src/app/api`, every one server-rendered on demand; `next.config.ts` sets no `output: "export"` and
no `"standalone"`; the app runs as `next start -p 3000 -H 127.0.0.1` (DD-06) with Prisma and SQLite
behind it. **So a Tauri shell has to host a real server**, as a sidecar or equivalent — that is the
decision everything else hangs off, and nothing in the repository has taken it.

**Say which shape is intended before costing anything else.** The plausible ones: ship Bun + the
Next server as a Tauri sidecar; or move the 68 routes into Rust and keep only the UI; or keep the
current Scheduled-Task model and drop Tauri. They are not close in cost and the rest of this list
reads differently under each.

### Group E is the readiness checklist, and it was written for exactly this

Three findings the audit deliberately could not decide « until someone decides the install layout ».
They are not stale — **they are the agenda**:

- **L-180** — `startup-migration.ts:217` runs `spawnSync("bunx", ["prisma","migrate","deploy"])` at
  startup. In a bundle without the Prisma CLI, `bunx` **fetches it**: a network call from a till at
  boot, or a hang where there is no network. **Measured 2026-09-26: `prisma` and `@prisma/client`
  are both in `dependencies` (^6.11.1), not `devDependencies`** — so it resolves locally *while
  `node_modules` is present*. Whether a Tauri bundle ships `node_modules` is the open question.
- **L-181** — the startup lock uses `writeFileSync(flag:"wx")`, whose atomicity is **not guaranteed
  over SMB/CIFS**, and it sits inside OneDrive today. Turns on where the data directory lives once
  the app is installed rather than run from a synced folder.
- **L-182** — `auth.ts:428` sets `secure: !isPlainHttp`, and **`APP_URL` is absent from `.env`**
  (checked). It works today because loopback is a trustworthy origin. **A `tauri://` or
  `http://tauri.localhost` origin is not what that logic was reasoned about**, and a cookie that
  silently stops being set is a login that silently stops working.

### What else packaging will touch, measured rather than guessed

- **`process.cwd()` is load-bearing in six runtime paths** — `paths.ts:43` (data dir default),
  `:174` (uploads), `:222` (app root fallback), `catalogue-transfer.ts:127` (image files),
  `api/logs/route.ts:15` (`dev.log`). **A packaged app's working directory is not its install
  directory.** `appRoot()` already has the hook — `HIBAPOS_APP_DIR` — and `dataDir()` has
  `HIBAPOS_DATA_DIR`; the audit is whether every path goes through them.
- **The printer runs PowerShell.** `printer-transport.ts:254` spawns
  `appRoot()/.zscripts/print-raw.ps1`. **That file must ship inside the bundle and stay
  resolvable**, or R6.4 — the row that took two days and a person looking at paper — silently
  regresses. This is the single most expensive thing on the list to get wrong.
- **CSP.** `next.config.ts` sets `default-src 'self'` and `connect-src 'self'`. Under a custom
  webview origin, « self » is a different thing.

### Then the clear-out — and this is where the tension lives

**This repository's rules push against deleting, and they were written for recorded reasons.**
`CLAUDE.md` says the six audit pass files **are evidence** and « are left as written ».
`scripts/README.md` opens by recording that its old header said « Safe to delete after running »,
that **this was not true**, and that the sentence is gone. Prefer **retiring into
`REMEDIATION_DONE.md` with provenance** over deleting outright — that is what §§ 3, 4 and 9 of the
plan already did.

**Measured 2026-09-25/26, so the session starts from facts:**

*Four documents no test reads:* `IMPLEMENTATION_PLAN.md` (33 147 bytes — its own header says « a
**historical record of what was believed on 2026-08-29** » under « ⚠ READ APPENDIX D BEFORE
TRUSTING ANY LINE IN THIS FILE »; **a document that warns you not to trust it is not a plan**, and
the only thing in the way is a citation at `maintenance.ts:11`), `docs/CHANGES-LOG.md` (36 378),
`docs/AUDIT-PROMPTS.md` (29 007), `docs/verification-8.1-2026-09-06.txt`.

*Seven one-off scripts, already applied on both machines:* `add-tacos.ts`, `build-box-menus.ts`,
`trim-catalogue-names.ts`, `set-tacos-image.ts`, `set-option-quotas.ts`, `set-drink-vat-rates.ts`,
`fix-duplicate-product-options.ts`. A different class from the standing tools — each made one
change once, and since 2026-09-25 the catalogue transfer does that job generically.
`scripts-docs.test.ts` pins the index, so each removal is a README row too.

*Three `.zscripts` nothing runs, one of them a hazard:* **`dev.ps1` runs `db:deploy` and `db:seed`
when the database is absent**, which § 5 marks « ❌ Never, from this directory » — a loaded gun in a
tracked folder, and arguably the best deletion on this list whatever Tauri does. `start.ps1` is
superseded by `hibapos-server.ps1`; `build.ps1` is L-209.

**AND NOTE WHAT TAURI DOES TO THAT LIST.** If the app becomes a packaged native app, the whole
Scheduled-Task model goes with it — `hibapos-server.ps1`, `hibapos-kiosk.ps1`, `install-windows.ps1`
and `update.ps1` are all « run from source » scaffolding. **But they are live on the France till
today**, and they stay live until a Tauri build actually replaces them. **Do not retire the
launchers on the strength of a plan.**

### What is NOT a candidate

`REMEDIATION_DONE.md` (469 KB) and `docs/audit/FINDINGS.md` (262 KB). FINDINGS **is the work list**
by `CLAUDE.md`'s second instruction; DONE is the audit trail. The six `pass-*.md` files are
evidence, one with a PIN caviardé. `docs/conformite-*` and `attestation-conformite.md` touch fiscal
claims and are not a session's to judge. If either big file is to be trimmed, that is its own
decision and its own session.

---

## SESSION B — L-203, and the obvious fix has a trap in it

HibaPOS France. Read **L-203** in `docs/audit/FINDINGS.md`, then `src/instrumentation.ts:68-120`.

The launcher refuses to boot on a pending migration; PREP-4 would have applied it behind a backup
it verifies. Two positions, written eleven weeks apart, and nothing reads both. Since 2026-09-25
neither recommends a forbidden command — that was L-206 — but the disagreement is untouched.

**`DROP REFUSAL 2` IS NOT SUFFICIENT ON ITS OWN.** `instrumentation.ts` deliberately lets the
application start when the gate REFUSES for want of a verified backup — « a till that will not open
tells the operator nothing ». So removing the check leaves a till that boots and serves **new code
against an old schema**, the mid-sale failure refusal 2 exists to prevent. Closing it means deciding
whether the app should refuse to **serve**, not merely to migrate — a fiscal-behaviour change, so
bring both shapes and wait. **Note it may be moot under Tauri**, which is a reason to settle the
packaging shape first.

---

## SESSION C — the small leftovers

- **L-236** — `hibapos-server.ps1.ps1` on the till, which nothing executes, and
  `secrets.json.1192.tmp` from commissioning evening (202 bytes against the real file's 275).
  **Read the second before deleting it** — it may hold partial secret material.
- **L-207's other half** — the Scheduled Task names live in four places and no document states
  them: `HibaPOS Server` and `HibaPOS Kiosk`, measured on the till 2026-09-20.
- **The untested branch in the close route** — its `try/catch` around the day seal fires only if the
  walk throws. The print routes solved it for L-186 with an injected printer.

---

## What is NOT next, and why

- **The go-live.** Postponed — the owner is still testing.
- **The catalogue transfer has never been used against the France till.** It works, proved end to
  end on scratch copies, but the first real menu change is its first real test.
- **`update.ps1` has never been run with `-Apply`.**
- **The repository is PUBLIC**, measured 2026-09-20. No `.env`, no database, **no SIRET** — but the
  audit documents list open findings for a live POS. The operator's decision, not a defect.

## Four habits that paid for themselves, keep all of them

**A number handed forward as proof is a claim.** `2d62a6b83ba006bf` went into a hand-over as « the
proof it worked » and could not be reproduced at all. Anything re-run on another machine belongs in
`scripts/`, with its method in the header.

**Rehearse on the conditions the TARGET has.** L-233 passed every rehearsal here and failed on its
first run in France, because this machine cannot make a WAL database and that till always has one.
**This applies to Tauri more than to anything before it**: a packaged app's cwd, origin and
filesystem are all different from `bun run start`, and none of it can be rehearsed by running the
dev server.

**Measure before changing a guard.** L-234's fix was written, measured, and reverted: the defect did
not exist and the change would have weakened a working check.

**Strip the prose before asserting.** Six times an assertion has matched a comment explaining the
bug, or a message forbidding a command, rather than the thing itself. Pin the expression that
decides, never a name or a sentence.
