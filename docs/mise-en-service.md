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
| ⚠ **Bun installed machine-wide** — not under a user profile | **The most likely way this session goes wrong**, and **the development machine FAILS this check** — measured 2026-09-07, see below. The server task runs as `SYSTEM`, which cannot see `%USERPROFILE%\.bun` or `%APPDATA%\npm`. **The failure used to be silent**: the task « runs », the launcher never found bun, the till never came up. **Batch 1.4b made it loud** — the launcher now refuses *before* it uses bun, writes a `FATAL` line naming the account and both commands, and prints the three ways out; it also logs which bun it found when it succeeds, so `server.log` answers this question either way. **Check it before travelling** with `where bun`. **What was measured here:** bun resolves to `%APPDATA%\npm\bun.ps1` and `%APPDATA%\npm` sits on the **user** PATH only — the machine PATH has no bun at all — which is exactly the case `SYSTEM` cannot see. The real binary is `%APPDATA%\npm\node_modules\bun\bin\bun.exe`, 98 MB, which is what makes option (c) a two-minute fix. The installer's dry run offers all three: machine-wide install, `-ServerAccount <compte>`, or that `bun.exe` copied into `C:\HibaPOS\bin` with that folder added to the **system** PATH — read that warning, do not scroll past it. |
| ⚠ **The `.env` you carry must be the ROTATED one** | `SESSION_SECRET` and `BACKUP_ENCRYPTION_KEY` were rotated 2026-09-07. Carrying an older `.env` means the backups written on the till cannot be opened with the keys anyone holds. **This one PASSES on the development machine** — verified 2026-09-07 against the pre-rotation copy: both values are 64 characters and both differ from it. § 6a re-checks it at the step that depends on it, and has the command. |
| The printer's **IP address**, fixed not DHCP | § 3 needs it, and a DHCP lease that moves silently breaks printing weeks later. |
| The printer on the **same network** as the till, powered, with paper | |
| A **second volume** for `BACKUP_LOCATION` — USB drive, NAS share, anything not the system disk | A backup on the same disk as the database is not a backup (C-06). |
| The repository on the machine, plus dependencies and a **production build** | **This is § 0b, and it is more than one step** — the code comes from git, but `db/custom.db` and the rotated `.env` are carried by hand, and `bun install` / `prisma generate` / `bun run build` all have to happen before § 2's reboot. |
| **[OWNER]** available at the till for §§ 3 and 7 | Somebody has to watch paper come out and a drawer open. |

**Not needed yet:** `FISCAL_CHAIN_KEY`. It is generated in § 6e, after the reset, and never before — and it is **not** one of the two secrets already rotated — § 6a only *checks* those now.

---

## 0a. Rehearse on a spare Windows machine — the evening before

**Optional, and worth more than any other hour spent before delivery.** It closes
**Batch 1.4's four `[MACHINE]` criteria** — a cold reboot, the supervisor restart,
the Scheduled Task registration itself, and the till coming up unattended — on a
machine where getting it wrong costs nothing.

**Do it on a COPY of the repository, never the working tree**: the installer moves
data *out of* the install directory, and the working tree holds the only copy of
the restaurant's catalogue.

```powershell
Copy-Item -Recurse "<repo>" "C:\HibaPOS-rehearsal\app"
cd C:\HibaPOS-rehearsal\app
powershell -ExecutionPolicy Bypass -File .zscripts\install-windows.ps1 -DataDir C:\HibaPOS-rehearsal\data
powershell -ExecutionPolicy Bypass -File .zscripts\install-windows.ps1 -DataDir C:\HibaPOS-rehearsal\data -Apply
```

