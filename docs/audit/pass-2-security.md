# Pass 2 — Auth, access control and secrets

**Read-only audit, 2026-09-12.** Two roles (MANAGER, SUPER_ADMIN); CASHIER was removed from the
product (DD-07). Nothing in this file is evidence of French fiscal or legal compliance.

Twelve new findings, **L-89 … L-100**. Ranked by what could lose money or corrupt the fiscal
journal, not by how many. Three were confirmed by executing the code, not only by reading it.

---

## 1. Baseline — re-measured, not carried forward

Everything § 4 asks for was re-taken at the start of this session. **No drift.**

| Thing | § 4 says | Measured 2026-09-12 | |
|---|---|---|---|
| Tests | 1382 pass / 0 fail, 114 files | **1382 pass / 0 fail, 114 files**, 326 s | ✅ |
| `expect()` calls | 4467 observed, drifts | 4471 | ✅ (within the stated drift) |
| `prisma:error` blocks | zero | **zero** | ✅ |
| typecheck · lint | clean | **both clean**, exit 0 read from the command itself | ✅ |
| Migrations | 15 applied, none pending | **15, 0 unfinished** | ✅ |
| Trading tables | all fifteen zero | **all fifteen zero** | ✅ |
| Fiscal counters | 0/0/0/0 | **0/0/0/0**, journal empty | ✅ |
| Catalogue | 84 products / 14 categories / 80 on grid | **84 / 14 / 80** | ✅ |
| Duplicate product names | none | **none** | ✅ |
| Accounts | `manager` (MANAGER), `admin` (SUPER_ADMIN) | both, both active, 0 failed attempts, no lock | ✅ |

Read with `bun:sqlite` + `readonly: true` against `db/custom.db`. One `Session` row, consistent
with the 2026-09-11 `SESSION_SECRET` rotation entry.

### Method, and one deliberate omission

I did **not** start the server. `.next/BUILD_ID` is 2026-09-11 19:18 and the newest source
(`src/lib/services/startup-migration.ts`, 20:40) is **newer**, so the build is stale and running
it would have meant `bun run build` first — a repository mutation this pass was told not to make,
for observations the code settles on its own.

Instead I drove the modules that mattered directly, from **outside the repository**, with
`HIBAPOS_DATA_DIR` and `DATABASE_URL` pointed at throwaway scratchpad directories and no live
database in reach. That is how L-90, L-91 and L-92 were confirmed. One warning for whoever does
this next: **bun auto-loads the repository's `.env` from the cwd**, so `env -u SESSION_SECRET`
run *inside* the repo silently gets the real secret back. My first probe was contaminated exactly
that way and had to be re-run from the scratchpad. What that leaves unsettled is named in § 6.

---

## 2. CONFIRMED findings

