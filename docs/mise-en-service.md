# Commissioning runbook — HibaPOS France

**The single ordered sequence for putting HibaPOS on the restaurant's till.** It
closes Batch 1.3's `[HW]` criteria, Batch 1.4's `[MACHINE]` criteria and Batch
8.0 (P-04) in one session, in the only order that works.

Written for the developer driving over remote access, with the owner physically
at the till. Everything the owner has to *see* or *touch* is marked **[OWNER]**.

> ## The one step that cannot be undone
>
> **§ 6 empties the fiscal journal. It runs once, before the restaurant's first
> real sale, and never after one.** From that sale onwards the journal is
> append-only and clearing it is precisely the deletion
> `docs/attestation-conformite.md` states is impossible.
>
> Everything rung up before § 6 — every demo, every test print — **must have
> FACTICE on** (§ 4). FACTICE does *not* keep a sale out of the journal; nothing
> can, and a mode that could would be a fraud tool. It stamps the ticket
> *FACTICE — SIMULATION / TICKET NON VALABLE* and flags the journal row, so § 6
> deletes it cleanly and no test ticket can ever be mistaken for a real one.

---

## 0. Before the session

| | Why |
|---|---|
| **Bun installed machine-wide** — not under a user profile | The server task runs as `SYSTEM`, which cannot see `%USERPROFILE%\.bun` or `%APPDATA%\npm`. The installer warns, but fixing it afterwards means another reboot. |
| The printer's **IP address**, fixed not DHCP | § 3 needs it, and a DHCP lease that moves silently breaks printing weeks later. |
| The printer on the **same network** as the till, powered, with paper | |
| A **second volume** for `BACKUP_LOCATION` — USB drive, NAS share, anything not the system disk | A backup on the same disk as the database is not a backup (C-06). |
| The repository on the machine, and a `.env` from `.env.example` | |
| **[OWNER]** available at the till for §§ 3 and 7 | Somebody has to watch paper come out and a drawer open. |

**Not needed yet:** `FISCAL_CHAIN_KEY`. It is generated in § 6e, after the reset, and never before — and it is **not** one of the secrets § 6a rotates.

---

## 1. Install

```powershell
powershell -ExecutionPolicy Bypass -File .zscripts\install-windows.ps1
powershell -ExecutionPolicy Bypass -File .zscripts\install-windows.ps1 -Apply
```

Run the dry run first and read it. The `-Apply` run creates `C:\HibaPOS\data`,
copies the database, backups, archives and product images there — **verifying
the database by SHA-256 and the directories by file count** — renames the
sources aside rather than deleting them, and registers two Scheduled Tasks.

Then edit `.env`:

```ini
HIBAPOS_DATA_DIR=C:\HibaPOS\data
DATABASE_URL=file:C:\HibaPOS\data\db\custom.db?_fk=1&_busy_timeout=5000
BACKUP_LOCATION=<the second volume>
```

**Do not delete the `*.moved-<timestamp>` sources yet.** They are the way back
if § 2 goes wrong. Remove them after § 7.

### 1b. Apply Batch 3.11's migration — L-58, « total HT de la ligne »

**✅ APPLIED BY THE OPERATOR 2026-09-07 AND VERIFIED** — before the install,
as it happened, on the database still in its old location. All four checks
below passed and the fingerprint diff was one line, the `_prisma_migrations`
row. Kept here for the record and in case the till is ever rebuilt.

*(Originally: after `.env` points at the new location, and before anything is
rung up.)*

```powershell
bunx prisma migrate status     # expect: 1 pending — order_item_line_ht
bunx prisma migrate deploy
bunx prisma migrate status     # expect: Database schema is up to date
```

It adds two nullable columns to `OrderItem` — `lineNetTotal` and `lineHt` — so
the per-line HT BOFiP § 50 lists is **stored** rather than only reproducible by
re-running the discount apportionment. Two `ADD COLUMN`s, no table rebuild.

Rehearsed on a copy of the live database on 2026-09-07: a 305-line fiscal
fingerprint taken before and after differed by **one line, the
`_prisma_migrations` row**. Nothing else in the database moves.

