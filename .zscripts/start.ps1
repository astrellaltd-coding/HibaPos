# HibaFood POS -- Production Server Launcher for Windows (PowerShell)
#
# L-59 (Batch 1.4) -- THIS SCRIPT NO LONGER BOOTSTRAPS, and that is the fix.
#
# It used to end with:
#
#     if (-not (Test-Path "$ProjectDir\db\custom.db")) {
#         bun run db:deploy
#         bun run db:seed
#     }
#
# On a development machine that is a convenience. On the till it is a trap. Any
# reason the database looks absent -- a typo in HIBAPOS_DATA_DIR, an unmounted
# drive, a renamed folder, running from the wrong "Start in" directory -- was
# answered by silently CREATING a new one and seeding it, and `prisma/seed.ts`
# falls back to the PINs published in this repository (123456 / 111111, seed.ts
# lines 18-19) whenever SEED_ADMIN_PIN / SEED_MANAGER_PIN are unset. The result
# would be a live till with an empty fiscal journal, a grand total of zero,
# receipt numbering restarting at 1 and credentials anyone with a copy of this
# repo knows -- while the real database sat untouched somewhere else.
#
# Bootstrapping is the installer's job, taken once, deliberately:
#     .zscripts\install-windows.ps1
#
# For the PRODUCTION till use `.zscripts\hibapos-server.ps1` instead, which
# Task Scheduler runs at boot and which also refuses to start on a pending
# migration. This script stays for a manual, foreground start.

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = (Get-Item "$ScriptDir\..").FullName

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting HibaPOS Production Server" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Set-Location -Path $ProjectDir

$env:NODE_ENV = "production"
$env:PORT = "3000"

# Refuse rather than bootstrap. The path checked is the LEGACY layout; once the
# data has moved (DD-02) the database lives under HIBAPOS_DATA_DIR and
# hibapos-server.ps1 is the launcher that reads it from DATABASE_URL.
if (-not (Test-Path "$ProjectDir\db\custom.db") -and -not $env:HIBAPOS_DATA_DIR) {
    Write-Host ""
    Write-Host "Base de donnees introuvable : $ProjectDir\db\custom.db" -ForegroundColor Red
    Write-Host "Ce script NE VA PAS en creer une (L-59). Une base creee ici serait vide," -ForegroundColor Red
    Write-Host "avec un journal fiscal vide et les codes PIN publies dans le depot." -ForegroundColor Red
    Write-Host ""
    Write-Host "Premiere installation :  .zscripts\install-windows.ps1" -ForegroundColor Yellow
    Write-Host "Base deplacee (DD-02)  :  renseignez HIBAPOS_DATA_DIR et DATABASE_URL dans .env," -ForegroundColor Yellow
    Write-Host "                          puis utilisez .zscripts\hibapos-server.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host " Starting Next.js server on port 3000..." -ForegroundColor Green
bun run start