- [ ] The dry run's **bun warning** either does not appear, or you act on it
- [ ] Tasks register, and `Get-ScheduledTaskInfo -TaskName "HibaPOS Server"` returns `0`
- [ ] **Reboot.** The machine comes up showing HibaPOS with nobody touching it
- [ ] Kill the server process; Task Scheduler brings it back within a minute
- [ ] Byte 18 of the rehearsal database is `02` — WAL is on outside OneDrive
- [ ] **Afterwards unregister both tasks and delete `C:\HibaPOS-rehearsal`**, so the
      spare machine stops trying to run a till — a registered task pointing at a
      deleted directory retries three times a minute, forever:
      ```powershell
      Unregister-ScheduledTask -TaskName "HibaPOS Server" -Confirm:$false
      Unregister-ScheduledTask -TaskName "HibaPOS Kiosk"  -Confirm:$false
      Remove-Item -Recurse -Force C:\HibaPOS-rehearsal
      ```

Whatever this finds is worth knowing tonight rather than in front of the client.

---
## 0b. Get the app onto the till — the step this runbook used to skip

**There is no installer that does this.** `install-windows.ps1` moves data *out
of* the install directory and registers the two Scheduled Tasks; it does not
fetch code, install dependencies, or build. Nothing else did either, and § 0
compressed all of it into "the repository on the machine" — which is how the gap
stayed invisible until it was looked for (DOC-17, 2026-09-08).

### What comes from git, and what you carry by hand

The repository carries **579 tracked files, including the 139 catalogue images
(47.7 MB)**. Two things it deliberately does not:

| Carry by hand | Size | Why it is not in git |
|---|---|---|
| **`db/custom.db`** | **704 KB** | `/db/` is gitignored. **This is the restaurant's real catalogue and it exists nowhere else** — 78 products, their options and their VAT rates. Warning 4: treat it as irreplaceable. |
| **`.env`** — the one rotated 2026-09-07 | 279 B | `.env*` is gitignored except `.env.example`. § 0's second prerequisite is about this file. |

**That is the whole manual transfer: about 705 KB.** Do **not** copy
`node_modules` (880 MB, 46 479 files) or `.next` (388 MB) across the link —
install and build on the till instead. **Skip `db/backups/` too** (126 MB): those
three backups predate seven fiscal tables so `assertCompatibleSchema` refuses
them (L-46), and since the rotation they no longer decrypt at all. § 6b creates
the first restorable one.

### The sequence, and the two orderings that matter

```powershell
# 1. the code
git clone <remote> C:\HibaPOS-app        # or copy the working tree
cd C:\HibaPOS-app

# 2. the two carried files, BEFORE anything else
#    db\custom.db  ->  C:\HibaPOS-app\db\custom.db
#    .env          ->  C:\HibaPOS-app\.env

# 3. dependencies and the production build
bun install
bunx prisma generate
bun run build
```

`bun install`, `prisma generate` and `bun run build` are also what
`.zscripts\build.ps1` runs, if you would rather have one command for the last
two.

- [ ] **`.env` is in place before `bun run build`.** `next build` throws at
      import time without `SESSION_SECRET`, and the message points at the import,
      not at the missing file.
- [ ] **The build happens before the reboot in § 2.** `bun run start` is
      `next start`, which needs `.next/BUILD_ID`. Register the tasks and reboot
      without building and the till comes up dead. **Since 2026-09-08 the
      launcher refuses loudly** and names the three commands above in
      `server.log` (refusal 5) — but it is a much better morning if it never
      fires.
- [ ] `db\custom.db` is the **704 KB** file from the development machine, not a
      new one. Check the size before going further: nothing here will create a
      database, and a wrong path is answered by a refusal rather than an empty
      till (L-59).
- [ ] **`DATABASE_URL` rewritten for THIS machine** — see the warning below. The
      carried `.env` points at the development machine.

