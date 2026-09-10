# HibaPOS France — Completed Work

Companion to `REMEDIATION_PLAN.md`. **The plan holds outstanding work; this file holds
finished work.** When an item is done, verified, committed and pushed, its row moves here.

**Append only. Never rewrite an entry.** A correction is a new, dated line pointing at the
old one — the same rule the retired record kept, and for the same reason: an entry that can
be edited is not evidence of anything.

---

## Format for a new entry

```
### <ID> — <one line, what it fixed>
**Done:** YYYY-MM-DD · **Commit:** `sha` · **Finding:** L-nn (if any)
**What changed:** files touched and the substance of the change.
**How it was verified:** the tests, the revert, the measurement. Not "tests pass" —
which tests, and what would have failed without the fix.
**Left behind:** any constraint this creates. Copy it into the plan's § 3 if it is one
nobody may break.
```

---

## Completed in this cycle

### PHASE 1 — the documents tell the truth again
**Done:** 2026-09-10 · **Commits:** `cb8534a`, `54eb3d4`, `aaf885a`, `7a25ca7` · **Findings:** none

**R1.1 — retired `docs/mise-en-service.md` (717 lines) and `.zscripts/README-windows.md`
(206).** Both describe the withdrawn Windows-till deployment. Nothing was extracted: the one
thing they carried that is *not* a deployment step — emptying the fiscal journal before the
first genuine sale — was already in the plan as *Before the first real sale*. Every pointer
to them was redirected, including two refusal messages inside `hibapos-server.ps1` and the
two `deployment.test.ts` assertions that pin them. **The assertions were redirected, not
dropped:** what they guard is that a refusal names somewhere to go.

**R1.2 — corrected `docs/CHANGES-LOG.md`'s header**, which was stale in two directions at
once: it said the trial was cancelled (true, then false, now true again for a different
reason) and pointed at the runbook R1.1 deleted. Retired verbatim per that file's own
append-never-rewrite rule.

**R1.3 — retired `NEXT-SESSION.md`.** Its own header instructed it.

**R1.4 — `docs/politique-ventilation-tva.md` § 2 and § 8.** § 2 now states *why* the
allocation weights are TTC: BOFiP's market-value method is a split « à proportion de la
valeur de marché, **pour le consommateur** », and a consumer's value is the TTC price they
would pay for the item alone. § 8 records the HT alternative with its provenance, the
measured gap, and three reasons it is not adopted.

**R1.5 — three corrections in `README.md`:** the deployment section replaced, uploads
corrected to 47,0 Mo, and `/api/reports/products` added to the no-interface list.

**How it was verified:** `bun run test` 1248 pass / 0 fail before the commits; 48
deployment tests pass after the pointer redirect; `.zscripts/hibapos-server.ps1` re-checked
for its two enforced invariants (UTF-8 BOM present, body pure ASCII) after editing.

**Left behind:** **the fiscal reset is not a deployment step.** It survived the retirement
of the document that described it and must survive the Tauri migration too.

### CONSOLIDATION — one plan, one done file, and a simplified CLAUDE.md
**Done:** 2026-09-10 · **Commit:** *(this commit)* · **Finding:** none — operator instruction

**What changed:** `REMEDIATION_PLAN.md` rewritten from 2 173 lines to ~34 KB, holding only
outstanding work; this file created for finished work; `REMEDIATION_RECORD.md` (5 595 lines)
deleted from the tree and left in git. `CLAUDE.md` rewritten short and operational at the
operator's instruction — how to work here, five prohibitions, two operator-only actions, and
where things stand. `src/lib/plan-freshness.test.ts` rewritten to guard the new structure
instead of the old. `README.md` test count 1247 → 1248.