- [x] `migrate status` says up to date, and reports **10** migrations
- [x] The counters are unmoved: **20 / 3 / 2 / 2** (receipt / shift / Z / event)
- [x] All four chains `ok` — recomputed read-only with the app's own verifier
- [x] The 82 existing order lines read `NULL` in both new columns — they are
      **not** backfilled, on purpose, and § 6's reset deletes them anyway

---

## 2. Prove it starts on its own

```powershell
Restart-Computer
```

**[OWNER]** After the reboot, without anyone typing anything, the till should
be showing HibaPOS full-screen.

Then check, in this order:

1. `C:\HibaPOS\data\logs\server.log` — the launcher's own log. If bun was installed per-user this is where it says so.
2. `Get-ScheduledTaskInfo -TaskName "HibaPOS Server"` — `LastTaskResult` should be `0`.
3. `http://localhost:3000/api` answers `200`.
4. **WAL is now on**: byte 18 of `C:\HibaPOS\data\db\custom.db` should be `02`, not `01`. It was `01` on the old path because the WAL guard refuses cloud-synced folders; the move is what turns it on.
   ```powershell
   $f=[System.IO.File]::OpenRead("C:\HibaPOS\data\db\custom.db"); $b=New-Object byte[] 19; $f.Read($b,0,19)|Out-Null; $f.Close(); $b[18]
   ```
5. Kill the server process and confirm Task Scheduler restarts it within a minute. *(Batch 1.4 `[MACHINE]` criterion.)*

**Install the app properly:** open it, then Edge menu → **Installer HibaPOS**.
That gives a desktop icon, a Start Menu entry and a window with no address bar.

**[OWNER]** Optional but recommended — auto-login, so a power cut needs nobody:
run `netplwiz` and untick *Users must enter a user name and password*. **Do not
use the `AutoAdminLogon` registry key: it stores the password in clear text.**
This only skips the *Windows* sign-in; the HibaPOS staff PIN is unaffected and
still required, which is what puts a `userId` on every fiscal event.

---

## 3. FACTICE on — before anything is rung up

**Réglages → mode simulation → ON.** Confirm a ticket prints
*FACTICE — SIMULATION / TICKET NON VALABLE* at the top.

Everything from here to § 6 is test data. This switch is what makes it
unmistakable and safely deletable.

---

## 4. Commission the printer and the drawer — Batch 1.3 `[HW]`

**While you are in Réglages, two stored values are wrong and this is the moment
to correct them** (*Open Threads → B*):

- [x] ~~**Address** — the postcode was in there twice~~ — **done 2026-09-07**;
      the save also wrote `receiptWidth` 48 over the legacy 80, as predicted.
- [x] ~~**`printerName`** — read `Epson TM-m30`~~ — **done 2026-09-07**, now
      `Sunso WTP-801`. **DOC-15 closed.**

**Réglages:** printer IP, port `9100`, `printerEnabled` on, `openDrawerOnCash`
on. `receiptWidth` and `printerName` are already right — the operator's save of
2026-09-07 set the width to 48 and the model to `Sunso WTP-801`.

Then `POST /api/print/test`, or the test button in Réglages.

**[OWNER] must confirm, out loud, one at a time:**

- [ ] Paper comes out, and the ruler line is exactly **48 characters** wide on the roll
- [ ] `é è ê à ç ù û î ô` and `€` are all legible — not `?` or mojibake
- [ ] The cash drawer **opens** on the test
- [ ] The physical printer is a **Sunso WTP-801** (settles DOC-15)

Then a FACTICE cash sale end to end:

- [ ] The ticket prints, and carries `Caisse N° 1` and `Service 1`
- [ ] The drawer opens on the cash tender
- [ ] `Réglages → Fiscal` shows the `VENTE`; a manual drawer open shows `OUVERTURE_TIROIR`; a reprint shows `REIMPRESSION`
- [ ] **Turn the printer off, ring another sale**: the sale still completes and the operator sees *"Imprimante injoignable…"* rather than a lost sale

**L-21 and L-63 are FIXED (Batches 1.3b and 1.3c, 2026-09-07)** — this section
used to warn that the address would wrap mid-address on 48-column paper. It no
longer can: no line any of the three text renderers emits exceeds the paper, and
the address is laid out across two centred lines with nothing lost.