> ### ⚠ The carried `.env` names a path that does not exist here
>
> You carry that file for its two **secrets**. Its `DATABASE_URL` is an absolute
> path into the development machine's OneDrive-synced project folder, and on the
> till it points at nothing. **It needs rewriting twice, one line each time**, and
> the two edits are in different sections because the database moves between them:
>
> 1. **Here, before `bun run build`** — point it at the clone, so the build has a
>    real database at a real path:
>    `DATABASE_URL=file:C:\HibaPOS-app\db\custom.db?_fk=1&_busy_timeout=5000`
> 2. **In § 1, after `install-windows.ps1 -Apply`** — point it at where the
>    installer has just moved the file, alongside `HIBAPOS_DATA_DIR`:
>    `DATABASE_URL=file:C:\HibaPOS\data\db\custom.db?_fk=1&_busy_timeout=5000`
>
> **If you forget, the failure is loud and it names itself.** The launcher refuses
> with *« Base de donnees introuvable »* **followed by the path it tried** — and a
> path beginning `C:\Users\…\OneDrive\…` in `server.log` on the restaurant's till
> is this mistake and nothing else. It will not create a database to paper over it
> (L-59). Twenty minutes if you recognise the line, longer if you do not.

> **`bun install` needs internet on the till — and the operator confirmed on
> 2026-09-08 that it has it.** So this is the path: no `node_modules` to carry.
> Together with `bun run build` it is the longest step in this section, and
> neither needs watching — start `bun install` and do something else.
>
> *The fallback, kept in case the connection is down on the day: carry
> `node_modules` on a USB stick — 880 MB, slow to copy, needs no network.*

Only then § 1, which moves the data out of this directory and registers the
tasks.

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

1. `C:\HibaPOS\data\logs\server.log` — the launcher's own log, and since **Batch 1.4b** it answers the bun question either way. On success it names the bun it used (`bun found: …`); if bun is invisible to the account the task runs as, it writes a `FATAL` naming that account, both commands as `INTROUVABLE`, and the three ways out. **Before 1.4b this was the one failure the launcher had that was silent** — it died inside `& bunx` and the log simply stopped after `Checking migration status...`. If you ever see a log that ends on that line, you are running a launcher older than 2026-09-07.
2. `Get-ScheduledTaskInfo -TaskName "HibaPOS Server"` — `LastTaskResult` should be `0`.
3. `http://localhost:3000/api` answers `200`.
4. **WAL is now on**: byte 18 of `C:\HibaPOS\data\db\custom.db` should be `02`, not `01`. It was `01` on the old path because the WAL guard refuses cloud-synced folders; the move is what turns it on.
   ```powershell
   $f=[System.IO.File]::OpenRead("C:\HibaPOS\data\db\custom.db"); $b=New-Object byte[] 19; $f.Read($b,0,19)|Out-Null; $f.Close(); $b[18]
   ```
5. Kill the server process and confirm Task Scheduler restarts it within a minute. *(Batch 1.4 `[MACHINE]` criterion.)*
6. **[OWNER] Look at the screens.** Batch 7.6 raised **eleven** buttons to at
   least 44 px for touch, and no session could see them render. Check the POS,
   the cart panel, the category and product editors and the tables screen:
   nothing overlapping, nothing pushed off a row, nothing clipped. This is the
   only check that catches a layout the source-level guard cannot see.

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

### 6a. The secrets are ALREADY rotated — verify, and do **not** rotate again

**✅ DONE BY THE OPERATOR 2026-09-07 AND VERIFIED.** `SESSION_SECRET` and
`BACKUP_ENCRYPTION_KEY` were rotated with `scripts/rotate-secrets.ts --apply`
at 00:03 local. Both are now 64 hex characters, the app signs in under the new
secret with no PIN changed, and the 2026-08-28 backup that decrypted hours
earlier now fails — which is the proof, because AES-GCM authenticates and
cannot give a false negative. `FISCAL_CHAIN_KEY` was untouched. Record →
`REMEDIATION_RECORD.md` → *Batch 7.3 — DONE, 2026-09-07*.

**Why this step still has a number, and why it is still here rather than in
§ 8.** The ordering it existed to enforce is the reason the § 6b backup is
sound: that backup is the **first genuinely restorable one this installation
will ever have**, and a backup written under a key that is then discarded is
unreadable. Rotating first is what makes § 6b safe — and because the rotation
already happened, § 6b is written under the current key with nothing to do here.