| ID | Sev | file:line | What is wrong | How established | Cost to fix |
|---|---|---|---|---|---|
| **L-89** | **High** | `src/lib/api-authorization.test.ts:322` | The inline-guard detector is `/user\.role\s*!==\s*"SUPER_ADMIN"/`. That matches a **widened** guard — `!== "SUPER_ADMIN" && !== "MANAGER"` — exactly as well as a narrow one, so a route can be widened from SUPER_ADMIN-only to every-role and the whole suite stays green. `settings:PUT` is guarded this way and only this way (`settings/route.ts:25`), and `settingsSchema` carries **`discountApprovalThreshold`** (`validation.ts:372`, max 100 → every discount escapes the DD-19 step-up) and **`factice`** (`:374`, the R6.3 fiscal stamp). The widened form is already idiomatic here — **seven** of the fourteen INLINE routes use it — so it would not look wrong in review. | Read the regex; enumerated all fourteen INLINE handlers and their actual guard text; confirmed `settings:PUT`'s two fiscal fields. The test's own legend says INLINE means "refused in the handler", which is false for seven of them. | Small. Tighten the detector to distinguish the two forms and classify them separately (e.g. `INLINE_SA` vs `INLINE_ANY`), then re-pin the counts. ~1 h including the re-pin. |
| **L-90** | **High** *(for Tauri)* | `src/lib/approvals.ts:7-10` | PREP-3 moved `SESSION_SECRET` resolution onto the secret store, but converted **only `auth.ts`**. `approvals.ts` still reads `process.env.SESSION_SECRET` at module load and **throws at import** if it is absent. `resolveSecret()` does **not** write `process.env` — only `bootstrapSecrets()` does, from the async `register()` hook that `auth.ts:27-30` says a route module can beat. On an install with no `.env`, `auth.ts` resolves happily from `secrets.json` while `approvals.ts` throws on the same process. Blast radius is the checkout: `orders/route.ts:9` → `services/step-up.ts:43` → `approvals.ts`, so `POST /api/orders`, `/orders/[id]/refund`, `/auth/step-up` and `/cash-movements` are all in that module graph. | **Executed.** With `SESSION_SECRET` unset and a populated store: `resolveSecret('SESSION_SECRET')` → `generated`, `process.env` **still absent**; `import('@/lib/approvals')` → `THREW: SESSION_SECRET missing or too short for approvals module.` `bunfig.toml` names `approvals.ts` as a module whose import-time guard trips — the project knows the guard is there. | Small: one import change, mirroring `auth.ts`. The *verification* is the cost — it wants a fresh install with no `.env`, which does not exist yet. |
| **L-91** | **Medium** | `src/app/api/setup/chain-key/route.ts:35-44` · `secret-store.ts:165-175` | `POST /api/setup/chain-key` returns the live `FISCAL_CHAIN_KEY` on **every** call, not only the first: `armChainKey()` returns `{value: existing, alreadyArmed: true}` unconditionally. It writes an audit row **only** on the first arm (`:43` is inside the `!alreadyArmed` path), so every later read-back is untraced. This defeats the bound `setup/secrets/route.ts:28-29` documents in the same feature — "After POST, this route answers with nothing to show and **cannot be used to read a key back**". It can, through the sibling route. The real bound is "journal still empty" (`:27-33`), which is precisely the R6.2 → first-sale window. | **Executed.** `armChainKey()` #1 → `alreadyArmed=false`; #2 → same key, `alreadyArmed=true`; after `acknowledgeSecrets([...])` → **same key again**, `alreadyArmed=true`. | Small. Either return the value only when it is still unacknowledged (matching the sibling), or audit the read-back. Decide which — it is a deliberate trade-off (`:38-40`), just a wider one than documented. |
| **L-92** | **Medium-High** | `src/lib/services/secret-store.ts:64-82, 133-137` | A **corrupt** `secrets.json` is refused loudly, with the right reasoning ("overwriting it would discard a backup key and make every existing backup unreadable"). A **deleted** one is not: `readStore()` returns `{secrets:{}, unacknowledged:[]}` for a missing file, and `resolveSecret` then generates a brand-new `BACKUP_ENCRYPTION_KEY` with no error and no warning. Deleting the file is at least as destructive as corrupting it, and it is the outcome the corrupt path exists to prevent. | **Executed.** Key before delete `a97945f9…a3a2`; `rm secrets.json`; `resolveSecret('BACKUP_ENCRYPTION_KEY')` → `39abcbd0…dcd9`, source `generated`, **no error**. The corrupt-file case refused in the same run. | Small-medium. A marker (a `createdAt` sentinel, or a flag written beside it) that distinguishes "never installed" from "store went missing", and refuse the second. Needs a decision about first-run, so ~half a day with tests. |
| **L-93** | **Medium** | `src/lib/auth.ts:115` (definition) · `scripts/seed-users.ts:155` (only enforcement) | `isPublishedDefaultPin` is called from **exactly one place in the repository**, an operator CLI script. The application never consults it: `POST /api/users` (`users/route.ts:42`) and `PUT /api/users/[id]` (`users/[id]/route.ts:43`) both call `hashPin` on a bare `/^\d{6}$/`, and `POST /api/seed` (`seed/route.ts:65-66`) **installs `123456` and `111111` as live credentials** by default. `docs/INVARIANTS.md` states the guard as a property of the system; it is a property of one script. `auth.ts:103-108` records why this matters — on 2026-09-04 the operator's first attempt set the super-administrator to one of these two values, "caught by reading the repository, not by the application" — and concludes "the only reliable place to do that is **where the PIN is set**". The place the PIN is actually set in production is `PUT /api/users/[id]`. | `grep` over `src/ scripts/ prisma/`: one non-test call site. Read both user routes and the seed route. | Small: two `if (isPublishedDefaultPin(...)) return 400` calls plus the seed path. ~1-2 h with tests. |
| **L-94** | **Medium** | `src/app/api/auth/login/route.ts:133-136` vs `auth/unlock/route.ts:68-73, 87-89` | Two unauthenticated login paths with **different lockout arithmetic**. `unlock` clears an expired lock (`failedAttempts: 0, lockedUntil: null`) before verifying; `login` never does — so once an account has hit 5 failures, `newFailed` is 6, 7, 8… and **every subsequent wrong PIN re-locks for a further 15 minutes, indefinitely**. Two consequences. *Availability:* an operator who fat-fingers five times cannot recover through the login screen at all — each retry re-locks — while the lock screen would have cleared it. There are two accounts and a restaurant in service. *Guessing:* `unlock` yields 5 attempts per 15 min against `login`'s 1, so the weaker of the two doors is the unauthenticated one. | Read both routes line by line; the divergence is `: user.lockedUntil` (login `:136`) against `: null` (unlock `:89`) plus the expired-lock reset unlock has and login lacks. Not exploitable as brute force — 10⁶ keyspace at 480 guesses/day — the finding is the inconsistency and the till lockout. | Small. Give `login` the same expired-lock reset. The *decision* — is a permanent re-lock intended? — is the operator's. |
| **L-95** | **Medium** | `src/features/auth/login-screen.tsx:86-98` · `api/auth/profiles/route.ts:20-31` | The login screen's only data source is `GET /api/auth/profiles`, rate-limited 30/min on key `profiles:${ip}` where `clientIp()` returns the constant `"local"` (`http-rate-limit.ts:36`) — **one global bucket for the whole machine**. Its refusal is swallowed by a bare `catch {}` whose comment reads "The empty state remains visible if the profile request fails": no message, no retry, and the effect has `[]` deps so it runs once per mount. A 429 therefore shows an empty profile picker with no explanation, and a reload re-enters the same exhausted bucket. It is fetched in a `Promise.all` with `GET /api/seed`, so either failure takes both. | Read the route, the limiter and the client. 30/min is generous for a human; the bucket is shared by every local caller, background tab and reload. | Small: surface the 429 and retry after `Retry-After`. Worth doing — the failure mode is "the till will not open and says nothing". |
| **L-96** | **Low-Medium** | `src/app/api/fiscal/drawer/route.ts:10,43` · `backups/[id]/restore/route.ts` | DD-19's step-up (re-enter your own PIN) covers `DISCOUNT`, `REFUND` and `CASH_OUT` — money leaving the drawer **on the record**. It does not cover **physically opening the drawer**: `POST /api/fiscal/drawer` is `["SUPER_ADMIN","MANAGER"]`, i.e. every role, and takes no token. So the recorded way to take cash out needs a PIN and the unrecorded way does not. `step-up.ts:13-15` names the exact threat ("the UNATTENDED TILL: today a passer-by can…"); the client-side auto-lock (`use-auto-lock.ts:6`) bounds that window at **30 minutes**, and is client-side only. `POST /api/backups/[id]/restore`, which overwrites the live database, is likewise session-only (SUPER_ADMIN, no step-up). | Read all three routes and the step-up action enum (`approvals.ts:18`). The drawer open **is** journalled before the solenoid fires, correctly — the control is detective, not preventive. | Small mechanically (`ApprovalAction` already has the shape). It is a **policy decision for the operator**, not a defect to fix unasked. |
| **L-97** | **Low** | `src/lib/api-handler.ts:124-126, 152-154` | `withAuth`/`withAuthParams` return 403 with **no audit row**. A MANAGER probing SUPER_ADMIN routes leaves no trace anywhere, while `LOGIN_FAILED`, `USER_SWITCH_FAILED` and `MANAGER_APPROVAL_FAILED` are all journalled. Separately, `GET /api/setup/secrets` — the one route that returns a secret — writes **no audit row on the read**; only the harmless acknowledgement (`setup/secrets/route.ts:70`) is recorded. The disclosure is unlogged and the confirmation is logged. | Read `api-handler.ts` end to end (no `audit` import) and both `setup/secrets` handlers. | Small: one `audit()` call in each wrapper's refusal path and one on the secrets GET. Watch the audit log's retention knob and volume. |
| **L-98** | **Low** | `src/lib/auth.ts:88-92, 140-164` | A stored PIN hash is `salt:hash` and **records no scrypt parameters**, so nothing — not the app, not a script, not this audit — can tell a legacy `N=2^14` hash from a strong `N=2^17` one. Consequences: the legacy fallback can never be retired, because there is no way to establish the last legacy hash is gone; it is upgraded only on a *successful* login; and **every failed PIN costs two derivations** (~780 ms measured per `auth.ts:67-71`), on every auth route, forever, for a compatibility case that is probably already empty. | Read the format and both verify paths. The live hashes are almost certainly strong (both PINs were reset 2026-09-04, after the hardening) — the point is that the system cannot demonstrate it. | Medium: a parameter prefix on new hashes plus a migration window. Defensible to record and leave. |
| **L-99** | **Low** | `src/components/shared/nav-config.ts:60` · `features/admin/settings-view.tsx:116` | The `settings` nav entry is `["SUPER_ADMIN","MANAGER"]` while `PUT /api/settings` is SUPER_ADMIN-only. `canSubmit` does not consider the role, so a MANAGER opens Paramètres, edits `factice`, `discountApprovalThreshold`, the printer fields, presses « Enregistrer » — and gets a 403. This is DD-22's mismatch pointing the other way: there the API was wider than the navigation, here the navigation is wider than the API. (The two genuinely sensitive cards on that screen *are* guarded — `settings-view.tsx:559,561` render `FirstRunKeysCard` and `CatalogueTransferCard` only for a SUPER_ADMIN. That part is right.) | Read the nav table, the view and the route gate. | Trivial: disable the save for a non-SUPER_ADMIN, or narrow the nav entry. The API refuses correctly either way. |
| **L-100** | **Low** | `src/lib/auth.ts:243-251` · `.env` (no `APP_URL`) | `createSession` sets `secure: !appUrl.startsWith("http://")`, and an **unset** `APP_URL` keeps `secure: true` — deliberately, "fail-safe for prod". The live `.env` holds only `DATABASE_URL`, `SESSION_SECRET`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_LOCATION`: **no `APP_URL`**, although `.env.example:33` has one. So every session cookie this install sets is `Secure` while the server speaks plain HTTP on `127.0.0.1`. It works in Chromium and Firefox, which treat loopback as a trustworthy origin — but nothing in a Tauri bundle sets `APP_URL` either, and the custom-protocol origin a Tauri v2 webview uses is not something this decision was made against. | Read `auth.ts`, listed the key names in `.env` (keys only, never values) and compared with `.env.example`. | Trivial to set. The work is **deciding** what the Tauri origin is — see § 8. |

---

## 3. SUSPECTED — mechanism confirmed, trigger not

**L-90's trigger.** The throw is confirmed; what is *not* confirmed is whether Next 16 can
actually evaluate a route module before `instrumentation.register()` has finished. The project
asserts it can — `auth.ts:27-30` gives that as the reason `auth.ts` resolves through the store
rather than through `register()` — and `bunfig.toml` was written because these guards trip during
test collection. But I could not observe the real ordering without a fresh install, a real build
and no `.env`, which is three things this pass may not create. **If Next does guarantee the
ordering, L-90 downgrades to "one of two readers was left on the old contract" — still worth
fixing, no longer High.** It is the single most valuable thing for the Tauri phase to settle
first, because the failure mode is *the till cannot take money on a brand-new install*.

---

## 4. What I could not settle without writing something

- **Real status codes from real requests.** `api-authorization.test.ts` says plainly it "does not
  drive real requests and assert status codes", and `route-harness.ts` — which would — imports
  `bun:test` and so only runs inside `bun run test`. Adding a test file to `src/` is a repository
  change. Everything in § 2 is therefore established from the code and from module-level
  execution, not from an HTTP response. `withAuth` is ten lines and its behaviour is not in
  doubt; the *policy* questions above are what needed judgement anyway.
- **Whether any live PIN hash is still on legacy parameters** (L-98). Unknowable by construction —
  that is the finding.
- **L-47's mechanism.** See § 7.

---

## 5. Checked and found sound — so consolidation need not re-audit these

- **The API is the only server boundary.** One `page.tsx`, one `layout.tsx`, **no `middleware.ts`,
  no `"use server"` actions anywhere**, and no import of `@/lib/db` outside `src/app/api/` (the
  single hit is a test). There is no server-rendered data path that bypasses `withAuth`.
- **No stale role anywhere.** `getSession` re-fetches the user (`auth.ts:292-297`) and checks
  `active` and `lockedUntil`; `withAuth` gates on `session.user.role`, the fresh value. Nothing in
  `src/` reads `session.role` or `payload.role` — the cookie's copy is inert. Verified by grep.
- **No privilege escalation through the user routes.** `PUT /api/users/[id]:44` applies `role`
  only when the caller is already SUPER_ADMIN, so a MANAGER self-editing cannot promote itself.
  `switch-user` requires the *target's* PIN, which is what makes it safe — as its comment says.
- **The 100 % give-away is not a step-up bypass.** I expected one: `OFFERT` needs no PIN of its
  own. But `tender-policy.ts:114` requires `totalAfterDiscount === 0`, which needs
  `discountTotal === subtotal`, which is 100 % > any threshold ≤ 100, so
  `discountNeedsStepUp` is true and the token is demanded. Structurally closed.
- **The step-up token binding.** Amount-bound to the **server's** `discountTotal`, single-use,
  120 s, and `consumeStepUpToken` insists the token names the caller. The consume order (verify
  burns the token before the identity check) is the safe one. Both DD-19 call sites re-read the
  shift immediately before spending the token (L-41's fix) so a refused sale does not cost a PIN.
- **Path traversal on `DELETE /api/media`** (`media/route.ts:184-193`): resolves first, then
  `path.relative` + `startsWith("..")` + `isAbsolute` + empty check. Correct, and it validates
  before mutating.
- **`POST /api/upload`**: MIME allowlist, magic-byte consistency check, 5 MB per file, 250 MB
  tree quota, filename reduced to a safe charset, extension forced from `EXT_MAP`, folder
  sanitised to `[a-zA-Z0-9_-]`. No SVG in the allowlist. Sound.
- **Security headers** (`next.config.ts:37-66`): CSP with `frame-ancestors 'none'`,
  `object-src 'none'`, `connect-src 'self'`; `nosniff`; `Referrer-Policy: no-referrer`. The two
  omissions (HSTS, strict `script-src`) are documented with reasons that hold.
- **CSRF**: the session cookie is `sameSite: "strict"` + `httpOnly`, which is the defence; there
  is no token and no `Origin` check, which is acceptable for a loopback-bound single-origin app.
- **The rate-limit map is bounded** (`rate-limit.ts:38`) and the consumed-token map sweeps on
  every insert (`approvals.ts:63-69`). Both were previously unbounded; both are fixed.
- **`GET /api` (root)** touches no database and reports no build detail. Correct as an
  unauthenticated liveness probe.
- **`bootstrapSecrets` never auto-arms `FISCAL_CHAIN_KEY`** — the most dangerous thing this
  feature could have done, and it is explicitly not done (`secret-store.ts:128-131`).

One small drift worth recording, not a finding: `approvals.ts:41-46` says a token "can be
replayed once within its **60 s** TTL after a restart". `STEP_UP_TTL_SEC` is **120**
(`step-up.ts:57`), so the documented window is half the real one.

---

## 6. Known findings — rediscovered, not re-reported

- **already L-84** — `showOnPos` is a display rule, not a guard. Reconfirmed at
  `orders/route.ts`; nothing to add.
- **already L-47** — but with a **candidate mechanism**, which the plan says has never had one.
  L-47 is "the app renders its login screen even with a valid session in the in-app browser pane".
  That is exactly what a **rejected `Secure` cookie** looks like: login returns 200 with a user
  body, the cookie is dropped by the client, the next request carries none, the login screen
  returns. The configuration that would cause it is live and is L-100 — `APP_URL` is absent from
  `.env`, so every cookie is `Secure` over plain HTTP, and a pane that does not grant
  `http://127.0.0.1` trustworthy-origin status drops it silently. **This is a hypothesis, not a
  measurement** — testing it means setting `APP_URL="http://127.0.0.1:3000"` on a scratch copy
  and reproducing in that pane. It costs one session and would close a finding that has stood
  since Batch 4.