**How it was verified:** `bun run test` 1248 pass / 0 fail, `typecheck` clean, `lint` clean.
The rewritten guard was proved non-vacuous by pinning both counts (27 tasks, 15 findings)
rather than asserting `> 0` — the mistake its predecessor made. **Its parser was then found
narrower than its data twice over**: once on trailing pipes, once on the carriage return git
leaves on every row of a CRLF checkout, which made `"none"` not equal `"none"`. Both fixed in
the parser, not in the data. That is the third time a version of this file has had that exact
bug, which is recorded here so the fourth author checks for it first.

**Left behind:** the plan must stay under 40 960 bytes and the two pinned counts must be
updated deliberately when a row is genuinely added or retired — never to make a run go green.

### Deployment withdrawn — the app will ship as Tauri v2
**Done:** 2026-09-10 · **Commit:** *(this commit)* · **Finding:** L-75 deferred

**What changed:** the operator decided the app ships as a **Tauri v2 native application**, so
the entire Windows-till deployment model left the plan: the commissioning session, the kiosk
launcher, the pre-built tree, the update path and the 32-bit hardware blocker. Phase 6 was
replaced by *Before the first real sale* — four fiscal steps that hold whatever the app is
packaged as. **L-75 moved from an open High finding to deferred**, carried to the Tauri phase.

**Left behind:** the fiscal reset is **not** a deployment step and must survive the Tauri
migration intact: `scripts/pre-golive-reset.ts` runs once, after testing, before the first
genuine sale, and arming `FISCAL_CHAIN_KEY` comes after it and never before.

---

## Carried forward — the 2026-09-03 → 2026-09-09 remediation

Fifty-two batches ran between the read-only audit of 2026-09-03 (repo at `5ef7dc4`) and
2026-09-09. Their full specifications, validation criteria and evidence lived in
`REMEDIATION_RECORD.md`, retired 2026-09-10 and recoverable in full with
`git show HEAD~1:REMEDIATION_RECORD.md`.

**What survived the retirement, and where it went:** the nine methods → plan § 2; the hard
invariants those batches left behind → plan § 3; the open findings → plan § 7; the answered
design decisions → plan § 9. Nothing load-bearing was dropped.

The completion history, one line each, newest first:

| Batch | Date | Commit | What it did |
|---|---|---|---|
| **1.3d** | 2026-09-09 | `e1bc65f` | **L-70** — direct USB printing. The only transport was TCP and the Sunso is on a USB type-B cable; adds the Windows RAW spooler transport behind the same interface. `IMPLEMENTED — TESTING REQUIRED`: the real print is 1.3's `[HW]` criterion. |
| **5.10** | 2026-09-09 | see record | **There was no way to enter a menu.** 5.9 built the model, allocation, fallback, ticket and validation; nothing let a cashier ring one. The slot-by-slot builder and the slot editor. |
| **5.9** | 2026-09-09 | `0e80c73`…`2725cef` | **Menus composés.** `CartItem` held one set of options, so a Duo's two burgers could not be configured separately. Data model, VAT allocation per `docs/politique-ventilation-tva.md`, higher-rate fallback, composition on the ticket. |
| **3.12** | 2026-09-09 | `004c112` | **L-68** — VAT did not vary by order type, so all 17 drinks booked 5,5 % including sur place. The rate now resolves per order type. |
| **5.8** | 2026-09-08 | `6994e5f` | **L-67** — the catalogue editor wrote every inherited option group back onto the product on each save, so the POS showed each one twice. |
| **1.4c** | 2026-09-08 | `1dcbe79` | **L-66, DOC-17** — how the app gets onto the till, and the refusal that was missing for it. |
| **1.4b** | 2026-09-07 | `ce27fa4` | **L-65, DOC-16** — the launcher's one silent refusal, and the corruption in the runbook it caused. |
| **7.7** | 2026-09-07 | `1379e93` | **L-64** — every `Button` size variant was under 44 px, and 103 of 144 buttons take those heights. |
| **7.6** | 2026-09-07 | `1439628` | **L-09, L-10** — eleven undersized controls raised to 44 px; eight found by the guard once it existed. L-10's premise was substantially wrong; the real gap was label association. |
| **3.11** | 2026-09-07 | `0996622` | **L-58's open half** — `OrderItem` gains `lineNetTotal` and `lineHt`, so the line's HT is stored rather than only reproducible. |
| **1.3c** | 2026-09-07 | `e2b14ed` | **L-63** — the receipt's other overflows, and the two renderers carrying a copy of the first. All three now share `services/ticket-layout.ts`. |
| **1.3b** | 2026-09-07 | `57f109e` | **L-21** — `renderReceipt()` centred and never wrapped, so the restaurant's 56-character address ran off 48-column paper. |
| **7.5** | 2026-09-07 | — | **L-22, L-36/DOC-13, DOC-14** — English zod messages in a French UI, fixed as a class via zod 4's French locale. |
| **7.3** | 2026-09-07 | `d937ef2` | Secret rotation, prepared and handed over. The operator ran it; verified by the pre-rotation backups no longer decrypting. |
| **2.5** | 2026-09-06 | `52c66c0` | **L-61 (HIGH), L-62** — the restore could not complete on Windows. Root cause was two Prisma clients; the first diagnosis was wrong and measurement corrected it. |
| **8.1** | 2026-09-06 | `ce500ac` | **V-04, V-05** — the live database verified read-only, 27 checks, four chains recomputed. |
| **3.10** | 2026-09-06 | `28e1fc2` | **L-55, L-56, L-58's label half** — the three the ISCA map turned up that no batch owned. |
| **3.9** | 2026-09-06 | — | **DD-25** — the fiscal chain can be keyed (HMAC-SHA-256), with the arming guard. Unkeyed stays byte-identical. |
| **3.8** | 2026-09-06 | — | **DD-23, DD-24, L-57** — the trading day (`clôture du jour`) on a configurable cut-off, and the perpetual total sealed into every close. |
| **3.7** | 2026-09-06 | `203848e`, `c3ce9e9` | **L-53, L-54**; L-52 searched and left open. The software now states its version on every fiscal surface. |
| **6.3** | 2026-09-05 | `71324f2` | **T-10…T-12, L-06, L-40, L-43** — e2e and CI safety. `test-setup.ts` aborts unless the database is under temp; `vitest.config.ts` throws at import. |
| **6.2** | 2026-09-05 | `6201e4d` | **T-08, T-09, L-02** — misleading tests re-pointed at the live route rather than deleted. |
| **6.1** | 2026-09-05 | `a8734f4` | **T-01…T-07** — tests for the things that can lose money, plus the request harness six earlier batches had been waiting for. |
| **7.4a/b/c** | 2026-09-05 | `807e0c5`, `215d9fd`, `9e8e4e7` | Reports that disagree (L-48, L-44, L-50); authorization and the login queue (L-33, L-30); small correctness (L-45, L-31, L-19, L-24, L-32). |
| **7.2** | 2026-09-05 | `97c74fb` | **L-01, L-03, L-07, L-08, L-12, L-29** — dead code and dependency removal, −428 lines. Two of L-07's ten entries were wrong. |
| **7.1** | 2026-09-05 | `b2262bf` | **DOC-01…DOC-12** — documentation corrections. Two of the four code comments it was told to fix needed none. |
| **5.7a–d** | 2026-09-05 | `982168c`, `5ccc964`, `9304d58`, `d922ce0` | The dead add-on surface; « Offert » the zero-total tender; pricing and validation defects (M-19 survived because the tests built a shape the dialog never produced); POS resilience. **End of Stage 5.** |
| **5.6** | 2026-09-05 | `1bb8a48` | **M-08** — no pre-payment state; the dead `CANCELLED`/`PENDING` enum values removed. |
| **5.5** | 2026-09-05 | `51af203` | **M-05** — cash movements, four fixed categories, because prose reasons cannot be totalled. |
| **5.4** | 2026-09-05 | `4bb7cda` | **C-23** — held orders and cart lifecycle, shrunk to two halves by DD-11. |
| **3.6c** | 2026-09-05 | `bd08823` | **L-27** — the close guard matched only shifts whose *opening* fell inside the period. |
| **5.3** | 2026-09-05 | `3917f3a` | **C-14** — cross-shift refunds. Yesterday's sale is refundable today, out of today's till. |
| **5.2** | 2026-09-05 | `1abde1f` | **C-21** — table selection, closed by *withdrawal* rather than wiring (DD-09). |
| **5.1** | 2026-09-05 | `8a4429a` | **C-20** — keyboard shortcuts. |
| **4.7** | 2026-09-04 | `951e14c` | **C-15's shift-race half.** Shift state was read outside the transaction at three sites, not the audit's two. |
| **4.6** | 2026-09-04 | `974372e` | **C-24, C-25** — catalogue data loss. One malformed option group used to destroy a category's entire option set. |
| **4.5** | 2026-09-04 | `1a0836b` | **DD-08, C-17, L-37, L-38, DOC-09** — deleted `port-real-data.ts`, which wiped production by a hardcoded path; every remaining script is a dry run without `--apply`. |
| **4.4c** | 2026-09-04 | `d9b1b08` | **DD-19, L-34, L-35, M-17, M-18** — step-up PIN for large discounts and every refund. |
| **4.4b** | 2026-09-04 | `45a6fb8` | **M-19s** — `CASHIER` removed from the product, on DD-07's final answer. |
| **4.4** | 2026-09-04 | `36a9cd9` | **C-16, M-24…M-26** — role gating was client-side only and lived in one place. |
| **4.3** | 2026-09-04 | `aac03f6` | **C-18, M-23, M-27, M-28** — credentials, sessions, and binding to `127.0.0.1` (DD-06). |
| **4.2** | 2026-09-04 | `4022c9c` | **C-09, T-04** — PIN derivation was `scryptSync` on the request thread, ~390 ms of frozen event loop per call. |
| **4.1** | 2026-09-04 | `f14a50c` | **C-08** — manager-approval brute force. `clientIp` believed `X-Real-IP` on the strength of nothing. |
| **3.6/3.6b** | 2026-09-04 | `042bcbc`, `545b255` | **M-01, M-06, M-07, L-25, L-26** — close chain ordering and timing. Sealing March then January chained them wrongly and broke verification permanently. |
| **3.5** | 2026-09-04 | `83c3cfa` | **C-13, M-04** — the approving manager is recorded; `REMBOURSEMENT` carries the ticket number, not a cuid. |
| **3.1–3.4, 2.1–2.4, 1.1–1.2, 0.1–0.2** | 2026-09-03 | various | VAT rate keying (C-12); FACTICE (L-18); the settings screen unblocked (L-20); category VAT (L-16/L-17, DD-17); five aggregations collapsed into one (C-10, C-11, M-13, M-14); archive integrity (C-04, M-02); the fiscal operator screen (C-27); backup restore (C-05); backup location and retention (C-06, M-03); WAL (C-19); resource bounds (M-29…M-31); refund and Z-close unit corrections (C-01, C-02); source-control recovery (C-26). |

### Closed without a batch

- **L-14** and **L-60** — **dissolved 2026-09-10** by the operator's reset. Both depended on
  rows that no longer exist (`Receipt` and `Order` are at zero), and neither can recur:
  every order written from now on is journalled.
- **L-72, L-73, L-74** — closed by the reset script's own rework, 2026-09-09: the six menus
  are now verified through the wipe rather than unmentioned by it, clients are deleted at
  the operator's request, and the "app must not be running" guard stopped refusing on a
  server holding a different database.
- **DOC-15**, **L-04**, **SEC-ROT** — operator actions, completed.