> ## ⚠ Do NOT run `rotate-secrets.ts` on the till
>
> Not "no need to" — **do not**. The script copies aside the **pre**-rotation
> `.env` and never prints the new values, so a second rotation would leave the
> new `BACKUP_ENCRYPTION_KEY` in exactly one place: the till's own `.env`. The
> copy the operator carried off the machine on 2026-09-07 would no longer open
> the § 6b backup, and nobody would find out until they needed to restore it.
> It would also sign everyone out in the middle of the most delicate sequence
> in this runbook, for no gain.

**What to check instead — that the `.env` on the till is the ROTATED one.** This
is § 0's second prerequisite, checked again here because this is the step that
depends on it. It needs no secret value, only a comparison against the
pre-rotation copy kept at `C:\HibaPOS-secrets-backup\`:

```powershell
$preFile = "C:\HibaPOS-secrets-backup\env-before-rotation-2026-09-06T23-03-08-541Z.txt"
foreach ($k in "SESSION_SECRET","BACKUP_ENCRYPTION_KEY") {
  $now = (Get-Content .env     | Where-Object { $_ -like "$k=*" } | Select-Object -First 1) -replace "^$k=",""
  $old = (Get-Content $preFile | Where-Object { $_ -like "$k=*" } | Select-Object -First 1) -replace "^$k=",""
  if (-not $now) { "{0,-24} ABSENTE DU .env -- STOP" -f $k; continue }
  $verdict = if ($now -eq $old) { "STILL THE OLD VALUE -- STOP" } else { "differs from the pre-rotation copy -- correct" }
  "{0,-24} {1} chars, {2}" -f $k, $now.Length, $verdict
}
```

- [ ] Both report **64 chars** and **differs from the pre-rotation copy**
- [ ] If either says `STILL THE OLD VALUE`, the wrong `.env` was carried. Stop and
      fetch the rotated one before § 6b, or the backup opens with nobody's keys

**Then, whether or not anything changed here:**

```powershell
Restart-ScheduledTask -TaskName "HibaPOS Server"
```

- [ ] `GET /api/auth/me` answers `{"user":null}` in a tab that was signed in before, and signing in with the **usual PIN** works. No PIN changed; nobody is locked out

**How a 64-hex secret is generated here — § 6e needs this, for the chain key.**
`openssl` is not on Windows by default. Either of these produces 64 hex
characters from a cryptographic RNG:

```bash
bun -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```powershell
$b = New-Object byte[] 32; (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b); ($b | ForEach-Object { $_.ToString('x2') }) -join ''
```

> Not `Get-Random`. It looks like it would do and is **not** cryptographically
> secure — fine for picking a test row, wrong for a signing secret.

**[OWNER or you]** — Claude never generates or sees any of these values.

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
| Till does not come up after reboot | `C:\HibaPOS\data\logs\server.log`, and read its **last** line. `FATAL … bun est introuvable` names the account and the fix (§ 0). A log ending on `Checking migration status...` is a pre-1.4b launcher failing the same way silently. Either way `Get-ScheduledTaskInfo -TaskName "HibaPOS Server"` shows `LastTaskResult` 1, never 0. |
| Launcher refuses: *"Base de données introuvable"* | `HIBAPOS_DATA_DIR` or `DATABASE_URL` is wrong. **It will not create a database** — that refusal is deliberate (L-59): a new one would be empty, numbered from 1, with the PINs published in this repository. |
| Launcher refuses: pending migrations | `.zscripts\update.ps1 -Apply`. |
| `/api/fiscal/verify` says the chain is broken | If it names a `keyDiagnosis`, it is the key, not tampering — Batch 3.9 built it to say so. Restore `FISCAL_CHAIN_KEY`. |
| Restore needed | It works now (Batch 2.5). If the app will not start at all, recover by hand: stop everything, `scripts/decrypt-backup.ts`, put the file in place, delete `-wal` and `-shm`, restart. |
| Printing fails mid-service | The sale is never lost — printing happens after the sale commits. Reprint from the order. |
