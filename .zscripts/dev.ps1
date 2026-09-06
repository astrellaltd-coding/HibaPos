# HibaFood POS -- Dev Server for Windows (PowerShell)
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = (Get-Item "$ScriptDir\..").FullName

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting HibaPOS Development Environment" -ForegroundColor Cyan
Write-Host "Project Directory: $ProjectDir" -ForegroundColor Gray
Write-Host "==========================================" -ForegroundColor Cyan

Set-Location -Path $ProjectDir

# Verify node_modules / bun dependencies
if (-not (Test-Path "$ProjectDir\node_modules")) {
    Write-Host "Installing dependencies with Bun..." -ForegroundColor Yellow
    bun install
}

# Run Prisma migrations & seed if DB is not initialized
if (-not (Test-Path "$ProjectDir\db\custom.db")) {
    Write-Host "Initializing SQLite Database..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path "$ProjectDir\db" | Out-Null
    bun run db:deploy
    bun run db:seed
}

Write-Host "Launching Next.js development server on port 3000..." -ForegroundColor Green
bun run dev
