# HibaPOS France — ANSWERED DECISIONS

**Do not re-open these.** Each one was settled, and each is kept as a one-liner so nobody
re-litigates it. Full rationale is in git history
(`git show HEAD~1:REMEDIATION_RECORD.md` → *Answered design decisions*).

---

## Why this file exists, and why it is not in the plan

It was **§ 9 of `REMEDIATION_PLAN.md`** until 2026-09-12, and it moved for the reasons § 3
and § 4 moved before it:

1. **It is not outstanding work.** The plan holds what is still to do. A register of things
   already decided is the opposite of that — it exists to stop work, not to schedule it.
2. **The plan has a 40 960-byte ceiling**, so a session can read it in one pass before
   touching anything. This section was 2 923 of those bytes, and the audit's twenty batches
   left the plan with 37 bytes to spare — which is not headroom, it is a trap for the next
   edit.

**These decisions bind exactly as they did inside the plan.** `DD-` ids are referenced from
source comments throughout `src/`, and they are stable labels: never renamed, never reused.

---


Kept as one-liners so nobody re-litigates them. Full rationale is in git history
(`git show HEAD~1:REMEDIATION_RECORD.md` → *Answered design decisions*).

| ID | Decision |
|---|---|
| DD-01 | ESC/POS over raw TCP:9100 as primary, behind a transport interface; USB RAW added later. |
| DD-02 | ~~Data lives at `C:\HibaPOS\data`.~~ **Never implemented, moot.** `HIBAPOS_DATA_DIR` unset, so `paths.ts` returns the working directory; `:31` keeps that path only as `RECOMMENDED_DATA_DIR`. Where data lives is the Tauri phase's decision. |
| DD-03 | No sealed row carried the wrong VAT key — the premise was an audit assumption. |
| DD-05 | Out-of-order period closes are **refused**. A close must follow the last sealed one. |
| DD-06 | No LAN access. The server binds `127.0.0.1`. |
| DD-07 | **There are no cashiers.** MANAGER is the till's only operational role; SUPER_ADMIN is the developer's. `CASHIER` was removed from the product. |
| DD-09 | **This restaurant does not serve at tables.** The feature is withdrawn, the code deliberately retained. |
| DD-10 | Cross-shift refunds are **allowed**, attributed to the till open when issued. |
| DD-11 | Held orders stay device-local. One till. |
| DD-12 | Cash movements exist, with a fixed category list. |
| DD-13 | No pre-payment order state. The dead `CANCELLED` enum values were removed. |
| DD-14 | « Offert » is a real tender. An offert sale is not counted as revenue. |
| DD-16 | Catalogue images stay tracked in git. It is currently their only versioned copy. |
| DD-17 | A product's VAT rate comes from its category, inherited nearest-wins, with a per-product override. |
| DD-18 | A premature month/year close is **refused**, with no override. |
| DD-19 | Step up with the operator's **own** PIN — above the discount threshold, and on every refund. |
| DD-20 | A given-away order is reported **separately**, never as a sale. |
| DD-21 | The four non-fiscal reports adopt the fiscal rule: a period books the corrections it issued. |
| DD-22 | `GET /api/users` and `GET /api/backups` are SUPER_ADMIN only. |
| DD-23/24 | The trading day (`clôture du jour`) exists, with a configurable cut-off defaulting to **05:00**. |
| DD-25 | The fiscal chain may be keyed (HMAC-SHA-256) off a secret held outside the database. Armed only on an empty journal. |
| **DD-26** | **`PUT /api/settings` splits by field, not by role.** The MANAGER — the till's only operational account (DD-07) — may write the **operational** fields: `printerName`, `printerConnection`, `printerQueue`, `printerHost`, `printerPort`, `printerEnabled`, `openDrawerOnCash`, `receiptWidth`, `autoPrint` and **`factice`**. **SUPER_ADMIN only** for the **identity and fiscal-policy** fields: `restaurantName`, `restaurantAddress`, `restaurantPhone`, `restaurantSiret`, `restaurantTva`, `footerNote`, `currency`, `defaultVatRate`, **`discountApprovalThreshold`** and **`businessDayCutoffHour`**. *Settled 2026-09-12 (L-101). The whole route was SUPER_ADMIN while `nav-config.ts` gave MANAGER the screen and an enabled save button, so the only account that will be at the till in France could not do R6.3 or R6.4. Refusing the whole route, or hiding the screen, leaves those two rows reachable only from the developer's account in Tunisia. The two fields kept back are the ones that are not operational at all: `discountApprovalThreshold` escapes every DD-19 step-up at 100, and `businessDayCutoffHour` sets the edges of every sealed document.* |
| **DD-27** | **FACTICE is one-way once anything real has been sold.** A MANAGER may turn `factice` **off** — that is R6.3, and it is their job. Turning it back **on** is refused once the fiscal journal holds any non-factice event, because from that point it would stamp *SIMULATION* on genuine sales while the journal row carries the flag, and neither the paper nor the record can be corrected afterwards. **A SUPER_ADMIN may still do it**, so there is an escape hatch. Before the first real sale it toggles freely in both directions, which is what this machine needs during testing. *Settled 2026-09-12, alongside DD-26. There is no such guard today — nothing stops `factice` going back on at any time.* |
| **2026-09-10** | **The client trial is dropped.** No copy ships before the final version; § 6 runs once. |
| **2026-09-10** | **VAT allocation stays TTC-weighted**, documented as a market-value method, pending the accountant. |
| **2026-09-10** | **The app ships as a Tauri v2 native application.** Deployment is therefore out of this plan entirely: `docs/mise-en-service.md` and `.zscripts/README-windows.md` are retired, and the till, the kiosk launcher and the 32-bit hardware problem go with them. Tauri gets its own plan when this one is closed. |