---

## 7. The two routes the prompt asked about, answered plainly

### `GET /api/setup/secrets` — are its claimed bounds sufficient?

It claims four. **Three hold exactly as written**, verified: `roles: ["SUPER_ADMIN"]`
declaratively and pinned by the gate test; `cache-control: no-store`; only secrets still awaiting
a record are returned, and `acknowledgeSecrets` has no inverse, so nothing puts a name back on
that list. The honesty of the comment is worth keeping — *"« Shown once » is a prompt, not a
security property"* is true, and a weaker file would have claimed otherwise.

**The fourth does not hold, and it is not this route's fault.** The route says a key "cannot be
used to read a key back" after acknowledgement. True of this route; false of the feature.
`POST /api/setup/chain-key` hands the live `FISCAL_CHAIN_KEY` back to any SUPER_ADMIN on every
call while the journal is empty, with no audit row on that path — **L-91**, confirmed by running
it. The bound the operator will read is the one in the comment, and the bound the system has is
"the journal is still empty", which is exactly the R6.2 → first-sale window.

Two smaller gaps against the same comment: reading the secret writes **no audit row** while the
harmless acknowledgement writes one (**L-97**), and the response includes `storedAt` — the
absolute path of `secrets.json` — which the caller who already has the values does not need.

**Verdict: sufficient for the threat it was designed against** (a till operator reaching the
backup key) **and insufficient as documented**, because the sibling route reopens the door the
comment says is shut. Close L-91 and the claim becomes true.

