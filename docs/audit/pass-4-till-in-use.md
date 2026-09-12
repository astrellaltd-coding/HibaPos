# PASS 4 — The till, actually used

**Read-only audit, 2026-09-12.** Nothing in the repository was changed except this file.
No commit, no migration, no `--apply`, no write to `db/custom.db`.

**New finding IDs start at L-112.** The other five passes had already written their files
when this one ran; a grep of `docs/audit/pass-*.md` for `L-nn` tokens only (not their text)
showed L-89…L-111 taken. This pass read none of their prose, so any overlap is independent
rediscovery.

---

## 1. What was actually run

### Scratch copy, proved before the first write

| Step | Evidence |
|---|---|
| Production baseline, app stopped | sha256 `0d304ee79ad3b06adb0b89542a8906bf706f85868ae56035b8c600e3f9083cdb`, 884 736 bytes, mtime `2026-09-11 16:33:12`, no `-wal`/`-shm` |
| Copy | `…/scratchpad/data/db/custom.db`, byte-identical sha |
| Marker written **to the copy only** | user `pass4marker` / « PASS4 SCRATCH MARKER », MANAGER; PIN «redacted 2026-09-12 at commit — see note below» hashed with the app's own `hashPin` from `src/lib/auth.ts`. The seeding script refuses any path not containing `AppData` + `scratchpad`, refuses a path under `/OneDrive/`, and refuses unless `DATABASE_URL` also names the scratch copy. |
| **Proof of which database the server had open** | pre-auth `GET /api/auth/profiles` on `127.0.0.1:3090` returned three profiles including `pass4marker` — a row that exists only in the copy |
| Build | `bun run build` with `DATABASE_URL`, `HIBAPOS_DATA_DIR`, `SESSION_SECRET`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_LOCATION` all pointed at the scratchpad. `.next/BUILD_ID` = `-HVfkgzQ4Fe9gzXYDCwBV`, 12 Sep 11:53; **0 source files newer than it** afterwards |
| Server | `bunx next start -p 3090 -H 127.0.0.1`, stopped with `taskkill //PID 19944 //T //F` |
| Production after | sha256 **unchanged**, mtime **unchanged**, no `-wal`/`-shm`, `git status` clean but for the other passes' untracked files |

Live data was read with `bun:sqlite` `readonly: true`. Prisma was never pointed at
`db/custom.db`.

> **The one edit this file has had, 2026-09-12, on the operator's instruction at commit.** The
> marker row above recorded the six digits of the PIN given to `pass4marker`; they are replaced
> by « redacted ». Nothing else in this file was touched — no finding, no measurement, no word
> of the framing. The PIN unlocked a user that existed only on the scratch copy this pass
> created and deleted, so it was dead before it was written down, and the live database has
> only `admin` and `manager`. It was removed because `docs/INVARIANTS.md` says no PIN or secret
> value is recorded anywhere, and a commit is permanent. What the row is evidence *of* — a
> marker user written to the copy alone, hashed with the app's own `hashPin`, and proved
> through a pre-auth `GET /api/auth/profiles` before any write — is untouched, and the digits
> were never part of it.

### Baseline re-measured (§ 4 is accurate — no drift)

| Thing | § 4 says | Measured 2026-09-12 |
|---|---|---|
| Tests | 1382 pass / 0 fail / 114 files | **1382 / 0 / 114**, 364 s, 2 snapshots, 4471 `expect()` (§ 4 predicts the expect drift) |
| `prisma:error` blocks | zero | **zero** |
| typecheck · lint | clean | **clean**, re-run again at the end |
| Migrations | 15, none pending | **15, all `finished_at` set** |
| Trading tables | all zero | **all fifteen zero** |
| Fiscal counters | 0/0/0/0 | **0/0/0/0**, journal empty |
| Catalogue | 84 products / 14 categories / 80 on grid | **84 / 14 / 80**; 83 `active=1` (L-81 still `active=0`) |
| Duplicate names | none | **none** |
| Settings | `printerConnection`/`printerQueue` absent → defaults | **absent**; effective `usb` + empty queue, confirmed through `GET /api/settings` |
| Production DB | sha `0d304ee7…`, 884 736 B | **identical** |

**No drift to report.** The catalogue is unchanged since 2026-09-11 16:33.

### L-47 did not reproduce

