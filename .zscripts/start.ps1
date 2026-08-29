# HibaFood POS — Production Server Launcher for Windows (PowerShell)
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = (Get-Item "$ScriptDir\..").FullName

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting HibaPOS Production Server" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Set-Location -Path $ProjectDir

$env:NODE_ENV = "production"
$env:PORT = "3000"

# Verify DB exists
if (-not (Test-Path "$ProjectDir\db\custom.db")) {
    Write-Host "ℹ️ Database not found — bootstrapping via prisma migrate deploy + seed..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path "$ProjectDir\db" | Out-Null
    bun run db:deploy
    bun run db:seed
}

Write-Host "🚀 Starting Next.js server on port 3000..." -ForegroundColor Green
bun run start
