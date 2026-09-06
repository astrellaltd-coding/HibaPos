# ISCA conformity map — HibaPOS France

**Measured 2026-09-06 against the working tree at commit `c6b4aaa` plus Batch 3.7's
L-53 change** (line numbers are those of the tree after that change). Companion to
`docs/conformite-isca-recherche.md`, which holds the sourced research; this file
maps each requirement onto the code that implements it.

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
**BOI-CF-COM-20-60** (01/10/2025) for the control procedure, **CGI art.
286-I-3° bis** for the obligation.

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
| 1.1 | Corrections by +/−, never by editing the original | `src/lib/services/refund.ts:100-215` (`processRefund`); `prisma/schema.prisma:465` (`Refund`) | A refund is a **separate `Refund` row** with its own `REMBOURSEMENT` / `ANNULATION` journal event (`refund.ts:193`). Order amounts, items and payments are never edited. `grep` of every `update`/`delete` on `Order`, `Receipt`, `ZReport`, `FiscalEvent`, `MonthlyClose`, `AnnualClose`, `FiscalArchive` across `src/` (tests excluded) finds **no delete path at all**, and only these updates: the `fiscalEventId` back-link written once at creation (`checkout.ts:298`, `reports.ts:259`, `fiscal.ts:524`, `:612`); `Order.status → REFUNDED` + `refundedAt` on a full refund (`refund.ts:157`); `Receipt.reprintCount` on a reprint (`reprint/route.ts:35`). | **fact**, with one point for a professional: the status flag on a fully refunded order is written onto the original row. Amounts are untouched; whether a status flag counts as « modification directe des données d'origine » is not addressed by any source found. **? (V-08)** |
| 1.2 | Proof that data has not changed since recording — chaining | `src/lib/fiscal.ts:69-81` (`computeEventHash`: SHA-256 over `previousHash \| sequence \| type \| timestamp \| dataJson`); `src/lib/services/fiscal.ts:57-93` (`appendFiscalEvent`, inside the caller's transaction); `src/lib/services/sequence.ts:79-92` (gapless `sequence` from the `FiscalCounter` singleton); `src/lib/fiscal.ts:34-67` (`canonicalize`: sorted keys, Dates as instants — C-04) | Every fiscal event is hash-chained to its predecessor. Verified on production read-only 2026-09-06: 2 events, chain `ok`. Verified on a scratch copy after a checkout and an archive: 4 events, `ok`. | **fact** |
| 1.3 | Same, for the period closes | `src/lib/fiscal.ts:83-93` (`computeCloseHash`); `src/lib/services/fiscal.ts:438-527` (`closeMonth`), `:538-615` (`closeYear`); `prisma/schema.prisma:672`, `:710` | Monthly and annual closes each form their own chain, keyed by period; sealed in order (M-01, `fiscal.ts:352`), only after the period has ended (L-25, `:382`), only with no till open (L-27, `:419`). **Zero closes have ever been sealed on production.** | **fact** |
| 1.4 | The chain is **unkeyed** | `src/lib/fiscal.ts:77` | No secret, no signature, no external anchor. Anyone with write access to `custom.db` can recompute the whole chain and `GET /api/fiscal/verify` reports `ok`. BOFiP's example is « à clé privée »; chaining is named as an alternative. | **? unknown — V-01** (research question (d): ⏳ pending) |
| 1.5 | **What the chain covers** | `src/lib/services/sale-journal.ts:51-63` (`buildVentePayload`); `reports.ts:232-256` (`CLOTURE_Z` payload); `refund.ts:194-212` | The hash covers the **event payload**, which is a summary: a `VENTE` carries `orderNumber`, `total`, `subtotal`, `vatTotal`, `discountTotal`, `discountApprovedById`, `itemCount`, `orderType`, `payments`, `cashierId` — **not the order lines** (product, quantity, unit price, VAT rate per line) and **not the receipt text**. So an `OrderItem` row or a `Receipt.content` edited directly in SQLite, leaving totals unchanged, breaks no hash. The annual archive's checksum covers those rows, but only as they stood at archive time (§4.4). | **⚠ scope of the chain — recorded under V-01.** No source found says what the empreinte must cover. |
| 1.6 | Restore and backup deletion leave a trace | `src/lib/services/backup.ts:737` (`RESTAURATION`), `:876`, `:921` (`SUPPRESSION_SAUVEGARDE`), `:684` (`rewound`) | A restore replaces the whole database and is journalled **in the restored chain**; it can rewind the counters, and says so in the event. Backup deletion is journalled before the files go (C-22). | **fact** — and a professional should note that a restore is, by construction, a way to make the journal older. |
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
| 3.1 | **Clôture journalière** | `src/lib/services/reports.ts:150-262` (`generateZReport`); `:176-180` (one Z per shift); `:215` (shift → `CLOSED`); `:226-256` (`CLOTURE_Z` event) | The Z seals a **shift** (`Shift`, `schema.prisma:274`), and a shift is opened and closed by the operator with **no reference to a calendar day** anywhere (`shifts/route.ts:49-55` opens one; nothing keys it to a date, nothing prompts a close, nothing records a day that ended without one). `reports.ts:226` calls this seal the « clôture journalière ». **Measured on production (test trading):** shift 1 ran 2026-07-29 → 08-21, shift 2 08-21 → 08-28, shift 3 opened 08-28 and is still open with orders on 08-28, 08-29 and 09-01. So **Z #2 covers five calendar days of trading (08-21, 23, 24, 27, 28)** under one "daily" close. | **⚠ gap — L-54.** Whether a per-shift Z is accepted as the daily close, and whether « prévoir » means *provide* or *ensure*: research question (e) ⏳ pending. |
| 3.2 | Clôture mensuelle | `fiscal.ts:438-527`; `prisma/schema.prisma:672` | Calendar-keyed (`YYYY-MM`, local-time bounds from `src/lib/period.ts`), sealed in sequence, only once ended, only with no till open. Contains sales, count, VAT, per-tender totals, discounts, refunds, cash movements, VAT breakdown, top products, give-aways. | **fact** |
| 3.3 | Clôture annuelle (exercice) | `fiscal.ts:538-615`; `schema.prisma:710` | Same rules, keyed `YYYY`. Calendar year only — no fiscal-year offset exists in the code (the notice at `fiscal.ts:653` mentions « 7 si exercice décalé » but nothing implements a non-calendar exercice). Does **not** require the twelve months to be sealed first (documented, `fiscal.ts:530-536`). | **fact**; the "exercice décalé" wording is aspirational. |
| 3.4 | The three closes are cumulative — a period close equals the sum of its Z reports | `src/lib/services/aggregate.ts` (one aggregation for all callers, Batch 3.2); `report-agreement.test.ts` | Z, monthly and annual closes are all computed by the same function; Batch 3.2's rule is enforced by test. A refund or cash movement belongs to the period that **paid** it (DD-10, DD-21). | **fact** |
| 3.5 | **Perpetual total** | `prisma/schema.prisma:659` (`GrandTotal`); `fiscal.ts:109-127` (`incrementGrandTotal`, on every sale), `:130-136` (`addRefundToGrandTotal`, tracked separately, never decrements sales) | A live singleton, never reset, incremented inside the checkout transaction. **It is not written into any close**: the Z, the monthly and the annual close payloads carry the period's totals only (`reports.ts:232-256`; `fiscal.ts:260-292` `PeriodAgg`), and `GrandTotal` is snapshotted **only into the annual archive** (`fiscal.ts:714`). Whether BOFiP's « cumul perpétuel » must be *recorded at each close* or merely *maintained* is what decides this row. | **? unknown — recorded under V-08.** Research question (e) ⏳ may settle the wording. |
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
| 4.4 | Content | `fiscal.ts:677-699` | `fiscalEvents` (by timestamp in the year), `orders` (by `createdAt`, with items, payments, refunds, receipt, cashier, shift number), `zReports`, `monthlyCloses`, `annualClose` (if sealed), `grandTotalSnapshot`, `software` (L-53), a French `notice`. **Not present as rows:** `CashMovement` (its data reaches the archive only through the `MOUVEMENT_CAISSE` events, which carry every field but the row id), `Shift` rows, and a refund **paid in year N+1 for a year-N order**, which appears in no `orders` section (year N's archive predates it; year N+1's has no such order) — only as its `REMBOURSEMENT` event. | **⚠ L-55** (new, LOW): the archive relies on the journal for cash movements and cross-year refunds and has no row-level section for either. |
| 4.5 | Restitution in the administration's format | — | The schema is bespoke (`format: "hibapos-fiscal-archive", version: 3`). No exporter to any administration-defined format exists, because none was found to exist. | **⚠ gap — L-52.** Research question (b) ⏳ pending: is the format published? |
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

---

## 7. The éditeur — established in Tunisia

| # | Point | Source | Status |
|---|---|---|---|
| 7.1 | Can a third-country éditeur with no French, EU or EEA establishment issue the attestation? | BOI-TVA-DECLA-30-10-30 § 365: « un éditeur établi à l'étranger », in French or with a certified translation. Never says « pays tiers ». | **? unknown — V-10.** Research question (c) ⏳ pending. |
| 7.2 | Does the attestation route survive 1 January 2027 (CIBS recodification, ordonnance 2026-671)? | CGI art. 1770 duodecies (2027 version) and LPF art. L. 80 O refer only to « le certificat ». The CIBS articles L. 216-40 / L. 216-48 themselves were not retrieved in the first pass. | **? unknown — V-10.** Research question (a) ⏳ pending. **This decides whether self-attestation is durable or a bridge.** |
| 7.3 | The éditeur's exposure | art. 441-7 code pénal (1 yr / €15 000, raised to 3 yrs / €45 000 for prejudice to the Trésor); CGI art. 1770 undecies; BOFiP's carve-out « non modifiés par un tiers » | Research question (g) ⏳ pending. |

---

## 8. Fonctionnalités couvertes / exclues — a draft from the code

*For the attestation's volet 1. Draft wording is research question (f) ⏳; the
list below is what the code does, which is what the section must not exceed.*

**Covered (fonctionnalités de caisse / encaissement présentes dans le code):**
prise de commande (sur place, à emporter, livraison avec fiche client);
encaissement (espèces, carte, titre-restaurant, « offert »); remises avec
approbation; tickets (instantané texte immuable, réimpression tracée); remboursements
partiels et totaux (contre-opérations tracées); mouvements de caisse; ouverture et
clôture de caisse avec rapport Z scellé; clôtures mensuelle et annuelle scellées et
chaînées; journal fiscal chaîné (JFP); total perpétuel; mode FACTICE; archive
annuelle au format ouvert avec condensat; sauvegardes chiffrées; vérification
d'intégrité; identification du logiciel et de sa version.

**Not present in the code, therefore to be excluded explicitly:** facturation
(aucune facture n'est émise — tickets uniquement); comptabilité et export
comptable (FEC ou autre); gestion des stocks; commandes avant paiement, tickets
cuisine, service à table (le plan de salle a été retiré, DD-09); vente en ligne;
multi-caisses ou multi-établissements; export du journal entre deux dates; rapport
Z imprimé; **restitution au format défini par l'administration (L-52)**; clôture
journalière calée sur le jour calendaire (L-54, tant que non tranché).

---

## 9. Gaps and unknowns — the register this map produces

| ID | Where | What | Owner |
|---|---|---|---|
| **L-52** | 4.5 | No exporter to the administration's restitution format; the format itself not found. | Batch 3.7 — only if research (b) finds the target ⏳ |
| **L-53** | 5.1 | Software stated its version nowhere. | **Batch 3.7 — fixed** |
| **L-54** | 3.1 | Daily close is per shift; Z #2 on production spans five calendar days. | Batch 3.7 — research (e) decides ⏳ |
| **L-55** (new) | 4.4 | Archive has no row-level section for cash movements or for refunds paid after the order's year; both reach it only through journal events. | recorded in `REMEDIATION_PLAN.md`, LOW |
| **L-56** (new) | 4.6 | Archive notice claims « date certaine ». | recorded in `REMEDIATION_PLAN.md`, LOW |
| **V-01** | 1.4, 1.5, 2.9 | Unkeyed chain; chain covers the event payload, not the detailed rows. | external ⏳ (d) |
| **V-03** | 6.1 | Anything further required on a ticket. | external |
| **V-08** | 1.1, 3.5 | Status flag on a refunded order; perpetual total not recorded at each close. | external ⏳ (e) |
| **V-10** | 7.1, 7.2 | Third-country éditeur; 2027 recodification. | external ⏳ (a), (c) |
| **V-13** | 2.6 | Automatic drawer kick not journalled. | external |
| — | 2.7 | `SESSION_*` event types declared, never written. | documentation truth; noted here |
| — | 3.3 | « exercice décalé » in the notice; only calendar years exist. | documentation truth; noted here |
| — | 3.7, 4.1 | No journal export between dates; no printed Z; archive generation is manual. | operator process / unknown requirement |