The login screen **cleared normally in the in-app browser pane** and the whole walkthrough
ran there: profile picker → keypad → authenticated shell → POS → dialogs. One new data
point against L-47 on this build. (Synthetic `type` into the login keypad does not land —
the keypad is on-screen buttons — but that is the known browser-driving flakiness, not
L-47.) One transient fault did occur: the lazily-loaded **Fiscal** view failed twice with
`ChunkLoadError` because the pane received **HTTP 500 + `text/plain`** for
`_next/static/chunks/8b70a79c080e0b46.js`, while the same URL served `200` /
`application/javascript` to `curl` three times in a row. Recorded as a pane artefact, not
a finding.

### The walkthrough, and what the database said back

Every figure below was read back from the scratch copy with `bun:sqlite`, not taken from the
screen.

| # | What was rung | Screen | Database |
|---|---|---|---|
| 1 | Coca ×2, sur place, 5,00 € cash | 3,00 €, rendu 2,00 € | `total 300`, `vatTotal 27`, `lineHt 273`, payment `tendered 500 change 200` ✓ |
| 2 | 5 Nuggets + Algérienne + Frite Cheddar, à emporter, carte | 7,20 € | `720`, VAT `65`, HT `655`, both options in `optionsJson` ✓ |
| 3 | Boursin Senior + Viande Hachée + Œuf, sur place, cash | 14,90 €, rendu 5,10 € | `1490`, VAT `135`, add-ons snapshotted ✓ |
| 4 | **Menu Eco** à emporter (3 pizzas + 1 bouteille) | 24,90 € | four lines, `2490` exactly; 3 × `vatRate 10`, 1 × `vatRate 5.5`; `referencePrice` 890/890/890/350; `comboPrice 2490`; `itemCount 1`; Σ(net−ht) = `vatTotal` = **216** ✓ |
| 5 | Discount 2,00 € on 15,00 € (13,3 %) | 13,00 € | `discountTotal 200`, net 1300, HT 1182, **no** step-up asked ✓ |
| 6 | Discount 5,00 € on 15,00 € (33 %) | 10,00 € | refused **403 « Confirmation par code PIN requise. »** without a token; accepted with one; `discountApprovedById` recorded; token replay → « Token déjà utilisé » ✓ |
| 7 | 100 % discount → **OFFERT** | — | booked via API: `total 0`, `vatTotal 0`, payment `OFFERT 0`. **From the interface it crashes — L-112.** |
| — | Partial refund 5,00 € on #3 | — | `totalRefunded 500`, `fullyRefunded false`, REMBOURSEMENT event ✓ |
| — | Full refund 7,20 € on #2 | — | `fullyRefunded true`, order `REFUNDED`; a further 1,00 € refused « Cette commande a déjà été entièrement remboursée » ✓ |
| — | Reprint #1 | — | `reprintCount` incremented, REIMPRESSION journalled **before** the paper was attempted, ticket carries `[COPIE — Tirage N° 1]` ✓ |
| — | Cash in +50,00 € | — | accepted with no PIN ✓ |
| — | Cash out −30,00 € | — | refused without a PIN, accepted with one ✓ |
| — | **X report** | Ventes 60,80 € · Espèces attendues 207,80 € | `salesTotal 6080`, `cashTotal 3780`, `expectedCash 20780` — net of refunds, arithmetic checked by hand ✓ |
| — | **Z close** (counted 207,50 €) | Écart −0,30 € | `ZReport#1`, `cashVariance -30`, backup written, `backupError: null` ✓ |
| — | **Daily close** 2026-09-12 | — | refused: « la journée … n'est pas terminé » (**L-118**) ✓ |
| — | **Daily close** 2026-09-11 | — | sealed, `CLOTURE_J`, integrity code `A9B0-A919-54EC-D734`, ticket renders correctly ✓ |
| — | Printer unreachable | — | **NOT_CONFIGURED** → « Aucune imprimante sélectionnée… », sale unaffected; with a bogus queue → **UNREACHABLE** in 613 ms, « Imprimante « … » introuvable dans Windows… » ✓ |

**The money on the screens matched the money in the database everywhere it was checked.**
The arithmetic — apportionment, the two-rate menu split, VAT snapshots, refund netting,
`expectedCash` — held under every case rung. What this pass found is not in the arithmetic.

---

## 2. Findings — CONFIRMED

Ranked by what could lose money or corrupt the fiscal journal.