### `GET /api/auth/profiles` — acceptable for a restaurant install?

**Yes, with one caveat and one change that is not free.**

Why it is acceptable: it is a touch-screen profile picker, the server binds `127.0.0.1` (DD-06),
there are **two** accounts, and it returns no credential material. The enumeration surface C-18
notes is inherent to a picker — you cannot show people their own tile without naming them. The
operator has already seen it answer from a live server (PREP-1 found it that way) and kept it.

The caveat is what it returns beyond a picker's needs: **`role`**, which tells an unauthenticated
caller which of the two accounts is the super-administrator, and **`id`**, the cuid used as
`params.id` on the user routes. Neither is secret; both are free information.

**But removing `role` is not free, and I checked before recommending it.** `login-screen.tsx:250-251`
consumes it — `managerProfiles = profiles.filter(role === "MANAGER")` and
`adminProfile = find(role === "SUPER_ADMIN")` lay the screen out. So the honest options are (a)
keep it, accepting that the picker names the privileged account, or (b) replace it with a
non-privilege-named grouping flag the UI sorts on. (b) is maybe two hours including the tests.
For two accounts on a loopback-bound till, **(a) is defensible** — I would spend the two hours on
L-95 instead, which is on the same route and can stop the till opening at all.

---

## 8. Proposed § 7 rows — for the operator to place, not for me

