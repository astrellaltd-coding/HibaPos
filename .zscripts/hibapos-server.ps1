# HibaPOS France -- production server launcher (C-07, Batch 1.4)
#
# This is what Task Scheduler runs at startup. It is NOT start.ps1 and the
# difference is deliberate; see REFUSALS below.
#
# -----------------------------------------------------------------------------
# REFUSALS -- this script would rather not start than start wrong
# -----------------------------------------------------------------------------
#
# 1. NO DATABASE  ->  refuse.
#    `start.ps1` bootstraps when `db\custom.db` is missing: it runs
#    `prisma migrate deploy` AND `prisma db seed`. On a production till that is
#    a trap (L-59). A typo in HIBAPOS_DATA_DIR, an unmounted drive, a renamed
#    folder -- any of them makes the database "absent", and the launcher would
#    answer by creating a BRAND NEW one seeded with the PINs published in this
#    repository (123456 / 111111, `prisma/seed.ts:18-19`). The result is a live
#    till with an empty fiscal journal, a grand total of zero, receipt numbering
#    restarting at 1, and credentials anyone holding a copy of this repo knows --
#    while the real database sits untouched somewhere else. Bootstrapping is the
#    installer's job, taken once, deliberately. Here it is refused.
#
# 2. PENDING MIGRATIONS  ->  refuse.
#    An update that ships a schema change and boots against the old database
#    fails at query time -- mid-sale, in French, in front of a customer. C-07
#    names this exact failure. Applying migrations automatically at boot is the
#    other obvious answer and is worse: this project treats `migrate deploy`
#    against production as a deliberate act, rehearsed on a copy with a
#    fingerprint diff and backed up first. So the launcher checks and stops,
#    naming the script to run.
#
# 3. NO SESSION_SECRET  ->  the app refuses on its own, and we say so first,
#    because a Next build that throws at import time produces a wall of stack
#    trace rather than an answer.
#
# 4. BUN NOT ON THE PATH OF THE ACCOUNT THIS RUNS AS  ->  refuse.
#    The SERVER task runs as SYSTEM, which cannot see a bun installed under a
#    user profile -- and until this refusal existed that failure was the one
#    thing this script did SILENTLY. `& bunx` on an account that cannot resolve
#    it throws CommandNotFoundException, and $ErrorActionPreference = "Stop"
#    makes that terminate the script BEFORE $statusCode is ever assigned, so
#    refusal 2's Fail is never reached. MEASURED on 2026-09-07 by running this
#    script with the npm directory removed from PATH: it stopped at the bunx
#    call, exited 1, and the last line in server.log was "Checking migration
#    status..." -- naming no cause. The task showed a failure and the log did
#    not say why, which is the worst combination for a till that will not come
#    up in front of a customer. Checked FIRST now, and it logs which bun it
#    found even when it succeeds.
#
# 5. NO PRODUCTION BUILD  ->  refuse.
#    `bun run start` is `next start`, which needs `.next/BUILD_ID`. A till
#    that was cloned, installed and rebooted WITHOUT `bun run build` comes up
#    dead, and until this refusal existed the log said only that the server
#    had exited non-zero -- the same shape of silence as refusal 4. Neither
#    deployment document had a build step at all (DOC-17), which is how the
#    gap stayed invisible: the installer moves data and registers tasks, it
#    does not build, and nothing else said who does.
#    BUILD_ID and not the `.next` DIRECTORY, deliberately: `next dev` creates
#    `.next` without a BUILD_ID, and so does a build that failed halfway, so
#    the directory's existence proves nothing. The marker is what `next start`
#    itself looks for.
#
# A refusal is loud: it writes to the log and exits non-zero, so the Task
# Scheduler entry shows a failure instead of a green tick over a dead till.

$ErrorActionPreference = "Stop"

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = (Get-Item "$ScriptDir\..").FullName
Set-Location -Path $ProjectDir

# --- logging ----------------------------------------------------------------
# The log lives with the DATA, not with the install: an update replaces the
# install directory and must not take the evidence of the last crash with it.
$DataDir = if ($env:HIBAPOS_DATA_DIR) { $env:HIBAPOS_DATA_DIR } else { $ProjectDir }
$LogDir  = Join-Path $DataDir "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
$LogFile = Join-Path $LogDir "server.log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Fail {
    param([string]$Message)
    Write-Log $Message "FATAL"
    exit 1
}

Write-Log "HibaPOS server launcher starting. Install: $ProjectDir"
Write-Log "Data directory: $DataDir"

# --- .env -------------------------------------------------------------------
# Loaded explicitly rather than relied upon: a Scheduled Task does not run in a
# shell that has sourced anything, and `next start` reads .env from the CWD,
# which is only correct because of the Set-Location above. Being explicit means
# a future packaged app (Tauri sidecar) can pass the same variables the same
# way -- child processes do not inherit a .env.
$EnvFile = Join-Path $ProjectDir ".env"
if (-not (Test-Path $EnvFile)) { Fail "Fichier .env introuvable dans $ProjectDir. La caisse ne peut pas demarrer." }

Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $name  = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
    # Never overwrite a variable the Task Scheduler entry set on purpose.
    if (-not [Environment]::GetEnvironmentVariable($name)) {
        [Environment]::SetEnvironmentVariable($name, $value)
    }
}

