# FINDINGS — the work list for finishing HibaPOS

**Consolidated 2026-09-12** from the six read-only audit passes in this directory. Ninety-four
findings, renumbered **L-89 … L-182** in one sweep, in two views: by severity, which decides
what is done first, and by the file the work lands in, which decides what is done together.

**What this is.** The list the remaining work is planned from. It stands alone: every row
carries enough of its evidence to be acted on without opening the pass file it came from.

**What this is not.** It is **not evidence of French fiscal or legal compliance**, and nothing
in it may be read as such — the attestation regime is the operator's, and
`docs/attestation-conformite.md` cites art. 441-1 of the code pénal. It is **not a packaging
plan**: the six pass files were each written believing Tauri v2 planning came next and close
with a section saying so, and that premise is no longer true — the app is finished first.
Where a pass parked a live defect because packaging would "change it anyway", the defect has
been re-judged on its merits and is on this list now. It is **not placed**: nothing here edits
`REMEDIATION_PLAN.md`; the operator decides what becomes a § 7 row.

**The six pass files are verbatim, with one exception.** `pass-4-till-in-use.md` recorded the
six digits of the PIN given to its scratch marker user; they were replaced by « redacted » on
2026-09-12, at the operator's instruction, when the directory was committed —
`docs/INVARIANTS.md` says no PIN or secret value is recorded anywhere, and a commit is
permanent. The PIN was dead when it was written (its user existed only on a scratch copy that
pass created and deleted). No finding, measurement or word of framing was altered in any of the
six, and that file carries a note saying so at the point of the edit.

---

## The verdict

**Ninety-four real findings: 7 in group A, 39 in B, 36 in C, 9 in D, 3 in E.** Nothing here
stops a first real sale from being *rung* — pass 4 rang a full evening through the interface
and every figure on every screen matched the database to the cent, and pass 1 reproduced all
nine rows of the VAT allocation policy exactly. What group A says is that several things
around the sale are wrong: a double-tap on « Valider » books the sale **twice** and inflates
a perpetual total that is never decremented (**L-89**); an ordinary category save silently
destroys the seven option rules that fix a menu's pizza size, moving the weight the 10 % /
5,5 % split is divided by (**L-91**); three report routes measure a period by calendar
midnight while every sealed document uses the 05:00 trading-day cut-off, so the VAT figure a
manager files can differ from the sealed close in both directions (**L-92**); and a settings
save that omits one key performs R6.3 — FACTICE off — silently (**L-93**).

**Two group-B rows block Phase 6 outright.** R6.3 and R6.4 are both `PUT /api/settings`, and
the restaurant's only operational account is refused 403 by it while the screen renders with
an enabled save button (**L-101**). And the USB print helper is resolved from
`process.cwd()`, while `powershell.exe -File <missing>` exits **0** — so a helper that never
runs is written to the database as `PRINTED` (**L-96**, reproduced here). That is § 6's own
« prints nothing and reports success », reached by the working directory rather than by a
COM1 queue.

**On the six passes themselves.** All six did the work. Each re-measured § 4 independently and
all six agree with each other and with my own re-measurement — no pass is running on inherited
numbers, and none reads as plausible-rather-than-checked. Passes 4 and 5 are the most
evidenced: pass 4 built and ran the app on a proved scratch copy and read every figure back
out with `bun:sqlite` instead of trusting the screen; pass 5 injected an `ENOSPC` and produced
an actual 741 376-byte plaintext database to prove L-104, and started the app with malformed
secrets to record the real HTTP answers. Pass 6 ran the suite three ways — natural order,
reversed, and all 114 files individually — which is the only way its one live order dependency
could have been found. Pass 3's structural work is the deepest in the set (15 migrations
replayed into a fresh database and diffed against the live schema, 33 tables, 0 differences).
**Pass 2 is the one with a caveat**: it declined to run `bun run build`, calling it "a
repository mutation this pass was told not to make" when `docs/audit/README.md` explicitly
permits it. It says so honestly and worked around it by driving modules directly, but the cost
is real — it could not assert a single HTTP status code, and it under-rated by three severity
steps a defect pass 4 then reproduced live (its L-99, here **L-101**). Trust pass 2 on
mechanism, not on severity.

---

## Baseline — re-measured 2026-09-12, and what the six reported

*« § 4 » below means `REMEDIATION_PLAN.md` § 4, the baselines table, which is what all seven
sessions measured against. **It moved to `docs/BASELINES.md` later the same day**, to make room
for this audit's twenty batches in the plan's § 6. The figures are the same; the address is
not.*

| Thing | § 4 says | Measured here | Six passes |
|---|---|---|---|
| Tests | 1382 pass / 0 fail / 114 files | **1382 / 0 / 114**, 156.60 s | all six: 1382 / 0 / 114 |
| `expect()` | 4467 observed, drifts | **4471** | 4469 · 4471 · 4473 · 4471 · 4469 · 4454 |
| typecheck · lint | clean | **both exit 0** | all six clean |
| Migrations | 15, none pending | **15, 0 unfinished, 0 rolled back** | all six |
| Trading tables | all fifteen zero | **all fifteen zero** | all six |
| Fiscal counters | 0 / 0 / 0 / 0 | **0 / 0 / 0 / 0**, journal empty | all six |
| Catalogue | 84 / 14 / 80 on grid | **84 / 14 / 80**; 83 active; 3 `showOnPos=0` | all six |
| Menus · slots · rules | 9 · 25 · 7 | **9 · 25 · 7** | passes 1, 3, 6 |
| Duplicate names | none | **none** | all six |
| Columns | 18 / 18 / 28, `schema_version` 171 | **18 / 18 / 28**, 171 | passes 3, 6 |
| Integrity · FK · journal | ok · 0 · `delete` | **ok · 0 · `delete`** | passes 3, 5, 6 |
| Production DB | sha `0d304ee7…`, 884 736 B | **identical**, mtime 2026-09-11 16:33:12 | all that measured it |
| L-81 | present, `active=0` | **present, `active=0 available=0`** | five passes |

**Two things only this session could check.**

1. **The six baselines do not differ, and that is itself the finding.** The prompt anticipated
   drift from a catalogue the operator edits between sessions. There was none: the production
   sha256 and mtime held across all six passes and this one, and every pinned figure is
   identical in all seven readings. The only variation is `expect()` — 4454 to 4473, a span of
   19 — which § 4 already predicts and which pass 6's 4454 sits at the low end of. Nothing in
   § 4 needs correcting. **Wall time varied 157 s to 364 s across seven runs**, confirming
   § 4's 4× warning again; mine is the fastest yet observed.

2. **§ 7 had no L-82.** The nine "already open, do not re-report" ids given to all six passes —
   and printed in `docs/audit/README.md` — named **L-82**, which `REMEDIATION_DONE.md:1179`
   records as *closed* ("**Finding:** L-82 closed · **Opened:** L-88", R7.2, 2026-09-11).
   § 7's actual ninth row is **L-88**, which neither list mentioned. Pass 5 caught this;
   verified here. The practical effect was nil — pass 4 rediscovered L-88 and filed it
   correctly as "already L-88". **`docs/audit/README.md` was corrected on 2026-09-12**, with a
   dated note recording the superseded value; the six pass files keep the list they were given,
   because they are evidence.

---

# VIEW A — by severity

Ordered by what could lose or invent money or corrupt the fiscal journal, then by what a
customer or an inspector could discover, then everything else.

Marks: **CONFIRMED** / **SUSPECTED** are the originating pass's own; **VERIFIED HERE** means
this session went to the `file:line` and read the code. Read-only is enough to read code; it
is not enough to run a revert, so a claim needing one stays SUSPECTED and says why.

---

## Group A — fix first: money and the fiscal record

*Seven rows. Each can lose or invent money, or write a fiscal document the software cannot
stand behind. There is no argument for deferring one.*