| ID | Severity | Finding | Owner |
|---|---|---|---|
| **L-89** | High | `api-authorization.test.ts:322`'s inline-guard regex matches a **widened** guard as well as a narrow one, so `settings:PUT` can be opened to MANAGER — handing a till operator `discountApprovalThreshold` (escapes every DD-19 step-up) and `factice` (the R6.3 stamp) — with the suite green. Seven of the fourteen INLINE routes already use the widened form, so it reads as idiomatic. The map that DD-22 made a standing property mislabels 8 of 83 entries, in both directions. | none |
| **L-90** | High (Tauri) | `approvals.ts:7` still reads `process.env.SESSION_SECRET` at module load and throws; PREP-3 converted only `auth.ts`, and `resolveSecret` does not write `process.env`. Confirmed by execution. On a fresh install the module graph containing it is the checkout's. Trigger depends on Next's `register()` ordering, which `auth.ts:27-30` says cannot be relied on. | none |
| **L-91** | Medium | `POST /api/setup/chain-key` returns the armed `FISCAL_CHAIN_KEY` on every call while the journal is empty, unaudited on that path — defeating the "cannot be used to read a key back" bound `setup/secrets` documents. Confirmed by execution. | none |
| **L-92** | Medium-High | A **deleted** `secrets.json` silently regenerates `BACKUP_ENCRYPTION_KEY`, orphaning every existing backup; a **corrupt** one is refused loudly for exactly that reason. Confirmed by execution. Bites the Tauri install, not this one (`.env` wins). | none |
| **L-93** | Medium | `isPublishedDefaultPin` is enforced in **one CLI script** and nowhere in the application. `POST /api/users`, `PUT /api/users/[id]` and `POST /api/seed` all accept or install `123456` / `111111`. `docs/INVARIANTS.md` states it as a system property. | none |
| **L-94** | Medium | `login` never clears an expired lockout, so after the first one every wrong PIN re-locks 15 min indefinitely; `unlock` — unauthenticated, and a full login — does clear it. The till cannot recover through its own login screen, and the weaker door is the public one. | none |
| **L-95** | Medium | The login screen's only data source is rate-limited in one machine-wide bucket and its 429 is swallowed into a silent empty picker with no retry. The till will not open and says nothing. | none |
| **L-96** | Low-Med | DD-19 gates recorded money-out but not `POST /api/fiscal/drawer` (every role, no PIN) nor backup restore. Operator policy decision, not a defect. | none |
| **L-97** | Low | No audit row for a 403 from `withAuth`, and none for **reading** a secret through `GET /api/setup/secrets` — while the acknowledgement is audited. | none |
| **L-98** | Low | A stored PIN hash records no scrypt parameters, so a legacy `N=2^14` hash cannot be distinguished from a strong one, the fallback can never be retired, and every failed PIN costs two derivations. | none |
| **L-99** | Low | `settings` nav is MANAGER-visible while `PUT /api/settings` is SUPER_ADMIN and `canSubmit` ignores the role — DD-22's mismatch pointing the other way. | none |
| **L-100** | Low | `APP_URL` is absent from `.env`, so every session cookie is `Secure` over plain HTTP. Works on loopback in Chromium/Firefox; undecided for a Tauri origin. Candidate mechanism for L-47. | none |

