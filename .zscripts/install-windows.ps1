# HibaPOS France -- Windows installation (C-07 / DD-02, Batch 1.4)
#
# Moves the data out of the install directory and registers the two Scheduled
# Tasks that make the till start on its own.
#
# -----------------------------------------------------------------------------
# DRY RUN BY DEFAULT. Nothing is moved, written or registered without -Apply.
# The convention is `scripts/`'s, set in Batch 4.5, and it applies with more
# force here: this script moves a fiscal database.
# -----------------------------------------------------------------------------
#
#   powershell -ExecutionPolicy Bypass -File .zscripts\install-windows.ps1
#   powershell -ExecutionPolicy Bypass -File .zscripts\install-windows.ps1 -Apply
#
# WHY THE DATA MOVES (DD-02, 2026-09-03). Today everything resolves from the
# install directory, which currently sits inside a OneDrive-synced Desktop
# folder. Two consequences, both measured rather than feared: OneDrive locks
# SQLite files, and the WAL guard REFUSES to enable WAL on a cloud-synced path,
# so the database has been running in rollback-journal mode the whole time.
# `C:\HibaPOS\data` is writable without elevation, outside OneDrive, and outside
# the install directory so an update cannot touch it.
#
# WHAT IT DOES NOT DO. It does not seed, it does not migrate an existing
# database, and it does not delete the source. The old tree is left in place,
# renamed, so a mistake is reversible by hand.

[CmdletBinding()]
param(
    [switch]$Apply,
    [string]$DataDir = "C:\HibaPOS\data",
    # The account the SERVER task runs as. SYSTEM needs no stored password and
    # is the default; a named account needs its password typed at registration
    # (Windows prompts -- it is never written into this file or read by it).
    [string]$ServerAccount = "SYSTEM",
    # Move the data and register nothing. Two uses: rehearsing the move on a
    # copy (which is how this script was validated, since Scheduled Tasks
    # cannot be registered on a machine that is not the till), and re-running
    # the move after a mistake without touching working tasks.
    [switch]$SkipTasks
)

$ErrorActionPreference = "Stop"
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = (Get-Item "$ScriptDir\..").FullName

$mode = if ($Apply) { "APPLY" } else { "DRY RUN" }
Write-Host "=========================================="  -ForegroundColor Cyan
Write-Host " HibaPOS installation  [$mode]"              -ForegroundColor Cyan
Write-Host "=========================================="  -ForegroundColor Cyan
Write-Host " Install directory : $ProjectDir"
Write-Host " Data directory    : $DataDir"
Write-Host " Server task runs as: $ServerAccount"
Write-Host ""

function Step { param([string]$m) Write-Host "-> $m" -ForegroundColor Yellow }
function Would { param([string]$m) Write-Host "   [would] $m" -ForegroundColor DarkGray }
function Did  { param([string]$m) Write-Host "   [done]  $m" -ForegroundColor Green }

$serverTaskPreview = "HibaPOS Server"

# --- 0. preconditions --------------------------------------------------------
Step "Checking preconditions"

# The SERVER task runs as $ServerAccount, which has its own PATH. A bun that
# lives under a user profile is invisible to SYSTEM, and the failure is silent:
# the task "runs", the launcher cannot find bun, the till never comes up. Found
# by running this dry run on the development machine, where bun sits in
# %APPDATA%\npm and Get-Command found it perfectly well -- from a user session.
$bun = (Get-Command bun -ErrorAction SilentlyContinue)
if (-not $bun) {
    Write-Warning "bun introuvable dans le PATH de CETTE session."
    Write-Warning "Installez-le, puis relancez ce script."
} else {
    Write-Host "   bun: $($bun.Source)"
    $perUser = $bun.Source -match [regex]::Escape($env:USERPROFILE) -or
               $bun.Source -match '\\Users\\' -or
               $bun.Source -match 'AppData'
    if ($perUser -and $ServerAccount -eq "SYSTEM") {
        Write-Warning "   bun est installe PAR UTILISATEUR : $($bun.Source)"
        Write-Warning "   La tache '$serverTaskPreview' tourne sous SYSTEM et ne le trouvera PAS."
        Write-Warning "   Trois options, au choix :"
        Write-Warning "     a) installer bun pour toute la machine (hors profil utilisateur) ;"
        Write-Warning "     b) relancer avec -ServerAccount <compte> (Windows demandera le mot de"
        Write-Warning "        passe a l'enregistrement -- il n'est ni lu ni ecrit par ce script) ;"
        Write-Warning "     c) copier bun.exe dans C:\HibaPOS\bin et l'ajouter au PATH systeme."
        Write-Warning "   A verifier APRES le premier redemarrage : <dossier de donnees>\logs\server.log"
    }
}

