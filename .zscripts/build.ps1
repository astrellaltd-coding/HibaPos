# HibaFood POS -- Build Pipeline for Windows (PowerShell)
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = (Get-Item "$ScriptDir\..").FullName

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Building HibaPOS Production Package" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Set-Location -Path $ProjectDir

Write-Host "1. Generating Prisma Client..." -ForegroundColor Yellow
bun run db:generate

Write-Host "2. Running Next.js Production Build..." -ForegroundColor Yellow
bun run build

Write-Host "==========================================" -ForegroundColor Green
Write-Host "OK - build completed successfully!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