---

## 9. What Tauri needs to know from this pass

**Six things, in the order they will bite.**

1. **Settle L-90 before anything else ships.** Today the app cannot start without `SESSION_SECRET`
   in `.env`, so this is invisible. A Tauri bundle has no `.env` by design — that is PREP-3's
   whole premise — and the failure mode is the checkout route failing to load on a brand-new
   install. It is one line to fix and one boot to verify. Verify it by *booting a bundle with no
   `.env`*, not by reading the code; the ordering is the unknown, not the throw.

2. **`.env` is currently doing security work that the bundle will not do.** Every finding in
   L-90/L-91/L-92 is masked on this machine because *the environment always wins* and `.env`
   holds the secrets. The moment the source of truth becomes `<dataDir>/db/secrets.json`, the
   store's two asymmetries become live: a deleted store silently makes new keys (L-92), and the
   chain key can be read back through the arming route (L-91). **Both are in the code that only a
   Tauri install exercises, and neither has ever run on a real install** — PREP-3 said so itself:
   *"Nothing here has been run against a real fresh install."*

3. **Decide `APP_URL` deliberately, and write it down.** It governs the session cookie's `Secure`
   flag (`auth.ts:243`), it is absent from the live `.env`, and the Tauri v2 webview origin is
   not the loopback HTTP origin this decision was made against. Get it wrong and the symptom is
   *login appears to succeed and the login screen comes back* — which is L-47, unexplained since
   Batch 4. Test L-47's hypothesis in the same session; it is nearly free once you are there.