**What the print still has to settle, and only paper can:** what this printer
does with a line it cannot fit — hard wrap, or truncate. The renderer no longer
offers it the choice, so this is a confirmation rather than a risk. Look at the
ticket's establishment block and at any long article label and check both read
whole.

- [ ] The address reads across two lines, complete
- [ ] No line runs off the edge of the paper
- [ ] The 48-character ruler on the test page sits on **one** line — if it wraps,
      `receiptWidth` is wrong for this paper (L-13), not the renderer

---

## 5. Demo to the owner

**[OWNER]** Walk the whole till: orders, discounts with PIN, refunds, X report,
Z close, the day close and its integrity code. Still in FACTICE.

Everything rung here is deleted in § 6. That is the point of doing it now.

---

## 6. THE POINT OF NO RETURN — P-04 / Batch 8.0

### 6a. Rotate the secrets — **before** the backup, not after

Batch 7.3, prepared and rehearsed, still not done. It goes here and not in § 8,
and the reason is the order: the backup in § 6b is the **first genuinely
restorable backup this installation will ever have**, and if it is written under
the old key and the key is then rotated, it becomes unreadable. Rotate first and
§ 6b is written under the new key.

**[OWNER or you]** — Claude never generates or sees these values.

**`openssl` is not on Windows by default** — use either of these instead. Both
produce the same thing: 64 hex characters from a cryptographic RNG. Run it
**twice**, once per secret, and do not reuse one value for both.

```bash
bun -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```powershell
$b = New-Object byte[] 32; (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b); ($b | ForEach-Object { $_.ToString('x2') }) -join ''
```

> Not `Get-Random`. It looks like it would do and is **not** cryptographically
> secure — fine for picking a test row, wrong for a signing secret.

Or let the script do all of it — it generates both values here, never prints
them, copies `.env` aside first, and replaces only those two lines:

```bash
bun scripts/rotate-secrets.ts            # dry run
bun scripts/rotate-secrets.ts --apply
```

Either way, then:

```powershell
Restart-ScheduledTask -TaskName "HibaPOS Server"
```

- [ ] `GET /api/auth/me` answers `{"user":null}` — including in a tab that was signed in before. That is the old session being refused.
- [ ] Signing in with the **usual PIN** works. No PIN changes; nobody is locked out.

> **Do NOT rotate `FISCAL_CHAIN_KEY` here.** It does not exist yet — it is
> generated in § 6e, after the reset, and armed once. Rotating it after arming
> makes the whole journal permanently unverifiable.

Full procedure and its 2026-09-06 correction: `REMEDIATION_RECORD.md` → *Batch 7.3*.

### 6b. Back up, and get the backup off the machine

```powershell
# In the app: Réglages -> Sauvegardes -> créer une sauvegarde
bun scripts/decrypt-backup.ts --list
bun scripts/decrypt-backup.ts <fichier.dbenc> C:\HibaPOS\verify-backup.db
```

The decrypt must succeed and report **"Format SQLite valide"**. Then copy the
`.dbenc` and `.uploads.enc` **off this machine**, and delete
`C:\HibaPOS\verify-backup.db`.

> **This backup matters more than usual.** The three backups already on the
> machine are **not restorable** — they predate seven fiscal tables and
> `assertCompatibleSchema` refuses them, correctly (L-46). Until this one
> exists, the install has no working restore point at all.

### 6c. Stop the application

```powershell
Stop-ScheduledTask -TaskName "HibaPOS Server"
```

The reset script refuses to run while the app answers on 3000.

### 6d. The reset

```powershell
bun scripts/pre-golive-reset.ts            # dry run - read it
bun scripts/pre-golive-reset.ts --apply    # asks for EFFACER, then oui
```

**Copy the before/after tables it prints into `REMEDIATION_PLAN.md` under
P-04** — hard constraint 4.

Rehearsed 2026-09-06 on a copy of production: 152 rows and 2 archive files
deleted, counters to `0/0/0/0`, **catalogue intact across all 14 preserved
tables**, and the resulting database passes all 28 of Batch 8.1's checks with
an empty chain reporting `ok` at `lastSequence: 0`.

**The audit log is deliberately kept.** P-04 does not list it, and deleting an
audit trail is the exact thing this application forbids everywhere else. It is
not fiscal data; the fiscal journal is, and that is what was just reset.

### 6e. Arm the chain key — **in this order, or not at all**

1. **[OWNER or you]** generate it — same commands as § 6a, `openssl` is not on Windows:
   ```bash
   bun -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Paste it into `.env` as `FISCAL_CHAIN_KEY`