if (-not (Test-Path (Join-Path $ProjectDir ".env"))) {
    throw ".env introuvable dans $ProjectDir. Copiez .env.example et renseignez-le d'abord."
}

# --- 1. the data directory ---------------------------------------------------
Step "Preparing $DataDir"
$subdirs = @("db", "db\backups", "db\fiscal-archives", "uploads", "logs")
foreach ($sd in $subdirs) {
    $full = Join-Path $DataDir $sd
    if (Test-Path $full) { Write-Host "   exists: $full" }
    elseif ($Apply)      { New-Item -ItemType Directory -Force -Path $full | Out-Null; Did "created $full" }
    else                 { Would "create $full" }
}

# --- 2. move the data --------------------------------------------------------
# Order matters: the database LAST, and only after everything else is in place,
# so an interrupted move never leaves the database somewhere the app cannot
# find while the app is running.
Step "Moving data out of the install directory"

$moves = @(
    @{ From = Join-Path $ProjectDir "public\uploads";        To = Join-Path $DataDir "uploads";              Label = "product images" },
    @{ From = Join-Path $ProjectDir "db\backups";            To = Join-Path $DataDir "db\backups";           Label = "encrypted backups" },
    @{ From = Join-Path $ProjectDir "db\fiscal-archives";    To = Join-Path $DataDir "db\fiscal-archives";   Label = "fiscal archives" },
    @{ From = Join-Path $ProjectDir "db\custom.db";          To = Join-Path $DataDir "db\custom.db";         Label = "THE FISCAL DATABASE" }
)

foreach ($m in $moves) {
    if (-not (Test-Path $m.From)) { Write-Host "   skip (absent): $($m.Label)"; continue }

    if (Test-Path $m.To) {
        $existing = @(Get-ChildItem -Path $m.To -Force -ErrorAction SilentlyContinue)
        if ($existing.Count -gt 0) {
            Write-Warning "   TARGET NOT EMPTY, refusing to move $($m.Label): $($m.To)"
            Write-Warning "   Resolve by hand. Overwriting a fiscal database is not something a script decides."
            continue
        }
    }

    if ($Apply) {
        # Copy, verify, then rename the source aside. Never Move-Item: a failed
        # move on a database is unrecoverable, a failed copy costs disk.
        #
        # FOUND BY REHEARSING THIS FOR REAL, and the dry run had printed a
        # perfect plan. `Copy-Item <dir> -Destination <existing dir> -Recurse`
        # puts the source INSIDE the target. Step 1 pre-creates the target
        # directories, so the copy produced "data\uploads\uploads\" and
        # "data\db\backups\backups\" -- one level too deep. The database, being
        # a file, moved correctly. So the till would have come up on the right
        # fiscal data with NO product images and NO visible backups, silently.
        # Directories copy their CONTENTS; files copy themselves.
        if (Test-Path -Path $m.From -PathType Container) {
            $srcFiles = @(Get-ChildItem -Path $m.From -Recurse -File -Force)
            if ($srcFiles.Count -gt 0) {
                Copy-Item -Path (Join-Path $m.From "*") -Destination $m.To -Recurse -Force
            }
            $dstFiles = @(Get-ChildItem -Path $m.To -Recurse -File -Force)
            if ($dstFiles.Count -ne $srcFiles.Count) {
                throw "Copie incomplete de $($m.Label) : $($srcFiles.Count) fichiers a la source, $($dstFiles.Count) a l'arrivee. Rien n'a ete supprime."
            }
            Write-Host "   $($srcFiles.Count) file(s) verified"
        } else {
            Copy-Item -Path $m.From -Destination $m.To -Force
            $srcHash = (Get-FileHash -Algorithm SHA256 -Path $m.From).Hash
            $dstHash = (Get-FileHash -Algorithm SHA256 -Path $m.To).Hash
            if ($srcHash -ne $dstHash) { throw "Copie de la base VERIFIEE DIFFERENTE. Rien n'a ete supprime. src=$srcHash dst=$dstHash" }
            Write-Host "   sha256 verified: $dstHash"
        }
        Rename-Item -Path $m.From -NewName ("{0}.moved-{1}" -f (Split-Path $m.From -Leaf), (Get-Date -Format 'yyyyMMddHHmmss'))
        Did "moved $($m.Label)"
    } else {
        Would "copy + verify + rename aside: $($m.Label)  $($m.From) -> $($m.To)"
    }
}