4. **`<dataDir>` is now security-relevant, not just data-relevant.** DD-02 is marked moot and
   "where data lives is the Tauri phase's decision" — but `secretStorePath()` is
   `<dataDir>/db/secrets.json` at mode `0o600`, and `secret-store.ts:101-102` is explicit that
   the POSIX mode "does not map onto Windows ACLs". So the *directory's* ACL is the only thing
   protecting `SESSION_SECRET`, `BACKUP_ENCRYPTION_KEY` and `FISCAL_CHAIN_KEY` on the till. That
   is a packaging decision, and it belongs in the Tauri plan rather than being inherited.

5. **The unauthenticated surface is eight handlers and it is the installer's front door.** Six
   are fine. `POST /api/seed` creates a SUPER_ADMIN with a PIN this repository publishes whenever
   `User` is empty and the database has not traded (`account-policy.ts:87-102` documents this
   deliberately) — which on a fresh Tauri install is **the normal state on first boot**. The
   binding to `127.0.0.1` is what makes it acceptable; if Tauri ever serves on anything else, or
   if a first-run wizard replaces the seed route, L-93 stops being Low. Whatever replaces it
   should be the place `isPublishedDefaultPin` finally gets enforced.

6. **`api-authorization.test.ts` is the artefact Tauri planning will trust, so fix L-89 first.**
   It is genuinely good — it walks every route, classifies all 83 handlers, pins the counts, and
   makes a widening a test failure. That is exactly what a packaging phase wants to lean on. But
   its inline-guard detector cannot tell a narrowing guard from a no-op, so seven routes are
   recorded as guarded when nothing is refused, one (`tables/seed:POST`) is recorded as open to
   MANAGER when it refuses one, and the guard on the route that owns `factice` and the discount
   threshold can be removed in effect without turning the suite red. Repairing the detector is
   an hour, and every later pass inherits a map that means what it says.

**One thing that does not need to change.** The authorization model itself is sound: the API is
the only server boundary, the role is re-read from the database on every request, the session
cookie is signed, revocable per-session and `sameSite: "strict"`, the step-up token is
amount-bound and single-use, and the scrypt parameters are the right answer to a six-digit PIN.
Nine of the twelve findings above are about the **map, the documentation and the first-run path** —
not about the model. Carry the model into Tauri unchanged.