| ID | Sev | Where | What is wrong | How it was established | Cost to fix |
|---|---|---|---|---|---|
| **L-112** | **High** | `src/components/pos/payment-dialog.tsx:151-244`, `:444-451` | **A double-tap on « Valider » books the sale twice.** `setLoading(true)` does not disable the button before a second click in the same task reaches the handler, and there is no idempotency anywhere behind it: `checkoutIntentSchema` has no request id, `createOrderInTransaction` has no duplicate check. Two orders, two sealed `VENTE` events, `GrandTotal` moved twice — and `GrandTotal` is never decremented (schema comment, `prisma/schema.prisma:959-962`), so the inflation is permanent. A refund corrects the money; nothing removes the phantom sale. | **Reproduced live.** Two synchronous clicks on the real button produced orders **#9 and #10, both 1,50 €, 28 ms apart**, `FiscalEvent` sequences **15 and 16**, two `POST /api/orders → 201` in the network log. Separately measured: the button is **still enabled 60 ms after the first click** (`v2.disabled === false`), i.e. within human double-tap range. At 60 ms only one order resulted — but the second POST *was* sent and was refused **400 « La commande est vide »** purely because `clear()` won the race. That is not a guard: it depends on the first response returning first. A slower machine, a larger basket, or a Z close holding SQLite widens the window. | Small–medium. A `useRef` submit latch closes the tap case in a few lines. The durable fix is a client-generated idempotency key carried on the checkout and unique-indexed, which is a migration. |
| **L-113** | **High** | `src/components/pos/payment-dialog.tsx:398-399` | **« Offert / repas personnel » crashes the POS.** `METHODS` holds only CASH/CARD/VOUCHER; `OFFERT_METHOD` is defined separately at `:35` and never added. The payment-lines list does `METHODS.find(x => x.method === l.method)!` and then reads `m.icon`, so the moment `addOffert()` puts an OFFERT line in state the render throws. DD-14's tender is therefore **unusable from the till**, which is the only way to settle a 100 %-discounted order. | **Reproduced live** on the scratch till: 7 Up, 100 % remise, Encaisser, click « Offert / repas personnel » → the whole POS view falls into the error boundary, « Une erreur inattendue est survenue ». Console: `TypeError: Cannot read properties of undefined (reading 'icon')` and `Uncaught rendering error in POS (pos)`. The API accepts the same sale fine (order #7 booked `total 0`, payment `OFFERT 0`), so this is purely the dialog. The cart survives in `localStorage`. No test renders this component — `offert-tender.test.ts` asserts the enum, the route and the schema, never the dialog. | Trivial (one entry in the lookup, or a fallback). The finding is that nothing would have caught it: add a render test for the OFFERT line. |
| **L-114** | **High** | `src/lib/services/printer-transport.ts:233-235`, `:315-343` | **A print helper that never runs is reported as printed.** `defaultSpoolerScriptPath()` is `path.join(process.cwd(), ".zscripts", "print-raw.ps1")` — the sixth `process.cwd()` anchor, the one `paths.ts` was written to remove. And when the script is absent, `powershell.exe -File <missing>` **exits 0** on this machine, so `realRun` resolves `{code: 0}`, `send()` returns, `deliver()` returns `{ok: true}`, and `orders/[id]/print` writes `printStatus: "PRINTED", printedAt: now`. Nothing is on the paper and the till says nothing. | **Measured.** From a different cwd, `defaultSpoolerScriptPath()` resolved into the scratchpad, `existsSync` false, and `createWindowsRawTransport(...).send()` returned **`send: OK`**. Directly: `spawn("powershell.exe", ["-File", "<missing>.ps1", …])` → **exit code 0**, error text only on stderr. (With the script present and a bogus queue the behaviour is correct: exit 2 → `UNREACHABLE`, good French message, 613 ms.) `printer-spooler.test.ts` injects a fake `run`, so no test exercises the real spawn. | Small: resolve the script from a fixed app root rather than cwd, and treat non-empty stderr / a missing script as a failure. Both matter **before** Tauri moves the working directory. |
| **L-115** | **High** | `src/app/api/settings/route.ts:24-27` vs `src/components/shared/nav-config.ts:60` | **The restaurant's operator cannot save any setting.** `nav-config.ts` grants MANAGER the Réglages view with a comment saying it was opened to MANAGER *because* « Réglages is where the printer IP and name … are configured ». `PUT /api/settings` refuses every non-SUPER_ADMIN with 403. The screen renders in full, the « Enregistrer » button is enabled, and pressing it fails. This blocks **R6.4** (the failed-print message literally says « Choisissez l'imprimante Windows dans les réglages ») and **R6.3** (FACTICE off), for the only person who will be at the till. The one account that can is `admin` — the developer's, in Tunisia (V-10). | **Reproduced live** as `manager`: Paramètres renders (11 inputs, printer section present), « Enregistrer » `disabled === false`, click → toast **« Réservé au super administrateur »**. Confirmed at the API: the same PUT as MANAGER → `403 {"error":"Réservé au super administrateur"}`; as `admin` → 200. `settings-view.tsx:559-561` gates only the two SUPER_ADMIN cards, nothing else. | Small but it is a **decision**: either open the write to MANAGER (matching the nav comment and DD-07), or split it so the printer/FACTICE fields are MANAGER-writable and the identity fields are not. Do not fix by hiding the screen — that leaves R6.3/R6.4 unreachable. |
| **L-116** | **Medium** | `src/components/pos/receipt-dialog.tsx:32`, `:60`; `src/features/orders/orders-view.tsx:543`; `src/app/globals.css:216-233` | **The paper the customer gets is not the archived document, and it omits the FACTICE stamp.** `window.print()` prints the HTML block `#receipt-print`, which is re-rendered from the order DTO. It carries no `*** FACTICE — SIMULATION *** / TICKET NON VALABLE`, no `Caisse N°`, no `Détail TVA` per rate and no software identity line — all four of which `renderReceipt` puts on `Receipt.content`. With `factice = true` (production's current value; R6.3 is the row that clears it) the browser path hands the customer a ticket that does not say it is invalid. Today it is the **only** path that can reach paper, since the ESC/POS transport is unconfigured. `autoPrint` fires it automatically 350 ms after the dialog opens. | **Both documents captured side by side for order #8.** Archived `Receipt.content` (read with `bun:sqlite`) begins `*** FACTICE — SIMULATION *** / TICKET NON VALABLE`, has `Caisse N° 1`, `TVA 10 % (HT 0,91 €)`, `HibaPOS France v0.2.1`. `document.getElementById('receipt-print').innerText` in the running app begins `HIBA FOOD` and has none of them. `downloadReceipt` (`src/lib/receipt.ts:8`) uses the canonical renderer, so only the printed/HTML view diverges. | Medium. Either render the stored `Receipt.content` in a `<pre>` for printing (one component, and it satisfies « never re-rendered » exactly), or add the four missing blocks to both HTML views. The first is cheaper and cannot drift again. |
| **L-117** | **Medium** | `src/features/shifts/shifts-view.tsx:624` | **The cash-count field is pre-filled with the expected amount.** `useState((expectedCash / 100).toFixed(2))` seeds « Espèces comptées (€) » with what the software already believes is in the drawer, so the default action on the Z dialog seals `Écart nul` and records a count that may never have been made. `z-close.ts`'s own header says this screen exists for « catching missing cash » (C-02). | Read from source and seen in the app: the Z dialog opened with the expected figure already typed in, variance « Écart nul », and one click seals it. My own close only showed a variance because I deliberately typed a different number. | Trivial: start the field empty and disable the seal until something is entered. It is a behaviour change, so it is the operator's call. |
| **L-118** | **Medium** | `src/lib/services/fiscal.ts:505-511`, called at `:638` | **The daily close's refusal is ungrammatical French.** One template serves three periods with labels of different gender — `"la journée"` (`:638`), `"le mois"` (`:821`), `"l'exercice"` (`:928`) — and hard-codes masculine agreement. The operator reads: « Clôture prématurée : **la journée** 2026-09-12 n'est pas **terminé**. **Il** ne pourra être **clôturé** qu'à partir du 2026-09-13 à 05:00. » Should be *terminée · Elle · clôturée*. This is the most likely fiscal refusal a tired person meets at 23:00. | **Reproduced live**: `POST /api/fiscal/close-day {"day":"2026-09-12"}` returned exactly that string. | Trivial — pass the agreement with the label, or split the three messages. Check whether `close-timing.test.ts` pins the string before editing. |
| **L-119** | **Medium** | `src/components/ui/dialog.tsx:70-76`; `src/components/ui/input.tsx:11`; `src/components/pos/discount-dialog.tsx:81` | **Three touch targets under 44 px that `touch-and-labels.test.ts` cannot see**, because it reads `<Button>` call sites and the `Button` primitive's variants only. (a) Every dialog's close « × » is a `DialogPrimitive.Close` with no size class — **measured 16 × 16 px** in the running app, on every dialog in the product. (b) The shared `Input` primitive is `h-9` = **36 px measured**, which is what the **step-up PIN field** renders at (`step-up-pin-dialog.tsx:96`, `#step-up-pin`, measured 462 × 36) — the control that gates every refund and every above-threshold discount. (c) The discount amount field is a raw `<input class="h-10">` = **40 px measured**, and it has **no accessible name** (plain `<label>` with no `htmlFor`, no `id`, no `aria-label`), which the L-10 half of the same test also cannot see because it reads `<Label>` only. | Measured in the browser with `getBoundingClientRect()` on the running build, with the payment, discount and step-up dialogs open. A source scan built on the test's own JSX parser, widened to raw `<button>/<input>/<select>/<textarea>`, found 24 undersized declarations across `src` (the rest are in admin/catalogue screens). | Small per site. The durable fix is to widen the guard the way L-64 widened it for `Button`: assert the `Input` primitive and the dialog close, and read raw elements as well as `<Button>`. |
| **L-120** | **Medium** | `src/lib/services/backup.ts:191-199`; `src/lib/paths.ts:82-86` | **A backup silently contains no images when the uploads directory is not where `HIBAPOS_DATA_DIR` puts it.** `mediaSources` includes a directory only `if (existsSync(dir))`; with none present `ensureMediaArchive` returns `null`, which by the R4.1 invariant means « nothing to archive » — the same answer an install with genuinely no images gets. L-79 closed this conflation at the *loader*; it is still open at the *path*. | **Observed in this run.** The Z close produced `imagesPath: null, media: null, mediaUnavailable: null` while **48 MB of catalogue images sat in `public/uploads`** — because `HIBAPOS_DATA_DIR` pointed at the scratchpad and `uploadsDir()` therefore resolved to `<dataDir>/uploads`, which does not exist. Nothing in the `Backup` row, the response or the technical log distinguished that from « this restaurant has no photos ». | Small: distinguish « the configured media directory does not exist » from « it exists and is empty », and report the first as `{ unavailable }`. **This fires the day Tauri moves the data directory.** |
| **L-121** | **Low** | `src/app/api/orders/[id]/print/route.ts:45-55` vs `[id]/reprint/route.ts:71-76`; `src/lib/services/checkout.ts:309` | **`Receipt.printStatus` is written inconsistently and read by nothing.** The first-print route writes `FAILED` only when `reason === "FAILED"`, so `NOT_CONFIGURED` and `DISABLED` leave the row `PENDING`; the reprint route writes `FAILED` for *any* non-ok outcome, including `DISABLED`. The route's own comment claims unprinted tickets « stay visible as FAILED so a shift's unprinted tickets can be found later » — but no screen, report or API response returns the column (`GET /api/orders` and `GET /api/orders/[id]` do not include `receipt`). With the printer unconfigured for the whole test period, every ticket will be `PENDING` and there is no way to list what never printed. | Read back from the scratch database after the walkthrough: receipt #1 `FAILED` (reprint path, same printer, same `NOT_CONFIGURED`), receipts #2–#8 `PENDING`. `grep printStatus src --include=*.tsx` returns nothing outside the three writers. | Small: make both routes agree, and surface the column somewhere — or delete it and say so. |
| **L-122** | **Low** | `src/components/shared/topbar.tsx:53-64`, `:165-178` | **An unlabelled stopwatch sits beside the caisse badge and measures nothing.** `useSessionTimer` counts from component mount, resets to `00:00:00` on every reload, and runs identically whether the caisse is open or closed. Rendered immediately to the right of « Caisse #2 » / « Caisse fermée », it reads as « how long this till has been open ». | Seen in the app: « Caisse fermée · 00:00:08 » right after login, with no shift open; « Caisse #2 · 00:01:04 » on a shift opened minutes earlier. | Trivial: derive it from `shift.openedAt` (and hide it when no shift is open), or label it. |
| **L-123** | **Low** | `src/features/auth/login-screen.tsx:251`, `:361` | **The profile picker shows the ROLE label, never the account's name.** `managerProfiles` filters to MANAGER and each card renders `ROLE_STYLE[profile.role].label`. With one MANAGER this is fine; DD-07 makes MANAGER the only operational role, so a second member of staff produces two identical « Gérant » cards with no way to tell them apart. | Seen directly: with `manager` and `pass4marker` both active MANAGERs, the screen showed **two identical « Gérant » cards**, and `GET /api/auth/profiles` already returns `name` for both. | Trivial: show `profile.name`, keep the role as the subtitle. |
| **L-124** | **Low** | `src/lib/services/printer.ts:48-51` | **Stale comment on a live decision.** « `printerConnection` defaults to "network" everywhere it is absent, so an install that predates this batch resolves to exactly the transport it resolved to before » — reversed on 2026-09-11, when `DEFAULT_SETTINGS.printerConnection` became `"usb"` (`settings.ts:16-29`). A reader of `resolvePrinter` is told the opposite of what production does. | `GET /api/settings` on the production catalogue copy: `printerConnection: "usb"`, `printerQueue: ""`, both absent from the `Setting` table. | Trivial. |
| **L-125** | **Low** | `src/features/shifts/shifts-view.tsx:228` | « **1 caisses** » — a raw count with a hard-plural noun, where the rest of the product uses the `N vente(s)` / `N mouvement(s)` convention. | Read on screen with one shift in history. | Trivial. |

### Not re-reported

- **already L-11** — `payment-dialog.tsx:152` (`paid < total - 1`) vs `:451` (`paid < total - 0.01`), and the uncleaned `setTimeout(reset, 200)` at `:93`. Both seen again; both already filed. L-112 is a different defect in the same file and is not L-11.
- **already L-84** — `showOnPos` is a display rule, not a guard.
- **already L-81** — `5 nuggets test` is still `active = 0`; the catalogue is otherwise unchanged.
- **already L-88** — the day-close ticket prints no give-away line. Rendered the sealed 2026-09-11 slip through the app's own `renderDayCloseTicket` and confirmed the omission; it is filed.
- **already L-47** — did *not* reproduce; recorded above as a data point rather than a new row.

### A known finding that no longer reproduces as written

**L-22's English half appears closed.** `instrumentation.ts` installs `@/lib/zod-locale`
statically and it works: four deliberately malformed checkouts came back in French —
« Trop grand : string doit avoir <=500 caractères », « Entrée invalide : int attendu,
nombre reçu », « Option invalide : une valeur parmi "CASH"|"CARD"|"VOUCHER"|"OFFERT"
attendue », and the hand-written « Quantité maximale : 99 par ligne. ». What survives is
narrower and is **L-126 (Low)**: the localised messages still carry TypeScript type names
(`string`, `int`) and comparison operators (`<=500`) into text a restaurant operator reads.
Whether that is worth closing is a judgement; it is not the finding L-22 describes.

---

## 3. Findings — SUSPECTED

| ID | Sev | Where | What is suspected | Why it could not be settled |
|---|---|---|---|---|
| **L-127** | Medium | `src/components/pos/step-up-pin-dialog.tsx:96-107` vs `src/features/auth/login-screen.tsx` | **The step-up PIN may be untypable on a touch-only till.** The login screen provides a full on-screen keypad (`1`…`0`, « Supprimer le dernier chiffre », « Valider le code »). The step-up dialog — every refund and every discount above 20 % — is a bare `<Input type="password">` with no keypad, relying on the OS touch keyboard appearing. The asymmetry is certain; the consequence depends on hardware nobody here can see. | Settling it needs the restaurant's all-in-one: whether it has a physical keyboard, and whether Windows' touch keyboard auto-invokes for this field. Reproducing the keypad is the cheap safe answer either way. |
| **L-128** | Low | `src/lib/services/checkout.ts:169-364` | **A committed sale whose HTTP response is lost is re-rung as a second sale.** Distinct from L-112's tap: `api-client.ts` has no timeout and no retry, the catch shows « Erreur lors de l'encaissement », `clear()` never runs, and the cart is still on screen. The operator rings it again. Same permanent double-count. | Could not be produced without killing the server mid-transaction, which would have meant writing to something. The same idempotency key that closes L-112 closes this; noted so the fix is scoped once. |
| **L-129** | Low | `src/features/fiscal/fiscal-view.tsx:542` | **The Z report and the daily close have no print path at all.** `renderDayCloseTicket` is called only inside a `<pre>` in the fiscal screen; `printReceiptText` has exactly two callers, both order tickets. « The slip the operator files with the books » can only be read on screen. | Whether that is a defect or a decision is not written down anywhere I could find. It is the premise L-88 assumes, so the two should be settled together. |

---

## 4. What could not be settled without writing something

- Whether a **physical** double-tap on the restaurant's touchscreen lands two clicks in one
  task. The button being enabled at 60 ms is measured; the digitizer's event timing is not.
  The finding does not depend on it — the missing idempotency is the defect.
- Whether the **Fiscal view's chunk 500** is anything but a pane artefact. It never
  reproduced over `curl`.
- The **livraison** path end to end: 43 products cost 1,00 € more en livraison and the
  order requires a customer with name, phone and address; the database has zero customers,
  so exercising it meant creating one. Repricing on order-type change is covered by
  `cart-store-repricing.test.ts`; the client↔server agreement on the livraison price was
  not verified by this pass.
- Whether **`close-timing.test.ts` pins L-118's exact string**. Checking would have been
  read-only, but fixing it is not this pass's job and the plan asks the fixer to look.

---

## 5. Proposed rows for § 7 — for the operator to place

Numbers start at L-112 to clear L-89…L-111, already used by passes 1, 2, 3, 5 and 6.

| ID | Severity | Finding | Owner |
|---|---|---|---|
| **L-112** | High | A double-tap on « Valider » books the sale twice. Nothing between the till and the journal distinguishes a retry from a second sale: no idempotency key on the checkout, and `setLoading` does not disable the button before a second click in the same task. Reproduced: orders #9/#10, 28 ms apart, `FiscalEvent` 15/16, `GrandTotal` moved twice and never decremented. The button is still enabled 60 ms after the first click. `payment-dialog.tsx:151-244`. | none |
| **L-113** | High | « Offert / repas personnel » crashes the POS into the error boundary — `METHODS` has no OFFERT entry and `payment-dialog.tsx:398` asserts the lookup non-null. DD-14's tender is unusable from the interface; the API accepts it. No test renders the component. | none |
| **L-114** | High | The USB print helper is resolved from `process.cwd()` (`printer-transport.ts:233`), and `powershell.exe -File <missing>` exits 0 — so a helper that never runs is recorded as `PRINTED`. « Prints nothing and reports success », reached by the working directory rather than by a COM1 queue. Fires the day packaging moves the cwd. | none |
| **L-115** | High | MANAGER — the till's only operational role — is given the Réglages screen and an enabled « Enregistrer », and `PUT /api/settings:25` refuses them 403. Blocks R6.4 (choosing the Windows printer, which the failed-print message tells them to do) and R6.3 (FACTICE off). | none |
| **L-116** | Medium | The browser print path prints a re-rendered HTML receipt, not `Receipt.content`: no FACTICE stamp, no `Caisse N°`, no per-rate VAT, no software identity. It is the only path that can reach paper today, and `autoPrint` fires it automatically. | none |
| **L-117** | Medium | The Z close pre-fills « Espèces comptées » with the expected cash, so the default seal is `Écart nul` and records a count that need never have been made. `shifts-view.tsx:624`. | none |
| **L-118** | Medium | The premature-close refusal is ungrammatical for the daily close: « la journée … n'est pas terminé. Il ne pourra être clôturé ». One template, three genders. `fiscal.ts:505-511`. | none |
| **L-119** | Medium | Three sub-44 px touch targets the guard cannot see: every dialog's close × (16 px, `dialog.tsx:70`), the `Input` primitive and therefore the step-up PIN field (36 px, `input.tsx:11`), the discount amount field (40 px and unnamed, `discount-dialog.tsx:81`). Widen `touch-and-labels.test.ts` past `<Button>`. | none |
| **L-120** | Medium | A backup whose uploads directory does not exist reports « nothing to archive », indistinguishable from an install with no images. Observed: 48 MB of images present, `media: null`. L-79's conflation, one level up at the path. `backup.ts:195`. | none |
| **L-121** | Low | `Receipt.printStatus` is written inconsistently by the print and reprint routes and read by nothing. « A shift's unprinted tickets can be found later » is not something the software can do. | none |
| **L-122** | Low | An unlabelled stopwatch beside the caisse badge counts from component mount, resets on reload and runs while the caisse is closed. `topbar.tsx:53`. | none |
| **L-123** | Low | The login profile picker renders the role label, never the account name; two MANAGERs are indistinguishable. `login-screen.tsx:361`. | none |
| **L-124** | Low | `printer.ts:48-51` says `printerConnection` defaults to `"network"`; it has defaulted to `"usb"` since 2026-09-11. | none |
| **L-125** | Low | « 1 caisses » — `shifts-view.tsx:228` breaks the product's own `N vente(s)` convention. | none |
| **L-126** | Low | The French zod messages carry type jargon into operator text (« Trop grand : string doit avoir <=500 caractères », « int attendu »). L-22's English half no longer reproduces — the locale works. | none |
| **L-127** | Medium (susp.) | The login screen has an on-screen PIN keypad; the step-up dialog — every refund, every discount over 20 % — does not. May be untypable on a touch-only till. | none |
| **L-128** | Low (susp.) | A committed sale whose response is lost leaves the cart intact and is re-rung. Same permanent double-count as L-112; the same idempotency key closes both. | none |
| **L-129** | Low (susp.) | The Z report and the daily close have no print path; `renderDayCloseTicket` is screen-only. L-88 assumes a paper slip that does not exist. | none |

---

## 6. What Tauri needs to know from this pass

**1. The working directory is still load-bearing, in exactly one place, and it is the printer.**
`paths.ts` was written because five locations were each anchored to `process.cwd()`.
`printer-transport.ts:233` is the sixth and it was missed. Under Tauri the process's cwd is
not the install directory, so `.zscripts/print-raw.ps1` will not be found — and because
`powershell.exe -File <missing>` exits 0, **the till will report every ticket as printed
while nothing prints**. Fix both halves before packaging: resolve the helper from a real app
root, and stop treating exit 0 with a start-up failure on stderr as success. This is the
single most dangerous packaging interaction found in this pass.

**2. `.zscripts/print-raw.ps1` is a runtime dependency of the product, not a dev script.**
It must be shipped inside the bundle and locatable without a shell. Whatever Tauri does about
PowerShell — sidecar, shell plugin, or replacing the helper with a native RAW-spooler call —
must keep `print-raw.ps1`'s exit-code contract, which is good and is what makes « Imprimante
« … » introuvable dans Windows » work (verified live: exit 2 → `UNREACHABLE`, 613 ms).

**3. Moving the data directory silently drops the catalogue images from every backup.**
Measured in this run, not argued: with `HIBAPOS_DATA_DIR` set, `uploadsDir()` becomes
`<dataDir>/uploads`, the 48 MB under `public/uploads` is no longer seen, and the backup
records « nothing to archive » — the same value an install with no photos gets. The Tauri
migration moves both the data directory and the images. Decide where the images live, and
make « the configured media directory does not exist » a reported failure before the move,
not after.

**4. There is a ~490 KB gap between the paper and the archive, and Tauri decides which one a printer driver sees.**
Today two renderings of the same sale exist: the sealed 48-column `Receipt.content` and an
HTML block printed by `window.print()`. The HTML one omits the FACTICE stamp. If Tauri
replaces the browser print dialog with a native print path, that is the moment to delete
the second rendering rather than port it.

**5. Idempotency is a packaging-adjacent decision.**
L-112 is a client defect today, but the durable fix is a unique key on the checkout, which
is a **migration**. Migrations now apply themselves at startup behind a verified backup
(PREP-4). Getting the key in before Tauri means one more migration on a database that has
never traded; getting it in after means one on a database that has.

**6. What this pass did *not* find, which is worth stating.**
Every money path rung — options, add-ons, a two-rate menu composé, discounts either side of
the threshold, a give-away, a partial and a full refund, cash in and out, X, Z and a daily
close — produced numbers on screen that matched the database exactly, to the cent. The
apportionment, the VAT snapshot, the refund netting and `expectedCash` all held. The till's
arithmetic is not what needs attention before the first sale; its interface, its printer
path and its role model are.

**7. Two Phase 6 rows are blocked by software, not hardware.**
R6.3 (FACTICE off) and R6.4 (choose the printer) are both `PUT /api/settings`, and the
operator's role is refused (L-115). Whoever plans the Tauri install should assume the
first-run experience includes a MANAGER who must be able to pick a printer and clear the
FACTICE flag without the developer's account.

---

*Scratch copy, marker user and rendered artefacts deleted. Production `db/custom.db`
verified byte-identical before and after: sha256 `0d304ee79ad3b06adb0b89542a8906bf706f85868ae56035b8c600e3f9083cdb`,
884 736 bytes, mtime `2026-09-11 16:33:12`, no `-wal`/`-shm`. Nothing in this project, and
no result in this document, is evidence of French fiscal compliance.*