| id | sev | file:line | what is wrong | cost | saw it | mark |
|---|---|---|---|---|---|---|
| **L-89** | **High** | `components/pos/payment-dialog.tsx:151-244`, `:451` | **A double-tap on « Valider » books the sale twice.** `setLoading(true)` is React state and does not disable the button before a second click in the same task reaches the handler; nothing behind it is idempotent — `checkoutIntentSchema` has no request id and `createOrderInTransaction` has no duplicate check. Two orders, two sealed `VENTE` events, `GrandTotal` moved twice — and `GrandTotal` is **never decremented** (`schema.prisma:959-962`), so the inflation is permanent. A refund corrects the money; nothing removes the phantom sale. | Small → medium. A `useRef` submit latch closes the tap in a few lines; the durable fix is a client-generated idempotency key, unique-indexed — **a migration**. | 4 | CONFIRMED (reproduced: orders #9/#10, 28 ms apart, `FiscalEvent` 15/16; button still enabled at 60 ms) · **VERIFIED HERE** |
| **L-90** | **High** | `lib/services/checkout.ts:169-364` · `lib/api-client.ts` | **A committed sale whose HTTP response is lost is re-rung as a second sale.** Distinct from L-89's tap and with the identical permanent consequence: `api-client.ts` has no timeout and no retry, the catch shows « Erreur lors de l'encaissement », `clear()` never runs, and the cart is still on screen. The operator rings it again. | Closed by L-89's idempotency key. **Scope the key once, for both.** | 4 | SUSPECTED — could not be produced without killing the server mid-transaction |
| **L-91** | **High** | `app/api/catalog/categories/[id]/route.ts:147` | **Saving a category silently destroys the menu option rules that depend on it.** The PUT replaces option groups wholesale — `categoryOptionGroup.deleteMany({categoryId})` then re-`create` with fresh cuids — and `ComboSlotOptionRule.categoryOptionGroupId` is `onDelete: Cascade` (`schema.prisma:296`), so every rule goes with them. No error, no warning; `CATEGORY_UPDATED` records the category name and nothing else. All **7** live rules hang off one group, `Pizzas → Taille`. Losing them un-fixes the pizza size in Menu Chill / Eco / XXL — the cashier can ring a Junior in an XXL — and `componentReferencePrice` loses its pinned choice, **which moves the weight the 10 % / 5,5 % allocation divides by**. The client sends `optionGroups` unconditionally on every save, so a GET→PUT round trip with no edits is enough. | Medium. Honest fix: match incoming groups by id and update in place. Cheap interim: refuse a delete when a rule depends on the group, naming the menu. **Survives packaging either way** — it is a route, not a path. | 3 | CONFIRMED (cascade proved on a scratch copy with `foreign_keys=ON`) · **VERIFIED HERE** |
| **L-92** | **High** | `lib/report-range.ts:45-70` | **Three report routes measure a period by calendar midnight while every sealed fiscal document uses the trading-day cut-off**, so the VAT figure a manager files can differ from the sealed close for the same month, in both directions, silently. `parseReportRange` takes no `cutoffHour` and cannot — `period.ts:19-22` made that argument required *precisely* so "the compiler finds every caller", and `report-range.ts` is a separate module the compiler never saw. | Small code, real decision. Add `cutoffHour` and pass it at the three sites (each route can already `await getSettings()`), or derive bounds from `monthBounds`/`businessDayBounds`. The decision: should a free `Du`/`Au` range snap to trading-day edges, and what does the screen then say it showed? One batch. | 1 | CONFIRMED (one 02:30 ticket: sealed `MonthlyClose 2026-08` vatTotal **104**, `GET /api/reports/vat?from=2026-08-01&to=2026-08-31` → **totalVat 0, rows []**) · **VERIFIED HERE** |
| **L-93** | **High** | `lib/validation.ts:356, 374` vs `lib/services/settings.ts:49` | **Two default tables disagree on the fiscal stamp, and the write side wins.** `settingsSchema` materialises `factice: false` and `printerConnection: "network"` for an absent key; `DEFAULT_SETTINGS` answers `true` and `"usb"`. `PUT /api/settings` parses with the schema and hands the result to `saveSettings`, which does `{...current, ...input}` — a *present* key overwrites. So **a settings save that omits `factice` performs R6.3 silently**, and one that omits `printerConnection` undoes the 2026-09-11 USB decision R6.4 rests on. Both defaults are pinned separately (`validation.test.ts:55`, `fresh-install-defaults.test.ts:79`); **nothing asserts they agree**. | One test that parses empty input and asserts every materialised key equals `DEFAULT_SETTINGS` (~20 lines), plus the operator's call on which table is authoritative. Latent today — the only client posts the whole DTO — and reachable by any second client. | 6 | CONFIRMED · **VERIFIED HERE** |
| **L-94** | **High** | `lib/services/combo.ts:270` · `lib/services/pricing.ts:306` | **A supplement is booked at its host component's VAT rate, not its own.** `docs/politique-ventilation-tva.md` § 6 says *« il relève de **son propre taux** — 10 % pour un supplément alimentaire »*. `combo.ts:270` puts `shares[i] + c.supplements` on a line carrying `c.vatRate`; on the ordinary path `pricing.ts:306` folds `addonsTotal` into `lineTotal` at the product's rate. Attach one add-on to a drink category and a 10 % food supplement on a takeaway canette books at **5,5 %** — under-declared, and invisible. | A rate (or inherit flag) on `CategoryAddOn` plus one line in the allocation — **a migration**, and a migration is far cheaper on a database that has never traded. Alternative: a catalogue rule that drink categories carry no add-ons, which is free and unenforced. **Take the migration**: it is the only form that survives someone editing the catalogue in France. | 1 | CONFIRMED · **VERIFIED HERE** — measured today: `CategoryAddOn` exists on exactly two categories, `Pizzas` (14) and `Sandwichs` (7), both 10 % in all three modes, so it is **not reachable today** and is one catalogue edit away |
| **L-95** | **High** | `lib/services/fiscal.ts:594-605` | **`assertDaySequence` does not count a refund as trading**, so a day whose only event was a refund can be skipped — and once a later day is sealed, `:585-590` refuses it **permanently**. The daily-close chain then carries a hole for a day on which cash left the drawer. The function's own docstring (`:576-578`) states the criterion it fails: *"'Traded' is deliberately orders **or** cash movements … a day whose only event was a payout from the drawer still has something the close would have recorded."* A refund is a payout from the drawer, and `periodOrdersWhere` selects an order for a period *because* it was refunded there. Reachable without contrivance: pay out a refund against an older order, sell nothing, run the Z, go home; next day, sell and seal. | Genuinely small: one more `findFirst` inside the existing `Promise.all`, one entry in the `earliest` array, and the missing test beside `daily-close.test.ts:232` — which pins the cash-movement half and not this one. | 1 | CONFIRMED · **VERIFIED HERE** (the `Promise.all` queries `db.order` and `db.cashMovement` and no third table) |

---

## Group B — fix before the app is called complete

*Thirty-nine rows. Really broken, and a user, the operator or an inspector would hit it.
Grouped by subject; severity runs high to low within each.*

### The paper and the fiscal documents

| id | sev | file:line | what is wrong | cost | saw it | mark |
|---|---|---|---|---|---|---|
| **L-96** | **High** | `lib/services/printer-transport.ts:233`, `:338` | **A print helper that never runs is recorded as printed.** `defaultSpoolerScriptPath()` is `path.join(process.cwd(), ".zscripts", "print-raw.ps1")` — the sixth `process.cwd()` anchor, the one `paths.ts` exists to remove — and `powershell.exe -File <missing>` **exits 0**, so `realRun` resolves `{code: 0}`, the `result.code !== 0` check at `:338` passes, and `orders/[id]/print` writes `printStatus: "PRINTED", printedAt: now`. Nothing is on the paper and the till says nothing. | Small, two halves, **both now**: resolve the helper from a real app root rather than cwd, and treat a missing script or non-empty stderr as a failure. Fixing the cwd anchor now is the form that survives packaging — under Tauri the cwd is not the install directory. | 4 | CONFIRMED · **VERIFIED HERE** — reproduced the transport's exact spawn (`-NoProfile -NonInteractive -ExecutionPolicy Bypass -File <missing> …`): **exit code 0**, 310 bytes on stderr, nothing on the contract the code checks |
| **L-97** | Medium | `components/pos/receipt-dialog.tsx:32,60` · `app/globals.css:216-233` | **The paper the customer gets is not the archived document, and it omits the FACTICE stamp.** `window.print()` prints `#receipt-print`, re-rendered from the order DTO: no `*** FACTICE — SIMULATION *** / TICKET NON VALABLE`, no `Caisse N°`, no `Détail TVA` per rate, no software identity line — all four of which `renderReceipt` puts on `Receipt.content`. With `factice = true` (production's value today) the browser path hands the customer a ticket that does not say it is invalid, and `autoPrint` fires it 350 ms after the dialog opens. It is the **only** path that can reach paper while the ESC/POS transport is unconfigured. | Medium. Render the stored `Receipt.content` in a `<pre>` for printing — one component, cheaper, satisfies « never re-rendered » exactly, and **cannot drift again**. Prefer it over adding four blocks to both HTML views. | 4 | CONFIRMED (both documents captured side by side for order #8) |
| **L-98** | Low | `features/fiscal/fiscal-view.tsx:542` | **The Z report and the daily close have no print path at all.** `renderDayCloseTicket` is called only inside a `<pre>` on the fiscal screen; `printReceiptText` has exactly two callers, both order tickets. « The slip the operator files with the books » can only be read on screen. **New facet of L-88**, which assumes a paper slip that does not exist — the two must be settled together. | Unresolved: whether this is a defect or a decision is written down nowhere. Settle it, then L-88 becomes actionable or moot. | 4 | SUSPECTED |
| **L-99** | Medium | `lib/services/fiscal.ts:518-519` · `aggregate.ts:29-32` | **« A period close equals the sum of its Z reports » is false for a shift that straddles the cut-off**, and the claim is load-bearing prose in three places with **no test asserting it**. A Z's scope is `shiftId`; a month's is `Order.createdAt` inside `monthBounds(…, cutoffHour)`. Nothing stops one shift holding orders from two trading months. **The money is right** — 1000 + 2000 = 3000, counted once, VAT telescopes — but reconciliation fails in both directions and August gets a close with no Z at all. That is the first check an inspector performs, with no document explaining it. | Two routes, operator's call. **Cheap:** correct the prose and add the reconciliation test *with* its straddling-shift caveat, plus a § 8 line. **Expensive and a behaviour change:** refuse a checkout into a shift whose trading day has moved on — DD-23 territory. Recommend the cheap one. | 1 | CONFIRMED (computed with the real `aggregateOrders`: Z = 3000, `MonthlyClose 2026-08` = 1000, `2026-09` = 2000) |

### The till, in the operator's hands

| id | sev | file:line | what is wrong | cost | saw it | mark |
|---|---|---|---|---|---|---|
| **L-100** | **High** | `components/pos/payment-dialog.tsx:398` | **« Offert / repas personnel » crashes the POS.** `METHODS` (`:25-28`) holds only CASH/CARD/VOUCHER; `OFFERT_METHOD` is defined separately at `:35` and never added. The payment-lines list does `METHODS.find(x => x.method === l.method)!` then reads `m.icon`, so the moment `addOffert()` puts an OFFERT line in state the render throws. **DD-14's tender is unusable from the till**, which is the only way to settle a 100 %-discounted order. The API accepts the same sale fine. | Trivial — one entry in the lookup, or a fallback. The finding is that nothing would have caught it: no test renders this component (`offert-tender.test.ts` asserts the enum, the route and the schema). Add a render test for the OFFERT line. | 4 | CONFIRMED (reproduced: `TypeError: Cannot read properties of undefined (reading 'icon')`, whole POS into the error boundary) · **VERIFIED HERE** |
| **L-101** | **High** | `app/api/settings/route.ts:25` vs `components/shared/nav-config.ts:60` | **The restaurant's operator cannot save any setting.** `nav-config.ts:60` grants MANAGER the Réglages view, with a comment saying it was opened *because* « Réglages is where the printer IP and name … are configured ». `PUT /api/settings:25` refuses every non-SUPER_ADMIN with 403. The screen renders in full, « Enregistrer » is enabled, pressing it fails with « Réservé au super administrateur ». **This blocks R6.4** (the failed-print message literally tells them to choose the Windows printer in the settings) **and R6.3** (FACTICE off), for the only person who will be at the till. The one account that can is `admin` — the developer's, in Tunisia (V-10). | Small, but a **decision**: open the write to MANAGER (matching the nav comment and DD-07), or split so the printer/FACTICE fields are MANAGER-writable and the identity fields are not. **Do not fix by hiding the screen** — that leaves R6.3/R6.4 unreachable. | 4, 2 | CONFIRMED — pass 4 reproduced live as `manager` (403 at the API, 200 as `admin`); pass 2 found it by reading and rated it Low. **Severity taken from pass 4** · **VERIFIED HERE** |
| **L-102** | Medium | `app/api/auth/login/route.ts:133-136` vs `auth/unlock/route.ts:68-73, 87-89` | **Two unauthenticated login paths with different lockout arithmetic.** `unlock` clears an expired lock (`failedAttempts: 0, lockedUntil: null`) before verifying; `login` never does — so once an account has hit 5 failures, `newFailed` is 6, 7, 8… and **every subsequent wrong PIN re-locks for a further 15 minutes, indefinitely**. An operator who fat-fingers five times cannot recover through the login screen at all, while the lock screen would have cleared it. There are two accounts and a restaurant in service. Separately, `unlock` yields 5 attempts per 15 min against `login`'s 1, so the weaker door is the unauthenticated one. | Small: give `login` the same expired-lock reset. Whether a permanent re-lock was intended is the operator's call. | 2 | CONFIRMED · **VERIFIED HERE** (`: user.lockedUntil` at login `:136` against `: null` at unlock `:89`, plus the reset unlock has and login lacks) |
| **L-103** | Medium | `features/auth/login-screen.tsx:86-98` · `api/auth/profiles/route.ts:20-31` | **The till will not open and says nothing.** The login screen's only data source is `GET /api/auth/profiles`, rate-limited 30/min on key `profiles:${ip}` where `clientIp()` returns the constant `"local"` — **one global bucket for the whole machine**. Its refusal is swallowed by a bare `catch {}` whose comment reads "The empty state remains visible if the profile request fails": no message, no retry, and the effect has `[]` deps so it runs once per mount. A 429 shows an empty profile picker with no explanation, and a reload re-enters the same exhausted bucket. Fetched in a `Promise.all` with `GET /api/seed`, so either failure takes both. | Small: surface the 429 and retry after `Retry-After`. | 2 | CONFIRMED · **VERIFIED HERE** (`http-rate-limit.ts:36` returns `"local"` unless `trustProxyHeaders()`; DD-06 means there is no proxy) |

### Backup and recovery

| id | sev | file:line | what is wrong | cost | saw it | mark |
|---|---|---|---|---|---|---|
| **L-104** | **High** | `lib/services/backup.ts:466-478` | **A failed backup strands an unencrypted copy of the whole database in the backup directory, permanently and invisibly.** `VACUUM INTO` writes `hibapos-backup-<stamp>.db` in plaintext at `:466`; it is unlinked at `:478`, *after* `encryptFile` at `:477`. `createBackup` has **no `try`/`finally` anywhere in its body** — any throw between those lines, a full disk being the obvious one, leaves the file behind. It gets no `Backup` row, so `pruneBackups` never removes it and `listBackups` never shows it. `BACKUP_LOCATION` on this install is inside OneDrive, **so the plaintext leaves the machine.** | Small: `try { … } finally { await fs.unlink(plainDbPath).catch(()=>{}) }`. The file's own L-62 comment at `:826-838` already argues for exactly this shape. | 5 | CONFIRMED (patched `writeFile` to throw `ENOSPC`; real `createBackup` left a **741 376-byte** readable database with the `User.pinHash` column in it) · **VERIFIED HERE** (no `try`/`finally` anywhere in 441-530) |
| **L-105** | Medium | `lib/services/backup.ts:784-788` | **The same plaintext leak on the restore path.** The pre-restore safety snapshot is `VACUUM INTO` → `sha256OfFile` → `encryptFile` → `unlink`, all **outside** the `try` that begins at `:791`. A failure at `:787` strands `pre-restore-<stamp>.db`. L-62's cleanup covers the *staged* files and not this one, because it is created before the block it guards. | Same fix, **same session as L-104**. | 5 | SUSPECTED — structurally identical to L-104, but forcing a failure inside a real `restoreBackup` is irreversible against whatever database it points at |
| **L-106** | Medium-High | `lib/services/secret-store.ts:64-82` | **A deleted `secrets.json` silently regenerates `BACKUP_ENCRYPTION_KEY`, orphaning every existing backup.** A **corrupt** store is refused loudly with the right reasoning ("overwriting it would discard a backup key and make every existing backup unreadable"); a **deleted** one returns `{secrets:{}, unacknowledged:[]}` and `resolveSecret` then makes a brand-new key with no error and no warning. Deleting the file is at least as destructive as corrupting it, and it is the outcome the corrupt path exists to prevent. | Small-medium. A marker distinguishing "never installed" from "store went missing" — `readStore` already parses a `createdAt` field, so half the mechanism exists. Needs a first-run decision, so ~half a day with tests. | 2 | CONFIRMED (executed: key `a97945f9…` before delete, `39abcbd0…` after, source `generated`, no error) · **VERIFIED HERE** |
| **L-107** | Medium | `lib/services/backup.ts:1016-1049` | **The retention prune journals its `SUPPRESSION_SAUVEGARDE` after deleting every file**, while `deleteBackup:1085-1094` journals first and carries the reason in prose — *"a trace written afterwards would be lost if the process died mid-delete"*. Prune is the **automatic** path, run at every Z close, and therefore the frequent one; `deleteBackup` is the rare manual one. The rule is stated in the rare path and broken in the common one. | Small: move the `appendFiscalEvent` above the loop, journalling the doomed list. | 5 | CONFIRMED · **VERIFIED HERE** (unlinks at `:1021`/`:1033` inside the loop from `:1016`; the event at `:1049`) |
| **L-108** | Medium | `lib/services/backup.ts:191-199` · `lib/paths.ts:82-86` | **A backup silently contains no images when the uploads directory is not where `HIBAPOS_DATA_DIR` puts it.** `mediaSources` includes a directory only `if (existsSync(dir))`; with none present `ensureMediaArchive` returns `null`, which by the R4.1 invariant means « nothing to archive » — the same answer an install with genuinely no images gets. **New facet of L-79**, which closed this conflation at the *loader*; it is still open at the *path*. | Small: distinguish « the configured media directory does not exist » from « it exists and is empty », and report the first as `{ unavailable }`. **This fires the day the data directory moves**, so it is cheaper before. | 4 | CONFIRMED (observed in the pass-4 run: `media: null` while **48 MB** of catalogue images sat in `public/uploads`) · **VERIFIED HERE** |
| **L-109** | Medium | `lib/services/catalogue-transfer.ts:177, 213` | **The catalogue export stamps the migration it was taken under, and the import never compares it.** An **older** export into a **newer** install succeeds and leaves the new columns at their defaults — a catalogue exported before `showOnPos` existed imports with every product `showOnPos = true`, putting R3.3's three deliberately-hidden menu components back on the till grid. The newer-into-older direction fails loudly, which is the right way round. **This export/import is the mechanism that carries this restaurant's real work to France** (§ 1: "a FRESH install in France, retaining this catalogue"). | Small: compare the stamp the export already records and refuse a mismatch. The check is right regardless of how the app is packaged. | 3 | SUSPECTED — no export file older than a migration exists to test against. The column list itself is pinned by `catalogue-transfer.test.ts:182`, so the mechanism is sound |

### The startup migration gate

| id | sev | file:line | what is wrong | cost | saw it | mark |
|---|---|---|---|---|---|---|
| **L-110** | **High** | `lib/services/startup-migration.ts:86` | **A migration that failed or was interrupted is counted as applied.** `appliedMigrations()` filters on `rolled_back_at IS NULL` and never on `finished_at IS NOT NULL`. Prisma writes the `_prisma_migrations` row *before* running the SQL and stamps `finished_at` only on success, so a power cut, a killed process, or a `deploy` that errors leaves a row this query reads as applied. **Next boot:** `pendingMigrations()` is empty → `UP_TO_DATE` → no backup, no deploy, and `instrumentation.ts` has no log branch for `UP_TO_DATE`, so nothing is recorded anywhere and the app serves against a half-applied schema. **Same run:** `stillPending` uses the same query, so it is empty even when the deploy failed — and `integrity_check`/`foreign_key_check` cannot see a missing column — so the gate returns **`APPLIED`** and logs « Applied N migration(s) behind verified backup ». **This is the exact failure the gate was built to prevent, reported as success.** | One clause (`AND finished_at IS NOT NULL`), but **not a small decision**: a failed migration then becomes *pending* and the gate would retry it behind a fresh backup. Whether retrying is right, or whether the gate should refuse and name the row, is the operator's call. Add a test that builds the NULL state either way — all three insert sites in `startup-migration.test.ts` use `finished_at = current_timestamp`, so no test has ever built it. | 3 | CONFIRMED (gate's verbatim query run against a synthesised migration table, both shapes: 15 of 15 applied, pending empty, `UP_TO_DATE`) · **VERIFIED HERE** |
| **L-111** | Medium | `lib/services/startup-migration.ts:243, 265` | **`deploy()` reporting failure is never a condition.** `const applied = await deps.deploy()` is used in exactly one other place — the ternary at `:265` deciding whether to append process output to a failure message. `applied.ok === false` never causes a failure verdict on its own; the gate's whole defence is the three database checks at `:249-253`. `grep -c "ok: false"` on the test file returns **0** — no test ever drives the deploy dependency to failure. | Small and needing no decision: `if (!applied.ok)` → `FAILED_AFTER_MIGRATE`, plus one test. A deploy that says it failed should never be reported as applied. | 3 | CONFIRMED · **VERIFIED HERE, with one correction** — see *Where the passes disagreed*: pass 3's worked example (a missing `bunx` produces `APPLIED`) is **wrong**. No migration row is written, so `stillPending` stays non-empty and `FAILED_AFTER_MIGRATE` fires correctly. The real path to a wrong `APPLIED` is **L-110's** blind query, not this one |
| **L-112** | Medium | `instrumentation.ts:38, 65, 92` · `startup-migration.ts:218-272` | **Every *thrown* startup failure reports only to `console.error`, and the gate's most dangerous branch has its weakest reporting.** The secret-bootstrap catch, the migration-gate outer catch and the pragma catch each write to stdout and nothing else — no `TechnicalLog` row, unlike every *inner* failure path (`:59-60` writes both). And `runStartupMigrationGate` has no `catch` around its verification queries, only `try { … } finally { releaseLock() }`, so a throw from `pendingMigrations()` or either PRAGMA escapes, `lastResult` is never assigned, and `lastMigrationGateResult()` keeps its previous value. This is precisely where « the backup succeeds but the disk fills during the migrate » lands. | Small: `logTechnical("ERROR", …)` beside each `console.error`, and wrap steps 2–3 with a `record()`ed failure status. The wrinkle: `logTechnical` writes to the database, which is the thing that may be failing — so **keep `console.error` and add the row**, rather than swapping one for the other. | 5, 3 | CONFIRMED both (pass 5 measured it live: the malformed-`SESSION_SECRET` probe produced a stdout line and **zero** `TechnicalLog` rows) · **VERIFIED HERE** |
| **L-113** | Medium | `lib/services/startup-migration.ts:143-166, 210-215` | **A data directory that cannot be written is reported as "another process is already applying migrations".** `takeLock()` catches the `mkdirSync`/`writeFileSync` failure, the stale-lock reclaim's `statSync` throws too, and it returns `false` — which the gate turns into `SKIPPED_LOCKED` and « Un autre processus applique déjà les migrations. » The migration then never runs, on every start, with a diagnosis that sends the operator looking for a second process. | Small: separate the "could not create" branch from the "already exists" branch. | 5 | CONFIRMED (`takeLock()`'s body reproduced verbatim against a data dir that is a file: outer catch `ENOTDIR`, inner `ENOENT`, returns `false`) |
| **L-114** | Medium | `lib/services/startup-migration.ts:69-71` | **When the migrations directory cannot be found, the gate reports `UP_TO_DATE`.** `migrationsOnDisk()` resolves `prisma/migrations` against **`process.cwd()`** — not `dataDir()`, which everything else in the file uses — and returns `[]` if absent. Nothing distinguishes « nothing is pending » from « I could not see the migrations », and `UP_TO_DATE` is the one status `instrumentation.ts` does not log. The Next server trace `.next/next-server.js.nft.json` (604 entries) contains **zero** prisma-related entries, so any trace-driven packaging lands in exactly this state. | Small: make "directory absent" a distinct, logged status and resolve the path from a known app root rather than the cwd. **Anchoring to an app root now is the form that survives packaging** — a bundle separates cwd, `dataDir()` and `DATABASE_URL`, which coincide only by accident today. | 3, 5 | CONFIRMED both · **VERIFIED HERE** |

