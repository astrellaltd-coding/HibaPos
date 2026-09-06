# ISCA conformity map — HibaPOS France

**Measured 2026-09-06, and RE-MEASURED the same day against commit `beabccd`**, which
is the tree after Batches 3.7, 3.8 and 3.9. Line numbers are that tree's.
**Research-dependent cells were filled from the second research pass**
(`docs/conformite-isca-recherche.md` § 9).

> **What changed between the two measurements, so a reader who saw the first
> version is not misled.** Three of this map's own gaps were closed by the
> batches that followed it: the software now states its **version** (L-53), a
> sealed **`Clôture du jour`** exists on a trading-day clock distinct from the
> caisse Z (L-54, § 3.1), and every close records the **perpetual total** BOFiP
> § 170 requires (L-57, § 3.5). The chain can now optionally be **keyed**
> (§ 1.4), which is the operator's own choice and answers no legal question.
> **L-52 is unchanged and still has no target.**

Companion to `docs/conformite-isca-recherche.md`, which holds the sourced
research; this file maps each requirement onto the code that implements it.
**Every `file:line` below was re-measured at `beabccd`.** Where a line number
and a symbol name disagree after a later edit, the symbol name is the one to
trust.

> ## This is evidence, not a verdict
>
> Nothing here concludes that HibaPOS complies with anything. Safety rule 13 of
> `REMEDIATION_PLAN.md` forbids a compliance claim on automated evidence, and the
> éditeur who signs `docs/attestation-conformite.md` does so under **art. 441-7 du
> code pénal** — a map that overstates is worse than no map. Every row states
> **what the code does**, with a `file:line` that can be opened, and then names
> the gap or says **unknown** where no source settles the point. The intended
> reader is a French fiscal professional who should be reviewing facts rather
> than the source tree, and the éditeur writing the attestation's *fonctionnalités
> couvertes / exclues* honestly.

**How to read the rows.** *Requirement* quotes BOFiP verbatim (French) with its
source. *Code* names the implementing code by `file:line`. *Measured* says what
the code actually does, from reading it and from measurements on the production
database (read-only) and on a scratch copy. *Status* is one of:

| Mark | Meaning |
|---|---|
| **fact** | The code does this; the row says where. Not a claim that it is *sufficient*. |
| **⚠ gap** | Something the requirement names and the code does not do, or does differently. Has a finding ID. |
| **? unknown** | No official source found settles whether what the code does is accepted. Has a V- or question number. |

Legal sources are all in `docs/conformite-isca-recherche.md` with URLs; the short
names used here: **BOI-TVA-DECLA-30-10-30** (25/03/2026) for the four
conditions, **BOI-LETTRE-000242** (25/03/2026) for the attestation model,
**BOI-CF-COM-20-60** (25/03/2026) for the control procedure, **CGI art.
286-I-3° bis** for the obligation — which becomes **CIBS art. L. 216-40** on
1 January 2027 (research § 9.1). BOFiP paragraph numbers (§) are those of the
25/03/2026 versions.

---

## 0. Perimeter — what the software is, measured from the code

| What | Code | Measured |
|---|---|---|
| Point of sale for one restaurant, one till, Next.js + SQLite, runs on a Windows all-in-one bound to `127.0.0.1` | `package.json:2-3`, `src/lib/paths.ts:40-58`, `src/lib/db.ts` | Single process, single database file `db/custom.db`. **Not yet installed at the restaurant** (plan → *Hardware-dependent validation*). |
| Order types | `prisma/schema.prisma:367-371` | `DINE_IN`, `TAKEAWAY`, `LIVRAISON` (delivery requires a customer name, phone, address). |
| Tenders | `prisma/schema.prisma:441-446` | `CASH`, `CARD`, `VOUCHER`, `OFFERT` (give-away, DD-14 — zero-total sale). No invoice (*facture*) is ever issued; the software produces *tickets* only. |
| An order exists only once paid | `prisma/schema.prisma:350-365` (`OrderStatus` = `COMPLETED`, `REFUNDED`) | The cart is client-side; nothing unpaid reaches the database. There is no pre-payment order, no kitchen ticket, no table service, no stock. |
| Roles | `src/lib/auth.ts`, `src/lib/api-handler.ts:98` | Two accounts: `manager` (MANAGER) and `admin` (SUPER_ADMIN). `CASHIER` was removed in Batch 4.4b. |
| Modules, by screen | `src/components/shared/nav-config.ts` | POS, orders, shifts (caisse), customers, reports, fiscal (JFP), settings, backups, audit, logs, users. |

**What a control checks** (BOI-CF-COM-20-60): possession of a certificate or
attestation *for each software and each version held*, matching the versions in
use; « constatations matérielles » only — agents do not test the software and
cannot examine the accounts in that procedure. Consequence: **§5 (version)** is
the row that decides a control; §1–§4 decide the attestation's truthfulness.