3. **Back it up somewhere that is not this machine.** ⚠ **Lose it and the journal can never be verified again** — every hash is computed with it. Treat it exactly like `BACKUP_ENCRYPTION_KEY`.
4. `Start-ScheduledTask -TaskName "HibaPOS Server"`
5. `GET /api/fiscal/verify` must answer **`"chainKeyed": true`**, chain `ok`, `lastSequence: 0`

If step 5 answers `ok: false` with a `keyDiagnosis`, the order was wrong — the
key was armed over a journal that already had unkeyed events. **Stop.** Do not
trade. Re-read P-04.

*Claude does not generate this key and must never see it.*

### 6f. FACTICE off

**Réglages → mode simulation → OFF.** From this moment every sale is real.

---

## 7. First real trading day — Batch 8.2 V-07

- [ ] Open the caisse. It should be **Caisse #1** and the first ticket **N° 1**
- [ ] Mixed order types, split payments, a discount with approval, a refund, a reprint, a manual drawer open
- [ ] `GET /api/fiscal/verify` — all four chains `ok` at the end of the day
- [ ] X report, then the **Z close**, then the **Clôture du jour**
- [ ] **[OWNER]** The Z reconciles to the counted drawer, with a variance they can explain
- [ ] The day-close slip prints, and the **integrity code is filed with the books** — that is the half of the integrity story that works, because paper is outside the database
- [ ] A backup was created automatically at the Z close, and it appears in Réglages

**Power-cut simulation, at the end of the day rather than the middle:** pull the
plug, restart, and confirm the app returns, the shift state is intact and no
partial order exists.

---

## 8. Afterwards

- [ ] Delete the `*.moved-<timestamp>` directories from the old install path
- [x] ~~Rotate `SESSION_SECRET` and `BACKUP_ENCRYPTION_KEY` here~~ — **moved to § 6a**, where the ordering works. This line first said to rotate *after* the backup, which is exactly backwards: the backup would then be encrypted with the key about to be discarded. Corrected 2026-09-06.
- [ ] Record everything in `REMEDIATION_PLAN.md`: P-04's counts, 1.3's `[HW]` results, 1.4's `[MACHINE]` results, 8.2's V-07
- [ ] **Re-triage every open finding whose severity was discounted for want of an audience.** The plan says to do this the moment an install date exists. **L-21 and L-63 were the first two and are done** (1.3b, 1.3c, 2026-09-07); the rest of the sweep has not been made.
- [ ] The attestation (`docs/attestation-conformite.md`) still needs L-52, L-54, V-01 and V-13 reflected or excluded before anyone signs it

---

## If something goes wrong

| Symptom | What it is |
|---|---|
| Till does not come up after reboot | `C:\HibaPOS\data\logs\server.log`. Most likely bun is per-user and `SYSTEM` cannot see it. |
| Launcher refuses: *"Base de données introuvable"* | `HIBAPOS_DATA_DIR` or `DATABASE_URL` is wrong. **It will not create a database** — that refusal is deliberate (L-59): a new one would be empty, numbered from 1, with the PINs published in this repository. |
| Launcher refuses: pending migrations | `.zscripts\update.ps1 -Apply`. |
| `/api/fiscal/verify` says the chain is broken | If it names a `keyDiagnosis`, it is the key, not tampering — Batch 3.9 built it to say so. Restore `FISCAL_CHAIN_KEY`. |
| Restore needed | It works now (Batch 2.5). If the app will not start at all, recover by hand: stop everything, `scripts/decrypt-backup.ts`, put the file in place, delete `-wal` and `-shm`, restart. |
| Printing fails mid-service | The sale is never lost — printing happens after the sale commits. Reprint from the order. |
