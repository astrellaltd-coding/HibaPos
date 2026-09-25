# HibaPOS France -- update procedure (C-07, Batch 1.4)
#
# The scripted answer to "there is no way to ship a fix". Run from the install
# directory, on the till, over remote access.
#
#   powershell -ExecutionPolicy Bypass -File .zscripts\update.ps1
#   powershell -ExecutionPolicy Bypass -File .zscripts\update.ps1 -Apply
#
# -----------------------------------------------------------------------------
# THE RULE THIS SCRIPT EXISTS TO ENFORCE: it never touches the data directory.
# -----------------------------------------------------------------------------
# Not the database, not `db\backups`, not `db\fiscal-archives`, not `uploads`.
# It replaces code and it runs migrations; that is all. C-07's own evidence is
# what makes this worth stating twice: the previous update story was `git pull`
# over a tree containing 134 committed product photos, with `git clean -fd` as
# the way out -- which deletes every image a restore cannot put back (C-05).
# There is no `git clean` here and there is no `-Force` on any data path.
#
# ORDER: back up -> stop -> update code -> migrate -> build -> start -> verify.
# Migrations run BEFORE the build so a failure stops with the old code still on
# disk and the old server one `Start-ScheduledTask` away.

[CmdletBinding()]
param(
    [switch]$Apply,
    # Skip the git step when the code arrives some other way (a zip over remote
    # access, which is likely for a machine with no git).
    [switch]$NoGit,
    # L-207. The Scheduled Task is how this script stops the server, and step 2
    # now REFUSES when it cannot find it rather than warning and carrying on.
    # This is the way through for an install whose server is not run by a task:
    # it asserts that you have stopped it yourself.
    [switch]$ServerAlreadyStopped
)

$ErrorActionPreference = "Stop"
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = (Get-Item "$ScriptDir\..").FullName
Set-Location $ProjectDir

$mode = if ($Apply) { "APPLY" } else { "DRY RUN" }
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " HibaPOS update  [$mode]"                    -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

function Step  { param([string]$m) Write-Host "-> $m" -ForegroundColor Yellow }
function Would { param([string]$m) Write-Host "   [would] $m" -ForegroundColor DarkGray }
function Run   {
    param([string]$Label, [scriptblock]$Block)
    if ($Apply) { Write-Host "   $Label"; & $Block; if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw "$Label a echoue (code $LASTEXITCODE)" } }
    else        { Would $Label }
}

$taskName = "HibaPOS Server"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

# --- 1. BACK UP FIRST -------------------------------------------------------
# Deliberately NOT automated into a copy of the database by this script. The
# application's own backup is encrypted, journalled (C-22) and verifiable with
# scripts/decrypt-backup.ts; a stray .db copy left in the install directory by
# an update script is a fiscal database lying around in a tree that gets
# replaced. Take the backup through the app, and check it opens.
Step "Backup (MANUAL, and it is the one step that cannot be skipped)"
Write-Host "   1. In the app: Reglages -> Sauvegardes -> creer une sauvegarde"
Write-Host "   2. Verify it opens:  bun scripts/decrypt-backup.ts <fichier>"
Write-Host "   3. Copy it OFF this machine before continuing."
if ($Apply) {
    $ok = Read-Host "   Sauvegarde faite, verifiee et copiee ailleurs ? (oui/non)"
    if ($ok -ne "oui") { throw "Interrompu : faites la sauvegarde d'abord." }
}