### Secrets and authorization

| id | sev | file:line | what is wrong | cost | saw it | mark |
|---|---|---|---|---|---|---|
| **L-115** | **High** | `lib/fiscal-key.ts:48` · `lib/api-handler.ts:133,164` · `secret-store.ts:185-188` | **A malformed `FISCAL_CHAIN_KEY` makes every fiscal write answer 500 with an EMPTY body** — the exact regression the typed error exists to prevent. `fiscalChainKey()` throws a **plain `Error`** for a short key, three lines above the `ChainKeyMisconfiguredError` path built for the mixed-chain case; `isChainKeyMisconfigured()` is an `instanceof` test, so the wrapper cannot map it. The file's own docblock at `:73-82` describes this symptom and calls it "the worst version of this". Compounding it: **`chainKeyArmed()` is length-blind**, so `GET /api/setup/secrets` reports `chainArmed: true` while the till refuses every sale. **R6.2 is the row that arms this key.** | Small: throw `ChainKeyMisconfiguredError` (or a sibling) at `:48`, and length-check in `chainKeyArmed()`. | 5 | CONFIRMED (started with a short key: login 200, then `POST /api/fiscal/drawer` → **HTTP 500, zero-byte body**) · **VERIFIED HERE** |
| **L-116** | **High** | `instrumentation.ts:37-39` · `lib/auth.ts:37-44` | **A malformed `SESSION_SECRET` produces a till that looks fine and cannot take a login.** The server prints `✓ Ready`, the login screen renders 200, `GET /api/auth/profiles` answers 200 with a populated picker — and `POST /api/auth/login` answers **`500 Internal Server Error`**. The bootstrap failure is swallowed into `console.error` alone, so after the process dies there is no record at all. Not reachable while `.env` holds a good value; reachable exactly where PREP-3 makes `.env` optional. | Medium, two halves: the `TechnicalLog` row (L-112) and a French answer for a resolvable-secret failure instead of a bare 500. | 5 | CONFIRMED (measured: `/` 200, `/api/auth/profiles` 200, `POST /api/auth/login` **500**, body `Internal Server Error`) |
| **L-117** | **High** | `lib/approvals.ts:7-10` | **`approvals.ts` still reads `process.env.SESSION_SECRET` at module load and throws at import if it is absent.** PREP-3 moved secret resolution onto the secret store but converted **only `auth.ts`**, and `resolveSecret()` does not write `process.env` — only `bootstrapSecrets()` does, from the async `register()` hook that `auth.ts:27-30` says a route module can beat. On an install with no `.env`, `auth.ts` resolves happily from `secrets.json` while `approvals.ts` throws in the same process. **Blast radius is the checkout**: `orders/route.ts:9` → `services/step-up.ts:43` → `approvals.ts`, so `POST /api/orders`, `/orders/[id]/refund`, `/auth/step-up` and `/cash-movements` are all in that module graph. | Small: one import change, mirroring `auth.ts`. The *verification* is the cost — it wants a fresh install with no `.env`. Make the change now anyway; it is correct on its own terms and removes the only remaining reader on the old contract. | 2 | CONFIRMED (executed: `resolveSecret` → `generated`, `process.env` still absent, `import('@/lib/approvals')` → `THREW`) · **VERIFIED HERE** |
| **L-118** | Medium | `lib/auth.ts:118` (definition) · `app/api/seed/route.ts:65-66` | **A rule the running application never calls.** `isPublishedDefaultPin` has exactly **one** call site in the whole repository — `scripts/seed-users.ts:155`, an operator CLI. `POST /api/users` and `PUT /api/users/[id]` call `hashPin` on a bare `/^\d{6}$/`; `POST /api/seed` — unauthenticated on a fresh install, wired to a button at `login-screen.tsx:238` — **installs `123456` and `111111` as live credentials** by default. `docs/INVARIANTS.md` states the guard as a property of the system; it is a property of one script. `auth.ts:103-108` records why this matters: on 2026-09-04 the operator's first attempt set the super-administrator to one of these two values, "caught by reading the repository, not by the application". **This is the path the France fresh install will take.** | Small: two `if (isPublishedDefaultPin(...)) return 400` calls plus the seed path, ~1-2 h with tests. Or a recorded decision that the operator's rotation is the control. | 2, 6 | CONFIRMED both · **VERIFIED HERE** (one non-test call site; `SEED_ADMIN_PIN ?? "123456"`, `SEED_MANAGER_PIN ?? "111111"`, denylist consulted nowhere) |
| **L-119** | Medium | `app/api/setup/chain-key/route.ts:35-44` | **`POST /api/setup/chain-key` returns the live `FISCAL_CHAIN_KEY` on every call**, not only the first: `armChainKey()` returns `{value: existing, alreadyArmed: true}` unconditionally. It writes an audit row **only** on the first arm (`:43` is inside the `!alreadyArmed` path), so every later read-back is untraced. This defeats the bound `setup/secrets/route.ts:28-29` documents in the same feature — "cannot be used to read a key back". It can, through the sibling route. The real bound is "journal still empty", which is precisely the R6.2 → first-sale window. | Small: return the value only while it is still unacknowledged (matching the sibling), or audit the read-back. A deliberate trade-off (`:38-40`), just a wider one than documented — decide which. | 2 | CONFIRMED (executed: same key on calls #1, #2 and after `acknowledgeSecrets`) · **VERIFIED HERE** |
| **L-120** | **High** | `lib/api-authorization.test.ts:350-355` | **The inline-guard detector matches a widened guard as well as a narrow one**, so a route can be opened from SUPER_ADMIN-only to every role and the whole suite stays green. `guardsInline` is `/user\.role\s*!==\s*"SUPER_ADMIN"/` against the handler's source text — which matches `!== "SUPER_ADMIN" && !== "MANAGER"` exactly as well. `settings:PUT` is guarded this way and only this way, and `settingsSchema` carries **`discountApprovalThreshold`** (max 100 → every discount escapes the DD-19 step-up) and **`factice`** (the R6.3 stamp). The widened form is already idiomatic here, so it would not look wrong in review. | Small (~1 h with the re-pin): distinguish the two forms and classify them separately (`INLINE_SA` vs `INLINE_ANY`), then re-pin `expect(counts).toEqual({...})` at `:407`. **Do this early** — every later session inherits a map that means what it says. | 2 | CONFIRMED · **VERIFIED HERE** (regex read; **7 route files** already use the widened form) |

### Guards that are not guarding

| id | sev | file:line | what is wrong | cost | saw it | mark |
|---|---|---|---|---|---|---|
| **L-121** | **High** | `lib/services/log-retention.test.ts:122-142` | **"NEVER prunes the fiscal journal, whatever the retention says" cannot fail against the bug it names.** The test writes a `FiscalEvent` with `appendFiscalEvent` (timestamp = now), sets retention to 1 day, calls `pruneLogs()` **with the real clock**, and asserts the count is unchanged. A dated prune — `fiscalEvent.deleteMany({where:{timestamp:{lt: cutoff(days)}}})` added beside the two that are there — deletes nothing, because a row written this second is never older than a one-day cutoff. Only an *unconditional* `deleteMany` would fail it. This guards the single hardest invariant in the product. | **One line.** `pruneLogs(new Date(Date.now() + 400 * DAY))` pushes the cutoff past the fresh event with no tampering and no backdating — `pruneLogs(now: Date = new Date())` was built for it. | 6 | CONFIRMED · **VERIFIED HERE** (signature takes `now`; the test passes none; every current delete is `createdAt < cutoff` and none touches `FiscalEvent`) |
| **L-122** | **High** | `lib/db-pragmas.test.ts:112-135` | **The test that guards WAL off a cloud-synced folder executes zero assertions.** Every `expect` sits inside `if (result.skipped)`, and `result.skipped` is always `undefined`: `applyStartupPragmas()` reads `PRAGMA journal_mode` from the cached global `db` — which the same file already put into WAL — and returns at the `current === "wal"` early exit (`db-pragmas.ts:104-106`) **before** reaching the cloud-sync branch. Repointing `process.env.DATABASE_URL` cannot move `db`, because `db.ts` caches on `globalThis` unconditionally (an invariant). So the guard keeping the OneDrive-hosted production database out of WAL — the reason § 4 records `journal_mode = delete` — has no executed cover. | ~25 lines: give the guard its own `PrismaClient` against a temp `OneDrive-fake-*/…db`, or split `applyStartupPragmas` so the sync check is callable with an injected current mode. | 6 | CONFIRMED (test's exact sequence run as a probe: `result.skipped = undefined`, if-body runs `false`) · **VERIFIED HERE** |
| **L-123** | **High** | `app/api/orders/route.ts:390` | **The server-authoritative payment check has no test.** `paidTotal !== totalAfterDiscount → 400 « Paiement incorrect »` is the one thing stopping a basket booking a 10,00 € sale against a 1,00 € tender. Removing it fails nothing. Every route-driving helper computes the payment from the price, so none can even express the mismatch. | ~15 lines in `orders-route.test.ts`: underpay, overpay, and a control, asserting 400 and `order.count() === 0`. | 6 | CONFIRMED · **VERIFIED HERE** (« Paiement incorrect » appears in the route and in **comments** only — no test, no e2e spec) |
| **L-124** | Medium | `lib/services/restore-swap.test.ts:202` · `lib/pos-resilience.test.ts:104` | **Two source-text assertions break on any fresh checkout of this repository.** `core.autocrlf=true` is set and there is **no `.gitattributes`**; the index is LF, so a clone writes CRLF. `restore-swap.test.ts` then finds `src.indexOf("} finally {\n    // L-62")` = −1 and **fails** on a clean tree; `pos-resilience.test.ts`'s negative assertion **passes vacuously** and can no longer detect M-21 returning. `plan-freshness.test.ts:35` already learned this for `.md` and normalises; nothing else does. | **One line:** `* text=auto eol=lf` in `.gitattributes`. Land it before anything is cloned onto a build machine. | 6 | CONFIRMED (checkout reproduced with `git checkout-index`; 211 CR bytes in the subject, both needles evaluated) · **VERIFIED HERE** (`core.autocrlf=true`, no `.gitattributes`, `i/lf w/lf attr/`) |
| **L-125** | Medium | `lib/services/fiscal-surface.test.ts:65, :85` | **Two tests headed "What POST /api/fiscal/drawer does" and "What POST /api/orders/[id]/reprint does" re-implement the routes inline**, calling `appendFiscalEvent` and `receipt.update` by hand. `orders/[id]/reprint/route.ts` is invoked by **no test in either suite**. The invariant « a `REIMPRESSION` or `OUVERTURE_TIROIR` is journalled **before** the paper is attempted, and whether or not it succeeds » — which both routes carry a comment about — is asserted nowhere. If the reprint route stopped incrementing `reprintCount`, stopped journalling, or moved the journal write after `printReceiptText`, both tests stay green. | ~40 lines to drive both through `route-harness.ts` (which now exists), with a failing transport so the "journalled anyway" half is real. | 6 | CONFIRMED |
| **L-126** | Medium | `scripts/init-fiscal-counter.ts:81-92` | **The counter-floor guard on the *create* path is untested, and a test claims otherwise.** `fiscal-counter-floor.test.ts:126` is captioned « This is `init-fiscal-counter.ts` on the database it is written for », but that script never calls `counterRegressions` — it implements its own inline `populated > 0` refusal. Delete that block and the whole suite stays green, and the script re-creates `FiscalCounter` at 0/0/0/0 on a database still holding sealed orders: **L-38's exact outcome**, which is the next genuine sale printing a receipt number that already exists. `bun test src` globs `src/` only, so nothing under `scripts/` is reachable at all. | ~30 lines: extract the refusal into `src/lib/services/fiscal-counter-floor.ts` beside the rule it belongs with — the same move L-38 made for the other half — and call it from the script. **This is the pattern for testing any operator script**, whatever the app is packaged as. | 6 | SUSPECTED — the revert could not be run without editing source |

### The money path's API surface

*The till is the only client today and does none of these. All three become reachable the
moment a second client exists or the server port is exposed.*

| id | sev | file:line | what is wrong | cost | saw it | mark |
|---|---|---|---|---|---|---|
| **L-127** | Low | `lib/services/pricing.ts:284-285` · `app/api/orders/route.ts:48, 67` | **An add-on quantity is charged but not snapshotted, and is unbounded.** `:284` charges `addon.price * aIntent.quantity`; `:285` snapshots `{id, name, price}` and drops the quantity — so `OrderItem.addOnsJson`, which is what the ticket and the archive read, cannot reproduce the line whenever the quantity exceeds 1. And the schema bounds it at `min(1)` with **no max**, where the item quantity one field over carries `.max(MAX_ITEM_QUANTITY)` for exactly the reason M-16 gives. | `.max(...)` in two places is one line each. Carrying the quantity into `chosenAddons` and into `receipt.ts`'s `+ nom (prix)` line touches receipt rendering, so that half wants its own batch and a `receipt.test.ts` snapshot. | 1 | CONFIRMED (measured: 3 × Viande Hachee printed as one `+ Viande Hachee (1,50 €)`, 4,50 € unexplained on a document that is never re-rendered; quantity 100 000 booked a **150 011,90 €** line into the journal) · **VERIFIED HERE** |
| **L-128** | Low | `app/api/orders/route.ts:116` · `lib/services/checkout.ts:267` | **`tendered` below `amount` is accepted and prints a negative change onto the sealed ticket.** The schema relates the two in no way; `checkout.ts:267` computes `change: p.tendered ? p.tendered - p.amount : null`. Separately, `tendered: 0` is falsy, so `change` becomes `null` rather than `0`. | One `.refine()` on the payment object, or `Math.max(0, …)`. Trivial — but it lands on an immutable document, so **pick the refusal over the clamp**. | 1 | CONFIRMED (amount 1190, tendered 500 → `Payment.change = -690`, sealed receipt « Reçu 5,00 € — Rendu -6,90 € ») · **VERIFIED HERE** |
| **L-129** | Medium | `lib/services/aggregate.ts:497, :572` · `receipt.ts:31` | **A null `OrderItem.vatRate` is silently booked at 10 %.** The column is nullable and **what null means is written down nowhere**. Three readers, all in the money path, do `item.vatRate ?? 10` — into the printed ticket's VAT table, the order's VAT breakdown, and therefore the Z report and every close. 10 % is the food rate; a drink à emporter is 5,5 %. The default is not conservative in either direction. It contradicts two rules this schema states about its own nullable columns: `referencePrice` (« Null is the statement. Never backfill it ») and `perpetualSalesTotal` (« a fiscal document must not carry a figure that was never measured »). Not reachable from the current checkout; reachable through a restore of an older database, a hand edit, or any future writer. | Small, but a decision. Document what null means and keep the default, or refuse a null line loudly. Given the two invariants, refusing is more consistent — but `receipt.ts` renders a ticket and « printing must never lose a sale », so the ticket and the aggregation may want different answers. One line in `docs/INVARIANTS.md` either way. **No test pins the `?? 10`.** | 3 | CONFIRMED · **VERIFIED HERE** (all three sites) |

### Interface and French

| id | sev | file:line | what is wrong | cost | saw it | mark |
|---|---|---|---|---|---|---|
| **L-130** | Medium | `lib/services/fiscal.ts:505-511` | **The daily close's refusal is ungrammatical French.** One template serves three periods with labels of different gender — `"la journée"` (`:638`), `"le mois"` (`:821`), `"l'exercice"` (`:928`) — and hard-codes masculine agreement. The operator reads: « Clôture prématurée : **la journée** 2026-09-12 n'est pas **terminé**. **Il** ne pourra être **clôturé** qu'à partir du 2026-09-13 à 05:00. » Should be *terminée · Elle · clôturée*. **This is the most likely fiscal refusal a tired person meets at 23:00.** | Trivial — pass the agreement with the label, or split the three messages. Check whether `close-timing.test.ts` pins the string first. | 4 | CONFIRMED (reproduced live) · **VERIFIED HERE** (all three labels read) |
| **L-131** | Medium | `components/ui/dialog.tsx:70` · `components/ui/input.tsx:11` · `components/pos/discount-dialog.tsx:81` | **Three touch targets under 44 px that `touch-and-labels.test.ts` cannot see**, because it reads `<Button>` call sites and the `Button` primitive's variants only. (a) Every dialog's close « × » is a `DialogPrimitive.Close` with no size class — **16 × 16 px measured**, on every dialog in the product. (b) The shared `Input` primitive is `h-9` = **36 px**, which is what the **step-up PIN field** renders at — the control that gates every refund and every above-threshold discount. (c) The discount amount field is a raw `<input class="h-10">` = 40 px **with no accessible name**, which the L-10 half of the same test also cannot see. 44 px is an invariant. | Small per site. The durable fix is to widen the guard the way L-64 widened it for `Button`: assert the `Input` primitive and the dialog close, and read raw elements as well as `<Button>`. A wider source scan found **24 undersized declarations** across `src`. | 4 | CONFIRMED (measured with `getBoundingClientRect()` on the running build) · **VERIFIED HERE** (`input.tsx:11` is `h-9`) |
| **L-132** | Medium | `features/shifts/shifts-view.tsx:624` | **The cash-count field is pre-filled with the expected amount.** `useState((expectedCash / 100).toFixed(2))` seeds « Espèces comptées (€) » with what the software already believes is in the drawer, so the default action on the Z dialog seals `Écart nul` and records a count that may never have been made. `z-close.ts`'s own header says this screen exists for « catching missing cash » (C-02). | Trivial: start the field empty and disable the seal until something is entered. It is a behaviour change, so it is the operator's call. | 4 | CONFIRMED · **VERIFIED HERE** |
| **L-133** | Medium | `components/pos/step-up-pin-dialog.tsx:96-107` | **The step-up PIN may be untypable on a touch-only till.** The login screen provides a full on-screen keypad; the step-up dialog — **every refund and every discount above 20 %** — is a bare `<Input type="password">` relying on the OS touch keyboard appearing. The asymmetry is certain; the consequence depends on hardware nobody here can see. | Reproducing the keypad is the cheap safe answer either way, and does not depend on the answer. | 4 | SUSPECTED — settling it needs the restaurant's all-in-one |
| **L-134** | Medium | `lib/services/pricing.ts:149-157` | **A question, not a fix — and it is in group B because it is unresolved, not because it is urgent.** `Product.price` appears to be inert for every sized product: the DINE_IN branch returns `absPickup - dineInBase`, so `unitPrice = price + (absPickup − price) = absPickup` — `price` cancels exactly and a sized product sells **sur place at its à-emporter absolute**. `Taille` is `required` on `Pizzas`, so no pizza ever sells at `Product.price`, and an operator raising the dine-in price of pizzas would see no change at the till and no error. Invisible today: all 26 pizzas have `price == pickupPrice == 890`. `CategoryOptionChoice` has `pickupPrice` and `deliveryPrice` and **no** `price`, which reads as a schema omission; nothing in `docs/INVARIANTS.md`, the plan or § 9 records it either way. | **Cannot be settled by reading.** Ask the operator: should a sized product be able to carry a dine-in price? The answer decides whether this is a schema gap or intended behaviour. | 1 | SUSPECTED |

---

## Group C — fix with the batch that owns the file

*Thirty-six rows. Real, cheap, and not worth its own session. This project already works this
way: an undeployed app can let a small defect wait for the change that opens that file anyway.
The batch is named so it is not forgotten.*

| id | sev | file:line | what is wrong | which batch | saw it | mark |
|---|---|---|---|---|---|---|
| **L-135** | Cosmetic | `api/catalog/products/route.ts:65-67` · `[id]/route.ts:63-65` | A euros idiom on cent values: `parseFloat((absPickup - basePrice).toFixed(2))`, six sites. A no-op on integers, but the invariant is that euros exist only at `formatEuro`/`parseEuroInput`. Were a cent value ever non-integer it would round to hundredths of a cent. | the catalogue-routes batch | 1 | CONFIRMED · **VERIFIED HERE** (6 sites) |
| **L-136** | Low | `lib/services/combo.ts:270` | A negative supplement could put a negative unit price on an allocated menu line, past M-15's guard — which is on `unitPrice` *before* add-ons (`pricing.ts:302-304`) and not on the allocated line. Not reachable on this catalogue: zero negative modifiers anywhere, zero products with `price <= 0`. | **rides with L-94's `combo.ts` session** — same line | 1 | SUSPECTED |
| **L-137** | Medium | `lib/services/startup-migration.ts:146` | The migration lock is `dataDir()/db/migrate.lock` while the database is wherever `DATABASE_URL` points. Two installs sharing one database file take **two different locks** and both migrate it. Secondary and true today: with `HIBAPOS_DATA_DIR` unset the lock sits inside OneDrive, where `db-pragmas.ts` already refuses WAL deliberately and the lock has no equivalent guard. | the startup-migration batch (with **L-110**, **L-111**, **L-114**). Derive the lock from the resolved database path — the form that survives packaging | 3 | CONFIRMED |
| **L-138** | Low | `lib/services/startup-migration.ts:243-252` | When `deploy` never ran (CLI missing, spawn failed), the verdict is `FAILED_AFTER_MIGRATE` and the operator is told « base incohérente … **Restaurez la sauvegarde** ». Nothing was changed; restoring is unnecessary work on a fiscal database and reads as though damage occurred. The branch is correct in outcome and wrong in diagnosis. | the startup-migration batch | 5 | SUSPECTED |
| **L-139** | Low | `instrumentation.ts:41` | The comment reads "Then migrations … **Deliberately after the pragmas**". The gate runs at `:51`; `applyStartupPragmas()` at `:69`. Migrations run **before** the pragmas. Harmless in effect, but it states an ordering that was evidently designed and is not there. | the startup-migration batch | 5 | CONFIRMED · **VERIFIED HERE** |
| **L-140** | Low | `lib/services/backup.ts:551-613` | `assertCompatibleSchema` measures the backup against the **live** database, not against the code, so a degraded live schema silently lowers the bar — and it composes with **L-110**: half-apply a migration and every later restore is checked against the half-applied schema. Three further limits: names only (no types, no NOT NULL, **no unique indexes** — so a file carrying `Order.number`/`FiscalEvent.sequence`/`ZReport.number` without their unique index restores cleanly and the gapless-numbering backstop is gone); extra **tables** WARN while extra **columns** are silent; `_prisma_migrations` is excluded by name. | the `backup.ts` batch (with **L-104**, **L-105**). Do the cheap parts: warn on extra columns, and add the unique indexes | 3 | CONFIRMED |
| **L-141** | Low | `backup.ts:450, :717` · `startup-migration.ts:121` · `scripts/decrypt-backup.ts:48` | `BACKUP_SECRET` is a live `||` fallback for the backup key in four places and is documented **nowhere** — not `.env.example`, not `docs/INVARIANTS.md`, not the plan. `bootstrapSecrets()` and `rotate-secrets.ts` know only `BACKUP_ENCRYPTION_KEY`, so an install holding its key under the old name would get a fresh one generated and preferred by the `||`, orphaning every backup — silently, because both names "work". | the `backup.ts` batch. Document it, or drop the fallback | 5 | CONFIRMED · **VERIFIED HERE** (4 sites, 0 in `.env.example`) |
| **L-142** | Low | `lib/services/backup.ts:108-110` | The scrypt comment says `r=8 p=1` "keeps memory ~1 GiB peak". `128 · N · r` is **128 MiB** — 8× high, and it is the number anyone sizing an installer would reach for. `maxmem` is 2 GiB here and 512 MiB in `decrypt-backup.ts:77`; both work. | the `backup.ts` batch | 5 | SUSPECTED (arithmetic, RSS not instrumented) |
| **L-143** | Low | `api/orders/[id]/print/route.ts:45-55` vs `[id]/reprint/route.ts:71-76` | `Receipt.printStatus` is written inconsistently and read by nothing. The first-print route writes `FAILED` only when `reason === "FAILED"`, so `NOT_CONFIGURED` and `DISABLED` leave it `PENDING`; the reprint route writes `FAILED` for *any* non-ok outcome. The route's comment claims unprinted tickets « stay visible as FAILED so a shift's unprinted tickets can be found later » — but **no screen, report or API response returns the column**. | the printer batch (with **L-96**). Make both routes agree and surface the column — or delete it and say so | 4 | CONFIRMED · **VERIFIED HERE** (0 readers in `.tsx`; three writers) |
| **L-144** | Low | `lib/services/printer.ts:48-51` | Stale comment on a live decision: « `printerConnection` defaults to "network" everywhere it is absent » — reversed on 2026-09-11, when `DEFAULT_SETTINGS.printerConnection` became `"usb"`. A reader of `resolvePrinter` is told the opposite of what production does. | the printer batch | 4 | CONFIRMED |
| **L-145** | Low | `prisma/schema.prisma:661, 1012, 1056, 1088` | Four id columns carry no foreign key and, **alone in this schema**, do not say so. Every other FK-less id reads *« plain id, NO FK »* with a justification. For `OrderItem.comboProductId` the omission has a behavioural edge: `productId` is `SET NULL`, so a deleted product makes the identity genuinely *gone* and the name fallback fires as the invariant describes — but `comboProductId` **dangles**, so `aggregate.ts:216` keys under an id that resolves to nothing rather than falling back to the label. `scripts/delete-product.ts:109` already guards the only deletion path that exists. | the schema-comments batch. Trivial for the comments; whether `comboProductId` should become a real `SET NULL` FK is a separate question, and it matters because the catalogue transfer moves product ids between installs | 3 | CONFIRMED |
| **L-146** | Cosmetic | `scripts/pre-golive-reset.ts:88` | A comment in the irreversible script states the wrong FK reason: *« Customer is the parent of Order.customerId and deleting it first is an FK violation, not a cascade. »* `Order.customerId` is `onDelete: SetNull` — it would succeed and null the links. The **ordering is correct** and the outcome unaffected, but the stated reason is wrong at exactly the line a future editor would read before reordering it. | rides with whatever next touches that file | 3 | CONFIRMED |
| **L-147** | Low | `features/auth/login-screen.tsx:251, :361` | The profile picker renders `ROLE_STYLE[profile.role].label`, never the account's name. DD-07 makes MANAGER the only operational role, so a second member of staff produces **two identical « Gérant » cards** with no way to tell them apart. `GET /api/auth/profiles` already returns `name`. | the login-screen batch (with **L-103**) | 4 | CONFIRMED (seen with two active MANAGERs) |
| **L-148** | Low | `components/shared/topbar.tsx:53-64` | An unlabelled stopwatch sits beside the caisse badge and measures nothing: `useSessionTimer` counts from component mount, resets on every reload, and runs identically whether the caisse is open or closed. Rendered next to « Caisse #2 » / « Caisse fermée », it reads as « how long this till has been open ». | the topbar batch. Derive it from `shift.openedAt` and hide it when no shift is open, or label it | 4 | CONFIRMED (« Caisse fermée · 00:00:08 » with no shift open) |
| **L-149** | Low | `features/shifts/shifts-view.tsx:228` | « **1 caisses** » — a raw count with a hard-plural noun, where the rest of the product uses the `N vente(s)` / `N mouvement(s)` convention. | the `shifts-view.tsx` batch (with **L-132**) | 4 | CONFIRMED · **VERIFIED HERE** |
| **L-150** | Low | the zod locale | The localised validation messages carry TypeScript type names and comparison operators into text a restaurant operator reads: « Trop grand : **string** doit avoir **<=500** caractères », « Entrée invalide : **int** attendu ». **L-22's English half no longer reproduces** — `instrumentation.ts` installs `@/lib/zod-locale` statically and it works; this is the narrower remainder. | the zod-locale batch | 4 | CONFIRMED (four deliberately malformed checkouts) |
| **L-151** | Low | `lib/api-handler.ts:124-126, 152-154` · `api/setup/secrets/route.ts` | `withAuth`/`withAuthParams` return 403 with **no audit row** — a MANAGER probing SUPER_ADMIN routes leaves no trace, while `LOGIN_FAILED`, `USER_SWITCH_FAILED` and `MANAGER_APPROVAL_FAILED` are all journalled. And `GET /api/setup/secrets` — the one route that returns a secret — writes **no audit row on the read**; only the harmless acknowledgement is recorded. The disclosure is unlogged and the confirmation is logged. | the auth-wrapper batch. Watch the audit log's retention knob and volume | 2 | CONFIRMED · **VERIFIED HERE** (`audit` appears **0** times in `api-handler.ts`) |
| **L-152** | Cosmetic | `lib/approvals.ts:41-46` | The comment says a token "can be replayed once within its **60 s** TTL after a restart". `STEP_UP_TTL_SEC` is **120** (`step-up.ts:57`), so the documented window is half the real one. | rides with **L-117**, same file | 2 | CONFIRMED |
| **L-153** | Medium | `lib/services/reports.test.ts:97` | **The suite's one live order dependency.** `expect(events[0].factice).toBe(false)` on the `CLOTURE_Z` event; `generateZReport` reads `getSettings().factice`, whose default is `true`, and the file's `wipe()` never touches `Setting`. It passes only because an earlier file left a `Setting{factice:false}` row behind. Run alone: **3 pass / 1 fail**. | the test-suite batch. One line: `await saveSettings({ factice: false })` in the `beforeEach` | 6 | CONFIRMED (all 114 files run individually: 113 clean, this one fails) |
| **L-154** | Low | 16 test files | **A standing wipe-order hazard that has not yet bitten.** FK enforcement is on and a `Restrict` violation really throws. Of the 57 files calling `deleteMany`, **fourteen delete `Shift` without first deleting `ZReport`** (`ZReport.shiftId` is `Restrict`), four of which create `ZReport` rows with no `afterAll`; two more delete `User` with nothing else cleared. Under today's data none trips. | the test-suite batch. The cheap durable fix is **one shared wipe helper in FK order** rather than 57 hand-maintained lists that already disagree with each other | 6 | CONFIRMED (measured three ways: natural, reversed, and 114 solo runs) |
| **L-155** | Low-Med | `services/cash-movement.ts:43` · `lib/tx-options.ts:40` · `services/escpos.ts:40` | **Three exported symbols that only tests use.** `CASH_MOVEMENT_CATEGORIES` is pinned as « the order the screen offers them » — the screen builds its list from a **local** `DIRECTION` map instead, and the service keeps a third copy in `REQUIRED_SIGN`, so DD-12's « fixed category list » exists in three hand-copied places and the one the test pins is used by none of them. `TX_CATALOG` is a transaction budget no transaction consumes. `columnsForPaperMm` is called by nothing. None is on the *Deliberately retained* list. | the test-suite batch. Point the dialog at the exported list (~5 lines), which makes the existing test load-bearing; delete the other two with their assertions, or give them a caller | 6 | CONFIRMED · **VERIFIED HERE** (each symbol's only non-test occurrence is its own definition) |
| **L-156** | Low | `features/shifts/z-close.test.ts:30-33` | A "regression pin" that asserts the bug's own output: `expect(formatEuro(openingFloat / 100)).toBe("2,00 €")` restates `formatEuro`'s contract and cannot fail for any change to the product. C-02's defect was a `/ 100` at a *call site* (`shifts-view.tsx`), and no test reads any `.tsx` for a doubled cents division. | the test-suite batch. ~15 lines: scan `.tsx` for `formatEuro(`/`<Money` with a `/ 100` in the same expression, the way `order-status.test.ts` scans for `CANCELLED` | 6 | CONFIRMED (the only instance of the shape in the suite) |
| **L-157** | Low | `lib/readme-counts.test.ts:157-168` | The "every registered expansion still exists where it says it does" check tests the **file**, not the **entry**: it asks whether `e.where` contains *any* `it.each(` or `for (…) { it(`. Two `EXPANSIONS` entries name `deployment.test.ts`; delete one of its two loops and the check still passes on the strength of the other, while the recomputed README total is wrong by 7 — the exact failure the test says it exists to prevent. | the test-suite batch | 6 | CONFIRMED |
| **L-158** | Low | `lib/services/aggregate.test.ts:20-55` | **All four `apportion` tests are satisfied by a degenerate implementation** that gives the entire target to the first weight and zero to the rest. Nothing in that describe pins **proportionality**, which is what `apportion` is for; it is pinned only transitively, one module away, by `combo-allocation.test.ts`'s nine menu cases. The discount path is pinned only against `apportion` itself, which is a tautology. And `:47` compares `apportion(w,500)` with itself. `apportion` is an invariant — *the only splitter*. | the test-suite batch. **~3 lines**: one exact-value assertion, e.g. `expect(apportion([2000,1000], 2400)).toEqual([1600,800])` | 6 | SUSPECTED (hand-evaluated, revert not run) |
| **L-159** | Cosmetic | `lib/services/receipt.test.ts:378` | `LIVE_ADDRESS`, commented « the live `restaurantAddress`, read from the production `Setting` row … Measured read-only 2026-09-07 », is 56 chars with a duplicated postcode. Production today holds 50 chars. The assertion still exercises wrapping; the comment is no longer true, in a file whose value is that its constants are the real ones. | the test-suite batch | 6 | CONFIRMED · **VERIFIED HERE** (read from `Setting` today: `"23 Grande Rue, 45210 Ferrières-en-Gâtinais, France"`) |
| **L-160** | Low | `features/shifts/cash-movement-dialog.tsx:20` | A `"use client"` dialog imports two pure values from a service whose module graph is `@/lib/db` → `@prisma/client`. Result: a **501.7 KB** client chunk — the largest, 19 % of 2.68 MB of client JS — containing `db.ts` compiled for the browser. It does not crash and **no secret leaks**. `db.ts`'s top-level `globalThis` assignment is an INVARIANT and is what makes the module un-tree-shakeable, **so the fix is on the service side, never in `db.ts`.** | the build/ops batch. Move the two constants into a module with no `db` import; `import "server-only"` in `db.ts` would turn any recurrence into a build error | 5 | CONFIRMED (reverse import graph over 104 modules, confirmed in the built artifact) · **VERIFIED HERE** (the import) |
| **L-161** | Low | `package.json:60, 62` | `@types/tar` (superseded by `tar@7`'s own types, loaded as an automatic type-reference into a program using v7) and `bun-types` (deliberately unreferenced — `src/types/bun-test.d.ts` exists *because* referencing it redefines `fetch` and friends) are declared and used by nothing. **Neither is on the Deliberately retained list; `tar` is, and is a different package.** | the build/ops batch. Removal needs the usual `bun install` + lockfile + `bun run build` gate | 5 | CONFIRMED (full import inventory + `tsc --traceResolution`) |
| **L-162** | Low | `next.config.ts` | `X-Powered-By: Next.js` is served on the HTML route; `poweredByHeader` is not disabled. The five deliberate headers are all present and correct. | the build/ops batch | 5 | CONFIRMED · **VERIFIED HERE** |
| **L-163** | Low | `.github/workflows/ci.yml` | Both CI jobs are `runs-on: ubuntu-latest` for a **Windows** product — the Prisma engine is `query_engine-windows.dll.node`, the printer transport is the Windows RAW spooler, `.zscripts/` is PowerShell, and every platform failure this project has had (`EPERM` on rename, OneDrive locks, `MoveFileEx`) is Windows-only. Separately the fast `checks` job runs typecheck/lint/tests but **not `bun run build`** — the build runs only inside the slower `e2e` job, so a build break surfaces misattributed. | the build/ops batch. **Adding `bun run build` to `checks` is trivial and should happen now**; a `windows-latest` leg costs runner minutes and belongs with whatever CI the packaging gets | 5 | CONFIRMED · **VERIFIED HERE** |
| **L-164** | Low | `src/lib/db.ts:35-40` | The comment states that `?_fk=1` and `?_busy_timeout=5000` in `DATABASE_URL` set the SQLite pragmas. **Prisma ignores both** and sets the same values itself, so the comment states a causal mechanism that does not hold — and anyone raising `_busy_timeout` for a slow disk would change nothing and believe they had. The query string also ships in `.env.example:12`. | the build/ops batch. Correct the comment; removing the query string changes nothing (measured) but is a separate decision | 5 | CONFIRMED · **VERIFIED HERE** — probed today against a throwaway database: no parameters → `foreign_keys=1, busy_timeout=5000`; `?_fk=1&_busy_timeout=5000` → identical; **`?_busy_timeout=99999` → still 5000**. See *Where the passes disagreed* |
| **L-165** | Low | `scripts/README.md` | Three of the fifteen scripts are missing from the index entirely, including the most important one: `apply-migration.ts` — **the command `CLAUDE.md` names as the only way a migration is applied here** — plus `build-box-menus.ts` and `trim-catalogue-names.ts`. | the docs batch | 5 | CONFIRMED · **VERIFIED HERE** (15 scripts; those three appear **0** times in the README) |
| **L-166** | Low | `CLAUDE.md:36` · `scripts/apply-migration.ts:231-233` | The hand-over command says `--expect <name>`, which reads as the migration name; `--expect` takes a **path to a rehearsal fingerprint JSON**. Given a non-path, `:232` prints "Expected fingerprint not found at … — skipped." and `ok` is untouched, so **the run still ends `✅ APPLIED AND VERIFIED`** with the rehearsal comparison silently lost. The primary protection survives. | the docs batch — **but `CLAUDE.md` is the operator's file: bring the exact text and wait.** Optionally make an unreadable `--expect` set `ok = false` | 5 | CONFIRMED · **VERIFIED HERE** (both halves) |
| **L-167** | Low | `docs/INVARIANTS.md` (*Deliberately retained*) | Three live API routes are pinned by a test but absent from the retained list: `table-withdrawal.test.ts:203-205` asserts `api/tables/route.ts`, `api/tables/[id]/route.ts` and `api/tables/seed/route.ts` stay; the invariants name only `tables-view.tsx` and the two unreachable branches. **A future cleanup reading the invariants — which is what they are for — would delete three files a test pins.** | the docs batch | 5 | CONFIRMED · **VERIFIED HERE** |
| **L-168** | Low | `scripts/README.md` (Notes) | The Notes say « For **first boot** use `bun run db:seed` », while plan § 5 lists `db:seed` as **❌ Never, from this directory**. Both are right in their own frame, but a reader following the README on *this* machine runs a command the safety register forbids. | the docs batch. One clarifying clause | 5 | CONFIRMED |
| **L-169** | Cosmetic | `scripts/set-drink-vat-rates.ts` · `scripts/fix-duplicate-product-options.ts` | The only two of fifteen without a `#!/usr/bin/env bun` shebang and the only two not marked executable. Both are invoked as `bun scripts/…`, so nothing is broken. | the docs/scripts batch | 5 | CONFIRMED |
| **L-170** | Low | `docs/politique-ventilation-tva.md` § 5, § 8 | The allocation policy's worked examples cover **3 of the 9 live menus**, and 3 of the 9 rest on a reference price for a product the till cannot sell: `Box 15 (sans boisson)`, `Box 35 (sans boisson)` and `Tenders box (sans boisson)` are **exactly the three `showOnPos = 0` products** — they carry the entire food-side weight of their menus and are deliberately not sold à la carte (R3.3). That is precisely the case § 8.4 flags as losing the § 2 justification, *« prix pratiqués séparément lorsque les produits sont aussi vendus à la carte »*. § 8's comparison table also carries one row that does not reproduce (Duo Cheese measures 1,13 € / +6 c against a stated 1,12 € / +5 c). | **the VAT-METHOD envelope (§ 8), not a code batch.** Extend § 5 to the six untabulated menus from the software's own output and answer § 8.4 for the three box components — both belong in the accountant's letter | 1 | CONFIRMED (all nine § 5 rows reproduce exactly; the three `showOnPos=0` products identified by name) · **VERIFIED HERE** (3 `showOnPos=0` products today) |

---

## Group D — record and leave

*Nine rows. Real, and the cost of fixing exceeds the risk today. The risk is stated out loud,
and so is what would move it into a fix group.*

| id | file:line | what it is | the risk, stated | what would move it | saw it |
|---|---|---|---|---|---|
| **L-171** | `lib/services/refund.ts` | **A partial refund is apportioned across the lines by TTC weight, not against the item returned.** Measured: refunding 500 c of a 1640 c order moved the 5,5 % bucket from 300 to 209 — 91 c credited at 5,5 % although the stated reason was "Pizza renvoyée". There is no line-level refund and no column recording which item came back, only `Refund.reason`, free text. | **An inspector could ask which item was returned and the software cannot answer.** The arithmetic is not wrong — this follows directly from « `apportion` is the only splitter », and `addVatMoveToBreakdown` makes the periods telescope, which is worth more than line-level attribution. | A line-level refund is a schema change and a UI. If the accountant or an inspector asks for item-level attribution, it moves. | 1 |
| **L-172** | `aggregate.ts` · sealed `perpetualTotalsJson` | `GrandTotal.totalOrders` counts a give-away; the Z's `salesCount` does not. Measured 4 against 3. Both are defensible — the perpetual counts tickets issued, the Z counts sales that contributed — but **nothing documents the difference**, and they sit in the same sealed payload. | Two numbers in one sealed document that disagree, with no written reason. An inspector comparing them gets no answer from the software. | One line in `docs/INVARIANTS.md` saying which counts what and why. Cheap — it is in D only because nothing is broken. | 1 |
| **L-173** | `api/fiscal/drawer/route.ts:43` · `api/backups/[id]/restore` | DD-19's step-up covers `DISCOUNT`, `REFUND` and `CASH_OUT` — money leaving the drawer **on the record**. It does not cover physically opening the drawer: `POST /api/fiscal/drawer` is `["SUPER_ADMIN","MANAGER"]` and takes no token. **The recorded way to take cash out needs a PIN and the unrecorded way does not.** `POST /api/backups/[id]/restore`, which overwrites the live database, is likewise session-only. | `step-up.ts:13-15` names the threat itself ("the UNATTENDED TILL: today a passer-by can…"); the client-side auto-lock bounds that window at **30 minutes**, and is client-side only. The drawer open **is** journalled before the solenoid fires — the control is detective, not preventive. | **This is a policy decision for the operator, not a defect to fix unasked.** `ApprovalAction` already has the shape, so it is small mechanically. If the operator wants the drawer gated, it moves to B. | 2 |
| **L-174** | `lib/auth.ts:88-92, 140-164` | A stored PIN hash is `salt:hash` and **records no scrypt parameters**, so nothing can tell a legacy `N=2^14` hash from a strong `N=2^17` one. The legacy fallback can therefore never be retired; it is upgraded only on a *successful* login; and **every failed PIN costs two derivations** (~780 ms), on every auth route, forever, for a case that is probably already empty. | The live hashes are almost certainly strong — both PINs were reset 2026-09-04, after the hardening. The point is that **the system cannot demonstrate it**. | A parameter prefix on new hashes plus a migration window. Medium. It moves if a third account is ever created on an unknown-age install. | 2 |
| **L-175** | `prisma/schema.prisma` · `aggregate.ts:815` | Three indexes serve nothing — `CashMovement(category)`, `Table(status)`, `Table(active)` — and one range filter has none: `Refund.createdAt` is filtered by `periodOrdersWhere` on **every** sales / VAT / cashier / product report, not only by the annual archive its code comment justifies. **The two `Table` indexes are DD-09 residue — do not touch without reopening DD-09.** | Zero rows today; a fast-food refund table stays small for years. | **Recommendation: change nothing.** Recorded so the next person does not re-derive it. It moves if the refund table ever grows past a few thousand rows. | 3 |
| **L-176** | `services/log-retention.ts:66` · `shifts/[id]/close/route.ts:71` | `pruneLogs()` runs **only** at shift close. A till restarted daily but closed rarely accumulates `TechnicalLog` without bound — and that is **the only durable record of a refused startup migration or a degraded backup**. Production already carries 9 identical WAL-refusal WARNs, one per start. | A genuinely different startup warning would sit among the identical ones. In the intended operation — a restaurant closes a shift daily — this never bites. | A second trigger. It moves if the till is ever left running across closes, or if **L-112**'s new `TechnicalLog` rows make the table grow faster. | 5 |
| **L-177** | `prisma/schema.prisma` — `ZReport.topProductsJson`, `vatBreakdownJson` | Both are **nullable**, while the same two columns on `DailyClose`, `MonthlyClose` and `AnnualClose` are **NOT NULL**. Nothing documents the asymmetry, and readers paper over it with `?? "{}"` / `?? "[]"`. A Z report with a null breakdown would print an empty VAT table rather than refuse. | Not reachable today — `generateZReport` always writes both. Same shape as **L-129**: a nullable column in the fiscal path whose null has no stated meaning. | **A line in the schema saying what null means** is the cheap answer. Making them NOT NULL is a migration on a fiscal table for zero rows, which this project has correctly declined before. | 3 |
| **L-178** | `next.config.ts` · `.next/next-server.js.nft.json` | **New facet of L-05** (« whether to reinstate `output: "standalone"` is open »). Measured: the Next server trace has 604 entries and **zero** prisma-related ones — no `query_engine-windows.dll.node`, no `@prisma/client`, no `schema.prisma`, no `prisma/migrations/`. So reinstating `output: "standalone"` as-is yields **a tree that cannot open its own database**. | Nothing to fix today; the risk is that L-05 is treated as a free toggle when it is not. | It is a measurement, not a defect. It moves when packaging begins — and it is the reason L-05 cannot be closed by flipping a key. | 5 |
| **L-179** | `startup-migration.ts:116` | **New facet of L-51** (« `backup.ts` reads the whole uploads archive into memory »). Since PREP-4 this also happens **at startup**, via `createBackup(null)`, whenever a migration is pending. The archive is **49 129 786 bytes**, re-measured and unmoved. | A low-memory till with a pending migration allocates ~49 MB before it serves — and the startup backup is the thing standing between it and an unguarded migration. If it fails, **L-112** means there may be no record of why. | This raises L-51's priority rather than adding work of its own. It moves if the first packaged update runs on constrained hardware. | 5 |

---

# VIEW B — by area

*The same 94 findings, grouped by where the work lands. Ids only. This is the schedule: a
group is one session's work, not five. Where a group has a natural internal order, it is
stated.*

### `payment-dialog.tsx` — one session, and it is the first
**L-89 · L-90 · L-100** — L-100 rides along because it is the same file and it is what makes
DD-14's tender usable at all.
*Order: the submit latch and the OFFERT lookup are independent and both trivial; the
idempotency key is the migration and should be decided before either is called done.*

### `checkout.ts` · `pricing.ts` · `combo.ts` — the money path
**L-94 · L-127 · L-128 · L-136**
*Order: **L-94 is a migration** (`CategoryAddOn` has no rate) — settle its shape before the
three small guards, because the migration is far cheaper on a database that has never traded.*

### `fiscal.ts` — the sealed documents
**L-95 · L-99 · L-130**
*Order: L-95 is a guard whose absence becomes **permanent** the moment a day is skipped, so it
goes first. L-99 is prose plus a test. L-130 is one string — check `close-timing.test.ts`.*

### `report-range.ts` and the three report routes
**L-92**
*One finding, one session, and it carries a decision about what a free `Du`/`Au` range means.
`/api/reports/sales` already has a screen, so the drift is reachable today.*

### `catalog/categories/[id]/route.ts` — the catalogue editor
**L-91** — plus **L-135** and **L-145** if the products routes and the schema comments ride along.
*L-91 alone is the session; the other two are free while the files are open.*

### `settings` — the two default tables and the role gate
**L-93 · L-101**
*Order: **fix the tables first (L-93), then the gate (L-101)** — opening the write to MANAGER
before the defaults agree hands a till operator a route that can flip `factice` by omission.*

### `printer-transport.ts` · the print routes · `receipt-dialog.tsx`
**L-96 · L-97 · L-98 · L-143 · L-144**
*Order: L-96 first (it is the one that reports a lie to the database). L-98 is a question that
must be answered before L-88 can be actioned at all.*

### `backup.ts` — one file, five findings, one session
**L-104 · L-105 · L-107 · L-108 · L-140 · L-141 · L-142**
*Order: L-104 and L-105 are the same `try`/`finally` shape and should land together. L-140's
schema check composes with **L-110**, so do the migration gate first or accept the coupling.*

### `startup-migration.ts` · `instrumentation.ts` — the migration gate
**L-110 · L-111 · L-112 · L-113 · L-114 · L-137 · L-138 · L-139**
*Order: **L-110 is the load-bearing one** — it is the only finding that also breaks the *next
boot*, and fixing it makes L-111 belt-and-braces rather than the sole hole. L-112 (the
`TechnicalLog` rows) should land in the same session, because without it none of the others
leaves a trace. L-114 and L-137 are both "resolve from a real app root", so do them together.*

### `secret-store.ts` · `fiscal-key.ts` · `approvals.ts` — secrets
**L-106 · L-115 · L-116 · L-117 · L-119 · L-152**
*Order: L-115 before R6.2, because R6.2 is the row that arms the key. L-117 and L-152 are the
same file.*

### `auth.ts` · `login/route.ts` · `login-screen.tsx` — the front door
**L-102 · L-103 · L-118 · L-147**
*Order: L-118 (the PIN denylist) is the one that reaches the France install; L-102 and L-103
are both "the till will not open", and L-147 is free while the screen is open.*

### `api-handler.ts` · `api-authorization.test.ts` — the authorization map
**L-120 · L-151**
*L-120 early: every later session inherits a map that means what it says.*

### The test suite
**L-121 · L-122 · L-123 · L-124 · L-125 · L-126 · L-153 · L-154 · L-155 · L-156 · L-157 · L-158 · L-159**
*Order: **L-124 first** — one `.gitattributes` line, and it is the only one that breaks on a
machine that is not this one. Then L-121 and L-158, both one-to-three lines, both guarding an
invariant. L-154's shared wipe helper is the largest piece and subsumes L-153.*

### `schema.prisma` and the data model
**L-129 · L-145** — and **L-175 · L-177 are group D**: read them while the file is open, but
they are recorded, not scheduled.
*Order: settle what a null `OrderItem.vatRate` means (L-129) before anything reads it
differently. L-177 is the same question about `ZReport`'s two nullable JSON columns, and
answering one should answer the other.*

### `catalogue-transfer.ts`
**L-109**
*One finding, and it is the mechanism that carries this catalogue to France.*

### Build, dependencies, CI
**L-160 · L-161 · L-162 · L-163 · L-164 · L-178**

### Documentation and the operator scripts
**L-146 · L-165 · L-166 · L-167 · L-168 · L-169 · L-170**
*`CLAUDE.md` (L-166) and `docs/INVARIANTS.md` (L-167) are the operator's files — bring the
exact text and wait. L-170 belongs in the accountant's envelope, not a code batch.*

### UI odds and ends
**L-131 · L-132 · L-133 · L-148 · L-149 · L-150**
*L-131's durable form is widening `touch-and-labels.test.ts`, which makes it a test-suite item
as much as a UI one.*

### Open questions, not sessions
**L-134** (does a sized product carry a dine-in price?) · **L-171 · L-172 · L-173 · L-174 ·
L-176 · L-179** (recorded and left) · **L-180 · L-181 · L-182** (group E).

---

# Detail — where one sentence was not enough

*Only the rows that need it. Everything else is complete in its table row.*

### L-110 and L-111 together — what the gate actually does

The two are not independent, and the passes that found them disagreed about the worked
example. Settled here by reading `startup-migration.ts:196-272`:

- `applied.ok === false` really is never a condition. The only other use of `applied` is the
  ternary at `:265` deciding whether to append output to a message. **L-111 confirmed.**
- But a **missing `bunx`** does *not* produce `APPLIED`. No `_prisma_migrations` row is
  written, so `pendingMigrations()` still returns the migration, `stillPending.length > 0`,
  and `FAILED_AFTER_MIGRATE` fires correctly. Pass 5's reasoning was right on this point and
  pass 3's example was wrong.
- The **real** path to a wrong `APPLIED` is L-110's: `prisma migrate deploy` writes the row,
  then fails, leaving `finished_at` NULL. `appliedMigrations()` counts it, `stillPending` is
  empty, `integrity_check` returns `ok` and `foreign_key_check` returns empty — because a
  missing column is not corruption — and the gate answers **`APPLIED`** and logs « Applied N
  migration(s) behind verified backup ».

**Consequence for sequencing:** either fix alone closes the same-run case, because in the
partial-migration case Prisma also exits non-zero. Only **L-110** closes the *next-boot* case,
where `UP_TO_DATE` is returned with no backup, no deploy and — since `instrumentation.ts` has
no branch for that status — no record anywhere. Do L-110 first.

### L-96 — why the print finding is not a packaging problem

Two halves, and only one of them is about the working directory.

1. `defaultSpoolerScriptPath()` = `path.join(process.cwd(), ".zscripts", "print-raw.ps1")`.
   Today the cwd is the repository and the script is found, so this half is dormant.
2. `powershell.exe -File <missing>` **exits 0**. Reproduced in this session with the
   transport's exact argument list: exit code 0, 310 bytes of explanation on stderr, and
   `printer-transport.ts:338` checks only `result.code !== 0`. **This half is live now** — any
   condition that makes the script unreadable is reported as a successful print, and
   `orders/[id]/print` writes `printStatus: "PRINTED", printedAt: now`.

So the exit-code half is a defect today regardless of packaging, and the cwd half is the one
that fires when the process no longer starts in the repository. Fix both in one session; the
app-root resolver is the form that does not have to be undone later.

With the script present and a bogus queue, the behaviour is **correct** and worth preserving:
exit 2 → `UNREACHABLE`, « Imprimante « … » introuvable dans Windows… », 613 ms. Whatever
replaces the PowerShell helper must keep `print-raw.ps1`'s exit-code contract.

### L-93 — how a settings save turns FACTICE off

`PUT /api/settings` parses the body with `settingsSchema` and hands the **parsed** object to
`saveSettings`, which does `{ ...current, ...input }`. Zod's `.default(false)` on `factice`
does not leave the key absent — it **materialises** it — so an absent key arrives as a present
`false` and overwrites the stored `true`. The same mechanism turns `printerConnection` from
`"usb"` back to `"network"`, undoing the 2026-09-11 decision R6.4 rests on.

It is latent only because `settings-view.tsx:121` posts the whole DTO. Any second writer — a
first-run wizard, a PATCH-style client, a script, a native settings pane — performs R6.3 by
omission. Both defaults are pinned, separately, by two green tests; **nothing asserts they
agree**, which is why the product can hold two answers with a clean suite.

### L-91 — why the cascade reaches the VAT split

`ComboSlotOptionRule` is what fixes a menu component's option *without asking the cashier*.
All seven live rows hang off one group, `Pizzas → Taille`, and each carries a non-null pinned
choice. Two things follow from losing them:

1. The cashier is asked the size again *inside* the menu and can ring a Junior in an XXL.
2. `componentReferencePrice` loses the pinned choice. The three `Taille` choices carry
   absolute prices (Junior 8,90 / Senior 11,90 / Mega 15,90 à emporter), so the weight
   `apportion` is handed really does move — **and that weight is what divides the forfait
   between 10 % and 5,5 %.**

The trigger is an ordinary admin save with no edits, because the client sends `optionGroups`
unconditionally. No test covers it: `catalog-payload.test.ts` pins the C-24 validate-before-
delete rule and the "absent means leave alone" rule, neither of which is this.

### L-101 — why hiding the screen is the wrong fix

The obvious repair is to narrow the nav entry so MANAGER never sees Réglages. **Do not.**
R6.3 (FACTICE off) and R6.4 (choose the Windows print queue) are both `PUT /api/settings`, and
the person who will be at the till in France is the MANAGER. Hiding the screen makes two
Phase 6 rows unreachable without the developer's account, which is in Tunisia (V-10). The two
genuinely sensitive cards on that screen are already gated correctly
(`settings-view.tsx:559,561` render `FirstRunKeysCard` and `CatalogueTransferCard` for
SUPER_ADMIN only) — so a field-level split is available and is the shape to prefer.

### L-120 — what the detector can and cannot see

`api-authorization.test.ts` is genuinely good: it walks every route, classifies all 83
handlers, pins the counts, and makes a *declarative* widening a test failure. That part should
be carried forward unchanged. The gap is one regex:

```
/user\.role\s*!==\s*"SUPER_ADMIN"/
```

matched against the handler's source text. It cannot distinguish

```
if (user.role !== "SUPER_ADMIN") return 403                          // refuses MANAGER
if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGER") return 403 // refuses nobody
```

Seven route files already use the second form, so it reads as idiomatic. `settings:PUT` is
classified `INLINE` on the strength of this regex and nothing else — and `settingsSchema`
carries `discountApprovalThreshold` (max 100, so every discount escapes the DD-19 step-up) and
`factice`. Repairing the detector is about an hour including the re-pin at `:407`.

---

# Already known — the nine open § 7 findings, rediscovered

*One line each. Not re-reported, and no new number. The correction first:*

> **The list of nine the passes were given was wrong.** It named **L-82**, which
> `REMEDIATION_DONE.md:1179` records as **closed** ("**Finding:** L-82 closed · **Opened:**
> L-88" — R7.2, 2026-09-11). § 7's actual ninth row is **L-88**. Verified this session against
> both files. **`docs/audit/README.md`'s numbering section was corrected on 2026-09-12** and
> now lists L-88, with a dated note naming the superseded value; the six pass files keep the
> list they were given, because they are evidence.

- **L-88** — the day-close slip still prints no give-away line. Pass 4 rendered the sealed
  2026-09-11 slip through the app's own `renderDayCloseTicket` and confirmed the omission.
  **New facet: L-98** — there is no print path for that slip at all, so L-88 cannot be
  actioned until L-98 is settled.
- **L-84** — `showOnPos` is still a display rule, not a guard; `orders/route.ts` checks only
  `active`/`available`. Reconfirmed independently by passes 1, 2 and 4. Nothing new.
- **L-81** — `5 nuggets test` is still in the catalogue, `active=0 available=0`. Confirmed by
  five passes and re-measured here. `scripts/delete-product.ts --id cmtvwzr050004n368crvp0mw3
  --apply` is prepared and rehearsed; awaiting the operator.
- **L-75** — 32-bit Windows. Carried; nothing new.
- **L-05** — `next.config.ts` still has no `output` key. **New facet: L-178** — the Next server
  trace carries no Prisma engine, schema or migrations, so reinstating `output: "standalone"`
  as-is yields a tree that cannot open its own database. L-05 is not a free toggle.
- **L-11** — both tolerances seen again: `paid < total - 1` at `payment-dialog.tsx:152` and
  `paid < total - 0.01` at `:451`, plus the uncleaned `setTimeout` at `:93`. **L-89 is a
  different defect in the same file and is not L-11.** Verified here.
- **L-47** — **did not reproduce.** Pass 4 ran the whole walkthrough in the in-app browser pane
  and the login screen cleared normally: one new data point against it. **Pass 2 supplies the
  first candidate mechanism**, which the plan says L-47 has never had: a rejected `Secure`
  cookie looks exactly like this (login returns 200, the client drops the cookie, the next
  request carries none, the login screen returns), and the configuration that would cause it is
  live — `APP_URL` is absent from `.env`, so every cookie is `Secure` over plain HTTP
  (**L-182**). **This is a hypothesis, not a measurement.** Testing it costs one session:
  set `APP_URL="http://127.0.0.1:3000"` on a scratch copy and reproduce in that pane.
- **L-51** — re-measured: the media archive is **49 129 786 bytes**, unmoved. **New facet:
  L-179** — since PREP-4 it is also read into memory *at startup*, whenever a migration is
  pending.
- **L-52** — external; no format has been published. Nothing to add.

### Regressions of closed findings — none

The passes cite nine closed findings as context: **L-10, L-22, L-38, L-40, L-41, L-62, L-64,
L-67, L-79**. Every one was checked against `REMEDIATION_DONE.md` and `REMEDIATION_PLAN.md`
this session, and **no pass reports any of them as having come back.** Four are worth a
sentence because they read at a glance as though they might:

- **L-22** is *more* closed than its row describes. Pass 4 drove four deliberately malformed
  checkouts and all four answered in French — the locale loads and works. What survives is
  narrower and became **L-150**, not a regression.
- **L-79** closed the media conflation at the *loader*. **L-108** is the same conflation one
  level up, at the *path*. Different site, not a regression of the fix.
- **L-40**'s fix was the per-run database directory, which pass 6 confirms "did the work it was
  built for". It never claimed to make files independent *within* a run, and **L-153** is that
  gap, measured for the first time.
- **L-38**'s rule holds in `fix-fiscal-counter.ts`. **L-126** is the *other* half — the create
  path in `init-fiscal-counter.ts`, which implements its own inline refusal and is untested.

---

# Looked at and set aside

**No finding from the six passes was rejected outright.** Every numbered row, and every item a
pass described without numbering, holds at the `file:line` it names. That is worth stating
plainly rather than manufacturing a rejection list.

Three claims were **corrected inside rows that were kept**, which is a different thing and is
recorded so nobody re-derives them:

1. **Pass 3's worked example for L-111** — that a missing `bunx` produces `APPLIED` — does not
   hold; see *Detail*. The finding it belongs to is kept, with the example replaced.
2. **Pass 3's conclusion that `db.ts:36` is accurate** is overturned; it became **L-164**. See
   *Where the passes disagreed*.
3. **Pass 2's severity for its L-99** (Low) is overturned by pass 4's live reproduction; the
   merged row **L-101** is High.

One thing was checked *because* it looked like a candidate for rejection and turned out to hold:
**pass 1's L-127** (add-on quantity unbounded) reads as contradicted by `validation.ts:119`'s
`.max(10)` — but that line is `comboSlotSchema.quantity`, a catalogue field. The checkout's
add-on quantity is `orders/route.ts:48` and `:67`, `z.number().int().min(1).default(1)`, with
no max, while the item quantity one field up carries `.max(MAX_ITEM_QUANTITY)`. Pass 1 is right.

---

# Where the passes disagreed, and what settled it

Only two genuine contradictions in 1 714 lines across six independent sessions, which is itself
a result.

### 1. Does `DATABASE_URL`'s query string set the SQLite pragmas?

**Pass 3** probed `?_fk=1`, `?_fk=0` and no parameter, got `PRAGMA foreign_keys = 1` in all
three cases, and concluded the `db.ts:36` comment calling `?_fk=1` *« defense-in-depth »* is
accurate — filing it under "one thing I expected to find and did not". **Pass 5** probed the
same plus `?_busy_timeout=99999`, got `busy_timeout = 5000` regardless, and filed the comment
as wrong (its L-96).

**Settled: pass 5 is right.** Probed again this session against a throwaway database — no
parameters → `foreign_keys=1, busy_timeout=5000`; `?_fk=1&_busy_timeout=5000` → identical;
**`?_busy_timeout=99999` → still 5000.** Prisma ignores both parameters and sets those values
itself. The comment does not claim "FK is on"; it claims *"SQLite pragmas are **applied via**
the DATABASE_URL connection-string params"*, which is a causal statement that does not hold.
Pass 3 measured the right thing and read its own data as confirmation when it was the
disproof: FK being on *with no parameter at all* is precisely the evidence the parameter is not
what does it. Kept as **L-164**, group C. The practical bite is the second parameter — anyone
raising `_busy_timeout` for a slow disk changes nothing and believes they have.

### 2. What happens when `prisma migrate deploy` cannot run?

**Pass 3** (L-103): *"`bunx` not being present in a Tauri bundle, a non-zero exit, a crashed
CLI — all produce `status: "APPLIED"`."* **Pass 5** (L-107): *"The gate's own failure handling
is sound either way: a failed deploy leaves `stillPending > 0` → `FAILED_AFTER_MIGRATE` behind
a verified backup, with the schema untouched."*

**Settled by reading `startup-migration.ts:243-269`: both are partly right, and pass 5 is right
about the specific case.** Detail is above under L-110/L-111. In short: `applied.ok` is never a
condition (pass 3's mechanism is confirmed), but a missing CLI writes no migration row, so
`stillPending` stays non-empty and the correct refusal fires (pass 5's outcome is confirmed).
The real path to a wrong `APPLIED` is pass 3's **other** finding, L-110's `finished_at`-blind
query. Both findings are kept; the ordering between them changed as a result.

### 3. Severity, not fact — `PUT /api/settings`

Pass 2 read the nav/API mismatch and filed it **Low**. Pass 4 reproduced it live as `manager`,
got the 403 from the real route, and filed it **High** because it blocks R6.3 and R6.4 for the
only account that will be at the till. Merged as **L-101** at **High**, per "take the highest
severity offered, never the average" — and here the higher one is also the better-evidenced one.

### Not a disagreement: L-47

Pass 4 reports it did not reproduce; pass 2 offers a candidate mechanism. These are compatible
— a configuration-dependent failure that did not fire on pass 4's build. Both recorded above.

---

# Group E — undecidable until packaging

*Three. The bar is a finding whose **correct fix** cannot be chosen until someone decides the
install layout — not a finding that merely touches a file packaging will move. Everything
fixable now is in A, B or C.*

| id | the question | what it waits on | saw it |
|---|---|---|---|
| **L-180** | `startup-migration.ts:133` runs `spawnSync("bunx", ["prisma","migrate","deploy"], {shell:true})` at startup. If a bundle lacks the Prisma CLI, `bunx` **fetches it** — a network call from a till at boot, or a hang where there is no network. With `prisma` in `dependencies` and `node_modules` present it resolves locally and the concern does not arise. | **Whether and how the Prisma CLI ships.** The right fix is different for each answer: prove the CLI exists before taking the backup, vendor it, or replace the spawn. Cannot be chosen first. *(L-138's wrong message is fixable now regardless, and is in C.)* | 5 |
| **L-181** | `writeFileSync(lock, {flag:"wx"})` is `O_CREAT\|O_EXCL`, whose atomicity is **not guaranteed over SMB/CIFS**, and OneDrive's placeholder handling can both re-materialise a deleted file and hold one open. The lock sits inside OneDrive today. | **Where the data directory lives.** On a local non-synced path the mechanism is sound and nothing needs doing; on a share or a synced root it needs a different one. *(Anchoring the lock to the database rather than `dataDir()` is L-137 and is fixable now.)* | 3 |
| **L-182** | `auth.ts:243` sets `secure: !appUrl.startsWith("http://")`, and `APP_URL` is **absent** from `.env`, so every session cookie is `Secure` over plain HTTP. It works today — verified: a login round-tripped over plain HTTP on loopback, which browsers treat as a trustworthy origin. | **What origin the webview presents.** A `tauri://` or `http://tauri.localhost` origin is not what this decision was made against, and the value to set depends on the answer. **One thing here is testable now and should not wait:** L-47's hypothesis (above), which is nearly free. | 2, 5 |

---

# Proposed § 7 rows — ready to paste, not placed

**A constraint first.** `REMEDIATION_PLAN.md` is **33 232 of its 40 960 bytes**, and
`plan-freshness.test.ts:136-137` pins `taskStatuses(src).size` to 5 and
`openFindings(src).size` to **9** — so any row placed must be accompanied by editing that
number in the same commit, or the suite fails. That is the design. Ninety-four rows at the
plan's row density is roughly 37 KB and **would breach the ceiling the plan exists to
protect**.

So the proposal is: **place group A's seven, plus one pointer row**, and leave the other
eighty-six here. The pointer keeps § 7 honest about what is outstanding without moving the
detail into a file with a byte ceiling.

| ID | Severity | Finding | Owner |
|---|---|---|---|
| **L-89** | High | A double-tap on « Valider » books the sale twice. No idempotency anywhere behind the button: `checkoutIntentSchema` has no request id and `createOrderInTransaction` has no duplicate check, and `setLoading` does not disable the button before a second click in the same task. Reproduced: orders #9/#10, 28 ms apart, `FiscalEvent` 15/16, `GrandTotal` moved twice and **never decremented** (`schema.prisma:959-962`). A refund corrects the money; nothing removes the phantom sale. `payment-dialog.tsx:151-244`. | none |
| **L-90** | High | A committed sale whose HTTP response is lost is re-rung as a second sale: no timeout, no retry, `clear()` never runs, the cart is still on screen. Same permanent double-count as L-89, and the same idempotency key closes both — scope it once. `checkout.ts:169-364`. | none |
| **L-91** | High | Saving a category through the admin editor silently deletes the `ComboSlotOptionRule` rows that depend on its option groups — `categories/[id]/route.ts:147` replaces groups wholesale and the FK is `Cascade`. All 7 live rules hang off `Pizzas → Taille`; losing them un-fixes the pizza size in Menu Chill / Eco / XXL **and moves the reference price the VAT allocation divides by**. The client sends `optionGroups` on every save, so a no-edit round trip triggers it. Cascade proved on a scratch copy. No test covers it. | none |
| **L-92** | High | The three report routes measure a period by calendar midnight while every sealed document uses the trading-day cut-off, so a filed VAT figure can differ from the sealed close in both directions, silently. `parseReportRange` (`report-range.ts:41`) takes no `cutoffHour`; `period.ts:19-22` made that argument required so the compiler would find every caller, and this module was never seen. Measured: sealed `MonthlyClose 2026-08` vatTotal 104 against `GET /api/reports/vat` → `totalVat 0, rows []`. | none |
| **L-93** | High | `settingsSchema` materialises `factice: false` and `printerConnection: "network"` where `DEFAULT_SETTINGS` answers `true` and `"usb"`, and `saveSettings` merges present keys over stored ones — so a settings save that omits `factice` **performs R6.3 silently** and one that omits `printerConnection` undoes the decision R6.4 rests on. Both defaults are pinned separately (`validation.test.ts:55`, `fresh-install-defaults.test.ts:79`); nothing asserts they agree. | none |
| **L-94** | High | A supplement is booked at its host component's VAT rate, not its own — `combo.ts:270` puts `shares[i] + c.supplements` on a line carrying `c.vatRate`; `pricing.ts:306` folds `addonsTotal` in at the product's rate. Policy § 6 says *« il relève de son propre taux »*. Not reachable today (`CategoryAddOn` exists only on `Pizzas` and `Sandwichs`, both 10 %) and **one catalogue edit away**. The fix is a rate on `CategoryAddOn` — a migration, and far cheaper before the first sale. | none |
| **L-95** | High | `assertDaySequence` (`fiscal.ts:594-605`) does not count a refund as trading, so a day whose only event was a refund can be skipped — and once a later day is sealed it is refused **permanently**, leaving a hole in the daily-close chain for a day on which cash left the drawer. The function's own docstring states the criterion it fails. `daily-close.test.ts:232` pins the cash-movement half; nothing pins this one. | none |
| **AUDIT-2026-09** | — | **Eighty-six further findings from the 2026-09-12 audit are recorded in `docs/audit/FINDINGS.md`**, grouped B (fix before the app is called complete, 39) · C (fix with the batch that owns the file, 36) · D (record and leave, 9) · E (undecidable until packaging, 3), with a view by area that says which are one session's work. **L-101 and L-96 block Phase 6**: R6.3 and R6.4 are both `PUT /api/settings`, which refuses the MANAGER 403, and the USB print helper reports a ticket as printed when the helper never ran. | none |

---

# Noted for whenever Tauri planning starts

Not a plan, and not written against this document — the packaging plan will be written against
a finished app. Four things from the six passes' closing sections that are neither defects nor
group E, kept so they are not lost:

- **Three roots come apart at packaging and coincide only by accident today**: migrations from
  `process.cwd()`, the lock from `dataDir()`, the database from `DATABASE_URL`. Deciding one
  root is the rest of DD-02's deferred decision — and it settles the WAL question and the lock
  question together, because both turn on whether the data sits under a synced folder.
- **What the bundle must carry that Next's own trace does not**: `.next/next-server.js.nft.json`
  has 604 entries and **zero** Prisma ones — no engine (20.2 MB), no `schema.prisma`, no
  `prisma/migrations/`. Sizes for the budget: `node_modules` 840.5 MB / 46 477 files;
  production `.next` ~24 MB; client JS 2.68 MB; backup retention's real ceiling ~1.4 GB.
- **Two dependency traps survive the move, pointing opposite ways**: `tw-animate-css` is a
  *devDependency* producing production-visible CSS (a `--production` install breaks every
  dialog animation with **no build error**), and `tar` is loaded through a dynamic `import()`
  no bundler analysis sees. Check any pruning step against the built CSS and against
  `backup.ts`, never against a static import graph.
- **`.zscripts/print-raw.ps1` is a runtime dependency of the product, not a dev script**, and
  `bun test src` reaches none of the sixteen operator scripts. Whatever replaces either — a
  sidecar, a native RAW-spooler call, in-app actions — inherits L-96's exit-code contract and
  L-126's "lift the rule into `src/lib/` and test it there" pattern.

*One housekeeping note from pass 1 that belongs to neither list: `docs/INVARIANTS.md`'s
spoken-for port list does not include the audit ports. Pass 1 collided with pass 4 on 3090 and
**only the marker proof caught it** — had the proof been skipped, one pass would have written
test sales into another's database.*

---

# The id mapping table

*Every id in the six pass files points at the wrong row the moment this file exists. This is
the map. Read it in the direction you need: a pass file id → its final id.*

| pass | its id | final | | pass | its id | final |
|---|---|---|---|---|---|---|
| 1 money | L-89 | **L-92** | | 4 till | L-112 | **L-89** |
| 1 money | L-90 | **L-95** | | 4 till | L-113 | **L-100** |
| 1 money | L-91 | **L-99** | | 4 till | L-114 | **L-96** |
| 1 money | L-92 | **L-127** | | 4 till | L-115 | **L-101** ⊕ |
| 1 money | L-93 | **L-128** | | 4 till | L-116 | **L-97** |
| 1 money | L-94 | **L-170** | | 4 till | L-117 | **L-132** |
| 1 money | L-95 | **L-94** | | 4 till | L-118 | **L-130** |
| 1 money | L-96 | **L-135** | | 4 till | L-119 | **L-131** |
| 1 money | S-1 | **L-134** | | 4 till | L-120 | **L-108** |
| 1 money | S-2 | **L-136** | | 4 till | L-121 | **L-143** |
| 1 money | *obs 1* | **L-171** | | 4 till | L-122 | **L-148** |
| 1 money | *obs 2* | **L-172** | | 4 till | L-123 | **L-147** |
| 2 security | L-89 | **L-120** | | 4 till | L-124 | **L-144** |
| 2 security | L-90 | **L-117** | | 4 till | L-125 | **L-149** |
| 2 security | L-91 | **L-119** | | 4 till | L-126 | **L-150** |
| 2 security | L-92 | **L-106** | | 4 till | L-127 | **L-133** |
| 2 security | L-93 | **L-118** ⊕ | | 4 till | L-128 | **L-90** |
| 2 security | L-94 | **L-102** | | 4 till | L-129 | **L-98** |
| 2 security | L-95 | **L-103** | | 5 build | L-89 | **L-104** |
| 2 security | L-96 | **L-173** | | 5 build | L-90 | **L-116** |
| 2 security | L-97 | **L-151** | | 5 build | L-91 | **L-115** |
| 2 security | L-98 | **L-174** | | 5 build | L-92 | **L-114** ⊕ |
| 2 security | L-99 | **L-101** ⊕ | | 5 build | L-93 | **L-113** |
| 2 security | L-100 | **L-182** | | 5 build | L-94 | **L-107** |
| 2 security | *TTL note* | **L-152** | | 5 build | L-95 | **L-112** ⊕ |
| 3 data | L-101 | **L-91** | | 5 build | L-96 | **L-164** |
| 3 data | L-102 | **L-110** | | 5 build | L-97 | **L-160** |
| 3 data | L-103 | **L-111** | | 5 build | L-98 | **L-165** |
| 3 data | L-104 | **L-129** | | 5 build | L-99 | **L-166** |
| 3 data | L-105 | **L-114** ⊕ | | 5 build | L-100 | **L-161** |
| 3 data | L-106 | **L-112** ⊕ | | 5 build | L-101 | **L-139** |
| 3 data | L-107 | **L-137** | | 5 build | L-102 | **L-163** |
| 3 data | L-108 | **L-140** | | 5 build | L-103 | **L-141** |
| 3 data | L-109 | **L-145** | | 5 build | L-104 | **L-162** |
| 3 data | L-110 | **L-175** | | 5 build | L-105 | **L-167** |
| 3 data | L-111 | **L-146** | | 5 build | L-106 | **L-105** |
| 3 data | S-1 | **L-181** | | 5 build | L-107 | **L-180** |
| 3 data | S-2 | **L-177** | | 5 build | L-108 | **L-138** |
| 3 data | S-3 | **L-109** | | 5 build | L-109 | **L-142** |
| 6 test | L-89 | **L-93** | | 5 build | L-110 | **L-176** |
| 6 test | L-90 | **L-123** | | 5 build | *db:seed note* | **L-168** |
| 6 test | L-91 | **L-122** | | 5 build | *shebang note* | **L-169** |
| 6 test | L-92 | **L-121** | | 5 build | *L-05 facet* | **L-178** |
| 6 test | L-93 | **L-153** | | 5 build | *L-51 facet* | **L-179** |
| 6 test | L-94 | **L-118** ⊕ | | 6 test | L-98 | **L-156** |
| 6 test | L-95 | **L-125** | | 6 test | L-99 | **L-159** |
| 6 test | L-96 | **L-124** | | 6 test | L-100 | **L-157** |
| 6 test | L-97 | **L-155** | | 6 test | L-101 | **L-126** |
| 6 test | *wipe hazard* | **L-154** | | 6 test | L-102 | **L-158** |

**⊕ marks a merged row** — two passes, one finding, one number:

| final | merged from | why it merged |
|---|---|---|
| **L-101** | pass 2 L-99 · pass 4 L-115 | Same nav/API mismatch on `PUT /api/settings`. Pass 2 read it and rated Low; pass 4 reproduced it live and rated High. **High taken.** |
| **L-112** | pass 5 L-95 · pass 3 L-106 | Both are "a thrown startup failure leaves no `TechnicalLog` row"; pass 3 adds the missing `catch` that also leaves `lastMigrationGateResult()` stale. |
| **L-114** | pass 3 L-105 · pass 5 L-92 | Identical: `migrationsOnDisk()` resolves from `process.cwd()` and its absence reads as `UP_TO_DATE`. Pass 5 adds the measured `.nft.json` evidence. |
| **L-118** | pass 2 L-93 · pass 6 L-94 | Identical: `isPublishedDefaultPin` has one call site, an operator script, and `POST /api/seed` installs the two published PINs. |

---

# Reconciliation

**Ninety-nine raw findings in, ninety-nine accounted for.**

| in | count |
|---|---|
| Numbered rows in the six passes' CONFIRMED and SUSPECTED tables | **90** (1: 10 · 2: 12 · 3: 14 · 4: 18 · 5: 22 · 6: 14) |
| Items a pass described in prose and deliberately did not number | **6** (1 × 2 observations · 2 × TTL drift · 5 × db:seed + shebang · 6 × wipe hazard) |
| New material attached to a rediscovered known finding | **3** (5's L-05 addition · 5's L-51 addition · 2's L-47 mechanism) |
| **total raw in** | **99** |

| out | count |
|---|---|
| Rows in this file, **L-89 … L-182** | **94** |
| — of which group A | 7 |
| — group B | 39 |
| — group C | 36 |
| — group D | 9 |
| — group E | 3 |
| Raw findings absorbed by the 4 merged rows (2 raw each) | **+4** |
| Recorded in *Already known* without a new number (L-47's mechanism) | **+1** |
| **total raw accounted for** | **99** ✓ |

**Nothing was silently dropped, and nothing was set aside as not holding** — see *Looked at and
set aside* for the three claims corrected inside rows that were kept. Rediscoveries of the nine
open § 7 findings produce no row by design (L-84 × 3 passes, L-81 × 5, L-88, L-11, L-75, L-47 ×
2, L-51, L-05) and are listed under *Already known*; where a pass added genuinely new material
to one, that material got its own number and is counted above (**L-98** ← L-88, **L-108** ←
L-79, **L-178** ← L-05, **L-179** ← L-51).

---

*Consolidated 2026-09-12 from six read-only passes. This session changed no source file, no
test, no script, no plan, `CLAUDE.md` or `docs/INVARIANTS.md`; committed nothing; applied no
migration; ran no script with `--apply`; and never started a server against the repository's
database. `bun run test` (1382 pass / 0 fail / 114 files), `bun run typecheck` and `bun run
lint` were run once as this session's own baseline, and the live database was read
`readonly: true` throughout — verified byte-identical afterwards: sha256
`0d304ee79ad3b06adb0b89542a8906bf706f85868ae56035b8c600e3f9083cdb`, 884 736 bytes, mtime
2026-09-11 16:33:12, no `-wal` or `-shm` beside it.*

**Nothing in this document, and no measurement in it, is evidence of French fiscal or legal
compliance.**