Write-Host ""
Write-Host "   After moving, set these in .env (this script does NOT edit .env):" -ForegroundColor Cyan
Write-Host "     HIBAPOS_DATA_DIR=$DataDir"
Write-Host "     DATABASE_URL=file:$DataDir\db\custom.db?_fk=1&_busy_timeout=5000"
Write-Host "     BACKUP_LOCATION=<a SECOND physical volume, not this disk>"
Write-Host ""

# --- 3. scheduled tasks ------------------------------------------------------
if ($SkipTasks) {
    Step "Scheduled Tasks: SKIPPED (-SkipTasks)"
} else {
Step "Registering Scheduled Tasks"

$serverTask = "HibaPOS Server"
$kioskTask  = "HibaPOS Kiosk"
$psExe      = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

$serverArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ProjectDir\.zscripts\hibapos-server.ps1`""
$kioskArgs  = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ProjectDir\.zscripts\hibapos-kiosk.ps1`""

if ($Apply) {
    # --- the server: at startup, no session needed ---------------------------
    $action    = New-ScheduledTaskAction -Execute $psExe -Argument $serverArgs -WorkingDirectory $ProjectDir
    $trigger   = New-ScheduledTaskTrigger -AtStartup
    # Task Scheduler IS the supervisor. RestartCount/RestartInterval is why this
    # batch adds no nssm/WinSW dependency: one till does not need a service
    # wrapper, and a built-in mechanism is one the operator can be walked
    # through on the phone.
    $settings  = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit ([TimeSpan]::Zero)
    $principal = if ($ServerAccount -eq "SYSTEM") {
        New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    } else {
        New-ScheduledTaskPrincipal -UserId $ServerAccount -LogonType Password -RunLevel Highest
    }
    Register-ScheduledTask -TaskName $serverTask -Action $action -Trigger $trigger `
        -Settings $settings -Principal $principal -Force | Out-Null
    Did "registered '$serverTask' (at startup, runs as $ServerAccount, restarts 3x/1min)"

    # --- the kiosk: at logon, in the desktop session -------------------------
    $kAction   = New-ScheduledTaskAction -Execute $psExe -Argument $kioskArgs -WorkingDirectory $ProjectDir
    $kTrigger  = New-ScheduledTaskTrigger -AtLogOn
    $kSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    $kPrincipal= New-ScheduledTaskPrincipal -GroupId "BUILTIN\Users" -RunLevel Limited
    Register-ScheduledTask -TaskName $kioskTask -Action $kAction -Trigger $kTrigger `
        -Settings $kSettings -Principal $kPrincipal -Force | Out-Null
    Did "registered '$kioskTask' (at logon)"
} else {
    Would "register '$serverTask': at startup, as $ServerAccount, restart 3x every 1 min"
    Would "  $psExe $serverArgs"
    Would "register '$kioskTask': at logon, as BUILTIN\Users"
    Would "  $psExe $kioskArgs"
}
}  # end -SkipTasks guard

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
if ($Apply) {
    Write-Host " Installed. Remaining MANUAL steps:" -ForegroundColor Green
} else {
    Write-Host " DRY RUN -- nothing changed. Re-run with -Apply." -ForegroundColor Yellow
    Write-Host " Then the remaining MANUAL steps:" -ForegroundColor Yellow
}
Write-Host "  1. Edit .env: HIBAPOS_DATA_DIR, DATABASE_URL, BACKUP_LOCATION"
Write-Host "  2. Reboot, and confirm the till comes up with nobody touching it"
Write-Host "  3. Open the app, Edge menu -> 'Installer HibaPOS' (gives the desktop icon)"
Write-Host "  4. Reglages: printer IP, printerEnabled, and FACTICE ON for any testing"
Write-Host "  5. Auto-login, if wanted: run netplwiz and untick the password box."
Write-Host "     Do NOT use the AutoAdminLogon registry key -- it stores the password in clear text."
Write-Host "  6. BEFORE the first real sale: batch 8.0 (fiscal reset), then arm FISCAL_CHAIN_KEY."
Write-Host "==========================================" -ForegroundColor Cyan