# Re-read: .env may be where HIBAPOS_DATA_DIR is defined.
if ($env:HIBAPOS_DATA_DIR) { $DataDir = $env:HIBAPOS_DATA_DIR }

if (-not $env:SESSION_SECRET) { Fail "SESSION_SECRET absente. L'application refuse de demarrer sans elle." }
if (-not $env:DATABASE_URL)   { Fail "DATABASE_URL absente." }

# --- refusal 4: bun must be on this account's PATH --------------------------
# Checked before the database and the migrations because nothing below works
# without it, and because this is the failure the commissioning runbook calls
# the most likely one: `docs/mise-en-service.md` section 0. The same three ways
# out are printed by `install-windows.ps1`'s dry run.
$bunCmd  = Get-Command bun  -ErrorAction SilentlyContinue
$bunxCmd = Get-Command bunx -ErrorAction SilentlyContinue
if (-not $bunCmd -or -not $bunxCmd) {
    $whoami   = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $bunWhere  = if ($bunCmd)  { $bunCmd.Source }  else { "INTROUVABLE" }
    $bunxWhere = if ($bunxCmd) { $bunxCmd.Source } else { "INTROUVABLE" }
    Fail @"
bun est introuvable dans le PATH du compte qui execute cette tache.
    compte : $whoami
    bun    : $bunWhere
    bunx   : $bunxWhere
La caisse NE PEUT PAS demarrer sans bun, et un bun installe SOUS UN PROFIL
UTILISATEUR est invisible pour SYSTEM. Trois options, au choix :
  a) installer bun pour toute la machine, hors profil utilisateur ;
  b) reenregistrer la tache avec -ServerAccount <compte> ;
  c) copier bun.exe dans C:\HibaPOS\bin et ajouter ce dossier au PATH systeme.
Voir .zscripts\install-windows.ps1 et docs\mise-en-service.md section 0.
"@
}
Write-Log ("bun found: {0}" -f $bunCmd.Source)
Write-Log ("bunx found: {0}" -f $bunxCmd.Source)

# --- refusal 5: a production build must exist -------------------------------
# Grouped with refusal 4 because both are 'is this install finished?', both
# are instant local checks, and both are silent failures otherwise.
$BuildId = Join-Path $ProjectDir ".next\BUILD_ID"
if (-not (Test-Path $BuildId)) {
    Fail @"
Aucune version de production compilee : $BuildId est absent.
"bun run start" lance "next start", qui exige ce fichier. La caisse ne peut
pas demarrer sur un depot qui n'a jamais ete compile.
Depuis le dossier d'installation ($ProjectDir) :
    bun install
    bunx prisma generate
    bun run build
ou, tout en un :
    powershell -ExecutionPolicy Bypass -File .zscripts\build.ps1
Puis relancez la tache : Start-ScheduledTask -TaskName "HibaPOS Server"
Voir docs\mise-en-service.md section 0b.
"@
}
Write-Log ("production build present: {0}" -f (Get-Content $BuildId -Raw).Trim())

# --- refusal 1: the database must already exist -----------------------------
# DATABASE_URL is a file: URL with query parameters; strip both to get a path.
$DbPath = $env:DATABASE_URL -replace '^file:', ''
$DbPath = ($DbPath -split '\?')[0]
if (-not [System.IO.Path]::IsPathRooted($DbPath)) { $DbPath = Join-Path $ProjectDir $DbPath }

if (-not (Test-Path $DbPath)) {
    Fail @"
Base de donnees introuvable : $DbPath
La caisse NE VA PAS en creer une. Une base creee ici serait vide, avec un
journal fiscal vide, une numerotation repartant a 1 et les codes PIN publies
dans le depot -- pendant que la vraie base reste ailleurs.
Verifiez HIBAPOS_DATA_DIR et DATABASE_URL, ou lancez l'installation :
    powershell -ExecutionPolicy Bypass -File .zscripts\install-windows.ps1
"@
}

Write-Log "Database found: $DbPath"

# --- refusal 2: no pending migrations ---------------------------------------
Write-Log "Checking migration status..."
$statusOutput = & bunx prisma migrate status 2>&1 | Out-String
$statusCode = $LASTEXITCODE
Write-Log ("prisma migrate status exit={0}" -f $statusCode)

if ($statusCode -ne 0) {
    Fail @"
Des migrations sont en attente, ou l'etat du schema n'a pas pu etre lu.
La caisse refuse de demarrer sur un schema qui ne correspond pas au code :
elle echouerait en pleine vente plutot qu'ici.
Sortie de prisma :
$statusOutput
Appliquez la mise a jour avec :
    powershell -ExecutionPolicy Bypass -File .zscripts\update.ps1 -Apply
"@
}

Write-Log "Schema is up to date. Starting Next.js on 127.0.0.1:3000"

# `bun run start` is `next start -p 3000 -H 127.0.0.1` (DD-06: localhost only).
# Task Scheduler owns the restart-on-failure; this script does not loop, so a
# crash surfaces as a task failure that can be seen rather than as a silent
# respawn loop nobody notices.
& bun run start
$exit = $LASTEXITCODE
Write-Log ("Server exited with code {0}" -f $exit) "WARN"
exit $exit