# --- 2. stop the server -----------------------------------------------------
Step "Stopping the server"
if ($task) {
    Run "Stop-ScheduledTask '$taskName'" { Stop-ScheduledTask -TaskName $taskName }
} elseif ($ServerAlreadyStopped) {
    Write-Host "   -ServerAlreadyStopped : tache absente, et vous affirmez l'avoir arrete."
} else {
    # L-207. This was a Write-Warning and the script CARRIED ON -- replacing
    # code while the server still ran, with .next and node_modules locked by it.
    # An update that skips "stop the server" in silence is worse than one that
    # stops and says why. The task name is a contract four references depend on
    # and no document states; when it does not match, that is the thing to find
    # out, not to shrug at.
    Write-Host ""
    Write-Host "   La tache '$taskName' est introuvable sur cette machine."
    Write-Host ""
    Write-Host "   1. Elle porte peut-etre un autre nom. Verifiez :"
    Write-Host '        Get-ScheduledTask | Where-Object { $_.TaskName -like "HibaPOS*" }'
    Write-Host "      puis corrigez la variable taskName en haut de ce script."
    Write-Host ""
    Write-Host "   2. Ou le serveur n'est pas lance par une tache planifiee. Arretez-le,"
    Write-Host "      verifiez qu'il ne reste aucun processus node/bun :"
    Write-Host '        Get-Process node,bun -ErrorAction SilentlyContinue'
    Write-Host "      puis relancez avec -ServerAlreadyStopped."
    Write-Host ""
    throw "Arret : impossible d'arreter le serveur, et continuer remplacerait le code sous lui."
}

# --- 3. code ----------------------------------------------------------------
Step "Updating code"
if ($NoGit) {
    Write-Host "   -NoGit: copiez les nouveaux fichiers MAINTENANT, puis appuyez sur Entree."
    Write-Host "   Ne remplacez PAS le dossier de donnees ni le fichier .env."
    if ($Apply) { Read-Host "   Pret ?" | Out-Null }
} else {
    Run "git pull --ff-only" { git pull --ff-only }
}
Run "bun install"        { bun install }
Run "bunx prisma generate" { bunx prisma generate }

# --- 4. migrations ----------------------------------------------------------
# Before the build on purpose: if this fails, the old code is still on disk and
# the old server is one Start-ScheduledTask away.
# L-206. This ran `bunx prisma migrate deploy` -- the one command CLAUDE.md
# forbids, and for the reason it gives: the bare command prints the same green
# banner whichever migration it applied, and was read as "applied" twice when it
# was not. apply-migration.ts is the sanctioned path and does the whole
# operation as one step: it refuses while anything holds the database, refuses
# on a stray journal file, takes a sha-verified restore point, names the
# migration it ACTUALLY applied, and re-reads the database afterwards.
#
# No --expect here, deliberately. That flag compares against a rehearsal
# fingerprint taken on the machine the rehearsal ran on; pointing it at a
# different install compares two different databases and fails on every row
# count. The script still verifies that the pending list emptied, which is the
# protection that matters on a till.
Step "Applying migrations"
if ($Apply) {
    Run "bun scripts/apply-migration.ts --apply" { bun scripts/apply-migration.ts --apply }
} else {
    Would "bun scripts/apply-migration.ts            (dry run, reports what is pending)"
    Would "bun scripts/apply-migration.ts --apply"
}

# --- 5. build ---------------------------------------------------------------
Step "Building"
Run "bun run build" { bun run build }

# --- 6. start ---------------------------------------------------------------
Step "Starting the server"
if ($task) { Run "Start-ScheduledTask '$taskName'" { Start-ScheduledTask -TaskName $taskName } }
else       { Would "start the server" }

# --- 7. verify --------------------------------------------------------------
Step "Verification"
if ($Apply) {
    Start-Sleep -Seconds 8
    try {
        $probe = Invoke-WebRequest -Uri "http://localhost:3000/api" -UseBasicParsing -TimeoutSec 10
        Write-Host "   liveness: HTTP $($probe.StatusCode)" -ForegroundColor Green
    } catch {
        Write-Warning "   La caisse ne repond pas. Journal : <dossier de donnees>\logs\server.log"
    }
}
Write-Host "   Then, signed in, confirm the fiscal chain is intact:"        -ForegroundColor Cyan
Write-Host "     GET /api/fiscal/verify  ->  les 4 chaines 'ok'"
Write-Host "     et 'grandTotal' identique a sa valeur AVANT la mise a jour."
Write-Host "     Le total perpetuel ne doit JAMAIS revenir a zero, y compris"
Write-Host "     lors des mises a jour du logiciel (c'est ce que l'attestation affirme)."
Write-Host ""
if (-not $Apply) { Write-Host " DRY RUN -- rien n'a change. Relancez avec -Apply." -ForegroundColor Yellow }