---

## 1. Inaltérabilité

> BOI-TVA-DECLA-30-10-30 — corrections « par des opérations de "plus" et de
> "moins" et non par modification directe des données d'origine enregistrées »;
> proof that data has not changed since recording « (empreinte numérique à clé
> privée, chaînage, etc.) ».

| # | Requirement | Code | Measured | Status |
|---|---|---|---|---|
| 1.1 | Corrections by +/−, never by editing the original | `src/lib/services/refund.ts:88` (`processRefund`); `prisma/schema.prisma:465` (`Refund`) | A refund is a **separate `Refund` row** with its own `REMBOURSEMENT` / `ANNULATION` journal event (`refund.ts:193`, `processRefund` at `:88`). Order amounts, items and payments are never edited. `grep` of every `update`/`delete` on `Order`, `Receipt`, `ZReport`, `FiscalEvent`, `MonthlyClose`, `AnnualClose`, `FiscalArchive` across `src/` (tests excluded) finds **no delete path at all**, and only these updates: the `fiscalEventId` back-link written once at creation (`checkout.ts:298`, `reports.ts:288`, `fiscal.ts:678`, `:864`, `:960`); `Order.status → REFUNDED` + `refundedAt` on a full refund (`refund.ts:157`); `Receipt.reprintCount` on a reprint (`reprint/route.ts:35`). | **fact**, with one point for a professional: the status flag on a fully refunded order is written onto the original row. Amounts are untouched; whether a status flag counts as « modification directe des données d'origine » is not addressed by any source found. **? (V-08)** |
| 1.2 | Proof that data has not changed since recording — chaining | `src/lib/fiscal.ts:86-98` (`computeEventHash`: SHA-256, or HMAC-SHA-256 when keyed, over `previousHash \| sequence \| type \| timestamp \| dataJson`); `src/lib/services/fiscal.ts:66-120` (`appendFiscalEvent`, inside the caller's transaction); `src/lib/services/sequence.ts:79` (gapless `sequence` from the `FiscalCounter` singleton); `src/lib/fiscal.ts:38-69` (`canonicalize`: sorted keys, Dates as instants — C-04) | Every fiscal event is hash-chained to its predecessor. Verified on production read-only 2026-09-06: 2 events, chain `ok`. Verified on a scratch copy after a checkout and an archive: 4 events, `ok`. | **fact** |
| 1.3 | Same, for the period closes | `src/lib/fiscal.ts:103-114` (`computeCloseHash`); `src/lib/services/fiscal.ts:598` (`closeDay`), `:764` (`closeMonth`), `:877` (`closeYear`); `prisma/schema.prisma:694`, `:732`, `:770` | **Three** close chains since Batch 3.8 — daily, monthly, annual — each keyed by period; sealed in order (M-01, `fiscal.ts:451`), only after the period has ended (L-25, `:481`), only with no till open (L-27, `:518`), and for the day only when no earlier trading day is unsealed (DD-23, `:556`). **Zero closes of any kind have ever been sealed on production.** | **fact** |
| 1.4 | The chain is **unkeyed on production, and can be keyed** | `src/lib/fiscal.ts:86-98` (`computeEventHash`), `:103-114` (`computeCloseHash`), `src/lib/fiscal-key.ts` | No secret, no signature, no external anchor. Anyone with write access to `custom.db` can recompute the whole chain and `GET /api/fiscal/verify` reports `ok`. BOFiP § 100 gives « empreinte numérique à clé privée, chaînage, etc. » and § 140 « chaînage des enregistrements ou de signature électronique »; no official source addresses a chain **without** a key either way. The LNE referential (private, rév. 1.7, Exigence 8) treats every acceptable chaining solution as **keyed (HMAC-SHA-256) or signed, with a key the assujetti cannot know**, and requires a restore to an earlier state to be « détectée ou rendue impossible ». **UPDATED (Batch 3.9, DD-25):** the fingerprint takes an optional key and becomes HMAC-SHA-256 with it; without one it is byte-for-byte what it always was, so the existing journal still verifies. **`FISCAL_CHAIN_KEY` is set on no machine**, so production is unkeyed today; arming it is Batch 8.0's step, and arming it over a journal that already holds unkeyed events is refused (`services/fiscal.ts:66-120`). | **? unknown — V-01**, **indicated against** for the unkeyed form by the private referential (research § 9.4). **Building the keyed mode answers nothing legally** — no official source addresses either form. It is the operator's decision, taken on 2026-09-06 with the limit stated: on a till where the operator is administrator, a secret in a file on that machine is findable. |
| 1.5 | **What the chain covers** | `src/lib/services/sale-journal.ts:51-63` (`buildVentePayload`); `reports.ts:247-271` (`CLOTURE_Z` payload); `refund.ts:194-212` | The hash covers the **event payload**, which is a summary: a `VENTE` carries `orderNumber`, `total`, `subtotal`, `vatTotal`, `discountTotal`, `discountApprovedById`, `itemCount`, `orderType`, `payments`, `cashierId` — **not the order lines** (product, quantity, unit price, VAT rate per line) and **not the receipt text**. So an `OrderItem` row or a `Receipt.content` edited directly in SQLite, leaving totals unchanged, breaks no hash. The annual archive's checksum covers those rows, but only as they stood at archive time (§4.4). | **⚠ scope of the chain — recorded under V-01.** No source found says what the empreinte must cover. |
| 1.6 | Restore and backup deletion leave a trace | `src/lib/services/backup.ts:737` (`RESTAURATION`), `:876`, `:921` (`SUPPRESSION_SAUVEGARDE`), `:684` (`rewound`) | A restore replaces the whole database and is journalled **in the restored chain**; it can rewind the counters, and says so in the event. Backup deletion is journalled before the files go (C-22). **Only a restore made through the application is journalled**: a copy of an older `custom.db` put back by hand, on a machine where the operator has administrator rights, is detected by nothing — the chain in the older file verifies `ok`. | **fact** — and the LNE referential (private) asks that exactly that restore be « détectée ou rendue impossible » (research § 9.4); recorded under V-01. **Keying does not close this**: an older database restored by hand is internally consistent under whatever key wrote it, so Batch 3.9 changes nothing here. What does bite is the day close's **printed integrity code** (§ 3.1), because paper filed with the books is outside the database a forger controls. |
| 1.7 | Time source | `src/lib/services/fiscal.ts:67` (`new Date()`), `reports.ts:216`, `checkout.ts` | Every timestamp is the till's system clock. Nothing attests time; the ISCA texts found do not require it. | **fact**, no requirement found. |

---

## 2. Sécurisation

> BOI-TVA-DECLA-30-10-30 — the software must « empêcher leur suppression ou
> modification sans laisser de trace », by « tout procédé technique fiable […] une
> technique de chaînage des enregistrements ou de signature électronique des
> données ».

| # | Requirement | Code | Measured | Status |
|---|---|---|---|---|
| 2.1 | No in-application deletion or modification of recorded data | see 1.1 | No delete path; updates limited to back-links, a status flag and a reprint counter. | **fact** |
| 2.2 | The journal itself is never pruned | `src/lib/services/log-retention.ts:10-12`; `src/app/api/shifts/[id]/close/route.ts:69-71` | Housekeeping at each Z close prunes **bounded tables only**; `FiscalEvent` is excluded by design. | **fact** |
| 2.3 | The **audit log** (a separate, unchained table) | `prisma/schema.prisma:579` (`AuditLog`); `log-retention.ts:36` (`DEFAULT_AUDIT_LOG_DAYS = 0` = keep forever), `:88-93` (`auditLog.deleteMany` when `AUDIT_LOG_RETENTION_DAYS` > 0) | Every sale, refund, close, login, lock, settings change writes an `AuditLog` row. It is **not hash-chained** and **is prunable by environment variable** (deliberately `0` today — *Open Threads → A*). The fiscal claims rest on `FiscalEvent`, not on this table. | **fact**; note for the professional that the two logs differ in protection. |
| 2.4 | Operators identified on each event | `prisma/schema.prisma:643` (`userId`), every `appendFiscalEvent` call | `userId` on every event; approver recorded on refunds and large discounts (C-13, Batch 3.5). | **fact** |
| 2.5 | Access control | `src/lib/auth.ts:29` (scrypt N=2¹⁷), `:11` (12 h sessions), `src/lib/api-handler.ts:98` (`withAuth` role gates), Batch 4.4c step-up (`refund/route.ts:90`) | Six-digit PIN, scrypt-hashed; role gates on every fiscal route (`close-year`, `archive` POST = SUPER_ADMIN; the rest MANAGER+); a fresh PIN is required for every refund and for discounts above the threshold; lockout after five failures. Server bound to `127.0.0.1` (DD-06). | **fact** |
| 2.6 | Traced events beyond sales | `reprint/route.ts:50` (`REIMPRESSION`), `fiscal/drawer/route.ts:17` (`OUVERTURE_TIROIR`), `cash-movement.ts:208` (`MOUVEMENT_CAISSE`) | Reprints, **manual** drawer opens and cash movements are journalled. The **automatic drawer kick on a cash tender is not** (Batch 1.3's reasoning: the `VENTE` already records the cash payment). | **? unknown — V-13** |
| 2.7 | Session events | `src/lib/fiscal.ts:21-23` declares `SESSION_OPEN`, `SESSION_CLOSE`, `SESSION_LOCK` | **No code writes them.** Logins, locks and unlocks go to `AuditLog` (`auth/lock/route.ts:15`, `unlock/route.ts:130`), not to the journal. The type union overstates what the journal contains; no source found requires session events in the JFP. | **fact** (an enumeration wider than the journal), recorded for documentation truth. |
| 2.8 | FACTICE / simulation mode | `src/lib/services/settings.ts:23`, `src/lib/validation.ts:234`; `receipt.ts:41-47` (ticket stamp); `factice` column on every event (`schema.prisma:644`) | When on, every ticket is stamped `*** FACTICE — SIMULATION *** / TICKET NON VALABLE` and every event carries `factice: true`. **Off on production today**, so the 20 development orders read as genuine (Batch 8.0 / P-04 resets them before go-live). | **fact** |
| 2.9 | The database file itself | `src/lib/db.ts`, `db-pragmas.ts` | A plain SQLite file, writable by any process with file access, on a OneDrive-synced path until DD-02's move. No OS-level protection is claimed anywhere. | **fact**; belongs to V-01's question. |

---

## 3. Conservation

> BOI-TVA-DECLA-30-10-30 — the software « doit prévoir obligatoirement une
> clôture journalière et une clôture mensuelle et annuelle (ou par exercice)
> […] Ces trois échéances sont cumulatives et impératives », with the period's
> grand total and a perpetual total. Retention six years (LPF art. L. 102 B).

| # | Requirement | Code | Measured | Status |
|---|---|---|---|---|
| 3.1 | **Clôture journalière** — **BUILT, Batch 3.8** | `src/lib/services/reports.ts:150-277` (`generateZReport`); `:176-180` (one Z per shift); `:215` (shift → `CLOSED`); `:226-271` (`CLOTURE_Z` event) | The Z seals a **shift** (`Shift`, `schema.prisma:274`), and a shift is opened and closed by the operator with **no reference to a calendar day** anywhere (`shifts/route.ts:49-55` opens one; nothing keys it to a date, nothing prompts a close, nothing records a day that ended without one). `reports.ts:226` calls this seal the « clôture journalière ». **Measured on production (test trading):** shift 1 ran 2026-07-29 → 08-21, shift 2 08-21 → 08-28, shift 3 opened 08-28 and is still open with orders on 08-28, 08-29 and 09-01. So **Z #2 covers five calendar days of trading (08-21, 23, 24, 27, 28)** under one "daily" close. **Research § 9.5**: BOFiP § 170 says « prévoir » — *provide* — and neither BOFiP, the DGFiP FAQ nor the LNE referential defines « journée », mentions midnight, or accepts or rejects a per-shift close; LNE (private) accepts user-triggered closes if the user « doit être informé … de la responsabilité qui lui incombe ». **Batch 3.7 did what that leaves to the software**: the comment at `reports.ts:226-241` no longer calls the seal a daily close; the shifts screen states the operator's responsibility and turns amber once the open till has crossed local midnight (`src/lib/period.ts:74` `openedOnEarlierLocalDay`, `shifts-view.tsx:399-416`); nothing is refused. **THEN BUILT (Batch 3.8, DD-23 / DD-24).** A sealed, chained **`DailyClose`** now exists beside the monthly and annual ones — `prisma/schema.prisma:694`, `services/fiscal.ts:598-704` (`closeDay`), a `CLOTURE_J` journal event, and its own chain in `GET /api/fiscal/verify`. It runs on a **trading-day clock**: the day starts and ends at an hour the operator sets (`businessDayCutoffHour`, default 05:00), so a service finishing at 01:30 stays in the day it started (`src/lib/period.ts:63`, `:75`). **The month and the exercice run on the same clock** (DD-24, `period.ts:84`), so a ticket rung at 01:00 on 1 July sits in Friday 30 June **and** in June, and no two sealed documents disagree. The close prints a slip carrying its own integrity code, to be filed with the books (`services/day-close-ticket.ts`). Guards: one per day, only once ended, only with no caisse open, never before a day already sealed, and never skipping a day that traded — but a day with no trading **may** be skipped, because a restaurant closed on Mondays must not be blocked (`services/fiscal.ts:556`). | **fact — L-54 CLOSED.** Two things stay open and neither is code: whether a per-shift Z would have been *accepted* is settled by no source found (research § 9.5), and **the till still refuses no sale at any hour**, which the operator was offered and declined (DD-23). |
| 3.2 | Clôture mensuelle | `fiscal.ts:438-527`; `prisma/schema.prisma:672` | Calendar-keyed (`YYYY-MM`, local-time bounds from `src/lib/period.ts`), sealed in sequence, only once ended, only with no till open. Contains sales, count, VAT, per-tender totals, discounts, refunds, cash movements, VAT breakdown, top products, give-aways. | **fact** |
| 3.3 | Clôture annuelle (exercice) | `fiscal.ts:538-615`; `schema.prisma:710` | Same rules, keyed `YYYY`. Calendar year only — no fiscal-year offset exists in the code (the notice at `fiscal.ts:653` mentions « 7 si exercice décalé » but nothing implements a non-calendar exercice). Does **not** require the twelve months to be sealed first (documented, `fiscal.ts:530-536`). | **fact**; the "exercice décalé" wording is aspirational. |
| 3.4 | The three closes are cumulative — a period close equals the sum of its Z reports | `src/lib/services/aggregate.ts` (one aggregation for all callers, Batch 3.2); `report-agreement.test.ts` | Z, monthly and annual closes are all computed by the same function; Batch 3.2's rule is enforced by test. A refund or cash movement belongs to the period that **paid** it (DD-10, DD-21). | **fact** |
| 3.5 | **Perpetual total** — **RECORDED AT EVERY CLOSE since Batch 3.8** | `prisma/schema.prisma:659` (`GrandTotal`); `fiscal.ts:109-127` (`incrementGrandTotal`, on every sale), `:130-136` (`addRefundToGrandTotal`, tracked separately, never decrements sales) | A live singleton, never reset, incremented inside the checkout transaction. **It is not written into any close**: the Z, the monthly and the annual close payloads carry the period's totals only (`reports.ts:247-271`; `fiscal.ts:260-292` `PeriodAgg`), and `GrandTotal` is snapshotted **only into the annual archive** (`fiscal.ts:714`). **BOFiP § 170 decides this row (research § 9.5)**: « Pour chaque clôture, des données cumulatives et récapitulatives, intègres et inaltérables, doivent être **calculées et enregistrées** par le logiciel ou système de caisse, comme le cumul du grand total de la période et **le total perpétuel** pour la période. » LNE Exigence 7 (private) says the same: « Pour chaque clôture, le système d'encaissement doit enregistrer et sécuriser le total cumulatif de la période et le total perpétuel ». **FIXED (Batch 3.8, L-57).** `GrandTotal`'s figures at the instant of sealing are now written into the Z report, the day close, the monthly close and the exercice — in the row (`perpetualSalesTotal`, `perpetualTotalsJson`) **and** inside the hashed payload, so the chain covers them (`services/fiscal.ts:199` `perpetualSnapshot`, and the four seal sites). Rows sealed before the fix carry **null**, deliberately, because 0 would assert that the business had never taken a euro. | **fact — L-57 CLOSED.** Verified on a scratch copy of production: Z #3 carries 5 480 while Z #1 and #2 carry null. |
| 3.6 | Six-year retention | `fiscal.ts:653` (the notice states it); no deletion path (1.1, 2.2); `backup.ts:157` (AES-256-GCM backups), `close/route.ts:51` (a backup at every Z close) | Retention is achieved by **not deleting**, and by encrypted backups. Two facts a professional should weigh: `BACKUP_LOCATION` is unset, so backups land on the same disk (*Open Threads → A*); and on the live install **no backup is restorable through the application** (L-46: 0 `Backup` rows against 9 files). | **fact**, with the custody question left to the operator (V-09, V-12). |
| 3.7 | Access to the period's data by an inspector | `src/app/api/fiscal/events/route.ts:7-20` (newest-first, capped at 500), `fiscal/closes`, `reports/z` (last 100), `fiscal/archive/[year]` | The journal can be **read** on screen and through the API, capped; the only **export** of the journal is the annual archive (§4). There is no "export the journal between two dates" and no printable Z document (the Z exists as a database row and an on-screen summary; nothing renders it to paper). | **fact**; whether an inspection under LPF art. L. 47 A needs more than the annual archive is part of L-52's question. |

---

## 4. Archivage

> BOI-TVA-DECLA-30-10-30 — periodicity « au maximum annuelle ou par exercice »;
> « Les données d'archivage doivent être enregistrées dans un format ouvert ».
> CGI art. 286-I-3° bis, al. 2 (loi 2026-534, art. 87, in force 27/06/2026): the
> archived data « sont restituées dans un format répondant aux normes établies
> par l'administration ».

| # | Requirement | Code | Measured | Status |
|---|---|---|---|---|
| 4.1 | Periodicity at most annual | `fiscal.ts:674-741` (`buildAnnualArchive`); `schema.prisma:737` (`FiscalArchive.year` unique) | One archive per calendar year, **generated on demand by a SUPER_ADMIN** from the fiscal screen (`fiscal-view.tsx:414-450`). Nothing schedules it or reminds anyone; a year without an operator action has no archive. **Zero archives exist on production.** | **fact**; the "nothing enforces it" half is an operator-process point (V-12). |
| 4.2 | Open format | `fiscal.ts:721-726` | UTF-8 JSON, pretty-printed, beside a standard `sha256sum` manifest (`<hash>  <filename>`). Verified on a scratch copy: `sha256sum -c` → `OK`. | **fact** |
| 4.3 | Integrity of the archive | `fiscal.ts:722-723` (SHA-256 of the exact bytes); `:744-770` (`recordAnnualArchive`: row + `ARCHIVE_GENEREE` event carrying the checksum); `archive/route.ts:37-75` (regeneration refused unless byte-identical) | The checksum is reproducible by a third party with a standard tool and is recorded in the chained journal. The file is written **before** the row (M-02). | **fact** |
| 4.4 | Content | `fiscal.ts:677-699` | `fiscalEvents` (by timestamp in the year), `orders` (by `createdAt`, with items, payments, refunds, receipt, cashier, shift number), `zReports`, `monthlyCloses`, `annualClose` (if sealed), `dailyCloses` (Batch 3.8), `grandTotalSnapshot`, `software` (L-53), a French `notice`. Schema version **4**. **Not present as rows:** `CashMovement` (its data reaches the archive only through the `MOUVEMENT_CAISSE` events, which carry every field but the row id), `Shift` rows, and a refund **paid in year N+1 for a year-N order**, which appears in no `orders` section (year N's archive predates it; year N+1's has no such order) — only as its `REMBOURSEMENT` event. | **⚠ L-55** (new, LOW): the archive relies on the journal for cash movements and cross-year refunds and has no row-level section for either. |
| 4.5 | Restitution in the administration's format | — | The schema is bespoke (`format: "hibapos-fiscal-archive", version: 3`). No exporter to any administration-defined format exists, because none was found to exist. **Research § 9.2**: the obligation is in force since 27/06/2026 with **no instrument, no deadline and no suspensive condition**; the statute's intent (Sénat amdt 146 rect.) is « un format informatique standard » for export to the DGFiP; **no arrêté, décret, BOFiP paragraph or impots.gouv.fr notice defining it has been published** as of 2026-09-06, and BOI-TVA-DECLA-30-10-30 § 230 still says only « format ouvert » plus a French notice — which the archive has. | **⚠ gap — L-52, left open by Batch 3.7 with the search recorded**: there is no target to build to. Re-check BOFiP and Legifrance before every attestation; the obligation does not wait for the norm. |
| 4.6 | What the notice claims | `fiscal.ts:622-654` | The notice says the archive « fige les données […] et leur donne **date certaine** ». « Date certaine » is a legal term (art. 1377 code civil: registration, death, or an authentic act); a self-generated file timestamped by the till's clock does not confer it. The rest of the notice (open format, reproducible checksum, chaining, six years) states things the code does. | **⚠ L-56** (new, LOW): the notice overstates on one phrase; correct the wording. |

---

## 5. The attestation and the version — what a control turns on

> BOI-LETTRE-000242 — individual and nominative; the assujetti must hold the one
> « correspondant à la version du logiciel ou système de caisse qu'il utilise »;
> optional major-version root commitment. BOI-CF-COM-20-60 — the control verifies
> that correspondence.

| # | Requirement | Code | Measured | Status |
|---|---|---|---|---|
| 5.1 | The software states its version | `src/lib/version.ts:25-29` (`SOFTWARE_NAME`, `SOFTWARE_VERSION` = `0.2.1`, pinned to `package.json` by `version.test.ts`); `receipt.ts:129` (last line of every ticket: `HibaPOS France v0.2.1`); `fiscal.ts:626` (archive notice) and `:712` (`software` key); `fiscal/verify/route.ts:23` (API); `src/components/shared/software-identity.tsx` shown on the fiscal screen (`fiscal-view.tsx:251`) | **Before Batch 3.7: nowhere** — `package.json` said `0.2.1` and nothing in `src/` read it; the ticket named the restaurant only. **After:** ticket, archive, fiscal screen and API all state `HibaPOS France v0.2.1`, from one constant. Verified on a scratch copy: receipt #21's last line, the 2025 archive's `software` key and notice, `GET /api/fiscal/verify`. The liveness probe `GET /api` stays mute on purpose. | **fact — L-53 fixed in Batch 3.7.** Tickets and archives created **before** this change carry no version; they are immutable and are not re-rendered. |
| 5.2 | Version-root commitment | `docs/attestation-conformite.md:57-63` | The template commits to root `0` with subdivisions `0.x` for minor versions. **Nothing in the code enforces or reads that policy** — a release that bumped `1.0.0` would be a new major version needing a new attestation, and only a person would notice. | **fact**; a process point. |
| 5.3 | Individual, nominative, two volets, French | `docs/attestation-conformite.md` | The template follows the BOFiP model's structure. Its ISCA section (« Mise en œuvre… ») restates §1–§4 above **without the gaps** — it must be rewritten against this map before signature. | **⚠** — the attestation's own text is where L-52, L-54, V-01, V-13 and L-55/L-56 have to be reflected or excluded. |

---

## 6. The ticket

| # | What the ticket carries | Code | Status |
|---|---|---|---|
| 6.1 | Restaurant name, address, phone, SIRET, TVA number; ticket number and time; cashier and caisse number; order type and table; lines with options; subtotal, discount, **per-rate VAT with HT base**, total VAT, total; payments with tendered/change; article count; footer; **software and version**; FACTICE stamp when on | `receipt.ts:34-131` | **fact.** V-03 asked what a compliant receipt must contain; per-rate VAT and the TVA number were added in Batch 3.6 on the operator's own determination, the software identification in 3.7. Whether anything further is required (a per-ticket hash or signature is what NF525-certified software prints; the law does not name one) — **? unknown, V-03**. |
| 6.2 | **The line-by-line data BOFiP § 50 puts in scope** — as rendered by research § 9.6, to be re-read verbatim: numéro du justificatif; date année-mois-jour-heure-minute; numéro de la caisse; montant TTC; per line libellé, quantité, prix unitaire, total HT de la ligne, taux de TVA; mode de règlement; traces de modifications et corrections | `prisma/schema.prisma:373` (`Order.number`, `createdAt`, `total`), `:411-429` (`OrderItem`: `productName`, `unitPrice` TTC, `quantity`, `lineTotal` TTC, `vatRate`), `:448` (`Payment.method`), `:465` (`Refund`); `receipt.ts:58` | Present: ticket number (gapless, `sequence.ts:31`), timestamp to the millisecond, TTC total, per-line label, quantity, unit price and **snapshotted VAT rate**, tender per payment, corrections as `Refund` rows and journal events. **Two nuances**: the ticket's « Caisse #N » is the **shift** number (`order.shift.number` — 3 on production, on a single-till install), not a till identifier; and **no per-line HT total is stored** — `lineTotal` is TTC and the HT figure is derived from `vatRate` when the VAT block is rendered. | **⚠ L-58 (new, LOW)**: a label that reads as a third till, and a derived rather than stored line HT. Everything else on the list is stored as such. |

---

## 7. The éditeur — established in Tunisia

| # | Point | Source | Status |
|---|---|---|---|
| 7.1 | Can a third-country éditeur with no French, EU or EEA establishment issue the attestation? | BOI-TVA-DECLA-30-10-30 § 365 (« un éditeur établi à l'étranger », French or certified translation), § 370 (signed by the éditeur or its legal representative), § 400 (sanctions « également aux éditeurs étrangers »), § 410 (the administration may verify with the éditeur); the EU condition of § 320 attaches to the *accreditation body* and exists only in the certificate route; no text requires a French or EU establishment or a représentant fiscal (research § 9.3). | **SETTLED that the text permits it; ? unknown as to practice — V-10.** No source distinguishes EU from third-country éditeurs and none documents a control with one. |
| 7.2 | Does the attestation route survive 1 January 2027 (CIBS recodification, ordonnance 2026-671)? | **The CIBS article was retrieved (research § 9.1)**: L. 216-48 → **L. 216-40** are the same article (official concordance table); its text says « **Un décret détermine les caractéristiques** … » and names neither « attestation » nor « certificat ». CGI 286 is abrogated on 1 Jan 2027; references stay valid to 30 June 2028; the 2027 sanction text speaks of « le certificat prévu en application de » L. 216-40, i.e. of the décret. **No décret has been published**, and BOFiP has said nothing since 25/03/2026. | **? unknown — V-10, and now a known unknown with a date**: the attestation route is valid to 31 Dec 2026; from 1 Jan 2027 it depends on an unpublished décret. Plan for both outcomes. |
| 7.3 | The éditeur's exposure | art. 441-7 code pénal, verbatim in research § 9.7 (1 yr / €15 000; 3 yrs / €45 000 « en vue de porter préjudice au Trésor public »); BOFiP § 300: the attestation « engage sa responsabilité sous réserve que les dispositifs techniques … ne sont pas modifiés par un tiers »; § 310: the last person who modifies a fiscal parameter of an open system becomes the « éditeur »; BOI-CF-COM-20-60 names « l'émetteur d'attestation individuelle » among those liable. | **SETTLED (texts); ? unknown (insurance and professional-body guidance)** — one 2017 law-firm note points to the licence and maintenance contract; nothing else found. |

---

## 8. Fonctionnalités couvertes / exclues — a draft from the code

*For the attestation's volet 1. The model's two lines (BOI-LETTRE-000242,
research § 9.6) are « Le périmètre couvert par cette attestation concerne les
fonctionnalités suivantes : » and « Les fonctionnalités suivantes ne sont pas
couvertes par cette attestation : », each « À adapter et à compléter selon le
cas », and the éditeur may attest « les fonctionnalités de caisse de ce
logiciel/système » rather than the whole software. BOFiP § 30/§ 40 define the
fiscal scope as the fonctionnalité de caisse — recording payments received, any
tender, from order-taking to payment — and no official source prescribes module
names. The list below is what the code does, which is what the section must not
exceed; the exclusions name what the software does not do and what this map
leaves open.*

**Covered (fonctionnalités de caisse / encaissement présentes dans le code):**
prise de commande (sur place, à emporter, livraison avec fiche client);
encaissement (espèces, carte, titre-restaurant, « offert »); remises avec
approbation; tickets (instantané texte immuable, réimpression tracée); remboursements
partiels et totaux (contre-opérations tracées); mouvements de caisse; ouverture et
clôture de caisse avec rapport Z scellé; **clôture du jour scellée sur journée
d'exploitation, avec ticket et code d'intégrité**; clôtures mensuelle et annuelle
scellées et chaînées; journal fiscal chaîné (JFP); total perpétuel; mode FACTICE; archive
annuelle au format ouvert avec condensat; sauvegardes chiffrées; vérification
d'intégrité; identification du logiciel et de sa version.

**Not present in the code, therefore to be excluded explicitly:** facturation
(aucune facture n'est émise — tickets uniquement); comptabilité et export
comptable (FEC ou autre); gestion des stocks; commandes avant paiement, tickets
cuisine, service à table (le plan de salle a été retiré, DD-09); vente en ligne;
multi-caisses ou multi-établissements; export du journal entre deux dates; rapport
Z imprimé; **restitution au format défini par l'administration (L-52)**; blocage de
la caisse en l'absence de clôture (proposé à l'opérateur et écarté, DD-23);
chaînage à clé (construit, **non armé** — voir § 1.4).

---

## 9. Gaps and unknowns — the register this map produces

| ID | Where | What | Owner |
|---|---|---|---|
| **L-52** | 4.5 | No exporter to the administration's restitution format; **the format is not published** (research § 9.2). | **Left open by Batch 3.7** — no target exists; the search is recorded. NO BATCH OWNS THIS until a text appears. |
| **L-53** | 5.1 | Software stated its version nowhere. | **Batch 3.7 — fixed** |
| **L-54** ✅ | 3.1 | Daily close was per shift; Z #2 on production spanned five calendar days. | **CLOSED by Batch 3.8**: a real `Clôture du jour` on a trading-day clock. Whether a per-shift Z would have been accepted is still settled by no source (§ 9.5) |
| **L-55** (new) | 4.4 | Archive has no row-level section for cash movements or for refunds paid after the order's year; both reach it only through journal events. | recorded in `REMEDIATION_PLAN.md`, LOW |
| **L-56** (new) | 4.6 | Archive notice claims « date certaine ». | recorded in `REMEDIATION_PLAN.md`, LOW |
| **L-57** ✅ | 3.5 | The perpetual total was recorded in no close, against BOFiP § 170. | **CLOSED by Batch 3.8**, before any real close existed |
| **L-58** (new) | 6.2 | Ticket's « Caisse #N » is the shift number; no stored per-line HT. | recorded in `REMEDIATION_PLAN.md`, LOW |
| **V-01** | 1.4, 1.5, 1.6, 2.9 | Chain covers the event payload, not the detailed rows; an out-of-app restore is undetected, **and keying does not change that**. Official sources silent on keyed or unkeyed; the LNE referential expects a key or signature (§ 9.4). **Batch 3.9 built the keyed mode as the operator's choice, which answers nothing legally.** | external |
| **V-03** | 6.1 | Anything further required on a ticket. | external |
| **V-08** | 1.1, 3.5 | Status flag on a refunded order; the perpetual total (now L-57). | external |
| **V-10** | 7.1, 7.2 | Third-country éditeur — **text permits, practice unknown**; 2027 — **depends on an unpublished décret** (§ 9.1, § 9.3). | external |
| **V-13** | 2.6 | Automatic drawer kick not journalled. | external |
| — | 2.7 | `SESSION_*` event types declared, never written. | documentation truth; noted here |
| — | 3.3 | « exercice décalé » in the notice; only calendar years exist. | documentation truth; noted here |
| — | 3.7, 4.1 | No journal export between dates; no printed Z; archive generation is manual. | operator process / unknown requirement |
